/**
 * Gráfico de linha em SVG puro (sem biblioteca) para o histórico do par.
 *
 * - Linha de 2px + área suave, ponto no último valor.
 * - Hover: linha vertical (crosshair) que "gruda" no dia mais próximo + tooltip.
 * - Teclado: com o gráfico em foco, ← → navegam pelos dias, Home/End vão às pontas.
 * - Redesenha sozinho quando o container muda de tamanho (a altura vem do CSS).
 *
 * Uso: const chart = HistoryChart.create(container, { formatValue, formatDate, onReadout });
 *      chart.draw(points)   // points = [{ day: "AAAA-MM-DD", v: número }]
 */
const HistoryChart = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const MIN_HEIGHT = 120; // a altura real vem do CSS (.chart): 140px no celular, flexível ao lado
  const PAD = { top: 10, right: 10, bottom: 10, left: 10 };

  function svgEl(name, attrs = {}) {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  }

  function create(container, { formatValue, formatDate, onReadout }) {
    let points = [];
    let activeIndex = -1;
    let geometry = null; // { xs, ys, width, height }

    const svg = svgEl("svg", { class: "chart-svg", "aria-hidden": "true", focusable: "false" });
    const tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    tooltip.setAttribute("aria-hidden", "true");
    tooltip.hidden = true;
    const tooltipValue = document.createElement("strong");
    const tooltipDate = document.createElement("span");
    tooltip.append(tooltipValue, tooltipDate);
    container.append(svg, tooltip);

    /** Desenha tudo de novo na largura atual do container. */
    function draw(nextPoints = points) {
      points = nextPoints;
      svg.replaceChildren();
      hideReadout();

      const width = Math.max(container.clientWidth, 120);
      const HEIGHT = Math.max(container.clientHeight, MIN_HEIGHT);
      svg.setAttribute("width", width);
      svg.setAttribute("height", HEIGHT);
      svg.setAttribute("viewBox", `0 0 ${width} ${HEIGHT}`);
      if (points.length < 2) {
        geometry = null;
        return;
      }

      const values = points.map((p) => p.v);
      let min = Math.min(...values);
      let max = Math.max(...values);
      if (min === max) {
        min *= 0.99;
        max *= 1.01;
      }

      const innerW = width - PAD.left - PAD.right;
      const innerH = HEIGHT - PAD.top - PAD.bottom;
      const xs = points.map((_, i) => PAD.left + (innerW * i) / (points.length - 1));
      const ys = points.map((p) => PAD.top + innerH * (1 - (p.v - min) / (max - min)));
      geometry = { xs, ys, width };

      // Linhas de grade discretas no topo (máx.) e na base (mín.)
      for (const y of [PAD.top, HEIGHT - PAD.bottom]) {
        svg.append(svgEl("line", { class: "chart-grid", x1: 0, x2: width, y1: y, y2: y }));
      }

      const line = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join("");
      const area = `${line}L${xs.at(-1).toFixed(1)},${HEIGHT - PAD.bottom}L${xs[0].toFixed(1)},${HEIGHT - PAD.bottom}Z`;
      svg.append(svgEl("path", { class: "chart-area", d: area }));
      svg.append(svgEl("path", { class: "chart-line", d: line }));
      svg.append(svgEl("circle", { class: "chart-dot", cx: xs.at(-1), cy: ys.at(-1), r: 4 }));

      // Elementos do hover (escondidos até o usuário interagir)
      svg.append(svgEl("line", { class: "chart-crosshair", y1: PAD.top, y2: HEIGHT - PAD.bottom, visibility: "hidden" }));
      svg.append(svgEl("circle", { class: "chart-dot chart-dot--hover", r: 5, visibility: "hidden" }));
    }

    /** Mostra crosshair + tooltip no ponto `index`. */
    function showReadout(index, { announce = false } = {}) {
      if (!geometry) return;
      activeIndex = Math.max(0, Math.min(points.length - 1, index));
      const x = geometry.xs[activeIndex];
      const y = geometry.ys[activeIndex];
      const point = points[activeIndex];

      const crosshair = svg.querySelector(".chart-crosshair");
      const dot = svg.querySelector(".chart-dot--hover");
      crosshair.setAttribute("x1", x);
      crosshair.setAttribute("x2", x);
      crosshair.setAttribute("visibility", "visible");
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", y);
      dot.setAttribute("visibility", "visible");

      tooltipValue.textContent = formatValue(point.v);
      tooltipDate.textContent = formatDate(point.day);
      tooltip.hidden = false;

      // Mantém o tooltip dentro do gráfico
      const half = tooltip.offsetWidth / 2;
      const left = Math.max(half, Math.min(geometry.width - half, x));
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${Math.max(0, y - 12)}px`;
      tooltip.classList.toggle("is-below", y < 56);

      if (announce && onReadout) onReadout(`${formatDate(point.day)}: ${formatValue(point.v)}`);
    }

    function hideReadout() {
      activeIndex = -1;
      tooltip.hidden = true;
      svg.querySelectorAll(".chart-crosshair, .chart-dot--hover").forEach((n) => n.setAttribute("visibility", "hidden"));
    }

    /** Índice do dia mais próximo da posição horizontal do ponteiro. */
    function indexFromPointer(event) {
      const rect = svg.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const innerW = geometry.width - PAD.left - PAD.right;
      return Math.round(((x - PAD.left) / innerW) * (points.length - 1));
    }

    container.addEventListener("pointermove", (event) => {
      if (geometry) showReadout(indexFromPointer(event));
    });
    container.addEventListener("pointerleave", () => {
      if (document.activeElement !== container) hideReadout();
    });

    container.addEventListener("focus", () => showReadout(points.length - 1, { announce: true }));
    container.addEventListener("blur", hideReadout);
    container.addEventListener("keydown", (event) => {
      if (!geometry) return;
      const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1 };
      let next = activeIndex;
      if (event.key in moves) next = (activeIndex < 0 ? points.length - 1 : activeIndex) + moves[event.key];
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = points.length - 1;
      else return;
      event.preventDefault();
      showReadout(next, { announce: true });
    });

    // Redesenha quando o tamanho muda (rotação do celular, resize, layout lado a lado)
    let lastSize = "";
    new ResizeObserver(() => {
      const size = `${container.clientWidth}x${container.clientHeight}`;
      if (size !== lastSize) {
        lastSize = size;
        draw();
      }
    }).observe(container);

    return { draw };
  }

  return { create };
})();
