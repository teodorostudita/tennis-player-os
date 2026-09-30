const form = document.getElementById('betaForm');
const formSuccess = document.getElementById('formSuccess');
const formError = document.getElementById('formError');
const betaSubmit = document.getElementById('betaSubmit');
const betaLang = document.getElementById('betaLang');
const betaProgramState = document.getElementById('betaProgramState');
const betaRemaining = document.getElementById('betaRemaining');
const betaAssigned = document.getElementById('betaAssigned');
const betaCapacity = document.getElementById('betaCapacity');
const betaProgress = document.getElementById('betaProgress');
const betaWaitlist = document.getElementById('betaWaitlist');

let betaIsFull = false;

function getCurrentLang() {
  return document.documentElement.lang === 'en' ? 'en' : 'it';
}

function updateBetaSubmitLabel() {
  if (!betaSubmit) return;
  const lang = getCurrentLang();
  if (betaIsFull) {
    betaSubmit.textContent = lang === 'en' ? 'Join the waitlist' : "Unisciti alla lista d'attesa";
  } else {
    betaSubmit.textContent = lang === 'en' ? 'Request your Beta account' : 'Richiedi il tuo account Beta';
  }
}

async function loadBetaStatus() {
  try {
    const response = await fetch('beta-status.php', {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('beta_status_failed');
    const data = await response.json();
    const capacity = Number.isFinite(Number(data.capacity)) ? Number(data.capacity) : 30;
    const active = Math.max(0, Number.isFinite(Number(data.active)) ? Number(data.active) : 0);
    const remaining = Math.max(0, Number.isFinite(Number(data.remaining)) ? Number(data.remaining) : capacity - active);
    betaIsFull = Boolean(data.full) || remaining <= 0;

    if (betaRemaining) betaRemaining.textContent = String(remaining);
    if (betaAssigned) betaAssigned.textContent = String(Math.min(active, capacity));
    if (betaCapacity) betaCapacity.textContent = String(capacity);
    if (betaProgress) {
      const pct = capacity > 0 ? Math.min(100, Math.max(0, (active / capacity) * 100)) : 100;
      betaProgress.style.setProperty('--beta-progress', pct.toFixed(1) + '%');
      betaProgress.setAttribute('aria-valuemax', String(capacity));
      betaProgress.setAttribute('aria-valuenow', String(Math.min(active, capacity)));
    }
    if (betaWaitlist) betaWaitlist.hidden = !betaIsFull;
    if (betaProgramState) betaProgramState.value = betaIsFull ? 'waitlist' : 'open';
    updateBetaSubmitLabel();
  } catch (err) {
    // Graceful fallback: the public offer remains usable even if the status endpoint is temporarily unavailable.
    betaIsFull = false;
    if (betaProgramState) betaProgramState.value = 'open';
    updateBetaSubmitLabel();
  }
}

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (formSuccess) formSuccess.style.display = 'none';
    if (formError) formError.style.display = 'none';

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const currentLang = getCurrentLang();
    if (betaLang) betaLang.value = currentLang;
    if (betaProgramState) betaProgramState.value = betaIsFull ? 'waitlist' : 'open';

    const originalText = betaSubmit ? betaSubmit.textContent : '';
    if (betaSubmit) {
      betaSubmit.disabled = true;
      betaSubmit.textContent = currentLang === 'en' ? 'Sending…' : 'Invio…';
    }

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json' }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'send_failed');

      form.reset();
      if (betaLang) betaLang.value = currentLang;
      if (betaProgramState) betaProgramState.value = betaIsFull ? 'waitlist' : 'open';
      if (formSuccess) formSuccess.style.display = 'block';
    } catch (err) {
      if (formError) formError.style.display = 'block';
    } finally {
      if (betaSubmit) {
        betaSubmit.disabled = false;
        betaSubmit.textContent = originalText;
        updateBetaSubmitLabel();
      }
    }
  });
}

loadBetaStatus();

const previewDialog = document.getElementById('previewDialog');
const openPreview = document.getElementById('openPreview');
const closePreview = document.getElementById('closePreview');

if (openPreview && previewDialog) {
  openPreview.addEventListener('click', () => {
    if (typeof previewDialog.showModal === 'function') previewDialog.showModal();
  });
}
if (closePreview && previewDialog) {
  closePreview.addEventListener('click', () => previewDialog.close());
  previewDialog.addEventListener('click', (e) => {
    const rect = previewDialog.getBoundingClientRect();
    const inDialog = rect.top <= e.clientY && e.clientY <= rect.top + rect.height && rect.left <= e.clientX && e.clientX <= rect.left + rect.width;
    if (!inDialog) previewDialog.close();
  });
}

const en = {
  navProduct:'Product',navFeatures:'Modules',navTeam:'Team',navBeta:'Beta',signIn:'Sign in',joinBeta:'Join the Beta',
  eyebrow:'THE PERSONAL OPERATING SYSTEM FOR THE TENNIS PLAYER',hero1:'One Player.',hero2:'A Complete Journey.',heroLead:'Training, development, competition, health, recovery, equipment, opponents, costs and the whole team — connected around one athlete.',joinFounding:'Join the Founding Beta',explore:'Explore the 12 modules ↓',betaMicro:'Founding Beta · Limited early access · Web app',
  previewDash:'Dashboard',previewUsers:'Users & Access',previewAthlete:'Athlete',previewSmall:'ATHLETE AT THE CENTER',previewTitle:'Player Profile',previewBody:'One record connects technical and tactical development, athletic preparation, on-court work, health, nutrition, recovery, equipment, costs and calendar.',previewInspired:'Real screenshot of the current dashboard',previewOpen:'Open fullscreen',previewKicker:'PRODUCT PREVIEW',previewDialogTitle:'A real screenshot of the dashboard.',previewDialogBody:'This hero uses a real Tennis Player OS screen with a demo athlete profile, so visitors can understand the actual interface more clearly.',
  metric1:'RANKING',metric2:'CLUB',metric3:'COACH',metric4:'GOAL',
  problemKicker:'THE PROBLEM',problemTitle:'A tennis player is one person.<br>Why is their journey scattered everywhere?',problemBody:'Calendars, coaching notes, tournaments, athletic preparation, recovery, equipment, scouting, health documents and costs often live in different places. Tennis Player OS grew from the practical need to manage a complex competitive journey without losing information or connections: one continuous record built around the athlete.',oneAthlete:'ONE ATHLETE',oneRecord:'One connected record.',oneRecordBody:'The athlete stays at the centre. Everything else connects.',
  teamKicker:'ONE ATHLETE. A WHOLE TEAM.',teamTitle:'The right information, for the right people.',teamBody:'Parents and professionals work on the same journey through differentiated roles and permissions, without multiplying archives and versions of the data.',recordOwner:'The record at the centre',parent:'Parent',coach:'Coach',trainer:'Athletic<br>Trainer',physio:'Physiotherapist',nutritionist:'Nutritionist',mentalCoach:'Mental<br>Coach',perm1:'Everyone sees what they need.',perm2:'Everyone contributes where they should.',perm3:'The athlete’s history stays together.',
  systemKicker:'THE 12 MODULES',systemTitle:'The athlete’s whole journey,<br>in one system.',systemBody:'The website mirrors the app: what you discover here is what you find in the dashboard.',moduleOpen:'Open page →',
  m1:'Planning, logistics, tournaments, school, appointments, travel and the athlete’s daily life.',m2:'Athletic preparation, load, strength, power, speed, agility, conditioning and monitoring.',m3:'Technique, tactics, development goals, assessments, progress, video and tests.',m4:'Exercise library, patterns and sessions connected to development goals.',m5:'Results, statistics, debriefs, performance and match analysis.',m6:'Scouting, H2H history, patterns, video, notes and pre-match preparation.',m7:'Rackets, strings, tensions, shoes, setups, playing hours and configuration history.',m8:'Physical status, injuries, pain, physiotherapy, screening, monitoring and documents.',m9:'Nutrition, hydration, sleep, fatigue, soreness, rest and readiness.',m10:'Mental goals, routines, focus, self-talk, emotional management and psychological work.',m11:'Perception, visual training, reaction time, neuro-training, protocols and measurements.',m12:'Costs, payments, season budget, sponsors, tournament cost and sustainability.',
  connectKicker:'THE DIFFERENCE',connectTitle:'Data is useful.<br><span class="accent">Connected data is powerful.</span>',connectBody:'Tennis Player OS is not a collection of twelve digital notebooks. Its modules talk to one another, so what happens in one part of the journey can be understood in the context of everything else.',injuryTitle:"An injury isn’t just an injury.",injuryBody:'Connect pain and limitations with athletic load, matches, recovery and equipment history.',goalTitle:"A technical goal isn’t just a note.",goalBody:'Connect development themes, drills, sessions, tests and what actually happens in matches.',racketTitle:"A racket isn’t just a racket.",racketBody:'Track setup, string tension, playing hours, comfort and performance over time.',
  roadKicker:'ROADMAP',roadTitle:'First, solid data.<br><em>Then, smarter data.</em>',roadBody:'AI-assisted analysis, automatic correlations and intelligent reports are a future development direction, not a feature promised in the current Beta. The goal is to get there starting from reliable, structured, user-controlled data.',today:'TODAY',todayBody:'Athlete record, connected modules, roles and operational tools.',future:'ROADMAP',futureBody:'AI-assisted insights, correlations and automated reports.',
  betaTitle:'30 accounts. Full access, free for the entire Beta.',betaBody:'We are opening Tennis Player OS to a first group of 30 Beta Owners. Each account has full access to its own workspace and to every module available during the Beta.',betaAvailability:'FOUNDING BETA AVAILABILITY',betaSlotsLeft:'spots available',betaAssignedLabel:'assigned',betaWaitlist:'All 30 places have been assigned. You can still leave your request to join the waitlist.',bfAccess:'Access',bfAccessBody:'All currently available Beta modules',bfDuration:'Duration',bfDurationBody:'Free until the end of the Beta',bfOwner:'Profile',bfOwnerBody:'Beta Owner: full control of your own workspace',bfUpdates:'Updates',bfUpdatesBody:'Automatically included throughout the Beta',bfRequests:'Feature requests',bfRequestsBody:'Propose functions and changes for the roadmap',bfAfter:'After the Beta',bfAfterBody:'No automatic renewal and no card required',featureRequestTitle:'Need something Tennis Player OS does not do yet?',featureRequestBody:'During the Beta you can propose new functions or changes. Requests are evaluated according to general usefulness, feasibility and development priority.',formKicker:'REQUEST YOUR ACCOUNT',formTitle:'Founding Beta Owner',name:'Name',profileInterest:'I am interested in TPOS as…',rParent:'Parent / family',rPlayer:'Player',rAcademy:'Academy / Club',rOther:'Other',betaMessage:'What interests you most? <em>Optional</em>',betaMessagePlaceholder:'Tell us how you expect to use TPOS or a feature you would like to see during the Beta.',request:'Request your Beta account',formNote:'No payment and no card required. Access is activated manually while the 30 Founding Beta places remain available.',success:'Request sent. We will contact you as soon as possible to activate your Founding Beta account.',formError:'We could not send your request. Please try again shortly or contact us directly.',betaMeans:'Beta means beta.',betaHonesty:'Features may change, some integrations are still being developed and bugs can happen. Data remains under the user’s control.',privacy:'Privacy',terms:'Terms'
};

const it = {};
document.querySelectorAll('[data-i18n]').forEach(el => it[el.dataset.i18n] = el.innerHTML);
document.querySelectorAll('[data-i18n-placeholder]').forEach(el => it[el.dataset.i18nPlaceholder] = el.getAttribute('placeholder') || '');

function setLang(lang) {
  document.documentElement.lang = lang;
  localStorage.setItem('tpos-lang', lang);
  if (betaLang) betaLang.value = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.innerHTML = (lang === 'en' ? en[key] : it[key]) ?? el.innerHTML;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (lang === 'en' && en[key]) el.setAttribute('placeholder', en[key]);
    if (lang === 'it' && it[key]) el.setAttribute('placeholder', it[key]);
  });
  document.querySelectorAll('.language').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === lang));
  updateBetaSubmitLabel();
}

document.querySelectorAll('.language').forEach(btn => btn.addEventListener('click', () => setLang(btn.dataset.lang)));
setLang(localStorage.getItem('tpos-lang') || 'it');
