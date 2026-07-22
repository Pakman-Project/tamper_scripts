// ==UserScript==
// @name         [PAK] Intake Productivity - Elmsall 3 Completed Row
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  Finds Elmsall 3 table, collects last-Saturday-to-last-Saturday Completed rows via datepicker, displays as overlay below navbar
// @author       Pak
// @match        https://pon-wpws27/Whds.Dashboard.Web/intake/productivity*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20Intake%20Productivity%20-%20Elmsall%203%20Completed%20Row.user.js
// @downloadURL  https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20Intake%20Productivity%20-%20Elmsall%203%20Completed%20Row.user.js
// ==/UserScript==

(function () {
    'use strict';

    /*****************************************************************
     * CONFIGURATION
     *****************************************************************/
    const CONFIG = {
        isExpanded: localStorage.getItem('pak_elmsall3_expanded') !== 'false'
    };

    let collectedData = [];
    let isCollecting = false;

    const HOURS = [
        '06:00','07:00','08:00','09:00','10:00','11:00',
        '12:00','13:00','14:00','15:00','16:00','17:00',
        '18:00','19:00','20:00','21:00','22:00','23:00',
        '00:00','01:00','02:00','03:00','04:00','05:00'
    ];

    /*****************************************************************
     * FONT AWESOME
     *****************************************************************/
    const fa = document.createElement('link');
    fa.rel = 'stylesheet';
    fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css';
    document.head.appendChild(fa);

    /*****************************************************************
     * STYLES
     *****************************************************************/
    GM_addStyle(`
    .pak-loading-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        z-index: 999999;
        background: rgba(0, 0, 0, 0.88);
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .pak-loading-spinner {
        width: 56px; height: 56px;
        border: 4px solid rgba(46, 139, 87, 0.2);
        border-top: 4px solid #2e8b57;
        border-radius: 50%;
        animation: pak-spin 0.8s linear infinite;
        margin-bottom: 28px;
    }
    @keyframes pak-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    .pak-loading-title { color: #fff; font-size: 18px; font-weight: 600; margin-bottom: 10px; }
    .pak-loading-subtitle { color: #2e8b57; font-size: 15px; font-weight: 500; margin-bottom: 20px; }
    .pak-loading-bar-wrap {
        width: 240px; height: 6px;
        background: rgba(255,255,255,0.08);
        border-radius: 3px; overflow: hidden;
    }
    .pak-loading-bar-fill {
        height: 100%; background: linear-gradient(90deg, #2e8b57, #3cb371);
        border-radius: 3px; transition: width 0.4s ease;
    }
    .pak-loading-hint { color: #666; font-size: 12px; margin-top: 16px; }

    /* Main Bar */
    .pak-completed-bar {
        position: fixed;
        left: 0; right: 0;
        z-index: 9999;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-bottom: 2px solid #2e8b57;
        padding: 10px 15px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.6);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .pak-bar-label {
        color: #2e8b57; font-size: 11px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.5px;
        white-space: pre-line;
        background: rgba(46, 139, 87, 0.12);
        padding: 6px 10px; border-radius: 4px;
        border: 1px solid rgba(46, 139, 87, 0.25);
        line-height: 1.4;
        text-align: center;
        flex-shrink: 0;
        margin-top: 1px;
    }
    .pak-bar-data {
        display: flex; flex-direction: column;
        overflow-y: auto; flex: 1;
        max-height: 260px;
        scrollbar-width: thin;
        scrollbar-color: #444 transparent;
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 4px;
        background: rgba(0,0,0,0.15);
    }
    .pak-bar-data::-webkit-scrollbar { width: 4px; }
    .pak-bar-data::-webkit-scrollbar-track { background: transparent; }
    .pak-bar-data::-webkit-scrollbar-thumb { background: #444; border-radius: 2px; }

    /* Rows */
    .pak-bar-row {
        display: flex; align-items: center;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        transition: background 0.15s;
    }
    .pak-bar-row:last-child { border-bottom: none; }
    .pak-bar-row:nth-child(even) { background: rgba(255,255,255,0.015); }
    .pak-bar-row:hover { background: rgba(46, 139, 87, 0.06); }
    .pak-bar-row.pak-no-data { opacity: 0.35; }

    /* Header Row */
    .pak-header-row {
        background: rgba(46, 139, 87, 0.08) !important;
        position: sticky;
        top: 0;
        z-index: 2;
        border-bottom: 1px solid rgba(46, 139, 87, 0.3) !important;
    }
    .pak-header-cell {
        color: #7a9aaa !important;
        font-size: 10px !important;
        font-weight: 600 !important;
        text-align: center !important;
        letter-spacing: 0.2px;
    }

    /* Cells */
    .pak-bar-cell {
        color: #ccc; font-size: 12px;
        padding: 5px 8px; white-space: nowrap;
        border-right: 1px solid rgba(255,255,255,0.07);
        width: 54px; flex: none; text-align: right;
        box-sizing: border-box; overflow: hidden; text-overflow: ellipsis;
    }
    .pak-bar-cell.pak-date-cell {
        color: #7a8fa0; font-weight: 600; text-align: center;
        width: 80px; border-right: 1px solid rgba(255,255,255,0.12);
        font-size: 11px; letter-spacing: 0.3px;
    }
    .pak-bar-cell.pak-time-cell {
        width: 80px; text-align: center; color: #8a9aaa;
    }
    .pak-bar-cell.pak-total-cell {
        color: #2e8b57; font-weight: 700; width: 62px;
        border-right: none; background: rgba(46, 139, 87, 0.06);
    }
    .pak-bar-cell.pak-no-data-cell {
        color: #555; font-style: italic; flex: 1; text-align: left; width: auto;
    }

    /* Per-row copy */
    .pak-row-copy {
        width: 28px; flex: none; background: none; border: none;
        color: #444; cursor: pointer; font-size: 10px; padding: 5px 0;
        text-align: center; transition: all 0.15s;
        display: flex; align-items: center; justify-content: center;
        border-left: 1px solid rgba(255,255,255,0.05);
    }
    .pak-row-copy:hover { color: #2e8b57; background: rgba(46,139,87,0.1); }
    .pak-row-copy.pak-row-copied { color: #3cb371; }

    /* Action Stack */
    .pak-action-stack {
        display: flex; flex-direction: column;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 4px; overflow: hidden;
        flex-shrink: 0; margin-top: 1px;
        background: rgba(0,0,0,0.2);
    }
    .pak-stack-btn {
        width: 32px; height: 32px;
        background: transparent; color: #777;
        border: none; border-bottom: 1px solid rgba(255,255,255,0.06);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: 700; transition: all 0.15s;
    }
    .pak-stack-btn:last-child { border-bottom: none; }
    .pak-stack-btn:hover { background: rgba(46, 139, 87, 0.15); color: #3cb371; }
    .pak-stack-btn.spinning i { animation: pak-spin 1s linear infinite; }
    .pak-stack-btn.pak-copied { color: #3cb371; }

    /* Shrunk State */
    .pak-completed-bar.pak-shrunk {
        left: auto; right: 0; width: auto; padding: 0;
        border-bottom: none; border-left: 2px solid #2e8b57;
        border-radius: 0 0 0 10px; overflow: hidden;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }
    .pak-completed-bar.pak-shrunk > *:not(.pak-expand-btn) {
        display: none !important;
    }
    .pak-expand-btn {
        display: none;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        color: #2e8b57; border: none;
        padding: 14px 10px; cursor: pointer;
        font-size: 15px; border-radius: 0 0 0 10px;
        transition: all 0.2s;
    }
    .pak-expand-btn:hover {
        color: #3cb371;
        background: linear-gradient(135deg, #1a1a2e 0%, #1e2a50 100%);
        padding-left: 14px;
    }
    .pak-completed-bar.pak-shrunk .pak-expand-btn {
        display: flex; align-items: center; justify-content: center;
    }
`);

    /*****************************************************************
     * UTILITY
     *****************************************************************/
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    function formatDateShort(date) {
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    }
    function formatDateFull(date) {
        return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    }

    /*****************************************************************
     * SATURDAY RANGE CALCULATOR
     *****************************************************************/
    function getSaturdayRange() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dow = today.getDay(); // 0=Sun, 1=Mon ... 6=Sat

        // "last Saturday" = most recent Saturday before today
        const lastSaturday = new Date(today);
        const offset = (dow + 1) % 7 || 7;
        lastSaturday.setDate(today.getDate() - offset);

        // "last last Saturday" = the Saturday before that
        const lastLastSaturday = new Date(lastSaturday);
        lastLastSaturday.setDate(lastSaturday.getDate() - 7);

        return { from: lastLastSaturday, to: lastSaturday };
    }

    /*****************************************************************
     * FIND HOURLY SUMMARY TAB
     *****************************************************************/
    function findHourlySummaryTab() {
        const tabs = document.querySelectorAll('div[role="tab"]');
        for (const tab of tabs) {
            const label = tab.querySelector('.mdc-tab__text-label');
            if (label && label.innerText.trim() === 'HOURLY SUMMARY') return tab;
        }
        return null;
    }

    /*****************************************************************
     * LOADING OVERLAY
     *****************************************************************/
    function showLoadingOverlay(title, subtitle, percent) {
        let overlay = document.getElementById('pak-loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'pak-loading-overlay';
            overlay.className = 'pak-loading-overlay';
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = `
            <div class="pak-loading-spinner"></div>
            <div class="pak-loading-title">${title}</div>
            <div class="pak-loading-subtitle">${subtitle}</div>
            <div class="pak-loading-bar-wrap">
                <div class="pak-loading-bar-fill" style="width: ${percent}%"></div>
            </div>
            <div class="pak-loading-hint">Please wait — do not interact with the page</div>
        `;
        overlay.style.display = 'flex';
    }
    function hideLoadingOverlay() {
        const overlay = document.getElementById('pak-loading-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    /*****************************************************************
     * BAR POSITIONING
     *****************************************************************/
    function updateBarPosition() {
        const navbar = document.querySelector('nav.navbar-wrapper');
        const bar = document.getElementById('pak-completed-bar');
        if (navbar && bar && !bar.classList.contains('pak-shrunk')) {
            bar.style.top = `${navbar.getBoundingClientRect().height}px`;
        }
    }

    /*****************************************************************
     * FIND ELMSELL 3 COMPLETED ROW
     *****************************************************************/
    function findElmsall3CompletedRow() {
        const headers = document.querySelectorAll('div.table-header h5.h5-next');
        let targetHeader = null;
        for (const header of headers) {
            if (header.innerText.trim() === 'Elmsall 3') { targetHeader = header; break; }
        }
        if (!targetHeader) return null;
        const headerContainer = targetHeader.closest('div.table-header');
        if (!headerContainer) return null;
        const tableWrapper = headerContainer.parentElement;
        if (!tableWrapper) return null;
        const table = tableWrapper.querySelector('table.mat-mdc-table');
        if (!table) return null;
        const rows = table.querySelectorAll('tr.mat-mdc-row');
        for (const row of rows) {
            const timeCell = row.querySelector('td.cdk-column-Time');
            if (timeCell && timeCell.innerText.trim() === 'Completed') return row;
        }
        return null;
    }

    function extractRowData(row) {
        const cells = row.querySelectorAll('td');
        const data = [];
        cells.forEach(cell => data.push(cell.innerText.trim()));
        return data;
    }

    /*****************************************************************
     * DATEPICKER INTERACTION
     *****************************************************************/
    function parseMonthYear(text) {
        const months = [
            'JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC',
            'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
            'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'
        ];
        const parts = text.toUpperCase().trim().split(/[\s,]+/);
        if (parts.length >= 2) {
            const monthIdx = months.indexOf(parts[0]);
            const year = parseInt(parts[parts.length - 1]);
            if (monthIdx !== -1 && !isNaN(year)) return { month: monthIdx % 12, year };
        }
        return null;
    }

    async function closeCalendarIfOpen() {
        const backdrop = document.querySelector('.cdk-overlay-backdrop');
        if (backdrop) { backdrop.click(); await sleep(250); }
    }

    async function navigateCalendarToMonth(targetMonth, targetYear) {
        const calendar = document.querySelector('.mat-calendar');
        if (!calendar) return false;
        const periodBtn = calendar.querySelector('.mat-calendar-period-button');
        if (!periodBtn) return false;
        let current = parseMonthYear(periodBtn.textContent);
        if (!current) return false;
        const prevBtn = calendar.querySelector('.mat-calendar-previous-button');
        const nextBtn = calendar.querySelector('.mat-calendar-next-button');
        let attempts = 0;
        while (attempts < 30) {
            attempts++;
            let diff = (targetYear - current.year) * 12 + (targetMonth - current.month);
            if (diff === 0) return true;
            if (diff < 0 && prevBtn) { prevBtn.click(); await sleep(120); }
            else if (diff > 0 && nextBtn) { nextBtn.click(); await sleep(120); }
            else break;
            current = parseMonthYear(periodBtn.textContent);
            if (!current) break;
        }
        return false;
    }

    async function selectDateInCalendar(targetDate) {
        const toggle = document.querySelector('mat-datepicker-toggle button');
        if (!toggle) return false;
        await closeCalendarIfOpen();
        await sleep(200);
        toggle.click();
        await sleep(450);
        const calendar = document.querySelector('.mat-calendar');
        if (!calendar) return false;
        await navigateCalendarToMonth(targetDate.getMonth(), targetDate.getFullYear());
        await sleep(250);
        const targetDay = targetDate.getDate().toString();
        const cells = calendar.querySelectorAll('.mat-calendar-body-cell');
        for (const cell of cells) {
            if (cell.textContent.trim() === targetDay && !cell.classList.contains('mat-calendar-body-disabled')) {
                cell.click();
                await sleep(350);
                return true;
            }
        }
        return false;
    }

    /*****************************************************************
     * COLLECT SATURDAY-TO-SATURDAY RANGE
     *****************************************************************/
    async function collectSaturdayRange() {
        if (isCollecting) return collectedData;
        isCollecting = true;
        collectedData = [];

        const { from, to } = getSaturdayRange();
        const totalDays = Math.round((to - from) / (1000 * 60 * 60 * 24)) + 1;

        showLoadingOverlay(
            'Collecting Elmsall 3 Data',
            `${formatDateShort(from)} — ${formatDateShort(to)}  (${totalDays} days)`,
            0
        );
        await sleep(600);

        for (let i = 0; i < totalDays; i++) {
            const targetDate = new Date(from);
            targetDate.setDate(from.getDate() + i);

            const pct = Math.round(((i + 1) / totalDays) * 100);

            showLoadingOverlay(
                'Collecting Elmsall 3 Data',
                `${formatDateFull(targetDate)}  —  Day ${i + 1} of ${totalDays}`,
                pct
            );

            const opened = await selectDateInCalendar(targetDate);
            if (opened) { await sleep(1800); } else { await sleep(500); }

            const row = findElmsall3CompletedRow();
            collectedData.push({
                date: new Date(targetDate),
                data: row ? extractRowData(row) : null
            });
        }

        hideLoadingOverlay();
        isCollecting = false;

        // Return to today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        try { await selectDateInCalendar(today); } catch (e) {}

        return collectedData;
    }

    /*****************************************************************
     * BUILD DATA CELLS HTML
     *****************************************************************/
    function buildRowCells(dayData) {
        if (!dayData.data) {
            return '<span class="pak-bar-cell pak-no-data-cell">No data available</span>';
        }
        const fragments = [];
        fragments.push(`<span class="pak-bar-cell pak-time-cell">${dayData.data[0]}</span>`);
        for (let i = 1; i < dayData.data.length - 1; i++) {
            fragments.push(`<span class="pak-bar-cell">${dayData.data[i]}</span>`);
        }
        if (dayData.data.length > 1) {
            fragments.push(`<span class="pak-bar-cell pak-total-cell">${dayData.data[dayData.data.length - 1]}</span>`);
        }
        return fragments.join('');
    }

    /*****************************************************************
     * COPY TEXT — excludes Date, Time, Summary; only 24 hourly figures
     *****************************************************************/
    function getRowCopyText(dayData) {
        if (!dayData.data || dayData.data.length < 3) return '';
        const parts = [];
        for (let i = 1; i < dayData.data.length - 1; i++) {
            parts.push(dayData.data[i]);
        }
        return parts.join('\t');
    }

    /*****************************************************************
     * CREATE DISPLAY BAR
     *****************************************************************/
    function createDisplayBar() {
        removeDisplayBar();

        const bar = document.createElement('div');
        bar.id = 'pak-completed-bar';
        bar.className = 'pak-completed-bar' + (CONFIG.isExpanded ? '' : ' pak-shrunk');

        // Label
        const label = document.createElement('span');
        label.className = 'pak-bar-label';
        label.textContent = 'Elmsall 3';
        bar.appendChild(label);

        // Data container
        const dataContainer = document.createElement('div');
        dataContainer.className = 'pak-bar-data';

        // --- Header Row ---
        const headerRow = document.createElement('div');
        headerRow.className = 'pak-bar-row pak-header-row';

        const emptyDate = document.createElement('span');
        emptyDate.className = 'pak-bar-cell pak-date-cell pak-header-cell';
        headerRow.appendChild(emptyDate);

        const timeH = document.createElement('span');
        timeH.className = 'pak-bar-cell pak-time-cell pak-header-cell';
        timeH.textContent = 'Time';
        headerRow.appendChild(timeH);

        HOURS.forEach(h => {
            const c = document.createElement('span');
            c.className = 'pak-bar-cell pak-header-cell';
            c.textContent = h;
            headerRow.appendChild(c);
        });

        const sumH = document.createElement('span');
        sumH.className = 'pak-bar-cell pak-total-cell pak-header-cell';
        sumH.textContent = 'Sum';
        headerRow.appendChild(sumH);

        const emptyCopy = document.createElement('span');
        emptyCopy.className = 'pak-row-copy pak-header-cell';
        headerRow.appendChild(emptyCopy);

        dataContainer.appendChild(headerRow);

        // --- Data Rows ---
        collectedData.forEach((dayData) => {
            const row = document.createElement('div');
            row.className = 'pak-bar-row' + (dayData.data ? '' : ' pak-no-data');

            const dateCell = document.createElement('span');
            dateCell.className = 'pak-bar-cell pak-date-cell';
            dateCell.textContent = formatDateShort(dayData.date);
            row.appendChild(dateCell);

            row.insertAdjacentHTML('beforeend', buildRowCells(dayData));

            const rowCopyBtn = document.createElement('button');
            rowCopyBtn.className = 'pak-row-copy';
            rowCopyBtn.title = 'Copy hourly figures';
            rowCopyBtn.innerHTML = '<i class="fa fa-copy"></i>';
            rowCopyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const txt = getRowCopyText(dayData);
                if (!txt) return;
                GM_setClipboard(txt);
                rowCopyBtn.innerHTML = '<i class="fa fa-check"></i>';
                rowCopyBtn.classList.add('pak-row-copied');
                setTimeout(() => {
                    rowCopyBtn.innerHTML = '<i class="fa fa-copy"></i>';
                    rowCopyBtn.classList.remove('pak-row-copied');
                }, 1500);
            });
            row.appendChild(rowCopyBtn);
            dataContainer.appendChild(row);
        });
        bar.appendChild(dataContainer);

        // --- Vertical Action Stack ---
        const actionStack = document.createElement('div');
        actionStack.className = 'pak-action-stack';
        actionStack.innerHTML = `
            <button id="pak-elmsall-refresh" class="pak-stack-btn" title="Re-collect data"><i class="fa fa-sync-alt"></i></button>
            <button id="pak-elmsall-copy-all" class="pak-stack-btn" title="Copy all hourly figures"><i class="fa fa-clipboard-list"></i></button>
            <button id="pak-elmsall-close" class="pak-stack-btn" title="Minimize to side"><i class="fa fa-chevron-right"></i></button>
        `;
        bar.appendChild(actionStack);

        // Expand button (shrunk state)
        const expandBtn = document.createElement('button');
        expandBtn.className = 'pak-expand-btn';
        expandBtn.innerHTML = '<i class="fa fa-chevron-left"></i>';
        expandBtn.title = 'Expand bar';
        expandBtn.addEventListener('click', () => {
            bar.classList.remove('pak-shrunk');
            CONFIG.isExpanded = true;
            localStorage.setItem('pak_elmsall3_expanded', 'true');
            requestAnimationFrame(() => updateBarPosition());
        });
        bar.appendChild(expandBtn);

        document.body.appendChild(bar);
        updateBarPosition();

        // --- Listeners ---
        actionStack.querySelector('#pak-elmsall-refresh').addEventListener('click', async function() {
            this.classList.add('spinning');
            await collectSaturdayRange();
            this.classList.remove('spinning');
            createDisplayBar();
        });

        actionStack.querySelector('#pak-elmsall-copy-all').addEventListener('click', function() {
            let text = '';
            collectedData.forEach(dayData => {
                const txt = getRowCopyText(dayData);
                if (txt) text += txt + '\n';
            });
            if (!text.trim()) return;
            GM_setClipboard(text.trim());
            this.innerHTML = '<i class="fa fa-check"></i>';
            this.classList.add('pak-copied');
            setTimeout(() => {
                this.innerHTML = '<i class="fa fa-clipboard-list"></i>';
                this.classList.remove('pak-copied');
            }, 2000);
        });

        actionStack.querySelector('#pak-elmsall-close').addEventListener('click', () => {
            bar.classList.add('pak-shrunk');
            CONFIG.isExpanded = false;
            localStorage.setItem('pak_elmsall3_expanded', 'false');
        });
    }

    function removeDisplayBar() {
        const bar = document.getElementById('pak-completed-bar');
        if (bar) bar.remove();
    }

    /*****************************************************************
     * INIT — waits for Hourly Summary tab
     *****************************************************************/
    window.addEventListener('load', async () => {
        await sleep(2000);

        let tab = findHourlySummaryTab();
        let pollAttempts = 0;
        while (!tab && pollAttempts < 20) {
            await sleep(300);
            tab = findHourlySummaryTab();
            pollAttempts++;
        }

        if (!tab) {
            console.warn('[PAK] Hourly Summary tab not found.');
            return;
        }

        if (tab.getAttribute('aria-selected') === 'true') {
            await collectSaturdayRange();
            createDisplayBar();
            window.addEventListener('resize', updateBarPosition);
            return;
        }

        console.log('[PAK] Waiting for Hourly Summary tab to be selected...');
        const observer = new MutationObserver(async (mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'aria-selected') {
                    if (tab.getAttribute('aria-selected') === 'true') {
                        observer.disconnect();
                        await collectSaturdayRange();
                        createDisplayBar();
                        window.addEventListener('resize', updateBarPosition);
                    }
                }
            }
        });
        observer.observe(tab, { attributes: true, attributeFilter: ['aria-selected'] });
    });

})();