    // ---------- 커머스 헬퍼: 사이즈 추천 · 사이즈표 · 후기 · 장바구니 키 ----------
    const SIZES = ['S', 'M', 'L', 'XL'];
    const KIND_LABEL = { top: '상의', outer: '아우터', bottom: '하의', dress: '원피스' };
    const genderLabel = (g) => (g === 'M' ? '남성' : g === 'W' ? '여성' : '공용');
    const cartKey = (id, size) => id + '::' + size;
    const parseCartKey = (key) => { const [id, size] = String(key).split('::'); return { id, size: size || 'M' }; };
    const COUPON_RATE = 10;

    function recommendSize(item) {
      const h = Number(state.height) || 170, w = Number(state.weight) || 65;
      const bmi = w / Math.pow(h / 100, 2);
      let idx = h < 160 ? 0 : h < 171 ? 1 : h < 180 ? 2 : 3;
      const ms = state.measure && state.measure.sizes;
      if (ms) idx = SIZES.indexOf(item && item.kind === 'bottom' ? ms.bottom : ms.top);
      else if (bmi >= 25) idx += 1; else if (bmi < 18.5) idx -= 1;
      if (item && (item.fitStyle === '오버핏' || item.fitStyle === '루즈핏')) idx -= 1;
      return SIZES[Math.max(0, Math.min(3, idx))];
    }
    function sizeChart(item) {
      const skirtKeys = ['askirt', 'pleats', 'longskirt'];
      const long = ['trench', 'coat'].includes(item.typeKey) || item.id === 'p03';
      if (skirtKeys.includes(item.typeKey) || item.id === 'p05') {
        return [['허리', 32, 3], ['엉덩이', 46, 3], ['총장', item.typeKey === 'askirt' ? 42 : 86, 2]];
      }
      if (item.kind === 'bottom') return [['허리', 34, 3], ['허벅지', 30, 1.5], ['밑위', 27, 1], ['총장', item.typeKey === 'shorts' ? 50 : 102, 2]];
      if (item.kind === 'dress') return [['가슴', 44, 3], ['허리', 36, 3], ['총장', 108, 2]];
      return [['어깨', item.fitStyle === '오버핏' ? 52 : 44, 2], ['가슴', 52, 3], ['소매', 60, 1.5], ['총장', long ? 108 : item.fitStyle === '크롭' ? 52 : 68, 2]];
    }
    const REVIEW_TEXT = {
      top: ['핏이 딱 예뻐요. 세탁 후에도 형태가 잘 유지돼요.', '두께감이 적당해서 사계절 입기 좋아요.', '색감이 사진이랑 거의 같아요. 재구매 의사 있어요.', '어깨가 조금 넓게 나와서 한 사이즈 내려도 될 것 같아요.'],
      outer: ['생각보다 가볍고 따뜻해요.', '어깨선이 딱 떨어져서 체형 보완이 돼요.', '소매 기장이 살짝 길어요. 그래도 만족해요.', '고급스러워 보여서 출근룩으로 자주 입어요.'],
      bottom: ['허리가 편하고 다리가 길어 보여요.', '기장이 딱 맞아서 수선 없이 입었어요.', '허벅지가 여유 있어서 편해요.', '재질이 톡톡해서 비침이 없어요.'],
      dress: ['한 벌로 코디가 끝나서 편해요.', '허리 라인이 예쁘게 잡혀요.', '원단이 부드럽고 구김이 적어요.', '데이트룩으로 칭찬 많이 받았어요.'],
    };
    const REVIEW_PROS = { top: ['핏', '두께감', '색감', '세탁 내구성'], outer: ['보온성', '실루엣', '고급스러움', '가벼움'], bottom: ['기장감', '허리 편안함', '다리 라인', '신축성'], dress: ['실루엣', '원단감', '코디 편의', '허리 라인'] };
    const REVIEW_CONS = { top: '어깨가 살짝 넓게 나온다는 의견이 있어요', outer: '소매가 조금 길다는 의견이 있어요', bottom: '밑단이 길어 수선이 필요할 수 있어요', dress: '키가 작으면 기장이 길 수 있어요' };
    function reviewData(item) {
      const r = seeded(hashStr('rv' + item.id));
      const kind = item.kind;
      const small = Math.round(6 + r() * 14), big = Math.round(4 + r() * 12);
      const nicks = ['룩핏러', '데일리코디', '출근룩', '미니멀', '스트릿', '핏마스터'];
      const texts = REVIEW_TEXT[kind].map((t) => [t, r()]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
      const list = [0, 1, 2].map((i) => {
        const h = Math.round(item.gender === 'W' ? 155 + r() * 17 : 162 + r() * 22);
        const w = Math.round(item.gender === 'W' ? 44 + r() * 16 : 52 + r() * 26);
        return {
          nick: nicks[Math.floor(r() * nicks.length)] + (10 + Math.floor(r() * 89)), h, w,
          size: SIZES[Math.min(3, Math.max(0, Math.round((h - 152) / 10)))], rating: r() < 0.8 ? 5 : 4,
          fit: r() < 0.72 ? '정사이즈' : (r() < 0.5 ? '작아요' : '커요'), text: texts[i],
        };
      });
      const pros = REVIEW_PROS[kind].map((k) => [k, r()]).sort((a, b) => a[1] - b[1]).slice(0, 3).map((x) => x[0]);
      return { small, big, fitPct: 100 - small - big, pros, cons: REVIEW_CONS[kind], list };
    }
    function similarItems(item) {
      return CATALOG.filter((c) => c.id !== item.id && c.kind === item.kind)
        .map((c) => [c, (c.fitStyle === item.fitStyle ? 30 : 0) + (c.tag === item.tag ? 20 : 0) + fitScore(c) * 0.3])
        .sort((a, b) => b[1] - a[1]).slice(0, 8).map((x) => x[0]);
    }
    const SUMMER_KEYS = ['tee', 'otee', 'crop', 'shorts', 'slip', 'askirt'];
    const WINTER_KEYS = ['puffer', 'coat', 'knit', 'hoodie', 'sweat', 'leather'];
    const WINTER_PHOTO = ['p01', 'p03', 'p08'];
    const seasonOf = (item) => (SUMMER_KEYS.includes(item.typeKey) ? 'S' : WINTER_KEYS.includes(item.typeKey) || WINTER_PHOTO.includes(item.id) ? 'W' : 'A');
    const seasonOk = (a, b) => { const x = seasonOf(a), y = seasonOf(b); return !((x === 'S' && y === 'W') || (x === 'W' && y === 'S')); };
    const genderOk = (item, g) => item.gender === 'U' || item.gender === g;
    function matchFor(item) {
      const wantBottom = item.kind !== 'bottom';
      const pool = CATALOG.filter((c) => c.id !== item.id && seasonOk(item, c) &&
        (item.gender === 'U' ? true : genderOk(c, item.gender)) &&
        (item.kind === 'dress' ? c.kind === 'outer' : wantBottom ? c.kind === 'bottom' : c.kind === 'top' || c.kind === 'outer'));
      const tpo = new Set(item.tpo || []);
      const score = (c) => fitScore(c) + (c.tpo || []).filter((t) => tpo.has(t)).length * 8 + (c.isPhoto && item.isPhoto ? 20 : 0) + (c.ar && item.ar ? 6 : 0);
      return pool.sort((a, b) => score(b) - score(a) || a.rank - b.rank)[0] || null;
    }
    function fitKeyword(style) { return style.replace(/핏$/, '').replace('실루엣', ''); }
    function recommendProducts(gender, fits) {
      const tagHit = (item) => fits.some((f) => f.includes(fitKeyword(item.fitStyle)));
      const score = (item) => fitScore(item) + (tagHit(item) ? 18 : 0) + (item.ar ? 4 : 0) + (item.isPhoto ? 3 : 0) - item.rank * 0.02;
      const ranked = CATALOG.filter((c) => genderOk(c, gender)).sort((a, b) => score(b) - score(a));
      const pick = (pred, n) => {
        const seen = new Set(), out = [];
        for (const it of ranked) {
          if (out.length >= n) break;
          const k = it.typeKey || it.id;
          if (!pred(it) || seen.has(k)) continue;
          seen.add(k); out.push(it);
        }
        return out;
      };
      return [...pick((i) => i.category === 'top', 3), ...pick((i) => i.category === 'bottom', 3)];
    }

