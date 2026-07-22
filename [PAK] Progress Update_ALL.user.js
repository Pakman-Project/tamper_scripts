// ==UserScript==
// @name         [PAK] Progress Update_ALL
// @namespace    http://tampermonkey.net/
// @version      1.16
// @description  Auto click batch stages, Drive groups, Sorters, numeric rows 1-999, export batch details CSV, overlay with copy/download/close/refresh. Dark themed overlay, improved clipboard handling. Refresh updates overlay table + TSV (clipboard) + CSV (download) in sync. All buttons unified (Font Awesome icons, fixed size, consistent hover/focus).
// @author       Pak
// @match        http://whds-batchoverviewprogress:8087/Batch/ProgressOverview
// @match        http://pon-wdws21:8087/Modern/Batch/ProgressOverview
// @grant        GM_setClipboard
// ==/UserScript==

(function() {
    'use strict';

    // --------------------------
    // Config: unified button sizes + visuals
    // --------------------------
    const BTN_SIZE = '36px';        // modal/topbar icon buttons (square)
    const MAIN_BTN_SIZE = '40px';   // floating main button (square with icon + small label optional)
    const BTN_RADIUS = '7px';
    const BTN_BORDER = '1px solid rgba(102,102,102,1)';
    const BTN_BG = '#0a0a0a';
    const BTN_BG_ALT = '#111';
    const BTN_ICON_FONTSIZE = '14px';
    const HOVER_SHADOW = '0 8px 20px rgba(0,0,0,0.45)';
    const FA_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css';

    // --------------------------
    // Main icon constant (avoid typos)
    // --------------------------
    const MAIN_ICON = '<span class="pu-icon"><i class="fa fa-tasks fa-fw" aria-hidden="true"></i></span>';

    // --------------------------
    // Ensure Font Awesome is loaded
    // --------------------------
    if (!document.querySelector(`link[href*="${FA_CDN.split('/').slice(0,5).join('/')}"]`) && !document.querySelector('link[href*="font-awesome"], link[href*="fontawesome"]')) {
        const fa = document.createElement('link');
        fa.rel = 'stylesheet';
        fa.href = FA_CDN;
        document.head.appendChild(fa);
    }

    // --------------------------
    // Inject shared spinner / icon CSS (pointer-events for icons)
    // --------------------------
    if (!document.getElementById('pu-unified-button-styles')) {
        const st = document.createElement('style');
        st.id = 'pu-unified-button-styles';
        st.textContent = `
        @keyframes pu-refresh-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        .pu-refresh-spin { animation: pu-refresh-spin 800ms linear infinite; display:inline-block; }
        .pu-icon { pointer-events: none; display:inline-block; line-height: 1; }
        `;
        document.head.appendChild(st);
    }

    // --------------------------
    // Helper: lighten hex
    // --------------------------
    function lightenHex(hex, amount){
        if(!hex) return hex;
        if(hex.startsWith('rgb')) return hex;
        hex = hex.replace('#','');
        if(hex.length===3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        const num = parseInt(hex,16);
        let r = (num >> 16) + amount;
        let g = ((num >> 8) & 0x00FF) + amount;
        let b = (num & 0x0000FF) + amount;
        r = Math.min(255, Math.max(0, r));
        g = Math.min(255, Math.max(0, g));
        b = Math.min(255, Math.max(0, b));
        return `rgb(${r}, ${g}, ${b})`;
    }

    // --------------------------
    // Helper: style icon-only buttons (square)
    // --------------------------
    function styleIconButton(btn, { size = BTN_SIZE, radius = BTN_RADIUS, bg = BTN_BG, border = BTN_BORDER, fontSize = BTN_ICON_FONTSIZE, alt = false } = {}) {
        Object.assign(btn.style, {
            width: size,
            height: size,
            padding: '0',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: fontSize,
            borderRadius: radius,
            border: border,
            background: bg,
            color: '#fff',
            cursor: 'pointer',
            boxSizing: 'border-box',
            transition: 'transform 120ms ease, box-shadow 140ms ease, background-color 140ms ease, opacity 120ms',
            outline: 'none',
            lineHeight: '1'
        });

        // Make any <i> or .pu-icon inside non-clickable (click hits button)
        btn.querySelectorAll('i, svg, span.pu-icon').forEach(ic => ic.style.pointerEvents = 'none');

        // hover & focus
        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'translateY(-2px)';
            btn.style.boxShadow = HOVER_SHADOW;
            if (alt) btn.style.backgroundColor = lightenHex(bg, 10);
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = 'none';
            if (alt) btn.style.backgroundColor = bg;
        });
        btn.addEventListener('focus', () => {
            btn.style.boxShadow = '0 0 0 4px rgba(255,255,255,0.06)';
        });
        btn.addEventListener('blur', () => {
            btn.style.boxShadow = 'none';
        });
    }

    // --------------------------
    // Main floating button (icon + optional label)
    // --------------------------
    const mainBtn = document.createElement('button');
    mainBtn.id = 'progress-update-main';
    mainBtn.title = 'Progress Update';
    mainBtn.setAttribute('aria-label', 'Progress Update');
    // Use MAIN_ICON constant to avoid typos
    mainBtn.innerHTML = MAIN_ICON;
    Object.assign(mainBtn.style, {
        position: 'fixed',
        top: '10px',
        right: '70px', // keep original position approx
        zIndex: '10000',
        padding: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontFamily: '"Roboto Mono", monospace',
        fontWeight: '700'
    });
    document.body.appendChild(mainBtn);

    // Use unified styling for main button (slightly larger)
    styleIconButton(mainBtn, { size: MAIN_BTN_SIZE, radius: BTN_RADIUS, bg: '#000000de', border: BTN_BORDER, fontSize: '18px' });

    // --------------------------
    // Reuse large portions of your original logic unchanged
    // (only UI bits replaced with unified buttons/icons)
    // --------------------------

    // --- Inject dark theme CSS for overlay, toast and table (kept similar to original) ---
    const style = document.createElement('style');
    style.textContent = `
    #progress-export-overlay {
        font-family: Roboto, "Roboto Mono", monospace;
        color: #e6e6e6;
        background: #0b0b0b;
        border: 1px solid #222;
        box-shadow: 0 8px 30px rgba(0,0,0,0.6);
    }
    #progress-export-overlay table th {
        background: #111;
        color: #ddd;
        border-bottom: 1px solid #222;
    }
    #progress-export-overlay table td {
        color: #ddd;
        border-bottom: 1px solid #1b1b1b;
    }
    .pe-topbar {
        display:flex;
        justify-content:flex-end;
        gap:8px;
        margin-bottom:8px;
    }
    .pe-btn {
        background: transparent;
        color: #e6e6e6;
        border: 1px solid #2b2b2b;
        padding:6px;
        font-size:16px;
        border-radius:6px;
        cursor:pointer;
        min-width:40px;
        transition: background 120ms, transform 80ms, border-color 120ms;
    }
    .pe-btn:hover {
        background: #151515;
        transform: translateY(-1px);
        border-color: #3a3a3a;
    }
    #progress-export-overlay .table-wrap {
        max-height:56vh;
        overflow:auto;
        border-top:1px solid #171717;
        padding-top:8px;
    }
    #progress-export-overlay table {
        width:100%;
        border-collapse:collapse;
        table-layout:fixed;
        font-size:12px;
    }
    #progress-export-overlay th, #progress-export-overlay td {
        padding:6px;
        white-space:nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
    }
    #progress-export-overlay thead th {
        position: sticky;
        top:0;
        z-index:2;
    }

    /* Toast */
    .pe-toast {
        position: fixed;
        right: 30px;
        top: 30px;
        z-index: 11000;
        background: rgba(20,20,20,0.95);
        color: #dff0d8;
        border: 1px solid rgba(80,160,80,0.18);
        padding: 8px 12px;
        font-family: Roboto, "Roboto Mono", monospace;
        border-radius: 6px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.6);
        opacity: 0;
        transform: translateY(-6px);
        transition: opacity 220ms, transform 220ms;
    }
    .pe-toast.show {
        opacity: 1;
        transform: translateY(0);
    }
    `;
    document.head.appendChild(style);

    // --- Overlay container (created when needed) ---
    let overlay = null;

    // --- State: processed batch numbers ---
    let processedBatchNos = new Set();

    // --- Utility: Delay ---
    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // --- Utility: Escape CSV / TSV ---
    function escapeCSV(val) {
        val = String(val || '').replace(/\r?\n|\r/g, ' ').trim();
        if (val.includes('"')) val = val.replace(/"/g, '""');
        if (val.includes(',') || val.includes('"') || val.includes('\n')) val = `"${val}"`;
        return val;
    }
    function escapeTSV(val) {
        val = String(val || '').replace(/\t/g, ' ').replace(/\r?\n|\r/g, ' ').trim();
        return val;
    }

    // --- Click helpers (kept same) ---
    function clickStages(root = document) {
        const stages = ['Picking', 'Inducting', 'Packing', 'BPP', "Int'l Packing"];
        const elements = root.querySelectorAll('div.batch-row-item.description-column');
        let count = 0;
        elements.forEach(el => {
            const text = el.textContent.trim();
            const cursor = el.style.cursor || getComputedStyle(el).cursor;
            if (stages.includes(text) && cursor === 'pointer') {
                try { el.click(); count++; } catch(e) {}
            }
        });
        console.log(`Clicked ${count} stage items`);
    }
    function clickDriveGroup(root = document, { bottomFirst = false } = {}) {
        const targets = ['Drive', 'Elmsall3', 'Way'];
        const elements = Array.from(root.querySelectorAll('div.batch-row-item.description-column'));
        let count = 0;
        if (bottomFirst) {
            for (let i = elements.length - 1; i >= 0; i--) {
                const el = elements[i];
                const text = el.textContent.trim();
                const cursor = el.style.cursor || getComputedStyle(el).cursor;
                if (targets.includes(text) && cursor === 'pointer') {
                    try { el.click(); count++; } catch(e) {}
                }
            }
        } else {
            elements.forEach(el => {
                const text = el.textContent.trim();
                const cursor = el.style.cursor || getComputedStyle(el).cursor;
                if (targets.includes(text) && cursor === 'pointer') {
                    try { el.click(); count++; } catch(e) {}
                }
            });
        }
        console.log(`Clicked ${count} Drive/Way/Elmsall3 items${bottomFirst ? ' (bottom-first)' : ''}`);
    }
    function clickSorters(root = document) {
        const sorters = ['Sorter 1','Sorter 2','Sorter 3','Sorter 4','Sorter 5','Sorter 6'];
        const elements = root.querySelectorAll('div.batch-row-item.description-column');
        let count = 0;
        elements.forEach(el => {
            const text = el.textContent.trim();
            const cursor = el.style.cursor || getComputedStyle(el).cursor;
            if (sorters.includes(text) && cursor === 'pointer') {
                try { el.click(); count++; } catch(e) {}
            }
        });
        console.log(`Clicked ${count} Sorter items`);
    }
    function isTotalsRow(el) { return el.classList.contains('total-row'); }
    function clickNumericRows(root = document) {
        const elements = root.querySelectorAll('div.batch-row-item.description-column');
        let clickedCount = 0;
        elements.forEach(el => {
            const cursor = el.style.cursor || getComputedStyle(el).cursor;
            const text = el.textContent.trim();
            const num = Number(text);
            if (cursor === 'pointer' && !isNaN(num) && num >= 1 && num <= 999 && !isTotalsRow(el)) {
                try { el.click(); clickedCount++; } catch (e) {}
            }
        });
        console.log(`Clicked ${clickedCount} numeric rows (1–999)`);
    }

    // --- Wait for freeze ---
    function waitForFreeze(seconds = 3, callback) {
        let lastTimestamp = document.querySelector('#last-update-label')?.textContent.trim();
        let freezeCounter = 0;
        const interval = setInterval(() => {
            const currentTimestamp = document.querySelector('#last-update-label')?.textContent.trim();
            if (currentTimestamp === lastTimestamp) {
                freezeCounter++;
                if (freezeCounter >= seconds) {
                    clearInterval(interval);
                    if (callback) callback();
                }
            } else {
                freezeCounter = 0;
                lastTimestamp = currentTimestamp;
            }
        }, 1000);
    }

    // Promise wrapper around waitForFreeze for async/await usage
    function waitForStableSec(seconds = 3) {
        return new Promise(resolve => waitForFreeze(seconds, resolve));
    }

    // --- Round time based on 30-minute threshold ---
    function getRoundedTimeUpHour() {
        const now = new Date();
        const rounded = new Date(now);
        if (now.getMinutes() >= 30) rounded.setHours(now.getHours() + 1);
        rounded.setMinutes(0, 0, 0);
        const hh = String(rounded.getHours()).padStart(2, '0');
        const timeStr = `${hh}:00`;
        return timeStr === '00:00' ? `'00:00` : timeStr;
    }

    // --- Extract batch rows (kept logic) ---
    function extractBatchRowsFor(batchElements = null) {
        const batches = batchElements || Array.from(document.querySelectorAll('div.batch-row[id^="Batch-"]'));
        const data = [];
        function extractNumber(text, insideParentheses = false) {
            if (!text) return '';
            const match = insideParentheses ? text.match(/\(([^\d,]+)?([\d,]+)\)/) : text.match(/^([\d,]+)/);
            if(!match) return '';
            // choose last capturing group that contains digits
            const digits = match[match.length-1];
            return digits ? digits.replace(/,/g, '') : '';
        }
        function formatNumber(val) {
            if (!val) return '';
            const num = parseInt(String(val).replace(/[^\d]/g, ''), 10);
            return isNaN(num) ? '' : num.toLocaleString();
        }
        const progressDaySelect = document.querySelector('#ProgressDay');
        const progressDayValue = progressDaySelect ? progressDaySelect.value.trim() : '';
        const currentHour = getRoundedTimeUpHour();

        batches.forEach(batch => {
            const batchNo = batch.querySelector('.batchNo')?.textContent.trim() || '';
            const dateElem = batch.querySelector('.createdDate');
            let batchTime = '';
            if (dateElem) {
                const parts = dateElem.innerHTML.split('<br>').map(s => s.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
                batchTime = parts.reverse().join(' ');
            }
            const descriptions = batch.querySelectorAll('.batch-row-item.description-column');
            let currentParent = '';
            descriptions.forEach(desc => {
                const text = desc.textContent.trim();
                if (!text) return;
                if (text.toLowerCase().includes('total')) return;
                const cursor = desc.style.cursor || getComputedStyle(desc).cursor;
                const inlineStyle = desc.getAttribute('style') || '';
                const isParentArea = cursor === 'pointer' && !/width\s*:\s*calc/i.test(inlineStyle);
                if (isParentArea) currentParent = text;
                const row = {};
                row['ProgressDay'] = progressDayValue;
                row['Batch No.'] = batchNo;
                row['Batch Time'] = batchTime;
                row['ParentArea'] = currentParent || '';
                row['Area'] = text;
                const totalElem = desc.parentElement.querySelector('.total-column');
                let totalVal = '';
                if (totalElem) {
                    let rawHTML = totalElem.innerHTML.trim();
                    if (rawHTML.includes('<hr')) rawHTML = rawHTML.split('<hr')[0];
                    totalVal = rawHTML.replace(/<[^>]+>/g, '').trim();
                }
                let completedVal = '';
                if (currentParent === 'Packing') {
                    const completedElem = desc.parentElement.querySelector('.parcels-packed .bar-label');
                    if (completedElem) completedVal = extractNumber(completedElem.textContent.trim(), true);
                } else {
                    const completedElem = desc.parentElement.querySelector('.progress-complete .bar-label');
                    if (completedElem) completedVal = extractNumber(completedElem.textContent.trim(), false);
                }
                let allocatedVal = '';
                const allocatedElem = desc.parentElement.querySelector('.progress-allocated .bar-label');
                if (allocatedElem) allocatedVal = extractNumber(allocatedElem.textContent.trim(), false);
                let heldVal = '';
                const heldElem = desc.parentElement.querySelector('.progress-held .bar-label');
                if (heldElem) heldVal = extractNumber(heldElem.textContent.trim(), false);
                const totalNum = parseInt((totalVal || '0').replace(/,/g, ''), 10);
                const completedNum = parseInt((completedVal || '0').replace(/,/g, ''), 10);
                row['Total'] = formatNumber(totalVal);
                row['Completed'] = formatNumber(completedVal);
                row['% Completed'] = totalNum ? ((completedNum / totalNum) * 100).toFixed(2) + '%' : '0%';
                row['Outstanding'] = (totalNum - completedNum).toLocaleString();
                row['Allocated'] = formatNumber(allocatedVal);
                row['Held/Cancelled'] = formatNumber(heldVal);
                row['CurrentHour'] = currentHour;
                data.push(row);
            });
        });

        console.log(`Extracted ${data.length} rows`);
        return { data, progressDayValue, currentHour };
    }

    // --- Build CSV / TSV helpers ---
    function buildCSVText({ data }) {
        if (!data || data.length === 0) return '';
        const headers = Object.keys(data[0]);
        const csvRows = [ headers.join(','), ...data.map(row => headers.map(h => escapeCSV(row[h])).join(',')) ];
        return csvRows.join('\n');
    }
    function buildTSVText({ data }) {
        if (!data || data.length === 0) return '';
        const headers = Object.keys(data[0]);
        const rows = [ headers.join('\t'), ...data.map(row => headers.map(h => escapeTSV(row[h])).join('\t')) ];
        return rows.join('\n');
    }

    // --- Export CSV file ---
    function exportCSVFile(csvText, progressDayValue, currentHour) {
        if (!csvText) return;
        const blob = new Blob([csvText], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const pd = (progressDayValue || '').replace(/\//g, '-');
        a.download = `Progress Update_${pd || 'unknown'}_${currentHour || 'unknown'}.csv`;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log("CSV exported ✅");
    }

    // --- Click Despatch twice helper ---
    async function clickDespatchTwice() {
        const targetRow = document.querySelector('#ProgRow-Totals_Despatch-999999999');
        if (!targetRow) {
            console.warn('Progress row #ProgRow-Totals_Despatch-999999999 not found for despatch clicks.');
            return;
        }
        const despatchEl = Array.from(targetRow.querySelectorAll('.batch-row-item.description-column')).find(e => e.textContent.trim() === 'Despatch' && ((e.style.cursor || getComputedStyle(e).cursor) === 'pointer'));
        if (!despatchEl) {
            console.warn('Despatch element not found or not clickable.');
            return;
        }
        try {
            for (let i = 0; i < 2; i++) { try { despatchEl.click(); } catch(e){} await delay(400); }
            console.log('Clicked Despatch twice.');
        } catch (e) {
            console.warn('Error during despatch clicks', e);
        }
    }

    // --- Toggle Depot Checkbox ---
    async function toggleDepotCheckbox() {
        const checkbox = document.querySelector('#DepotsView');
        if (!checkbox) { console.warn('Depot checkbox not found.'); return; }
        try {
            checkbox.click(); console.log('Depot checkbox toggled (1/2)'); await delay(2000);
            checkbox.click(); console.log('Depot checkbox toggled (2/2)'); await delay(2000);
        } catch(e) { console.warn('Error toggling depot checkbox', e); }
    }
    function clickAutoRefresh() {
        const checkbox = document.querySelector('#AutoRefresh');
        if (checkbox) { try { checkbox.click(); console.log('AutoRefresh clicked'); } catch(e) { console.warn('AutoRefresh click failed', e); } }
    }

    // --- Toast helper ---
    function showToast(msg = 'Copied ✅', duration = 1400) {
        const existing = document.querySelector('.pe-toast');
        if (existing) existing.remove();
        const t = document.createElement('div');
        t.className = 'pe-toast';
        t.textContent = msg;
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 280); }, duration);
    }

    // --- Overlay UI (unified buttons) ---
    function showExportOverlay(extracted) {
        if (overlay) { overlay.remove(); overlay = null; }

        let csvTextVar = buildCSVText(extracted);
        let tsvTextVar = buildTSVText(extracted);

        overlay = document.createElement('div');
        overlay.id = 'progress-export-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            left: '50%',
            top: '100px',
            transform: 'translateX(-50%)',
            zIndex: 10001,
            width: '760px',
            maxHeight: '76vh',
            overflow: 'hidden',
            padding: '12px',
            borderRadius: '8px'
        });

        // Top bar
        const topBar = document.createElement('div');
        topBar.className = 'pe-topbar';

        // --- Create unified icon buttons ---
        // Copy (fa-copy)
        const copyBtn = document.createElement('button');
        copyBtn.title = 'Copy to clipboard (TSV for Google Sheets)';
        copyBtn.setAttribute('aria-label','Copy to clipboard');
        copyBtn.innerHTML = '<i class="fa fa-copy pu-icon"></i>';
        copyBtn.disabled = !tsvTextVar;
        styleIconButton(copyBtn, { size: BTN_SIZE, radius: BTN_RADIUS, bg: BTN_BG, border: BTN_BORDER });

        // Download (fa-download)
        const downloadBtn = document.createElement('button');
        downloadBtn.title = 'Download CSV';
        downloadBtn.setAttribute('aria-label','Download CSV');
        downloadBtn.innerHTML = '<i class="fa fa-download pu-icon"></i>';
        downloadBtn.disabled = !csvTextVar;
        styleIconButton(downloadBtn, { size: BTN_SIZE, radius: BTN_RADIUS, bg: BTN_BG_ALT, border: BTN_BORDER, alt: true });

        // Refresh (fa-rotate-right)
        const refreshBtn = document.createElement('button');
        refreshBtn.title = 'Refresh (Despatch x3 + scoped runs)';
        refreshBtn.setAttribute('aria-label','Refresh');
        refreshBtn.innerHTML = '<i class="fa fa-refresh pu-icon"></i>';
        styleIconButton(refreshBtn, { size: BTN_SIZE, radius: BTN_RADIUS, bg: BTN_BG, border: BTN_BORDER });

        // Close (fa-times)
        const closeBtn = document.createElement('button');
        closeBtn.title = 'Close and toggle Depot + AutoRefresh';
        closeBtn.setAttribute('aria-label','Close');
        closeBtn.innerHTML = '<i class="fa fa-times pu-icon"></i>';
        styleIconButton(closeBtn, { size: BTN_SIZE, radius: BTN_RADIUS, bg: BTN_BG, border: BTN_BORDER });

        topBar.appendChild(refreshBtn);
        topBar.appendChild(copyBtn);
        topBar.appendChild(downloadBtn);
        topBar.appendChild(closeBtn);
        overlay.appendChild(topBar);

        // Table container
        const tableContainer = document.createElement('div');
        tableContainer.className = 'table-wrap';
        overlay.appendChild(tableContainer);

        // Render table
        function renderTable(extractedData) {
            tableContainer.innerHTML = '';
            const { data } = extractedData;
            if (!data || data.length === 0) {
                const empty = document.createElement('div');
                empty.textContent = 'No rows extracted.';
                tableContainer.appendChild(empty);
                return;
            }
            const table = document.createElement('table');
            const headers = Object.keys(data[0]);
            const thead = document.createElement('thead');
            const headRow = document.createElement('tr');
            headers.forEach(h => {
                const th = document.createElement('th');
                th.textContent = h;
                th.style.border = 'none';
                headRow.appendChild(th);
            });
            thead.appendChild(headRow);
            table.appendChild(thead);
            const tbody = document.createElement('tbody');
            data.forEach(row => {
                const tr = document.createElement('tr');
                headers.forEach(h => {
                    const td = document.createElement('td');
                    td.textContent = row[h] ?? '';
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            tableContainer.appendChild(table);
        }

        renderTable(extracted);
        document.body.appendChild(overlay);

        // --- Button handlers (unified behaviour preserved) ---

        // COPY to clipboard (TSV) — prefer GM_setClipboard, fallback to navigator.clipboard or textarea
        copyBtn.addEventListener('click', async () => {
            try {
                if (!tsvTextVar) { console.warn('No TSV to copy.'); return; }
                const prevInner = copyBtn.innerHTML;
                const setCopied = () => { copyBtn.innerHTML = '<i class="fa fa-check pu-icon"></i>'; showToast('Copied ✅', 1200); setTimeout(()=> copyBtn.innerHTML = prevInner, 1200); };
                const setError = () => { copyBtn.innerHTML = '<i class="fa fa-exclamation-triangle pu-icon"></i>'; setTimeout(()=> copyBtn.innerHTML = prevInner, 1200); };

                if (typeof GM_setClipboard === 'function') {
                    try { GM_setClipboard(tsvTextVar, 'text'); setCopied(); return; } catch (e) { console.warn('GM_setClipboard failed', e); }
                }
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(tsvTextVar); setCopied(); return;
                }
                const ta = document.createElement('textarea');
                ta.value = tsvTextVar;
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); setCopied(); } catch (e) { console.warn('Fallback copy failed', e); setError(); } finally { document.body.removeChild(ta); }
            } catch (e) {
                console.warn('Clipboard write failed', e);
                copyBtn.innerHTML = '<i class="fa fa-exclamation-triangle pu-icon"></i>';
                setTimeout(()=> copyBtn.innerHTML = '<i class="fa fa-copy pu-icon"></i>', 1200);
            }
        });

        // DOWNLOAD CSV
        downloadBtn.addEventListener('click', async () => {
            try {
                if (!csvTextVar) { console.warn('No CSV to download.'); return; }
                exportCSVFile(csvTextVar, extracted.progressDayValue, extracted.currentHour);
                const prev = downloadBtn.innerHTML;
                downloadBtn.innerHTML = '<i class="fa fa-check pu-icon"></i>';
                setTimeout(()=> downloadBtn.innerHTML = prev, 1200);
            } catch (e) {
                console.warn('Download failed', e);
                downloadBtn.innerHTML = '<i class="fa fa-exclamation-triangle pu-icon"></i>';
                setTimeout(()=> downloadBtn.innerHTML = '<i class="fa fa-download pu-icon"></i>', 1200);
            }
        });

        // CLOSE overlay + toggle depot + auto refresh
        closeBtn.addEventListener('click', async () => {
            if (overlay) { overlay.remove(); overlay = null; }
            try { await toggleDepotCheckbox(); clickAutoRefresh(); } catch (e) { console.warn('Error during close actions', e); }
        });

        // REFRESH behaviour (Despatch x3 then scoped flows; update overlay, copy TSV, download CSV)
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            const prev = refreshBtn.innerHTML;
            refreshBtn.innerHTML = '<i class="fa fa-hourglass-half pu-icon"></i>';

            try {
                // 0) Try top Despatch
                const topTargetRow = document.querySelector('#ProgRow-Totals_Despatch-999999999');
                if (topTargetRow) {
                    const topDespatchEl = Array.from(topTargetRow.querySelectorAll('.batch-row-item.description-column')).find(e => e.textContent.trim() === 'Despatch' && ((e.style.cursor || getComputedStyle(e).cursor) === 'pointer'));
                    if (topDespatchEl) {
                        for (let i = 0; i < 3; i++) { try { topDespatchEl.click(); } catch(e){} await delay(500); }
                    } else console.warn('Top Despatch not found or clickable.');
                } else console.warn('Top progress row for Despatch not found.');

                await delay(1000);
                const allBatches = Array.from(document.querySelectorAll('div.batch-row[id^="Batch-"]'));
                const newBatchElements = allBatches.filter(b => {
                    const bn = b.querySelector('.batchNo')?.textContent.trim();
                    return bn && !processedBatchNos.has(bn);
                });

                if (newBatchElements.length > 0) {
                    console.log('Found', newBatchElements.length, 'new batches — processing in parallel.');

                    // Step A: click stages for all new batches (fire-and-forget)
                    newBatchElements.forEach(bEl => clickStages(bEl));
                    await waitForStableSec(3);

                    // Step B: click Despatch twice for all batches in parallel, then wait for stable label
                    const despatchPhase1 = newBatchElements.map(() => clickDespatchTwice());
                    await Promise.allSettled(despatchPhase1);
                    await waitForStableSec(3);

                    // Step C: click DriveGroups (bottom-first) for all batches
                    newBatchElements.forEach(bEl => clickDriveGroup(bEl, { bottomFirst: true }));
                    await waitForStableSec(3);

                    // Step D: despatch again for all
                    const despatchPhase2 = newBatchElements.map(() => clickDespatchTwice());
                    await Promise.allSettled(despatchPhase2);
                    await waitForStableSec(3);

                    // Step E: click sorters for all
                    newBatchElements.forEach(bEl => clickSorters(bEl));
                    await waitForStableSec(6);

                    // Step F: despatch again for all
                    const despatchPhase3 = newBatchElements.map(() => clickDespatchTwice());
                    await Promise.allSettled(despatchPhase3);
                    await waitForStableSec(3);

                    // Step G: click numeric rows for all
                    newBatchElements.forEach(bEl => clickNumericRows(bEl));
                    await waitForStableSec(6);

                    // Step H: final despatch for all
                    const despatchPhase4 = newBatchElements.map(() => clickDespatchTwice());
                    await Promise.allSettled(despatchPhase4);
                    await waitForStableSec(3);

                    // Mark processed immediately
                    newBatchElements.forEach(b => { const bn = b.querySelector('.batchNo')?.textContent.trim(); if (bn) processedBatchNos.add(bn); });

                } else {
                    // fallback scoped flow for the batch under the target progress row
                    const maybeBatchNo = (() => {
                        const b = document.querySelector('#ProgRow-Totals_Despatch-999999999 .batchNo');
                        return b ? b.textContent.trim() : null;
                    })();
                    if (maybeBatchNo) {
                        const batchEl = allBatches.find(b => (b.querySelector('.batchNo')?.textContent.trim() === maybeBatchNo));
                        if (batchEl) {
                            await clickDespatchTwice(); await new Promise(r => waitForFreeze(3, r));
                            clickStages(batchEl); await new Promise(r => waitForFreeze(3, r));
                            await clickDespatchTwice(); await new Promise(r => waitForFreeze(3, r));
                            clickDriveGroup(batchEl); await new Promise(r => waitForFreeze(3, r));
                            await clickDespatchTwice(); await new Promise(r => waitForFreeze(6, r));
                            clickSorters(batchEl); await new Promise(r => waitForFreeze(6, r));
                            await clickDespatchTwice(); await new Promise(r => waitForFreeze(6, r));
                            clickNumericRows(batchEl); await new Promise(r => waitForFreeze(6, r));
                            await clickDespatchTwice(); await new Promise(r => waitForFreeze(6, r));
                            const bn = batchEl.querySelector('.batchNo')?.textContent.trim(); if (bn) processedBatchNos.add(bn);
                        } else {
                            console.log('No batch element found for that progress row.');
                        }
                    } else {
                        console.log('No new batches and no batch number found under top progress row.');
                    }
                }

                await delay(800);
                const extractedAll = extractBatchRowsFor();
                csvTextVar = buildCSVText(extractedAll);
                tsvTextVar = buildTSVText(extractedAll);
                renderTable(extractedAll);
                copyBtn.disabled = !tsvTextVar;
                downloadBtn.disabled = !csvTextVar;

                // copy TSV to clipboard
                if (tsvTextVar) {
                    try {
                        if (typeof GM_setClipboard === 'function') { GM_setClipboard(tsvTextVar, 'text'); }
                        else if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(tsvTextVar); }
                        else { const ta = document.createElement('textarea'); ta.value = tsvTextVar; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch(e){ console.warn('Fallback copy failed', e);} finally { document.body.removeChild(ta);} }
                        showToast('Copied ✅', 1400);
                    } catch (e) {
                        console.warn('Copy failed after refresh', e);
                        showToast('Copy failed ⚠', 1600);
                    }
                }

                extractedAll.data.forEach(r => { if (r['Batch No.']) processedBatchNos.add(r['Batch No.']); });

            } catch (e) {
                console.warn('Error during refresh handler', e);
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = prev;
            }
        });

        // auto-download CSV for convenience (keeps previous behaviour)
        try { if (csvTextVar) exportCSVFile(csvTextVar, extracted.progressDayValue, extracted.currentHour); } catch (e) { console.warn('CSV auto-download failed', e); }
    }

    // --- MAIN flow bound to the unified main button ---
    mainBtn.addEventListener('click', async () => {
        mainBtn.disabled = true;
        mainBtn.innerHTML = '<i class="fa fa-spinner fa-spin pu-icon"></i>';
        try {
            clickStages(); await new Promise(r => waitForFreeze(3, r));
            clickDriveGroup(); await new Promise(r => waitForFreeze(3, r));
            clickSorters(); await new Promise(r => waitForFreeze(6, r));
            clickNumericRows(); await new Promise(r => waitForFreeze(6, r));

            const extracted = extractBatchRowsFor();
            extracted.data.forEach(r => { if (r['Batch No.']) processedBatchNos.add(r['Batch No.']); });
            showExportOverlay(extracted);

            await delay(800);
            mainBtn.innerHTML = '<i class="fa fa-check pu-icon"></i>';
            await delay(1000);
        } catch (e) {
            console.error('Main flow error', e);
            mainBtn.innerHTML = '<i class="fa fa-exclamation-triangle pu-icon"></i>';
            await delay(1200);
        } finally {
            mainBtn.disabled = false;
            // revert icon to the canonical MAIN_ICON to avoid typos
            mainBtn.innerHTML = MAIN_ICON;
        }
    });

    console.log('Progress Update_ALL (uniform buttons) loaded ✔');

})();
