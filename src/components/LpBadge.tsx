import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../App.module.css';

/**
 * 장주기 지진동(lmoni) 계급 배지 — 계급 1 이상 관측점이 있을 때 지도 위에 표시.
 * MapRenderer가 'eqm-lp-max' 커스텀 이벤트로 최대 계급을 발행한다.
 */
export const LpBadge: React.FC = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<{ maxCls: number; ts: number } | null>(null);
  const lastTsRef = useRef(0);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLp = (e: any) => {
      const { maxCls, ts } = e.detail ?? {};
      lastTsRef.current = ts ?? Date.now();
      setState({ maxCls: maxCls ?? 0, ts: lastTsRef.current });
    };
    window.addEventListener('eqm-lp-max', onLp);
    // 데이터가 15초 이상 안 오면 배지를 숨긴다 (수신 두절 시 잔상 방지)
    const timer = setInterval(() => {
      setState((prev) => (prev && Date.now() - prev.ts > 15000 ? null : prev));
    }, 1000);
    return () => {
      window.removeEventListener('eqm-lp-max', onLp);
      clearInterval(timer);
    };
  }, []);

  if (!state || state.maxCls < 1) return null;

  return (
    <div className={styles.lpBadge} role="status">
      {t('lpBadge.title')} <span className={styles.lpBadgeClass}>{state.maxCls}</span>
    </div>
  );
};
