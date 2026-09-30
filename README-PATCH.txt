TPOS v1.0.25 — Founding Beta integrata negli account

Questa patch sostituisce il flusso separato “+ Beta Owner” con il normale pannello Utenti & Accessi.

Novità principali:
- Email di contatto modificabile per tutti gli account, separata dall’email tecnica di login.
- Flag Founding Beta Owner nello stesso form Nuovo/Modifica utente.
- Un Beta Owner nuovo parte senza atleta assegnato e può creare il proprio atleta.
- Il Beta Owner può creare al massimo 1 atleta; il limite è applicato anche nel database.
- Sul proprio atleta il default è Admin, quindi lettura + scrittura su tutti i moduli.
- I privilegi restano personalizzabili in seguito dal normale editor per atleta/modulo.
- Il counter Founding Beta si aggiorna tramite beta_accounts; i Beta Owner senza atleta restano visibili nel pannello Owner.
- Il vecchio pannello dedicato Founding Beta non viene più caricato.

Applicazione:
1. Applica con Applica Patch.command.
2. Esegui Pubblica Tennis Player OS.command.
3. Accetta la nuova migration SQL quando viene proposta.
4. La pubblicazione deve ridistribuire anche le Edge Functions create-user e remove-user.

Il file server beta-owner-invite.php non è più necessario per la creazione dei Beta Owner.
