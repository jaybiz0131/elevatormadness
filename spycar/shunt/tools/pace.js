// Bot pace (driver control): the bots drive the throttle themselves now. Injected into the page by playtest.mjs and simtest.mjs as a string.
// pace(g, inp, style): style 'skilled' floors it, brakes to the grip speed of a hard corner just in time and drifts it on the e-brake; 'casual' floors
// it and brakes early; 'weak' runs at 80% throttle and brakes late. A civilian dead ahead is braked for. The throttle goes in through the puck.
export const PACE = `window.__pace = (g, inp, style) => {
  let thr = style === 'weak' ? 0.8 : 1, eb = false; const v = g.speed, a = g.road.at(g.dist);
  const cn = g.road.cornerAhead(g.dist, Math.max(600, v * 1.8));
  if (cn && cn.hard) { const vC = Math.sqrt(1500 * cn.R) * (style === 'skilled' ? 1.08 : style === 'casual' ? 0.95 : 1.12); const inIt = g.dist > cn.s0 - 60 && g.dist < cn.s1;
    const need = (v * v - vC * vC) / (2 * 1250) + (style === 'weak' ? -40 : style === 'casual' ? 80 : 10);
    if (inIt) { thr = v < vC * (style === 'skilled' ? 1.25 : 1.05) ? 1 : 0; if (style === 'skilled' && v > 430 && !g.drifting && g.dist < cn.apex) eb = true; }
    else if (need > cn.s0 - g.dist) thr = -1; }
  if (g.cars.some(c => c.alive && !c.wrecked && c.kind === 'civ' && Math.abs(c.x - g.x) < 34 && c.y - g.dist > 30 && c.y - g.dist < 90 + v * 0.12) && v > 300 && style !== 'weak') thr = Math.min(thr, -0.6);
  // turned round by accident (a 180): pull the e-brake with the thumb hard over to swing back, then drive on
  if (g.face < 0 && !g.flip) { thr = Math.abs(v) < 200 ? 1 : 0.3; eb = Math.abs(v) > 180; inp.cur = { x: 200 + 130, y: inp.cur ? inp.cur.y : 700 }; }
  inp.raw = true; inp.puckId = 77; inp.puckThr = thr; inp.puckEb = eb; inp.puckFire = false; inp.gas = false; inp.brake = false; inp.ebHeld = false; };`;
