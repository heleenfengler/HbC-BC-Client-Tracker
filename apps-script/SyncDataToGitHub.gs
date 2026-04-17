/**
 * HbC dashboard — push data.json to GitHub without public web app access.
 *
 * Why: Workspace often allows only "Anyone within org" on web deployments, so
 * GitHub Actions gets HTML. This script runs AS YOU inside Google and uses the
 * GitHub API instead.
 *
 * SETUP (one time):
 * 1. Create a GitHub PAT: GitHub → Settings → Developer settings → Fine-grained token
 *    - Repository access: only HbC-BC-Client-Tracker
 *    - Permissions: Contents → Read and write
 * 2. In this Apps Script project: Project Settings → Script properties → Add:
 *      GITHUB_TOKEN   = your PAT
 *      GITHUB_OWNER   = heleenfengler
 *      GITHUB_REPO    = HbC-BC-Client-Tracker
 *    Optional if the script is NOT bound to your Sheet spreadsheet:
 *      SPREADSHEET_ID = <id from sheet URL>
 * 3. Copy this file into the same Apps Script project that already reads your tabs
 *    (or adjust SHEET_NAMES / row builders below to match your sheet).
 * 4. Run setupSyncTrigger_() once from the editor, OR use Extensions → Apps Script
 *    to add a time-based trigger on syncDataJsonToGitHub.
 *
 * MANUAL TEST: Run syncDataJsonToGitHub() from the editor and check GitHub data.json.
 */

var SHEET_NAMES = {
  metadata: 'Metadata',
  bcOwnership: 'BCOwnership',
  clientSummary: 'ClientSummary',
};

/** Build the same bundle shape the dashboard + build-data-bundle.mjs expect */
function buildBundleFromSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('No spreadsheet: bind this script to the Sheet or set SPREADSHEET_ID');
  }

  return {
    generatedAt: new Date().toISOString(),
    note: 'Synced from Google Sheets via Apps Script (no public web app required).',
    metadata: sheetToKeyValueObject_(ss, SHEET_NAMES.metadata),
    bcOwnership: sheetToRowsObject_(ss, SHEET_NAMES.bcOwnership),
    clientSummary: sheetToClientSummary_(ss, SHEET_NAMES.clientSummary),
  };
}

/** Metadata tab: first row = headers, expects Key + Value columns */
function sheetToKeyValueObject_(ss, sheetName) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Missing sheet tab: ' + sheetName);

  var values = sh.getDataRange().getValues();
  if (values.length < 2) return { rows: [] };

  var headers = values[0].map(String);
  var keyCol = headers.indexOf('Key');
  var valCol = headers.indexOf('Value');
  if (keyCol === -1 || valCol === -1) {
    // Fallback: columns A and B
    keyCol = 0;
    valCol = 1;
  }

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var k = values[r][keyCol];
    if (k === '' || k === null) continue;
    rows.push({ Key: k, Value: values[r][valCol] });
  }
  return { rows: rows };
}

/** Generic tab → { rows: [ {ColA: v, ...}, ... ] } using row 1 as keys */
function sheetToRowsObject_(ss, sheetName) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Missing sheet tab: ' + sheetName);

  var values = sh.getDataRange().getValues();
  if (values.length < 2) return { rows: [] };

  var headers = values[0].map(function (h) {
    return String(h || '').trim();
  });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    var empty = true;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      obj[headers[c]] = values[r][c];
      if (values[r][c] !== '' && values[r][c] !== null) empty = false;
    }
    if (!empty) rows.push(obj);
  }
  return { rows: rows };
}

/** ClientSummary: same as generic rows + rowCount */
function sheetToClientSummary_(ss, sheetName) {
  var o = sheetToRowsObject_(ss, sheetName);
  o.rowCount = o.rows.length;
  return o;
}

function getGitHubProps_() {
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty('GITHUB_TOKEN');
  var owner = p.getProperty('GITHUB_OWNER');
  var repo = p.getProperty('GITHUB_REPO');
  if (!token || !owner || !repo) {
    throw new Error('Set script properties GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO');
  }
  return { token: token, owner: owner, repo: repo };
}

/** PUT data.json to GitHub (needs SHA for update) */
function pushJsonToGitHub_(jsonString, commitMessage) {
  var g = getGitHubProps_();
  var path = 'data.json';
  var api = 'https://api.github.com/repos/' + g.owner + '/' + g.repo + '/contents/' + path;

  var getOpt = {
    method: 'get',
    headers: {
      Authorization: 'Bearer ' + g.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    muteHttpExceptions: true,
  };

  var getRes = UrlFetchApp.fetch(api, getOpt);
  var sha = '';
  if (getRes.getResponseCode() === 200) {
    var cur = JSON.parse(getRes.getContentText());
    sha = cur.sha;
  } else if (getRes.getResponseCode() !== 404) {
    throw new Error('GitHub GET data.json failed: ' + getRes.getResponseCode() + ' ' + getRes.getContentText().slice(0, 500));
  }

  var body = {
    message: commitMessage || 'chore(data): sync from Apps Script',
    content: Utilities.base64Encode(
      Utilities.newBlob(jsonString).getBytes()
    ),
  };
  if (sha) body.sha = sha;

  var putOpt = {
    method: 'put',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + g.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  };

  var putRes = UrlFetchApp.fetch(api, putOpt);
  if (putRes.getResponseCode() !== 200 && putRes.getResponseCode() !== 201) {
    throw new Error('GitHub PUT data.json failed: ' + putRes.getResponseCode() + ' ' + putRes.getContentText().slice(0, 800));
  }
}

/** Entry point — run manually or on a time trigger */
function syncDataJsonToGitHub() {
  var bundle = buildBundleFromSpreadsheet_();
  var json = JSON.stringify(bundle, null, 2);
  pushJsonToGitHub_(json, 'chore(data): sync from Apps Script');
}

/** Run once from editor to create a daily trigger (~03:00 in script timezone) */
function setupSyncTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncDataJsonToGitHub') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncDataJsonToGitHub')
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .create();
}
