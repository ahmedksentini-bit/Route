// cubature.js — cubatures par la méthode des profils (moyenne des aires).
// Entrée : profils [{pk, deblai, remblai}] (surfaces m²), triés par PK.
// Sortie : lignes [{pk, deblai, remblai, dPk, vDeblai, vRemblai, cumDeblai, cumRemblai}].

export function cubatures(profils) {
  const rows = [];
  let cumD = 0, cumR = 0;
  const sorted = profils.filter(p => p.deblai !== null && p.deblai !== undefined).sort((a, b) => a.pk - b.pk);
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    let dPk = 0, vD = 0, vR = 0;
    if (i > 0) {
      const q = sorted[i - 1];
      dPk = p.pk - q.pk;
      // moyenne des aires ; la correction prismoïdale est au backlog (docs/context/backlog.md)
      vD = (q.deblai + p.deblai) / 2 * dPk;
      vR = (q.remblai + p.remblai) / 2 * dPk;
    }
    cumD += vD; cumR += vR;
    rows.push({ pk: p.pk, deblai: p.deblai, remblai: p.remblai, dPk, vDeblai: vD, vRemblai: vR, cumDeblai: cumD, cumRemblai: cumR, mouvement: cumD - cumR });
  }
  return { rows, totalDeblai: cumD, totalRemblai: cumR, bilan: cumD - cumR };
}

/** Export CSV (séparateur ; — lisible directement par Excel en locale FR). */
export function cubaturesCsv(result) {
  const h = ['PK', 'Surface deblai (m2)', 'Surface remblai (m2)', 'Distance (m)', 'Volume deblai (m3)', 'Volume remblai (m3)', 'Cumul deblai (m3)', 'Cumul remblai (m3)', 'Mouvement (m3)'];
  const lines = [h.join(';')];
  for (const r of result.rows) {
    lines.push([r.pk.toFixed(2), r.deblai.toFixed(2), r.remblai.toFixed(2), r.dPk.toFixed(2), r.vDeblai.toFixed(1), r.vRemblai.toFixed(1), r.cumDeblai.toFixed(1), r.cumRemblai.toFixed(1), r.mouvement.toFixed(1)].join(';'));
  }
  lines.push(['TOTAL', '', '', '', result.totalDeblai.toFixed(1), result.totalRemblai.toFixed(1), '', '', result.bilan.toFixed(1)].join(';'));
  return lines.join('\r\n');
}
