# Tennis Player OS — Release Log

## v1.0.6 — Development Worklist + publish migration default Sì
- Aggiunta la nuova vista **Worklist** nel modulo Development.
- I focus tecnici/tattici hanno stato `To do / Active / Paused / Done`, fase di sviluppo, priorità, area e collegamento opzionale al quadro Development.
- **Lavorato oggi** registra data, nota, fase e stato e costruisce una timeline storica.
- I focus `Done` restano nello storico e possono essere riaperti.
- Il cloud Development passa allo schema 2 e sincronizza anche `workItems` + `activityLog`.
- Nessuna nuova migration SQL per la Worklist.
- `Pubblica Tennis Player OS.command`: per le migration il prompt è ora `[S/n]`; Invio equivale a Sì.

## v1.0.5 — Calendar: sync mobile robusta ed eccezioni ricorrenti sicure
- Outbox locale del Calendar.
- Retry al ritorno online / foreground.
- Modifica singola delle ricorrenze come comportamento predefinito.
