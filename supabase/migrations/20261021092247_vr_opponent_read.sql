-- Tennis Player OS v1.3.7
-- VR Lab: esercizio "Lettura del colpo" (drill_key 'opponent_read') con avversario animato.
-- Tipo di colpo, rotazione e dati del rimbalzo di ogni colpo stanno in `trials`
-- (jsonb), l'errore medio per tipo di colpo in `summary.byShotType`.
-- Qui solo una colonna calcolata con la modalità di occlusione della serie,
-- per filtrare e confrontare le serie: l'app non la scrive, quindi funziona
-- anche prima che questa migration venga applicata. Non distruttiva.

alter table public.vr_training_sessions
  add column if not exists occlusion_mode text
  generated always as (settings -> 'occlusion' ->> 'mode') stored;

comment on column public.vr_training_sessions.occlusion_mode is
  'Occlusion mode of the series, from settings.occlusion.mode (opponent_read: pre150 | impact | net | none; legacy bounce_prediction: distance | none).';

create index if not exists vr_training_sessions_occlusion_idx
  on public.vr_training_sessions (athlete_id, drill_key, occlusion_mode, completed_at desc);
