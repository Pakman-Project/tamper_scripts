// ==UserScript==
// @name         [PAK] E3 Combined Progress Export
// @namespace    http://tampermonkey.net/
// @version      4.2
// @description  Automatically export E3 Induct (picking) + Depot Progress (packing) into one CSV with black modal preview, refresh button, clipboard copy, and toast
// @author       Pak
// @match        https://pon-wpws27/Whds.Dashboard.Web/e3/picking*
// @match        https://pon-wpws27/Whds.Dashboard.Web/e3/packing*
// @grant        none
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20E3%20Combined%20Progress%20Export.user.js
// @downloadURL  https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20E3%20Combined%20Progress%20Export.user.js
// ==/UserScript==

(function () {
    'use strict';

    /*********************
     * Shared UX / Theme *
     *********************/
    const BTN_SIZE = '36px';
    const MAIN_BTN_SIZE = '40px';
    const BTN_RADIUS = '7px';
    const BTN_BORDER = '1px solid rgba(255,255,255,0.92)';
    const BTN_BG = '#000';
    const BTN_BG_ALT = '#111';
    const BTN_ICON_FONTSIZE = '14px';
    const HOVER_SHADOW = '0 6px 18px rgba(255,255,255,0.06)';

    const E3_RERUN_KEY = 'E3_Rerun_Requested';
    let isRunning = false;

    (function injectAssets() {
        if (!document.querySelector('link[href*="font-awesome"]')) {
            const fa = document.createElement('link');
            fa.rel = 'stylesheet';
            fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css';
            fa.id = 'e3-fa-css';
            document.head.appendChild(fa);
        }

        if (document.getElementById('e3-spinner-styles')) return;
        const style = document.createElement('style');
        style.id = 'e3-spinner-styles';
        style.textContent = `
            @keyframes e3-refresh-rotate {
                from { transform: rotate(0deg); }
                to   { transform: rotate(360deg); }
            }
            .e3-refresh-spin {
                display: inline-block;
                animation: e3-refresh-rotate 800ms linear infinite;
                transform-origin: 50% 50%;
                will-change: transform;
            }
            .e3-refresh-icon, .e3-modal-icon {
                display: inline-block;
                line-height: 1;
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
    })();

    function log(msg) {
        const time = new Date().toLocaleTimeString();
        console.log(`[E3 ${time}] ${msg}`);
    }

    const delay = ms => new Promise(res => setTimeout(res, ms));

    function lightenHex(hex, amount) {
        if (!hex) return hex;
        if (hex.startsWith('rgb')) return hex;
        hex = hex.replace('#', '');
        if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        const num = parseInt(hex, 16);
        let r = (num >> 16) + amount;
        let g = ((num >> 8) & 0x00FF) + amount;
        let b = (num & 0x0000FF) + amount;
        r = Math.min(255, Math.max(0, r));
        g = Math.min(255, Math.max(0, g));
        b = Math.min(255, Math.max(0, b));
        return `rgb(${r}, ${g}, ${b})`;
    }

    function styleIconButton(btn, { size = BTN_SIZE, radius = BTN_RADIUS, bg = BTN_BG, border = BTN_BORDER, fontSize = BTN_ICON_FONTSIZE, alt = false } = {}) {
        Object.assign(btn.style, {
            width: size,
            height: size,
            padding: '0',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: '"Roboto Mono", monospace',
            fontSize: fontSize,
            borderRadius: radius,
            border: border,
            background: bg,
            color: '#fff',
            cursor: 'pointer',
            boxSizing: 'border-box',
            transition: 'transform 120ms ease, box-shadow 140ms ease, background-color 140ms ease, opacity 140ms ease',
            outline: 'none',
            lineHeight: '1'
        });

        const icons = btn.querySelectorAll('i, span.e3-modal-icon, span.e3-refresh-icon');
        icons.forEach(ic => { ic.style.pointerEvents = 'none'; });

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
            btn.style.boxShadow = '0 0 0 3px rgba(255,255,255,0.06)';
        });
        btn.addEventListener('blur', () => {
            btn.style.boxShadow = 'none';
        });
    }

    function showToastAtElement(el, message, duration = 3000) {
        const rect = el.getBoundingClientRect();
        const toast = document.createElement('div');
        toast.textContent = message;
        Object.assign(toast.style, {
            position: 'fixed',
            left: `${Math.min(window.innerWidth - 20, Math.max(8, Math.round(rect.right + 10)))}px`,
            top: `${Math.max(8, Math.round(rect.top))}px`,
            background: '#000',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: '4px',
            border: '1px solid rgba(255,255,255,0.08)',
            zIndex: 200000,
            fontFamily: '"Roboto Mono", monospace',
            fontSize: '12px',
            boxShadow: '0 6px 18px rgba(0,0,0,0.6)',
            opacity: '0',
            transition: 'opacity 160ms ease'
        });
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.style.opacity = '1');
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 220);
        }, duration);
    }

    function escapeCSV(val) {
        val = String(val ?? '').trim();
        if (val.includes('"')) val = val.replace(/"/g, '""');
        if (/[",\n]/.test(val)) val = `"${val}"`;
        return val;
    }

    function parseCSVRowToCells(row) {
        const cells = [];
        let cur = '';
        let inQuotes = false;

        for (let i = 0; i < row.length; i++) {
            const ch = row[i];
            if (ch === '"') {
                if (inQuotes && row[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }
            if (ch === ',' && !inQuotes) {
                cells.push(cur);
                cur = '';
                continue;
            }
            cur += ch;
        }
        cells.push(cur);
        return cells;
    }

    const getRoundedTimeHHMM = () => {
        const now = new Date();
        const rounded = new Date(now);
        if (now.getMinutes() >= 30) rounded.setHours(rounded.getHours() + 1);
        rounded.setMinutes(0, 0, 0);
        return `${String(rounded.getHours()).padStart(2, '0')}:00`;
    };

    const getDateOffset = offset => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        return d.toLocaleDateString('sv-SE');
    };

    const arrayToCsv = data =>
        data.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');

    const downloadCsv = (filename, content) => {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    };

    async function copyTextToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try {
                document.execCommand('copy');
                ta.remove();
                return true;
            } catch (err) {
                ta.remove();
                throw err;
            }
        }
    }

    function requestE3Rerun() {
        localStorage.setItem(E3_RERUN_KEY, '1');
        localStorage.removeItem('E3_Induct_Data');
        window.location.href = 'https://pon-wpws27/Whds.Dashboard.Web/e3/picking';
    }

    function removePreviewUI() {
        document.getElementById('e3-csv-modal')?.remove();
        document.getElementById('e3-csv-backdrop')?.remove();
    }

    /***********************
     * Modal CSV Preview    *
     ***********************/
    function showModalCSVPreview(csvRows, onClose) {
        removePreviewUI();

        const backdrop = document.createElement('div');
        backdrop.id = 'e3-csv-backdrop';
        Object.assign(backdrop.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(0,0,0,0.75)',
            zIndex: '99999',
            pointerEvents: 'none'
        });

        const modal = document.createElement('div');
        modal.id = 'e3-csv-modal';
        Object.assign(modal.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#000000',
            color: '#ddd',
            borderRadius: '8px',
            zIndex: '100000',
            fontFamily: '"Roboto Mono", monospace',
            maxHeight: '80%',
            overflow: 'hidden',
            padding: '12px',
            minWidth: '760px',
            boxShadow: '0 8px 40px rgba(0,0,0,0.8)'
        });

        const header = document.createElement('div');
        Object.assign(header.style, {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px',
            gap: '8px'
        });

        const title = document.createElement('div');
        title.textContent = `E3 Combined Progress — ${Math.max(0, csvRows.length - 1)} rows`;
        Object.assign(title.style, { fontWeight: '700', fontSize: '13px', color: '#ffffff' });

        const controls = document.createElement('div');
        Object.assign(controls.style, { display: 'flex', gap: '8px', alignItems: 'center' });

        const refreshBtn = document.createElement('button');
        refreshBtn.innerHTML = '<span class="e3-modal-icon e3-refresh-icon"><i class="fa fa-refresh" aria-hidden="true"></i></span>';
        refreshBtn.title = 'Run again';
        refreshBtn.setAttribute('aria-label', 'Run again');
        styleIconButton(refreshBtn, { size: BTN_SIZE, radius: BTN_RADIUS, bg: BTN_BG, border: BTN_BORDER, fontSize: BTN_ICON_FONTSIZE });

        const copyBtn = document.createElement('button');
        copyBtn.innerHTML = '<i class="fa fa-copy" aria-hidden="true"></i>';
        copyBtn.title = 'Copy';
        copyBtn.setAttribute('aria-label', 'Copy to clipboard');
        styleIconButton(copyBtn, { size: BTN_SIZE, radius: BTN_RADIUS, bg: BTN_BG, border: BTN_BORDER, fontSize: BTN_ICON_FONTSIZE });

        const downloadBtn = document.createElement('button');
        downloadBtn.innerHTML = '<i class="fa fa-download" aria-hidden="true"></i>';
        downloadBtn.title = 'Download CSV';
        downloadBtn.setAttribute('aria-label', 'Download CSV');
        styleIconButton(downloadBtn, { size: BTN_SIZE, radius: BTN_RADIUS, bg: BTN_BG_ALT, border: BTN_BORDER, fontSize: BTN_ICON_FONTSIZE, alt: true });

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
        closeBtn.title = 'Close';
        closeBtn.setAttribute('aria-label', 'Close');
        styleIconButton(closeBtn, { size: BTN_SIZE, radius: BTN_RADIUS, bg: BTN_BG, border: BTN_BORDER, fontSize: BTN_ICON_FONTSIZE });

        refreshBtn.addEventListener('click', () => {
            removePreviewUI();
            showToastAtElement(refreshBtn, 'Restarting...', 1500);
            requestE3Rerun();
        });

        copyBtn.addEventListener('click', async () => {
            try {
                const text = csvRows.map(row => parseCSVRowToCells(row).join('\t')).join('\n');
                await copyTextToClipboard(text);
                showToastAtElement(copyBtn, 'Copied ✓', 2500);
            } catch (e) {
                console.error(e);
                alert('Copy failed — ' + e);
            }
        });

        downloadBtn.addEventListener('click', () => {
            try {
                const csv = csvRows.join('\n');
                const dateStr = getDateOffset(0);
                downloadCsv(`E3_Combined_${dateStr}.csv`, csv);
                showToastAtElement(downloadBtn, 'Downloaded ✓', 2500);
            } catch (e) {
                console.error(e);
                alert('Download failed — ' + e);
            }
        });

        closeBtn.addEventListener('click', () => {
            removePreviewUI();
            if (typeof onClose === 'function') onClose();
        });

        controls.appendChild(refreshBtn);
        controls.appendChild(copyBtn);
        controls.appendChild(downloadBtn);
        controls.appendChild(closeBtn);

        header.appendChild(title);
        header.appendChild(controls);

        const tableWrap = document.createElement('div');
        Object.assign(tableWrap.style, {
            overflowY: 'auto',
            maxHeight: '62vh',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: '0px'
        });

        const table = document.createElement('table');
        table.style.borderCollapse = 'collapse';
        table.style.width = '100%';
        table.style.tableLayout = 'fixed';
        table.style.fontSize = '12px';
        table.style.color = '#ffffff';

        const cellBorder = '1px solid rgba(255,255,255,0.08)';
        const headerBg = '#0b0b0b';

        csvRows.forEach((row, idx) => {
            const tr = document.createElement('tr');
            const cells = parseCSVRowToCells(row);

            cells.forEach(cell => {
                const tag = idx === 0 ? 'th' : 'td';
                const cellEl = document.createElement(tag);
                cellEl.textContent = cell;
                Object.assign(cellEl.style, {
                    border: cellBorder,
                    padding: '6px 8px',
                    textAlign: 'left',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    color: '#ffffff',
                    boxSizing: 'border-box'
                });
                if (idx === 0) {
                    Object.assign(cellEl.style, {
                        position: 'sticky',
                        top: '0',
                        zIndex: '5',
                        background: headerBg
                    });
                }
                tr.appendChild(cellEl);
            });

            table.appendChild(tr);
        });

        tableWrap.appendChild(table);

        const footer = document.createElement('div');
        Object.assign(footer.style, {
            marginTop: '8px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px'
        });

        modal.appendChild(header);
        modal.appendChild(tableWrap);
        modal.appendChild(footer);

        document.body.appendChild(backdrop);
        document.body.appendChild(modal);
        copyBtn.focus();
    }

    /***********************
     * Picking (E3 Induct) *
     ***********************/
    const clickDateButton = label => new Promise(res => {
        const btn = [...document.querySelectorAll('.label-content')]
            .find(el => el.textContent.trim().toUpperCase().includes(label));
        if (btn) {
            btn.click();
            console.log(`Clicked ${label}`);
            setTimeout(res, 700);
        } else {
            console.warn(`${label} not found`);
            res();
        }
    });

    const clickAllDropdownArrows = () => new Promise(res => {
        const icons = [...document.querySelectorAll('mat-icon')]
            .filter(el => el.textContent.trim() === 'arrow_drop_down');

        icons.forEach(el => {
            const style = window.getComputedStyle(el);
            const visible = style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
            const expanded = el.closest('tr')?.nextElementSibling?.classList.contains('expanded-row');
            if (visible && !expanded) {
                el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }
        });

        setTimeout(res, 800);
    });

    const waitForTable = (retries = 10) => new Promise((res, rej) => {
        const tryFind = left => {
            const tbl = document.querySelector('table.picking-table');
            if (tbl) res(tbl);
            else if (left > 0) setTimeout(() => tryFind(left - 1), 500);
            else rej('Table not found');
        };
        tryFind(retries);
    });

    const extractTableData = (table, dayType) => {
        const data = [];
        const headers = Array.from(table.querySelectorAll('thead th')).map(h => h.innerText.trim());
        data.push(['Date', 'Batch Number', ...headers, 'Hour']);

        const date = (dayType === 'yesterday') ? getDateOffset(-1) : getDateOffset(0);
        const hour = getRoundedTimeHHMM();

        table.querySelectorAll('tbody tr').forEach(row => {
            const cells = [...row.querySelectorAll('td')].map(td => {
                const percEl = td.querySelector('.percentage');
                if (percEl) return percEl.innerText.trim();
                return td.innerText.trim();
            });

            if (cells.length) data.push([date, '', ...cells, hour]);
        });

        return data;
    };

    const applyDynamicBatchNumbers = data => {
        const result = [data[0]];
        let currentBatch = null;

        for (let i = 1; i < data.length; i++) {
            const row = [...data[i]];
            if (/^\d+$/.test(String(row[2] ?? '').trim())) currentBatch = row[2];
            row[1] = currentBatch ?? '';
            result.push(row);
        }

        return result;
    };

    async function runInductExport() {
        console.log('▶ Running E3 Induct export...');
        await clickDateButton('TODAY');
        await clickAllDropdownArrows();
        const todayTable = await waitForTable();
        const todayData = extractTableData(todayTable, 'today');

        await clickDateButton('YESTERDAY');
        await clickAllDropdownArrows();
        const yesterdayTable = await waitForTable();
        const yesterdayData = extractTableData(yesterdayTable, 'yesterday');

        const combined = todayData.concat(yesterdayData.slice(1));
        const finalData = applyDynamicBatchNumbers(combined);

        localStorage.setItem('E3_Induct_Data', JSON.stringify(finalData));
        console.log('✅ Induct data stored. Moving to Depot Progress...');
        await delay(1500);
        window.location.href = 'https://pon-wpws27/Whds.Dashboard.Web/e3/packing';
    }

    /**************************
     * Packing (Depot Export) *
     **************************/
    async function runDepotProgressExport() {
        console.log('▶ Running Depot Progress export...');

        const icons = [...document.querySelectorAll('mat-icon.mat-icon')];
        const more = icons.find(i => i.textContent.trim() === 'more_vert');
        if (!more) throw new Error('More_vert icon not found');

        (more.closest('button,div[role="button"],a') || more).click();
        await delay(700);

        await new Promise((res, rej) => {
            const timeout = Date.now() + 8000;
            const timer = setInterval(() => {
                const spans = [...document.querySelectorAll('span')];
                const menu = spans.find(s => s.textContent.trim() === 'Show depot progress');
                if (menu) {
                    clearInterval(timer);
                    (menu.closest('button,li,div[role="button"],a') || menu).click();
                    console.log('Clicked Show depot progress');
                    res();
                } else if (Date.now() > timeout) {
                    clearInterval(timer);
                    rej('Menu not found');
                }
            }, 300);
        });

        await delay(1000);

        const list = document.querySelector('app-e3-bar-progress-list');
        if (!list) throw new Error('Depot progress list not found');

        const locations = list.querySelectorAll('h6.h6-next');
        const stats = list.querySelectorAll('div.mat-body-2.label');
        const count = Math.min(locations.length, stats.length);
        const time = getRoundedTimeHHMM();

        const data = [['Depot', 'Items Completed', 'Released Items', 'Items to Pack', 'Completion Rate', 'Time']];

        for (let i = 0; i < count; i++) {
            let loc = locations[i]?.innerText.trim() || '';
            loc = loc.replace(/^\d+\s*/, '');

            const text = stats[i]?.innerText.trim() || '';
            const m = text.match(/([\d,]+)\s+of\s+([\d,]+)\s+total released items/i);

            let comp = '', total = '', toPack = '', rate = '';
            if (m) {
                comp = parseInt(m[1].replace(/,/g, ''), 10);
                total = parseInt(m[2].replace(/,/g, ''), 10);
                toPack = total - comp;
                rate = total ? ((comp / total) * 100).toFixed(2) + '%' : '0%';
            }

            data.push([loc, comp, total, toPack, rate, time === '00:00' ? `'00:00` : time]);
        }

        mergeAndPreview(data);
    }

    /***********************
     * Merge + Export Logic *
     ***********************/
    function mergeAndPreview(depotData) {
        const inductData = JSON.parse(localStorage.getItem('E3_Induct_Data') || '[]');
        if (!inductData.length) {
            alert('❌ Induct data not found in storage!');
            return;
        }

        console.log('🔗 Merging Induct + Depot data...');

        const merged = [];
        const maxRows = Math.max(inductData.length, depotData.length);
        const header = [...inductData[0], ...depotData[0]];
        merged.push(header);

        for (let i = 1; i < maxRows; i++) {
            const left = inductData[i] || new Array(inductData[0].length).fill('');
            const right = depotData[i] || new Array(depotData[0].length).fill('');
            merged.push([...left, ...right]);
        }

        localStorage.removeItem('E3_Induct_Data');

        const csvRows = merged.map(row => row.map(escapeCSV).join(','));
        const dateStr = getDateOffset(0);

        showModalCSVPreview(csvRows, () => {
            console.log('Closing preview and returning to picking page...');
            setTimeout(() => {
                window.location.href = 'https://pon-wpws27/Whds.Dashboard.Web/e3/picking';
            }, 1000);
        });

        console.log(`✅ Combined export ready: E3_Combined_${dateStr}.csv`);
    }

    /**********************
     * Page Detection Flow *
     **********************/
    function addMainButton() {
        if (document.getElementById('runCombinedExport')) return;

        const btn = document.createElement('button');
        btn.id = 'runCombinedExport';
        btn.innerHTML = '<i class="fa fa-tasks" aria-hidden="true"></i>';
        btn.title = 'E3 Progress';
        btn.setAttribute('aria-label', 'E3 Progress');
        Object.assign(btn.style, {
            position: 'fixed',
            top: '10px',
            right: '450px',
            zIndex: '10000',
            padding: '0',
            fontFamily: '"Roboto Mono", monospace',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        });

        styleIconButton(btn, {
            size: MAIN_BTN_SIZE,
            radius: BTN_RADIUS,
            bg: '#000000de',
            border: '1px solid #666',
            fontSize: '16px'
        });

        btn.addEventListener('click', async () => {
            if (isRunning) {
                log('Script already running');
                return;
            }

            isRunning = true;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa fa-spinner e3-refresh-spin" aria-hidden="true"></i>';
            btn.style.backgroundColor = '#333';

            try {
                if (location.href.includes('/e3/picking')) {
                    log('Starting picking export...');
                    await runInductExport();
                } else if (location.href.includes('/e3/packing')) {
                    log('Starting depot export...');

                    const inductDataExists = !!localStorage.getItem('E3_Induct_Data');

                    const shouldClickYesterday = () => {
                        const h = new Date().getHours();
                        return h >= 0 && h < 6;
                    };

                    if (shouldClickYesterday()) {
                        console.log('🕖 Time between 00:00–05:59 — selecting YESTERDAY filter...');
                        const yBtn = [...document.querySelectorAll('.label-content')]
                            .find(el => el.textContent.trim().toUpperCase() === 'YESTERDAY');
                        if (yBtn) {
                            yBtn.click();
                            console.log('✅ Clicked YESTERDAY filter');
                            await delay(1000);
                        } else {
                            console.warn('⚠️ YESTERDAY filter not found.');
                        }
                    } else {
                        console.log('⏰ Outside 00:00–05:59 — keeping default date filter.');
                    }

                    if (inductDataExists) {
                        console.log('✅ Induct data found — continuing with Depot export...');
                        await runDepotProgressExport();
                    } else {
                        console.log('ℹ️ Skipping Depot export — no Induct data detected (manual visit).');
                    }
                }
            } catch (err) {
                console.error(err);
                alert('E3 export failed: ' + err);
            } finally {
                isRunning = false;
                btn.innerHTML = '<i class="fa fa-check" aria-hidden="true"></i>';
                btn.style.backgroundColor = '#888';

                setTimeout(() => {
                    btn.innerHTML = '<i class="fa fa-archive" aria-hidden="true"></i>';
                    btn.style.backgroundColor = '#000000de';
                    btn.disabled = false;
                }, 3000);
            }
        });

        document.body.appendChild(btn);
    }

    window.addEventListener('load', async () => {
        await delay(1500);
        addMainButton();

        if (location.href.includes('/e3/picking')) {
            console.log('E3 Combined Progress Export loaded on picking page');

            if (localStorage.getItem(E3_RERUN_KEY) === '1') {
                localStorage.removeItem(E3_RERUN_KEY);
                await delay(1200);
                const btn = document.getElementById('runCombinedExport');
                if (btn) {
                    console.log('🔁 Auto-restarting combined export...');
                    btn.click();
                }
            }

            return;
        }

        if (location.href.includes('/e3/packing')) {
            await delay(1500);

            const inductDataExists = !!localStorage.getItem('E3_Induct_Data');

            const shouldClickYesterday = () => {
                const h = new Date().getHours();
                return h >= 0 && h < 6;
            };

            if (!inductDataExists) {
                console.log('ℹ️ Skipping Depot export — no Induct data detected (manual visit).');
                return;
            }

            if (shouldClickYesterday()) {
                console.log('🕖 Time between 00:00–05:59 — selecting YESTERDAY filter...');
                const btn = [...document.querySelectorAll('.label-content')]
                    .find(el => el.textContent.trim().toUpperCase() === 'YESTERDAY');
                if (btn) {
                    btn.click();
                    console.log('✅ Clicked YESTERDAY filter');
                    await delay(1000);
                } else {
                    console.warn('⚠️ YESTERDAY filter not found.');
                }
            } else {
                console.log('⏰ Outside 00:00–05:59 — keeping default date filter.');
            }

            console.log('✅ Induct data found — auto-starting Depot export...');
            runDepotProgressExport().catch(e => {
                console.error('Depot export error:', e);
                alert('Depot export failed: ' + e);
            });
        }
    });

    log('E3 Combined Progress Export v4.2 loaded');
})();