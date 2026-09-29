# Tennis Player OS — Release Log

## v1.0.13 — Installable PWA
- Tennis Player OS è ora installabile come web app su iPhone/iPad, Android e browser desktop compatibili.
- Aggiunto Web App Manifest con modalità `standalone`, nome, colori e icone dedicate.
- Aggiunti metadati Apple per l’installazione dalla schermata Home.
- Aggiunto service worker minimale con sola pagina offline: nessuna cache dei dati Supabase/API e nessuna cache aggressiva degli asset applicativi.
- Aggiunta schermata offline esplicita per evitare di mostrare dati cloud come se fossero aggiornati.
- Tutti i percorsi PWA sono relativi, così il deploy resta compatibile con GitHub Pages anche sotto sottocartella.
- Nessun cambiamento al modello dati, a Supabase o ai moduli applicativi.

## v1.0.12 — Development ↔ Drills bridge + Drills product polish
- Collegamento bidirezionale e operativo tra temi **Development** e **Drills**.
- Da Development si apre direttamente il drill corretto in Libreria, con evidenziazione.
- Ogni drill mostra i temi Development associati e consente di modificarli con una checklist.
- Nuovo filtro Development nella Libreria Drills.
- Overview Drills: KPI dei collegamenti + pannello **Development bridge**.
- Pulizia automatica dei riferimenti quando un drill viene eliminato.
- Restyling Drills con palette blu-court / tennis-lime e UI premium.
- Corretto il titolo pagina in **4. Drills**.
