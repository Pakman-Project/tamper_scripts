// ==UserScript==
// @name         [MCK] Chrome Fix (TPA)
// @namespace    Mateusz Mucek
// @version      1.4
// @description  TPA Locating: keep original teal look in Chrome by rendering <PARAM R*> into classic table; Run Report loads into RepData; click quantities to copy (no commas), no internal scrollbar (show full list)
// @match        http://ws-whs/putaway/forward/locating/locatingframe.asp*
// @match        http://ws-whs/putaway/forward/locating/LocatingHeader.asp*
// @match        http://ws-whs/putaway/forward/locating/LocatingData.asp*
// @match        http://ws-whs/putaway/forward/locating/LocatingBonusDetail.asp*
// @match        http://ws-whs/putaway/forward/locating/LocatingBonusLocns.asp*
// @run-at       document-end
// @grant        none
// @updateURL    https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BMCK%5D%20Chrome%20Fix%20(TPA).user.js
// @downloadURL  https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BMCK%5D%20Chrome%20Fix%20(TPA).user.js
// ==/UserScript==

(function () {
  'use strict';

  const TAG = '[MCK][TPA]';
  const log = (...a) => console.log(TAG, ...a);

  // -------------------------
  // Helpers
  // -------------------------
  const pad2 = (n) => String(n).padStart(2, '0');

  function parseQty(text) {
    if (text == null) return 0;
    let s = String(text).trim();
    if (!s) return 0;

    const isParenNeg = /^\(.*\)$/.test(s);
    s = s.replace(/[(),]/g, ''); // remove commas + parentheses
    s = s.replace(/\s+/g, '');
    let n = parseInt(s, 10);
    if (!Number.isFinite(n)) n = 0;
    if (isParenNeg && n > 0) n = -n;
    return n;
  }

  function toPlainIntString(n) {
    if (!Number.isFinite(n)) return '0';
    return String(Math.trunc(n));
  }

  function toast(msg = 'Copied!') {
    let el = document.getElementById('__mck_tpa_toast');
    if (!el) {
      el = document.createElement('div');
      el.id = '__mck_tpa_toast';
      el.style.position = 'fixed';
      el.style.left = '50%';
      el.style.bottom = '18px';
      el.style.transform = 'translateX(-50%)';
      el.style.background = 'rgba(0,0,0,0.82)';
      el.style.color = '#fff';
      el.style.padding = '8px 12px';
      el.style.borderRadius = '8px';
      el.style.fontFamily = 'Verdana, Arial, sans-serif';
      el.style.fontSize = '12px';
      el.style.fontWeight = '700';
      el.style.zIndex = '999999';
      el.style.opacity = '0';
      el.style.transition = 'opacity .15s ease';
      document.documentElement.appendChild(el);
    }

    el.textContent = msg;
    el.style.opacity = '1';

    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.style.opacity = '0';
    }, 900);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied!');
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('Copied!');
      return true;
    }
  }

  // -------------------------
  // PART 1 — Run Report fix (LocatingHeader.asp / locatingframe.asp)
  // -------------------------
  function installRunReportFix() {
    const isHeader = /\/LocatingHeader\.asp/i.test(location.pathname);
    const isFrame = /\/locatingframe\.asp/i.test(location.pathname);
    if (!isHeader && !isFrame) return;

    const btn = document.querySelector('input[name="btnRun"][type="button"], input[value="Run Report"]');
    if (!btn) return;

    log('Run Report button found – installing handler');

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const cbo = document.querySelector('select[name="cboWarehouse"]');
      const startDate = document.querySelector('input[name="StartDate"]');
      const endDate = document.querySelector('input[name="EndDate"]');
      const startTime = document.querySelector('input[name="StartTime"]');
      const endTime = document.querySelector('input[name="EndTime"]');

      if (!cbo || !startDate || !endDate || !startTime || !endTime) {
        log('Missing inputs – trying original refreshPage() if present');
        if (typeof window.refreshPage === 'function') window.refreshPage();
        return;
      }

      const idx = cbo.selectedIndex;
      const opt = cbo.options[idx];
      if (!opt || opt.value === 'N' || /<\s*SELECT\s*>/i.test(opt.text)) {
        alert('You must select a warehouse before running the report !');
        return;
      }

      const params = new URLSearchParams();
      params.set('StartDate', startDate.value || '');
      params.set('EndDate', endDate.value || '');
      params.set('StartTime', startTime.value || '');
      params.set('EndTime', endTime.value || '');
      params.set('Warehouse', opt.text || '');

      const url = `LocatingData.asp?${params.toString()}`;

      const parentWin = window.parent;
      const repData = parentWin?.frames?.RepData || parentWin?.frames?.['RepData'];
      if (repData && repData.location) {
        repData.location.replace(url);
      } else {
        window.location.href = url;
      }
    }, true);
  }

  // -------------------------
  // PART 2 — Render DataGrid (<PARAM R*>) with ORIGINAL look, NO internal scroll
  // -------------------------
  function renderOriginalLookingTable() {
    const obj = document.querySelector('object#DataGrid, object[name="DataGrid"], object[id="DataGrid"], object[classid*="49E77DA7"]');
    if (!obj) return;

    const params = Array.from(obj.querySelectorAll('param'))
      .map(p => ({
        name: (p.getAttribute('name') || '').trim(),
        value: (p.getAttribute('value') || '').trim(),
      }))
      .filter(p => p.name);

    const headerParam = params.find(p => p.name.toUpperCase() === 'HEADER');
    const headerStr = headerParam?.value || '';
    const headerCols = headerStr
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => {
        const parts = s.split(':').map(x => x.trim());
        return { title: parts[0] || 'Column', align: (parts[2] || '').toUpperCase() };
      });

    const rowParams = params
      .filter(p => /^R\d+$/i.test(p.name) && p.value)
      .sort((a, b) => (parseInt(a.name.slice(1), 10) || 0) - (parseInt(b.name.slice(1), 10) || 0));

    if (!headerCols.length || !rowParams.length) return;

    const rows = rowParams.map(p => p.value.split(',').map(x => (x ?? '').trim()));

    const idxQty = headerCols.findIndex(c => /quantity|qty/i.test(c.title));
    let total = 0;

    // Keep original teal background
    document.body.style.background = 'teal';

    // Wrapper exactly where object was
    const wrapper = document.createElement('div');
    wrapper.style.marginTop = '10px';

    const box = document.createElement('div');
    box.style.width = 'fit-content';
    box.style.maxWidth = '95vw';
    box.style.border = '2px solid #0b2f4a';
    box.style.background = 'rgb(250,235,215)'; // antique white-ish
    box.style.padding = '0';

    // IMPORTANT: no internal scrolling / no cut
    box.style.overflow = 'visible';
    box.style.height = 'auto';

    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    table.style.minWidth = '640px';
    table.style.fontFamily = 'Verdana, Arial, sans-serif';
    table.style.fontSize = '12px';
    table.style.color = '#000'; // force readable text

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');

    headerCols.forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h.title;
      th.style.background = '#000';
      th.style.color = '#fff';
      th.style.border = '1px solid #1b3f5c';
      th.style.padding = '4px 6px';
      th.style.whiteSpace = 'nowrap';
      trh.appendChild(th);
    });

    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    rows.forEach((arr) => {
      const tr = document.createElement('tr');
      tr.style.background = 'lightyellow';

      headerCols.forEach((h, i) => {
        const val = (arr[i] ?? '').trim();
        const td = document.createElement('td');
        td.textContent = val;
        td.style.border = '1px solid #1b3f5c';
        td.style.padding = '3px 6px';
        td.style.whiteSpace = 'nowrap';
        td.style.color = '#000'; // force black inside cells

        if (h.align === 'R') td.style.textAlign = 'right';
        else if (h.align === 'C') td.style.textAlign = 'center';
        else td.style.textAlign = 'left';

        // Click-to-copy quantity column (no commas)
        if (i === idxQty) {
          const n = parseQty(val);
          total += n;
          td.style.cursor = 'pointer';
          td.title = 'Click to copy';
          td.addEventListener('click', () => copyText(toPlainIntString(n)));
        }

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    // Total row (black like header)
    if (idxQty >= 0) {
      const trT = document.createElement('tr');
      trT.style.background = '#000';
      trT.style.color = '#fff';
      trT.style.fontWeight = '700';

      headerCols.forEach((h, i) => {
        const td = document.createElement('td');
        td.style.border = '1px solid #1b3f5c';
        td.style.padding = '4px 6px';
        td.style.whiteSpace = 'nowrap';
        td.style.color = '#fff';

        if (i === 0) td.textContent = 'Total';
        else if (i === idxQty) {
          td.textContent = toPlainIntString(total);
          td.style.textAlign = 'right';
          td.style.cursor = 'pointer';
          td.title = 'Click to copy';
          td.addEventListener('click', () => copyText(toPlainIntString(total)));
        } else {
          td.textContent = '';
        }
        trT.appendChild(td);
      });

      tbody.appendChild(trT);
    }

    table.appendChild(tbody);
    box.appendChild(table);
    wrapper.appendChild(box);

    obj.replaceWith(wrapper);

    log('Rendered original-looking table from PARAM R* (no internal scroll)');
  }

  // RUN
  installRunReportFix();
  renderOriginalLookingTable();
  setTimeout(renderOriginalLookingTable, 250);
  setTimeout(renderOriginalLookingTable, 700);

})();

