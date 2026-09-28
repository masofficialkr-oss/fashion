/**
 * 스튜디오컷 모델 사진에서 MoveNet 관절 좌표를 추출 → AR 앵커로 사용
 * node scripts/probe-anchors.js
 */
const { launch, startServer } = require('./lib-browser');

const PORT = 8771;
const IMAGES = process.argv.slice(2).length ? process.argv.slice(2) : ['item_4', 'item_5', 'item_7', 'item_8', 'item_3', 'item_9'];

(async () => {
  const server = await startServer(PORT);
  const browser = await launch();
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  const out = await page.evaluate(async (names) => {
    await ensureDetector();
    const res = {};
    for (const n of names) {
      const img = new Image();
      img.src = './assets/shop/' + n + '.png';
      await img.decode();
      const poses = await poseDetector.estimatePoses(img, { maxPoses: 1, flipHorizontal: false });
      const kp = {};
      (poses[0] ? poses[0].keypoints : []).forEach((k) => { kp[k.name] = [Math.round(k.x), Math.round(k.y), Number(k.score.toFixed(2))]; });
      res[n] = { w: img.naturalWidth, h: img.naturalHeight, kp };
    }
    return res;
  }, IMAGES);
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
