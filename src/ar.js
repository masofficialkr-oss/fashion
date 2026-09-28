    // ---------- 포즈 인식 엔진: MediaPipe Pose Landmarker(33관절·분할 마스크) → 실패 시 MoveNet Thunder ----------
    const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
    const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';
    const TFJS_SCRIPTS = [
      'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@4.22.0/dist/tf-core.min.js',
      'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter@4.22.0/dist/tf-converter.min.js',
      'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl@4.22.0/dist/tf-backend-webgl.min.js',
      'https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js',
    ];
    const MP_NAMES = {
      0: 'nose', 2: 'left_eye', 5: 'right_eye', 7: 'left_ear', 8: 'right_ear', 11: 'left_shoulder', 12: 'right_shoulder',
      13: 'left_elbow', 14: 'right_elbow', 15: 'left_wrist', 16: 'right_wrist', 23: 'left_hip', 24: 'right_hip',
      25: 'left_knee', 26: 'right_knee', 27: 'left_ankle', 28: 'right_ankle', 29: 'left_heel', 30: 'right_heel',
    };
    const POSE = { kind: null, label: '', loading: null, vision: null, files: null, buf: null, delegate: null, video: null, image: null, measure: null, movenet: null, error: '' };

    function loadScript(src) {
      return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src));
        document.head.appendChild(s);
      });
    }
    function poseWarmup() {
      if (!POSE.loading) {
        POSE.loading = poseLoadMediaPipe()
          .catch((e) => { POSE.error = String((e && e.message) || e); return poseLoadMoveNet(); })
          .catch((e) => { POSE.loading = null; throw e; });
      }
      return POSE.loading;
    }
    async function poseCreate(mode, masks) {
      const opts = (delegate) => ({
        baseOptions: { modelAssetBuffer: POSE.buf.slice(), delegate }, runningMode: mode, numPoses: 1,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5, outputSegmentationMasks: masks,
      });
      let err;
      for (const d of POSE.delegate ? [POSE.delegate] : ['GPU', 'CPU']) {
        try { const t = await POSE.vision.PoseLandmarker.createFromOptions(POSE.files, opts(d)); POSE.delegate = d; return t; } catch (e) { err = e; }
      }
      throw err;
    }
    async function poseLoadMediaPipe() {
      const vision = await import(MP_BASE + '/vision_bundle.mjs');
      const [files, buf] = await Promise.all([
        vision.FilesetResolver.forVisionTasks(MP_BASE + '/wasm'),
        fetch(MP_MODEL).then((r) => { if (!r.ok) throw new Error('model ' + r.status); return r.arrayBuffer(); }),
      ]);
      POSE.vision = vision; POSE.files = files; POSE.buf = new Uint8Array(buf);
      POSE.video = await poseCreate('VIDEO', false);
      await poseShaderWarm(POSE.video);
      POSE.kind = 'mediapipe';
      POSE.label = 'MediaPipe Pose · ' + POSE.delegate;
    }
    // 첫 추론 때 GPU 셰이더 컴파일로 수 초 멈추는 것을 막기 위해, 사람 형태(룩키)로 미리 한 번 추론
    async function poseShaderWarm(task) {
      try {
        const img = new Image();
        img.src = CHAR_MODEL.src;
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = 320; cv.height = 240;
        const c = cv.getContext('2d');
        c.fillStyle = '#ddd'; c.fillRect(0, 0, 320, 240);
        const s = 230 / img.height;
        c.drawImage(img, 160 - img.width * s / 2, 5, img.width * s, img.height * s);
        const ts = Math.max(performance.now(), (task._ts || 0) + 1);
        task._ts = ts;
        const res = task.detectForVideo(cv, ts);
        if (res && res.close) res.close();
      } catch (_) {}
    }
    async function poseLoadMoveNet() {
      for (const s of TFJS_SCRIPTS) await loadScript(s);
      await tf.setBackend('webgl');
      await tf.ready();
      POSE.movenet = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, { modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER });
      POSE.kind = 'movenet';
      POSE.label = 'MoveNet Thunder';
    }
    // 결과: { w, h, keypoints:[{ name, x, y, score }], mask?: { data, w, h } } — 좌표는 원본 픽셀
    async function poseDetect(el, opts = {}) {
      await poseWarmup();
      const w = el.videoWidth || el.naturalWidth || el.width, h = el.videoHeight || el.naturalHeight || el.height;
      if (POSE.kind === 'movenet') {
        const poses = await POSE.movenet.estimatePoses(el, { maxPoses: 1, flipHorizontal: false });
        return poses[0] ? { w, h, keypoints: poses[0].keypoints } : null;
      }
      let task;
      if (opts.video) task = opts.mask ? (POSE.measure || (POSE.measure = await poseCreate('VIDEO', true))) : POSE.video;
      else task = POSE.image || (POSE.image = await poseCreate('IMAGE', true));
      let res;
      if (opts.video) {
        const ts = Math.max(performance.now(), (task._ts || 0) + 1);
        task._ts = ts;
        res = task.detectForVideo(el, ts);
      } else res = task.detect(el);
      const L = res.landmarks && res.landmarks[0];
      let out = null;
      if (L) {
        out = { w, h, keypoints: Object.entries(MP_NAMES).map(([i, name]) => ({ name, x: L[i].x * w, y: L[i].y * h, score: L[i].visibility == null ? 1 : L[i].visibility })) };
        const m = opts.mask && res.segmentationMasks && res.segmentationMasks[0];
        if (m) out.mask = { data: Float32Array.from(m.getAsFloat32Array()), w: m.width, h: m.height };
      }
      if (res.close) res.close();
      return out;
    }

    // ---------- 사용자 체형 비율 학습: 전신이 잘 보인 프레임마다 어깨폭 대비 비율을 누적 평균 → 가려진 관절 추정에 사용 ----------
    const LEARN_KEYS = ['torso', 'hipW', 'thigh', 'shin'];
    const HIP_RATIO = 0.48;
    const learnDefaults = () => ({ n: 0, c: { torso: 0, hipW: 0, thigh: 0, shin: 0, hipR: 0 }, torso: 1.5, hipW: 0.56, thigh: 1.0, shin: 1.05, hipR: HIP_RATIO });
    function learnModel() {
      if (!state.learn || !state.learn.c) state.learn = learnDefaults();
      if (state.learn.hipR == null) { state.learn.hipR = HIP_RATIO; state.learn.c.hipR = 0; }
      return state.learn;
    }
    // 전신 측정 프레임의 (정수리~골반 관절)/키 비율을 누적 → 발이 안 보이는 근거리 측정의 축척으로 사용
    function learnHipRatio(r) {
      if (!(r > 0.42 && r < 0.56)) return;
      const L = learnModel();
      L.c.hipR = Math.min(200, L.c.hipR + 1);
      L.hipR += (r - L.hipR) / L.c.hipR;
    }
    function learnUpdate(K, info, weight = 1) {
      if (!info || !info.real.hips || !info.frontal) return false;
      const L = learnModel();
      const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      const sw = d(K.ls, K.rs);
      const mid = (a, b) => Pt((a.x + b.x) / 2, (a.y + b.y) / 2);
      const obs = { torso: d(mid(K.ls, K.rs), mid(K.lh, K.rh)) / sw, hipW: d(K.lh, K.rh) / sw };
      if (info.real.lk && info.real.rk) obs.thigh = (d(K.lh, K.lk) + d(K.rh, K.rk)) / 2 / sw;
      if (info.real.lk && info.real.rk && info.real.la && info.real.ra) obs.shin = (d(K.lk, K.la) + d(K.rk, K.ra)) / 2 / sw;
      const bounds = { torso: [1, 2.3], hipW: [0.35, 1], thigh: [0.6, 1.6], shin: [0.6, 1.7] };
      let used = false;
      Object.entries(obs).forEach(([k, v]) => {
        if (!(v >= bounds[k][0] && v <= bounds[k][1])) return;
        L.c[k] = Math.min(400, L.c[k] + weight);
        L[k] += (v - L[k]) * weight / L.c[k];
        used = true;
      });
      if (used) L.n += 1;
      return used;
    }

    // ---------- AR 피팅: 관절 → 의상 메쉬 워핑 ----------
    const AR_REWARD_EXP = 15;
    const AR_DETECT_MS = 32;
    const AR = {
      open: false, mode: null, view: 'tryon', stream: null, raf: 0, src: null, srcPose: null, kp: null, lost: 0, busy: false,
      outfit: { top: null, bottom: null }, size: 'M', sizes: {}, assets: {}, fit: null, railIds: [], filt: {}, jump: 0,
      frames: 0, fpsAt: 0, fps: 0, statusText: '', detAt: 0, learnSaveAt: 0, lastPose: null,
      gest: { side: null, since: 0, prog: 0, lock: false }, focusId: null, timer: 0,
    };
    const rafFn = (f) => (window.requestAnimationFrame ? window.requestAnimationFrame(f) : setTimeout(f, 33));
    const cafFn = (id) => (window.cancelAnimationFrame ? window.cancelAnimationFrame(id) : clearTimeout(id));
    const Pt = (x, y) => ({ x, y });
    const lerpPt = (a, b, t) => Pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    const extPt = (a, b, t) => Pt(a.x + (a.x - b.x) * t, a.y + (a.y - b.y) * t);
    const arItem = (id) => CATALOG.find((c) => c.id === id) || WARDROBE.find((c) => c.id === id);
    const arCapable = (item) => !!(item && item.ar);
    // 사이즈는 아이템별로 기억(기본값 = 그 상품 추천). 내 옷(사진 등록)은 사이즈 개념 없음
    const arSizeOf = (id) => AR.sizes[id] || recommendSize(arItem(id));
    // 추천 사이즈를 기준(x1)으로 잡고, 고른 사이즈의 실측 둘레 비율만큼 폭을 바꿈(체감되도록 1.6배 강조)
    function arSizeScale(item) {
      if (!item || item.custom) return 1;
      const key = fitKind(item) === 'bottom' ? 'hip' : 'chest';
      const r = garmentSpec(item, arSizeOf(item.id))[key] / garmentSpec(item, recommendSize(item))[key];
      return Math.max(0.8, Math.min(1.3, 1 + (r - 1) * 1.6));
    }
    function arSetSize(size) {
      const it = arItem(AR.focusId);
      if (!it || it.custom) return;
      AR.size = size;
      AR.sizes[it.id] = size;
      arRenderSizes();
      arShowNow(it);
      if (AR.kp || AR.srcPose) arTracked();
    }

    function arAsset(item) {
      if (AR.assets[item.id]) return AR.assets[item.id];
      const a = { img: new Image(), ready: false, kp: null };
      if (item.custom) {
        a.kp = item.ar.kp;
        a.img.src = item.ar.src;
      } else if (item.isPhoto) {
        const an = AR_PHOTO_ANCHORS[item.ar.piece];
        a.kp = an.kp;
        a.img.src = an.src;
      } else {
        a.kp = Object.fromEntries(Object.entries(CANON_KP).map(([k, [x, y]]) => [k, [x * CANON_SCALE, y * CANON_SCALE]]));
        a.img.src = svgUrl(garmentSVG(item, 'ar'));
        if (garmentParts(item.typeKey).some((p) => p.sl)) {
          const layer = (mode) => { const L = { img: new Image(), ready: false }; L.img.onload = () => { L.ready = true; }; L.img.src = svgUrl(garmentSVG(item, mode)); return L; };
          a.split = { body: layer('ar-body'), l: layer('ar-l'), r: layer('ar-r') };
        }
      }
      a.img.onload = () => { a.ready = true; };
      AR.assets[item.id] = a;
      return a;
    }
    const assetReady = (a) => a.ready && (!a.split || (a.split.body.ready && a.split.l.ready && a.split.r.ready));
    const kpPoints = (kp) => Object.fromEntries(Object.entries(kp).map(([k, v]) => [k, Pt(v[0], v[1])]));

    // 9행(머리 위·어깨·몸통·골반·허벅지·무릎·정강이·발목·발 아래) x 5열(바깥·관절·중앙·관절·바깥) 메쉬
    function meshGrid(K, scale) {
      const Ls = [extPt(K.ls, K.lh, 0.6), K.ls, lerpPt(K.ls, K.lh, 0.5), K.lh, lerpPt(K.lh, K.lk, 0.5), K.lk, lerpPt(K.lk, K.la, 0.5), K.la, extPt(K.la, K.lk, 0.25)];
      const Rs = [extPt(K.rs, K.rh, 0.6), K.rs, lerpPt(K.rs, K.rh, 0.5), K.rh, lerpPt(K.rh, K.rk, 0.5), K.rk, lerpPt(K.rk, K.ra, 0.5), K.ra, extPt(K.ra, K.rk, 0.25)];
      const sw = Math.hypot(K.ls.x - K.rs.x, K.ls.y - K.rs.y) || 1;
      const su = Pt((K.ls.x - K.rs.x) / sw, (K.ls.y - K.rs.y) / sw);
      const off = sw * 0.62;
      return Ls.map((L, i) => {
        const R = Rs[i];
        const len = Math.hypot(L.x - R.x, L.y - R.y);
        const u = len > sw * 0.15 ? Pt((L.x - R.x) / len, (L.y - R.y) / len) : su;
        const mid = lerpPt(L, R, 0.5);
        const pts = [Pt(L.x + u.x * off, L.y + u.y * off), L, mid, R, Pt(R.x - u.x * off, R.y - u.y * off)];
        return scale === 1 ? pts : pts.map((p) => Pt(mid.x + (p.x - mid.x) * scale, mid.y + (p.y - mid.y) * scale));
      });
    }
    // 원본 삼각형 → 대상 삼각형 아핀 변환으로 이미지 조각을 그림 (경계 틈 방지를 위해 0.8px 확장 클립)
    function arTri(ctx, img, s0, s1, s2, d0, d1, d2) {
      const den = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
      if (Math.abs(den) < 1e-6) return;
      const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / den;
      const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / den;
      const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / den;
      const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / den;
      const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / den;
      const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / den;
      const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
      const grow = (p) => { const dx = p.x - cx, dy = p.y - cy, l = Math.hypot(dx, dy) || 1; return Pt(p.x + dx / l * 0.8, p.y + dy / l * 0.8); };
      const q0 = grow(d0), q1 = grow(d1), q2 = grow(d2);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.closePath(); ctx.clip();
      ctx.transform(a, b, c, d, e, f);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    }
    function arDrawMesh(ctx, img, gs, gd) {
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      for (let i = 0; i < gs.length - 1; i++) {
        for (let j = 0; j < gs[i].length - 1; j++) {
          const s = [gs[i][j], gs[i][j + 1], gs[i + 1][j + 1], gs[i + 1][j]];
          const xs = s.map((p) => p.x), ys = s.map((p) => p.y);
          if (Math.max(...xs) < 0 || Math.max(...ys) < 0 || Math.min(...xs) > iw || Math.min(...ys) > ih) continue;
          const d = [gd[i][j], gd[i][j + 1], gd[i + 1][j + 1], gd[i + 1][j]];
          arTri(ctx, img, s[0], s[1], s[2], d[0], d[1], d[2]);
          arTri(ctx, img, s[0], s[2], s[3], d[0], d[2], d[3]);
        }
      }
    }
    // 루즈핏 의상은 소매 그림이 기준 팔 축(CANON_ARM)보다 w만큼 바깥에 그려짐 → 소매 경로에서 실제 오프셋을 읽음
    function sleeveShift(item) {
      const p = garmentParts(item.typeKey).find((q) => q.sl === 'l' && q.f === 'main');
      if (!p) return 0;
      const long = p.d.match(/L(\d+(?:\.\d+)?) 218/), short = p.d.match(/L(\d+(?:\.\d+)?) 112 Z/);
      return long ? Number(long[1]) - 147 : short ? Number(short[1]) - 142 : 0;
    }
    // 실사 옷 소매 리깅: 원본 팔 관절(어깨→팔꿈치→손목) 둘레를 소매로 떼어 내고, 몸판의 빈자리는 몸통 폭 안에서만 원단색으로 메움
    const PHOTO_SLEEVE_HW = 0.42, TORSO_IN = 0.42, TORSO_OUT = 0.56;
    function photoRig(item, a) {
      const k = a.kp;
      if (!k.le || !k.lw || !k.re || !k.rw) return null;
      const iw = a.img.naturalWidth || a.img.width, ih = a.img.naturalHeight || a.img.height;
      const layer = () => {
        const c = document.createElement('canvas');
        c.width = iw; c.height = ih;
        const x = c.getContext ? c.getContext('2d') : null;
        return x ? { c, x } : null;
      };
      const body = layer();
      if (!body) return null;
      const K = kpPoints(k), sw = Math.hypot(K.ls.x - K.rs.x, K.ls.y - K.rs.y), hw = sw * PHOTO_SLEEVE_HW;
      const hm = lerpPt(K.lh, K.rh, 0.5), hl = Math.hypot(K.lh.x - K.rh.x, K.lh.y - K.rh.y) || 1;
      const hu = Pt((K.lh.x - K.rh.x) / hl, (K.lh.y - K.rh.y) / hl);
      // 몸통 영역: 어깨 → 골반 폭(w) → 아래로는 곧게 (롱코트·원피스 자락이 소매에 딸려 가지 않게)
      const dn = Pt(-hu.y, hu.x), down = dn.y >= 0 ? dn : Pt(-dn.x, -dn.y), far = Math.max(iw, ih) * 2;
      const torso = (w) => {
        const L = Pt(hm.x + hu.x * sw * w, hm.y + hu.y * sw * w), R = Pt(hm.x - hu.x * sw * w, hm.y - hu.y * sw * w);
        return [extPt(K.ls, L, 0.6), K.ls, L, Pt(L.x + down.x * far, L.y + down.y * far), Pt(R.x + down.x * far, R.y + down.y * far), R, K.rs, extPt(K.rs, R, 0.6)];
      };
      const poly = (x, pts) => { x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.closePath(); x.fill(); };
      body.x.drawImage(a.img, 0, 0);
      const rig = { body: body.c, K, hw };
      ['l', 'r'].forEach((s) => {
        const m = layer();
        const S = K[s + 's'], E = K[s + 'e'], Wr = K[s + 'w'];
        m.x.lineCap = 'round'; m.x.lineJoin = 'round'; m.x.lineWidth = hw * 2; m.x.strokeStyle = '#000';
        m.x.beginPath(); [S, E, Wr, extPt(Wr, E, 0.2)].forEach((p, i) => (i ? m.x.lineTo(p.x, p.y) : m.x.moveTo(p.x, p.y))); m.x.stroke();
        m.x.globalCompositeOperation = 'destination-out'; m.x.fillStyle = '#000';
        poly(m.x, torso(TORSO_IN));
        body.x.globalCompositeOperation = 'destination-out';
        body.x.drawImage(m.c, 0, 0);
        m.x.globalCompositeOperation = 'source-in';
        m.x.drawImage(a.img, 0, 0);
        rig[s] = m.c;
      });
      // 빈자리(몸통 폭 안쪽만)는 바로 안쪽 몸판 원단을 바깥으로 밀어 채움 → 팔을 들어도 옆구리가 이어져 보임
      const holes = ['l', 'r'].map((s) => {
        const F = layer(), T = layer(), out = s === 'l' ? hu : Pt(-hu.x, -hu.y);
        F.x.drawImage(rig[s], 0, 0);
        F.x.globalCompositeOperation = 'destination-in'; F.x.fillStyle = '#000';
        poly(F.x, torso(TORSO_OUT));
        T.x.globalCompositeOperation = 'destination-over';
        [0.08, 0.16, 0.26, 0.4, 0.6].forEach((t) => T.x.drawImage(body.c, out.x * sw * t, out.y * sw * t));
        T.x.globalCompositeOperation = 'destination-in';
        T.x.drawImage(F.c, 0, 0);
        return T.c;
      });
      body.x.globalCompositeOperation = 'destination-over';
      holes.forEach((c) => body.x.drawImage(c, 0, 0));
      body.x.globalCompositeOperation = 'source-over';
      return rig;
    }
    function photoSleeve(side, rig, Kd, scale) {
      const Ks = rig.K, o = side === 'l' ? 'r' : 'l';
      const mid = lerpPt(Kd.ls, Kd.rs, 0.5);
      const sc = (p) => Pt(mid.x + (p.x - mid.x) * scale, mid.y + (p.y - mid.y) * scale);
      const S = sc(Kd[side + 's']), O = sc(Kd[o + 's']);
      const E = Kd[side + 'e'], W = Kd[side + 'w'] || Pt(E.x + (E.x - S.x) * 0.95, E.y + (E.y - S.y) * 0.95);
      const f = Math.hypot(S.x - O.x, S.y - O.y) / (Math.hypot(Ks.ls.x - Ks.rs.x, Ks.ls.y - Ks.rs.y) || 1);
      const Se = Ks[side + 'e'], Sw = Ks[side + 'w'];
      const cuff = Math.hypot(Sw.x - Se.x, Sw.y - Se.y) * 0.2 + rig.hw;
      const src = armChain(Ks[side + 's'], Se, Sw, Ks[o + 's'], rig.hw, cuff);
      const dst = armChain(S, E, W, O, rig.hw * f, cuff * f);
      const grid = (ch, hw) => ch.rows.map((p, i) => [-1, 0, 1].map((k) => Pt(p.x + ch.perps[i].x * hw * k, p.y + ch.perps[i].y * hw * k)));
      return [grid(src, rig.hw * 1.12), grid(dst, rig.hw * 1.12 * f * 1.04)];
    }
    function arDrawGarment(ctx, item, Kd, scale = 1, widen = SLEEVE_WIDEN) {
      const a = arAsset(item);
      if (!a.ready) return;
      const gs = meshGrid(kpPoints(a.kp), 1);
      const gd = meshGrid(Kd, scale);
      if ((item.isPhoto || item.custom) && item.ar.slot !== 'bottom') {
        if (a.rig === undefined) a.rig = photoRig(item, a);
        if (a.rig) {
          arDrawMesh(ctx, a.rig.body, gs, gd);
          ['l', 'r'].forEach((s) => {
            if (Kd[s + 'e']) arDrawMesh(ctx, a.rig[s], ...photoSleeve(s, a.rig, Kd, scale));
            else arDrawMesh(ctx, a.rig[s], gs, gd);
          });
          return 'rig';
        }
      }
      const sp = a.split;
      const armed = sp && sp.body.ready && sp.l.ready && sp.r.ready ? ['l', 'r'].filter((s) => Kd[s + 'e']) : [];
      if (!armed.length) { arDrawMesh(ctx, a.img, gs, gd); return; }
      if (a.shift == null) a.shift = sleeveShift(item);
      armed.forEach((s) => arGusset(ctx, item, Kd, s, scale, a));
      ['l', 'r'].forEach((s) => {
        if (armed.includes(s)) arDrawMesh(ctx, sp[s].img, ...sleeveStrips(s, Kd, scale, widen, a.shift));
        else arDrawMesh(ctx, sp[s].img, gs, gd);
      });
      arDrawMesh(ctx, sp.body.img, gs, gd);
    }
    // 의상 한 벌씩 오프스크린에 그려 합성: 생성 의상은 몸 관절 기반 입체 음영을 곱하고,
    // sil(캐릭터 실루엣)이 주어지면 의상을 살짝 팽창시킨 그림자색 바탕을 실루엣 안에만 깔아 소매·몸판 사이 틈과 기본 옷 비침을 가림
    const LAYERS = {};
    function offCanvas(key, W, H) {
      let c = LAYERS[key];
      if (!c) c = LAYERS[key] = document.createElement('canvas');
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      const ctx = c.getContext ? c.getContext('2d') : null;
      if (!ctx) return null;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, W, H);
      return { c, ctx };
    }
    function arShadeMap(K, W, H) {
      const S = offCanvas('s', W, H);
      if (!S) return null;
      const g = S.ctx;
      const sw = Math.hypot(K.ls.x - K.rs.x, K.ls.y - K.rs.y) || 1;
      const mid = (a, b) => Pt((a.x + b.x) / 2, (a.y + b.y) / 2);
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'destination-out';
      g.lineCap = 'round'; g.lineJoin = 'round';
      const tube = (pts, width) => {
        for (let i = 0; i < 6; i++) {
          g.strokeStyle = 'rgba(0,0,0,.24)';
          g.lineWidth = width * (1 - i / 7);
          g.beginPath(); pts.forEach((p, j) => (j ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
        }
      };
      const neck = mid(K.ls, K.rs), pelvis = mid(K.lh, K.rh);
      tube([Pt(neck.x, neck.y - sw * 0.1), pelvis, lerpPt(pelvis, mid(K.lk, K.rk), 0.9)], sw * 1.05);
      ['l', 'r'].forEach((s) => {
        const arm = [K[s + 's'], K[s + 'e'], K[s + 'w']].filter(Boolean);
        if (arm.length > 1) tube(arm, sw * 0.34);
        tube([K[s + 'h'], K[s + 'k'], K[s + 'a']], sw * 0.4);
      });
      g.globalCompositeOperation = 'source-over';
      const blob = (p, r, a) => {
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
      };
      ['l', 'r'].forEach((s) => blob(lerpPt(lerpPt(K[s + 's'], K[s + 'h'], 0.28), neck, 0.12), sw * 0.2, 0.22));
      blob(lerpPt(pelvis, mid(K.lk, K.rk), 0.28), sw * 0.18, 0.2);
      return S.c;
    }
    function arDrawOutfit(ctx, items, K, scale, widen, W, H, opt = {}) {
      let shadeMap;
      items.forEach((it) => {
        const sc = opt.scaleFor ? opt.scaleFor(it) : scale;
        const shaded = !it.isPhoto && !it.custom;
        const G = (shaded || opt.sil) && offCanvas('g', W, H);
        if (!G) { arDrawGarment(ctx, it, K, sc, widen); return; }
        const rigged = arDrawGarment(G.ctx, it, K, sc, widen) === 'rig';
        if (shaded) {
          if (shadeMap === undefined) shadeMap = arShadeMap(K, W, H);
          if (shadeMap) { G.ctx.globalCompositeOperation = 'source-atop'; G.ctx.drawImage(shadeMap, 0, 0); G.ctx.globalCompositeOperation = 'source-over'; }
        }
        // 팔 관절이 없는 사진 옷은 소매가 팔을 따라 휘지 않으므로, 캐릭터에서는 팔과 몸통 사이 허공(손목 높이 위)에 걸린 부분을 지운다
        if (opt.sil && !shaded && !rigged && it.ar.slot !== 'bottom' && K.le && K.lw && K.re && K.rw) {
          const M = offCanvas('m', W, H);
          M.ctx.fillStyle = '#000';
          const dn = Math.hypot(K.ls.x - K.rs.x, K.ls.y - K.rs.y) * 0.45;
          ['l', 'r'].forEach((s) => {
            const S = K[s + 's'], E = K[s + 'e'], Wr = K[s + 'w'], Hp = K[s + 'h'];
            const A = lerpPt(S, E, 0.3), yb = Math.max(Hp.y, Wr.y) + dn;
            M.ctx.beginPath();
            [A, E, Wr, Pt(Wr.x + (Wr.x - Hp.x) * 0.25, yb), Pt(Hp.x, yb)].forEach((p, i) => (i ? M.ctx.lineTo(p.x, p.y) : M.ctx.moveTo(p.x, p.y)));
            M.ctx.closePath(); M.ctx.fill();
          });
          M.ctx.globalCompositeOperation = 'destination-out';
          M.ctx.drawImage(opt.sil, 0, 0);
          G.ctx.globalCompositeOperation = 'destination-out';
          G.ctx.drawImage(M.c, 0, 0);
          G.ctx.globalCompositeOperation = 'source-over';
        }
        if (opt.sil) {
          const D = offCanvas('d', W, H);
          const dd = Math.max(1, Math.hypot(K.ls.x - K.rs.x, K.ls.y - K.rs.y) * 0.07);
          [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7], [2, 0], [-2, 0]].forEach(([x, y]) => D.ctx.drawImage(G.c, x * dd, y * dd));
          D.ctx.globalCompositeOperation = 'source-in';
          D.ctx.fillStyle = shade(it.color || '#555555', -0.18);
          D.ctx.fillRect(0, 0, W, H);
          D.ctx.globalCompositeOperation = 'destination-in';
          D.ctx.drawImage(opt.sil, 0, 0);
          ctx.drawImage(D.c, 0, 0);
        }
        ctx.drawImage(G.c, 0, 0);
      });
    }
    // 팔을 벌리면 몸판 옆선과 소매 안쪽 사이에 생기는 겨드랑이 틈을 원단색 삼각형으로 메움 (소매·몸판이 위에 덮임)
    function arGusset(ctx, item, Kd, s, scale, a) {
      if (a.longSleeve == null) a.longSleeve = garmentParts(item.typeKey).some((p) => p.sl && /\b21\d\b/.test(p.d));
      const o = s === 'l' ? 'r' : 'l';
      const mid = lerpPt(Kd.ls, Kd.rs, 0.5);
      const S = Pt(mid.x + (Kd[s + 's'].x - mid.x) * scale, mid.y + (Kd[s + 's'].y - mid.y) * scale);
      const sw = Math.hypot(Kd.ls.x - Kd.rs.x, Kd.ls.y - Kd.rs.y) * scale;
      const inward = Pt((Kd[o + 's'].x - Kd[s + 's'].x) / (sw || 1) * scale, (Kd[o + 's'].y - Kd[s + 's'].y) / (sw || 1) * scale);
      const P = lerpPt(S, Kd[s + 'e'], a.longSleeve ? 0.5 : 0.28);
      const A = lerpPt(S, Kd[s + 'h'], a.longSleeve ? 0.36 : 0.26);
      const q = (p, k) => Pt(p.x + inward.x * sw * k, p.y + inward.y * sw * k);
      ctx.save();
      ctx.fillStyle = shade(item.color, -0.1);
      ctx.beginPath();
      [q(S, 0.02), P, q(A, 0.06)].forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // 소매 띠 메쉬: 원본(캔버스 기준 팔 축 어깨→팔꿈치→손목)을 실제 팔 관절 축에 붙임. 몸통 쪽 방향을 맞춰 거울 모드에서도 안쪽/바깥쪽이 뒤집히지 않음
    const SLEEVE_HW = 34, SLEEVE_CAP = 24, SLEEVE_CUFF = 12, SLEEVE_WIDEN = 1.15;
    function armChain(S, E, W, other, cap, cuff) {
      const unit = (p) => { const l = Math.hypot(p.x, p.y) || 1; return Pt(p.x / l, p.y / l); };
      const d1 = unit(Pt(E.x - S.x, E.y - S.y)), d2 = unit(Pt(W.x - E.x, W.y - E.y));
      const dm = unit(Pt(d1.x + d2.x, d1.y + d2.y));
      const rows = [Pt(S.x - d1.x * cap, S.y - d1.y * cap), S, E, W, Pt(W.x + d2.x * cuff, W.y + d2.y * cuff)];
      const dirs = [d1, d1, dm, d2, d2];
      const n0 = Pt(-d1.y, d1.x);
      const sign = (other.x - S.x) * n0.x + (other.y - S.y) * n0.y >= 0 ? 1 : -1;
      return { rows, perps: dirs.map((d) => Pt(-d.y * sign, d.x * sign)) };
    }
    function sleeveStrips(side, Kd, scale, widen = SLEEVE_WIDEN, shift = 0) {
      const c = CANON_SCALE, o = side === 'l' ? 'r' : 'l';
      const cp = (k) => Pt(CANON_KP[k][0] * c, CANON_KP[k][1] * c);
      const S0 = cp(side + 's'), O0 = cp(o + 's');
      const dx = (side === 'l' ? shift : -shift) * c;
      const E0 = Pt(CANON_ARM[side].e[0] * c, CANON_ARM[side].e[1] * c), W0 = Pt(CANON_ARM[side].w[0] * c, CANON_ARM[side].w[1] * c);
      const mid = lerpPt(Kd.ls, Kd.rs, 0.5);
      const sc = (p) => Pt(mid.x + (p.x - mid.x) * scale, mid.y + (p.y - mid.y) * scale);
      const S = sc(Kd[side + 's']), O = sc(Kd[o + 's']);
      const E = Kd[side + 'e'], W = Kd[side + 'w'] || Pt(E.x + (E.x - S.x) * 0.95, E.y + (E.y - S.y) * 0.95);
      const f = Math.hypot(S.x - O.x, S.y - O.y) / Math.hypot(S0.x - O0.x, S0.y - O0.y);
      const src = armChain(S0, E0, W0, O0, SLEEVE_CAP * c, SLEEVE_CUFF * c);
      const dst = armChain(S, E, W, O, SLEEVE_CAP * c * f, SLEEVE_CUFF * c * f);
      const grid = (ch, hw, ox = 0) => ch.rows.map((p, i) => [-1, 0, 1].map((k) => Pt(p.x + ox + ch.perps[i].x * hw * k, p.y + ch.perps[i].y * hw * k)));
      return [grid(src, SLEEVE_HW * c, dx), grid(dst, SLEEVE_HW * c * f * widen)];
    }

    // 관절(MediaPipe/MoveNet 공통 이름) → 앵커. 골반/무릎/발목이 가려지면 학습된 사용자 비율로 추정
    function arKeypoints(keypoints, map, info) {
      const k = {};
      keypoints.forEach((p) => { k[p.name] = p; });
      const ok = (n, t) => k[n] && (k[n].score == null || k[n].score >= t);
      if (!ok('left_shoulder', 0.3) || !ok('right_shoulder', 0.3)) return null;
      const g = (n) => map(k[n].x, k[n].y);
      const K = { ls: g('left_shoulder'), rs: g('right_shoulder') };
      const sw = Math.hypot(K.ls.x - K.rs.x, K.ls.y - K.rs.y);
      if (sw < 18) return null;
      const L = learnModel();
      const real = { hips: false, lk: false, rk: false, la: false, ra: false };
      const u = Pt((K.ls.x - K.rs.x) / sw, (K.ls.y - K.rs.y) / sw);
      let n = Pt(-u.y, u.x);
      if (n.y < 0) n = Pt(-n.x, -n.y);
      let hipsOk = ok('left_hip', 0.4) && ok('right_hip', 0.4);
      if (hipsOk) {
        K.lh = g('left_hip'); K.rh = g('right_hip');
        const torso = Math.hypot((K.lh.x + K.rh.x - K.ls.x - K.rs.x) / 2, (K.lh.y + K.rh.y - K.ls.y - K.rs.y) / 2);
        if (torso < sw * 0.7 || (K.lh.y + K.rh.y) < (K.ls.y + K.rs.y)) hipsOk = false;
      }
      real.hips = hipsOk;
      if (!hipsOk) {
        const inset = (1 - L.hipW) / 2;
        K.lh = Pt(K.ls.x + n.x * sw * L.torso - u.x * sw * inset, K.ls.y + n.y * sw * L.torso - u.y * sw * inset);
        K.rh = Pt(K.rs.x + n.x * sw * L.torso + u.x * sw * inset, K.rs.y + n.y * sw * L.torso + u.y * sw * inset);
      }
      const T = Pt((K.lh.x + K.rh.x - K.ls.x - K.rs.x) / 2, (K.lh.y + K.rh.y - K.ls.y - K.rs.y) / 2);
      const tl = Math.hypot(T.x, T.y) || 1;
      const dn = Pt(T.x / tl, T.y / tl);
      const leg = (kn, an, hip, s) => {
        const kOk = ok(kn, 0.45), aOk = kOk && ok(an, 0.45);
        const knee = kOk ? g(kn) : Pt(hip.x + dn.x * sw * L.thigh, hip.y + dn.y * sw * L.thigh);
        const ank = aOk ? g(an) : Pt(knee.x + dn.x * sw * L.shin, knee.y + dn.y * sw * L.shin);
        real[s + 'k'] = kOk; real[s + 'a'] = aOk;
        return [knee, ank];
      };
      [K.lk, K.la] = leg('left_knee', 'left_ankle', K.lh, 'l');
      [K.rk, K.ra] = leg('right_knee', 'right_ankle', K.rh, 'r');
      [['l', 'left'], ['r', 'right']].forEach(([s, nm]) => {
        if (!ok(nm + '_elbow', 0.4)) return;
        const S = K[s + 's'], E = g(nm + '_elbow');
        const upper = Math.hypot(E.x - S.x, E.y - S.y);
        if (upper < sw * 0.35 || upper > sw * 2.2) return;
        K[s + 'e'] = E;
        if (ok(nm + '_wrist', 0.4)) {
          const W = g(nm + '_wrist'), fore = Math.hypot(W.x - E.x, W.y - E.y);
          if (fore > upper * 0.35 && fore < upper * 2) K[s + 'w'] = W;
        }
      });
      if (info) {
        info.real = real;
        info.sw = sw;
        info.frontal = Math.abs(u.y) < 0.25 && (!hipsOk || Math.hypot(K.lh.x - K.rh.x, K.lh.y - K.rh.y) / sw > 0.35);
      }
      return K;
    }
    // One-Euro 필터: 멈춰 있을 땐 떨림을 강하게 줄이고, 빠르게 움직이면 지연 없이 따라감
    function oneEuro(f, v, t, minCut = 1.4, beta = 0.015, dCut = 1) {
      if (f.t == null) { f.t = t; f.x = v; f.dx = 0; return v; }
      const dt = Math.max(0.001, (t - f.t) / 1000);
      f.t = t;
      const alpha = (cut) => { const r = 2 * Math.PI * cut * dt; return r / (r + 1); };
      f.dx += alpha(dCut) * ((v - f.x) / dt - f.dx);
      f.x += alpha(minCut + beta * Math.abs(f.dx)) * (v - f.x);
      return f.x;
    }
    function arSmooth(K, t = performance.now()) {
      const next = {};
      Object.keys(K).forEach((n) => {
        const f = AR.filt[n] || (AR.filt[n] = { x: {}, y: {} });
        next[n] = Pt(oneEuro(f.x, K[n].x, t), oneEuro(f.y, K[n].y, t));
      });
      Object.keys(AR.filt).forEach((n) => { if (!K[n]) delete AR.filt[n]; });
      AR.kp = next;
    }
    function arFitRect(sw, sh, W, H, cover) {
      const s = cover ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
      return { x: (W - sw * s) / 2, y: (H - sh * s) / 2, w: sw * s, h: sh * s, s };
    }
    const arMapFn = (r, W, mirror) => (x, y) => Pt(mirror ? W - (r.x + x * r.s) : r.x + x * r.s, r.y + y * r.s);

    function arStatus(msg, guide) {
      if (AR.statusText !== msg) { AR.statusText = msg; document.getElementById('arStatus').textContent = msg; }
      document.getElementById('arGuide').classList.toggle('show', !!guide);
    }
    function arEngine(label) { document.getElementById('arEngine').textContent = label; }
    function arCanvas() {
      const cv = document.getElementById('arCanvas');
      const ctx = cv.getContext ? cv.getContext('2d') : null;
      if (!ctx) return null;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (w && h && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
      return { ctx, W: cv.width, H: cv.height };
    }
    function arDrawSkeleton(ctx, K, W) {
      const bones = [['ls', 'rs'], ['ls', 'lh'], ['rs', 'rh'], ['lh', 'rh'], ['lh', 'lk'], ['lk', 'la'], ['rh', 'rk'], ['rk', 'ra'], ['ls', 'le'], ['le', 'lw'], ['rs', 're'], ['re', 'rw']];
      ctx.save();
      ctx.lineWidth = Math.max(2, W / 180);
      ctx.strokeStyle = 'rgba(94,234,212,.9)';
      ctx.fillStyle = '#5eead4';
      bones.forEach(([a, b]) => { if (K[a] && K[b]) { ctx.beginPath(); ctx.moveTo(K[a].x, K[a].y); ctx.lineTo(K[b].x, K[b].y); ctx.stroke(); } });
      Object.values(K).forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, ctx.lineWidth * 1.6, 0, Math.PI * 2); ctx.fill(); });
      ctx.restore();
    }
    function arRender() {
      const c = arCanvas();
      if (!c) return;
      const { ctx, W, H } = c;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#141416';
      ctx.fillRect(0, 0, W, H);
      const src = AR.src;
      if (!src) return;
      const sw = src.type === 'video' ? src.el.videoWidth : src.el.naturalWidth;
      const sh = src.type === 'video' ? src.el.videoHeight : src.el.naturalHeight;
      if (!sw || !sh) return;
      const r = arFitRect(sw, sh, W, H, src.type === 'video' && AR.view !== 'measure');
      AR.fit = { r, W, mirror: !!src.mirror };
      if (src.mirror) { ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(src.el, r.x, r.y, r.w, r.h); ctx.restore(); }
      else ctx.drawImage(src.el, r.x, r.y, r.w, r.h);
      if (src.type === 'image' && AR.srcPose) AR.kp = arKeypoints(AR.srcPose, arMapFn(r, W, false));
      if (!AR.kp) return;
      if (AR.view === 'measure') { arDrawSkeleton(ctx, AR.kp, W); return; }
      arDrawOutfit(ctx, [AR.outfit.bottom, AR.outfit.top].map((id) => id && arItem(id)).filter(Boolean), AR.kp, 1, SLEEVE_WIDEN, W, H, { scaleFor: arSizeScale });
      arDrawFitMap(ctx, AR.kp, W, H);
      arDrawGesture(ctx, AR.kp, W);
    }
    function arOnPose(res) {
      const v = AR.fit;
      AR.lastPose = res;
      const info = {};
      const K = res && v ? arKeypoints(res.keypoints, arMapFn(v.r, v.W, v.mirror), info) : null;
      if (K && AR.kp && AR.kp.ls && AR.kp.rs) {
        const prev = Math.hypot(AR.kp.ls.x - AR.kp.rs.x, AR.kp.ls.y - AR.kp.rs.y);
        if (Math.abs(info.sw - prev) / prev > 0.4 && ++AR.jump < 3) return;
      }
      AR.jump = 0;
      if (K) {
        arSmooth(K);
        AR.lost = 0;
        if (learnUpdate(K, info)) {
          const now = performance.now();
          if (now - AR.learnSaveAt > 3000) { AR.learnSaveAt = now; save(); renderArLearn(); }
        }
        if (AR.view === 'tryon') { arTracked(); arGesture(AR.kp, performance.now()); }
        else if (!MEASURE.running && !MEASURE.countdown) measureWatch(res, K, info);
      } else if (++AR.lost > 8) {
        AR.kp = null; AR.filt = {};
        arStatus(AR.view === 'tryon' ? '상반신(어깨~골반)이 화면에 들어오도록 1~2m 뒤로 서 주세요' : '사람을 찾는 중… 정면으로 서 주세요', true);
      }
    }
    function arLoop() {
      if (!AR.open) return;
      arRender();
      const src = AR.src;
      const now = performance.now();
      if (AR.mode === 'camera' && src && src.type === 'video' && POSE.kind && !AR.busy && src.el.readyState >= 2 && now - (AR.detAt || 0) >= AR_DETECT_MS) {
        AR.busy = true;
        AR.detAt = now;
        AR.frames += 1;
        const measuring = AR.view === 'measure' && MEASURE.running;
        poseDetect(src.el, { video: true, mask: measuring })
          .then((res) => { arOnPose(res); if (measuring) measureOnFrame(res); })
          .catch(() => {}).finally(() => { AR.busy = false; });
      }
      if (now - AR.fpsAt > 1000) { AR.fps = AR.frames; AR.frames = 0; AR.fpsAt = now; }
      AR.raf = rafFn(arLoop);
    }
    function arTracked() {
      const names = [arItem(AR.outfit.top), arItem(AR.outfit.bottom)].filter(Boolean).map((i) => i.name + (i.custom ? '' : ' ' + arSizeOf(i.id))).join(' + ') || '아래에서 옷을 선택하세요';
      const modeTxt = AR.mode === 'camera' ? '실시간 추적' + (AR.fps ? ' ' + AR.fps + 'fps' : '') : AR.mode === 'photo' ? '내 사진' : '샘플 모델';
      arStatus(modeTxt + ' · ' + names + (state.fitMap && fitBody().est ? ' · 핏은 키·몸무게 추정' : ''));
      arMaybeReward();
      if (AR.mode === 'camera' && AR.kp) arCoach();
    }
    function arMaybeReward() {
      if (!AR.outfit.top && !AR.outfit.bottom) return;
      const key = todayKey();
      if (state.arRewardDate === key) return;
      state.arRewardDate = key;
      grantExp(AR_REWARD_EXP, 'AR 시착');
    }

    async function arStopSources(keepStream) {
      if (!keepStream && AR.stream) { AR.stream.getTracks().forEach((t) => t.stop()); AR.stream = null; }
      if (!keepStream) document.getElementById('arVideo').srcObject = null;
      AR.src = null; AR.kp = null; AR.srcPose = null; AR.lost = 0; AR.filt = {};
    }
    async function arSetMode(mode) {
      if (mode === 'photo') { document.getElementById('arPhotoInput').click(); return; }
      await arStopSources(mode === 'camera' && AR.mode === 'camera');
      AR.mode = mode;
      arRenderModes();
      if (mode === 'camera') return arStartCamera();
      if (mode === 'sample') return arStartSample();
    }
    async function arStartCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('이 브라우저는 카메라를 지원하지 않아 샘플 모델로 보여드려요');
        return arSetMode('sample');
      }
      arStatus('카메라 권한을 허용해 주세요…');
      try {
        if (!AR.stream) {
          // 4:3 원본 모드(잘라내기 없음) + 줌 최소 → 같은 거리에서 세로로 더 넓게 보여 가까이서도 전신이 들어옴
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 }, aspectRatio: { ideal: 4 / 3 }, resizeMode: { ideal: 'none' } }, audio: false,
          });
          if (!AR.open || AR.mode !== 'camera') { stream.getTracks().forEach((t) => t.stop()); return; }
          AR.stream = stream;
          arWidest(stream);
        }
        const v = document.getElementById('arVideo');
        if (v.srcObject !== AR.stream) v.srcObject = AR.stream;
        await v.play();
      } catch (e) {
        if (!AR.open || AR.mode !== 'camera') return;
        showToast('카메라를 쓸 수 없어 샘플 모델로 전환합니다');
        return arSetMode('sample');
      }
      if (!AR.open || AR.mode !== 'camera') return;
      AR.src = { type: 'video', el: document.getElementById('arVideo'), mirror: true };
      arEngine(POSE.label || 'AI 모델 준비 중');
      if (!POSE.kind) arStatus('AI 포즈 모델 불러오는 중… (처음 한 번만)');
      try {
        await poseWarmup();
        arEngine(POSE.label);
        if (AR.mode === 'camera' && !AR.kp) arStatus(AR.view === 'measure' ? '전신이 화면에 들어오게 서 주세요' : '상반신이 보이게 서 주세요 · 어깨/골반/팔을 자동으로 찾아요', true);
      } catch (e) {
        arStatus('포즈 모델을 불러오지 못했어요(네트워크 확인) → 샘플 모델로 체험해 보세요');
      }
    }
    function arWidest(stream) {
      const track = stream.getVideoTracks && stream.getVideoTracks()[0];
      const caps = track && track.getCapabilities ? track.getCapabilities() : {};
      if (caps.zoom && caps.zoom.min != null) track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] }).catch(() => {});
    }
    function arStartSample() {
      arEngine('샘플 모델 · 사전 분석 관절');
      const img = new Image();
      img.onload = () => {
        if (AR.mode !== 'sample') return;
        AR.src = { type: 'image', el: img };
        AR.srcPose = Object.entries(SAMPLE_MODEL.kp).map(([name, [x, y]]) => ({ name, x, y, score: 0.9 }));
        if (AR.view === 'tryon') arTracked();
      };
      img.src = SAMPLE_MODEL.src;
      arStatus('샘플 모델을 불러오는 중…');
    }
    async function arUsePhoto(dataUrl) {
      await arStopSources(false);
      AR.mode = 'photo';
      arRenderModes();
      const img = new Image();
      img.src = dataUrl;
      try { await img.decode(); } catch (_) {}
      if (AR.mode !== 'photo') return;
      AR.src = { type: 'image', el: img };
      arStatus('사진에서 관절을 찾는 중…');
      try {
        const res = await poseDetect(img, { video: false });
        arEngine(POSE.label);
        if (AR.mode !== 'photo') return;
        if (res && arKeypoints(res.keypoints, (x, y) => Pt(x, y))) { AR.srcPose = res.keypoints; arTracked(); }
        else arStatus('사람을 찾지 못했어요. 정면 전신/상반신 사진을 올려 주세요', true);
      } catch (e) {
        arStatus('포즈 모델을 불러오지 못했어요 → 샘플 모델을 이용해 주세요');
      }
    }

    function arPut(item) {
      const slot = item.ar.slot;
      const top = arItem(AR.outfit.top);
      if (slot === 'bottom') { if (top && top.ar.slot === 'full') AR.outfit.top = null; AR.outfit.bottom = item.id; }
      else { AR.outfit.top = item.id; if (slot === 'full') AR.outfit.bottom = null; }
      arAsset(item);
    }
    function arToggle(id) {
      const item = arItem(id);
      if (!arCapable(item)) return;
      const worn = AR.outfit.top === id || AR.outfit.bottom === id;
      if (worn && AR.focusId !== id) { AR.focusId = id; arShowNow(item); }
      else if (worn) {
        if (AR.outfit.top === id) AR.outfit.top = null; else AR.outfit.bottom = null;
        AR.focusId = AR.outfit.top || AR.outfit.bottom;
      } else { arPut(item); AR.focusId = id; arShowNow(item); }
      arRenderRail(); arRenderSizes();
      if (AR.kp || AR.srcPose) arTracked();
    }
    function arRenderModes() {
      document.querySelectorAll('#arModes [data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === AR.mode));
    }
    function arRenderSizes() {
      const it = arItem(AR.focusId) || arItem(AR.outfit.top) || arItem(AR.outfit.bottom);
      const el = document.getElementById('arSizes');
      if (it && it.custom) { el.innerHTML = '<span class="lbl">사이즈</span><span class="ar-size-note">내 옷은 사진 크기 그대로 입혀요</span>'; return; }
      const rec = recommendSize(it);
      if (it) AR.size = arSizeOf(it.id);
      const slot = it ? (it.ar.slot === 'bottom' ? '하의' : it.ar.slot === 'full' ? '전신' : '상의') : '';
      el.innerHTML = `<span class="lbl">사이즈${slot ? '<small>' + slot + '</small>' : ''}</span>` + SIZES.map((s) =>
        `<button type="button" class="ar-chip ${AR.size === s ? 'active' : ''}" data-size="${s}">${s}${s === rec ? '<i>추천</i>' : ''}</button>`).join('');
      el.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => arSetSize(b.dataset.size)));
    }
    function arRenderRail() {
      const on = [AR.outfit.top, AR.outfit.bottom];
      const ids = arRailVisible();
      document.getElementById('arRail').innerHTML = ids.map((id) => {
        const it = arItem(id);
        const slotTxt = it.custom ? '내 옷' : it.ar.slot === 'bottom' ? '하의' : it.ar.slot === 'full' ? '전신' : '상의';
        return `<button type="button" class="ar-item ${on.includes(id) ? 'on' : ''}" data-ar="${id}" title="${it.name}"><img class="${posClass(it)}" src="${it.image}" alt="" draggable="false"><span class="slot">${slotTxt}</span></button>`;
      }).join('') + '<button type="button" class="ar-item add" id="arAddGarment" title="사진으로 내 옷 등록"><b>+</b><span>옷 등록</span></button>' +
        (ids.length ? '' : '<p class="ar-empty">이 카테고리에 입어볼 옷이 없어요</p>');
      document.querySelectorAll('#arRail [data-ar]').forEach((b) => b.addEventListener('click', () => arToggle(b.dataset.ar)));
      document.getElementById('arAddGarment').addEventListener('click', () => document.getElementById('garmentInput').click());
      dragScroll(document.getElementById('arRail'));
    }
    function arRailIds(focus) {
      const ids = [...focus, ...WARDROBE.map((g) => g.id), state.wornCatalog.topId, state.wornCatalog.bottomId, ...state.ownedIds, ...state.wishlist, ...(state.recommendedIds || []),
        ...CATALOG.filter((c) => c.isPhoto).map((c) => c.id),
        ...CATALOG.filter((c) => !c.isPhoto).sort((a, b) => fitScore(b) - fitScore(a)).slice(0, 18).map((c) => c.id)];
      return [...new Set(ids.filter(Boolean))].filter((id) => arCapable(arItem(id))).slice(0, 40);
    }
    // AR 탭 진입 시 호출. ids가 있으면 해당 옷으로 시착 시작
    function openAR(ids, view) {
      const focus = (ids || []).filter((id) => arCapable(arItem(id)));
      if (ids && ids.length || !AR.outfit.top && !AR.outfit.bottom) {
        if (!focus.length) focus.push(...[state.wornCatalog.topId, state.wornCatalog.bottomId].filter((id) => arCapable(arItem(id))));
        if (!focus.length) focus.push(...CATALOG.filter((c) => c.isPhoto && c.ar).slice(0, 2).map((c) => c.id));
        AR.outfit = { top: null, bottom: null };
        focus.forEach((id) => arPut(arItem(id)));
        AR.focusId = focus[0];
      }
      AR.railIds = arRailIds([AR.outfit.top, AR.outfit.bottom].filter(Boolean));
      if (view) AR.view = view;
      AR.statusText = '';
      if (document.querySelector('.screen.active')?.dataset.screen !== 'ar') switchTab('ar');
      else arActivate();
    }
    function arActivate() {
      const wasOpen = AR.open;
      AR.open = true;
      renderArView();
      arRenderSizes();
      arRenderCats();
      arRenderRail();
      arRenderToggles();
      renderLookBtn();
      if (!AR.focusId || ![AR.outfit.top, AR.outfit.bottom].includes(AR.focusId)) AR.focusId = AR.outfit.top || AR.outfit.bottom;
      if (!wasOpen || !AR.mode) {
        const canCam = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        arSetMode(canCam ? 'camera' : 'sample');
      }
      cafFn(AR.raf);
      AR.raf = rafFn(arLoop);
    }
    async function closeAR() {
      AR.open = false;
      cafFn(AR.raf);
      measureCancel();
      await arStopSources(false);
      AR.mode = null;
    }
    // 착용샷은 앱 안 룩 앨범에 저장 (핏 라벨 없이 깨끗한 컷). 앨범에서 비교·다시 입기·담기·다운로드
    function arCapture() {
      const cv = document.getElementById('arCanvas');
      const fm = state.fitMap;
      state.fitMap = false; arRender();
      let img = null;
      try {
        const k = Math.min(1, 360 / cv.width), s = document.createElement('canvas');
        s.width = Math.round(cv.width * k); s.height = Math.round(cv.height * k);
        s.getContext('2d').drawImage(cv, 0, 0, s.width, s.height);
        img = s.toDataURL('image/jpeg', 0.82);
      } catch (e) { img = null; }
      state.fitMap = fm; arRender();
      if (!img || img.length < 100) { showToast('로컬 파일 실행에서는 실사 의상 캡처가 막혀요 (node scripts/serve.js 로 실행)'); return; }
      const ids = [AR.outfit.top, AR.outfit.bottom].filter(Boolean);
      const n = lookAdd({ img, top: AR.outfit.top, bottom: AR.outfit.bottom, sizes: Object.fromEntries(ids.map((id) => [id, arSizeOf(id)])) });
      flashScreen(n ? `룩 앨범에 저장했어요 · ${n}/${LOOK_MAX}` : '저장 공간이 부족해 앨범에 저장하지 못했어요');
    }
    function downloadCanvas(cv, prefix) {
      downloadUrl(cv.toDataURL('image/png'), prefix + Date.now() + '.png');
    }
    function downloadUrl(url, name) {
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
    }

    // ---------- 룩 앨범: 최대 8컷 · 2컷 나란히 비교 ----------
    const LOOK_KEY = 'lookfit-looks-v1', LOOK_MAX = 8;
    let LOOKS = [];
    const LOOK_SEL = [];
    try { const v = JSON.parse(localStorage.getItem(LOOK_KEY) || '[]'); if (Array.isArray(v)) LOOKS = v.filter((l) => l && l.id && l.img); } catch (_) {}
    function looksPersist() {
      while (LOOKS.length) {
        try { localStorage.setItem(LOOK_KEY, JSON.stringify(LOOKS)); return true; } catch (_) { LOOKS.pop(); }
      }
      try { localStorage.removeItem(LOOK_KEY); } catch (_) {}
      return false;
    }
    function lookAdd(look) {
      LOOKS.unshift({ id: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), ...look });
      LOOKS = LOOKS.slice(0, LOOK_MAX);
      const ok = looksPersist();
      renderLookBtn();
      return ok ? LOOKS.length : 0;
    }
    function lookInfo(l) {
      const items = [l.top, l.bottom].filter(Boolean).map((id) => ({ id, it: arItem(id), size: (l.sizes || {})[id] }));
      const shop = items.filter((x) => x.it && !x.it.custom);
      return { items, shop, total: shop.reduce((s, x) => s + salePrice(x.it), 0) };
    }
    function renderLookBtn() {
      const b = document.getElementById('arLooks');
      if (!b) return;
      const l = LOOKS[0];
      b.innerHTML = (l ? `<img src="${l.img}" alt="">` : '<svg class="i" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 15l4-4 5 5 3-3 4 4"/></svg>') + (LOOKS.length ? `<b>${LOOKS.length}</b>` : '');
    }
    function openLooks() {
      LOOK_SEL.length = 0;
      renderLooks();
      document.getElementById('lookSheet').classList.add('show');
    }
    function closeLooks() { document.getElementById('lookSheet').classList.remove('show'); }
    function lookToggle(id) {
      const i = LOOK_SEL.indexOf(id);
      if (i >= 0) LOOK_SEL.splice(i, 1);
      else { LOOK_SEL.push(id); if (LOOK_SEL.length > 2) LOOK_SEL.shift(); }
      renderLooks();
    }
    function renderLooks() {
      const sel = LOOK_SEL.map((id) => LOOKS.find((l) => l.id === id)).filter(Boolean);
      document.getElementById('lookCount').textContent = `${LOOKS.length}/${LOOK_MAX}`;
      const cmp = document.getElementById('lookCompare');
      cmp.hidden = sel.length !== 2;
      if (sel.length === 2) {
        const info = sel.map(lookInfo);
        cmp.innerHTML = '<div class="lc-cols">' + sel.map((l, n) => {
          const f = info[n], other = info[1 - n];
          const rows = f.items.map((x) => x.it
            ? `<li><small>${x.it.ar.slot === 'bottom' ? '하의' : x.it.ar.slot === 'full' ? '전신' : '상의'}${x.size && !x.it.custom ? ' · ' + x.size : ''}</small><b>${x.it.name}</b>${x.it.custom ? '' : `<em>${fitSummary(x.it, x.size || recommendSize(x.it)).split(' · ').slice(0, 2).join(' · ')}</em>`}</li>`
            : '<li><b>삭제된 옷</b></li>').join('');
          const diff = f.total - other.total;
          return `<div class="lc-col"><img src="${l.img}" alt=""><span class="lc-tag">${String.fromCharCode(65 + n)}</span><ul>${rows}</ul>
            <div class="lc-sum">${f.shop.length ? won(f.total) : '내 옷 코디'}${f.shop.length && other.shop.length && diff ? `<small>${diff > 0 ? '+' : '-'}${won(Math.abs(diff))}</small>` : ''}</div>
            <div class="lc-act"><button type="button" class="btn sm dark-line" data-lwear="${l.id}">다시 입기</button><button type="button" class="btn sm mint" data-lcart="${l.id}" ${f.shop.length ? '' : 'disabled'}>담기</button></div></div>`;
        }).join('') + '</div>';
      }
      const one = sel.length === 1 ? sel[0] : null;
      document.getElementById('lookHint').textContent = !LOOKS.length ? '아직 저장한 룩이 없어요 · AR에서 착용샷을 찍어 보세요' : sel.length === 2 ? 'A · B 룩을 나란히 비교 중' : '두 컷을 고르면 나란히 비교해요';
      document.getElementById('lookGrid').innerHTML = LOOKS.map((l) => {
        const f = lookInfo(l), n = LOOK_SEL.indexOf(l.id);
        return `<button type="button" class="look-card ${n >= 0 ? 'on' : ''}" data-look="${l.id}"><img src="${l.img}" alt="">${n >= 0 ? `<i>${String.fromCharCode(65 + n)}</i>` : ''}
          <span>${f.items.map((x) => (x.it ? x.it.name : '삭제된 옷') + (x.size && x.it && !x.it.custom ? ' ' + x.size : '')).join(' + ')}</span></button>`;
      }).join('');
      const bar = document.getElementById('lookBar');
      bar.hidden = !one;
      if (one) bar.innerHTML = `<button type="button" class="btn sm dark-line" data-lwear="${one.id}">다시 입기</button><button type="button" class="btn sm mint" data-lcart="${one.id}" ${lookInfo(one).shop.length ? '' : 'disabled'}>담기</button><button type="button" class="btn sm line" data-ldown="${one.id}">다운로드</button><button type="button" class="btn sm line" data-ldel="${one.id}">삭제</button>`;
      const sheet = document.getElementById('lookSheet');
      sheet.querySelectorAll('[data-look]').forEach((b) => b.addEventListener('click', () => lookToggle(b.dataset.look)));
      sheet.querySelectorAll('[data-lwear]').forEach((b) => b.addEventListener('click', () => lookWear(b.dataset.lwear)));
      sheet.querySelectorAll('[data-lcart]').forEach((b) => b.addEventListener('click', () => lookCart(b.dataset.lcart)));
      sheet.querySelectorAll('[data-ldown]').forEach((b) => b.addEventListener('click', () => { const l = LOOKS.find((x) => x.id === b.dataset.ldown); if (l) downloadUrl(l.img, 'lookfit-look-' + l.at + '.jpg'); }));
      sheet.querySelectorAll('[data-ldel]').forEach((b) => b.addEventListener('click', () => lookDelete(b.dataset.ldel)));
    }
    function lookWear(id) {
      const l = LOOKS.find((x) => x.id === id);
      if (!l) return;
      const ids = [l.top, l.bottom].filter((x) => x && arCapable(arItem(x)));
      if (!ids.length) { showToast('이 룩의 옷을 더 이상 찾을 수 없어요'); return; }
      Object.entries(l.sizes || {}).forEach(([k, v]) => { AR.sizes[k] = v; });
      closeLooks();
      AR.view = 'tryon';
      openAR(ids);
      showToast('저장한 룩을 다시 입었어요 · ' + ids.map((x) => arItem(x).name).join(' + '));
    }
    function lookCart(id) {
      const l = LOOKS.find((x) => x.id === id);
      const f = l && lookInfo(l);
      if (!f || !f.shop.length) return;
      f.shop.forEach((x) => addToCart(cartKey(x.id, x.size || recommendSize(x.it)), 1));
      showToast(`${f.shop.length}벌을 장바구니에 담았어요 · ${f.shop.map((x) => x.size || recommendSize(x.it)).join(' / ')}`);
    }
    function lookDelete(id) {
      LOOKS = LOOKS.filter((l) => l.id !== id);
      const i = LOOK_SEL.indexOf(id);
      if (i >= 0) LOOK_SEL.splice(i, 1);
      looksPersist(); renderLooks(); renderLookBtn();
      showToast('룩을 삭제했어요');
    }

    // ---------- 오프라인: 서비스 워커가 앱·에셋·AI 모델·폰트를 기기에 보관 (file://에서는 불가) ----------
    const OFFLINE = { reg: null };
    function offlineSupported() { return 'serviceWorker' in navigator && /^https?:$/.test(location.protocol); }
    function offlineRegister() {
      if (!offlineSupported()) return null;
      OFFLINE.reg = navigator.serviceWorker.register('./sw.js').catch(() => null);
      return OFFLINE.reg;
    }
    function offlineUrls() {
      const assets = new Set(document.documentElement.outerHTML.match(/\.\/assets\/[\w\-./]+\.(?:png|jpe?g|webp|svg|gif)/g) || []);
      const font = document.querySelector('link[rel="stylesheet"][href*="pretendard"]');
      return [
        './', './index.html', ...assets,
        MP_BASE + '/vision_bundle.mjs', MP_BASE + '/wasm/vision_wasm_internal.js', MP_BASE + '/wasm/vision_wasm_internal.wasm',
        MP_MODEL, SEG_MODEL, ...(font ? [font.href] : []),
      ];
    }
    function swAsk(msg) {
      return navigator.serviceWorker.ready.then((reg) => new Promise((resolve) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => resolve(e.data);
        reg.active.postMessage(msg, [ch.port2]);
      }));
    }
    async function offlinePrecache() {
      if (!offlineSupported()) return { skip: true, detail: '파일로 열어서 불가 · 서버 주소로 열기' };
      if (!OFFLINE.reg) offlineRegister();
      const r = await swAsk({ type: 'precache', urls: offlineUrls() });
      if (r.fail.length) throw new Error(`${r.fail.length}개 저장 실패 · 온라인에서 다시`);
      return { detail: `${r.ok}개 · ${Math.round(r.bytes / 1048576)}MB 저장` };
    }

    // ---------- 시연 준비: 첫 실행 지연(모델 다운로드·셰이더 컴파일)과 권한 팝업을 시연 전에 미리 끝내 둠 ----------
    const DEMO = { running: false, rows: [] };
    function renderDemoPrep() {
      const el = document.getElementById('demoPrepList');
      if (!el) return;
      el.innerHTML = DEMO.rows.map((r) => `<li data-k="${r.k}"><i class="${r.st}"></i><b>${r.label}</b><span>${r.detail || ''}</span></li>`).join('');
    }
    async function demoPrep() {
      if (DEMO.running) return;
      DEMO.running = true;
      const btn = document.getElementById('btnDemoPrep'), sub = document.getElementById('demoPrepSub');
      btn.disabled = true; btn.textContent = '확인 중…';
      const photos = CATALOG.filter((c) => c.isPhoto && c.ar);
      DEMO.rows = [
        { k: 'pose', label: 'AI 포즈 모델 예열' },
        { k: 'seg', label: '옷 분할 모델 예열' },
        { k: 'cam', label: '카메라 권한' },
        { k: 'assets', label: `실사 옷 ${photos.length}벌 · 소매 리깅` },
        { k: 'offline', label: '오프라인 저장 (인터넷 없이 시연)' },
        { k: 'coach', label: '혼자 쓰기 안내 다시 보이기' },
      ].map((r) => ({ ...r, st: '', detail: '' }));
      const t0 = performance.now();
      const step = async (k, fn, ms = 30000) => {
        const r = DEMO.rows.find((x) => x.k === k), s = performance.now();
        r.st = 'run'; renderDemoPrep();
        try {
          const out = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${ms / 1000}초 초과 · 네트워크 확인`)), ms))]);
          r.st = out && out.skip ? 'skip' : 'ok';
          r.detail = (out && out.detail) || ((performance.now() - s) / 1000).toFixed(1) + '초';
        } catch (e) { r.st = 'fail'; r.detail = (e && e.message) || '실패'; }
        renderDemoPrep();
      };
      await step('pose', async () => { await poseWarmup(); return { detail: POSE.label }; });
      await step('seg', async () => {
        if (POSE.kind !== 'mediapipe') return { skip: true, detail: 'MoveNet 모드 · 옷 등록 제외' };
        const c = document.createElement('canvas'); c.width = 256; c.height = 256;
        const g = c.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, 256, 256);
        await segClothes(c);
      });
      await step('cam', async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('카메라 없음 → 샘플·사진 모드');
        let s;
        try { s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); } catch (e) { throw new Error(e && e.name === 'NotAllowedError' ? '권한 거부 → 브라우저 설정에서 허용' : '카메라를 열 수 없음'); }
        const tr = s.getVideoTracks()[0], set = tr && tr.getSettings ? tr.getSettings() : {};
        s.getTracks().forEach((t) => t.stop());
        return { detail: set.width ? `허용 · ${set.width}x${set.height}` : '허용' };
      }, 20000);
      await step('assets', async () => {
        const ready = await Promise.all(photos.map((it) => new Promise((res) => {
          const a = arAsset(it), until = Date.now() + 12000;
          const tick = () => { if (a.ready) { if (a.rig === undefined) a.rig = photoRig(it, a); res(true); } else if (Date.now() > until) res(false); else setTimeout(tick, 60); };
          tick();
        })));
        const ok = ready.filter(Boolean).length, rigged = photos.filter((it) => AR.assets[it.id] && AR.assets[it.id].rig).length;
        if (ok < photos.length) throw new Error(`${photos.length - ok}벌 불러오기 실패`);
        return { detail: `${ok}벌 준비 · 소매 ${rigged}벌` };
      });
      await step('offline', offlinePrecache, 180000);
      await step('coach', async () => { state.arCoachSeen = false; save(); return { detail: 'AR 첫 화면에서 표시' }; });
      const okN = DEMO.rows.filter((r) => r.st === 'ok' || r.st === 'skip').length;
      sub.textContent = okN === DEMO.rows.length ? `시연 준비 완료 · ${((performance.now() - t0) / 1000).toFixed(1)}초` : `${DEMO.rows.length - okN}개 항목을 확인해 주세요 · 실패해도 샘플 모델로 시연할 수 있어요`;
      btn.disabled = false; btn.textContent = '다시 확인';
      DEMO.running = false;
      showToast(okN === DEMO.rows.length ? '시연 준비 완료 · AR 시작이 바로 떠요' : '일부 항목을 확인해 주세요');
      return DEMO.rows.map((r) => r.k + ':' + r.st).join(',');
    }

    // ---------- 혼자서도 쓰는 AR: 음성·비프 안내, 손 들기 제스처, 타이머 촬영 ----------
    const VOICE = { at: 0, last: '' };
    function speak(text, force) {
      if (!state.voice || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
      const now = performance.now();
      if (!force && (now - VOICE.at < 3500 || (text === VOICE.last && now - VOICE.at < 8000))) return;
      VOICE.last = text; VOICE.at = now;
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ko-KR'; u.rate = 1.05;
        speechSynthesis.speak(u);
      } catch (_) {}
    }
    let audioCtx = null;
    function beep(freq = 880, ms = 110) {
      if (!state.voice) return;
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime;
        o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination);
        g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
        o.start(t); o.stop(t + ms / 1000);
      } catch (_) {}
    }
    // 오른손을 어깨 위로 들고 0.6초 → 다음 옷, 왼손 → 이전 옷, 양손 → 3초 타이머 촬영. 손을 내려야 다음 동작을 받음
    const GESTURE_HOLD = 600, GESTURE_BOTH_HOLD = 850;
    function arGesture(K, t) {
      const G = AR.gest;
      if (!K || !state.gesture || AR.mode !== 'camera' || AR.view !== 'tryon' || AR.timer) { G.side = null; G.prog = 0; return; }
      const sw = Math.hypot(K.ls.x - K.rs.x, K.ls.y - K.rs.y);
      const up = (s) => !!(K[s + 'w'] && K[s + 'e'] && K[s + 'w'].y < K[s + 's'].y - sw * 0.25 && K[s + 'w'].y < K[s + 'e'].y);
      const l = up('l'), r = up('r');
      const side = l && r ? 'both' : r ? 'r' : l ? 'l' : null;
      if (!side) { G.side = null; G.prog = 0; G.lock = false; return; }
      if (G.lock) return;
      if (side !== G.side) { G.side = side; G.since = t; }
      G.prog = Math.min(1, (t - G.since) / (side === 'both' ? GESTURE_BOTH_HOLD : GESTURE_HOLD));
      if (G.prog < 1) return;
      G.lock = true; G.prog = 0;
      if (side === 'both') arTimerCapture();
      else arStep(side === 'r' ? 1 : -1, true);
    }
    function arDrawGesture(ctx, K, W) {
      const G = AR.gest;
      if (!G.side || !G.prog || !K) return;
      const r = Math.max(14, W / 16);
      (G.side === 'both' ? ['l', 'r'] : [G.side]).forEach((s) => {
        const p = K[s + 'w'];
        if (!p) return;
        ctx.save();
        ctx.lineWidth = r * 0.28; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#19B394';
        ctx.beginPath(); ctx.arc(p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * G.prog); ctx.stroke();
        ctx.restore();
      });
    }
    // 핏 맵: 입은 옷의 부위별 여유를 몸 위 해당 위치에 라벨로 표시 (선택한 옷은 3부위, 나머지 옷은 대표 1부위)
    const FIT_TONE = { good: '#19B394', warn: '#F0A020', bad: '#E5484D', info: '#8A8F98' };
    const FIT_KEYS = { top: ['shoulder', 'chest', 'length'], dress: ['chest', 'waist', 'length'], bottom: ['waist', 'hip', 'length'] };
    function arFitAnchors(item, K) {
      const b = fitBody().v, s = garmentSpec(item, arSizeOf(item.id));
      const shY = (K.ls.y + K.rs.y) / 2, hipY = (K.lh.y + K.rh.y) / 2, tp = hipY - shY;
      const L = Math.min(K.ls.x, K.rs.x), R = Math.max(K.ls.x, K.rs.x), cx = (K.ls.x + K.rs.x + K.lh.x + K.rh.x) / 4;
      const rightSh = K.ls.x > K.rs.x ? K.ls : K.rs;
      if (fitKind(item) === 'bottom') {
        const wy = hipY - tp * 0.12, ay = (K.la.y + K.ra.y) / 2;
        const hemY = wy + (s.length / (b.leg + 14)) * (ay - wy);
        const hL = Math.min(K.lh.x, K.rh.x), hR = Math.max(K.lh.x, K.rh.x), hw = hR - hL;
        return {
          waist: [Pt(hL - hw * 0.1, wy), -1],
          hip: [Pt(hR + hw * 0.15, hipY + tp * 0.1), 1],
          length: [Pt((K.la.x + K.ra.x) / 2, hemY), -1],
        };
      }
      return {
        shoulder: [rightSh, 1],
        chest: [Pt(L + (R - L) * 0.06, shY + tp * 0.35), -1],
        waist: [Pt(R - (R - L) * 0.1, shY + tp * 0.7), 1],
        length: [Pt(cx, shY + (s.length / b.torso) * tp), 1],
      };
    }
    function arDrawFitMap(ctx, K, W, H) {
      if (!state.fitMap || AR.view !== 'tryon' || !K || !K.ls || !K.lh || !K.la) return;
      const ids = [AR.focusId, AR.outfit.top, AR.outfit.bottom].filter((id, i, a) => id && a.indexOf(id) === i && (id === AR.outfit.top || id === AR.outfit.bottom));
      const fs = Math.max(10, Math.round(W / 30)), ph = fs * 1.7, placed = [];
      ctx.save();
      ctx.font = `700 ${fs}px Pretendard, 'Apple SD Gothic Neo', sans-serif`;
      ctx.textBaseline = 'middle';
      ids.forEach((id, n) => {
        const it = arItem(id);
        if (!it || it.custom) return;
        const kind = fitKind(it), parts = fitParts(it, arSizeOf(id)), A = arFitAnchors(it, K);
        const keys = n === 0 ? FIT_KEYS[kind] : [kind === 'bottom' ? 'waist' : 'chest'];
        keys.forEach((key) => {
          const p = parts.find((q) => q.key === key), a = A[key];
          if (!p || !a) return;
          const [pt, side] = a;
          const txt = p.label + ' ' + p.text + (p.diff !== undefined ? ` ${p.ease > 0 ? '+' : ''}${Math.round(p.ease)}cm` : '');
          const tw = ctx.measureText(txt).width, pw = tw + ph * 0.5 + fs * 1.1;
          let x = side > 0 ? pt.x + W * 0.07 : pt.x - W * 0.07 - pw;
          x = Math.max(4, Math.min(W * 0.86 - pw, x));
          let y = Math.max(ph / 2 + 4, Math.min(H - ph / 2 - 4, pt.y));
          for (let k = 0; k < 6 && placed.some((r) => x < r.x + r.w && r.x < x + pw && Math.abs(r.y - y) < ph + 3); k++) y += ph + 4;
          placed.push({ x, y, w: pw });
          const ex = pt.x < x ? x : x + pw;
          ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1, fs / 9);
          ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(ex, y); ctx.stroke();
          ctx.fillStyle = FIT_TONE[p.tone] || FIT_TONE.info;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, fs * 0.28, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(20,20,22,.78)';
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y - ph / 2, pw, ph, ph / 2) : ctx.rect(x, y - ph / 2, pw, ph); ctx.fill();
          ctx.fillStyle = FIT_TONE[p.tone] || FIT_TONE.info;
          ctx.beginPath(); ctx.arc(x + ph * 0.45, y, fs * 0.3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillText(txt, x + ph * 0.45 + fs * 0.6, y + 0.5);
        });
      });
      ctx.restore();
    }
    function arTimerCapture() {
      if (AR.timer) return;
      AR.timer = 3;
      renderArTimer(); beep(880); speak('3초 뒤에 촬영해요', true);
      const iv = setInterval(() => {
        AR.timer -= 1;
        renderArTimer();
        if (AR.timer > 0) { beep(880); return; }
        clearInterval(iv);
        beep(1500, 160);
        if (AR.open) arCapture();
      }, 1000);
    }
    function renderArTimer() {
      const el = document.getElementById('arTimer');
      el.textContent = AR.timer ? String(AR.timer) : '';
      el.classList.toggle('show', !!AR.timer);
    }

    // ---------- 옷 넘기기: 카테고리 · 이전/다음 (레일 버튼 · 키보드 · 제스처 공통) ----------
    const AR_CATS = [['전체', () => true], ['상의', (i) => i.ar.slot === 'top'], ['하의', (i) => i.ar.slot === 'bottom'], ['원피스·전신', (i) => i.ar.slot === 'full'], ['내 옷', (i) => !!i.custom]];
    function arRailVisible() {
      const f = (AR_CATS.find(([c]) => c === state.arCat) || AR_CATS[0])[1];
      return AR.railIds.filter((id) => f(arItem(id)));
    }
    function arStep(dir, byGesture) {
      const ids = arRailVisible();
      if (!ids.length) return;
      const cur = ids.indexOf(AR.focusId);
      const id = ids[cur < 0 ? (dir > 0 ? 0 : ids.length - 1) : (cur + dir + ids.length) % ids.length];
      arPut(arItem(id));
      AR.focusId = id;
      arRenderRail(); arRenderSizes();
      arScrollRailTo(id);
      arShowNow(arItem(id));
      if (byGesture) beep(dir > 0 ? 990 : 700, 90);
      if (AR.kp || AR.srcPose) arTracked();
    }
    function arShowNow(it) {
      const el = document.getElementById('arNow');
      if (!it) return;
      const slot = it.ar.slot === 'bottom' ? '하의' : it.ar.slot === 'full' ? '전신' : '상의';
      const fit = it.custom ? '' : `<p>${arSizeOf(it.id)} · ${fitSummary(it, arSizeOf(it.id))}</p>`;
      el.innerHTML = `<small>${slot} · ${it.brand}</small><b>${it.name}</b><span>${it.custom ? '내 옷' : won(salePrice(it))}</span>${fit}`;
      el.classList.add('show');
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.remove('show'), 2600);
    }
    function arScrollRailTo(id) {
      const b = document.querySelector(`#arRail [data-ar="${id}"]`);
      const rail = document.getElementById('arRail');
      if (!b || !rail) return;
      const x = b.offsetLeft - (rail.clientWidth - b.offsetWidth) / 2;
      if (rail.scrollTo) rail.scrollTo({ left: x, behavior: 'smooth' }); else rail.scrollLeft = x;
    }
    function arRenderCats() {
      const el = document.getElementById('arCats');
      el.innerHTML = AR_CATS.filter(([c]) => c !== '내 옷' || WARDROBE.length).map(([c]) => `<button type="button" class="${state.arCat === c ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('');
      el.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { state.arCat = b.dataset.cat; save(); arRenderCats(); arRenderRail(); }));
    }
    // 마우스로도 레일을 끌어서 넘기고(관성 없음), 세로 휠은 가로 스크롤로 변환. 끌기 후에는 클릭을 무시
    function dragScroll(el) {
      if (!el || el._drag) return;
      el._drag = true;
      let down = null;
      el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || e.button !== 0) return; down = { x: e.clientX, left: el.scrollLeft, moved: false }; });
      window.addEventListener('pointermove', (e) => {
        if (!down) return;
        const dx = e.clientX - down.x;
        if (Math.abs(dx) > 4) { down.moved = true; el.classList.add('dragging'); }
        if (down.moved) el.scrollLeft = down.left - dx;
      });
      window.addEventListener('pointerup', () => {
        if (!down) return;
        const moved = down.moved;
        down = null;
        el.classList.remove('dragging');
        if (moved) { el._justDragged = true; setTimeout(() => { el._justDragged = false; }, 0); }
      });
      el.addEventListener('click', (e) => { if (el._justDragged) { e.stopPropagation(); e.preventDefault(); } }, true);
      el.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }, { passive: false });
    }
    function arFullscreen() {
      const el = document.querySelector('.screen.ar');
      const fs = document.fullscreenElement;
      if (fs) { document.exitFullscreen && document.exitFullscreen(); return; }
      if (el.requestFullscreen) el.requestFullscreen().catch(() => showToast('이 브라우저는 전체화면을 지원하지 않아요'));
      else showToast('이 브라우저는 전체화면을 지원하지 않아요');
    }
    function arRenderToggles() {
      document.getElementById('arVoice').classList.toggle('on', !!state.voice);
      document.getElementById('arGest').classList.toggle('on', !!state.gesture);
      document.getElementById('arFit').classList.toggle('on', !!state.fitMap);
    }
    function arKey(e) {
      if (!AR.open || AR.view !== 'tryon' || /INPUT|SELECT|TEXTAREA/.test((e.target && e.target.tagName) || '')) return;
      const sizes = SIZES, i = sizes.indexOf(AR.size);
      if (e.key === 'ArrowRight') arStep(1);
      else if (e.key === 'ArrowLeft') arStep(-1);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') arSetSize(sizes[Math.max(0, Math.min(sizes.length - 1, i + (e.key === 'ArrowUp' ? 1 : -1)))]);
      else if (e.key === 't' || e.key === 'T') arTimerCapture();
      else if (e.key === 'f' || e.key === 'F') arFullscreen();
      else return;
      e.preventDefault();
    }
    function arCoach() {
      if (state.arCoachSeen || AR.mode !== 'camera') return;
      state.arCoachSeen = true; save();
      const el = document.getElementById('arCoach');
      el.classList.add('show');
      speak('혼자서도 입어볼 수 있어요. 오른손을 들면 다음 옷, 왼손을 들면 이전 옷, 양손을 들면 3초 뒤에 촬영해요.', true);
      setTimeout(() => el.classList.remove('show'), 6500);
    }

    // ---------- 체형 측정: 입력 키/몸무게(사전 분포) + 카메라 반복 측정(분할 마스크 실루엣 폭) 융합 ----------
    const MEASURE_KEYS = ['shoulder', 'chest', 'waist', 'hip', 'arm', 'leg', 'torso'];
    const MEASURE_LABEL = { shoulder: '어깨너비', chest: '가슴둘레', waist: '허리둘레', hip: '엉덩이둘레', arm: '팔 길이', leg: '다리 길이', torso: '상체 길이' };
    const MEASURE = { running: false, samples: [], startAt: 0, dur: 4500, need: 30, timer: 0, countdown: 0, reject: '', closed: 0, near: 0 };
    const ARMS_HINT = '팔을 몸에서 살짝 떼면(A자 자세) 가슴·허리·엉덩이도 실측돼요';

    function bodyPrior(H, W, g) {
      const m = g !== 'W';
      const v = {
        shoulder: 0.12 * W + 0.14 * H + (m ? 12 : 9),
        chest: 0.62 * W + 0.18 * H + (m ? 24 : 21),
        waist: 0.85 * W + 0.05 * H + (m ? 13 : 14),
        hip: 0.48 * W + 0.22 * H + (m ? 22 : 28),
        arm: 0.325 * H + (m ? 0.5 : -1),
        leg: 0.47 * H,
        torso: 0.3 * H,
      };
      return { v, s: { shoulder: 2.6, chest: 5.5, waist: 6.5, hip: 5, arm: 2.8, leg: 3.2, torso: 2.6 } };
    }
    const ellipseCirc = (breadth, depth) => { const a = breadth / 2, b = depth / 2; return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))); };
    function maskRun(mask, fx, fy, x, y) {
      const mx = Math.round(x * fx), my = Math.round(y * fy);
      if (my < 0 || my >= mask.h || mx < 0 || mx >= mask.w) return 0;
      const row = my * mask.w;
      if (mask.data[row + mx] < 0.5) return 0;
      let l = mx, r = mx;
      while (l > 0 && mask.data[row + l - 1] >= 0.5) l--;
      while (r < mask.w - 1 && mask.data[row + r + 1] >= 0.5) r++;
      return (r - l + 1) / fx;
    }
    // 팔 중심선이 몸통 실루엣 안에 있으면(팔이 몸에 붙음) 폭을 신뢰할 수 없어 null
    function armX(chain, y) {
      for (let i = 0; i + 1 < chain.length; i++) {
        const a = chain[i], b = chain[i + 1];
        if ((y - a.y) * (y - b.y) <= 0 && a.y !== b.y) return a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
      }
      return null;
    }
    function torsoRun(mask, fx, fy, x, y, arms, sw) {
      const mx = Math.round(x * fx), my = Math.round(y * fy);
      if (my < 0 || my >= mask.h || mx < 0 || mx >= mask.w) return 0;
      const row = my * mask.w;
      if (mask.data[row + mx] < 0.5) return 0;
      let l = mx, r = mx;
      while (l > 0 && mask.data[row + l - 1] >= 0.5) l--;
      while (r < mask.w - 1 && mask.data[row + r + 1] >= 0.5) r++;
      for (const chain of arms) {
        const ax = armX(chain, y);
        if (ax == null) continue;
        const out = ax < x ? l / fx - ax : ax - r / fx;
        if (out < sw * 0.05) return null;
      }
      return (r - l + 1) / fx;
    }
    // 화면에 들어온 범위: full(발목까지) · near(무릎까지, 근거리 측정) · half(골반까지) · null
    function measureRange(res) {
      if (!res) return null;
      const k = Object.fromEntries(res.keypoints.map((p) => [p.name, p]));
      const vis = (n, lim = 0.99) => k[n] && k[n].score >= 0.5 && k[n].y < res.h * lim;
      if (!['nose', 'left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'].every((n) => vis(n))) return null;
      if (!vis('left_knee') || !vis('right_knee')) return 'half';
      return vis('left_ankle', 0.985) && vis('right_ankle', 0.985) ? 'full' : 'near';
    }
    // 한 프레임에서 cm 단위 치수 추출 (실패 시 이유 문자열)
    function measureFrame(res, H) {
      if (!res) return '사람을 찾는 중';
      const k = Object.fromEntries(res.keypoints.map((p) => [p.name, p]));
      const range = measureRange(res);
      if (!range) return '머리와 어깨·골반이 모두 보이게 서 주세요';
      if (range === 'half') return '무릎까지 보이게 한 걸음만 뒤로 가 주세요';
      const P = (n) => Pt(k[n].x, k[n].y);
      const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      const ls = P('left_shoulder'), rs = P('right_shoulder'), lh = P('left_hip'), rh = P('right_hip');
      const sw = d(ls, rs);
      if (Math.abs(ls.y - rs.y) > sw * 0.2) return '카메라를 정면으로 봐 주세요';
      const full = range === 'full';
      const ankY = full ? (k.left_ankle.y + k.right_ankle.y) / 2 : 0;
      const sm = lerpPt(ls, rs, 0.5), hm = lerpPt(lh, rh, 0.5);
      const torsoPx = d(sm, hm);
      const mask = res.mask;
      let top = k.nose.y - torsoPx * 0.42, bottom = ankY + torsoPx * 0.12;
      const fx = mask ? mask.w / res.w : 1, fy = mask ? mask.h / res.h : 1;
      if (mask) {
        const x0 = Math.max(0, Math.round((k.nose.x - sw * 0.35) * fx)), x1 = Math.min(mask.w - 1, Math.round((k.nose.x + sw * 0.35) * fx));
        for (let y = 0; y < Math.round(k.nose.y * fy); y++) {
          let hit = false;
          for (let x = x0; x <= x1; x += 2) if (mask.data[y * mask.w + x] >= 0.5) { hit = true; break; }
          if (hit) { top = y / fy; break; }
        }
        if (full) {
          const ax0 = Math.max(0, Math.round((Math.min(k.left_ankle.x, k.right_ankle.x) - sw * 0.35) * fx));
          const ax1 = Math.min(mask.w - 1, Math.round((Math.max(k.left_ankle.x, k.right_ankle.x) + sw * 0.35) * fx));
          for (let y = mask.h - 1; y > Math.round(ankY * fy); y--) {
            let hit = false;
            for (let x = ax0; x <= ax1; x += 2) if (mask.data[y * mask.w + x] >= 0.5) { hit = true; break; }
            if (hit) { bottom = y / fy; break; }
          }
        }
      }
      if (top < res.h * 0.004) return '머리 위가 잘렸어요 · 카메라를 조금 위로 향해 주세요';
      // 근거리: 발목이 안 보이면 정수리~골반 길이를 키의 일정 비율(전신 측정 때 사용자별로 학습)로 보고 축척을 잡음
      let s;
      if (full) {
        const stature = bottom - top;
        if (stature < res.h * 0.45) return '조금 더 가까이 와 주세요';
        s = H / stature;
      } else {
        const upper = hm.y - top;
        if (upper < res.h * 0.3) return '조금 더 가까이 와 주세요';
        s = H * learnModel().hipR / upper;
      }
      const out = { torso: torsoPx * s };
      if (full) {
        const legL = d(lh, P('left_knee')) + d(P('left_knee'), P('left_ankle')), legR = d(rh, P('right_knee')) + d(P('right_knee'), P('right_ankle'));
        out.leg = (legL + legR) / 2 * s + H * 0.035;
        out.hipR = (hm.y - top) / (bottom - top);
      }
      if (['left_elbow', 'right_elbow', 'left_wrist', 'right_wrist'].every((n) => k[n] && k[n].score >= 0.5)) {
        const arm = (sd) => d(P(sd + '_shoulder'), P(sd + '_elbow')) + d(P(sd + '_elbow'), P(sd + '_wrist'));
        out.arm = (arm('left') + arm('right')) / 2 * s + 2;
      }
      if (mask) {
        const at = (t) => lerpPt(sm, hm, t);
        const arms = ['left', 'right'].filter((sd) => [sd + '_elbow', sd + '_wrist'].every((n) => k[n] && k[n].score >= 0.5))
          .map((sd) => [P(sd + '_shoulder'), P(sd + '_elbow'), P(sd + '_wrist')]);
        const run = (t) => { const p = at(t); return torsoRun(mask, fx, fy, p.x, p.y, arms, sw); };
        const sh = maskRun(mask, fx, fy, at(0.06).x, at(0.06).y);
        if (sh > sw * 0.9 && sh < sw * 1.9) out.shoulder = sh * s * 0.9;
        let closed = false;
        const chest = run(0.3);
        if (chest === null) closed = true;
        else if (chest > sw * 0.6 && chest < sw * 1.45) out.chestB = chest * s;
        let waist = Infinity;
        for (let t = 0.5; t <= 0.85; t += 0.05) { const w = run(t); if (w === null) closed = true; else if (w > sw * 0.45) waist = Math.min(waist, w); }
        if (waist < sw * 1.3) out.waistB = waist * s;
        let hip = 0;
        for (let t = 0.95; t <= 1.2; t += 0.05) { const w = run(t); if (w === null) closed = true; else hip = Math.max(hip, w); }
        if (hip > sw * 0.6 && hip < sw * 1.6) out.hipB = hip * s;
        if (closed) out.armsClosed = true;
      }
      if (!out.shoulder) out.shoulder = sw * s * 1.18;
      return out;
    }
    function measureFuse(samples, H, W, g, method) {
      const prior = bodyPrior(H, W, g);
      const bmi = W / Math.pow(H / 100, 2);
      const depth = { chestB: Math.min(0.85, Math.max(0.6, 0.68 + (bmi - 22) * 0.012)), waistB: Math.min(0.95, Math.max(0.62, 0.74 + (bmi - 22) * 0.016)), hipB: Math.min(0.9, Math.max(0.65, 0.76 + (bmi - 22) * 0.01)) };
      const circ = { chestB: 'chest', waistB: 'waist', hipB: 'hip' };
      const series = {};
      samples.forEach((smp) => Object.entries(smp).forEach(([k, v]) => {
        const key = circ[k] || k;
        const val = circ[k] ? ellipseCirc(v, v * depth[k]) : v;
        (series[key] = series[key] || []).push(val);
      }));
      const med = (a) => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
      const base = { shoulder: 2, chest: 3.5, waist: 4, hip: 3.5, arm: 2.5, leg: 3, torso: 2.5 };
      const values = {}, err = {}, src = {};
      MEASURE_KEYS.forEach((key) => {
        const p = prior.v[key], sp = prior.s[key];
        const arr = series[key];
        if (!arr || !arr.length) { values[key] = p; err[key] = sp; src[key] = 'input'; return; }
        const m = med(arr);
        const mad = med(arr.map((x) => Math.abs(x - m))) * 1.4826;
        const sc = Math.max(base[key], mad) * (arr.length < 5 ? 1.6 : 1);
        const w1 = 1 / (sp * sp), w2 = 1 / (sc * sc);
        values[key] = (p * w1 + m * w2) / (w1 + w2);
        err[key] = Math.sqrt(1 / (w1 + w2));
        src[key] = 'camera';
      });
      Object.keys(values).forEach((k) => { values[k] = Math.round(values[k] * 10) / 10; err[k] = Math.max(1, Math.round(err[k])); });
      return { at: Date.now(), method, frames: samples.length, height: H, weight: W, gender: g, values, err, src };
    }
    // 근거리 측정은 축척을 비율로 추정하므로(전신 측정으로 보정 전 약 ±3.5%) 카메라 치수 오차를 넓게 표시
    function nearError(m) {
      const calibrated = learnModel().c.hipR >= 5;
      Object.keys(m.err).forEach((k) => { if (m.src[k] === 'camera') m.err[k] = Math.max(m.err[k] + (calibrated ? 0 : 1), Math.round(m.values[k] * (calibrated ? 0.02 : 0.035))); });
    }
    function measureSizes(m) {
      const w = m.gender === 'W';
      const pick = (v, cuts) => SIZES[Math.min(3, cuts.findIndex((c) => v <= c) < 0 ? 3 : cuts.findIndex((c) => v <= c))];
      return { top: pick(m.values.chest, w ? [84, 89, 95] : [91, 98, 105]), bottom: pick(m.values.waist, w ? [65, 70, 76] : [74, 80, 87]) };
    }
    function measureBodyType(m) {
      const { chest, waist, hip, shoulder } = m.values;
      const sh2 = shoulder * 2.25;
      let type = '스트레이트', fits = ['스트레이트 핏', '레귤러 상의', '세미 와이드 하의'], reasons = [];
      if (sh2 - hip >= 8 || chest - hip >= 8) { type = '역삼각형'; fits = ['와이드/스트레이트 하의', '크롭 재킷', '브이넥']; reasons.push('어깨·가슴이 엉덩이보다 넓어요'); }
      else if (hip - chest >= 6) { type = '삼각형(하체 볼륨)'; fits = ['구조적 어깨 아우터', 'A라인 하의', '와이드 팬츠']; reasons.push('엉덩이가 가슴보다 넓어요'); }
      else if (waist >= chest * 0.9) { type = '라운드'; fits = ['롱실루엣 아우터', '스트레이트 하의', '오버핏 상의']; reasons.push('허리가 가슴·엉덩이와 비슷해요'); }
      else if (waist <= hip * 0.75) { type = '모래시계'; fits = ['허리 라인 강조', '슬림핏 상의', 'A라인 하의']; reasons.push('허리가 잘록해요'); }
      else reasons.push('상·하체 균형이 좋아요');
      reasons.push(`가슴 ${Math.round(chest)} · 허리 ${Math.round(waist)} · 엉덩이 ${Math.round(hip)}cm`);
      const cl = (v) => Math.max(5, Math.min(95, Math.round(v)));
      const body = {
        shoulder: cl(50 + (sh2 - hip) * 2.2 + (chest - hip) * 1.2),
        waist: cl(50 + (waist / hip - 0.8) * 220),
        lower: cl(50 + (hip - chest) * 2.4 + (hip / m.height - 0.55) * 160),
      };
      return { type, fits, reasons, body };
    }
    function measureApply(m) {
      const bt = measureBodyType(m);
      m.sizes = measureSizes(m);
      state.measure = m;
      state.body = bt.body;
      state.analysis = { type: bt.type, fits: bt.fits, reasons: bt.reasons, engine: m.method };
      state.height = m.height; state.weight = m.weight; state.gender = m.gender;
      if (m.method !== 'input') {
        const L = learnModel();
        L.n += m.frames;
      }
      recommendFromAnalysis();
      if (state.measureRewardDate !== todayKey() && m.method !== 'input') { state.measureRewardDate = todayKey(); grantExp(30, '체형 측정'); }
      save();
      renderMeasureResult();
    }
    function measureInputs() {
      const H = Math.max(140, Math.min(210, Number(document.getElementById('heightInput').value) || state.height));
      const W = Math.max(35, Math.min(150, Number(document.getElementById('weightInput').value) || state.weight));
      const g = document.getElementById('genderSelect').value;
      state.height = H; state.weight = W; state.gender = g;
      return { H, W, g };
    }
    function measureCancel() {
      MEASURE.running = false;
      MEASURE.armed = false;
      clearInterval(MEASURE.timer);
      MEASURE.countdown = 0;
      renderMeasureProgress();
    }
    // 혼자 측정: 버튼을 누르고 뒤로 가면, 자세가 1초 이상 안정됐을 때 자동으로 카운트다운 시작
    function measureArm() {
      measureCancel();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showToast('카메라가 없어요 · 전신 사진이나 입력값으로 측정해 주세요'); return; }
      MEASURE.armed = true;
      MEASURE.steadyAt = 0;
      if (AR.mode !== 'camera') arSetMode('camera');
      speak('측정을 준비할게요. 머리부터 무릎까지 보이게 서 주세요. 발끝까지 보이면 더 정확해요.', true);
      renderMeasureProgress();
    }
    function measureWatch(res, K, info) {
      const rg = measureRange(res);
      const ready = (rg === 'full' || rg === 'near') && info.frontal;
      const msg = { full: '전신 인식 · 정밀 측정 가능', near: '무릎까지 인식 · 근거리 측정 가능 (다리 길이는 입력값 기준)', half: '무릎이 보이도록 한 걸음만 뒤로 가 주세요' }[rg] || '머리부터 골반까지 보이게 정면으로 서 주세요';
      if (!MEASURE.armed) { arStatus(msg + (ready ? ' · [측정 시작]' : ''), !ready); return; }
      const now = performance.now();
      if (!ready) {
        MEASURE.steadyAt = 0;
        arStatus(msg, true);
        speak(rg === 'half' ? '한 걸음만 뒤로 가 주세요' : '정면으로 서 주세요');
        return;
      }
      if (!MEASURE.steadyAt) MEASURE.steadyAt = now;
      arStatus(msg + ' · 그대로 서 계시면 자동으로 시작해요');
      if (now - MEASURE.steadyAt > 1000) { MEASURE.armed = false; measureStart(); }
    }
    function measureStart() {
      if (AR.mode !== 'camera' || !AR.src) { showToast('카메라가 켜져야 측정할 수 있어요'); return arSetMode('camera'); }
      measureCancel();
      MEASURE.samples = []; MEASURE.reject = ''; MEASURE.closed = 0; MEASURE.near = 0;
      MEASURE.countdown = 3;
      speak('좋아요. 그대로 멈춰 주세요.', true);
      beep(880);
      renderMeasureProgress();
      MEASURE.timer = setInterval(() => {
        MEASURE.countdown -= 1;
        if (MEASURE.countdown > 0) beep(880);
        if (MEASURE.countdown <= 0) {
          beep(1320, 180);
          clearInterval(MEASURE.timer);
          MEASURE.running = true;
          MEASURE.startAt = performance.now();
          MEASURE.timer = setInterval(() => {
            if (performance.now() - MEASURE.startAt > MEASURE.dur * 2.5 || MEASURE.samples.length >= MEASURE.need) measureFinish();
            renderMeasureProgress();
          }, 200);
        }
        renderMeasureProgress();
      }, 1000);
    }
    function measureOnFrame(res) {
      if (!MEASURE.running) return;
      const { H } = measureInputs();
      const r = measureFrame(res, H);
      if (typeof r === 'string') { MEASURE.reject = r; return; }
      MEASURE.reject = r.armsClosed ? ARMS_HINT : '';
      if (r.armsClosed) { MEASURE.closed += 1; delete r.armsClosed; }
      if (r.hipR) { learnHipRatio(r.hipR); delete r.hipR; } else MEASURE.near += 1;
      MEASURE.samples.push(r);
      const info = {};
      const K = arKeypoints(res.keypoints, (x, y) => Pt(x, y), info);
      if (K) learnUpdate(K, info, 2);
    }
    function measureFinish() {
      const samples = MEASURE.samples.slice();
      const { H, W, g } = measureInputs();
      measureCancel();
      if (samples.length < 5) {
        showToast('전신이 충분히 인식되지 않았어요 · ' + (MEASURE.reject || '다시 시도해 주세요'));
        speak('인식이 충분하지 않았어요. 다시 시도해 주세요.', true);
        return;
      }
      beep(1320, 120); setTimeout(() => beep(1760, 160), 140);
      speak('측정이 끝났어요. 결과를 확인해 주세요.', true);
      const m = measureFuse(samples, H, W, g, 'camera');
      m.range = MEASURE.near > samples.length / 2 ? 'near' : 'full';
      if (m.range === 'near') nearError(m);
      if (MEASURE.closed > samples.length / 2) m.hint = ARMS_HINT;
      measureApply(m);
    }
    async function measureFromPhoto(dataUrl) {
      const { H, W, g } = measureInputs();
      const img = new Image();
      img.src = dataUrl;
      try { await img.decode(); } catch (_) {}
      showToast('사진을 분석하는 중…');
      try {
        const res = await poseDetect(img, { video: false, mask: true });
        const r = measureFrame(res, H);
        if (typeof r === 'string') { showToast('측정 실패: ' + r); return; }
        const closed = r.armsClosed, near = !r.hipR;
        delete r.armsClosed;
        if (r.hipR) { learnHipRatio(r.hipR); delete r.hipR; }
        const m = measureFuse([r], H, W, g, 'photo');
        m.range = near ? 'near' : 'full';
        if (near) nearError(m);
        if (closed) m.hint = ARMS_HINT;
        measureApply(m);
      } catch (e) {
        showToast('포즈 모델을 불러오지 못했어요');
      }
    }
    function measureFromInput() {
      const { H, W, g } = measureInputs();
      measureApply(measureFuse([], H, W, g, 'input'));
    }

    // ---------- 실제 옷 등록: 모델 착용컷(정면) → 포즈 + 의류 분할 → 상/하의 자동 분리 → AR·룩키가 입는 투명 의상 ----------
    const SEG_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';
    const WARDROBE_KEY = 'lookfit-wardrobe-v1';
    const WARDROBE_MAX = 12;
    const WARDROBE = [];
    function wardrobeItem(g) {
      const slotName = g.slot === 'bottom' ? '하의' : g.slot === 'full' ? '원피스' : '상의';
      return {
        ...g, custom: true, isPhoto: false, brand: '내 옷장', name: g.name || `내 ${slotName} · ${g.colorName}`,
        kind: g.slot === 'bottom' ? 'bottom' : g.slot === 'full' ? 'dress' : 'top', category: g.slot === 'bottom' ? 'bottom' : 'top', gender: 'U',
        price: 0, discount: 0, image: g.src, images: [g.src], thumbPos: '', tpo: [], rating: 0, reviews: 0, rank: 999,
        fitStyle: '내 옷', fitId: '', ideal: { shoulder: 50, waist: 50, lower: 50 }, desc: '사진에서 자동으로 추출한 내 옷', material: '-', modelInfo: '-', expert: '',
        ar: { slot: g.slot, src: g.src, kp: g.kp },
      };
    }
    function wardrobeLoad() {
      try {
        const list = JSON.parse(localStorage.getItem(WARDROBE_KEY) || '[]');
        WARDROBE.length = 0;
        list.forEach((g) => { if (g && g.id && g.src && g.kp) WARDROBE.push(wardrobeItem(g)); });
      } catch (_) {}
    }
    function wardrobeSave() {
      const raw = WARDROBE.map(({ id, name, slot, color, colorName, src, kp, at }) => ({ id, name, slot, color, colorName, src, kp, at }));
      try { localStorage.setItem(WARDROBE_KEY, JSON.stringify(raw)); return true; } catch (e) { return false; }
    }
    function wardrobeRemove(id) {
      const i = WARDROBE.findIndex((g) => g.id === id);
      if (i < 0) return;
      WARDROBE.splice(i, 1);
      delete AR.assets[id];
      wardrobeSave();
    }
    async function segClothes(canvas) {
      await poseWarmup();
      if (POSE.kind !== 'mediapipe') throw new Error('의류 분할은 MediaPipe 엔진에서만 동작해요');
      if (!POSE.seg) {
        POSE.seg = await POSE.vision.ImageSegmenter.createFromOptions(POSE.files, {
          baseOptions: { modelAssetPath: SEG_MODEL, delegate: POSE.delegate || 'GPU' }, runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true,
        });
      }
      let out = null;
      POSE.seg.segment(canvas, (r) => {
        const m = r.confidenceMasks && r.confidenceMasks[4];
        if (m) out = { data: Float32Array.from(m.getAsFloat32Array()), w: m.width, h: m.height };
      });
      return out;
    }
    const nearestColor = (rgb) => Object.entries(G_COLORS).map(([name, [hex]]) => {
      const n = parseInt(hex.slice(1), 16);
      return [name, hex, Math.hypot(rgb[0] - (n >> 16), rgb[1] - ((n >> 8) & 255), rgb[2] - (n & 255))];
    }).sort((a, b) => a[2] - b[2])[0];
    // 이미지 → [{ slot, src(PNG dataURL), kp, color, colorName }] — 실패 시 이유 문자열
    async function garmentExtract(img) {
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      const k0 = Math.min(1, 1000 / Math.max(iw, ih));
      const W = Math.round(iw * k0), H = Math.round(ih * k0);
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const c = cv.getContext('2d');
      c.drawImage(img, 0, 0, W, H);
      const pose = await poseDetect(cv, { video: false });
      const K = pose && arKeypoints(pose.keypoints, (x, y) => Pt(x, y));
      if (!K) return '사람(어깨·골반)을 찾지 못했어요 · 정면 전신 착용 사진을 올려 주세요';
      const seg = await segClothes(cv);
      if (!seg) return '옷 영역을 찾지 못했어요';
      const px = c.getImageData(0, 0, W, H).data;
      const sx = seg.w / W, sy = seg.h / H;
      const alpha = new Float32Array(W * H), raw = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = seg.data[Math.min(seg.h - 1, Math.floor(y * sy)) * seg.w + Math.min(seg.w - 1, Math.floor(x * sx))];
        raw[y * W + x] = v;
        alpha[y * W + x] = Math.max(0, Math.min(1, (v - 0.35) / 0.3));
      }
      // 단색 배경이면 배경색과 가까운 가장자리 픽셀을 지워 헤일로 제거
      const border = [];
      for (let x = 0; x < W; x += 7) border.push(x, (H - 1) * W + x);
      for (let y = 0; y < H; y += 7) border.push(y * W, y * W + W - 1);
      const med = (arr) => arr.slice().sort((a, b) => a - b)[arr.length >> 1];
      const bg = [0, 1, 2].map((ch) => med(border.map((i) => px[i * 4 + ch])));
      const bgSpread = med(border.map((i) => Math.hypot(px[i * 4] - bg[0], px[i * 4 + 1] - bg[1], px[i * 4 + 2] - bg[2])));
      const bgLum = bg[0] * 0.3 + bg[1] * 0.59 + bg[2] * 0.11;
      if (bgSpread < 12 && bgLum > 150) for (let i = 0; i < W * H; i++) if (raw[i] > 0.1 && Math.hypot(px[i * 4] - bg[0], px[i * 4 + 1] - bg[1], px[i * 4 + 2] - bg[2]) < 26) alpha[i] = raw[i] = 0;
      const sw = Math.hypot(K.ls.x - K.rs.x, K.ls.y - K.rs.y);
      const shY = (K.ls.y + K.rs.y) / 2, hipY = (K.lh.y + K.rh.y) / 2, torso = hipY - shY;
      // 몸 외곽(손목·팔꿈치 + 여유, 어깨 위는 머리 폭) 밖은 배경으로 본다 — 어두운 벽이 옷으로 잡히는 경우
      {
        const arm = pose.keypoints.filter((p) => /shoulder|elbow|wrist/.test(p.name) && (p.score == null || p.score >= 0.3)).map((p) => p.x);
        const xL = Math.min(...arm) - sw * 0.35, xR = Math.max(...arm) + sw * 0.35, cx0 = (K.ls.x + K.rs.x) / 2;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (x < xL || x > xR || (y < shY - torso * 0.12 && Math.abs(x - cx0) > sw * 0.6)) alpha[y * W + x] = raw[y * W + x] = 0;
        }
      }
      // 몸통과 이어진 덩어리만 남김(배경 오검출 제거) — 4px 셀 단위 8방향 연결
      const inBody = new Uint8Array(W * H);
      {
        const C = 4, gw = Math.ceil(W / C), gh = Math.ceil(H / C);
        const on = new Uint8Array(gw * gh), keep = new Uint8Array(gw * gh);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (raw[y * W + x] > 0.15) on[((y / C) | 0) * gw + ((x / C) | 0)]++;
        const xs = [K.ls.x, K.rs.x, K.lh.x, K.rh.x], kneeY0 = (K.lk.y + K.rk.y) / 2;
        const q = [];
        for (let cy = Math.floor(shY / C); cy <= Math.min(gh - 1, Math.floor(kneeY0 / C)); cy++) {
          for (let cx = Math.floor(Math.min(...xs) / C); cx <= Math.min(gw - 1, Math.floor(Math.max(...xs) / C)); cx++) {
            const ci = cy * gw + cx;
            if (cy >= 0 && cx >= 0 && on[ci] > 3 && !keep[ci]) { keep[ci] = 1; q.push(ci); }
          }
        }
        while (q.length) {
          const ci = q.pop(), cx = ci % gw, cy = (ci / gw) | 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy, ni = ny * gw + nx;
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || keep[ni] || on[ni] <= 3) continue;
            keep[ni] = 1; q.push(ni);
          }
        }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const cx = (x / C) | 0, cy = (y / C) | 0;
          let near = 0;
          for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && keep[ny * gw + nx]) near = 1;
          }
          if (!near) alpha[y * W + x] = raw[y * W + x] = 0;
          else inBody[y * W + x] = 1;
        }
      }
      const hipL = Math.min(K.lh.x, K.rh.x) - sw * 0.32, hipR = Math.max(K.lh.x, K.rh.x) + sw * 0.32;
      const rowMean = (y0, y1, x0 = 0, x1 = W) => {
        let n = 0; const s = [0, 0, 0];
        for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, Math.round(x0)); x < Math.min(W, Math.round(x1)); x++) {
          const i = y * W + x;
          if (alpha[i] < 0.5) continue;
          n++; s[0] += px[i * 4]; s[1] += px[i * 4 + 1]; s[2] += px[i * 4 + 2];
        }
        return n ? { n, rgb: s.map((v) => v / n) } : { n: 0, rgb: [0, 0, 0] };
      };
      // 상·하의 경계: 골반 주변에서 (피부 틈) 또는 (위아래 색 차이 최대) 행
      let cut = -1, best = 0;
      const gw = Math.max(6, Math.round(torso * 0.07)), gg = Math.round(torso * 0.04);
      const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
      for (let y = Math.round(hipY - torso * 0.45); y <= Math.round(hipY + torso * 0.7); y++) {
        const row = rowMean(y, y + 1, hipL, hipR);
        if (row.n < sw * 0.08) { cut = y; best = 999; break; }
        // 좁은 창은 또렷한 경계, 간격 둔 넓은 창은 프린지·그라데이션 밑단용
        for (const [w, g] of [[8, 0], [gw, gg]]) {
          const a = rowMean(y - w - g, y - g, hipL, hipR), b = rowMean(y + g, y + g + w, hipL, hipR);
          if (a.n < sw * w * 0.25 || b.n < sw * w * 0.25) continue;
          const dlt = Math.hypot(a.rgb[0] - b.rgb[0], a.rgb[1] - b.rgb[1], a.rgb[2] - b.rgb[2]);
          // 어두운 조명 사진은 절대 색차가 작으므로 밝기 대비 상대 차이도 함께 본다
          const score = Math.max(dlt / 42, dlt / (Math.min(lum(a.rgb), lum(b.rgb)) + 25) / 0.9);
          if (score > best) { best = score; cut = y; }
        }
      }
      let lowest = 0;
      for (let y = H - 1; y > 0 && !lowest; y--) if (rowMean(y, y + 1).n > sw * 0.1) lowest = y;      const kneeY = (K.lk.y + K.rk.y) / 2;
      const pieces = [];
      if (cut > 0 && best > 0.9 && best < 999) {
        // 넓은 창으로 찾은 경계는 밑단보다 아래일 수 있어, 아래 옷 색에 더 가까워지는 첫 행으로 올린다
        const span = gw + gg;
        const A = rowMean(cut - span - gw, cut - span, hipL, hipR).rgb, B = rowMean(cut + span, cut + span + gw, hipL, hipR).rgb;
        const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        for (let y = cut - span; y <= cut; y++) {
          const r = rowMean(y, y + 2, hipL, hipR);
          if (r.n && d(r.rgb, B) < d(r.rgb, A)) { cut = y; break; }
        }
      }
      if (cut > 0 && best > 0.9) {
        const topRgb = rowMean(cut - 30, cut).rgb;
        const shL = Math.min(K.ls.x, K.rs.x) - sw * 0.05, shR = Math.max(K.ls.x, K.rs.x) + sw * 0.05;
        const sleeveTol = Math.min(45, Math.max(18, lum(topRgb) * 0.8));
        const sleeve = (x, y, i) => y > cut && y < cut + torso * 0.5 && (x < shL || x > shR) && Math.abs(x - K.lk.x) > sw * 0.3 && Math.abs(x - K.rk.x) > sw * 0.3 && Math.hypot(px[i * 4] - topRgb[0], px[i * 4 + 1] - topRgb[1], px[i * 4 + 2] - topRgb[2]) < sleeveTol;
        pieces.push({ slot: 'top', keep: (x, y, i) => y <= cut || sleeve(x, y, i) });
        const botRgb = rowMean(cut + torso * 0.4, cut + torso * 0.6, hipL, hipR).rgb;
        const cd = (i, c) => Math.hypot(px[i * 4] - c[0], px[i * 4 + 1] - c[1], px[i * 4 + 2] - c[2]);
        const distinct = Math.hypot(topRgb[0] - botRgb[0], topRgb[1] - botRgb[1], topRgb[2] - botRgb[2]) > 18;
        // 밑단 프린지처럼 경계 아래로 늘어진 윗옷 조각은 하의에서 뺀다
        // 골반 통로 → 전체 폭을 서서히 넓혀 하의 윗단에 가로 계단선이 생기지 않게
        const inWidening = (x, y) => {
          const f = Math.max(0, Math.min(1, (y - cut - torso * 0.15) / (torso * 0.35)));
          return x >= hipL - f * sw * 1.5 && x <= hipR + f * sw * 1.5;
        };
        const topFringe = (y, i) => distinct && y < cut + torso * 0.6 && cd(i, topRgb) + 6 < cd(i, botRgb);
        pieces.push({ slot: 'bottom', keep: (x, y, i) => y > cut && !sleeve(x, y, i) && !topFringe(y, i) && inWidening(x, y) });
      } else if (lowest > kneeY - torso * 0.2) {
        pieces.push({ slot: 'full', keep: () => true });
      } else {
        pieces.push({ slot: 'top', keep: () => true });
      }
      const out = [];
      for (const pc of pieces) {
        let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0;
        const s = [0, 0, 0];
        for (let i = 0; i < W * H; i++) {
          if (alpha[i] <= 0.6 || !pc.keep(i % W, (i / W) | 0, i)) continue;
          n++; s[0] += px[i * 4]; s[1] += px[i * 4 + 1]; s[2] += px[i * 4 + 2];
        }
        if (n < sw * sw * 0.3) continue;
        const mean = s.map((v) => v / n);
        // 분할 신뢰도가 낮은 부분(어두운 조명의 회색 바지 등)은 옷 평균색과 가까우면 채운다
        const tol = Math.max(14, lum(mean) * 0.45), mLum = lum(mean);
        // 후드·목 위쪽은 다른 사람 얼굴을 덮으므로 턱선 부근에서 서서히 투명하게
        const chin0 = shY - torso * 0.2, chin1 = shY - torso * 0.3;
        const a2 = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x;
          let a = alpha[i];
          if (a < 0.9 && inBody[i] && raw[i] > 0.12
            && Math.hypot(px[i * 4] - mean[0], px[i * 4 + 1] - mean[1], px[i * 4 + 2] - mean[2]) < tol) a = Math.max(a, 0.92);
          // 옷보다 훨씬 밝고 분할 확신이 낮은 픽셀 = 배경(조명 받은 벽 등)
          if (a > 0 && raw[i] < 0.8 && lum([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]) > mLum + 80) a = 0;
          if (pc.slot !== 'bottom' && y < chin0) a *= Math.max(0, (y - chin1) / (chin0 - chin1));
          if (a <= 0.02 || !pc.keep(x, y, i)) continue;
          a2[i] = a;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        const pw = x1 - x0 + 1, ph = y1 - y0 + 1;        const k1 = Math.min(1, 720 / ph);
        const oc = document.createElement('canvas');
        oc.width = Math.round(pw * k1); oc.height = Math.round(ph * k1);
        const tmp = document.createElement('canvas');
        tmp.width = pw; tmp.height = ph;
        const tc = tmp.getContext('2d');
        const id = tc.createImageData(pw, ph);
        for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
          const si = (y + y0) * W + (x + x0), di = (y * pw + x) * 4;
          id.data[di] = px[si * 4]; id.data[di + 1] = px[si * 4 + 1]; id.data[di + 2] = px[si * 4 + 2]; id.data[di + 3] = Math.round(a2[si] * 255);
        }
        tc.putImageData(id, 0, 0);
        oc.getContext('2d').drawImage(tmp, 0, 0, oc.width, oc.height);
        const rgb = s.map((v) => v / n);
        const [colorName] = nearestColor(rgb);
        const kp = {};
        ['ls', 'rs', 'lh', 'rh', 'lk', 'rk', 'la', 'ra'].forEach((key) => { kp[key] = [Math.round((K[key].x - x0) * k1), Math.round((K[key].y - y0) * k1)]; });
        if (pc.slot !== 'bottom' && K.le && K.lw && K.re && K.rw) ['le', 'lw', 're', 'rw'].forEach((key) => { kp[key] = [Math.round((K[key].x - x0) * k1), Math.round((K[key].y - y0) * k1)]; });
        const hex = '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
        out.push({ slot: pc.slot, src: oc.toDataURL('image/png'), kp, color: hex, colorName, w: oc.width, h: oc.height });
      }
      return out.length ? out : '옷 영역이 너무 작아요 · 옷이 크게 보이는 정면 사진을 올려 주세요';
    }
    async function garmentFromPhoto(dataUrl) {
      const img = new Image();
      img.src = dataUrl;
      try { await img.decode(); } catch (_) { showToast('이미지를 읽지 못했어요'); return; }
      showToast('사진에서 옷을 추출하는 중… (처음 한 번은 모델을 받아요)');
      let res;
      try { res = await garmentExtract(img); } catch (e) { showToast('옷 추출 실패: ' + ((e && e.message) || e)); return; }
      if (typeof res === 'string') { showToast(res); return; }
      const added = res.map((g, i) => wardrobeItem({ ...g, id: 'u' + Date.now().toString(36) + i, at: Date.now() }));
      WARDROBE.unshift(...added);
      while (WARDROBE.length > WARDROBE_MAX) WARDROBE.pop();
      if (!wardrobeSave()) {
        added.forEach((g) => wardrobeRemove(g.id));
        showToast('저장 공간이 부족해요 · MY에서 등록한 옷을 정리해 주세요');
        return;
      }
      added.forEach((g) => { if (!state.ownedIds.includes(g.id)) state.ownedIds.unshift(g.id); });
      save();
      AR.railIds = arRailIds([AR.outfit.top, AR.outfit.bottom].filter(Boolean));
      if (AR.open) {
        AR.outfit = { top: AR.outfit.top, bottom: AR.outfit.bottom };
        added.forEach((g) => arPut(g));
        AR.focusId = added[0].id;
        state.arCat = '내 옷';
        arRenderCats(); arRenderRail(); arRenderSizes();
        if (AR.kp || AR.srcPose) arTracked();
      }
      renderCloset(); renderMy();
      showToast(`내 옷 ${added.length}벌 등록 완료 · ${added.map((g) => g.ar.slot === 'bottom' ? '하의' : g.ar.slot === 'full' ? '원피스' : '상의').join(' + ')} · 룩키에게도 입혀 보세요`);
      return added;
    }

    // ---------- 룩키 캐릭터: 투명 캐릭터 이미지 + 관절 앵커 → 같은 메쉬 엔진으로 실제 상품을 입힘 ----------
    const CHAR = { img: null, ready: false, K: null, waiters: [] };
    const CHAR_SLEEVE_WIDEN = 1.7;
    const CHAR_FIT_SCALE = { top: 1.04, full: 1.06, bottom: 1.14 };
    function charKp() {
      if (!CHAR.K) CHAR.K = arKeypoints(Object.entries(CHAR_MODEL.kp).map(([name, [x, y]]) => ({ name, x, y, score: 1 })), (x, y) => Pt(x, y));
      return CHAR.K;
    }
    function charLoad(onReady) {
      if (!CHAR.img) {
        CHAR.img = new Image();
        CHAR.img.onload = () => { CHAR.ready = true; (CHAR.waiters || []).forEach((f) => f()); CHAR.waiters = []; };
        CHAR.img.src = CHAR_MODEL.src;
      }
      if (!CHAR.ready && onReady) (CHAR.waiters = CHAR.waiters || []).push(onReady);
      return CHAR.ready;
    }
    // (x, y, w, h) 영역에 룩키 + 착용 의상을 그림. 아직 로딩 중인 의상이 있으면 true
    function drawAvatar(ctx, x, y, w, h, ids) {
      if (!charLoad()) return true;
      const r = arFitRect(CHAR_MODEL.w, CHAR_MODEL.h, w, h, false);
      r.x += x; r.y += y;
      ctx.drawImage(CHAR.img, r.x, r.y, r.w, r.h);
      const K = Object.fromEntries(Object.entries(charKp()).map(([k, p]) => [k, Pt(r.x + p.x * r.s, r.y + p.y * r.s)]));
      const items = ids.map(arItem).filter(arCapable).sort((a, b) => (a.ar.slot === 'bottom' ? 0 : 1) - (b.ar.slot === 'bottom' ? 0 : 1));
      let pending = false;
      items.forEach((it) => { if (!assetReady(arAsset(it))) pending = true; });
      const cut = Math.min(K.ls.y, K.rs.y) - Math.abs(K.ls.x - K.rs.x) * 0.2;
      const CW = ctx.canvas.width, CH = ctx.canvas.height;
      const S = offCanvas('sil', CW, CH);
      if (S) S.ctx.drawImage(CHAR.img, r.x, r.y, r.w, r.h);
      ctx.save();
      ctx.beginPath(); ctx.rect(x, cut, w, y + h - cut); ctx.clip();
      arDrawOutfit(ctx, items, K, 1, CHAR_SLEEVE_WIDEN, CW, CH, { sil: S && S.c, scaleFor: (it) => CHAR_FIT_SCALE[it.ar.slot] || 1 });
      ctx.restore();
      return pending;
    }
    function renderAvatar(cv, ids) {
      const ctx = cv && cv.getContext ? cv.getContext('2d') : null;
      if (!ctx) return;
      clearTimeout(cv._retry);
      if (!charLoad(() => renderAvatar(cv, ids))) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round((cv.clientWidth || 210) * dpr), H = Math.round((cv.clientHeight || 282) * dpr);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (drawAvatar(ctx, 0, 0, W, H, ids)) cv._retry = setTimeout(() => renderAvatar(cv, ids), 150);
    }
