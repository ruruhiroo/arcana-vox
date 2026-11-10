// 隠し部屋と封印の間
//   ひびの入った壁: 攻撃の術を当てると砕けて、奥の小部屋に入れる
//   封印の扉: 刻まれた言霊を近くで唱えると開く
import * as THREE from 'three';
import { G } from './state.js';
import { CELL } from './dungeon.js';
import { WORD_BY_ID } from './lexicon.js';

let list = [];

function crackTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  // 放射状に走るひび
  const line = (x0, y0, a, len, w) => {
    x.lineWidth = w; x.beginPath(); x.moveTo(x0, y0);
    let px = x0, py = y0;
    for (let i = 0; i < 6; i++) {
      a += (Math.random() - 0.5) * 0.9;
      px += Math.cos(a) * len / 6; py += Math.sin(a) * len / 6; x.lineTo(px, py);
      if (w > 1.5 && Math.random() < 0.35) { x.stroke(); line(px, py, a + (Math.random() - 0.5) * 2, len * 0.45, w * 0.55); x.lineWidth = w; x.beginPath(); x.moveTo(px, py); }
    }
    x.stroke();
  };
  x.strokeStyle = 'rgba(8,6,4,0.95)'; x.lineCap = 'round';
  for (let i = 0; i < 9; i++) line(128, 140, i / 9 * Math.PI * 2 + Math.random() * 0.4, 70 + Math.random() * 60, 5);
  // 割れ目の奥から漏れる薄明かり
  const g = x.createRadialGradient(128, 140, 2, 128, 140, 40);
  g.addColorStop(0, 'rgba(160,200,255,0.55)'); g.addColorStop(1, 'rgba(160,200,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function sealTex(core) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.translate(128, 128);
  x.strokeStyle = '#bfe4ff'; x.shadowColor = '#7fc8ff'; x.shadowBlur = 14;
  x.lineWidth = 5; x.beginPath(); x.arc(0, 0, 112, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 96, 0, Math.PI * 2); x.stroke();
  for (let i = 0; i < 12; i++) { // 外周の刻み
    const a = i / 12 * Math.PI * 2;
    x.beginPath(); x.moveTo(Math.cos(a) * 96, Math.sin(a) * 96); x.lineTo(Math.cos(a) * 112, Math.sin(a) * 112); x.stroke();
  }
  x.lineWidth = 2; x.beginPath();
  for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2 - Math.PI / 2; const px = Math.cos(a) * 92, py = Math.sin(a) * 92; i ? x.lineTo(px, py) : x.moveTo(px, py); }
  x.stroke();
  x.fillStyle = '#eaf6ff'; x.font = `bold ${core.length > 1 ? 64 : 92}px "Yu Mincho", "Hiragino Mincho ProN", serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(core, 0, 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildSecrets(d, scene) {
  clearSecrets(scene);
  for (const s of d.secrets || []) {
    const [fx, fy] = s.from, dx = s.cell[0] - fx, dy = s.cell[1] - fy;
    // 扉側から見た壁の面
    const face = new THREE.Vector3((fx + 0.5 + dx * 0.5) * CELL - dx * 0.03, (s.h || 0) + 1.7, (fy + 0.5 + dy * 0.5) * CELL - dy * 0.03);
    const sealed = s.kind === 'sealed', core = sealed ? WORD_BY_ID[s.word]?.core || '?' : '';
    const mat = sealed
      ? new THREE.MeshBasicMaterial({ map: sealTex(core), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 })
      : new THREE.MeshStandardMaterial({ map: crackTex(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    const size = sealed ? 2.4 : 2.6;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.position.copy(face); mesh.rotation.y = Math.atan2(-dx, -dy);
    scene.add(mesh);
    let light = null;
    if (sealed) { light = new THREE.PointLight(0x8fd0ff, 3, 7, 2); light.position.copy(face).add(new THREE.Vector3(-dx * 0.6, 0, -dy * 0.6)); scene.add(light); }
    list.push({ ...s, mesh, light, face, core, opened: false, hinted: false });
  }
}

export function clearSecrets(scene) {
  for (const s of list) { scene.remove(s.mesh); if (s.light) scene.remove(s.light); s.mesh.material.map?.dispose(); s.mesh.material.dispose(); s.mesh.geometry.dispose(); }
  list = [];
}

// 毎フレーム: 封印の明滅、ひびから漏れる塵、近づいた時の手掛かり
export function updateSecrets(dt, player, ui) {
  for (const s of list) {
    if (s.opened) continue;
    const d = player ? player.pos.distanceTo(s.face) : 99;
    if (s.kind === 'sealed') {
      const k = 0.75 + 0.25 * Math.sin(G.time * 2.4 + s.cell[0]);
      s.mesh.material.opacity = k; if (s.light) s.light.intensity = 2 + 2 * k;
    } else if (d < 14 && Math.random() < dt * 1.5) {
      G.particles?.emit(s.face.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, -0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2)), new THREE.Vector3(0, -0.3, 0), 0x9a8f80, 0.05, 1.4);
    }
    if (!s.hinted && d < 6.5) {
      s.hinted = true;
      if (s.kind === 'sealed') { ui.banner('封印の扉', `「${s.core}」の言霊を唱えると、封印が解ける`, 4); ui.log(`封印の扉 — 「${s.core}」を含む詠唱を近くで唱えよ`, '#9fd8ff'); }
      else ui.log('壁のひびから風が漏れている…術を当てれば崩れそうだ', '#d8c8a8');
    }
  }
}

// 術が壁に当たった: ひびの壁なら砕ける
export function crackedAt(pos) {
  for (const s of list) {
    if (s.opened || s.kind !== 'secret') continue;
    const cx = (s.cell[0] + 0.5) * CELL, cz = (s.cell[1] + 0.5) * CELL;
    if (Math.abs(pos.x - cx) < CELL * 0.75 && Math.abs(pos.z - cz) < CELL * 0.75) return s;
  }
  return null;
}

// 詠唱が聞こえた: 近くの封印に刻まれた言霊が含まれていれば開く
export function sealFor(ids, pos) {
  for (const s of list) if (!s.opened && s.kind === 'sealed' && ids.includes(s.word) && pos.distanceTo(s.face) < 11) return s;
  return null;
}

// 壁が崩れた(自分の術でも、仲間の術でも): 開いた隠し部屋を片付けて知らせる
export function onDig(cells, scene, ui, fx) {
  for (const s of list) {
    if (s.opened || !cells.some(([x, y]) => x === s.cell[0] && y === s.cell[1])) continue;
    s.opened = true;
    scene.remove(s.mesh); if (s.light) scene.remove(s.light);
    if (s.kind === 'sealed') { ui.banner('封印が解けた', '奥に封じられていた間が開いた', 3.5); fx?.burst(s.face.clone(), 0x9fd8ff, 80, { speed: 4, up: 1.5 }); }
    else ui.banner('隠し部屋', '崩れた壁の奥に、小部屋が隠されていた', 3.5);
    G.stats && (G.stats.secrets = (G.stats.secrets || 0) + 1);
  }
}
