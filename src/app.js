    // ---------- 앱 상태 ----------
    const CATS = ['전체', '상의', '아우터', '하의', '원피스'];
    const CAT_KIND = { 상의: 'top', 아우터: 'outer', 하의: 'bottom', 원피스: 'dress' };
    const CHIPS = ['AR 시착', '세일', '남성', '여성', '찜', '출근', '데이트', '데일리', '여행', '데님', '룩북 실사'];
    const SORTS = [
      { id: 'recommend', label: '추천순' }, { id: 'fit', label: '내 체형순', measured: true }, { id: 'best', label: '인기순' },
      { id: 'sale', label: '할인율순' }, { id: 'reviews', label: '후기 많은순' }, { id: 'low', label: '낮은 가격순' }, { id: 'high', label: '높은 가격순' },
    ];
    const $ = (id) => document.getElementById(id);

    let state = {
      nickname: '스타일러', level: 1, exp: 0,
      gender: 'M', height: 170, weight: 65,
      body: { shoulder: 50, waist: 50, lower: 50 },
      analysis: null, measure: null, learn: null,
      recommendedIds: [], ownedIds: [], wornCatalog: { topId: null, bottomId: null }, selectedId: null,
      cart: {}, wishlist: [], recentIds: [], orders: [],
      exploreCat: '전체', exploreFilter: '', exploreSort: 'recommend', searchQuery: '', activeProductId: null,
      pdpImg: 0, pdpSize: 'M', couponUsed: false,
      arRewardDate: '', measureRewardDate: '', wearExpDate: '', wearExpCount: 0, buyExpDate: '',
    };

    const won = (n) => '₩' + Number(n).toLocaleString('ko-KR');
    const salePrice = (item) => item.discount ? Math.round(item.price * (100 - item.discount) / 100) : item.price;
    const cartCount = () => Object.values(state.cart).reduce((a, b) => a + b, 0);
    const cartTotal = () => Object.entries(state.cart).reduce((s, [key, q]) => { const it = arItem(parseCartKey(key).id); return s + (it ? salePrice(it) * q : 0); }, 0);
    const cartCoupon = () => (state.couponUsed ? 0 : Math.round(cartTotal() * COUPON_RATE / 100 / 100) * 100);
    const measured = () => !!(state.measure && state.measure.values);
    const currentTab = () => (document.querySelector('.screen.active') || {}).dataset?.screen;
    const tierOf = (lv) => TIERS.filter((t) => t.lv <= lv).pop();
    const nextTierOf = (lv) => TIERS.find((t) => t.lv > lv) || null;

    function load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const p = JSON.parse(raw);
        Object.keys(state).forEach((k) => { if (p[k] !== undefined && p[k] !== null) state[k] = p[k]; });
        const known = (id) => CATALOG.some((c) => c.id === id);
        const arr = (v) => (Array.isArray(v) ? v.filter(known) : []);
        state.body = { shoulder: 50, waist: 50, lower: 50, ...(p.body || {}) };
        state.ownedIds = arr(state.ownedIds);
        state.wishlist = arr(state.wishlist);
        state.recentIds = arr(state.recentIds);
        state.recommendedIds = arr(state.recommendedIds);
        state.orders = Array.isArray(state.orders) ? state.orders : [];
        state.wornCatalog = { topId: null, bottomId: null, ...(p.wornCatalog || {}) };
        if (!known(state.wornCatalog.topId)) state.wornCatalog.topId = null;
        if (!known(state.wornCatalog.bottomId)) state.wornCatalog.bottomId = null;
        if (!known(state.selectedId)) state.selectedId = null;
        if (CATS.includes(p.exploreFilter)) { state.exploreCat = p.exploreFilter; state.exploreFilter = ''; }
        if (p.exploreFilter === 'AR 피팅') state.exploreFilter = 'AR 시착';
        if (!CHIPS.includes(state.exploreFilter)) state.exploreFilter = '';
        if (!CATS.includes(state.exploreCat)) state.exploreCat = '전체';
        if (!SORTS.some((s) => s.id === state.exploreSort)) state.exploreSort = 'recommend';
        if (state.measure && !state.measure.values) state.measure = null;
        if (state.learn && !state.learn.c) state.learn = null;
        const cart = {};
        Object.entries(state.cart || {}).forEach(([key, q]) => {
          const { id, size } = parseCartKey(key);
          if (known(id) && q > 0) cart[cartKey(id, size)] = (cart[cartKey(id, size)] || 0) + q;
        });
        state.cart = cart;
        state.activeProductId = null;
      } catch (_) {}
    }
    function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {} }

    function fitScore(item) {
      const d = Math.abs(item.ideal.shoulder - state.body.shoulder) + Math.abs(item.ideal.waist - state.body.waist) + Math.abs(item.ideal.lower - state.body.lower);
      return Math.max(0, Math.min(100, Math.round(100 - d / 1.8)));
    }
    function fitText(score) {
      if (score >= 85) return '체형에 아주 잘 맞는 실루엣이에요';
      if (score >= 70) return '무리 없이 잘 어울려요';
      if (score >= 55) return '무난해요 · AR로 확인해 보세요';
      return '핏 차이가 있을 수 있어요';
    }
    function todayKey() {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function posClass(item) {
      if (!item || !item.thumbPos) return '';
      return { top: 'pos-top', upper: 'pos-upper', bottom: 'pos-bottom' }[item.thumbPos] || '';
    }
    function showToast(msg) {
      const el = $('toast');
      el.textContent = msg; el.classList.add('show');
      clearTimeout(showToast._t); showToast._t = setTimeout(() => el.classList.remove('show'), 1900);
    }
    function flashScreen(msg) {
      const f = $('photoFlash');
      f.classList.add('on');
      setTimeout(() => { f.classList.remove('on'); showToast(msg); }, 120);
    }

    // ---------- 캐릭터 성장 (유일한 게이미피케이션) ----------
    function grantExp(amount, reason) {
      const before = tierOf(state.level);
      state.exp += amount;
      let leveled = false;
      while (state.exp >= EXP_TO_NEXT) { state.exp -= EXP_TO_NEXT; state.level += 1; leveled = true; }
      save(); renderHome(); renderMy();
      showToast('+' + amount + ' EXP · ' + reason);
      if (leveled) showLevelUp(before);
      return leveled;
    }
    function showLevelUp(before) {
      const t = tierOf(state.level), n = nextTierOf(state.level);
      $('levelupText').textContent = 'Lv.' + state.level + ' ' + t.title;
      $('levelupSub').textContent = before && before.key !== t.key ? `새 칭호 '${t.title}' 획득! 룩키의 무대가 바뀌었어요` : n ? `Lv.${n.lv}이 되면 '${n.title}' 칭호를 받아요` : '최고 칭호를 유지하고 있어요';
      $('levelup').classList.add('show');
      clearTimeout(showLevelUp._t);
      showLevelUp._t = setTimeout(() => $('levelup').classList.remove('show'), 3200);
    }
    function wornIds() { return [state.wornCatalog.topId, state.wornCatalog.bottomId].filter(Boolean); }
    function isWorn(item) { return !!item && wornIds().includes(item.id); }
    function wearItem(item) {
      if (item.category === 'bottom') {
        const top = arItem(state.wornCatalog.topId);
        if (top && top.ar && top.ar.slot === 'full') state.wornCatalog.topId = null;
        state.wornCatalog.bottomId = item.id;
      } else {
        state.wornCatalog.topId = item.id;
        if (item.ar && item.ar.slot === 'full') state.wornCatalog.bottomId = null;
      }
    }
    function unwearItem(item) {
      if (state.wornCatalog.topId === item.id) state.wornCatalog.topId = null;
      if (state.wornCatalog.bottomId === item.id) state.wornCatalog.bottomId = null;
    }
    function wearWithReward(item) {
      wearItem(item);
      if (state.wearExpDate !== todayKey()) { state.wearExpDate = todayKey(); state.wearExpCount = 0; }
      save();
      if (state.wearExpCount < WEAR_EXP_DAILY_MAX) { state.wearExpCount += 1; grantExp(EXP_RULES.wear, item.name + ' 착용'); }
      else { renderHome(); showToast(item.name + ' 착용 · 오늘 착용 EXP는 모두 받았어요'); }
      const cv = $('avatarCanvas');
      cv.classList.remove('pop'); void cv.offsetWidth; cv.classList.add('pop');
    }

    function renderHome() {
      const t = tierOf(state.level), n = nextTierOf(state.level);
      $('stage').className = 'stage ' + t.key;
      $('homeLevel').textContent = 'Lv.' + state.level;
      $('homeTitle').textContent = t.title;
      $('homeNick').textContent = state.nickname + '님의 룩키';
      $('expLabel').textContent = 'EXP ' + state.exp + ' / ' + EXP_TO_NEXT;
      $('expNext').textContent = n ? `Lv.${n.lv} '${n.title}'까지 ${(n.lv - state.level - 1) * EXP_TO_NEXT + EXP_TO_NEXT - state.exp} EXP` : '최고 칭호 달성';
      $('expFill').style.width = (state.exp / EXP_TO_NEXT) * 100 + '%';
      const worn = wornIds().map(arItem).filter(Boolean);
      const bubble = $('homeBubble');
      if (!measured()) bubble.innerHTML = '체형을 재면 딱 맞는 <em>사이즈</em>를 골라줄게!';
      else if (!worn.length) bubble.innerHTML = `<em>${state.analysis.type}</em> 체형 맞춤 옷을 입혀줘!`;
      else bubble.innerHTML = `오늘 <em>${worn[0].name}</em> 잘 어울려?`;
      $('wornRow').innerHTML = worn.map((it) => `<button type="button" data-id="${it.id}" title="${it.name}"><img class="${posClass(it)}" src="${it.image}" alt=""></button>`).join('');
      $('wornRow').querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => openProduct(b.dataset.id)));
      renderAvatar($('avatarCanvas'), wornIds());
      const today = todayKey();
      const wearN = state.wearExpDate === today ? state.wearExpCount : 0;
      const grow = [
        ['착용', '+' + EXP_RULES.wear, wearN + '/' + WEAR_EXP_DAILY_MAX, wearN >= WEAR_EXP_DAILY_MAX],
        ['AR 시착', '+' + EXP_RULES.ar, state.arRewardDate === today ? '완료' : '하루 1회', state.arRewardDate === today],
        ['체형 측정', '+' + EXP_RULES.measure, state.measureRewardDate === today ? '완료' : '하루 1회', state.measureRewardDate === today],
        ['구매', '+' + EXP_RULES.buy, state.buyExpDate === today ? '완료' : '결제 시', state.buyExpDate === today],
      ];
      $('growRow').innerHTML = grow.map(([a, b, c, done]) => `<div class="${done ? 'done' : ''}"><b>${a} ${b}</b>${c}</div>`).join('');
      $('homeMeasureCta').style.display = measured() ? 'none' : '';
      const recs = homeRecs();
      $('homeRecTitle').textContent = measured() ? state.analysis.type + ' 체형 맞춤 추천' : '지금 인기 있는 상품';
      $('homeRecRail').innerHTML = recs.map(miniCard).join('');
      bindCards($('homeRecRail'));
    }
    function homeRecs() {
      if (measured()) {
        const ids = [...state.recommendedIds, ...CATALOG.filter((c) => genderOk(c, state.gender)).sort((a, b) => fitScore(b) - fitScore(a)).map((c) => c.id)];
        return [...new Set(ids)].slice(0, 10).map(arItem);
      }
      return CATALOG.slice().sort((a, b) => (b.ar ? 1 : 0) - (a.ar ? 1 : 0) || a.rank - b.rank).slice(0, 10);
    }
    function miniCard(item) {
      return `<button type="button" class="mini-card" data-id="${item.id}"><div class="ph"><img class="${posClass(item)}" src="${item.image}" alt="" loading="lazy">` +
        `<div class="tag">${item.ar ? '<span class="ar">AR</span>' : ''}</div></div>` +
        `<div class="nm">${item.name}</div><div class="pr">${item.discount ? `<em>${item.discount}%</em>` : ''}${won(salePrice(item))}</div></button>`;
    }
    function bindCards(root) { root.querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => openProduct(el.dataset.id))); }
    function saveHomeShot() {
      const cv = document.createElement('canvas');
      cv.width = 720; cv.height = 960;
      const ctx = cv.getContext && cv.getContext('2d');
      if (!ctx) return;
      const t = tierOf(state.level);
      const pal = { t1: ['#E8F5F1', '#DDEBE6', '#111'], t2: ['#FCE9E1', '#EDE3F3', '#111'], t3: ['#3A3F47', '#16181B', '#fff'], t4: ['#FFF4D6', '#C99A3B', '#111'] }[t.key];
      const g = ctx.createLinearGradient(0, 0, 0, 960);
      g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 720, 960);
      drawAvatar(ctx, 170, 130, 380, 700, wornIds());
      ctx.fillStyle = pal[2];
      ctx.font = '900 44px Pretendard Variable, sans-serif';
      ctx.fillText('LOOKFIT', 48, 84);
      ctx.font = '700 28px Pretendard Variable, sans-serif';
      ctx.fillText(`Lv.${state.level} ${t.title} · ${state.nickname}`, 48, 880);
      ctx.font = '500 22px Pretendard Variable, sans-serif';
      ctx.fillText(wornIds().map((id) => arItem(id).name).join(' + ') || '기본 룩', 48, 918);
      try { downloadCanvas(cv, 'lookfit-looky-'); flashScreen('룩키 착용샷을 저장했어요'); }
      catch (e) { showToast('이 환경에서는 이미지 저장이 막혀 있어요 (node scripts/serve.js 로 실행)'); }
    }

    // ---------- 탐색 ----------
    function filteredCatalog() {
      const q = state.searchQuery.trim().toLowerCase();
      const f = state.exploreFilter, kind = CAT_KIND[state.exploreCat];
      let list = CATALOG.filter((item) => {
        if (kind && item.kind !== kind) return false;
        const byChip = !f ||
          (f === 'AR 시착' && !!item.ar) || (f === '세일' && item.discount > 0) ||
          (f === '룩북 실사' && item.isPhoto) || (f === '남성' && item.gender !== 'W') || (f === '여성' && item.gender !== 'M') ||
          (f === '찜' && state.wishlist.includes(item.id)) || item.tag === f || (item.tpo || []).includes(f);
        const bySearch = !q || [item.name, item.brand, item.tag, item.fitStyle, item.desc, item.colorName, KIND_LABEL[item.kind], genderLabel(item.gender), ...(item.tpo || [])].join(' ').toLowerCase().includes(q);
        return byChip && bySearch;
      });
      const s = state.exploreSort === 'fit' && !measured() ? 'recommend' : state.exploreSort;
      const recScore = (i) => (measured() ? fitScore(i) : 50) + (i.isPhoto ? 25 : 0) + (i.ar ? 6 : 0) - i.rank * 0.15;
      if (s === 'best') list.sort((a, b) => a.rank - b.rank);
      else if (s === 'sale') list.sort((a, b) => b.discount - a.discount || a.rank - b.rank);
      else if (s === 'fit') list.sort((a, b) => fitScore(b) - fitScore(a));
      else if (s === 'reviews') list.sort((a, b) => b.reviews - a.reviews);
      else if (s === 'low') list.sort((a, b) => salePrice(a) - salePrice(b));
      else if (s === 'high') list.sort((a, b) => salePrice(b) - salePrice(a));
      else list.sort((a, b) => recScore(b) - recScore(a));
      return list;
    }
    const HEART = '<svg class="i" viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';
    function productCard(item) {
      const wished = state.wishlist.includes(item.id);
      return `<button type="button" class="p-card" data-id="${item.id}"><div class="ph">` +
        `<img class="${posClass(item)}" src="${item.image}" alt="${item.name}" loading="lazy">` +
        `<div class="tag">${item.ar ? '<span class="ar">AR</span>' : ''}${item.rank <= 5 ? '<span>BEST</span>' : ''}</div>` +
        `<span class="heart ${wished ? 'on' : ''}" data-wish="${item.id}" role="button" aria-label="찜">${HEART}</span></div>` +
        `<div class="br">${item.brand}</div><div class="nm">${item.name}</div>` +
        `<div class="pr">${item.discount ? `<em>${item.discount}%</em>` : ''}${won(salePrice(item))}</div>` +
        `<div class="meta"><span class="st">${item.rating.toFixed(1)}</span><span>후기 ${item.reviews.toLocaleString('ko-KR')}</span>` +
        `${measured() ? `<span class="fit-pill">내 체형 ${fitScore(item)}%</span>` : ''}</div></button>`;
    }
    function renderExplore() {
      $('catTabs').innerHTML = CATS.map((c) => `<button type="button" class="${state.exploreCat === c ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('');
      $('chipRow').innerHTML = CHIPS.map((c) => `<button type="button" class="chip ${c === 'AR 시착' ? 'ar-chip-l' : ''} ${state.exploreFilter === c ? 'active' : ''}" data-chip="${c}">${c === '찜' ? '♥ 찜' : c}</button>`).join('');
      $('sortSelect').innerHTML = SORTS.filter((s) => !s.measured || measured()).map((s) => `<option value="${s.id}" ${state.exploreSort === s.id ? 'selected' : ''}>${s.label}</option>`).join('');
      $('catTabs').querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { state.exploreCat = b.dataset.cat; save(); renderExplore(); }));
      $('chipRow').querySelectorAll('[data-chip]').forEach((b) => b.addEventListener('click', () => {
        state.exploreFilter = state.exploreFilter === b.dataset.chip ? '' : b.dataset.chip; save(); renderExplore();
      }));
      const search = $('searchInput');
      if (document.activeElement !== search && search.value !== state.searchQuery) search.value = state.searchQuery;
      const list = filteredCatalog();
      $('exploreCount').innerHTML = `<b>${list.length.toLocaleString('ko-KR')}</b>개 상품 · AR 시착 ${list.filter((i) => i.ar).length}`;
      const grid = $('exploreGrid');
      if (!list.length) {
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><strong>검색 결과가 없어요</strong>다른 키워드나 필터로 찾아보세요<button type="button" class="btn line sm" id="btnExploreReset">필터 초기화</button></div>';
        $('btnExploreReset').addEventListener('click', () => {
          state.searchQuery = ''; state.exploreFilter = ''; state.exploreCat = '전체'; state.exploreSort = 'recommend';
          $('searchInput').value = ''; save(); renderExplore();
        });
        return;
      }
      grid.innerHTML = list.map(productCard).join('');
      grid.querySelectorAll('.p-card').forEach((card) => card.addEventListener('click', (e) => {
        if (e.target.closest('[data-wish]')) return;
        openProduct(card.dataset.id);
      }));
      grid.querySelectorAll('[data-wish]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); toggleWish(b.dataset.wish); }));
    }
    function toggleWish(id) {
      const i = state.wishlist.indexOf(id);
      if (i >= 0) state.wishlist.splice(i, 1); else state.wishlist.push(id);
      save();
      showToast(i >= 0 ? '찜을 해제했어요' : '찜 목록에 담았어요');
      if (currentTab() === 'explore') renderExplore();
      if (state.activeProductId === id) $('btnToggleWish').classList.toggle('on', state.wishlist.includes(id));
      renderMy();
    }

    // ---------- 상품 상세 ----------
    function openProduct(id) {
      const item = arItem(id); if (!item) return;
      state.activeProductId = id;
      state.recentIds = [id, ...state.recentIds.filter((x) => x !== id)].slice(0, 12);
      state.pdpImg = 0;
      state.pdpSize = recommendSize(item);
      save();
      const sp = salePrice(item), cap = arCapable(item);
      renderPdpImage(item);
      $('pdpTitle').textContent = KIND_LABEL[item.kind] || '상품 정보';
      $('modalBrand').textContent = item.brand + (item.isPhoto ? ' · 룩북' : '');
      $('modalName').textContent = item.name;
      $('modalRating').innerHTML = `<b>${item.rating.toFixed(1)}</b> · 후기 ${item.reviews.toLocaleString('ko-KR')}개 · 랭킹 ${item.rank}위`;
      $('modalRate').textContent = item.discount ? item.discount + '%' : '';
      $('modalPrice').textContent = won(sp);
      $('modalOrigin').textContent = item.discount ? won(item.price) : '';
      $('modalCoupon').textContent = state.couponUsed ? '' : `첫 구매 ${COUPON_RATE}% 쿠폰 적용 시 ${won(Math.round(sp * (100 - COUPON_RATE) / 100 / 100) * 100)}`;
      renderPdpFit(item);
      $('modalDesc').textContent = item.desc;
      $('modalMeta').textContent = genderLabel(item.gender) + ' · ' + (KIND_LABEL[item.kind] || '') + ' · ' + item.fitStyle + ' · ' + (item.tpo || []).join('/');
      $('modalMaterial').textContent = item.material || '혼방 소재 · 드라이클리닝 권장';
      $('modalModel').textContent = item.modelInfo || '175cm / 60kg · 착용 사이즈 M';
      $('modalExpert').textContent = item.expert || '체형의 단점을 보완해 주는 실루엣이에요.';
      $('btnHeroAR').style.display = cap ? '' : 'none';
      $('btnPdpAR').disabled = !cap;
      $('btnPdpAR').textContent = cap ? 'AR 시착' : 'AR 미지원';
      $('btnToggleWish').classList.toggle('on', state.wishlist.includes(id));
      const owned = state.ownedIds.includes(id);
      $('btnToCloset').disabled = owned;
      $('btnToCloset').textContent = owned ? '옷장에 있는 상품' : '내 옷장에 추가';
      renderPdpSizes(item); renderReviews(item); renderMatch(item); renderSimilar(item);
      $('detailScroll').scrollTop = 0;
      $('productModal').classList.add('show');
      renderMy();
    }
    function closeProduct() { $('productModal').classList.remove('show'); state.activeProductId = null; }
    function renderPdpFit(item) {
      const box = $('modalFit');
      if (measured()) {
        const score = fitScore(item);
        box.innerHTML = `<div class="fit-box"><div class="score">${score}%</div><div class="t"><b>내 체형 적합도 · 추천 ${recommendSize(item)}</b>${state.analysis.type} · ${fitText(score)}</div></div>`;
      } else {
        box.innerHTML = '<button type="button" class="fit-box cta" id="btnPdpMeasure"><div class="t"><b>내 사이즈가 궁금하다면?</b>AR 체형 측정으로 30초 만에 추천 사이즈와 적합도를 알려드려요</div><svg class="i" viewBox="0 0 24 24" style="width:18px;height:18px"><path d="M9 6l6 6-6 6"/></svg></button>';
        $('btnPdpMeasure').addEventListener('click', () => openAR(null, 'measure'));
      }
    }
    function renderPdpImage(item) {
      const imgs = item.images && item.images.length ? item.images : [item.image];
      const idx = state.pdpImg % imgs.length;
      $('modalImg').src = imgs[idx];
      $('heroDots').innerHTML = imgs.length > 1 ? imgs.map((_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('') : '';
    }
    function renderPdpSizes(item) {
      const rec = recommendSize(item);
      const m = state.measure;
      $('sizeRec').textContent = '추천 ' + rec + ' · ' + (measured() ? `측정 ${item.kind === 'bottom' ? '허리 ' + Math.round(m.values.waist) : '가슴 ' + Math.round(m.values.chest)}cm 기준` : state.height + 'cm/' + state.weight + 'kg 기준');
      const row = $('sizeRow');
      row.innerHTML = SIZES.map((s) => `<button type="button" class="size-chip ${state.pdpSize === s ? 'on' : ''}" data-size="${s}">${s === rec ? '<span class="rec">추천</span>' : ''}${s}</button>`).join('');
      row.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => { state.pdpSize = b.dataset.size; renderPdpSizes(item); }));
      const chart = sizeChart(item);
      const si = SIZES.indexOf(state.pdpSize);
      $('sizeTable').innerHTML = '<tr><th>cm</th>' + SIZES.map((s) => `<th>${s}</th>`).join('') + '</tr>' +
        chart.map(([label, base, inc]) => '<tr><th>' + label + '</th>' + SIZES.map((_, i) => `<td class="${i === si ? 'on' : ''}">${Math.round((base + inc * (i - 1)) * 10) / 10}</td>`).join('') + '</tr>').join('');
    }
    function renderReviews(item) {
      const d = reviewData(item);
      $('reviewCount').textContent = '★ ' + item.rating.toFixed(1) + ' · ' + item.reviews.toLocaleString('ko-KR') + '개';
      $('reviewSummary').innerHTML = '<b>AI 후기 요약</b>구매자들은 ' + d.pros.map((p) => `<span class="kw">${p}</span>`).join('') + '을(를) 가장 많이 칭찬했어요. 참고: ' + d.cons + '.';
      $('fitDist').innerHTML = [['작아요', d.small], ['정사이즈', d.fitPct], ['커요', d.big]]
        .map(([l, v]) => `<div><span>${l}</span><span class="bar"><i style="width:${v}%"></i></span><span>${v}%</span></div>`).join('');
      $('reviewList').innerHTML = d.list.map((r) => `<div class="review"><div class="rv-meta"><b>${'★'.repeat(r.rating)}</b>${r.nick} · ${r.h}cm ${r.w}kg · ${r.size} 구매 · ${r.fit}</div>${r.text}</div>`).join('');
    }
    function renderMatch(item) {
      const other = matchFor(item);
      $('matchBlock').style.display = other ? '' : 'none';
      const box = $('modalMatch');
      if (!other) { box.innerHTML = ''; return; }
      const slots = [item, other].map((i) => i.ar && i.ar.slot);
      const both = arCapable(item) && arCapable(other) && slots.includes('top') && slots.includes('bottom');
      box.innerHTML = `<div class="match-card"><img class="${posClass(other)}" src="${other.image}" alt="">` +
        `<div class="mc-body"><b>${other.name}</b>${other.fitStyle} · ${won(salePrice(other))}</div>` +
        `<button type="button" class="btn line sm" data-match="view">보기</button>` +
        (both ? '<button type="button" class="btn primary sm" data-match="ar">같이 AR</button>' : '') + '</div>';
      box.querySelector('[data-match="view"]').addEventListener('click', () => openProduct(other.id));
      const ar = box.querySelector('[data-match="ar"]');
      if (ar) ar.addEventListener('click', () => openAR([item.id, other.id]));
    }
    function renderSimilar(item) {
      $('similarRail').innerHTML = similarItems(item).map(miniCard).join('');
      bindCards($('similarRail'));
    }

    // ---------- 장바구니 ----------
    function addToCart(key, delta = 1) {
      const next = (state.cart[key] || 0) + delta;
      if (next <= 0) delete state.cart[key]; else state.cart[key] = next;
      save(); renderCartBadge(); renderCart();
    }
    function renderCartBadge() {
      const n = cartCount();
      document.querySelectorAll('.js-cart-count').forEach((el) => { el.textContent = n ? String(n) : ''; el.dataset.n = String(n); });
    }
    function openCart() { renderCart(); $('payDone').style.display = 'none'; $('cartSheet').classList.add('show'); }
    function closeCart() { $('cartSheet').classList.remove('show'); }
    function renderCart() {
      const list = $('cartList');
      const entries = Object.entries(state.cart);
      const sum = $('cartSum');
      if (!entries.length) {
        list.innerHTML = '<div class="empty-state"><strong>장바구니가 비어 있어요</strong>AR로 입어 보고 마음에 드는 옷을 담아 보세요</div>';
        $('cartTotal').textContent = won(0);
        sum.innerHTML = '';
        $('btnCheckout').disabled = true; return;
      }
      $('btnCheckout').disabled = false;
      list.innerHTML = entries.map(([key, qty]) => {
        const { id, size } = parseCartKey(key);
        const item = arItem(id); if (!item) return '';
        return `<div class="cart-line" data-id="${key}">
          <div class="cart-swatch" style="background-image:url('${item.image}')"></div>
          <div><div class="nm">${item.name}</div><div class="op">${item.brand} · 사이즈 ${size}</div>
          <div class="qty"><button type="button" data-act="dec" aria-label="빼기">−</button><span>${qty}</span><button type="button" data-act="inc" aria-label="더하기">+</button></div></div>
          <div><div class="price">${won(salePrice(item) * qty)}</div><button type="button" class="rm" data-act="rm">삭제</button></div>
        </div>`;
      }).join('');
      list.querySelectorAll('.cart-line').forEach((line) => {
        const id = line.dataset.id;
        line.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => {
          if (btn.dataset.act === 'inc') addToCart(id, 1);
          if (btn.dataset.act === 'dec') addToCart(id, -1);
          if (btn.dataset.act === 'rm') { delete state.cart[id]; save(); renderCartBadge(); renderCart(); }
        }));
      });
      const total = cartTotal(), coupon = cartCoupon();
      sum.innerHTML = `<div><span>상품 금액</span><span>${won(total)}</span></div>` +
        (coupon ? `<div class="coupon"><span>첫 구매 쿠폰 ${COUPON_RATE}%</span><span>−${won(coupon)}</span></div>` : '') +
        '<div><span>배송비</span><span>무료</span></div>';
      $('cartTotal').textContent = won(total - coupon);
    }
    function checkout() {
      if (!cartCount()) return;
      const paid = cartTotal() - cartCoupon();
      const lines = Object.entries(state.cart).map(([key, qty]) => ({ ...parseCartKey(key), qty }));
      state.orders = [{ no: 'LF' + Date.now().toString(36).toUpperCase(), at: Date.now(), paid, lines }, ...state.orders].slice(0, 20);
      lines.forEach((l) => { if (!state.ownedIds.includes(l.id)) state.ownedIds.push(l.id); });
      state.cart = {}; state.couponUsed = true;
      save(); renderCartBadge(); renderCart(); renderCloset();
      $('payDone').style.display = 'block';
      if (state.buyExpDate !== todayKey()) { state.buyExpDate = todayKey(); grantExp(EXP_RULES.buy, '구매 완료'); }
      else showToast('결제 완료 · ' + won(paid));
      renderMy();
    }

    // ---------- 옷장 ----------
    function closetRecIds() {
      const base = state.recommendedIds.length ? state.recommendedIds : recommendProducts(state.gender, []).map((i) => i.id);
      return base.filter((id) => !state.ownedIds.includes(id));
    }
    function closetSelection() {
      const id = state.selectedId;
      return id && (state.ownedIds.includes(id) || closetRecIds().includes(id) || isWorn(arItem(id))) ? arItem(id) : null;
    }
    function closetCard(item, sub) {
      return `<button type="button" class="c-card ${state.selectedId === item.id ? 'sel' : ''}" data-sel="${item.id}"><div class="ph"><img class="${posClass(item)}" src="${item.image}" alt="" loading="lazy"><span class="check"></span>${isWorn(item) ? '<span class="worn">착용중</span>' : ''}</div>` +
        `<div class="nm">${item.name}</div><div class="sub">${sub}</div></button>`;
    }
    function renderCloset() {
      const owned = state.ownedIds.map(arItem).filter(Boolean);
      const recs = closetRecIds().map(arItem).filter(Boolean);
      $('closetSub').textContent = measured() ? state.analysis.type + ' 체형' : '';
      $('ownedCount').textContent = owned.length + '벌';
      $('wornSlots').innerHTML = [['상의 · 아우터', state.wornCatalog.topId], ['하의', state.wornCatalog.bottomId]].map(([label, id]) => {
        const it = arItem(id);
        return `<div class="worn-slot"><div class="ph">${it ? `<img class="${posClass(it)}" src="${it.image}" alt="">` : '+'}</div><div class="t"><small>${label}</small><span>${it ? it.name : '비어 있음'}</span></div></div>`;
      }).join('');
      $('closetOwned').innerHTML = owned.length ? owned.map((it) => closetCard(it, it.fitStyle)).join('')
        : '<div class="empty-state" style="grid-column:1/-1;padding:18px 10px"><strong>아직 옷이 없어요</strong>상품 상세의 \'내 옷장에 추가\'나 결제로 채워지고, 아래 추천 아이템은 바로 입혀 볼 수 있어요</div>';
      $('closetRecTitle').textContent = measured() ? '내 체형 추천' : '인기 추천';
      $('closetRecWrap').style.display = recs.length ? '' : 'none';
      $('closetRec').innerHTML = recs.map((it) => closetCard(it, measured() ? '적합도 ' + fitScore(it) + '%' : it.fitStyle)).join('');
      document.querySelectorAll('[data-screen="closet"] [data-sel]').forEach((el) => el.addEventListener('click', () => {
        state.selectedId = state.selectedId === el.dataset.sel ? null : el.dataset.sel;
        save(); renderCloset();
      }));
      const sel = closetSelection();
      $('closetDock').classList.toggle('show', !!sel && currentTab() === 'closet');
      if (sel) {
        $('btnWear').textContent = isWorn(sel) ? '벗기' : '룩키에게 입히기';
        $('btnClosetAR').disabled = !arCapable(sel);
        $('btnClosetAR').textContent = arCapable(sel) ? 'AR로 입어보기' : 'AR 미지원';
      }
    }

    // ---------- MY ----------
    function renderMy() {
      const t = tierOf(state.level);
      $('myNick').textContent = state.nickname;
      $('myLevel').textContent = 'Lv.' + state.level + ' ' + t.title + ' · EXP ' + state.exp + '/' + EXP_TO_NEXT;
      const nick = $('nickInput');
      if (document.activeElement !== nick) nick.value = state.nickname;
      $('setLevel').textContent = String(state.level);
      $('setOwned').textContent = String(state.ownedIds.length);
      $('setWish').textContent = String(state.wishlist.length);
      $('setOrders').textContent = String(state.orders.length);
      const m = state.measure;
      $('btnRemeasure').textContent = m ? '다시 측정' : '측정하기';
      if (m && m.values) {
        const d = new Date(m.at);
        $('myBody').innerHTML = `<div class="kv">${['chest', 'waist', 'hip', 'shoulder', 'arm', 'leg'].map((k) => `<div>${MEASURE_LABEL[k]}<b>${Math.round(m.values[k])}cm</b></div>`).join('')}</div>` +
          `<p class="small-txt" style="margin-top:10px">${state.analysis ? state.analysis.type : ''} · 상의 ${m.sizes.top} / 하의 ${m.sizes.bottom} · ${m.height}cm ${m.weight}kg · ${{ camera: '카메라 ' + m.frames + '프레임', photo: '사진', input: '입력값 추정' }[m.method]} · ${d.getMonth() + 1}/${d.getDate()}</p>`;
      } else {
        $('myBody').innerHTML = '<p class="small-txt">아직 측정 기록이 없어요. AR 탭의 체형 측정으로 키·몸무게와 카메라 인식을 합쳐 치수를 추정할 수 있어요.</p>';
      }
      const L = learnModel();
      const stage = L.n >= 300 ? '개인화 완료' : L.n >= 60 ? '내 체형에 적응 중' : '기본 비율 사용 중';
      $('myLearn').innerHTML = `<div style="display:flex;justify-content:space-between;font-size:.8rem;font-weight:700"><span>${stage}</span><span class="muted">${L.n.toLocaleString('ko-KR')} 프레임</span></div>` +
        `<div class="learn-bar"><i style="width:${Math.min(100, L.n / 3)}%"></i></div>` +
        `<p class="small-txt">AR을 쓸수록 어깨 대비 상체(${L.torso.toFixed(2)})·골반(${L.hipW.toFixed(2)})·다리(${(L.thigh + L.shin).toFixed(2)}) 비율을 이 기기에 누적해, 하체가 화면에서 잘려도 내 체형대로 옷을 맞춰요. 인식 엔진: ${POSE.label || '대기 중'}</p>`;
      const box = $('orderList');
      if (!state.orders.length) box.innerHTML = '<p class="small-txt">아직 주문 내역이 없어요.</p>';
      else box.innerHTML = state.orders.slice(0, 5).map((o) => {
        const d = new Date(o.at);
        const first = arItem((o.lines[0] || {}).id);
        const count = o.lines.reduce((s, l) => s + l.qty, 0);
        return `<div class="order-line"><div class="ph" style="background-image:url('${first ? first.image : ''}')"></div>` +
          `<div class="t">${first ? first.name : '상품'}${count > 1 ? ' 외 ' + (count - 1) + '개' : ''}<small>${o.no} · ${d.getMonth() + 1}/${d.getDate()} · 결제완료</small></div><div class="p">${won(o.paid)}</div></div>`;
      }).join('');
      const rail = (wrap, el, ids) => {
        $(wrap).style.display = ids.length ? '' : 'none';
        $(el).innerHTML = ids.map(arItem).filter(Boolean).map(miniCard).join('');
        bindCards($(el));
      };
      rail('myRecentWrap', 'recentRail', state.recentIds);
      rail('myWishWrap', 'wishRail', state.wishlist);
    }

    // ---------- AR 탭 패널 ----------
    function renderArView() {
      const m = AR.view === 'measure';
      document.querySelectorAll('#arSeg [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === AR.view));
      $('arTryPanel').hidden = m;
      $('arMeasurePanel').hidden = !m;
      $('genderSelect').value = state.gender;
      if (document.activeElement !== $('heightInput')) $('heightInput').value = state.height;
      if (document.activeElement !== $('weightInput')) $('weightInput').value = state.weight;
      renderMeasureResult(); renderMeasureProgress(); renderArLearn();
      if (m) arStatus(AR.mode === 'camera' ? '2~3m 뒤에서 머리부터 발끝까지 보이게 서 주세요' : '체형 측정은 카메라 또는 전신 사진으로 할 수 있어요', AR.mode === 'camera' && !AR.kp);
      else if (AR.kp || AR.srcPose) arTracked();
    }
    function renderArLearn() { $('arLearn').textContent = '체형 학습 ' + learnModel().n.toLocaleString('ko-KR') + '프레임'; }
    function renderMeasureProgress() {
      const on = MEASURE.countdown > 0 || MEASURE.running;
      $('measureOv').classList.toggle('show', on);
      $('measureCd').textContent = MEASURE.countdown > 0 ? String(MEASURE.countdown) : '';
      $('measureProg').style.display = MEASURE.running ? '' : 'none';
      $('measureBar').style.width = Math.min(100, MEASURE.samples.length / MEASURE.need * 100) + '%';
      $('measureProgTxt').textContent = '측정 중… ' + MEASURE.samples.length + ' / ' + MEASURE.need + ' 프레임';
      $('measureReject').textContent = MEASURE.reject;
      $('btnMeasureStart').textContent = on ? '측정 취소' : state.measure ? '카메라로 다시 측정 (3초 후)' : '카메라로 측정 시작 (3초 후)';
    }
    function renderMeasureResult() {
      const box = $('measureResult');
      const m = state.measure;
      if (!measured()) { box.hidden = true; box.innerHTML = ''; return; }
      box.hidden = false;
      const d = new Date(m.at);
      const how = { camera: '카메라 ' + m.frames + '프레임 + 입력값', photo: '전신 사진 + 입력값', input: '키·몸무게 통계 추정' }[m.method];
      box.innerHTML = `<div class="hd"><div><small>${how} · ${d.getMonth() + 1}/${d.getDate()}</small><h4>${state.analysis.type}</h4></div>` +
        `<div class="size-box"><div>상의<b>${m.sizes.top}</b></div><div>하의<b>${m.sizes.bottom}</b></div></div></div>` +
        `<div class="metrics">${['shoulder', 'chest', 'waist', 'hip', 'arm', 'leg'].map((k) => `<div class="${m.src[k] === 'camera' ? 'cam' : ''}">${MEASURE_LABEL[k]}<b>${Math.round(m.values[k])}<small>±${m.err[k]}cm</small></b></div>`).join('')}</div>` +
        `<div class="fit-tags">${state.analysis.fits.map((f) => `<span>${f}</span>`).join('')}</div>` +
        `<p class="small-txt" style="margin-top:8px">${m.method === 'input' ? '카메라로 측정하면 오차가 줄어들어요.' : '<b style="color:var(--mint)">•</b> 표시는 카메라 실측이 반영된 값이에요.'} 추정치이므로 실제 치수와 차이가 있을 수 있어요.</p>` +
        (m.hint ? `<p class="m-hint">${m.hint}</p>` : '') +
        '<div class="btns"><button type="button" class="btn line sm" id="btnMeasureRec">맞춤 상품 보기</button><button type="button" class="btn primary sm" id="btnMeasureTry">추천 옷 입어보기</button></div>';
      $('btnMeasureRec').addEventListener('click', () => { state.exploreSort = 'fit'; state.exploreCat = '전체'; state.exploreFilter = ''; save(); switchTab('explore'); });
      $('btnMeasureTry').addEventListener('click', () => {
        const recs = state.recommendedIds.map(arItem).filter(arCapable);
        const top = recs.find((i) => i.ar.slot !== 'bottom'), bottom = recs.find((i) => i.ar.slot === 'bottom');
        AR.view = 'tryon';
        openAR([top, bottom].filter(Boolean).map((i) => i.id));
        renderArView();
      });
    }

    function recommendFromAnalysis() {
      const fits = (state.analysis && state.analysis.fits) || [];
      state.recommendedIds = recommendProducts(state.gender, fits).map((i) => i.id);
      save();
      renderCloset(); renderHome(); renderMy();
      if (currentTab() === 'explore') renderExplore();
    }

    // ---------- 탭 이동 ----------
    function switchTab(name) {
      const prev = currentTab();
      document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.dataset.screen === name));
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
      $('app').classList.toggle('dark', name === 'ar');
      closeProduct(); closeCart();
      if (prev === 'ar' && name !== 'ar') closeAR();
      if (name === 'home') renderHome();
      if (name === 'explore') renderExplore();
      if (name === 'closet') renderCloset(); else $('closetDock').classList.remove('show');
      if (name === 'my') renderMy();
      if (name === 'ar') openAR(null);
    }
    function renderAll() { renderCartBadge(); renderHome(); renderExplore(); renderCloset(); renderMy(); renderCart(); renderArView(); }

    // ---------- 이벤트 ----------
    document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => { if (currentTab() !== tab.dataset.tab) switchTab(tab.dataset.tab); }));
    document.querySelectorAll('.js-cart').forEach((b) => b.addEventListener('click', openCart));
    $('btnHomeCloset').addEventListener('click', () => switchTab('closet'));
    $('btnHomeShot').addEventListener('click', saveHomeShot);
    $('btnHomeAR').addEventListener('click', () => { AR.view = 'tryon'; openAR(wornIds()); });
    $('homeMeasureCta').addEventListener('click', () => openAR(null, 'measure'));
    $('homeRecMore').addEventListener('click', () => { if (measured()) state.exploreSort = 'fit'; save(); switchTab('explore'); });
    $('levelupClose').addEventListener('click', () => $('levelup').classList.remove('show'));
    $('searchInput').addEventListener('input', (e) => { state.searchQuery = e.target.value; renderExplore(); });
    $('sortSelect').addEventListener('change', (e) => { state.exploreSort = e.target.value; save(); renderExplore(); });

    $('modalClose').addEventListener('click', closeProduct);
    $('btnToggleWish').addEventListener('click', () => { if (state.activeProductId) toggleWish(state.activeProductId); });
    $('btnAddCart').addEventListener('click', () => {
      const item = arItem(state.activeProductId); if (!item) return;
      const size = state.pdpSize || recommendSize(item);
      addToCart(cartKey(item.id, size), 1); showToast('장바구니에 담았어요 · 사이즈 ' + size);
    });
    $('modalImg').addEventListener('click', () => {
      const item = arItem(state.activeProductId); if (!item || !item.images || item.images.length < 2) return;
      state.pdpImg += 1; renderPdpImage(item);
    });
    const pdpAR = () => { if (state.activeProductId) { AR.view = 'tryon'; openAR([state.activeProductId]); } };
    $('btnPdpAR').addEventListener('click', pdpAR);
    $('btnHeroAR').addEventListener('click', pdpAR);
    $('btnToCloset').addEventListener('click', () => {
      const id = state.activeProductId; if (!id || state.ownedIds.includes(id)) return;
      state.ownedIds.push(id);
      state.selectedId = id;
      save();
      $('btnToCloset').disabled = true; $('btnToCloset').textContent = '옷장에 있는 상품';
      showToast('옷장에 추가했어요 · 옷장에서 룩키에게 입혀 보세요');
      renderCloset(); renderMy();
    });
    $('cartClose').addEventListener('click', closeCart);
    $('cartSheet').addEventListener('click', (e) => { if (e.target.id === 'cartSheet') closeCart(); });
    $('btnCheckout').addEventListener('click', checkout);

    $('btnWear').addEventListener('click', () => {
      const item = closetSelection(); if (!item) return;
      if (isWorn(item)) { unwearItem(item); save(); renderHome(); showToast(item.name + ' 벗기'); }
      else wearWithReward(item);
      renderCloset();
    });
    $('btnClosetAR').addEventListener('click', () => { const sel = closetSelection(); if (sel) { AR.view = 'tryon'; openAR([sel.id]); } });

    document.querySelectorAll('#arSeg [data-view]').forEach((b) => b.addEventListener('click', () => {
      if (AR.view === b.dataset.view) return;
      measureCancel();
      AR.view = b.dataset.view;
      AR.statusText = '';
      renderArView();
    }));
    document.querySelectorAll('#arModes [data-mode]').forEach((b) => b.addEventListener('click', () => arSetMode(b.dataset.mode)));
    const readFile = (input, cb) => input.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { cb(reader.result); e.target.value = ''; };
      reader.readAsDataURL(file);
    });
    readFile($('arPhotoInput'), arUsePhoto);
    readFile($('measurePhotoInput'), measureFromPhoto);
    $('arCapture').addEventListener('click', arCapture);
    $('arToCart').addEventListener('click', () => {
      const ids = [AR.outfit.top, AR.outfit.bottom].filter(Boolean);
      if (!ids.length) return showToast('먼저 입어볼 옷을 선택하세요');
      ids.forEach((id) => addToCart(cartKey(id, AR.size), 1));
      showToast(ids.length + '벌을 장바구니에 담았어요 · 사이즈 ' + AR.size);
    });
    $('btnMeasureStart').addEventListener('click', () => { if (MEASURE.running || MEASURE.countdown > 0) measureCancel(); else measureStart(); });
    $('btnMeasurePhoto').addEventListener('click', () => $('measurePhotoInput').click());
    $('btnMeasureInput').addEventListener('click', measureFromInput);
    ['heightInput', 'weightInput'].forEach((id) => $(id).addEventListener('change', () => { measureInputs(); save(); renderArView(); }));
    $('genderSelect').addEventListener('change', () => { measureInputs(); save(); if (state.recommendedIds.length) recommendFromAnalysis(); });

    $('btnSaveNick').addEventListener('click', () => {
      state.nickname = ($('nickInput').value.trim() || '스타일러').slice(0, 12);
      save(); renderMy(); renderHome(); showToast('닉네임을 변경했어요');
    });
    $('btnRemeasure').addEventListener('click', () => openAR(null, 'measure'));
    $('btnLearnReset').addEventListener('click', () => { state.learn = learnDefaults(); save(); renderMy(); showToast('AR 인식 학습을 초기화했어요'); });
    $('btnClearCart').addEventListener('click', () => { state.cart = {}; save(); renderCartBadge(); renderCart(); showToast('장바구니를 비웠어요'); });
    function resetAppData() {
      if (resetAppData._busy) return;
      resetAppData._busy = true;
      try {
        Object.keys(localStorage).forEach((k) => { if (k.indexOf('lookfit') === 0) localStorage.removeItem(k); });
      } catch (_) {}
      showToast('데이터를 초기화합니다');
      setTimeout(() => {
        try { location.reload(); } catch (_) { location.href = location.href.split('#')[0]; }
      }, 200);
    }
    $('btnReset').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); resetAppData(); });

    function tickClock() {
      const d = new Date();
      $('clock').textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    // 뷰포트에 맞게 .phone 전체만 균일 scale (내부 레이아웃/좌표 변경 없음)
    function fitPhoneToViewport() {
      const shell = $('phoneShell'), phone = $('app');
      if (!shell || !phone) return;
      const cs = getComputedStyle(document.documentElement);
      const baseW = parseFloat(cs.getPropertyValue('--canvas-w')) || 390;
      const baseH = parseFloat(cs.getPropertyValue('--canvas-h')) || 780;
      const pad = 24;
      const scale = Math.min(1, (window.innerWidth - pad) / baseW, (window.innerHeight - pad) / baseH);
      phone.style.transform = 'scale(' + scale + ')';
      shell.style.width = (baseW * scale) + 'px';
      shell.style.height = (baseH * scale) + 'px';
    }

    load();
    learnModel();
    tickClock();
    setInterval(tickClock, 30000);
    renderAll();
    fitPhoneToViewport();
    window.addEventListener('resize', fitPhoneToViewport);
    setTimeout(() => {
      poseWarmup().then(() => { arEngine(POSE.label); renderMy(); }).catch(() => arEngine('AI 모델 로드 실패 · 샘플 모드'));
    }, 600);
