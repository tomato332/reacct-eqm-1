/**
 * 일본 기상청(JMA) JMA2001A 지진파 주시표 (Travel Time Table) 및 2차원 보간 모듈
 */

export interface TravelTimeResult {
  pTime: number;
  sTime: number;
}

interface RawTableRow {
  depthKm: number;
  distanceKm: number;
  pTimeSec: number;
  sTimeSec: number;
}

interface JmaTableData {
  depths: number[]; // 정렬된 깊이 목록 (km)
  distances: number[]; // 정렬된 진앙거리 목록 (km)
  pGrid: Float64Array[]; // pGrid[depthIdx][distIdx]
  sGrid: Float64Array[]; // sGrid[depthIdx][distIdx]
}

let jmaTable: JmaTableData | null = null;
let loadPromise: Promise<boolean> | null = null;
let tableLoadError: string | null = null;

export function getJmaLoadError(): string | null {
  return tableLoadError;
}

/**
 * JMA2001A 주시표 JSON 로드 및 고속 격자 인덱싱
 */
export async function loadJmaTravelTimeTable(url = '/tjma2001h_00000.json'): Promise<boolean> {
  if (jmaTable) return true;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      tableLoadError = null;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`HTTP error! status: ${resp.status}`);
      }
      const data = await resp.json();
      const rows: RawTableRow[] = data.rows || [];

      if (!rows.length) {
        throw new Error('JMA2001A 주시표 데이터 행이 비어 있습니다.');
      }

      const depthSet = new Set<number>();
      const distSet = new Set<number>();

      for (let i = 0; i < rows.length; i++) {
        depthSet.add(rows[i].depthKm);
        distSet.add(rows[i].distanceKm);
      }

      const depths = Array.from(depthSet).sort((a, b) => a - b);
      const distances = Array.from(distSet).sort((a, b) => a - b);

      const depthIndexMap = new Map<number, number>();
      depths.forEach((d, idx) => depthIndexMap.set(d, idx));

      const distIndexMap = new Map<number, number>();
      distances.forEach((r, idx) => distIndexMap.set(r, idx));

      const nDepths = depths.length;
      const nDists = distances.length;

      const pGrid: Float64Array[] = [];
      const sGrid: Float64Array[] = [];

      for (let i = 0; i < nDepths; i++) {
        pGrid.push(new Float64Array(nDists));
        sGrid.push(new Float64Array(nDists));
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const dIdx = depthIndexMap.get(row.depthKm);
        const rIdx = distIndexMap.get(row.distanceKm);
        if (dIdx !== undefined && rIdx !== undefined) {
          pGrid[dIdx][rIdx] = row.pTimeSec;
          sGrid[dIdx][rIdx] = row.sTimeSec;
        }
      }

      jmaTable = {
        depths,
        distances,
        pGrid,
        sGrid
      };

      return true;
    } catch (err: any) {
      const errMsg = err?.message || 'JMA2001A 주시표를 로드하지 못했습니다.';
      tableLoadError = errMsg;
      console.error('Failed to load JMA2001A travel time table:', err);
      return false;
    }
  })();

  return loadPromise;
}

export function isJmaTableLoaded(): boolean {
  return jmaTable !== null;
}

/**
 * 정렬된 배열에서 값 x의 하한 인덱스 i (arr[i] <= x <= arr[i+1]) 탐색
 */
function findBoundingIndices(arr: number[], x: number): [number, number, number] {
  const n = arr.length;
  if (x <= arr[0]) return [0, 0, 0];
  if (x >= arr[n - 1]) return [n - 1, n - 1, 0];

  let low = 0;
  let high = n - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (arr[mid] <= x) {
      if (mid === n - 1 || arr[mid + 1] > x) {
        const x0 = arr[mid];
        const x1 = arr[mid + 1];
        const ratio = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
        return [mid, mid + 1, ratio];
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return [0, 1, 0];
}

/**
 * JMA 주시표 메타데이터 및 격자 정보 반환 (UI 상태 표시 및 검증용)
 */
export function getJmaTableInfo() {
  if (!jmaTable) return null;
  return {
    depthCount: jmaTable.depths.length,
    minDepth: jmaTable.depths[0],
    maxDepth: jmaTable.depths[jmaTable.depths.length - 1],
    distCount: jmaTable.distances.length,
    minDist: jmaTable.distances[0],
    maxDist: jmaTable.distances[jmaTable.distances.length - 1],
    elevation: 0 // 표고 0m
  };
}

/**
 * JMA2001A 2차원(진앙거리 Δ, 진원 깊이 H) 쌍선형(Bilinear) 보간을 통한 P/S파 주시시간 계산
 * @param epicentralDistKm 진앙거리 (km)
 * @param depthKm 진원 깊이 (km)
 */
export function getJmaTravelTime(epicentralDistKm: number, depthKm: number): TravelTimeResult {
  const dist = Math.max(0, epicentralDistKm);
  const depth = Math.max(0, depthKm);

  if (!jmaTable) {
    console.warn(`[JMA2001A] 주시표가 로드되지 않은 상태에서 getJmaTravelTime(dist=${dist.toFixed(1)}, depth=${depth.toFixed(1)})이 호출되었습니다. 임시 모델(P:6.0, S:3.5)이 사용됩니다.`);
    // fallback: 평균 지각 속도 모델 (P=6.0km/s, S=3.5km/s)
    const hypoDist = Math.sqrt(dist * dist + depth * depth);
    return {
      pTime: hypoDist / 6.0,
      sTime: hypoDist / 3.5
    };
  }

  const { depths, distances, pGrid, sGrid } = jmaTable;

  const [d0Idx, d1Idx, dRatio] = findBoundingIndices(depths, depth);
  const [r0Idx, r1Idx, rRatio] = findBoundingIndices(distances, dist);

  // 4점 추출
  // Q00 = (d0, r0), Q01 = (d0, r1)
  // Q10 = (d1, r0), Q11 = (d1, r1)
  const p00 = pGrid[d0Idx][r0Idx];
  const p01 = pGrid[d0Idx][r1Idx];
  const p10 = pGrid[d1Idx][r0Idx];
  const p11 = pGrid[d1Idx][r1Idx];

  const s00 = sGrid[d0Idx][r0Idx];
  const s01 = sGrid[d0Idx][r1Idx];
  const s10 = sGrid[d1Idx][r0Idx];
  const s11 = sGrid[d1Idx][r1Idx];

  // r방향 1차 보간
  const pD0 = p00 + (p01 - p00) * rRatio;
  const pD1 = p10 + (p11 - p10) * rRatio;

  const sD0 = s00 + (s01 - s00) * rRatio;
  const sD1 = s10 + (s11 - s10) * rRatio;

  // d방향 최종 보간
  const pTime = pD0 + (pD1 - pD0) * dRatio;
  const sTime = sD0 + (sD1 - sD0) * dRatio;

  return {
    pTime: Math.max(0, pTime),
    sTime: Math.max(0, sTime)
  };
}

/**
 * 경과 시간 t(초)와 깊이 H(km)가 주어졌을 때 지표면에 도달한 파면의 진앙 반경 Δ(km) 역산
 * (지도 상의 P파 / S파 전파 링 반지름 렌더링에 사용)
 */
export function getWaveSurfaceRadius(
  elapsedSec: number,
  depthKm: number,
  wave: 'P' | 'S'
): number {
  if (elapsedSec <= 0) return 0;

  if (!jmaTable) {
    const v = wave === 'P' ? 6.0 : 3.5;
    const hypoDist = elapsedSec * v;
    if (hypoDist <= depthKm) return 0;
    return Math.sqrt(hypoDist * hypoDist - depthKm * depthKm);
  }

  const { depths, distances, pGrid, sGrid } = jmaTable;
  const [d0Idx, d1Idx, dRatio] = findBoundingIndices(depths, Math.max(0, depthKm));
  const grid = wave === 'P' ? pGrid : sGrid;

  // 깊이 H에서의 진앙거리별 주시시간 배열 합성 (1D 보간)
  // 진앙거리 r=0에서의 지표 도달 시간 (Epicentral Arrival Time)
  const t0_0 = grid[d0Idx][0];
  const t0_1 = grid[d1Idx][0];
  const tAtEpicenter = t0_0 + (t0_1 - t0_0) * dRatio;

  // 지진파가 아직 지표면에 도달하지 못함 (깊은 진원에서 직상부 지표까지 올라오는 시간 미만)
  if (elapsedSec < tAtEpicenter) {
    return 0;
  }

  // 이진 탐색으로 elapsedSec에 대응하는 진앙거리 찾기
  let low = 0;
  let high = distances.length - 1;

  const getTimeAtDist = (rIdx: number) => {
    const v0 = grid[d0Idx][rIdx];
    const v1 = grid[d1Idx][rIdx];
    return v0 + (v1 - v0) * dRatio;
  };

  const maxT = getTimeAtDist(high);
  if (elapsedSec >= maxT) {
    // 표의 최대 거리(2000km) 초과 시 평균 속도로 외삽
    const vLast = wave === 'P' ? 8.2 : 4.6;
    return distances[high] + (elapsedSec - maxT) * vLast;
  }

  while (low <= high) {
    const mid = (low + high) >> 1;
    const tMid = getTimeAtDist(mid);

    if (tMid <= elapsedSec) {
      if (mid === distances.length - 1) return distances[mid];
      const tNext = getTimeAtDist(mid + 1);
      if (tNext > elapsedSec) {
        const r0 = distances[mid];
        const r1 = distances[mid + 1];
        const ratio = (elapsedSec - tMid) / (tNext - tMid);
        return r0 + (r1 - r0) * ratio;
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return 0;
}

/**
 * 지진 규모(Magnitude) 및 진원 깊이(depthKm)에 따른 유효 지진파 최대 도달 한계 거리(km) 계산
 * 단순하고 직관적인 지반 감쇠 공식 적용 (M2급 ~ M8급)
 * @param magnitude 지진 규모 (M)
 * @param depthKm 진원 깊이 (km)
 */
export function getMaxWaveDistanceKm(magnitude: number, depthKm: number = 10): number {
  const m = Math.max(1.0, magnitude || 3.0);
  const d = Math.max(0, depthKm);

  // 기본 진앙 감쇠 거리 계산 (km)
  // M2.0: ~45km
  // M3.0: ~120km
  // M4.0: ~280km
  // M5.0: ~550km
  // M6.0: ~950km
  // M7.0: ~1500km
  // M8.0+: ~2200km
  let baseLimitKm = Math.pow(10, 0.42 * m + 0.82);

  // 깊은 심발지진(Depth > 100km)인 경우 지표 도달 시 감쇠 감안
  if (d > 100) {
    baseLimitKm = Math.max(baseLimitKm * 0.8, d * 1.2);
  }

  // 30km ~ 2500km 범위 클램핑
  return Math.min(Math.max(baseLimitKm, 30), 2500);
}
