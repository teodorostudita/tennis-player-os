Tennis Player OS - Patch v1.2.25 - Economics desktop/mobile
Patch SOLO APP: 14 file, nessuna cartella tennis-player-os-site/.

Correzioni:
- Economics usa store.js e access.js condivisi con l'app principale.
- Bootstrap allineato per impedire l'avvio ripetuto di istanze diverse.
- Lettura cloud Economics per ogni account con accesso al modulo.
- Nuovo Movimento: una sola Data, scadenza distinta.
- Form categoria-dipendente:
  Formazione -> Accordo + Area formazione;
  Tornei e Trasferte -> Torneo collegato;
  Attrezzatura -> Tipo attrezzatura;
  Altre categorie -> nessun campo di collegamento non pertinente.
- Dati storici compatibili. Non si cancellano movimenti nel deploy.

Applicazione:
1. Apri Applica Patch.command e seleziona questo ZIP, senza decomprimerlo.
2. Conferma il tipo APP e l'elenco dei 14 file.
3. Esegui Pubblica Tennis Player OS.command. Non ci sono migrazioni ne' funzioni edge.
4. Apri Economics sul desktop dove sono gia' presenti i dati, e verifica
   l'indicatore 'Economics cloud' con spunta.
5. Chiudi e riapri la PWA mobile, sullo stesso atleta e con permesso Economics.

Non modifica i due .command, il database Supabase o il sito vetrina.
