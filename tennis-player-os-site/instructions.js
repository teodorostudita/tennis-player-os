(() => {
  const STORAGE_KEY = 'tpos-guide-lang';
  const buttons = [...document.querySelectorAll('[data-guide-lang]')];

  function setLanguage(lang) {
    const next = lang === 'en' ? 'en' : 'it';
    document.documentElement.lang = next;
    buttons.forEach(button => {
      button.classList.toggle('active', button.dataset.guideLang === next);
    });
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
  }

  buttons.forEach(button => {
    button.addEventListener('click', () => setLanguage(button.dataset.guideLang));
  });

  let initial = 'it';
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('tpos-lang');
    if (saved === 'en') initial = 'en';
  } catch (_) {}

  setLanguage(initial);
})();
