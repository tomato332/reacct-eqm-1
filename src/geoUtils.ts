/**
 * 지리학적 연산 및 GeoJSON Circle 생성 유틸리티
 */

/**
 * 대권거리 및 방향각을 고려하여 구면(WGS84) 상의 완벽한 원 좌표 배열을 생성
 * @param center [longitude, latitude]
 * @param radiusKm 반경 (km)
 * @param points 다각형 버텍스 수 (기본 64)
 */
export function createGeodesicCircle(
  center: [number, number],
  radiusKm: number,
  points = 64
): [number, number][] {
  if (radiusKm <= 0) return [];
  const [centerLon, centerLat] = center;
  const coords: [number, number][] = [];
  const rad = Math.PI / 180;
  const R = 6371.0088; // 지구 평균 반경 (km)

  const dByR = radiusKm / R;
  const lat1 = centerLat * rad;
  const lon1 = centerLon * rad;

  for (let i = 0; i <= points; i++) {
    const bearing = (i * 360 / points) * rad;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(dByR) +
      Math.cos(lat1) * Math.sin(dByR) * Math.cos(bearing)
    );
    const lon2 = lon1 + Math.atan2(
      Math.sin(bearing) * Math.sin(dByR) * Math.cos(lat1),
      Math.cos(dByR) - Math.sin(lat1) * Math.sin(lat2)
    );
    coords.push([lon2 / rad, lat2 / rad]);
  }
  return coords;
}

/**
 * P파 및 S파 파면 Polygon/Line GeoJSON 생성
 */
export function buildWaveGeoJSON(
  epicenter: [number, number] | null,
  pRadiusKm: number,
  sRadiusKm: number
) {
  const features: any[] = [];

  if (!epicenter) {
    return {
      type: 'FeatureCollection',
      features: []
    };
  }

  // P파 원 (청록색 / 블루)
  if (pRadiusKm > 0) {
    const pCoords = createGeodesicCircle(epicenter, pRadiusKm, 64);
    if (pCoords.length > 0) {
      features.push({
        type: 'Feature',
        properties: {
          waveType: 'P',
          radiusKm: pRadiusKm
        },
        geometry: {
          type: 'Polygon',
          coordinates: [pCoords]
        }
      });
    }
  }

  // S파 원 (주황색 / 빨간색)
  if (sRadiusKm > 0) {
    const sCoords = createGeodesicCircle(epicenter, sRadiusKm, 64);
    if (sCoords.length > 0) {
      features.push({
        type: 'Feature',
        properties: {
          waveType: 'S',
          radiusKm: sRadiusKm
        },
        geometry: {
          type: 'Polygon',
          coordinates: [sCoords]
        }
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features
  };
}

/**
 * 진앙지 마커(X) GeoJSON 생성
 */
export function buildEpicenterGeoJSON(epicenter: [number, number] | null, info?: any) {
  if (!epicenter) {
    return {
      type: 'FeatureCollection',
      features: []
    };
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          ...info
        },
        geometry: {
          type: 'Point',
          coordinates: epicenter
        }
      }
    ]
  };
}
