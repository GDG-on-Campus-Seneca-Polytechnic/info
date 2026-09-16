// Caches every file on first visit so the game runs with no internet afterwards.
const CACHE = "gdg-jump-v2";
const FILES = [
  "./", "index.html", "styles.css", "app.js", "pose.js", "wheel.js", "manifest.webmanifest",
  "assets/lockup-black.png", "assets/mark.png", "assets/icon-180.png", "assets/icon-192.png", "assets/icon-512.png",
  "vendor/qrcode.mjs",
  "vendor/fonts/google-sans-flex.woff2", "vendor/fonts/pixelify-sans-700.woff",
  "vendor/mediapipe/vision_bundle.mjs", "vendor/mediapipe/pose_landmarker_lite.task",
  "vendor/mediapipe/wasm/vision_wasm_internal.js", "vendor/mediapipe/wasm/vision_wasm_internal.wasm",
  "vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js", "vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Big files that never change load from the cache. Everything else tries the network
// first so updates show up, and falls back to the cache when there is no internet.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.pathname.includes("/vendor/")) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
