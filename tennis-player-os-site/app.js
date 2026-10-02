
const defaultSnapshots = new Map();
document.querySelectorAll('[data-i18n]').forEach(el => defaultSnapshots.set(el, el.innerHTML));
document.querySelectorAll('[data-i18n-placeholder]').forEach(el => defaultSnapshots.set(el, el.getAttribute('placeholder') || ''));
const en = {
  navProduct:'Product',navFeatures:'Modules',navRoles:'Profiles',navBeta:'Beta',signIn:'Sign in',joinBeta:'Join the Beta',
  eyebrow:'THE PERSONAL OPERATING SYSTEM FOR TENNIS',hero1:'One athlete.',hero2:'One complete journey.',heroLead:'Training, development, competition, health, recovery, equipment, opponents, costs and the whole team — connected around a single athlete.',joinFounding:'Join the Founding Beta',explore:'Explore the 12 modules ↓',betaMicro:'Founding Beta · Limited early access · Web app',heroTag1:'12 connected modules',heroTag2:'Role-based dashboards',heroTag3:'One athlete record',
  previewInspired:'Real product preview',previewFloat:'Desktop dashboard + mobile home',previewOpen:'Open preview',
  problemKicker:'WHY TPOS',problemTitle:'One athlete profile.<br>The whole journey stays connected.',problemBody:'TPOS was created to keep together what competitive tennis tends to split apart: planning, on-court work, health, recovery, equipment, competition, costs and team collaboration. Not twelve separate archives, but one system built around the athlete.',prodCard1Title:'One athlete record',prodCard1Body:"The athlete's story stays in the same environment: no scattered copies and no lost hand-offs.",prodCard2Title:'12 modules, one logic',prodCard2Body:'Calendar, athletics, development, matches, health, recovery, equipment and economics all speak to each other.',prodCard3Title:'One shared context for the whole team',prodCard3Body:'Parent, coach and professionals work on the same journey with different access rights, without losing the big picture.',oneAthlete:'ONE ATHLETE',oneRecord:'One connected record.',oneRecordBody:'The athlete stays at the center. Everything else connects around it.',
  teamKicker:'ONE ATHLETE. ONE ENTIRE TEAM.',teamTitle:'The right information, to the right people.',teamBody:'Parents and professionals work on the same journey through differentiated access and permissions, without multiplying files and data versions.',perm1:'Each person sees what they need.',perm2:'Each person contributes where they should.',perm3:'The athlete history stays unified.',recordOwner:'The record at the center',parent:'Parent',coach:'Coach',trainer:'Athletic<br>trainer',physio:'Physiotherapist',nutritionist:'Nutritionist',mentalCoach:'Mental<br>coach',
  systemKicker:'THE 12 MODULES',systemTitle:'The whole athlete journey,<br>in one system.',systemBody:'The site structure mirrors the app: what you discover here is what you find again in the dashboard.',moduleOpen:'Open page →',m1:'Planning, logistics, tournaments, school, visits, trips and the athlete daily life.',m2:'Athletic preparation, load, strength, power, speed, agility, conditioning and monitoring.',m3:'Technique, tactics, development goals, evaluations, progress, video and testing.',m4:'Drill library, patterns and sessions linked to development goals.',m5:'Results, statistics, debrief, performance and match analysis.',m6:'Scouting, H2H history, patterns, video, notes and pre-match preparation.',m7:'Rackets, strings, tensions, shoes, setup, usage hours and configuration history.',m8:'Physical status, injuries, pain, physiotherapy, screening, monitoring and documents.',m9:'Nutrition, hydration, sleep, fatigue, soreness, rest and readiness.',m10:'Mental goals, routines, focus, self-talk, emotional regulation and psychological work.',m11:'Perception, visual training, reaction time, neuro-training, protocols and measurements.',m12:'Costs, payments, seasonal budget, sponsors, cost per tournament and sustainability.',
  rolesKicker:'ACCESS & PERSONALISED DASHBOARDS',rolesTitle:'Each profile sees what it needs.',rolesBody:'Tennis Player OS adapts access, priorities and the starting dashboard to the role: athlete, parent and professionals work on the same journey, but with different tools.',roleSees:'SEES FIRST',roleCanDo:'CAN DO',rolesPanelPill:'NEW HOME BLOCK',rolesPanelLabel:'Profiles, dashboards and differentiated access',rolesStrip1:'Differentiated permissions',rolesStrip2:'One athlete record',rolesStrip3:'Focused home dashboards',rolesStrip4:'One whole team on the same path',
  roadKicker:'ROADMAP',roadTitle:'First we build solid data.<br><em>Then we make them smarter.</em>',roadBody:'AI-assisted analysis, automatic correlations and smart reports are a future development direction, not a promised feature in the current Beta. The goal is to get there starting from reliable, structured data controlled by the user.',today:'TODAY',todayBody:'Athlete record, connected modules, roles and operational tools.',future:'ROADMAP',futureBody:'AI-assisted insights, correlations and automatic reporting.',
  betaTitle:'30 accounts. Full access free for the whole Beta.',betaBody:'We are opening Tennis Player OS to a first group of 30 Beta Owners. Each account gets full access to its own environment and all modules available during the Beta.',betaAvailability:'FOUNDING BETA AVAILABILITY',betaSlotsLeft:'spots available',betaAssignedLabel:'assigned',betaWaitlist:'All 30 spots have been assigned. You can still leave your request for the waiting list.',bfAccess:'Access',bfAccessBody:'All available Beta modules',bfDuration:'Duration',bfDurationBody:'Free until the end of the Beta',bfOwner:'Profile',bfOwnerBody:'Beta Owner: full control of your environment',bfUpdates:'Updates',bfUpdatesBody:'Included automatically during the Beta',bfRequests:'Feature requests',bfRequestsBody:'You can propose functions and changes to the roadmap',bfAfter:'After the Beta',bfAfterBody:'No automatic renewal and no card required',featureRequestTitle:'Need something Tennis Player OS does not do yet?',featureRequestBody:'During the Beta you can propose new functions or changes. Requests are evaluated according to general usefulness, feasibility and development priority.',
  formKicker:'REQUEST YOUR ACCOUNT',formTitle:'Founding Beta Owner',name:'Name',profileInterest:'I am interested in TPOS as…',rParent:'Parent / family',rPlayer:'Player',rAcademy:'Academy / Club',rOther:'Other',betaMessage:'What interests you most? <em>Optional</em>',betaMessagePlaceholder:'You can tell us how you plan to use TPOS or a feature you would like to see during the Beta.',request:'Request your Beta account',formNote:'No payment and no credit card required. Access is manually activated until the 30 spots are gone.',success:'Request sent. We will contact you as soon as possible to activate your Founding Beta account.',formError:'We could not send the request. Please try again later or contact us directly.',betaMeans:'Beta means beta.',betaHonesty:'Features may change, some integrations are still in development and bugs may exist. Data stays under user control.',privacy:'Privacy',terms:'Terms',
  previewKicker:'PRODUCT PREVIEW',previewDialogTitle:'Desktop and mobile, around the same athlete journey.',previewDialogBody:'The hero combines a real desktop dashboard screen and a mobile athlete home view, so visitors immediately understand how Tennis Player OS looks in its main usage contexts.',rolesPreviewTitle:'Role-based dashboards and access.',rolesPreviewBody:'This panel shows how Tennis Player OS can adapt the home dashboard and permissions depending on the role: player, parent and professionals all work on the same path, but with different tools.'
};
let currentLang = localStorage.getItem('tpos-lang') || 'it';

const roleContent = {
  it: {
    athlete: {title:'Atleta',badge:'Dashboard atleta',lead:'La dashboard atleta mette al centro ciò che conta oggi: check-in, prossimi impegni, routine e azioni rapide.',list:['Check-in quotidiano e readiness','Agenda della giornata e prossimi impegni','Routine e compiti rapidi da completare','Accesso semplice a ciò che serve davvero in quel momento'],sees:'Oggi, check-in, routine, prossimi impegni',canDo:'Compilare check-in e consultare la giornata',note:'Un solo record, ma una schermata iniziale diversa per ogni ruolo.'},
    parent: {title:'Genitore',badge:'Dashboard genitore',lead:'La vista del genitore privilegia organizzazione, logistica e controllo del percorso, senza sommergere di dettagli tecnici.',list:['Panoramica della giornata dell’atleta','Logistica, spostamenti e coordinamento familiare','Costi, scadenze e aspetti pratici','Visione ordinata delle priorità operative'],sees:'Planning, logistica, costi, coordinamento',canDo:'Organizzare la settimana e seguire il percorso',note:'La stessa storia atleta diventa più leggibile per chi coordina il percorso.'},
    coach: {title:'Coach',badge:'Dashboard coach',lead:'Il coach entra subito nei temi di sviluppo, nei drills e nei match, con una schermata costruita per il lavoro tecnico-tattico.',list:['Obiettivi di sviluppo e priorità tecniche','Drills, sessioni e lavoro operativo sul campo','Match, debrief e trasferimento in partita','Accesso rapido a ciò che aiuta a decidere e correggere'],sees:'Sviluppo, drills, match, obiettivi',canDo:'Guidare il lavoro tecnico-tattico e verificare i progressi',note:'Niente rumore inutile: il coach vede soprattutto ciò che gli serve per allenare meglio.'},
    athletic: {title:'Preparatore atletico',badge:'Dashboard preparatore',lead:'Per il preparatore atletico la priorità è il carico: programma settimanale, test, disponibilità e connessione con salute e recupero.',list:['Programmazione e blocchi di lavoro','Test fisici e monitoraggio nel tempo','Disponibilità dell’atleta e restrizioni attive','Lettura del carico in rapporto al calendario'],sees:'Carico, programma, test, disponibilità',canDo:'Pianificare il lavoro atletico e monitorarlo',note:'La dashboard iniziale cambia, ma il record resta unico e condiviso.'},
    physio: {title:'Fisioterapista',badge:'Dashboard fisioterapia',lead:'Il fisioterapista accede rapidamente a stato fisico, body map, episodi attivi e limitazioni operative.',list:['Stato fisico e body map','Episodi attivi, dolore e limitazioni','Certificazioni, visite e protocolli','Quadro utile anche per comunicare con coach e famiglia'],sees:'Salute, episodi, certificazioni, limitazioni',canDo:'Registrare lo stato fisico e condividere indicazioni operative',note:'Il modulo salute diventa una vista pratica, non un archivio dispersivo.'},
    nutrition: {title:'Nutrizionista',badge:'Dashboard nutrizione',lead:'La dashboard nutrizione dà priorità a idratazione, alimentazione, routine e contesto di carico.',list:['Pasti, idratazione e routine','Collegamento con giorni di gara o allenamento','Note operative e monitoraggio semplice','Lettura del recupero nel contesto del percorso'],sees:'Alimentazione, routine, contesto di carico',canDo:'Impostare e seguire routine nutrizionali',note:'Anche qui il valore è nel contesto: i dati non sono isolati dal resto del percorso.'},
    mental: {title:'Mental coach',badge:'Dashboard mental',lead:'Il mental coach parte da routine, abilità mentali, focus di lavoro e collegamenti con allenamenti e partite.',list:['Aree di lavoro mentali e routine','Obiettivi di focus e autoregolazione','Collegamento con training e match','Spazio per note, progressi e priorità'],sees:'Routine, abilità, focus, match context',canDo:'Strutturare il lavoro mentale in modo operativo',note:'Il lavoro mentale è integrato nel percorso, non separato dal resto.'},
    custom: {title:'Custom',badge:'Profilo personalizzato',lead:'Quando serve, Tennis Player OS può anche costruire accessi più personalizzati: il principio resta sempre uno, mostrare il necessario a ciascuno.',list:['Permessi differenziati per contesto reale','Schermata iniziale adattabile al ruolo','Possibilità di semplificare o ampliare la vista','Una struttura pensata per crescere con il team'],sees:'Solo ciò che è utile a quel profilo',canDo:'Lavorare con una vista su misura',note:'Un solo record atleta. Più ruoli. Più modi intelligenti di accedervi.'}
  },
  en: {
    athlete: {title:'Player',badge:'Player dashboard',lead:'The player dashboard puts today first: check-in, next commitments, routines and quick actions.',list:['Daily check-in and readiness','Today timeline and next commitments','Routines and quick tasks','Simple access to what matters right now'],sees:'Today, check-in, routines, next commitments',canDo:'Complete check-ins and follow the day',note:'One record, but a different home screen for each role.'},
    parent: {title:'Parent',badge:'Parent dashboard',lead:'The parent view prioritises organisation, logistics and oversight without overwhelming technical detail.',list:['Day overview for the athlete','Logistics, travel and family coordination','Costs, deadlines and practical issues','Ordered visibility on operational priorities'],sees:'Planning, logistics, costs, coordination',canDo:'Organise the week and follow the journey',note:'The same athlete story becomes more readable for the person coordinating the path.'},
    coach: {title:'Coach',badge:'Coach dashboard',lead:'The coach goes straight into development themes, drills and matches, through a home view built for technical-tactical work.',list:['Development goals and technical priorities','Drills, sessions and on-court work','Matches, debrief and transfer to competition','Fast access to what helps decisions and corrections'],sees:'Development, drills, matches, goals',canDo:'Drive technical-tactical work and verify progress',note:'Less noise: the coach mainly sees what helps coaching better.'},
    athletic: {title:'Athletic trainer',badge:'Athletics dashboard',lead:'For the athletic trainer, the priority is load: weekly plan, tests, availability and links with health and recovery.',list:['Planning and work blocks','Physical tests and monitoring over time','Athlete availability and active restrictions','Reading load against the calendar'],sees:'Load, schedule, tests, availability',canDo:'Plan and monitor athletic work',note:'The home dashboard changes, but the underlying record stays shared.'},
    physio: {title:'Physiotherapist',badge:'Physio dashboard',lead:'The physiotherapist quickly reaches physical status, body map, active episodes and operational limitations.',list:['Physical status and body map','Active issues, pain and limitations','Certificates, visits and protocols','A practical view for communicating with coach and family'],sees:'Health, episodes, certificates, limitations',canDo:'Record physical status and share operational advice',note:'The health module becomes a practical view, not a scattered archive.'},
    nutrition: {title:'Nutritionist',badge:'Nutrition dashboard',lead:'The nutrition dashboard prioritises hydration, meals, routines and the current load context.',list:['Meals, hydration and routines','Links with match or training days','Operational notes and simple monitoring','Recovery seen in the wider context'],sees:'Nutrition, routines, load context',canDo:'Set and monitor nutrition routines',note:'The value is context: data is not isolated from the rest of the journey.'},
    mental: {title:'Mental coach',badge:'Mental dashboard',lead:'The mental coach starts from routines, mental skills, focus areas and links with training and matches.',list:['Mental work areas and routines','Focus goals and self-regulation','Links with training and match play','Room for notes, progress and priorities'],sees:'Routines, skills, focus, match context',canDo:'Structure mental work in an operational way',note:'Mental work is integrated into the journey, not separated from it.'},
    custom: {title:'Custom',badge:'Custom profile',lead:'When needed, Tennis Player OS can also support more customised access: the principle stays the same, showing each person only what is useful.',list:['Differentiated permissions for real contexts','Role-adapted home screen','Ability to simplify or expand the view','A structure designed to grow with the team'],sees:'Only what is useful for that profile',canDo:'Work with a tailored view',note:'One athlete record. Many roles. Smarter ways to access it.'}
  }
};

function setLanguage(lang){
  currentLang = lang;
  localStorage.setItem('tpos-lang', lang);
  document.documentElement.lang = lang;
  document.querySelectorAll('.language').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === lang));
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if(lang === 'en' && en[key]) el.innerHTML = en[key];
    else el.innerHTML = defaultSnapshots.get(el) || el.innerHTML;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if(lang === 'en' && en[key]) el.setAttribute('placeholder', en[key]);
    else el.setAttribute('placeholder', defaultSnapshots.get(el) || '');
  });
  document.getElementById('betaLang').value = lang;
  const activeRole = document.querySelector('.role-tab.active')?.dataset.role || 'athlete';
  setRole(activeRole);
}

function setRole(role){
  const data = roleContent[currentLang][role];
  if(!data) return;
  document.querySelectorAll('.role-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.role === role));
  document.getElementById('roleBadge').textContent = data.badge;
  document.getElementById('roleTitle').textContent = data.title;
  document.getElementById('roleLead').textContent = data.lead;
  document.getElementById('roleSees').textContent = data.sees;
  document.getElementById('roleCanDo').textContent = data.canDo;
  document.getElementById('roleNote').textContent = data.note;
  const list = document.getElementById('roleList');
  list.innerHTML = '';
  data.list.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  });
}

document.querySelectorAll('.language').forEach(btn => btn.addEventListener('click', () => setLanguage(btn.dataset.lang)));
document.querySelectorAll('.role-tab').forEach(btn => btn.addEventListener('click', () => setRole(btn.dataset.role)));
setLanguage(currentLang);

const dialog = document.getElementById('previewDialog');
const dialogTitle = document.getElementById('previewDialogTitle');
const dialogBody = document.getElementById('previewDialogBody');
const dialogImage = document.getElementById('dialogPreviewImage');
function openPreview(btn){
  const titleKey = btn.dataset.previewTitleKey;
  const bodyKey = btn.dataset.previewBodyKey;
  dialogTitle.innerHTML = currentLang === 'en' && en[titleKey] ? en[titleKey] : (titleKey ? (document.querySelector(`[data-i18n="${titleKey}"]`)?.innerHTML || dialogTitle.innerHTML) : dialogTitle.innerHTML);
  dialogBody.innerHTML = currentLang === 'en' && en[bodyKey] ? en[bodyKey] : (bodyKey ? (document.querySelector(`[data-i18n="${bodyKey}"]`)?.innerHTML || dialogBody.innerHTML) : dialogBody.innerHTML);
  dialogImage.src = btn.dataset.previewImage;
  dialogImage.alt = btn.dataset.previewAlt || '';
  dialog.showModal();
}
document.querySelectorAll('[data-preview-image]').forEach(btn => btn.addEventListener('click', () => openPreview(btn)));
document.getElementById('closePreview').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (e) => {
  const rect = dialog.getBoundingClientRect();
  const inside = rect.top <= e.clientY && e.clientY <= rect.bottom && rect.left <= e.clientX && e.clientX <= rect.right;
  if (!inside) dialog.close();
});

actionAjax();
loadBetaStatus();
setInterval(loadBetaStatus, 15000);
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') loadBetaStatus(); });

async function loadBetaStatus(){
  try{
    const res = await fetch(`beta-status.php?t=${Date.now()}`, {headers:{'Accept':'application/json'}});
    if(!res.ok) throw new Error('beta status unavailable');
    const data = await res.json();
    if(!data || typeof data.capacity === 'undefined') return;
    updateBetaUI(data);
  }catch(err){ /* silent */ }
}
function updateBetaUI(data){
  const capacity = Number(data.capacity || 30);
  const assigned = Number(data.assigned || data.active || 0);
  const remaining = Math.max(0, Number(data.remaining ?? (capacity - assigned)));
  document.getElementById('betaCapacity').textContent = capacity;
  document.getElementById('betaAssigned').textContent = assigned;
  document.getElementById('betaRemaining').textContent = remaining;
  const progress = capacity > 0 ? `${Math.min(100, (assigned / capacity) * 100)}%` : '0%';
  const bar = document.getElementById('betaProgress');
  bar.style.setProperty('--beta-progress', progress);
  bar.setAttribute('aria-valuenow', String(assigned));
  const waitlist = document.getElementById('betaWaitlist');
  document.getElementById('betaProgramState').value = remaining > 0 ? 'open' : 'waitlist';
  if(remaining <= 0) waitlist.removeAttribute('hidden'); else waitlist.setAttribute('hidden', 'hidden');
}
function actionAjax(){
  const form = document.getElementById('betaForm');
  if(!form) return;
  const success = document.getElementById('formSuccess');
  const errorBox = document.getElementById('formError');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    success.style.display = 'none';
    errorBox.style.display = 'none';
    const submit = document.getElementById('betaSubmit');
    submit.disabled = true;
    const previous = submit.textContent;
    submit.textContent = currentLang === 'en' ? 'Sending…' : 'Invio…';
    try{
      const res = await fetch(form.action, {method:'POST', body:new FormData(form), headers:{'Accept':'application/json'}});
      let data = null;
      try { data = await res.json(); } catch(_) {}
      if(!res.ok || (data && data.ok === false)) throw new Error('submit failed');
      success.style.display = 'block';
      form.reset();
      document.getElementById('betaLang').value = currentLang;
      document.getElementById('betaProgramState').value = document.getElementById('betaWaitlist').hasAttribute('hidden') ? 'open' : 'waitlist';
    }catch(err){
      errorBox.style.display = 'block';
    }finally{
      submit.disabled = false;
      submit.textContent = previous;
    }
  });
}
