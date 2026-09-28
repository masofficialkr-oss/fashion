/**
 * 로컬 정적 서버 — 카메라(getUserMedia)는 localhost/https에서만 동작합니다.
 * node scripts/serve.js            →  http://localhost:8765 (이 PC에서 시연)
 * node scripts/serve.js --https    →  위 + https://<같은 와이파이 IP>:8766 (폰에서 시연, 자체 서명 인증서 자동 생성)
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const port = Number(process.env.PORT) || 8765;
const httpsPort = Number(process.env.HTTPS_PORT) || 8766;
const certDir = path.join(root, '.cert');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css',
  '.webp': 'image/webp', '.ico': 'image/x-icon',
};

function handler(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(root) || file.startsWith(certDir)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(handler);

function lanIPs() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal && !/^169\.254\./.test(n.address))
    .map((n) => n.address);
}

function findOpenssl() {
  const candidates = [
    process.env.OPENSSL,
    'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
  ].filter(Boolean);
  const hit = candidates.find((p) => fs.existsSync(p));
  if (hit) return hit;
  try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); return 'openssl'; } catch (_) { return null; }
}

// 현재 IP가 인증서 SAN에 없으면 다시 만든다 (와이파이가 바뀌면 IP도 바뀜)
function ensureCert(ips) {
  const key = path.join(certDir, 'key.pem'), cert = path.join(certDir, 'cert.pem'), meta = path.join(certDir, 'ips.json');
  const want = ['127.0.0.1', ...ips].sort();
  try {
    const have = JSON.parse(fs.readFileSync(meta, 'utf8'));
    if (want.every((ip) => have.includes(ip)) && fs.existsSync(key) && fs.existsSync(cert)) return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
  } catch (_) {}
  const openssl = findOpenssl();
  if (!openssl) throw new Error('openssl을 찾지 못했습니다. Git for Windows를 설치하거나 OPENSSL 환경변수로 경로를 지정하세요.');
  fs.mkdirSync(certDir, { recursive: true });
  const san = ['DNS:localhost', ...want.map((ip) => 'IP:' + ip)].join(',');
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '397',
    '-keyout', key, '-out', cert, '-subj', '/CN=LOOKFIT local demo', '-addext', 'subjectAltName=' + san], { stdio: 'ignore' });
  fs.writeFileSync(meta, JSON.stringify(want));
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

function startHttps(p = httpsPort) {
  const ips = lanIPs();
  const httpsServer = https.createServer(ensureCert(ips), handler);
  return new Promise((resolve) => httpsServer.listen(p, () => resolve({ server: httpsServer, urls: ['https://localhost:' + p, ...ips.map((ip) => `https://${ip}:${p}`)] })));
}

if (require.main === module) {
  server.listen(port, () => console.log('LOOKFIT → http://localhost:' + port));
  if (process.argv.includes('--https')) {
    startHttps().then(({ urls }) => {
      console.log('\n폰 시연 (PC와 같은 와이파이):');
      urls.slice(1).forEach((u) => console.log('  ' + u));
      if (urls.length < 2) console.log('  (와이파이/랜 IP를 찾지 못했습니다)');
      console.log('\n처음 열면 "안전하지 않음" 경고가 뜹니다 → 고급 → 계속(Android) / 세부사항 보기 → 웹사이트 방문(iPhone)');
      console.log('자체 서명 인증서라 폰에서는 오프라인 저장(서비스 워커)이 동작하지 않습니다. 카메라·AR은 정상 동작합니다.');
    }).catch((e) => { console.error('HTTPS 시작 실패:', e.message); process.exitCode = 1; });
  }
}
module.exports = { server, port, handler, startHttps, lanIPs };
