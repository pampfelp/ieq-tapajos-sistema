/*
  Service worker padrão — ver segundo-cerebro/padroes/pwa-checklist.md
  Network-first com fallback pro cache. Cacheia só o "esqueleto" estático,
  NUNCA as chamadas de API (Firestore/Auth) — o próprio SDK do Firestore já
  cuida da persistência de dados offline (ver firebase-init.js).

  Pegadinha real (IEQ Tapajós, 2026-08-24): "network-first" sozinho não é
  suficiente — o `fetch()` de dentro do service worker ainda pode ser
  respondido pelo cache HTTP comum do navegador (camada separada do Cache
  Storage do SW), fazendo o usuário continuar vendo JS antigo mesmo com o
  SW novo instalado. `cache: "reload"` força o fetch a ignorar essa camada
  e sempre bater na rede de verdade.
*/

const CACHE_NAME = "ieq-tapajos-shell-v4"; // bump manual a cada mudança relevante de assets
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./shared.js",
  "./app.js",
  "./manifest.json",
  "./js/state.js",
  "./js/auth.js",
  "./js/pessoas.js",
  "./js/celulas.js",
  "./js/cultos.js",
  "./js/financeiro.js",
  "./js/dashboard.js",
  "./js/dominio-util.js",
  "./js/seletor-pessoas.js",
  "./js/combobox.js",
  "./favicon.ico",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) =>
      Promise.all(SHELL.map((url) => fetch(url, { cache: "reload" }).then((res) => c.put(url, res))))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = e.request.url;

  // Nunca cachear chamadas de API/tempo real — sempre precisam de dado fresco.
  const isApiCall =
    url.includes("googleapis.com") || // Firestore/Auth
    url.includes("google.com/identitytoolkit") || // Firebase Auth REST
    url.includes("gstatic.com/firebasejs"); // SDK — deixa o navegador cachear via HTTP normal

  if (e.request.method !== "GET" || isApiCall) return;

  e.respondWith(
    fetch(e.request, { cache: "no-store" })
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
