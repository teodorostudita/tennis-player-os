function currentRoute() {
  return location.hash.replace(/^#\/?/, '') || 'dashboard';
}

const SHOWCASE_ROUTES = new Set([
  'calendar',
  'training',
  'equipment',
  'development',
  'drills',
  'economics',
  'health',
]);

function applyProductPolishRoute() {
  const route = currentRoute();
  document.body.dataset.tposRoute = route;
  document.body.classList.toggle(
    'tpos-showcase-route',
    SHOWCASE_ROUTES.has(route),
  );
}

applyProductPolishRoute();
window.addEventListener('hashchange', applyProductPolishRoute);
