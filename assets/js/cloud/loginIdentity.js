export const TECHNICAL_LOGIN_DOMAIN = 'users.tennis.polidorionline.it';

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;

export function normalizeUsername(value = '') {
  const username = String(value || '').trim().toLowerCase();

  if (!username) {
    throw new Error('Inserisci un nome utente.');
  }

  if (!USERNAME_RE.test(username)) {
    throw new Error(
      'Il nome utente deve avere 3–40 caratteri e può contenere solo lettere, numeri, punto, trattino e underscore.',
    );
  }

  return username;
}

export function isTechnicalLoginEmail(value = '') {
  const email = String(value || '').trim().toLowerCase();
  return email.endsWith(`@${TECHNICAL_LOGIN_DOMAIN}`);
}

export function emailFromLogin(value = '') {
  const login = String(value || '').trim().toLowerCase();
  if (!login) return '';
  if (login.includes('@')) return login;
  return `${normalizeUsername(login)}@${TECHNICAL_LOGIN_DOMAIN}`;
}

export function loginFromEmail(value = '') {
  const email = String(value || '').trim().toLowerCase();
  const suffix = `@${TECHNICAL_LOGIN_DOMAIN}`;

  if (email.endsWith(suffix)) {
    return email.slice(0, -suffix.length);
  }

  return email;
}
