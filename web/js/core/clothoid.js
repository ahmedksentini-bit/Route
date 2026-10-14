// clothoid.js — clothoïde (spirale de Cornu) : A² = R · L.
// Repère local : origine au point de courbure nulle (KA), axe x tangent initial,
// la courbe tourne vers y > 0. τ = L² / (2A²) = L / (2R) : angle de la tangente.

/**
 * Coordonnées locales du point d'abscisse curviligne l sur la clothoïde de paramètre A.
 * Séries entières (convergentes pour tout τ, rapides pour τ < ~2 rad) avec
 * repli sur une intégration de Simpson au-delà.
 */
export function clothoidPoint(A, l) {
  if (l === 0) return { x: 0, y: 0, tau: 0 };
  const tau = (l * l) / (2 * A * A);
  if (tau < 2.5) {
    // x = l Σ (-1)^n τ^(2n) / ((4n+1)(2n)!) ; y = l Σ (-1)^n τ^(2n+1) / ((4n+3)(2n+1)!)
    let x = 0, y = 0;
    let termX = 1; // τ^(2n)/(2n)!
    for (let n = 0; n < 40; n++) {
      const sgn = n % 2 === 0 ? 1 : -1;
      const termY = (termX * tau) / (2 * n + 1); // τ^(2n+1)/(2n+1)!
      x += (sgn * termX) / (4 * n + 1);
      y += (sgn * termY) / (4 * n + 3);
      const next = (termY * tau) / (2 * n + 2);
      if (Math.abs(next) < 1e-16) break;
      termX = next;
    }
    return { x: l * x, y: l * y, tau };
  }
  // Simpson sur [0, l]
  const n = Math.max(200, Math.ceil(l * 4)) & ~1;
  const h = l / n;
  let sx = 0, sy = 0;
  for (let i = 0; i <= n; i++) {
    const t = i * h;
    const ang = (t * t) / (2 * A * A);
    const w = i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2;
    sx += w * Math.cos(ang);
    sy += w * Math.sin(ang);
  }
  return { x: (h / 3) * sx, y: (h / 3) * sy, tau };
}

/**
 * Grandeurs caractéristiques de la clothoïde de raccordement entre un alignement et
 * un cercle de rayon R : L, τ, coordonnées de KE (xM, yM), ripage ΔR, abscisse du
 * centre XM (distance de KA à la projection du centre du cercle sur la tangente).
 */
export function clothoidData(A, R) {
  const L = (A * A) / R;
  const p = clothoidPoint(A, L);
  const tau = p.tau;
  const deltaR = p.y - R * (1 - Math.cos(tau));
  const XM = p.x - R * Math.sin(tau);
  return { L, tau, xM: p.x, yM: p.y, deltaR, XM };
}

/**
 * Raccordement symétrique droite–clothoïde–cercle–clothoïde–droite au sommet d'angle
 * de déflexion |delta| (rad). Retourne la tangente T (distance sommet→KA), l'angle
 * de l'arc circulaire restant, la bissectrice, etc. Si A = 0 : arc de cercle simple.
 * Retourne {ok:false, reason} si la déflexion est insuffisante (delta < 2τ).
 */
export function symmetricCurve(R, A, delta) {
  const d = Math.abs(delta);
  if (!(R > 0)) return { ok: false, reason: 'rayon nul' };
  if (!(A > 0)) {
    const T = R * Math.tan(d / 2);
    return { ok: true, R, A: 0, L: 0, tau: 0, deltaR: 0, XM: 0, T, arcAngle: d, arcLength: R * d, total: R * d };
  }
  const c = clothoidData(A, R);
  if (d < 2 * c.tau - 1e-12) {
    return { ok: false, reason: `déflexion ${(d * 180 / Math.PI).toFixed(2)}° < 2τ = ${(2 * c.tau * 180 / Math.PI).toFixed(2)}° : réduire A ou augmenter R` };
  }
  const T = (R + c.deltaR) * Math.tan(d / 2) + c.XM;
  const arcAngle = d - 2 * c.tau;
  return { ok: true, R, A, L: c.L, tau: c.tau, deltaR: c.deltaR, XM: c.XM, T, arcAngle, arcLength: R * arcAngle, total: 2 * c.L + R * arcAngle };
}
