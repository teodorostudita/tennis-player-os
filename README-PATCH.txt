TPOS v1.0.23 — Founding Beta endpoint hotfix

Corregge esclusivamente l'URL usato dalla Edge Function create-beta-owner:
da /TennisPlayerOS/beta-owner-invite.php
a /tennis-player-os-site/beta-owner-invite.php

Il file beta-owner-invite.php deve restare sul server nella cartella reale del sito:
www.polidorionline.it/tennis-player-os-site/

Dopo Applica Patch.command eseguire Pubblica Tennis Player OS.command.
Non è richiesta alcuna nuova migration SQL.
