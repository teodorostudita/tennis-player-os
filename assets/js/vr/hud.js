// VR Lab — pannello di testo nel mondo 3D (canvas → texture).
import * as THREE from 'three';

const PX_PER_METER = 420;

export function createPanel({ width = 2.4, height = 1.2 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * PX_PER_METER);
  canvas.height = Math.round(height * PX_PER_METER);
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  mesh.renderOrder = 10;

  // lines: [{ text, size = 1, color, weight }]; size è relativo all'altezza base.
  function draw(lines = []) {
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);

    const radius = 36;
    ctx.fillStyle = 'rgba(11, 31, 58, 0.86)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, radius);
    ctx.fill();

    const base = h / 9;
    const blocks = lines.map(line => ({
      ...line,
      px: Math.round(base * (line.size || 1)),
    }));
    const total = blocks.reduce((sum, b) => sum + b.px * 1.3, 0);
    let y = (h - total) / 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const block of blocks) {
      ctx.font = `${block.weight || 600} ${block.px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.fillStyle = block.color || '#ffffff';
      ctx.fillText(block.text, w / 2, y, w - 60);
      y += block.px * 1.3;
    }
    texture.needsUpdate = true;
  }

  return { mesh, draw };
}
