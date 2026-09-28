// LOOKFIT 오프라인 캐시
// 같은 출처(앱·에셋): 네트워크 우선, 실패하면 캐시 -> 수정이 바로 반영되고 오프라인에서도 열림
// 외부 CDN(AI 엔진·모델·폰트): 캐시 우선 -> 한 번 받으면 인터넷 없이 동작
const APP_CACHE = 'lookfit-app-v1';
const CDN_CACHE = 'lookfit-cdn-v1';
const stats = { hit: 0, miss: [] };

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

function sameOrigin(url) { return new URL(url, self.location.href).origin === self.location.origin; }

async function put(cacheName, req, res) {
  if (!res || !(res.ok || res.type === 'opaque')) return;
  const c = await caches.open(cacheName);
  await c.put(req, res);
}

async function appFetch(req) {
  try {
    const res = await fetch(req);
    if (res.ok) put(APP_CACHE, req, res.clone());
    return res;
  } catch (e) {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await caches.match(new URL('./index.html', self.location.href).href);
      if (shell) return shell;
    }
    throw e;
  }
}

async function cdnFetch(req) {
  const hit = await caches.match(req);
  if (hit) { stats.hit++; return hit; }
  stats.miss.push(req.url);
  const res = await fetch(req);
  put(CDN_CACHE, req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  e.respondWith(url.origin === self.location.origin ? appFetch(req) : cdnFetch(req));
});

// 시연 준비에서 보낸 목록을 미리 받아 둠. CSS는 안에 든 폰트 파일까지 따라가서 저장
async function precache(urls) {
  const out = { ok: 0, fail: [], bytes: 0 };
  const seen = new Set();
  const one = async (u) => {
    const href = new URL(u, self.location.href).href;
    if (seen.has(href)) return;
    seen.add(href);
    const name = sameOrigin(href) ? APP_CACHE : CDN_CACHE;
    try {
      const cache = await caches.open(name);
      let res = await cache.match(href);
      const fresh = !res || res.type === 'opaque' || name === APP_CACHE;
      if (fresh) {
        res = await fetch(href, { mode: 'cors', cache: 'no-cache' });
        if (!res.ok) throw new Error(String(res.status));
        await cache.put(href, res.clone());
      }
      const buf = await res.clone().arrayBuffer();
      out.ok++; out.bytes += buf.byteLength;
      if (/\.css(\?|$)/.test(href)) {
        const css = new TextDecoder().decode(buf);
        const refs = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => new URL(m[1], href).href);
        for (let i = 0; i < refs.length; i += 8) await Promise.all(refs.slice(i, i + 8).map(one));
      }
    } catch (err) {
      out.fail.push(href);
    }
  };
  for (let i = 0; i < urls.length; i += 4) await Promise.all(urls.slice(i, i + 4).map(one));
  return out;
}

self.addEventListener('message', (e) => {
  const d = e.data || {}, port = e.ports && e.ports[0];
  if (!port) return;
  if (d.type === 'precache') precache(d.urls || []).then((r) => port.postMessage(r));
  else if (d.type === 'stats') port.postMessage({ hit: stats.hit, miss: stats.miss.slice() });
  else if (d.type === 'reset-stats') { stats.hit = 0; stats.miss = []; port.postMessage(true); }
});
