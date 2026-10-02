Tennis Player OS — patch v1.2.4

Contenuti principali
- Home Preparatore: “Impegni rilevanti” = soltanto tornei + sessioni di tennis.
- Data rescue non distruttivo per Development, Opponents e Nutrition/Recovery.
- Development/Opponents: bootstrap cloud merge-safe e salvataggi con optimistic concurrency.
- Recovery: gli account read-only non cancellano durante il polling eventuale storico recuperato localmente.
- Cache-busting coerente v1.2.4 su tutto il grafo JS per evitare moduli ESM duplicati/stale.

IMPORTANTE PER IL PRIMO AVVIO
1. NON cancellare cache/localStorage e non disinstallare la PWA prima del recupero.
2. Dopo pubblicazione, aprire per primo il dispositivo/browser sul quale i dati originali erano presenti.
3. Preferibilmente usare un account Owner/Coach con scrittura sui moduli: in questo modo i dati recuperati vengono anche consolidati nel cloud.
4. Attendere alcuni secondi prima di aprire la stessa atleta da altri account/dispositivi.

Nessuna migration SQL.
Nessuna Edge Function.
