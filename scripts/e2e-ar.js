/**
 * AR 탭 실브라우저 E2E (Chrome + 가짜 웹캠)
 * - 모델 사진으로 y4m 가짜 웹캠 → MediaPipe Pose 실시간 추적 · 의상 워핑 · 카메라 체형 측정 · 인식 학습
 * - 샘플/사진 모드, 캡처, 탭 이탈 시 카메라 해제, 룩키 캐릭터 착용 렌더, 콘솔 에러
 * node scripts/e2e-ar.js   (puppeteer-core·pngjs는 ~/.lookfit-tools 에서 로드)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launch, startServer } = require('./lib-browser');

const PORT = 8772;
const TOOLS = process.env.LOOKFIT_TOOLS || path.join(os.homedir(), '.lookfit-tools');
const OUT = path.join(TOOLS, 'e2e');
const ROOT = path.join(__dirname, '..');
const { PNG } = require(path.join(TOOLS, 'node_modules', 'pngjs'));

let passed = 0, failed = 0;
function assert(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS', name, detail ? '(' + detail + ')' : ''); }
  else { failed++; console.log('  FAIL', name, detail || ''); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 사진을 640x480 캔버스 중앙에 배치한 뒤 좌우로 조금씩 움직이는 I420 y4m 생성
function buildY4M(srcPng, file, frames = 40) {
  const src = PNG.sync.read(fs.readFileSync(srcPng));
  const W = 640, H = 480;
  const s = H / src.height;
  const dw = Math.round(src.width * s);
  const header = `YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420jpeg\n`;
  const chunks = [Buffer.from(header)];
  for (let f = 0; f < frames; f++) {
    const shift = Math.round(Math.sin((f / frames) * Math.PI * 2) * 40);
    const ox = Math.round((W - dw) / 2) + shift;
    const Y = Buffer.alloc(W * H), U = Buffer.alloc(W * H / 4), V = Buffer.alloc(W * H / 4);
    const rgbAt = (x, y) => {
      const sx = Math.floor((x - ox) / s), sy = Math.floor(y / s);
      if (sx < 0 || sx >= src.width || sy < 0 || sy >= src.height) return [236, 233, 228];
      const i = (sy * src.width + sx) * 4;
      return [src.data[i], src.data[i + 1], src.data[i + 2]];
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const [r, g, b] = rgbAt(x, y);
        Y[y * W + x] = Math.max(0, Math.min(255, Math.round(0.299 * r + 0.587 * g + 0.114 * b)));
        if (!(x % 2) && !(y % 2)) {
          const j = (y / 2) * (W / 2) + x / 2;
          U[j] = Math.max(0, Math.min(255, Math.round(-0.169 * r - 0.331 * g + 0.5 * b + 128)));
          V[j] = Math.max(0, Math.min(255, Math.round(0.5 * r - 0.419 * g - 0.081 * b + 128)));
        }
      }
    }
    chunks.push(Buffer.from('FRAME\n'), Y, U, V);
  }
  fs.rmSync(file, { force: true });
  fs.writeFileSync(file, Buffer.concat(chunks));
}

async function waitFor(page, fn, timeout = 60000, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn, arg)) return Date.now() - t0;
    await sleep(250);
  }
  return -1;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const y4m = path.join(TOOLS, 'fake-cam.y4m');
  buildY4M(path.join(ROOT, 'assets', 'shop', 'item_7.png'), y4m);

  const server = await startServer(PORT);
  const browser = await launch({ fakeVideo: y4m });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 820, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon\.ico$/.test(r.url())) errors.push('http ' + r.status() + ': ' + r.url()); });
  await browser.defaultBrowserContext().overridePermissions('http://localhost:' + PORT, ['camera']);
  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  const app = await page.$('#app');
  const shot = (n) => app.screenshot({ path: path.join(OUT, n + '.png') });

  console.log('\n== 인식 엔진 사전 로딩 ==');
  const tLoad = await waitFor(page, () => !!POSE.kind, 60000);
  const eng = await page.evaluate(() => ({ kind: POSE.kind, label: POSE.label, err: POSE.error }));
  assert('앱 시작 시 MediaPipe 사전 로딩', tLoad >= 0 && eng.kind === 'mediapipe', `${eng.label} ${tLoad}ms ${eng.err}`);

  console.log('\n== 홈: 룩키 캐릭터 ==');
  await sleep(800);
  const bare = await page.evaluate(() => {
    const cv = document.getElementById('avatarCanvas');
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 200) n++;
    return n / (d.length / 16);
  });
  assert('룩키 렌더 (불투명 픽셀)', bare > 0.12, (bare * 100).toFixed(1) + '%');
  const worn = await page.evaluate(async () => {
    const item = CATALOG.find((c) => c.typeKey === 'knit' && c.colorName === '올리브') || CATALOG.find((c) => c.typeKey === 'knit');
    wearItem(item); save(); renderHome();
    await new Promise((r) => setTimeout(r, 900));
    const cv = document.getElementById('avatarCanvas');
    const K = charKp(); const r = arFitRect(CHAR_MODEL.w, CHAR_MODEL.h, cv.width, cv.height, false);
    const x = r.x + (K.ls.x + K.rs.x + K.lh.x + K.rh.x) / 4 * r.s, y = r.y + ((K.ls.y + K.rs.y) / 2 * 0.4 + (K.lh.y + K.rh.y) / 2 * 0.6) * r.s;
    const px = cv.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data;
    const want = [1, 3, 5].map((i) => parseInt(item.color.slice(i, i + 2), 16));
    return { name: item.name, dist: Math.round(Math.hypot(px[0] - want[0], px[1] - want[1], px[2] - want[2])), px: [...px].slice(0, 3), want };
  });
  assert('룩키 몸통에 실제 상품 착용', worn.dist < 80, `${worn.name} ${worn.px} vs ${worn.want} (${worn.dist})`);
  await shot('01-home-looky');
  await page.click('#btnHomeShot');
  await sleep(500);
  assert('착용샷 저장 (실제 PNG 다운로드)', /저장/.test(await page.$eval('#toast', (e) => e.textContent)));

  console.log('\n== 탐색 → PDP → AR 탭 (카메라) ==');
  await page.click('.tab[data-tab="explore"]');
  await sleep(400);
  assert('탐색 카드 100+', (await page.$$eval('#exploreGrid .p-card', (e) => e.length)) >= 100);
  await page.evaluate(() => openProduct('p04'));
  await sleep(500);
  await shot('02-pdp');
  const t0 = Date.now();
  await page.click('#btnPdpAR');
  const tTrack = await waitFor(page, () => AR.mode === 'camera' && !!AR.kp, 30000);
  assert('AR 탭 진입 → 추적 시작 (모델·셰이더 사전 준비)', tTrack >= 0 && tTrack < 4000, (Date.now() - t0) + 'ms');
  await sleep(2500);
  const cam = await page.evaluate(() => ({
    fps: AR.fps, sw: AR.kp && Math.hypot(AR.kp.ls.x - AR.kp.rs.x, AR.kp.ls.y - AR.kp.rs.y), status: AR.statusText,
    vw: document.getElementById('arVideo').videoWidth, arms: !!(AR.kp.le && AR.kp.re), learnN: learnModel().n,
  }));
  assert('영상 640px', cam.vw === 640, cam.vw + 'px');
  assert('추적 FPS >= 10', cam.fps >= 10, cam.fps + 'fps');
  assert('어깨 + 팔꿈치 인식', cam.sw > 40 && cam.arms, Math.round(cam.sw) + 'px');
  assert('상태 문구', /실시간 추적/.test(cam.status), cam.status);
  assert('반복 인식으로 체형 비율 학습', cam.learnN > 5, cam.learnN + '프레임');
  await shot('03-ar-camera');

  const probe = await page.evaluate(async () => {
    const item = CATALOG.find((c) => !c.isPhoto && c.kind === 'top' && c.colorName === '머스타드') || CATALOG.find((c) => !c.isPhoto && c.kind === 'top');
    AR.outfit = { top: null, bottom: null }; arPut(item); AR.size = 'M';
    await new Promise((r) => setTimeout(r, 1500));
    const cv = document.getElementById('arCanvas'), k = AR.kp;
    const cx = (k.ls.x + k.rs.x + k.lh.x + k.rh.x) / 4, cy = (k.ls.y + k.rs.y) / 2 * 0.45 + (k.lh.y + k.rh.y) / 2 * 0.55;
    const px = cv.getContext('2d').getImageData(Math.round(cx), Math.round(cy), 1, 1).data;
    const want = [1, 3, 5].map((i) => parseInt(item.color.slice(i, i + 2), 16));
    return { name: item.name, px: [...px].slice(0, 3), want, dist: Math.round(Math.hypot(px[0] - want[0], px[1] - want[1], px[2] - want[2])) };
  });
  assert('몸통에 의상 워핑', probe.dist < 90, `${probe.name} ${probe.px} vs ${probe.want} (${probe.dist})`);
  const jitter = await page.evaluate(async () => {
    const xs = [];
    for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 50)); xs.push(AR.kp.ls.y); }
    let d = 0; for (let i = 1; i < xs.length; i++) d += Math.abs(xs[i] - xs[i - 1]);
    return d / (xs.length - 1);
  });
  assert('어깨 세로 떨림 < 2px/프레임 (One-Euro)', jitter < 2, jitter.toFixed(2) + 'px');
  await page.evaluate(() => { AR.outfit = { top: null, bottom: null }; arPut(arItem('p04')); arPut(arItem('p05')); arRenderRail(); });
  await sleep(1000);
  await shot('04-ar-camera-look');

  console.log('\n== 체형 측정 (카메라) ==');
  await page.click('#arSeg [data-view="measure"]');
  await page.evaluate(() => { document.getElementById('heightInput').value = '172'; document.getElementById('weightInput').value = '55'; document.getElementById('genderSelect').value = 'W'; });
  await sleep(600);
  await shot('05-measure-ready');
  await page.click('#btnMeasureStart');
  await sleep(3600);
  const mid = await page.evaluate(() => ({ running: MEASURE.running, n: MEASURE.samples.length, reject: MEASURE.reject }));
  await shot('06-measure-running');
  const tMeasure = await waitFor(page, () => !!(state.measure && state.measure.method === 'camera'), 20000);
  const m = await page.evaluate(() => state.measure);
  assert('카메라 측정 완료', tMeasure >= 0, JSON.stringify(mid));
  if (m && m.values) {
    const v = m.values;
    assert('측정 프레임 >= 10', m.frames >= 10, m.frames + '프레임');
    assert('카메라 실측 반영 치수', ['shoulder', 'leg', 'torso'].every((k) => m.src[k] === 'camera'), JSON.stringify(m.src));
    assert('치수 범위 타당 (172/55 여성)', v.shoulder > 32 && v.shoulder < 50 && v.chest > 70 && v.chest < 115 && v.waist > 55 && v.waist < 100 && v.hip > 75 && v.hip < 115 && v.leg > 65 && v.leg < 100, JSON.stringify(v));
    assert('사이즈 · 체형 결과', !!(m.sizes.top && m.sizes.bottom) && !!(await page.evaluate(() => state.analysis && state.analysis.type)));
    assert('팔이 몸에 붙은 영상 → 폭은 입력값 + A자 자세 안내', m.src.chest === 'input' && /A자/.test(m.hint || '') && (await page.$$('#measureResult .m-hint')).length === 1, m.hint);
  }
  await page.evaluate(() => { document.getElementById('arMeasurePanel').scrollTop = 500; });
  await sleep(400);
  await shot('07-measure-result');
  const photoIn = await page.$('#measurePhotoInput');
  await photoIn.uploadFile(path.join(ROOT, 'assets', 'char', 'looky-src.jpg'));
  const tPm = await waitFor(page, () => !!(state.measure && state.measure.method === 'photo'), 30000);
  const pm = await page.evaluate(() => state.measure);
  assert('A자 자세 전신 사진 → 가슴·허리·엉덩이 실측', tPm >= 0 && ['chest', 'waist', 'hip', 'shoulder', 'leg'].every((k) => pm.src[k] === 'camera') && !pm.hint, pm && JSON.stringify(pm.src));

  console.log('\n== 샘플 / 사진 모드 ==');
  await page.click('#arSeg [data-view="tryon"]');
  await page.click('#arModes [data-mode="sample"]');
  const tSample = await waitFor(page, () => AR.mode === 'sample' && !!AR.kp, 20000);
  assert('샘플 모델 착용', tSample >= 0, tSample + 'ms');
  assert('카메라 트랙 해제', await page.evaluate(() => AR.stream === null));
  await page.evaluate(() => { AR.outfit = { top: null, bottom: null }; arPut(CATALOG.find((c) => c.typeKey === 'hoodie')); arPut(CATALOG.find((c) => c.typeKey === 'sjean')); arRenderRail(); });
  await sleep(900);
  await shot('08-ar-sample-hoodie');
  const input = await page.$('#arPhotoInput');
  await input.uploadFile(path.join(ROOT, 'assets', 'shop', 'item_5.png'));
  const tPhoto = await waitFor(page, () => AR.mode === 'photo' && !!AR.srcPose && !!AR.kp, 30000);
  assert('업로드 사진 관절 검출 (MediaPipe IMAGE)', tPhoto >= 0, tPhoto + 'ms');
  await page.evaluate(() => { AR.outfit = { top: null, bottom: null }; arPut(arItem('p06')); arPut(arItem('p07')); arRenderRail(); });
  await sleep(900);
  await shot('09-ar-photo');

  console.log('\n== 캡처 / 장바구니 ==');
  await page.click('#arCapture');
  await sleep(500);
  assert('AR 착용샷 저장', /저장/.test(await page.$eval('#toast', (e) => e.textContent)));
  await page.evaluate(() => { state.cart = {}; });
  await page.click('#arToCart');
  assert('AR 코디 장바구니 2벌', (await page.evaluate(() => Object.keys(state.cart).length)) === 2);

  console.log('\n== 카메라 해제 ==');
  await page.click('#arModes [data-mode="camera"]');
  await waitFor(page, () => !!AR.stream, 8000);
  await page.click('.tab[data-tab="home"]');
  await sleep(800);
  const closed = await page.evaluate(() => ({ open: AR.open, stream: AR.stream, mode: AR.mode, live: !!document.getElementById('arVideo').srcObject }));
  assert('탭 이탈 시 카메라 해제', !closed.open && closed.stream === null && closed.mode === null && !closed.live, JSON.stringify(closed));
  await page.evaluate(() => { openAR(['p01']); setTimeout(() => switchTab('home'), 30); });
  await sleep(2500);
  const race = await page.evaluate(() => ({ open: AR.open, stream: AR.stream, mode: AR.mode, live: !!document.getElementById('arVideo').srcObject }));
  assert('진입 직후 이탈해도 카메라 누수 없음', !race.open && race.stream === null && race.mode === null && !race.live, JSON.stringify(race));
  await sleep(400);
  await shot('10-home-after');

  assert('콘솔/페이지 에러 없음', errors.length === 0, errors.slice(0, 5).join(' | '));
  console.log('\nscreenshots:', OUT);
  console.log('Passed:', passed, 'Failed:', failed);
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
