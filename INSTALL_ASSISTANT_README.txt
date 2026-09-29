Tennis Player OS — patch incrementale v1.0.14

PREREQUISITO
Questa patch presuppone che la v1.0.13 PWA sia già stata applicata.

COSA FA
- aggiunge l'assistente di installazione "Installa app";
- Android/Chromium: usa il prompt nativo quando disponibile;
- iPhone/iPad: mostra istruzioni Safari minimali;
- non modifica manifest, service worker, Supabase o dati.

FLUSSO
1. Applica con “Applica Patch.command”.
2. Avvia e verifica il normale funzionamento.
3. Pubblica con “Pubblica Tennis Player OS.command”.
4. Test su un dispositivo NON ancora installato.

NOTA TEST
Se TPOS è già installata e aperta dalla Home, l'assistente deve restare nascosto: è il comportamento corretto.
