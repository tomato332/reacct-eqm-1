import { TopStationItem } from './QuakeDetectService';
import { WolfxEEWData } from './WolfxEEWService';
import { P2PEarthquakeEvent } from './P2PQuakeService';

export type DataSourceType = 'kmoni' | 'yahoo' | 'p2pquake';

export interface HoverInfo {
  type: 'prefecture' | 'station' | 'p2p_point' | 'p2p_hypocenter';
  title: string;
  subtitle?: string;
  extra?: string;
  x?: number;
  y?: number;
  scaleColor?: string;
}

export interface IGeoProvider {
  getWorldGeoUrl(): string;
  getJapanTopoUrl(): string;
  getIntensityPointsUrl(): string;
}

export interface MapRendererController {
  setDataSource: (source: DataSourceType) => void;
  getDataSource: () => DataSourceType;
  setP2PEvent: (event: P2PEarthquakeEvent | null) => void;
  setKMAEvent: (event: any | null) => void;
  cleanup: () => void;
}

export interface WaveStats {
  elapsedSec: number;
  pRadius: number;
  sRadius: number;
}

export interface DetectionAlertInfo {
  id: string;
  source: DataSourceType;
  sourceName: string;
  jindo: number;
  jindoStr: string;
  jindoFormatted: string;
  color: string;
  timestamp: number;
  timeStr: string;
  stationName?: string;
  region?: string;
  center?: [number, number];
  isNewEvent?: boolean;
}

