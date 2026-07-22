// ==UserScript==
// @name         [PAK] StatsDetail → GoogleSheet Poster
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Every 1 minute post all active rows visible on the stats bar (class: mck-gridRow mck-rowActive) to provided Google Apps Script webapp. Do NOT post rows marked IN PROGRESS. Event name moved to column A. Stamp time placed at column B. Hour extracted into column C. Log time placed at column AC.
// @match        *://pon-wpas46-cl01.next-uk.next.loc/cgi-bin/web_om_rsps2.exe*
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ========== CONFIG ========== */
  const WEBAPP_URL = 'https://script.google.com/a/macros/next.co.uk/s/AKfycbzLQo7O_NGoLci3WoAChLTxtDriNJnP73h_Eyqbxnp2Z5cZa2cNj6gx8N_aC1qGPoKE/exec';
  const POST_INTERVAL_MS = 60 * 1000; // internal polling interval (scheduler gates real runs)
  const TABLE_ID = 'listtbl1';
  const STORAGE_KEY = 'mck_stats_poster_last_sig_all_active_skip_inprog';
  const INPROG_HOURS = 2; // fallback: consider most recent timestamped row in last 2h as in-progress

  // 0-based index where log time should land = AC (A=0 => AC = 28)
  const LOG_COLUMN_INDEX = 28;

  /* ========== PROFILE / COLUMNS ========== */
  const PROFILES = {
    PICK: {
      label: 'ISPS Pick',
      cols: [
        'Total Value',
        '1AP1','1AP2','1AP3','1AP4',
        '1BP1','1BP2','1BP3','1BP4',
        '1CP1','1CP2','1CP3','1CP4',
        '2AP1','2AP2','2AP3','2AP4',
        '2BP1','2BP2','2BP3','2BP4',
        '2CP1','2CP2','2CP3','2CP4'
      ]
    },
    TOPUP: {
      label: 'ISPS TOPUP',
      cols: [
        'Total Value',
        '1AT1','1AT2','1AT3',
        '1BT1','1BT2','1BT3',
        '1CT1','1CT2','1CT3',
        '2AT1','2AT2','2AT3',
        '2BT1','2BT2','2BT3',
        '2CT1','2CT2','2CT3','','','','','',''
      ]
    }
  };

  /* ========== UTIL ========== */
  const normText = s => (s ?? '').replace(/\s+/g, ' ').trim();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function detectProfileFromPage() {
    const link = [...document.querySelectorAll('a[title="Drill to Stats Detail"]')].find(a => a.textContent);
    if (!link) return null;
    const txt = link.textContent.trim();
    if (txt === 'STATS_EVENT_GTP_PICKS_PICKED') return 'PICK';
    if (txt === 'STATS_EVENT_TOPUP_UNITS_TOPPED_UP') return 'TOPUP';
    return null;
  }

  /* ========== BAR PARSING (preferred) ========== */
  function rowsFromBarExcludeInProg() {
    const list = document.getElementById('mckList');
    if (!list) return null;

    // select visible active rows and exclude rows with mck-rowInProgress
    const rows = [...list.querySelectorAll('.mck-gridRow.mck-rowActive:not(.mck-rowInProgress)')]
      .filter(r => !r.classList.contains('mck-head'));

    if (!rows.length) return null;

    // For each row: timestamp in .mck-ts, values in .mck-dataGrid > .mck-cell (first cell is Total)
    const out = rows.map(rowDiv => {
      const tsEl = rowDiv.querySelector('.mck-ts');
      const timestamp = normText(tsEl?.textContent || '');

      const dataCells = [...rowDiv.querySelectorAll('.mck-dataGrid .mck-cell')];
      const valuesStr = dataCells.map(c => normText(c.textContent || '') || '0');

      return { timestamp, valuesStr, source: 'bar' };
    });

    return out;
  }

  /* ========== FALLBACK: PARSE TABLE IN PAGE/FRAMES (and exclude in-progress) ========== */
  function findTableInDoc(doc) {
    return doc?.getElementById?.(TABLE_ID) || null;
  }
  function findTableEverywhere() {
    let t = findTableInDoc(document);
    if (t) return { table: t, doc: document };

    const frames = [...document.querySelectorAll('iframe, frame')];
    for (const f of frames) {
      try {
        const d = f.contentDocument;
        t = findTableInDoc(d);
        if (t) return { table: t, doc: d };
      } catch (e) {}
    }
    return null;
  }

  function getSiteHeaders(table) {
    const headRow = table.querySelector('tr');
    if (!headRow) return [];
    const ths = [...headRow.querySelectorAll('td.list_table_heading_col')];
    if (!ths.length) return [...headRow.children].map(td => normText(td.textContent));
    return ths.map(td => normText(td.querySelector('.tablelistheader')?.textContent || td.textContent));
  }
  function buildHeaderIndexMap(siteHeaders) {
    const map = new Map();
    siteHeaders.forEach((h, idx) => map.set(h, idx));
    return map;
  }
  function toNumString(cellText) {
    let t = normText(cellText);
    if (!t) return '0';
    t = t.replace(/,/g, '');
    const m = t.match(/-?\d+(\.\d+)?/);
    return m ? m[0] : '0';
  }
  function rowToFixedValues(row, siteHeaderMap, cols) {
    const tds = [...row.querySelectorAll('td.list_table_data_col')];
    const timestamp = normText(tds[0]?.textContent || '');

    const valuesStr = [];
    const valuesNum = [];

    for (const col of cols) {
      const headerIdx = siteHeaderMap.get(col);
      if (typeof headerIdx !== 'number') {
        valuesStr.push('0');
        valuesNum.push(0);
        continue;
      }
      const td = tds[headerIdx];
      const s = toNumString(td?.textContent ?? '');
      valuesStr.push(s);
      valuesNum.push(Number(s) || 0);
    }

    const allZero = !valuesNum.some(n => n !== 0);
    return { timestamp, valuesStr, valuesNum, allZero, source: 'table' };
  }

  // Parse common timestamp formats into Date, otherwise null
  function parseTimestampToDate(ts) {
    if (!ts) return null;
    ts = ts.trim();

    // native parse (ISO, etc)
    const d1 = new Date(ts);
    if (!isNaN(d1.getTime())) return d1;

    // HH:MM or HH:MM:SS (assume today)
    const timeOnly = ts.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeOnly) {
      const now = new Date();
      const hh = parseInt(timeOnly[1], 10);
      const mm = parseInt(timeOnly[2], 10);
      const ss = timeOnly[3] ? parseInt(timeOnly[3], 10) : 0;
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, ss);
    }

    // DD/MM/YYYY [HH:MM[:SS]]
    const uk = ts.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (uk) {
      const day = parseInt(uk[1], 10);
      const month = parseInt(uk[2], 10) - 1;
      let year = parseInt(uk[3], 10);
      if (year < 100) year += 2000;
      const hh = uk[4] ? parseInt(uk[4], 10) : 0;
      const mm = uk[5] ? parseInt(uk[5], 10) : 0;
      const ss = uk[6] ? parseInt(uk[6], 10) : 0;
      return new Date(year, month, day, hh, mm, ss);
    }

    return null;
  }

  function rowsFromTableExcludeInProg() {
    const found = findTableEverywhere();
    if (!found?.table) return null;
    const table = found.table;
    const siteHeaders = getSiteHeaders(table);
    const headerMap = buildHeaderIndexMap(siteHeaders);
    const dataRows = [...table.querySelectorAll('tr')].slice(1).filter(r => r.querySelector('td.list_table_data_col'));
    const profileKey = detectProfileFromPage() || 'PICK';
    const cols = (PROFILES[profileKey] || PROFILES.PICK).cols;
    const rowObjs = dataRows.map(r => rowToFixedValues(r, headerMap, cols))
                           .filter(r => r.timestamp && !r.allZero);

    if (!rowObjs.length) return [];

    // Determine most recent timestamped non-zero row (by parsed date)
    const parsed = rowObjs.map((r, idx) => {
      const dt = parseTimestampToDate(r.timestamp);
      return { idx, r, dt };
    }).filter(x => x.dt && !isNaN(x.dt.getTime()));

    if (parsed.length === 0) return rowObjs; // can't parse dates → no in-progress detection

    parsed.sort((a, b) => b.dt.getTime() - a.dt.getTime()); // newest first
    const newest = parsed[0];

    // If newest timestamp is within INPROG_HOURS hours -> treat as in-progress and exclude it
    const ageMs = Date.now() - newest.dt.getTime();
    if (ageMs <= INPROG_HOURS * 3600 * 1000) {
      // remove rowObjs[newest.idx]
      const out = rowObjs.filter((_, i) => i !== newest.idx);
      return out;
    }

    return rowObjs;
  }

  /* ========== COLLECT ACTIVE ROWS (bar preferred) ========== */
  function collectActiveRowsExcludingInProg() {
    // Try the injected bar first
    const fromBar = rowsFromBarExcludeInProg();
    if (fromBar && fromBar.length) return fromBar;

    // Fallback to parsing the table and exclude in-progress row
    const fromTable = rowsFromTableExcludeInProg();
    if (fromTable && fromTable.length) return fromTable;

    return [];
  }

  /* ========== PREPARE PAYLOAD (Event -> A, Stamp -> B, Hour -> C, Values D..AB, Log-time -> AC) ========== */
  function preparePayloadRows(rowObjs) {
    const profileKey = detectProfileFromPage() || 'PICK';
    const eventName = PROFILES[profileKey]?.label || 'ISPS Pick';

    const payloadRows = rowObjs.map(r => {
      // extract hour correctly (handles dd/mm/yyyy hh:mm and other formats)
      let hour = '';
      const dt = parseTimestampToDate(r.timestamp);
      if (dt && !isNaN(dt.getTime())) {
        hour = String(dt.getHours()).padStart(2, '0');
      } else {
        // fallback: look for trailing time like "hh:mm" at end of string
        const m = (r.timestamp || '').match(/(\d{1,2}):\d{2}(?::\d{2})?$/);
        if (m) hour = m[1].padStart(2, '0');
      }

      // Build the row: event (A), stamp time (B), hour (C), then values (D..)
      const row = [
        eventName,            // A
        (r.timestamp || ''),  // B - Stamp time from page
        hour,                 // C - Hour extracted
        ...(r.valuesStr || []) // D.. (Total Value + location columns)
      ];

      // Ensure that values occupy up to column AB (index 27).
      // If values are fewer than expected, pad empty strings so index 28 is free for log time.
      while (row.length < LOG_COLUMN_INDEX) {
        row.push('');
      }

      // Append the **log time** (script runtime) into column AC (index 28).
      const logTime = new Date().toLocaleTimeString('en-GB', { hour12: false });
      row.push(logTime);

      return row;
    });

    return payloadRows;
  }

  /* ========== DUPLICATE AVOIDANCE ========== */
  function signatureOfRows(rows) {
    return JSON.stringify(rows);
  }

  /* ========== POST ========== */
  function postRowsToWebapp(rows) {
    if (!rows || !rows.length) {
      console.log('[MCK-POST] Nothing to send (no active rows after excluding in-progress).');
      return;
    }

    const sig = signatureOfRows(rows);
    const lastSig = sessionStorage.getItem(STORAGE_KEY);
    if (lastSig === sig) {
      console.log('[MCK-POST] Skipping post; identical to last payload.');
      return;
    }

    const body = JSON.stringify({ rows, source: 'tampermonkey_stats_poster_all_active_skip_inprog', ts: new Date().toISOString() });

    GM_xmlhttpRequest({
      method: 'POST',
      url: WEBAPP_URL,
      headers: { 'Content-Type': 'application/json' },
      data: body,
      onload: function (res) {
        console.log('[MCK-POST] response', res.status, res.responseText);
        if (res.status >= 200 && res.status < 300) {
          sessionStorage.setItem(STORAGE_KEY, sig);
        }
      },
      onerror: function (err) {
        console.error('[MCK-POST] request error', err);
      },
      ontimeout: function () {
        console.warn('[MCK-POST] request timeout');
      }
    });
  }

  /* ========== RUN ON INTERVAL ========== */
  async function runPosterOnce() {
    // Only operate when on statsdetail
    if (!window.location.hash?.includes('scr=statsdetail')) {
      return;
    }

    const rows = collectActiveRowsExcludingInProg();
    if (!rows || !rows.length) {
      console.log('[MCK-POST] No active rows found to send (or all rows excluded as in-progress).');
      return;
    }

    const payloadRows = preparePayloadRows(rows);
    postRowsToWebapp(payloadRows);
  }

  /* ========== NEW: waitForStatsBar (added) ========== */
  async function waitForStatsBar(timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (document.getElementById('mckList')) return true;
      await sleep(300);
    }
    return false;
  }

  /* ========== SCHEDULER: run at minutes 01-05 each hour (once per minute within that window) ========== */
  (async function init() {
    console.log('[MCK-POST] Waiting for stats bar...');
    await waitForStatsBar();
    console.log('[MCK-POST] Stats bar detected.');

    // We'll poll every 8 seconds and run only when minute is 1-5 and we haven't already run in that minute.
    let lastRunMinute = null;

    // Polling loop
    setInterval(() => {
      try {
        const d = new Date();
        const curMin = d.getMinutes();
        // run only during minutes 1..5 inclusive
        if (curMin >= 3 && curMin <= 5) {
          if (lastRunMinute !== curMin) {
            // trigger a run
            console.log(`[MCK-POST] Scheduled window — running poster for minute ${String(curMin).padStart(2,'0')}`);
            runPosterOnce();
            lastRunMinute = curMin;
          }
        } else {
          // outside the 01-05 window; reset lastRunMinute so next window can start fresh
          if (lastRunMinute !== null) {
            lastRunMinute = null;
          }
        }
      } catch (e) {
        console.error('[MCK-POST] scheduler error', e);
      }
    }, 8000);

    console.log('[MCK-POST] Scheduler started — will run at minutes 01..05 each hour (e.g. 12:01..12:05). Webapp:', WEBAPP_URL);
  })();

})();