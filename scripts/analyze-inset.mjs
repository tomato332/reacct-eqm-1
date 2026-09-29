import fs from 'fs';
const stations = JSON.parse(fs.readFileSync('public/intensity-points-v1.json', 'utf-8'));
const all = stations.filter(s => s.Point && !s.IsSuspended);

const lin = (pts) => {
  const n = pts.length;
  let sx = 0, slon = 0, sxx = 0, sxlon = 0, sy = 0, slat = 0, syy = 0, sylat = 0;
  for (const s of pts) {
    const { x, y } = s.Point;
    sx += x; slon += s.Location.longitude; sxx += x * x; sxlon += x * s.Location.longitude;
    sy += y; slat += s.Location.latitude; syy += y * y; sylat += y * s.Location.latitude;
  }
  const aX = (sxlon - sx * slon / n) / (sxx - sx * sx / n);
  const bX = slon / n - aX * sx / n;
  const aY = (sylat - sy * slat / n) / (syy - sy * sy / n);
  const bY = slat / n - aY * sy / n;
  return { aX, bX, aY, bY };
};

// 본토(남서제도 제외: lon<129.5 && lat<30.5)
const mainland = all.filter(s => !(s.Location.longitude < 129.5 && s.Location.latitude < 30.5));
const fM = lin(mainland);
const rM = mainland.map(s => Math.hypot(
  s.Location.longitude - (fM.aX * s.Point.x + fM.bX),
  s.Location.latitude - (fM.aY * s.Point.y + fM.bY)));
console.log(`본토(${mainland.length}): lon=${fM.aX.toFixed(6)}*x+${fM.bX.toFixed(4)}, lat=${fM.aY.toFixed(6)}*y+${fM.bY.toFixed(4)}  RMS=${Math.sqrt(rM.reduce((a, v) => a + v ** 2, 0) / rM.length).toFixed(4)}° max=${Math.max(...rM).toFixed(4)}°`);

// 인셋(오키나와+아마미)
const inset = all.filter(s => s.Location.longitude < 129.5 && s.Location.latitude < 30.5);
console.log(`인셋 ${inset.length}개:`, inset.map(s => `${s.Region} ${s.Name}`).join(', '));
const fI = lin(inset);
const rI = inset.map(s => Math.hypot(
  s.Location.longitude - (fI.aX * s.Point.x + fI.bX),
  s.Location.latitude - (fI.aY * s.Point.y + fI.bY)));
console.log(`인셋: lon=${fI.aX.toFixed(6)}*x+${fI.bX.toFixed(4)}, lat=${fI.aY.toFixed(6)}*y+${fI.bY.toFixed(4)}  RMS=${Math.sqrt(rI.reduce((a, v) => a + v ** 2, 0) / rI.length).toFixed(4)}° max=${Math.max(...rI).toFixed(4)}°`);

// 규칙 검증: 본토 집합에 인셋이 섞였는지, 인셋에 본토가 섞였는지
const badM = mainland.filter((s, i) => rM[i] > 0.25);
console.log(`본토 회귀에서 벗어나는 관측소(${badM.length}):`, badM.map(s => `${s.Region} ${s.Name}`).join(', '));

// 최종 상수 출력 (코드 붙여넣기용)
console.log('\n// 코드용 상수');
console.log(`MAIN: lonPerPx=${fM.aX.toFixed(7)}, lon0=${fM.bX.toFixed(4)}, latPerPx=${fM.aY.toFixed(7)}, lat0=${fM.bY.toFixed(4)}`);
console.log(`INSET: lonPerPx=${fI.aX.toFixed(7)}, lon0=${fI.bX.toFixed(4)}, latPerPx=${fI.aY.toFixed(7)}, lat0=${fI.bY.toFixed(4)}`);
