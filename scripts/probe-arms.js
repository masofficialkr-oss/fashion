/**
 * 팔 추적 소매 시각 점검: 샘플 모델 관절에 팔꿈치/손목을 주입해 포즈별 AR 캔버스를 캡처하고
 * 들어 올린 손목 근처에 소매 색이 그려졌는지 확인합니다.
 *   node scripts/probe-arms.js [itemId]
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { launch, startServer } = require('./lib-browser');

const PORT = 8781;
const OUT = path.join(process.env.LOOKFIT_TOOLS || path.join(os.homedir(), '.lookfit-tools'), 'arms');
const ITEM = process.argv[2] || 'g009';
const POSES = {
  rest: null,
  raise: { left_elbow: [640, 120], left_wrist: [700, -40], right_elbow: [200, 420], right_wrist: [190, 580] },
  tpose: { left_elbow: [690, 250], left_wrist: [880, 255], right_elbow: [60, 250], right_wrist: [-130, 255] },
  bend: { left_elbow: [560, 440], left_wrist: [400, 380], right_elbow: [150, 400], right_wrist: [60, 250] },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer(PORT);
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 520, height: 900, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2' });
  await page.evaluate((id) => { openAR([id]); arSetMode('sample'); }, ITEM);
  await page.waitForFunction(() => AR.src && AR.srcPose, { timeout: 15000 });
  const base = await page.evaluate(() => AR.srcPose.slice());
  const results = {};
  for (const [name, arms] of Object.entries(POSES)) {
    await page.evaluate((b, a) => {
      AR.srcPose = b.concat(a ? Object.entries(a).map(([n, [x, y]]) => ({ name: n, x, y, score: 0.9 })) : []);
    }, base, arms);
    await new Promise((r) => setTimeout(r, 400));
    const info = await page.evaluate(() => {
      const cv = document.getElementById('arCanvas');
      const ctx = cv.getContext('2d');
      const kp = AR.kp;
      const probe = (p) => {
        if (!p) return null;
        const x = Math.round(p.x), y = Math.round(p.y);
        if (x < 3 || y < 3 || x > cv.width - 3 || y > cv.height - 3) return 'off';
        const d = ctx.getImageData(x - 3, y - 3, 7, 7).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) n += Math.abs(d[i] - d[i + 1]) + Math.abs(d[i + 1] - d[i + 2]) > 30 ? 1 : 0;
        return n;
      };
      const mid = (a, b) => a && b && Pt((a.x + b.x) / 2, (a.y + b.y) / 2);
      return { armed: !!(kp.le || kp.re), lForearm: probe(mid(kp.le, kp.lw)), rForearm: probe(mid(kp.re, kp.rw)) };
    });
    results[name] = info;
    const el = await page.$('#arCanvas');
    await el.screenshot({ path: path.join(OUT, `${ITEM}-${name}.png`) });
  }
  console.log(JSON.stringify({ item: ITEM, results, errors }, null, 1));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
