/**
 * E2E/프로브 공용: 로컬 서버 + Chrome(puppeteer-core) 실행.
 * puppeteer-core는 프로젝트 의존성이 아니므로 LOOKFIT_TOOLS(기본 ~/.lookfit-tools)에서 불러옵니다.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (_) {}
  const tools = process.env.LOOKFIT_TOOLS || path.join(os.homedir(), '.lookfit-tools');
  return require(path.join(tools, 'node_modules', 'puppeteer-core'));
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

async function startServer(port) {
  const { server } = require('./serve');
  await new Promise((r) => server.listen(port, r));
  return server;
}

async function launch({ fakeVideo, headless = true } = {}) {
  const puppeteer = loadPuppeteer();
  const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
  if (fakeVideo) args.push('--use-file-for-fake-video-capture=' + fakeVideo);
  return puppeteer.launch({ executablePath: findChrome(), headless: headless ? 'new' : false, args });
}

module.exports = { launch, startServer, findChrome };
