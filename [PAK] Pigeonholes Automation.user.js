// ==UserScript==
// @name         [PAK] Pigeonholes Automation
// @namespace    http://tampermonkey.net/
// @version      20.3
// @description  Extract deployment board data, sort by Station, post every page, export combined CSV, auto-run hourly 10:00–05:00, StationSub included. UI refreshed to match E3 Dropzone look (top-center flush bar, pills, chips, toast).
// @match        http://ws-whs/Next.Whs.Deployment.Board.Web/Sorter*
// @match        http://whds-deployment-board:8084/Sorter*
// @author       Pak
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* ===================== CONFIG ===================== */
    const RECEIVER_URL = "https://script.google.com/a/macros/next.co.uk/s/AKfycbyFA6EayIOa5Hpr0c2VbDd3YPkwdHPR9glLgg-Eh5vEEnYEdMWv_ikGjNw6N0pTgnA/exec";

    const urls = [
        "http://ws-whs/Next.Whs.Deployment.Board.Web/Sorter/DeploymentBoard.aspx?siteCode=EMD&sorterSiteCode=X&packingStationStartChar=1&orentation=P&sorter=1&induct=1&stationOrder=ASC&screenSize=NORMAL&stationType=N&ScrollBars=Y",
        "http://ws-whs/Next.Whs.Deployment.Board.Web/Sorter/DeploymentBoard.aspx?siteCode=EMD&sorterSiteCode=X&packingStationStartChar=2&orentation=P&sorter=1&induct=2&stationOrder=DESC&screenSize=NORMAL&stationType=N&ScrollBars=Y",
        "http://ws-whs/Next.Whs.Deployment.Board.Web/Sorter/DeploymentBoard.aspx?siteCode=EMD&sorterSiteCode=X&packingStationStartChar=3&orentation=P&sorter=2&induct=3&stationOrder=ASC&screenSize=NORMAL&stationType=N&ScrollBars=Y",
        "http://ws-whs/Next.Whs.Deployment.Board.Web/Sorter/DeploymentBoard.aspx?siteCode=EMD&sorterSiteCode=X&packingStationStartChar=4|5&orentation=P&sorter=2&induct=4%20/%205&stationOrder=DESC&screenSize=SMALL&stationType=M&ScrollBars=Y",
        "http://whds-deployment-board:8084/Sorter/DeploymentBoard.aspx?siteCode=EWD&sorterSiteCode=X&packingStationStartChar=6&orentation=P&sorter=3&induct=6&stationOrder=ASC&screenSize=NORMAL&stationType=N&ScrollBars=Y",
        "http://whds-deployment-board:8084/Sorter/DeploymentBoard.aspx?siteCode=EWD&sorterSiteCode=X&packingStationStartChar=7&orentation=P&sorter=3&induct=7&stationOrder=DESC&screenSize=NORMAL&stationType=N&ScrollBars=Y",
        "http://whds-deployment-board:8084/Sorter/DeploymentBoard.aspx?siteCode=EWD&sorterSiteCode=X&packingStationStartChar=8&orentation=P&sorter=4&induct=8&stationOrder=DESC&screenSize=NORMAL&stationType=N&ScrollBars=Y",
        "http://whds-deployment-board:8084/Sorter/DeploymentBoard.aspx?siteCode=EWD&sorterSiteCode=X&packingStationStartChar=9&orentation=P&sorter=4&induct=9&stationOrder=ASC&screenSize=NORMAL&stationType=N&ScrollBars=Y",
        "http://whds-deployment-board:8084/Sorter/DeploymentBoard.aspx?siteCode=EWD&sorterSiteCode=X&packingStationStartChar=A&orentation=P&sorter=5&induct=10&stationOrder=ASC&screenSize=NORMAL&stationType=N&ScrollBars=Y",
        "http://whds-deployment-board:8084/Sorter/DeploymentBoard.aspx?siteCode=EWD&sorterSiteCode=X&packingStationStartChar=B&orentation=P&sorter=5&induct=11&stationOrder=ASC&screenSize=NORMAL&stationType=N&ScrollBars=Y"
    ];

    const sleep = ms => new Promise(res => setTimeout(res, ms));
    const EXPORT_COLUMNS = [
        "Station",
        "ItemsPigeonholed",
        "PigeonholesUsed",
        "Errors",
        "Priority",
        "ItemsInChute",
        "Time",
        "RunHour",
        "StationSub",
        "RunHourMinus9"
    ];

    /* ===================== STYLES ===================== */
    const style = document.createElement('style');
    style.textContent = `
    /* top-center flush bar */
    .ph-bar{
      position: fixed;
      top: 0;
      left: 75%;
      transform: translateX(-50%);
      z-index: 10000;
      width: 920px;
      max-width: calc(100vw - 24px);
      padding: 10px 12px;
      display:flex;
      align-items:center;
      gap:10px;
      background: rgba(10,10,12,0.88);
      color: #fff;
      border-radius: 0 0 12px 12px;
      border: 1px solid rgba(255,255,255,0.12);
      border-top: 0;
      font-family: "Roboto Mono", monospace;
      font-weight: 800;
      box-shadow: 0 14px 40px rgba(0,0,0,0.55);
      backdrop-filter: blur(8px);
    }

    .ph-left{ display:flex; align-items:center; gap:12px; min-width:0; flex:1 1 auto; }
    .ph-title{ font-size:12px; opacity:.9; white-space:nowrap; flex:0 0 auto; }
    .ph-pills{ display:flex; gap:8px; align-items:center; min-width:0; flex:1 1 auto; white-space:nowrap; }
    .ph-pill{
      display:flex; align-items:center; gap:8px; padding:7px 10px; border-radius:10px;
      background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); cursor:pointer;
      transition: transform .12s ease, background .12s ease, border-color .12s ease;
      min-width:0; flex: 0 1 auto;
    }
    .ph-pill:hover{ transform: translateY(-1px); background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.16); }
    .ph-pill .ph-badge{ width:18px; height:18px; border-radius:6px; display:flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.22); border:1px solid rgba(255,255,255,0.12); font-size:11px; }
    .ph-pill .ph-label{ font-size:12px; opacity:.92; }
    .ph-pill .ph-val{ font-size:13px; margin-left:auto; text-align:right; max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

    .ph-actions{ display:flex; gap:8px; flex:0 0 auto; align-items:center; }
    .ph-chip{ width:36px; height:34px; display:flex; align-items:center; justify-content:center; border-radius:10px; border:1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); cursor:pointer; }
    .ph-chip:hover{ transform: translateY(-1px); background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.18); }
    .ph-chip.on{ background: rgba(0,255,120,0.14); border-color: rgba(0,255,120,0.36); box-shadow: inset 0 0 0 2px rgba(0,255,120,0.06); }
    .ph-chip small{ font-size:11px; font-weight:900; }

    /* toast centered below bar */
    .ph-toast{
      position: fixed;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10050;
      padding:8px 10px;
      border-radius:10px;
      border:1px solid rgba(255,255,255,0.12);
      background: rgba(8,40,20,0.9);
      color: #fff;
      font-family:"Roboto Mono", monospace;
      font-weight:900;
      min-width:240px;
      max-width: calc(100vw - 48px);
      opacity:0;
      transition: opacity .15s ease;
      pointer-events: none;
    }
    .ph-toast.show{ opacity:1; }
    .ph-toast.info{ background: rgba(10,22,45,0.95); border-color: rgba(0,160,255,0.45); }
    .ph-toast.fail{ background: rgba(45,10,10,0.95); border-color: rgba(255,80,80,0.6); }

    @media (max-width:900px){
      .ph-bar{ width: calc(100vw - 24px); padding:8px; }
      .ph-pill .ph-label{ display:none; }
      .ph-pill .ph-val{ max-width:140px; }
    }
    `;
    document.head.appendChild(style);

    /* ===================== WIDGET DOM ===================== */
    const bar = document.createElement('div');
    bar.className = 'ph-bar';
    document.body.appendChild(bar);

    const left = document.createElement('div');
    left.className = 'ph-left';
    bar.appendChild(left);

    const title = document.createElement('div');
    title.className = 'ph-title';
    title.textContent = 'Pigeonholes Automation';
    left.appendChild(title);

    const pills = document.createElement('div');
    pills.className = 'ph-pills';
    left.appendChild(pills);

    function makePill(badge, label, valId) {
        const pill = document.createElement('div');
        pill.className = 'ph-pill';
        pill.innerHTML = `<span class="ph-badge">${badge}</span><span class="ph-label">${label}</span><span class="ph-val" id="${valId}">--</span>`;
        pills.appendChild(pill);
        return pill;
    }

    const pillStatus = makePill('#', 'Status', 'phStatusVal');
    const pillIndex = makePill('#', 'Progress', 'phIndexVal');
    const pillLast = makePill('#', 'Last Run', 'phLastRunVal');

    const actions = document.createElement('div');
    actions.className = 'ph-actions';
    bar.appendChild(actions);

    // removed Download CSV chip per request
    const autoChip = document.createElement('div');
    autoChip.className = 'ph-chip';
    autoChip.title = 'Auto Run hourly 10:00–05:00';
    autoChip.innerHTML = `<small id="phAutoLabel">⏱</small>`;
    actions.appendChild(autoChip);

    const startChip = document.createElement('div');
    startChip.className = 'ph-chip';
    startChip.title = 'Start extraction now';
    startChip.textContent = '▶';
    actions.appendChild(startChip);

    const resetChip = document.createElement('div');
    resetChip.className = 'ph-chip';
    resetChip.title = 'Reset';
    resetChip.textContent = '↺';
    actions.appendChild(resetChip);

    // toast
    const toast = document.createElement('div');
    toast.className = 'ph-toast';
    toast.innerHTML = `<span id="phToastLeft">OK</span><span id="phToastRight" style="margin-left:12px; opacity:.9; font-weight:700;">--</span>`;
    document.body.appendChild(toast);
    let toastTimer = null;

    function showToast(type, leftText, rightText) {
        clearTimeout(toastTimer);
        toast.classList.remove('info', 'fail');
        if (type === 'info') toast.classList.add('info');
        if (type === 'fail') toast.classList.add('fail');
        toast.querySelector('#phToastLeft').textContent = leftText || '';
        toast.querySelector('#phToastRight').textContent = rightText || '--';
        // position under bar
        try {
            const r = bar.getBoundingClientRect();
            toast.style.top = (r.bottom + 10) + 'px';
        } catch (e) {}
        toast.classList.add('show');
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
    }

    /* ===================== EXTRACTION (unchanged) ===================== */
    function extractPageData() {
        const rows = [];
        document.querySelectorAll('td[width="50%"]').forEach(cell => {
            const stationEl = cell.querySelector('a.mySorterLink, a.mySorterLink2');
            const station = stationEl ? stationEl.textContent.trim() : "";

            let itemsPigeonholed = "", errors = "", pigeonholesUsed = "";
            let black = null;

            cell.querySelectorAll('td[style*="background-color: black"]').forEach(td => {
                const fsMatch = td.getAttribute("style")?.match(/font-size:\s*(\d+)px/i);
                if (fsMatch) {
                    const fs = +fsMatch[1];
                    if (fs >= 10 && fs <= 30) black = td;
                }
            });

            if (black) {
                const text = black.textContent.replace(/\s+/g, ' ').trim();

                let m = text.match(/(\d+)\s*\((\d+)\)\s*\/\s*(\d+)/);
                if (m) {
                    itemsPigeonholed = m[1];
                    errors = m[2];
                    pigeonholesUsed = m[3];
                } else {
                    m = text.match(/(\d+)\s*\/\s*(\d+)/);
                    if (m) {
                        itemsPigeonholed = m[1];
                        pigeonholesUsed = m[2];
                        errors = "0";
                    }
                }
            }


            let priority = "", itemsInChute = "";
            const pr = cell.querySelector('font[style*="color: yellow"] b, font[style*="color: Cornflowerblue"] b, font[style*="color: white"] b');
            if (pr) {
                priority = pr.textContent.trim();
                const ir = pr.closest('tr')?.nextElementSibling;
                if (ir) itemsInChute = ir.querySelector('b')?.textContent.trim() || "";
            }

            let time = "";
            cell.querySelectorAll('tr[style*="font-size: 12px"][style*="color: Lemonchiffon"]').forEach(tr => {
                const t = tr.querySelector('td')?.textContent.replace(/\u00A0/g, '').trim();
                if (t && /^\d+h? ?\d*m? ?\d*s?$/.test(t)) time = t;
            });

            rows.push([station, itemsPigeonholed, errors, pigeonholesUsed, priority, itemsInChute, time]);
        });

        return rows.filter(r => r.some(v => v !== ""));
    }

    /* ===================== STORAGE ===================== */
    function accumulateRows(rows) {
        const all = GM_getValue("allRows", []);
        GM_setValue("allRows", all.concat(rows));
    }

    function exportAllRowsToCSV() {
        const all = GM_getValue("allRows", []);
        if (!all.length) {
            showToast('fail', 'No rows', '');
            return;
        }

        const csv = [
            EXPORT_COLUMNS.join(","),
            ...all.map(row =>
                EXPORT_COLUMNS.map(col =>
                    `"${String(row[col] ?? "").replace(/"/g, '""')}"`
                ).join(",")
            )
        ].join("\n");

        const filename = `pigeonholes_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;

        GM_download({
            url: "data:text/csv;charset=utf-8," + encodeURIComponent(csv),
            name: filename,
            saveAs: true
        });

        showToast('info', 'CSV exported', filename);
    }

    /* ===================== POST ===================== */
    function postRows(rows) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: "POST",
                url: RECEIVER_URL,
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify({ rows }),
                onload: () => resolve(true),
                onerror: () => resolve(false)
            });
        });
    }

    /* ===================== MAIN PAGE PROCESS ===================== */
    async function processPage() {
        if (!GM_getValue("isRunning", false)) return;

        const index = GM_getValue("currentIndex", 0);
        updateStatus(`Running ${index + 1}/${urls.length}`);
        await sleep(1200);

        const data = extractPageData().sort((a, b) => (a[0] || "").localeCompare(b[0] || "", undefined, { numeric: true }));

        if (data.length) {
            const now = new Date();
            const runHour = now.getHours();
            const runHourMinus9 = (runHour + 24 - 9) % 24;

            const rowsForPost = data.map(r => {
                const station = r[0] || "";
                const stationSub = station.length >= 5 ? station.slice(-5, -3) : station.slice(0, 1);
                return {
                    Station: station,
                    StationSub: stationSub,
                    ItemsPigeonholed: r[1],
                    Errors: r[2],
                    PigeonholesUsed: r[3],
                    Priority: r[4],
                    ItemsInChute: r[5],
                    Time: r[6],
                    RunHour: runHour,
                    RunHourMinus9: runHourMinus9
                };
            });

            accumulateRows(rowsForPost);

            // Only POST if Auto Run is ON
            if (GM_getValue("autoRun", false)) {
                await postRows(rowsForPost);
            }
        }

        // move to next page or finish
        if (index + 1 < urls.length) {
            GM_setValue("currentIndex", index + 1);
            window.location.href = urls[index + 1];
        } else {
            updateStatus("📦 Exporting CSV...");
            exportAllRowsToCSV();
            GM_setValue("isRunning", false);
            GM_setValue("currentIndex", 0);
            GM_setValue("allRows", []);
            updateStatus("✅ Done");
            // return to first
            window.location.href = urls[0];
        }
    }

    /* ===================== UI BEHAVIOUR (wiring) ===================== */
    function setChipState(chipEl, on) {
        chipEl.classList.toggle('on', !!on);
    }

    // Status updater used by schedule etc.
    function updateStatus(text) {
        const st = document.getElementById('phStatusVal');
        if (st) st.textContent = text;
        // also update small progress display
        const idx = GM_getValue("currentIndex", 0);
        document.getElementById('phIndexVal').textContent = `${idx}/${urls.length}`;
        const last = GM_getValue('pigeon_last_run', '--');
        document.getElementById('phLastRunVal').textContent = last;
    }

    // Auto toggle chip
    autoChip.addEventListener('click', () => {
        const newVal = !GM_getValue("autoRun", false);
        GM_setValue("autoRun", newVal);
        setChipState(autoChip, newVal);
        showToast('info', newVal ? 'Auto Run enabled' : 'Auto Run disabled', '');
    });

    // start now
    startChip.addEventListener('click', () => {
        GM_setValue("allRows", []);
        GM_setValue("isRunning", true);
        GM_setValue("currentIndex", 0);
        updateStatus('Started');
        showToast('info', 'Started', 'Extraction started');
        // navigate to first page to kick off cycle
        window.location.href = urls[0];
    });

    // reset -> now resets state AND returns to first URL
    resetChip.addEventListener('click', () => {
        GM_setValue("isRunning", false);
        GM_setValue("currentIndex", 0);
        GM_setValue("allRows", []);
        updateStatus('Reset');
        showToast('info', 'Reset done', '');
        // go back to first page
        try {
            window.location.href = urls[0];
        } catch (e) {
            // fallback to direct string if something odd with urls array
            window.location.href = "http://ws-whs/Next.Whs.Deployment.Board.Web/Sorter/DeploymentBoard.aspx?siteCode=EMD&sorterSiteCode=X&packingStationStartChar=1&orentation=P&sorter=1&induct=1&stationOrder=ASC&screenSize=NORMAL&stationType=N&ScrollBars=Y";
        }
    });

    // initialize chip visuals
    setChipState(autoChip, !!GM_getValue("autoRun", false));
    document.getElementById('phIndexVal').textContent = `${GM_getValue("currentIndex", 0)}/${urls.length}`;
    document.getElementById('phLastRunVal').textContent = GM_getValue('pigeon_last_run', '--');

    /* ===================== AUTO RUN SCHEDULER (hourly 10:00–05:00) ===================== */
    function startExtractionIfAutoRun() {
        const now = new Date();
        const hour = now.getHours();
        if (!GM_getValue("autoRun", false)) return;
        // Only run 10:00–05:00 (next day)
        if (hour >= 10 || hour < 6) {
            if (!GM_getValue("isRunning", false)) {
                const label = `${String(hour).padStart(2,'0')}:00`;
                updateStatus(`⏱ Auto Trigger ${label}`);
                showToast('info', 'Auto Trigger', label);
                GM_setValue("allRows", []);
                GM_setValue("isRunning", true);
                GM_setValue("currentIndex", 0);
                window.location.href = urls[0];
            }
        }
    }

    function scheduleNextAutoRun() {
        const now = new Date();
        const nextHour = new Date(now);
        nextHour.setHours(now.getHours() + 1, 0, 0, 0);
        const msUntilNextHour = nextHour - now;
        setTimeout(() => {
            startExtractionIfAutoRun();
            setInterval(startExtractionIfAutoRun, 60 * 60 * 1000); // every hour
        }, msUntilNextHour);
    }

    scheduleNextAutoRun();

    /* ===================== BOOTSTRAP / PROCESSING HOOK ===================== */
    // If currently running (in the middle of multi-page cycle), process page shortly after load
    if (GM_getValue("isRunning", false)) {
        // small delay so DOM settles
        setTimeout(() => {
            processPage();
            const now = new Date();
            GM_setValue('pigeon_last_run', `${now.getDate()}/${now.getMonth()+1} ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`);
            updateStatus('Processing');
        }, 600);
    } else {
        // not running — show idle status
        updateStatus('Idle');
    }

})();
