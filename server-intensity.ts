import { INTENSITY_COLORS } from './src/colorMap';
import { QuakeDetectService } from './src/QuakeDetectService';
import fs from 'fs';
import path from 'path';
import { GifReader } from 'omggif';

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

// RGB to JMA Instrumental Intensity reverse calculation
function getIntensityFromRGB(r: number, g: number, b: number): number | null {
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

  constructor() {
    this.loadStationList();
    this.startPollingLoop();
    this.detectService = new QuakeDetectService();
    this.detectService.initKmoniStations(this.stations);
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
    
    let jindoStr = '알 수 없음';
    let r = 148, g = 163, b = 184; // Fallback gray

    if (maxJindo !== null) {
      if (maxJindo < 0.5) jindoStr = '0';
      else if (maxJindo < 1.5) jindoStr = '1';
      else if (maxJindo < 2.5) jindoStr = '2';
      else if (maxJindo < 3.5) jindoStr = '3';
      else if (maxJindo < 4.5) jindoStr = '4';
      else if (maxJindo < 5.0) jindoStr = '5약';
      else if (maxJindo < 5.5) jindoStr = '5강';
      else if (maxJindo < 6.0) jindoStr = '6약';
      else if (maxJindo < 6.5) jindoStr = '6강';
      else jindoStr = '7';

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

    const payload = {
      embeds: [embed]
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      if (!res.ok) {
        console.error(`[Webhook] 응답 오류: ${res.status} ${res.statusText}`);
      } else {
        console.log(`[Webhook] 알림 발송 완료 (최대 진도: ${jindoStr})`);
      }
    } catch (err) {
      console.error(`[Webhook] 발송 실패:`, err);
    }
  }

  private loadStationList() {
    try {
      const p = path.join(process.cwd(), 'public', 'intensity-points-v1.json');
      if (fs.existsSync(p)) {
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
    if (this.detectService && payload.intensities) {
      this.detectService.processKmoniParsedData(payload.intensities, {
        onNewEventDetected: () => {
          this.triggerWebhook(payload.source, true);
        },
        onSoundTriggered: () => {
          // 진도가 상승하여 알림 조건이 충족될 때 진도 기준 없이 웹훅 전송 (60초 쿨타임 적용됨)
          this.triggerWebhook(payload.source, false);
        }
      });
    }
  }

  private startPollingLoop() {
    let isRunning = false;

    const loop = async () => {
      if (this.isDestroyed) return;
      if (isRunning) return;
      isRunning = true;
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
          this.timer = setTimeout(loop, 1000);
        }
      }
    };

    // 즉시 1회 실행 후 1초 정주기 실행
    loop();
  }

  private async fetchAndParseKmoni() {
    const delays = [1000, 2000, 3000, 4000, 5000];
    let buffer: Buffer | null = null;
    let finalTimeStr = '';

    for (const delay of delays) {
      const targetDate = new Date(Date.now() - delay);
      const { url, timeStr } = getKmoniShindoUrl(targetDate);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
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
          break;
        }
      } catch {}
    }

    if (!buffer) return;

    try {
      const reader = new GifReader(buffer);
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

        intensities[stn.Code] = getIntensityFromRGB(r, g, b);
      }

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
    const delays = [1000, 2000, 3000, 4000, 5000];
    for (const delay of delays) {
      const now = new Date(Date.now() - delay);
      const yyyy = now.getFullYear();
      const MM = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const HH = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      const folder = `${yyyy}${MM}${dd}`;
      const file = `${folder}${HH}${mm}${ss}`;
      const yahooUrl = `https://weather-kyoshin.west.edge.storage-yahoo.jp/RealTimeData/${folder}/${file}.json`;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
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
