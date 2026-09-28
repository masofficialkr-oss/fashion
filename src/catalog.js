    // ---------- 카탈로그: 실사 룩북 9종 + 생성 의상 112종 (모두 동일 관절 기준 좌표로 그려 AR 호환) ----------
    // 생성 의상은 200x390 기준 캔버스에 그리며, 관절 좌표(CANON_KP)는 AR 메쉬 워핑의 원본 앵커로 쓰입니다.
    const CANON_KP = { ls: [140, 80], rs: [60, 80], lh: [126, 200], rh: [74, 200], lk: [124, 278], rk: [76, 278], la: [122, 362], ra: [78, 362] };
    const CANON_SCALE = 3;
    const CANON_ARM = { l: { e: [150, 150], w: [154, 216] }, r: { e: [50, 150], w: [46, 216] } };
    // scripts/build-ar-assets.js 출력 (스튜디오컷 → 투명 의상 + MoveNet 관절 앵커)
    const AR_PHOTO_ANCHORS = {"look_a_top":{"src":"./assets/ar/look_a_top.png","w":430,"h":423,"kp":{"ls":[334,133],"rs":[86,132],"lh":[277,485],"rh":[124,479],"lk":[247,833],"rk":[124,833],"la":[226,1141],"ra":[154,1128]}},"look_a_bottom":{"src":"./assets/ar/look_a_bottom.png","w":476,"h":807,"kp":{"ls":[358,-275],"rs":[110,-276],"lh":[301,77],"rh":[148,71],"lk":[271,425],"rk":[148,425],"la":[250,733],"ra":[178,720]}},"look_b_full":{"src":"./assets/ar/look_b_full.png","w":357,"h":1084,"kp":{"ls":[295,189],"rs":[61,191],"lh":[244,543],"rh":[112,540],"lk":[237,771],"rk":[119,775],"la":[225,1019],"ra":[131,1018]}},"look_c_top":{"src":"./assets/ar/look_c_top.png","w":374,"h":475,"kp":{"ls":[287,63],"rs":[69,65],"lh":[237,396],"rh":[114,393],"lk":[231,606],"rk":[120,610],"la":[215,839],"ra":[126,838]}},"look_c_bottom":{"src":"./assets/ar/look_c_bottom.png","w":315,"h":439,"kp":{"ls":[259,-397],"rs":[41,-395],"lh":[209,-64],"rh":[86,-67],"lk":[203,146],"rk":[92,150],"la":[187,379],"ra":[98,378]}},"look_d_top":{"src":"./assets/ar/look_d_top.png","w":444,"h":555,"kp":{"ls":[351,90],"rs":[78,87],"lh":[292,479],"rh":[138,476],"lk":[297,779],"rk":[138,778],"la":[280,1079],"ra":[145,1074]}},"look_d_bottom":{"src":"./assets/ar/look_d_bottom.png","w":403,"h":598,"kp":{"ls":[336,-476],"rs":[63,-479],"lh":[277,-87],"rh":[123,-90],"lk":[282,213],"rk":[123,212],"la":[265,513],"ra":[130,508]}},"look_e_top":{"src":"./assets/ar/look_e_top.png","w":292,"h":403,"kp":{"ls":[207,59],"rs":[87,67],"lh":[186,276],"rh":[117,277],"lk":[180,433],"rk":[110,434],"la":[174,587],"ra":[119,587]}},"look_e_bottom":{"src":"./assets/ar/look_e_bottom.png","w":232,"h":291,"kp":{"ls":[178,-289],"rs":[58,-281],"lh":[157,-72],"rh":[88,-71],"lk":[151,85],"rk":[81,86],"la":[145,239],"ra":[90,239]}}};
    // 샘플 모델(item_7 스튜디오컷) MoveNet 관절 — 카메라 없이도 AR 시연 가능
    const SAMPLE_MODEL = {
      src: './assets/shop/item_7.png',
      kp: { left_shoulder: [499, 243], right_shoulder: [251, 242], left_hip: [442, 595], right_hip: [289, 589], left_knee: [412, 943], right_knee: [289, 943], left_ankle: [391, 1251], right_ankle: [319, 1238] },
    };

    const PHOTO_ITEMS = [
      { id: 'p01', name: '하이넥 크롭 울 재킷', en: 'a charcoal cropped high-neck wool jacket with bell sleeves', kind: 'outer', category: 'top', gender: 'U', tag: '아우터', tpo: ['데일리', '데이트'], color: '#2d2d30', colorName: '차콜', price: 189000, discount: 10, fitStyle: '크롭', fitId: 'top_03', ideal: { shoulder: 70, waist: 42, lower: 56 }, image: './assets/shop/item_7.png', images: ['./assets/shop/item_7.png', './assets/shop/item_1.png'], thumbPos: 'top', desc: '목을 감싸는 하이넥과 벨 슬리브가 특징인 크롭 기장 울 재킷. 하이웨이스트 하의와 비율이 좋습니다.', material: '울 70% · 폴리아미드 30% · 안감 폴리에스터 · 드라이클리닝', modelInfo: '모델 172cm / 51kg · 착용 S', expert: '짧은 기장이 허리선을 올려 다리가 길어 보이는 비율을 만듭니다.', ar: { piece: 'look_a_top', slot: 'top' }, rating: 4.9, reviews: 312 },
      { id: 'p02', name: '슬릿 와이드 트랙 팬츠', en: 'black wide-leg drawstring track pants with side slits', kind: 'bottom', category: 'bottom', gender: 'U', tag: '팬츠', tpo: ['데일리', '여행'], color: '#1e1e21', colorName: '블랙', price: 98000, discount: 0, fitStyle: '와이드', fitId: 'bottom_01', ideal: { shoulder: 50, waist: 55, lower: 28 }, image: './assets/shop/item_7.png', images: ['./assets/shop/item_7.png', './assets/shop/item_1.png'], thumbPos: 'bottom', desc: '밑단 사이드 슬릿과 스트링 허리로 편안함과 드레이프를 동시에 잡은 와이드 팬츠.', material: '폴리에스터 88% · 스판 12% · 손세탁 권장', modelInfo: '모델 172cm / 51kg · 착용 S', expert: '하체 라인을 덮는 일자 드레이프로 체형 커버에 유리합니다.', ar: { piece: 'look_a_bottom', slot: 'bottom' }, rating: 4.8, reviews: 207 },
      { id: 'p03', name: '후드 퀼팅 롱 패딩', en: 'a black hooded quilted long puffer coat with a belt', kind: 'outer', category: 'top', gender: 'U', tag: '아우터', tpo: ['데일리', '여행'], color: '#1f1f22', colorName: '블랙', price: 329000, discount: 15, fitStyle: '롱실루엣', fitId: 'top_03', ideal: { shoulder: 62, waist: 56, lower: 46 }, image: './assets/shop/item_4.png', images: ['./assets/shop/item_4.png', './assets/shop/item_2.png'], thumbPos: 'top', desc: '웨이브 퀼팅과 벨트 디테일의 발목 기장 롱 패딩. 어깨 스파이크 장식이 포인트.', material: '겉감 나일론 100% · 충전재 덕다운 80/20 · 드라이클리닝', modelInfo: '모델 174cm / 52kg · 착용 S', expert: '세로로 긴 실루엣이 전체 비율을 길고 가늘게 보이게 합니다.', ar: { piece: 'look_b_full', slot: 'full' }, rating: 4.7, reviews: 158 },
      { id: 'p04', name: '오버사이즈 더블 블레이저', en: 'a grey oversized double-breasted wool blazer', kind: 'outer', category: 'top', gender: 'U', tag: '아우터', tpo: ['출근', '데이트'], color: '#6f7074', colorName: '그레이', price: 219000, discount: 20, fitStyle: '구조핏', fitId: 'top_03', ideal: { shoulder: 74, waist: 50, lower: 50 }, image: './assets/shop/item_5.png', images: ['./assets/shop/item_5.png', './assets/shop/item_3.png'], thumbPos: 'top', desc: '각진 어깨와 피크드 라펠의 오버사이즈 더블 블레이저. 스커트·와이드팬츠 모두 잘 어울립니다.', material: '울 60% · 폴리에스터 40% · 드라이클리닝', modelInfo: '모델 173cm / 50kg · 착용 S', expert: '구조적인 어깨선이 좁은 어깨를 보완하고 상체에 힘을 줍니다.', ar: { piece: 'look_c_top', slot: 'top' }, rating: 4.9, reviews: 486 },
      { id: 'p05', name: '티어드 크링클 스커트', en: 'a black tiered crinkled maxi skirt', kind: 'bottom', category: 'bottom', gender: 'W', tag: '스커트', tpo: ['데이트', '데일리'], color: '#1c1c1f', colorName: '블랙', price: 128000, discount: 10, fitStyle: 'A라인', fitId: 'wbot_01', ideal: { shoulder: 50, waist: 40, lower: 30 }, image: './assets/shop/item_5.png', images: ['./assets/shop/item_5.png', './assets/shop/item_3.png'], thumbPos: 'bottom', desc: '크링클 텍스처를 층층이 쌓은 티어드 맥시 스커트.', material: '폴리에스터 100% · 안감 포함 · 손세탁', modelInfo: '모델 173cm / 50kg · 착용 S', expert: '하체 볼륨을 자연스럽게 감춰 주는 A라인 볼륨입니다.', ar: { piece: 'look_c_bottom', slot: 'bottom' }, rating: 4.6, reviews: 94 },
      { id: 'p06', name: '블랙 테일러드 더블 재킷', en: 'a black tailored double-breasted jacket with chain details', kind: 'outer', category: 'top', gender: 'U', tag: '아우터', tpo: ['출근', '데이트'], color: '#1b1b1e', colorName: '블랙', price: 259000, discount: 0, fitStyle: '구조핏', fitId: 'top_03', ideal: { shoulder: 72, waist: 48, lower: 50 }, image: './assets/shop/item_8.png', images: ['./assets/shop/item_8.png', './assets/shop/item_10.png'], thumbPos: 'top', desc: '허리 체인 디테일과 와이드 소매의 테일러드 더블 재킷.', material: '울 55% · 폴리에스터 45% · 드라이클리닝', modelInfo: '모델 175cm / 55kg · 착용 M', expert: '어깨선을 또렷하게 세워 상체 비율을 안정적으로 보이게 합니다.', ar: { piece: 'look_d_top', slot: 'top' }, rating: 4.8, reviews: 233 },
      { id: 'p07', name: '스파이크 디테일 와이드 팬츠', en: 'black wide pants with spike studs and jagged hem', kind: 'bottom', category: 'bottom', gender: 'U', tag: '팬츠', tpo: ['데이트'], color: '#19191c', colorName: '블랙', price: 239000, discount: 0, fitStyle: '와이드', fitId: 'bottom_01', ideal: { shoulder: 50, waist: 52, lower: 26 }, image: './assets/shop/item_8.png', images: ['./assets/shop/item_8.png', './assets/shop/item_10.png'], thumbPos: 'bottom', desc: '사이드 스파이크와 커팅 밑단으로 무드를 살린 아방가르드 와이드 팬츠.', material: '폴리에스터 70% · 레이온 30% · 드라이클리닝', modelInfo: '모델 175cm / 55kg · 착용 M', expert: '넓은 밑단이 상체와 하체의 볼륨 차이를 줄여 줍니다.', ar: { piece: 'look_d_bottom', slot: 'bottom' }, rating: 4.5, reviews: 61 },
      { id: 'p08', name: '후드 울 판초', en: 'a black hooded wool poncho', kind: 'outer', category: 'top', gender: 'U', tag: '아우터', tpo: ['데일리', '여행'], color: '#232326', colorName: '블랙', price: 199000, discount: 12, fitStyle: '오버핏', fitId: 'top_01', ideal: { shoulder: 34, waist: 55, lower: 50 }, image: './assets/shop/item_9.png', images: ['./assets/shop/item_9.png'], thumbPos: 'top', desc: '후드 일체형 울 판초. 어깨를 덮는 케이프 실루엣.', material: '울 80% · 나일론 20% · 드라이클리닝', modelInfo: '모델 170cm / 48kg · 착용 FREE', expert: '넓은 어깨를 부드럽게 감싸 상체 볼륨을 분산시킵니다.', ar: { piece: 'look_e_top', slot: 'top' }, rating: 4.7, reviews: 88 },
      { id: 'p09', name: '스플릿 와이드 트라우저', en: 'grey wide split-front trousers', kind: 'bottom', category: 'bottom', gender: 'U', tag: '팬츠', tpo: ['출근', '데일리'], color: '#8b8a86', colorName: '그레이', price: 149000, discount: 0, fitStyle: '와이드', fitId: 'bottom_01', ideal: { shoulder: 50, waist: 52, lower: 28 }, image: './assets/shop/item_9.png', images: ['./assets/shop/item_9.png'], thumbPos: 'bottom', desc: '앞트임이 들어간 롱 와이드 트라우저.', material: '폴리에스터 65% · 레이온 35% · 드라이클리닝', modelInfo: '모델 170cm / 48kg · 착용 S', expert: '세로 트임이 다리 라인을 길게 보이게 합니다.', ar: { piece: 'look_e_bottom', slot: 'bottom' }, rating: 4.6, reviews: 52 },
    ].map((it) => ({ ...it, brand: 'LOOKFIT ATELIER', isPhoto: true, isNew: true }));

    const G_COLORS = {
      '블랙': ['#232326', 'black'], '화이트': ['#f3f1ec', 'white'], '아이보리': ['#ece3cf', 'ivory'], '차콜': ['#3e4046', 'charcoal'],
      '그레이': ['#9c9ea3', 'grey'], '네이비': ['#22314f', 'navy'], '스카이블루': ['#93b8da', 'sky blue'], '베이지': ['#cfb795', 'beige'],
      '카멜': ['#b27d48', 'camel'], '브라운': ['#6c4b34', 'brown'], '카키': ['#5f6a45', 'khaki'], '올리브': ['#7b7f4b', 'olive'],
      '버건디': ['#6f2130', 'burgundy'], '레드': ['#b3302f', 'red'], '핑크': ['#e9adb7', 'pink'], '라벤더': ['#b5a6d8', 'lavender'],
      '민트': ['#a1d4c1', 'mint'], '머스타드': ['#d3a536', 'mustard'], '데님': ['#46669a', 'indigo denim'], '연청': ['#8eabcb', 'light-wash denim'], '흑청': ['#2f3b52', 'black denim'],
    };
    const G_TYPES = [
      { key: 'tee', name: '반팔 티셔츠', en: 't-shirt', kind: 'top', gender: 'U', fit: '레귤러', fitId: 'top_01', price: [19000, 35000], colors: ['화이트', '블랙', '그레이', '네이비'], tag: '티셔츠', tpo: ['데일리'], mat: '면 100% · 싱글저지 20수 · 세탁기 가능', desc: '매일 손이 가는 기본 반팔 티셔츠. 목 늘어남이 적은 탄탄한 조직.' },
      { key: 'otee', name: '오버핏 반팔 티', en: 'oversized t-shirt', kind: 'top', gender: 'U', fit: '오버핏', fitId: 'top_01', price: [25000, 42000], colors: ['블랙', '아이보리', '차콜', '민트'], tag: '티셔츠', tpo: ['데일리', '여행'], mat: '면 100% · 헤비웨이트 16수 · 세탁기 가능', desc: '드롭 숄더로 떨어지는 여유로운 오버핏 반팔.' },
      { key: 'longsleeve', name: '롱슬리브 티', en: 'long sleeve t-shirt', kind: 'top', gender: 'U', fit: '레귤러', fitId: 'top_02', price: [25000, 39000], colors: ['화이트', '네이비', '베이지', '버건디'], tag: '티셔츠', tpo: ['데일리'], mat: '면 95% · 스판 5% · 세탁기 가능', desc: '레이어드하기 좋은 긴팔 기본 티셔츠.' },
      { key: 'shirt', name: '옥스포드 셔츠', en: 'oxford button-down shirt', kind: 'top', gender: 'U', fit: '레귤러', fitId: 'top_01', price: [39000, 69000], colors: ['스카이블루', '화이트', '핑크', '네이비'], pattern: { '스카이블루': 'stripe' }, tag: '셔츠', tpo: ['출근', '데일리'], mat: '면 100% · 옥스포드 조직 · 세탁기 가능', desc: '버튼다운 칼라의 클래식 옥스포드 셔츠.' },
      { key: 'knit', name: '크루넥 니트', en: 'crewneck knit sweater', kind: 'top', gender: 'U', fit: '슬림핏', fitId: 'top_02', price: [45000, 89000], colors: ['아이보리', '차콜', '카멜', '올리브'], pattern: { '*': 'rib' }, tag: '니트', tpo: ['출근', '데이트'], mat: '울 50% · 아크릴 50% · 손세탁', desc: '적당한 두께감의 슬림한 크루넥 니트.' },
      { key: 'hoodie', name: '후드 티셔츠', en: 'pullover hoodie', kind: 'top', gender: 'U', fit: '루즈핏', fitId: 'top_01', price: [49000, 79000], colors: ['그레이', '블랙', '라벤더', '카키'], tag: '후드', tpo: ['데일리', '여행'], mat: '면 80% · 폴리 20% · 기모 · 세탁기 가능', desc: '도톰한 기모 안감의 루즈핏 후드 티셔츠.' },
      { key: 'sweat', name: '맨투맨', en: 'crewneck sweatshirt', kind: 'top', gender: 'U', fit: '루즈핏', fitId: 'top_01', price: [39000, 65000], colors: ['그레이', '네이비', '머스타드', '아이보리'], tag: '맨투맨', tpo: ['데일리'], mat: '면 100% · 쭈리 · 세탁기 가능', desc: '립 밴딩으로 마무리한 베이직 맨투맨.' },
      { key: 'crop', name: '크롭 티', en: 'cropped t-shirt', kind: 'top', gender: 'W', fit: '크롭', fitId: 'wtop_01', price: [19000, 32000], colors: ['화이트', '핑크', '블랙', '라벤더'], tag: '크롭', tpo: ['데이트', '데일리'], mat: '면 92% · 스판 8% · 세탁기 가능', desc: '하이웨이스트 하의와 잘 맞는 짧은 기장의 크롭 티.' },
      { key: 'blouse', name: '퍼프 블라우스', en: 'puff-sleeve blouse', kind: 'top', gender: 'W', fit: '세미핏', fitId: 'wtop_02', price: [39000, 69000], colors: ['아이보리', '스카이블루', '핑크', '블랙'], tag: '블라우스', tpo: ['출근', '데이트'], mat: '폴리에스터 100% · 쉬폰 · 손세탁', desc: '볼륨 퍼프 소매로 어깨선을 부드럽게 살린 블라우스.' },
      { key: 'vest', name: '니트 베스트', en: 'v-neck knit vest', kind: 'top', gender: 'U', fit: '레귤러', fitId: 'top_02', price: [35000, 59000], colors: ['베이지', '그레이', '네이비', '브라운'], pattern: { '*': 'rib' }, tag: '니트', tpo: ['출근', '데일리'], mat: '울 30% · 아크릴 70% · 손세탁', desc: '셔츠 위에 레이어드하기 좋은 브이넥 니트 베스트.' },
      { key: 'blazer', name: '싱글 블레이저', en: 'single-breasted blazer', kind: 'outer', gender: 'U', fit: '구조핏', fitId: 'top_03', price: [89000, 169000], colors: ['블랙', '차콜', '베이지', '네이비'], tag: '아우터', tpo: ['출근', '데이트'], mat: '폴리 65% · 레이온 35% · 드라이클리닝', desc: '어깨 패드로 구조감을 준 싱글 블레이저.' },
      { key: 'trench', name: '트렌치 코트', en: 'belted trench coat', kind: 'outer', gender: 'U', fit: '롱실루엣', fitId: 'top_03', price: [129000, 229000], colors: ['베이지', '카키', '블랙', '네이비'], tag: '아우터', tpo: ['출근', '여행'], mat: '면 65% · 나일론 35% · 발수 가공 · 드라이클리닝', desc: '허리 벨트로 실루엣을 조절하는 더블 트렌치 코트.' },
      { key: 'puffer', name: '숏 패딩', en: 'short puffer jacket', kind: 'outer', gender: 'U', fit: '크롭', fitId: 'top_03', price: [99000, 189000], colors: ['블랙', '아이보리', '카키', '스카이블루'], tag: '아우터', tpo: ['데일리', '여행'], mat: '겉감 나일론 · 충전재 덕다운 80/20 · 드라이클리닝', desc: '하이넥 스탠드 칼라의 가벼운 숏 패딩.' },
      { key: 'cardigan', name: '브이넥 가디건', en: 'v-neck cardigan', kind: 'outer', gender: 'U', fit: '레귤러', fitId: 'top_02', price: [49000, 89000], colors: ['아이보리', '그레이', '핑크', '네이비'], pattern: { '*': 'rib' }, tag: '니트', tpo: ['데일리', '출근'], mat: '면 60% · 아크릴 40% · 손세탁', desc: '간절기 필수 브이넥 버튼 가디건.' },
      { key: 'denimjk', name: '데님 트러커 재킷', en: 'denim trucker jacket', kind: 'outer', gender: 'U', fit: '레귤러', fitId: 'top_03', price: [69000, 119000], colors: ['데님', '연청', '흑청', '화이트'], tag: '데님', tpo: ['데일리', '여행'], mat: '면 100% · 12oz 데님 · 단독 세탁', desc: '체스트 포켓과 스티치가 살아있는 트러커 데님 재킷.' },
      { key: 'leather', name: '레더 라이더 재킷', en: 'leather rider jacket', kind: 'outer', gender: 'U', fit: '크롭', fitId: 'top_03', price: [119000, 259000], colors: ['블랙', '브라운', '버건디', '카키'], tag: '아우터', tpo: ['데이트'], mat: '비건 레더(PU) · 안감 폴리 · 전문 세탁', desc: '사선 지퍼가 포인트인 짧은 기장 라이더 재킷.' },
      { key: 'coat', name: '울 롱코트', en: 'wool long coat', kind: 'outer', gender: 'U', fit: '롱실루엣', fitId: 'top_03', price: [159000, 299000], colors: ['카멜', '차콜', '블랙', '그레이'], tag: '아우터', tpo: ['출근', '데이트'], mat: '울 70% · 폴리 30% · 드라이클리닝', desc: '무릎을 덮는 기장의 클래식 울 롱코트.' },
      { key: 'wide', name: '와이드 팬츠', en: 'wide-leg trousers', kind: 'bottom', gender: 'U', fit: '와이드', fitId: 'bottom_01', price: [39000, 69000], colors: ['블랙', '베이지', '그레이', '카키'], tag: '팬츠', tpo: ['데일리', '출근'], mat: '폴리 70% · 레이온 30% · 세탁기 가능(약)', desc: '허리부터 밑단까지 곧게 떨어지는 와이드 팬츠.' },
      { key: 'sjean', name: '스트레이트 데님', en: 'straight-leg jeans', kind: 'bottom', gender: 'U', fit: '스트레이트', fitId: 'bottom_02', price: [49000, 89000], colors: ['데님', '연청', '흑청', '화이트'], tag: '데님', tpo: ['데일리'], mat: '면 99% · 스판 1% · 단독 세탁', desc: '가장 무난한 일자 핏 스트레이트 데님.' },
      { key: 'slacks', name: '슬림 슬랙스', en: 'slim tailored slacks', kind: 'bottom', gender: 'U', fit: '슬림핏', fitId: 'bottom_03', price: [45000, 79000], colors: ['블랙', '차콜', '네이비', '베이지'], tag: '슬랙스', tpo: ['출근'], mat: '폴리 75% · 레이온 22% · 스판 3%', desc: '출근·미팅용 테이퍼드 슬림 슬랙스.' },
      { key: 'cargo', name: '카고 팬츠', en: 'cargo pants', kind: 'bottom', gender: 'U', fit: '와이드', fitId: 'bottom_01', price: [49000, 85000], colors: ['카키', '블랙', '베이지', '올리브'], tag: '팬츠', tpo: ['데일리', '여행'], mat: '면 100% · 트윌 · 세탁기 가능', desc: '사이드 포켓 디테일의 스트릿 카고 팬츠.' },
      { key: 'jogger', name: '조거 팬츠', en: 'jogger pants', kind: 'bottom', gender: 'U', fit: '슬림핏', fitId: 'bottom_03', price: [35000, 59000], colors: ['그레이', '블랙', '네이비', '카키'], tag: '팬츠', tpo: ['데일리', '여행'], mat: '면 80% · 폴리 20% · 세탁기 가능', desc: '밑단 밴딩으로 활동성이 좋은 조거 팬츠.' },
      { key: 'shorts', name: '버뮤다 쇼츠', en: 'bermuda shorts', kind: 'bottom', gender: 'U', fit: '레귤러', fitId: 'bottom_02', price: [29000, 49000], colors: ['베이지', '네이비', '데님', '블랙'], tag: '팬츠', tpo: ['여행', '데일리'], mat: '면 100% · 치노 · 세탁기 가능', desc: '무릎 위 기장의 여름 버뮤다 쇼츠.' },
      { key: 'askirt', name: 'A라인 미니스커트', en: 'a-line mini skirt', kind: 'bottom', gender: 'W', fit: 'A라인', fitId: 'wbot_01', price: [32000, 55000], colors: ['블랙', '데님', '베이지', '핑크'], tag: '스커트', tpo: ['데이트', '데일리'], mat: '면 97% · 스판 3% · 세탁기 가능(약)', desc: '하체 라인을 정돈해 주는 A라인 미니 스커트.' },
      { key: 'pleats', name: '플리츠 미디스커트', en: 'pleated midi skirt', kind: 'bottom', gender: 'W', fit: 'A라인', fitId: 'wbot_01', price: [39000, 69000], colors: ['네이비', '베이지', '그레이', '머스타드'], pattern: { '그레이': 'check' }, tag: '스커트', tpo: ['출근', '데이트'], mat: '폴리 100% · 영구 플리츠 · 손세탁', desc: '움직일 때마다 찰랑이는 플리츠 미디 스커트.' },
      { key: 'longskirt', name: '롱 슬릿 스커트', en: 'long slit skirt', kind: 'bottom', gender: 'W', fit: '롱실루엣', fitId: 'wbot_02', price: [45000, 79000], colors: ['블랙', '카멜', '올리브', '아이보리'], tag: '스커트', tpo: ['데이트', '출근'], mat: '레이온 70% · 폴리 30% · 드라이클리닝', desc: '뒤트임 슬릿으로 걸음이 편한 롱 스커트.' },
      { key: 'slip', name: '슬립 원피스', en: 'satin slip dress', kind: 'dress', gender: 'W', fit: '세미핏', fitId: 'wtop_02', price: [49000, 99000], colors: ['블랙', '라벤더', '아이보리', '버건디'], tag: '원피스', tpo: ['데이트'], mat: '폴리 100% · 새틴 · 손세탁', desc: '은은한 광택의 새틴 슬립 원피스.' },
      { key: 'shirtdress', name: '셔츠 원피스', en: 'belted shirt dress', kind: 'dress', gender: 'W', fit: '롱실루엣', fitId: 'wtop_02', price: [59000, 109000], colors: ['스카이블루', '베이지', '화이트', '카키'], tag: '원피스', tpo: ['출근', '데일리'], mat: '면 100% · 포플린 · 세탁기 가능(약)', desc: '허리 벨트로 라인을 잡는 셔츠 원피스.' },
    ];
    const G_BRANDS = ['URBAN FORM', 'MONO ROW', 'NOIR KNIT', 'FRAME LAB', 'BLUE LINE', 'SOFT MOVE', 'CITY EDGE', 'DRAPE CO', 'AIRY', 'UTIL', 'WINTER ROW', 'PLEAT LAB', 'FLOW', 'DENIM MUSE', 'OFFICE'];
    const FIT_IDEAL = {
      '레귤러': { shoulder: 50, waist: 50, lower: 50 }, '오버핏': { shoulder: 32, waist: 52, lower: 50 }, '루즈핏': { shoulder: 38, waist: 58, lower: 50 },
      '슬림핏': { shoulder: 56, waist: 36, lower: 62 }, '크롭': { shoulder: 70, waist: 40, lower: 56 }, '세미핏': { shoulder: 46, waist: 42, lower: 50 },
      '구조핏': { shoulder: 74, waist: 50, lower: 50 }, '롱실루엣': { shoulder: 64, waist: 55, lower: 48 }, '와이드': { shoulder: 50, waist: 54, lower: 26 },
      '스트레이트': { shoulder: 50, waist: 50, lower: 55 }, 'A라인': { shoulder: 50, waist: 40, lower: 30 },
    };
    const FIT_EXPERT = {
      '레귤러': '어떤 체형에도 무난한 정석 핏이라 실패 확률이 낮습니다.', '오버핏': '넓은 어깨와 상체 볼륨을 자연스럽게 덮어 줍니다.',
      '루즈핏': '허리·복부 라인을 편하게 커버하는 여유 있는 실루엣입니다.', '슬림핏': '허리선이 드러나 상·하체 비율이 또렷해 보입니다.',
      '크롭': '짧은 기장이 허리선을 올려 다리가 길어 보이게 합니다.', '세미핏': '몸에 붙지 않으면서 라인을 살리는 균형 잡힌 핏입니다.',
      '구조핏': '어깨선을 세워 좁은 어깨를 보완하고 상체에 힘을 줍니다.', '롱실루엣': '세로로 긴 라인이 전체 비율을 길고 가늘게 만듭니다.',
      '와이드': '하체 라인을 덮어 허벅지·종아리 고민을 줄여 줍니다.', '스트레이트': '다리 라인을 곧게 정리해 가장 범용적인 하의 핏입니다.',
      'A라인': '골반·허벅지 볼륨을 자연스럽게 감싸 하체를 정돈합니다.',
    };

    function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
    function seeded(seed) {
      let a = seed;
      return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    function shade(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
      return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
    }
    function isLight(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 170; }
    const mirrorD = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, x, y) => (200 - Number(x)) + ' ' + y);

    // 부위별 path 목록: f = main | dark | deep | light | lapel | accent | none(선)
    function garmentParts(typeKey) {
      const P = [];
      const add = (d, f, extra) => P.push({ d, f, ...(extra || {}) });
      const pair = (d, f, extra) => {
        const e = extra || {};
        add(d, f, e.sl ? { ...e, sl: 'l' } : e);
        add(mirrorD(d), f, e.sl ? { ...e, sl: 'r' } : e);
      };
      const SL = { sl: true };
      const upper = (o) => {
        const w = o.loose || 0, fl = o.flare || 0, hem = o.hem, dr = o.drop || 0, sh = o.shR || 142;
        if (o.hood) add('M74 84 C62 22 138 22 126 84 Z M88 72 C84 38 116 38 112 72 Z', 'dark', { rule: 'evenodd' });
        if (o.sleeve === 'short') pair(`M${sh - 2} ${78 + dr} L${161 + w} ${104 + dr} L${151 + w} ${123 + dr} L${142 + w} 112 Z`, 'main', SL);
        if (o.sleeve === 'long') {
          pair(`M${sh - 2} ${78 + dr} C${155 + w} ${84 + dr} ${159 + w} 116 ${160 + w} 214 L${147 + w} 218 C${145 + w} 176 ${143 + w} 136 ${141 + w} 116 Z`, 'main', SL);
          if (o.cuff) pair(`M${160 + w} 204 L${160 + w} 214 L${147 + w} 218 L${146 + w} 208 Z`, 'dark', SL);
        }
        if (o.sleeve === 'puff') pair(`M${sh - 2} 78 C${160 + w} 70 ${172 + w} 102 ${157 + w} 124 C${150 + w} 129 ${144 + w} 120 ${142 + w} 112 Z`, 'main', SL);
        let neck = 'M86 70 Q100 86 114 70';
        if (o.neck === 'v') neck = `M86 70 L100 ${o.vy || 104} L114 70`;
        if (o.neck === 'high') neck = 'M84 58 L116 58 L117 72';
        const endNeck = o.neck === 'high' ? ' L83 72 Z' : ' Z';
        const armR = o.sleeve === 'none' ? `L${sh + 3} ${96} L${141 + w} 122` : `L${141 + w} 114`;
        const armL = o.sleeve === 'none' ? `L${200 - (141 + w)} 122 L${200 - (sh + 3)} 96` : `L${59 - w} 114`;
        add(`${neck} L${sh} ${78 + dr} ${armR} L${140 + w + fl * 0.4} 170 L${139 + w + fl} ${hem} L${61 - w - fl} ${hem} L${60 - w - fl * 0.4} 170 ${armL} L${200 - sh} ${78 + dr}${endNeck}`, 'main');
        if (o.rib) add(`M${61 - w - fl} ${hem - 7} L${139 + w + fl} ${hem - 7} L${139 + w + fl} ${hem} L${61 - w - fl} ${hem} Z`, 'dark');
        return { w, hem, fl };
      };
      const lower = (o) => {
        const W = 188, hem = o.hem, ho = o.hipOut || 0;
        add(`M68 ${W} L132 ${W} L${134 + ho} 230 L${o.oR} ${hem} L${o.iR} ${hem} L100 ${o.crotch || 252} L${200 - o.iR} ${hem} L${200 - o.oR} ${hem} L${66 - ho} 230 Z`, 'main');
        add(`M68 ${W} L132 ${W} L132 ${W + 9} L68 ${W + 9} Z`, 'dark');
        add(`M100 ${W + 9} L100 238`, 'none');
        pair(`M76 ${W + 9} Q82 214 71 226`, 'none');
        if (o.cuff) pair(`M${o.iR} ${hem - 10} L${o.oR} ${hem - 10} L${o.oR} ${hem} L${o.iR} ${hem} Z`, 'dark');
        return { W, hem };
      };
      const skirt = (o) => {
        const W = 188;
        add(`M70 ${W} L130 ${W} L${130 + o.fl} ${o.hem} L${70 - o.fl} ${o.hem} Z`, 'main');
        add(`M70 ${W} L130 ${W} L130 ${W + 8} L70 ${W + 8} Z`, 'dark');
        if (o.pleats) for (let i = 1; i < 8; i++) { const t = i / 8; add(`M${70 + 60 * t} ${W + 8} L${70 - o.fl + (60 + o.fl * 2) * t} ${o.hem}`, 'none'); }
        if (o.slit) add(`M114 ${o.hem - 64} L116 ${o.hem}`, 'none');
      };
      const buttons = (ys, x = 100) => ys.forEach((y) => add(`M${x - 2.4} ${y} a2.4 2.4 0 1 0 4.8 0 a2.4 2.4 0 1 0 -4.8 0`, 'deep'));
      const lapels = (vy) => pair(`M88 70 L100 ${vy} L94 ${vy} L80 88 Z`, 'lapel');
      switch (typeKey) {
        case 'tee': upper({ hem: 210, sleeve: 'short' }); break;
        case 'otee': upper({ hem: 222, sleeve: 'short', loose: 8, drop: 6 }); break;
        case 'longsleeve': upper({ hem: 210, sleeve: 'long', cuff: true }); break;
        case 'crop': upper({ hem: 160, sleeve: 'short', loose: 2 }); break;
        case 'sweat': upper({ hem: 214, sleeve: 'long', loose: 6, rib: true, cuff: true }); break;
        case 'knit': upper({ hem: 210, sleeve: 'long', loose: 1, rib: true, cuff: true }); break;
        case 'hoodie': { const u = upper({ hem: 216, sleeve: 'long', loose: 8, rib: true, cuff: true, hood: true }); add(`M70 ${u.hem - 46} L130 ${u.hem - 46} L138 ${u.hem - 12} L62 ${u.hem - 12} Z`, 'dark'); add('M94 80 L93 114 M106 80 L107 114', 'none', { stroke: 'light' }); break; }
        case 'blouse': upper({ hem: 206, sleeve: 'puff', loose: 2 }); add('M100 84 L100 200', 'none'); buttons([104, 126, 148, 170]); break;
        case 'vest': upper({ hem: 208, sleeve: 'none', neck: 'v', vy: 128, shR: 132, rib: true }); break;
        case 'shirt': upper({ hem: 214, sleeve: 'long', cuff: true, loose: 2 }); pair('M86 70 L100 90 L90 97 L79 77 Z', 'light'); add('M100 90 L100 212', 'none'); buttons([112, 136, 160, 184]); break;
        case 'blazer': upper({ hem: 236, sleeve: 'long', neck: 'v', vy: 132, loose: 3, shR: 145 }); lapels(132); buttons([152, 176]); pair('M64 184 L88 184 L88 190 L64 190 Z', 'dark'); break;
        case 'trench': upper({ hem: 292, sleeve: 'long', neck: 'v', vy: 124, loose: 4, flare: 14, shR: 145 }); lapels(124); add('M52 190 L148 190 L148 200 L52 200 Z', 'deep'); add('M94 188 L106 188 L106 202 L94 202 Z', 'accent'); buttons([140, 164], 92); buttons([140, 164], 108); buttons([226, 252], 92); buttons([226, 252], 108); break;
        case 'coat': upper({ hem: 282, sleeve: 'long', neck: 'v', vy: 128, loose: 4, flare: 8, shR: 145 }); lapels(128); buttons([150, 180, 210]); pair('M62 214 L88 214 L88 220 L62 220 Z', 'dark'); break;
        case 'puffer': { upper({ hem: 214, sleeve: 'long', loose: 10, neck: 'high', rib: true, cuff: true }); [102, 126, 150, 174, 198].forEach((y) => { add(`M50 ${y} L150 ${y}`, 'none', { stroke: 'deep', op: 0.5 }); pair(`M153 ${y + 6} L169 ${y + 8}`, 'none', { stroke: 'deep', op: 0.5, sl: true }); }); add('M100 58 L100 212', 'none'); break; }
        case 'cardigan': upper({ hem: 216, sleeve: 'long', neck: 'v', vy: 142, loose: 3, rib: true, cuff: true }); add('M100 142 L100 214', 'none'); buttons([154, 174, 194]); break;
        case 'denimjk': upper({ hem: 208, sleeve: 'long', loose: 4, rib: true, cuff: true }); pair('M86 70 L100 90 L90 97 L79 77 Z', 'dark'); pair('M68 104 L92 104 L92 124 L68 124 Z', 'dark'); add('M100 90 L100 206', 'none'); buttons([112, 140, 170], 104); pair('M60 150 L92 150', 'none', { stroke: 'accent', dash: true }); break;
        case 'leather': upper({ hem: 206, sleeve: 'long', loose: 3, cuff: true }); pair('M86 70 L98 92 L88 100 L76 80 Z', 'lapel'); add('M110 76 L94 204', 'none', { stroke: 'accent', sw: 2 }); add('M70 120 Q84 112 92 128', 'none', { stroke: 'light', op: 0.6 }); break;
        case 'wide': lower({ hem: 366, oR: 146, iR: 104, hipOut: 4 }); break;
        case 'sjean': lower({ hem: 366, oR: 130, iR: 104, hipOut: 2 }); pair('M134 232 L130 360', 'none', { stroke: 'accent', dash: true }); break;
        case 'slacks': lower({ hem: 366, oR: 124, iR: 106, hipOut: 1 }); pair('M115 204 L115 360', 'none', { op: 0.5 }); break;
        case 'cargo': lower({ hem: 366, oR: 138, iR: 104, hipOut: 3 }); pair('M134 262 L147 262 L148 298 L135 298 Z', 'dark'); pair('M133 256 L148 256 L148 264 L133 264 Z', 'deep'); break;
        case 'jogger': lower({ hem: 366, oR: 124, iR: 106, hipOut: 2, cuff: true }); break;
        case 'shorts': lower({ hem: 258, oR: 140, iR: 104, hipOut: 3, crotch: 244 }); break;
        case 'askirt': skirt({ hem: 252, fl: 14 }); break;
        case 'pleats': skirt({ hem: 306, fl: 24, pleats: true }); break;
        case 'longskirt': skirt({ hem: 350, fl: 12, slit: true }); break;
        case 'slip': add('M84 98 L86 72 M116 98 L114 72', 'none', { stroke: 'main', sw: 2.4 }); add('M78 100 Q100 90 122 100 L125 188 L146 302 L54 302 L75 188 Z', 'main'); add('M76 188 L124 188', 'none', { op: 0.6 }); break;
        case 'shirtdress': upper({ hem: 196, sleeve: 'long', cuff: true, loose: 2 }); add('M62 192 L138 192 L150 300 L50 300 Z', 'main'); pair('M86 70 L100 90 L90 97 L79 77 Z', 'light'); add('M100 90 L100 296', 'none'); buttons([112, 136, 160, 230, 260]); add('M58 186 L142 186 L142 196 L58 196 Z', 'deep'); break;
        default: upper({ hem: 210, sleeve: 'short' });
      }
      return P;
    }

    const THUMB_VIEW = { top: '-5 16 210 210', long: '-50 14 300 300', bottom: '-5 176 210 210', dress: '-45 50 290 290' };
    function garmentView(typeKey, kind) {
      if (kind === 'bottom') return 'bottom';
      if (kind === 'dress') return 'dress';
      return typeKey === 'trench' || typeKey === 'coat' ? 'long' : 'top';
    }
    const svgUrl = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    function garmentSVG(item, mode) {
      const c = item.color, deep = shade(c, -0.42), dark = shade(c, -0.2), light = shade(c, 0.28);
      const tone = { main: c, dark, deep, light, lapel: shade(c, -0.1), accent: item.typeKey === 'leather' ? '#c9c9c9' : '#d49a4a' };
      const pat = item.pattern;
      let defs = `<filter id="fab" x="-10%" y="-5%" width="120%" height="112%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.2 0 0 0 0" result="na"/><feComposite in="na" in2="SourceAlpha" operator="in" result="t"/><feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="b"/><feOffset in="b" dy="2" result="o"/><feComponentTransfer in="o" result="s"><feFuncA type="linear" slope=".32"/></feComponentTransfer><feMerge><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/><feMergeNode in="t"/></feMerge></filter>`;
      defs += `<linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".16"/><stop offset=".35" stop-color="#fff" stop-opacity=".06"/><stop offset=".65" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>`;
      if (pat === 'stripe') defs += `<pattern id="pt" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="${c}"/><rect width="2.4" height="7" fill="${shade(c, 0.55)}"/></pattern>`;
      if (pat === 'check') defs += `<pattern id="pt" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="${c}"/><rect width="14" height="4" fill="${shade(c, -0.25)}" opacity=".7"/><rect width="4" height="14" fill="${shade(c, -0.25)}" opacity=".7"/></pattern>`;
      if (pat === 'rib') defs += `<pattern id="pt" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="${c}"/><rect width="1.3" height="4" fill="${shade(c, -0.08)}"/></pattern>`;
      const layer = { 'ar-body': (p) => !p.sl, 'ar-l': (p) => p.sl === 'l', 'ar-r': (p) => p.sl === 'r' }[mode];
      const body = garmentParts(item.typeKey).filter(layer || (() => true)).map((p) => {
        if (p.f === 'none') {
          const col = p.stroke ? tone[p.stroke] : deep;
          return `<path d="${p.d}" fill="none" stroke="${col}" stroke-width="${p.sw || 1.1}" stroke-linecap="round"${p.dash ? ' stroke-dasharray="3 2.5"' : ''} opacity="${p.op || 0.85}"/>`;
        }
        const fill = p.f === 'main' && pat ? 'url(#pt)' : tone[p.f];
        const rule = p.rule ? ` fill-rule="${p.rule}"` : '';
        const base = `<path d="${p.d}" fill="${fill}"${rule} stroke="${deep}" stroke-opacity=".55" stroke-width="1" stroke-linejoin="round"/>`;
        return p.f === 'main' ? base + `<path d="${p.d}" fill="url(#g)"${rule}/>` : base;
      }).join('');
      const garment = `<g filter="url(#fab)">${body}</g>`;
      if (mode && mode.startsWith('ar')) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${200 * CANON_SCALE}" height="${390 * CANON_SCALE}" viewBox="0 0 200 390"><defs>${defs}</defs>${garment}</svg>`;
      }
      const vb = THUMB_VIEW[garmentView(item.typeKey, item.kind)];
      const [vx, vy, vw] = vb.split(' ').map(Number);
      const bg = isLight(c) ? '#dfd9cf' : '#eeeae3';
      return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="${vb}"><defs>${defs}</defs><rect x="${vx}" y="${vy}" width="${vw}" height="${vw}" fill="${bg}"/><ellipse cx="100" cy="${vy + vw * 0.94}" rx="${vw * 0.3}" ry="${vw * 0.025}" fill="#000" opacity=".07"/>${garment}</svg>`;
    }

    function generateCatalog() {
      const out = [];
      let n = 0;
      G_TYPES.forEach((t) => {
        t.colors.forEach((colorName, ci) => {
          n += 1;
          const id = 'g' + String(n).padStart(3, '0');
          const r = seeded(hashStr(id + t.key));
          const [hex, colorEn] = G_COLORS[colorName];
          const base = FIT_IDEAL[t.fit];
          const jit = () => Math.round((r() - 0.5) * 12);
          const pattern = (t.pattern && (t.pattern[colorName] || t.pattern['*'])) || null;
          const patLabel = pattern === 'stripe' ? '스트라이프 ' : pattern === 'check' ? '체크 ' : '';
          const item = {
            id, typeKey: t.key, kind: t.kind, category: t.kind === 'bottom' ? 'bottom' : 'top', gender: t.gender,
            name: colorName + ' ' + patLabel + t.name, en: `a ${colorEn} ${pattern === 'stripe' ? 'striped ' : pattern === 'check' ? 'checked ' : ''}${t.en}`,
            brand: G_BRANDS[(hashStr(t.key) + ci) % G_BRANDS.length], tag: t.tag, tpo: t.tpo, color: hex, colorName, pattern,
            price: Math.round((t.price[0] + r() * (t.price[1] - t.price[0])) / 1000) * 1000,
            discount: [0, 0, 0, 0, 5, 10, 15, 20, 25, 30][Math.floor(r() * 10)],
            fitStyle: t.fit, fitId: t.fitId,
            ideal: { shoulder: base.shoulder + jit(), waist: base.waist + jit(), lower: base.lower + jit() },
            desc: t.desc, material: t.mat,
            modelInfo: t.gender === 'W' ? '모델 168cm / 49kg · 착용 S' : '모델 180cm / 70kg · 착용 L',
            expert: FIT_EXPERT[t.fit], thumbPos: '',
            rating: Math.round((4.2 + r() * 0.75) * 10) / 10, reviews: Math.round(12 + Math.pow(r(), 2) * 4800),
            rising: r() < 0.22, ar: { slot: t.kind === 'bottom' ? 'bottom' : t.kind === 'dress' ? 'full' : 'top' },
          };
          item.image = svgUrl(garmentSVG(item, 'thumb'));
          item.images = [item.image];
          out.push(item);
        });
      });
      return out;
    }

    const CATALOG = [...PHOTO_ITEMS, ...generateCatalog()];
    [...CATALOG].sort((a, b) => b.reviews * b.rating - a.reviews * a.rating).forEach((it, i) => { it.rank = i + 1; });

