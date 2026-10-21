// VR Lab — modalità di occlusione dell'esercizio "Lettura del colpo".
// I tempi sono in secondi rispetto all'impatto racchetta-palla (negativi = prima).
import { OCCLUSION } from './physicsConfig.js?v=1.3.7';

export const OCCLUSION_MODES = Object.freeze({
  pre150: { label: '150 ms prima dell’impatto', short: '−150 ms', hidesOpponent: true },
  impact: { label: 'All’impatto', short: 'Impatto', hidesOpponent: true },
  net: { label: 'Al passaggio della rete', short: 'Rete', hidesOpponent: false },
  none: { label: 'Nessuna (familiarizzazione)', short: 'Nessuna', hidesOpponent: false },
});

export const DEFAULT_OCCLUSION_MODE = 'none';

export function normalizeOcclusionMode(mode) {
  return OCCLUSION_MODES[mode] ? mode : DEFAULT_OCCLUSION_MODE;
}

// Istante di scomparsa (null = sempre visibile). Dalla scomparsa in poi parte
// la fase di risposta; nei modi pre150 e impact si oscura anche l'avversario.
export function occlusionTime(mode, shot) {
  switch (mode) {
    case 'pre150': return -OCCLUSION.preImpactS;
    case 'impact': return 0;
    case 'net': return shot.net ? shot.net.t : null;
    default: return null;
  }
}

export function hidesOpponent(mode) {
  return Boolean(OCCLUSION_MODES[mode]?.hidesOpponent);
}
