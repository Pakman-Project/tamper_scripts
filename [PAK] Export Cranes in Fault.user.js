// ==UserScript==
// @name         [PAK] Export Cranes in Fault
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Export visible table as CSV with 3 on-screen buttons: refresh, copy, download. Copy uses TSV for proper table paste. Includes toast + auto refresh.
// @author       Pak
// @match        https://pon-wpas48.next-uk.next.loc/next2020/om/app/op-console/miniload-overview
// @grant        none
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20Export%20Cranes%20in%20Fault.user.js
// @downloadURL  https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20Export%20Cranes%20in%20Fault.user.js
// ==/UserScript==

(function () {
    'use strict';

    const BTN_SIZE = '36px';
    const BTN_RADIUS = '7px';
    const BTN_BORDER = '1px solid rgba(255,255,255,0.92)';
    const BTN_BG = '#003060';
    const BTN_BG_ALT = '#003060';
    const BTN_ICON_FONTSIZE = '14px';
    const HOVER_SHADOW = '0 6px 18px rgba(255,255,255,0.06)';

    (function injectAssets() {
        if (!document.querySelector('link[href*="font-awesome"]')) {
            const fa = document.createElement('link');
            fa.rel = 'stylesheet';
            fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css';
            document.head.appendChild(fa);
        }
    })();

    const delay = ms => new Promise(res => setTimeout(res, ms));

    function lightenHex(hex, amount) {
        if (!hex) return hex;
        if (hex.startsWith('rgb')) return hex;
        hex = hex.replace('#', '');
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
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
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: fontSize,
            borderRadius: radius,
            border: border,
            background: bg,
            color: '#fff',
            cursor: 'pointer'
        });

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
    }

    function showToast(el, msg) {
        const rect = el.getBoundingClientRect();
        const t = document.createElement('div');
        t.textContent = msg;
        Object.assign(t.style, {
            position: 'fixed',
            left: rect.right + 10 + 'px',
            top: rect.top + 'px',
            background: '#000',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            zIndex: 99999
        });
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2000);
    }

    function escapeCSV(val) {
        val = String(val ?? '').trim();
        if (val.includes('"')) val = val.replace(/"/g, '""');
        if (/[",\n]/.test(val)) val = `"${val}"`;
        return val;
    }

    function getRoundedHour() {
        const d = new Date();
        if (d.getMinutes() >= 30) d.setHours(d.getHours() + 1);
        d.setMinutes(0);
        return `${String(d.getHours()).padStart(2, '0')}:00`;
    }

    function collectTableRows() {
        const table = document.querySelector('div.table table');
        if (!table) return null;

        const rows = [];
        const hour = getRoundedHour();

        const headers = Array.from(table.querySelectorAll('.table-header'))
            .map(c => escapeCSV(c.textContent));
        headers.push('Hour');
        rows.push(headers);

        table.querySelectorAll('tbody tr').forEach(tr => {
            const cells = Array.from(tr.querySelectorAll('td'))
                .map(td => escapeCSV(td.textContent));
            cells.push(hour === '00:00' ? `'00:00` : hour);
            rows.push(cells);
        });

        return rows;
    }

    function rowsToCsv(rows) {
        return rows.map(r => r.join(',')).join('\n');
    }

    // ✅ NEW: TSV for proper paste
    function rowsToTSV(rows) {
        return rows.map(r => r.join('\t')).join('\n');
    }

    function downloadCSV(text, filename) {
        const blob = new Blob([text], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
    }

    async function copyText(text) {
        await navigator.clipboard.writeText(text);
    }

    function createButtons() {
        if (document.getElementById('cranes-copy-btn')) return;

        const baseRight = 360;

        const makeBtn = (id, icon, offset, title) => {
            const b = document.createElement('button');
            b.id = id;
            b.innerHTML = `<i class="fa fa-${icon}"></i>`;
            b.title = title;
            Object.assign(b.style, {
                position: 'fixed',
                top: '7px',
                right: (baseRight - offset) + 'px',
                zIndex: 10000
            });
            styleIconButton(b, {});
            document.body.appendChild(b);
            return b;
        };

        const refresh = makeBtn('cranes-refresh-btn', 'refresh', 0, 'Refresh');
        const copy = makeBtn('cranes-copy-btn', 'copy', 44, 'Copy');
        const download = makeBtn('cranes-download-btn', 'download', 88, 'Download');

        refresh.onclick = () => location.reload();

        copy.onclick = async () => {
            const rows = collectTableRows();
            if (!rows) return alert('No table');

            // ✅ TSV instead of CSV
            const tsv = rowsToTSV(rows);
            await copyText(tsv);

            showToast(copy, 'Copied ✓');
        };

        download.onclick = () => {
            const rows = collectTableRows();
            if (!rows) return alert('No table');

            const csv = rowsToCsv(rows);
            const date = new Date().toISOString().split('T')[0];
            downloadCSV(csv, `Cranes_${date}.csv`);
        };
    }

    function autoRefresh() {
        setInterval(() => location.reload(), 5 * 60 * 1000);
    }

    window.addEventListener('load', async () => {
        await delay(1500);
        createButtons();
        autoRefresh();
    });

})();