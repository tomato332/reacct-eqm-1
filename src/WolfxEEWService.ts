/**
 * Wolfx JMA EEW (긴급지진속보) 연동 서비스
 * - WebSocket: wss://ws-api.wolfx.jp/jma_eew
 * - HTTP Fallback: https://api.wolfx.jp/jma_eew.json
 */

export interface WolfxEEWData {
  type?: string;
  Title?: string;
  CodeType?: string;
  Issue?: {
    Source?: string;
    Status?: string;
  };
  EventID?: string;
  Serial?: number;
  AnnouncedTime?: string;
  OriginTime?: string;
  Hypocenter?: string;
  Latitude?: number;
  Longitude?: number;
  Magunitude?: number;
  Depth?: number;
  MaxIntensity?: string;
  isCancel?: boolean;
  isFinal?: boolean;
  isWarn?: boolean;
  // 파싱된 지진 발생 타임스탬프 (ms)
  originTimestamp?: number;
  receivedAt?: number;
}

export enum EEWState {
  IDLE = 'IDLE',
  ACTIVE = 'ACTIVE',
  FINAL = 'FINAL',
  CANCELLED = 'CANCELLED',
}

export interface EEWContext {
  state: EEWState;
  data: WolfxEEWData | null;
}

export type EEWUpdateCallback = (context: EEWContext) => void;

export class EEWMachine {
  private state: EEWState = EEWState.IDLE;
  private data: WolfxEEWData | null = null;
  private onStateChange: EEWUpdateCallback;

  constructor(onStateChange: EEWUpdateCallback) {
    this.onStateChange = onStateChange;
  }

  public transition(newData: WolfxEEWData | null) {
    if (!newData) {
      this.setState(EEWState.IDLE, null);
      return;
    }

    if (newData.isCancel) {
      if (this.state !== EEWState.IDLE) {
        this.setState(EEWState.CANCELLED, newData);
        // 취소 상태는 5초 뒤 평상시로 자동 전환
        setTimeout(() => {
          if (this.state === EEWState.CANCELLED && this.data?.EventID === newData.EventID) {
            this.setState(EEWState.IDLE, null);
          }
        }, 5000);
      }
      return;
    }

    if (newData.isFinal) {
      this.setState(EEWState.FINAL, newData);
      return;
    }

    // 평상시, 혹은 이전 상태가 취소가 아닐 경우에만 활성화로 전환
    if (this.state !== EEWState.CANCELLED) {
      this.setState(EEWState.ACTIVE, newData);
    }
  }

  public forceIdle() {
    this.setState(EEWState.IDLE, null);
  }

  public getContext(): EEWContext {
    return { state: this.state, data: this.data };
  }

  private setState(newState: EEWState, newData: WolfxEEWData | null) {
    this.state = newState;
    this.data = newData;
    this.onStateChange(this.getContext());
  }
}

export class WolfxEEWService {
  private worker: Worker | null = null;
  private callbacks: Set<EEWUpdateCallback> = new Set();
  private isDestroyed = false;
  private lastEventId = '';
  private lastSerial = -1;
  private machine: EEWMachine;

  constructor() {
    this.machine = new EEWMachine((ctx) => this.notify(ctx));
    this.initWorker();
  }

  private initWorker() {
    try {
      const workerCode = `
        let ws = null;
        let isDestroyed = false;
        let pollTimer = null;
        
        function initWS() {
          if (isDestroyed) return;
          try {
            ws = new WebSocket('wss://ws-api.wolfx.jp/jma_eew');
            ws.onopen = () => console.log('[Wolfx EEW Worker] WS 연결됨');
            ws.onmessage = (e) => {
              try {
                const data = JSON.parse(e.data);
                self.postMessage({ type: 'WS_DATA', data });
              } catch(err) {}
            };
            ws.onerror = () => {};
            ws.onclose = () => {
              if (!isDestroyed) setTimeout(initWS, 10000);
            };
          } catch(err) {
            if (!isDestroyed) setTimeout(initWS, 10000);
          }
        }

        self.onmessage = (e) => {
          if (e.data.action === 'init') {
            const origin = e.data.origin;
            initWS();
            
            const pollLoop = async () => {
              if (isDestroyed) return;
              try {
                const url = origin + '/proxy?url=' + encodeURIComponent('https://api.wolfx.jp/jma_eew.json');
                const resp = await fetch(url, { cache: 'no-store' });
                if (resp.ok) {
                  const data = await resp.json();
                  self.postMessage({ type: 'POLL_DATA', data });
                }
              } catch(e) {}
              
              if (!isDestroyed) {
                pollTimer = setTimeout(pollLoop, 2000);
              }
            };
            
            pollLoop();
            
          } else if (e.data.action === 'destroy') {
            isDestroyed = true;
            if (ws) ws.close();
            if (pollTimer) clearTimeout(pollTimer);
          }
        };
      `;
      
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const objectUrl = URL.createObjectURL(blob);
      this.worker = new Worker(objectUrl);
      URL.revokeObjectURL(objectUrl); // Revoke immediately after worker creation to avoid memory leak
      
      this.worker.onmessage = (e) => {
        const { type, data } = e.data;
        if (type === 'WS_DATA' || type === 'POLL_DATA') {
          this.handleIncomingData(data);
        }
      };
      
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      this.worker.postMessage({ action: 'init', origin });
      
    } catch (e) {
      console.error('[WolfxEEWService] Worker 초기화 실패:', e);
    }
  }

  public subscribe(callback: EEWUpdateCallback): () => void {
    this.callbacks.add(callback);
    callback(this.machine.getContext());
    return () => {
      this.callbacks.delete(callback);
    };
  }

  public getContext(): EEWContext {
    return this.machine.getContext();
  }

  private notify(ctx: EEWContext) {
    for (const cb of this.callbacks) {
      cb(ctx);
    }
  }

  private parseOriginTime(originTimeStr?: string): number {
    if (!originTimeStr) return Date.now();
    try {
      // "2024/01/01 16:10:05" 또는 ISO 형식
      const formatted = originTimeStr.replace(/\//g, '-');
      // JST (UTC+9) 기준 파싱
      const date = new Date(formatted.includes('+') || formatted.includes('Z') ? formatted : `${formatted}+09:00`);
      const ts = date.getTime();
      return isNaN(ts) ? Date.now() : ts;
    } catch {
      return Date.now();
    }
  }

  public handleIncomingData(data: any) {
    if (!data || data.type === 'heartbeat') return;

    // 만약 type이 jma_eew이거나 EEW 필드가 존재할 때
    if (data.Latitude !== undefined && data.Longitude !== undefined && data.OriginTime) {
      if (data.isCancel) {
        console.log('[Wolfx EEW] 지진속보 취소 수신:', data);
        this.machine.transition({ ...data, isCancel: true });
        return;
      }

      const eventId = data.EventID || `${data.OriginTime}_${data.Hypocenter}`;
      const serial = typeof data.Serial === 'number' ? data.Serial : 1;

      // 발생 시각 계산
      const originTimestamp = this.parseOriginTime(data.OriginTime);
      const now = Date.now();
      const elapsedSec = (now - originTimestamp) / 1000;
      const currentCtx = this.machine.getContext();

      // 과거 지진속보 무시 (발생 시각 기준 3분(180초) 이상 지난 데이터는 표시하지 않음)
      if (elapsedSec > 180 || elapsedSec < -60) {
        // 과거 지진속보인 경우 활성 EEW가 있었다면 해제
        if (currentCtx.state !== EEWState.IDLE && currentCtx.data?.EventID === eventId) {
          this.machine.forceIdle();
        }
        return;
      }

      // 이미 처리된 동일한 보(Serial)이고 내용 변경이 없으면 무시
      if (this.lastEventId === eventId && this.lastSerial === serial && currentCtx.state !== EEWState.IDLE) {
        return;
      }

      const eew: WolfxEEWData = {
        ...data,
        originTimestamp,
        receivedAt: Date.now(),
        isWarn: data.Title?.includes('警報') || (data.MaxIntensity && ['5弱', '5強', '6弱', '6強', '7'].includes(data.MaxIntensity))
      };

      this.lastEventId = eventId;
      this.lastSerial = serial;
      this.machine.transition(eew);
      console.log(`[Wolfx EEW] 신규 지진속보 수신: ${eew.Hypocenter} M${eew.Magunitude} (최대진도: ${eew.MaxIntensity}, 깊이: ${eew.Depth}km) 상태: ${this.machine.getContext().state}`);
    }
  }

  public clearEEW() {
    this.machine.forceIdle();
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.worker) {
      this.worker.postMessage({ action: 'destroy' });
      this.worker.terminate();
      this.worker = null;
    }
    this.callbacks.clear();
  }
}
