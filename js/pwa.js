/**
 * PWA: registra o service worker e mostra o botão "Instalar app"
 * quando o navegador oferece a instalação (Chrome/Edge/Android).
 *
 * No iPhone não existe esse evento: lá a instalação é pelo menu
 * Compartilhar → "Adicionar à Tela de Início".
 */
(() => {
  // Service worker só funciona em http(s) — no file:// o app segue normal, sem offline.
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.warn("Service worker não registrado:", error);
      });
    });
  }

  const row = document.getElementById("install-row");
  const button = document.getElementById("install-button");
  let installPrompt = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // guarda o convite para abrir pelo nosso botão
    installPrompt = event;
    row.hidden = false;
  });

  button.addEventListener("click", async () => {
    if (!installPrompt) return;
    row.hidden = true;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
  });

  window.addEventListener("appinstalled", () => {
    row.hidden = true;
    installPrompt = null;
  });
})();
