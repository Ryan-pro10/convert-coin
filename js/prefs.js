/**
 * Preferências do usuário: moedas e valor escolhidos.
 *
 * - Ficam salvas no localStorage, para reabrir no mesmo par da última visita.
 * - Também vão para a URL (?de=USD&para=BRL&valor=250), para compartilhar
 *   uma conversão pronta. Na abertura, a URL tem prioridade sobre o salvo.
 *
 * Depende de: currencies.js (CURRENCIES), format.js (Format)
 */
const Prefs = (() => {
  const STORAGE_KEY = "coinvert:prefs:v1";

  const isCurrency = (code) => typeof code === "string" && Object.hasOwn(CURRENCIES, code);

  /** Mantém só campos válidos; descarta códigos desconhecidos e valores sem dígitos. */
  function normalize(raw) {
    const prefs = {};
    if (!raw || typeof raw !== "object") return prefs;
    if (isCurrency(raw.from)) prefs.from = raw.from;
    if (isCurrency(raw.to)) prefs.to = raw.to;
    if (typeof raw.amount === "string") {
      const amount = Format.sanitizeAmount(raw.amount);
      if (/\d/.test(amount)) prefs.amount = amount;
    }
    return prefs;
  }

  function fromUrl() {
    const params = new URLSearchParams(location.search);
    return normalize({
      from: params.get("de")?.toUpperCase(),
      to: params.get("para")?.toUpperCase(),
      amount: params.get("valor") ?? undefined,
    });
  }

  function fromStorage() {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    } catch (_) {
      return {};
    }
  }

  /** Combina padrões ← salvo no navegador ← URL (a URL vence). */
  function load(defaults) {
    return { ...defaults, ...fromStorage(), ...fromUrl() };
  }

  /** Monta a URL compartilhável do estado atual. */
  function buildUrl({ from, to, amount }) {
    const url = new URL(location.href);
    const params = new URLSearchParams({ de: from, para: to });
    if (/\d/.test(amount)) params.set("valor", amount);
    url.search = params.toString();
    url.hash = "";
    return url.href;
  }

  /**
   * Salva o estado no navegador e na URL.
   * push = true cria uma entrada no histórico (troca de moeda), para o "voltar"
   * desfazer a troca; enquanto digita usa replace, para não poluir o histórico.
   */
  function save(state, { push = false } = {}) {
    try {
      const { from, to, amount } = state;
      const stored = /\d/.test(amount) ? { from, to, amount } : { from, to };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (_) {
      /* storage indisponível: segue sem salvar */
    }

    try {
      const href = buildUrl(state);
      if (href !== location.href) history[push ? "pushState" : "replaceState"](null, "", href);
    } catch (_) {
      /* alguns navegadores bloqueiam history em file:// */
    }
  }

  return { load, save, fromUrl, buildUrl };
})();
