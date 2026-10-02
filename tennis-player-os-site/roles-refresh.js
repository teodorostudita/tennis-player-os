
(() => {
  const roleLabels = {
    it: {
      athlete: 'Atleta',
      parent: 'Genitore',
      coach: 'Coach',
      athletic: 'Preparatore atletico',
      physio: 'Fisioterapista',
      nutrition: 'Nutrizionista',
      mental: 'Mental coach',
      custom: 'Custom',
    },
    en: {
      athlete: 'Player',
      parent: 'Parent',
      coach: 'Coach',
      athletic: 'Athletic trainer',
      physio: 'Physiotherapist',
      nutrition: 'Nutritionist',
      mental: 'Mental coach',
      custom: 'Custom',
    },
  };

  const staticCopy = {
    it: {
      summaryAthleteTitle: 'Atleta:',
      summaryAthleteBody: 'check-in, giornata, routine, compiti rapidi',
      summaryParentTitle: 'Genitore:',
      summaryParentBody: 'planning, logistica, costi, coordinamento',
      summaryCoachTitle: 'Coach:',
      summaryCoachBody: 'sviluppo, drills, match, obiettivi',
      summaryStaffTitle: 'Staff:',
      summaryStaffBody: 'salute, recupero, nutrizione, monitoraggio',
      footer: 'PERMESSI DIFFERENZIATI. UN SOLO RECORD. UN INTERO TEAM.',
    },
    en: {
      summaryAthleteTitle: 'Player:',
      summaryAthleteBody: 'check-in, day plan, routines, quick tasks',
      summaryParentTitle: 'Parent:',
      summaryParentBody: 'planning, logistics, costs, coordination',
      summaryCoachTitle: 'Coach:',
      summaryCoachBody: 'development, drills, matches, goals',
      summaryStaffTitle: 'Staff:',
      summaryStaffBody: 'health, recovery, nutrition, monitoring',
      footer: 'DIFFERENTIATED PERMISSIONS. ONE RECORD. ONE WHOLE TEAM.',
    },
  };

  const previews = {
    it: {
      athlete: {
        label: 'Esempio: dashboard atleta',
        role: 'ATLETA',
        greeting: 'Buongiorno',
        subtitle: 'Quello che conta adesso e nelle prossime ore.',
        kicker: 'ADESSO',
        icon: '♡',
        title: 'Fisio',
        meta: '10:00–11:00 · Studio',
        strong: 'Termina tra 27 min',
        after: 'Subito dopo · Spostamento',
        actionsKicker: 'DA FARE OGGI',
        actionsTitle: 'Azioni rapide',
        a1Icon: '○', a1Title: 'Check-in di oggi', a1Body: 'Sonno, stanchezza, umore, voglia e concentrazione.', a1Cta: 'Apri',
        a2Icon: '↘', a2Title: 'Training checkout', a2Body: "Da compilare dopo l'ultimo allenamento di oggi.", a2Cta: 'Apri',
      },
      parent: {
        label: 'Esempio: dashboard genitore',
        role: 'GENITORE',
        greeting: 'Buongiorno',
        subtitle: 'Agenda familiare, scadenze e cose che richiedono attenzione.',
        kicker: 'PROSSIMO',
        icon: '▣',
        title: 'Tennis gruppo',
        meta: '16:45–18:30 · Circolo',
        strong: 'Accompagnatore: assegnato',
        after: 'Dopo · Rientro e cena',
        actionsKicker: 'PRIORITÀ',
        actionsTitle: 'Da fare',
        a1Icon: '↗', a1Title: 'Logistica di oggi', a1Body: 'Spostamenti e accompagnatori in un unico colpo d’occhio.', a1Cta: 'Apri',
        a2Icon: '↺', a2Title: 'Lezioni da recuperare', a2Body: 'Sessioni saltate ancora da riprogrammare.', a2Cta: 'Gestisci',
      },
      coach: {
        label: 'Esempio: dashboard coach',
        role: 'COACH',
        greeting: 'Buongiorno',
        subtitle: 'Priorità tecniche, lavoro sul campo e trasferimento in partita.',
        kicker: 'FOCUS SVILUPPO',
        icon: '◇',
        title: 'Servizio +1',
        meta: 'Tema attivo · Settimana 4',
        strong: '2 drills collegati',
        after: 'Ultimo match · note da rivedere',
        actionsKicker: 'LAVORO',
        actionsTitle: 'Azioni rapide',
        a1Icon: '🎾', a1Title: 'Drills collegati', a1Body: 'Apri gli esercizi associati al focus tecnico.', a1Cta: 'Apri',
        a2Icon: '🏆', a2Title: 'Ultimo match', a2Body: 'Debrief, pattern e punti da trasferire in allenamento.', a2Cta: 'Rivedi',
      },
      athletic: {
        label: 'Esempio: dashboard preparatore',
        role: 'PREPARATORE',
        greeting: 'Buongiorno',
        subtitle: 'Carico, programma, disponibilità e test fisici.',
        kicker: 'OGGI',
        icon: '▥',
        title: 'Velocità + core',
        meta: '15:00–16:00 · Palestra',
        strong: 'Carico previsto: medio',
        after: 'Domani · recupero attivo',
        actionsKicker: 'MONITORAGGIO',
        actionsTitle: 'Da controllare',
        a1Icon: '↗', a1Title: 'Sessione atletica', a1Body: 'Obiettivi, contenuti e carico della seduta.', a1Cta: 'Apri',
        a2Icon: '▥', a2Title: 'Test & trend', a2Body: 'Confronta gli ultimi test con la baseline.', a2Cta: 'Vedi',
      },
      physio: {
        label: 'Esempio: dashboard fisioterapista',
        role: 'FISIO',
        greeting: 'Buongiorno',
        subtitle: 'Stato fisico, episodi attivi e limitazioni operative.',
        kicker: 'STATO FISICO',
        icon: '✚',
        title: 'Nessuna limitazione attiva',
        meta: 'Ultimo check · oggi',
        strong: 'Disponibile per allenamento',
        after: 'Prossimo controllo · venerdì',
        actionsKicker: 'SALUTE',
        actionsTitle: 'Azioni rapide',
        a1Icon: '♡', a1Title: 'Body & Health', a1Body: 'Body map, dolore, episodi e documenti.', a1Cta: 'Apri',
        a2Icon: '✚', a2Title: 'Fisioterapia', a2Body: 'Registra trattamento e indicazioni operative.', a2Cta: 'Aggiorna',
      },
      nutrition: {
        label: 'Esempio: dashboard nutrizionista',
        role: 'NUTRIZIONE',
        greeting: 'Buongiorno',
        subtitle: 'Routine, idratazione e alimentazione nel contesto del carico.',
        kicker: 'ROUTINE',
        icon: '●',
        title: 'Pre-allenamento',
        meta: 'Snack + idratazione',
        strong: 'Previsto alle 14:20',
        after: 'Allenamento · 15:00',
        actionsKicker: 'OGGI',
        actionsTitle: 'Da seguire',
        a1Icon: '◔', a1Title: 'Idratazione', a1Body: 'Controllo della routine nelle ore di carico.', a1Cta: 'Apri',
        a2Icon: '☾', a2Title: 'Recovery', a2Body: 'Sonno, fatigue e readiness nel contesto nutrizionale.', a2Cta: 'Vedi',
      },
      mental: {
        label: 'Esempio: dashboard mental coach',
        role: 'MENTAL',
        greeting: 'Buongiorno',
        subtitle: 'Routine, abilità mentali e focus collegati a training e match.',
        kicker: 'FOCUS',
        icon: '◉',
        title: 'Routine pre-match',
        meta: 'Respirazione · cue words',
        strong: 'Fase: stabilizzare',
        after: 'Prossimo match · sabato',
        actionsKicker: 'MENTAL SKILLS',
        actionsTitle: 'Lavoro attivo',
        a1Icon: '◎', a1Title: 'Abilità mentale', a1Body: 'Focus, fiducia e autoregolazione.', a1Cta: 'Apri',
        a2Icon: '↗', a2Title: 'Review partita', a2Body: 'Collega ciò che è successo al lavoro mentale.', a2Cta: 'Rivedi',
      },
      custom: {
        label: 'Esempio: dashboard custom',
        role: 'CUSTOM',
        greeting: 'Buongiorno',
        subtitle: 'Una vista costruita intorno a ciò che serve davvero a quel profilo.',
        kicker: 'VISTA PERSONALIZZATA',
        icon: '⚙',
        title: 'Moduli selezionati',
        meta: 'Accesso configurabile',
        strong: 'Priorità su misura',
        after: 'Un solo record atleta',
        actionsKicker: 'ACCESSI',
        actionsTitle: 'Strumenti',
        a1Icon: '▦', a1Title: 'Moduli', a1Body: 'Mostra soltanto le aree utili a questo profilo.', a1Cta: 'Apri',
        a2Icon: '⚙', a2Title: 'Permessi', a2Body: 'Lettura e scrittura secondo il ruolo.', a2Cta: 'Gestisci',
      },
    },
    en: {
      athlete: {
        label: 'Example: player dashboard', role: 'PLAYER', greeting: 'Good morning',
        subtitle: 'What matters now and over the next few hours.', kicker: 'NOW', icon: '♡',
        title: 'Physio', meta: '10:00–11:00 · Clinic', strong: 'Ends in 27 min',
        after: 'Right after · Travel', actionsKicker: 'TO DO TODAY', actionsTitle: 'Quick actions',
        a1Icon: '○', a1Title: 'Today’s check-in', a1Body: 'Sleep, fatigue, mood, motivation and focus.', a1Cta: 'Open',
        a2Icon: '↘', a2Title: 'Training checkout', a2Body: 'Complete after today’s final training session.', a2Cta: 'Open',
      },
      parent: {
        label: 'Example: parent dashboard', role: 'PARENT', greeting: 'Good morning',
        subtitle: 'Family agenda, deadlines and items that need attention.', kicker: 'NEXT', icon: '▣',
        title: 'Group tennis', meta: '16:45–18:30 · Club', strong: 'Companion: assigned',
        after: 'After · Ride home and dinner', actionsKicker: 'PRIORITIES', actionsTitle: 'To do',
        a1Icon: '↗', a1Title: 'Today’s logistics', a1Body: 'Travel and companions at a glance.', a1Cta: 'Open',
        a2Icon: '↺', a2Title: 'Make-up sessions', a2Body: 'Missed sessions still to reschedule.', a2Cta: 'Manage',
      },
      coach: {
        label: 'Example: coach dashboard', role: 'COACH', greeting: 'Good morning',
        subtitle: 'Technical priorities, on-court work and transfer to competition.', kicker: 'DEVELOPMENT FOCUS', icon: '◇',
        title: 'Serve +1', meta: 'Active theme · Week 4', strong: '2 linked drills',
        after: 'Latest match · notes to review', actionsKicker: 'WORK', actionsTitle: 'Quick actions',
        a1Icon: '🎾', a1Title: 'Linked drills', a1Body: 'Open exercises connected to the technical focus.', a1Cta: 'Open',
        a2Icon: '🏆', a2Title: 'Latest match', a2Body: 'Debrief, patterns and training transfer.', a2Cta: 'Review',
      },
      athletic: {
        label: 'Example: athletic trainer dashboard', role: 'ATHLETICS', greeting: 'Good morning',
        subtitle: 'Load, programme, availability and physical testing.', kicker: 'TODAY', icon: '▥',
        title: 'Speed + core', meta: '15:00–16:00 · Gym', strong: 'Planned load: medium',
        after: 'Tomorrow · active recovery', actionsKicker: 'MONITORING', actionsTitle: 'Check',
        a1Icon: '↗', a1Title: 'Athletic session', a1Body: 'Goals, content and load for the session.', a1Cta: 'Open',
        a2Icon: '▥', a2Title: 'Tests & trends', a2Body: 'Compare recent tests with baseline.', a2Cta: 'View',
      },
      physio: {
        label: 'Example: physiotherapist dashboard', role: 'PHYSIO', greeting: 'Good morning',
        subtitle: 'Physical status, active issues and operational limitations.', kicker: 'PHYSICAL STATUS', icon: '✚',
        title: 'No active restrictions', meta: 'Latest check · today', strong: 'Available for training',
        after: 'Next check · Friday', actionsKicker: 'HEALTH', actionsTitle: 'Quick actions',
        a1Icon: '♡', a1Title: 'Body & Health', a1Body: 'Body map, pain, issues and documents.', a1Cta: 'Open',
        a2Icon: '✚', a2Title: 'Physiotherapy', a2Body: 'Record treatment and operational guidance.', a2Cta: 'Update',
      },
      nutrition: {
        label: 'Example: nutrition dashboard', role: 'NUTRITION', greeting: 'Good morning',
        subtitle: 'Routines, hydration and nutrition in the context of training load.', kicker: 'ROUTINE', icon: '●',
        title: 'Pre-training', meta: 'Snack + hydration', strong: 'Planned for 14:20',
        after: 'Training · 15:00', actionsKicker: 'TODAY', actionsTitle: 'Follow',
        a1Icon: '◔', a1Title: 'Hydration', a1Body: 'Track the routine around load periods.', a1Cta: 'Open',
        a2Icon: '☾', a2Title: 'Recovery', a2Body: 'Sleep, fatigue and readiness in context.', a2Cta: 'View',
      },
      mental: {
        label: 'Example: mental coach dashboard', role: 'MENTAL', greeting: 'Good morning',
        subtitle: 'Routines, mental skills and focus connected to training and matches.', kicker: 'FOCUS', icon: '◉',
        title: 'Pre-match routine', meta: 'Breathing · cue words', strong: 'Stage: stabilise',
        after: 'Next match · Saturday', actionsKicker: 'MENTAL SKILLS', actionsTitle: 'Active work',
        a1Icon: '◎', a1Title: 'Mental skill', a1Body: 'Focus, confidence and self-regulation.', a1Cta: 'Open',
        a2Icon: '↗', a2Title: 'Match review', a2Body: 'Connect match events to mental work.', a2Cta: 'Review',
      },
      custom: {
        label: 'Example: custom dashboard', role: 'CUSTOM', greeting: 'Good morning',
        subtitle: 'A view built around what that profile actually needs.', kicker: 'CUSTOM VIEW', icon: '⚙',
        title: 'Selected modules', meta: 'Configurable access', strong: 'Tailored priorities',
        after: 'One athlete record', actionsKicker: 'ACCESS', actionsTitle: 'Tools',
        a1Icon: '▦', a1Title: 'Modules', a1Body: 'Show only the areas useful to this profile.', a1Cta: 'Open',
        a2Icon: '⚙', a2Title: 'Permissions', a2Body: 'Read and write according to the role.', a2Cta: 'Manage',
      },
    },
  };

  function lang() {
    return document.documentElement.lang === 'en' ? 'en' : 'it';
  }

  function activeRole() {
    return document.querySelector('.role-tab.active')?.dataset.role || 'athlete';
  }

  function renderRoleLabels() {
    const l = lang();
    document.querySelectorAll('[data-rp-role]').forEach(el => {
      const role = el.dataset.rpRole;
      if (roleLabels[l][role]) el.textContent = roleLabels[l][role];
    });
    document.querySelectorAll('[data-rp-copy]').forEach(el => {
      const key = el.dataset.rpCopy;
      if (staticCopy[l][key]) el.textContent = staticCopy[l][key];
    });
  }

  function renderPhone(role = activeRole()) {
    const l = lang();
    const p = previews[l][role] || previews[l].athlete;
    const byId = id => document.getElementById(id);

    byId('rpPreviewLabel').textContent = p.label;
    byId('rpPhoneRole').textContent = p.role;
    byId('rpPhoneGreeting').textContent = p.greeting;
    byId('rpPhoneSubtitle').textContent = p.subtitle;
    byId('rpPrimaryKicker').textContent = p.kicker;
    byId('rpPrimaryIcon').textContent = p.icon;
    byId('rpPrimaryTitle').textContent = p.title;
    byId('rpPrimaryMeta').textContent = p.meta;
    byId('rpPrimaryStrong').textContent = p.strong;
    byId('rpPrimaryAfter').textContent = p.after;
    byId('rpActionsKicker').textContent = p.actionsKicker;
    byId('rpActionsTitle').textContent = p.actionsTitle;

    byId('rpAction1Icon').textContent = p.a1Icon;
    byId('rpAction1Title').textContent = p.a1Title;
    byId('rpAction1Body').textContent = p.a1Body;
    byId('rpAction1Cta').textContent = p.a1Cta;

    byId('rpAction2Icon').textContent = p.a2Icon;
    byId('rpAction2Title').textContent = p.a2Title;
    byId('rpAction2Body').textContent = p.a2Body;
    byId('rpAction2Cta').textContent = p.a2Cta;

    document.querySelectorAll('[data-role-card]').forEach(card => {
      card.classList.toggle('active', card.dataset.roleCard === role);
    });
  }

  function selectRole(role) {
    const tab = document.querySelector(`.role-tab[data-role="${role}"]`);
    if (!tab) return;
    if (!tab.classList.contains('active')) tab.click();
    renderPhone(role);
  }

  document.querySelectorAll('.role-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      requestAnimationFrame(() => renderPhone(tab.dataset.role));
    });
  });

  document.querySelectorAll('[data-role-card]').forEach(card => {
    card.addEventListener('click', () => selectRole(card.dataset.roleCard));
  });

  const observer = new MutationObserver(() => {
    renderRoleLabels();
    renderPhone(activeRole());
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  renderRoleLabels();
  renderPhone(activeRole());
})();
