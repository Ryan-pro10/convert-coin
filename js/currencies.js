/**
 * Catálogo de moedas suportadas pelo Coinvert.
 *
 * Cada entrada define como a moeda é exibida (nome, imagem, texto alternativo)
 * e formatada (locale e casas decimais). O código ISO (chave) é o mesmo
 * usado nos <option value="..."> do HTML e na AwesomeAPI.
 */
const CURRENCIES = {
  BRL: {
    name: "Real brasileiro",
    locale: "pt-BR",
    decimals: 2,
    img: "./img/brasil.png",
    alt: "Bandeira do Brasil",
  },
  USD: {
    name: "Dólar americano",
    locale: "en-US",
    decimals: 2,
    img: "./img/estados-unidos.png",
    alt: "Bandeira dos Estados Unidos",
  },
  EUR: {
    name: "Euro",
    locale: "de-DE",
    decimals: 2,
    img: "./img/euro.png",
    alt: "Moeda com o símbolo do Euro",
  },
  GBP: {
    name: "Libra esterlina",
    locale: "en-GB",
    decimals: 2,
    img: "./img/libra.png",
    alt: "Moeda com o símbolo da Libra esterlina",
  },
  BTC: {
    name: "Bitcoin",
    locale: "en-US",
    decimals: 8, // até 8 casas (1 satoshi)
    img: "./img/bitcoin.png",
    alt: "Logotipo do Bitcoin",
  },
  PYG: {
    name: "Guarani paraguaio",
    locale: "es-PY",
    decimals: 0, // o Guarani não usa centavos
    img: "./img/guarani.png",
    alt: "Moeda com o símbolo do Guarani paraguaio",
  },
};

/** Moeda base das cotações: todas as taxas são "1 unidade = X BRL". */
const BASE_CURRENCY = "BRL";
