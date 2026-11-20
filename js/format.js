/**
 * Formatação de valores/datas e leitura (parse) do campo de valor.
 *
 * Depende de: currencies.js (CURRENCIES)
 */
const Format = (() => {
  /** Maior valor aceito no campo (999 bilhões). */
  const MAX_AMOUNT = 999_999_999_999;
  /** Limite de caracteres digitados (inclui separadores). */
  const MAX_INPUT_LENGTH = 20;

  const formatters = {};

  /** Cria (uma vez) e reutiliza o Intl.NumberFormat de cada moeda/precisão. */
  function getFormatter(code, maxDecimals) {
    const key = `${code}:${maxDecimals}`;
    if (formatters[key]) return formatters[key];

    const { locale, decimals } = CURRENCIES[code];
    const minDecimals = Math.min(decimals, 2);

    // O Bitcoin não tem código ISO 4217, então é formatado como número + símbolo ₿.
    formatters[key] =
      code === "BTC"
        ? new Intl.NumberFormat(locale, { minimumFractionDigits: minDecimals, maximumFractionDigits: maxDecimals })
        : new Intl.NumberFormat(locale, {
            style: "currency",
            currency: code,
            minimumFractionDigits: minDecimals,
            maximumFractionDigits: maxDecimals,
          });
    return formatters[key];
  }

  /**
   * Formata um valor na moeda indicada:
   * BRL → "R$ 1.234,56", USD → "$1,234.56", BTC → "₿ 0.00012345", PYG → "Gs. 1.234".
   * Valores muito pequenos (ex.: 1 Guarani em Reais) ganham até 6 casas
   * para não aparecerem como "0,00".
   */
  function currency(value, code) {
    const { decimals } = CURRENCIES[code];
    const smallest = 10 ** -decimals;
    const maxDecimals = value > 0 && value < smallest ? 6 : decimals;
    const text = getFormatter(code, maxDecimals).format(value);
    return code === "BTC" ? `₿ ${text}` : text;
  }

  /** Data e hora no padrão brasileiro: "20/11/2026, 14:32". */
  function dateTime(timestamp) {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(timestamp);
  }

  const shortDayFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  const longDayFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

  /** "AAAA-MM-DD" → Date local (evita o fuso UTC de new Date("AAAA-MM-DD")). */
  function dayToDate(day) {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  /** "2026-11-19" → "19 de nov." (eixo do gráfico). */
  function shortDay(day) {
    return shortDayFormatter.format(dayToDate(day));
  }

  /** "2026-11-19" → "19 de nov. de 2026" (tooltip e tabela). */
  function longDay(day) {
    return longDayFormatter.format(dayToDate(day));
  }

  const percentFormatter = new Intl.NumberFormat("pt-BR", {
    style: "percent",
    signDisplay: "exceptZero",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  /** Variação em fração → "+0,87%" / "−1,20%" / "0,00%". */
  function percent(fraction) {
    return percentFormatter.format(fraction);
  }

  /** Remove do texto digitado tudo que não for dígito, vírgula ou ponto (bloqueia letras e "-"). */
  function sanitizeAmount(raw) {
    return raw.replace(/[^\d.,]/g, "").slice(0, MAX_INPUT_LENGTH);
  }

  /**
   * Interpreta o valor digitado aceitando vírgula ou ponto:
   *   "1.234,56" → 1234.56   "1,234.56" → 1234.56   "10,5" → 10.5
   *   "10.5"     → 10.5      "1.000"    → 1000       "1.000.000" → 1000000
   * Retorna null quando o campo está vazio ou não contém um número.
   */
  function parseAmount(raw) {
    const text = sanitizeAmount(raw.trim());
    if (!/\d/.test(text)) return null;

    const lastComma = text.lastIndexOf(",");
    const lastDot = text.lastIndexOf(".");
    let decimalIndex = -1;

    if (lastComma > -1 && lastDot > -1) {
      // Os dois separadores aparecem: o último é o decimal.
      decimalIndex = Math.max(lastComma, lastDot);
    } else if (lastComma > -1 || lastDot > -1) {
      const sep = lastComma > -1 ? "," : ".";
      const index = Math.max(lastComma, lastDot);
      const occurrences = text.split(sep).length - 1;
      const digitsAfter = text.length - index - 1;
      // Separador repetido ("1.000.000") ou ponto seguido de 3 dígitos ("1.000") = milhar.
      const isThousands = occurrences > 1 || (sep === "." && digitsAfter === 3);
      if (!isThousands) decimalIndex = index;
    }

    const integerPart = (decimalIndex > -1 ? text.slice(0, decimalIndex) : text).replace(/[.,]/g, "");
    const fractionPart = decimalIndex > -1 ? text.slice(decimalIndex + 1).replace(/[.,]/g, "") : "";
    const value = Number(`${integerPart || "0"}.${fractionPart || "0"}`);

    return Number.isFinite(value) ? value : null;
  }

  return { MAX_AMOUNT, MAX_INPUT_LENGTH, currency, dateTime, shortDay, longDay, percent, sanitizeAmount, parseAmount };
})();
