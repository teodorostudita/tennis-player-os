# Tennis Player OS — Release Log

## v1.0.10 — Full cloud coverage
- **Drills** ora sincronizza in Supabase libreria, sessioni, protocolli e risultati dei test.
- **Nutrition & Recovery** ora sincronizza template, guidance, sonno e check-in di recupero.
- Backfill automatico dei dati locali preesistenti di **Body & Health, Mental, Visual e Match** se il record cloud non era ancora stato creato.
- Le **Librerie** dei moduli diventano cloud-first: metadata in `resource_library_items`, file in bucket privato `tpos-resources`.
- Le vecchie risorse IndexedDB vengono migrate automaticamente e cancellate localmente solo dopo upload riuscito.
- Le Librerie rispettano i permessi read/write del modulo tramite RLS.
- Rimangono locali solo cache e stato effimero dell’interfaccia, non i dati atleta persistenti.
