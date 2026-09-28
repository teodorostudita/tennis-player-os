# Tennis Player OS — Release Log

## v1.0.5 — Calendar: sync mobile robusta ed eccezioni ricorrenti sicure
- Aggiunta una **outbox locale** del Calendar: le modifiche non ancora confermate da Supabase restano sul dispositivo.
- Retry automatico al ritorno online, al rientro in foreground e al `pageshow`.
- Gli eventi ricorrenti vengono modificati di default **solo per la singola occorrenza**.
- L’opzione **Questa e le successive** resta disponibile come scelta esplicita.
- Eliminare una singola occorrenza non altera le settimane successive.
- Drag/resize diretto disabilitato sulle occorrenze ricorrenti per evitare modifiche involontarie dell’intera serie.
