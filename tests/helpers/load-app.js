/**
 * Carrega os scripts do site (que são scripts clássicos, sem import/export)
 * dentro de um contexto isolado do Node, simulando só o que eles usam do
 * navegador: fetch, localStorage, location e history.
 *
 * Uso:
 *   const app = loadApp({ fetch: fakeFetch({...}) });
 *   app.Format.parseAmount("1.234,56");
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const DEFAULT_FILES = ["currencies", "format", "api", "prefs"];

/** localStorage em memória. */
function createStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
    get length() {
      return data.size;
    },
    dump: () => Object.fromEntries(data),
  };
}

/**
 * fetch falso: `routes` mapeia um trecho da URL para a resposta (objeto JSON),
 * para uma função (url) => resposta, ou para um Error (simula falha de rede).
 * Registra as URLs chamadas em fetch.calls.
 */
function fakeFetch(routes) {
  const fn = async (url) => {
    fn.calls.push(url);
    const key = Object.keys(routes).find((part) => url.includes(part));
    if (!key) throw new Error(`fetch sem rota para ${url}`);
    let body = routes[key];
    if (typeof body === "function") body = body(url);
    if (body instanceof Error) throw body;
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) };
  };
  fn.calls = [];
  return fn;
}

function loadApp({ files = DEFAULT_FILES, fetch, storage, url = "https://exemplo.test/convert-coin/" } = {}) {
  const location = new URL(url);
  const historyCalls = [];
  const navigate = (type) => (_state, _title, href) => {
    historyCalls.push({ type, href: String(href) });
    location.href = String(href);
  };

  const context = vm.createContext({
    console,
    URL,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: fetch || (async () => Promise.reject(new Error("fetch não configurado no teste"))),
    localStorage: storage || createStorage(),
    location,
    history: { pushState: navigate("push"), replaceState: navigate("replace") },
  });

  for (const name of files) {
    const file = path.join(ROOT, "js", `${name}.js`);
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }

  // `const` de nível superior fica no escopo global do contexto: lê por expressão.
  const read = (name) => vm.runInContext(`typeof ${name} === "undefined" ? undefined : ${name}`, context);

  return {
    CURRENCIES: read("CURRENCIES"),
    BASE_CURRENCY: read("BASE_CURRENCY"),
    Format: read("Format"),
    RatesApi: read("RatesApi"),
    Prefs: read("Prefs"),
    location,
    historyCalls,
    localStorage: context.localStorage,
  };
}

/**
 * Converte objetos criados dentro do contexto isolado em objetos "normais"
 * (outro realm tem outro Array.prototype, o que confunde deepStrictEqual).
 */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** Resposta da AwesomeAPI /json/last com as 5 moedas. */
function lastQuotes({ USD = 5, EUR = 6, GBP = 7, BTC = 400000, PYG = 0.0008, pct = {}, timestamp = 1795144308 } = {}) {
  const quote = (code, bid) => ({
    code,
    codein: "BRL",
    bid: String(bid),
    pctChange: String(pct[code] ?? 0),
    timestamp: String(timestamp),
  });
  return {
    USDBRL: quote("USD", USD),
    EURBRL: quote("EUR", EUR),
    GBPBRL: quote("GBP", GBP),
    BTCBRL: quote("BTC", BTC),
    PYGBRL: quote("PYG", PYG),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resposta da AwesomeAPI /json/daily: `entries` = [[diasAtrás, valor], ...].
 * Devolve na ordem da API (mais novo primeiro). Usa meio-dia local para
 * não cair em outro dia por causa do fuso.
 */
function dailyQuotes(entries) {
  const noonToday = new Date();
  noonToday.setHours(12, 0, 0, 0);
  return entries
    .map(([daysAgo, bid]) => ({
      bid: String(bid),
      timestamp: String(Math.floor((noonToday.getTime() - daysAgo * DAY_MS) / 1000)),
    }))
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
}

/** "AAAA-MM-DD" local de N dias atrás (mesma regra do app). */
function dayAgo(daysAgo) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setTime(d.getTime() - daysAgo * DAY_MS);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

module.exports = { ROOT, loadApp, createStorage, fakeFetch, plain, lastQuotes, dailyQuotes, dayAgo };
