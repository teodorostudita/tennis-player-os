import { requireAuthenticatedSession, mountAuthControls } from './cloud/auth.js';

const session = await requireAuthenticatedSession();

if (session) {
  await import('./app.js');
  mountAuthControls(session.user);
}
