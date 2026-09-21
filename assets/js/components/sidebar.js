import { modules } from '../data/schema.js';
import { APP_VERSION } from '../version.js';

export function renderSidebar(activeRoute) {
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
      ${activeRoute === 'dashboard' ? `<div class="brand-version">v${APP_VERSION}</div>` : ''}
    </div>
    <nav class="nav">
      <button class="nav-item ${activeRoute === 'dashboard' ? 'active' : ''}" data-route="dashboard">
        <span class="nav-icon">⌂</span>
        <span class="nav-label">Dashboard</span>
      </button>
      <button class="nav-item ${activeRoute === 'athlete' ? 'active' : ''}" data-route="athlete">
        <span class="nav-icon">♙</span>
        <span class="nav-label">Athlete profile</span>
      </button>
      <div class="nav-group-title">Player journey</div>
      ${items}
    </nav>
  `;
}
