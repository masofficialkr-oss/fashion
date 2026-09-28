// 룩키 캐릭터 확대 렌더 확인: node scripts/probe-avatar.js [itemIds...]
const path = require('path');
const os = require('os');
const { launch, startServer } = require('./lib-browser');

(async () => {
  const ids = process.argv.slice(2);
  const out = path.join(os.homedir(), '.lookfit-tools', 'shots');
  const server = await startServer(8792);
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: ids.length ? 1320 : 900 });
  await page.goto('http://localhost:8792/index.html', { waitUntil: 'networkidle2' });
  const sets = ids.length ? [ids] : [[], ['g041', 'g081'], ['g001', 'g061'], ['g012', 'g101'], ['p04', 'p05'], ['g021']];
  await page.evaluate((sets) => {
    document.body.innerHTML = '';
    document.body.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:6px;background:#2a2a2a';
    sets.forEach((ids) => {
      const cv = document.createElement('canvas');
      cv.style.cssText = (sets.length === 1 ? 'width:880px;height:1300px' : 'width:280px;height:420px') + ';background:#3b3f46;border-radius:8px';
      document.body.appendChild(cv);
      renderAvatar(cv, ids);
    });
  }, sets);
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(out, 'avatar-probe.png'), fullPage: true });
  console.log(path.join(out, 'avatar-probe.png'));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
