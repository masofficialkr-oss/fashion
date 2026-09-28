    const STORAGE_KEY = 'lookfit-demo-v5', EXP_TO_NEXT = 100;
    const EXP_RULES = { wear: 20, ar: 15, measure: 30, buy: 50 };
    const WEAR_EXP_DAILY_MAX = 5;
    const TIERS = [
      { lv: 1, key: 't1', title: '루키', next: '스타일러' },
      { lv: 3, key: 't2', title: '스타일러', next: '트렌드세터' },
      { lv: 6, key: 't3', title: '트렌드세터', next: '패션 아이콘' },
      { lv: 10, key: 't4', title: '패션 아이콘', next: null },
    ];
    // 룩핏 마스코트 '룩키' — 투명 PNG + MediaPipe로 추출한 관절 좌표 (scripts/build-mascot.js)
    const CHAR_MODEL = {"src":"./assets/char/looky.png","w":647,"h":1121,"kp":{"left_shoulder":[409,353],"right_shoulder":[239,356],"left_elbow":[473,468],"right_elbow":[172,474],"left_wrist":[560,569],"right_wrist":[90,575],"left_hip":[376,611],"right_hip":[269,610],"left_knee":[383,813],"right_knee":[270,809],"left_ankle":[400,1012],"right_ankle":[253,1018]}};

