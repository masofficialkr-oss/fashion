/**
 * LOOKFIT 동작 QA (jsdom) — 구조 · 카탈로그 · 탐색/PDP/장바구니 · AR 탭 · 체형 측정 수식 · 인식 학습 · 캐릭터 성장 · 저장 데이터
 * node scripts/qa-mvp.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let passed = 0, failed = 0;
function assert(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS', name); }
  else { failed++; console.log('  FAIL', name, detail || ''); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n== 구조 / 삭제된 기능 ==');
const script = html.split('<script>').pop().split('</script>')[0];
try { new Function(script); assert('스크립트 파싱', true); } catch (e) { assert('스크립트 파싱', false, e.message); }
assert('정적 tfjs 스크립트 태그 없음 (필요 시 동적 로드)', !/<script src=/.test(html));
assert('Decart 제거', !/decart/i.test(html));
assert('퀘스트/탐색 EXP/HUD 제거', !/questModal|expGain|hud-exp|EXPLORE_EXP|checkAttendance/.test(html));
assert('가짜 사진 저장 · 곰 아바타 · 슬라이더 · 구 체형 분석 제거', !/btnPhotoSave|avatarSVG|type="range"|runAIAnalysis|analyzeWithPose|photoInput/.test(html));
assert('AR 오버레이(arScreen/arClose) 제거 → 탭', !/arScreen|arClose/.test(html));
const tabs = [...html.matchAll(/class="tab[^"]*" data-tab="(\w+)"/g)].map((m) => m[1]);
assert('탭 5개: 홈·탐색·AR·옷장·MY', tabs.join(',') === 'home,explore,ar,closet,my', tabs.join(','));
assert('Pretendard 폰트', html.includes('pretendardvariable'));
assert('MediaPipe Pose Landmarker 모델', html.includes('tasks-vision@1.0.1') && html.includes('pose_landmarker_full'));
assert('룩키 캐릭터 에셋', fs.existsSync(path.join(ROOT, 'assets', 'char', 'looky.png')) && html.includes('CHAR_MODEL'));

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules', 'jsdom'))); } catch (_) { ({ JSDOM, VirtualConsole } = require('jsdom')); }

(async () => {
  const vc = new VirtualConsole();
  const pageErrors = [];
  vc.on('jsdomError', (e) => { if (!/Not implemented|Could not load/.test(e.message)) pageErrors.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/lookfit/', virtualConsole: vc, pretendToBeVisual: true });
  await sleep(50);
  const W = dom.window, { document } = W;
  const $ = (id) => document.getElementById(id);
  const click = (el) => el.dispatchEvent(new W.MouseEvent('click', { bubbles: true }));
  const ev = (s) => W.eval(s);
  const tab = (name) => click(document.querySelector(`.tab[data-tab="${name}"]`));

  console.log('\n== 카탈로그 (100+ / AR) ==');
  const total = ev('CATALOG.length'), arCount = ev('CATALOG.filter((c) => c.ar).length');
  assert('상품 100개 이상', total >= 100, 'total=' + total);
  assert('AR 시착 가능 100개 이상', arCount >= 100, 'ar=' + arCount);
  assert('id 중복 없음', ev('new Set(CATALOG.map((c) => c.id)).size === CATALOG.length'));
  assert('필수 필드', ev('CATALOG.every((c) => c.name && c.image && c.kind && c.ideal && c.price > 0 && c.rating && c.reviews)'));
  const badSvg = ev(`CATALOG.filter((c) => !c.isPhoto).filter((c) => {
    const p = new DOMParser();
    return ['ar', 'ar-body', 'ar-l'].concat([null]).some((m) => p.parseFromString(m ? garmentSVG(c, m) : decodeURIComponent(c.image.split(',')[1]), 'image/svg+xml').getElementsByTagName('parsererror').length);
  }).map((c) => c.id)`);
  assert('생성 의상 SVG 전부 파싱 (썸네일 + AR 레이어)', badSvg.length === 0, badSvg.join(','));
  assert('실사 AR 앵커', ev('CATALOG.filter((c) => c.isPhoto && c.ar).every((c) => AR_PHOTO_ANCHORS[c.ar.piece] && AR_PHOTO_ANCHORS[c.ar.piece].kp.ls)'));
  assert('메쉬 9x5 유한값', ev(`(() => { const g = meshGrid(kpPoints(Object.fromEntries(Object.entries(CANON_KP).map(([k, v]) => [k, v.map((n) => n * 3)]))), 1);
    return g.length === 9 && g.every((r) => r.length === 5 && r.every((p) => isFinite(p.x) && isFinite(p.y))); })()`));

  console.log('\n== 탐색 ==');
  tab('explore');
  assert('탐색 탭 활성', !!document.querySelector('.screen[data-screen="explore"].active'));
  assert('전체 상품 카드', document.querySelectorAll('#exploreGrid .p-card').length === total);
  assert('상품 수 표시', $('exploreCount').textContent.includes(String(total)));
  assert('측정 전엔 체형% 숨김', !document.querySelector('#exploreGrid .fit-pill'));
  assert('측정 전엔 "내 체형순" 정렬 없음', !document.querySelector('#sortSelect option[value="fit"]'));
  click(document.querySelector('#catTabs [data-cat="하의"]'));
  assert('카테고리 탭: 하의만', ev("filteredCatalog().every((i) => i.kind === 'bottom')") && document.querySelectorAll('#exploreGrid .p-card').length === ev("CATALOG.filter((i) => i.kind === 'bottom').length"));
  click(document.querySelector('#catTabs [data-cat="전체"]'));
  click(document.querySelector('#chipRow [data-chip="AR 시착"]'));
  assert('AR 시착 필터', document.querySelectorAll('#exploreGrid .p-card').length === arCount);
  click(document.querySelector('#chipRow [data-chip="AR 시착"]'));
  assert('필터 칩 다시 누르면 해제', ev("state.exploreFilter === ''") && document.querySelectorAll('#exploreGrid .p-card').length === total);
  const sel = $('sortSelect'); sel.value = 'low'; sel.dispatchEvent(new W.Event('change', { bubbles: true }));
  const prices = ev('filteredCatalog().map(salePrice)');
  assert('낮은 가격순', prices.every((p, i) => !i || prices[i - 1] <= p));
  sel.value = 'recommend'; sel.dispatchEvent(new W.Event('change', { bubbles: true }));
  const heart = document.querySelector('#exploreGrid [data-wish]');
  const wid = heart.dataset.wish;
  click(heart);
  assert('카드 하트 → 찜 (상세 안 열림)', ev(`state.wishlist.includes('${wid}')`) && !$('productModal').classList.contains('show'));
  ev("state.searchQuery = 'zzzz'; renderExplore();");
  assert('검색 결과 없음 + 초기화 버튼', !!$('btnExploreReset'));
  click($('btnExploreReset'));
  assert('초기화 후 전체 목록', ev("state.searchQuery === ''") && document.querySelectorAll('#exploreGrid .p-card').length === total);
  ev("state.searchQuery = '데님'; save(); load();"); $('searchInput').value = ''; ev('renderExplore()');
  assert('저장된 검색어 복원', $('searchInput').value === '데님');
  ev("state.searchQuery = ''; renderExplore();");

  console.log('\n== 상품 상세 / 장바구니 ==');
  ev('state.cart = {}; state.couponUsed = false; save(); renderCartBadge();');
  const arCard = [...document.querySelectorAll('#exploreGrid .p-card')].find((c) => ev(`!!arItem('${c.dataset.id}').ar`));
  click(arCard);
  assert('상세 열림', $('productModal').classList.contains('show'));
  assert('사이즈 4칩 + 추천', document.querySelectorAll('#sizeRow .size-chip').length === 4 && !!document.querySelector('#sizeRow .rec'));
  assert('사이즈표', document.querySelectorAll('#sizeTable tr').length >= 4);
  assert('AI 후기 요약 + 후기 3개', $('reviewSummary').textContent.includes('AI 후기 요약') && document.querySelectorAll('#reviewList .review').length === 3);
  assert('비슷한 상품 레일', document.querySelectorAll('#similarRail .mini-card').length >= 4);
  assert('측정 전 → 체형 측정 CTA', !!$('btnPdpMeasure'));
  assert('AR 시착 버튼 활성 + 히어로 배지', !$('btnPdpAR').disabled && $('btnHeroAR').style.display !== 'none');
  assert('첫 구매 쿠폰 안내', $('modalCoupon').textContent.includes('쿠폰'));
  click(document.querySelector('#sizeRow [data-size="XL"]'));
  click($('btnAddCart'));
  const keys = Object.keys(ev('state.cart'));
  assert('장바구니 키에 사이즈', keys.length === 1 && keys[0].endsWith('::XL'), keys.join(','));
  assert('장바구니 배지', document.querySelector('.js-cart-count').textContent === '1');
  const wasWished = ev(`state.wishlist.includes('${arCard.dataset.id}')`);
  click($('btnToggleWish'));
  if (wasWished) click($('btnToggleWish'));
  assert('하단 찜 버튼 토글', $('btnToggleWish').classList.contains('on') && ev(`state.wishlist.includes('${arCard.dataset.id}')`));
  click($('btnToCloset'));
  assert('내 옷장에 추가', ev(`state.ownedIds.includes('${arCard.dataset.id}')`) && $('btnToCloset').disabled);
  ev(`CATALOG.push({ ...CATALOG[0], id: 'qa_noar', ar: null }); openProduct('qa_noar')`);
  assert('AR 미지원 상품은 버튼 비활성', $('btnPdpAR').disabled && $('btnHeroAR').style.display === 'none');
  ev(`CATALOG.splice(CATALOG.findIndex((c) => c.id === 'qa_noar'), 1); openProduct('${arCard.dataset.id}')`);
  assert('사진 파이프라인으로 만든 판초·트라우저도 AR 지원', ev(`['p08','p09'].every((id) => { const a = arItem(id); return a && a.ar && AR_PHOTO_ANCHORS[a.ar.piece]; })`));
  click(document.querySelector('#productModal .js-cart'));
  assert('장바구니 시트 열림', $('cartSheet').classList.contains('show') && $('cartList').textContent.includes('사이즈 XL') && $('cartSum').textContent.includes('쿠폰'));
  click($('cartClose'));

  console.log('\n== AR 탭: 가상 시착 ==');
  ev(`openProduct('${arCard.dataset.id}')`);
  click($('btnPdpAR'));
  await sleep(30);
  assert('AR 탭 전환 + 다크 테마', !!document.querySelector('.screen[data-screen="ar"].active') && $('app').classList.contains('dark') && !$('productModal').classList.contains('show'));
  assert('카메라 없으면 샘플 모델', ev('AR.mode') === 'sample' && !!document.querySelector('#arModes [data-mode="sample"].active'));
  assert('선택 상품 착용', ev(`AR.outfit.top === '${arCard.dataset.id}' || AR.outfit.bottom === '${arCard.dataset.id}'`));
  assert('시착 레일 10개 이상', document.querySelectorAll('#arRail .ar-item').length >= 10);
  assert('사이즈 칩 4개', document.querySelectorAll('#arSizes .ar-chip').length === 4);
  const bottomId = ev("AR.railIds.find((id) => arItem(id).ar.slot === 'bottom')");
  click(document.querySelector(`#arRail [data-ar="${bottomId}"]`));
  assert('하의 슬롯 토글', ev('AR.outfit.bottom') === bottomId);
  const fullId = ev("AR.railIds.find((id) => arItem(id).ar.slot === 'full')");
  if (fullId) { click(document.querySelector(`#arRail [data-ar="${fullId}"]`)); assert('전신 의상은 하의 해제', ev('AR.outfit.top') === fullId && ev('AR.outfit.bottom') === null); }
  ev('state.cart = {}; save();');
  click($('arToCart'));
  assert('AR 코디 장바구니', Object.keys(ev('state.cart')).length >= 1);
  tab('home');
  await sleep(20);
  assert('탭 이탈 시 AR 종료', ev('AR.open') === false && ev('AR.mode') === null && !$('app').classList.contains('dark'));
  ev("openProduct('p01')");
  const matchAr = document.querySelector('#modalMatch [data-match="ar"]');
  assert('함께 입기 코디 → 같이 AR', !!matchAr);
  click(matchAr);
  assert('상·하의 동시 착용', ev("AR.outfit.top === 'p01' && !!AR.outfit.bottom"));
  tab('home');

  console.log('\n== 체형 측정: 수식 ==');
  const prior = ev("bodyPrior(175, 70, 'M').v");
  assert('사전 추정치 범위 (175/70 남)', prior.chest > 88 && prior.chest < 102 && prior.waist > 72 && prior.waist < 88 && prior.shoulder > 40 && prior.shoulder < 50, JSON.stringify(prior));
  const fused = ev(`(() => { const s = Array.from({ length: 20 }, (_, i) => ({ chestB: 30 + (i % 3) * 0.2, shoulder: 44 + (i % 2) * 0.3 }));
    return measureFuse(s, 175, 70, 'M', 'camera'); })()`);
  assert('카메라 샘플이 많으면 실측 쪽으로 융합', fused.src.chest === 'camera' && fused.err.chest < ev("bodyPrior(175,70,'M').s.chest") && Math.abs(fused.values.shoulder - 44.1) < 1.5, JSON.stringify(fused.values));
  assert('카메라에 없는 치수는 입력값 추정', fused.src.hip === 'input' && fused.values.hip === Math.round(ev("bodyPrior(175,70,'M').v.hip") * 10) / 10);
  const outlier = ev(`(() => { const s = Array.from({ length: 15 }, () => ({ shoulder: 44 })); s.push({ shoulder: 90 }, { shoulder: 10 }); return measureFuse(s, 175, 70, 'M', 'camera').values.shoulder; })()`);
  assert('튀는 프레임에 강건(중앙값)', Math.abs(outlier - 44) < 1.5, outlier);
  const frame = ev(`(() => {
    const w = 640, h = 480, data = new Float32Array(w * h);
    const fill = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * w + x] = 1; };
    fill(300, 30, 340, 95); fill(270, 95, 370, 240); fill(282, 240, 318, 450); fill(322, 240, 358, 450);
    fill(380, 100, 400, 230); fill(240, 100, 260, 230);
    const P = { nose: [320, 62], left_shoulder: [360, 105], right_shoulder: [280, 105], left_elbow: [390, 165], right_elbow: [250, 165], left_wrist: [392, 225], right_wrist: [248, 225],
      left_hip: [345, 235], right_hip: [295, 235], left_knee: [342, 335], right_knee: [298, 335], left_ankle: [340, 430], right_ankle: [300, 430] };
    const kps = Object.entries(P).map(([name, [x, y]]) => ({ name, x, y, score: 0.95 }));
    const open = measureFrame({ w, h, keypoints: kps, mask: { data, w, h } }, 170);
    fill(260, 100, 380, 230);
    const closedKps = kps.map((p) => /elbow|wrist/.test(p.name) ? { ...p, x: p.x < 320 ? 268 : 372 } : p);
    const closed = measureFrame({ w, h, keypoints: closedKps, mask: { data, w, h } }, 170);
    return { open, closed };
  })()`);
  assert('단일 프레임 실측 (A자 자세: 마스크 폭 → cm)', typeof frame.open === 'object' && frame.open.shoulder > 30 && frame.open.shoulder < 45 && frame.open.chestB > 25 && frame.open.hipB > 25 && frame.open.leg > 60 && frame.open.arm > 40 && !frame.open.armsClosed, JSON.stringify(frame.open));
  assert('팔이 몸에 붙으면 폭 측정 제외 + 안내', frame.closed.armsClosed === true && !frame.closed.chestB && !frame.closed.waistB && frame.closed.leg > 60, JSON.stringify(frame.closed));
  const kpList = (arr) => JSON.stringify(arr.map(([name, x, y]) => ({ name, x, y, score: 0.9 })));
  const base = [['nose', 320, 60], ['left_shoulder', 360, 105], ['right_shoulder', 280, 105], ['left_hip', 345, 235], ['right_hip', 295, 235]];
  const near = ev(`measureFrame({ w: 640, h: 480, keypoints: ${kpList([...base, ['left_knee', 342, 335], ['right_knee', 298, 335], ['left_ankle', 340, 478], ['right_ankle', 300, 478]])} }, 170)`);
  assert('발이 잘려도 무릎까지 보이면 근거리 측정(다리 제외)', typeof near === 'object' && !near.leg && !near.hipR && near.torso > 35 && near.torso < 70, JSON.stringify(near));
  assert('무릎이 안 보이면 뒤로 가라는 안내', /뒤로/.test(ev(`measureFrame({ w: 640, h: 480, keypoints: ${kpList(base)} }, 170)`)));
  assert('측정 범위 판정 (전신/근거리/상반신)', ev(`[measureRange({ w: 640, h: 480, keypoints: ${kpList([...base, ['left_knee', 342, 335], ['right_knee', 298, 335], ['left_ankle', 340, 430], ['right_ankle', 300, 430]])} }), measureRange({ w: 640, h: 480, keypoints: ${kpList([...base, ['left_knee', 342, 335], ['right_knee', 298, 335]])} }), measureRange({ w: 640, h: 480, keypoints: ${kpList(base)} })].join()`) === 'full,near,half');
  assert('전신 프레임으로 정수리~골반 비율 학습', typeof frame.open.hipR === 'number' && ev(`(() => { const b = learnModel().hipR; learnHipRatio(0.5); const a = learnModel().hipR; return a > b; })()`));
  const types = ev(`[
    measureBodyType({ height: 175, values: { chest: 104, waist: 80, hip: 92, shoulder: 47 } }).type,
    measureBodyType({ height: 165, values: { chest: 86, waist: 70, hip: 97, shoulder: 38 } }).type,
    measureBodyType({ height: 165, values: { chest: 92, waist: 90, hip: 96, shoulder: 41 } }).type,
  ]`);
  assert('체형 분류 규칙', types[0] === '역삼각형' && types[1].startsWith('삼각형') && types[2] === '라운드', types.join(','));

  console.log('\n== 체형 측정: 흐름 ==');
  openMeasure: {
    ev("openAR(null, 'measure')");
    await sleep(20);
    assert('측정 뷰', !$('arMeasurePanel').hidden && $('arTryPanel').hidden && document.querySelector('#arSeg [data-view="measure"]').classList.contains('active'));
    $('heightInput').value = '176'; $('heightInput').dispatchEvent(new W.Event('change', { bubbles: true }));
    $('weightInput').value = '72'; $('weightInput').dispatchEvent(new W.Event('change', { bubbles: true }));
    const expBefore = ev('state.exp + state.level * 100');
    click($('btnMeasureStart'));
    assert('카메라 없으면 측정 대기 대신 안내', ev('MEASURE.countdown') === 0 && !ev('MEASURE.armed') && $('toast').textContent.includes('카메라'));
    click($('btnMeasureInput'));
    const m = ev('state.measure');
    assert('입력값 추정 결과 저장', m && m.method === 'input' && m.height === 176 && m.weight === 72 && m.sizes.top && m.sizes.bottom);
    assert('결과 카드 (치수 6 + 사이즈)', !$('measureResult').hidden && document.querySelectorAll('#measureResult .metrics div').length === 6 && $('measureResult').textContent.includes('상의'));
    assert('입력값 추정은 EXP 없음(카메라/사진만)', ev('state.exp + state.level * 100') === expBefore);
    assert('추천 6개 재계산', ev('state.recommendedIds.length') === 6);
    assert('사이즈 추천이 측정값 사용', ev("recommendSize(CATALOG.find((c) => c.kind === 'bottom' && c.fitStyle !== '오버핏'))") === m.sizes.bottom);
    click(document.querySelector('#arSeg [data-view="tryon"]'));
    assert('시착 뷰 복귀', $('arMeasurePanel').hidden && !$('arTryPanel').hidden);
  }
  tab('explore');
  assert('측정 후 체형% 배지 + 체형순 정렬', !!document.querySelector('#exploreGrid .fit-pill') && !!document.querySelector('#sortSelect option[value="fit"]'));
  ev("openProduct('p04')");
  assert('측정 후 PDP 적합도 박스', !!document.querySelector('#modalFit .fit-box .score') && $('sizeRec').textContent.includes('측정'));
  ev('closeProduct()');

  console.log('\n== AR 인식: 필터 · 학습 · 이상치 ==');
  const jitter = ev(`(() => { const f = {}; let inV = 0, outV = 0, prevIn = 100, prevOut = 100;
    for (let i = 0; i < 90; i++) { const v = 100 + (i % 2 ? 6 : -6); const o = oneEuro(f, v, i * 33); if (i > 30) { inV += Math.abs(v - prevIn); outV += Math.abs(o - prevOut); } prevIn = v; prevOut = o; }
    return { inV, outV }; })()`);
  assert('One-Euro: 정지 시 떨림 감소', jitter.outV < jitter.inV * 0.5, JSON.stringify(jitter));
  const lag = ev(`(() => { const f = {}; let o = 0; for (let i = 0; i < 30; i++) o = oneEuro(f, i * 20, i * 33); return 29 * 20 - o; })()`);
  assert('One-Euro: 빠른 이동은 지연 작음', lag < 40, lag);
  ev('state.learn = learnDefaults();');
  const learned = ev(`(() => {
    const kp = [['left_shoulder', 260, 200], ['right_shoulder', 140, 200], ['left_hip', 240, 400], ['right_hip', 160, 400], ['left_knee', 240, 540], ['right_knee', 160, 540], ['left_ankle', 240, 680], ['right_ankle', 160, 680]]
      .map(([name, x, y]) => ({ name, x, y, score: .95 }));
    for (let i = 0; i < 60; i++) { const info = {}; const K = arKeypoints(kp, (x, y) => Pt(x, y), info); learnUpdate(K, info); }
    const L = learnModel();
    const info = {}; const K2 = arKeypoints(kp.slice(0, 2), (x, y) => Pt(x, y), info);
    return { n: L.n, torso: L.torso, hipW: L.hipW, thigh: L.thigh, hipY: K2.lh.y, real: info.real.hips };
  })()`);
  assert('사용자 비율 학습 (상체/골반/허벅지)', learned.n === 60 && Math.abs(learned.torso - 200 / 120) < 0.05 && Math.abs(learned.hipW - 80 / 120) < 0.05 && Math.abs(learned.thigh - 140 / 120) < 0.05, JSON.stringify(learned));
  assert('가려진 골반을 학습 비율로 추정', !learned.real && Math.abs(learned.hipY - 400) < 12, learned.hipY);
  assert('측면/비정면 프레임은 학습 제외', ev(`(() => { const n = learnModel().n; const kp = [['left_shoulder', 200, 150], ['right_shoulder', 140, 230], ['left_hip', 210, 400], ['right_hip', 160, 420]].map(([name, x, y]) => ({ name, x, y, score: .95 })); const info = {}; const K = arKeypoints(kp, (x, y) => Pt(x, y), info); learnUpdate(K, info); return learnModel().n === n; })()`));
  assert('어깨폭 급변 프레임 무시', ev(`(() => { AR.fit = { r: { x: 0, y: 0, s: 1 }, W: 1000, mirror: false }; AR.kp = null; AR.filt = {}; AR.jump = 0; AR.view = 'measure';
    const mk = (s) => ({ keypoints: [['left_shoulder', 500 + s, 200], ['right_shoulder', 500 - s, 200]].map(([name, x, y]) => ({ name, x, y, score: .9 })) });
    arOnPose(mk(60)); const a = AR.kp.ls.x; arOnPose(mk(150)); const b = AR.kp.ls.x; return a === 560 && b === 560; })()`));
  assert('팔꿈치/손목 앵커 + 비정상 손목 제외', ev(`(() => { const K = arKeypoints([['left_shoulder', 260, 200], ['right_shoulder', 140, 200], ['left_hip', 240, 380], ['right_hip', 160, 380], ['left_elbow', 330, 120], ['left_wrist', 360, 20], ['right_elbow', 60, 200], ['right_wrist', 70, 900]].map(([name, x, y]) => ({ name, x, y, score: .9 })), (x, y) => Pt(x, y)); return !!(K.le && K.lw && K.re) && !K.rw; })()`));
  assert('소매 레이어 분리 + 루즈핏 오프셋', ev("(() => { const t = CATALOG.find((c) => c.typeKey === 'longsleeve'), hd = CATALOG.find((c) => c.typeKey === 'hoodie'), ot = CATALOG.find((c) => c.typeKey === 'otee'); const n = (m) => (garmentSVG(t, m).match(/<path/g) || []).length; return n('ar-l') === n('ar-r') && n('ar-body') + n('ar-l') * 2 === n('ar') && sleeveShift(t) === 0 && sleeveShift(hd) === 8 && sleeveShift(ot) === 8; })()"));
  assert('거울 모드에서도 소매 안쪽 유지', ev(`(() => { const K = { ls: Pt(100, 100), rs: Pt(300, 100), le: Pt(60, 260) }; const [src, dst] = sleeveStrips('l', K, 1);
    const inward = (g, other) => { const a = g[1][2], b = g[1][0]; return ((a.x - b.x) * (other.x - b.x)) > 0; }; return src.length === 5 && inward(dst, K.rs); })()`));
  assert('룩키 관절 → 팔 앵커 포함', ev('(() => { const K = charKp(); return !!(K.le && K.lw && K.re && K.rw && K.lh && K.la); })()'));

  console.log('\n== 캐릭터 성장 ==');
  tab('home');
  ev("state.level = 2; state.exp = 90; save(); renderHome();");
  assert('루키 무대', $('stage').className === 'stage t1' && $('homeTitle').textContent === '루키');
  ev("grantExp(20, '테스트')");
  assert('레벨업 → 스타일러 무대 + 오버레이', ev('state.level') === 3 && ev('state.exp') === 10 && $('stage').className === 'stage t2' && $('levelup').classList.contains('show') && $('levelupSub').textContent.includes('스타일러'));
  click($('levelupClose'));
  assert('다음 칭호 안내', $('expNext').textContent.includes('트렌드세터'));
  ev("state.wearExpDate = ''; state.wearExpCount = 0; state.arRewardDate = ''; save();");
  tab('closet');
  const recCards = [...document.querySelectorAll('#closetRec [data-sel]')];
  assert('옷장 추천 카드', recCards.length >= 5);
  const wearCard = recCards.find((c) => ev(`!!arItem('${c.dataset.sel}').ar`));
  click(wearCard);
  assert('선택 시 하단 버튼', $('closetDock').classList.contains('show') && !$('btnClosetAR').disabled);
  const e0 = ev('state.level * 100 + state.exp');
  click($('btnWear'));
  const wid2 = wearCard.dataset.sel;
  assert('룩키에게 입히기 +20 EXP', ev(`state.wornCatalog.topId === '${wid2}' || state.wornCatalog.bottomId === '${wid2}'`) && ev('state.level * 100 + state.exp') === e0 + 20);
  assert('착용 슬롯 표시', $('wornSlots').textContent.includes(ev(`arItem('${wid2}').name`)));
  ev('state.wearExpCount = 5; save();');
  const e1 = ev('state.level * 100 + state.exp');
  const another = recCards.find((c) => c !== wearCard && ev(`arItem('${c.dataset.sel}').category === arItem('${wid2}').category`)) || recCards.find((c) => c !== wearCard);
  ev(`wearWithReward(arItem('${another.dataset.sel}'))`);
  assert('착용 EXP 하루 5회 제한', ev('state.level * 100 + state.exp') === e1);
  ev(`state.selectedId = '${wid2}'; renderCloset();`);
  if ($('btnWear').textContent === '벗기') { click($('btnWear')); assert('벗기', ev(`state.wornCatalog.topId !== '${wid2}' && state.wornCatalog.bottomId !== '${wid2}'`)); }
  const e2 = ev('state.level * 100 + state.exp');
  ev("AR.outfit = { top: 'p01', bottom: null }; arMaybeReward(); arMaybeReward();");
  assert('AR 시착 +15 하루 1회', ev('state.level * 100 + state.exp') === e2 + 15);
  ev("state.cart = {}; state.orders = []; state.buyExpDate = ''; addToCart(cartKey('g002', 'M'), 2);");
  const e3 = ev('state.level * 100 + state.exp');
  click($('btnCheckout'));
  assert('결제 → 주문 기록 + 옷장 + 구매 +50', ev("state.orders.length === 1 && state.orders[0].lines[0].qty === 2 && state.ownedIds.includes('g002')") && ev('state.level * 100 + state.exp') === e3 + 50);
  tab('home');
  assert('홈 성장 현황 (AR·구매 완료)', document.querySelectorAll('#growRow .done').length >= 2);
  assert('측정 후 홈 추천 레일', $('homeRecTitle').textContent.includes('체형') && document.querySelectorAll('#homeRecRail .mini-card').length === 10);
  assert('측정 CTA 숨김', $('homeMeasureCta').style.display === 'none');

  console.log('\n== MY ==');
  tab('my');
  assert('MY 체형 요약', document.querySelectorAll('#myBody .kv div').length === 6 && $('btnRemeasure').textContent === '다시 측정');
  assert('AR 학습 현황', $('myLearn').textContent.includes('프레임'));
  assert('주문/최근 본/찜 레일', document.querySelectorAll('#orderList .order-line').length === 1 && document.querySelectorAll('#recentRail .mini-card').length >= 1 && document.querySelectorAll('#wishRail .mini-card').length >= 1);
  $('nickInput').value = '룩핏러'; click($('btnSaveNick'));
  assert('닉네임 변경 → 홈 반영', ev('state.nickname') === '룩핏러' && $('homeNick').textContent.includes('룩핏러'));
  click($('btnLearnReset'));
  assert('학습 초기화', ev('learnModel().n') === 0);

  console.log('\n== 저장 데이터 마이그레이션 ==');
  ev(`localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart: { m01: 2, p04: 1 }, wishlist: ['w03', 'p04'], ownedIds: ['m05'], exploreFilter: '상의', equipped: { topId: 'top_01' }, attendDate: 'x', exploreExpCount: 3, level: 4, exp: 30 })); load();`);
  assert('구버전 데이터: 없는 id 제거 · 장바구니 키 변환 · 필터→카테고리', ev(`JSON.stringify(state.cart) === JSON.stringify({ 'p04::M': 1 }) && state.wishlist.length === 1 && state.ownedIds.length === 0 && state.exploreCat === '상의' && state.exploreFilter === '' && state.level === 4 && !('equipped' in state) && !('attendDate' in state)`));
  ev("localStorage.setItem(STORAGE_KEY, JSON.stringify({ exploreFilter: 'AR 피팅', measure: { at: 1 }, learn: { n: 3 } })); load();");
  assert('구버전 AR 필터명 · 손상된 측정/학습 데이터 정리', ev("state.exploreFilter === 'AR 시착' && state.measure === null && learnModel().n === 0"));
  ev('save(); renderAll();');

  console.log('\n== 초기화 ==');
  const ls = W.localStorage;
  ls.setItem('lookfit-demo-v5', JSON.stringify({ exp: 1 }));
  try { Object.defineProperty(W.location, 'reload', { configurable: true, value: () => {} }); } catch (_) {}
  click($('btnReset'));
  await sleep(80);
  assert('데이터 초기화', ls.getItem('lookfit-demo-v5') === null);
  assert('jsdom 스크립트 에러 없음', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  console.log('\nPassed:', passed, 'Failed:', failed);
  try { W.close(); } catch (_) {}
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
