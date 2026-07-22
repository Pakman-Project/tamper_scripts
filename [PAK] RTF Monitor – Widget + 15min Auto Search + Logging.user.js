// ==UserScript==
// @name         [PAK] RTF Monitor – Widget + 15min Auto Search + Logging
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  15-minute aligned auto search with profile rules + logging + CSV
// @author       Pak
// @match        http://pon-wpws22:8091/X/NX/ReserveToForward/RTFMonitor*
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==

(function () {
  'use strict';

  /* ================= CONFIG ================= */

  const ENDPOINT =
    'https://script.google.com/a/macros/next.co.uk/s/AKfycbzDoiJX8bYpcJ35_shrlaOtHnLWb3BSmTilFUDwbWWL9P5Xk3X6TT9tafckA2mp7JDg5Q/exec';

  const PROFILE_20 = '20';
  const PROFILE_21 = '21';

  const LOG_KEY = 'rtfSearchLog';
  const LOG_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
  const WIDGET_ID = 'rtf-widget';

  let nextAutoTime = null;

  /* ================= UTILS ================= */

  const pad = n => String(n).padStart(2, '0');
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function formatNow() {
    const d = new Date();
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /* ================= DOM READ ================= */

  function getDateRange() {
    const inputs = [...document.querySelectorAll(
      'input.mud-input-input-control[placeholder="dd/mm/yyyy"][readonly]'
    )];

    if (inputs.length < 2) return { from: '', to: '' };

    inputs.sort((a, b) =>
      a.getBoundingClientRect().left - b.getBoundingClientRect().left
    );

    return { from: inputs[0].value || '', to: inputs[1].value || '' };
  }

  function getLocatedValue() {
    const cell = document.querySelector('td.mud-table-cell[data-label="Located"]');
    return cell ? cell.textContent.replace(/,/g, '').trim() : '';
  }

  /* ================= LOCATED STABILITY ================= */

  function waitForLocatedStable({ timeoutMs = 12000, stableMs = 800, pollMs = 200 } = {}) {
    return new Promise(resolve => {
      let lastVal = '';
      let lastChange = Date.now();
      const start = Date.now();

      const t = setInterval(() => {
        const v = getLocatedValue();
        if (v !== lastVal) {
          lastVal = v;
          lastChange = Date.now();
        }
        if (v && Date.now() - lastChange >= stableMs) {
          clearInterval(t);
          resolve(v);
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(t);
          resolve(v || '');
        }
      }, pollMs);
    });
  }

  /* ================= LOGGING ================= */

  function loadLog() {
    try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; }
    catch { return []; }
  }

  function saveLog(log) {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  }

  function cleanup(log) {
    const now = Date.now();
    return log.filter(e => now - e.ts <= LOG_RETENTION_MS);
  }

  // Option B: time-based duplicate guard
  function isDuplicate(log, e) {
    const last = log.at(-1);
    if (!last) return false;
    // Treat as duplicate only if identical and created within recentMs
    const recentMs = 5 * 1000; // 5 seconds — adjust if needed
    return last.from === e.from && last.to === e.to && last.located === e.located && (e.ts - last.ts) < recentMs;
  }

  function postRemote(entry) {
    GM_xmlhttpRequest({
      method: 'POST',
      url: ENDPOINT,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(entry)
    });
  }

  async function logSearch() {
    let log = cleanup(loadLog());
    const { from, to } = getDateRange();
    const located = await waitForLocatedStable();
    if (!from || !to || !located) return;

    const entry = { ts: Date.now(), time: formatNow(), from, to, located };
    if (isDuplicate(log, entry)) return;

    log.push(entry);
    saveLog(log);
    postRemote(entry);
  }

  /* ================= SEARCH LISTENER ================= */

  function attachSearchLogger() {
    const btn = [...document.querySelectorAll('span.mud-button-label')]
      .find(e => e.textContent.trim() === 'Search');

    if (!btn || btn.dataset.rtfLogged) return;
    btn.dataset.rtfLogged = '1';
    btn.addEventListener('click', logSearch);
  }

  /* ================= BUTTON HELPERS ================= */

  function clickButton(label) {
    const btn = [...document.querySelectorAll('span.mud-button-label')]
      .find(e => e.textContent.trim() === label);
    btn?.click();
  }

  async function loadProfile(name) {
    clickButton('Profile Manager');
    await sleep(800);

    const row = [...document.querySelectorAll('td[data-label="Name"]')]
      .find(td => td.textContent.trim() === name);

    row?.closest('tr')?.querySelector('span.mud-button-label')?.click();
    await sleep(1200);
  }

  /* ================= AUTO SEQUENCE ================= */

  function getNextQuarter() {
    const now = new Date();
    const next = new Date(now);
    const q = Math.ceil((now.getMinutes() + 0.01) / 15) * 15;

    if (q === 60) next.setHours(now.getHours() + 1, 0, 0, 0);
    else next.setMinutes(q, 0, 0);

    return next;
  }

  async function runAutoSequence() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();

    if (h === 1 && m === 0) {
      await loadProfile(PROFILE_21);
      clickButton('Search');
    }
    else if (h === 6 && m === 0) {
      await loadProfile(PROFILE_21);
      clickButton('Search');
      await sleep(10000);
      await loadProfile(PROFILE_20);
      clickButton('Search');
    }
    else {
      clickButton('Search');
    }

    scheduleNextAuto();
  }

  function scheduleNextAuto() {
    const next = getNextQuarter();
    nextAutoTime = next.getTime();
    setTimeout(runAutoSequence, nextAutoTime - Date.now());
  }

  /* ================= CSV DOWNLOAD ================= */

  function downloadCSV() {
    const log = cleanup(loadLog());
    if (!log.length) return alert('No log data');

    const rows = [
      ['Log Time', 'From Date', 'To Date', 'Located'],
      ...log.map(l => [l.time, l.from, l.to, l.located])
    ];

    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'RTF_Search_Log.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ================= WIDGET ================= */

  function createWidget() {
    if (document.getElementById(WIDGET_ID)) return;

    const w = document.createElement('div');
    w.innerHTML = `
  <div style="display:flex;flex-direction:column">

    <!-- FIRST ROW -->
    <div style="display:flex;align-items:center;gap:6px">
      <div id="rtf-text"></div>
      <button id="rtf-csv" style="
        font-size:12px;
        padding:2px 6px;
        cursor:pointer;
      ">📄</button>
    </div>

    <!-- SECOND ROW -->
    <div id="rtf-countdown" style="
      font-size:11px;
      color:#9a9a9a;
      margin-top:2px;
    "></div>

  </div>
`;


    Object.assign(w.style, {
      position: 'fixed',
      top: '8px',
      right: '55px',
      zIndex: 9999,
      background: '#1e1e1e',
      color: '#fff',
      padding: '8px 12px',
      fontFamily: 'monospace',
      borderRadius: '6px'
    });

    document.body.appendChild(w);
    document.getElementById('rtf-csv').addEventListener('click', downloadCSV);
  }

  function updateWidget() {
    const { from, to } = getDateRange();
    const located = getLocatedValue();
    if (from && to && located) {
      document.getElementById('rtf-text').textContent =
        `${from} → ${to} | Located : ${located}`;
    }
  }

  function updateCountdown() {
    if (!nextAutoTime) return;
    const diff = Math.max(0, nextAutoTime - Date.now());
    const m = pad(Math.floor(diff / 60000));
    const s = pad(Math.floor((diff % 60000) / 1000));
    document.getElementById('rtf-countdown').textContent =
      `Next auto click in ${m}:${s}`;
  }

  /* ================= INIT ================= */

  function init() {
    saveLog(cleanup(loadLog()));
    createWidget();

    setInterval(updateWidget, 1000);
    setInterval(updateCountdown, 1000);
    setInterval(attachSearchLogger, 2000);

    scheduleNextAuto();
    console.log('[RTF] 15-minute scheduler armed');
  }

  setTimeout(init, 1200);

})();
