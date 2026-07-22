// ==UserScript==
// @name         [PAK] PSD - Bonus Hub Report Runner
// @namespace    http://tampermonkey.net/
// @version      11.0
// @description  Open saved reports, run each, save rows to localStorage, copy TSV, download CSV (Combined/Individual/Both), and optionally post each report TSV to its own Google Sheet. Includes unified Auto-RUN Manager with Rolling Mode, Delay, and Rolling Backfill Mode.
// @author       Pak
// @match        https://pon-wpws27/Whds.Dashboard.Web/bonushub/reports*
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20PSD%20-%20Bonus%20Hub%20Report%20Runner.user.js
// @downloadURL  https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20PSD%20-%20Bonus%20Hub%20Report%20Runner.user.js
// ==/UserScript==

(function () {
    'use strict';

    // =====================================================================
    // CONSTANTS & CONFIG
    // =====================================================================

    const STORAGE_KEY = 'pak_bonushub_settings_v7';
    const REPORT_CACHE_KEY = 'pak_bonushub_available_reports_v1';
    const RUN_DATA_KEY = 'pak_bonushub_run_data_v1';
    const AUTORUN_STORAGE_KEY = 'pak_autorun_config_v3';

    // Which Google Sheet each report posts to, keyed by report name (case/whitespace
    // insensitive lookup — see findUrlInMap). A report not present in the active map
    // still runs and saves locally, it just won't be posted anywhere.
    const REPORT_POST_URLS_WEEKLY = {
        'MPF - PiE': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbzinomH7_XBUrrGr6iYo6jTWY4S8RAa_n9PQ6d9OaEpmrYR4VT5DlZr9koX6z7MxFAu/exec',
        'MPF - E3 Packing': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbx3V8uvu97pz41uGMJC4BOUVN5Lad98AtclbCjUW5VZicKWRgVSL74NoI6cvLkZ1jQ_wg/exec',
        'MPF - E3 Topup': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbye_PccRK7IRkQ-GEOZ9iDRopVKO6ofS8Q5T-OAxocFRL1CyIzk7SwhutKvhhj52u8m8w/exec',
        'MPF - Parcel Sort': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbxDn17AJRg-2Oyh85YAQD989LOL809bXPRIG75mhTkCM8im8ouRF7O-lSiNcUVD7ooU/exec',
        'MPF - Sorter 6 Packing': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbyYzOGVJpfNHKj4pxAn8wl-BtitA2lkf_f6P_j7CRYbL-0R7KiRXh8i2c78aB2NWfcD/exec'
    };

    const REPORT_POST_URLS_DAILY = {
        'MPF - VS Transfer': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbweReN_J5GfBmYARYzwcQUJdKIBm7LlvhDB5ZnQzBQq6n5ItBo5CpOIEeIomooK3PPnzA/exec',
        'MPF - VS Retail': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbweReN_J5GfBmYARYzwcQUJdKIBm7LlvhDB5ZnQzBQq6n5ItBo5CpOIEeIomooK3PPnzA/exec',
        'MPF - VS Online': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbweReN_J5GfBmYARYzwcQUJdKIBm7LlvhDB5ZnQzBQq6n5ItBo5CpOIEeIomooK3PPnzA/exec'
    };

    const REPORT_POST_URLS_BACKFILL = {
        'D.Analysis - OSR PiE': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbwUatgWaCOfsdPiHLV-WgTRN_CqJH9P4eHE7V0ONgQnYU1xoNXIDV4fb1oz8-RJioIF/exec',
        'D.Analysis - OSR Topup': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbwUatgWaCOfsdPiHLV-WgTRN_CqJH9P4eHE7V0ONgQnYU1xoNXIDV4fb1oz8-RJioIF/exec',
        'D.Analysis - E3 Packing': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbwUatgWaCOfsdPiHLV-WgTRN_CqJH9P4eHE7V0ONgQnYU1xoNXIDV4fb1oz8-RJioIF/exec',
        'D.Analysis - Parcel Sortation': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbwUatgWaCOfsdPiHLV-WgTRN_CqJH9P4eHE7V0ONgQnYU1xoNXIDV4fb1oz8-RJioIF/exec',
        'D.Analysis - Parcel Induct': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbwUatgWaCOfsdPiHLV-WgTRN_CqJH9P4eHE7V0ONgQnYU1xoNXIDV4fb1oz8-RJioIF/exec',
        'D.Analysis - Inbound Decanting': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbwUatgWaCOfsdPiHLV-WgTRN_CqJH9P4eHE7V0ONgQnYU1xoNXIDV4fb1oz8-RJioIF/exec',
        'D.Analysis - OSR Decanting': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbwUatgWaCOfsdPiHLV-WgTRN_CqJH9P4eHE7V0ONgQnYU1xoNXIDV4fb1oz8-RJioIF/exec'
    };

    const FIXED_COLS = 10;
    const TAB_TEXT = 'SAVED REPORTS';
    const REPORT_BUILDER_TEXT = 'REPORT BUILDER';
    const RUN_TEXT = 'RUN';
    const OPEN_REPORT_TEXT = 'OPEN REPORT';
    const FONT_AWESOME_ID = 'pak-bonushub-fa';
    const RUN_OVERLAY_ID = 'pak-bonushub-overlay';
    const SETTINGS_OVERLAY_ID = 'pak-bonushub-settings-overlay';
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    const MONTH_LOOKUP = {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
    };

    // =====================================================================
    // DESIGN SYSTEM (single stylesheet instead of hundreds of inline styles)
    // =====================================================================
    // Everything the script renders (toolbar, overlay, settings modal, status
    // pill) shares these tokens so the UI reads as one consistent product
    // instead of a pile of ad-hoc dialogs. Nothing here touches the host
    // page's own styles — it's scoped to elements carrying pak-* classes.
    GM_addStyle(`
        .pak-ui, .pak-ui * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
        .pak-ui {
            --pak-bg: #131316;
            --pak-bg-card: #1b1b20;
            --pak-bg-input: #0f0f12;
            --pak-border: rgba(255,255,255,0.09);
            --pak-border-strong: rgba(255,255,255,0.18);
            --pak-text: #f5f5f7;
            --pak-text-dim: rgba(245,245,247,0.68);
            --pak-text-faint: rgba(245,245,247,0.45);
            --pak-accent: #6d6dfb;
            --pak-accent-hover: #8484ff;
            --pak-green: #22c55e;
            --pak-red: #ef4444;
            --pak-radius-lg: 16px;
            --pak-radius: 10px;
            --pak-radius-sm: 7px;
        }

        /* --- Toolbar (RUN / Settings) --- */
        .pak-toolbar { position: fixed; top: 10px; left: 410px; z-index: 99998; display: flex; gap: 6px; align-items: center; padding: 4px; background: rgba(19,19,22,0.85); border: 1px solid var(--pak-border); border-radius: 999px; box-shadow: 0 6px 18px rgba(0,0,0,0.35); backdrop-filter: blur(6px); }
        .pak-btn { appearance: none; border: 1px solid var(--pak-border-strong); background: #202024; color: var(--pak-text); padding: 8px 16px; border-radius: 999px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; transition: background 0.15s, opacity 0.15s, transform 0.05s; white-space: nowrap; }
        .pak-btn:hover { background: #2a2a30; }
        .pak-btn:active { transform: scale(0.97); }
        .pak-btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
        .pak-btn-primary { background: linear-gradient(135deg, var(--pak-accent), #4f46e5); border-color: transparent; }
        .pak-btn-primary:hover { background: linear-gradient(135deg, var(--pak-accent-hover), #5b52e8); }

        /* --- Status pill (auto-run indicator, bottom-left) --- */
        .pak-status-pill { position: fixed; bottom: 12px; left: 12px; z-index: 99999; background: rgba(19,19,22,0.92); color: var(--pak-text); border: 1px solid var(--pak-border); border-radius: 999px; padding: 8px 14px; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 14px rgba(0,0,0,0.4); transition: background 0.15s, border-color 0.15s; }
        .pak-status-pill:hover { background: rgba(32,32,38,0.95); border-color: var(--pak-border-strong); }
        .pak-status-dot { width: 8px; height: 8px; border-radius: 50%; background: #555; flex-shrink: 0; transition: background 0.2s, box-shadow 0.2s; }
        .pak-status-text { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--pak-text-dim); }

        /* --- Run overlay --- */
        .pak-run-overlay { position: fixed; inset: 0; background: rgba(8,8,10,0.78); z-index: 99999; display: none; align-items: center; justify-content: center; user-select: none; }
        .pak-run-card { width: min(520px, calc(100vw - 32px)); padding: 30px 26px 24px; border-radius: var(--pak-radius-lg); background: var(--pak-bg-card); box-shadow: 0 20px 55px rgba(0,0,0,0.5); border: 1px solid var(--pak-border); text-align: center; color: var(--pak-text); }
        .pak-run-icon { font-size: 50px; color: var(--pak-accent-hover); margin-bottom: 12px; display: inline-block; animation: pakPinPulse 1.15s ease-in-out infinite; transform-origin: 50% 72%; }
        .pak-run-status { font-size: 19px; font-weight: 700; margin-bottom: 8px; }
        .pak-run-progress { font-size: 13px; font-weight: 500; color: var(--pak-text-dim); min-height: 34px; line-height: 1.45; }
        .pak-abort-btn { margin-top: 18px; padding: 10px 26px; border-radius: 999px; border: 1px solid rgba(255,90,90,0.4); background: rgba(160,25,25,0.6); color: #fff; cursor: pointer; font-size: 13px; font-weight: 600; transition: background 0.15s, border-color 0.15s; }
        .pak-abort-btn:hover { background: rgba(200,35,35,0.85); border-color: rgba(255,100,100,0.7); }
        .pak-abort-btn:disabled { opacity: 0.45; cursor: default; }
        @keyframes pakPinPulse { 0% { transform: translateY(0) rotate(0deg) scale(1); opacity: .95; } 25% { transform: translateY(-3px) rotate(-8deg) scale(1.03); opacity: 1; } 50% { transform: translateY(0) rotate(0deg) scale(1); opacity: .95; } 75% { transform: translateY(-2px) rotate(8deg) scale(1.03); opacity: 1; } 100% { transform: translateY(0) rotate(0deg) scale(1); opacity: .95; } }
        @keyframes pakSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* --- Toast --- */
        .pak-toast { position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); background: #dc3d3d; color: #fff; padding: 12px 22px; border-radius: 999px; z-index: 200000; font-size: 13px; font-weight: 600; box-shadow: 0 6px 18px rgba(0,0,0,0.4); transition: opacity 0.3s, transform 0.3s; opacity: 0; pointer-events: none; white-space: nowrap; }

        /* --- Settings modal --- */
        .pak-modal-backdrop { position: fixed; inset: 0; z-index: 100000; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); backdrop-filter: blur(2px); }
        .pak-modal { width: min(1000px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: auto; background: var(--pak-bg); color: var(--pak-text); border: 1px solid var(--pak-border-strong); border-radius: var(--pak-radius-lg); box-shadow: 0 24px 70px rgba(0,0,0,0.5); padding: 16px 16px 14px; }
        .pak-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--pak-border); }
        .pak-modal-title { font-size: 18px; font-weight: 700; }
        .pak-modal-subtitle { font-size: 11.5px; color: var(--pak-text-faint); margin-top: 3px; }
        .pak-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; align-items: stretch; }
        .pak-card { height: 100%; display: flex; flex-direction: column; background: var(--pak-bg-card); border: 1px solid var(--pak-border); border-radius: var(--pak-radius); padding: 12px; }
        .pak-card-title { font-size: 13.5px; font-weight: 700; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .pak-card-title-text { display: flex; align-items: center; gap: 6px; }
        .pak-hint { margin-top: 8px; font-size: 11px; color: var(--pak-text-faint); line-height: 1.4; }

        .pak-help { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 50%; background: rgba(255,255,255,0.1); color: var(--pak-text-dim); font-size: 10px; font-weight: 700; font-style: normal; cursor: help; flex-shrink: 0; }
        .pak-help:hover { background: var(--pak-accent); color: #fff; }

        .pak-radio-row { display: flex; align-items: center; gap: 7px; margin-bottom: 7px; cursor: pointer; font-size: 13px; }
        .pak-radio-row input { accent-color: var(--pak-accent); }
        .pak-field-label { display: block; font-size: 11.5px; color: var(--pak-text-dim); margin-bottom: 4px; }
        .pak-input, .pak-select { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: var(--pak-radius-sm); border: 1px solid var(--pak-border-strong); background: var(--pak-bg-input); color: var(--pak-text); outline: none; font-size: 13px; }
        .pak-input:focus, .pak-select:focus { border-color: var(--pak-accent); }
        .pak-input-light { background: #fff; color: #111; }
        .pak-date-grid { display: grid; gap: 8px; grid-template-columns: 1fr 1fr; }
        .pak-time-grid { display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(0, 1fr)); }

        .pak-switch { position: relative; display: inline-block; width: 32px; height: 18px; flex-shrink: 0; }
        .pak-switch input { opacity: 0; width: 0; height: 0; }
        .pak-slider { position: absolute; cursor: pointer; inset: 0; background: #4a4a52; transition: .2s; border-radius: 999px; }
        .pak-slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 2px; top: 2px; background: #fff; transition: .2s; border-radius: 50%; }
        .pak-switch input:checked + .pak-slider { background: var(--pak-green); }
        .pak-switch input:checked + .pak-slider:before { transform: translateX(14px); }

        .pak-hidden { display: none !important; }
        .pak-dimmed { opacity: 0.4; pointer-events: none; transition: opacity 0.2s; }

        .pak-export-options { display: flex; gap: 14px; font-size: 12px; margin-top: 4px; }
        .pak-checkbox-row { display: flex; align-items: center; gap: 6px; cursor: pointer; }
        .pak-checkbox-row input { accent-color: var(--pak-accent); }

        .pak-report-list { position: relative; max-height: 320px; overflow-y: auto; margin-right: -6px; padding-right: 6px; padding-bottom: 4px; }
        .pak-report-list::-webkit-scrollbar { width: 6px; }
        .pak-report-list::-webkit-scrollbar-track { background: #222; border-radius: 3px; }
        .pak-report-list::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
        .pak-report-list::-webkit-scrollbar-thumb:hover { background: #777; }
        .pak-report-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
        .pak-report-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--pak-border); border-radius: 8px; background: var(--pak-bg-input); cursor: pointer; min-height: 44px; box-sizing: border-box; }
        .pak-report-item input { transform: scale(1.05); accent-color: var(--pak-accent); }
        .pak-report-item-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .pak-report-item-title { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }
        .pak-report-item-sub { font-size: 10px; color: var(--pak-text-faint); }
        .pak-loading-row { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 100px; color: var(--pak-text-dim); }
        .pak-spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25); border-top-color: #fff; animation: pakSpin 0.85s linear infinite; }

        .pak-modal-footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 14px; }
        .pak-icon-btn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #a33; background: #4a0e0e; color: #fff; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.15s; }
        .pak-icon-btn:hover { background: #611; }
        .pak-btn-secondary { padding: 8px 14px; border-radius: 8px; border: 1px solid var(--pak-border-strong); background: #222227; color: #fff; cursor: pointer; font-size: 13px; }
        .pak-btn-secondary:hover { background: #2a2a30; }
        .pak-btn-save { padding: 8px 16px; border-radius: 8px; border: 1px solid #2d9c57; background: #0f6b2e; color: #fff; cursor: pointer; font-weight: 700; font-size: 13px; }
        .pak-btn-save:hover { background: #128036; }
        .pak-error-line { min-height: 16px; font-size: 12px; color: #ffb4b4; margin-top: 8px; }
        .pak-mini-btn { padding: 4px 9px; border-radius: 999px; border: 1px solid var(--pak-border-strong); background: #222227; color: #fff; cursor: pointer; font-size: 11px; }
        .pak-mini-btn:hover { background: #2a2a30; }
    `);

    // =====================================================================
    // SPA NAVIGATION HANDLING
    // =====================================================================
    // The dashboard is an Angular SPA — moving between tabs/pages never
    // triggers a real page load, so window "load" fires once and our
    // floating UI would otherwise stay visible on unrelated pages. We patch
    // history.pushState/replaceState (the only way Angular's router changes
    // the URL) so we can show/hide our controls in step with the app.

    function isCorrectPage() {
        return window.location.href.includes('/bonushub/reports');
    }

    function updateUIVisibility() {
        try {
            const show = isCorrectPage();

            if (typeof controlsContainer !== 'undefined') {
                controlsContainer.style.display = show ? 'flex' : 'none';
            }

            const statusPill = document.getElementById('pak-status-pill');
            if (statusPill) statusPill.style.display = show ? 'flex' : 'none';

            // Leaving the page mid-flow: force-close any modal/overlay rather
            // than let it linger over an unrelated screen.
            if (!show) {
                if (settingsOpen) closeSettingsPanel();
                if (overlayEl && overlayEl.style.display === 'flex') hideOverlay();
            }
        } catch (e) {
            // Never let UI bookkeeping crash Angular's router.
        }
    }

    (function interceptSpaNavigation() {
        try {
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;

            history.pushState = function () {
                originalPushState.apply(this, arguments);
                updateUIVisibility();
            };

            history.replaceState = function () {
                originalReplaceState.apply(this, arguments);
                updateUIVisibility();
            };

            window.addEventListener('popstate', updateUIVisibility);
        } catch (e) {
            // Fail silently — worst case the floating UI stays visible.
        }
    })();

    updateUIVisibility();

    // =====================================================================
    // STATE & SETTINGS
    // =====================================================================

    function todayInputValue() { return formatDateInput(new Date()); }

    const defaultSettings = () => ({
        postEnabled: false,
        reportMode: 'weekly',
        periodCount: 1,
        dailyFromDate: todayInputValue(),
        dailyToDate: todayInputValue(),
        hourFrom: '00', minuteFrom: '00', hourTo: '23', minuteTo: '59',
        selectedReports: {},
        exportMode: { combined: true, individual: true },
        backfillInterval: 15
    });

    const defaultAutoRunSettings = {
        enabled: false,
        targetMode: 'native',
        mode: 'time',
        timeMinutes: '1',
        intervalMinutes: 60,
        intervalStartMode: 'now',
        intervalStartMinute: 0,
        rollingMinutes: 15,
        rollingDelayMinutes: 1
    };

    let settings = loadSettings();
    let storedReports = [];
    let availableReports = readCachedAvailableReports();
    let controlsDisabled = false;
    let abortRequested = false;

    let autoRunSettings = Object.assign({}, defaultAutoRunSettings, JSON.parse(localStorage.getItem(AUTORUN_STORAGE_KEY) || 'null') || {});

    let nextRunTime = null;
    let schedulerTimeout = null;
    let windowCountdownInterval = null;

    let overlayEl = null, overlayStatusEl = null, overlayProgressEl = null, overlayAbortBtn = null, originalBodyOverflow = '';
    let settingsModalEl = null, settingsEls = null, settingsOpen = false;

    // =====================================================================
    // FLOATING TOOLBAR (RUN / Settings)
    // =====================================================================

    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'pak-ui pak-toolbar';

    const runBtn = document.createElement('button');
    runBtn.className = 'pak-btn pak-btn-primary';
    runBtn.innerHTML = '<i class="fa-solid fa-play"></i> RUN';

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'pak-btn';
    settingsBtn.innerHTML = '<i class="fa-solid fa-gear"></i> Settings';

    controlsContainer.appendChild(runBtn);
    controlsContainer.appendChild(settingsBtn);
    document.body.appendChild(controlsContainer);

    runBtn.addEventListener('click', runSequence);
    settingsBtn.addEventListener('click', openSettingsPanel);
    ensureFontAwesome(); ensureRunOverlay();
    createAutoRunStatusPill();

    if (!settings.selectedReports || Object.keys(settings.selectedReports).length === 0) {
        const defaults = availableReports.length ? availableReports : reportNamesFallback();
        defaults.forEach(name => { settings.selectedReports[name] = true; });
        persistSettings();
    }
    init();

    // --- Toolbar positioning ---
    // The toolbar is anchored just right of the page's own logo, so it has
    // to be repositioned whenever that logo moves or resizes (window resize,
    // sidebar collapse, font loading shifting layout, etc). A MutationObserver
    // on the header plus a slow safety-net interval covers Angular re-renders
    // without polling every 2 seconds forever like the previous version did.
    function updateButtonPosition() {
        const logo = document.querySelector('.logo');
        if (logo) {
            const rect = logo.getBoundingClientRect();
            const leftPos = rect.right + 58;
            controlsContainer.style.left = `${leftPos}px`;
            controlsContainer.style.right = 'auto';
        }
    }

    window.addEventListener('load', updateButtonPosition);
    window.addEventListener('resize', updateButtonPosition);

    (function watchLogoPosition() {
        const header = document.querySelector('header') || document.body;
        try {
            const observer = new MutationObserver(() => updateButtonPosition());
            observer.observe(header, { childList: true, subtree: true, attributes: true });
        } catch (e) { /* MutationObserver unsupported — fall back to the interval below */ }
        setInterval(updateButtonPosition, 10000); // safety net for anything the observer misses
    })();

    // =====================================================================
    // BOOTSTRAP
    // =====================================================================

    async function init() {
        try {
            if (!availableReports.length) availableReports = readCachedAvailableReports();
            if (!availableReports.length) availableReports = reportNamesFallback();
            ensureSelectionDefaultsForReports(availableReports);
            await waitForPageReady();
            updateButtonPosition();
        } catch (err) { console.warn('Init warning:', err); }
    }

    function loadSettings() {
        try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return defaultSettings(); return sanitizeSettings(JSON.parse(raw)); } catch (err) { console.warn('Failed to load settings:', err); return defaultSettings(); }
    }

    function sanitizeDateInput(value, fallback) {
        if (typeof value !== 'string') return fallback; if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
        const d = parseDateInput(value); return d ? value : fallback;
    }

    function sanitizeSettings(raw) {
        const s = defaultSettings(); if (!raw || typeof raw !== 'object') return s;
        s.postEnabled = raw.postEnabled === true;
        s.reportMode = (raw.reportMode === 'daily' || raw.reportMode === 'backfill') ? raw.reportMode : 'weekly';

        const count = Number(raw.periodCount); s.periodCount = Number.isFinite(count) ? Math.max(1, Math.min(99, Math.trunc(count))) : 1;
        s.backfillInterval = Number.isFinite(Number(raw.backfillInterval)) ? Math.max(1, Math.min(1440, Math.trunc(Number(raw.backfillInterval)))) : 15;

        s.dailyFromDate = sanitizeDateInput(raw.dailyFromDate, s.dailyFromDate); s.dailyToDate = sanitizeDateInput(raw.dailyToDate, s.dailyToDate);
        s.hourFrom = clampPad2(raw.hourFrom, 0, 23, '00'); s.minuteFrom = clampPad2(raw.minuteFrom, 0, 59, '00');
        s.hourTo = clampPad2(raw.hourTo, 0, 23, '23'); s.minuteTo = clampPad2(raw.minuteTo, 0, 59, '59');
        s.selectedReports = {}; const selected = raw.selectedReports && typeof raw.selectedReports === 'object' ? raw.selectedReports : {};
        const allowed = new Set([...Object.keys(selected), ...reportNamesFallback()]);
        allowed.forEach(name => { if (typeof selected[name] === 'boolean') s.selectedReports[name] = selected[name]; });

        s.exportMode = { combined: true, individual: true };
        if (typeof raw.exportMode === 'string') {
            if (raw.exportMode === 'combined') s.exportMode = { combined: true, individual: false };
            else if (raw.exportMode === 'individual') s.exportMode = { combined: false, individual: true };
        } else if (typeof raw.exportMode === 'object' && raw.exportMode !== null) {
            s.exportMode = {
                combined: !!raw.exportMode.combined,
                individual: !!raw.exportMode.individual
            };
        }

        return s;
    }

    function persistSettings() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (err) { console.warn('Failed to persist settings:', err); } }

    function persistStoredReports() {
        try { localStorage.setItem(RUN_DATA_KEY, JSON.stringify(storedReports)); } catch (err) { console.warn('Failed to persist run data:', err); }
    }

    function resetStoredReports() {
        storedReports = [];
        localStorage.removeItem(RUN_DATA_KEY);
    }

    // =====================================================================
    // GENERIC UTILITIES
    // =====================================================================

    function clampPad2(value, min, max, fallback) { const n = Number.parseInt(value, 10); if (!Number.isInteger(n) || n < min || n > max) return fallback; return String(n).padStart(2, '0'); }
    function pad2(value) { return String(value).padStart(2, '0'); }
    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    function normalizeText(text) { return (text || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim(); }
    function normalizeKey(text) { return normalizeText(text).toLowerCase(); }
    function clickElement(el) { if (!el) return false; el.click(); return true; }

    async function waitForElement(fn, timeout = 30000, interval = 250) {
        const start = Date.now(); while (Date.now() - start < timeout) {
            if (abortRequested) return null;
            const el = fn(); if (el) return el; await sleep(interval);
        } return null;
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'pak-ui pak-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        toast.offsetHeight; // force reflow so the transition below actually animates
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(-10px)';

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(0)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function ensureFontAwesome() {
        if (document.getElementById(FONT_AWESOME_ID)) return;
        const link = document.createElement('link'); link.id = FONT_AWESOME_ID; link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css'; link.referrerPolicy = 'no-referrer';
        document.head.appendChild(link);
    }

    // =====================================================================
    // RUN OVERLAY (full-screen progress card shown while a sequence runs)
    // =====================================================================

    function ensureRunOverlay() {
        if (overlayEl) return;
        overlayEl = document.createElement('div');
        overlayEl.id = RUN_OVERLAY_ID;
        overlayEl.className = 'pak-ui pak-run-overlay';
        overlayEl.innerHTML = `
            <div class="pak-run-card">
                <div><i class="fa-solid fa-thumbtack pak-run-icon"></i></div>
                <div data-status class="pak-run-status">Running...</div>
                <div data-progress class="pak-run-progress">Preparing...</div>
                <div>
                    <button data-abort class="pak-abort-btn"><i class="fa-solid fa-stop" style="margin-right:7px;"></i>Abort &amp; Extract</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlayEl);
        overlayStatusEl = overlayEl.querySelector('[data-status]');
        overlayProgressEl = overlayEl.querySelector('[data-progress]');
        overlayAbortBtn = overlayEl.querySelector('[data-abort]');
        overlayAbortBtn.addEventListener('click', () => {
            abortRequested = true;
            setOverlay('Aborting...', 'Finishing current step, then extracting saved data...');
            overlayAbortBtn.disabled = true;
        });
    }

    function showOverlay(status = 'Running...', progress = 'Preparing...') {
        ensureRunOverlay();
        if (overlayEl.style.display === 'flex') { setOverlay(status, progress); return; }
        overlayStatusEl.textContent = status; overlayProgressEl.textContent = progress;
        abortRequested = false;
        overlayAbortBtn.disabled = false;
        originalBodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; overlayEl.style.display = 'flex';
    }

    function setOverlay(status, progress) { if (overlayStatusEl && typeof status === 'string') overlayStatusEl.textContent = status; if (overlayProgressEl && typeof progress === 'string') overlayProgressEl.textContent = progress; }
    function hideOverlay() { if (!overlayEl) return; overlayEl.style.display = 'none'; document.body.style.overflow = originalBodyOverflow || ''; }

    function setControlsDisabled(disabled) {
        controlsDisabled = disabled; runBtn.disabled = disabled; settingsBtn.disabled = disabled;
    }

    // =====================================================================
    // DATE / PERIOD HELPERS
    // =====================================================================

    function formatDate(date) { const d = new Date(date); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; } // dd/mm/yyyy, matching the site's own date display
    function formatDateInput(date) { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
    function parseDateInput(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const [yyyy, mm, dd] = value.split('-').map(Number); const d = new Date(yyyy, mm - 1, dd); d.setHours(0, 0, 0, 0); if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null; return d; }
    function startOfDay(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
    function addDays(date, days) { return new Date(date.getTime() + (days * MS_PER_DAY)); }
    function addMinutes(date, mins) { return new Date(date.getTime() + (mins * 60000)); }
    function formatRange(startDate, endDate) { return `${formatDate(startDate)} - ${formatDate(endDate)}`; }

    // Week numbers here are the business's own scheme (anchored to a fixed
    // Sunday), not ISO-8601 week numbers — don't "fix" this to match ISO.
    function getWeekNumberFromDate(date) { const current = startOfDay(date); const anchor = new Date(2026, 1, 1); anchor.setHours(0, 0, 0, 0); const diffDays = Math.round((current.getTime() - anchor.getTime()) / MS_PER_DAY); return Math.max(1, Math.floor(diffDays / 7) + 1); }

    function getMostRecentSunday(date) { const d = new Date(date); d.setHours(12, 0, 0, 0); const day = d.getDay(); const thisSunday = new Date(d); thisSunday.setDate(d.getDate() - day); if (day !== 0) thisSunday.setDate(thisSunday.getDate() - 7); thisSunday.setHours(0, 0, 0, 0); return thisSunday; }

    function buildPeriods(mode, count, referenceDate = new Date(), fromDateInput = null, toDateInput = null) {
        const periods = []; const today = startOfDay(referenceDate);

        // Rolling Backfill: slice a From/To date+time window into fixed-size
        // sequential blocks (e.g. every 15 minutes) so a long historical gap
        // can be backfilled as a series of small, report-sized runs.
        if (mode === 'backfill') {
            const fromDate = fromDateInput instanceof Date ? startOfDay(fromDateInput) : parseDateInput(settings.dailyFromDate);
            const toDate = toDateInput instanceof Date ? startOfDay(toDateInput) : parseDateInput(settings.dailyToDate);

            if (!fromDate || !toDate) return [];

            const start = new Date(fromDate);
            start.setHours(parseInt(settings.hourFrom), parseInt(settings.minuteFrom), 0, 0);

            const end = new Date(toDate);
            end.setHours(parseInt(settings.hourTo), parseInt(settings.minuteTo), 0, 0);

            if (start.getTime() >= end.getTime()) {
                console.warn('Backfill Start is after End. No periods generated.');
                return [];
            }

            const interval = settings.backfillInterval || 15;
            let cursor = new Date(start);

            while (cursor.getTime() < end.getTime()) {
                let nextBlock = addMinutes(cursor, interval);
                if (nextBlock.getTime() > end.getTime()) nextBlock = new Date(end); // last block is clipped to the End time, may be shorter than `interval`

                periods.push({
                    startDate: new Date(cursor),
                    endDate: nextBlock,
                    label: `${formatDate(cursor)} ${pad2(cursor.getHours())}:${pad2(cursor.getMinutes())} - ${formatDate(nextBlock)} ${pad2(nextBlock.getHours())}:${pad2(nextBlock.getMinutes())}`,
                    weekNumber: getWeekNumberFromDate(cursor)
                });

                cursor = nextBlock;
            }
            return periods;
        }

        if (mode === 'daily') {
            const fromDate = fromDateInput instanceof Date ? startOfDay(fromDateInput) : parseDateInput(settings.dailyFromDate);
            const toDate = toDateInput instanceof Date ? startOfDay(toDateInput) : parseDateInput(settings.dailyToDate);
            if (!fromDate || !toDate || fromDate.getTime() > toDate.getTime()) return [];
            let current = new Date(fromDate);
            while (current.getTime() <= toDate.getTime()) { const dayStart = new Date(current); periods.push({ startDate: dayStart, endDate: addDays(dayStart, 1), label: formatRange(dayStart, addDays(dayStart, 1)), weekNumber: getWeekNumberFromDate(dayStart) }); current = addDays(current, 1); }
            return periods;
        }

        // Weekly: N complete Sunday-to-Sunday blocks ending at the most
        // recent Sunday on/before today.
        const n = Math.max(1, Math.min(99, Math.trunc(Number(count) || 1))); const thisSunday = getMostRecentSunday(today);
        for (let i = n; i >= 1; i--) { const startDate = new Date(thisSunday); startDate.setDate(thisSunday.getDate() - (7 * (i - 1))); const endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 7); periods.push({ startDate, endDate, label: formatRange(startDate, endDate), weekNumber: getWeekNumberFromDate(startDate) }); }
        return periods;
    }

    // =====================================================================
    // ANGULAR MATERIAL FORM AUTOMATION
    // =====================================================================
    // Angular Material inputs keep their own internal state; just writing
    // `.value` doesn't notify the framework. setNativeFieldValue uses the
    // native property setter (bypassing any overridden setter on the element)
    // then fires input/change/blur so Angular's change detection picks it up.

    function setNativeFieldValue(el, value) { if (!el) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; if (setter) setter.call(el, value); else el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return true; }
    // Used only for the date-range text inputs after we've already driven the
    // real calendar widget — these are read-only display mirrors, so we set
    // the visible text without re-triggering Angular's own date parsing.
    function setVisualOnlyValue(el, value) { if (!el) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; if (setter) setter.call(el, value); else el.value = value; el.setAttribute('value', value); return true; }

    function findFieldContainerByLabel(labelText) { const wanted = normalizeText(labelText).toLowerCase(); const labels = Array.from(document.querySelectorAll('mat-label, label, .mat-mdc-floating-label, .mdc-floating-label')); const label = labels.find(el => normalizeText(el.textContent).toLowerCase() === wanted); return label ? (label.closest('mat-form-field, .mat-mdc-form-field, .mat-form-field') || label.parentElement) : null; }

    async function setFieldByLabel(labelText, value) {
        const field = findFieldContainerByLabel(labelText); if (!field) return false; const formatted = pad2(value);
        const input = field.querySelector('input'); if (input) return setNativeFieldValue(input, formatted);
        const selectEl = field.querySelector('select'); if (selectEl) { selectEl.value = formatted; selectEl.dispatchEvent(new Event('input', { bubbles: true })); selectEl.dispatchEvent(new Event('change', { bubbles: true })); return true; }
        const trigger = field.querySelector('.mat-mdc-select-trigger, .mat-select-trigger, [role="combobox"], .mat-mdc-select'); if (!trigger) return false;
        trigger.click(); await sleep(150); const target = Array.from(document.querySelectorAll('mat-option, .mat-mdc-option')).find(opt => normalizeText(opt.textContent) === formatted); if (!target) return false; target.click(); await sleep(150); return true;
    }

    async function applyTimeSettingsToScreen() { await setFieldByLabel('Hour From', settings.hourFrom); await setFieldByLabel('Minute From', settings.minuteFrom); await setFieldByLabel('Hour To', settings.hourTo); await setFieldByLabel('Minute To', settings.minuteTo); }

    // --- Calendar (date-range picker) automation ---
    // The picker only accepts real clicks on its generated day buttons —
    // there's no form control we can just set a value on — so navigating to
    // the right month and clicking the right day is simulated end-to-end.

    function getVisibleCalendarMonthYear() { const periodButton = document.querySelector('.mat-calendar-period-button'); const text = normalizeText(periodButton?.textContent || ''); const match = text.match(/^([A-Za-z]+)\s+(\d{4})$/); if (!match) return null; const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(match[1].slice(0, 3).toLowerCase()); const year = Number(match[2]); if (monthIndex < 0 || Number.isNaN(year)) return null; return { monthIndex, year }; }
    function clickCalendarPrev() { const btn = document.querySelector('.mat-calendar-previous-button') || document.querySelector('button[aria-label*="Previous month"]'); if (btn) btn.click(); }
    function clickCalendarNext() { const btn = document.querySelector('.mat-calendar-next-button') || document.querySelector('button[aria-label*="Next month"]'); if (btn) btn.click(); }

    async function openCalendar() { const fromInput = document.querySelector('input[formcontrolname="from"]'); const toggleBtn = document.querySelector('mat-datepicker-toggle button') || document.querySelector('button[aria-label*="Open calendar"]'); if (fromInput) { fromInput.focus(); fromInput.click(); await sleep(120); } if (!document.querySelector('mat-datepicker-content, .mat-datepicker-content') && toggleBtn) { toggleBtn.click(); await sleep(180); } for (let i = 0; i < 10; i++) { if (document.querySelector('mat-datepicker-content, .mat-datepicker-content')) return true; await sleep(60); } return !!document.querySelector('mat-datepicker-content, .mat-datepicker-content'); }

    function parseCalendarLabelToDate(text) { const raw = normalizeText(text).replace(/^choose\s+/i, '').replace(/^select\s+/i, '').replace(/^(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*,\s*/i, ''); let m = raw.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})$/i); if (m) return new Date(Number(m[3]), MONTH_LOOKUP[m[1].toLowerCase()], Number(m[2])); m = raw.match(/^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(\d{4})$/i); if (m) return new Date(Number(m[3]), MONTH_LOOKUP[m[2].toLowerCase()], Number(m[1])); return null; }

    async function goToMonthYear(targetDate) { const targetMonthIndex = targetDate.getMonth(), targetYear = targetDate.getFullYear(); for (let i = 0; i < 18; i++) { if (abortRequested) return false; const visible = getVisibleCalendarMonthYear(); if (visible && visible.monthIndex === targetMonthIndex && visible.year === targetYear) return true; if (!visible) { await sleep(60); continue; } (visible.year * 12 + visible.monthIndex < targetYear * 12 + targetMonthIndex) ? clickCalendarNext() : clickCalendarPrev(); await sleep(90); } return false; }
    function findCalendarDateButton(targetDate) { const content = document.querySelector('mat-datepicker-content, .mat-datepicker-content'); if (!content) return null; const target = startOfDay(targetDate).getTime(); for (const btn of Array.from(content.querySelectorAll('button[aria-label], button'))) { const parsed = parseCalendarLabelToDate(btn.getAttribute('aria-label') || btn.textContent || ''); if (parsed && startOfDay(parsed).getTime() === target) return btn; } return null; }
    async function clickCalendarDate(targetDate) { for (let i = 0; i < 8; i++) { if (abortRequested) return false; if (!await goToMonthYear(targetDate)) await sleep(80); const button = findCalendarDateButton(targetDate); if (button) { button.click(); return true; } await sleep(80); } return false; }
    function closeCalendar() { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })); document.body.click(); }
    async function waitWhileSettingsOpen() { while (settingsOpen) await sleep(100); }

    async function setDateRangeByCalendar(fromDate, toDate) {
        if (!(fromDate instanceof Date) || !(toDate instanceof Date)) { console.warn('❌ Invalid date objects'); return false; }
        if (abortRequested) return false;
        await waitWhileSettingsOpen();
        const fromInput = document.querySelector('input[formcontrolname="from"]'); const toInput = document.querySelector('input[formcontrolname="to"]');
        if (!fromInput || !toInput) throw new Error('Date inputs not found');
        if (!await openCalendar()) { console.warn('❌ Calendar did not open'); return false; }
        if (abortRequested) return false;
        if (!await clickCalendarDate(fromDate)) { console.warn('❌ Failed selecting start date'); return false; } await sleep(150);
        if (abortRequested) return false;
        if (!await clickCalendarDate(toDate)) { console.warn('❌ Failed selecting end date'); return false; }
        await sleep(150); closeCalendar(); await sleep(120);
        setVisualOnlyValue(fromInput, formatDate(fromDate)); setVisualOnlyValue(toInput, formatDate(toDate));
        const mirror = document.querySelector('.mat-date-range-input-mirror'); if (mirror) mirror.textContent = `${formatDate(fromDate)} - ${formatDate(toDate)}`; return true;
    }

    // =====================================================================
    // REPORT DISCOVERY & SELECTION
    // =====================================================================

    function readCachedAvailableReports() { try { const raw = localStorage.getItem(REPORT_CACHE_KEY); const parsed = raw ? JSON.parse(raw) : []; return Array.isArray(parsed) ? parsed.filter(Boolean) : []; } catch (_) { return []; } }
    function cacheAvailableReports(list) { try { localStorage.setItem(REPORT_CACHE_KEY, JSON.stringify(list || [])); } catch (_) { } }
    function ensureSelectionDefaultsForReports(list) { const current = settings.selectedReports || {}; list.forEach(name => { if (typeof current[name] !== 'boolean') current[name] = true; }); settings.selectedReports = current; persistSettings(); }
    function reportNamesFallback() { return Array.from(new Set([...Object.keys(REPORT_POST_URLS_WEEKLY), ...Object.keys(REPORT_POST_URLS_DAILY), ...Object.keys(REPORT_POST_URLS_BACKFILL)])); }
    function getSelectedReportNames() { const source = availableReports.length ? availableReports : reportNamesFallback(); return source.filter(name => settings.selectedReports[name] !== false); }
    function getSavedReportRows() { return Array.from(document.querySelectorAll('tr[mat-row], tr.mat-mdc-row')).filter(r => r.querySelector('td.mat-column-Name, td.cdk-column-Name')); }

    async function clickSavedReportsTab() { const tabLabel = await waitForElement(() => Array.from(document.querySelectorAll('span.mdc-tab__text-label')).find(s => normalizeText(s.textContent).toUpperCase().includes(TAB_TEXT)), 20000); if (!tabLabel) throw new Error('SAVED REPORTS tab not found'); clickElement(tabLabel.closest('button, [role="tab], .mdc-tab') || tabLabel); await sleep(1000); }
    async function clickReportBuilderTab() { const tabLabel = await waitForElement(() => Array.from(document.querySelectorAll('span.mdc-tab__text-label')).find(s => normalizeText(s.textContent).toUpperCase().includes(REPORT_BUILDER_TEXT)), 15000); if (!tabLabel) return false; clickElement(tabLabel.closest('button, [role="tab"], .mdc-tab') || tabLabel); await sleep(1000); return true; }

    async function loadAvailableReportsFromScreen() {
        await clickSavedReportsTab(); const rows = await waitForElement(() => { const found = getSavedReportRows(); return found.length ? found : null; }, 25000);
        if (!rows || !rows.length) return availableReports.length ? availableReports : reportNamesFallback();
        availableReports = [...new Set(rows.map(r => normalizeText(r.querySelector('td.mat-column-Name, td.cdk-column-Name')?.textContent || '')).filter(Boolean))];
        cacheAvailableReports(availableReports); ensureSelectionDefaultsForReports(availableReports); return availableReports;
    }

    async function loadAvailableReportsAndNormalizeSettings() {
        try { availableReports = await loadAvailableReportsFromScreen(); } catch (err) { console.warn('Could not load reports from screen:', err); availableReports = readCachedAvailableReports(); if (!availableReports.length) availableReports = reportNamesFallback(); ensureSelectionDefaultsForReports(availableReports); }
    }

    async function openReport(reportName) { const row = await waitForElement(() => getSavedReportRows().find(r => { const nameCell = r.querySelector('td.mat-column-Name, td.cdk-column-Name'); return nameCell && normalizeText(nameCell.textContent) === reportName; }), 30000); if (!row) throw new Error(`Report row not found: ${reportName}`); const openBtn = Array.from(row.querySelectorAll('button, [role="button"], span')).find(el => normalizeText(el.textContent).toUpperCase().includes(OPEN_REPORT_TEXT)); if (!openBtn) throw new Error(`OPEN REPORT not found for: ${reportName}`); clickElement(openBtn.closest('button, [role="button"]') || openBtn); await sleep(1500); }

    async function clickRun() { const runBtnEl = await waitForElement(() => Array.from(document.querySelectorAll('button, [role="button"], span')).find(el => normalizeText(el.textContent).toUpperCase() === RUN_TEXT || normalizeText(el.textContent).toUpperCase().includes(` ${RUN_TEXT} `)), 20000); if (!runBtnEl) throw new Error('RUN button not found'); clickElement(runBtnEl.closest('button, [role="button"]') || runBtnEl); await sleep(1000); }

    // Waits for the result table to finish streaming in. Angular re-renders
    // the table multiple times as rows arrive, so grabbing the first render
    // would often capture a partial result. This waits for the row markup to
    // stay byte-identical across 3 consecutive checks (1.5s) before trusting
    // it, and treats an early "0 row(s)" footer with extra suspicion since
    // that message can appear transiently before real data lands.
    async function waitForTableRows() {
        const tbody = await waitForElement(() => document.querySelector('tbody[role="rowgroup"]'), 120000);
        if (!tbody) throw new Error(abortRequested ? 'Aborted' : 'Result table body not found');

        await sleep(2000); // grace period: let the table structure settle before evaluating it

        let lastSignature = '', stableCount = 0, firstRowSeen = false, start = Date.now();
        let zeroRowStableCount = 0;

        while (true) {
            if (abortRequested) throw new Error('Aborted');

            const footer = document.querySelector('tr.mat-mdc-footer-row, tr[mat-footer-row]');
            const footerText = footer ? normalizeText(footer.innerText) : '';
            const isZeroRows = footerText.includes('0 row(s)');

            if (isZeroRows) {
                zeroRowStableCount++;
                // Only trust "0 row(s)" once it's held for 3+ checks, we've
                // waited 5+ seconds total, and we never saw a row appear.
                if (!firstRowSeen && (Date.now() - start > 5000) && zeroRowStableCount >= 3) {
                    console.log('[PAK] Confirmed empty table (stable 0 rows after waiting 5+ seconds)');
                    return [];
                }
            } else {
                zeroRowStableCount = 0;
            }

            if (Date.now() - start > 120000) throw new Error('Result table did not load within 120s');

            const rows = Array.from(tbody.querySelectorAll('tr.mat-mdc-row, tr[mat-row]'));

            if (rows.length > 0 && !firstRowSeen) {
                firstRowSeen = true;
                start = Date.now(); // restart the timeout budget — now waiting for stability, not first data
            }

            if (firstRowSeen) {
                const signature = rows.map(r => normalizeText(r.innerText)).join('||');
                if (signature && signature === lastSignature) {
                    if (++stableCount >= 3) return rows;
                } else {
                    stableCount = 0;
                    lastSignature = signature;
                }
            }

            await sleep(500);
        }
    }

    function detectFirstColIsBonus() {
        const headerRow = document.querySelector('thead tr, tr.mat-mdc-header-row, tr[mat-header-row]');
        if (!headerRow) return false;
        const firstTh = headerRow.querySelector('th');
        if (!firstTh) return false;
        return normalizeKey(firstTh.textContent) === 'bonus';
    }

    function rowsToData(rows, weekNumber, rangeText, reportName, prefixFirstCol) {
        return rows.map(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            const values = cells.map((cell, idx) => {
                const v = normalizeText(cell.textContent);
                return (idx === 0 && prefixFirstCol) ? `'${v}` : v; // leading apostrophe forces Sheets/Excel to keep e.g. "0123" as text, not a number
            });
            while (values.length < 7) values.push('');
            values.length = 7;
            values.push(String(weekNumber), rangeText, reportName);
            return values;
        });
    }

    function saveReport(reportName, dataRows, weekNumber) { storedReports.push({ reportName, weekNumber, savedAt: new Date().toISOString(), rows: dataRows }); persistStoredReports(); }
    function createBlankRow() { return Array(FIXED_COLS).fill(''); }

    function buildCombinedRows() { const combined = []; storedReports.forEach((report, index) => { if (index > 0) combined.push(createBlankRow()); report.rows.forEach(row => { const fixedRow = Array.from(row); while (fixedRow.length < FIXED_COLS) fixedRow.push(''); fixedRow.length = FIXED_COLS; combined.push(fixedRow); }); }); return combined; }

    // =====================================================================
    // EXPORT: CSV / TSV / CLIPBOARD / DOWNLOAD
    // =====================================================================

    function escapeCSV(value) { const text = value == null ? '' : String(value); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
    function escapeTSV(value) { return String(value == null ? '' : value).replace(/\r?\n/g, ' ').replace(/\t/g, ' '); }
    function buildCSVFromStoredReports() { return buildCombinedRows().map(row => row.map(escapeCSV).join(',')).join('\r\n'); }
    function buildTSVFromStoredReports() { return buildCombinedRows().map(row => row.map(escapeTSV).join('\t')).join('\n'); }
    function buildTSVFromRows(rows) { return rows.map(row => row.map(escapeTSV).join('\t')).join('\n'); }
    function buildCSVFromRows(rows) { return rows.map(row => row.map(escapeCSV).join(',')).join('\r\n'); }

    async function copyText(text) { if (typeof GM_setClipboard === 'function') { GM_setClipboard(text); return; } if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; } const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }

    function downloadCSV(csvText, fileName = null) {
        const stamp = fileName ? '' : new Date().toISOString().replace(/[:.]/g, '-');
        const name = fileName || `BonusHub_Combined_${stamp}.csv`;
        const safeName = fileName ? fileName.replace(/[\\/:*?"<>|]/g, '-') : name;
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = safeName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    // =====================================================================
    // GOOGLE SHEETS POSTING
    // =====================================================================

    function postToGoogleSheet(tsvText, webAppUrl) { return new Promise((resolve, reject) => { if (!webAppUrl || !webAppUrl.trim()) { reject(new Error('Google Sheet Web App URL is not set for this report')); return; } GM_xmlhttpRequest({ method: 'POST', url: webAppUrl, timeout: 30000, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, data: tsvText, onload: resp => { (resp.status >= 200 && resp.status < 300) ? resolve(resp.responseText || 'OK') : reject(new Error(`HTTP ${resp.status}: ${resp.responseText}`)); }, onerror: () => reject(new Error('Network error posting to Google Sheets')), ontimeout: () => reject(new Error('Request timeout after 30s')) }); }); }

    function findUrlInMap(map, reportName) { const key = normalizeKey(reportName); for (const [name, url] of Object.entries(map)) { if (normalizeKey(name) === key) return url; } return ''; }
    function getPostUrlForReport(reportName) {
        const urlMap = settings.reportMode === 'daily' ? REPORT_POST_URLS_DAILY
            : settings.reportMode === 'backfill' ? REPORT_POST_URLS_BACKFILL
                : REPORT_POST_URLS_WEEKLY;
        return findUrlInMap(urlMap, reportName) || '';
    }

    // =====================================================================
    // CORE AUTOMATION PIPELINE
    // =====================================================================

    async function processSingleReport(reportName, period, periodIndex, periodTotal, shouldPost) {
        try {
            if (abortRequested) return;

            setOverlay('Running report', `Period ${periodIndex + 1}/${periodTotal}: ${period.label} | ${reportName} → opening saved report`);
            await clickSavedReportsTab();
            if (abortRequested) return;

            setOverlay('Running report', `Period ${periodIndex + 1}/${periodTotal}: ${period.label} | ${reportName} → opening report`);
            await openReport(reportName);
            if (abortRequested) return;

            setOverlay('Running report', `Period ${periodIndex + 1}/${periodTotal}: ${period.label} | ${reportName} → setting date range`);
            await setDateRangeByCalendar(period.startDate, period.endDate);
            if (abortRequested) return;

            // Backfill periods carry their own precise start/end minute; every
            // other mode uses the single Time Range configured in Settings.
            if (settings.reportMode === 'backfill') {
                await setFieldByLabel('Hour From', period.startDate.getHours());
                await setFieldByLabel('Minute From', period.startDate.getMinutes());
                await setFieldByLabel('Hour To', period.endDate.getHours());
                await setFieldByLabel('Minute To', period.endDate.getMinutes());
            } else {
                await applyTimeSettingsToScreen();
            }

            if (abortRequested) return;

            setOverlay('Running report', `Period ${periodIndex + 1}/${periodTotal}: ${period.label} | ${reportName} → clicking RUN`);
            await clickRun();
            if (abortRequested) return;

            setOverlay('Running report', `Period ${periodIndex + 1}/${periodTotal}: ${period.label} | ${reportName} → waiting for result table`);
            const rows = await waitForTableRows();
            if (abortRequested) return;

            setOverlay('Running report', `Period ${periodIndex + 1}/${periodTotal}: ${period.label} | ${reportName} → saving rows`);
            let dataRows = [];

            if (rows.length === 0) {
                const emptyRow = ['[ EMPTY TABLE ]', '[ EMPTY TABLE ]', '', '', '', '', ''];
                emptyRow.push(String(period.weekNumber), period.label, reportName);
                dataRows = [emptyRow];
            } else {
                const prefixFirstCol = detectFirstColIsBonus();
                dataRows = rowsToData(rows, period.weekNumber, period.label, reportName, prefixFirstCol);
            }

            saveReport(reportName, dataRows, period.weekNumber);

            if (shouldPost) {
                const postUrl = getPostUrlForReport(reportName);
                if (postUrl) {
                    try {
                        if (abortRequested) return;
                        setOverlay('Posting to Google Sheets...', `${period.label} | ${reportName} → sending TSV to its sheet`);
                        await postToGoogleSheet(buildTSVFromRows(dataRows), postUrl);
                    } catch (err) {
                        console.warn(`Posting failed for ${reportName}:`, err);
                        setOverlay('Post failed', `${period.label} | ${reportName} → ${err.message || 'unknown error'}`);
                        await sleep(900);
                    }
                } else { console.warn(`No post URL mapped for: ${reportName}`); }
            }
        } catch (err) {
            if (abortRequested) return;
            console.error(`[PAK] Fatal error on ${reportName} (${period.label}):`, err);
            setOverlay('Error skipped', `${period.label} | ${reportName} → ${err.message}`);
            await sleep(1200);
        }
    }

    async function processRun(overridePeriods = null) {
        const names = getSelectedReportNames();
        if (!names.length) throw new Error('Please select at least one report in Settings.');

        const periods = overridePeriods || buildPeriods(settings.reportMode, settings.periodCount);

        if (!periods.length) throw new Error('No periods generated. Check your Date/Time settings.');
        const shouldPost = settings.postEnabled === true;
        const totalExpected = periods.length * names.length;
        let aborted = false;

        outerLoop:
        for (let p = 0; p < periods.length; p++) {
            for (let r = 0; r < names.length; r++) {
                if (abortRequested) { aborted = true; break outerLoop; }
                await processSingleReport(names[r], periods[p], p, periods.length, shouldPost);
                if (abortRequested) { aborted = true; break outerLoop; }
            }
        }

        setOverlay('Finishing...', 'Building combined TSV clipboard text and CSV export');
        await copyText(buildTSVFromStoredReports());

        const exportMode = settings.exportMode || { combined: true, individual: true };

        if (exportMode.combined) {
            downloadCSV(buildCSVFromStoredReports());
        }

        if (exportMode.individual) {
            const count = storedReports.length;
            if (count > 0) {
                setOverlay('Finishing...', 'Grouping data and downloading individual report CSV(s)...');

                const groupedData = {};
                storedReports.forEach((report) => {
                    const name = report.reportName;
                    if (!groupedData[name]) groupedData[name] = [];
                    if (groupedData[name].length > 0) groupedData[name].push(createBlankRow());
                    groupedData[name].push(...report.rows);
                });

                for (const [reportName, rows] of Object.entries(groupedData)) {
                    const csvText = buildCSVFromRows(rows);
                    const safeName = reportName.replace(/[\\/:*?"<>|]/g, '-');
                    downloadCSV(csvText, `${safeName}.csv`);
                    await sleep(500);
                }
            }
        }

        const successCount = storedReports.length;

        if (aborted) {
            setOverlay('Aborted', successCount > 0
                ? `Saved ${successCount} report(s) before abort. Data copied & downloaded.`
                : 'Aborted – no data was collected.');
            return;
        }

        if (successCount === 0) {
            throw new Error('All reports failed to process.');
        } else if (successCount < totalExpected) {
            setOverlay('Partial Success', `Saved ${successCount}/${totalExpected} reports. Copied available data.`);
        } else {
            setOverlay('Done', shouldPost ? 'Copied TSV, downloaded CSV, and posted mapped reports' : 'Copied TSV and downloaded CSV');
        }
    }

    async function runSequence() {
        if (controlsDisabled) return;
        setControlsDisabled(true);
        const originalRunText = runBtn.innerHTML;
        runBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Running...';
        showOverlay('Running reports...', 'Preparing');

        const originalSettings = JSON.parse(JSON.stringify(settings));
        let isRolling = false;
        let manualPeriods = null;

        try {
            // Auto-Run "Rolling" mode overrides the configured period with a
            // single just-closed interval block (e.g. the last 15 minutes),
            // computed fresh every time this fires — see calculateNextRun's
            // rolling branch for how the schedule itself is derived.
            if (autoRunSettings.enabled && autoRunSettings.mode === 'rolling') {
                isRolling = true;
                const intervalMins = parseInt(autoRunSettings.rollingMinutes) || 15;
                const now = new Date();

                const totalMinutes = (now.getHours() * 60) + now.getMinutes();
                const blockEndMinutes = Math.floor(totalMinutes / intervalMins) * intervalMins;

                const end = new Date(now);
                end.setHours(Math.floor(blockEndMinutes / 60), blockEndMinutes % 60, 0, 0);

                const start = new Date(end.getTime() - (intervalMins * 60000));

                manualPeriods = [{
                    startDate: start,
                    endDate: end,
                    label: `${formatDate(start)} ${pad2(start.getHours())}:${pad2(start.getMinutes())} - ${formatDate(end)} ${pad2(end.getHours())}:${pad2(end.getMinutes())}`,
                    weekNumber: getWeekNumberFromDate(end)
                }];

                settings.hourFrom = pad2(start.getHours());
                settings.minuteFrom = pad2(start.getMinutes());
                settings.hourTo = pad2(end.getHours());
                settings.minuteTo = pad2(end.getMinutes());

                console.log(`[Rolling Mode] Manual Range: ${manualPeriods[0].label}`);
            }

            resetStoredReports();

            if (!(await waitForPageReady())) throw new Error('Page did not finish loading in time.');
            if (!availableReports.length) await loadAvailableReportsAndNormalizeSettings();

            await processRun(manualPeriods);

            runBtn.innerHTML = abortRequested
                ? '<i class="fa-solid fa-triangle-exclamation"></i> Aborted'
                : '<i class="fa-solid fa-check"></i> Copied';
        } catch (err) {
            const exportMode = settings.exportMode || { combined: true, individual: true };

            if (abortRequested) {
                if (storedReports.length > 0) {
                    await copyText(buildTSVFromStoredReports());
                    if (exportMode.combined) downloadCSV(buildCSVFromStoredReports());
                }
                setOverlay('Aborted', storedReports.length > 0
                    ? `Saved ${storedReports.length} report(s) before abort. Data copied & downloaded.`
                    : 'Aborted – no data was collected.');
                runBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Aborted';
            } else {
                console.error(err);
                setOverlay('Failed', err.message || 'Sequence failed');
                runBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Failed';

                if (storedReports.length > 0) {
                    await copyText(buildTSVFromStoredReports());
                    if (exportMode.combined) downloadCSV(buildCSVFromStoredReports());
                    runBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Partial';
                }

                alert(err.message || 'Sequence failed');
            }
        } finally {
            if (isRolling) Object.assign(settings, originalSettings);

            resetStoredReports();

            if (autoRunSettings.enabled) {
                // Reload for a clean SPA state before the next scheduled run.
                setTimeout(() => { location.reload(); }, 2000);
            } else {
                setTimeout(() => { hideOverlay(); runBtn.innerHTML = originalRunText; setControlsDisabled(false); }, 1500);
            }
        }
    }

    // =====================================================================
    // SETTINGS MODAL
    // =====================================================================

    function ensureSettingsModal() {
        if (settingsModalEl) return settingsModalEl;

        settingsModalEl = document.createElement('div');
        settingsModalEl.id = SETTINGS_OVERLAY_ID;
        settingsModalEl.className = 'pak-ui pak-modal-backdrop';

        settingsModalEl.innerHTML = `
    <div class="pak-modal">
        <div class="pak-modal-head">
            <div>
                <div class="pak-modal-title">Bonus Hub Settings</div>
                <div class="pak-modal-subtitle">Choose a date-range mode, which reports to run, whether to post to Sheets, and (optionally) an unattended schedule.</div>
            </div>
            <button type="button" data-close class="pak-btn-secondary">Close</button>
        </div>

        <div class="pak-grid">

            <!-- COLUMN 1: DATE RANGE MODE -->
            <div class="pak-card">
                <div class="pak-card-title">
                    <span class="pak-card-title-text">Date Range Mode</span>
                </div>

                <label class="pak-radio-row">
                    <input type="radio" name="pak-report-mode" value="weekly" data-report-mode-weekly />
                    <span>Weekly</span>
                    <i class="pak-help" title="Runs N complete Sunday-to-Sunday weeks, ending on the most recent Sunday.">?</i>
                </label>

                <label class="pak-radio-row">
                    <input type="radio" name="pak-report-mode" value="daily" data-report-mode-daily />
                    <span>Daily</span>
                    <i class="pak-help" title="Runs one report per calendar day between two dates you pick.">?</i>
                </label>

                <label class="pak-radio-row">
                    <input type="radio" name="pak-report-mode" value="backfill" data-report-mode-backfill />
                    <span>Rolling Backfill</span>
                    <i class="pak-help" title="Slices a date/time window into fixed-size sequential blocks (e.g. every 15 minutes) — for catching up on missed history.">?</i>
                </label>

                <div data-weekly-count-section>
                    <label class="pak-field-label"><span data-count-label>Weeks to run</span></label>
                    <input type="number" min="1" max="99" step="1" data-period-count class="pak-input" />
                    <div class="pak-hint">Weekly runs complete Sunday-to-Sunday blocks.</div>
                </div>

                <div data-daily-range-section class="pak-hidden" style="margin-top: 8px;">
                    <div class="pak-date-grid">
                        <label style="display:grid; gap:4px;">
                            <span class="pak-field-label" data-label-from>From Date</span>
                            <input data-daily-from-date type="date" class="pak-input pak-input-light" />
                        </label>
                        <label style="display:grid; gap:4px;">
                            <span class="pak-field-label" data-label-to>To Date</span>
                            <input data-daily-to-date type="date" class="pak-input pak-input-light" />
                        </label>
                    </div>

                    <div id="pak-daily-hint" class="pak-hint">Daily mode uses the exact date range you choose here.</div>

                    <div id="pak-backfill-section" class="pak-hidden" style="margin-top: 12px; border-top: 1px solid var(--pak-border); padding-top: 8px;">
                        <label class="pak-field-label" style="display:flex; align-items:center; gap:6px;">
                            Interval (Minutes)
                            <i class="pak-help" title="How long each backfilled block is. A 4-hour window with a 15-minute interval produces 16 sequential reports.">?</i>
                        </label>
                        <input type="number" min="1" max="1440" step="1" data-backfill-interval class="pak-input" />
                        <div class="pak-hint">Generates sequential reports based on the Start and End date/times.</div>
                    </div>
                </div>
            </div>

            <!-- COLUMN 2: POSTING + EXPORT MODE -->
            <div style="grid-column: 2 / 3; grid-row: 1; height:100%; display:flex; flex-direction:column; gap:10px;">

                <div class="pak-card" style="flex:1;">
                    <div class="pak-card-title">
                        <span class="pak-card-title-text">Posting <i class="pak-help" title="Sends each report's TSV data to its mapped Google Sheet immediately after it finishes running. Reports without a mapping still run and save locally — they just won't post anywhere.">?</i></span>
                        <label class="pak-switch">
                            <input type="checkbox" id="pak-posting-enabled-check" data-post-enabled>
                            <span class="pak-slider"></span>
                        </label>
                    </div>
                    <div id="pak-posting-controls" class="pak-dimmed">
                        <div style="font-size: 12px; margin-bottom: 4px;">Post to Google Sheets after each report</div>
                        <div class="pak-hint">Only mapped reports will actually post. Unmapped reports will still run and save.</div>
                    </div>
                </div>

                <div class="pak-card" style="flex:1;">
                    <div class="pak-card-title">
                        <span class="pak-card-title-text">Export Mode <i class="pak-help" title="Combined = one CSV with every report stacked, separated by blank rows. Individual = one CSV file per report. Both can be on at once.">?</i></span>
                    </div>
                    <div class="pak-export-options">
                        <label class="pak-checkbox-row">
                            <input type="checkbox" name="pak-export-combined" data-export-combined checked>
                            <span>Combined Report</span>
                        </label>
                        <label class="pak-checkbox-row">
                            <input type="checkbox" name="pak-export-individual" data-export-individual checked>
                            <span>Individual Reports</span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- COLUMN 3: AUTO RUN -->
            <div class="pak-card" style="grid-column: 3; grid-row: 1 / span 2; align-self:start;">
                <div class="pak-card-title">
                    <span class="pak-card-title-text">Auto Run <i class="pak-help" title="Runs this script (or the site's native RUN button) on an unattended schedule, with no need to keep clicking RUN yourself.">?</i></span>
                    <label class="pak-switch">
                        <input type="checkbox" id="pak-autorun-enabled-check">
                        <span class="pak-slider"></span>
                    </label>
                </div>

                <div id="pak-autorun-controls" class="pak-dimmed">
                    <div style="margin-bottom:8px;">
                        <label class="pak-field-label" style="display:flex; align-items:center; gap:6px;">Target Action
                            <i class="pak-help" title="'Current Report' clicks the site's own RUN button on whatever report is on screen. 'All Selected Reports' runs this script's full sequence (Saved Reports list below).">?</i>
                        </label>
                        <select id="pak-autorun-target-select" class="pak-select">
                            <option value="native">Current Report (On Screen ONLY)</option>
                            <option value="script">All Selected Reports (Below Selected Saved Reports)</option>
                        </select>
                    </div>

                    <div style="margin-bottom:8px;">
                        <label class="pak-field-label">Schedule Mode</label>
                        <select id="pak-autorun-mode-select" class="pak-select">
                            <option value="time">Specific Minutes (HH:MM)</option>
                            <option value="interval">Interval (Timer)</option>
                            <option value="rolling">Rolling Interval</option>
                        </select>
                    </div>

                    <div id="pak-autorun-section-time" class="pak-hidden">
                        <label class="pak-field-label">Minutes (e.g. 1, 15, 30)</label>
                        <input type="text" id="pak-autorun-time-input" class="pak-input" value="1">
                    </div>

                    <div id="pak-autorun-section-interval" class="pak-hidden">
                        <div style="margin-bottom:8px;">
                            <label class="pak-field-label">Interval (Minutes)</label>
                            <input type="number" id="pak-autorun-interval-input" class="pak-input" value="60">
                        </div>

                        <div style="margin-bottom:8px;">
                            <label class="pak-field-label">Start Strategy</label>
                            <div style="display:flex; gap:10px; font-size:12px;">
                                <label><input type="radio" name="pak-autorun-start" value="now" checked> Start Now</label>
                                <label><input type="radio" name="pak-autorun-start" value="minute"> Specific Minute</label>
                            </div>
                        </div>

                        <div id="pak-autorun-specific-minute-group" class="pak-hidden" style="margin-bottom:8px;">
                            <label class="pak-field-label">Start at Minute (0-59)</label>
                            <input type="number" id="pak-autorun-start-minute-input" min="0" max="59" class="pak-input">
                        </div>
                    </div>

                    <div id="pak-autorun-section-rolling" class="pak-hidden">
                        <div style="margin-bottom:4px;">
                            <label class="pak-field-label">Rolling Interval</label>
                            <select id="pak-autorun-rolling-select" class="pak-select">
                                <option value="5">5 Minutes</option>
                                <option value="10">10 Minutes</option>
                                <option value="15" selected>15 Minutes</option>
                                <option value="30">30 Minutes</option>
                                <option value="60">1 Hour</option>
                            </select>
                        </div>
                        <div style="margin-top:8px;">
                            <label class="pak-field-label" style="display:flex; align-items:center; gap:6px;">Run Delay (Minutes)
                                <i class="pak-help" title="Waits this long after a window closes before running, so the source data has time to finalize. E.g. with a 15-min interval and 1-min delay, the 10:45-11:00 window runs at 11:01.">?</i>
                            </label>
                            <select id="pak-autorun-rolling-delay-select" class="pak-select">
                                <option value="1" selected>1 Minute</option>
                                <option value="2">2 Minutes</option>
                                <option value="3">3 Minutes</option>
                                <option value="4">4 Minutes</option>
                                <option value="5">5 Minutes</option>
                                <option value="6">6 Minutes</option>
                                <option value="7">7 Minutes</option>
                                <option value="8">8 Minutes</option>
                                <option value="9">9 Minutes</option>
                                <option value="10">10 Minutes</option>
                                <option value="11">11 Minutes</option>
                                <option value="12">12 Minutes</option>
                                <option value="13">13 Minutes</option>
                                <option value="14">14 Minutes</option>
                                <option value="15">15 Minutes</option>
                            </select>
                        </div>
                        <div class="pak-hint">Automatically sets the date/time range to the last X minutes based on the interval above.</div>
                    </div>
                </div>
            </div>

            <!-- TIME RANGE -->
            <div class="pak-card" style="grid-column: 1 / 3;">
                <div class="pak-card-title" id="pak-time-range-title">Time Range</div>
                <div class="pak-time-grid">
                    <label style="display:grid; gap:4px;">
                        <span class="pak-field-label" data-label-hour-from>Hour From</span>
                        <input data-hour-from type="number" min="0" max="23" step="1" inputmode="numeric" class="pak-input pak-input-light" />
                    </label>
                    <label style="display:grid; gap:4px;">
                        <span class="pak-field-label" data-label-minute-from>Minute From</span>
                        <input data-minute-from type="number" min="0" max="59" step="1" inputmode="numeric" class="pak-input pak-input-light" />
                    </label>
                    <label style="display:grid; gap:4px;">
                        <span class="pak-field-label" data-label-hour-to>Hour To</span>
                        <input data-hour-to type="number" min="0" max="23" step="1" inputmode="numeric" class="pak-input pak-input-light" />
                    </label>
                    <label style="display:grid; gap:4px;">
                        <span class="pak-field-label" data-label-minute-to>Minute To</span>
                        <input data-minute-to type="number" min="0" max="59" step="1" inputmode="numeric" class="pak-input pak-input-light" />
                    </label>
                </div>
            </div>

            <!-- SAVED REPORTS -->
            <div class="pak-card" style="grid-column: 1 / -1;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom: 6px;">
                    <div class="pak-card-title" style="margin-bottom:0;">Saved reports</div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button type="button" data-select-all class="pak-mini-btn">Select all</button>
                        <button type="button" data-select-none class="pak-mini-btn">Select none</button>
                    </div>
                </div>

                <div class="pak-hint" style="margin-bottom: 6px;">This list refreshes automatically when Settings opens. Only checked reports run.</div>

                <div data-report-list class="pak-report-list">
                    <div data-report-loading class="pak-loading-row">
                        <div class="pak-spinner"></div>
                        <div style="font-size: 12px;">Loading saved reports...</div>
                    </div>
                </div>
            </div>
        </div>

        <div data-error class="pak-error-line"></div>

        <div class="pak-modal-footer">
            <button type="button" id="pak-clear-data-btn" title="Clear background run data — click if the tab feels slow." class="pak-icon-btn">
                <i class="fa-solid fa-trash-can"></i>
            </button>

            <div style="display:flex; gap:8px;">
                <button type="button" data-cancel class="pak-btn-secondary">Cancel</button>
                <button type="button" data-save class="pak-btn-save">Save</button>
            </div>
        </div>
    </div>
`;

        document.body.appendChild(settingsModalEl);

        settingsEls = {
            overlay: settingsModalEl,
            closeBtn: settingsModalEl.querySelector('[data-close]'),
            cancelBtn: settingsModalEl.querySelector('[data-cancel]'),
            saveBtn: settingsModalEl.querySelector('[data-save]'),
            postEnabledCheckbox: settingsModalEl.querySelector('[data-post-enabled]'),
            reportModeWeekly: settingsModalEl.querySelector('[data-report-mode-weekly]'),
            reportModeDaily: settingsModalEl.querySelector('[data-report-mode-daily]'),
            reportModeBackfill: settingsModalEl.querySelector('[data-report-mode-backfill]'),
            weeklyCountSection: settingsModalEl.querySelector('[data-weekly-count-section]'),
            dailyRangeSection: settingsModalEl.querySelector('[data-daily-range-section]'),
            dailyHint: settingsModalEl.querySelector('#pak-daily-hint'),
            backfillSection: settingsModalEl.querySelector('#pak-backfill-section'),
            periodCountInput: settingsModalEl.querySelector('[data-period-count]'),
            countLabel: settingsModalEl.querySelector('[data-count-label]'),
            dailyFromDateInput: settingsModalEl.querySelector('[data-daily-from-date]'),
            dailyToDateInput: settingsModalEl.querySelector('[data-daily-to-date]'),
            hourFromInput: settingsModalEl.querySelector('[data-hour-from]'),
            minuteFromInput: settingsModalEl.querySelector('[data-minute-from]'),
            hourToInput: settingsModalEl.querySelector('[data-hour-to]'),
            minuteToInput: settingsModalEl.querySelector('[data-minute-to]'),
            backfillIntervalInput: settingsModalEl.querySelector('[data-backfill-interval]'),
            reportList: settingsModalEl.querySelector('[data-report-list]'),
            selectAllBtn: settingsModalEl.querySelector('[data-select-all]'),
            selectNoneBtn: settingsModalEl.querySelector('[data-select-none]'),
            errorEl: settingsModalEl.querySelector('[data-error]'),
            clearDataBtn: settingsModalEl.querySelector('#pak-clear-data-btn'),
            exportCombinedCheckbox: settingsModalEl.querySelector('[data-export-combined]'),
            exportIndividualCheckbox: settingsModalEl.querySelector('[data-export-individual]'),
            postingCheck: settingsModalEl.querySelector('#pak-posting-enabled-check'),
            postingControls: settingsModalEl.querySelector('#pak-posting-controls'),
            labelFromDate: settingsModalEl.querySelector('[data-label-from]'),
            labelToDate: settingsModalEl.querySelector('[data-label-to]'),
            labelHourFrom: settingsModalEl.querySelector('[data-label-hour-from]'),
            labelMinuteFrom: settingsModalEl.querySelector('[data-label-minute-from]'),
            labelHourTo: settingsModalEl.querySelector('[data-label-hour-to]'),
            labelMinuteTo: settingsModalEl.querySelector('[data-label-minute-to]'),
            timeRangeTitle: settingsModalEl.querySelector('#pak-time-range-title')
        };

        const autoRunEls = {
            enabledCheck: settingsModalEl.querySelector('#pak-autorun-enabled-check'),
            controlsDiv: settingsModalEl.querySelector('#pak-autorun-controls'),
            targetSelect: settingsModalEl.querySelector('#pak-autorun-target-select'),
            modeSelect: settingsModalEl.querySelector('#pak-autorun-mode-select'),
            sectionTime: settingsModalEl.querySelector('#pak-autorun-section-time'),
            sectionInterval: settingsModalEl.querySelector('#pak-autorun-section-interval'),
            sectionRolling: settingsModalEl.querySelector('#pak-autorun-section-rolling'),
            timeInput: settingsModalEl.querySelector('#pak-autorun-time-input'),
            intervalInput: settingsModalEl.querySelector('#pak-autorun-interval-input'),
            rollingSelect: settingsModalEl.querySelector('#pak-autorun-rolling-select'),
            rollingDelaySelect: settingsModalEl.querySelector('#pak-autorun-rolling-delay-select'),
            specificMinuteGroup: settingsModalEl.querySelector('#pak-autorun-specific-minute-group'),
            startMinuteInput: settingsModalEl.querySelector('#pak-autorun-start-minute-input')
        };

        Object.assign(settingsEls, autoRunEls);

        // --- Event Listeners ---

        settingsEls.closeBtn.addEventListener('click', closeSettingsPanel);
        settingsEls.cancelBtn.addEventListener('click', closeSettingsPanel);
        settingsEls.saveBtn.addEventListener('click', saveSettingsPanel);
        settingsEls.reportModeWeekly.addEventListener('change', onReportModeChanged);
        settingsEls.reportModeDaily.addEventListener('change', onReportModeChanged);
        settingsEls.reportModeBackfill.addEventListener('change', onReportModeChanged);
        settingsEls.selectAllBtn.addEventListener('click', () => setAllReportSelections(true));
        settingsEls.selectNoneBtn.addEventListener('click', () => setAllReportSelections(false));
        settingsEls.clearDataBtn.addEventListener('click', () => {
            resetStoredReports();
            alert('Run data cleared. Memory is now free.');
        });

        settingsModalEl.addEventListener('click', e => {
            if (e.target === settingsModalEl) closeSettingsPanel();
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && settingsOpen) closeSettingsPanel();
        });

        // At least one export mode must stay on, otherwise nothing gets saved to disk.
        settingsEls.exportCombinedCheckbox.addEventListener('change', function () {
            if (!this.checked && !settingsEls.exportIndividualCheckbox.checked) {
                settingsEls.exportIndividualCheckbox.checked = true;
                showToast('One export mode must be selected');
            }
        });

        settingsEls.exportIndividualCheckbox.addEventListener('change', function () {
            if (!this.checked && !settingsEls.exportCombinedCheckbox.checked) {
                settingsEls.exportCombinedCheckbox.checked = true;
                showToast('One export mode must be selected');
            }
        });

        settingsEls.enabledCheck.addEventListener('change', (e) => {
            const controls = settingsEls.controlsDiv;
            const isEnabled = e.target.checked;
            controls.classList.toggle('pak-dimmed', !isEnabled);

            const mode = settingsEls.modeSelect.value;
            if (mode === 'rolling') toggleDateInputsDisabled(isEnabled);
        });

        settingsEls.modeSelect.addEventListener('change', (e) => {
            const mode = e.target.value;
            settingsEls.sectionTime.classList.add('pak-hidden');
            settingsEls.sectionInterval.classList.add('pak-hidden');
            settingsEls.sectionRolling.classList.add('pak-hidden');

            if (mode === 'time') settingsEls.sectionTime.classList.remove('pak-hidden');
            else if (mode === 'interval') settingsEls.sectionInterval.classList.remove('pak-hidden');
            else if (mode === 'rolling') settingsEls.sectionRolling.classList.remove('pak-hidden');

            const isAutoRunEnabled = settingsEls.enabledCheck.checked;
            toggleDateInputsDisabled(mode === 'rolling' && isAutoRunEnabled);
        });

        settingsModalEl.querySelectorAll('input[name="pak-autorun-start"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                settingsEls.specificMinuteGroup.classList.toggle('pak-hidden', e.target.value !== 'minute');
            });
        });

        if (settingsEls.postingCheck && settingsEls.postingControls) {
            settingsEls.postingCheck.addEventListener('change', (e) => {
                settingsEls.postingControls.classList.toggle('pak-dimmed', !e.target.checked);
            });
        }

        return settingsModalEl;
    }

    // Rolling Auto-Run drives the date/time range itself, so those inputs
    // are locked (not hidden — you can still see what will be used) while
    // that combination is active.
    function toggleDateInputsDisabled(disabled) {
        const inputs = [
            settingsEls.reportModeWeekly, settingsEls.reportModeDaily, settingsEls.reportModeBackfill,
            settingsEls.periodCountInput,
            settingsEls.dailyFromDateInput, settingsEls.dailyToDateInput,
            settingsEls.hourFromInput, settingsEls.minuteFromInput,
            settingsEls.hourToInput, settingsEls.minuteToInput,
            settingsEls.backfillIntervalInput
        ];
        inputs.forEach(el => {
            if (el) {
                el.disabled = disabled;
                el.style.opacity = disabled ? '0.5' : '1';
            }
        });
        const sections = [settingsEls.weeklyCountSection, settingsEls.dailyRangeSection];
        sections.forEach(sec => { if (sec) sec.style.opacity = disabled ? '0.5' : '1'; });
    }

    function setSettingsError(message = '') { if (settingsEls?.errorEl) settingsEls.errorEl.textContent = message; }

    function setReportListLoadingState(isLoading, message = 'Loading saved reports...') {
        if (!settingsEls?.reportList) return;
        let loadingEl = settingsEls.reportList.querySelector('[data-report-loading]');
        if (isLoading) {
            if (!loadingEl) {
                loadingEl = document.createElement('div');
                loadingEl.setAttribute('data-report-loading', 'true');
                loadingEl.className = 'pak-loading-row';
                loadingEl.innerHTML = `<div class="pak-spinner"></div><div style="font-size: 12px;"></div>`;
                settingsEls.reportList.appendChild(loadingEl);
            }
            const textNode = loadingEl.querySelector('div:last-child');
            if (textNode) textNode.textContent = message;
            return;
        }
        loadingEl?.remove();
    }

    function onReportModeChanged() { updateModeUI(); renderSettingsReportList(); }

    function updateModeUI() {
        if (!settingsEls) return;

        const mode = settingsEls.reportModeDaily?.checked ? 'daily' : (settingsEls.reportModeBackfill?.checked ? 'backfill' : 'weekly');

        settingsEls.weeklyCountSection.classList.toggle('pak-hidden', mode !== 'weekly');
        settingsEls.dailyRangeSection.classList.toggle('pak-hidden', !(mode === 'daily' || mode === 'backfill'));
        settingsEls.backfillSection.classList.toggle('pak-hidden', mode !== 'backfill');
        settingsEls.dailyHint.style.display = mode === 'daily' ? 'block' : 'none';

        if (mode === 'backfill') {
            settingsEls.labelFromDate.textContent = 'Start Date';
            settingsEls.labelToDate.textContent = 'End Date';
            settingsEls.timeRangeTitle.textContent = 'Start & End Times';
            settingsEls.labelHourFrom.textContent = 'Start Hour';
            settingsEls.labelMinuteFrom.textContent = 'Start Minute';
            settingsEls.labelHourTo.textContent = 'End Hour';
            settingsEls.labelMinuteTo.textContent = 'End Minute';
        } else {
            settingsEls.labelFromDate.textContent = 'From Date';
            settingsEls.labelToDate.textContent = 'To Date';
            settingsEls.timeRangeTitle.textContent = 'Time Range';
            settingsEls.labelHourFrom.textContent = 'Hour From';
            settingsEls.labelMinuteFrom.textContent = 'Minute From';
            settingsEls.labelHourTo.textContent = 'Hour To';
            settingsEls.labelMinuteTo.textContent = 'Minute To';
        }
    }

    function syncSelectionStateFromCheckboxes() { if (!settingsEls?.reportList) return; Array.from(settingsEls.reportList.querySelectorAll('input[type="checkbox"]')).forEach(box => { const name = box.dataset.reportName; if (name) settings.selectedReports[name] = !!box.checked; }); }
    function setAllReportSelections(checked) { if (!settingsEls?.reportList) return; Array.from(settingsEls.reportList.querySelectorAll('input[type="checkbox"]')).forEach(box => { box.checked = checked; const name = box.dataset.reportName; if (name) settings.selectedReports[name] = checked; }); }

    function renderSettingsReportList() {
        if (!settingsEls?.reportList) return;
        settingsEls.reportList.innerHTML = '';
        const names = availableReports.length ? availableReports : reportNamesFallback();
        // Backfill posts through the same map as Daily (both are timestamped data points).
        const activeMap = settingsEls.reportModeBackfill.checked ? REPORT_POST_URLS_BACKFILL
            : settingsEls.reportModeDaily.checked ? REPORT_POST_URLS_DAILY
                : REPORT_POST_URLS_WEEKLY;

        const grid = document.createElement('div');
        grid.className = 'pak-report-grid';

        names.forEach(reportName => {
            if (typeof settings.selectedReports[reportName] !== 'boolean') settings.selectedReports[reportName] = true;

            const wrap = document.createElement('label');
            wrap.className = 'pak-report-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.reportName = reportName;
            checkbox.checked = !!settings.selectedReports[reportName];
            checkbox.addEventListener('change', () => { settings.selectedReports[reportName] = !!checkbox.checked; });

            const text = document.createElement('div');
            text.className = 'pak-report-item-text';

            const title = document.createElement('div');
            title.className = 'pak-report-item-title';
            title.textContent = reportName;

            const sub = document.createElement('div');
            sub.className = 'pak-report-item-sub';
            sub.textContent = findUrlInMap(activeMap, reportName) ? 'Mapped for posting' : 'Will run only';

            text.appendChild(title);
            text.appendChild(sub);
            wrap.appendChild(checkbox);
            wrap.appendChild(text);
            grid.appendChild(wrap);
        });

        settingsEls.reportList.appendChild(grid);
    }

    function loadSettingsIntoPanel() {
        settingsEls.postEnabledCheckbox.checked = !!settings.postEnabled;
        settingsEls.postingControls.classList.toggle('pak-dimmed', !settingsEls.postEnabledCheckbox.checked);

        settingsEls.reportModeWeekly.checked = settings.reportMode === 'weekly';
        settingsEls.reportModeDaily.checked = settings.reportMode === 'daily';
        settingsEls.reportModeBackfill.checked = settings.reportMode === 'backfill';

        settingsEls.periodCountInput.value = String(Math.max(1, Math.min(99, Math.trunc(Number(settings.periodCount) || 1))));
        settingsEls.backfillIntervalInput.value = settings.backfillInterval || 15;

        settingsEls.dailyFromDateInput.value = sanitizeDateInput(settings.dailyFromDate, todayInputValue());
        settingsEls.dailyToDateInput.value = sanitizeDateInput(settings.dailyToDate, todayInputValue());
        settingsEls.hourFromInput.value = pad2(settings.hourFrom || '00');
        settingsEls.minuteFromInput.value = pad2(settings.minuteFrom || '00');
        settingsEls.hourToInput.value = pad2(settings.hourTo || '23');
        settingsEls.minuteToInput.value = pad2(settings.minuteTo || '59');

        const exportMode = settings.exportMode || { combined: true, individual: true };
        settingsEls.exportCombinedCheckbox.checked = !!exportMode.combined;
        settingsEls.exportIndividualCheckbox.checked = !!exportMode.individual;

        settingsEls.enabledCheck.checked = !!autoRunSettings.enabled;
        settingsEls.targetSelect.value = autoRunSettings.targetMode || 'native';
        settingsEls.modeSelect.value = autoRunSettings.mode;
        settingsEls.timeInput.value = autoRunSettings.timeMinutes;
        settingsEls.intervalInput.value = autoRunSettings.intervalMinutes;
        settingsEls.rollingSelect.value = autoRunSettings.rollingMinutes || 15;
        settingsEls.rollingDelaySelect.value = autoRunSettings.rollingDelayMinutes || 1;
        settingsEls.startMinuteInput.value = autoRunSettings.intervalStartMinute;

        const startRadios = document.querySelectorAll('input[name="pak-autorun-start"]');
        startRadios.forEach(r => { r.checked = (r.value === autoRunSettings.intervalStartMode); });

        settingsEls.enabledCheck.dispatchEvent(new Event('change'));
        settingsEls.modeSelect.dispatchEvent(new Event('change'));

        const checkedRadio = document.querySelector('input[name="pak-autorun-start"]:checked');
        if (checkedRadio) checkedRadio.dispatchEvent(new Event('change'));
        else settingsEls.specificMinuteGroup.classList.add('pak-hidden');

        updateModeUI(); renderSettingsReportList();
    }

    function saveSettingsPanel() {
        syncSelectionStateFromCheckboxes();
        const s = defaultSettings();
        s.postEnabled = !!settingsEls.postEnabledCheckbox.checked;

        if (settingsEls.reportModeWeekly.checked) s.reportMode = 'weekly';
        else if (settingsEls.reportModeDaily.checked) s.reportMode = 'daily';
        else if (settingsEls.reportModeBackfill.checked) s.reportMode = 'backfill';

        s.periodCount = Math.max(1, Math.min(99, Math.trunc(Number(settingsEls.periodCountInput.value) || 1)));
        s.backfillInterval = Math.max(1, Math.min(1440, Math.trunc(Number(settingsEls.backfillIntervalInput.value) || 15)));

        s.dailyFromDate = sanitizeDateInput(settingsEls.dailyFromDateInput.value, todayInputValue());
        s.dailyToDate = sanitizeDateInput(settingsEls.dailyToDateInput.value, todayInputValue());
        s.hourFrom = clampPad2(settingsEls.hourFromInput.value, 0, 23, '00');
        s.minuteFrom = clampPad2(settingsEls.minuteFromInput.value, 0, 59, '00');
        s.hourTo = clampPad2(settingsEls.hourToInput.value, 0, 23, '23');
        s.minuteTo = clampPad2(settingsEls.minuteToInput.value, 0, 59, '59');
        Array.from(settingsEls.reportList.querySelectorAll('input[type="checkbox"]')).forEach(box => { const name = box.dataset.reportName; if (name) s.selectedReports[name] = !!box.checked; });

        s.exportMode = {
            combined: !!settingsEls.exportCombinedCheckbox.checked,
            individual: !!settingsEls.exportIndividualCheckbox.checked
        };

        settings = s;
        persistSettings();

        autoRunSettings.enabled = !!settingsEls.enabledCheck.checked;
        autoRunSettings.targetMode = settingsEls.targetSelect.value;
        autoRunSettings.mode = settingsEls.modeSelect.value;
        autoRunSettings.timeMinutes = settingsEls.timeInput.value;
        autoRunSettings.intervalMinutes = parseInt(settingsEls.intervalInput.value) || 60;
        autoRunSettings.rollingMinutes = parseInt(settingsEls.rollingSelect.value) || 15;
        autoRunSettings.rollingDelayMinutes = parseInt(settingsEls.rollingDelaySelect.value) || 1;

        const startRadios = document.querySelectorAll('input[name="pak-autorun-start"]');
        startRadios.forEach(r => { if (r.checked) autoRunSettings.intervalStartMode = r.value; });

        autoRunSettings.intervalStartMinute = parseInt(settingsEls.startMinuteInput.value) || 0;

        localStorage.setItem(AUTORUN_STORAGE_KEY, JSON.stringify(autoRunSettings));

        setSettingsError('');
        closeSettingsPanel();
        resetAutoRunScheduler();
    }

    function openSettingsPanel() {
        if (controlsDisabled) return;
        settingsOpen = true;
        ensureSettingsModal();
        setSettingsError('');
        setReportListLoadingState(true, 'Loading live saved reports...');
        settingsModalEl.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        loadSettingsIntoPanel();
        (async () => {
            try {
                await loadAvailableReportsAndNormalizeSettings();
                if (!settingsOpen) return;
                loadSettingsIntoPanel();
                setReportListLoadingState(false);
                setSettingsError('');
            } catch (err) {
                console.warn('Could not load live reports:', err);
                if (!settingsOpen) return;
                setReportListLoadingState(false);
                setSettingsError('Could not load live reports. Showing cached list instead.');
            }
        })();
    }

    function closeSettingsPanel() {
        if (!settingsModalEl) return;
        settingsModalEl.style.display = 'none';
        document.body.style.overflow = '';
        settingsOpen = false;
        setTimeout(() => { clickReportBuilderTab().catch(() => { }); }, 150);
    }

    async function waitForPageReady() { if (document.readyState !== 'complete') await new Promise(resolve => window.addEventListener('load', resolve, { once: true })); const deadline = Date.now() + 15000; while (Date.now() < deadline) { if (document.querySelector('input[formcontrolname="from"]') && document.querySelector('input[formcontrolname="to"]')) return true; await sleep(120); } return false; }

    // =====================================================================
    // AUTO RUN SCHEDULER
    // =====================================================================

    function createAutoRunStatusPill() {
        const pill = document.createElement('div');
        pill.id = 'pak-status-pill';
        pill.className = 'pak-ui pak-status-pill';

        pill.innerHTML = `
            <div id="pak-status-dot" class="pak-status-dot"></div>
            <i class="fa-solid fa-stopwatch"></i>
            <span id="pak-countdown" class="pak-status-text">...</span>
        `;

        pill.onclick = openSettingsPanel;
        document.body.appendChild(pill);
    }

    function findNativeRunButton() {
        const span = [...document.querySelectorAll('span.mdc-button__label')]
            .find(el => el.textContent.trim() === 'RUN');
        if (!span) return null;
        return span.closest('button');
    }

    function executeRun() {
        if (autoRunSettings.targetMode === 'script') {
            if (controlsDisabled) { console.log('[AutoRUN] Script Runner is already active. Skipping trigger.'); return; }
            console.log(`[AutoRUN] Triggering Report Runner Script at ${new Date().toLocaleTimeString()}`);
            runBtn.click();
        } else {
            const nativeRunBtn = findNativeRunButton();
            if (nativeRunBtn) {
                console.log(`[AutoRUN] Clicking Native RUN at ${new Date().toLocaleTimeString()}`);
                nativeRunBtn.click();
            } else { console.warn('[AutoRUN] Native RUN button not found'); }
        }
    }

    // Computes the next scheduled fire time for whichever Auto-Run mode is
    // active. "rolling" snaps to the next interval boundary (e.g. every 15
    // minutes on the clock) and then adds the configured run delay, so the
    // window it processes has already fully closed by the time it fires.
    function calculateNextRun() {
        const now = new Date();
        let next = null;

        if (autoRunSettings.mode === 'rolling') {
            const interval = autoRunSettings.rollingMinutes;
            const delayMins = autoRunSettings.rollingDelayMinutes || 0;
            const m = now.getMinutes();
            const s = now.getSeconds();

            let nextM = Math.ceil(m / interval) * interval;

            if (m % interval === 0) {
                nextM = (s === 0) ? m : m + interval;
            }

            next = new Date(now);
            next.setMinutes(nextM, 0, 0);

            if (delayMins > 0) next.setMinutes(next.getMinutes() + delayMins);

            return next;

        } else if (autoRunSettings.mode === 'time') {
            const targetMins = autoRunSettings.timeMinutes.split(',')
                .map(s => parseInt(s.trim()))
                .filter(n => !isNaN(n) && n >= 0 && n <= 59)
                .sort((a, b) => a - b);

            if (targetMins.length === 0) return null;

            const currentMin = now.getMinutes();
            const currentHour = now.getHours();

            const found = targetMins.find(m => m > currentMin);

            if (found !== undefined) {
                next = new Date(now);
                next.setHours(currentHour, found, 0, 0);
            } else {
                next = new Date(now);
                next.setHours(currentHour + 1, targetMins[0], 0, 0);
            }

        } else { // interval
            const intervalMs = autoRunSettings.intervalMinutes * 60 * 1000;

            if (autoRunSettings.intervalStartMode === 'now') {
                next = new Date(now.getTime() + intervalMs);
            } else {
                let candidate = new Date(now);
                candidate.setSeconds(0, 0);
                candidate.setMinutes(autoRunSettings.intervalStartMinute);

                while (candidate.getTime() <= now.getTime()) {
                    candidate = new Date(candidate.getTime() + intervalMs);
                }

                next = candidate;
            }
        }

        return next;
    }

    function updateCountdown() {
        const statusDot = document.getElementById('pak-status-dot');
        const countText = document.getElementById('pak-countdown');
        if (!statusDot || !countText) return;

        if (!autoRunSettings.enabled) {
            countText.textContent = 'Off';
            statusDot.style.backgroundColor = '#555';
            statusDot.style.boxShadow = 'none';
            countText.title = 'Auto Run is disabled.';
            return;
        }

        if (!nextRunTime) {
            countText.textContent = 'Wait...';
            statusDot.style.backgroundColor = '#555';
            statusDot.style.boxShadow = 'none';
            countText.title = 'Calculating schedule...';
            return;
        }

        const now = new Date();
        const diff = nextRunTime - now;

        if (diff <= 0) {
            countText.textContent = 'Running...';
            countText.title = 'Running current sequence...';
        } else {
            const minutes = Math.floor(diff / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);
            countText.textContent = `Next in ${minutes}m ${seconds}s`;
            statusDot.style.backgroundColor = '#22c55e';
            statusDot.style.boxShadow = '0 0 5px #22c55e';

            const dateStr = nextRunTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
            const timeStr = pad2(nextRunTime.getHours()) + ':' + pad2(nextRunTime.getMinutes());

            let tooltip = `Next Run: ${dateStr} @ ${timeStr}`;

            if (autoRunSettings.mode === 'rolling') {
                const intervalMins = parseInt(autoRunSettings.rollingMinutes) || 15;
                const delayMins = parseInt(autoRunSettings.rollingDelayMinutes) || 0;

                const windowEndTime = new Date(nextRunTime.getTime() - (delayMins * 60000));
                const startWindow = new Date(windowEndTime.getTime() - (intervalMins * 60000));

                const startStr = pad2(startWindow.getHours()) + ':' + pad2(startWindow.getMinutes());
                const endStr = pad2(windowEndTime.getHours()) + ':' + pad2(windowEndTime.getMinutes());

                tooltip += `\nData Window: ${startStr} - ${endStr}`;
                if (delayMins > 0) tooltip += `\n(Execution delayed by ${delayMins}m)`;
            } else {
                const fromStr = settings.hourFrom + ':' + settings.minuteFrom;
                const toStr = settings.hourTo + ':' + settings.minuteTo;
                tooltip += `\nConfigured Time: ${fromStr} - ${toStr}`;
            }

            countText.title = tooltip;
        }
    }

    function scheduleNextRun() {
        if (schedulerTimeout) clearTimeout(schedulerTimeout);

        if (!autoRunSettings.enabled) {
            if (windowCountdownInterval) clearInterval(windowCountdownInterval);
            updateCountdown();
            return;
        }

        const now = new Date();
        nextRunTime = calculateNextRun();

        if (!nextRunTime) return;

        const delay = nextRunTime.getTime() - now.getTime();

        console.log(`[AutoRUN] Next run scheduled for ${nextRunTime.toLocaleTimeString()}`);

        if (windowCountdownInterval) clearInterval(windowCountdownInterval);
        windowCountdownInterval = setInterval(updateCountdown, 1000);
        updateCountdown();

        schedulerTimeout = setTimeout(() => {
            executeRun();
            scheduleNextRun();
        }, delay);
    }

    function resetAutoRunScheduler() {
        if (schedulerTimeout) clearTimeout(schedulerTimeout);
        scheduleNextRun();
    }

    window.addEventListener('load', () => {
        scheduleNextRun();
    });

})();