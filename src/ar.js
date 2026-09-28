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
    const learnDefaults = () => ({ n: 0, c: { torso: 0, hipW: 0, thigh: 0, shin: 0 }, torso: 1.5, hipW: 0.56, thigh: 1.0, shin: 1.05 });
    function learnModel() {
      if (!state.learn || !state.learn.c) state.learn = learnDefaults();
      return state.learn;
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
    const AR_SIZE_SCALE = { S: 0.93, M: 1, L: 1.07, XL: 1.14 };
    const AR_REWARD_EXP = 15;
    const AR_DETECT_MS = 32;
    const AR = {
      open: false, mode: null, view: 'tryon', stream: null, raf: 0, src: null, srcPose: null, kp: null, lost: 0, busy: false,
      outfit: { top: null, bottom: null }, size: 'M', assets: {}, fit: null, railIds: [], filt: {}, jump: 0,
      frames: 0, fpsAt: 0, fps: 0, statusText: '', detAt: 0, learnSaveAt: 0, lastPose: null,
    };
    const rafFn = (f) => (window.requestAnimationFrame ? window.requestAnimationFrame(f) : setTimeout(f, 33));
    const cafFn = (id) => (window.cancelAnimationFrame ? window.cancelAnimationFrame(id) : clearTimeout(id));
    const Pt = (x, y) => ({ x, y });
    const lerpPt = (a, b, t) => Pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    const extPt = (a, b, t) => Pt(a.x + (a.x - b.x) * t, a.y + (a.y - b.y) * t);
    const arItem = (id) => CATALOG.find((c) => c.id === id);
    const arCapable = (item) => !!(item && item.ar);

    function arAsset(item) {
      if (AR.assets[item.id]) return AR.assets[item.id];
      const a = { img: new Image(), ready: false, kp: null };
      if (item.isPhoto) {
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
    function arDrawGarment(ctx, item, Kd, scale = AR_SIZE_SCALE[AR.size] || 1, widen = SLEEVE_WIDEN) {
      const a = arAsset(item);
      if (!a.ready) return;
      const gs = meshGrid(kpPoints(a.kp), 1);
      const gd = meshGrid(Kd, scale);
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
      const r = arFitRect(sw, sh, W, H, src.type === 'video');
      AR.fit = { r, W, mirror: !!src.mirror };
      if (src.mirror) { ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(src.el, r.x, r.y, r.w, r.h); ctx.restore(); }
      else ctx.drawImage(src.el, r.x, r.y, r.w, r.h);
      if (src.type === 'image' && AR.srcPose) AR.kp = arKeypoints(AR.srcPose, arMapFn(r, W, false));
      if (!AR.kp) return;
      if (AR.view === 'measure') { arDrawSkeleton(ctx, AR.kp, W); return; }
      [AR.outfit.bottom, AR.outfit.top].forEach((id) => { const it = id && arItem(id); if (it) arDrawGarment(ctx, it, AR.kp); });
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
        if (AR.view === 'tryon') arTracked();
        else if (!MEASURE.running && !MEASURE.countdown) {
          const full = info.real.la && info.real.ra;
          arStatus(full ? '전신 인식 완료 · [측정 시작]을 눌러 주세요' : '발끝까지 보이도록 조금 더 뒤로 가 주세요', !full);
        }
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
      const names = [arItem(AR.outfit.top), arItem(AR.outfit.bottom)].filter(Boolean).map((i) => i.name).join(' + ') || '아래에서 옷을 선택하세요';
      const modeTxt = AR.mode === 'camera' ? '실시간 추적' + (AR.fps ? ' ' + AR.fps + 'fps' : '') : AR.mode === 'photo' ? '내 사진' : '샘플 모델';
      arStatus(modeTxt + ' · ' + AR.size + ' · ' + names);
      arMaybeReward();
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
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
          if (!AR.open || AR.mode !== 'camera') { stream.getTracks().forEach((t) => t.stop()); return; }
          AR.stream = stream;
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
      if (AR.outfit.top === id) AR.outfit.top = null;
      else if (AR.outfit.bottom === id) AR.outfit.bottom = null;
      else arPut(item);
      arRenderRail();
      if (AR.kp || AR.srcPose) arTracked();
    }
    function arRenderModes() {
      document.querySelectorAll('#arModes [data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === AR.mode));
    }
    function arRenderSizes() {
      const first = arItem(AR.outfit.top) || arItem(AR.outfit.bottom);
      const rec = recommendSize(first);
      document.getElementById('arSizes').innerHTML = '<span class="lbl">사이즈</span>' + SIZES.map((s) =>
        `<button type="button" class="ar-chip ${AR.size === s ? 'active' : ''}" data-size="${s}">${s}${s === rec ? '<i>추천</i>' : ''}</button>`).join('');
      document.querySelectorAll('#arSizes [data-size]').forEach((b) => b.addEventListener('click', () => {
        AR.size = b.dataset.size; arRenderSizes();
        if (AR.kp || AR.srcPose) arTracked();
      }));
    }
    function arRenderRail() {
      const on = [AR.outfit.top, AR.outfit.bottom];
      document.getElementById('arRail').innerHTML = AR.railIds.map((id) => {
        const it = arItem(id);
        const slotTxt = it.ar.slot === 'bottom' ? '하의' : it.ar.slot === 'full' ? '전신' : '상의';
        return `<button type="button" class="ar-item ${on.includes(id) ? 'on' : ''}" data-ar="${id}" title="${it.name}"><img class="${posClass(it)}" src="${it.image}" alt=""><span class="slot">${slotTxt}</span></button>`;
      }).join('');
      document.querySelectorAll('#arRail [data-ar]').forEach((b) => b.addEventListener('click', () => arToggle(b.dataset.ar)));
    }
    function arRailIds(focus) {
      const ids = [...focus, state.wornCatalog.topId, state.wornCatalog.bottomId, ...state.ownedIds, ...state.wishlist, ...(state.recommendedIds || []),
        ...CATALOG.filter((c) => c.isPhoto).map((c) => c.id),
        ...CATALOG.filter((c) => !c.isPhoto).sort((a, b) => fitScore(b) - fitScore(a)).slice(0, 18).map((c) => c.id)];
      return [...new Set(ids.filter(Boolean))].filter((id) => arCapable(arItem(id))).slice(0, 32);
    }
    // AR 탭 진입 시 호출. ids가 있으면 해당 옷으로 시착 시작
    function openAR(ids, view) {
      const focus = (ids || []).filter((id) => arCapable(arItem(id)));
      if (ids && ids.length || !AR.outfit.top && !AR.outfit.bottom) {
        if (!focus.length) focus.push(...[state.wornCatalog.topId, state.wornCatalog.bottomId].filter((id) => arCapable(arItem(id))));
        if (!focus.length) focus.push(...CATALOG.filter((c) => c.isPhoto && c.ar).slice(0, 2).map((c) => c.id));
        AR.outfit = { top: null, bottom: null };
        focus.forEach((id) => arPut(arItem(id)));
        AR.size = recommendSize(arItem(focus[0]));
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
      arRenderRail();
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
    function arCapture() {
      const cv = document.getElementById('arCanvas');
      try {
        downloadCanvas(cv, 'lookfit-ar-');
        flashScreen('AR 착용샷을 저장했어요');
      } catch (e) {
        showToast('로컬 파일 실행에서는 실사 의상 캡처가 막혀요 (node scripts/serve.js 로 실행)');
      }
    }
    function downloadCanvas(cv, prefix) {
      const url = cv.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url; a.download = prefix + Date.now() + '.png';
      document.body.appendChild(a); a.click(); a.remove();
    }

    // ---------- 체형 측정: 입력 키/몸무게(사전 분포) + 카메라 반복 측정(분할 마스크 실루엣 폭) 융합 ----------
    const MEASURE_KEYS = ['shoulder', 'chest', 'waist', 'hip', 'arm', 'leg', 'torso'];
    const MEASURE_LABEL = { shoulder: '어깨너비', chest: '가슴둘레', waist: '허리둘레', hip: '엉덩이둘레', arm: '팔 길이', leg: '다리 길이', torso: '상체 길이' };
    const MEASURE = { running: false, samples: [], startAt: 0, dur: 4500, need: 30, timer: 0, countdown: 0, reject: '', closed: 0 };
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
    // 한 프레임에서 cm 단위 치수 추출 (실패 시 이유 문자열)
    function measureFrame(res, H) {
      if (!res) return '사람을 찾는 중';
      const k = Object.fromEntries(res.keypoints.map((p) => [p.name, p]));
      const need = ['nose', 'left_shoulder', 'right_shoulder', 'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle'];
      if (need.some((n) => !k[n] || k[n].score < 0.5)) return '머리부터 발끝까지 화면에 들어오게 뒤로 가 주세요';
      const P = (n) => Pt(k[n].x, k[n].y);
      const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      const ls = P('left_shoulder'), rs = P('right_shoulder'), lh = P('left_hip'), rh = P('right_hip');
      const sw = d(ls, rs);
      if (Math.abs(ls.y - rs.y) > sw * 0.2) return '카메라를 정면으로 봐 주세요';
      const ankY = (k.left_ankle.y + k.right_ankle.y) / 2;
      if (ankY > res.h * 0.985) return '발끝이 잘렸어요 · 조금 더 뒤로';
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
        const ax0 = Math.max(0, Math.round((Math.min(k.left_ankle.x, k.right_ankle.x) - sw * 0.35) * fx));
        const ax1 = Math.min(mask.w - 1, Math.round((Math.max(k.left_ankle.x, k.right_ankle.x) + sw * 0.35) * fx));
        for (let y = mask.h - 1; y > Math.round(ankY * fy); y--) {
          let hit = false;
          for (let x = ax0; x <= ax1; x += 2) if (mask.data[y * mask.w + x] >= 0.5) { hit = true; break; }
          if (hit) { bottom = y / fy; break; }
        }
      }
      const stature = bottom - top;
      if (stature < res.h * 0.45) return '조금 더 가까이 와 주세요';
      const s = H / stature;
      const out = { torso: torsoPx * s };
      const legL = d(lh, P('left_knee')) + d(P('left_knee'), P('left_ankle')), legR = d(rh, P('right_knee')) + d(P('right_knee'), P('right_ankle'));
      out.leg = (legL + legR) / 2 * s + H * 0.035;
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
      clearInterval(MEASURE.timer);
      MEASURE.countdown = 0;
      renderMeasureProgress();
    }
    function measureStart() {
      if (AR.mode !== 'camera' || !AR.src) { showToast('카메라가 켜져야 측정할 수 있어요'); return arSetMode('camera'); }
      measureCancel();
      MEASURE.samples = []; MEASURE.reject = ''; MEASURE.closed = 0;
      MEASURE.countdown = 3;
      renderMeasureProgress();
      MEASURE.timer = setInterval(() => {
        MEASURE.countdown -= 1;
        if (MEASURE.countdown <= 0) {
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
        return;
      }
      const m = measureFuse(samples, H, W, g, 'camera');
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
        const closed = r.armsClosed;
        delete r.armsClosed;
        const m = measureFuse([r], H, W, g, 'photo');
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

    // ---------- 룩키 캐릭터: 투명 캐릭터 이미지 + 관절 앵커 → 같은 메쉬 엔진으로 실제 상품을 입힘 ----------
    const CHAR = { img: null, ready: false, K: null, waiters: [] };
    const CHAR_SLEEVE_WIDEN = 1.7;
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
      const cut = Math.min(K.ls.y, K.rs.y) - Math.abs(K.ls.x - K.rs.x) * 0.2;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, cut, w, y + h - cut); ctx.clip();
      items.forEach((it) => { if (!assetReady(arAsset(it))) pending = true; arDrawGarment(ctx, it, K, 1, CHAR_SLEEVE_WIDEN); });
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
