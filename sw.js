// Service Worker - 天枢城 PWA v2
const CACHE_NAME = 'tianshu-v702.0-beta12';
const PRE_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './css/phone.css',
  './css/markdown.css',
  './fonts/ShareTechMono-Regular.woff2',
  './icon-192.png'
];

self.addEventListener('install', e => {
  // 强制跳过等待，立即激活
  self.skipWaiting();
  e.waitUntil(
    // 先删除所有旧缓存再创建新的
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() =>
      caches.open(CACHE_NAME).then(cache =>
        // 逐个 add，单个文件网络失败不拖垮整个 install（GitHub Pages 国内链路会偶发丢包，
        // 若用 addAll 只要一个失败整个 sw 就装不上）
        Promise.all(PRE_CACHE.map(u => cache.add(u).catch(() => {})))
      )
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // 缓存兜底：match 落空时绝不能返回 null（iOS Safari 会直接报
  // "FetchEvent.respondWith received an error: Returned response is null" 白屏）。
  // 找不到就回一个合法的降级 Response。
  const cacheFallback = (req) =>
    caches.match(req).then(hit => hit || caches.match('./index.html')).then(hit =>
      hit || new Response('', { status: 504, statusText: 'Offline and not cached' })
    );

  // JS / CSS 文件：缓存优先 + 后台更新（stale-while-revalidate）。
  // 一旦成功缓存过一次，之后即使 GitHub Pages 链路抽风也能秒开，彻底摆脱
  // "网络一抖就 Can't find variable: DB 白屏"。文件更新靠 ?v= 版本号变化（URL 变→必然回源）。
  if ((url.pathname.endsWith('.js') && !url.pathname.endsWith('sw.js')) || url.pathname.endsWith('.css')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        // 后台拉新（成功就更新缓存，供下次使用）；失败静默，不影响本次返回
        const netFetch = fetch(e.request)
          .then(resp => {
            if (resp && resp.ok) {
              const clone = resp.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
            }
            return resp;
          })
          .catch(() => null);
        // 命中缓存：立即用缓存（不等网络）；未命中：等网络，网络失败再兜底
        if (cached) return cached;
        return netFetch.then(resp => resp || cacheFallback(e.request));
      })
    );
    return;
  }

  // HTML 导航请求：网络优先（拿最新入口），失败回落缓存的 index.html，保证首屏能开。
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return resp;
        })
        .catch(() => cacheFallback(e.request))
    );
    return;
  }

  // 其它资源（图片/字体等）：缓存优先，未命中走网络并缓存，最终兜底。
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request)
        .then(resp => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return resp;
        })
        .catch(() => cacheFallback(e.request));
    })
  );
});