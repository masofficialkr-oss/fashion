/**
 * LOOKFIT final polish QA
 * node scripts/qa-mvp.js
 */
const fs = require('fs');
const path = require('path');
const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
let passed = 0, failed = 0;
const failures = [];
function assert(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS', name); }
  else { failed++; failures.push({ name, detail }); console.log('  FAIL', name, detail || ''); }
}

console.log('\n== Overlay / Toast layering ==');
assert('toast z-index > modal', /z-index:\s*1200/.test(html) && /z-index:\s*999/.test(html));
assert('exp-gain z-index 1205', /z-index:\s*1205/.test(html));
assert('levelup z-index 1210', /z-index:\s*1210/.test(html));
assert('toast DOM after tabbar (front layer)', html.lastIndexOf('id="toast"') > html.lastIndexOf('class="tabbar"'));
assert('expGain DOM after productModal', html.lastIndexOf('id="expGain"') > html.lastIndexOf('id="productModal"'));

console.log('\n== Feature contracts ==');
assert('owned disabled copy', html.includes('이미 옷장에 보유 중인 상품입니다'));
assert('toCloset disabled CSS', /\.detail-foot \.cta:disabled/.test(html));
assert('photo flash element', html.includes('id="photoFlash"') && html.includes('btnPhotoSave'));
assert('photo toast copy', html.includes('갤러리에 나만의 코디가 저장되었습니다'));
assert('quest modal', html.includes('id="questModal"') && html.includes('일일 퀘스트'));
assert('quest missions hardcoded', html.includes('매일 앱 출석하기') && html.includes('탐색 탭에서 옷 구경하기'));

console.log('\n== JS parse ==');
const script = html.split('<script>').pop().split('</script>')[0];
try { new Function(script); assert('Script parses', true); }
catch (e) { assert('Script parses', false, e.message); }

console.log('\n== Behavioral ==');
let JSDOM;
try { JSDOM = require(path.join(__dirname, '..', 'node_modules', 'jsdom')).JSDOM; }
catch (_) { JSDOM = require('jsdom').JSDOM; }

(async () => {
  const stripped = html.replace(/<script src="https:\/\/cdn[^"]+"><\/script>/g, '');
  const dom = new JSDOM(stripped, { runScripts: 'dangerously', url: 'http://localhost/lookfit/' });
  await new Promise((r) => setTimeout(r, 40));
  const { document } = dom.window;

  document.querySelector('.shop-card').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  document.getElementById('btnAddCart').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  const toast = document.getElementById('toast');
  assert('cart toast visible over modal', toast.classList.contains('show') && toast.textContent.includes('장바구니'));
  const toastZ = Number(dom.window.getComputedStyle(toast).zIndex) || 0;
  const modalZ = Number(dom.window.getComputedStyle(document.getElementById('productModal')).zIndex) || 0;
  assert('toast z >= modal z', toastZ >= modalZ, `toast=${toastZ} modal=${modalZ}`);

  // own item then reopen
  document.getElementById('btnToCloset').disabled = false;
  document.getElementById('btnToCloset').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  document.querySelector('.tab[data-tab="explore"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  document.querySelector('.shop-card').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  const btn = document.getElementById('btnToCloset');
  assert('owned disables closet button', btn.disabled === true && btn.textContent.includes('보유'));

  document.getElementById('modalClose').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  document.querySelector('.tab[data-tab="home"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  document.getElementById('btnPhotoSave').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  assert('photo toast shown', document.getElementById('toast').textContent.includes('갤러리'));

  document.getElementById('btnDailyQuest').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert('quest modal opens', document.getElementById('questModal').classList.contains('show'));
  document.getElementById('questClose').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert('quest modal closes', !document.getElementById('questModal').classList.contains('show'));

  console.log('\n== Catalog (100+ / AR) ==');
  const W = dom.window;
  const click = (el) => el.dispatchEvent(new W.MouseEvent('click', { bubbles: true }));
  const total = W.eval('CATALOG.length');
  const arCount = W.eval('CATALOG.filter((c) => c.ar).length');
  assert('catalog >= 100 items', total >= 100, 'total=' + total);
  assert('AR-capable >= 100', arCount >= 100, 'ar=' + arCount);
  assert('unique ids', W.eval('new Set(CATALOG.map((c) => c.id)).size === CATALOG.length'));
  assert('required fields', W.eval("CATALOG.every((c) => c.name && c.image && c.en && c.kind && c.fitId && c.ideal && c.price > 0 && c.rating && c.reviews)"));
  assert('every fitId maps to FIT_ITEMS', W.eval('CATALOG.every((c) => FIT_ITEMS.some((f) => f.id === c.fitId))'));
  const badSvg = W.eval(`CATALOG.filter((c) => !c.isPhoto).filter((c) => {
    const p = new DOMParser();
    const a = p.parseFromString(decodeURIComponent(c.image.split(',')[1]), 'image/svg+xml');
    const b = p.parseFromString(garmentSVG(c, 'ar'), 'image/svg+xml');
    return a.getElementsByTagName('parsererror').length || b.getElementsByTagName('parsererror').length;
  }).map((c) => c.id)`);
  assert('all generated garment SVGs parse (thumb + AR)', badSvg.length === 0, badSvg.join(','));
  assert('photo AR anchors exist', W.eval("CATALOG.filter((c) => c.isPhoto && c.ar).every((c) => AR_PHOTO_ANCHORS[c.ar.piece] && AR_PHOTO_ANCHORS[c.ar.piece].kp.ls)"));
  const meshOk = W.eval(`(() => { const g = meshGrid(kpPoints(Object.fromEntries(Object.entries(CANON_KP).map(([k, v]) => [k, v.map((n) => n * 3)]))), 1);
    return g.length === 9 && g.every((r) => r.length === 5 && r.every((p) => isFinite(p.x) && isFinite(p.y))); })()`);
  assert('mesh grid 9x5 finite', meshOk);
  const extrap = W.eval(`(() => { const K = arKeypoints([{ name: 'left_shoulder', x: 260, y: 200, score: .9 }, { name: 'right_shoulder', x: 140, y: 200, score: .9 }], (x, y) => Pt(x, y));
    return !!K && K.lh.y > 300 && K.la.y > K.lk.y && K.lk.y > K.lh.y; })()`);
  assert('keypoint extrapolation (shoulders only)', extrap);

  console.log('\n== Explore / PDP / Cart ==');
  click(document.querySelector('.tab[data-tab="explore"]'));
  W.eval("state.exploreFilter = '전체'; state.searchQuery = ''; renderExplore();");
  assert('explore renders all items', document.querySelectorAll('#exploreGrid .shop-card').length === total);
  assert('explore count label', document.getElementById('exploreCount').textContent.includes(String(total)));
  click(document.querySelector('#chipRow [data-chip="AR 피팅"]'));
  assert('AR chip filter', document.querySelectorAll('#exploreGrid .shop-card').length === arCount);
  click(document.querySelector('#sortRow [data-sort="low"]'));
  const prices = [...document.querySelectorAll('#exploreGrid .price')].map((e) => Number(e.textContent.replace(/[^\d]/g, '')));
  assert('low price sort', prices.every((p, i) => !i || prices[i - 1] <= p));
  click(document.querySelector('#chipRow [data-chip="전체"]'));
  click(document.querySelector('#sortRow [data-sort="recommend"]'));
  W.eval("state.cart = {}; state.couponUsed = false; save();");
  const arCard = [...document.querySelectorAll('#exploreGrid .shop-card')].find((c) => W.eval(`!!CATALOG.find((x) => x.id === '${c.dataset.id}').ar`));
  click(arCard);
  await new Promise((r) => setTimeout(r, 20));
  assert('PDP size chips (4) + recommended', document.querySelectorAll('#sizeRow .size-chip').length === 4 && !!document.querySelector('#sizeRow .rec'));
  assert('PDP size table', document.querySelectorAll('#sizeTable tr').length >= 4);
  assert('PDP AI review summary', document.getElementById('reviewSummary').textContent.includes('AI 후기 요약') && document.querySelectorAll('#reviewList .review').length === 3);
  assert('PDP similar rail', document.querySelectorAll('#similarRail .recent-card').length >= 4);
  assert('PDP AR button enabled', document.getElementById('btnPdpAR').disabled === false);
  click(document.querySelector('#sizeRow [data-size="XL"]'));
  click(document.getElementById('btnAddCart'));
  const keys = Object.keys(W.eval('state.cart'));
  assert('cart keyed by size', keys.length === 1 && keys[0].endsWith('::XL'), keys.join(','));
  assert('cart line shows size + coupon', document.getElementById('cartList').textContent.includes('사이즈 XL') && document.getElementById('cartSum').textContent.includes('쿠폰'));
  const noAr = W.eval("CATALOG.find((c) => !c.ar).id");
  W.eval(`openProduct('${noAr}')`);
  assert('PDP AR disabled for non-AR item', document.getElementById('btnPdpAR').disabled === true);

  console.log('\n== AR fitting room ==');
  W.eval(`openProduct('${arCard.dataset.id}')`);
  click(document.getElementById('btnPdpAR'));
  await new Promise((r) => setTimeout(r, 60));
  assert('AR screen opens', document.getElementById('arScreen').classList.contains('show'));
  assert('AR falls back to sample without camera', W.eval("AR.mode") === 'sample' && !!document.querySelector('#arModes [data-mode="sample"].active'));
  assert('AR outfit has product', W.eval(`AR.outfit.top === '${arCard.dataset.id}' || AR.outfit.bottom === '${arCard.dataset.id}'`));
  assert('AR rail items', document.querySelectorAll('#arRail .ar-item').length >= 10);
  assert('AR size chips', document.querySelectorAll('#arSizes .ar-chip').length === 4);
  const bottomId = W.eval("AR.railIds.find((id) => arItem(id).ar.slot === 'bottom')");
  click(document.querySelector(`#arRail [data-ar="${bottomId}"]`));
  assert('AR toggle bottom slot', W.eval('AR.outfit.bottom') === bottomId);
  const fullId = W.eval("AR.railIds.find((id) => arItem(id).ar.slot === 'full')");
  if (fullId) {
    click(document.querySelector(`#arRail [data-ar="${fullId}"]`));
    assert('AR full-length clears bottom', W.eval('AR.outfit.top') === fullId && W.eval('AR.outfit.bottom') === null);
  }
  W.eval("state.cart = {}; save();");
  click(document.getElementById('arToCart'));
  assert('AR outfit to cart', Object.keys(W.eval('state.cart')).length >= 1);
  click(document.getElementById('arClose'));
  await new Promise((r) => setTimeout(r, 30));
  assert('AR screen closes', !document.getElementById('arScreen').classList.contains('show') && W.eval('AR.open') === false);
  click(document.getElementById('modalClose'));

  console.log('\n== Saved-data migration ==');
  W.eval(`localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart: { m01: 2, '${arCard.dataset.id}': 1 }, wishlist: ['w03', '${arCard.dataset.id}'], ownedIds: ['m05'], recentIds: ['m02'] })); load();`);
  assert('stale ids dropped + cart migrated', W.eval(`JSON.stringify(state.cart) === JSON.stringify({ '${arCard.dataset.id}::M': 1 }) && state.wishlist.length === 1 && state.ownedIds.length === 0 && state.recentIds.length === 0`));
  W.eval('save(); renderAll();');

  document.querySelector('.tab[data-tab="settings"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  assert('settings active', !!document.querySelector('.screen[data-screen="settings"].active'));
  assert('FAB hidden on settings', document.getElementById('cartFab').classList.contains('fab-hidden'));
  const resetBtn = document.getElementById('btnReset');
  const resetCs = dom.window.getComputedStyle(resetBtn);
  assert('reset pointer-events auto', resetCs.pointerEvents !== 'none');
  assert('reset not disabled', resetBtn.disabled === false);
  const ls = dom.window.localStorage;
  ls.setItem('lookfit-demo-v5', JSON.stringify({ exp: 1 }));
  // Prevent navigation noise in jsdom
  try {
    Object.defineProperty(dom.window.location, 'reload', { configurable: true, value: () => {} });
  } catch (_) {}
  resetBtn.click();
  await new Promise((r) => setTimeout(r, 80));
  assert('reset clears lookfit storage', ls.getItem('lookfit-demo-v5') === null);

  console.log('\n== Summary ==');
  console.log('Passed:', passed, 'Failed:', failed);
  try { dom.window.close(); } catch (_) {}
  if (failed) process.exit(1);
  console.log('All QA checks green.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

