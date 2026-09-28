/**
 * 전체 화면 QA 감사 (실제 Chrome)
 * 모든 탭/모달/시트/AR 상태를 순회하며 공통 결함을 자동 검출하고 스크린샷을 남깁니다.
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
    await sleep(450);
    await app.screenshot({ path: path.join(OUT, name + '.png') });
    const s = await page.evaluate(scanLayout);
    states.push({ name, ...s });
  }
  const click = (sel) => page.click(sel);
  const tab = (t) => click(`.tab[data-tab="${t}"]`);

  console.log('\n== 화면 순회 ==');
  await snap('01-home');
  await snap('02-body', () => tab('body'));
  await page.$eval('#heightInput', (e) => { e.value = ''; });
  await page.type('#heightInput', '182');
  await page.$eval('#weightInput', (e) => { e.value = ''; });
  await page.type('#weightInput', '78');
  await click('#btnDailyQuest').catch(() => {});
  await page.evaluate(() => { renderHeader(); });
  const typedKept = await page.$eval('#heightInput', (e) => e.value);
  check('B-03', '입력 중인 키 값이 다시 그려도 유지', typedKept === '182', 'value=' + typedKept);
  await page.$eval('#heightInput', (e) => e.dispatchEvent(new Event('change', { bubbles: true })));
  await page.$eval('#weightInput', (e) => e.dispatchEvent(new Event('change', { bubbles: true })));
  check('B-04', '키/몸무게 입력이 상태에 저장', await page.evaluate(() => state.height === 182 && state.weight === 78), JSON.stringify(await page.evaluate(() => [state.height, state.weight])));
  await click('#btnAnalyzeAI');
  await page.waitForFunction(() => !document.getElementById('btnAnalyzeAI').disabled, { timeout: 60000 });
  await snap('03-body-analyzed');
  check('B-05', 'AI 분석(사진 없음) 결과 카드', await page.$eval('#aiResult', (e) => getComputedStyle(e).display !== 'none'));
  await click('#btnRecommend');
  await snap('04-closet-recommended');
  const rec = await page.evaluate(() => [...document.querySelectorAll('#closetGrid .item-card')].map((c) => ({ kind: c.dataset.kind, id: c.dataset.id, name: c.querySelector('.item-name').textContent, img: (c.querySelector('img') || {}).src || '' })));
  check('C-01', '추천 카드 = 실제 판매 상품(이름·이미지 일치)', rec.length >= 4 && rec.every((r) => r.kind === 'rec' ? true : false) && await page.evaluate((list) => list.every((r) => { const it = CATALOG.find((c) => c.id === r.id); return it && it.name === r.name && r.img.endsWith(it.image.replace(/^\.\//, '').slice(-22)); }), rec), JSON.stringify(rec.slice(0, 3)));
  const firstRec = await page.$('#closetGrid .item-card');
  if (firstRec) await firstRec.click();
  await snap('05-closet-selected');
  check('C-02', '추천 상품 선택 시 AR 버튼 노출', await page.$eval('#btnClosetAR', (e) => getComputedStyle(e).display !== 'none'));
  await click('#btnWear');
  await sleep(300);
  check('C-03', '추천 상품 착용 → 아바타/착용 상태 반영', await page.evaluate(() => !!(state.wornCatalog.topId || state.wornCatalog.bottomId)));

  await snap('06-explore', () => tab('explore'));
  for (const s of ['best', 'rising', 'sale', 'fit', 'reviews', 'low', 'high', 'recommend']) {
    await click(`#sortRow [data-sort="${s}"]`);
    const n = await page.$$eval('#exploreGrid .shop-card', (e) => e.length);
    check('E-S-' + s, '정렬 ' + s + ' 결과 있음', n > 0, n + '개');
  }
  for (const c of ['AR 피팅', '룩북 실사', '남성', '여성', '상의', '아우터', '하의', '원피스', '데님', '출근', '데이트', '데일리', '여행']) {
    await page.evaluate((chip) => { state.exploreFilter = chip; renderExplore(); }, c);
    const n = await page.$$eval('#exploreGrid .shop-card', (e) => e.length);
    check('E-F-' + c, '필터 ' + c + ' 결과 있음', n > 0, n + '개');
  }
  await page.evaluate(() => { state.exploreFilter = '전체'; renderExplore(); });
  await page.type('#searchInput', '데님');
  await sleep(200);
  const searchN = await page.$$eval('#exploreGrid .shop-card', (e) => e.length);
  check('E-02', '검색 "데님"', searchN > 0, searchN + '개');
  await page.$eval('#searchInput', (e) => { e.value = ''; e.dispatchEvent(new Event('input')); });
  await page.type('#searchInput', 'zzzz');
  await snap('07-explore-empty');
  await page.$eval('#searchInput', (e) => { e.value = ''; e.dispatchEvent(new Event('input')); });
  const t0 = await page.evaluate(() => { const t = performance.now(); renderExplore(); return performance.now() - t; });
  check('E-03', '탐색 121종 렌더 < 150ms', t0 < 150, Math.round(t0) + 'ms');

  await page.evaluate(() => openProduct('p03'));
  await snap('08-pdp-top');
  await snap('09-pdp-mid', () => page.evaluate(() => { document.getElementById('detailScroll').scrollTop = 600; }));
  await snap('10-pdp-bottom', () => page.evaluate(() => { const d = document.getElementById('detailScroll'); d.scrollTop = d.scrollHeight; }));
  check('P-01', '상세 하단 콘텐츠가 고정 버튼에 가리지 않음', await page.evaluate(() => {
    const foot = document.querySelector('.detail-foot').getBoundingClientRect();
    const last = document.getElementById('btnToggleWish').getBoundingClientRect();
    return last.bottom <= foot.top + 1;
  }));
  check('P-02', '상세 사이즈 추천이 입력 키(182) 반영', await page.$eval('#sizeRec', (e) => e.textContent.includes('182cm')));
  check('P-03', '후기 3건 문구 중복 없음', await page.$$eval('#reviewList .review', (els) => new Set(els.map((e) => e.lastChild.textContent)).size === els.length && els.length === 3));
  check('P-04', '매치 코디 카드(계절 호환) + 보기 버튼', await page.evaluate(() => { const m = matchFor(CATALOG.find((c) => c.id === 'p03')); return !!m && seasonOk(CATALOG.find((c) => c.id === 'p03'), m) && !!document.querySelector('#modalMatch [data-match="view"]'); }));
  await click('#btnAddCart');
  await page.evaluate(() => closeProduct());
  await page.evaluate(() => openProduct('g010'));
  await click('#btnAddCart');
  await page.evaluate(() => closeProduct());
  await snap('11-cart', async () => { await click('#cartFab'); });
  await click('#cartClose');
  await snap('12-quest', async () => { await tab('home'); await click('#btnDailyQuest'); });
  check('Q-01', '퀘스트가 실제 진행 상태 표시(출석·착용 완료)', await page.evaluate(() => document.getElementById('questAttend').classList.contains('done') && document.getElementById('questWear').classList.contains('done') && !document.getElementById('expGain').classList.contains('show')));
  await click('#questClose');
  await page.evaluate(() => { document.getElementById('cartFab').click(); document.getElementById('btnCheckout').click(); document.getElementById('cartClose').click(); });
  await snap('13-settings', () => tab('settings'));
  check('O-01', '결제 후 설정 > 주문 내역 기록', await page.$$eval('#orderList .order-line', (e) => e.length === 1));
  await page.evaluate(() => { openProduct('p04'); });
  await click('#btnPdpAR');
  await page.waitForFunction(() => AR.mode === 'sample' || AR.mode === 'camera', { timeout: 20000 });
  await page.evaluate(() => arSetMode('sample'));
  await page.waitForFunction(() => !!AR.kp, { timeout: 20000 });
  await snap('14-ar-sample');
  await page.evaluate(() => closeAR());
  await page.evaluate(() => { openAR(['g012']); arSetMode('sample'); });
  await page.waitForFunction(() => AR.src && AR.srcPose, { timeout: 20000 });
  await page.evaluate(() => {
    AR.srcPose = AR.srcPose.concat([['left_elbow', 640, 120], ['left_wrist', 700, -40], ['right_elbow', 60, 250], ['right_wrist', -130, 255]]
      .map(([name, x, y]) => ({ name, x, y, score: 0.9 })));
  });
  await sleep(500);
  await snap('15-ar-arms');
  check('A-01', 'AR 팔 관절 추적 → 소매 분리 렌더', await page.evaluate(() => !!(AR.kp && AR.kp.le && AR.kp.re && AR.assets.g012 && AR.assets.g012.split && AR.assets.g012.split.l.ready)));
  await page.evaluate(() => closeAR());
  await page.evaluate(() => closeProduct());

  console.log('\n== 새로고침 후 상태 유지 ==');
  const before = await page.evaluate(() => ({ cart: cartCount(), wish: state.wishlist.length, h: state.height, lvl: state.level, exp: state.exp, worn: state.wornCatalog }));
  await page.reload({ waitUntil: 'networkidle2' });
  const after = await page.evaluate(() => ({ cart: cartCount(), wish: state.wishlist.length, h: state.height, lvl: state.level, exp: state.exp, worn: state.wornCatalog }));
  check('S-01', '새로고침 후 장바구니/키/레벨/착용 유지', JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }));
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
