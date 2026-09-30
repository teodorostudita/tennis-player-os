// Tennis Player OS — PWA bootstrap v1.0.19.
// The service worker provides only an offline navigation fallback and also
// prevents mixed-release JS/CSS after an update.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {
        scope: './',
        updateViaCache: 'none',
      });

      // Ask the browser to check immediately instead of waiting for its
      // normal service-worker update interval.
      await registration.update();
    } catch (error) {
      console.warn('[TPOS] Service worker registration/update failed:', error);
    }
  });
}
