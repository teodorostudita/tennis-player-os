const form = document.getElementById('betaForm');
if (form) {
  form.addEventListener('submit', e => {
    e.preventDefault();
    document.getElementById('formSuccess').style.display = 'block';
  });
}

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
  betaTitle:'Help Tennis Player OS grow from the court up.',betaBody:'We are opening the platform to a small first group of competitive players, families and coaches. The core system is already operational; the product continues to evolve.',bp1:'Platform access',bp2:'Direct influence on development',bp3:'Founder benefits at launch',name:'Name',role:'I am a…',rParent:'Parent',rPlayer:'Player',rAcademy:'Academy / Club',rOther:'Other',request:'Request Beta Access',formNote:'No payment today. We will contact you about access and Founding Beta terms.',success:'Thank you. Before the final launch, this form will be connected to the selected contact channel.',betaMeans:'Beta means beta.',betaHonesty:'Features may change, some integrations are still being developed and bugs can happen. Data remains under the user’s control.',privacy:'Privacy',terms:'Terms'
};

const it = {};
document.querySelectorAll('[data-i18n]').forEach(el => it[el.dataset.i18n] = el.innerHTML);

function setLang(lang) {
  document.documentElement.lang = lang;
  localStorage.setItem('tpos-lang', lang);
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.innerHTML = (lang === 'en' ? en[key] : it[key]) ?? el.innerHTML;
  });
  document.querySelectorAll('.language').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === lang));
}

document.querySelectorAll('.language').forEach(btn => btn.addEventListener('click', () => setLang(btn.dataset.lang)));
setLang(localStorage.getItem('tpos-lang') || 'it');
