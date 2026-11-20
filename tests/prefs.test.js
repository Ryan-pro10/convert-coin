const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, createStorage, plain } = require("./helpers/load-app");

const DEFAULTS = { from: "BRL", to: "USD", amount: "100" };
const KEY = "coinvert:prefs:v1";
const BASE = "https://exemplo.test/convert-coin/";

describe("Prefs.load: de onde vem a seleção inicial", () => {
  test("sem nada salvo → padrões", () => {
    const { Prefs } = loadApp();
    assert.deepEqual(plain(Prefs.load(DEFAULTS)), DEFAULTS);
  });

  test("última visita (localStorage) substitui os padrões", () => {
    const storage = createStorage({ [KEY]: JSON.stringify({ from: "EUR", to: "GBP", amount: "50" }) });
    const { Prefs } = loadApp({ storage });
    assert.deepEqual(plain(Prefs.load(DEFAULTS)), { from: "EUR", to: "GBP", amount: "50" });
  });

  test("link compartilhado (URL) tem prioridade sobre o salvo", () => {
    const storage = createStorage({ [KEY]: JSON.stringify({ from: "EUR", to: "GBP", amount: "50" }) });
    const { Prefs } = loadApp({ storage, url: `${BASE}?de=BTC&para=PYG&valor=0,5` });
    assert.deepEqual(plain(Prefs.load(DEFAULTS)), { from: "BTC", to: "PYG", amount: "0,5" });
  });

  test("aceita código em minúsculas na URL", () => {
    const { Prefs } = loadApp({ url: `${BASE}?de=usd&para=eur` });
    const prefs = Prefs.load(DEFAULTS);
    assert.equal(prefs.from, "USD");
    assert.equal(prefs.to, "EUR");
  });

  test("ignora moeda inexistente e valor sem número", () => {
    const { Prefs } = loadApp({ url: `${BASE}?de=xyz&para=BTC&valor=abc` });
    assert.deepEqual(plain(Prefs.load(DEFAULTS)), { from: "BRL", to: "BTC", amount: "100" });
  });

  test("limpa letras e sinal de menos do valor da URL", () => {
    const { Prefs } = loadApp({ url: `${BASE}?valor=-12a` });
    assert.equal(Prefs.load(DEFAULTS).amount, "12");
  });

  test("localStorage corrompido não quebra o app", () => {
    const { Prefs } = loadApp({ storage: createStorage({ [KEY]: "{oops" }) });
    assert.deepEqual(plain(Prefs.load(DEFAULTS)), DEFAULTS);
  });

  test("ignora chaves estranhas no salvo (ex.: __proto__, toString)", () => {
    const storage = createStorage({ [KEY]: JSON.stringify({ from: "toString", to: "__proto__" }) });
    const { Prefs } = loadApp({ storage });
    assert.deepEqual(plain(Prefs.load(DEFAULTS)), DEFAULTS);
  });
});

describe("Prefs.save: localStorage + URL", () => {
  test("salva no navegador e atualiza a URL sem criar histórico (replace)", () => {
    const app = loadApp();
    app.Prefs.save({ from: "USD", to: "EUR", amount: "250" });

    assert.deepEqual(JSON.parse(app.localStorage.getItem(KEY)), { from: "USD", to: "EUR", amount: "250" });
    assert.equal(app.historyCalls.length, 1);
    assert.equal(app.historyCalls[0].type, "replace");
    assert.equal(app.location.search, "?de=USD&para=EUR&valor=250");
  });

  test("push = true cria entrada no histórico (para o botão voltar)", () => {
    const app = loadApp();
    app.Prefs.save({ from: "USD", to: "EUR", amount: "1" }, { push: true });
    assert.equal(app.historyCalls[0].type, "push");
  });

  test("não mexe no histórico se a URL não mudou", () => {
    const app = loadApp({ url: `${BASE}?de=USD&para=EUR&valor=1` });
    app.Prefs.save({ from: "USD", to: "EUR", amount: "1" });
    assert.equal(app.historyCalls.length, 0);
  });

  test("campo vazio: não salva o valor nem coloca na URL", () => {
    const app = loadApp();
    app.Prefs.save({ from: "USD", to: "EUR", amount: "" });

    assert.deepEqual(JSON.parse(app.localStorage.getItem(KEY)), { from: "USD", to: "EUR" });
    assert.equal(app.location.search, "?de=USD&para=EUR");
  });

  test("buildUrl mantém o caminho do GitHub Pages e remove o #", () => {
    const { Prefs } = loadApp({ url: `${BASE}?x=1#topo` });
    assert.equal(
      Prefs.buildUrl({ from: "BRL", to: "USD", amount: "1.234,56" }),
      `${BASE}?de=BRL&para=USD&valor=1.234%2C56`
    );
  });
});
