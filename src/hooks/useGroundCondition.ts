import { useState, useEffect } from 'react';

export interface GroundCondition {
  AVS: string;
  ARV: string;
  JNAME: string;
  meshcode: string;
}

export function useGroundCondition(lat?: number, lon?: number) {
  const [groundData, setGroundData] = useState<GroundCondition | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!lat || !lon) {
      setGroundData(null);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const fetchJshis = async () => {
      try {
        const url = `https://www.j-shis.bosai.go.jp/map/api/sstrct/V2/meshinfo.geojson?position=${lon},${lat}&epsg=4326`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('J-SHIS API error');
        
        const data = await response.json();
        if (isMounted && data.features && data.features.length > 0) {
          setGroundData(data.features[0].properties);
        }
      } catch (err) {
        console.error('Failed to fetch ground condition:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    // To prevent spamming the API on every slight coordinate change, 
    // we only fetch if the coordinates are stable for a moment (or we just fetch directly if it's based on top station which changes less frequently)
    fetchJshis();

    return () => {
      isMounted = false;
    };
  }, [lat, lon]);

  return { groundData, loading };
}
