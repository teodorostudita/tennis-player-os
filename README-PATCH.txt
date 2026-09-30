TPOS v1.0.24 — Founding Beta auth bridge hotfix

Corregge il 403 'Richiesta non autorizzata' del mailer Beta Owner sui server PHP/FastCGI che non espongono l'header Authorization a PHP.

La Edge Function continua a inviare Authorization come header e, in aggiunta, trasporta lo stesso JWT Owner nel body JSON HTTPS. beta-owner-invite.php usa il body soltanto come fallback e verifica comunque il token chiamando is_app_owner su Supabase.

Nessuna migration SQL.
Dopo Applica Patch.command:
1) ricaricare tennis-player-os-site/beta-owner-invite.php nella root reale del sito;
2) eseguire Pubblica Tennis Player OS.command per ridistribuire create-beta-owner.
