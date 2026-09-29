// Tennis Player OS — PWA bootstrap.
// Static app files and cloud data remain network-first.
// The service worker exists only to provide a clean offline fallback for navigation.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch (error) {
      console.warn('[TPOS] Service worker registration failed:', error);
    }
  });
}
