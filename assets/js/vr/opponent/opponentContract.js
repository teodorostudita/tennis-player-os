// VR Lab — contratto dell'avversario animato.
//
// Fisica, occlusione, serie e feedback usano l'avversario SOLO attraverso questa
// interfaccia. Il manichino a keyframe (mannequin.js) è la prima implementazione;
// un avversario da motion capture (GLTF + AnimationClip con un osso "racchetta"
// e l'istante d'impatto marcato) potrà sostituirlo implementando gli stessi metodi.
//
//   opponent.object3d                      THREE.Object3D da aggiungere alla scena
//   opponent.prepare({ shotType, placement })
//       → { duration, impactTime, contact: { x, y, z } }
//       duration e impactTime in secondi dall'inizio del gesto; contact è il
//       centro della palla al frame d'impatto, in coordinate del campo: la palla
//       parte esattamente da lì.
//   opponent.pose({ shotType, placement, clipTime })
//       mette l'avversario nella posa del gesto al tempo clipTime (limitato a
//       [0, duration]); placement = { x, z, yaw } (yaw: rotazione attorno a y).
//   opponent.setVisible(visible)
//
// Vincolo per non rivelare il colpo: tutti i gesti devono avere la stessa
// durata e lo stesso impactTime, e lo stesso aspetto (colori, materiali).

export const OPPONENT_METHODS = Object.freeze(['prepare', 'pose', 'setVisible']);

export function assertOpponent(opponent) {
  const missing = OPPONENT_METHODS.filter(name => typeof opponent?.[name] !== 'function');
  if (!opponent?.object3d) missing.unshift('object3d');
  if (missing.length) throw new Error(`Avversario VR incompleto: manca ${missing.join(', ')}`);
  return opponent;
}
