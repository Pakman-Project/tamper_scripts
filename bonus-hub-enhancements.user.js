// ==UserScript==
// @name         [PAK] PSD - Bonus Hub Enhancements
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  Copy full table (configurable header/footer/apostrophe), cell copy icons, and scroll buttons for Bonus Hub reports
// @author       Pak
// @match        https://pon-wpws27/Whds.Dashboard.Web/bonushub/reports*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/Pak5012/tamper_scripts/main/bonus-hub-enhancements.user.js
// @downloadURL  https://raw.githubusercontent.com/Pak5012/tamper_scripts/main/bonus-hub-enhancements.user.js
// ==/UserScript==

(function () {
    'use strict';

    /*****************************************************************
     * CONFIGURATION
     *****************************************************************/
    const CONFIG = {
        includeHeader: localStorage.getItem('pak_include_header') !== 'false', // Default: true
        includeFooter: localStorage.getItem('pak_include_footer') !== 'false',  // Default: true
        includeApostrophe: localStorage.getItem('pak_include_apostrophe') !== 'false'  // Default: true
    };

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
    .pak-copy-btn {
        margin-top: 0px;
        margin-left: 5px;
        padding: 7px 10px;
        background: #007a7a;
        color: #fff;
        border: 1px solid #b0b0b0;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s ease;
        transform: translateY(2px);
    }

    .pak-copy-btn:hover {
        background: #009999;
        transform: translateY(1px);
        box-shadow: 0 3px 8px rgba(0,0,0,0.3);
    }

    /* Toggle Switches for Header/Footer/Apostrophe */
    .pak-toggle {
        font-size: 10px;
        font-weight: 900;
        padding: 1px 5px;
        border-radius: 3px;
        cursor: pointer;
        user-select: none;
        background-color: #555; /* Disabled color */
        color: #ccc;
        border: 1px solid #777;
        transition: all 0.2s;
    }

    .pak-toggle:hover {
        background-color: #666;
    }

    .pak-toggle.pak-toggle-on {
        background-color: #2e8b57; /* Enabled Green */
        color: #fff;
        border: 1px solid #3cb371;
    }

    /* End Toggle Styles */

    .pak-cell-copy {
        position: absolute;
        right: 6px;
        top: 50%;
        transform: translateY(-50%);
        cursor: pointer;
        font-size: 12px;
        color: #666;
        opacity: 0.6;
        transition: 0.2s ease;
        z-index: 10;
    }

    .pak-cell-copy:hover {
        opacity: 1;
        color: #007a7a;
    }

    td.pak-has-copy {
        position: relative !important;
        padding-right: 22px !important;
    }
`);

    /*****************************************************************
     * ACTIVE TAB CHECK
     *****************************************************************/
    function isCopyIconsAllowed() {
        return !!document.querySelector(
            '[role="tab"][aria-selected="true"][aria-disabled="false"]'
        );
    }

    /*****************************************************************
     * COPY FULL TABLE BUTTON
     *****************************************************************/
    function createCopyTableButton() {
        // Only create if "SET LABELS" button exists
        const setLabelsSpan = [...document.querySelectorAll('span.mdc-button__label')]
            .find(el => el.textContent.trim() === 'SET LABELS');

        if (!setLabelsSpan) return;

        // Check if button already exists
        if (document.getElementById('pak-copy-table-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'pak-copy-table-btn';
        btn.className = 'pak-copy-btn';

        // Initial HTML generation function
        const generateHtml = (isCopied = false) => {
            const icon = isCopied ? '<i class="fa fa-check"></i>' : '<i class="fa fa-copy"></i>';
            const text = isCopied ? 'COPIED' : 'COPY TABLE';

            const hClass = CONFIG.includeHeader ? 'pak-toggle-on' : '';
            const hTitle = CONFIG.includeHeader ? 'Header Copy: ON' : 'Header Copy: OFF';

            const fClass = CONFIG.includeFooter ? 'pak-toggle-on' : '';
            const fTitle = CONFIG.includeFooter ? 'Footer Copy: ON' : 'Footer Copy: OFF';

            const aClass = CONFIG.includeApostrophe ? 'pak-toggle-on' : '';
            const aTitle = CONFIG.includeApostrophe ? 'Apostrophe First Col: ON' : 'Apostrophe First Col: OFF';

            return `
                ${icon} ${text}
                <span id="pak-toggle-h" class="pak-toggle ${hClass}" title="${hTitle}">H</span>
                <span id="pak-toggle-f" class="pak-toggle ${fClass}" title="${fTitle}">F</span>
                <span id="pak-toggle-a" class="pak-toggle ${aClass}" title="${aTitle}">'</span>
            `;
        };

        btn.innerHTML = generateHtml();

        // Copy Event Listener
        btn.addEventListener('click', (e) => {
            // Check if user clicked a toggle instead of main button
            if (e.target.classList.contains('pak-toggle')) return;

            copyTable(btn);

            // Update UI to show "COPIED" state without breaking toggles
            btn.innerHTML = generateHtml(true);

            setTimeout(() => {
                btn.innerHTML = generateHtml(false);
                // Re-attach click listeners to the new DOM elements for toggles
                attachToggleListeners();
            }, 1500);
        });

        // Helper to attach listeners to toggles
        function attachToggleListeners() {
            // Use btn.querySelector instead of document.getElementById
            const toggleH = btn.querySelector('#pak-toggle-h');
            const toggleF = btn.querySelector('#pak-toggle-f');
            const toggleA = btn.querySelector('#pak-toggle-a');

            if (toggleH) {
                toggleH.addEventListener('click', (e) => {
                    e.stopPropagation();
                    CONFIG.includeHeader = !CONFIG.includeHeader;
                    localStorage.setItem('pak_include_header', CONFIG.includeHeader);
                    updateToggleUI();
                });
            }

            if (toggleF) {
                toggleF.addEventListener('click', (e) => {
                    e.stopPropagation();
                    CONFIG.includeFooter = !CONFIG.includeFooter;
                    localStorage.setItem('pak_include_footer', CONFIG.includeFooter);
                    updateToggleUI();
                });
            }

            if (toggleA) {
                toggleA.addEventListener('click', (e) => {
                    e.stopPropagation();
                    CONFIG.includeApostrophe = !CONFIG.includeApostrophe;
                    localStorage.setItem('pak_include_apostrophe', CONFIG.includeApostrophe);
                    updateToggleUI();
                });
            }
        }

        // Update UI function
        function updateToggleUI() {
            // Use btn.querySelector instead of document.getElementById
            const toggleH = btn.querySelector('#pak-toggle-h');
            const toggleF = btn.querySelector('#pak-toggle-f');
            const toggleA = btn.querySelector('#pak-toggle-a');

            if (toggleH) {
                if (CONFIG.includeHeader) {
                    toggleH.classList.add('pak-toggle-on');
                    toggleH.title = 'Header Copy: ON';
                } else {
                    toggleH.classList.remove('pak-toggle-on');
                    toggleH.title = 'Header Copy: OFF';
                }
            }

            if (toggleF) {
                if (CONFIG.includeFooter) {
                    toggleF.classList.add('pak-toggle-on');
                    toggleF.title = 'Footer Copy: ON';
                } else {
                    toggleF.classList.remove('pak-toggle-on');
                    toggleF.title = 'Footer Copy: OFF';
                }
            }

            if (toggleA) {
                if (CONFIG.includeApostrophe) {
                    toggleA.classList.add('pak-toggle-on');
                    toggleA.title = 'Apostrophe First Col: ON';
                } else {
                    toggleA.classList.remove('pak-toggle-on');
                    toggleA.title = 'Apostrophe First Col: OFF';
                }
            }
        }

        // Initial attachment
        attachToggleListeners();

        const setLabelsBtn = setLabelsSpan.closest('button');
        setLabelsBtn.parentNode.insertBefore(btn, setLabelsBtn.nextSibling);
    }

    function copyTable(btn) {
        const table = document.querySelector('table.mat-mdc-table');
        if (!table) return;

        const output = [];

        // Check headers to see if first column is "Bonus" (for apostrophe logic)
        const headerCells = table.querySelectorAll('tr.mat-mdc-header-row th');
        const firstHeader = headerCells[0] ? headerCells[0].innerText.trim() : '';
        const isBonusColumn = firstHeader === 'Bonus';

        // 1. Copy Headers (thead) - Optional
        if (CONFIG.includeHeader) {
            const headerRows = table.querySelectorAll('tr.mat-mdc-header-row');
            headerRows.forEach(row => {
                const cells = row.querySelectorAll('th');
                const rowData = Array.from(cells).map(c => c.innerText.trim());
                output.push(rowData.join('\t'));
            });
        }

        // 2. Copy Body Rows (tbody) - Always included
        const bodyRows = table.querySelectorAll('tr.mat-mdc-row');
        bodyRows.forEach(row => {
            const cells = row.querySelectorAll('td');
            const rowData = Array.from(cells).map((cell, index) => {
                let value = cell.innerText.trim();
                if (index === 0 && CONFIG.includeApostrophe && isBonusColumn && value !== '') {
                    value = "'" + value;
                }
                return value;
            });
            output.push(rowData.join('\t'));
        });

        // 3. Copy Footers (tfoot) - Optional
        if (CONFIG.includeFooter) {
            const footerRows = table.querySelectorAll('tr.mat-mdc-footer-row');
            footerRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                const rowData = Array.from(cells).map((cell, index) => {
                    let value = cell.innerText.trim();
                    // Apply apostrophe to footer first column as well, just in case
                    if (index === 0 && CONFIG.includeApostrophe && isBonusColumn && value !== '') {
                        value = "'" + value;
                    }
                    return value;
                });
                output.push(rowData.join('\t'));
            });
        }

        GM_setClipboard(output.join('\n'));
    }

    /*****************************************************************
     * CELL COPY ICONS
     * - only when active tab is selected + enabled
     * - skip first column
     * - remove icons when not allowed
     *****************************************************************/
    function removeCellCopyIcon(cell) {
        const icon = cell.querySelector(':scope > i.pak-cell-copy');
        if (icon) icon.remove();
        cell.classList.remove('pak-has-copy');
        delete cell.dataset.pakCopyReady;
    }

    function addCellCopyIcon(cell) {
        if (cell.dataset.pakCopyReady === "1") return;

        cell.dataset.pakCopyReady = "1";
        cell.classList.add('pak-has-copy');

        const icon = document.createElement('i');
        icon.className = 'fa fa-copy pak-cell-copy';

        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();

            GM_setClipboard(cell.innerText.trim());

            icon.className = 'fa fa-check pak-cell-copy';
            icon.style.color = '#007a7a';

            setTimeout(() => {
                icon.className = 'fa fa-copy pak-cell-copy';
                icon.style.color = '#666';
            }, 1000);
        });

        cell.appendChild(icon);
    }

    function syncCellCopyIcons() {
        const table = document.querySelector('table.mat-mdc-table');
        if (!table) return;

        const allowed = isCopyIconsAllowed();

        // Use all table rows that actually contain cells
        const rows = table.querySelectorAll('tbody tr, tr.mat-mdc-row, tr.mat-mdc-footer-row');

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (!cells.length) return;

            cells.forEach((cell, index) => {
                if (index === 0) {
                    removeCellCopyIcon(cell);
                    return;
                }

                if (!allowed) {
                    removeCellCopyIcon(cell);
                    return;
                }

                addCellCopyIcon(cell);
            });
        });
    }

    /*****************************************************************
     * SCROLL BUTTONS
     *****************************************************************/
    function waitForContainer(callback) {
        function find() {
            return document.querySelector('mat-drawer-content, .mat-drawer-content');
        }

        const el = find();
        if (el) return callback(el);

        const observer = new MutationObserver(() => {
            const el = find();
            if (el) {
                observer.disconnect();
                callback(el);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    waitForContainer((container) => {
        if (document.getElementById('pak-scroll-top')) return;

        function createButton(id, label, bottomOffset, onClick) {
            const btn = document.createElement('button');
            btn.id = id;
            btn.textContent = label;

            Object.assign(btn.style, {
                position: 'fixed',
                bottom: bottomOffset + 'px',
                right: '20px',
                zIndex: 1000,
                padding: '10px 16px',
                border: 'none',
                borderRadius: '5px',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                color: 'white',
                fontSize: '14px',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                transition: 'background-color 0.3s ease',
                display: 'none'
            });

            btn.onmouseenter = () => btn.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            btn.onmouseleave = () => btn.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            btn.onclick = onClick;

            document.body.appendChild(btn);
            return btn;
        }

        const topBtn = createButton(
            'pak-scroll-top',
            '↑',
            65,
            () => container.scrollTo({ top: 0, behavior: 'smooth' })
        );

        const bottomBtn = createButton(
            'pak-scroll-bottom',
            '↓',
            20,
            () => container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
        );

        function updateVisibility() {
            const hasScroll = container.scrollHeight > container.clientHeight;
            const display = hasScroll ? 'block' : 'none';

            topBtn.style.display = display;
            bottomBtn.style.display = display;
        }

        new ResizeObserver(updateVisibility).observe(container);
        new MutationObserver(updateVisibility).observe(container, {
            childList: true,
            subtree: true
        });

        updateVisibility();
    });

    /*****************************************************************
     * INIT / ANGULAR RECHECKS
     *****************************************************************/
    function init() {
        createCopyTableButton();
        syncCellCopyIcons();
    }

    window.addEventListener('load', () => {
        setTimeout(init, 300);

        setInterval(() => {
            createCopyTableButton();
            syncCellCopyIcons();
        }, 1500);
    });

})();
