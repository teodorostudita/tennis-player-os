// VR Lab — interpolazione dei keyframe del manichino (funzioni pure).
//
// Una clip è { duration, impactTime, keys: [{ t, ...campi }] } con keys ordinate
// per t. Ogni campo è un numero o un vettore [x, y, z]; tutte le chiavi devono
// avere gli stessi campi. Interpolazione di Hermite cubica con tangenti alle
// differenze finite (Catmull-Rom non uniforme): il movimento è continuo in
// velocità anche con keyframe a distanze diverse, e passa esattamente per ogni
// chiave, quindi la posa all'impatto è quella scritta nella clip.

function lerpValue(a, b, fn) {
  return Array.isArray(a) ? a.map((v, i) => fn(v, b[i], i)) : fn(a, b);
}

function tangent(keys, i, field) {
  const n = keys.length;
  if (i === 0 || i === n - 1) return lerpValue(keys[i][field], keys[i][field], () => 0);
  const prev = keys[i - 1];
  const next = keys[i + 1];
  const dt = next.t - prev.t;
  return lerpValue(prev[field], next[field], (a, b) => (b - a) / dt);
}

function hermite(p0, m0, p1, m1, u, h) {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0
    + (u3 - 2 * u2 + u) * h * m0
    + (-2 * u3 + 3 * u2) * p1
    + (u3 - u2) * h * m1;
}

// Restituisce la posa al tempo t (limitato all'intervallo della clip).
export function sampleClip(clip, t) {
  const { keys } = clip;
  const time = Math.min(clip.duration, Math.max(0, t));
  let i = 0;
  while (i < keys.length - 2 && time > keys[i + 1].t) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const h = b.t - a.t;
  const u = h > 0 ? Math.min(1, Math.max(0, (time - a.t) / h)) : 0;

  const pose = {};
  for (const field of Object.keys(a)) {
    if (field === 't') continue;
    const ma = tangent(keys, i, field);
    const mb = tangent(keys, i + 1, field);
    pose[field] = Array.isArray(a[field])
      ? a[field].map((v, j) => hermite(v, ma[j], b[field][j], mb[j], u, h))
      : hermite(a[field], ma, b[field], mb, u, h);
  }
  return pose;
}

// Unisce le chiavi comuni del corpo con quelle specifiche del colpo (stessi t).
export function mergeKeys(common, specific) {
  return common.map((key, i) => {
    if (specific[i]?.t !== undefined && specific[i].t !== key.t) {
      throw new Error(`Keyframe non allineati: ${specific[i].t} ≠ ${key.t}`);
    }
    return { ...key, ...specific[i] };
  });
}
