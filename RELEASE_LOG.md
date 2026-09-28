# Tennis Player OS — Release Log

## v1.0.9 — Calendar reliability: outbox compatta e sync isolata
- Outbox Calendar compatta: serie ricorrenti + eccezioni + attività singole, senza duplicare tutte le occorrenze materializzate.
- Eliminato il `QuotaExceededError` causato dal salvataggio dell’intero Planner in `localStorage`.
- La superficie tennis rispetta **Solo questa attività** senza propagarsi alla serie.
- Athletics non tenta più sync per modifiche che riguardano soltanto altri moduli.
- Retry Athletics con backoff progressivo sugli errori reali.
- Include anche il restyling commerciale della v1.0.8.

## v1.0.8 — Product polish: prima facies commerciale
- Restyling di Calendar, Equipment, Development, Economics e Body & Health.
