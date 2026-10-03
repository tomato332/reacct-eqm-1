/**
 * 회귀 테스트 (브라우저 불필요, npx tsx scripts/regression-test.mts)
 *
 * 검증 대상:
 *  1. kmoni jma_s 투영 상수 (관측소 Point ↔ lon/lat 일치)
 *  2. RGB → 진도 변환 + 3×3 공간 일관성 필터 (오탐 방지)
 *  3. 감지 파이프라인: 실제 뭉치 진도 → 감지 발생 / 고립 노이즈 → 감지 없음
 *  4. [재발 방지] onSoundTriggered 시점에 감지 격자(lastDetectedGeojson)가 이미 확정되어 있어야 함
 *  5. 다중 프레임 GIF 인코딩 (네트워크 가능 시 실제 kmoni 프레임으로, 실패 시 스킵)
 */
import { GifReader, GifWriter } from 'omggif';
import fs from 'fs';
import path from 'path';
import { QuakeDetectService } from '../src/QuakeDetectService';
import { StationPointMeta } from '../server-intensity';
import {
  getIntensityFromRGB,
  getLpFromRGB,
  isInInsetRegion,
  validateSpatialSupport,
  MAIN_PROJECTION,
  INSET_PROJECTION
} from '../server-intensity';

let passed = 0, failed = 0, skipped = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${detail}`); }
}
function skip(name: string, reason: string) {
  skipped++; console.log(`  ⏭️  ${name} (${reason})`);
}

const stations: StationPointMeta[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'public/intensity-points-v1.json'), 'utf-8')
);

console.log('\n[1] 투영 상수 검증');
{
  const mapped = stations.filter(s => s.Point && !s.IsSuspended);
  let ok = 0, worst = 0, worstName = '';
  for (const s of mapped) {
    const p = isInInsetRegion(s.Location.longitude, s.Location.latitude) ? INSET_PROJECTION : MAIN_PROJECTION;
    const px = (s.Location.longitude - p.lon0) / p.lonPerPx;
    const py = (s.Location.latitude - p.lat0) / p.latPerPx;
    const err = Math.max(Math.abs(px - s.Point!.x), Math.abs(py - s.Point!.y));
    if (err <= 3) ok++;
    if (err > worst) { worst = err; worstName = `${s.Region} ${s.Name}`; }
  }
  check(`관측소 ${mapped.length}개 중 ${ok}개가 3px 이내 일치`, ok === mapped.length, `최악: ${worstName} ${worst.toFixed(1)}px`);
}

console.log('\n[2] RGB 변환 + 공간 일관성 필터');
{
  const w = 352, h = 400;
  const rgba = new Uint8Array(w * h * 4);
  // 파랑 배경(진도 -3.0) 위에 밝은 노이즈 1픽셀
  for (let p = 0; p < w * h; p++) { rgba[p * 4] = 0; rgba[p * 4 + 1] = 0; rgba[p * 4 + 2] = 205; rgba[p * 4 + 3] = 255; }
  const cx = 200, cy = 200;
  rgba[(cy * w + cx) * 4] = 31; rgba[(cy * w + cx) * 4 + 1] = 228; rgba[(cy * w + cx) * 4 + 2] = 96;

  check('진도 -3.0 파랑 → -3.0 변환', getIntensityFromRGB(0, 0, 205) === -3.0);
  check('고립 밝은 픽셀 → -0.5로 매핑됨(필터 전)', getIntensityFromRGB(31, 228, 96) === -0.5);
  check('고립 밝은 픽셀 → 3×3 필터에서 기각', validateSpatialSupport(rgba, w, h, cx, cy) === false);
  check('배경 파랑 픽셀 → 필터 통과', validateSpatialSupport(rgba, w, h, 100, 100) === true);

  // 실제 진도 뭉치(3×3 진도 -0.5 영역)는 통과해야 함
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const i = ((cy + dy) * w + (cx + dx)) * 4;
    rgba[i] = 31; rgba[i + 1] = 228; rgba[i + 2] = 96; rgba[i + 3] = 255;
  }
  check('3×3 진도 뭉치 중심 → 필터 통과', validateSpatialSupport(rgba, w, h, cx, cy) === true);
}

console.log('\n[3][4] 감지 파이프라인');
{
  const svc = new QuakeDetectService();
  svc.initKmoniStations(stations);

  // 이웃 3개 이상인 본토 관측소 하나를 골라 클러스터 구성
  const base = stations.find(s => s.Point && !s.IsSuspended && s.Location.latitude > 35 && s.Location.latitude < 37)!;
  const baseCode = base.Code;
  const baseStn = svc.stationsState.get(baseCode)!;
  // 감지 조건상 이웃 60% 이상이 동시에 상승해야 하므로 이웃 전체를 클러스터로 구성
  const neighborCodes = baseStn.near.map(n => n.code);
  check(`테스트 클러스터 구성: ${base.Region} ${base.Name} + 이웃 ${neighborCodes.length}개`, neighborCodes.length >= 2);

  const feed = (jindo: number) => {
    const map: Record<string, number | null> = {};
    for (const s of stations) map[s.Code] = -3.0;
    map[baseCode] = jindo;
    for (const c of neighborCodes) map[c] = jindo;
    return map;
  };

  let newEventFired = false;
  let soundFiredWithGrid = false;
  svc.processKmoniParsedData(feed(-3.0)); // 초기 프레임
  svc.processKmoniParsedData(feed(3.0), {
    onNewEventDetected: () => { newEventFired = true; },
    onSoundTriggered: () => {
      // [재발 방지] 소리/웹훅 콜백 시점에 격자가 이미 확정되어 있어야 한다 (네모칸 없음 버그)
      soundFiredWithGrid = (svc.lastDetectedGeojson?.features?.length ?? 0) > 0;
    }
  });

  check('클러스터 진도 급등 → 감지 발생', newEventFired);
  check('onSoundTriggered 시점에 격자 확정됨 (네모칸 버그 재발 방지)', soundFiredWithGrid);

  // 고립 노이즈: 단일 관측소만 급등 → 감지 없어야 함
  const svc2 = new QuakeDetectService();
  svc2.initKmoniStations(stations);
  const s2 = stations.find(s => s.Point && !s.IsSuspended && s.Code !== baseCode)!;
  const s2Near = svc2.stationsState.get(s2.Code)!.near.map(n => n.code);
  let noiseEventFired = false;
  const noiseFeed = (jindo: number) => {
    const map: Record<string, number | null> = {};
    for (const st of stations) map[st.Code] = -3.0;
    map[s2.Code] = jindo; // 이 관측소만
    return map;
  };
  svc2.processKmoniParsedData(noiseFeed(-3.0));
  // 미디언 필터(3프레임)를 통과시키기 위해 3프레임 연속 유지
  for (let i = 0; i < 3; i++) {
    svc2.processKmoniParsedData(noiseFeed(5.0), { onNewEventDetected: () => { noiseEventFired = true; } });
  }
  check('단일 관측소 노이즈(이웃 정상) → 감지 없음', !noiseEventFired, `이웃 ${s2Near.length}개`);

  // 종료 흐름: 진도 복귀 → 이벤트 만료(10초 후) → onEventsFinished
  // (시간 의존이라 여기선 격자가 비어는지지만 만료 대기가 필요해 생략하지 않고 시간을 앞당긴다)
  let finishedFired = false;
  svc.checkExpirationTick(Date.now() + 11000, undefined, () => { finishedFired = true; });
  check('감지 만료 후 onEventsFinished 호출', finishedFired);
}

console.log('\n[5] 다중 프레임 GIF 인코딩 (실제 kmoni 프레임, 네트워크 필요)');
{
  try {
    const d = new Date(Date.now() - 30000);
    const jst = new Date(d.getTime() + 9 * 3600 * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    const mk = (sec: number) => {
      const t = new Date(jst.getTime() + sec * 1000);
      return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`;
    };
    const frames: Buffer[] = [];
    for (let sec = 0; sec < 3; sec++) {
      const ts = mk(sec);
      const url = `http://www.kmoni.bosai.go.jp/data/map_img/RealTimeImg/jma_s/${ts.slice(0, 8)}/${ts}.jma_s.gif`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'http://www.kmoni.bosai.go.jp/' },
        signal: AbortSignal.timeout(5000)
      });
      if (r.ok) frames.push(Buffer.from(await r.arrayBuffer()));
    }
    if (frames.length < 2) {
      skip('다중 프레임 GIF 인코딩', `프레임 ${frames.length}장만 수신됨`);
    } else {
      const reader0 = new GifReader(frames[0]);
      const w = reader0.width, h = reader0.height;
      const out = new Uint8Array(frames.length * (w * h + 768) + 4096);
      const writer = new GifWriter(out as any, w, h, { loop: 0 } as any);
      for (const buf of frames) {
        const rd = new GifReader(buf);
        const rgba = new Uint8Array(w * h * 4);
        rd.decodeAndBlitFrameRGBA(0, rgba);
        let shift = 0, palette: number[] = [], indices = new Uint8Array(w * h);
        for (;;) {
          const map = new Map<number, number>(); indices = new Uint8Array(w * h);
          for (let q = 0; q < w * h; q++) {
            const key = ((rgba[q * 4] >> shift) << 16) | ((rgba[q * 4 + 1] >> shift) << 8) | (rgba[q * 4 + 2] >> shift);
            let idx = map.get(key); if (idx === undefined) { idx = map.size; map.set(key, idx); }
            indices[q] = idx;
          }
          if (map.size <= 256) { palette = [...map.keys()]; break; } shift++;
        }
        let ps = 2; while (ps < palette.length) ps <<= 1;
        const pal = [...palette]; while (pal.length < ps) pal.push(0);
        writer.addFrame(0, 0, w, h, indices as any, { palette: pal, delay: 100 } as any);
      }
      const len = writer.end();
      const gif = Buffer.from(out.subarray(0, len));
      const verify = new GifReader(gif);
      check(`다중 프레임 GIF: ${verify.numFrames()}프레임 재디코드`, verify.numFrames() === frames.length);
    }
  } catch (e) {
    skip('다중 프레임 GIF 인코딩', `네트워크 오류: ${(e as Error).message.slice(0, 60)}`);
  }
}

console.log('\n[6] 장주기 지진동(lmoni) 색 판정');
{
  const f = getLpFromRGB;
  // 파랑(저Sva) → 초록 → 노랑 → 주황 → 빨강(고Sva) 순서로 계급 증가
  check('파랑(평시) → 계급 0', f(0, 43, 232)?.cls === 0);
  check('청록 → 계급 0', f(0, 170, 153)?.cls === 0);
  check('초록 → 계급 0', f(102, 255, 51)?.cls === 0);
  check('노랑(Sva≈1) → 계급 0', f(255, 213, 0)?.cls === 0);
  check('주황(Sva≈5) → 계급 1', f(255, 153, 0)?.cls === 1);
  check('진주황(Sva≈20) → 계급 2', f(255, 85, 0)?.cls === 2);
  check('적주황(Sva≈50) → 계급 3', f(255, 60, 0)?.cls === 3);
  check('빨강(Sva≈100) → 계급 4', f(255, 34, 0)?.cls === 4);
  check('흰색(배경) → null', f(255, 255, 255) === null);
  check('회색(경계선) → null', f(128, 128, 128) === null);
}

console.log(`\n===== 결과: 통과 ${passed} / 실패 ${failed} / 스킵 ${skipped} =====`);
process.exit(failed > 0 ? 1 : 0);
