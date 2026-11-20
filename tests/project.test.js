/**
 * Checagens de integridade do projeto (sem navegador):
 * arquivos referenciados existem, o service worker conhece todos os arquivos
 * do app (senão eles não funcionam offline) e o manifest está completo.
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { ROOT, loadApp } = require("./helpers/load-app");

const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const exists = (file) => fs.existsSync(path.join(ROOT, file));
const normalize = (ref) => ref.replace(/^\.\//, "").split(/[?#]/)[0];

const html = read("index.html");

/** Lê a lista SHELL do sw.js executando o arquivo com um `self` falso. */
function readShell() {
  const context = vm.createContext({ self: { addEventListener() {}, location: { origin: "https://exemplo.test" } } });
  vm.runInContext(read("sw.js"), context);
  // Array.from: traz a lista para o "realm" do teste (senão deepEqual estranha o prototype).
  return Array.from(vm.runInContext("SHELL", context), normalize).filter((file) => file !== "");
}

const shell = readShell();

describe("index.html", () => {
  test("todo arquivo local referenciado (src/href) existe", () => {
    const refs = [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => normalize(m[1]));
    assert.ok(refs.length > 10, "deveria encontrar as referências do HTML");
    const missing = refs.filter((ref) => ref && !exists(ref));
    assert.deepEqual(missing, []);
  });

  test("todo script de js/ é carregado pela página", () => {
    for (const file of fs.readdirSync(path.join(ROOT, "js"))) {
      assert.ok(html.includes(`src="./js/${file}"`), `index.html não carrega js/${file}`);
    }
  });

  test("os selects oferecem exatamente as moedas do catálogo", () => {
    const { CURRENCIES } = loadApp({ files: ["currencies"] });
    const codes = Object.keys(CURRENCIES).sort();
    for (const id of ["from-currency", "to-currency"]) {
      const select = html.match(new RegExp(`<select id="${id}"[\\s\\S]*?</select>`))[0];
      const values = [...select.matchAll(/value="([A-Z]{3})"/g)].map((m) => m[1]).sort();
      assert.deepEqual(values, codes, `#${id}`);
    }
  });

  test("SEO e acessibilidade básicos", () => {
    assert.match(html, /<html lang="pt-BR">/);
    assert.match(html, /<meta name="description"/);
    assert.match(html, /<meta property="og:image"/);
    assert.match(html, /<link rel="manifest"/);
    const imgsWithoutAlt = [...html.matchAll(/<img\b(?![^>]*\balt=)[^>]*>/g)];
    assert.equal(imgsWithoutAlt.length, 0, "toda <img> precisa de alt");
  });
});

describe("imagens e catálogo de moedas", () => {
  test("nenhum arquivo de imagem com espaço no nome", () => {
    const withSpaces = fs.readdirSync(path.join(ROOT, "img")).filter((name) => /\s/.test(name));
    assert.deepEqual(withSpaces, []);
  });

  test("cada moeda tem imagem existente e texto alternativo", () => {
    const { CURRENCIES } = loadApp({ files: ["currencies"] });
    for (const [code, currency] of Object.entries(CURRENCIES)) {
      assert.ok(exists(normalize(currency.img)), `${code}: imagem ${currency.img} não existe`);
      assert.ok(currency.alt && currency.alt.length > 5, `${code}: alt vazio`);
    }
  });
});

describe("PWA (service worker e manifest)", () => {
  test("todo arquivo da lista SHELL existe (senão o service worker não instala)", () => {
    const missing = shell.filter((file) => !exists(file));
    assert.deepEqual(missing, []);
  });

  test("SHELL inclui todos os scripts, o CSS e as imagens das moedas", () => {
    const { CURRENCIES } = loadApp({ files: ["currencies"] });
    const required = [
      "index.html",
      "styles.css",
      "manifest.webmanifest",
      ...fs.readdirSync(path.join(ROOT, "js")).map((file) => `js/${file}`),
      ...Object.values(CURRENCIES).map((currency) => normalize(currency.img)),
    ];
    const missing = required.filter((file) => !shell.includes(file));
    assert.deepEqual(missing, [], "adicione ao SHELL do sw.js (e mude VERSION)");
  });

  test("manifest válido com ícones 192, 512 e maskable existentes", () => {
    const manifest = JSON.parse(read("manifest.webmanifest"));
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.start_url, "./");

    const sizes = manifest.icons.map((icon) => icon.sizes);
    assert.ok(sizes.includes("192x192"));
    assert.ok(sizes.includes("512x512"));
    assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
    for (const icon of manifest.icons) {
      assert.ok(exists(icon.src), `ícone ${icon.src} não existe`);
    }
  });
});
