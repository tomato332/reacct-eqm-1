export function haversineDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * 일본 기상청(JMA) 공인 계측진도(Instrumental Intensity) -> 진도 계급(Shindo Scale) 변환 공식
 * 
 * JMA 공식 기준:
 * I < 0.5            : 0
 * 0.5 <= I < 1.5     : 1
 * 1.5 <= I < 2.5     : 2
 * 2.5 <= I < 3.5     : 3
 * 3.5 <= I < 4.5     : 4
 * 4.5 <= I < 5.0     : 5약 (5-)
 * 5.0 <= I < 5.5     : 5강 (5+)
 * 5.5 <= I < 6.0     : 6약 (6-)
 * 6.0 <= I < 6.5     : 6강 (6+)
 * 6.5 <= I           : 7
 */
export function getJindoString(jindo: number | null): string {
  if (jindo === null || isNaN(jindo)) return "-";
  if (jindo < 0.5) return "0";
  if (jindo < 1.5) return "1";
  if (jindo < 2.5) return "2";
  if (jindo < 3.5) return "3";
  if (jindo < 4.5) return "4";
  if (jindo < 5.0) return "5-";
  if (jindo < 5.5) return "5+";
  if (jindo < 6.0) return "6-";
  if (jindo < 6.5) return "6+";
  return "7";
}

/**
 * 사용자 친화적인 진도 계급 한국어/공식 표기 반환 (예: 震度0, 震度1, 5약, 5강 등)
 */
export function getJindoDetailedName(jindo: number | null): string {
  if (jindo === null || isNaN(jindo)) return "관측 없음";
  if (jindo < 0.5) return "진도 0";
  if (jindo < 1.5) return "진도 1";
  if (jindo < 2.5) return "진도 2";
  if (jindo < 3.5) return "진도 3";
  if (jindo < 4.5) return "진도 4";
  if (jindo < 5.0) return "진도 5약";
  if (jindo < 5.5) return "진도 5강";
  if (jindo < 6.0) return "진도 6약";
  if (jindo < 6.5) return "진도 6강";
  return "진도 7";
}

// 3-프레임 미디언 필터
export class NoiseFilterService {
  applyMedianFilter(stn: any, newJindo: number): number {
    if (!stn.rawJindoHistory) stn.rawJindoHistory = [];
    stn.rawJindoHistory.push(newJindo);
    if (stn.rawJindoHistory.length > 3) {
      stn.rawJindoHistory.shift();
    }
    
    if (stn.rawJindoHistory.length < 3) {
      return newJindo;
    }
    
    const sorted = [...stn.rawJindoHistory].sort((a, b) => a - b);
    return sorted[1]; // 중앙값
  }
}
