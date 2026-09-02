import { getIntensityFromRGB } from './colorMap';

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

/**
 * 방재과학기술연구소(NIED) 강진 모니터(Kyoshin Monitor) 실시간 진도 GIF URL 생성 함수
 * 파이썬 함수와 동일한 규격:
 * def shindo(now) -> str:
 *     u1 = now.strftime('%Y%m%d')
 *     u2 = now.strftime('%Y%m%d%H%M%S')
 *     return "http://www.kmoni.bosai.go.jp/data/map_img/RealTimeImg/jma_s/"+ str(u1) +"/" + str(u2) + ".jma_s.gif"
 */
export function getKmoniShindoUrl(now: Date): string {
  // JST(일본 표준시: UTC+9) 기준 계산
  const jst = new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60000);
  const yyyy = jst.getFullYear();
  const MM = String(jst.getMonth() + 1).padStart(2, '0');
  const dd = String(jst.getDate()).padStart(2, '0');
  const HH = String(jst.getHours()).padStart(2, '0');
  const mm = String(jst.getMinutes()).padStart(2, '0');
  const ss = String(jst.getSeconds()).padStart(2, '0');

  const u1 = `${yyyy}${MM}${dd}`;
  const u2 = `${yyyy}${MM}${dd}${HH}${mm}${ss}`;

  return `http://www.kmoni.bosai.go.jp/data/map_img/RealTimeImg/jma_s/${u1}/${u2}.jma_s.gif`;
}

export class KmoniGifParser {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 352;
    this.canvas.height = 400;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  /**
   * GIF 이미지를 비동기로 불러와 각 관측소의 Point (x, y) 픽셀 RGB를 계측 진도로 파싱합니다.
   */
  async parseGif(
    gifUrl: string,
    stations: StationPointMeta[]
  ): Promise<Map<string, number | null> | null> {
    if (!this.ctx) return null;

    try {
      const proxyUrl = `/proxy?url=${encodeURIComponent(gifUrl)}`;
      const resp = await fetch(proxyUrl);
      if (!resp.ok) {
        return null;
      }

      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);

      const img = new Image();
      img.crossOrigin = 'anonymous';

      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = (e) => reject(e);
          img.src = objectUrl;
        });

        const width = img.naturalWidth || 352;
        const height = img.naturalHeight || 400;

        if (this.canvas.width !== width || this.canvas.height !== height) {
          this.canvas.width = width;
          this.canvas.height = height;
        }

        this.ctx.clearRect(0, 0, width, height);
        this.ctx.drawImage(img, 0, 0);

        const imgData = this.ctx.getImageData(0, 0, width, height);
        const data = imgData.data;

        const resultMap = new Map<string, number | null>();

        for (const stn of stations) {
          if (!stn.Point || stn.IsSuspended) {
            resultMap.set(stn.Code, null);
            continue;
          }

          const { x, y } = stn.Point;
          if (x < 0 || x >= width || y < 0 || y >= height) {
            resultMap.set(stn.Code, null);
            continue;
          }

          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];

          if (a === 0) {
            resultMap.set(stn.Code, null);
            continue;
          }

          const intensity = getIntensityFromRGB(r, g, b);
          resultMap.set(stn.Code, intensity);
        }
        return resultMap;
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (e) {
      console.warn('[KmoniGifParser Error]:', e);
      return null;
    }
  }
}
