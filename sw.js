/* Iron Log — service worker.

   Сеть в приоритете, кэш — только чтобы работало офлайн.

   Ключевой момент: fetch идёт с cache:"no-cache". Это значит «спроси
   сервер, файл менялся?». Не менялся — сервер ответит 304, ничего не
   скачается, загрузка быстрая. Менялся — придёт новая версия сразу.

   Поэтому версию кэша поднимать вручную больше не нужно:
   достаточно залить новый файл и обновить страницу. */

var CACHE = "ironlog";
var FILES = ["./", "./index.html", "./app.js", "./storage.js",
             "./tailwind.css", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", function (e) {
  self.skipWaiting();                       // не ждать, пока закроются вкладки
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (ks) {
        return Promise.all(ks.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })   // забрать открытые вкладки сразу
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(new Request(req.url, { cache: "no-cache", credentials: "same-origin" }))
      .then(function (r) {
        if (r && r.ok) {
          var copy = r.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return r;
      })
      .catch(function () {                  // сети нет — отдаём из кэша
        return caches.match(req).then(function (m) {
          return m || caches.match("./index.html");
        });
      })
  );
});
