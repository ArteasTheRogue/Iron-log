/* ============================================================
   Замена window.storage из артефакта Claude.
   Пишем сразу в два места: localStorage (быстро) и IndexedDB
   (переживает очистку кэша Safari надёжнее). Читаем localStorage,
   если пусто — поднимаем из IndexedDB.
   API совпадает с артефактным: get/set/delete/list -> Promise
   ============================================================ */
(function () {
  var DB = "ironlog", STORE = "kv", LSP = "ironlog:";

  function idb() {
    return new Promise(function (res, rej) {
      try {
        var rq = indexedDB.open(DB, 1);
        rq.onupgradeneeded = function () {
          var d = rq.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
        };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error); };
      } catch (e) { rej(e); }
    });
  }

  function idbPut(k, v) {
    return idb().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(STORE, "readwrite");
        t.objectStore(STORE).put(v, k);
        t.oncomplete = function () { res(true); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }

  function idbGet(k) {
    return idb().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(STORE, "readonly");
        var rq = t.objectStore(STORE).get(k);
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }

  function idbDel(k) {
    return idb().then(function (d) {
      return new Promise(function (res) {
        var t = d.transaction(STORE, "readwrite");
        t.objectStore(STORE).delete(k);
        t.oncomplete = function () { res(true); };
        t.onerror = function () { res(true); };
      });
    });
  }

  window.storage = {
    set: function (key, value) {
      var ok = false;
      try { localStorage.setItem(LSP + key, value); ok = true; } catch (e) {}
      return idbPut(key, value)
        .then(function () { return { key: key, value: value, shared: false }; })
        .catch(function () { return ok ? { key: key, value: value, shared: false } : null; });
    },

    get: function (key) {
      var ls = null;
      try { ls = localStorage.getItem(LSP + key); } catch (e) {}
      if (ls !== null && ls !== undefined) {
        // на всякий случай подстрахуем IndexedDB
        idbPut(key, ls).catch(function () {});
        return Promise.resolve({ key: key, value: ls, shared: false });
      }
      return idbGet(key).then(function (v) {
        if (v === undefined || v === null) return null;
        try { localStorage.setItem(LSP + key, v); } catch (e) {}
        return { key: key, value: v, shared: false };
      }).catch(function () { return null; });
    },

    delete: function (key) {
      try { localStorage.removeItem(LSP + key); } catch (e) {}
      return idbDel(key).then(function () {
        return { key: key, deleted: true, shared: false };
      }).catch(function () { return { key: key, deleted: true, shared: false }; });
    },

    list: function (prefix) {
      var out = [];
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(LSP) === 0) {
            var real = k.slice(LSP.length);
            if (!prefix || real.indexOf(prefix) === 0) out.push(real);
          }
        }
      } catch (e) {}
      return Promise.resolve({ keys: out, prefix: prefix || "", shared: false });
    },
  };

  // Просим браузер не вычищать данные при нехватке места
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  } catch (e) {}
})();
