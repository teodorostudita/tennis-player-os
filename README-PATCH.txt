Tennis Player OS - Ripristino deploy v1.2.24
PATCH SOLO SCRIPT - non tocca app, database, sito marketing o progetto P-Med.

Questa patch aggiorna esclusivamente Pubblica Tennis Player OS.command.
Se il deploy standard delle Edge Functions restituisce 500, lo script prova
la compilazione alternativa con Docker Desktop (flag --use-docker --debug).
Se Docker Desktop manca o non e' avviato, lo script si ferma senza fare commit.

STATO ACCERTATO prima di questa patch:
- migration 20261012220000 gia' applicata al database remoto TPOS;
- remove-user aggiornata remotamente (versione 4);
- create-user ancora alla versione 7 (vecchia versione attiva);
- frontend e GitHub non ancora pubblicati.

COME PROCEDERE:
1. Se installato, avvia Docker Desktop sul Mac e verifica sia operativo.
2. Applica questo ZIP con Applica Patch.command (solo 2 file).
3. Esegui Pubblica Tennis Player OS.command come al solito.
4. Non ricopiare o riapplicare lo ZIP completo v1.2.24.
5. Se il fallback fallisce, copia il nuovo output: includera' --debug.

Nota: non corregge necessariamente un problema sul lato Supabase; abilita
il metodo alternativo raccomandato per investigarlo/superarlo.
