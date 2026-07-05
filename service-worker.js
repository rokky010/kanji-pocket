// service-worker.js
// 漢字ポケット - オフラインで使えるようにするためのサービスワーカー
//
// キャッシュを更新したいとき（ファイルを直したとき）は
// 下の CACHE_NAME の数字を変えてください（例: v1 → v2）。
// そうしないと、古いキャッシュが使われ続けて更新が反映されないことがあります。

const CACHE_NAME = "kanji-pocket-v1";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./data.js",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

// インストール時：必要なファイルを事前にキャッシュ
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

// 有効化時：古いバージョンのキャッシュを削除
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// リクエスト時：キャッシュ優先、なければネットワークから取得
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // 取得できたファイルはキャッシュに追加しておく
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(() => {
          // オフラインでキャッシュにも無い場合はindex.htmlを返す
          return caches.match("./index.html");
        });
    })
  );
});
