// Roadside and on-road furniture: rail posts every 120 pt and props every 160 pt from propHash (tree, lamp post, billboard), the
// corner furniture (painted arrow and name board 2.2 s before a hard corner, chevron boards along the outside, spectators at hairpins),
// signs, ramps, barrels, cones, crates, roadblocks, medians, oil slicks and the gap pit. Everything repeated is an InstancedMesh.
import { InstancedMesh, BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry, PlaneGeometry, MeshStandardMaterial, MeshBasicMaterial, Object3D, Color, Group, Mesh, CanvasTexture, DoubleSide } from 'three';
import { REF, T, hashI, clamp } from '../../sim/constants.js';
import { M, toWorld, toWorldFlat } from './scale.js';
const D = new Object3D(); const P = { x: 0, y: 0, z: 0 };
function inst(geo, mat, n, shadow = true) { const m = new InstancedMesh(geo, mat, n); m.count = 0; m.castShadow = shadow; m.receiveShadow = false; m.frustumCulled = false; return m; }
function textTexture(text, w, h, bg, fg, size) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.font = '700 ' + size + 'px Rajdhani, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 2); const t = new CanvasTexture(c); t.colorSpace = 'srgb'; return t; }
export class Props {
  constructor(scene) {
    this.scene = scene; this.group = new Group(); scene.add(this.group);
    const std = (c, extra) => new MeshStandardMaterial(Object.assign({ color: new Color(c), roughness: 0.8 }, extra || {}));
    this.post = inst(new BoxGeometry(0.5, 0.9, 0.5).translate(0, 0.45, 0), std('#5d6675'), 64);
    this.treeTrunk = inst(new CylinderGeometry(0.2, 0.3, 2.2, 6).translate(0, 1.1, 0), std('#4a3a2a'), 48);
    this.treeTop = inst(new SphereGeometry(1.6, 8, 6).translate(0, 3.2, 0), std('#3c6b45'), 48);
    this.lamp = inst(new BoxGeometry(0.3, 6, 0.3).translate(0, 3, 0), std('#aab2bf'), 48);
    this.lampHead = inst(new BoxGeometry(1.2, 0.3, 0.6).translate(0.5, 6.1, 0), new MeshBasicMaterial({ color: new Color('#ffd27a') }), 48, false);
    this.board = inst(new BoxGeometry(5, 1.6, 0.2).translate(0, 2.6, 0), std('#2a2d33'), 48);
    this.boardFace = inst(new PlaneGeometry(4.4, 0.9).translate(0, 2.6, 0.12), new MeshBasicMaterial({ color: new Color('#ffd23f') }), 48, false);
    this.chevron = inst(new BoxGeometry(2.1, 1.3, 0.15).translate(0, 0.9, 0), new MeshBasicMaterial({ color: new Color('#ff3b3b') }), 96, false);
    this.chevronY = inst(new BoxGeometry(2.1, 1.3, 0.15).translate(0, 0.9, 0), new MeshBasicMaterial({ color: new Color('#ffd23f') }), 96, false);
    this.chevMark = inst(new BoxGeometry(0.8, 0.5, 0.05).translate(0, 0.9, 0.1), new MeshBasicMaterial({ color: new Color('#111111') }), 192, false);
    this.spectator = inst(new CylinderGeometry(0.25, 0.25, 1.7, 6).translate(0, 0.85, 0), std('#e8d8c0'), 96);
    this.cone = inst(new ConeGeometry(0.45, 1.1, 8).translate(0, 0.55, 0), std('#ff9f1c'), 32);
    this.barrel = inst(new CylinderGeometry(0.55, 0.55, 1.6, 10).translate(0, 0.8, 0), std('#ff9f1c'), 32);
    this.crate = inst(new BoxGeometry(1.5, 1.5, 1.5).translate(0, 0.75, 0), std('#ffd23f', { emissive: new Color('#ffd23f'), emissiveIntensity: 0.4 }), 16);
    this.block = inst(new BoxGeometry(1, 1.2, 0.8).translate(0, 0.6, 0), std('#ff9f1c'), 32);
    this.median = inst(new BoxGeometry(1, 0.9, 1).translate(0, 0.45, 0), std('#8a8f99'), 96);
    this.ramp = inst(new BoxGeometry(1, 1, 1), std('#dfe3e8'), 8);
    this.arrow = inst(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: new Color('#ffd23f'), transparent: true, opacity: 0.85 }), 24, false);
    this.slick = inst(new CylinderGeometry(1, 1, 0.02, 16), new MeshStandardMaterial({ color: new Color('#0a0a14'), roughness: 0.05, metalness: 0.6 }), 16, false);
    this.pit = inst(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: new Color('#0b0d12') }), 8, false);
    this.sign = inst(new BoxGeometry(12, 2.8, 0.2).translate(0, 2.4, 0), std('#1f6b3a'), 8);
    this.signPost = inst(new BoxGeometry(0.3, 2.4, 0.3).translate(0, 1.2, 0), std('#aab2bf'), 16);
    this.all = [this.post, this.treeTrunk, this.treeTop, this.lamp, this.lampHead, this.board, this.boardFace, this.chevron, this.chevronY, this.chevMark, this.spectator, this.cone, this.barrel, this.crate, this.block, this.median, this.ramp, this.arrow, this.slick, this.pit, this.sign, this.signPost];
    for (const m of this.all) this.group.add(m);
    this.labels = new Map(); this.labelGroup = new Group(); this.group.add(this.labelGroup); this.labelPool = [];
  }
  begin() { for (const m of this.all) m.count = 0; this.labelsUsed = 0; }
  put(m, G, x, s, yaw, sx = 1, sy = 1, sz = 1, lift = 0) { if (m.count >= m.instanceMatrix.count) return; toWorld(G.road, x, s, D.position); D.position.y += lift; D.rotation.set(0, -(G.road.frame(s).psi + yaw), 0); D.scale.set(sx, sy, sz); D.updateMatrix(); m.setMatrixAt(m.count++, D.matrix); }
  end() { for (const m of this.all) if (m.count) m.instanceMatrix.needsUpdate = true; for (let i = this.labelsUsed; i < this.labelPool.length; i++) this.labelPool[i].visible = false; }
  // a text board (corner name, district sign): a pooled plane with a canvas texture per distinct text
  label(G, text, x, s, lift, w, h, bg, fg, size, yaw = 0) {
    let mesh = this.labelPool[this.labelsUsed]; if (!mesh) { mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ side: DoubleSide, transparent: true })); this.labelPool.push(mesh); this.labelGroup.add(mesh); }
    this.labelsUsed++; let tex = this.labels.get(text); if (!tex) { tex = textTexture(text, 256, 64, bg, fg, size); this.labels.set(text, tex); } if (mesh.material.map !== tex) { mesh.material.map = tex; mesh.material.needsUpdate = true; }
    toWorld(G.road, x, s, mesh.position); mesh.position.y += lift; mesh.rotation.set(0, -(G.road.frame(s).psi + yaw), 0); mesh.scale.set(w, h, 1); mesh.visible = true;
  }
  update(G, scroll, yTop, elapsed) {
    this.begin(); const road = G.road; const seedHash = (s) => hashI(road.seed, Math.round(s / 160)) / 4294967296;
    const s0 = Math.floor((scroll - 240) / 40) * 40;
    for (let s = s0; s <= yTop; s += 40) {
      const a = road.at(s); const w = a.width;
      if (s % 120 === 0) for (const side of [-1, 1]) this.put(this.post, G, REF + side * (w / 2 + 11), s, 0);
      if (s % 160 === 0 && !(a.corner && a.corner.hard)) { const h = seedHash(s); const side = h < 0.5 ? -1 : 1; const kind = Math.floor(h * 1000) % 3; const off = 50 + ((h * 7919) % 1) * 110; const x = REF + side * (w / 2 + off);
        if (kind === 0) { this.put(this.treeTrunk, G, x, s, 0); this.put(this.treeTop, G, x, s, 0, 1 + h * 0.4, 1 + h * 0.4, 1 + h * 0.4); }
        else if (kind === 1) { this.put(this.lamp, G, x, s, 0); this.put(this.lampHead, G, x, s, 0, -side, 1, 1); }
        else { this.put(this.board, G, x, s, 0); this.put(this.boardFace, G, x, s, 0); } }
    }
    // corner furniture
    for (let i = Math.max(0, road.ci2 || 0); i < road.corners.length; i++) { const cn = road.corners[i]; if (cn.s1 < scroll - 200) continue; if (cn.warnS - 200 > yTop) break;
      const hard = cn.hard;
      if (cn.warnS > scroll - 100 && cn.warnS < yTop) { this.put(this.arrow, G, REF, cn.warnS, cn.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 5, 1, 6, 0.02); const bw = road.at(cn.warnS).width; this.label(G, cn.type === 'hairpin' ? 'HAIRPIN' : cn.type === 'hard' ? 'HARD ' + (cn.dir > 0 ? 'RIGHT' : 'LEFT') : cn.type === 'fast' ? 'BEND' : 'SWEEP', REF - cn.dir * (bw / 2 + 40), cn.warnS + 60, 2.2, 5.2, 1.4, hard ? '#ff3b3b' : '#ffd23f', hard ? '#ffffff' : '#222222', 40); this.put(this.signPost, G, REF - cn.dir * (bw / 2 + 40), cn.warnS + 60, 0, 1, 0.8, 1); }
      for (let cs = cn.s0; cs <= cn.s1; cs += T.corner.chevronEvery) { if (cs < scroll - 100 || cs > yTop) continue; const w = road.at(cs).width; const x = REF - cn.dir * (w / 2 + 26); this.put(hard ? this.chevron : this.chevronY, G, x, cs, cn.dir > 0 ? 0.35 : -0.35); this.put(this.chevMark, G, x, cs, cn.dir > 0 ? 0.35 : -0.35, 1, 1, 1); }
      if (cn.type === 'hairpin') for (let cs = cn.s0 + 30; cs < cn.s1; cs += 34) { if (cs < scroll - 100 || cs > yTop) continue; const w = road.at(cs).width; const hsp = hashI(road.seed, Math.round(cs)) / 4294967296; this.put(this.spectator, G, REF - cn.dir * (w / 2 + 48 + hsp * 24), cs, 0, 1, 0.9 + hsp * 0.3, 1); }
    }
    for (const g of G.signs) { if (g.y < scroll || g.y > yTop) continue; this.put(this.sign, G, REF, g.y, 0); for (const side of [-1, 1]) this.put(this.signPost, G, REF + side * 70, g.y, 0); this.label(G, g.text, REF, g.y, 2.4, 11, 2.2, '#1f6b3a', '#ffffff', g.big ? 44 : 34); }
    for (const rp of G.ramps) { if (rp.y < scroll - 120 || rp.y > yTop) continue; this.put(this.ramp, G, rp.x, rp.y - 10, 0, rp.w * M, 1.2, 100 * M * 0.5, 0); this.put(this.ramp, G, rp.x, rp.y + 25, 0, rp.w * M * 0.98, 2.4, 30 * M, 0); if (rp.crate && !rp.crate.taken) this.put(this.crate, G, rp.x, rp.y + 240, elapsed, 1, 1, 1, 70 * M + Math.sin(elapsed * 4) * 0.3); }
    for (const b of G.barrels) if (b.alive && b.y > scroll - 120 && b.y < yTop) this.put(this.barrel, G, b.x, b.y, 0);
    for (const c of G.cones) if (c.alive && c.y > scroll - 120 && c.y < yTop) this.put(this.cone, G, c.x, c.y, 0);
    for (const cr of G.crates) if (cr.y > scroll - 120 && cr.y < yTop) this.put(this.crate, G, cr.x, cr.y, cr.t * 2, 1, 1, 1, 0.3 + Math.sin(cr.t * 5) * 0.3);
    for (const b of G.barriers) if (!b.hit && b.y > scroll - 120 && b.y < yTop) { const x0 = road.laneX(b.y, b.lane0) - T.laneW / 2, x1 = road.laneX(b.y, b.lane0 + b.lanes - 1) + T.laneW / 2; for (let x = x0 + 12; x < x1; x += 24) this.put(this.block, G, x, b.y, 0, 1.7, 1, 1); }
    for (const m of G.medians) for (let s = Math.max(m.y0, scroll - 100); s < Math.min(m.y1, yTop); s += 40) { const x0 = road.laneX(s, m.lane0) - 6, x1 = road.laneX(s, m.lane0 + m.lanes - 1) + 6; this.put(this.median, G, (x0 + x1) / 2, s + 20, 0, (x1 - x0) * M, 1, 40 * M); }
    for (const s of G.slicks) this.put(this.slick, G, s.x, s.y, 0, s.r * 1.4 * M, 1, s.r * M, 0.02);
    for (const g of G.gaps) for (let s = Math.max(g.y0, scroll - 100); s < Math.min(g.y1, yTop); s += 40) { const w = road.at(s).width; this.put(this.pit, G, REF + 20, s + 20, 0, (w - 40) * M, 1, 40 * M, 0.03); }
    this.end();
  }
}
