// ==UserScript==
// @name         [PAK] PO Progress Float Panel
// @namespace    http://tampermonkey.net/
// @version      7.3
// @description  Full v7.1 UI with unified icon buttons and a full-screen 38% black overlay while running the Inducting→Picking→Way→Drive sequence. Animated spinner while loading; only auto-click new batches that have Picking+Inducting. Console diagnostics. Supports both legacy and Modern (pon-wdws21) page layouts.
// @author       Pak
// @match        http://whds-batchoverviewprogress:8087/Batch/ProgressOverview
// @match        http://pon-wdws21:8087/Modern/Batch/ProgressOverview
// @grant        none
// @updateURL    https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20PO%20Progress%20Float%20Panel.user.js
// @downloadURL  https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20PO%20Progress%20Float%20Panel.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* -------------------- LAYOUT ADAPTER (legacy vs Modern page) -------------------- */
  // The Modern page (pon-wdws21 /Modern/) renders the same data as a Bootstrap
  // div grid instead of the legacy table markup, and its drill-down handler
  // ignores untrusted native clicks — rows must be clicked through the page's
  // own jQuery. Every layout-dependent lookup goes through these helpers.
  const PAK_MODERN = /\/modern\//i.test(location.pathname);
  const PAK_SEL = PAK_MODERN ? {
    batch: 'div.progress-overview-batch',
    desc: '.progress-overview-description-cell',
    clickDesc: '.progress-overview-description-cell',
    total: '.progress-overview-total-cell'
  } : {
    batch: 'div.batch-row[id^="Batch-"]',
    desc: '.description-column',
    clickDesc: 'div.batch-row-item.description-column',
    total: '.total-column'
  };
  // Legacy keeps the bar text in a .bar-label child; Modern puts it directly
  // on the .progress-bar segment.
  function pakBarLabel(scope, barClass) {
    if (!scope) return '';
    const el = PAK_MODERN
      ? scope.querySelector('.progress-bar.' + barClass)
      : scope.querySelector('.' + barClass + ' .bar-label');
    return el ? el.textContent : '';
  }
  function pakDrillClick(el) {
    if (!el) return;
    if (!PAK_MODERN) { try { el.click(); } catch (e) {} return; }
    const row = el.closest('.progress-overview-row') || el;
    const jq = window.jQuery;
    if (jq) jq(row).trigger('click');
    else { try { row.click(); } catch (e) {} }
  }

  /* -------------------- CONFIG / STYLES -------------------- */

  // Button sizing / visuals
  const BTN_SIZE = '36px';         // icon square for panel header buttons
  const TOGGLE_BTN_SIZE = '40px';  // floating toggle button
  const BTN_RADIUS = '7px';
  const BTN_BG = '#0b0b0b';
  const BTN_BG_ALT = '#111';
  const BTN_BORDER = '1px solid rgba(102,102,102,1)';
  const HOVER_SHADOW = '0 8px 20px rgba(0,0,0,0.45)';

  const OVERLAY_OPACITY = 0.38; // 38% opacity black when blocking UI

  // Font Awesome CDN (v4.7 works well for the icons used)
  const FA_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css';

  // Ensure Font Awesome is available
  (function loadFa() {
    if (!document.querySelector('link[href*="font-awesome"], link[href*="fontawesome"], link[href*="4.7.0"]')) {
      const fa = document.createElement('link');
      fa.rel = 'stylesheet';
      fa.href = FA_CDN;
      document.head.appendChild(fa);
    }
  })();

  // Shared CSS for spinner, buttons, overlay, table tweaks
  const sharedStyle = document.createElement('style');
  sharedStyle.id = 'pfp-shared-styles';
  sharedStyle.textContent = `
    /* spinner */
    @keyframes pfp-spin { to { transform: rotate(360deg); } }
    .pfp-spinner { display:flex; align-items:center; justify-content:center; flex-direction:column; height:100%; padding:30px 0; color:#ddd; }
    .pfp-spinner .spinner-circle { width:44px; height:44px; border-radius:50%; border:5px solid rgba(255,255,255,0.12); border-top-color: rgba(255,255,255,0.9); animation: pfp-spin 1s linear infinite; margin-bottom:12px; }
    .pfp-loading-text { font-family: Consolas, monospace; font-size:13px; color:#ddd; opacity:0.95; }

    /* button icon helper */
    .pfp-icon { pointer-events:none; display:inline-block; line-height:1; }

    /* unified icon buttons (square) */
    .pfp-btn {
      width: ${BTN_SIZE}; height: ${BTN_SIZE};
      padding: 0;
      display:inline-flex; align-items:center; justify-content:center;
      font-size:16px; border-radius: ${BTN_RADIUS}; border: ${BTN_BORDER};
      background: ${BTN_BG}; color: #fff; cursor:pointer; box-sizing:border-box;
      transition: transform 120ms ease, box-shadow 140ms ease, background-color 120ms ease;
      outline: none;
    }
    .pfp-btn.alt { background: ${BTN_BG_ALT}; }
    .pfp-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; box-shadow: none; }
    .pfp-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: ${HOVER_SHADOW}; }

    /* toggle floating button */
    .pfp-toggle {
      width: ${TOGGLE_BTN_SIZE}; height: ${TOGGLE_BTN_SIZE};
      padding: 0; display:flex; align-items:center; justify-content:center;
      font-size:18px; border-radius: ${BTN_RADIUS}; border: ${BTN_BORDER};
      background: #000000de; color:#fff; cursor:pointer; box-sizing:border-box;
      transition: transform 120ms ease, box-shadow 120ms ease, background-color 120ms;
    }
    .pfp-toggle:hover { transform: translateY(-2px); box-shadow: ${HOVER_SHADOW}; }

    /* overlay that blocks the screen during sequence */
    #pfp-block-overlay {
      position: fixed;
      left: 0; top: 0; right: 0; bottom: 0;
      background: rgba(0,0,0, ${OVERLAY_OPACITY});
      z-index: 20000;
      display: none;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
    }
    #pfp-block-overlay .pfp-block-inner {
      display:flex; flex-direction:column; align-items:center; gap:12px;
      background: rgba(0,0,0,0.0); padding: 12px; border-radius: 8px; color: #fff;
    }
    #pfp-block-status { font-family: Consolas, monospace; font-size:14px; color:#fff; opacity:0.95; text-align:center; max-width:720px; }

    /* small tweaks for modal/panel buttons spacing */
    #panel-header .pfp-controls { display:flex; gap:8px; align-items:center; }
  `;
  document.head.appendChild(sharedStyle);

  /* ------------------ UI: toggle button, panel and header ------------------ */

  // Floating toggle button (icon-only)
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'progress-toggle';
  toggleBtn.className = 'pfp-toggle';
  toggleBtn.title = 'Show Progress';
  toggleBtn.setAttribute('aria-label', 'Show Progress');
  // use bars icon
  toggleBtn.innerHTML = `<span class="pfp-icon"><i class="fa fa-bar-chart" aria-hidden="true"></i></span>`;
  Object.assign(toggleBtn.style, {
    position: 'fixed',
    top: '10px',
    right: '20px',
    zIndex: 10000,
  });
  document.body.appendChild(toggleBtn);

  // panel container
  const panel = document.createElement('div');
  panel.id = 'progress-panel';
  Object.assign(panel.style, {
    display: 'none',
    position: 'fixed',
    top: '15%',
    left: '10%',
    width: '80%',
    height: '75%',
    background: '#1e1e1e',
    color: '#eee',
    zIndex: 15000,
    border: '1px solid #666',
    borderRadius: '6px',
    overflow: 'auto',
    padding: '10px',
    resize: 'both',
    fontFamily: 'Consolas, monospace',
    fontSize: '14px',
  });

  panel.innerHTML = `
    <div id="panel-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;cursor:move;">
      <strong>📦 Live Batch Progress</strong>
      <div class="pfp-controls" style="display:flex;align-items:center;">
        <button id="download-csv" class="pfp-btn" title="Download CSV" aria-label="Download CSV"><i class="fa fa-download pfp-icon"></i></button>
        <button id="refresh-panel" class="pfp-btn" title="Refresh" aria-label="Refresh"><i class="fa fa-refresh pfp-icon"></i></button>
        <button id="close-panel" class="pfp-btn" title="Close" aria-label="Close"><i class="fa fa-times pfp-icon"></i></button>
      </div>
    </div>
    <div id="progress-table" style="position:relative;min-height:120px;"></div>
    <div id="last-update" style="margin-top:6px;font-size:12px;color:#aaa;"></div>
  `;
  document.body.appendChild(panel);

  /* ------------------ blocking overlay (covers full screen during sequence) ------------------ */
  const blockOverlay = document.createElement('div');
  blockOverlay.id = 'pfp-block-overlay';
  blockOverlay.innerHTML = `<div class="pfp-block-inner">
    <div class="pfp-spinner"><div class="spinner-circle" aria-hidden="true"></div></div>
    <div id="pfp-block-status">Running sequence — please wait...</div>
  </div>`;
  // hide by default
  blockOverlay.style.display = 'none';
  document.body.appendChild(blockOverlay);

  // tooltip element (reused)
  const tooltip = document.createElement('div');
  tooltip.id = 'progress-tooltip';
  Object.assign(tooltip.style, {
    position: 'fixed',
    pointerEvents: 'none',
    display: 'none',
    zIndex: 16000,
    background: 'rgba(30,30,30,0.95)',
    color: '#eee',
    padding: '6px 8px',
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    fontFamily: 'Consolas, monospace',
    fontSize: '12px',
    lineHeight: '1.2',
    maxWidth: '320px',
    whiteSpace: 'pre-wrap'
  });
  document.body.appendChild(tooltip);

  /* ------------------ Draggable ------------------ */
  (function makeDraggable() {
    const header = panel.querySelector('#panel-header');
    let offsetX = 0, offsetY = 0, isDown = false;
    header.addEventListener('mousedown', e => {
      isDown = true;
      offsetX = e.clientX - panel.offsetLeft;
      offsetY = e.clientY - panel.offsetTop;
      header.style.cursor = 'grabbing';
    });
    document.addEventListener('mouseup', () => {
      isDown = false;
      header.style.cursor = 'move';
    });
    document.addEventListener('mousemove', e => {
      if (!isDown) return;
      panel.style.left = (e.clientX - offsetX) + 'px';
      panel.style.top = (e.clientY - offsetY) + 'px';
      panel.style.right = 'auto';
    });
  })();

  /* ------------------ Helpers (unchanged) ------------------ */

  function colorByPercent(val) {
    const n = parseFloat(val);
    if (isNaN(n)) return '';
    if (n >= 95) return '#4caf50cc';
    if (n >= 70) return '#ffb300cc';
    return '#f44336cc';
  }

  function escapeCSV(v) {
    v = String(v ?? '').trim();
    if (v.includes('"')) v = v.replace(/"/g, '""');
    if (/[,"\n]/.test(v)) v = `"${v}"`;
    return v;
  }

  function extractNumber(text) {
    if (!text) return 0;
    text = text.replace(/\(.*?\)/g, '');
    const num = parseInt(String(text).replace(/[^\d]/g, ''), 10);
    return isNaN(num) ? 0 : num;
  }

  function extractTotalNumber(text) {
    if (!text) return 0;
    const match = text.match(/[\d,]+/);
    return match ? parseInt(match[0].replace(/,/g, ''), 10) : 0;
  }

  function extractCompletedPacking(text) {
    if (!text) return 0;
    const match = text.match(/\(([\d,]+)\)/);
    return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
  }

  async function waitForStableUpdate(timeout = 10000, stableTime = 1500) {
    const label = document.querySelector('#last-update-label');
    if (!label) return true;
    let lastValue = label.textContent.trim();
    let stableFor = 0;
    const interval = 200;
    return new Promise(resolve => {
      const start = Date.now();
      const timer = setInterval(() => {
        const curr = label.textContent.trim();
        if (curr === lastValue) stableFor += interval;
        else {
          stableFor = 0;
          lastValue = curr;
        }
        if (stableFor >= stableTime || Date.now() - start > timeout) {
          clearInterval(timer);
          resolve(true);
        }
      }, interval);
    });
  }

  /* ------------------ core extraction + rendering (kept intact) ------------------ */

  const DISPLAY_LABELS = {
    'Picking': 'Forward',
    'E3': 'OSR',
    'Sorter1': 'Sorter 1',
    'Sorter2': 'Sorter 2',
    'Sorter3': 'Sorter 3',
    'Sorter4': 'Sorter 4',
    'Sorter5': 'Sorter 5',
    'Sorter6': 'Sorter6'
  };

  const AREAS = [
    'Picking', 'RSPS', 'ISPS', 'E3',
    'Sorter1', 'Sorter2', 'Sorter3', 'Sorter4', 'Sorter5', 'Sorter6',
    'Packing', "Int'l Packing", 'BPP'
  ];

  const SORTER_GROUPS = {
    Sorter1: ['11', '12', '21', '22'],
    Sorter2: ['31', '32', '41', '42', '51', '52'],
    Sorter3: ['61', '62', '71', '72'],
    Sorter4: ['81', '82', '91', '92'],
    Sorter5: ['A1', 'A2', 'B1', 'B2'],
    Sorter6: ['Sorter6']
  };

  const COLUMN_GROUPS = [
    { name: 'Picking', color: '#2b2b2b', areas: ['Picking', 'RSPS', 'ISPS', 'E3'] },
    { name: 'Inducting', color: '#1e1e1e', areas: ['Sorter1', 'Sorter2', 'Sorter3', 'Sorter4', 'Sorter5', 'Sorter6'] },
    { name: 'Packing', color: '#3a3a3a', areas: ['Packing', "Int'l Packing", 'BPP'] }
  ];

  function extractSorterForBatch(batchEl, sorterKey) {
    const subs = SORTER_GROUPS[sorterKey] || [];
    let total = 0, completed = 0;
    subs.forEach(subLabel => {
      const descSub = Array.from(batchEl.querySelectorAll(PAK_SEL.desc))
        .find(el => el.textContent.trim() === subLabel);
      if (!descSub) return;
      const parentSub = descSub.parentElement;
      const subTotal = extractTotalNumber(parentSub.querySelector(PAK_SEL.total)?.innerText);
      const subComplete = extractNumber(pakBarLabel(parentSub, 'progress-complete'));
      total += subTotal;
      completed += subComplete;
    });
    if (!total) return null;
    const outstanding = Math.max(total - completed, 0);
    return { percent: Math.round((completed / total) * 100), outstanding: outstanding.toLocaleString(), total, completed };
  }

  function extractTableData() {
    const batches = document.querySelectorAll(PAK_SEL.batch);
    const rows = [];

    batches.forEach(batch => {
      const dateElem = batch.querySelector('.createdDate');
      let dateCreated = '', releaseTime = '';
      if (dateElem) {
        const parts = dateElem.innerHTML.split('<br>').map(s => s.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
        if (parts.length >= 2) {
          const match = parts[0].replace(/\s+/g, '').match(/^(\d{1,2}):(\d{2})/);
          releaseTime = match ? `${match[1].padStart(2,'0')}:${match[2]}` : parts[0];
          dateCreated = parts[1];
        } else if (parts.length === 1) dateCreated = parts[0];
      }

      const batchNo = batch.querySelector('.batchNo')?.textContent.trim() || '';
      const row = { 'Date Created': dateCreated, 'Release Time': releaseTime, 'Batch No': batchNo };

      AREAS.forEach(area => {
        let result = null;
        if (area.startsWith('Sorter')) {
          result = extractSorterForBatch(batch, area);
          if (!result) {
            const desc = Array.from(batch.querySelectorAll(PAK_SEL.desc)).find(el => el.textContent.trim() === area || el.textContent.trim() === DISPLAY_LABELS[area]);
            if (desc) {
              const parentEl = desc.parentElement;
              let totalNum = 0, completedNum = 0;
              totalNum = extractTotalNumber(parentEl.querySelector(PAK_SEL.total)?.innerText);
              completedNum = extractNumber(pakBarLabel(parentEl, 'progress-complete'));
              const outstandingNum = Math.max(totalNum - completedNum, 0);
              if (totalNum) result = { percent: Math.round((completedNum / totalNum) * 100), outstanding: outstandingNum.toLocaleString(), total: totalNum, completed: completedNum };
            }
          }
        } else {
          const desc = Array.from(batch.querySelectorAll(PAK_SEL.desc)).find(el => el.textContent.trim() === area);
          if (desc) {
            const parentEl = desc.parentElement;
            let totalNum = 0, completedNum = 0;
            if (area === 'Packing') {
              totalNum = extractTotalNumber(parentEl.querySelector(PAK_SEL.total)?.innerText);
              completedNum = extractCompletedPacking(pakBarLabel(parentEl, 'parcels-packed')?.trim());
            } else {
              totalNum = extractNumber(parentEl.querySelector(PAK_SEL.total)?.innerText);
              completedNum = extractNumber(pakBarLabel(parentEl, 'progress-complete'));
            }
            const outstandingNum = Math.max(totalNum - completedNum, 0);
            if (totalNum) result = { percent: Math.round((completedNum / totalNum) * 100), outstanding: outstandingNum.toLocaleString(), total: totalNum, completed: completedNum };
          }
        }
        row[area] = result;
      });

      rows.push(row);
    });

    return rows;
  }

  function attachSorterHeaderTooltips(table) {
    if (!table) return;
    const ths = Array.from(table.querySelectorAll('th'));
    ths.forEach(th => {
      if (th.dataset._pfpTooltipAttached) return;
      const txt = (th.textContent || '').trim();
      Object.keys(SORTER_GROUPS).forEach(sorterKey => {
        const label = DISPLAY_LABELS[sorterKey] || sorterKey;
        if (txt === label) {
          const subs = SORTER_GROUPS[sorterKey] ? SORTER_GROUPS[sorterKey].join(', ') : sorterKey;
          th.dataset.sorterSubs = subs;
          th.dataset.sorterKey = sorterKey;
          th.style.position = 'relative';
          th.addEventListener('mouseenter', onHeaderMouseEnter);
          th.addEventListener('mousemove', onHeaderMouseMove);
          th.addEventListener('mouseleave', onHeaderMouseLeave);
        }
      });
      th.dataset._pfpTooltipAttached = '1';
    });
  }

  function onHeaderMouseEnter(e) {
    const th = e.currentTarget;
    const subs = th.dataset.sorterSubs || '';
    tooltip.innerHTML = `<strong style="display:block;margin-bottom:4px;">${th.textContent.trim()}</strong><span style="opacity:.9">${subs}</span>`;
    tooltip.style.display = 'block';
  }
  function onHeaderMouseMove(e) {
    const pad = 12;
    const tooltipRect = tooltip.getBoundingClientRect();
    let x = e.clientX + 14;
    let y = e.clientY + 14;
    if (x + tooltipRect.width + pad > window.innerWidth) x = e.clientX - tooltipRect.width - 18;
    if (y + tooltipRect.height + pad > window.innerHeight) y = e.clientY - tooltipRect.height - 18;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }
  function onHeaderMouseLeave() {
    tooltip.style.display = 'none';
  }

  /* ------------------ renderTable (unchanged layout) ------------------ */

  function renderTable(rows) {
    const container = document.getElementById('progress-table');
    if (!container) return;
    if (!rows.length) {
      container.innerHTML = '<em>No data found</em>';
      return;
    }

    const groupRowColors = {
      Picking: '#345a9a',
      Inducting: '#b76b2b',
      Packing: '#2e8a5f'
    };
    const headerColors = {
      Picking: '#d6e6ff',
      Inducting: '#ffe6cc',
      Packing: '#defadd'
    };
    const groupRowTextColor = {
      Picking: '#d6e6ff',
      Inducting: '#1a1208',
      Packing: '#defadd'
    };
    const headerTextColor = {
      Picking: '#07204d',
      Inducting: '#663b12',
      Packing: '#0a4626'
    };

    const headers = ['Date Created', 'Release Time', 'Batch No'];
    let html = '<table id="progress-table-table" style="border-collapse:collapse;width:100%;table-layout:auto;">';
    html += '<thead>';

    // Group header row
    html += '<tr>';
    html += `<th colspan="${headers.length}" style="background:#1e1e1e;"></th>`;
    COLUMN_GROUPS.forEach(g => {
      const colSpan = g.areas.length * 2;
      const grp = g.name;
      const bg = groupRowColors[grp] || g.color || '#222';
      const txt = groupRowTextColor[grp] || '#fff';
      html += `<th colspan="${colSpan}" class="pfp-group-row ${grp}" style="background:${bg};color:${txt};text-align:center;font-weight:bold;border-right:1px solid #555;">${g.name}</th>`;
    });
    html += '</tr>';

    // Area header row
    html += '<tr>';
    headers.forEach(h => {
      html += `<th rowspan="2" style="border:1px solid #555;padding:4px;text-align:center;word-wrap:break-word;">${h}</th>`;
    });
    COLUMN_GROUPS.forEach(g => {
      const grp = g.name;
      const areaBg = headerColors[grp] || '#eee';
      const textColor = headerTextColor[grp] || '#000';
      g.areas.forEach(area => {
        const label = DISPLAY_LABELS[area] || area;
        html += `<th colspan="2" class="pfp-group-header ${grp}" style="border:1px solid #555;padding:4px;text-align:center;background:${areaBg};color:${textColor};">${label}</th>`;
      });
    });
    html += '</tr>';

    // C / O row
    html += '<tr>';
    COLUMN_GROUPS.forEach(g => {
      const grp = g.name;
      const areaBg = headerColors[grp] || '#eee';
      const textColor = headerTextColor[grp] || '#000';
      g.areas.forEach(() => {
        html += `<th style="border:1px solid #555;text-align:center;background:${areaBg};color:${textColor};">C</th>`;
        html += `<th style="border:1px solid #555;text-align:center;background:${areaBg};color:${textColor};">O</th>`;
      });
    });
    html += '</tr></thead>';

    // Body
    html += '<tbody>';
    rows.forEach(r => {
      html += '<tr style="border-bottom:1px solid #333;">';
      headers.forEach(h => {
        let style = 'padding:3px 6px;text-align:center;border:1px solid #555;';
        let content = r[h] || '';
        if (h === 'Batch No') {
          const batchNum = parseInt(r[h], 10);
          if (!isNaN(batchNum)) {
            let bgColor = '';
            const allBatchNums = rows.map(row => parseInt(row['Batch No'], 10)).filter(n => n >= 1 && n <= 39);
            const maxBatch = Math.max(...allBatchNums);
            if (batchNum >= 1 && batchNum <= 39) bgColor = '#ffd8a6';
            if (batchNum === maxBatch) bgColor = '#ffff99';
            if (bgColor) style += `background:${bgColor};color:black;`;
          }
        }
        html += `<td style="${style}">${content}</td>`;
      });

      COLUMN_GROUPS.forEach(g => {
        g.areas.forEach(area => {
          const val = r[area];
          if (val) {
            const color = colorByPercent(val.percent);
            html += `<td style="padding:3px 6px;text-align:center;background:${color};border:1px solid #555;">${val.percent}%</td>`;
            html += `<td style="padding:3px 6px;text-align:center;border:1px solid #555;">${val.outstanding}</td>`;
          } else {
            html += `<td colspan="2" style="border:1px solid #555;"></td>`;
          }
        });
      });

      html += '</tr>';
    });
    html += '</tbody></table>';

    container.innerHTML = html;
    document.getElementById('last-update').textContent = 'Last update: ' + new Date().toLocaleTimeString();

    const table = document.getElementById('progress-table-table');
    attachSorterHeaderTooltips(table);
    try { makeColumnsResizable(table); } catch (err) { console.error('makeColumnsResizable error', err); }
  }

  /* ------------------ CSV Export ------------------ */
  function exportCSV(rows) {
    if (!rows.length) return;
    const headers = ['Date Created', 'Release Time', 'Batch No', ...AREAS.flatMap(a => [`${DISPLAY_LABELS[a] || a} %`, `${DISPLAY_LABELS[a] || a} Outstanding`])];
    const csvRows = [headers.join(',')];
    rows.forEach(r => {
      const rowArr = ['Date Created', 'Release Time', 'Batch No'].map(h => r[h]);
      AREAS.forEach(area => {
        const val = r[area];
        if (val) {
          rowArr.push(val.percent + '%');
          rowArr.push(val.outstanding);
        } else {
          rowArr.push('');
          rowArr.push('');
        }
      });
      csvRows.push(rowArr.map(escapeCSV).join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
    a.download = `Progress_${now}.csv`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ------------------ Click sequence logic (DBY->Y->T mapping is Inducting→Picking→Way→Drive) ------------------ */

  const SEQUENCE_STEPS = [
    { label: "Inducting" },
    { label: "Picking" },
    { label: "Way" },
    { label: "Drive" }
  ];

  const STEP_STABLE_MS = 2000;
  const STEP_TIMEOUT_MS = 10000;

  // wrappers to show/hide the blocking overlay
  function showBlockingOverlay(statusText = 'Running sequence — please wait...') {
    const st = document.getElementById('pfp-block-status');
    if (st) st.textContent = statusText;
    blockOverlay.style.display = 'flex';
  }
  function hideBlockingOverlay() {
    blockOverlay.style.display = 'none';
  }

  async function clickWithWait(label) {
    console.log(`🔵 [SEQ] Clicking all "${label}"...`);
    // Block screen while running this step (overlay shown at sequence start)
    const elements = Array.from(document.querySelectorAll(PAK_SEL.clickDesc))
      .filter(el => el.textContent.trim() === label);

    elements.forEach(el => {
      try { pakDrillClick(el); } catch (e) { console.error(`Error clicking ${label}`, e); }
    });

    console.log(`⏳ [SEQ] Waiting for stable update (${STEP_STABLE_MS}ms required)...`);
    await waitForStableUpdate(STEP_TIMEOUT_MS, STEP_STABLE_MS);
    console.log(`✅ [SEQ] Stable after clicking "${label}"`);
  }

  // Run the sequence but show the blocking overlay while running
  async function runClickSequence() {
    try {
      console.log("🚀 Running click sequence (Inducting → Picking → Way → Drive)");
      showBlockingOverlay('Running initial sequence — please wait...');
      for (const step of SEQUENCE_STEPS) {
        // update overlay status
        const st = document.getElementById('pfp-block-status');
        if (st) st.textContent = `Running: ${step.label} ...`;
        await clickWithWait(step.label);
      }

      // Enable AutoRefresh every time (keeps original behaviour)
      const autoEl = document.querySelector('input#AutoRefresh[type="checkbox"]');
      if (autoEl && !autoEl.checked) {
        autoEl.checked = true;
        autoEl.dispatchEvent(new Event('change', { bubbles: true }));
        autoEl.dispatchEvent(new Event('input', { bubbles: true }));
        console.log("🔧 AutoRefresh enabled automatically.");
      }

      console.log("🏁 Click sequence complete.");
    } catch (e) {
      console.error('runClickSequence error', e);
    } finally {
      hideBlockingOverlay();
    }
  }

  /* ------------------ refreshData + new-batch detection (keeps original semantics) ------------------ */

  let dataCache = [];
  const knownBatches = new Set();
  let firstLoadDone = false;

  function normalizeBatchNo(text) {
    return String(text ?? '').replace(/\s+/g, ' ').trim();
  }

  // spinner show/hide helpers (panel-level)
  function showSpinner(message = 'Loading data...') {
    const container = document.getElementById('progress-table');
    if (!container) return;
    container.innerHTML = `
      <div class="pfp-spinner" aria-live="polite">
        <div class="spinner-circle" role="img" aria-hidden="true"></div>
        <div class="pfp-loading-text">${message}</div>
      </div>
    `;
    const refreshBtn = panel.querySelector('#refresh-panel');
    if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.innerHTML = `<i class="fa fa-hourglass-half pfp-icon"></i>`; }
  }

  function hideSpinner() {
    const refreshBtn = panel.querySelector('#refresh-panel');
    if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.innerHTML = `<i class="fa fa-refresh pfp-icon"></i>`; }
  }

  async function refreshData() {
    showSpinner('Loading data...');
    try {
      await waitForStableUpdate();

      const batchEls = document.querySelectorAll(PAK_SEL.batch + ' .batchNo');
      const currentBatchNos = Array.from(batchEls)
        .map(el => normalizeBatchNo(el.textContent))
        .filter(Boolean);

      if (!firstLoadDone) {
        dataCache = extractTableData();
        renderTable(dataCache);
        currentBatchNos.forEach(no => knownBatches.add(no));
        firstLoadDone = true;
        hideSpinner();
        return;
      }

      const newBatches = currentBatchNos.filter(no => !knownBatches.has(no));
      if (newBatches.length > 0) {
        console.log('🆕 New batches detected:', newBatches);

        for (const batchNo of newBatches) {
          const batchEl = Array.from(document.querySelectorAll(PAK_SEL.batch))
            .find(el => normalizeBatchNo(el.querySelector('.batchNo')?.textContent) === batchNo);
          if (!batchEl) continue;

          const hasPicking = Array.from(batchEl.querySelectorAll(PAK_SEL.desc)).some(e => e.textContent.trim() === 'Picking');
          const hasInducting = Array.from(batchEl.querySelectorAll(PAK_SEL.desc)).some(e => e.textContent.trim() === 'Inducting');

          if (!(hasPicking && hasInducting)) {
            console.warn(`⚠️ Batch ${batchNo}: Picking or Inducting missing — not counted as known yet.`);
            continue;
          }

          console.log(`🆕 New batch ready: ${batchNo} — clicking Picking+Inducting then Way+Drive...`);

          // show blocking overlay while we click this batch's elements
          showBlockingOverlay(`Processing batch ${batchNo} ...`);

          // Click Picking + Inducting
          ['Picking', 'Inducting'].forEach(label => {
            const el = Array.from(batchEl.querySelectorAll(PAK_SEL.desc)).find(e => e.textContent.trim() === label);
            if (el) { try { pakDrillClick(el); } catch (e) { console.error('click error', e); } }
          });

          await new Promise(res => setTimeout(res, 600));

          // Click Way + Drive
          ['Way', 'Drive'].forEach(label => {
            const el = Array.from(batchEl.querySelectorAll(PAK_SEL.desc)).find(e => e.textContent.trim() === label);
            if (el) { try { pakDrillClick(el); } catch (e) { console.error('click error', e); } }
          });

          knownBatches.add(batchNo);
          console.log(`✅ Batch ${batchNo} marked as known.`);
          // small settle
          await waitForStableUpdate(8000, 1000);
          hideBlockingOverlay();
        }

        dataCache = extractTableData();
        renderTable(dataCache);
        hideSpinner();
      } else {
        dataCache = extractTableData();
        renderTable(dataCache);
        hideSpinner();
      }
    } catch (e) {
      console.error('refreshData error', e);
      hideSpinner();
      hideBlockingOverlay();
    }
  }

  /* ------------------ controlled auto-refresh (starts after panel opened) ------------------ */

  const REFRESH_INTERVAL = 60 * 1000;
  let autoRefreshStarted = false;
  let autoRefreshTimer = null;

  function startAutoRefreshIfNeeded() {
    if (autoRefreshStarted) return;
    autoRefreshStarted = true;
    autoRefreshTimer = setInterval(() => {
      refreshData().catch(e => console.error('Auto refresh failed', e));
    }, REFRESH_INTERVAL);
    console.log('Progress Float Panel: auto-refresh started.');
  }

  /* ------------------ UI bindings ------------------ */

  // Toggle panel open / close
  toggleBtn.addEventListener('click', async () => {
    const visible = panel.style.display === 'block';
    if (visible) {
      panel.style.display = 'none';
      toggleBtn.title = 'Show Progress';
      // Reload to mimic your previous hide action
      console.log('🔄 Hide Progress pressed — refreshing page');
      location.reload();
      return;
    }

    panel.style.display = 'block';
    toggleBtn.title = 'Hide Progress';

    showSpinner('Loading data...');
    try {
      // run initial sequence (shows blocking overlay as needed)
      await runClickSequence();   // ALWAYS run clicks on Show
      await refreshData();

      // start auto refresh now that user has opened panel
      startAutoRefreshIfNeeded();
    } catch (e) {
      console.error('Initial open refresh failed', e);
      hideSpinner();
      hideBlockingOverlay();
    }
  });

  panel.querySelector('#close-panel').addEventListener('click', () => {
    panel.style.display = 'none';
    toggleBtn.title = 'Show Progress';
  });

  // panel refresh button uses unified icon; we update innerHTML during spinner enable/disable
  panel.querySelector('#refresh-panel').addEventListener('click', async () => {
    const btn = panel.querySelector('#refresh-panel');
    btn.disabled = true;
    btn.innerHTML = `<i class="fa fa-hourglass-half pfp-icon"></i>`;
    try {
      showSpinner('Loading data...');
      await refreshData();
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa fa-refresh pfp-icon"></i>`;
      hideSpinner();
    }
  });

  panel.querySelector('#download-csv').addEventListener('click', () => exportCSV(dataCache));

  /* ------------------ Start-up safe message ------------------ */
  console.log('Progress Float Panel v7.2 (unified buttons + blocking overlay) loaded — waiting for user to open panel.');

  /* ------------------ Column resizing (unchanged) ------------------ */

  function makeColumnsResizable(table) {
    if (!table) return;
    const theadRows = Array.from(table.querySelectorAll('thead tr'));
    if (theadRows.length < 2) return;
    const headerRow = theadRows[1];
    const ths = Array.from(headerRow.querySelectorAll('th')).slice(0, 3);

    ths.forEach((th, idx) => {
      th.classList.add('pfp-resizable-th');
      if (th.querySelector('.pfp-resize-handle')) return;
      const handle = document.createElement('div');
      handle.className = 'pfp-resize-handle';
      Object.assign(handle.style, { position:'absolute', right:'0', top:'0', width:'8px', cursor:'col-resize', userSelect:'none', height:'100%', zIndex:20 });
      th.style.position = 'relative';
      th.appendChild(handle);

      handle.addEventListener('dblclick', e => {
        e.preventDefault(); e.stopPropagation();
        const colIndex = idx + 1;
        const cells = Array.from(table.querySelectorAll(`tbody tr td:nth-child(${colIndex}), thead tr th:nth-child(${colIndex})`));
        const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
        const style = window.getComputedStyle(th);
        ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        let maxWidth = 0;
        cells.forEach(cell => {
          const txt = (cell.innerText || '').trim();
          const w = Math.ceil(ctx.measureText(txt).width) + 28;
          if (w > maxWidth) maxWidth = w;
        });
        const finalWidth = Math.max(60, maxWidth);
        const rowsCells = table.querySelectorAll(`tr > *:nth-child(${colIndex})`);
        rowsCells.forEach(c => c.style.width = finalWidth + 'px');
        console.log(`📏 [pfp] Auto-fit "${th.textContent.trim()}" → ${finalWidth}px`);
      });

      handle.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        const startX = e.pageX;
        const startWidth = th.offsetWidth;
        const colIndex = idx + 1;
        const onMove = ev => {
          const diff = ev.pageX - startX;
          const newWidth = Math.max(60, startWidth + diff);
          const rowsCells = table.querySelectorAll(`tr > *:nth-child(${colIndex})`);
          rowsCells.forEach(c => c.style.width = newWidth + 'px');
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  }

})();