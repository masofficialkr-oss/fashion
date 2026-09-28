/**
 * 룩키(LOOKY) 캐릭터 에셋 빌드
 *   1) assets/char/looky-src.jpg 의 흰 배경을 테두리 flood-fill 로 제거 → assets/char/looky.png (투명)
 *   2) MediaPipe Pose Landmarker 로 관절(어깨·팔꿈치·손목·골반·무릎·발목) 추출 → 콘솔에 CHAR_MODEL JSON 출력
 *   node scripts/build-mascot.js
 */
const path = require('path');
const fs = require('fs');
const { launch, startServer } = require('./lib-browser');

const PORT = 8783;
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';

(async () => {
  const server = await startServer(PORT);
  const browser = await launch();
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  await page.goto(`http://localhost:${PORT}/assets/char/looky-src.jpg`);
  const out = await page.evaluate(async (MP, MODEL) => {
    const img = new Image();
    img.src = '/assets/char/looky-src.jpg';
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const vision = await import(MP + '/vision_bundle.mjs');
    const files = await vision.FilesetResolver.forVisionTasks(MP + '/wasm');
    const lm = await vision.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' }, runningMode: 'IMAGE', numPoses: 1 });
    const L = lm.detect(img).landmarks[0];
    const id = ctx.getImageData(0, 0, W, H), d = id.data;
    // 흰 운동화처럼 배경과 비슷한 영역으로 새지 않도록: 후보를 R만큼 침식 → 테두리에서 flood → 다시 R만큼 팽창(후보 안에서만)
    const R = 3;
    const cand = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; cand[i] = Math.min(r, g, b) > 236 && Math.max(r, g, b) - Math.min(r, g, b) < 14 ? 1 : 0; }
    const morph = (src, keep) => {
      const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
      const test = keep === 'all' ? (s) => s === 2 * R + 1 : (s) => s > 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = -R; k <= R; k++) { const xx = x + k; s += xx < 0 || xx >= W ? (keep === 'all' ? 1 : 0) : src[y * W + xx]; }
        tmp[y * W + x] = test(s) ? 1 : 0;
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = -R; k <= R; k++) { const yy = y + k; s += yy < 0 || yy >= H ? (keep === 'all' ? 1 : 0) : tmp[yy * W + x]; }
        out[y * W + x] = test(s) ? 1 : 0;
      }
      return out;
    };
    const core = morph(cand, 'all');
    const seed = new Uint8Array(W * H);
    const stack = [];
    for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
    for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
    while (stack.length) {
      const i = stack.pop();
      if (seed[i] || !core[i]) continue;
      seed[i] = 1;
      const x = i % W, y = (i / W) | 0;
      if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - W); if (y < H - 1) stack.push(i + W);
    }
    const grown = morph(seed, 'any');
    const bg = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) bg[i] = grown[i] && cand[i] ? 1 : 0;
    // 흰 운동화 앞코는 배경과 경계선이 없어 배경으로 빠짐 → 발목 아래 각 발의 불투명 픽셀 볼록 껍질을 채움
    const ankles = [L[27], L[28]].map((p) => [p.x * W, p.y * H]);
    const midX = (ankles[0][0] + ankles[1][0]) / 2;
    ankles.forEach(([ax, ay]) => {
      const x0 = Math.round(ax < midX ? Math.max(0, ax - 110) : midX), x1 = Math.round(ax < midX ? midX : Math.min(W - 1, ax + 110));
      const pts = [];
      for (let y = Math.round(ay - 10); y < H; y++) {
        let a = -1, b = -1;
        for (let x = x0; x <= x1; x++) if (!bg[y * W + x]) { if (a < 0) a = x; b = x; }
        if (a >= 0) pts.push([a, y], [b, y]);
      }
      if (pts.length < 6) return;
      pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lo = [], up = [];
      pts.forEach((p) => { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
      pts.slice().reverse().forEach((p) => { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); });
      const hull = lo.slice(0, -1).concat(up.slice(0, -1));
      const inside = (x, y) => hull.every((p, k) => cross(p, hull[(k + 1) % hull.length], [x, y]) >= 0);
      const ys = pts.map((p) => p[1]);
      for (let y = Math.min(...ys); y <= Math.max(...ys); y++) for (let x = x0; x <= x1; x++) if (bg[y * W + x] && inside(x, y)) bg[y * W + x] = 0;
    });
    let minX = W, minY = H, maxX = 0, maxY = 0;
    for (let i = 0; i < W * H; i++) {
      if (bg[i]) { d[i * 4 + 3] = 0; continue; }
      const x = i % W, y = (i / W) | 0;
      const edge = (x > 0 && bg[i - 1]) || (x < W - 1 && bg[i + 1]) || (y > 0 && bg[i - W]) || (y < H - 1 && bg[i + W]);
      if (edge) { const m = Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); d[i * 4 + 3] = Math.max(60, Math.min(255, (255 - m) * 6)); }
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    ctx.putImageData(id, 0, 0);
    const pad = 8;
    const cx = Math.max(0, minX - pad), cy = Math.max(0, minY - pad);
    const cw = Math.min(W, maxX + pad) - cx, ch = Math.min(H, maxY + pad) - cy;
    const crop = document.createElement('canvas');
    crop.width = cw; crop.height = ch;
    crop.getContext('2d').drawImage(cv, cx, cy, cw, ch, 0, 0, cw, ch);

    const names = { 11: 'left_shoulder', 12: 'right_shoulder', 13: 'left_elbow', 14: 'right_elbow', 15: 'left_wrist', 16: 'right_wrist', 23: 'left_hip', 24: 'right_hip', 25: 'left_knee', 26: 'right_knee', 27: 'left_ankle', 28: 'right_ankle' };
    const kp = {};
    Object.entries(names).forEach(([i, n]) => { const p = L[i]; kp[n] = [Math.round(p.x * W - cx), Math.round(p.y * H - cy), Math.round(p.visibility * 100) / 100]; });
    return { png: crop.toDataURL('image/png'), w: cw, h: ch, kp, src: [W, H] };
  }, MP, MODEL);
  fs.writeFileSync(path.join(__dirname, '..', 'assets', 'char', 'looky.png'), Buffer.from(out.png.split(',')[1], 'base64'));
  const kp = Object.fromEntries(Object.entries(out.kp).map(([k, v]) => [k, v.slice(0, 2)]));
  console.log('size', out.w, out.h, 'from', out.src.join('x'));
  console.log('visibility', JSON.stringify(Object.fromEntries(Object.entries(out.kp).map(([k, v]) => [k, v[2]]))));
  console.log('CHAR_MODEL', JSON.stringify({ src: './assets/char/looky.png', w: out.w, h: out.h, kp }));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
