TPOS v1.0.22 — Founding Beta Owner mail fix

Cosa corregge:
- il pannello + Beta Owner non usa più l'invio email di Supabase;
- Supabase genera soltanto il link di attivazione;
- la mail viene spedita dal canale SMTP TPOS già usato dal sito pubblico;
- l'Owner globale non può consumare uno dei 30 posti Beta;
- la migrazione elimina automaticamente un eventuale posto Beta assegnato per errore all'Owner globale.

Dopo Applica Patch.command:
1. caricare manualmente tennis-player-os-site/beta-owner-invite.php sul sito reale in /TennisPlayerOS/ accanto a beta-request.php e mail-config.php;
2. eseguire Pubblica Tennis Player OS.command;
3. accettare l'applicazione della nuova migration Supabase e il deploy della Edge Function.
