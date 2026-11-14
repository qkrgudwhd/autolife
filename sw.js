// 오프라인용 — 앱 파일을 기기에 담아 두어 인터넷 없이도 열린다.
// 판을 올릴 때는 VERSION 을 바꾸면 새 파일로 갈아 끼운다.
const VERSION = 'autolife-0.1.0';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'js/main.js', 'js/config.js', 'js/db.js', 'js/ui.js', 'js/actions.js', 'js/modules.js', 'js/snapshot.js',
  'js/core/dates.js', 'js/core/parser.js', 'js/core/logic.js', 'js/core/policy.js', 'js/core/automation.js', 'js/core/ai.js', 'js/core/crypt.js',
  'js/views/home.js', 'js/views/inbox.js', 'js/views/plan.js', 'js/views/money.js', 'js/views/life.js', 'js/views/assistant.js', 'js/views/settings.js', 'js/views/forms.js', 'js/views/quick.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // AI 호출 등 바깥 요청은 건드리지 않음
  // 앱 파일: 먼저 네트워크(새 판), 안 되면 담아 둔 것
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); if (r.ok) caches.open(VERSION).then((c) => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = e.notification.data?.link || '#/';
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => {
    const c = cs[0];
    if (c) { c.focus(); return c.navigate ? c.navigate(`./${link}`) : null; }
    return self.clients.openWindow(`./${link}`);
  }));
});
