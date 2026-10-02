import { modules } from '../data/schema.js?v=1.2.4';
import { APP_VERSION } from '../version.js?v=1.2.4';
import { getCurrentUserType } from '../cloud/accountAccess.js?v=1.2.4';

export function renderSidebar(activeRoute) {
  const contextualHome = ['athlete', 'parent', 'trainer'].includes(getCurrentUserType());
  const items = modules.map(m => `
    <button class="nav-item ${activeRoute === m.id ? 'active' : ''}" data-route="${m.id}">
      <span class="nav-icon">${m.icon}</span>
      <span class="nav-label">${m.number}. ${m.name}</span>
    </button>
  `).join('');

  return `
    <div class="brand">
      <h2 class="brand-title">Tennis Player OS</h2>
      <p class="brand-subtitle">One player. A complete journey.</p>
      ${activeRoute === 'dashboard' || activeRoute === 'home' ? `<div class="brand-version">v${APP_VERSION}</div>` : ''}
    </div>
    <nav class="nav">
      ${contextualHome ? `
        <button class="nav-item ${activeRoute === 'home' ? 'active' : ''}" data-route="home">
          <span class="nav-icon">⌂</span>
          <span class="nav-label">Home</span>
        </button>
        <button class="nav-item ${activeRoute === 'dashboard' ? 'active' : ''}" data-route="dashboard">
          <span class="nav-icon">◎</span>
          <span class="nav-label">Overview</span>
        </button>
      ` : `
        <button class="nav-item ${activeRoute === 'dashboard' ? 'active' : ''}" data-route="dashboard">
          <span class="nav-icon">⌂</span>
          <span class="nav-label">Dashboard</span>
        </button>
      `}
      <button class="nav-item ${activeRoute === 'athlete' ? 'active' : ''}" data-route="athlete">
        <span class="nav-icon">♙</span>
        <span class="nav-label">Athlete profile</span>
      </button>
      <div class="nav-group-title">Player journey</div>
      ${items}
    </nav>
  `;
}
