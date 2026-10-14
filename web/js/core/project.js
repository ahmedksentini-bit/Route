// project.js — modèle de projet (données d'entrée uniquement) et sérialisation JSON.
// Tout ce qui se calcule (éléments de l'axe, rasante, profils, cubatures) est un cache
// reconstruit depuis ce modèle : ne jamais le persister (cf. BVTrace, docs/context/rasante.md).
//
// Le fond DXF n'est pas embarqué dans le JSON (volumineux) : seul le semis de points cotés
// retenu pour le TIN l'est (option), avec le nom du fichier d'origine.

import { PROFIL_TYPE_DEFAUT } from './profilTravers.js';

export const PROJECT_VERSION = 1;

export function newProject() {
  return {
    version: PROJECT_VERSION,
    nom: 'Nouveau projet',
    categorie: 'R80',
    axe: { sommets: [], pk0: 0 },
    rasante: { sommets: [] },
    profilType: { ...PROFIL_TYPE_DEFAUT, fosse: { ...PROFIL_TYPE_DEFAUT.fosse } },
    tabulation: { pas: 25 },
    fond: { fichier: null, calques: null, regles: { points: true, polylines: true, faces: true, texts: false, blocks: true }, maxEdgeFactor: 4 },
    samples: null, // [{x,y,z}] retenus pour le TIN (facultatif)
  };
}

export function serialize(project, { includeSamples = true } = {}) {
  const copy = JSON.parse(JSON.stringify(project));
  if (!includeSamples) copy.samples = null;
  return JSON.stringify(copy, null, 1);
}

export function deserialize(text) {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== 'object') throw new Error('projet invalide');
  const base = newProject();
  const p = { ...base, ...obj };
  p.axe = { ...base.axe, ...(obj.axe || {}) };
  p.rasante = { ...base.rasante, ...(obj.rasante || {}) };
  p.profilType = { ...base.profilType, ...(obj.profilType || {}) };
  p.tabulation = { ...base.tabulation, ...(obj.tabulation || {}) };
  p.fond = { ...base.fond, ...(obj.fond || {}) };
  p.axe.sommets = (p.axe.sommets || []).map(s => ({ x: +s.x, y: +s.y, R: +s.R || 0, A: +s.A || 0 }));
  p.rasante.sommets = (p.rasante.sommets || []).map(s => ({ pk: +s.pk, z: +s.z, Rv: +s.Rv || 0 }));
  return p;
}
