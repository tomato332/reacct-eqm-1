import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= MOBILE_BREAKPOINT;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT || mediaQuery.matches);
    };

    checkIsMobile();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', checkIsMobile);
    } else {
      // Fallback for older browsers
      window.addEventListener('resize', checkIsMobile);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', checkIsMobile);
      } else {
        window.removeEventListener('resize', checkIsMobile);
      }
    };
  }, []);

  return isMobile;
}
