/**
 * 일본 열도 전역이 화면 종횡비에 맞춰 최적으로 프레이밍되도록 바운드 기반 줌을 지원합니다.
 */
export const JAPAN_BOUNDS: [[number, number], [number, number]] = [
  [127.5, 29.5], // Southwest (큐슈 남부 및 한반도 연안)
  [147.0, 46.0]  // Northeast (홋카이도 동북단)
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fitJapanBounds(map: any, animate = true) {
  if (!map) return;
  map.fitBounds(JAPAN_BOUNDS, {
    padding: { top: 35, bottom: 35, left: 35, right: 35 },
    duration: animate ? 800 : 0,
    essential: true
  });
}

export function calculateBaseZoom(): number {
  return 5.1;
}

