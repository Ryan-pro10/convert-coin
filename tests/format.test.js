const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/load-app");

const { Format } = loadApp({ files: ["currencies", "format"] });

/** O Intl usa espaços especiais (NBSP); normaliza para comparar com texto simples. */
const text = (value) => value.replace(/[  ]/g, " ");

describe("Format.parseAmount: aceita vírgula e ponto", () => {
  const cases = [
    ["100", 100],
    ["10,5", 10.5],
    ["10.5", 10.5],
    ["0,99", 0.99],
    ["1.234,56", 1234.56], // padrão brasileiro
    ["1,234.56", 1234.56], // padrão americano
    ["1.000", 1000], // ponto + 3 dígitos = milhar
    ["1.000.000", 1000000],
    ["1,000,000", 1000000], // separador repetido = milhar
    ["1.000.000,75", 1000000.75],
    [",5", 0.5],
    ["5,", 5],
    ["  42  ", 42],
  ];

  for (const [input, expected] of cases) {
    test(`"${input}" → ${expected}`, () => {
      assert.equal(Format.parseAmount(input), expected);
    });
  }

  test("campo vazio ou sem número → null", () => {
    for (const input of ["", "   ", ",", ".", "abc", ",."]) {
      assert.equal(Format.parseAmount(input), null, `entrada: "${input}"`);
    }
  });

  test("ignora letras e sinal de menos (nunca gera negativo)", () => {
    assert.equal(Format.parseAmount("-50"), 50);
    assert.equal(Format.parseAmount("R$ 12,30"), 12.3);
    assert.equal(Format.parseAmount("1e5"), 15);
  });

  test("o valor máximo é interpretado corretamente", () => {
    assert.equal(Format.parseAmount("999999999999"), Format.MAX_AMOUNT);
    assert.ok(Format.parseAmount("1000000000000") > Format.MAX_AMOUNT);
  });
});

describe("Format.sanitizeAmount: máscara do campo", () => {
  test("mantém só dígitos, vírgula e ponto", () => {
    assert.equal(Format.sanitizeAmount("-12a,5b"), "12,5");
    assert.equal(Format.sanitizeAmount("R$ 1.000,00"), "1.000,00");
    assert.equal(Format.sanitizeAmount("abc"), "");
  });

  test("limita o tamanho do texto", () => {
    const long = "9".repeat(50);
    assert.equal(Format.sanitizeAmount(long).length, Format.MAX_INPUT_LENGTH);
  });
});

describe("Format.currency: formato de cada moeda", () => {
  const cases = [
    [1234.5, "BRL", "R$ 1.234,50"],
    [1234.5, "USD", "$1,234.50"],
    [1234.5, "EUR", "1.234,50 €"],
    [1234.5, "GBP", "£1,234.50"],
    [1234567.89, "PYG", "Gs. 1.234.568"], // Guarani sem casas decimais
    [0, "BRL", "R$ 0,00"],
    [1, "BTC", "₿ 1.00"],
    [0.000123456789, "BTC", "₿ 0.00012346"], // até 8 casas
    [12345.6, "BTC", "₿ 12,345.60"],
  ];

  for (const [value, code, expected] of cases) {
    test(`${value} ${code} → ${expected}`, () => {
      assert.equal(text(Format.currency(value, code)), expected);
    });
  }

  test("valores muito pequenos não viram zero (ex.: 1 Guarani em Reais)", () => {
    assert.equal(text(Format.currency(0.000916, "BRL")), "R$ 0,000916");
    assert.equal(text(Format.currency(0.004, "USD")), "$0.004");
  });

  test("Guarani pequeno ainda mostra algo diferente de zero", () => {
    assert.notEqual(text(Format.currency(0.4, "PYG")), "Gs. 0");
  });
});

describe("Format: porcentagem e datas", () => {
  test("percent tem sinal e 2 casas", () => {
    assert.equal(text(Format.percent(0.0087)), "+0,87%");
    assert.equal(text(Format.percent(-0.012)), "-1,20%");
    assert.equal(text(Format.percent(0)), "0,00%");
  });

  test("dateTime no padrão brasileiro", () => {
    const timestamp = new Date(2026, 10, 20, 14, 32).getTime();
    assert.equal(text(Format.dateTime(timestamp)), "20/11/2026, 14:32");
  });

  test("shortDay e longDay usam a data local (sem pular dia pelo fuso)", () => {
    assert.equal(text(Format.shortDay("2026-11-19")), "19 de nov.");
    assert.equal(text(Format.longDay("2026-11-19")), "19 de nov. de 2026");
    assert.equal(text(Format.shortDay("2026-01-01")), "01 de jan.");
  });
});
