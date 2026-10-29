(() => {
  const installButton = document.querySelector('#install-app');
  let installPrompt = null;
  const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => {});
    }, { once: true });
  }

  if (!installButton || isInstalled()) return;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    installButton.classList.remove('hidden');
  });

  installButton.addEventListener('click', async () => {
    if (!installPrompt) return;
    installButton.disabled = true;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    installPrompt = null;
    installButton.classList.add('hidden');
    installButton.disabled = false;
    if (result.outcome === 'accepted') installButton.setAttribute('aria-label', 'FindIt installed');
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton.classList.add('hidden');
  });
})();
