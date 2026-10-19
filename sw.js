const CACHE_NAME = "asset-plan-cache-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/storage.js",
  "./js/sim.js",
  "./js/model.js",
  "./js/chart.js",
  "./js/views.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

// GitHub Pagesは各ファイルに10分のCache-Controlを付けるため、普通のfetchだと
// ブラウザのHTTPキャッシュ経由で古いファイルが返り、デプロイ後も更新が反映されない。
// cache:"no-cache"で毎回サーバーに更新確認(変更がなければ304で軽量)する。
const fresh = (request) => fetch(request, { cache: "no-cache" });

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(ASSETS.map((url) => fresh(url).then((res) => cache.put(url, res))))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fresh(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
