/**
 * Builds data.json for the HbC dashboard (same-origin bundle).
 *
 * With secrets (CI or local):
 *   HBC_WEB_APP_URL  — Apps Script /exec base URL (no ?sheet=)
 *   HBC_API_TOKEN    — token query param value
 *
 * Without secrets: writes a minimal valid placeholder so GitHub Pages + fetch never 404.
 *
 *   node scripts/build-data-bundle.mjs
 *   OUT_PATH=data.json node scripts/build-data-bundle.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outPath = process.env.OUT_PATH || path.join(root, 'data.json');

const SHEETS = ['Metadata', 'BCOwnership', 'ClientSummary'];
const TIMEOUT_MS = 120000;

function placeholderBundle() {
  const iso = new Date().toISOString();
  return {
    generatedAt: iso,
    note: 'Placeholder — set GitHub secrets HBC_WEB_APP_URL and HBC_API_TOKEN for live fetches.',
    metadata: {
      rows: [
        { Key: 'LastRefreshed_SAST', Value: iso.slice(0, 19).replace('T', ' ') + ' (placeholder)' },
        { Key: 'LATEST_VERSION', Value: '6.46.0' },
      ],
    },
    bcOwnership: { rows: [] },
    clientSummary: {
      rowCount: 1,
      rows: [
        {
          BPN: '999999',
          PracticeName: 'Add HBC_WEB_APP_URL + HBC_API_TOKEN in repo secrets, then re-run workflow',
          PMA: 'myMPS',
          AppVersion: '—',
          OnLatestVersion: 'No',
          DaysActive: 0,
          LastActiveDate: '',
          TotalEncounters: 0,
          Events_Encounters: 0,
          Events_Clinical_Doc: 0,
          Events_Scripts: 0,
          Events_Pathology: 0,
          Events_AI_Features: 0,
          Events_Preventative_Care: 0,
          Events_Task_Management: 0,
          Events_Customization: 0,
        },
      ],
    },
  };
}

async function fetchSheet(baseUrl, token, sheet) {
  const u = new URL(baseUrl);
  u.searchParams.set('sheet', sheet);
  u.searchParams.set('token', token);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(u.toString(), { signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${sheet}`);
    if (text.trim().startsWith('<')) {
      throw new Error(`${sheet}: response is HTML (login or wrong URL)`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(t);
  }
}

async function buildFromApi() {
  const baseUrl = process.env.HBC_WEB_APP_URL.trim();
  const token = process.env.HBC_API_TOKEN.trim();
  const [metadata, bcOwnership, clientSummary] = await Promise.all(
    SHEETS.map((s) => fetchSheet(baseUrl, token, s))
  );
  return {
    generatedAt: new Date().toISOString(),
    metadata,
    bcOwnership,
    clientSummary,
  };
}

async function main() {
  const hasUrl = !!process.env.HBC_WEB_APP_URL?.trim();
  const hasTok = !!process.env.HBC_API_TOKEN?.trim();

  let bundle;
  if (hasUrl && hasTok) {
    try {
      bundle = await buildFromApi();
      console.log('Fetched live bundle from Apps Script.');
    } catch (e) {
      console.error('Live fetch failed:', e.message || e);
      process.exit(1);
    }
  } else {
    console.warn('HBC_WEB_APP_URL / HBC_API_TOKEN not set — writing placeholder data.json');
    bundle = placeholderBundle();
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2), 'utf8');
  console.log('Wrote', path.relative(root, outPath));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
