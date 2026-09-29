// 본토만 선형회귀 재확인 + 인셋 판별
import { GifReader } from 'omggif';
import fs from 'fs';

const stations = JSON.parse(fs.readFileSync('public/intensity-points-v1.json', 'utf-8'));
const buf = fs.readFileSync('scripts/latest.jma_s.gif');
const reader = new GifReader(buf);
const w = reader.width, h = reader.height;

const fitResid = (pts) => {
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
  const resid = pts.map(s => ({
    name: s.Name, region: s.Region,
    dLon: s.Location.longitude - (aX * s.Point.x + bX),
    dLat: s.Location.latitude - (aY * s.Point.y + bY),
    x: s.Point.x, y: s.Point.y
  }));
  const rms = (k) => Math.sqrt(resid.reduce((a, r) => a + r[k] ** 2, 0) / n);
  return { aX, bX, aY, bY, resid, rmsLon: rms('dLon'), rmsLat: rms('dLat') };
};

// 1차: 본토 추정 (지도에서 x>=150 && lat>=31 — 남서제도 제외)
const all = stations.filter(s => s.Point && !s.IsSuspended);
let mainland = all.filter(s => s.Location.latitude >= 31.5 && s.Point.x >= 150);
console.log(`본토 추정 관측소: ${mainland.length}/${all.length}`);
let r1 = fitResid(mainland);
console.log(`1차 본토 회귀: lon=${(r1.aX * 3600).toFixed(2)}"/px x0=${r1.bX.toFixed(3)}, lat=${(3600 / -r1.aY).toFixed(2)}"/px y0=${r1.bY.toFixed(3)}  RMS lon=${r1.rmsLon.toFixed(3)}° lat=${r1.rmsLat.toFixed(3)}°`);
r1.resid.sort((a, b) => Math.hypot(b.dLon, b.dLat) - Math.hypot(a.dLon, a.dLat));
console.log('1차 잔차 최악 15:');
for (const r of r1.resid.slice(0, 15)) console.log(`  ${r.region} ${r.name} (${r.x},${r.y}) dLon=${r.dLon.toFixed(3)} dLat=${r.dLat.toFixed(3)}`);

// 2차: 잔차 0.3° 이상 제거 후 재회귀
mainland = mainland.filter(s => {
  const r = r1.resid.find(q => q.name === s.Name && q.region === s.Region);
  return r && Math.hypot(r.dLon, r.dLat) < 0.3;
});
const r2 = fitResid(mainland);
console.log(`\n2차(이상치 제거 ${mainland.length}개): lon=${(r2.aX * 3600).toFixed(2)}"/px (=${(1 / r2.aX).toFixed(4)}°/px) x0 lon=${r2.bX.toFixed(4)}, lat ${(1 / -r2.aY).toFixed(4)}°/px y0 lat=${r2.bY.toFixed(4)}`);
console.log(`2차 RMS lon=${r2.rmsLon.toFixed(4)}° lat=${r2.rmsLat.toFixed(4)}°`);
r2.resid.sort((a, b) => Math.hypot(b.dLon, b.dLat) - Math.hypot(a.dLon, a.dLat));
console.log('2차 잔차 최악 10:');
for (const r of r2.resid.slice(0, 10)) console.log(`  ${r.region} ${r.name} (${r.x},${r.y}) dLon=${r.dLon.toFixed(3)} dLat=${r.dLat.toFixed(3)}`);
const maxRes = r2.resid.reduce((m, r) => Math.max(m, Math.hypot(r.dLon, r.dLat)), 0);
console.log(`2차 최대 잔차: ${maxRes.toFixed(4)}°`);

// 샘플 검증
for (const name of ['種市', '札幌']) {
  const s = stations.find(st => st.Name === name);
  const px = Math.round((s.Location.longitude - r2.bX) / r2.aX);
  const py = Math.round((s.Location.latitude - r2.bY) / r2.aY);
  console.log(`${name}: 실제 Point(${s.Point.x},${s.Point.y}) vs 회귀역산(${px},${py})`);
}
