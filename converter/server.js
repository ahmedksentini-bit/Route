// converter/server.js — micro-service DWG → DXF pour le front « Route ».
// POST /convert  (multipart/form-data, champ `file` = .dwg)  →  text/plain DXF ASCII.
// GET  /health   →  { ok, engine }
//
// Moteur, dans l'ordre : ODA File Converter (gratuit, fidèle, toutes versions DWG) si
// ODA_PATH est défini, sinon LibreDWG `dwg2dxf` (libre, R13→2018, quelques entités
// non gérées). Le fichier est converti dans un répertoire temporaire puis supprimé.
// Aucun état, aucune base : déployable derrière nginx sur un sous-domaine
// (ex. convert.ksr-infra.org) avec CORS ouvert sur route.ksr-infra.org.

import express from 'express';
import multer from 'multer';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const PORT = process.env.PORT || 8787;
const ODA = process.env.ODA_PATH || '';          // ex. /opt/ODAFileConverter/ODAFileConverter
const DWG2DXF = process.env.DWG2DXF || 'dwg2dxf';
const MAX_MB = Number(process.env.MAX_MB || 80);
const ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim());
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 120000);

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024 } });

app.use((req, res, next) => {
  const o = req.headers.origin;
  if (ORIGINS.includes('*') || (o && ORIGINS.includes(o))) res.setHeader('Access-Control-Allow-Origin', ORIGINS.includes('*') ? '*' : o);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', async (_req, res) => {
  res.json({ ok: true, engine: ODA ? 'ODA File Converter' : 'LibreDWG dwg2dxf', maxMb: MAX_MB });
});

app.post('/convert', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).type('text').send('champ `file` manquant');
  const dir = await mkdtemp(join(tmpdir(), 'dwg-'));
  try {
    const inPath = join(dir, 'in', 'input.dwg');
    const outDir = join(dir, 'out');
    await exec('mkdir', ['-p', join(dir, 'in'), outDir]);
    await writeFile(inPath, req.file.buffer);
    let dxfPath;
    if (ODA) {
      // ODAFileConverter <in_dir> <out_dir> <version> <type> <recurse 0/1> <audit 0/1> [filter]
      await exec(ODA, [join(dir, 'in'), outDir, 'ACAD2013', 'DXF', '0', '1', '*.dwg'], { timeout: TIMEOUT_MS, env: { ...process.env, QT_QPA_PLATFORM: 'offscreen' } });
      const files = (await readdir(outDir)).filter(f => /\.dxf$/i.test(f));
      if (!files.length) throw new Error('ODA n\'a produit aucun DXF (fichier corrompu ou protégé ?)');
      dxfPath = join(outDir, files[0]);
    } else {
      dxfPath = join(outDir, 'output.dxf');
      await exec(DWG2DXF, ['-o', dxfPath, inPath], { timeout: TIMEOUT_MS });
    }
    const dxf = await readFile(dxfPath, 'latin1');
    res.type('text/plain; charset=utf-8').send(dxf);
  } catch (e) {
    const msg = e.stderr ? `${e.message}\n${String(e.stderr).slice(0, 2000)}` : e.message;
    res.status(422).type('text').send(`conversion impossible : ${msg}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

app.listen(PORT, () => console.log(`converter DWG→DXF sur :${PORT} (${ODA ? 'ODA' : 'LibreDWG'})`));
