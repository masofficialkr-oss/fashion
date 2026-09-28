    // ---------- 커머스 헬퍼: 사이즈 추천 · 사이즈표 · 후기 · 장바구니 키 ----------
    const SIZES = ['S', 'M', 'L', 'XL'];
    const KIND_LABEL = { top: '상의', outer: '아우터', bottom: '하의', dress: '원피스' };
    const genderLabel = (g) => (g === 'M' ? '남성' : g === 'W' ? '여성' : '공용');
    const cartKey = (id, size) => id + '::' + size;
    const parseCartKey = (key) => { const [id, size] = String(key).split('::'); return { id, size: size || 'M' }; };
    const COUPON_RATE = 10;

    // ---------- 핏 엔진: 상품 실측(핏 스타일 · 성별 · 사이즈) x 내 치수 → 부위별 여유 · 추천 사이즈 ----------
    // M 사이즈 = 성별 기준 몸(M) + 스타일별 디자인 여유. 둘레는 전체 둘레(cm), 총장·소매·기장은 기준 몸 길이 대비 차이
    const REF_BODY = {
      W: { shoulder: 38, chest: 86, waist: 68, hip: 93, arm: 54, leg: 78, torso: 50 },
      M: { shoulder: 45, chest: 97, waist: 80, hip: 97, arm: 59, leg: 84, torso: 54 },
    };
    // 공용 M은 남성 S~M 체격 기준
    REF_BODY.U = { shoulder: 43, chest: 93, waist: 75, hip: 95, arm: 57, leg: 82, torso: 52 };
    const TOP_EASE = {
      '슬림핏': { chest: 6, shoulder: 0, length: 6, sleeve: 1 }, '세미핏': { chest: 10, shoulder: 1, length: 8, sleeve: 1 },
      '레귤러': { chest: 14, shoulder: 2, length: 12, sleeve: 2 }, '루즈핏': { chest: 22, shoulder: 6, length: 14, sleeve: 3 },
      '오버핏': { chest: 28, shoulder: 9, length: 14, sleeve: 2 }, '크롭': { chest: 16, shoulder: 3, length: -8, sleeve: 1 },
      '구조핏': { chest: 12, shoulder: 3, length: 16, sleeve: 2 }, '롱실루엣': { chest: 20, shoulder: 4, length: 50, sleeve: 3 },
    };
    const BOTTOM_EASE = {
      '슬림핏': { waist: 1, hip: 4, length: 0 }, '스트레이트': { waist: 2, hip: 8, length: 1 }, '와이드': { waist: 2, hip: 16, length: 3 },
      '레귤러': { waist: 2, hip: 10, length: 0 }, 'A라인': { waist: 1, hip: 14, length: 0 }, '롱실루엣': { waist: 1, hip: 10, length: 0 },
    };
    // 기장 예외: 쇼츠·미니·미디(기준 기장 대비 cm)
    const LENGTH_ADJ = { shorts: -44, askirt: -46, pleats: -18 };
    const GRADE = { chest: 5, shoulder: 1.5, length: 2, sleeve: 1.5, waist: 5, hip: 5 };
    const fitKind = (item) => (item.kind === 'bottom' ? 'bottom' : item.kind === 'dress' ? 'dress' : 'top');
    const isSkirt = (item) => ['askirt', 'pleats', 'longskirt'].includes(item.typeKey) || item.id === 'p05';
    function garmentSpec(item, size) {
      const ref = REF_BODY[item.gender] || REF_BODY.U;
      const g = SIZES.indexOf(size) - 1;
      const kind = fitKind(item);
      if (kind === 'bottom') {
        const e = BOTTOM_EASE[item.fitStyle] || BOTTOM_EASE['레귤러'];
        return { kind, waist: ref.waist + e.waist + GRADE.waist * g, hip: ref.hip + e.hip + GRADE.hip * g, length: ref.leg + 14 + e.length + (LENGTH_ADJ[item.typeKey] || 0) + 1.5 * g };
      }
      const e = TOP_EASE[item.fitStyle] || TOP_EASE['레귤러'];
      const spec = { kind, shoulder: ref.shoulder + e.shoulder + GRADE.shoulder * g, chest: ref.chest + e.chest + GRADE.chest * g, length: ref.torso + e.length + GRADE.length * g, sleeve: ref.arm + e.sleeve + GRADE.sleeve * g };
      if (item.id === 'p03' || item.typeKey === 'coat' || item.typeKey === 'trench') spec.length = ref.torso + 60 + GRADE.length * g;
      if (kind === 'dress') { spec.waist = ref.waist + 10 + GRADE.waist * g; spec.length = ref.torso + (item.typeKey === 'slip' ? 55 : 50) + GRADE.length * g; }
      return spec;
    }
    // 내 치수: 측정값이 있으면 측정값, 없으면 키·몸무게 통계 추정
    function fitBody() {
      if (state.measure && state.measure.values) return { v: state.measure.values, est: state.measure.method === 'input' };
      return { v: bodyPrior(Number(state.height) || 170, Number(state.weight) || 65, state.gender || 'W').v, est: true };
    }
    const TIGHT = { chest: 0, waist: -1, hip: 0, shoulder: -2 };
    function circTone(key, ease, diff, big) {
      if (ease < TIGHT[key]) return ['bad', key === 'shoulder' ? '좁음' : '끼임'];
      if (key === 'shoulder') return diff < -2 ? ['warn', '타이트'] : diff <= 2 ? ['good', big ? '드롭 숄더' : '딱 맞음'] : diff <= 5 ? ['warn', '처짐'] : ['bad', '많이 큼'];
      return diff < -4 ? ['warn', '타이트'] : diff <= 4 ? ['good', big ? '의도한 여유핏' : '딱 맞음'] : diff <= 10 ? ['warn', '여유 많음'] : ['bad', '너무 큼'];
    }
    // 부위별 핏: { key, label, body, garment, ease, tone(good|warn|bad|info), text }
    function fitParts(item, size) {
      if (!item) return [];
      const b = fitBody().v, s = garmentSpec(item, size), m = garmentSpec(item, 'M');
      const ref = REF_BODY[item.gender] || REF_BODY.U;
      const r1 = (v) => Math.round(v * 10) / 10;
      const circ = (key, label) => {
        const ease = s[key] - b[key], design = m[key] - ref[key];
        const [tone, text] = circTone(key, ease, ease - design, design > (key === 'shoulder' ? 5 : 18));
        return { key, label, body: r1(b[key]), garment: r1(s[key]), ease: r1(ease), diff: r1(ease - design), tone, text };
      };
      const out = [];
      if (s.kind === 'bottom') {
        out.push(circ('waist', '허리'), circ('hip', '엉덩이'));
        const d = s.length - (b.leg + 14);
        const text = isSkirt(item) ? (d < -35 ? '미니 기장' : d < -15 ? '무릎 기장' : d < -5 ? '미디 기장' : '맥시 기장')
          : d < -30 ? '무릎 위' : d < -8 ? '발목 위 크롭' : d < -2 ? '복숭아뼈' : d <= 4 ? '신발 위 딱' : '길어요 · 롤업';
        out.push({ key: 'length', label: '기장', body: r1(b.leg), garment: r1(s.length), ease: r1(d), tone: !isSkirt(item) && d > 4 ? 'warn' : 'info', text });
        return out;
      }
      out.push(circ('shoulder', '어깨'), circ('chest', '가슴'));
      if (s.kind === 'dress') out.push(circ('waist', '허리'));
      const d = s.length - b.torso;
      out.push({ key: 'length', label: '총장', body: r1(b.torso), garment: r1(s.length), ease: r1(d), tone: 'info',
        text: d < -6 ? '허리 위 크롭' : d < 6 ? '골반선' : d < 20 ? '엉덩이 덮음' : d < 40 ? '허벅지 중간' : '무릎 아래 롱' });
      if (s.kind === 'top') {
        const ds = s.sleeve - b.arm;
        out.push({ key: 'sleeve', label: '소매', body: r1(b.arm), garment: r1(s.sleeve), ease: r1(ds), tone: ds < -5 || ds > 6 ? 'warn' : 'info', text: ds < -5 ? '짧아요' : ds <= 3 ? '손목 딱' : '손등 덮음' });
      }
      return out;
    }
    // 디자인 의도(M 기준 여유)에 가장 가까운 사이즈. 끼임은 크게, 헐렁함은 작게 감점
    const designEase = (item, key) => garmentSpec(item, 'M')[key] - (REF_BODY[item.gender] || REF_BODY.U)[key];
    function bestSize(item) {
      let best = 'M', bestP = Infinity;
      SIZES.forEach((sz) => {
        const p = fitParts(item, sz).filter((x) => ['shoulder', 'chest', 'waist', 'hip'].includes(x.key)).reduce((acc, x) => {
          // 끼어서 못 입는 쪽이 큰 쪽보다 훨씬 나쁨 (큰 옷은 벨트·롤업으로 입을 수 있음)
          const w = x.key === 'shoulder' ? 0.6 : 1, dev = x.ease - designEase(item, x.key);
          const tone = x.ease < TIGHT[x.key] ? 20 : { good: 0, warn: 2, bad: 8 }[x.tone];
          return acc + w * (tone + Math.abs(dev) * (dev < 0 ? 0.25 : 0.15));
        }, 0);
        if (p < bestP - 1e-6) { bestP = p; best = sz; }
      });
      return best;
    }
    function recommendSize(item) {
      if (!item) return 'M';
      return bestSize(item);
    }
    // 한 줄 핏 요약 (AR 상태·룩 비교용)
    function fitSummary(item, size) {
      return fitParts(item, size).filter((p) => p.key !== 'sleeve').map((p) => p.label + ' ' + p.text).join(' · ');
    }
    // 사이즈표(단면 cm): [라벨, M값, 사이즈당 증감]
    function sizeChart(item) {
      const m = garmentSpec(item, 'M'), l = garmentSpec(item, 'L');
      const row = (label, key, half) => [label, Math.round((half ? m[key] / 2 : m[key]) * 10) / 10, Math.round(((l[key] - m[key]) / (half ? 2 : 1)) * 10) / 10];
      if (m.kind === 'bottom') return [row('허리단면', 'waist', true), row('엉덩이단면', 'hip', true), row('총장', 'length')];
      const rows = [row('어깨', 'shoulder'), row('가슴단면', 'chest', true), row('총장', 'length')];
      if (m.kind === 'dress') rows.splice(2, 0, row('허리단면', 'waist', true));
      else rows.push(row('소매', 'sleeve'));
      return rows;
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

