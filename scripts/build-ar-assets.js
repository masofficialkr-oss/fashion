/**
 * 스튜디오컷(흰 배경) 룩북 → AR 착용용 투명 의상 PNG + 관절 앵커
 *   1) 테두리 flood-fill + 밝은 무채색 제거로 배경 삭제
 *   2) RGB 피부색 규칙으로 얼굴/손/발 제거, 머리 영역 타원 제거
 *   3) 1px 침식 + 3x3 블러로 흰 테두리(halo) 제거
 *   4) 상의/하의 조각으로 분할(cutY) 후 크롭, 앵커 좌표 보정
 * node scripts/build-ar-assets.js  →  assets/ar/*.png, assets/ar/anchors.json
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'ar');
fs.mkdirSync(OUT, { recursive: true });

// 관절 좌표: item_5/7/8 = MoveNet(scripts/probe-anchors.js) 결과, item_4 = 후드로 얼굴이 가려 item_5 비율로 보정
const LOOKS = [
  {
    src: 'item_7', head: { cx: 374, cy: 85, rx: 72, ry: 86 },
    kp: { ls: [499, 243], rs: [251, 242], lh: [442, 595], rh: [289, 589], lk: [412, 943], rk: [289, 943], la: [391, 1251], ra: [319, 1238] },
    pieces: [{ id: 'look_a_top', maxY: 532 }, { id: 'look_a_bottom', minY: 518 }],
  },
  {
    src: 'item_4', head: { cx: 381, cy: 186, rx: 46, ry: 56 },
    kp: { ls: [500, 310], rs: [266, 312], lh: [449, 664], rh: [317, 661], lk: [442, 892], rk: [324, 896], la: [430, 1140], ra: [336, 1139] },
    pieces: [{ id: 'look_b_full' }],
  },
  {
    src: 'item_5', head: { cx: 376, cy: 222, rx: 62, ry: 76 },
    kp: { ls: [483, 361], rs: [265, 363], lh: [433, 694], rh: [310, 691], lk: [427, 904], rk: [316, 908], la: [411, 1137], ra: [322, 1136] },
    pieces: [{ id: 'look_c_top', maxY: 772 }, { id: 'look_c_bottom', minY: 758 }],
  },
  {
    src: 'item_8', head: { cx: 374, cy: 82, rx: 72, ry: 86 },
    kp: { ls: [510, 252], rs: [237, 249], lh: [451, 641], rh: [297, 638], lk: [456, 941], rk: [297, 940], la: [439, 1241], ra: [304, 1236] },
    pieces: [{ id: 'look_d_top', maxY: 716 }, { id: 'look_d_bottom', minY: 728 }],
  },
];

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const isSkin = (r, g, b) => (r > 95 && g > 40 && b > 20 && r > g && r > b && (r - Math.min(g, b)) > 15 && Math.abs(r - g) > 15)
  || (r - b > 22 && r >= g && g >= b && lum(r, g, b) > 45);

function buildMask(png, look) {
  const { width: W, height: H, data } = png;
  const N = W * H;
  const at = (i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];

  const corners = [0, W - 1, (H - 1) * W, N - 1].map(at);
  const bg = [0, 1, 2].map((c) => corners.map((p) => p[c]).sort((a, b) => a - b)[1]);
  const nearBg = (i) => { const [r, g, b] = at(i); return Math.hypot(r - bg[0], g - bg[1], b - bg[2]) < 42; };

  const bgMask = new Uint8Array(N);
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop();
    if (bgMask[i] || !nearBg(i)) continue;
    bgMask[i] = 1;
    const x = i % W, y = (i / W) | 0;
    if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - W); if (y < H - 1) stack.push(i + W);
  }

  const keep = new Uint8Array(N);
  const { cx, cy, rx, ry } = look.head;
  for (let i = 0; i < N; i++) {
    if (bgMask[i]) continue;
    const [r, g, b] = at(i);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (lum(r, g, b) > 165 && mx - mn < 25) continue;
    if (isSkin(r, g, b)) continue;
    const x = i % W, y = (i / W) | 0;
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) continue;
    keep[i] = 1;
  }

  // 1px 침식 (밝은 가장자리 제거)
  const eroded = new Uint8Array(N);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    eroded[i] = keep[i] && keep[i - 1] && keep[i + 1] && keep[i - W] && keep[i + W] ? 1 : 0;
  }
  // 3x3 블러 → 부드러운 알파
  const alpha = new Uint8Array(N);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += eroded[(y + dy) * W + x + dx];
    alpha[y * W + x] = Math.round((s / 9) * 255);
  }
  return alpha;
}

function writePiece(png, alpha, look, piece) {
  const { width: W, height: H, data } = png;
  const minY = piece.minY || 0, maxY = piece.maxY || H - 1;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = minY; y <= maxY; y++) for (let x = 0; x < W; x++) {
    if (alpha[y * W + x] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const m = 4;
  x0 = Math.max(0, x0 - m); y0 = Math.max(minY, y0 - m); x1 = Math.min(W - 1, x1 + m); y1 = Math.min(maxY, y1 + m);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (y + y0) * W + (x + x0), di = (y * w + x) * 4;
    out.data[di] = data[si * 4]; out.data[di + 1] = data[si * 4 + 1]; out.data[di + 2] = data[si * 4 + 2];
    out.data[di + 3] = alpha[si];
  }
  fs.writeFileSync(path.join(OUT, piece.id + '.png'), PNG.sync.write(out));
  const kp = {};
  Object.entries(look.kp).forEach(([k, [x, y]]) => { kp[k] = [x - x0, y - y0]; });
  return { src: './assets/ar/' + piece.id + '.png', w, h, kp };
}

const anchors = {};
for (const look of LOOKS) {
  const png = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'assets', 'shop', look.src + '.png')));
  const alpha = buildMask(png, look);
  for (const piece of look.pieces) {
    anchors[piece.id] = writePiece(png, alpha, look, piece);
    console.log(piece.id, anchors[piece.id].w + 'x' + anchors[piece.id].h);
  }
}
fs.writeFileSync(path.join(OUT, 'anchors.json'), JSON.stringify(anchors));
console.log('\nAR_PHOTO_ANCHORS =', JSON.stringify(anchors));
