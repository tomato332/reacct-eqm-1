import { INTENSITY_COLORS } from './src/colorMap';
import { QuakeDetectService } from './src/QuakeDetectService';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { GifReader, GifWriter } from 'omggif';

export interface StationPointMeta {
  Type?: number;
  Code: string;
  Name: string;
  Region: string;
  IsSuspended?: boolean;
  Location: { latitude: number; longitude: number };
  OldLocation?: { latitude: number; longitude: number };
  Point: { x: number; y: number } | null;
  ClassificationId?: number | null;
  PrefectureClassificationId?: number | null;
}

export interface IntensityUpdatePayload {
  timestamp: number;
  source: 'kmoni' | 'yahoo';
  dataTime: string;
  intensities: Record<string, number | null>;
}

/** 감지 이벤트 히스토리 항목 (data/history.json에 저장, GET /api/history로 제공) */
export interface DetectedEventHistoryEntry {
  id: number; // 시작 시각 epoch ms
  startTs: number;
  endTs: number;
  durationSec: number;
  maxJindo: number | null;
  maxJindoStr: string;
  region: string | null;
  stationName: string | null;
  center: [number, number] | null;
  frameCount: number;
  animation: string | null; // data/events/ 아래 파일명
  replay?: boolean; // 프레임별 리플레이 데이터(event-<id>.replay.json) 존재 여부
}

/** 진도 수치 → 계급 문자열 (웹훅/히스토리 공용) */
export function jindoToStr(jindo: number): string {
  if (jindo < 0.5) return '0';
  if (jindo < 1.5) return '1';
  if (jindo < 2.5) return '2';
  if (jindo < 3.5) return '3';
  if (jindo < 4.5) return '4';
  if (jindo < 5.0) return '5약';
  if (jindo < 5.5) return '5강';
  if (jindo < 6.0) return '6약';
  if (jindo < 6.5) return '6강';
  return '7';
}

// RGB to JMA Instrumental Intensity reverse calculation
export function getIntensityFromRGB(r: number, g: number, b: number): number | null {
  if (r === 0 && g === 0 && b === 0) return null;
  if (Math.abs(r - g) < 4 && Math.abs(g - b) < 4 && Math.abs(r - b) < 4 && r < 60) return null;

  let minDiff = Infinity;
  let closestIntensity: number = -3.0;

  for (const item of INTENSITY_COLORS) {
    const dr = item.R - r;
    const dg = item.G - g;
    const db = item.B - b;
    const distSq = dr * dr + dg * dg + db * db;
    if (distSq < minDiff) {
      minDiff = distSq;
      closestIntensity = item.Intensity;
    }
  }

  if (minDiff < 4000) {
    return closestIntensity;
  }
  return null;
}

// kmoni jma_s GIF의 투영 상수 (1628개 관측소 Point 잔차 분석으로 확정).
// 본토와 남서제도(오키나와·아마미)는 동일 축척의 등간격 투영이지만 인셋 박스 원점이 다르다.
export const MAIN_PROJECTION = {
  lonPerPx: 0.0491300, lon0: 128.6268,
  latPerPx: -0.0407483, lat0: 46.2400
};
export const INSET_PROJECTION = {
  lonPerPx: 0.0491574, lon0: 122.5219,
  latPerPx: -0.0405859, lat0: 32.0293
};
// 남서제도 인셋 판정 (본토 최남단 관측소 屋久 lon~130.4와의 경계)
export function isInInsetRegion(lon: number, lat: number): boolean {
  return lon < 130 && lat < 30.5;
}

/**
 * 관측소 픽셀의 진도 유효성 검사 (오탐 방지).
 * 실제 진도 표시는 지도 위 여러 픽셀 뭉치로 그려지므로, Point 주변 3×3에서
 * 중심과 비슷한 색이 3픽셀 이상 있어야 인정한다. 고립된 밝은 점(노이즈 1px)은 기각.
 */
export function validateSpatialSupport(rgba: Uint8Array, width: number, height: number, cx: number, cy: number): boolean {
  const ci = (cy * width + cx) * 4;
  const cr = rgba[ci], cg = rgba[ci + 1], cb = rgba[ci + 2];

  let support = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const px = cx + dx, py = cy + dy;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const idx = (py * width + px) * 4;
      if (rgba[idx + 3] === 0) continue;
      if (dx === 0 && dy === 0) {
        support++;
        continue;
      }
      const dr = rgba[idx] - cr, dg = rgba[idx + 1] - cg, db = rgba[idx + 2] - cb;
      // 진도 팔레트 0.1스텝 ≈ RGB 7~15 단위이므로 유사 픽셀 판정 임계로 6000(distSq) 사용
      if (dr * dr + dg * dg + db * db < 6000) support++;
    }
  }
  return support >= 3;
}

function getKmoniShindoUrl(now: Date): { url: string; timeStr: string } {
  const jst = new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60000);
  const yyyy = jst.getFullYear();
  const MM = String(jst.getMonth() + 1).padStart(2, '0');
  const dd = String(jst.getDate()).padStart(2, '0');
  const HH = String(jst.getHours()).padStart(2, '0');
  const mm = String(jst.getMinutes()).padStart(2, '0');
  const ss = String(jst.getSeconds()).padStart(2, '0');

  const u1 = `${yyyy}${MM}${dd}`;
  const u2 = `${yyyy}${MM}${dd}${HH}${mm}${ss}`;

  return {
    url: `http://www.kmoni.bosai.go.jp/data/map_img/RealTimeImg/jma_s/${u1}/${u2}.jma_s.gif`,
    timeStr: `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`
  };
}

export class ServerIntensityAggregator {
  private stations: StationPointMeta[] = [];
  private latestKmoniPayload: IntensityUpdatePayload | null = null;
  private latestYahooPayload: IntensityUpdatePayload | null = null;
  private sseClients: Set<(data: IntensityUpdatePayload) => void> = new Set();
  private timer: NodeJS.Timeout | null = null;
  private isDestroyed = false;
  
  // 백엔드 감지기 인스턴스 (웹훅 발송용)
  private detectService: QuakeDetectService | null = null;
  private webhookCooldown = 0;
  private lastKmoniGif: Buffer | null = null; // 웹훅 지도 첨부용

  // 감지 구간 애니메이션 GIF용: 이벤트 활성 동안 초당 프레임 버퍼
  // grid에는 해당 시점의 감지 격자(lastActiveGridGeojson) 참조를 함께 보관한다 (리플레이용)
  private eventFrameBuffer: { timeStr: string; gif: Buffer; grid: any }[] = [];
  private isEventBuffering = false;
  // 감지 활성 마지막 시점의 격자(종료 시에는 비어버리므로 별도 보관) — 애니메이션 위에 그림
  private lastActiveGridGeojson: any = null;
  private static readonly MAX_EVENT_FRAMES = 90; // 최대 90초 분량

  // 즉시 알림 메시지를 감지 종료 시 수정(리포트 추가)하기 위한 상태
  private lastAlertMessageId: string | null = null;
  private lastAlertEmbed: any = null;
  private lastSentMapGif: Buffer | null = null;

  // 감지 이벤트 히스토리 (사이트 "감지 히스토리" 카드용, data/history.json 영속화)
  private eventHistory: DetectedEventHistoryEntry[] = [];
  private historyDir = path.join(process.cwd(), 'data');
  // 진행 중인 이벤트의 집계 상태
  private currentEventStart: number | null = null;
  private currentEventMaxJindo: number | null = null;
  private currentEventTopStation: { region: string; name: string } | null = null;
  private currentEventCenter: [number, number] | null = null;

  constructor() {
    this.loadStationList();
    this.loadHistory();
    this.startPollingLoop();
    this.detectService = new QuakeDetectService();
    this.detectService.initKmoniStations(this.stations);
  }

  private loadHistory() {
    try {
      const p = path.join(this.historyDir, 'history.json');
      if (fs.existsSync(p)) {
        const json = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (Array.isArray(json?.items)) {
          this.eventHistory = json.items
            .filter((e: any) => e && typeof e.id === 'number')
            .sort((a: DetectedEventHistoryEntry, b: DetectedEventHistoryEntry) => b.id - a.id)
            .slice(0, 50);
        }
      }
      console.log(`[History] 감지 이벤트 ${this.eventHistory.length}개 로드 완료`);
    } catch (err) {
      console.error('[History] 히스토리 로드 실패:', err);
    }
  }

  private persistHistory() {
    try {
      fs.mkdirSync(this.historyDir, { recursive: true });
      fs.writeFileSync(path.join(this.historyDir, 'history.json'), JSON.stringify({ items: this.eventHistory }));
    } catch (err) {
      console.error('[History] 히스토리 저장 실패:', err);
    }
  }

  public getHistory(): DetectedEventHistoryEntry[] {
    return this.eventHistory;
  }

  public getAnimationPath(id: number): string | null {
    const entry = this.eventHistory.find((e) => e.id === id);
    if (!entry?.animation) return null;
    const p = path.join(this.historyDir, 'events', entry.animation);
    return fs.existsSync(p) ? p : null;
  }

  public getReplayPath(id: number): string | null {
    const entry = this.eventHistory.find((e) => e.id === id);
    if (!entry?.replay) return null;
    const p = path.join(this.historyDir, 'events', `event-${id}.replay.json`);
    return fs.existsSync(p) ? p : null;
  }

  /**
   * kmoni GIF 1장을 관측소별 계측진도 맵으로 파싱한다.
   * 실시간 브로드캐스트와 감지 이벤트 리플레이 저장 양쪽에서 사용.
   */
  private parseIntensityMap(gifBuffer: Buffer): Record<string, number | null> {
    const reader = new GifReader(gifBuffer);
    const width = reader.width;
    const height = reader.height;

    const rgba = new Uint8Array(width * height * 4);
    reader.decodeAndBlitFrameRGBA(0, rgba);

    const intensities: Record<string, number | null> = {};

    for (const stn of this.stations) {
      if (!stn.Point || stn.IsSuspended) {
        intensities[stn.Code] = null;
        continue;
      }

      const { x, y } = stn.Point;
      if (x < 0 || x >= width || y < 0 || y >= height) {
        intensities[stn.Code] = null;
        continue;
      }

      const idx = (y * width + x) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      const a = rgba[idx + 3];

      if (a === 0) {
        intensities[stn.Code] = null;
        continue;
      }

      const jindo = getIntensityFromRGB(r, g, b);
      // 고립 노이즈 픽셀 기각: 3×3 이웃 지원이 없으면 무효
      intensities[stn.Code] = jindo !== null && validateSpatialSupport(rgba, width, height, x, y) ? jindo : null;
    }

    return intensities;
  }

  /** 감지 종료 시 이벤트 기록을 만들어 히스토리에 저장한다. 프레임 버퍼 스냅샷으로 리플레이 데이터도 만든다. */
  private recordEventHistory(
    anim: { buf: Buffer; mime: string; frameCount: number } | null,
    replayFrames: { timeStr: string; gif: Buffer; grid: any }[]
  ) {
    if (!anim && replayFrames.length === 0) return;
    const now = Date.now();
    const start = this.currentEventStart ?? now - (anim?.frameCount ?? replayFrames.length) * 1000;

    let animation: string | null = null;
    if (anim?.buf?.length) {
      try {
        fs.mkdirSync(path.join(this.historyDir, 'events'), { recursive: true });
        const ext = anim.mime === 'video/mp4' ? 'mp4' : 'gif';
        animation = `event-${start}.${ext}`;
        fs.writeFileSync(path.join(this.historyDir, 'events', animation), anim.buf);
      } catch (err) {
        console.error('[History] 애니메이션 저장 실패:', err);
      }
    }

    // 리플레이 데이터: 프레임별 관측소 진도(값 있는 것만) + 감지 격자
    let replay = false;
    if (replayFrames.length > 0) {
      try {
        fs.mkdirSync(path.join(this.historyDir, 'events'), { recursive: true });
        const replayJson = {
          version: 1,
          intervalSec: 1,
          startTs: start,
          times: replayFrames.map((f) => f.timeStr),
          frames: replayFrames.map((f) => {
            const intensities = this.parseIntensityMap(f.gif);
            const sparse: Record<string, number> = {};
            for (const [code, jindo] of Object.entries(intensities)) {
              if (jindo !== null) sparse[code] = jindo;
            }
            return { i: sparse, g: f.grid ?? null };
          }),
        };
        fs.writeFileSync(
          path.join(this.historyDir, 'events', `event-${start}.replay.json`),
          JSON.stringify(replayJson)
        );
        replay = true;
      } catch (err) {
        console.error('[History] 리플레이 데이터 저장 실패:', err);
      }
    }

    const entry: DetectedEventHistoryEntry = {
      id: start,
      startTs: start,
      endTs: now,
      durationSec: Math.max(1, Math.round((now - start) / 1000)),
      maxJindo: this.currentEventMaxJindo,
      maxJindoStr: this.currentEventMaxJindo !== null ? jindoToStr(this.currentEventMaxJindo) : '알 수 없음',
      region: this.currentEventTopStation?.region ?? null,
      stationName: this.currentEventTopStation?.name ?? null,
      center: this.currentEventCenter,
      frameCount: anim?.frameCount ?? replayFrames.length,
      animation,
      replay,
    };
    this.eventHistory.unshift(entry);
    if (this.eventHistory.length > 50) this.eventHistory.length = 50;
    this.persistHistory();
    console.log(`[History] 감지 이벤트 기록: ${new Date(start).toISOString()} 최대 ${entry.maxJindoStr} (${this.eventHistory.length}번째)`);

    this.currentEventStart = null;
    this.currentEventMaxJindo = null;
    this.currentEventTopStation = null;
    this.currentEventCenter = null;
  }

  /** 진행 중인 이벤트의 최대 진도/관측소를 갱신한다 */
  private updateCurrentEventStats() {
    const top = this.detectService?.getTopStations(1)?.[0];
    if (top && top.jindo !== null && (this.currentEventMaxJindo === null || top.jindo > this.currentEventMaxJindo)) {
      this.currentEventMaxJindo = top.jindo;
      this.currentEventTopStation = { region: top.region, name: top.name };
    }
  }

  /**
   * kmoni GIF 1장을 디코딩해 바다 배경 채우기 + 감지 격자 합성 + 팔레트 양자화까지 수행.
   * 단일 프레임 웹훅 이미지와 감지 구간 애니메이션 GIF 양쪽에서 재사용한다.
   */
  private compositeFrame(gifBuffer: Buffer, gridFeatures: any[]): {
    width: number; height: number; indices: Uint8Array; palette: number[];
  } | null {
    try {
      const reader = new GifReader(gifBuffer);
      const width = reader.width;
      const height = reader.height;
      const rgba = new Uint8Array(width * height * 4);
      reader.decodeAndBlitFrameRGBA(0, rgba);

      // 투명 픽셀(바다/배경)을 검정 배경으로 채운다 (kmoni 다크 테마 스타일)
      for (let p = 0; p < width * height; p++) {
        if (rgba[p * 4 + 3] === 0) {
          rgba[p * 4] = 13;
          rgba[p * 4 + 1] = 13;
          rgba[p * 4 + 2] = 18;
          rgba[p * 4 + 3] = 255;
        }
      }

      // 사이트 감지 격자를 GIF 픽셀 좌표로 변환해 그린다.
      // kmoni 지도는 등간격 투영(본토/남서제도 인셋 두 개)이므로 분석으로 확정된 고정 상수를 사용한다.
      // ※ 전 관측소 일괄 선형회귀는 인셋 관측소가 섞여 최대 6° 왜곡이 생기므로 쓰지 않는다.
      if (gridFeatures.length > 0) {
        const lonToX = (lon: number, lat: number) => {
          const p = isInInsetRegion(lon, lat) ? INSET_PROJECTION : MAIN_PROJECTION;
          return Math.round((lon - p.lon0) / p.lonPerPx);
        };
        const latToY = (lon: number, lat: number) => {
          const p = isInInsetRegion(lon, lat) ? INSET_PROJECTION : MAIN_PROJECTION;
          return Math.round((lat - p.lat0) / p.latPerPx);
        };

        const plot = (px: number, py: number) => {
          for (let oy = 0; oy < 2; oy++) {
            for (let ox = 0; ox < 2; ox++) {
              const px2 = px + ox;
              const py2 = py + oy;
              if (px2 < 0 || px2 >= width || py2 < 0 || py2 >= height) continue;
              const i = (py2 * width + px2) * 4;
              rgba[i] = 255; rgba[i + 1] = 0; rgba[i + 2] = 0; rgba[i + 3] = 255;
            }
          }
        };
        const drawEdge = (lon1: number, lat1: number, lon2: number, lat2: number) => {
          const x1 = lonToX(lon1, lat1), y1 = latToY(lon1, lat1);
          const x2 = lonToX(lon2, lat2), y2 = latToY(lon2, lat2);
          const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
          for (let s = 0; s <= steps; s++) {
            plot(Math.round(x1 + (x2 - x1) * s / steps), Math.round(y1 + (y2 - y1) * s / steps));
          }
        };
        for (const f of gridFeatures) {
          const ring = f?.geometry?.coordinates?.[0];
          if (!Array.isArray(ring)) continue;
          for (let i = 0; i < ring.length - 1; i++) {
            drawEdge(ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
          }
        }
      }

      // RGBA -> 팔레트 인덱스 (색상 수가 256을 넘으면 채널을 잘라가며 양자화)
      let shift = 0;
      let palette: number[] = [];
      let indices = new Uint8Array(width * height);
      for (;;) {
        const map = new Map<number, number>();
        indices = new Uint8Array(width * height);
        for (let p = 0; p < width * height; p++) {
          const key = ((rgba[p * 4] >> shift) << 16) | ((rgba[p * 4 + 1] >> shift) << 8) | (rgba[p * 4 + 2] >> shift);
          let idx = map.get(key);
          if (idx === undefined) {
            idx = map.size;
            map.set(key, idx);
          }
          indices[p] = idx;
        }
        if (map.size <= 256) {
          palette = [...map.keys()];
          break;
        }
        shift++;
      }

      let palSize = 2;
      while (palSize < palette.length) palSize <<= 1;
      const pal = [...palette];
      while (pal.length < palSize) pal.push(0);

      return { width, height, indices, palette: pal };
    } catch (err) {
      console.error('[Webhook] 프레임 합성 실패:', err);
      return null;
    }
  }

  /**
   * 최신 kmoni GIF 위에 사이트의 감지 격자(updateDetectedEvents의 셀 폴리곤)를
   * 동일하게 그려 GIF로 재인코딩한다.
   */
  private buildMapGif(): Buffer | null {
    if (!this.lastKmoniGif) return null;
    const frame = this.compositeFrame(this.lastKmoniGif, this.detectService?.lastDetectedGeojson?.features ?? []);
    if (!frame) return null;

    const outBuf = new Uint8Array(frame.width * frame.height + 768 + 4096);
    const writer = new GifWriter(outBuf as any, frame.width, frame.height, { palette: frame.palette } as any);
    writer.addFrame(0, 0, frame.width, frame.height, frame.indices, { palette: frame.palette } as any);
    const len = writer.end();
    return Buffer.from(outBuf.subarray(0, len));
  }

  /**
   * 감지 구간(이벤트 활성 동안 버퍼링한 프레임)으로 애니메이션 GIF를 만든다.
   * 각 프레임 위에는 감지 활성 시점의 격자(lastActiveGridGeojson)를 그린다.
   * 프레임은 초당 1장이므로 GIF 딜레이는 100(=1초) 단위.
   */
  private buildEventAnimationGif(frames: { timeStr: string; gif: Buffer }[]): Buffer | null {
    if (frames.length === 0) return null;
    const gridFeatures = this.lastActiveGridGeojson?.features ?? [];
    try {
      const encoded: { indices: Uint8Array; palette: number[] }[] = [];
      let width = 0, height = 0;

      for (const { gif } of frames) {
        const frame = this.compositeFrame(gif, gridFeatures);
        if (!frame) continue;
        width = frame.width;
        height = frame.height;
        encoded.push({ indices: frame.indices, palette: frame.palette });
      }
      if (encoded.length === 0) return null;

      const outBuf = new Uint8Array(encoded.length * (width * height + 768) + 4096);
      const writer = new GifWriter(outBuf as any, width, height, { loop: 0 } as any);
      for (const f of encoded) {
        writer.addFrame(0, 0, width, height, f.indices, { palette: f.palette, delay: 100 } as any);
      }
      const len = writer.end();
      return Buffer.from(outBuf.subarray(0, len));
    } catch (err) {
      console.error('[Webhook] 감지 구간 애니메이션 생성 실패:', err);
      return null;
    }
  }

  /**
   * 감지 구간 프레임을 ffmpeg로 mp4(H.264)로 인코딩한다. GIF보다 용량이 훨씬 작다.
   * rawvideo(rgb24)를 파이프로 넘기고 임시 파일로 받는다(+faststart에는 seekable 출력 필요).
   * ffmpeg가 없거나 실패하면 null을 반환하며, 호출부는 GIF로 폴백한다.
   */
  private async buildEventAnimationMp4(frames: { timeStr: string; gif: Buffer }[]): Promise<Buffer | null> {
    if (frames.length === 0) return null;
    const gridFeatures = this.lastActiveGridGeojson?.features ?? [];

    const composited: { indices: Uint8Array; palette: number[] }[] = [];
    let width = 0, height = 0;
    for (const { gif } of frames) {
      const frame = this.compositeFrame(gif, gridFeatures);
      if (!frame) continue;
      width = frame.width;
      height = frame.height;
      composited.push(frame);
    }
    if (composited.length === 0) return null;

    // 인덱스 + 팔레트 -> rgb24 raw 스트림
    const rgb = Buffer.alloc(width * height * 3);
    const tmpPath = path.join(os.tmpdir(), `eqm-event-${Date.now()}.mp4`);
    try {
      const inner = new Promise<Buffer | null>((resolve) => {
        const ff = spawn('ffmpeg', [
          '-y',
          '-f', 'rawvideo', '-pix_fmt', 'rgb24',
          '-s', `${width}x${height}`, '-r', '1',
          '-i', 'pipe:0',
          // yuv420p는 짝수 크기만 허용하므로 홀수일 때 잘라낸다
          '-vf', 'crop=trunc(iw/2)*2:trunc(ih/2)*2',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
          '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
          tmpPath,
        ], { stdio: ['pipe', 'ignore', 'pipe'] });

        let stderr = '';
        ff.stderr.on('data', (d) => { stderr += d; if (stderr.length > 8000) stderr = stderr.slice(-4000); });

        ff.on('error', (err) => {
          console.warn('[Webhook] ffmpeg 실행 불가 (GIF로 폴백):', (err as NodeJS.ErrnoException).code ?? err);
          resolve(null);
        });

        // stdin 배압(backpressure) 처리: drain을 기다리며 순서 보장
        let i = 0;
        let failed = false;
        const writeNext = () => {
          if (failed) return;
          while (i < composited.length) {
            const f = composited[i++];
            // compositeFrame의 팔레트는 24비트 정수(r<<16|g<<8|b) 배열
            for (let p = 0; p < width * height; p++) {
              const key = f.palette[f.indices[p]] | 0;
              rgb[p * 3] = (key >> 16) & 0xff;
              rgb[p * 3 + 1] = (key >> 8) & 0xff;
              rgb[p * 3 + 2] = key & 0xff;
            }
            const ok = ff.stdin.write(rgb);
            if (!ok) {
              ff.stdin.once('drain', writeNext);
              return;
            }
          }
          ff.stdin.end();
        };
        ff.stdin.on('error', () => { failed = true; });

        ff.on('close', (code) => {
          if (code === 0 && fs.existsSync(tmpPath)) {
            try {
              resolve(fs.readFileSync(tmpPath));
            } catch {
              resolve(null);
            }
          } else {
            console.warn(`[Webhook] ffmpeg mp4 인코딩 실패 (code=${code}) GIF로 폴백:`, stderr.split('\n').slice(-3).join(' | '));
            resolve(null);
          }
        });

        writeNext();
      });
      // 변수에 담아 await해야 반환값이 유실되지 않는다 (tsx/esbuild 하의 직접 await 반환은 undefined가 될 수 있음)
      return (await inner) as Buffer | null;
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  }

  private async triggerWebhook(source: string, isNewEvent: boolean = false) {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) return;

    const now = Date.now();
    // 60초 쿨타임 (도배 방지)
    if (now < this.webhookCooldown) return;
    this.webhookCooldown = now + 60000;

    const topStations = this.detectService ? this.detectService.getTopStations(1) : [];
    const maxJindo = topStations.length > 0 ? topStations[0].jindo : null;
    const topStation = topStations.length > 0 ? topStations[0] : null;
    
    let jindoStr = '알 수 없음';
    let r = 148, g = 163, b = 184; // Fallback gray

    if (maxJindo !== null) {
      jindoStr = jindoToStr(maxJindo);

      let minDiff = Infinity;
      let closest = INTENSITY_COLORS[0];
      for (const item of INTENSITY_COLORS) {
        const diff = Math.abs(item.Intensity - maxJindo);
        if (diff < minDiff) {
          minDiff = diff;
          closest = item;
        }
      }
      r = closest.R;
      g = closest.G;
      b = closest.B;
    }

    const colorInt = (r << 16) | (g << 8) | b;
    const sourceStr = source === 'kmoni' ? '강진모니터(K-moni)' : 'Yahoo! 방재속보';

    const embed = {
      title: isNewEvent ? "🚨 지진(흔들림) 감지 보고 🚨" : "🔔 흔들림 진도 업데이트 🔔",
      description: isNewEvent ? "새로운 흔들림이 감지되었습니다." : "흔들림 진도가 업데이트 되었습니다.",
      color: colorInt,
      fields: [
        ...(topStation ? [{
          name: "감지 격자 관측소",
          value: `${topStation.region} ${topStation.name} ${topStation.jindoStr}`,
          inline: false
        }] : []),
        {
          name: "예상 최대 진도",
          value: `**${jindoStr}**`,
          inline: true
        },
        {
          name: "데이터 소스",
          value: sourceStr,
          inline: true
        }
      ],
      timestamp: new Date().toISOString()
    };

    // 사이트 감지 격자가 표시된 최신 실시간 지도를 첨부
    const mapGif = this.buildMapGif();
    if (mapGif) {
      embed.image = { url: 'attachment://map.gif' };
    }

    const payload = {
      embeds: [embed]
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      let res: Response;
      if (mapGif) {
        const form = new FormData();
        form.append('payload_json', JSON.stringify(payload));
        form.append('files[0]', new Blob([new Uint8Array(mapGif)], { type: 'image/gif' }), 'map.gif');
        // ?wait=true: 응답으로 메시지 ID를 받아, 감지 종료 시 이 메시지에 리포트를 붙일 수 있게 함
        res = await fetch(`${webhookUrl}?wait=true`, { method: 'POST', body: form, signal: controller.signal });
      } else {
        res = await fetch(`${webhookUrl}?wait=true`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
      }
      clearTimeout(timeout);

      if (!res.ok) {
        console.error(`[Webhook] 응답 오류: ${res.status} ${res.statusText}`);
      } else {
        console.log(`[Webhook] 알림 발송 완료 (최대 진도: ${jindoStr})`);
        // 감지 종료 시 이 메시지를 수정해 리포트를 붙일 수 있도록 상태 보관
        try {
          const sent = await res.json();
          if (sent?.id) {
            this.lastAlertMessageId = sent.id;
            this.lastAlertEmbed = embed;
            this.lastSentMapGif = mapGif;
          }
        } catch {}
      }
    } catch (err) {
      console.error(`[Webhook] 발송 실패:`, err);
    }
  }

  /**
   * 감지 구간 종료 시 애니메이션 리포트를 웹훅으로 보낸다.
   * 즉시 알림 메시지가 있으면 그 메시지를 "수정(PATCH)"해 리포트 임베드를 옆에 붙이고,
   * 없으면 별도 메시지로 발송한다. 60초 쿨타임을 적용하지 않는다.
   */
  private async sendEventAnimationWebhook(): Promise<{ buf: Buffer; mime: string; frameCount: number } | null> {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) return null;
    if (this.eventFrameBuffer.length === 0) return null;

    // 버퍼를 먼저 확보해 비운다 (비우고 만들면 항상 실패함)
    const frames = this.eventFrameBuffer;
    this.eventFrameBuffer = []; // 전송 여부와 무관하게 버퍼는 비운다 (다음 이벤트 대비)

    // mp4 우선, ffmpeg 없으면 GIF 폴백
    const animationMp4 = await this.buildEventAnimationMp4(frames);
    const isMp4 = animationMp4 !== null;
    const animationBuf = animationMp4 ?? this.buildEventAnimationGif(frames);
    if (!animationBuf) {
      console.warn(`[Webhook] 애니메이션 생성 실패로 발송 생략 (버퍼 ${frames.length}프레임)`);
      return null;
    }
    const animationFilename = isMp4 ? 'event.mp4' : 'event.gif';
    const animationMime = isMp4 ? 'video/mp4' : 'image/gif';

    const firstTime = frames[0].timeStr;
    const lastTime = frames[frames.length - 1].timeStr;
    const durationSec = frames.length;

    const reportEmbed: any = {
      title: "🎞️ 흔들림 감지 구간 리포트",
      description: `감지가 유지된 구간의 실시간 지도 애니메이션입니다.`,
      color: 0xef4444,
      fields: [
        { name: "감지 구간", value: `${firstTime} ~ ${lastTime} (KST)`, inline: false },
        { name: "구간 길이", value: `약 ${durationSec}초`, inline: true }
      ],
      timestamp: new Date().toISOString()
    };
    // mp4는 임베드 이미지로 재생되지 않으므로 첨부 플레이어에 맡긴다
    if (!isMp4) reportEmbed.image = { url: 'attachment://event.gif' };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      let res: Response;

      // 즉시 알림 메시지가 보관되어 있으면 그 메시지에 리포트를 붙인다 (한 메시지에 임베드 2개 = 나란히 표시)
      if (this.lastAlertMessageId && this.lastAlertEmbed && this.lastSentMapGif) {
        const patchPayload = {
          embeds: [this.lastAlertEmbed, reportEmbed],
          attachments: [
            { id: 0, filename: 'map.gif' },
            { id: 1, filename: animationFilename }
          ]
        };
        const form = new FormData();
        form.append('payload_json', JSON.stringify(patchPayload));
        form.append('files[0]', new Blob([new Uint8Array(this.lastSentMapGif)], { type: 'image/gif' }), 'map.gif');
        form.append('files[1]', new Blob([new Uint8Array(animationBuf)], { type: animationMime }), animationFilename);
        res = await fetch(`${webhookUrl}/messages/${this.lastAlertMessageId}`, {
          method: 'PATCH',
          body: form,
          signal: controller.signal
        });
      } else {
        // 알림 메시지를 못 받았으면(쿨타임 억제 등) 별도 메시지로 발송
        const form = new FormData();
        form.append('payload_json', JSON.stringify({ embeds: [reportEmbed] }));
        form.append('files[0]', new Blob([new Uint8Array(animationBuf)], { type: animationMime }), animationFilename);
        res = await fetch(webhookUrl, { method: 'POST', body: form, signal: controller.signal });
      }
      clearTimeout(timeout);

      this.lastAlertMessageId = null;
      this.lastAlertEmbed = null;
      this.lastSentMapGif = null;

      if (!res.ok) {
        console.error(`[Webhook] 애니메이션 발송 오류: ${res.status} ${res.statusText}`);
      } else {
        console.log(`[Webhook] 감지 구간 리포트 발송 완료 (${frames.length}프레임, ${isMp4 ? 'mp4' : 'gif'} ${(animationBuf.length / 1024).toFixed(0)}KB)`);
      }
    } catch (err) {
      console.error(`[Webhook] 애니메이션 발송 실패:`, err);
    }
    // 발송 성공 여부와 무관하게 만들어진 애니메이션을 반환 (히스토리 저장용)
    return { buf: animationBuf, mime: animationMime, frameCount: frames.length };
  }

  private loadStationList() {
    try {
      // 프로덕션 번들은 dist 내부의 JSON을, 개발(tsx)은 public/ 아래 JSON을 읽는다
      const candidates = [
        path.join(__dirname, 'intensity-points-v1.json'),
        path.join(process.cwd(), 'public', 'intensity-points-v1.json'),
      ];
      const p = candidates.find(c => fs.existsSync(c));
      if (p) {
        const raw = fs.readFileSync(p, 'utf-8');
        const json = JSON.parse(raw);
        this.stations = Array.isArray(json) ? json : (json.items || []);
        console.log(`[ServerIntensityAggregator] 관측소 ${this.stations.length}개 로드 완료`);
      }
    } catch (e) {
      console.error('[ServerIntensityAggregator] 관측소 로드 실패:', e);
    }
  }

  public getLatestPayload(source: 'kmoni' | 'yahoo' = 'kmoni'): IntensityUpdatePayload | null {
    return source === 'kmoni' ? this.latestKmoniPayload : this.latestYahooPayload;
  }

  public subscribeSSE(listener: (data: IntensityUpdatePayload) => void): () => void {
    this.sseClients.add(listener);
    if (this.latestKmoniPayload) {
      listener(this.latestKmoniPayload);
    }
    if (this.latestYahooPayload) {
      listener(this.latestYahooPayload);
    }
    return () => {
      this.sseClients.delete(listener);
    };
  }

  private broadcast(payload: IntensityUpdatePayload) {
    if (payload.source === 'kmoni') {
      this.latestKmoniPayload = payload;
    } else {
      this.latestYahooPayload = payload;
    }
    
    for (const client of this.sseClients) {
      try {
        client(payload);
      } catch {}
    }

    // 백엔드 자체 감지 파이프라인 수행 후 웹훅 트리거 확인
    // 주의: 감지기는 kmoni 관측소 코드 기준이라 yahoo(인덱스 키) 페이로드를 넣으면
    // 전 관측소 상태가 null로 초기화되어 감지가 영원히 트리거되지 않는다.
    if (this.detectService && payload.source === 'kmoni' && payload.intensities) {
      try {
        this.detectService.processKmoniParsedData(payload.intensities, {
          // 감지 격자가 생긴 동안의 최신 격자를 보관 (종료 시에는 비어버리므로)
          onDetectedUpdated: (gridGeojson) => {
            if (gridGeojson?.features?.length > 0) {
              this.lastActiveGridGeojson = gridGeojson;
            }
          },
          onNewEventDetected: (center: [number, number]) => {
            // 감지 구간 프레임 버퍼링 시작 (진행 중이면 유지)
            if (!this.isEventBuffering) {
              this.isEventBuffering = true;
              this.eventFrameBuffer = [];
              // 새 감지 이벤트이므로 이전 이벤트의 알림 메시지에는 리포트를 붙이지 않는다
              this.lastAlertMessageId = null;
              this.lastAlertEmbed = null;
              this.lastSentMapGif = null;
              // 히스토리 집계 시작
              this.currentEventStart = Date.now();
              this.currentEventMaxJindo = null;
              this.currentEventTopStation = null;
              this.currentEventCenter = center ?? null;
              console.log('[Webhook] 감지 구간 프레임 버퍼링 시작');
            }
            this.updateCurrentEventStats();
            this.triggerWebhook(payload.source, true);
          },
          onSoundTriggered: () => {
            this.updateCurrentEventStats();
            // 진도가 상승하여 알림 조건이 충족될 때 진도 기준 없이 웹훅 전송 (60초 쿨타임 적용됨)
            this.triggerWebhook(payload.source, false);
          },
          // 감지가 모두 만료되면 구간 애니메이션 GIF를 웹훅으로 발송 + 리플레이 데이터 저장
          onEventsFinished: () => {
            this.isEventBuffering = false;
            // sendEventAnimationWebhook이 버퍼를 비우므로 리플레이용 스냅샷을 먼저 떠둔다
            const replayFrames = this.eventFrameBuffer.map((f) => ({ timeStr: f.timeStr, gif: f.gif, grid: f.grid }));
            this.sendEventAnimationWebhook()
              .then((anim) => { this.recordEventHistory(anim, replayFrames); })
              .catch(() => { this.recordEventHistory(null, replayFrames); });
          }
        });
      } catch (err) {
        // allSettled가 예외를 삼켜 조용히 죽는 것을 방지
        console.error('[Detect] 감지 파이프라인 예외:', err);
      }
    }
  }

  private kmoniOptimalDelay = 2000;
  private yahooOptimalDelay = 1000;

  private startPollingLoop() {
    let isRunning = false;

    const loop = async () => {
      if (this.isDestroyed) return;
      if (isRunning) return;
      isRunning = true;
      const startTime = Date.now();
      try {
        await Promise.allSettled([
          this.fetchAndParseKmoni(),
          this.fetchYahooRealtime()
        ]);
      } catch (err) {
        console.warn('[ServerIntensityAggregator] 루프 처리 중 경고:', err);
      } finally {
        isRunning = false;
        if (!this.isDestroyed) {
          const elapsed = Date.now() - startTime;
          const nextDelay = Math.max(50, 1000 - elapsed);
          this.timer = setTimeout(loop, nextDelay);
        }
      }
    };

    // 즉시 1회 실행 후 1초 정주기 실행
    loop();
  }

  private async fetchAndParseKmoni() {
    // 직전 성공 딜레이를 최우선으로 시도하고, 인접 딜레이를 우선 배치
    const base = this.kmoniOptimalDelay;
    const candidates = [base, base + 1000, base - 1000, 2000, 3000, 4000, 1000, 5000];
    const delays = Array.from(new Set(candidates)).filter(d => d >= 1000 && d <= 6000);

    let buffer: Buffer | null = null;
    let finalTimeStr = '';

    for (const delay of delays) {
      const targetDate = new Date(Date.now() - delay);
      const { url, timeStr } = getKmoniShindoUrl(targetDate);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1800);
        const resp = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'http://www.kmoni.bosai.go.jp/'
          }
        });
        clearTimeout(timeout);
        
        if (resp.ok) {
          const arrayBuffer = await resp.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
          finalTimeStr = timeStr;
          this.lastKmoniGif = buffer;
          this.kmoniOptimalDelay = delay; // 다음 루프 최적 딜레이 캐싱

          // 감지 구간 프레임 수집 (중복 타임스탬프 방지, 최대치 초과 시 오래된 것부터 폐기)
          if (this.isEventBuffering) {
            const last = this.eventFrameBuffer[this.eventFrameBuffer.length - 1];
            if (!last || last.timeStr !== finalTimeStr) {
              this.eventFrameBuffer.push({ timeStr: finalTimeStr, gif: buffer, grid: this.lastActiveGridGeojson });
              if (this.eventFrameBuffer.length > ServerIntensityAggregator.MAX_EVENT_FRAMES) {
                this.eventFrameBuffer.shift();
              }
            }
          }
          break;
        }
      } catch {}
    }

    if (!buffer) return;

    const intensities = this.parseIntensityMap(buffer);

    try {
      this.broadcast({
        timestamp: Date.now(),
        source: 'kmoni',
        dataTime: finalTimeStr,
        intensities
      });
    } catch (e) {
      // 파싱 예외 무시
    }
  }

  private async fetchYahooRealtime() {
    const base = this.yahooOptimalDelay;
    const candidates = [base, base + 1000, base - 1000, 1000, 2000, 3000, 4000];
    const delays = Array.from(new Set(candidates)).filter(d => d >= 1000 && d <= 5000);

    for (const delay of delays) {
      const targetTime = new Date(Date.now() - delay);
      const jst = new Date(targetTime.getTime() + (9 * 60 + targetTime.getTimezoneOffset()) * 60000);
      const yyyy = jst.getFullYear();
      const MM = String(jst.getMonth() + 1).padStart(2, '0');
      const dd = String(jst.getDate()).padStart(2, '0');
      const HH = String(jst.getHours()).padStart(2, '0');
      const mm = String(jst.getMinutes()).padStart(2, '0');
      const ss = String(jst.getSeconds()).padStart(2, '0');
      const folder = `${yyyy}${MM}${dd}`;
      const file = `${folder}${HH}${mm}${ss}`;
      const yahooUrl = `https://weather-kyoshin.west.edge.storage-yahoo.jp/RealTimeData/${folder}/${file}.json`;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1800);
        const resp = await fetch(yahooUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        clearTimeout(timeout);

        if (resp.ok) {
          const data = await resp.json();
          const intensityStr = data?.realTimeData?.intensity;
          if (intensityStr) {
            this.yahooOptimalDelay = delay;
            const intensities: Record<string, number | null> = {};
            for (let i = 0; i < intensityStr.length; i++) {
              const charCode = intensityStr.charCodeAt(i);
              intensities[i.toString()] = charCode > 0 ? (charCode - 100) * 0.5 - 3.0 : null;
            }
            this.broadcast({
              timestamp: Date.now(),
              source: 'yahoo',
              dataTime: `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`,
              intensities
            });
            break;
          }
        }
      } catch {}
    }
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.sseClients.clear();
  }
}
