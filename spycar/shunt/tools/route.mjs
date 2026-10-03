// Lists the road ahead for candidate seeds: corner types and the second they arrive at cruise speed, so the beauty route can be picked.
import { Road } from '../src/sim/road.js';
for (let seed = Number(process.argv[2] || 1); seed <= Number(process.argv[3] || 20); seed++) {
  const r = new Road(seed); r.ensure(60000);
  const items = []; for (const c of r.corners) if (c.s0 < 48000) items.push(`${Math.round(c.s0 / 480)}s ${c.type[0]}${c.dir > 0 ? 'R' : 'L'}${c.type === 'hairpin' ? Math.round(c.R) : ''}`);
  const secs = r.sectors.filter(s => s.s0 < 48000).map(s => s.kind[0] + s.lanes + '@' + Math.round(s.s0 / 480) + 's').join(' ');
  console.log('seed', seed, '|', secs, '|', items.join(' '));
}
