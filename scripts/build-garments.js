/**
 * 상품 착용컷 → AR 착용 PNG + 관절 앵커 일괄 생성
 *   node scripts/build-garments.js assets/shop/item_9.png:look_e [다른사진:접두사 ...]
 * 앱과 같은 파이프라인(garmentExtract: MediaPipe 포즈 + 의류 분할 + 상·하의 분리)을 헤드리스 Chrome에서 실행하고
 * assets/ar/<접두사>_<slot>.png 저장 + src/catalog.js 의 AR_PHOTO_ANCHORS 를 갱신합니다.
 * 이후 CATALOG 항목에 ar: { piece: '<접두사>_<slot>', slot } 를 연결하고 node scripts/build.js 로 빌드하세요.
 */
const fs = require('fs');
const path = require('path');
const { launch, startServer } = require('./lib-browser');

const ROOT = path.join(__dirname, '..');
const CATALOG = path.join(ROOT, 'src', 'catalog.js');
const jobs = process.argv.slice(2).map((a) => {
  const i = a.lastIndexOf(':');
  return { src: a.slice(0, i).replace(/\\/g, '/'), prefix: a.slice(i + 1) };
});
if (!jobs.length || jobs.some((j) => !j.src || !j.prefix)) {
  console.log('사용법: node scripts/build-garments.js <사진경로>:<접두사> ...');
  process.exit(1);
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
