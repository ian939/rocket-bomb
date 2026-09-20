/* 한 번 열어두면 비행기 모드에서도 돌아간다.
 *
 * 내용을 고쳤으면 CACHE 를 반드시 올린다 — 안 올리면 이미 다녀간 기기는
 * 옛 파일을 계속 쓴다. 아래 activate 가 옛 캐시를 지운다.
 *
 * 화면과 코드는 network-first: 인터넷이 되면 새것을 받고, 안 되면 캐시.
 * 그림은 cache-first: 바뀌지 않는 데다 매번 받으면 느리다. */
const CACHE = 'rocket-bomb-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/lock.css',
  './css/game.css',
  './js/lock.js',
  './js/quiz.js',
  './js/audio.js',
  './js/game.js',
  './js/ui.js',
  './assets/char-roy.png',
  './assets/char-rosa.png',
  './assets/char-meowth.png',
  './assets/char-wobbuffet.png',
  './assets/bomb.png',
  './assets/explosion.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** 그림·아이콘은 한 번 받으면 바뀌지 않는다. */
function isStatic(url) {
  return /\.(png|jpg|jpeg|svg|webp|woff2?)$/i.test(new URL(url).pathname);
}

function putInCache(request, response) {
  if (!response.ok) return;
  if (new URL(request.url).origin !== self.location.origin) return;
  const copy = response.clone();
  caches.open(CACHE).then((c) => c.put(request, copy));
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // 그림 — 캐시 먼저
  if (isStatic(e.request.url)) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        putInCache(e.request, res);
        return res;
      }))
    );
    return;
  }

  // 화면·코드 — 네트워크 먼저, 안 되면 캐시.
  // 그래야 고친 내용이 다음 방문에 바로 보인다.
  e.respondWith(
    fetch(e.request)
      .then((res) => { putInCache(e.request, res); return res; })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
  );
});
