import { useState, useEffect } from 'react';

export interface KMAEarthquakeEvent {
  time: string;
  lat: number;
  lon: number;
  location: string;
  magnitude: number;
  depth: string;
  raw: string[];
}

export function useKMAEarthquake(authKey: string) {
  const [kmaEvent, setKmaEvent] = useState<KMAEarthquakeEvent | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authKey) {
      setError('API Key is required');
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    let timerId: number | undefined;

    const fetchKMA = async () => {
      try {
        const response = await fetch(`/api/kma/earthquake?authKey=${encodeURIComponent(authKey)}`);
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Error ${response.status}`);
        }
        const data = await response.json();
        
        if (isMounted) {
          if (data.event) {
            setKmaEvent(data.event);
          }
          if (data.rawText) {
            setRawText(data.rawText);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
          // Poll every 60 seconds
          timerId = window.setTimeout(fetchKMA, 60000);
        }
      }
    };

    fetchKMA();

    return () => {
      isMounted = false;
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
    };
  }, [authKey]);

  return { kmaEvent, rawText, loading, error };
}
