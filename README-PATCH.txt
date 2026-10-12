Tennis Player OS v1.2.24 — Athlete creation quotas & per-athlete access

Patch SOLO TPOS. Non contiene e non modifica tennis-player-os-site/.

Utenti & Accessi:
- nuova autorizzazione globale "Creazione atleti";
- opzioni: NO / 1 / Definisci numero / SÌ — illimitati;
- quota indipendente dal ruolo sui singoli atleti;
- Admin su un atleta non implica più creazione di nuovi atleti;
- privilegi modificabili separatamente per ciascun atleta;
- Founding Beta: default 1 atleta, modificabile dall’Owner globale;
- supportati account creator senza atleta già assegnato.

Backend:
- nuova migration Supabase per separare quota account e privilegi atleta;
- aggiornamento RPC Owner workspace/access;
- aggiornamento Edge Function create-user.

Applicazione:
Applica Patch.command -> Pubblica Tennis Player OS.command.
Durante la pubblicazione devono essere applicate la migration e la Edge Function incluse nella patch.
