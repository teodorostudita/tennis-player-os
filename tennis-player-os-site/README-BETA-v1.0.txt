TENNIS PLAYER OS — FOUNDING BETA v1.0
=====================================

Questa versione introduce il modello Founding Beta con 30 Beta Owner.

PUBBLICO
- 30 account Beta Owner totali.
- Accesso completo e gratuito per tutta la durata della Beta.
- Nessuna carta richiesta e nessun rinnovo automatico.
- Possibilità di proporre nuove funzioni/modifiche durante la Beta.
- Contatore pubblico: assegnati / 30 e posti rimanenti.
- Quando i 30 posti sono esauriti, il form resta aperto come lista d'attesa.

CONTATORE
Il sito legge beta-status.php.
beta-status.php legge beta-program.php.

In beta-program.php:
  'capacity' => 30,
  'active' => 0,

Per ora, ogni volta che viene attivato manualmente un nuovo Beta Owner,
aumentare 'active' di 1. Il sito si aggiorna automaticamente al caricamento.

Esempio dopo 4 account attivati:
  'capacity' => 30,
  'active' => 4,

Il collegamento automatico al provisioning degli account nella app/Supabase
può sostituire in seguito questa sorgente senza cambiare la UI pubblica.

EMAIL
beta-request.php continua a usare l'SMTP configurato in mail-config.php.
NON sovrascrivere mail-config.php sul server se contiene già la password
specifica per l'app iCloud funzionante.

Il form ora invia anche:
- profilo di interesse (solo informativo; non determina i permessi)
- eventuale messaggio / feature request iniziale
- stato Founding Beta / lista d'attesa
- posti attivi e rimanenti

FILE DA CARICARE PER LA PATCH
- index.html
- styles.css
- app.js
- beta-request.php
- beta-status.php
- beta-program.php
- .htaccess

ATTENZIONE
beta-program.php è protetto dall'.htaccess e non deve essere accessibile
direttamente dal browser.
