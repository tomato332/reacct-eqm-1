import React from 'react';
import { HoverInfo } from '../types';
import styles from '../App.module.css';

interface InfoBadgeProps {
  hoverInfo: HoverInfo;
}

export const InfoBadge: React.FC<InfoBadgeProps> = ({ hoverInfo }) => {
  // 마우스 커서 위치가 있는 경우 커서 옆 플로팅 툴팁으로 렌더링
  if (typeof hoverInfo.x === 'number' && typeof hoverInfo.y === 'number') {
    // 뷰포트 크기 기반 오프셋 조정 (화면 밖으로 나가지 않도록 방지)
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

    let left = hoverInfo.x + 16;
    let top = hoverInfo.y + 16;

    // 우측 경계 보호
    if (left + 280 > windowWidth) {
      left = Math.max(10, hoverInfo.x - 290);
    }
    // 하단 경계 보호
    if (top + 100 > windowHeight) {
      top = Math.max(10, hoverInfo.y - 80);
    }

    return (
      <div
        className={styles.cursorTooltip}
        style={{
          left: `${left}px`,
          top: `${top}px`,
        }}
      >
        <div className={styles.tooltipHeader}>
          {hoverInfo.scaleColor && (
            <span
              className={styles.tooltipScaleDot}
              style={{ backgroundColor: hoverInfo.scaleColor }}
            />
          )}
          <span className={styles.tooltipTitle}>{hoverInfo.title}</span>
        </div>
        {hoverInfo.subtitle && (
          <div className={styles.tooltipSubtitle}>{hoverInfo.subtitle}</div>
        )}
      </div>
    );
  }

  // 마우스 좌표가 없는 경우(예: 목록 클릭 선택) 하단 플로팅 배너로 표시
  return (
    <div className={styles.bottomInfoBanner}>
      <div className={styles.tooltipHeader}>
        {hoverInfo.scaleColor && (
          <span
            className={styles.tooltipScaleDot}
            style={{ backgroundColor: hoverInfo.scaleColor }}
          />
        )}
        <span className={styles.tooltipTitle}>{hoverInfo.title}</span>
      </div>
      {hoverInfo.subtitle && (
        <div className={styles.tooltipSubtitle}>{hoverInfo.subtitle}</div>
      )}
    </div>
  );
};
