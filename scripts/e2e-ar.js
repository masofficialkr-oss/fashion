/**
 * AR 피팅룸 실브라우저 E2E
 * - 모델 사진으로 y4m 가짜 웹캠 영상을 만들어 Chrome 카메라로 주입 → MoveNet 실시간 추적 + 의상 워핑 확인
 * - 샘플 모델 / 내 사진 모드, 사이즈 변경, 캡처, 콘솔 에러 검사, 스크린샷 저장
 * node scripts/e2e-ar.js   (puppeteer-core·pngjs는 ~/.lookfit-tools 에서 로드)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launch, startServer } = require('./lib-browser');

const PORT = 8772;
const TOOLS = process.env.LOOKFIT_TOOLS || path.join(os.homedir(), '.lookfit-tools');
const OUT = path.join(TOOLS, 'shots');
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
  console.log('fake camera:', y4m);

  const server = await startServer(PORT);
  const browser = await launch({ fakeVideo: y4m });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 820, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon\.ico$/.test(r.url())) errors.push('http ' + r.status() + ': ' + r.url()); });
  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions('http://localhost:' + PORT, ['camera']);
  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  const app = await page.$('#app');

  console.log('\n== Explore / PDP 화면 ==');
  await page.click('.tab[data-tab="explore"]');
  await sleep(600);
  await app.screenshot({ path: path.join(OUT, '01-explore.png') });
  const cards = await page.$$eval('#exploreGrid .shop-card', (els) => els.length);
  assert('explore 카드 수', cards >= 100, cards + '개');
  await page.click('#chipRow [data-chip="상의"]');
  await sleep(500);
  await app.screenshot({ path: path.join(OUT, '01b-explore-tops.png') });
  await page.click('#chipRow [data-chip="하의"]');
  await page.evaluate(() => { document.getElementById('exploreScroll').scrollTop = 900; });
  await sleep(500);
  await app.screenshot({ path: path.join(OUT, '01c-explore-bottoms.png') });
  await page.click('#chipRow [data-chip="전체"]');
  await page.evaluate(() => openProduct('p04'));
  await sleep(700);
  await app.screenshot({ path: path.join(OUT, '02-pdp.png') });
  await page.evaluate(() => { document.getElementById('detailScroll').scrollTop = 520; });
  await sleep(300);
  await app.screenshot({ path: path.join(OUT, '03-pdp-size-review.png') });

  console.log('\n== 카메라 모드 (가짜 웹캠 + MoveNet) ==');
  await page.evaluate(() => { document.getElementById('detailScroll').scrollTop = 0; });
  await page.click('#btnPdpAR');
  const tTrack = await waitFor(page, () => AR.mode === 'camera' && !!AR.kp, 90000);
  assert('카메라 스트림 + 관절 추적 시작', tTrack >= 0, tTrack + 'ms');
  await sleep(2500);
  const cam = await page.evaluate(() => ({
    fps: AR.fps, sw: AR.kp && Math.hypot(AR.kp.ls.x - AR.kp.rs.x, AR.kp.ls.y - AR.kp.rs.y), status: AR.statusText,
    vw: document.getElementById('arVideo').videoWidth, outfit: AR.outfit,
  }));
  assert('영상 해상도', cam.vw === 640, cam.vw + 'px');
  assert('추적 FPS >= 5', cam.fps >= 5, cam.fps + 'fps');
  assert('어깨폭 인식', cam.sw > 40, Math.round(cam.sw) + 'px');
  assert('상태 문구', /실시간 추적/.test(cam.status), cam.status);
  await app.screenshot({ path: path.join(OUT, '04-ar-camera-blazer.png') });

  // 선명한 색의 생성 의상으로 교체 → 몸통 중앙 픽셀이 의상 색으로 칠해졌는지 검사
  const probe = await page.evaluate(async () => {
    const item = CATALOG.find((c) => !c.isPhoto && c.kind === 'top' && c.colorName === '머스타드') || CATALOG.find((c) => !c.isPhoto && c.kind === 'top');
    AR.outfit = { top: null, bottom: null };
    arPut(item);
    AR.size = 'M';
    await new Promise((r) => setTimeout(r, 1500));
    const cv = document.getElementById('arCanvas');
    const k = AR.kp;
    const cx = (k.ls.x + k.rs.x + k.lh.x + k.rh.x) / 4, cy = (k.ls.y + k.rs.y) / 2 * 0.45 + (k.lh.y + k.rh.y) / 2 * 0.55;
    const px = cv.getContext('2d').getImageData(Math.round(cx), Math.round(cy), 1, 1).data;
    const hex = item.color.replace('#', '');
    const want = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const dist = Math.hypot(px[0] - want[0], px[1] - want[1], px[2] - want[2]);
    return { id: item.id, name: item.name, px: [...px].slice(0, 3), want, dist: Math.round(dist) };
  });
  assert('몸통에 의상 워핑 렌더', probe.dist < 90, `${probe.name} 픽셀 ${probe.px} vs ${probe.want} (거리 ${probe.dist})`);
  await app.screenshot({ path: path.join(OUT, '05-ar-camera-generated.png') });

  // 사이즈 S vs XL: 같은 행 의상 폭이 커지는지 (메쉬 스케일)
  const widths = await page.evaluate(async () => {
    const w = {};
    for (const s of ['S', 'XL']) {
      AR.size = s;
      const g = meshGrid(AR.kp, AR_SIZE_SCALE[s]);
      w[s] = Math.hypot(g[2][0].x - g[2][4].x, g[2][0].y - g[2][4].y);
    }
    AR.size = 'M';
    return w;
  });
  assert('사이즈 XL 메쉬 > S', widths.XL > widths.S * 1.15, `S ${Math.round(widths.S)} / XL ${Math.round(widths.XL)}`);

  // 하의 + 상의 조합
  await page.evaluate(() => { AR.outfit = { top: null, bottom: null }; arPut(arItem('p04')); arPut(arItem('p05')); arRenderRail(); });
  await sleep(1200);
  await app.screenshot({ path: path.join(OUT, '06-ar-camera-look.png') });

  console.log('\n== 샘플 모델 모드 ==');
  await page.click('#arModes [data-mode="sample"]');
  const tSample = await waitFor(page, () => AR.mode === 'sample' && !!AR.kp, 20000);
  assert('샘플 모델 착용', tSample >= 0, tSample + 'ms');
  const stoppedCam = await page.evaluate(() => AR.stream === null);
  assert('카메라 트랙 해제', stoppedCam);
  await page.evaluate(() => { AR.outfit = { top: null, bottom: null }; arPut(arItem('p03')); arRenderRail(); });
  await sleep(900);
  await app.screenshot({ path: path.join(OUT, '07-ar-sample-padding.png') });
  await page.evaluate(() => {
    AR.outfit = { top: null, bottom: null };
    arPut(CATALOG.find((c) => c.typeKey === 'trench' && c.colorName === '베이지'));
    arPut(CATALOG.find((c) => c.typeKey === 'sjean' && c.colorName === '연청'));
    arRenderRail();
  });
  await sleep(900);
  await app.screenshot({ path: path.join(OUT, '08-ar-sample-generated.png') });

  console.log('\n== 내 사진 모드 ==');
  const input = await page.$('#arPhotoInput');
  await input.uploadFile(path.join(ROOT, 'assets', 'shop', 'item_5.png'));
  const tPhoto = await waitFor(page, () => AR.mode === 'photo' && !!AR.srcPose && !!AR.kp, 30000);
  assert('업로드 사진에서 관절 검출', tPhoto >= 0, tPhoto + 'ms');
  await page.evaluate(() => { AR.outfit = { top: null, bottom: null }; arPut(arItem('p06')); arPut(arItem('p07')); arRenderRail(); });
  await sleep(900);
  await app.screenshot({ path: path.join(OUT, '09-ar-photo.png') });

  console.log('\n== 캡처 / 장바구니 / 보상 ==');
  await page.click('#arCapture');
  await sleep(500);
  const capToast = await page.$eval('#toast', (e) => e.textContent);
  assert('착용샷 캡처(http 환경 taint 없음)', /저장/.test(capToast), capToast);
  await page.click('#arToCart');
  const cart = await page.evaluate(() => Object.keys(state.cart));
  assert('AR 코디 장바구니', cart.length === 2, cart.join(','));
  const reward = await page.evaluate(() => state.arRewardDate === todayKey());
  assert('AR 일일 보상 지급', reward);

  console.log('\n== AI 실사(Decart) 키 없음 → 안내 후 카메라 복귀 ==');
  await page.click('#arModes [data-mode="decart"]');
  const back = await waitFor(page, () => AR.mode === 'camera', 8000);
  const decToast = await page.$eval('#toast', (e) => e.textContent);
  assert('키 없으면 기기 내 AR로 복귀', back >= 0 && /Decart/.test(decToast), decToast);

  await sleep(1500);
  await page.click('#arClose');
  await sleep(1500);
  const closed = await page.evaluate(() => ({
    ok: !AR.open && AR.stream === null && !document.getElementById('arScreen').classList.contains('show'),
    mode: AR.mode, toast: document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').textContent : '',
  }));
  assert('닫기 시 카메라 해제', closed.ok && closed.mode === null, JSON.stringify(closed));
  assert('닫은 뒤 모드 전환 토스트 없음', !/샘플 모델로 전환/.test(closed.toast), closed.toast);

  // 카메라 시작 도중 바로 닫기 → 늦게 도착한 스트림이 새지 않아야 함
  await page.evaluate(() => { openAR(['p01']); setTimeout(() => closeAR(), 30); });
  await sleep(2500);
  const race = await page.evaluate(() => ({ open: AR.open, stream: AR.stream, mode: AR.mode, live: !!(document.getElementById('arVideo').srcObject) }));
  assert('열자마자 닫아도 카메라 누수 없음', !race.open && race.stream === null && race.mode === null && !race.live, JSON.stringify(race));

  console.log('\n== 홈 / 옷장 진입점 ==');
  await page.evaluate(() => closeProduct());
  await page.click('.tab[data-tab="home"]');
  await sleep(300);
  await app.screenshot({ path: path.join(OUT, '10-home.png') });

  assert('콘솔/페이지 에러 없음', errors.length === 0, errors.slice(0, 5).join(' | '));
  console.log('\nscreenshots:', OUT);
  console.log('Passed:', passed, 'Failed:', failed);
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
