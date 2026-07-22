// ==UserScript==
// @name         [MCK & PAK] Stats Detail - Automation Utilisation
// @namespace    http://tampermonkey.net/
// @version      2.30
// @description  Stats Detail bottom bar (FIT, no scrollbars) with auto-refresh every 5 minutes + right-side refresh info. IN PROGRESS row based on newest changed row. Fixed column order; missing -> 0 (dim). Refresh triggers page Ajax refresh first. Remembers minimize PER TAB (sessionStorage). Click Total Value cell to copy with YELLOW flash.
// @author       Mucek & Pak
// @match        *://pon-wpas46-cl01.next-uk.next.loc/cgi-bin/web_om_rsps2.exe*
// @grant        GM_setClipboard
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BMCK%20%26%20PAK%5D%20Stats%20Detail%20-%20Automation%20Utilisation.user.js
// @downloadURL  https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BMCK%20%26%20PAK%5D%20Stats%20Detail%20-%20Automation%20Utilisation.user.js
// ==/UserScript==

(function () {
  'use strict';

  // global guard (avoid double init on weird re-injections)
  if (window.__MCK_STATSDETAIL_INITED__) return;
  window.__MCK_STATSDETAIL_INITED__ = true;

  const TABLE_ID = 'listtbl1';
  const BAR_ID = 'mck-stats-bottom-bar';

  const FLASH_MS = 2000;
  const FLASH_TEXT_OK = '✔ COPIED';
  const FLASH_TEXT_FAIL = '✖ FAILED';

  // auto refresh interval
  const AUTO_REFRESH_MS = 2 * 60 * 1000; // 2 minutes

  const STORAGE_PROFILE  = 'mck_statsdetail_profile_tab';
  const STORAGE_COLLAPSE = 'mck_statsdetail_collapsed_tab';

  // snapshot for "new numbers" detection (per tab)
  const STORAGE_LAST_SNAPSHOT = 'mck_statsdetail_last_snapshot_tab';

  const PROFILES = {
    PICK: {
      label: 'ISPS Pick',
      icon: '🟦',
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
      icon: '🟩',
      cols: [
        'Total Value',
        '1AT1','1AT2','1AT3',
        '1BT1','1BT2','1BT3',
        '1CT1','1CT2','1CT3',
        '2AT1','2AT2','2AT3',
        '2BT1','2BT2','2BT3',
        '2CT1','2CT2','2CT3'
      ]
    }
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function getHashParams() {
    const h = (location.hash || '').replace(/^#/, '');
    return new URLSearchParams(h);
  }

  function isOnStatsDetail() {
    const hp = getHashParams();
    return hp.get('scr') === 'statsdetail';
  }

  function normText(s) {
    return (s ?? '').replace(/\s+/g, ' ').trim();
  }

  function toNumString(cellText) {
    let t = normText(cellText);
    if (!t) return '0';
    t = t.replace(/,/g, '');
    const m = t.match(/-?\d+(\.\d+)?/);
    return m ? m[0] : '0';
  }

  function nowTimeStr() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  async function copyText(txt) {
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(txt, 'text');
        return true;
      }
    } catch (e) {}

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(txt);
        return true;
      }
    } catch (e) {}

    try {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {}

    return false;
  }

  function getProfileKey() {
    const saved = sessionStorage.getItem(STORAGE_PROFILE);
    if (saved && PROFILES[saved]) return saved;
    return 'PICK';
  }
  function setProfileKey(key) {
    sessionStorage.setItem(STORAGE_PROFILE, key);
  }
  function getActiveProfile() {
    return PROFILES[getProfileKey()];
  }
  function isCollapsedSaved() {
    return sessionStorage.getItem(STORAGE_COLLAPSE) === '1';
  }
  function setCollapsedSaved(v) {
    sessionStorage.setItem(STORAGE_COLLAPSE, v ? '1' : '0');
  }

  // ----------------- SNAPSHOT (detect "new numbers") -----------------
  function loadLastSnapshot() {
    try {
      const raw = sessionStorage.getItem(STORAGE_LAST_SNAPSHOT);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : {};
    } catch {
      return {};
    }
  }

  function saveLastSnapshot(map) {
    try {
      sessionStorage.setItem(STORAGE_LAST_SNAPSHOT, JSON.stringify(map || {}));
    } catch {}
  }

  function rowKey(rowObj, index) {
    const ts = normText(rowObj?.timestamp || '');
    if (ts) return `ts:${ts}`;
    return `idx:${index}`;
  }

  function rowSignature(rowObj) {
    return `${normText(rowObj?.timestamp || '')}||${(rowObj?.valuesStr || []).join('|')}`;
  }

  function commitSnapshot(rowObjs) {
    const map = {};
    for (let i = 0; i < rowObjs.length; i++) {
      const r = rowObjs[i];
      if (!r) continue;
      const key = rowKey(r, i);
      map[key] = rowSignature(r);
    }
    saveLastSnapshot(map);
  }
  // ---------------------------------------------------------------------

  // ----------------- TIMESTAMP PARSING + "older than" check -----------------
  function parseTimestampToDate(ts) {
    if (!ts) return null;
    ts = ts.trim();

    // Try native Date parse first (ISO-ish or full datetime)
    const d1 = new Date(ts);
    if (!isNaN(d1.getTime())) return d1;

    // Try HH:MM or HH:MM:SS (assume today)
    const timeOnly = ts.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeOnly) {
      const now = new Date();
      const hh = parseInt(timeOnly[1], 10);
      const mm = parseInt(timeOnly[2], 10);
      const ss = timeOnly[3] ? parseInt(timeOnly[3], 10) : 0;
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, ss);
    }

    // Try common UK style: DD/MM/YYYY [HH:MM[:SS]] or D/M/YY etc.
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

    // Could try more heuristics if needed; otherwise return null
    return null;
  }

  function isTimestampOlderThanHours(rowObj, hours) {
    const ts = normText(rowObj?.timestamp || '');
    if (!ts) return false; // no timestamp -> can't treat as old
    const dt = parseTimestampToDate(ts);
    if (!dt || isNaN(dt.getTime())) return false;
    const diff = Date.now() - dt.getTime();
    return diff > (hours * 3600 * 1000);
  }
  // ---------------------------------------------------------------------

  // right-side refresh info
  function setRightInfo(text) {
    const el = document.getElementById('mckRightInfo');
    if (el) el.textContent = text;
  }

  function injectStyles(colCount) {
    let st = document.getElementById('mck-stats-style');
    if (!st) {
      st = document.createElement('style');
      st.id = 'mck-stats-style';
      document.head.appendChild(st);
    }

    st.textContent = `
      :root{
        --mck-bg: #1f1f1f;
        --mck-bg2:#161616;
        --mck-line: rgba(255,255,255,.10);
        --mck-line2: rgba(255,255,255,.08);
        --mck-text:#fff;
        --mck-muted2: rgba(255,255,255,.35);
        --mck-blue: rgba(60, 150, 255, .16);
        --mck-blue2: rgba(60, 150, 255, .35);

        --mck-orangeRow: rgba(255, 140, 0, .12);
        --mck-orangeBorder: rgba(255, 140, 0, .95);
        --mck-orangeBadge: rgba(255, 165, 0, .82);
      }

      #${BAR_ID}{
        position:fixed; left:0; right:0; bottom:0;
        z-index:999999;
        background:var(--mck-bg);
        color:var(--mck-text);
        border-top:1px solid rgba(255,255,255,.12);
        font-family:system-ui, Segoe UI, Arial;
        font-size:12px;
        box-shadow:0 -10px 28px rgba(0,0,0,.35);
      }

      #${BAR_ID} .mck-wrap{
        display:flex;
        flex-direction:column;
        gap:6px;
        padding:7px 10px;
        max-height: 38vh;
      }

      #${BAR_ID} .mck-top{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
      }

      #${BAR_ID} .mck-left{
        display:flex;
        align-items:center;
        gap:10px;
        min-width: 140px;
      }

      #${BAR_ID} .mck-status{
        font-size:11px;
        opacity:.75;
        white-space:nowrap;
      }

      #${BAR_ID} .mck-actions{
        display:flex;
        gap:8px;
        align-items:center;
      }

      /* right info (before refresh) */
      #${BAR_ID} .mck-rightInfo{
        font-size:11px;
        font-weight:900;
        opacity:.75;
        padding:0 10px;
        border:1px solid rgba(255,255,255,.14);
        border-radius:999px;
        height:30px;
        display:flex;
        align-items:center;
        background: rgba(255,255,255,.06);
        white-space:nowrap;
      }

      #${BAR_ID} .mck-ibtn{
        width:34px;
        height:30px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        border:1px solid rgba(255,255,255,.14);
        border-radius:6px;
        background:#e6e6e6;
        color:#111;
        cursor:pointer;
        font-weight:900;
        padding:0;
      }
      #${BAR_ID} .mck-ibtn:hover{ filter:brightness(.96); }
      #${BAR_ID} .mck-ibtn:disabled{ opacity:.65; cursor:not-allowed; }
      #${BAR_ID} .mck-ibtn i{ font-size:15px; line-height:1; }

      #${BAR_ID} .mck-list{
        overflow:auto;
        border:1px solid var(--mck-line);
        border-radius:12px;
        background:var(--mck-bg2);
      }

      #${BAR_ID} .mck-gridRow{
        display:grid;
        grid-template-columns: 150px 1fr 48px;
        gap:10px;
        align-items:center;
        padding:6px 8px;
        border-bottom:1px solid var(--mck-line2);
      }
      #${BAR_ID} .mck-gridRow:last-child{ border-bottom:none; }

      #${BAR_ID} .mck-ts{
        font-weight:900;
        white-space:nowrap;
      }

      #${BAR_ID} .mck-dataWrap{
        overflow: hidden !important;
        position: relative;
      }

      #${BAR_ID} .mck-dataGrid{
        display:grid;
        grid-template-columns: repeat(${colCount}, minmax(0, 1fr));
        gap:4px;
        align-items:center;
        width:100%;
      }

      #${BAR_ID} .mck-head{
        position: sticky;
        top: 0;
        z-index: 10;
        background: linear-gradient(to bottom, rgba(31,31,31,.98), rgba(22,22,22,.98));
        border-bottom: 1px solid var(--mck-line);
      }

      #${BAR_ID} .mck-colHead{
        font-size:10px;
        padding:3px 5px;
        border-radius:10px;
        border:1px solid var(--mck-line2);
        color: rgba(255,255,255,.82);
        background: rgba(255,255,255,.06);
        white-space:nowrap;
        text-align:center;
        overflow:hidden;
        text-overflow:ellipsis;
        min-width:0;
      }

      #${BAR_ID} .mck-cell{
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
        font-size:10.5px;
        padding:3px 5px;
        border-radius:10px;
        border:1px solid var(--mck-line2);
        background: rgba(255,255,255,.06);
        white-space:nowrap;
        text-align:right;
        overflow:hidden;
        text-overflow:ellipsis;
        min-width:0;
      }

      #${BAR_ID} .mck-cell.is-zero{
        color: var(--mck-muted2);
        background: rgba(255,255,255,.03);
        border-color: rgba(255,255,255,.06);
      }

      #${BAR_ID} .mck-cell.is-missing{
        color: var(--mck-muted2);
        background: rgba(255,255,255,.02);
        border-color: rgba(255,255,255,.04);
      }

      #${BAR_ID} .mck-cell.is-total{
        cursor: pointer;
        position: relative;
      }
      #${BAR_ID} .mck-cell.is-total:hover{
        filter: brightness(1.12);
        box-shadow: 0 0 0 1px rgba(60,150,255,.35) inset;
      }

      #${BAR_ID} .mck-cell.flash-copy{
        background: rgba(255, 215, 0, 0.55) !important;
        border-color: rgba(255, 215, 0, 1) !important;
        color: #000 !important;
        font-weight: 900 !important;
        text-align: center !important;
      }

      #${BAR_ID} .mck-rowActive{
        background: var(--mck-blue);
        box-shadow: inset 3px 0 0 var(--mck-blue2);
      }

      #${BAR_ID} .mck-rowAllZero{
        opacity:.45;
      }

      #${BAR_ID}.mck-collapsed .mck-list{ display:none; }

      #${BAR_ID} .mck-rowInProgress{
        background: var(--mck-orangeRow) !important;
        box-shadow: inset 0 0 0 3px var(--mck-orangeBorder) !important;
      }
      #${BAR_ID} .mck-rowInProgress .mck-cell{
        opacity: .22;
      }
      #${BAR_ID} .mck-rowInProgress .mck-dataWrap::after{
        content: "IN PROGRESS";
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        padding: 6px 14px;
        border-radius: 999px;
        background: var(--mck-orangeBadge);
        color: #000;
        font-weight: 1000;
        letter-spacing: .8px;
        text-transform: uppercase;
        border: 1px solid rgba(255,255,255,.16);
        box-shadow: 0 10px 26px rgba(0,0,0,.35);
        pointer-events: none;
        z-index: 5;
        white-space: nowrap;
      }
    `;
  }

  function detectProfileFromPage() {
    // find the drill link
    const link = [...document.querySelectorAll('a[title="Drill to Stats Detail"]')]
      .find(a => a.textContent);

    if (!link) return null;

    const txt = link.textContent.trim();

    if (txt === 'STATS_EVENT_GTP_PICKS_PICKED') return 'PICK';
    if (txt === 'STATS_EVENT_TOPUP_UNITS_TOPPED_UP') return 'TOPUP';

    return null;
  }

  function setToggleIcon(bar, collapsed) {
    const t = bar?.querySelector('#mckToggle');
    if (!t) return;
    const icon = t.querySelector('i');
    if (!icon) return;
    icon.className = collapsed ? 'fa fa-chevron-up' : 'fa fa-chevron-down';
    t.title = collapsed ? 'Expand' : 'Minimize';
  }

  function applyCollapsedUI(bar, collapsed) {
    if (collapsed) {
      bar.classList.add('mck-collapsed');
      document.body.style.paddingBottom = '90px';
    } else {
      bar.classList.remove('mck-collapsed');
      document.body.style.paddingBottom = '240px';
    }
    setToggleIcon(bar, collapsed);
  }

  function createBar() {
    let bar = document.getElementById(BAR_ID);
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = BAR_ID;

    // Mode block removed per request. Profile is auto-detected in background.
    bar.innerHTML = `
      <div class="mck-wrap">
        <div class="mck-top">
          <div class="mck-left">
            <div class="mck-status" id="mckStatus">—</div>
          </div>

          <div class="mck-actions">
            <div class="mck-rightInfo" id="mckRightInfo" title="Auto refresh status">Auto: ON • Last: —</div>

            <button class="mck-ibtn" id="mckRefresh" title="Refresh">
              <i class="fa fa-refresh"></i>
            </button>
            <button class="mck-ibtn" id="mckCopyAll" title="Copy ALL">
              <i class="fa fa-copy"></i>
            </button>
            <button class="mck-ibtn" id="mckToggle" title="Minimize">
              <i class="fa fa-chevron-down"></i>
            </button>
          </div>
        </div>

        <div class="mck-list" id="mckList"></div>
      </div>
    `;

    document.body.appendChild(bar);

    applyCollapsedUI(bar, isCollapsedSaved());
    return bar;
  }

  function setStatusText(t) {
    const el = document.getElementById('mckStatus');
    if (el) el.textContent = t;
  }

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

  function getDataRows(table) {
    const rows = [...table.querySelectorAll('tr')];
    if (rows.length <= 1) return [];
    return rows.slice(1).filter(r => r.querySelector('td.list_table_data_col'));
  }

  function buildHeaderIndexMap(siteHeaders) {
    const map = new Map();
    siteHeaders.forEach((h, idx) => map.set(h, idx));
    return map;
  }

  function rowToFixedValues(row, siteHeaderMap, cols) {
    const tds = [...row.querySelectorAll('td.list_table_data_col')];
    const timestamp = normText(tds[0]?.textContent || '');

    const valuesStr = [];
    const valuesNum = [];
    const missingFlags = [];

    for (const col of cols) {
      const headerIdx = siteHeaderMap.get(col);
      if (typeof headerIdx !== 'number') {
        valuesStr.push('0');
        valuesNum.push(0);
        missingFlags.push(true);
        continue;
      }
      const td = tds[headerIdx];
      const s = toNumString(td?.textContent ?? '');
      valuesStr.push(s);
      valuesNum.push(Number(s) || 0);
      missingFlags.push(false);
    }

    const allZero = !valuesNum.some(n => n !== 0);
    return { timestamp, valuesStr, valuesNum, missingFlags, allZero };
  }

  function toTSVRow(rowObj) {
    return [rowObj.timestamp, ...rowObj.valuesStr].join('\t');
  }

  function chooseInProgressIndex(rowObjs) {
    const last = loadLastSnapshot();

    let changedIdx = -1;
    for (let i = rowObjs.length - 1; i >= 0; i--) {
      const r = rowObjs[i];
      if (!r) continue;

      const ts = normText(r.timestamp || '');
      if (!ts) continue;
      if (r.allZero) continue;

      // NEW: if timestamp is older than 2 hours, treat as completed -> skip
      if (isTimestampOlderThanHours(r, 2)) continue;

      const key = rowKey(r, i);
      const sig = rowSignature(r);
      const prev = last[key];

      if (prev !== sig) {
        changedIdx = i;
        break;
      }
    }

    if (changedIdx === -1) {
      for (let i = rowObjs.length - 1; i >= 0; i--) {
        const r = rowObjs[i];
        if (!r) continue;
        const ts = normText(r.timestamp || '');
        if (!ts) continue;
        if (r.allZero) continue;

        // NEW: skip rows older than 2 hours (consider completed)
        if (isTimestampOlderThanHours(r, 2)) continue;

        // return the most recent timestamped non-zero row (not older than 2h)
        return i;
      }
      return -1;
    }

    return changedIdx;
  }

  function renderList(rowObjs, cols) {
    const list = document.getElementById('mckList');
    if (!list) return;
    list.innerHTML = '';

    const inProgIdx = chooseInProgressIndex(rowObjs);

    const head = document.createElement('div');
    head.className = 'mck-gridRow mck-head';

    const tsH = document.createElement('div');
    tsH.className = 'mck-ts';
    tsH.textContent = 'Timestamp';

    const dataWrapH = document.createElement('div');
    dataWrapH.className = 'mck-dataWrap';

    const dataGridH = document.createElement('div');
    dataGridH.className = 'mck-dataGrid';

    cols.forEach(col => {
      const h = document.createElement('div');
      h.className = 'mck-colHead';
      h.textContent = col;
      dataGridH.appendChild(h);
    });

    dataWrapH.appendChild(dataGridH);

    const copyH = document.createElement('div');
    copyH.style.textAlign = 'right';
    copyH.style.opacity = '.7';
    copyH.style.fontWeight = '900';
    copyH.innerHTML = `<i class="fa fa-clipboard"></i>`;
    copyH.title = 'Copy row';

    head.appendChild(tsH);
    head.appendChild(dataWrapH);
    head.appendChild(copyH);
    list.appendChild(head);

    rowObjs.forEach((r, rowIndex) => {
      const tsv = toTSVRow(r);

      const rowDiv = document.createElement('div');
      rowDiv.className = 'mck-gridRow ' + (r.allZero ? 'mck-rowAllZero' : 'mck-rowActive');

      if (rowIndex === inProgIdx) rowDiv.classList.add('mck-rowInProgress');

      const ts = document.createElement('div');
      ts.className = 'mck-ts';
      ts.textContent = r.timestamp || '(no timestamp)';

      const dataWrap = document.createElement('div');
      dataWrap.className = 'mck-dataWrap';

      const dataGrid = document.createElement('div');
      dataGrid.className = 'mck-dataGrid';

      r.valuesStr.forEach((val, i) => {
        const cell = document.createElement('div');
        const isZero = (r.valuesNum[i] === 0);
        const isMissing = r.missingFlags[i];

        cell.className =
          'mck-cell' +
          (isZero ? ' is-zero' : '') +
          (isMissing ? ' is-missing' : '');

        if (i === 0) {
          cell.className += ' is-total';
          cell.title = `Total Value: ${val} (click to copy)`;

          cell.addEventListener('pointerdown', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const ok = await copyText(val);

            const prev = cell.textContent;
            cell.textContent = ok ? FLASH_TEXT_OK : FLASH_TEXT_FAIL;
            cell.classList.add('flash-copy');

            setTimeout(() => {
              if (!cell.isConnected) return;
              cell.textContent = prev;
              cell.classList.remove('flash-copy');
            }, FLASH_MS);
          });
        } else {
          cell.title = `${cols[i]}: ${val}${isMissing ? ' (missing on page)' : ''}`;
        }

        cell.textContent = val;
        dataGrid.appendChild(cell);
      });

      dataWrap.appendChild(dataGrid);

      const copyWrap = document.createElement('div');
      copyWrap.style.textAlign = 'right';

      const btn = document.createElement('button');
      btn.className = 'mck-ibtn';
      btn.style.width = '34px';
      btn.style.height = '30px';
      btn.title = 'Copy row';
      btn.innerHTML = `<i class="fa fa-clipboard"></i>`;

      btn.addEventListener('click', async () => {
        await copyText(tsv);
        btn.innerHTML = `<i class="fa fa-check"></i>`;
        setTimeout(() => (btn.innerHTML = `<i class="fa fa-clipboard"></i>`), 900);
      });

      copyWrap.appendChild(btn);

      rowDiv.appendChild(ts);
      rowDiv.appendChild(dataWrap);
      rowDiv.appendChild(copyWrap);
      list.appendChild(rowDiv);
    });

    commitSnapshot(rowObjs);
  }

  function findPageRefreshLink() {
    const links = [...document.querySelectorAll('a[href*="Ajax.get("], a[title="Refresh"]')];
    return links.find(a => (a.getAttribute('href') || '').includes('userrefresh=1')) ||
           links.find(a => (a.getAttribute('title') || '').toLowerCase() === 'refresh') ||
           null;
  }

  function getRefreshHashFromLink(a) {
    const href = a?.getAttribute?.('href') || '';
    const m = href.match(/Ajax\.get\('([^']+)'\)/i) || href.match(/Ajax\.get\("([^"]+)"\)/i);
    return m ? m[1] : null;
  }

  async function triggerPageRefreshAndWait() {
    const foundTable = findTableEverywhere();
    const table = foundTable?.table;
    const before = table ? normText(table.textContent).slice(0, 500) : '';

    const link = findPageRefreshLink();
    const hash = getRefreshHashFromLink(link);

    if (hash && typeof window.Ajax?.get === 'function') window.Ajax.get(hash);
    else if (link) link.click();
    else return;

    const start = Date.now();
    while (Date.now() - start < 6000) {
      await sleep(200);
      const nowFound = findTableEverywhere();
      const nowTable = nowFound?.table;
      if (!nowTable) continue;

      const after = normText(nowTable.textContent).slice(0, 500);
      if (after && after !== before) break;
    }
  }

  async function refreshBarFromPage(sourceLabel) {
    const btn = document.getElementById('mckRefresh');
    if (btn) btn.disabled = true;

    setRightInfo(`Refreshing… (${sourceLabel || 'manual'})`);
    setStatusText('Refreshing page…');

    try {
      await triggerPageRefreshAndWait();
      await sleep(250);
      setStatusText('Updating bar…');
      await refresh();

      const t = nowTimeStr();
      setStatusText('Ready');
      setRightInfo(`Auto: ON • Last: ${t}`);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function refresh() {
    const autoMode = detectProfileFromPage();
    if (autoMode && autoMode !== getProfileKey()) {
      console.log('[MCK] Auto mode switch →', autoMode);
      setProfileKey(autoMode);
    }
    const prof = getActiveProfile();
    const cols = prof.cols;

    injectStyles(cols.length);

    const found = findTableEverywhere();
    if (!found?.table) {
      setStatusText(`Table "${TABLE_ID}" not found…`);
      return;
    }

    const table = found.table;
    const siteHeaders = getSiteHeaders(table);
    const headerMap = buildHeaderIndexMap(siteHeaders);

    const dataRows = getDataRows(table);
    const rowObjs = dataRows.map(r => rowToFixedValues(r, headerMap, cols));

    const hp = getHashParams();
    setStatusText(`${prof.icon} ${prof.label} • Rows: ${rowObjs.length} • Cols: ${cols.length} • period=${hp.get('period') || ''}`);

    renderList(rowObjs, cols);

    const copyAllBtn = document.getElementById('mckCopyAll');
    if (copyAllBtn) {
        copyAllBtn.onclick = async () => {
            const inProgIdx = chooseInProgressIndex(rowObjs);

            let rowsToCopy;
            if (inProgIdx === -1 || inProgIdx === rowObjs.length - 1 && !rowObjs[inProgIdx].allZero) {
                // No in-progress detected, or last row is actually completed
                rowsToCopy = rowObjs;
            } else {
                // Only copy rows BEFORE the in-progress row
                rowsToCopy = rowObjs.filter((_, i) => i < inProgIdx);
            }

            const all = rowsToCopy.map(r => toTSVRow(r)).join('\n');
            await copyText(all);

            copyAllBtn.innerHTML = `<i class="fa fa-check"></i>`;
            setTimeout(() => (copyAllBtn.innerHTML = `<i class="fa fa-copy"></i>`), 900);
        };

    }
  }

  function hookButtons(bar) {
    bar.querySelector('#mckRefresh').addEventListener('click', () => refreshBarFromPage('manual'));

    const toggleBtn = bar.querySelector('#mckToggle');
    toggleBtn.addEventListener('click', () => {
      const nowCollapsed = !bar.classList.contains('mck-collapsed');
      setCollapsedSaved(nowCollapsed);
      applyCollapsedUI(bar, nowCollapsed);
    });
  }

  // auto refresh loop (safe: no overlap)
  let autoTimer = null;
  let autoRunning = false;

  function startAutoRefresh() {
    if (autoTimer) clearInterval(autoTimer);

    setRightInfo('Auto: ON • Last: —');

    autoTimer = setInterval(async () => {
      if (autoRunning) return;
      autoRunning = true;
      try {
        await refreshBarFromPage('auto');
      } finally {
        autoRunning = false;
      }
    }, AUTO_REFRESH_MS);
  }

  // WAIT FOR statsdetail (hash may appear late due to Ajax)
  async function waitForStatsDetailAndInit() {
    // already initialized UI?
    if (document.getElementById(BAR_ID)) return;

    // wait up to ~20s for scr=statsdetail
    for (let i = 0; i < 80; i++) {
      if (isOnStatsDetail()) break;
      await sleep(250);
    }
    if (!isOnStatsDetail()) return; // user never went to statsdetail

    // auto-detect profile and set it (no UI)
    const autoMode = detectProfileFromPage();
    if (autoMode) {
      setProfileKey(autoMode);
    }

    injectStyles(getActiveProfile().cols.length);

    const bar = createBar();
    hookButtons(bar);

    // wait for table to populate
    for (let i = 0; i < 30; i++) {
      await refresh();
      const ok = !!document.getElementById('mckList')?.children?.length;
      if (ok) break;
      await sleep(250);
    }

    startAutoRefresh();
    setRightInfo(`Auto: ON • Last: ${nowTimeStr()}`);

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const t = m.target;
        if (t && t.nodeType === 1) {
          const el = /** @type {Element} */ (t);
          if (el.closest && el.closest('#' + BAR_ID)) return;
        } else if (t && t.parentElement && t.parentElement.closest('#' + BAR_ID)) {
          return;
        }
      }
      clearTimeout(obs._t);
      obs._t = setTimeout(() => refresh(), 200);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  // init now + also on hash changes (when page switches via Ajax without full reload)
  (async function bootstrap() {
    await waitForStatsDetailAndInit();

    window.addEventListener('hashchange', async () => {
      // if user navigates into statsdetail later, inject then
      await waitForStatsDetailAndInit();
    });
  })();

})();