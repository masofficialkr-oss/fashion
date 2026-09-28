/**
 * 전체 화면 QA 감사 (실제 Chrome)
 * 홈 · 탐색 · 상세 · 장바구니 · AR(시착/측정) · 옷장 · MY 를 순회하며 공통 결함을 자동 검출하고 스크린샷을 남깁니다.
 *  - 폰 캔버스 밖으로 넘치는 요소, 의도치 않은 가로 넘침
 *  - 깨진 이미지, 28px 미만 터치 영역, 잘리는 토스트 문구
 *  - 콘솔/페이지 에러, 새로고침 후 상태 유지, 작은 창에서 축소
 * node scripts/qa-audit.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launch, startServer } = require('./lib-browser');

const PORT = 8773;
const OUT = path.join(process.env.LOOKFIT_TOOLS || path.join(os.homedir(), '.lookfit-tools'), 'audit');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const findings = [];
let passed = 0, failed = 0;
function check(id, name, ok, detail) {
  if (ok) { passed++; console.log('  PASS', id, name); }
  else { failed++; findings.push({ id, name, detail }); console.log('  FAIL', id, name, detail || ''); }
}

// 페이지 안에서 실행: 현재 보이는 화면의 레이아웃 결함 수집
function scanLayout() {
  const app = document.getElementById('app').getBoundingClientRect();
  const scale = app.width / document.getElementById('app').offsetWidth || 1;
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const clippedByAncestor = (el) => {
    for (let p = el.parentElement; p && p.id !== 'app'; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden)/.test(cs.overflowX) || /(auto|scroll|hidden)/.test(cs.overflow)) return true;
    }
    return false;
  };
  const label = (el) => el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const out = { overflow: [], hscroll: [], broken: [], small: [] };
  const all = [...document.querySelectorAll('#app *')].filter((el) => {
    for (let p = el; p && p.id !== 'app'; p = p.parentElement) if (!visible(p)) return false;
    return true;
  });
  all.forEach((el) => {
    const r = el.getBoundingClientRect();
    if ((r.right > app.right + 1 || r.left < app.left - 1) && !clippedByAncestor(el)) out.overflow.push(label(el) + ` (${Math.round(r.left - app.left)}..${Math.round(r.right - app.left)})`);
    const cs = getComputedStyle(el);
    const intentional = /(auto|scroll)/.test(cs.overflowX) || cs.textOverflow === 'ellipsis' || el.tagName === 'svg' || el.closest('svg');
    if (!intentional && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && cs.overflowX !== 'visible') out.hscroll.push(label(el) + ` ${el.scrollWidth}>${el.clientWidth}`);
    if (el.tagName === 'IMG' && el.getAttribute('src') && el.complete && el.naturalWidth === 0) out.broken.push(label(el) + ' ' + el.getAttribute('src').slice(0, 60));
    if ((el.tagName === 'BUTTON' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'file' && el.type !== 'range' && !el.hidden)) && !el.disabled) {
      const w = r.width / scale, h = r.height / scale;
      if (w < 28 || h < 24) out.small.push(label(el) + ` ${Math.round(w)}x${Math.round(h)}`);
    }
  });
  return out;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer(PORT);
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 820, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon\.ico$/.test(r.url())) errors.push('http ' + r.status() + ': ' + r.url()); });
  const base = 'http://localhost:' + PORT + '/index.html';
  await page.goto(base, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  const app = await page.$('#app');
  const toasts = [];
  await page.exposeFunction('__toast', (t) => toasts.push(t));
  await page.evaluate(() => {
    const el = document.getElementById('toast');
    new MutationObserver(() => window.__toast(JSON.stringify({ text: el.textContent, cut: el.scrollWidth > el.clientWidth + 1 }))).observe(el, { childList: true, characterData: true, subtree: true });
  });

  const states = [];
  async function snap(name, prep) {
    if (prep) await prep();
    await sleep(500);
    await app.screenshot({ path: path.join(OUT, name + '.png') });
    const s = await page.evaluate(scanLayout);
    states.push({ name, ...s });
  }
  const click = (sel) => page.click(sel);
  const tab = (t) => click(`.tab[data-tab="${t}"]`);
  const count = (sel) => page.$$eval(sel, (e) => e.length);

  console.log('\n== 홈 ==');
  await snap('01-home');
  check('H-01', '첫 화면: 룩키 + 레벨 + EXP 바 + 추천 레일', await page.evaluate(() => !!document.getElementById('avatarCanvas') && /Lv\.?\s*1/.test(document.getElementById('homeLevel').textContent) && document.querySelectorAll('#homeRecRail .mini-card').length >= 4));
  check('H-02', '미측정 시 체형 측정 CTA', await page.$eval('#homeMeasureCta', (e) => !e.hidden && getComputedStyle(e).display !== 'none'));

  console.log('\n== 탐색 ==');
  await snap('02-explore', () => tab('explore'));
  for (const s of ['recommend', 'best', 'sale', 'reviews', 'low', 'high']) {
    await page.select('#sortSelect', s);
    const n = await count('#exploreGrid .p-card');
    check('E-S-' + s, '정렬 ' + s + ' 결과 있음', n > 0, n + '개');
  }
  const low = await page.evaluate(() => { state.exploreSort = 'low'; renderExplore(); return [...document.querySelectorAll('#exploreGrid .p-card')].slice(0, 20).map((c) => salePrice(CATALOG.find((i) => i.id === c.dataset.id))); });
  check('E-S-low-order', '낮은 가격순 정렬 정확', low.every((p, i) => !i || low[i - 1] <= p), low.slice(0, 6).join(','));
  await page.select('#sortSelect', 'recommend');
  for (const c of ['상의', '아우터', '하의', '원피스']) {
    await click(`#catTabs [data-cat="${c}"]`);
    const n = await count('#exploreGrid .p-card');
    check('E-C-' + c, '카테고리 ' + c + ' 결과 있음', n > 0, n + '개');
  }
  await click('#catTabs [data-cat="전체"]');
  for (const c of ['AR 시착', '세일', '남성', '여성', '출근', '데이트', '데일리', '여행', '데님', '룩북 실사']) {
    await page.evaluate((chip) => { state.exploreFilter = chip; renderExplore(); }, c);
    const n = await count('#exploreGrid .p-card');
    check('E-F-' + c, '필터 ' + c + ' 결과 있음', n > 0, n + '개');
  }
  await page.evaluate(() => { state.exploreFilter = ''; renderExplore(); });
  await page.type('#searchInput', '데님');
  await sleep(200);
  const searchN = await count('#exploreGrid .p-card');
  check('E-02', '검색 "데님"', searchN > 0, searchN + '개');
  await page.$eval('#searchInput', (e) => { e.value = ''; e.dispatchEvent(new Event('input')); });
  await page.type('#searchInput', 'zzzz');
  await snap('03-explore-empty');
  check('E-03', '검색 결과 없음 안내', await page.$eval('#exploreGrid', (e) => /없/.test(e.textContent)));
  await page.$eval('#searchInput', (e) => { e.value = ''; e.dispatchEvent(new Event('input')); });
  const t0 = await page.evaluate(() => { const t = performance.now(); renderExplore(); return performance.now() - t; });
  check('E-04', '탐색 121종 렌더 < 150ms', t0 < 150, Math.round(t0) + 'ms');

  console.log('\n== 상세 / 장바구니 ==');
  await page.evaluate(() => openProduct('p03'));
  await snap('04-pdp-top');
  await snap('05-pdp-mid', () => page.evaluate(() => { document.getElementById('detailScroll').scrollTop = 700; }));
  await snap('06-pdp-bottom', () => page.evaluate(() => { const d = document.getElementById('detailScroll'); d.scrollTop = d.scrollHeight; }));
  check('P-01', '상세 마지막 콘텐츠가 하단 바에 가리지 않음', await page.evaluate(() => {
    const foot = document.querySelector('.pdp-foot').getBoundingClientRect();
    const scroll = document.getElementById('detailScroll').getBoundingClientRect();
    return scroll.bottom <= foot.top + 1;
  }));
  check('P-02', '후기 문구 중복 없음', await page.$$eval('#reviewList .review', (els) => els.length >= 3 && new Set(els.map((e) => e.textContent)).size === els.length));
  check('P-03', '하단 바: 찜 · AR 시착 · 장바구니', (await count('#btnToggleWish')) + (await count('#btnPdpAR')) + (await count('#btnAddCart')) === 3);
  check('P-04', '미측정 상세: 체형 측정 유도', (await count('#btnPdpMeasure')) === 1);
  await click('#btnAddCart');
  await page.evaluate(() => { closeProduct(); openProduct('g010'); });
  await click('#btnAddCart');
  await page.evaluate(() => closeProduct());
  await snap('07-cart', async () => { await page.evaluate(() => document.querySelector('.js-cart').click()); });
  check('K-01', '장바구니 2건 + 합계', (await count('#cartList .cart-line')) === 2 && /\d/.test(await page.$eval('#cartTotal', (e) => e.textContent)));
  await click('#btnCheckout');
  await sleep(400);
  await page.evaluate(() => closeCart());

  console.log('\n== AR 탭 ==');
  await tab('ar');
  await page.evaluate(() => arSetMode('sample'));
  await page.waitForFunction(() => AR.mode === 'sample' && !!AR.kp, { timeout: 30000 });
  await page.evaluate(() => { AR.outfit = { top: null, bottom: null }; arPut(arItem('p04')); arPut(arItem('p05')); arRenderRail(); });
  await snap('08-ar-tryon');
  check('A-01', 'AR 탭 다크 테마 + 시착/측정 세그먼트', await page.evaluate(() => document.getElementById('app').classList.contains('dark') && document.querySelectorAll('#arSeg [data-view]').length === 2));
  check('A-02', '사이즈 S~XL + 추천 뱃지', (await count('#arSizes button')) === 4);
  await page.evaluate(() => { AR.srcPose = AR.srcPose.concat([['left_elbow', 640, 120], ['left_wrist', 700, -40], ['right_elbow', 60, 250], ['right_wrist', -130, 255]].map(([name, x, y]) => ({ name, x, y, score: 0.9 }))); });
  await sleep(500);
  await snap('09-ar-arms');
  check('A-03', '팔 관절 추적 → 소매 분리 렌더', await page.evaluate(() => !!(AR.kp && AR.kp.le && AR.kp.re)));
  const sleeve = await page.evaluate(() => {
    arRender();
    const cv = document.getElementById('arCanvas'), g = cv.getContext('2d'), K = AR.kp;
    const lum = (p) => { const d = g.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data; return d[0] * 0.3 + d[1] * 0.59 + d[2] * 0.11; };
    const a = AR.assets.p04, pl = lerpPt(K.ls, K.le, 0.6), pr = lerpPt(K.rs, K.re, 0.6);
    const out = { rig: !!(a && a.rig), l: lum(pl), r: lum(pr) };
    const saved = a.rig; a.rig = null; arRender();
    out.l0 = lum(pl); out.r0 = lum(pr);
    a.rig = saved; arRender();
    return out;
  });
  check('A-03b', '실사 옷 소매가 든 팔을 따라감 (리깅 끄면 같은 자리가 배경)', sleeve.rig && sleeve.l < 170 && sleeve.r < 170 && Math.max(sleeve.l0 - sleeve.l, sleeve.r0 - sleeve.r) > 40, JSON.stringify(sleeve));
  const pc = await page.evaluate(() => {
    const size = (el) => { const r = el.getBoundingClientRect(), s = r.width / el.offsetWidth || 1; return [r.width / s, r.height / s]; };
    const navs = ['arPrev', 'arNext'].map((id) => document.getElementById(id));
    const tools = [...document.querySelectorAll('.ar-tools button')];
    return {
      navs: navs.every((b) => b && size(b)[0] >= 28 && size(b)[1] >= 40),
      tools: tools.length === 4 && tools.every((b) => size(b)[0] >= 32 && b.getAttribute('aria-label')),
      cats: [...document.querySelectorAll('#arCats [data-cat]')].map((b) => b.textContent),
      add: !!document.querySelector('#arRail #arAddGarment'),
    };
  });
  check('A-07', 'PC 조작: ‹ › 버튼 · 카테고리 칩(내 옷은 등록 전 숨김)', pc.navs && pc.cats.length === 4 && !pc.cats.includes('내 옷'), JSON.stringify(pc));
  check('A-08', '전체화면 · 제스처 · 핏 표시 · 음성 토글 (라벨 포함)', pc.tools, JSON.stringify(pc));
  check('A-09', '레일 끝 "+ 옷 등록" (사진으로 내 옷 추가)', pc.add);
  await page.evaluate(() => { state.arCat = '원피스·전신'; arRenderCats(); arRenderRail(); });
  await snap('09b-ar-cat-full');
  check('A-10', '카테고리 전환 시 레일 필터', await page.evaluate(() => [...document.querySelectorAll('#arRail [data-ar]')].every((b) => arItem(b.dataset.ar).ar.slot === 'full')));
  await page.evaluate(() => { state.arCat = '전체'; arRenderCats(); arRenderRail(); });
  await click('#arSeg [data-view="measure"]');
  await snap('10-ar-measure');
  check('A-04', '측정 패널: 성별·키·몸무게 + 카메라/사진/입력 측정', (await count('#genderSelect')) + (await count('#heightInput')) + (await count('#weightInput')) + (await count('#btnMeasureStart')) + (await count('#btnMeasurePhoto')) + (await count('#btnMeasureInput')) === 6);
  await page.$eval('#heightInput', (e) => { e.value = ''; });
  await page.type('#heightInput', '182');
  await page.$eval('#weightInput', (e) => { e.value = ''; });
  await page.type('#weightInput', '78');
  await click('#btnMeasureInput');
  await sleep(500);
  await page.evaluate(() => { document.getElementById('arMeasurePanel').scrollTop = 9999; });
  await snap('11-ar-measure-result');
  check('A-05', '입력값 추정 결과 카드 + 사이즈', await page.evaluate(() => !document.getElementById('measureResult').hidden && state.measure.method === 'input' && state.height === 182 && !!state.measure.sizes.top));
  check('A-06', '입력 추정은 EXP 미지급(카메라/사진만)', await page.evaluate(() => state.measureRewardDate !== todayKey()));

  console.log('\n== 옷장 / MY ==');
  await snap('12-closet', () => tab('closet'));
  check('C-01', '추천 카드 = 실제 판매 상품', await page.evaluate(() => { const cards = [...document.querySelectorAll('#closetRec [data-sel]')]; return cards.length >= 4 && cards.every((c) => CATALOG.some((i) => i.id === c.dataset.sel)); }));
  await page.evaluate(() => document.querySelector('#closetRec [data-sel]').click());
  await snap('13-closet-selected');
  check('C-02', '선택 시 하단 AR/착용 버튼', await page.$eval('#closetDock', (e) => e.classList.contains('show')));
  await click('#btnWear');
  await sleep(300);
  check('C-03', '착용 → 상태 반영', await page.evaluate(() => !!(state.wornCatalog.topId || state.wornCatalog.bottomId)));
  await snap('14-my', () => tab('my'));
  check('M-01', '결제 후 MY > 주문 내역', (await count('#orderList .order-line')) === 1);
  check('M-02', '측정 치수 요약 표시', await page.$eval('#myBody', (e) => /182/.test(e.textContent)));
  check('M-03', '사진으로 등록한 옷: 빈 상태 안내 + 전체 삭제 숨김', await page.evaluate(() => /착용컷/.test(document.getElementById('myWardrobe').textContent) && getComputedStyle(document.getElementById('btnWardrobeClear')).display === 'none'));
  await snap('15-home-after', () => tab('home'));

  console.log('\n== 새로고침 후 상태 유지 ==');
  const pick = () => ({ cart: Object.keys(state.cart).length, wish: state.wishlist.length, h: state.height, lvl: state.level, exp: state.exp, worn: state.wornCatalog, owned: state.ownedIds.length, measure: !!state.measure });
  const before = await page.evaluate(pick);
  await page.reload({ waitUntil: 'networkidle2' });
  const after = await page.evaluate(pick);
  check('S-01', '새로고침 후 레벨/착용/측정/보유 유지', JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }));
  check('S-02', '새로고침 후 키 입력칸 표시값', await page.$eval('#heightInput', (e) => e.value === '182'));

  console.log('\n== 작은 창 축소 ==');
  await page.setViewport({ width: 1280, height: 600, deviceScaleFactor: 1 });
  await sleep(300);
  const fit = await page.evaluate(() => { const r = document.getElementById('app').getBoundingClientRect(); return { h: r.height, w: r.width, top: r.top, bottom: r.bottom }; });
  check('V-01', '높이 600 창에서 폰 전체가 화면 안', fit.bottom <= 600 && fit.top >= 0, JSON.stringify(fit));
  await page.setViewport({ width: 420, height: 820, deviceScaleFactor: 2 });

  console.log('\n== 레이아웃 스캔 ==');
  states.forEach((s) => {
    check('L-' + s.name, '넘침 없음', !s.overflow.length && !s.hscroll.length, [...s.overflow, ...s.hscroll].slice(0, 6).join(', '));
    check('I-' + s.name, '깨진 이미지 없음', !s.broken.length, s.broken.slice(0, 4).join(', '));
    if (s.small.length) console.log('  INFO', s.name, '작은 터치 영역:', s.small.slice(0, 8).join(', '));
  });
  const cut = toasts.map((t) => JSON.parse(t)).filter((t) => t.cut);
  check('T-01', '토스트 문구가 잘리지 않음', !cut.length, cut.map((t) => t.text).join(' | '));
  check('X-01', '콘솔/페이지 에러 없음', !errors.length, errors.slice(0, 5).join(' | '));

  fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify({ findings, states }, null, 1));
  console.log('\nPassed:', passed, 'Failed:', failed, '· screenshots:', OUT);
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
