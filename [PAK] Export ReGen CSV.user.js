// ==UserScript==
// @name         [PAK] Export ReGen CSV
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Export merged CSV from E1, E2, E3, and S6 with black modal preview, refresh, copy, download, and rounded time column from #clock.
// @author       Pak
// @match        http://whds-directory-web-v1:8091/ReGen.aspx
// @grant        none
// @run-at       document-end
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

    let isRunning = false;

    (function injectAssets() {
        if (!document.querySelector('link[href*="font-awesome"]')) {
            const fa = document.createElement('link');
            fa.rel = 'stylesheet';
            fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css';
            fa.id = 'regen-fa-css';
            document.head.appendChild(fa);
        }

        if (document.getElementById('regen-spinner-styles')) return;
        const style = document.createElement('style');
        style.id = 'regen-spinner-styles';
        style.textContent = `
            @keyframes regen-refresh-rotate {
                from { transform: rotate(0deg); }
                to   { transform: rotate(360deg); }
            }
            .regen-refresh-spin {
                display: inline-block;
                animation: regen-refresh-rotate 800ms linear infinite;
                transform-origin: 50% 50%;
                will-change: transform;
            }
            .regen-refresh-icon, .regen-modal-icon {
                display: inline-block;
                line-height: 1;
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
    })();

    function log(msg) {
        const time = new Date().toLocaleTimeString();
        console.log(`[ReGen ${time}] ${msg}`);
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

        const icons = btn.querySelectorAll('i, span.regen-modal-icon, span.regen-refresh-icon');
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

    function escapeCSV(text) {
        text = String(text ?? '');
        if (text.includes('"') || text.includes(',') || text.includes('\n')) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    }

    function rowsToCsv(rows) {
        return rows
            .map(row => row.map(cell => escapeCSV(cell)).join(','))
            .join('\n');
    }

    function downloadCsv(filename, content) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    function getRoundedTimeFromClock() {
        const clockText = document.querySelector('#clock')?.textContent.trim();
        if (!clockText) return '';

        const timeMatch = clockText.match(/\d{2}:\d{2}:\d{2}$/);
        if (!timeMatch) return '';

        const [hours, minutes, seconds] = timeMatch[0].split(':').map(Number);
        let date = new Date();
        date.setHours(hours, minutes, seconds, 0);

        if (minutes < 30) {
            date.setMinutes(0);
        } else {
            date.setHours(date.getHours() + 1);
            date.setMinutes(0);
        }

        const hh = String(date.getHours()).padStart(2, '0');
        return `${hh}:00`;
    }

    function simulateClick(element) {
        const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        });
        element.dispatchEvent(event);
    }

    function waitFor(conditionFn, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const interval = 100;
            let elapsed = 0;
            const check = () => {
                try {
                    if (conditionFn()) return resolve();
                } catch (e) {
                    // ignore and keep waiting
                }
                elapsed += interval;
                if (elapsed >= timeout) reject('Timeout waiting for condition.');
                else setTimeout(check, interval);
            };
            check();
        });
    }

    /***********************
     * Data collection      *
     ***********************/
    function collectData() {
        const headerRow = document.querySelector('tr[role="row"]');
        const headerCols = headerRow ? headerRow.querySelectorAll('th, td') : [];
        const header = Array.from(headerCols).map(th => String(th.textContent.trim()));

        const rows = document.querySelectorAll('tr.even, tr.odd');
        const body = [];

        rows.forEach(row => {
            const cols = row.querySelectorAll('td');
            const rowData = Array.from(cols).map(td => {
                const img = td.querySelector('input[type="image"]');
                const text = img ? img.getAttribute('src') : td.textContent.trim();
                return String(text ?? '');
            });
            if (rowData.length) body.push(rowData);
        });

        return { header, rows: body };
    }

    async function handleExport(tabId) {
        const tabLink = Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === tabId);
        if (!tabLink) {
            alert(`"${tabId}" tab not found.`);
            return { header: [], rows: [] };
        }

        tabLink.click();
        await delay(5000);

        const pageSizeSelect = document.querySelector('select[name="dataTable_length"]');
        if (pageSizeSelect) {
            pageSizeSelect.value = '100';
            pageSizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            await delay(2000);
        }

        await waitFor(() => document.querySelector('th[aria-label^="Created"]'), 5000);
        const createdTh = document.querySelector('th[aria-label^="Created"]');
        if (createdTh) {
            simulateClick(createdTh);
            await delay(300);
            simulateClick(createdTh);
        }
        await delay(1000);

        const { header, rows: page1Rows } = collectData();

        const page2Link = Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === '2');
        let page2Rows = [];
        if (page2Link) {
            page2Link.click();
            await delay(3000);
            page2Rows = collectData().rows;
        }

        return { header, rows: [...page1Rows, ...page2Rows] };
    }

    /***********************
     * Modal Preview        *
     ***********************/
    function showModalCSVPreview(rows, onRefresh, onClose) {
    const existing = document.getElementById('regen-csv-modal');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'regen-csv-backdrop';
    Object.assign(backdrop.style, {
        position: 'fixed',
        inset: '0',
        background: 'rgba(0,0,0,0.75)',
        pointerEvents: 'none',
        zIndex: '99999'
    });

    const modal = document.createElement('div');
    modal.id = 'regen-csv-modal';
    Object.assign(modal.style, {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: '#000000',
        color: '#ffffff',
        borderRadius: '8px',
        zIndex: '100000',
        maxHeight: '80%',
        overflow: 'hidden',
        padding: '12px',
        fontFamily: '"Roboto Mono", monospace',
        minWidth: '760px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.8)'
    });

    const closeAll = () => {
        document.getElementById('regen-csv-modal')?.remove();
        document.getElementById('regen-csv-backdrop')?.remove();
    };

    backdrop.addEventListener('click', () => {
        closeAll();
        if (typeof onClose === 'function') onClose();
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
    title.textContent = `ReGen — ${Math.max(0, rows.length - 1)} rows`;
    Object.assign(title.style, { fontWeight: '700', fontSize: '13px', color: '#ffffff' });

    const controls = document.createElement('div');
    Object.assign(controls.style, { display: 'flex', gap: '8px', alignItems: 'center' });

    const refreshBtn = document.createElement('button');
    refreshBtn.innerHTML = '<span class="regen-modal-icon regen-refresh-icon"><i class="fa fa-refresh" aria-hidden="true"></i></span>';
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
        closeAll();
        showToastAtElement(refreshBtn, 'Restarting...', 1500);
        if (typeof onRefresh === 'function') onRefresh();
    });

    copyBtn.addEventListener('click', async () => {
        try {
            const text = rows.map(row => row.join('\t')).join('\n');
            await copyTextToClipboard(text);
            showToastAtElement(copyBtn, 'Copied ✓', 2500);
        } catch (e) {
            console.error(e);
            alert('Copy failed — ' + e);
        }
    });

    downloadBtn.addEventListener('click', () => {
        try {
            const today = new Date();
            const dd = String(today.getDate()).padStart(2, '0');
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const yyyy = today.getFullYear();
            const filename = `ReGen_${dd}-${mm}-${yyyy}.csv`;
            const csvContent = rowsToCsv(rows);
            downloadCsv(filename, csvContent);
            showToastAtElement(downloadBtn, 'Downloaded ✓', 2500);
        } catch (e) {
            console.error(e);
            alert('Download failed — ' + e);
        }
    });

    closeBtn.addEventListener('click', () => {
        closeAll();
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

    rows.forEach((row, idx) => {
        const tr = document.createElement('tr');
        row.forEach(cell => {
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
     * Main Export Flow     *
     ***********************/
    async function runMergedExport() {
        if (isRunning) {
            log('Script already running');
            return;
        }

        isRunning = true;
        mainButton.disabled = true;
        mainButton.innerHTML = '<i class="fa fa-spinner regen-refresh-spin" aria-hidden="true"></i>';
        mainButton.style.backgroundColor = '#333';

        try {
            log('Starting merged export...');
            const timeRounded = getRoundedTimeFromClock();

            const { header: e1Header, rows: e1Rows } = await handleExport('E1');
            if (!e1Header.length && !e1Rows.length) throw new Error('E1 export failed');

            const mergedHeader = [...e1Header, 'Source', 'Time'];
            const mergedRows = [
                mergedHeader,
                ...e1Rows.map(row => [...row, 'E1', timeRounded])
            ];

            await delay(1000);
            const { rows: e2Rows } = await handleExport('E2');
            mergedRows.push(...e2Rows.map(row => [...row, 'E2', timeRounded]));

            await delay(1000);
            const { rows: e3Rows } = await handleExport('E3');
            mergedRows.push(...e3Rows.map(row => [...row, 'E3', timeRounded]));

            await delay(1000);
            const { rows: s6Rows } = await handleExport('S6');
            mergedRows.push(...s6Rows.map(row => [...row, 'S6', timeRounded]));

            const csvRows = mergedRows.map(row => row.map(cell => String(cell ?? '')));

            showModalCSVPreview(
                csvRows,
                async () => {
                    await delay(300);
                    runMergedExport().catch(error => {
                        console.error('Restart error:', error);
                        alert('An error occurred during export. Check console for details.');
                    });
                },
                () => {
                    log('Preview closed');
                }
            );

            log('Merged CSV ready');
        } catch (error) {
            console.error('Error during export:', error);
            alert('An error occurred during export. Check console for details.');
        } finally {
            isRunning = false;
            mainButton.innerHTML = '<i class="fa fa-tasks" aria-hidden="true"></i>';
            mainButton.style.backgroundColor = '#000000de';
            mainButton.disabled = false;
        }
    }

    /***********************
     * Main Button          *
     ***********************/
    const mainButton = document.createElement('button');
    mainButton.id = 'regen-export-button';
    mainButton.innerHTML = '<i class="fa fa-tasks" aria-hidden="true"></i>';
    mainButton.title = 'ReGen E1, E2, E3, S6';
    mainButton.setAttribute('aria-label', 'ReGen E1, E2, E3, S6');

    Object.assign(mainButton.style, {
        position: 'fixed',
        top: '65px',
        right: '20px',
        zIndex: '10000',
        padding: '0',
        fontFamily: '"Roboto Mono", monospace',
        fontWeight: '700',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    });

    styleIconButton(mainButton, {
        size: MAIN_BTN_SIZE,
        radius: BTN_RADIUS,
        bg: '#000000de',
        border: '1px solid #666',
        fontSize: '16px'
    });

    mainButton.addEventListener('click', async () => {
        await runMergedExport();
    });

    window.addEventListener('load', async () => {
        await delay(1000);
        if (!document.getElementById('regen-export-button')) {
            document.body.appendChild(mainButton);
        }
    });

    log('Export ReGen CSV v4.0 loaded');
})();