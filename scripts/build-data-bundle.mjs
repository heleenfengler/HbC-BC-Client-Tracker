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

/** GitHub secrets sometimes include accidental quotes or newlines */
function cleanEnv(s) {
  if (!s || typeof s !== 'string') return '';
  let t = s.trim().replace(/\r?\n/g, '');
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

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
  let u;
  try {
    u = new URL(baseUrl);
  } catch (e) {
    throw new Error(`Invalid HBC_WEB_APP_URL (must be full https URL ending in /exec): ${e.message}`);
  }
  u.searchParams.set('sheet', sheet);
  u.searchParams.set('token', token);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(u.toString(), { signal: ctrl.signal, redirect: 'follow' });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${sheet}`);
    if (text.trim().startsWith('<')) {
      const hint =
        'Apps Script returned HTML, not JSON. Fix: Deploy → Manage deployments → Edit → ' +
        '"Who has access" must include anonymous access (e.g. "Anyone") so GitHub servers can read it — ' +
        '"Anyone within Healthbridge" blocks this job.';
      throw new Error(`${sheet}: ${hint}`);
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      const snip = text.slice(0, 120).replace(/\s+/g, ' ');
      throw new Error(`${sheet}: JSON parse error — first chars: ${snip}`);
    }
  } finally {
    clearTimeout(t);
  }
}

async function buildFromApi() {
  const baseUrl = cleanEnv(process.env.HBC_WEB_APP_URL || '');
  const token = cleanEnv(process.env.HBC_API_TOKEN || '');
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error('HBC_WEB_APP_URL must start with https:// (check the secret for typos or extra characters)');
  }
  const out = {};
  for (const sheet of SHEETS) {
    console.log(`Fetching ${sheet}…`);
    const key =
      sheet === 'Metadata' ? 'metadata' : sheet === 'BCOwnership' ? 'bcOwnership' : 'clientSummary';
    out[key] = await fetchSheet(baseUrl, token, sheet);
  }
  return {
    generatedAt: new Date().toISOString(),
    metadata: out.metadata,
    bcOwnership: out.bcOwnership,
    clientSummary: out.clientSummary,
  };
}

async function main() {
  const hasUrl = !!cleanEnv(process.env.HBC_WEB_APP_URL || '');
  const hasTok = !!cleanEnv(process.env.HBC_API_TOKEN || '');

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
