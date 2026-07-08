// Service Worker - 天枢城 PWA v2
const CACHE_NAME = 'tianshu-v702.0-beta10';
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
      caches.open(CACHE_NAME).then(cache => cache.addAll(PRE_CACHE))
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

  // JS / CSS 文件：网络优先 + 缓存兜底。
  // 网络成功时用最新版并更新缓存；网络失败时从缓存兜底，避免 "DB is not defined" 白屏或样式丢失。
  // 始终对网络请求加 cache:'no-store' 跳过浏览器 HTTP 缓存，确保拿到最新文件。
  if ((url.pathname.endsWith('.js') && !url.pathname.endsWith('sw.js')) || url.pathname.endsWith('.css')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
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

  // 其它资源：网络优先，失败回落缓存；只缓存网络成功响应。
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        // 只 200 才存
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => cacheFallback(e.request))
  );
});