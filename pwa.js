(() => {
  'use strict';
  const installButton = document.querySelector('#install-app');
  let installPrompt = null;
  const isInstalled = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    navigator.standalone === true;

  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', async () => {
      try {
        const workerUrl = new URL('./service-worker.js', document.baseURI);
        const appScope = new URL('./', document.baseURI);
        await navigator.serviceWorker.register(workerUrl.href, {scope:appScope.pathname});
        await navigator.serviceWorker.ready;
        navigator.serviceWorker.controller?.postMessage({type:'FINDIT_SYNC_NOW'});
      } catch (error) {
        console.warn('FindIt offline support could not start:', error);
      }
    }, {once:true});
  }

  try {
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  } catch {}

  if (!installButton || isInstalled()) return;
  installButton.classList.remove('hidden');

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    installButton.classList.remove('hidden');
  });

  installButton.addEventListener('click', async () => {
    if (!installPrompt) {
      window.alert(
        'To install FindIt:\\n\\n' +
        'Android (Chrome): tap ⋮, then choose “Install app” or “Add to Home screen”.\\n\\n' +
        'iPhone (Safari): tap Share, then “Add to Home Screen”.'
      );
      return;
    }

    installButton.disabled = true;
    try {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') {
        installButton.classList.add('hidden');
        installButton.setAttribute('aria-label', 'FindIt installed');
      }
    } finally {
      installPrompt = null;
      installButton.disabled = false;
    }
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton.classList.add('hidden');
  });
})();
