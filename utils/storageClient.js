// utils/storageClient.js — tiny JSON file store (per-key blobs)
// Works in Node (for Express routes). Not used by front-end.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Where to store data (env override or ./data/persist)
const ROOT = process.env.UI_PERSIST_PATH
  ? path.resolve(process.env.UI_PERSIST_PATH)
  : path.resolve(__dirname, '../data/persist');

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDirSync(ROOT);

function keyPath(key) {
  const safe = String(key).replace(/[^a-z0-9._-]/gi, '_');
  return path.join(ROOT, `${safe}.json`);
}

export async function getJson(key, defaultValue = null) {
  const p = keyPath(key);
  try {
    const raw = await fs.promises.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

export async function setJson(key, value) {
  const p = keyPath(key);
  ensureDirSync(path.dirname(p));
  await fs.promises.writeFile(p, JSON.stringify(value ?? null, null, 2), 'utf8');
  return true;
}

export async function getSetJson(key, initializer) {
  const existing = await getJson(key, undefined);
  if (existing !== undefined) return existing;
  const init = typeof initializer === 'function' ? initializer() : initializer;
  await setJson(key, init);
  return init;
}
