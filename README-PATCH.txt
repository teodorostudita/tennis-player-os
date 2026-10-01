TPOS v1.1.6 — Conflict-safe Recovery sync

Corregge la mancata convergenza delle cronologie Nutrition & Recovery tra dispositivi.
Ogni salvataggio fonde l’ultima revisione cloud con la cache locale e usa optimistic concurrency, evitando overwrite dell’intero storico.
Nessuna migration SQL. Nessuna Edge Function modificata.
