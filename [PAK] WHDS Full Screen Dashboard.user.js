// ==UserScript==
// @name         [PAK] WHDS Full Screen Dashboard
// @namespace    http://tampermonkey.net/
// @version      3.6
// @description  Added color dots to stacked bar legends. Combined card view for bars.
// @author       Pak
// @match        http://whds-batchoverviewprogress:8087/Batch/ProgressOverview
// @match        http://pon-wdws21:8087/Modern/Batch/ProgressOverview
// @match        http://whds-batchoverviewprogress:8087/Batch/ProgressOverview#
// @grant        none
// @updateURL    https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20WHDS%20Full%20Screen%20Dashboard.user.js
// @downloadURL  https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20WHDS%20Full%20Screen%20Dashboard.user.js
// ==/UserScript==

(function() {
    'use strict';

    // State
    let pakActiveFilter = null;
    let pakViewMode = localStorage.getItem('pakDashViewMode') || 'pie';

    // Color Map
    const pakColorMap = {
        'done': '#28a745',
        'allocated': '#ffc107',
        'outstanding': '#dc3545',
        'held': '#17a2b8',
        'info': '#007bff'
    };

    // --- CSS ---
    const pakStyle = document.createElement('style');
    pakStyle.innerHTML = `
        /* When TV Mode is active, hide the original aisles container */
        body.pak-tv-mode #aisles {
            display: none !important;
        }

        #pak-tv-dashboard {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background-color: #181818;
            color: #ffffff;
            z-index: 999999;
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            display: none;
            flex-direction: column;
            overflow: hidden;
        }

        .pak-tv-header {
            height: 50px;
            background-color: #252525;
            border-bottom: 2px solid #333;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            flex-shrink: 0;
            box-shadow: 0 2px 5px rgba(0,0,0,0.5);
        }

        .pak-tv-title-group {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .pak-tv-title {
            font-size: 20px;
            font-weight: bold;
            color: #00d2ff;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .pak-tv-filter-label {
            font-size: 14px;
            color: #ffc107;
            display: none;
        }

        .pak-tv-controls {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        /* Toggle Switch */
        .pak-switch {
            position: relative;
            display: inline-block;
            width: 34px;
            height: 20px;
        }
        .pak-switch input { opacity: 0; width: 0; height: 0; }
        .pak-slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: #444;
            transition: .4s;
            border: 1px solid #666;
            border-radius: 20px;
        }
        .pak-slider:before {
            position: absolute;
            content: "";
            height: 14px;
            width: 14px;
            left: 2px;
            bottom: 2px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        input:checked + .pak-slider { background-color: #00d2ff; border-color: #00d2ff; }
        input:checked + .pak-slider:before { transform: translateX(14px); }

        .pak-toggle-labels {
            font-size: 10px;
            color: #aaa;
            display: flex;
            gap: 5px;
            align-items: center;
        }

        .pak-tv-meta {
            font-size: 13px;
            color: #bbb;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        /* Grid Container */
        .pak-tv-grid-container {
            flex-grow: 1;
            padding: 10px;
            overflow: hidden;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            grid-auto-rows: 1fr;
            gap: 10px;
            align-items: stretch;
        }

        /* Batch Card */
        .pak-tv-batch-card {
            background-color: #222;
            border: 1px solid #444;
            border-radius: 6px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.4);
        }

        /* MASTER CARD (For Bar View) */
        .pak-tv-master-card {
            grid-column: 1 / -1;
            border-color: #00d2ff;
            background-color: #1a252a;
        }

        .pak-tv-batch-card.pak-totals-card {
            border: 1px solid #00d2ff;
            background-color: #1a252a;
        }

        .pak-tv-batch-card.pak-totals-card .pak-tv-card-header {
            background-color: #003344;
            color: #00d2ff;
        }

        .pak-tv-card-header {
            background-color: #2a2a2a;
            padding: 8px 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #444;
        }

        .pak-tv-batch-num {
            font-size: 18px;
            font-weight: 800;
            color: #fff;
        }

        .pak-tv-batch-time {
            font-size: 11px;
            color: #888;
            text-align: right;
        }

        .pak-tv-card-body {
            padding: 10px;
            flex-grow: 1;
            overflow-y: auto;
            font-size: 11px;
            display: flex;
            flex-direction: column;
        }

        .pak-tv-card-body::-webkit-scrollbar { width: 4px; }
        .pak-tv-card-body::-webkit-scrollbar-thumb { background: #555; border-radius: 2px; }

        /* --- TABLE ROW LAYOUT --- */
        .pak-tv-table-row {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
            border-bottom: 1px solid #333;
            padding-bottom: 8px;
        }

        .pak-tv-col-num {
            width: 80px;
            flex-shrink: 0;
            font-weight: bold;
            color: #fff;
            text-align: left;
        }

        .pak-tv-col-time {
            width: 100px;
            flex-shrink: 0;
            font-size: 10px;
            color: #aaa;
            text-align: left;
        }

        .pak-tv-col-bar {
            flex-grow: 1;
            height: 25px;
            background-color: #111;
            border-radius: 4px;
            overflow: hidden;
            display: flex;
        }

        .pak-tv-segment {
            height: 100%;
            transition: width 0.3s ease;
            cursor: help;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .pak-tv-segment span {
            font-size: 10px;
            color: #fff;
            white-space: nowrap;
            z-index: 2;
            text-shadow: 1px 1px 2px #000;
            padding: 0 2px;
            overflow: hidden;
            text-overflow: clip;
        }

        .pak-tv-segment.done { background-color: #28a745; }
        .pak-tv-segment.allocated { background-color: #ffc107; color: #000; }
        .pak-tv-segment.allocated span { text-shadow: none; color: #000; }
        .pak-tv-segment.outstanding { background-color: #dc3545; }
        .pak-tv-segment.held { background-color: #17a2b8; }
        .pak-tv-segment.info { background-color: #007bff; }

        /* Standard Area Row */
        .pak-tv-area-row {
            display: flex;
            align-items: center;
            margin-bottom: 5px;
            height: 18px;
            width: 100%;
        }

        .pak-tv-area-name {
            width: 75px;
            flex-shrink: 0;
            font-weight: 600;
            color: #ddd;
            text-align: right;
            padding-right: 8px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 10px;
            text-transform: uppercase;
            cursor: pointer;
            transition: color 0.2s;
        }

        .pak-tv-area-name:hover { color: #fff; }
        .pak-tv-area-name.active-filter { color: #00d2ff; text-decoration: underline; }

        .pak-tv-bar-container {
            flex-grow: 1;
            height: 100%;
            background-color: #111;
            border-radius: 3px;
            position: relative;
            overflow: hidden;
            display: flex;
        }

        .pak-tv-bar-text {
            position: absolute;
            left: 4px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 9px;
            color: #fff;
            text-shadow: 1px 1px 2px #000;
            white-space: nowrap;
            pointer-events: none;
            z-index: 2;
        }

        /* Pie Chart Styles */
        .pak-tv-pie-wrapper {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
        }

        .pak-tv-pie-chart {
            width: 180px;
            height: 180px;
            border-radius: 50%;
            position: relative;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
            flex-shrink: 0;
        }

        .pak-tv-pie-chart::after {
            content: "";
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            width: 120px;
            height: 120px;
            background-color: #222;
            border-radius: 50%;
        }

        /* Legend Styles */
        .pak-tv-pie-legend {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 8px;
            font-size: 10px;
            color: #ddd;
            margin-top: 10px;
            text-align: center;
        }

        .pak-tv-legend-item {
            display: flex;
            align-items: center;
            background: #2a2a2a;
            padding: 2px 6px;
            border-radius: 4px;
            border: 1px solid #333;
        }

        .pak-tv-legend-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 6px;
        }

        /* Floating Button */
        #pak-tv-float-btn {
            position: fixed;
            top: 8px;
            left: 15px;
            width: 45px;
            height: 45px;
            background-color: #00d2ff;
            color: #000;
            border: 2px solid #fff;
            border-radius: 50%;
            cursor: pointer;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            box-shadow: 0 0 10px rgba(0, 210, 255, 0.5);
            transition: transform 0.2s;
        }
        #pak-tv-float-btn:hover { transform: scale(1.1); background-color: #33e0ff; }

        .pak-tv-status {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 24px;
            color: #555;
            text-align: center;
            width: 100%;
        }

        /* Buttons */
        .pak-btn {
            background: #444;
            color: white;
            border: 1px solid #666;
            padding: 4px 10px;
            cursor: pointer;
            border-radius: 4px;
            font-size: 11px;
            text-transform: uppercase;
        }
        .pak-btn:hover { background: #666; }

        #pak-undo-btn {
            background-color: #d9534f;
            border-color: #d43f3a;
            display: none;
        }
        #pak-undo-btn:hover { background-color: #c9302c; }

    `;
    document.head.appendChild(pakStyle);

    // --- UI ELEMENTS ---

    // Dashboard Container
    const pakDashboard = document.createElement('div');
    pakDashboard.id = 'pak-tv-dashboard';

    pakDashboard.innerHTML = `
        <div class="pak-tv-header">
            <div class="pak-tv-title-group">
                <div class="pak-tv-title">Live Operations</div>
                <span id="pak-filter-display" class="pak-tv-filter-label"></span>

                <div class="pak-tv-controls" id="pak-controls-area" style="display:none;">
                    <button id="pak-undo-btn" class="pak-btn">Clear Filter</button>

                    <div class="pak-toggle-labels">
                        <span>Bar</span>
                        <label class="pak-switch">
                            <input type="checkbox" id="pak-view-toggle">
                            <span class="pak-slider"></span>
                        </label>
                        <span>Pie</span>
                    </div>
                </div>
            </div>
            <div class="pak-tv-meta">
                <span id="pak-tv-last-updated">Loading...</span>
                <button id="pak-tv-close-btn" class="pak-btn">Exit View</button>
            </div>
        </div>

        <div class="pak-tv-grid-container" id="pak-tv-grid">
            <div class="pak-tv-status">Initializing...</div>
        </div>
    `;

    document.body.appendChild(pakDashboard);

    // Floating Button
    const pakFloatBtn = document.createElement('div');
    pakFloatBtn.id = 'pak-tv-float-btn';
    pakFloatBtn.innerHTML = '📺';
    pakFloatBtn.title = "Enter Full Screen Dashboard";
    document.body.appendChild(pakFloatBtn);

    // --- FULLSCREEN HELPERS ---
    function enterFullscreen() {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
            docEl.requestFullscreen().catch(err => console.log("Fullscreen denied:", err));
        } else if (docEl.webkitRequestFullscreen) {
            docEl.webkitRequestFullscreen();
        } else if (docEl.msRequestFullscreen) {
            docEl.msRequestFullscreen();
        }
    }

    function exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(err => console.log(err));
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }

    // --- FUNCTIONS ---

    function pakToggleDashboard(show) {
        if (show) {
            document.body.classList.add('pak-tv-mode');
            pakDashboard.style.display = 'flex';
            pakFloatBtn.style.display = 'none';
            pakRenderDashboard();
        } else {
            document.body.classList.remove('pak-tv-mode');
            pakDashboard.style.display = 'none';
            pakFloatBtn.style.display = 'flex';
            pakActiveFilter = null;
            const filterDisplay = document.getElementById('pak-filter-display');
            if(filterDisplay) filterDisplay.style.display = 'none';
        }
    }

    pakFloatBtn.addEventListener('click', () => {
        pakToggleDashboard(true);
        enterFullscreen();
    });

    document
        .getElementById('pak-tv-close-btn')
        .addEventListener('click', () => {
            pakToggleDashboard(false);
            exitFullscreen();
        });

    document.getElementById('pak-undo-btn').addEventListener('click', () => {
        pakActiveFilter = null;
        pakRenderDashboard();
    });

    const viewToggle = document.getElementById('pak-view-toggle');
    viewToggle.checked = (pakViewMode === 'pie');

    viewToggle.addEventListener('change', (e) => {
        pakViewMode = e.target.checked ? 'pie' : 'bar';
        localStorage.setItem('pakDashViewMode', pakViewMode);
        pakRenderDashboard();
    });

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
            if (pakDashboard.style.display === 'flex') {
                pakToggleDashboard(false);
            }
        }
    });

    document.getElementById('pak-tv-grid').addEventListener('click', (e) => {
        const clickedNameEl = e.target.closest('.pak-tv-area-name');
        if (clickedNameEl) {
            const areaName = clickedNameEl.textContent.trim();
            if (pakActiveFilter === areaName) {
                pakActiveFilter = null;
            } else {
                pakActiveFilter = areaName;
            }
            pakRenderDashboard();
        }
    });

    // --- PARSING LOGIC ---

    function pakGetSegmentColor(element) {
        const cls = element.className;
        if (cls.includes('progress-complete') || cls.includes('progress-bar-success')) return 'done';
        if (cls.includes('progress-allocated') || cls.includes('progress-bar-warning')) return 'allocated';
        if (cls.includes('progress-outstanding') || cls.includes('progress-bar-danger')) return 'outstanding';
        if (cls.includes('progress-held') || cls.includes('progress-bar-info')) return 'held';
        if (cls.includes('parcels-packed')) return 'info';
        if (cls.includes('completed-effort')) return 'done';
        if (cls.includes('remaining-effort')) return 'outstanding';
        if (cls.includes('items-pigeoned')) return 'allocated';
        return 'outstanding';
    }

    function pakGetSegmentWidth(element) {
        const style = element.getAttribute('style') || '';
        const match = style.match(/width:\s*(\d+(\.\d+)?)%/);
        return match ? parseFloat(match[1]) : 0;
    }

    function pakGetSegmentLabel(element) {
        const label = element.querySelector('.bar-label');
        return label ? label.innerText.trim() : '';
    }

    // --- CORE RENDER FUNCTION ---

    function pakRenderDashboard() {
        if (pakDashboard.style.display === 'none') return;

        const pakGrid = document.getElementById('pak-tv-grid');
        if (!pakGrid) return;

        const undoBtn = document.getElementById('pak-undo-btn');
        const filterDisplay = document.getElementById('pak-filter-display');
        const controlsArea = document.getElementById('pak-controls-area');

        if (pakActiveFilter) {
            undoBtn.style.display = 'inline-block';
            filterDisplay.style.display = 'inline';
            filterDisplay.innerText = `(Filter: ${pakActiveFilter})`;
            controlsArea.style.display = 'flex';
        } else {
            undoBtn.style.display = 'none';
            filterDisplay.style.display = 'none';
            controlsArea.style.display = 'none';
        }

        const originalBatches = document.querySelectorAll('.batch-row');
        if (originalBatches.length === 0) return;

        let totalsBatch = null;
        const activeBatches = [];

        Array.from(originalBatches).forEach(batch => {
            const num = batch.querySelector('.batchNo');
            if (!num) return;
            if (num.innerText.includes('Totals')) {
                totalsBatch = batch;
            } else {
                activeBatches.push(batch);
            }
        });

        const latestBatches = activeBatches.slice(-17);
        let batchesToShow = [...latestBatches];
        if (totalsBatch) batchesToShow.push(totalsBatch);

        // --- DETERMINE RENDER MODE ---
        let html = '';

        if (pakActiveFilter && pakViewMode === 'bar') {
            // === BAR VIEW: MASTER CARD TABLE ===

            // 1. Collect all unique legends AND their colors
            const legendMap = new Map(); // Key: Title, Value: ColorHex
            const batchDataList = [];

            batchesToShow.forEach(batchRow => {
                const batchNumEl = batchRow.querySelector('.batchNo');
                const batchDateEl = batchRow.querySelector('.createdDate');
                const batchNum = batchNumEl ? batchNumEl.innerText : '???';
                const batchTime = batchDateEl ? batchDateEl.innerText.replace(/[\r\n]+/g, ' ').trim() : '';
                const isTotals = batchNum.includes('Totals');

                const progressRows = batchRow.querySelectorAll('.progress-row, .packing-row');
                let rowSegments = [];

                progressRows.forEach(row => {
                    if (row.style.display === 'none' || row.classList.contains('template')) return;
                    const descEl = row.querySelector('.description-column');
                    const areaName = descEl ? descEl.textContent.trim() : 'Unknown';

                    if (pakActiveFilter && areaName.toLowerCase() === pakActiveFilter.toLowerCase()) {
                        const segments = row.querySelectorAll('[class*="progress"], [class*="parcels"], [class*="effort"]');
                        segments.forEach(seg => {
                            if (seg.parentElement.classList.contains('main-bar-column') || seg.parentElement.classList.contains('packing-row-item')) {
                                const width = pakGetSegmentWidth(seg);
                                if (width > 0) {
                                    const colorClass = pakGetSegmentColor(seg);
                                    const rawTitle = seg.getAttribute('title') || '';
                                    const rawLabel = pakGetSegmentLabel(seg);
                                    const colorHex = pakColorMap[colorClass] || '#ccc';

                                    // Store title -> color mapping
                                    if (!legendMap.has(rawTitle)) {
                                        legendMap.set(rawTitle, colorHex);
                                    }

                                    rowSegments.push({
                                        colorClass: colorClass,
                                        colorHex: colorHex,
                                        width: width,
                                        title: rawTitle,
                                        label: rawLabel
                                    });
                                }
                            }
                        });
                    }
                });

                if (rowSegments.length > 0) {
                    batchDataList.push({
                        batchNum: isTotals ? 'Totals' : 'Batch ' + batchNum,
                        batchTime: batchTime,
                        segments: rowSegments
                    });
                }
            });

            // 2. Build Master Card
            if (batchDataList.length > 0) {
                // Header Legend (Text + Color Dot)
                const headerLegendHtml = Array.from(legendMap.entries()).map(([text, color]) =>
                    `<div class="pak-tv-legend-item">
                        <div class="pak-tv-legend-dot" style="background:${color}"></div>
                        <span>${text}</span>
                     </div>`
                ).join('');

                // Table Rows
                const tableRowsHtml = batchDataList.map(b => {
                    const segmentsHtml = b.segments.map(seg => `
                        <div class="pak-tv-segment ${seg.colorClass}" style="width: ${seg.width}%;" title="${seg.title}: ${seg.label}">
                            <span>${seg.label}</span>
                        </div>
                    `).join('');

                    return `
                        <div class="pak-tv-table-row">
                            <div class="pak-tv-col-num">${b.batchNum}</div>
                            <div class="pak-tv-col-time">${b.batchTime}</div>
                            <div class="pak-tv-col-bar">
                                ${segmentsHtml}
                            </div>
                        </div>
                    `;
                }).join('');

                html = `
                    <div class="pak-tv-batch-card pak-tv-master-card">
                        <div class="pak-tv-card-header">
                            <span class="pak-tv-batch-num">Live Operations: ${pakActiveFilter}</span>
                            <span class="pak-tv-batch-time">Combined View</span>
                        </div>
                        <div class="pak-tv-card-body">
                            <div class="pak-tv-pie-legend" style="margin-bottom: 15px;">${headerLegendHtml}</div>
                            ${tableRowsHtml}
                        </div>
                    </div>
                `;
            } else {
                html = `<div class="pak-tv-status" style="color:#555">No data for ${pakActiveFilter}</div>`;
            }

        } else {
            // === STANDARD OR PIE VIEW (Grid of Cards) ===

            batchesToShow.forEach(batchRow => {
                const batchNumEl = batchRow.querySelector('.batchNo');
                const batchDateEl = batchRow.querySelector('.createdDate');

                const batchNum = batchNumEl ? batchNumEl.innerText : '???';
                const batchTime = batchDateEl ? batchDateEl.innerText.replace(/[\r\n]+/g, ' ').trim() : '';
                const isTotals = batchNum.includes('Totals');

                const cardClass = isTotals
                    ? 'pak-tv-batch-card pak-totals-card'
                    : 'pak-tv-batch-card';

                const progressRows = batchRow.querySelectorAll('.progress-row, .packing-row');
                let targetRowHtml = '';
                let hasTargetRow = false;

                progressRows.forEach(row => {
                    if (row.style.display === 'none' || row.classList.contains('template')) return;
                    const descEl = row.querySelector('.description-column');
                    const areaName = descEl ? descEl.textContent.trim() : 'Unknown';

                    if (pakActiveFilter && areaName.toLowerCase() !== pakActiveFilter.toLowerCase()) {
                        return;
                    }

                    hasTargetRow = true;
                    let barSegments = '';
                    let labelText = '';
                    let totalWidth = 0;
                    const segments = row.querySelectorAll('[class*="progress"], [class*="parcels"], [class*="effort"]');
                    let pieData = [];
                    let currentPct = 0;

                    segments.forEach(seg => {
                        if (seg.parentElement.classList.contains('main-bar-column') || seg.parentElement.classList.contains('packing-row-item')) {
                            const width = pakGetSegmentWidth(seg);
                            if (width > 0) {
                                const colorClass = pakGetSegmentColor(seg);
                                const colorHex = pakColorMap[colorClass] || '#ccc';
                                const rawTitle = seg.getAttribute('title') || '';
                                const rawLabel = pakGetSegmentLabel(seg);

                                barSegments += `<div class="pak-tv-segment ${colorClass}" style="width: ${width}%;" title="${rawTitle}: ${rawLabel}"></div>`;

                                pieData.push({
                                    color: colorHex,
                                    label: rawTitle,
                                    value: rawLabel,
                                    legendText: `${rawTitle}: ${rawLabel}`,
                                    start: currentPct,
                                    end: currentPct + width
                                });

                                if (!labelText) labelText = rawLabel;
                                totalWidth += width;
                                currentPct += width;
                            }
                        }
                    });

                    if (totalWidth > 0) {
                        const nameClass = (pakActiveFilter && areaName.toLowerCase() === pakActiveFilter.toLowerCase())
                            ? 'pak-tv-area-name active-filter'
                            : 'pak-tv-area-name';

                        if (pakActiveFilter && pakViewMode === 'pie') {
                            // PIE CHART MODE
                            const gradientParts = pieData.map(p => `${p.color} ${p.start}% ${p.end}%`);
                            const gradientStyle = `conic-gradient(${gradientParts.join(', ')})`;
                            const legendHtml = pieData.map(p => `
                                <div class="pak-tv-legend-item">
                                    <div class="pak-tv-legend-dot" style="background:${p.color}"></div>
                                    <span>${p.legendText}</span>
                                </div>
                            `).join('');

                            targetRowHtml += `
                                <div class="pak-tv-pie-wrapper">
                                    <div class="pak-tv-pie-chart" style="background: ${gradientStyle};"></div>
                                    <div class="pak-tv-pie-legend">${legendHtml}</div>
                                </div>
                            `;
                        } else {
                            // NORMAL LIST MODE
                            const showLabel = totalWidth > 20;
                            targetRowHtml += `
                                <div class="pak-tv-area-row">
                                    <div class="${nameClass}">${areaName}</div>
                                    <div class="pak-tv-bar-container">
                                        ${barSegments}
                                        ${showLabel ? `<div class="pak-tv-bar-text">${labelText}</div>` : ''}
                                    </div>
                                </div>
                            `;
                        }
                    }
                });

                if (pakActiveFilter && !hasTargetRow) {
                     targetRowHtml = `<div style="text-align:center; color:#555; font-size:12px; padding:10px;">No data for ${pakActiveFilter}</div>`;
                }

                if (!hasTargetRow && !pakActiveFilter) return;

                if (targetRowHtml) {
                    html += `
                        <div class="${cardClass}">
                            <div class="pak-tv-card-header">
                                <span class="pak-tv-batch-num">${isTotals ? batchNum : 'Batch ' + batchNum}</span>
                                <span class="pak-tv-batch-time">${batchTime}</span>
                            </div>
                            <div class="pak-tv-card-body">
                                ${targetRowHtml}
                            </div>
                        </div>
                    `;
                }
            });
        }

        if (html) {
            pakGrid.innerHTML = html;
        }

        // Timestamp
        const originalTime = document.getElementById('last-update-label');
        const dashTime = document.getElementById('pak-tv-last-updated');
        if (originalTime && dashTime) {
            dashTime.innerText = "Last Update: " + originalTime.innerText;
        }
    }

    // --- TRIGGERS ---

    setTimeout(pakRenderDashboard, 1500);
    setInterval(pakRenderDashboard, 60000);

    const pakObserver = new MutationObserver((mutations) => {
        let shouldUpdate = false;
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length || mutation.removedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        if (node.classList && node.classList.contains('batch-row')) shouldUpdate = true;
                        if (node.querySelectorAll && node.querySelectorAll('.batch-row').length > 0) shouldUpdate = true;
                    }
                });
            }
        });
        if (shouldUpdate) pakRenderDashboard();
    });

    pakObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

})();