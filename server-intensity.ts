import { INTENSITY_COLORS } from './src/colorMap';
import { QuakeDetectService } from './src/QuakeDetectService';
import fs from 'fs';
import path from 'path';
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

// kmoni jma_s GIF의 투영 상수 (1628개 관측소 Point 잔차 분석으로 확정).
// 본토와 남서제도(오키나와·아마미)는 동일 축척의 등간격 투영이지만 인셋 박스 원점이 다르다.
const MAIN_PROJECTION = {
  lonPerPx: 0.0491300, lon0: 128.6268,
  latPerPx: -0.0407483, lat0: 46.2400
};
const INSET_PROJECTION = {
  lonPerPx: 0.0491574, lon0: 122.5219,
  latPerPx: -0.0405859, lat0: 32.0293
};
// 남서제도 인셋 판정 (본토 최남단 관측소 屋久 lon~130.4와의 경계)
function isInInsetRegion(lon: number, lat: number): boolean {
  return lon < 130 && lat < 30.5;
}

/**
 * 관측소 픽셀의 진도 유효성 검사 (오탐 방지).
 * 실제 진도 표시는 지도 위 여러 픽셀 뭉치로 그려지므로, Point 주변 3×3에서
 * 중심과 비슷한 색이 3픽셀 이상 있어야 인정한다. 고립된 밝은 점(노이즈 1px)은 기각.
 */
function validateSpatialSupport(rgba: Uint8Array, width: number, height: number, cx: number, cy: number): boolean {
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

  constructor() {
    this.loadStationList();
    this.startPollingLoop();
    this.detectService = new QuakeDetectService();
    this.detectService.initKmoniStations(this.stations);
  }

  /**
   * 최신 kmoni GIF 위에 사이트의 감지 격자(updateDetectedEvents의 셀 폴리곤)를
   * 동일하게 그려 GIF로 재인코딩한다.
   */
  private buildMapGif(): Buffer | null {
    if (!this.lastKmoniGif) return null;
    try {
      const reader = new GifReader(this.lastKmoniGif);
      const width = reader.width;
      const height = reader.height;
      const rgba = new Uint8Array(width * height * 4);
      reader.decodeAndBlitFrameRGBA(0, rgba);

      // 투명 픽셀(바다/배경)을 지도 느낌의 옅은 파란색으로 채운다
      for (let p = 0; p < width * height; p++) {
        if (rgba[p * 4 + 3] === 0) {
          rgba[p * 4] = 174;
          rgba[p * 4 + 1] = 210;
          rgba[p * 4 + 2] = 234;
          rgba[p * 4 + 3] = 255;
        }
      }

      // 사이트 감지 격자를 GIF 픽셀 좌표로 변환해 그린다.
      // kmoni 지도는 등간격 투영(본토/남서제도 인셋 두 개)이므로 분석으로 확정된 고정 상수를 사용한다.
      // ※ 전 관측소 일괄 선형회귀는 인셋 관측소가 섞여 최대 6° 왜곡이 생기므로 쓰지 않는다.
      const detectedFeatures = this.detectService?.lastDetectedGeojson?.features ?? [];
      if (detectedFeatures.length > 0) {
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
        for (const f of detectedFeatures) {
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

      const outBuf = new Uint8Array(width * height + 768 + 4096);
      const writer = new GifWriter(outBuf as any, width, height, { palette: pal } as any);
      writer.addFrame(0, 0, width, height, indices, { palette: pal } as any);
      const len = writer.end();
      return Buffer.from(outBuf.subarray(0, len));
    } catch (err) {
      console.error('[Webhook] 지도 이미지 생성 실패:', err);
      return null;
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
        res = await fetch(webhookUrl, { method: 'POST', body: form, signal: controller.signal });
      } else {
        res = await fetch(webhookUrl, {
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
      }
    } catch (err) {
      console.error(`[Webhook] 발송 실패:`, err);
    }
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
          onNewEventDetected: () => {
            this.triggerWebhook(payload.source, true);
          },
          onSoundTriggered: () => {
            // 진도가 상승하여 알림 조건이 충족될 때 진도 기준 없이 웹훅 전송 (60초 쿨타임 적용됨)
            this.triggerWebhook(payload.source, false);
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

        const jindo = getIntensityFromRGB(r, g, b);
        // 고립 노이즈 픽셀 기각: 3×3 이웃 지원이 없으면 무효
        intensities[stn.Code] = jindo !== null && validateSpatialSupport(rgba, width, height, x, y) ? jindo : null;
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
