import { StationPointMeta } from './KmoniService';

export interface JMAStationItem {
  area?: { code?: string; name?: string; furigana?: string };
  city?: { code?: string; name?: string; furigana?: string };
  code?: string;
  name?: string;
  furigana?: string;
  lat: string | number;
  lon: string | number;
  pref: { name: string; code?: number; furigana?: string } | string;
  affi?: string;
}

export interface P2PEarthquakeHypocenter {
  name: string;
  latitude: number;
  longitude: number;
  depth: number;
  magnitude: number;
}

export interface P2PObservationPoint {
  pref: string;
  name: string;
  scale: number;
  scaleStr: string;
  color: string;
  lat: number;
  lon: number;
  areaCode?: string;
  areaName?: string;
}

export interface P2PEarthquakeEvent {
  id: string;
  eventId: string;
  time: string;
  issueType: string;
  hypocenter: P2PEarthquakeHypocenter;
  maxScale: number;
  maxScaleStr: string;
  maxScaleColor: string;
  tsunami: string;
  points: P2PObservationPoint[];
  raw?: unknown;
}

export function formatScaleJMA(scale: number): { text: string; color: string; textColor: string } {
  switch (scale) {
    case 10:
      return { text: '1', color: '#60a5fa', textColor: '#ffffff' };
    case 20:
      return { text: '2', color: '#2563eb', textColor: '#ffffff' };
    case 30:
      return { text: '3', color: '#16a34a', textColor: '#ffffff' };
    case 40:
      return { text: '4', color: '#eab308', textColor: '#000000' };
    case 45:
      return { text: '5약', color: '#f97316', textColor: '#ffffff' };
    case 50:
      return { text: '5강', color: '#ea580c', textColor: '#ffffff' };
    case 55:
      return { text: '6약', color: '#dc2626', textColor: '#ffffff' };
    case 60:
      return { text: '6강', color: '#991b1b', textColor: '#ffffff' };
    case 70:
      return { text: '7', color: '#7e22ce', textColor: '#ffffff' };
    default:
      if (scale > 0 && scale < 10) {
        return { text: '1미만', color: '#94a3b8', textColor: '#ffffff' };
      }
      return { text: '-', color: '#64748b', textColor: '#ffffff' };
  }
}

export function formatTsunamiStatus(tsunami: string): { text: string; level: 'none' | 'watch' | 'warning' } {
  switch (tsunami) {
    case 'None':
      return { text: '해일(쓰나미) 우려 없음', level: 'none' };
    case 'NonEffective':
      return { text: '약간의 해수면 변동 가능 (피해 우려 없음)', level: 'none' };
    case 'Watch':
      return { text: '쓰나미 주의보 발령 중', level: 'watch' };
    case 'Warning':
      return { text: '쓰나미 경보 발령 중', level: 'warning' };
    case 'Checking':
      return { text: '쓰나미 영향 여부 조사 중', level: 'watch' };
    default:
      return { text: '쓰나미 정보 없음', level: 'none' };
  }
}

export class P2PQuakeService {
  private ws: WebSocket | null = null;
  private isDestroyed = false;
  private reconnectTimer: number | null = null;
  private listeners: ((event: P2PEarthquakeEvent) => void)[] = [];
  private stationMetas: StationPointMeta[] = [];
  private jmaStations: JMAStationItem[] = [];
  private jmaIndex = new Map<string, { lat: number; lon: number }>();
  private stationToAreaIndex = new Map<string, { code: string; name?: string }>();
  private areaNameToCodeIndex = new Map<string, string>();
  private latestEvents: P2PEarthquakeEvent[] = [];

  constructor(stationMetas?: StationPointMeta[], jmaStations?: JMAStationItem[]) {
    if (stationMetas) {
      this.stationMetas = stationMetas;
    }
    if (jmaStations) {
      this.setJmaStations(jmaStations);
    }
  }

  public setStationMetas(metas: StationPointMeta[]) {
    this.stationMetas = metas;
  }

  public setJmaStations(stations: JMAStationItem[]) {
    this.jmaStations = stations;
    this.jmaIndex.clear();
    this.stationToAreaIndex.clear();
    this.areaNameToCodeIndex.clear();

    for (const s of stations) {
      const lat = typeof s.lat === 'number' ? s.lat : parseFloat(s.lat);
      const lon = typeof s.lon === 'number' ? s.lon : parseFloat(s.lon);
      if (isNaN(lat) || isNaN(lon)) continue;

      const prefName = typeof s.pref === 'object' ? s.pref?.name : s.pref;
      const safePref = (prefName || '').trim();
      const stnName = (s.name || '').trim();
      const cityName = (s.city?.name || '').trim();
      const areaName = (s.area?.name || '').trim();
      const areaCode = (s.area?.code || '').trim();

      const coord = { lat, lon };

      // Exact station name index
      if (safePref && stnName) {
        this.jmaIndex.set(`${safePref}_${stnName}`, coord);
        if (areaCode) this.stationToAreaIndex.set(`${safePref}_${stnName}`, { code: areaCode, name: areaName });
      }
      if (stnName && !this.jmaIndex.has(`_${stnName}`)) {
        this.jmaIndex.set(`_${stnName}`, coord);
        if (areaCode && !this.stationToAreaIndex.has(`_${stnName}`)) {
          this.stationToAreaIndex.set(`_${stnName}`, { code: areaCode, name: areaName });
        }
      }

      // City name index
      if (safePref && cityName && !this.jmaIndex.has(`${safePref}_${cityName}`)) {
        this.jmaIndex.set(`${safePref}_${cityName}`, coord);
        if (areaCode && !this.stationToAreaIndex.has(`${safePref}_${cityName}`)) {
          this.stationToAreaIndex.set(`${safePref}_${cityName}`, { code: areaCode, name: areaName });
        }
      }

      // Area name index
      if (safePref && areaName && !this.jmaIndex.has(`${safePref}_${areaName}`)) {
        this.jmaIndex.set(`${safePref}_${areaName}`, coord);
      }
      if (areaName && !this.jmaIndex.has(`_${areaName}`)) {
        this.jmaIndex.set(`_${areaName}`, coord);
      }

      if (areaName && areaCode && !this.areaNameToCodeIndex.has(areaName)) {
        this.areaNameToCodeIndex.set(areaName, areaCode);
      }
    }

    // If we have existing parsed events, re-resolve coordinates and areaCodes
    if (this.latestEvents.length > 0) {
      for (const ev of this.latestEvents) {
        for (const pt of ev.points) {
          if (!pt.areaCode || (pt.lat === 36.0 && pt.lon === 138.0)) {
            const coords = this.findPointCoordinates(pt.pref, pt.name);
            pt.lat = coords.lat;
            pt.lon = coords.lon;
            const areaInfo = this.findAreaInfo(pt.pref, pt.name);
            if (areaInfo) {
              pt.areaCode = areaInfo.code;
              pt.areaName = areaInfo.name;
            }
          }
        }
      }
      if (this.latestEvents[0]) {
        this.listeners.forEach((cb) => cb(this.latestEvents[0]));
      }
    }
  }

  public onEvent(callback: (event: P2PEarthquakeEvent) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  public getLatestEvents(): P2PEarthquakeEvent[] {
    return this.latestEvents;
  }

  private pollTimer: number | null = null;
  private isWsConnected = false;

  public start() {
    this.isDestroyed = false;
    this.fetchRecentHistory();
    this.connectWebSocket();
    this.startPollingFallback();
  }

  public stop() {
    this.isDestroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
      this.isWsConnected = false;
    }
  }

  private startPollingFallback() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    // Periodic sync every 25 seconds as backup in case WS is interrupted
    const pollLoop = async () => {
      if (this.isDestroyed) return;
      try {
        await this.fetchRecentHistory(false);
      } catch (err) {}
      
      if (!this.isDestroyed) {
        this.pollTimer = window.setTimeout(pollLoop, 25000);
      }
    };
    this.pollTimer = window.setTimeout(pollLoop, 25000);
  }

  public destroy() {
    this.stop();
  }

  public async fetchRecentHistory(notifyFirst = true): Promise<P2PEarthquakeEvent[]> {
    try {
      const resp = await fetch('https://api.p2pquake.net/v2/history?codes=551&limit=30');
      if (!resp.ok) {
        return [];
      }
      const rawList = await resp.json();
      if (!Array.isArray(rawList)) return [];

      const parsedList: P2PEarthquakeEvent[] = [];
      const seenEvents = new Set<string>();
      
      for (const item of rawList) {
        if (item.code === 551) {
          const parsed = this.parseCode551(item);
          if (parsed && !seenEvents.has(parsed.eventId)) {
            seenEvents.add(parsed.eventId);
            parsedList.push(parsed);
          }
        }
      }

      if (parsedList.length > 0) {
        const prevTopId = this.latestEvents[0]?.id;
        const newTopId = parsedList[0]?.id;
        this.latestEvents = parsedList.slice(0, 10);
        if (notifyFirst || prevTopId !== newTopId) {
          this.listeners.forEach((cb) => cb(parsedList[0]));
        }
      }
      return this.latestEvents;
    } catch {
      // Quiet fallback
      return [];
    }
  }

  private connectWebSocket() {
    if (this.isDestroyed) return;

    try {
      if (this.ws) {
        try {
          this.ws.onclose = null;
          this.ws.onerror = null;
          this.ws.close();
        } catch {
          // ignore
        }
        this.ws = null;
      }

      this.ws = new WebSocket('wss://api.p2pquake.net/v2/ws');

      this.ws.onopen = () => {
        this.isWsConnected = true;
      };

      this.ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          // Only handle Code 551 (Earthquake info)
          if (data && data.code === 551) {
            const parsed = this.parseCode551(data);
            if (parsed) {
              this.latestEvents = [parsed, ...this.latestEvents.filter(e => e.eventId !== parsed.eventId)].slice(0, 10);
              this.listeners.forEach((cb) => cb(parsed));
            }
          }
        } catch {
          // ignore parsing error
        }
      };

      this.ws.onerror = () => {
        // Benign error event (e.g. 10m auto-disconnect or connection reset)
        this.isWsConnected = false;
      };

      this.ws.onclose = () => {
        this.isWsConnected = false;
        if (!this.isDestroyed) {
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = window.setTimeout(() => {
            this.connectWebSocket();
          }, 8000);
        }
      };
    } catch {
      this.isWsConnected = false;
      if (!this.isDestroyed) {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = window.setTimeout(() => {
          this.connectWebSocket();
        }, 10000);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseCode551(item: any): P2PEarthquakeEvent | null {
    try {
      const eq = item?.earthquake;
      if (!eq) return null;

      const hypocenter = eq.hypocenter || {};
      const maxScale = typeof eq.maxScale === 'number' ? eq.maxScale : 0;
      const scaleInfo = formatScaleJMA(maxScale);
      const tsunamiInfo = formatTsunamiStatus(eq.domesticTsunami || 'None');

      const points: P2PObservationPoint[] = [];
      if (Array.isArray(item.points)) {
        for (const p of item.points) {
          if (!p) continue;
          const pref = String(p.pref || '').trim();
          const name = String(p.name || p.addr || '').trim();
          const ptScale = typeof p.scale === 'number' ? p.scale : 0;
          const ptScaleInfo = formatScaleJMA(ptScale);
          const coords = this.findPointCoordinates(pref, name);
          const areaInfo = this.findAreaInfo(pref, name);

          points.push({
            pref,
            name: name || pref,
            scale: ptScale,
            scaleStr: ptScaleInfo.text,
            color: ptScaleInfo.color,
            lat: coords.lat,
            lon: coords.lon,
            areaCode: areaInfo?.code,
            areaName: areaInfo?.name
          });
        }
      }

      // Sort points by intensity descending
      points.sort((a, b) => b.scale - a.scale);

      return {
        id: String(item._id || item.id || `eq_${Date.now()}`),
        eventId: String(eq.time || item.time || new Date().toISOString()),
        time: String(item.time || eq.time || new Date().toISOString()),
        issueType: String(item.issue?.type || 'ScaleAndDestination'),
        hypocenter: {
          name: String(hypocenter.name || '진원지 불명'),
          latitude: typeof hypocenter.latitude === 'number' ? hypocenter.latitude : 0,
          longitude: typeof hypocenter.longitude === 'number' ? hypocenter.longitude : 0,
          depth: typeof hypocenter.depth === 'number' ? hypocenter.depth : -1,
          magnitude: typeof hypocenter.magnitude === 'number' ? hypocenter.magnitude : -1
        },
        maxScale,
        maxScaleStr: scaleInfo.text,
        maxScaleColor: scaleInfo.color,
        tsunami: tsunamiInfo.text,
        points,
        raw: item
      };
    } catch (err) {
      console.warn('Error parsing Code 551 item:', err);
      return null;
    }
  }

  private findPointCoordinates(pref: string, name: string): { lat: number; lon: number } {
    const safePref = (pref || '').trim();
    const safeName = (name || '').trim();

    // 1. Check O(1) JMA index
    if (safePref && safeName) {
      const direct = this.jmaIndex.get(`${safePref}_${safeName}`);
      if (direct) return direct;
    }
    if (safeName) {
      const byName = this.jmaIndex.get(`_${safeName}`);
      if (byName) return byName;
    }

    // 2. Substring & Fuzzy matching in jmaStations
    if (this.jmaStations.length > 0) {
      const match = this.jmaStations.find((s) => {
        const sPref = typeof s.pref === 'object' ? s.pref?.name : s.pref;
        if (sPref && safePref && !sPref.includes(safePref) && !safePref.includes(sPref)) {
          return false;
        }
        if (s.name && safeName) {
          if (s.name.length <= 1) {
            if (s.name === safeName) return true;
          } else {
            if (s.name.includes(safeName) || safeName.includes(s.name)) return true;
          }
        }
        if (s.city?.name && safeName) {
          if (s.city.name.length <= 1) {
            if (s.city.name === safeName) return true;
          } else {
            if (s.city.name === safeName || safeName.includes(s.city.name)) return true;
          }
        }
        if (s.area?.name && safeName && (s.area.name === safeName || safeName.includes(s.area.name))) {
          return true;
        }
        return false;
      });

      if (match) {
        const lat = typeof match.lat === 'number' ? match.lat : parseFloat(match.lat);
        const lon = typeof match.lon === 'number' ? match.lon : parseFloat(match.lon);
        if (!isNaN(lat) && !isNaN(lon)) {
          return { lat, lon };
        }
      }

      // Fallback by prefecture from jmaStations
      if (safePref) {
        const prefMatch = this.jmaStations.find((s) => {
          const sPref = typeof s.pref === 'object' ? s.pref?.name : s.pref;
          return sPref && (sPref.includes(safePref) || safePref.includes(sPref));
        });
        if (prefMatch) {
          const lat = typeof prefMatch.lat === 'number' ? prefMatch.lat : parseFloat(prefMatch.lat);
          const lon = typeof prefMatch.lon === 'number' ? prefMatch.lon : parseFloat(prefMatch.lon);
          if (!isNaN(lat) && !isNaN(lon)) {
            return { lat, lon };
          }
        }
      }
    }

    // 3. Fallback to NIED stationMetas if available
    if (this.stationMetas && this.stationMetas.length > 0) {
      const cleanName = safeName.replace(/^(도|부|현|시|구|군|읍|면|동)/, '');
      const match = this.stationMetas.find((m) => {
        if (!m) return false;
        const mRegion = m.Region || '';
        const mName = m.Name || '';
        const regionMatch = safePref ? (mRegion.includes(safePref) || safePref.includes(mRegion)) : true;
        const nameMatch = safeName ? (mName.includes(safeName) || safeName.includes(mName) || (cleanName && mName.includes(cleanName))) : false;
        return regionMatch && nameMatch;
      });

      if (match && match.Location && typeof match.Location.latitude === 'number' && typeof match.Location.longitude === 'number') {
        return { lat: match.Location.latitude, lon: match.Location.longitude };
      }

      if (safePref) {
        const prefMatch = this.stationMetas.find((m) => {
          if (!m) return false;
          const mRegion = m.Region || '';
          return mRegion.includes(safePref) || safePref.includes(mRegion);
        });
        if (prefMatch && prefMatch.Location && typeof prefMatch.Location.latitude === 'number' && typeof prefMatch.Location.longitude === 'number') {
          return { lat: prefMatch.Location.latitude, lon: prefMatch.Location.longitude };
        }
      }
    }

    return { lat: 0, lon: 0 };
  }

  public findAreaInfo(pref: string, name: string): { code: string; name?: string } | null {
    const safePref = (pref || '').trim();
    const safeName = (name || '').trim();

    // 1. Direct index lookup
    if (safePref && safeName) {
      const direct = this.stationToAreaIndex.get(`${safePref}_${safeName}`);
      if (direct) return direct;
    }
    if (safeName) {
      const byName = this.stationToAreaIndex.get(`_${safeName}`);
      if (byName) return byName;
      const byAreaNameCode = this.areaNameToCodeIndex.get(safeName);
      if (byAreaNameCode) return { code: byAreaNameCode, name: safeName };
    }

    // 2. Fuzzy match in jmaStations
    if (this.jmaStations.length > 0) {
      const match = this.jmaStations.find((s) => {
        const sPref = typeof s.pref === 'object' ? s.pref?.name : s.pref;
        if (sPref && safePref && !sPref.includes(safePref) && !safePref.includes(sPref)) {
          return false;
        }
        if (s.name && safeName) {
          if (s.name.length <= 1) {
            if (s.name === safeName) return true;
          } else {
            if (s.name.includes(safeName) || safeName.includes(s.name)) return true;
          }
        }
        if (s.city?.name && safeName) {
          if (s.city.name.length <= 1) {
            if (s.city.name === safeName) return true;
          } else {
            if (s.city.name === safeName || safeName.includes(s.city.name)) return true;
          }
        }
        if (s.area?.name && safeName && (s.area.name === safeName || safeName.includes(s.area.name))) {
          return true;
        }
        return false;
      });
      if (match && match.area?.code) {
        return { code: match.area.code, name: match.area.name };
      }
    }

    // 3. Match against known area names
    for (const [aName, aCode] of this.areaNameToCodeIndex.entries()) {
      if (safeName.includes(aName) || aName.includes(safeName)) {
        return { code: aCode, name: aName };
      }
    }

    return null;
  }
}
