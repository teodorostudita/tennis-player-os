# Tennis Player OS — Release Log

## v1.0.2 — Body map: riallineamento fine dei reperi
- Rifinito il posizionamento orizzontale dei reperi nella Body map di Body & Health.
- Front: corretta la gamba destra (dalla coscia in giù) e riportato verso il centro il blocco tronco/arto superiore sinistro.
- Back: spostati a destra i reperi della metà superiore e ulteriormente corretta la metà inferiore destra.
- Nessuna modifica ai dati cloud o alla logica del tracker infortuni.

## v1.0.1 — Companion: import Match dal profilo TennisTalker autenticato
- Supportata la pagina personale TennisTalker `/profilo/partite`.
- Lo storico viene inviato direttamente a **Match** con payload `kind=matches`.
- Il parser non dipende più da un ID giocatore nell'URL per il profilo autenticato.
- Match mantiene compatibilità con i payload `profile+matches` della v1.0.0.
- Diagnostica aggiornata per `matchUI`.
- Body map invariata in questa patch.
