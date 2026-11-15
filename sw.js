// 오프라인용 — 앱 파일을 기기에 담아 두어 인터넷 없이도 열린다.
// 판을 올릴 때는 VERSION 을 바꾸면 새 파일로 갈아 끼운다 (config.js version 과 같이).
const VERSION = 'autolife-0.1.8';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'js/main.js', 'js/config.js', 'js/db.js', 'js/ui.js', 'js/actions.js', 'js/modules.js', 'js/snapshot.js',
  'js/core/dates.js', 'js/core/parser.js', 'js/core/logic.js', 'js/core/policy.js', 'js/core/automation.js', 'js/core/ai.js', 'js/core/crypt.js', 'js/core/ics.js', 'js/core/search.js', 'js/core/shop.js', 'js/core/fridge.js', 'js/core/recipes.js',
  'js/views/home.js', 'js/views/inbox.js', 'js/views/plan.js', 'js/views/money.js', 'js/views/life.js', 'js/views/assistant.js', 'js/views/settings.js', 'js/views/forms.js', 'js/views/quick.js', 'js/views/shop.js', 'js/views/fridge.js',
];

// 갈아 끼우는 법 (0.1.3~):
//  · 새 sw.js 가 오면 파일 전부를 「판 번호 붙은 주소」로 새로 받아 새 상자에 담는다(GitHub 서버가 들고 있는 옛 복사본을 피함).
//  · 하나라도 못 받으면 설치 실패 → 옛 판을 그대로 쓴다 (새 것·옛 것이 섞이지 않게).
//  · 다 받으면 옛 상자를 지우고, 다음에 열 때부터 한꺼번에 새 판.
// 만드는 컴퓨터에서는 늘 새 파일. (시험: sw.js?prod=1 로 등록하면 배포와 똑같이 돈다)
const DEV = ['localhost', '127.0.0.1'].includes(location.hostname) && !new URL(location.href).searchParams.has('prod');

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.all(FILES.map(async (f) => {
      const r = await fetch(new Request(`${f}${f.includes('?') ? '&' : '?'}v=${VERSION}`, { cache: 'reload' }));
      if (!r.ok) throw new Error(`${f} ${r.status}`);
      await c.put(new URL(f, self.registration.scope).href, r);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // AI 호출 등 바깥 요청은 건드리지 않음
  if (DEV) {
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }
  // 앱 파일: 담아 둔 판을 먼저 (한 판으로 맞춰 열림), 없으면 네트워크
  const key = e.request.mode === 'navigate' ? new URL('index.html', self.registration.scope).href : e.request;
  e.respondWith(caches.open(VERSION).then((c) => c.match(key, { ignoreSearch: true })).then((hit) => hit || fetch(e.request)));
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
