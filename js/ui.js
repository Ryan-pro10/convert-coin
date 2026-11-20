/**
 * Camada de interface: liga os eventos da página, controla os estados
 * (carregando / aviso / erro) e desenha o resultado da conversão.
 *
 * Depende de: currencies.js, format.js (Format), api.js (RatesApi), prefs.js (Prefs), chart.js (HistoryChart)
 */
(() => {
  const DEBOUNCE_MS = 300;
  const FEEDBACK_MS = 1800;
  const DEFAULTS = { from: "BRL", to: "USD", amount: "100" };

  const el = {
    form: document.getElementById("converter"),
    from: document.getElementById("from-currency"),
    to: document.getElementById("to-currency"),
    amount: document.getElementById("amount"),
    hint: document.getElementById("amount-hint"),
    refresh: document.getElementById("refresh-button"),
    refreshLabel: document.querySelector(".refresh-label"),
    notice: document.getElementById("notice"),
    result: document.getElementById("result"),
    swap: document.getElementById("swap-button"),
    fromImg: document.getElementById("from-img"),
    fromName: document.getElementById("from-name"),
    fromValue: document.getElementById("from-value"),
    toImg: document.getElementById("to-img"),
    toName: document.getElementById("to-name"),
    toValue: document.getElementById("to-value"),
    copy: document.getElementById("copy-button"),
    share: document.getElementById("share-button"),
    actionStatus: document.getElementById("action-status"),
    rateLine: document.getElementById("rate-line"),
    rateText: document.getElementById("rate-text"),
    rateChange: document.getElementById("rate-change"),
    updatedAt: document.getElementById("updated-at"),
  };

  const DEFAULT_HINT = el.hint.textContent;

  /**
   * Estado da aplicação.
   * result = último valor convertido formatado (o que o botão "Copiar" copia), ou null.
   */
  const state = { rates: null, changes: null, updatedAt: null, loading: false, result: null };

  /* ---------- Utilitários ---------- */

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  /** Troca o texto e reinicia a animação de destaque, só se o valor mudou. */
  function setAnimatedText(node, text) {
    if (node.textContent === text) return;
    node.textContent = text;
    node.classList.remove("is-updated");
    void node.offsetWidth; // força reflow para a animação recomeçar
    node.classList.add("is-updated");
  }

  function setCurrencyBox(code, img, name) {
    const currency = CURRENCIES[code];
    if (img.getAttribute("src") !== currency.img) img.src = currency.img;
    img.alt = currency.alt;
    name.textContent = currency.name;
  }

  /** Mostra uma mensagem (type: "info" | "warning" | "error") ou esconde se text for vazio. */
  function showNotice(text, type = "info") {
    el.notice.hidden = !text;
    el.notice.textContent = text || "";
    el.notice.className = `notice notice--${type}`;
  }

  function setHint(text, isError = false) {
    el.hint.textContent = text;
    el.hint.classList.toggle("hint--error", isError);
    el.amount.setAttribute("aria-invalid", String(isError));
  }

  function setLoading(loading) {
    state.loading = loading;
    el.refresh.disabled = loading;
    el.refresh.classList.toggle("is-loading", loading);
    el.refreshLabel.textContent = loading ? "Atualizando…" : "Atualizar cotação";
    el.result.setAttribute("aria-busy", String(loading));
    // Skeleton só quando ainda não há nenhuma cotação para mostrar.
    el.result.classList.toggle("is-loading", loading && !state.rates);
  }

  /** Estado atual do formulário, no formato usado por Prefs. */
  function currentSelection() {
    return { from: el.from.value, to: el.to.value, amount: el.amount.value };
  }

  /** Aplica uma seleção (padrões, salva ou vinda da URL) aos campos. */
  function applySelection({ from, to, amount }) {
    el.from.value = from;
    el.to.value = to;
    el.amount.value = amount;
  }

  /* ---------- Renderização ---------- */

  function renderRateLine(from, to) {
    if (!state.rates || from === to) {
      el.rateLine.hidden = true;
      return;
    }

    el.rateLine.hidden = false;
    el.rateText.textContent =
      `${Format.currency(1, from)} = ${Format.currency(RatesApi.convert(1, from, to, state.rates), to)}`;

    setChangeBadge(el.rateChange, RatesApi.pairChange(from, to, state.changes), "hoje");
    el.rateChange.title = "Variação da cotação nas últimas 24 horas";
  }

  /**
   * Preenche um selo de variação ("▲ +0,87% hoje"). A seta + o sinal
   * indicam a direção sem depender só da cor. change = null esconde o selo.
   */
  function setChangeBadge(node, change, suffix) {
    if (change === null || !Number.isFinite(change)) {
      node.hidden = true;
      return;
    }
    // Arredonda para evitar "-0,00%" e decide a direção pelo valor exibido.
    const rounded = Math.round(change * 10000) / 10000;
    const direction = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
    const arrow = { up: "▲", down: "▼", flat: "■" }[direction];

    node.hidden = false;
    node.className = `rate-change rate-change--${direction}`;
    node.textContent = `${arrow} ${Format.percent(rounded)} ${suffix}`;
  }

  /** Lê o formulário e atualiza todo o bloco de resultado. */
  function render() {
    const from = el.from.value;
    const to = el.to.value;

    setCurrencyBox(from, el.fromImg, el.fromName);
    setCurrencyBox(to, el.toImg, el.toName);

    state.result = null;

    // Validação do valor digitado
    const amount = Format.parseAmount(el.amount.value);
    if (amount === null) {
      setHint("Digite um valor para converter.");
      setAnimatedText(el.fromValue, "—");
      setAnimatedText(el.toValue, "—");
    } else if (amount > Format.MAX_AMOUNT) {
      setHint(`Valor muito alto. O máximo é ${Format.currency(Format.MAX_AMOUNT, from)}.`, true);
      setAnimatedText(el.toValue, "—");
    } else {
      setHint(DEFAULT_HINT);
      setAnimatedText(el.fromValue, Format.currency(amount, from));
      if (state.rates) {
        state.result = Format.currency(RatesApi.convert(amount, from, to, state.rates), to);
        setAnimatedText(el.toValue, state.result);
      }
    }

    if (!state.rates) el.toValue.textContent = "—";

    renderRateLine(from, to);
    el.updatedAt.textContent = state.rates ? `Atualizado em: ${Format.dateTime(state.updatedAt)}` : "";
    el.copy.disabled = el.share.disabled = !state.result;
  }

  /** Redesenha e salva a seleção (localStorage + URL). */
  function update({ push = false } = {}) {
    render();
    Prefs.save(currentSelection(), { push });
  }

  /* ---------- Dados ---------- */

  /** Busca as cotações (API → cache) e atualiza a tela com o resultado. */
  async function loadRates() {
    if (state.loading) return;
    setLoading(true);
    if (!state.rates) showNotice("Carregando cotações…", "info");

    try {
      const { rates, changes, updatedAt, source } = await RatesApi.getRates();
      state.rates = rates;
      state.changes = changes || null;
      state.updatedAt = updatedAt;

      if (source === "cache") {
        showNotice(
          `Não foi possível buscar a cotação agora. Exibindo os últimos valores salvos (${Format.dateTime(updatedAt)}), que podem estar desatualizados.`,
          "warning"
        );
      } else {
        showNotice("");
      }
    } catch (error) {
      console.error("Falha ao carregar cotações:", error);
      showNotice(
        "Não conseguimos carregar as cotações. Verifique sua conexão e toque em “Tentar novamente”.",
        "error"
      );
    } finally {
      setLoading(false);
      if (!state.rates) el.refreshLabel.textContent = "Tentar novamente";
      render();
    }
  }

  /* ---------- Histórico (gráfico) ---------- */

  const PERIOD_KEY = "coinvert:period:v1";

  const hx = {
    section: document.getElementById("history"),
    body: document.getElementById("history-body"),
    pair: document.getElementById("history-pair"),
    change: document.getElementById("history-change"),
    start: document.getElementById("chart-start"),
    end: document.getElementById("chart-end"),
    range: document.getElementById("chart-range"),
    rows: document.getElementById("history-rows"),
    caption: document.getElementById("history-caption"),
    message: document.getElementById("history-message"),
    readout: document.getElementById("chart-readout"),
    periods: [...document.querySelectorAll(".period-button")],
  };

  /** days = período escolhido; requestId descarta respostas atrasadas; to = moeda do desenho atual. */
  const historyState = { days: 30, requestId: 0, hasData: false, to: "USD" };

  try {
    const saved = Number(localStorage.getItem(PERIOD_KEY));
    if ([7, 30, 90].includes(saved)) historyState.days = saved;
  } catch (_) {
    /* sem storage: usa 30 dias */
  }

  const chart = HistoryChart.create(document.getElementById("chart"), {
    formatValue: (value) => Format.currency(value, historyState.to),
    formatDate: Format.longDay,
    onReadout: (text) => {
      hx.readout.textContent = text;
    },
  });

  function setHistoryLoading(loading) {
    hx.section.setAttribute("aria-busy", String(loading));
    // Primeira carga: skeleton. Recarga: mantém o gráfico anterior esmaecido.
    hx.section.classList.toggle("is-loading", loading && !historyState.hasData);
    hx.section.classList.toggle("is-refreshing", loading && historyState.hasData);
  }

  function showHistoryMessage(text) {
    hx.message.hidden = !text;
    hx.message.textContent = text;
  }

  function renderPeriodButtons() {
    for (const button of hx.periods) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.days) === historyState.days));
    }
  }

  /** Preenche a tabela (mais recente primeiro) — alternativa acessível ao gráfico. */
  function renderHistoryTable(points, to) {
    const rows = points
      .slice()
      .reverse()
      .map((point) => {
        const tr = document.createElement("tr");
        const date = document.createElement("td");
        const value = document.createElement("td");
        date.textContent = Format.longDay(point.day);
        value.textContent = Format.currency(point.v, to);
        tr.append(date, value);
        return tr;
      });
    hx.rows.replaceChildren(...rows);
  }

  /** Busca e desenha o histórico do par/período atuais. */
  async function loadHistory() {
    const from = el.from.value;
    const to = el.to.value;
    const days = historyState.days;
    const id = ++historyState.requestId;

    hx.pair.textContent = `1 ${from} em ${to} · últimos ${days} dias`;
    renderPeriodButtons();

    if (from === to) {
      hx.body.hidden = true;
      hx.change.hidden = true;
      historyState.hasData = false;
      setHistoryLoading(false);
      showHistoryMessage("Escolha moedas diferentes para ver o histórico.");
      return;
    }

    setHistoryLoading(true);

    try {
      const { points, stale } = await RatesApi.getPairHistory(from, to, days);
      if (id !== historyState.requestId) return; // o usuário já trocou de par/período
      if (points.length < 2) throw new Error("Dados insuficientes para o gráfico");

      historyState.to = to;
      historyState.hasData = true;
      hx.body.hidden = false; // precisa estar visível para o gráfico medir a largura
      chart.draw(points);

      const first = points[0];
      const last = points.at(-1);
      const values = points.map((p) => p.v);
      setChangeBadge(hx.change, last.v / first.v - 1, "no período");
      hx.change.title = `Variação entre ${Format.longDay(first.day)} e ${Format.longDay(last.day)}`;
      hx.start.textContent = Format.shortDay(first.day);
      hx.end.textContent = Format.shortDay(last.day);
      hx.range.textContent =
        `Mín. ${Format.currency(Math.min(...values), to)} · Máx. ${Format.currency(Math.max(...values), to)}`;
      hx.caption.textContent = `Histórico: 1 ${from} em ${to}, últimos ${days} dias`;
      renderHistoryTable(points, to);

      showHistoryMessage(stale ? "Não foi possível atualizar o histórico agora; exibindo dados salvos." : "");
    } catch (error) {
      if (id !== historyState.requestId) return;
      console.error("Falha ao carregar histórico:", error);
      historyState.hasData = false;
      hx.body.hidden = true;
      hx.change.hidden = true;
      showHistoryMessage("Histórico indisponível no momento. Tente novamente mais tarde.");
    } finally {
      if (id === historyState.requestId) setHistoryLoading(false);
    }
  }

  for (const button of hx.periods) {
    button.addEventListener("click", () => {
      const days = Number(button.dataset.days);
      if (days === historyState.days) return;
      historyState.days = days;
      try {
        localStorage.setItem(PERIOD_KEY, String(days));
      } catch (_) {
        /* sem storage */
      }
      loadHistory();
    });
  }

  /* ---------- Copiar e compartilhar ---------- */

  /** Copia texto para a área de transferência, com alternativa para navegadores antigos/file://. */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand("copy");
      field.remove();
      return ok;
    }
  }

  /** Mostra um retorno rápido no botão (ex.: "Copiado!") e anuncia para leitores de tela. */
  function flashButton(button, text) {
    const label = button.querySelector(".chip-label");
    const original = button.dataset.label || label.textContent;
    button.dataset.label = original;
    label.textContent = text;
    button.classList.add("is-done");
    el.actionStatus.textContent = text;

    clearTimeout(button._timer);
    button._timer = setTimeout(() => {
      label.textContent = original;
      button.classList.remove("is-done");
      el.actionStatus.textContent = "";
    }, FEEDBACK_MS);
  }

  async function handleCopy() {
    if (!state.result) return;
    const ok = await copyText(state.result);
    flashButton(el.copy, ok ? "Copiado!" : "Não foi possível copiar");
  }

  /** Usa o menu nativo de compartilhar (celular); no computador, copia o link. */
  async function handleShare() {
    if (!state.result) return;
    const { from, to } = currentSelection();
    const url = Prefs.buildUrl(currentSelection());
    const text = `${el.fromValue.textContent} = ${state.result} (${from} → ${to}) no Coinvert`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "Coinvert", text, url });
        return;
      } catch (error) {
        if (error.name === "AbortError") return; // usuário fechou o menu
      }
    }

    const ok = await copyText(url);
    flashButton(el.share, ok ? "Link copiado!" : "Não foi possível copiar");
  }

  /* ---------- Eventos ---------- */

  const debouncedUpdate = debounce(() => update(), DEBOUNCE_MS);

  // Bloqueia letras/negativos mantendo a posição do cursor.
  el.amount.addEventListener("input", () => {
    const { value, selectionStart } = el.amount;
    const clean = Format.sanitizeAmount(value);
    if (clean !== value) {
      const caret = Format.sanitizeAmount(value.slice(0, selectionStart ?? value.length)).length;
      el.amount.value = clean;
      el.amount.setSelectionRange(caret, caret);
    }
    debouncedUpdate();
  });

  /** Troca de par: redesenha, salva no histórico do navegador e recarrega o gráfico. */
  function onPairChange() {
    update({ push: true });
    loadHistory();
  }

  el.from.addEventListener("change", onPairChange);
  el.to.addEventListener("change", onPairChange);

  el.swap.addEventListener("click", () => {
    [el.from.value, el.to.value] = [el.to.value, el.from.value];
    el.swap.classList.toggle("is-swapped");
    onPairChange();
  });

  el.refresh.addEventListener("click", loadRates);
  el.copy.addEventListener("click", handleCopy);
  el.share.addEventListener("click", handleShare);

  // Botão "voltar"/"avançar" do navegador: restaura a seleção que estava na URL.
  window.addEventListener("popstate", () => {
    applySelection({ ...DEFAULTS, ...Prefs.fromUrl() });
    render();
    loadHistory();
  });

  // Enter no campo não recarrega a página.
  el.form.addEventListener("submit", (event) => {
    event.preventDefault();
    render();
  });

  // Conexão caiu: avisa (os valores salvos continuam funcionando). Voltou: atualiza tudo.
  window.addEventListener("offline", () => {
    showNotice("Você está offline. Os valores exibidos são os últimos salvos.", "warning");
  });
  window.addEventListener("online", () => {
    loadRates();
    loadHistory();
  });

  /* ---------- Inicialização ---------- */

  // Restaura a seleção: URL compartilhada > última visita > padrões.
  applySelection(Prefs.load(DEFAULTS));

  // Mostra o cache imediatamente (se houver) enquanto a cotação nova chega.
  const cached = RatesApi.loadCache();
  if (cached) {
    state.rates = cached.rates;
    state.changes = cached.changes || null;
    state.updatedAt = cached.updatedAt;
  }
  render(); // só desenha: a URL só muda quando o usuário interage
  loadRates();
  loadHistory();
})();
