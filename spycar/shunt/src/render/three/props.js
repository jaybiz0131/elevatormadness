// Roadside and on-road furniture: rail posts every 120 pt and props every 160 pt from propHash (tree, lamp post, billboard), the
// corner furniture (painted arrow and name board 2.2 s before a hard corner, chevron boards along the outside, spectators at hairpins),
// signs, ramps, barrels, cones, crates, roadblocks, medians, oil slicks and the gap pit. Everything repeated is an InstancedMesh.
import { InstancedMesh, BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry, PlaneGeometry, MeshStandardMaterial, MeshBasicMaterial, Object3D, Color, Group, Mesh, CanvasTexture, DoubleSide } from 'three';
import { REF, T, hashI, clamp } from '../../sim/constants.js';
import { M, toWorld, toWorldFlat } from './scale.js';
import { arrowTexture } from './fx.js';
import { KIT, kitMaterial } from './kit.js';
const D = new Object3D(); const P = { x: 0, y: 0, z: 0 };
function inst(geo, mat, n, shadow = true) { const m = new InstancedMesh(geo, mat, n); m.count = 0; m.castShadow = shadow; m.receiveShadow = false; m.frustumCulled = false; return m; }
function textTexture(text, w, h, bg, fg, size) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.font = '700 ' + size + 'px Rajdhani, Arial, sans-serif'; { const mw = x.measureText(text).width; if (mw > w * 0.9) x.font = '700 ' + Math.floor(size * w * 0.9 / mw) + 'px Rajdhani, Arial, sans-serif'; } x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 2); const t = new CanvasTexture(c); t.colorSpace = 'srgb'; return t; }
export class Props {
  constructor(scene) {
    this.scene = scene; this.group = new Group(); scene.add(this.group);
    const std = (c, extra) => new MeshStandardMaterial(Object.assign({ color: new Color(c), roughness: 0.8 }, extra || {}));
    // the built props come from the kit (one merged geometry each, one shared material with per-vertex glow)
    const kit = this.kitMat = kitMaterial();
    this.post = inst(KIT.post(), kit, 64);
    this.tree = inst(KIT.tree(), kit, 48);
    this.lamp = inst(KIT.lamp(), kit, 48);
    this.board = inst(KIT.board(), kit, 48);
    this.chevronR = inst(KIT.chevron('#ff3b3b', 1), kit, 96, false); this.chevronRL = inst(KIT.chevron('#ff3b3b', -1), kit, 96, false);
    this.chevronY = inst(KIT.chevron('#ffd23f', 1), kit, 96, false); this.chevronYL = inst(KIT.chevron('#ffd23f', -1), kit, 96, false);
    this.spectator = inst(KIT.spectator('#3a6ea8'), kit, 96);
    this.cone = inst(KIT.cone(), kit, 32);
    this.barrel = inst(KIT.barrel(), kit, 32);
    this.crate = inst(KIT.crate(), kit, 16);
    this.block = inst(KIT.block(), kit, 32);
    this.median = inst(KIT.median(), kit, 96);
    this.ramp = inst(KIT.ramp(), kit, 8);
    this.arrow = inst(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: new Color('#ffd23f'), map: arrowTexture(64), transparent: true, opacity: 0.85, depthWrite: false }), 24, false);
    this.slick = inst(new CylinderGeometry(1, 1, 0.02, 16), new MeshStandardMaterial({ color: new Color('#0a0a14'), roughness: 0.05, metalness: 0.6 }), 16, false);
    this.pit = inst(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: new Color('#0b0d12') }), 8, false);
    this.stripe = inst(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: new Color('#ff3b3b'), transparent: true, opacity: 0.8, depthWrite: false }), 16, false);
    this.sign = inst(KIT.gantry(), kit, 8);
    this.signPost = inst(KIT.signPost(), kit, 16);
    this.all = [this.stripe, this.post, this.tree, this.lamp, this.board, this.chevronR, this.chevronRL, this.chevronY, this.chevronYL, this.spectator, this.cone, this.barrel, this.crate, this.block, this.median, this.ramp, this.arrow, this.slick, this.pit, this.sign, this.signPost];
    for (const m of this.all) this.group.add(m);
    this.labels = new Map(); this.labelGroup = new Group(); this.group.add(this.labelGroup); this.labelPool = [];
  }
  // Jack's billboard and roadwork-cone models replace the kit billboard and roadblock (propModels.js)
  setPropModels(meshes) { this.glb = {}; for (const n of ['billboard', 'cones']) if (meshes[n]) { this.glb[n] = meshes[n]; this.all.push(meshes[n]); } this.hasLampModel = !!meshes.street_lamp; }
  begin() { for (const m of this.all) m.count = 0; this.labelsUsed = 0; }
  put(m, G, x, s, yaw, sx = 1, sy = 1, sz = 1, lift = 0) { if (m.count >= m.instanceMatrix.count) return; toWorld(G.road, x, s, D.position); D.position.y += lift; D.rotation.set(0, -(G.road.frame(s).psi + yaw), 0); D.scale.set(sx, sy, sz); D.updateMatrix(); m.setMatrixAt(m.count++, D.matrix); }
  end() { for (const m of this.all) if (m.count) m.instanceMatrix.needsUpdate = true; for (let i = this.labelsUsed; i < this.labelPool.length; i++) this.labelPool[i].visible = false; }
  // a text board (corner name, district sign): a pooled plane with a canvas texture per distinct text
  label(G, text, x, s, lift, w, h, bg, fg, size, yaw = 0, flat = false) {
    let mesh = this.labelPool[this.labelsUsed]; if (!mesh) { mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ side: DoubleSide, transparent: true })); this.labelPool.push(mesh); this.labelGroup.add(mesh); }
    this.labelsUsed++; let tex = this.labels.get(text); if (!tex) { tex = textTexture(text, 256, 64, bg, fg, size); this.labels.set(text, tex); } if (mesh.material.map !== tex) { mesh.material.map = tex; mesh.material.needsUpdate = true; }
    toWorld(G.road, x, s, mesh.position); mesh.position.y += lift; mesh.rotation.set(flat ? -Math.PI / 2 : 0, -(G.road.frame(s).psi + yaw), 0, 'YXZ'); mesh.scale.set(w, h, 1); mesh.visible = true;
  }
  update(G, scroll, yTop, elapsed) {
    this.begin(); const road = G.road; const seedHash = (s) => hashI(road.seed, Math.round(s / 160)) / 4294967296;
    const s0 = Math.floor((scroll - 240) / 40) * 40;
    for (let s = s0; s <= yTop; s += 40) {
      const a = road.at(s); const w = a.width;
      if (s % 120 === 0) for (const side of [-1, 1]) this.put(this.post, G, REF + side * (w / 2 + 11), s, side > 0 ? Math.PI : 0);   // reflector faces the road
      if (s % 160 === 0 && !(a.corner && a.corner.hard)) { const h = seedHash(s); const side = h < 0.5 ? -1 : 1; const kind = Math.floor(h * 1000) % 3; const off = 50 + ((h * 7919) % 1) * 110; const x = REF + side * (w / 2 + off);
        if (kind === 0) this.put(this.tree, G, x, s, h * 6, 1 + h * 0.4, 1 + h * 0.4, 1 + h * 0.4);
        else if (kind === 1) { if (this.hasLampModel) this.put(this.tree, G, x, s, h * 6, 1.2, 1.2, 1.2); else this.put(this.lamp, G, x, s, side > 0 ? Math.PI : 0); }   // the street lamps proper stand at the light pools (city.js)
        else this.put((this.glb && this.glb.billboard) || this.board, G, x, s, 0); }
    }
    // corner furniture
    for (let i = Math.max(0, road.ci2 || 0); i < road.corners.length; i++) { const cn = road.corners[i]; if (cn.s1 < scroll - 200) continue; if (cn.warnS - 200 > yTop) break;
      const hard = cn.hard;
      if (cn.type === 'hairpin' && cn.warnS > scroll - 100 && cn.warnS < yTop) { const bw = road.at(cn.warnS).width; for (let j = 0; j < 3; j++) this.put(this.stripe, G, REF, cn.warnS - 70 - j * 24, 0, bw * M * 0.96, 1, 0.9, 0.025); this.label(G, 'BRAKE', REF, cn.warnS - 40, 0.03, 7, 1.8, '#ff3b3b', '#ffffff', 48, 0, true); }
      if (cn.warnS > scroll - 100 && cn.warnS < yTop) { this.put(this.arrow, G, REF, cn.warnS, cn.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 6, 1, 5, 0.02); this.arrow.material.color.set(hard ? '#ff3b3b' : '#ffd23f'); const bw = road.at(cn.warnS).width; this.label(G, cn.type === 'hairpin' ? 'HAIRPIN' : cn.type === 'hard' ? 'HARD ' + (cn.dir > 0 ? 'RIGHT' : 'LEFT') : cn.type === 'fast' ? 'BEND' : 'SWEEP', REF - cn.dir * (bw / 2 + 40), cn.warnS + 60, 2.2, 5.2, 1.4, hard ? '#ff3b3b' : '#ffd23f', hard ? '#ffffff' : '#222222', 40); this.put(this.signPost, G, REF - cn.dir * (bw / 2 + 40), cn.warnS + 60, 0, 1, 0.8, 1); }
      for (let cs = cn.s0; cs <= cn.s1; cs += T.corner.chevronEvery) { if (cs < scroll - 100 || cs > yTop) continue; const w = road.at(cs).width; const x = REF - cn.dir * (w / 2 + 26); this.put(hard ? (cn.dir > 0 ? this.chevronR : this.chevronRL) : (cn.dir > 0 ? this.chevronY : this.chevronYL), G, x, cs, cn.dir > 0 ? 0.35 : -0.35); }
      if (cn.type === 'hairpin') for (let cs = cn.s0 + 30; cs < cn.s1; cs += 34) { if (cs < scroll - 100 || cs > yTop) continue; const w = road.at(cs).width; const hsp = hashI(road.seed, Math.round(cs)) / 4294967296; this.put(this.spectator, G, REF - cn.dir * (w / 2 + 48 + hsp * 24), cs, 0, 1, 0.9 + hsp * 0.3, 1); }
    }
    for (const g of G.signs) { if (g.y < scroll || g.y > yTop) continue; this.put(this.sign, G, REF, g.y, 0); this.label(G, g.text, REF, g.y - 2, 4.0, 11, 2.2, '#1f6b3a', '#ffffff', g.big ? 44 : 34); }
    for (const rp of G.ramps) { if (rp.y < scroll - 120 || rp.y > yTop) continue; this.put(this.ramp, G, rp.x, rp.y - 5, 0, rp.w * M, 2.4, 60 * M, 0); if (rp.crate && !rp.crate.taken) this.put(this.crate, G, rp.x, rp.y + 240, elapsed, 1, 1, 1, 70 * M + Math.sin(elapsed * 4) * 0.3); }
    for (const b of G.barrels) if (b.alive && b.y > scroll - 120 && b.y < yTop) this.put(this.barrel, G, b.x, b.y, 0);
    for (const c of G.cones) if (c.alive && c.y > scroll - 120 && c.y < yTop) this.put(this.cone, G, c.x, c.y, 0);
    for (const cr of G.crates) if (cr.y > scroll - 120 && cr.y < yTop) this.put(this.crate, G, cr.x, cr.y, cr.t * 2, 1, 1, 1, 0.3 + Math.sin(cr.t * 5) * 0.3);
    for (const b of G.barriers) if (!b.hit && b.y > scroll - 120 && b.y < yTop) { const x0 = road.laneX(b.y, b.lane0) - T.laneW / 2, x1 = road.laneX(b.y, b.lane0 + b.lanes - 1) + T.laneW / 2; for (let x = x0 + 12; x < x1; x += 24) { if (this.glb && this.glb.cones) this.put(this.glb.cones, G, x, b.y, 0); else this.put(this.block, G, x, b.y, 0, 1.7, 1, 1); } }
    for (const m of G.medians) for (let s = Math.max(m.y0, scroll - 100); s < Math.min(m.y1, yTop); s += 40) { const x0 = road.laneX(s, m.lane0) - 6, x1 = road.laneX(s, m.lane0 + m.lanes - 1) + 6; this.put(this.median, G, (x0 + x1) / 2, s + 20, 0, (x1 - x0) * M, 1, 40 * M); }
    for (const s of G.slicks) this.put(this.slick, G, s.x, s.y, 0, s.r * 1.4 * M, 1, s.r * M, 0.02);
    for (const g of G.gaps) for (let s = Math.max(g.y0, scroll - 100); s < Math.min(g.y1, yTop); s += 40) { const w = road.at(s).width; this.put(this.pit, G, REF + 20, s + 20, 0, (w - 40) * M, 1, 40 * M, 0.03); }
    this.end();
  }
}
