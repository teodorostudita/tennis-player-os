Tennis Player OS v1.2.15 — Owner-only heavy library uploads

Patch SOLO TPOS. Non contiene e non modifica tennis-player-os-site/.

Regola Librerie:
- link / YouTube: invariati per chi ha permesso di scrittura;
- file per account non-Owner: massimo 5 MB;
- file per global Owner: massimo 200 MB;
- oltre 5 MB un non-Owner riceve "Privilegi insufficienti";
- controllo applicato in UI, provider e policy Supabase Storage / metadata;
- nessun file esistente viene cancellato o modificato.

Supabase:
- applicare la nuova migration che restringe gli upload file pesanti al global Owner.

Applicazione:
Applica Patch.command -> Pubblica Tennis Player OS.command -> Sì alla nuova migration Supabase.
