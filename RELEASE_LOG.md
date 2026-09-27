# Tennis Player OS — Release Log

## v1.0.1 — Companion: import Match dal profilo TennisTalker autenticato
- Supportata la pagina personale TennisTalker `/profilo/partite`.
- Lo storico viene inviato direttamente a **Match** con payload `kind=matches`.
- Il parser non dipende più da un ID giocatore nell'URL per il profilo autenticato.
- Match mantiene compatibilità con i payload `profile+matches` della v1.0.0.
- Diagnostica aggiornata per `matchUI`.
- Body map invariata in questa patch.
