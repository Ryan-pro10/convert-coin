/**
 * Camada de dados: busca de cotações na AwesomeAPI, cache no localStorage
 * e cálculo de conversão entre quaisquer pares.
 *
 * Depende de: currencies.js (CURRENCIES, BASE_CURRENCY)
 */
const RatesApi = (() => {
  const QUOTED = Object.keys(CURRENCIES).filter((code) => code !== BASE_CURRENCY);
  const BASE_URL = "https://economia.awesomeapi.com.br/json";
  const API_URL = `${BASE_URL}/last/` + QUOTED.map((code) => `${code}-${BASE_CURRENCY}`).join(",");

  const CACHE_KEY = "coinvert:rates:v1";
  const REQUEST_TIMEOUT_MS = 8000;

  // Histórico: 100 registros cobrem 90+ dias mesmo em moedas que não negociam no fim de semana.
  const HISTORY_RECORDS = 100;
  const HISTORY_TTL_MS = 60 * 60 * 1000; // reaproveita o histórico por 1 hora
  const historyMemory = {};

  /** fetch com timeout; lança erro em HTTP != 2xx. */
  async function fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Converte a resposta da API em { rates, changes, updatedAt }.
   * rates[code]   = quantos BRL vale 1 unidade da moeda (BRL = 1).
   * changes[code] = variação do dia em relação ao BRL, em fração (0.0087 = +0,87%).
   * updatedAt     = timestamp (ms) da cotação mais recente.
   */
  function parseResponse(data) {
    const rates = { [BASE_CURRENCY]: 1 };
    const changes = { [BASE_CURRENCY]: 0 };
    let updatedAt = 0;

    for (const code of QUOTED) {
      const quote = data && data[`${code}${BASE_CURRENCY}`];
      const bid = quote ? parseFloat(quote.bid) : NaN;
      if (!(bid > 0)) throw new Error(`Cotação inválida para ${code}`);

      rates[code] = bid;
      changes[code] = parseFloat(quote.pctChange) / 100 || 0;
      updatedAt = Math.max(updatedAt, Number(quote.timestamp) * 1000 || 0);
    }

    return { rates, changes, updatedAt: updatedAt || Date.now() };
  }

  /** Busca as cotações na API, com timeout. Lança erro em caso de falha. */
  async function fetchRates() {
    return parseResponse(await fetchJson(API_URL));
  }

  /** Salva a última cotação válida. Falhas de storage (modo privado etc.) são ignoradas. */
  function saveCache(snapshot) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
    } catch (_) {
      /* storage indisponível: segue sem cache */
    }
  }

  /** Lê o cache, validando o formato. Retorna null se não houver nada utilizável. */
  function loadCache() {
    try {
      const snapshot = JSON.parse(localStorage.getItem(CACHE_KEY));
      const valid =
        snapshot &&
        typeof snapshot.updatedAt === "number" &&
        Object.keys(CURRENCIES).every((code) => snapshot.rates && snapshot.rates[code] > 0);
      return valid ? snapshot : null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Retorna as cotações e a origem delas:
   *   { rates, updatedAt, source: "api" | "cache" }
   * Tenta a API primeiro; se falhar, recorre ao cache. Se não houver cache, lança erro.
   */
  async function getRates() {
    try {
      const snapshot = await fetchRates();
      saveCache(snapshot);
      return { ...snapshot, source: "api" };
    } catch (error) {
      const cached = loadCache();
      if (cached) return { ...cached, source: "cache" };
      throw error;
    }
  }

  /**
   * Converte `amount` de `from` para `to`.
   * A API só fornece pares X-BRL, então pares cruzados (ex.: USD → EUR)
   * passam pelo BRL: valor em BRL = amount × taxa(from); depois ÷ taxa(to).
   */
  function convert(amount, from, to, rates) {
    if (from === to) return amount;
    return (amount * rates[from]) / rates[to];
  }

  /**
   * Variação do dia do par from → to, em fração.
   * Como a taxa cruzada é taxa(from) ÷ taxa(to), a variação dela é
   * (1 + var(from)) ÷ (1 + var(to)) − 1.
   * Retorna null quando não há dados (ex.: cache antigo sem variação).
   */
  function pairChange(from, to, changes) {
    if (!changes || from === to) return null;
    const a = changes[from];
    const b = changes[to];
    if (typeof a !== "number" || typeof b !== "number") return null;
    return (1 + a) / (1 + b) - 1;
  }

  /* ---------- Histórico ---------- */

  /** Data local no formato "AAAA-MM-DD" (ordena como texto). */
  function dayKey(timestamp) {
    const d = new Date(timestamp);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /**
   * Busca o histórico diário de uma moeda contra o BRL.
   * A API devolve do mais novo para o mais antigo e pode repetir o dia;
   * aqui fica um ponto por dia (o mais recente), em ordem cronológica.
   */
  async function fetchHistory(code) {
    const data = await fetchJson(`${BASE_URL}/daily/${code}-${BASE_CURRENCY}/${HISTORY_RECORDS}`);
    if (!Array.isArray(data)) throw new Error(`Histórico inválido para ${code}`);

    const byDay = new Map();
    for (const item of data) {
      const t = Number(item.timestamp) * 1000;
      const v = parseFloat(item.bid);
      if (!(t > 0 && v > 0)) continue;
      const day = dayKey(t);
      const previous = byDay.get(day);
      if (!previous || t > previous.t) byDay.set(day, { day, t, v });
    }

    const points = [...byDay.values()].sort((a, b) => a.t - b.t);
    if (points.length < 2) throw new Error(`Histórico insuficiente para ${code}`);
    return points;
  }

  /**
   * Histórico de uma moeda com cache em memória + localStorage (1h).
   * Se a API falhar, usa o cache vencido e marca stale = true.
   */
  async function getHistory(code) {
    const key = `coinvert:history:v1:${code}`;
    const isFresh = (entry) => entry && Date.now() - entry.savedAt < HISTORY_TTL_MS;

    if (isFresh(historyMemory[code])) return historyMemory[code];

    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(key));
      if (!stored || !Array.isArray(stored.points)) stored = null;
    } catch (_) {
      stored = null;
    }
    if (isFresh(stored)) return (historyMemory[code] = { ...stored, stale: false });

    try {
      const entry = { points: await fetchHistory(code), savedAt: Date.now(), stale: false };
      historyMemory[code] = entry;
      try {
        localStorage.setItem(key, JSON.stringify({ points: entry.points, savedAt: entry.savedAt }));
      } catch (_) {
        /* storage cheio/indisponível */
      }
      return entry;
    } catch (error) {
      if (stored) return { ...stored, stale: true };
      throw error;
    }
  }

  /**
   * Histórico do par from → to nos últimos `days` dias: [{ day, v }], v = 1 from em to.
   * Pares cruzados combinam as duas séries contra o BRL. Como as moedas têm
   * calendários diferentes (o BTC negocia no fim de semana, o Dólar não), cada
   * dia usa o último valor conhecido de cada moeda (forward fill).
   */
  async function getPairHistory(from, to, days) {
    if (from === to) return { points: [], stale: false };

    const [a, b] = await Promise.all(
      [from, to].map((code) => (code === BASE_CURRENCY ? null : getHistory(code)))
    );
    const seriesA = a ? a.points : null;
    const seriesB = b ? b.points : null;

    const allDays = [...new Set([...(seriesA || []), ...(seriesB || [])].map((p) => p.day))].sort();
    const cutoff = dayKey(Date.now() - days * 24 * 60 * 60 * 1000);

    let ia = -1;
    let ib = -1;
    const points = [];
    for (const day of allDays) {
      while (seriesA && ia + 1 < seriesA.length && seriesA[ia + 1].day <= day) ia++;
      while (seriesB && ib + 1 < seriesB.length && seriesB[ib + 1].day <= day) ib++;
      if (day < cutoff) continue;

      const va = seriesA ? (ia >= 0 ? seriesA[ia].v : null) : 1;
      const vb = seriesB ? (ib >= 0 ? seriesB[ib].v : null) : 1;
      if (va && vb) points.push({ day, v: va / vb });
    }

    return { points, stale: Boolean((a && a.stale) || (b && b.stale)) };
  }

  return { getRates, loadCache, convert, pairChange, getPairHistory };
})();
