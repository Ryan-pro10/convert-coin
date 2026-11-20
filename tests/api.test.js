const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, createStorage, fakeFetch, plain, lastQuotes, dailyQuotes, dayAgo } = require("./helpers/load-app");

const RATES = { BRL: 1, USD: 5, EUR: 6, GBP: 7, BTC: 400000, PYG: 0.0008 };
const CACHE_KEY = "coinvert:rates:v1";

describe("RatesApi.convert: conversão entre quaisquer pares", () => {
  const { RatesApi } = loadApp();

  test("mesma moeda devolve o próprio valor", () => {
    assert.equal(RatesApi.convert(123.45, "USD", "USD", RATES), 123.45);
  });

  test("de/para Real usa a cotação direta", () => {
    assert.equal(RatesApi.convert(100, "BRL", "USD", RATES), 20);
    assert.equal(RatesApi.convert(20, "USD", "BRL", RATES), 100);
  });

  test("pares cruzados passam pelo Real", () => {
    assert.equal(RatesApi.convert(60, "USD", "EUR", RATES), 50); // 60 × 5 ÷ 6
    assert.equal(RatesApi.convert(1, "BTC", "PYG", RATES), 500000000); // 400000 ÷ 0,0008
  });

  test("ida e volta devolve o valor original", () => {
    const there = RatesApi.convert(250, "GBP", "BTC", RATES);
    const back = RatesApi.convert(there, "BTC", "GBP", RATES);
    assert.ok(Math.abs(back - 250) < 1e-9);
  });
});

describe("RatesApi.pairChange: variação do dia do par", () => {
  const { RatesApi } = loadApp();
  const changes = { BRL: 0, USD: 0.01, EUR: -0.02 };

  test("moeda contra Real usa a variação direta", () => {
    assert.ok(Math.abs(RatesApi.pairChange("USD", "BRL", changes) - 0.01) < 1e-12);
  });

  test("Real contra moeda é o inverso", () => {
    assert.ok(Math.abs(RatesApi.pairChange("BRL", "USD", changes) - (1 / 1.01 - 1)) < 1e-12);
  });

  test("par cruzado combina as duas variações", () => {
    assert.ok(Math.abs(RatesApi.pairChange("USD", "EUR", changes) - (1.01 / 0.98 - 1)) < 1e-12);
  });

  test("sem dados ou mesma moeda → null", () => {
    assert.equal(RatesApi.pairChange("USD", "USD", changes), null);
    assert.equal(RatesApi.pairChange("USD", "GBP", changes), null);
    assert.equal(RatesApi.pairChange("USD", "EUR", undefined), null);
  });
});

describe("RatesApi.getRates: API e cache", () => {
  test("busca as 5 moedas numa chamada e salva no cache", async () => {
    const fetch = fakeFetch({ "/last/": lastQuotes({ pct: { USD: 0.87 } }) });
    const app = loadApp({ fetch });

    const result = await app.RatesApi.getRates();

    assert.equal(result.source, "api");
    assert.deepEqual(plain(result.rates), RATES);
    assert.ok(Math.abs(result.changes.USD - 0.0087) < 1e-12);
    assert.equal(result.updatedAt, 1795144308 * 1000);

    assert.equal(fetch.calls.length, 1);
    for (const pair of ["USD-BRL", "EUR-BRL", "GBP-BRL", "BTC-BRL", "PYG-BRL"]) {
      assert.ok(fetch.calls[0].includes(pair), `URL deveria pedir ${pair}`);
    }
    assert.ok(app.localStorage.getItem(CACHE_KEY), "deveria salvar no localStorage");
  });

  test("API fora do ar + cache salvo → usa o cache (source = cache)", async () => {
    const storage = createStorage({ [CACHE_KEY]: JSON.stringify({ rates: RATES, updatedAt: 123 }) });
    const app = loadApp({ storage, fetch: fakeFetch({ "/last/": new Error("offline") }) });

    const result = await app.RatesApi.getRates();

    assert.equal(result.source, "cache");
    assert.equal(result.updatedAt, 123);
    assert.deepEqual(plain(result.rates), RATES);
  });

  test("API fora do ar e sem cache → erro", async () => {
    const app = loadApp({ fetch: fakeFetch({ "/last/": new Error("offline") }) });
    await assert.rejects(app.RatesApi.getRates(), /offline/);
  });

  test("resposta com cotação inválida não é aceita", async () => {
    const app = loadApp({ fetch: fakeFetch({ "/last/": lastQuotes({ USD: 0 }) }) });
    await assert.rejects(app.RatesApi.getRates(), /Cotação inválida para USD/);
  });

  test("resposta incompleta (sem uma moeda) não é aceita", async () => {
    const quotes = lastQuotes();
    delete quotes.PYGBRL;
    const app = loadApp({ fetch: fakeFetch({ "/last/": quotes }) });
    await assert.rejects(app.RatesApi.getRates(), /PYG/);
  });

  test("loadCache ignora cache corrompido ou incompleto", () => {
    const broken = loadApp({ storage: createStorage({ [CACHE_KEY]: "{não é json" }) });
    assert.equal(broken.RatesApi.loadCache(), null);

    const incomplete = loadApp({
      storage: createStorage({ [CACHE_KEY]: JSON.stringify({ rates: { BRL: 1, USD: 5 }, updatedAt: 1 }) }),
    });
    assert.equal(incomplete.RatesApi.loadCache(), null);
  });
});

describe("RatesApi.getPairHistory: histórico do gráfico", () => {
  test("mesma moeda → sem pontos e sem requisição", async () => {
    const fetch = fakeFetch({});
    const app = loadApp({ fetch });
    const result = await app.RatesApi.getPairHistory("USD", "USD", 30);
    assert.deepEqual(plain(result.points), []);
    assert.equal(fetch.calls.length, 0);
  });

  test("moeda → Real: pontos em ordem cronológica, só dentro do período", async () => {
    const fetch = fakeFetch({ "/daily/USD-BRL/": dailyQuotes([[0, 5.9], [1, 5.8], [2, 5.7], [40, 4.0]]) });
    const app = loadApp({ fetch });

    const { points, stale } = await app.RatesApi.getPairHistory("USD", "BRL", 30);

    assert.equal(stale, false);
    assert.deepEqual(plain(points), [
      { day: dayAgo(2), v: 5.7 },
      { day: dayAgo(1), v: 5.8 },
      { day: dayAgo(0), v: 5.9 },
    ]);
    assert.ok(fetch.calls[0].includes("/daily/USD-BRL/100"));
  });

  test("Real → moeda inverte os valores", async () => {
    const app = loadApp({ fetch: fakeFetch({ "/daily/USD-BRL/": dailyQuotes([[0, 5], [1, 4]]) }) });
    const { points } = await app.RatesApi.getPairHistory("BRL", "USD", 30);
    assert.deepEqual(plain(points).map((p) => p.v), [0.25, 0.2]);
  });

  test("mantém um ponto por dia (o mais recente)", async () => {
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    const ts = (ms) => String(Math.floor(ms / 1000));
    const data = [
      { bid: "5.95", timestamp: ts(noon.getTime() + 60 * 60 * 1000) }, // hoje 13h
      { bid: "5.90", timestamp: ts(noon.getTime()) }, // hoje 12h
      { bid: "5.80", timestamp: ts(noon.getTime() - 24 * 60 * 60 * 1000) }, // ontem
    ];
    const app = loadApp({ fetch: fakeFetch({ "/daily/USD-BRL/": data }) });

    const { points } = await app.RatesApi.getPairHistory("USD", "BRL", 30);

    assert.deepEqual(plain(points), [
      { day: dayAgo(1), v: 5.8 },
      { day: dayAgo(0), v: 5.95 },
    ]);
  });

  test("par cruzado repete o último valor nos dias sem cotação (fim de semana)", async () => {
    // BTC tem os dias 0, 1, 2 e 3; o Dólar não tem os dias 1 e 2.
    const app = loadApp({
      fetch: fakeFetch({
        "/daily/BTC-BRL/": dailyQuotes([[0, 600], [1, 550], [2, 500], [3, 450]]),
        "/daily/USD-BRL/": dailyQuotes([[0, 6], [3, 5]]),
      }),
    });

    const { points } = await app.RatesApi.getPairHistory("BTC", "USD", 30);

    assert.deepEqual(plain(points), [
      { day: dayAgo(3), v: 90 }, // 450 ÷ 5
      { day: dayAgo(2), v: 100 }, // 500 ÷ 5 (Dólar repetido)
      { day: dayAgo(1), v: 110 }, // 550 ÷ 5 (Dólar repetido)
      { day: dayAgo(0), v: 100 }, // 600 ÷ 6
    ]);
  });

  test("reaproveita o histórico em cache (não repete a requisição)", async () => {
    const fetch = fakeFetch({ "/daily/USD-BRL/": dailyQuotes([[0, 5], [1, 4]]) });
    const app = loadApp({ fetch });

    await app.RatesApi.getPairHistory("USD", "BRL", 30);
    await app.RatesApi.getPairHistory("BRL", "USD", 7);

    assert.equal(fetch.calls.length, 1);
  });

  test("API fora do ar + histórico salvo vencido → usa o salvo e marca stale", async () => {
    const old = {
      savedAt: Date.now() - 2 * 60 * 60 * 1000, // 2h atrás (cache vale 1h)
      points: [
        { day: dayAgo(1), t: 0, v: 4 },
        { day: dayAgo(0), t: 1, v: 5 },
      ],
    };
    const storage = createStorage({ "coinvert:history:v1:USD": JSON.stringify(old) });
    const app = loadApp({ storage, fetch: fakeFetch({ "/daily/": new Error("offline") }) });

    const { points, stale } = await app.RatesApi.getPairHistory("USD", "BRL", 30);

    assert.equal(stale, true);
    assert.deepEqual(plain(points).map((p) => p.v), [4, 5]);
  });

  test("API fora do ar e sem histórico salvo → erro", async () => {
    const app = loadApp({ fetch: fakeFetch({ "/daily/": new Error("offline") }) });
    await assert.rejects(app.RatesApi.getPairHistory("USD", "BRL", 30), /offline/);
  });
});
