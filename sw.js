/**
 * Service worker do Coinvert: deixa o app abrir offline.
 *
 * Estratégias:
 * - Arquivos do site (HTML, CSS, JS, imagens): "network-first". Online, sempre
 *   busca a versão nova (então não é preciso lembrar de mudar a versão a cada
 *   deploy); se a rede falhar ou demorar mais de 3s, usa a cópia salva.
 * - Google Fonts: "cache-first" (não mudam).
 * - AwesomeAPI: não intercepta. O app já guarda cotações e histórico no
 *   localStorage e mostra o aviso de "valores salvos" quando está offline.
 *
 * Mude VERSION só se mudar a lista SHELL ou a lógica deste arquivo.
 */
const VERSION = "v1";
const SHELL_CACHE = `coinvert-shell-${VERSION}`;
const FONT_CACHE = "coinvert-fonts-v1";
const NETWORK_TIMEOUT_MS = 3000;

/** Tudo que o app precisa para abrir sem internet. */
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/currencies.js",
  "./js/format.js",
  "./js/api.js",
  "./js/prefs.js",
  "./js/chart.js",
  "./js/ui.js",
  "./js/pwa.js",
  "./img/logo.png",
  "./img/Vector.png",
  "./img/brasil.png",
  "./img/estados-unidos.png",
  "./img/euro.png",
  "./img/libra.png",
  "./img/bitcoin.png",
  "./img/guarani.png",
  "./icons/favicon-48.png",
  "./icons/icon-192.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// Remove caches de versões antigas e assume as abas abertas.
self.addEventListener("activate", (event) => {
  const keep = [SHELL_CACHE, FONT_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(event));
  } else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(request));
  }
  // Demais origens (AwesomeAPI): segue direto para a rede.
});

/**
 * Rede primeiro, com fallback para o cache. Páginas com ?de=...&para=... são
 * guardadas sem a query, para não criar uma cópia por combinação de moedas.
 */
async function networkFirst(event) {
  const { request } = event;
  const cache = await caches.open(SHELL_CACHE);
  const isPage = request.mode === "navigate";
  const url = new URL(request.url);
  const cacheKey = isPage ? url.origin + url.pathname : request;

  const network = fetch(request).then((response) => {
    if (response.ok && response.type === "basic") cache.put(cacheKey, response.clone());
    return response;
  });
  event.waitUntil(network.catch(() => {})); // deixa o cache.put terminar

  const fromCache = () =>
    cache.match(cacheKey, { ignoreSearch: isPage }).then((hit) => hit || (isPage ? cache.match("./") : undefined));
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS));

  try {
    // Quem chegar primeiro: a rede, ou (após 3s) a cópia salva.
    const winner = await Promise.race([network, timeout.then(fromCache)]);
    return winner || (await network); // demorou e não há cópia: continua esperando a rede
  } catch (_) {
    return (await fromCache()) || Response.error();
  }
}

/** Cache primeiro (fontes): só vai à rede na primeira vez. */
async function cacheFirst(request) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok || response.type === "opaque") cache.put(request, response.clone());
  return response;
}
