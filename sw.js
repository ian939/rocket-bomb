/* 한 번 열어두면 비행기 모드에서도 돌아간다. */
const CACHE = 'rocket-bomb-v1';
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

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      // 같은 출처의 것만 캐시에 넣는다
      if (res.ok && new URL(e.request.url).origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
