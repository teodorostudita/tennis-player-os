// VR Lab · Altezza — sorveglianza di sicurezza sulla posa della testa.
// Funzioni pure (nessuna dipendenza da three), verificabili con Node.
//
// Due condizioni portano a dissolvenza + pausa:
// - "drop": la testa scende di colpo (caduta, accovacciamento improvviso) oppure
//   finisce molto sotto l'altezza degli occhi registrata alla partenza;
// - "area": la testa esce dall'area calibrata attorno all'asse.

export const DROP = Object.freeze({
  windowS: 0.6, // finestra in cui si misura la discesa
  rapidM: 0.4, // discesa entro la finestra che fa scattare la pausa
  minFraction: 0.55, // sotto questa frazione dell'altezza di partenza: pausa
});

export function isInsideArea(area, p) {
  if (area.kind === 'circle') return Math.hypot(p.x - area.x, p.z - area.z) <= area.radius;
  return p.x >= area.minX && p.x <= area.maxX && p.z >= area.minZ && p.z <= area.maxZ;
}

export function createSafetyMonitor(options = {}) {
  const cfg = { ...DROP, ...options };
  let samples = [];
  let eyeHeight = 0;
  let area = null;

  return {
    // eyeHeightM: altezza degli occhi registrata in posizione di partenza.
    arm(eyeHeightM, safeAreaDef) {
      eyeHeight = eyeHeightM;
      area = safeAreaDef;
      samples = [];
    },
    disarm() {
      area = null;
      samples = [];
    },
    get armed() { return Boolean(area); },
    // t in secondi, head = { x, y, z } in coordinate trave. Restituisce
    // null oppure { reason: 'drop' | 'area', detail }.
    check(t, head) {
      if (!area) return null;
      samples.push({ t, y: head.y });
      while (samples.length && samples[0].t < t - cfg.windowS) samples.shift();
      const peak = samples.reduce((max, s) => Math.max(max, s.y), head.y);
      if (peak - head.y >= cfg.rapidM) {
        return { reason: 'drop', detail: `discesa rapida di ${Math.round((peak - head.y) * 100)} cm` };
      }
      if (head.y < eyeHeight * cfg.minFraction) {
        return { reason: 'drop', detail: `testa a ${Math.round(head.y * 100)} cm (partenza ${Math.round(eyeHeight * 100)} cm)` };
      }
      if (!isInsideArea(area, head)) {
        return { reason: 'area', detail: `fuori dall'area (x ${head.x.toFixed(2)} m, z ${head.z.toFixed(2)} m)` };
      }
      return null;
    },
  };
}
