/**
 * 백그라운드 타이머 보존 및 탭 복귀 시 정밀 동기화 서비스
 * 1. Web Worker 기반 비-스로틀링 타이머
 * 2. visibilitychange 즉시 복구 핸들러
 * 3. 무음 오디오 컨텍스트 유지 & Screen WakeLock
 */

type IntervalCallback = () => void;
type ResumeCallback = () => void;

class BackgroundWorkerTimer {
  private worker: Worker | null = null;
  private callbacks = new Map<string, IntervalCallback>();
  private fallbackIntervals = new Map<string, number>();

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    try {
      const workerCode = `
        const timers = new Map();
        self.onmessage = function(e) {
          const { action, id, interval } = e.data || {};
          if (action === 'start') {
            if (timers.has(id)) clearInterval(timers.get(id));
            const timerId = setInterval(() => {
              self.postMessage({ id });
            }, interval || 1000);
            timers.set(id, timerId);
          } else if (action === 'stop') {
            if (timers.has(id)) {
              clearInterval(timers.get(id));
              timers.delete(id);
            }
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const objectUrl = URL.createObjectURL(blob);
      this.worker = new Worker(objectUrl);
      URL.revokeObjectURL(objectUrl); // Revoke immediately after worker creation to avoid memory leak
      this.worker.onmessage = (e) => {
        const { id } = e.data || {};
        if (id && this.callbacks.has(id)) {
          const cb = this.callbacks.get(id);
          if (cb) cb();
        }
      };
    } catch (err) {
      console.warn('[BackgroundWorkerTimer] Web Worker 초기화 실패, 표준 setInterval로 대체합니다.', err);
      this.worker = null;
    }
  }

  public setInterval(id: string, callback: IntervalCallback, intervalMs: number): void {
    this.callbacks.set(id, callback);

    if (this.worker) {
      this.worker.postMessage({ action: 'start', id, interval: intervalMs });
    } else {
      if (this.fallbackIntervals.has(id)) {
        window.clearInterval(this.fallbackIntervals.get(id));
      }
      const fallbackId = window.setInterval(callback, intervalMs);
      this.fallbackIntervals.set(id, fallbackId);
    }
  }

  public clearInterval(id: string): void {
    this.callbacks.delete(id);

    if (this.worker) {
      this.worker.postMessage({ action: 'stop', id });
    }
    if (this.fallbackIntervals.has(id)) {
      window.clearInterval(this.fallbackIntervals.get(id));
      this.fallbackIntervals.delete(id);
    }
  }

  public destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.fallbackIntervals.forEach((id) => window.clearInterval(id));
    this.fallbackIntervals.clear();
    this.callbacks.clear();
  }
}

export class BackgroundSyncService {
  private static instance: BackgroundSyncService | null = null;

  private workerTimer: BackgroundWorkerTimer;
  private resumeCallbacks: Set<ResumeCallback> = new Set();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private wakeLockSentinel: any = null;
  private audioContext: AudioContext | null = null;
  private silentSource: AudioBufferSourceNode | null = null;
  private isAudioKeepAliveActive = false;

  private constructor() {
    this.workerTimer = new BackgroundWorkerTimer();
    this.setupVisibilityListener();
    this.requestWakeLock();
  }

  public static getInstance(): BackgroundSyncService {
    if (!BackgroundSyncService.instance) {
      BackgroundSyncService.instance = new BackgroundSyncService();
    }
    return BackgroundSyncService.instance;
  }

  /**
   * Web Worker 기반 타이머 등록
   */
  public registerWorkerInterval(id: string, callback: IntervalCallback, intervalMs: number): void {
    this.workerTimer.setInterval(id, callback, intervalMs);
  }

  /**
   * Web Worker 기반 타이머 해제
   */
  public clearWorkerInterval(id: string): void {
    this.workerTimer.clearInterval(id);
  }

  /**
   * 탭이 다시 활성화(visible)될 때 즉시 실행할 복구 콜백 등록
   */
  public onTabResume(callback: ResumeCallback): () => void {
    this.resumeCallbacks.add(callback);
    return () => {
      this.resumeCallbacks.delete(callback);
    };
  }

  /**
   * visibilitychange 이벤트 감지 및 즉시 복구 루틴
   */
  private setupVisibilityListener() {
    if (typeof document === 'undefined') return;

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // 1. 화면 복귀 시 WakeLock 재취득 (일부 브라우저는 백그라운드 전환 시 자동 해제됨)
        this.requestWakeLock();

        // 2. 오디오 컨텍스트가 suspended 상태인 경우 복구
        if (this.audioContext && this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
        }

        // 3. 등록된 모든 실시간 갱신 루틴 즉시 동기화 실행
        for (const cb of this.resumeCallbacks) {
          try {
            cb();
          } catch (e) {
            console.error('[BackgroundSyncService] Resume callback error:', e);
          }
        }
      }
    });
  }

  /**
   * Screen WakeLock API 활성화 (화면 꺼짐 및 절전 모드 방지)
   */
  public async requestWakeLock(): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;
      if ('wakeLock' in nav && typeof nav.wakeLock?.request === 'function') {
        if (!this.wakeLockSentinel || this.wakeLockSentinel.released) {
          this.wakeLockSentinel = await nav.wakeLock.request('screen');
          this.wakeLockSentinel.addEventListener('release', () => {
            this.wakeLockSentinel = null;
          });
          return true;
        }
      }
    } catch {
      // 절전모드 지원 불가 또는 사용자 권한 거부 시 무시
    }
    return false;
  }

  /**
   * 무음 오디오 Keep-Alive 활성화 (브라우저가 백그라운드 탭의 프로세스 우선순위를 낮추지 못하도록 유지)
   */
  public enableAudioKeepAlive(): void {
    if (this.isAudioKeepAliveActive) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.audioContext) {
        this.audioContext = new AudioCtx();
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      // 무음 버퍼 생성 (1초 무음 루프)
      const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate, this.audioContext.sampleRate);
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      // 게인을 0으로 설정하여 완벽한 무음 유지
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = 0.0001; // 거의 0에 가까운 미세 레벨로 브라우저 미디어 액티브 세션 유지

      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      source.start();
      this.silentSource = source;
      this.isAudioKeepAliveActive = true;
    } catch (e) {
      console.warn('[BackgroundSyncService] Audio Keep-Alive 활성화 실패:', e);
    }
  }

  public destroy(): void {
    this.workerTimer.destroy();
    this.resumeCallbacks.clear();
    if (this.wakeLockSentinel) {
      try {
        this.wakeLockSentinel.release();
      } catch {}
      this.wakeLockSentinel = null;
    }
    if (this.silentSource) {
      try {
        this.silentSource.stop();
      } catch {}
      this.silentSource = null;
    }
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
  }
}
