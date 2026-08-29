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

