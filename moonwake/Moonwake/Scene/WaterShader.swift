import Foundation

/// SpriteKit port of lookdev/index.html's fragment shader. Draws water, land,
/// the kill-edge, the moon path, lantern reflection, wake and fog in one
/// full-screen pass from a 1-D river profile texture.
///
/// Kept as a string so the shader never depends on resource copying. The
/// profile texture is RGBA8 with 16-bit values split across two channels
/// (see RiverProfileTexture). Row layout is symmetric so it reads correctly
/// whichever way SpriteKit orients the texture data.
enum WaterShader {
    static let profileLength = 2048      // texels along the river
    static let profileStep: Float = 4    // river points per texel
    static let profileRows = 5           // tip, island, profile, island, tip

    static let source = """
    // ---- uniforms (set from WaterNode / Lighting) ----
    // u_time is provided by SpriteKit.
    // u_view: screen size in points. u_scroll: world y at the bottom edge.
    // u_profile: river profile texture. u_craft: craft world position.
    // u_speed: 0 slow .. 1 fast. u_lantern: nearest lantern world xy (x < -500 = none).
    // u_profileBase: world y of texel 0 in u_profile.

    const float PERSP_Y = 0.45;
    const float PERSP_X = 0.12;
    const float PROFILE_STEP = 4.0;
    const float PROFILE_LEN = 2048.0;

    float hash21(vec2 p) { p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
    float vnoise(vec2 p) {
      // lattice wraps every 1024 cells so the hash stays precise on long runs
      vec2 i = mod(floor(p), 1024.0); vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = hash21(i); float b = hash21(i + vec2(1.0, 0.0)); float c = hash21(i + vec2(0.0, 1.0)); float d = hash21(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    float fbm3(vec2 p) {
      float v = 0.0; float a = 0.5;
      mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
      for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
      return v;
    }
    float fbm2(vec2 p) {
      float v = 0.5 * vnoise(p);
      p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.03 + 11.7;
      return v + 0.25 * vnoise(p);
    }
    float heightAt(vec2 p) {
      vec2 flow1 = vec2(0.0, u_time * 1.1);
      vec2 flow2 = vec2(u_time * 0.05, u_time * 0.45);
      return fbm3(p + flow1) * 0.6 + fbm3(p * 2.1 - flow2 + 5.0) * 0.4;
    }
    float dec16(float hi, float lo) { return (hi * 255.0 * 256.0 + lo * 255.0) / 65535.0; }
    vec4 rowAt(float row, float wy) {
      float t = (wy - u_profileBase) / PROFILE_STEP;
      float i0 = floor(t); float f = t - i0;
      float vrow = (row + 0.5) / 5.0;
      vec4 a = texture2D(u_profile, vec2((i0 + 0.5) / PROFILE_LEN, vrow));
      vec4 b = texture2D(u_profile, vec2((i0 + 1.5) / PROFILE_LEN, vrow));
      return mix(a, b, f);
    }

    void main() {
      vec2 uv = v_tex_coord;
      float v = uv.y;                       // 0 bottom .. 1 top
      float sx = uv.x * u_view.x;
      float cx = u_view.x * 0.5;
      float ls = 1.0 - PERSP_X * v;
      float ref = u_view.x / 390.0;         // screen points per reference point
      float wx = (cx + (sx - cx) / ls) / ref;   // world x in reference points
      float ahead = v * u_view.y * (1.0 + PERSP_Y * v);
      float wy = u_scroll + ahead;

      // ---- profile: rows 2 (bank), 1 (island), 0 (tip distance) ----
      vec4 p2 = rowAt(2.0, wy);
      vec4 p1 = rowAt(1.0, wy);
      vec4 p0 = rowAt(0.0, wy);
      float centerX = dec16(p2.r, p2.g) * 1024.0;
      float halfW   = dec16(p2.b, p2.a) * 1024.0;
      float islandX = dec16(p1.r, p1.g) * 1024.0;
      float islandHW = dec16(p1.b, p1.a) * 1024.0;
      float tipDist = dec16(p0.r, p0.g) * 4096.0 - 2048.0;

      float left = centerX - halfW; float right = centerX + halfW;
      float d = min(wx - left, right - wx);
      float lat = abs(wx - islandX) - islandHW;
      float di = (tipDist >= 0.0) ? lat : length(vec2(max(lat, 0.0), -tipDist));
      d = min(d, di);
      d *= ref;                              // distances in screen points from here on

      // ---- water ----
      float rs = 1.0 / (1.0 + 1.4 * v);
      vec2 aniso = vec2(0.022, 0.06);
      vec2 wuv = vec2(wx, wy) * aniso * rs;
      float h = heightAt(wuv);
      float n1 = h;
      float hx = heightAt(wuv + vec2(0.8 * aniso.x, 0.0));
      float hy = heightAt(wuv + vec2(0.0, 0.8 * aniso.y));
      vec3 n = normalize(vec3((h - hx) * 14.0, (h - hy) * 7.0, 1.0));

      float depth = clamp(d / (48.0 * ref), 0.0, 1.0);
      depth = depth * depth * (3.0 - 2.0 * depth);

      float bedY = u_scroll * 0.85 + ahead;
      float bed = fbm2(vec2(wx, bedY) * 0.07 * rs + 3.0);
      float caust = pow(max(0.0, 1.0 - abs(fract(bed * 3.0 + u_time * 0.15) - 0.5) * 2.0), 6.0);
      vec3 bedCol = u_shallow * (0.5 + 0.5 * bed) + u_shallow * caust * 0.2;

      vec3 water = mix(bedCol, u_deep, depth);
      float fres = 0.15 + 0.45 * v;
      water = mix(water, u_sky, fres * 0.22 * (0.6 + 0.4 * n.z));
      water *= 0.82 + 0.3 * n.x + 0.16 * n.y;

      // ---- moon path ----
      float moonX = u_moonX * u_view.x;
      float pw = u_pathWidth * ref * (1.0 - 0.55 * v);
      float dx = (sx - moonX) / pw;
      float band = exp(-dx * dx * 1.6);
      vec3 Lp = normalize(vec3((moonX - sx) / u_view.x * 0.35, 0.42, 0.9));
      float facet = max(0.0, dot(n, Lp));
      float flatF = Lp.z;
      float tilt = clamp((facet - flatF * 0.985) / (1.0 - flatF * 0.985), 0.0, 1.0);
      float glint = smoothstep(0.55, 0.95, tilt) * (0.5 + 0.5 * smoothstep(0.3, 0.7, n1));
      float broad = pow(tilt, 1.2);
      float path = band * (broad * 0.35 + glint * 1.3) * u_specAmt;
      float scatter = glint * 0.08 * u_specAmt;
      water += u_moon * (path + scatter) * depth;
      water += u_moon * band * 0.045 * depth;

      // ---- lantern reflection ----
      if (u_lantern.x > -500.0) {
        float lx = cx + (u_lantern.x * ref - cx) * ls;
        vec2 dl = vec2((sx - lx) / (22.0 * ref), (wy - u_lantern.y) / 110.0);
        float g = exp(-dot(dl, dl) * 0.5);
        float flick = 0.85 + 0.15 * sin(u_time * 6.0) * sin(u_time * 2.7 + 1.0);
        water += u_lanternCol * g * 0.55 * flick * (0.35 + 1.3 * broad + 2.0 * glint) * depth;
      }

      // ---- wake ----
      {
        float behind = u_craft.y - wy;
        float lateral = abs(wx - u_craft.x);
        float spread = 0.17 + 0.08 * u_speed;
        float halfWk = 6.0 + behind * spread;
        float decay = exp(-behind / (70.0 + 60.0 * u_speed));
        float onArm = exp(-pow(lateral - halfWk, 2.0) / (2.0 * 2.2 * 2.2));
        float coreS = 4.0 + behind * 0.05;
        float core = exp(-pow(lateral, 2.0) / (2.0 * coreS * coreS));
        float foamN = fbm2(vec2(wx * 0.3, wy * 0.15 - u_time * 2.5));
        float wake = step(0.0, behind) * decay * (onArm * 0.8 + core * 0.5) * (0.4 + 0.9 * foamN);
        water += vec3(0.75, 0.85, 0.95) * wake * 0.55;
        float aheadC = wy - u_craft.y;
        float bow = step(0.0, aheadC) * exp(-aheadC / 25.0) * exp(-pow(lateral, 2.0) / (2.0 * 12.0 * 12.0)) * 0.25;
        water += vec3(0.6, 0.7, 0.8) * bow;
      }

      // ---- land ----
      float landN = fbm2(vec2(wx, wy) * 0.02 * rs + 20.0);
      vec3 land = mix(u_land, u_landLit, landN * 0.6);
      float levee = smoothstep(-26.0 * ref, -2.0 * ref, d) * (1.0 - smoothstep(-2.0 * ref, 0.0, d));
      land = mix(land, u_landLit, levee * 0.55);
      float ext = (1.0 - smoothstep(-3.5 * ref, -0.5 * ref, d)) * smoothstep(-6.0 * ref, -3.5 * ref, d);
      land *= 1.0 - ext * 0.6;

      // ---- kill-edge ----
      float pulse = 1.0 + u_edgePulse * 0.35 * sin(u_time * 3.0);
      float edgeLine = 1.0 - smoothstep(0.0, 2.2 * ref, abs(d));
      float edgeGlow = exp(-max(d, 0.0) / (14.0 * ref)) * step(0.0, d) * 0.8;
      float foam = (1.0 - smoothstep(0.0, 9.0 * ref, d)) * step(0.0, d) * (0.5 + 0.5 * fbm2(vec2(wx * 0.3, wy * 0.2 - u_time * 1.5)));

      vec3 col = (d > 0.0) ? water : land;
      col += vec3(0.8, 0.9, 1.0) * foam * 0.18;
      col += u_edge * (edgeLine * 1.4 + edgeGlow * 0.35) * pulse;

      // ---- cloud shadow ----
      float cloud = fbm2(vec2(wx * 0.006 + u_time * 0.01, (u_scroll * 1.25 + ahead) * 0.006));
      col *= 0.86 + 0.2 * smoothstep(0.35, 0.75, cloud);

      // ---- fog ----
      float fogV = smoothstep(u_fogNear, 1.0, v);
      float fog = clamp(u_fogAmt * 0.35 + fogV * (0.6 + 0.4 * u_fogAmt), 0.0, 1.0);
      col = mix(col, u_fog, fog);

      // ---- grade ----
      float vig = 1.0 - 0.35 * pow(length((uv - 0.5) * vec2(1.0, 0.7)) * 1.5, 2.2);
      col *= vig;
      col = col / (col + 0.55) * 1.4;
      col = pow(max(col, 0.0), vec3(0.95));
      col += (hash21(uv * u_view + u_time) - 0.5) * 0.012;
      gl_FragColor = vec4(col, 1.0);
    }
    """
}
