// ==UserScript==
// @name         [PAK] StationSetUp Copy Button
// @namespace    http://tampermonkey.net/
// @version      2.3
// @author       Pak
// @description  Copy first 5 or 8 columns as TSV (excluding header)
// @match        https://ibm-red/next/prd/app/pxesde/archive/PackingStationSetUp/*
// @match        https://ibm-red/next/prd/app/pxesde/archive/StoreStationSetUp/*
// @grant        GM_addStyle
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20StationSetUp%20Copy%20Button.user.js
// @downloadURL  https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20StationSetUp%20Copy%20Button.user.js
// ==/UserScript==

(function () {
  'use strict';

  const ICON_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css';

  if (!document.querySelector('link[href*="font-awesome"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = ICON_CSS;
    document.head.appendChild(link);
  }

  GM_addStyle(`
    .pss-copy-btn {
      margin-left: 6px;
      padding: 3px 8px;
      border: 1px solid #9aa7b2;
      border-radius: 6px;
      background: #f7f7f7;
      cursor: pointer;
      transition: all .2s ease;
      font-size: 12px;
    }
    .pss-copy-btn:hover {
      background: #0b5fff;
      color: #fff;
      border-color: #0b5fff;
    }
    .pss-copy-btn.copied { background:#16a34a;color:#fff; }
    .pss-copy-btn.failed { background:#dc2626;color:#fff; }
  `);

  function isCsv(a) {
    return /\.csv(\?|$)/i.test(a.getAttribute('href') || '');
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', i = 0, inQuotes = false;

    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    while (i < text.length) {
      const ch = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          field += '"'; i += 2; continue;
        }
        if (ch === '"') {
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      }

      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { row.push(field); field=''; i++; continue; }

      if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && next === '\n') i++;
        row.push(field);
        rows.push(row);
        row=[]; field='';
        i++; continue;
      }

      field += ch;
      i++;
    }

    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function toTSV_NoHeader(text, colCount) {
    const rows = parseCSV(text);

    // Skip header
    const dataRows = rows.slice(1);

    return dataRows
      .map(r =>
        r.slice(0, colCount)
         .map(v => (v ?? '').replace(/\t/g, ' '))
         .join('\t')
      )
      .join('\n');
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  async function handle(btn, url, colCount) {
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
      const res = await fetch(url, { credentials: 'include' });
      const text = await res.text();

      const tsv = toTSV_NoHeader(text, colCount);
      await copy(tsv);

      btn.classList.add('copied');
      btn.innerHTML = '<i class="fa fa-check"></i>';
    } catch (e) {
      console.error(e);
      btn.classList.add('failed');
      btn.innerHTML = '<i class="fa fa-times"></i>';
    }

    setTimeout(() => {
      btn.disabled = false;
      btn.classList.remove('copied','failed');
      btn.innerHTML = `<i class="fa fa-copy"></i> [${colCount}]`;
    }, 1200);
  }

  function createButton(url, colCount) {
    const btn = document.createElement('button');
    btn.className = 'pss-copy-btn';
    btn.innerHTML = `<i class="fa fa-copy"></i> [${colCount}]`;

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      handle(btn, url, colCount);
    };

    return btn;
  }

  function init() {
    const pre = document.querySelector('pre');
    if (!pre) return;

    pre.querySelectorAll('a[href]').forEach(a => {
      if (!isCsv(a) || a.dataset.done) return;

      const url = new URL(a.getAttribute('href'), location.href).href;

      const btn5 = createButton(url, 5);
      const btn8 = createButton(url, 8);

      a.after(btn5, btn8);
      a.dataset.done = '1';
    });
  }

  init();

  new MutationObserver(init).observe(document.body, {
    childList: true,
    subtree: true
  });

})();