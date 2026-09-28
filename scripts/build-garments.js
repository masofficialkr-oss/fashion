/**
 * 상품 착용컷 → AR 착용 PNG + 관절 앵커 일괄 생성
 *   node scripts/build-garments.js assets/shop/item_9.png:look_e [다른사진:접두사 ...]
 * 앱과 같은 파이프라인(garmentExtract: MediaPipe 포즈 + 의류 분할 + 상·하의 분리)을 헤드리스 Chrome에서 실행하고
 * assets/ar/<접두사>_<slot>.png 저장 + src/catalog.js 의 AR_PHOTO_ANCHORS 를 갱신합니다.
 * 이후 CATALOG 항목에 ar: { piece: '<접두사>_<slot>', slot } 를 연결하고 node scripts/build.js 로 빌드하세요.
 *
 * 소매 리깅용 팔 관절만 추가 (PNG는 그대로):
 *   node scripts/build-garments.js --rig assets/shop/item_7.png:look_a ...
 * 원본 사진에서 포즈를 다시 찾아 어깨·골반 4점으로 사진→PNG 닮음변환을 맞추고, 팔꿈치·손목(le/lw/re/rw)을 옮겨 저장합니다.
 */
const fs = require('fs');
const path = require('path');
const { launch, startServer } = require('./lib-browser');

const ROOT = path.join(__dirname, '..');
const CATALOG = path.join(ROOT, 'src', 'catalog.js');
const args = process.argv.slice(2);
const rig = args[0] === '--rig';
const jobs = args.filter((a) => a !== '--rig').map((a) => {
  const i = a.lastIndexOf(':');
  return { src: a.slice(0, i).replace(/\\/g, '/'), prefix: a.slice(i + 1) };
});
if (!jobs.length || jobs.some((j) => !j.src || !j.prefix)) {
  console.log('사용법: node scripts/build-garments.js [--rig] <사진경로>:<접두사> ...');
  process.exit(1);
}

// 최소제곱 닮음변환 (복소수 q = a·p + t)
function fitSimilarity(src, dst) {
  const n = src.length;
  const ps = src.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]);
  const qs = dst.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]);
  let re = 0, im = 0, den = 0;
  src.forEach((p, i) => {
    const px = p[0] - ps[0], py = p[1] - ps[1], qx = dst[i][0] - qs[0], qy = dst[i][1] - qs[1];
    re += px * qx + py * qy; im += px * qy - py * qx; den += px * px + py * py;
  });
  const a = re / den, b = im / den;
  const map = (p) => [a * (p[0] - ps[0]) - b * (p[1] - ps[1]) + qs[0], b * (p[0] - ps[0]) + a * (p[1] - ps[1]) + qs[1]];
  const err = Math.max(...src.map((p, i) => Math.hypot(map(p)[0] - dst[i][0], map(p)[1] - dst[i][1])));
  return { map, err, scale: Math.hypot(a, b) };
}

(async () => {
  const server = await startServer(8779);
  const browser = await launch({});
  let code = 0;
  try {
    const page = await browser.newPage();
    await page.goto('http://localhost:8779/index.html', { waitUntil: 'networkidle2' });
    const src = fs.readFileSync(CATALOG, 'utf8');
    const m = src.match(/const AR_PHOTO_ANCHORS = (\{.*\});/);
    if (!m) throw new Error('catalog.js 에서 AR_PHOTO_ANCHORS 를 찾지 못함');
    const anchors = JSON.parse(m[1]);
    for (const job of jobs) {
      if (rig) {
        const K = await page.evaluate(async (url) => {
          const img = new Image();
          img.src = './' + url.replace(/^\.?\//, '');
          await img.decode();
          const k0 = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.naturalWidth * k0); cv.height = Math.round(img.naturalHeight * k0);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          const pose = await poseDetect(cv, { video: false });
          const K = pose && arKeypoints(pose.keypoints, (x, y) => Pt(x, y));
          return K ? Object.fromEntries(Object.entries(K).map(([k, p]) => [k, [p.x, p.y]])) : null;
        }, job.src);
        if (!K || !K.le || !K.lw || !K.re || !K.rw) { console.log(`✗ ${job.src}: 팔 관절을 찾지 못함`); code = 1; continue; }
        for (const key of Object.keys(anchors).filter((k) => k.startsWith(job.prefix + '_') && !k.endsWith('_bottom'))) {
          const kp = anchors[key].kp;
          const base = ['ls', 'rs', 'lh', 'rh'];
          const t = fitSimilarity(base.map((k) => K[k]), base.map((k) => kp[k]));
          ['le', 'lw', 're', 'rw'].forEach((k) => { kp[k] = t.map(K[k]).map(Math.round); });
          console.log(`✓ ${key}: 팔 관절 추가 (정합 오차 ${t.err.toFixed(1)}px, 배율 ${t.scale.toFixed(3)})`);
        }
        continue;
      }
      const r = await page.evaluate(async (url) => {
        const img = new Image();
        img.src = './' + url.replace(/^\.?\//, '');
        await img.decode();
        const out = await garmentExtract(img);
        return typeof out === 'string' ? out : out.map(({ slot, src, kp, w, h, colorName }) => ({ slot, src, kp, w, h, colorName }));
      }, job.src);
      if (typeof r === 'string') { console.log(`✗ ${job.src}: ${r}`); code = 1; continue; }
      for (const g of r) {
        const key = `${job.prefix}_${g.slot}`;
        fs.writeFileSync(path.join(ROOT, 'assets', 'ar', key + '.png'), Buffer.from(g.src.split(',')[1], 'base64'));
        anchors[key] = { src: `./assets/ar/${key}.png`, w: g.w, h: g.h, kp: g.kp };
        console.log(`✓ ${job.src} → assets/ar/${key}.png (${g.slot}, ${g.colorName}, ${g.w}x${g.h})`);
      }
    }
    fs.writeFileSync(CATALOG, src.replace(m[0], `const AR_PHOTO_ANCHORS = ${JSON.stringify(anchors)};`));
  } catch (e) {
    console.error(e.message);
    code = 1;
  }
  await browser.close();
  server.close();
  process.exit(code);
})();
