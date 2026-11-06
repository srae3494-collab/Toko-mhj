/* push-sw.js — menerima push FCM saat aplikasi ditutup. Letakkan SEJAJAR index.html. Tidak mengganggu sw.js yang sudah ada (scope berbeda). */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var j = {}; try { j = e.data ? e.data.json() : {}; } catch (x) {}
  var d = j.data || j;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    /* aplikasi sedang terlihat: banner di dalam aplikasi sudah cukup, jangan dobel */
    if (cs.some(function (c) { return c.visibilityState === 'visible'; })) return;
    return self.registration.showNotification(d.t || 'Mungkur Habang Jaya', {
      body: d.b || '', tag: d.g || undefined, renotify: !!d.g, vibrate: [150, 80, 150], data: { u: d.u || '/' }
    });
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var u = (e.notification.data && e.notification.data.u) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) if (cs[i].url.split('#')[0].split('?')[0] === u.split('?')[0] && 'focus' in cs[i]) return cs[i].focus();
    return self.clients.openWindow(u);
  }));
});
