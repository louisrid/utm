/**
 * FANVUE X ARTICLE TRACKER -> NETLIFY UTM TRACKER
 * Paste this file into a standalone or spreadsheet-bound Google Apps Script project.
 * Deploy as a Web app: Execute as Me; Who has access: Anyone.
 * The API token is required for ALL requests, and lives only in Netlify environment variables.
 *
 * The original sheets are the ONLY place you enter publisher and paid-post data.
 * This script adds four automatic columns O:R without changing existing A:N.
 */
const CONFIG = Object.freeze({
  SPREADSHEET_ID: '1iaKTKoGf58i9uH5sT23r6vxX5XYVx3VfS8fLp-8xRbM',
  SITE_URL: 'https://YOUR-SITE.netlify.app', // CHANGE after deploying Netlify
  DESTINATION_URL: 'https://prism-builder.com/',
  SOURCE: 'X',
  MEDIUM: 'ART',
  START_ROW: 8,
  MAX_ROWS_PER_TAB: 2500
});

const INDEX_HEADERS = ['CODE','ARTICLE','PUBLISHER','OWNER','COST_USD','PAID','POSTED','POST_URL','SOURCE_TAB','SOURCE_ROW','TRACKING_URL','DESTINATION_URL'];
const SOURCE_HEADERS = ['UTM ID','UTM LINK','TRACKED CLICKS','LAST CLICK'];
const EVENTS_HEADERS = ['TIMESTAMP','CODE'];
const SUMMARY_HEADERS = ['CODE','CLICKS','LAST_CLICK','LAST_REFRESH'];

/** Run ONCE to connect the original workbook, generate tracking IDs and install triggers. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('API_TOKEN')) props.setProperty('API_TOKEN', Utilities.getUuid() + Utilities.getUuid());
  ensureSystemSheets_();
  for (const t of ScriptApp.getProjectTriggers()) {
    if (['onTrackerEdit','refreshReports'].includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  }
  ScriptApp.newTrigger('onTrackerEdit').forSpreadsheet(CONFIG.SPREADSHEET_ID).onEdit().create();
  ScriptApp.newTrigger('refreshReports').timeBased().everyHours(12).create();
  syncFromTracker();
  refreshReports();
  Logger.log('SETUP COMPLETE. Copy this token to Netlify APP_SCRIPT_TOKEN (keep private): ' + props.getProperty('API_TOKEN'));
  Logger.log('After deploying this script as a Web app, copy the /exec URL to APP_SCRIPT_URL in Netlify.');
  Logger.log('Set CONFIG.SITE_URL to your actual Netlify URL, then run syncFromTracker again.');
}

/** Installed edit trigger: entering/changing an ordinary publisher row updates the website inventory. */
function onTrackerEdit(e) {
  try {
    if (!e || !e.range) return;
    const s = e.range.getSheet();
    if (s.getName().startsWith('UTM ')) return;
    if (e.range.getLastRow() < 7 || e.range.getColumn() > 14) return;
    if (!isSourceTab_(s)) return;
    syncFromTracker();
  } catch(err) { console.error('onTrackerEdit', err); }
}

/** Can also be run manually after bulk changes. Safe to rerun; IDs are stable. */
function syncFromTracker() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { syncFromTrackerUnlocked_(); }
  finally { lock.releaseLock(); }
}

function syncFromTrackerUnlocked_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  ensureSystemSheets_(ss);
  const tabs = ss.getSheets().filter(isSourceTab_).sort((a,b) => ownerRank_(a) - ownerRank_(b));
  let maxPublisherNumber = 0;
  const tabData = [];
  for (const tab of tabs) {
    const count = Math.min(Math.max(tab.getLastRow() - CONFIG.START_ROW + 1, 0), CONFIG.MAX_ROWS_PER_TAB);
    if (!count) continue;
    const values = tab.getRange(CONFIG.START_ROW, 2, count, 13).getValues(); // B:N
    const previous = tab.getRange(CONFIG.START_ROW, 15, count, 2).getValues(); // O:P
    previous.forEach(p => { const match = String(p[0] || '').match(/^A\d{2,3}-P(\d{2,4})$/); if (match) maxPublisherNumber = Math.max(maxPublisherNumber, Number(match[1])); });
    const a = Number(tab.getRange('H7').getValue());
    const articleNumber = Number.isInteger(a) && a > 0 && a < 1000 ? a : 1;
    tabData.push({tab,count,values,previous,article:'A' + String(articleNumber).padStart(2,'0')});
  }
  const issuedCodes = new Set();
  const output = [];
  const site = CONFIG.SITE_URL.replace(/\/+$/,'');
  for (const block of tabData) {
    const newPairs = block.previous.map(pair => pair.slice());
    block.values.forEach((row,i) => {
      const publisher = String(row[0] || '').trim(); // B ACCOUNT
      if (!publisher) { newPairs[i] = ['', '']; return; }
      let code = String(block.previous[i][0] || '').toUpperCase().trim();
      if (!/^A\d{2,3}-P\d{2,4}$/.test(code) || issuedCodes.has(code)) {
        maxPublisherNumber += 1;
        code = block.article + '-P' + String(maxPublisherNumber).padStart(2,'0');
      }
      issuedCodes.add(code);
      const article = code.split('-')[0];
      const owner = ownerName_(block.tab);
      const cost = parsePrice_(row[5]); // G ARTICLE: price
      const paid = toBool_(row[10]); // L PAID?
      const posted = toBool_(row[11]); // M POSTED?
      const postedLink = String(row[12] || '').trim(); // N LINK
      const trackingLink = site + '/r/' + code;
      const destination = createDestination_(article, code.split('-')[1]);
      newPairs[i] = [code,trackingLink];
      output.push([code,article,publisher,owner,cost,paid,posted,postedLink,block.tab.getName(),CONFIG.START_ROW+i,trackingLink,destination]);
    });
    block.tab.getRange(CONFIG.START_ROW, 15, block.count, 2).setValues(newPairs);
  }
  const index = ss.getSheetByName('UTM INDEX');
  index.clearContents();
  index.getRange(1,1,1,INDEX_HEADERS.length).setValues([INDEX_HEADERS]);
  if (output.length) index.getRange(2,1,output.length,INDEX_HEADERS.length).setValues(output);
  PropertiesService.getScriptProperties().setProperty('LAST_SHEET_SYNC', new Date().toISOString());
}

/** Automatic 12-hour refresh: source rows, aggregated clicks, and website dashboard data. */
function refreshReports() {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    syncFromTrackerUnlocked_();
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const index = readIndex_(ss);
    const eventSheet = ss.getSheetByName('UTM EVENTS');
    const eventRows = Math.max(0,eventSheet.getLastRow()-1);
    const events = eventRows ? eventSheet.getRange(2,1,eventRows,2).getValues() : [];
    const stats = {};
    events.forEach(r => {
      const code = String(r[1] || '');
      if (!stats[code]) stats[code] = {clicks:0,last:''};
      stats[code].clicks++;
      const iso = r[0] instanceof Date ? r[0].toISOString() : String(r[0]);
      if (iso > stats[code].last) stats[code].last = iso;
    });
    const now = new Date().toISOString();
    const summary = ss.getSheetByName('UTM SUMMARY');
    summary.clearContents();
    summary.getRange(1,1,1,4).setValues([SUMMARY_HEADERS]);
    if (index.length) {
      summary.getRange(2,1,index.length,4).setValues(index.map(r => [r[0], stats[r[0]]?.clicks || 0, stats[r[0]]?.last || '', now]));
    }
    const grouped = {};
    index.forEach(r => {
      const tabName = r[8], rowNum = Number(r[9]);
      if (!grouped[tabName]) grouped[tabName] = [];
      grouped[tabName].push({row:rowNum,clicks:stats[r[0]]?.clicks || 0,last:stats[r[0]]?.last || ''});
    });
    Object.keys(grouped).forEach(name => {
      const sheet = ss.getSheetByName(name);
      if (!sheet) return;
      const start = CONFIG.START_ROW;
      const maxRow = Math.max(...grouped[name].map(x=>x.row));
      const n = maxRow - start + 1;
      const range = sheet.getRange(start,17,n,2); // Q:R; only automated reporting fields
      const values = range.getValues();
      grouped[name].forEach(x => {values[x.row-start] = [x.clicks,x.last];});
      range.setValues(values);
    });
    PropertiesService.getScriptProperties().setProperty('LAST_REPORT_REFRESH', now);
  } finally { lock.releaseLock(); }
}

/** Netlify-to-Apps-Script API; all actions require private token. */
function doGet(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!expected || p.token !== expected) return json_({ok:false,error:'Unauthorised'});
    const action = String(p.action || '');
    if (action === 'dashboard') return json_(getDashboard_());
    if (action === 'resolve' || action === 'hit') return json_(handleLink_(String(p.code || '').toUpperCase(), action === 'hit'));
    return json_({ok:false,error:'Unsupported action'});
  } catch(err) { console.error(err); return json_({ok:false,error:'Backend unavailable'}); }
}

function handleLink_(code, logClick) {
  if (!/^A\d{2,3}-P\d{2,4}$/.test(code)) return {ok:false,error:'Bad code'};
  const lock = LockService.getScriptLock();
  lock.waitLock(9000);
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const match = readIndex_(ss).find(r => r[0] === code);
    if (!match) return {ok:false,error:'Unknown tracking link'};
    if (logClick) ss.getSheetByName('UTM EVENTS').appendRow([new Date(),code]);
    return {ok:true,destination:match[11]};
  } finally { lock.releaseLock(); }
}

function getDashboard_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const index = readIndex_(ss);
  const summarySheet = ss.getSheetByName('UTM SUMMARY');
  const n = Math.max(summarySheet.getLastRow()-1,0);
  const report = n ? summarySheet.getRange(2,1,n,4).getValues() : [];
  const stats = {};
  report.forEach(x => stats[x[0]] = {clicks:Number(x[1])||0,lastClick:String(x[2]||'')});
  const placements = index.map(r => ({
    code:r[0],article:r[1],publisher:r[2],owner:r[3],cost:Number(r[4])||0,
    paid:toBool_(r[5]),posted:toBool_(r[6]),postUrl:r[7],sourceTab:r[8],sourceRow:r[9],
    trackingUrl:r[10],destinationUrl:r[11],clicks:stats[r[0]]?.clicks||0,lastClick:stats[r[0]]?.lastClick||''
  }));
  const props = PropertiesService.getScriptProperties();
  return {ok:true,placements,lastSheetSync:props.getProperty('LAST_SHEET_SYNC')||'',lastReportRefresh:props.getProperty('LAST_REPORT_REFRESH')||'',sourceSheetUrl:ss.getUrl(),destination:CONFIG.DESTINATION_URL};
}

function readIndex_(ss) {
  const sheet = ss.getSheetByName('UTM INDEX');
  if (!sheet || sheet.getLastRow()<2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,INDEX_HEADERS.length).getValues();
}

function ensureSystemSheets_(ss) {
  ss = ss || SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  [['UTM INDEX',INDEX_HEADERS],['UTM EVENTS',EVENTS_HEADERS],['UTM SUMMARY',SUMMARY_HEADERS]].forEach(([name,head]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    sheet.getRange(1,1,1,head.length).setValues([head]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,head.length).setFontWeight('bold').setBackground('#e6f4ea');
  });
  ss.getSheets().filter(isSourceTab_).forEach(s => {
    const existing = s.getRange(7,15,1,4).getValues()[0];
    if (existing.some(v=>v && !SOURCE_HEADERS.includes(String(v)))) {
      throw new Error('Columns O:R already contain custom headers in '+s.getName()+'. Stop to prevent overwriting.');
    }
    s.getRange(7,15,1,4).setValues([SOURCE_HEADERS]);
  });
}

function isSourceTab_(sheet) {
  if (sheet.getName().startsWith('UTM ')) return false;
  const header = sheet.getRange('B7:N7').getDisplayValues()[0];
  return String(header[0]).trim().toUpperCase()==='ACCOUNT' && String(header[5]).trim().toUpperCase()==='ARTICLE';
}
function ownerName_(sheet) {
  const name = sheet.getName().toUpperCase();
  if (name.includes('LOUIS')) return 'LOUIS';
  if (name.includes('CONNOR')) return 'CONNOR';
  return 'OTHER';
}
function ownerRank_(sheet) {return ({LOUIS:0,CONNOR:1,OTHER:2})[ownerName_(sheet)];}
function toBool_(value) {return value===true || String(value).toUpperCase().trim()==='TRUE';}
function parsePrice_(value) {const match=String(value||'').replace(/,/g,'').match(/\d+(\.\d+)?/);return match?Number(match[0]):0;}
function createDestination_(article,publisherCode) {
  const params = ['utm_source='+encodeURIComponent(CONFIG.SOURCE),'utm_medium='+encodeURIComponent(CONFIG.MEDIUM),'utm_campaign='+encodeURIComponent(article),'utm_content='+encodeURIComponent(publisherCode)];
  return CONFIG.DESTINATION_URL + (CONFIG.DESTINATION_URL.includes('?')?'&':'?') + params.join('&');
}
function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
