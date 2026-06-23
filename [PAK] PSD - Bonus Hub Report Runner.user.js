// ==UserScript==
// @name         [PAK] PSD - Bonus Hub Report Runner
// @namespace    http://tampermonkey.net/
// @version      10.2
// @description  Open saved reports, run each, save rows to localStorage, copy TSV, download CSV (Combined/Individual/Both), and optionally post each report TSV to its own Google Sheet. Includes unified Auto-RUN Manager with Rolling Mode, Delay, and NEW Rolling Backfill Mode.
// @author       Pak
// @match        https://pon-wpws27/Whds.Dashboard.Web/bonushub/reports*
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/Pak5012/tamper_scripts/main/%5BPAK%5D%20PSD%20-%20Bonus%20Hub%20Report%20Runner.user.js
// @downloadURL  https://raw.githubusercontent.com/Pak5012/tamper_scripts/main/%5BPAK%5D%20PSD%20-%20Bonus%20Hub%20Report%20Runner.user.js
// ==/UserScript==

(function () {
    'use strict';

    // --- MAIN SCRIPT CONSTANTS ---
    const STORAGE_KEY = 'pak_bonushub_settings_v7'; // Updated version for Backfill settings
    const REPORT_CACHE_KEY = 'pak_bonushub_available_reports_v1';
    const RUN_DATA_KEY = 'pak_bonushub_run_data_v1';

    const REPORT_POST_URLS_WEEKLY = {
        'MPF - PiE': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbzinomH7_XBUrrGr6iYo6jTWY4S8RAa_n9PQ6d9OaEpmrYR4VT5DlZr9koX6z7MxFAu/exec',
        'MPF - E3 Packing': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbx3V8uvu97pz41uGMJC4BOUVN5Lad98AtclbCjUW5VZicKWRgVSL74NoI6cvLkZ1jQ_wg/exec',
        'MPF - E3 Topup': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbye_PccRK7IRkQ-GEOZ9iDRopVKO6ofS8Q5T-OAxocFRL1CyIzk7SwhutKvhhj52u8m8w/exec',
        'MPF - Parcel Sort': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbxDn17AJRg-2Oyh85YAQD989LOL809bXPRIG75mhTkCM8im8ouRF7O-lSiNcUVD7ooU/exec',
        'MPF - Sorter 6 Packing': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbyYzOGVJpfNHKj4pxAn8wl-BtitA2lkf_f6P_j7CRYbL-0R7KiRXh8i2c78aB2NWfcD/exec'
    };

    // --- URLs for Daily and Rolling Backfill ---
    const REPORT_POST_URLS_DAILY = {
        'MPF - VS Transfer': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbweReN_J5GfBmYARYzwcQUJdKIBm7LlvhDB5ZnQzBQq6n5ItBo5CpOIEeIomooK3PPnzA/exec',
        'MPF - VS Retail': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbweReN_J5GfBmYARYzwcQUJdKIBm7LlvhDB5ZnQzBQq6n5ItBo5CpOIEeIomooK3PPnzA/exec',
        'MPF - VS Online': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbweReN_J5GfBmYARYzwcQUJdKIBm7LlvhDB5ZnQzBQq6n5ItBo5CpOIEeIomooK3PPnzA/exec'
    };

    // --- URLs for Rolling Backfill ---
    const REPORT_POST_URLS_BACKFILL = {
        'D.Analysis - OSR PiE': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbxsmWnQDngC4UeZ9lSSsWL8qiRU8WRnfG5z38R80i_jdBF6TkEE-RirNeeIFdNUe-qD/exec',
        'D.Analysis - OSR Topup': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbxsmWnQDngC4UeZ9lSSsWL8qiRU8WRnfG5z38R80i_jdBF6TkEE-RirNeeIFdNUe-qD/exec',
        'D.Analysis - E3 Packing': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbxsmWnQDngC4UeZ9lSSsWL8qiRU8WRnfG5z38R80i_jdBF6TkEE-RirNeeIFdNUe-qD/exec',
        'D.Analysis - Parcel Sortation': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbxsmWnQDngC4UeZ9lSSsWL8qiRU8WRnfG5z38R80i_jdBF6TkEE-RirNeeIFdNUe-qD/exec',
        'D.Analysis - Parcel Induct': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbxsmWnQDngC4UeZ9lSSsWL8qiRU8WRnfG5z38R80i_jdBF6TkEE-RirNeeIFdNUe-qD/exec',
        'D.Analysis - Inbound Decanting': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbxsmWnQDngC4UeZ9lSSsWL8qiRU8WRnfG5z38R80i_jdBF6TkEE-RirNeeIFdNUe-qD/exec',
        'D.Analysis - OSR Decanting': 'https://script.google.com/a/macros/next.co.uk/s/AKfycbxsmWnQDngC4UeZ9lSSsWL8qiRU8WRnfG5z38R80i_jdBF6TkEE-RirNeeIFdNUe-qD/exec'
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

        // --- SPA NAVIGATION HANDLING ---
    function isCorrectPage() {
        return window.location.href.includes('/bonushub/reports');
    }

    function updateUIVisibility() {
        try {
            const show = isCorrectPage();

            // Safely hide/show main buttons
            if (typeof controlsContainer !== 'undefined') {
                controlsContainer.style.display = show ? 'flex' : 'none';
            }

            // Safely hide/show Auto-Run status button
            const countdownEl = document.getElementById('pak-countdown');
            if (countdownEl) {
                const statusBtn = countdownEl.closest('div[style*="position: fixed"]');
                if (statusBtn) statusBtn.style.display = show ? 'flex' : 'none';
            }

            // Force close modals if leaving the page
            if (!show) {
                if (settingsOpen) closeSettingsPanel();
                if (overlayEl && overlayEl.style.display === 'flex') hideOverlay();
            }
        } catch (e) {
            // FAIL SILENTLY - Prevents crashing the Angular/SPA router
        }
    }

    // Intercept SPA navigation safely
    (function() {
        try {
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;

            history.pushState = function() {
                originalPushState.apply(this, arguments);
                updateUIVisibility();
            };

            history.replaceState = function() {
                originalReplaceState.apply(this, arguments);
                updateUIVisibility();
            };

            window.addEventListener('popstate', function() {
                updateUIVisibility();
            });
        } catch (e) {
            // FAIL SILENTLY
        }
    })();

    // Run once on initial load
    updateUIVisibility();

    const MONTH_LOOKUP = {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
    };

    const AUTORUN_STORAGE_KEY = 'pak_autorun_config_v3';

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
        backfillInterval: 15 // New setting
    });

    const defaultAutoRunSettings = {
        enabled: false,
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

    let autoRunSettings = JSON.parse(localStorage.getItem(AUTORUN_STORAGE_KEY)) || defaultAutoRunSettings;
    if (typeof autoRunSettings.intervalStartMode === 'undefined') autoRunSettings.intervalStartMode = 'now';
    if (typeof autoRunSettings.intervalStartMinute === 'undefined') autoRunSettings.intervalStartMinute = 0;
    if (typeof autoRunSettings.rollingMinutes === 'undefined') autoRunSettings.rollingMinutes = 15;
    if (typeof autoRunSettings.rollingDelayMinutes === 'undefined') autoRunSettings.rollingDelayMinutes = 1;

    let nextRunTime = null;
    let schedulerTimeout = null;
    let windowCountdownInterval = null;

    let overlayEl = null, overlayStatusEl = null, overlayProgressEl = null, overlayAbortBtn = null, originalBodyOverflow = '';
    let settingsModalEl = null, settingsEls = null, settingsOpen = false;

    const controlsContainer = document.createElement('div');
    Object.assign(controlsContainer.style, { position: 'fixed', top: '10px', left: '410px', zIndex: '99998', display: 'flex', gap: '4px', alignItems: 'center' });

    const runBtn = document.createElement('button'); runBtn.textContent = '▶ RUN';
    const settingsBtn = document.createElement('button'); settingsBtn.textContent = '⚙ Settings';
    applyButtonStyle(runBtn); applyButtonStyle(settingsBtn);
    controlsContainer.appendChild(runBtn); controlsContainer.appendChild(settingsBtn);
    document.body.appendChild(controlsContainer);

    runBtn.addEventListener('click', runSequence);
    settingsBtn.addEventListener('click', openSettingsPanel);
    ensureFontAwesome(); ensureRunOverlay();
    createAutoRunStatusButton();

    if (!settings.selectedReports || Object.keys(settings.selectedReports).length === 0) {
        const defaults = availableReports.length ? availableReports : reportNamesFallback();
        defaults.forEach(name => { settings.selectedReports[name] = true; });
        persistSettings();
    }
    init();

    // --- BUTTON POSITIONING LOGIC ---
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
    setInterval(updateButtonPosition, 2000);

    // --- MAIN SCRIPT FUNCTIONS ---

    async function init() {
        try {
            if (!availableReports.length) availableReports = readCachedAvailableReports();
            if (!availableReports.length) availableReports = reportNamesFallback();
            ensureSelectionDefaultsForReports(availableReports);
            await waitForPageReady();
            updateButtonPosition();
        } catch (err) { console.warn('Init warning:', err); }
    }

    function applyButtonStyle(button) {
        Object.assign(button.style, { padding: '10px 14px', background: '#000', color: '#fff', border: '1px solid #b0b0b0', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', userSelect: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.4)', outline: 'none', whiteSpace: 'nowrap' });
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

    function loadStoredReports() {
        try {
            const raw = localStorage.getItem(RUN_DATA_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            console.warn('Failed to load run data:', err);
            return [];
        }
    }

    function persistStoredReports() {
        try {
            localStorage.setItem(RUN_DATA_KEY, JSON.stringify(storedReports));
        } catch (err) {
            console.warn('Failed to persist run data:', err);
        }
    }

    function resetStoredReports() {
        storedReports = [];
        localStorage.removeItem(RUN_DATA_KEY);
    }

    function clampPad2(value, min, max, fallback) { const n = Number.parseInt(value, 10); if (!Number.isInteger(n) || n < min || n > max) return fallback; return String(n).padStart(2, '0'); }
    function pad2(value) { return String(value).padStart(2, '0'); }
    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    function normalizeText(text) { return (text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
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
        toast.textContent = message;
        Object.assign(toast.style, {
            position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)',
            background: '#e74c3c', color: '#fff', padding: '12px 24px', borderRadius: '8px',
            zIndex: '200000', fontSize: '14px', fontWeight: '600', boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
            transition: 'opacity 0.3s, transform 0.3s', opacity: '0', pointerEvents: 'none',
            whiteSpace: 'nowrap', fontFamily: 'Arial, sans-serif'
        });
        document.body.appendChild(toast);
        toast.offsetHeight;
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

    function ensureRunOverlay() {
        if (overlayEl) return;
        overlayEl = document.createElement('div'); overlayEl.id = RUN_OVERLAY_ID;
        Object.assign(overlayEl.style, { position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.73)', zIndex: '99999', display: 'none', alignItems: 'center', justifyContent: 'center', pointerEvents: 'all', userSelect: 'none' });
        overlayEl.innerHTML = `
            <div style="width: min(520px, calc(100vw - 32px)); padding: 28px 24px 22px; border-radius: 18px; background: rgba(16,16,16,0.92); box-shadow: 0 18px 50px rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.08); text-align: center; color: #fff; backdrop-filter: blur(2px);">
                <div style="margin-bottom: 14px;"><i class="fa-solid fa-thumbtack" style="font-size: 54px; color: #ffffff; display: inline-block; animation: pakPinPulse 1.15s ease-in-out infinite; transform-origin: 50% 72%;"></i></div>
                <div data-status style="font-size: 20px; font-weight: 700; margin-bottom: 10px;">Running...</div>
                <div data-progress style="font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.88); min-height: 20px; line-height: 1.4;">Preparing...</div>
                <div style="margin-top: 20px;">
                    <button data-abort style="padding: 10px 28px; border-radius: 8px; border: 1px solid rgba(255,80,80,0.45); background: rgba(160,25,25,0.65); color: #fff; cursor: pointer; font-size: 14px; font-weight: 600; letter-spacing: 0.3px; transition: background 0.2s, border-color 0.2s;">
                        <i class="fa-solid fa-stop" style="margin-right: 7px;"></i>Abort &amp; Extract
                    </button>
                </div>
            </div>
            <style>
                @keyframes pakPinPulse { 0% { transform: translateY(0) rotate(0deg) scale(1); opacity: 0.95; } 25% { transform: translateY(-3px) rotate(-8deg) scale(1.03); opacity: 1; } 50% { transform: translateY(0) rotate(0deg) scale(1); opacity: 0.95; } 75% { transform: translateY(-2px) rotate(8deg) scale(1.03); opacity: 1; } 100% { transform: translateY(0) rotate(0deg) scale(1); opacity: 0.95; } }
                [data-abort]:hover { background: rgba(200,35,35,0.85) !important; border-color: rgba(255,90,90,0.7) !important; }
                [data-abort]:active { background: rgba(220,45,45,0.95) !important; }
            </style>
        `;
        document.body.appendChild(overlayEl);
        overlayStatusEl = overlayEl.querySelector('[data-status]');
        overlayProgressEl = overlayEl.querySelector('[data-progress]');
        overlayAbortBtn = overlayEl.querySelector('[data-abort]');
        overlayAbortBtn.addEventListener('click', () => {
            abortRequested = true;
            setOverlay('Aborting...', 'Finishing current step, then extracting saved data...');
            overlayAbortBtn.disabled = true;
            overlayAbortBtn.style.opacity = '0.45';
            overlayAbortBtn.style.cursor = 'default';
        });
    }

    function showOverlay(status = 'Running...', progress = 'Preparing...') {
        ensureRunOverlay();
        if (overlayEl.style.display === 'flex') { setOverlay(status, progress); return; }
        overlayStatusEl.textContent = status; overlayProgressEl.textContent = progress;
        abortRequested = false;
        overlayAbortBtn.disabled = false;
        overlayAbortBtn.style.opacity = '1';
        overlayAbortBtn.style.cursor = 'pointer';
        originalBodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; overlayEl.style.display = 'flex';
    }

    function setOverlay(status, progress) { if (overlayStatusEl && typeof status === 'string') overlayStatusEl.textContent = status; if (overlayProgressEl && typeof progress === 'string') overlayProgressEl.textContent = progress; }
    function hideOverlay() { if (!overlayEl) return; overlayEl.style.display = 'none'; document.body.style.overflow = originalBodyOverflow || ''; }

    function setControlsDisabled(disabled) {
        controlsDisabled = disabled; runBtn.disabled = disabled; settingsBtn.disabled = disabled;
        const val = disabled ? '0.7' : '1'; const cur = disabled ? 'not-allowed' : 'pointer';
        runBtn.style.opacity = val; settingsBtn.style.opacity = val; runBtn.style.cursor = cur; settingsBtn.style.cursor = cur;
    }

    function formatDate(date) { const d = new Date(date); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; }
    function formatDateInput(date) { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
    function parseDateInput(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const [yyyy, mm, dd] = value.split('-').map(Number); const d = new Date(yyyy, mm - 1, dd); d.setHours(0, 0, 0, 0); if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null; return d; }
    function formatToUK(date) { return formatDate(date); }
    function startOfDay(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
    function addDays(date, days) { return new Date(date.getTime() + (days * MS_PER_DAY)); }
    function addMinutes(date, mins) { return new Date(date.getTime() + (mins * 60000)); }
    function formatRange(startDate, endDate) { return `${formatDate(startDate)} - ${formatDate(endDate)}`; }

    function getWeekNumberFromDate(date) { const current = startOfDay(date); const anchor = new Date(2026, 1, 1); anchor.setHours(0, 0, 0, 0); const diffDays = Math.round((current.getTime() - anchor.getTime()) / MS_PER_DAY); return Math.max(1, Math.floor(diffDays / 7) + 1); }

    function getMostRecentSunday(date) { const d = new Date(date); d.setHours(12, 0, 0, 0); const day = d.getDay(); const thisSunday = new Date(d); thisSunday.setDate(d.getDate() - day); if (day !== 0) thisSunday.setDate(thisSunday.getDate() - 7); thisSunday.setHours(0, 0, 0, 0); return thisSunday; }

    function buildPeriods(mode, count, referenceDate = new Date(), fromDateInput = null, toDateInput = null) {
        const periods = []; const today = startOfDay(referenceDate);

        // --- NEW: BACKFILL MODE ---
        if (mode === 'backfill') {
            const fromDate = fromDateInput instanceof Date ? startOfDay(fromDateInput) : parseDateInput(settings.dailyFromDate);
            const toDate = toDateInput instanceof Date ? startOfDay(toDateInput) : parseDateInput(settings.dailyToDate);

            if (!fromDate || !toDate) return [];

            // Combine Dates with the Times configured in settings
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
                if (nextBlock.getTime() > end.getTime()) nextBlock = new Date(end);

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
        // -----------------------------

        if (mode === 'daily') {
            const fromDate = fromDateInput instanceof Date ? startOfDay(fromDateInput) : parseDateInput(settings.dailyFromDate);
            const toDate = toDateInput instanceof Date ? startOfDay(toDateInput) : parseDateInput(settings.dailyToDate);
            if (!fromDate || !toDate || fromDate.getTime() > toDate.getTime()) return [];
            let current = new Date(fromDate);
            while (current.getTime() <= toDate.getTime()) { const dayStart = new Date(current); periods.push({ startDate: dayStart, endDate: addDays(dayStart,1), label: formatRange(dayStart, addDays(dayStart,1)), weekNumber: getWeekNumberFromDate(dayStart) }); current = addDays(current, 1); }
            return periods;
        }
        const n = Math.max(1, Math.min(99, Math.trunc(Number(count) || 1))); const thisSunday = getMostRecentSunday(today);
        for (let i = n; i >= 1; i--) { const startDate = new Date(thisSunday); startDate.setDate(thisSunday.getDate() - (7 * (i - 1))); const endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 7); periods.push({ startDate, endDate, label: formatRange(startDate, endDate), weekNumber: getWeekNumberFromDate(startDate) }); }
        return periods;
    }

    function setNativeFieldValue(el, value) { if (!el) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; if (setter) setter.call(el, value); else el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return true; }
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
        setVisualOnlyValue(fromInput, formatToUK(fromDate)); setVisualOnlyValue(toInput, formatToUK(toDate));
        const mirror = document.querySelector('.mat-date-range-input-mirror'); if (mirror) mirror.textContent = `${formatToUK(fromDate)} - ${formatToUK(toDate)}`; return true;
    }

    function readCachedAvailableReports() { try { const raw = localStorage.getItem(REPORT_CACHE_KEY); const parsed = raw ? JSON.parse(raw) : []; return Array.isArray(parsed) ? parsed.filter(Boolean) : []; } catch (_) { return []; } }
    function cacheAvailableReports(list) { try { localStorage.setItem(REPORT_CACHE_KEY, JSON.stringify(list || [])); } catch (_) {} }
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

    async function waitForTableRows() {
        const tbody = await waitForElement(() => document.querySelector('tbody[role="rowgroup"]'), 120000);
        if (!tbody) throw new Error(abortRequested ? 'Aborted' : 'Result table body not found');

        // === GRACE PERIOD ===
        // Wait for the table structure to fully render before making any decisions
        // This prevents false "0 row(s)" detection during initial DOM population
        await sleep(2000);

        let lastSignature = '', stableCount = 0, firstRowSeen = false, start = Date.now();
        let zeroRowStableCount = 0;

        while (true) {
            if (abortRequested) throw new Error('Aborted');

            const footer = document.querySelector('tr.mat-mdc-footer-row, tr[mat-footer-row]');
            const footerText = footer ? normalizeText(footer.innerText) : '';
            const isZeroRows = footerText.includes('0 row(s)');

            if (isZeroRows) {
                zeroRowStableCount++;
                // Only trust "0 row(s)" if ALL THREE conditions are met:
                // 1. We have NEVER seen any rows (firstRowSeen === false)
                // 2. We've been checking for at least 5 seconds total
                // 3. The "0 row(s)" message has been STABLE for 3+ consecutive checks (1.5s)
                if (!firstRowSeen && (Date.now() - start > 5000) && zeroRowStableCount >= 3) {
                    console.log('[PAK] Confirmed empty table (stable 0 rows after waiting 5+ seconds)');
                    return [];
                }
            } else {
                zeroRowStableCount = 0; // Reset counter if footer changes
            }

            if (Date.now() - start > 120000) throw new Error('Result table did not load within 120s');

            const rows = Array.from(tbody.querySelectorAll('tr.mat-mdc-row, tr[mat-row]'));

            // Once we see at least one row, we know data is coming
            if (rows.length > 0 && !firstRowSeen) {
                firstRowSeen = true;
                start = Date.now(); // Reset timeout - now wait for stability
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
                return (idx === 0 && prefixFirstCol) ? `'${v}` : v;
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

    function postToGoogleSheet(tsvText, webAppUrl) { return new Promise((resolve, reject) => { if (!webAppUrl || !webAppUrl.trim()) { reject(new Error('Google Sheet Web App URL is not set for this report')); return; } GM_xmlhttpRequest({ method: 'POST', url: webAppUrl, timeout: 30000, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, data: tsvText, onload: resp => { (resp.status >= 200 && resp.status < 300) ? resolve(resp.responseText || 'OK') : reject(new Error(`HTTP ${resp.status}: ${resp.responseText}`)); }, onerror: () => reject(new Error('Network error posting to Google Sheets')), ontimeout: () => reject(new Error('Request timeout after 30s')) }); }); }

    function findUrlInMap(map, reportName) { const key = normalizeKey(reportName); for (const [name, url] of Object.entries(map)) { if (normalizeKey(name) === key) return url; } return ''; }
    function getPostUrlForReport(reportName) {
        const urlMap = settings.reportMode === 'daily' ? REPORT_POST_URLS_DAILY
        : settings.reportMode === 'backfill' ? REPORT_POST_URLS_BACKFILL
        : REPORT_POST_URLS_WEEKLY;
        return findUrlInMap(urlMap, reportName) || '';
    }

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

            // --- MODIFIED TIME SETTING LOGIC ---
            // If in Backfill mode, use the specific times from the period object.
            // Otherwise, use the global settings filter times.
            if (settings.reportMode === 'backfill') {
                await setFieldByLabel('Hour From', period.startDate.getHours());
                await setFieldByLabel('Minute From', period.startDate.getMinutes());
                await setFieldByLabel('Hour To', period.endDate.getHours());
                await setFieldByLabel('Minute To', period.endDate.getMinutes());
            } else {
                await applyTimeSettingsToScreen();
            }
            // -----------------------------------

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
                // Generate the specific [ EMPTY TABLE ] placeholder row (10 columns total)
                const emptyRow = ['[ EMPTY TABLE ]', '[ EMPTY TABLE ]', '', '', '', '', ''];
                emptyRow.push(String(period.weekNumber), period.label, reportName);
                dataRows = [emptyRow];
            } else {
                // Standard processing for populated tables
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

        let periods = [];
        if (overridePeriods) {
            periods = overridePeriods;
        } else {
            periods = buildPeriods(settings.reportMode, settings.periodCount);
        }

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
                    if (!groupedData[name]) {
                        groupedData[name] = [];
                    }
                    if (groupedData[name].length > 0) {
                        groupedData[name].push(createBlankRow());
                    }
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
                       : 'Aborted \u2013 no data was collected.');
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
        const originalRunText = runBtn.textContent;
        runBtn.textContent = 'Running...';
        showOverlay('Running reports...', 'Preparing');

        const originalSettings = JSON.parse(JSON.stringify(settings));
        let isRolling = false;
        let manualPeriods = null;

        try {
            // Auto-Run Rolling Logic (Live Mode)
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
                settings.reportMode = 'daily';

                console.log(`[Rolling Mode] Manual Range: ${manualPeriods[0].label}`);
            }

            resetStoredReports();

            if (!(await waitForPageReady())) throw new Error('Page did not finish loading in time.');
            if (!availableReports.length) await loadAvailableReportsAndNormalizeSettings();

            // Pass manualPeriods to processRun (if Rolling AutoRun), else buildPeriods handles Backfill/Weekly/Daily
            await processRun(manualPeriods);

            if (abortRequested) {
                runBtn.textContent = '⚠ Aborted';
            } else {
                runBtn.textContent = '✅ Copied';
            }
        } catch (err) {
            const exportMode = settings.exportMode || { combined: true, individual: true };

            if (abortRequested) {
                if (storedReports.length > 0) {
                    await copyText(buildTSVFromStoredReports());
                    if (exportMode.combined) {
                        downloadCSV(buildCSVFromStoredReports());
                    }
                }
                setOverlay('Aborted', storedReports.length > 0
                           ? `Saved ${storedReports.length} report(s) before abort. Data copied & downloaded.`
                           : 'Aborted \u2013 no data was collected.');
                runBtn.textContent = '⚠ Aborted';
            } else {
                console.error(err);
                setOverlay('Failed', err.message || 'Sequence failed');
                runBtn.textContent = '❌ Failed';

                if (storedReports.length > 0) {
                    await copyText(buildTSVFromStoredReports());
                    if (exportMode.combined) {
                        downloadCSV(buildCSVFromStoredReports());
                    }
                    runBtn.textContent = '⚠ Partial';
                }

                alert(err.message || 'Sequence failed');
            }
        } finally {
            if (isRolling) {
                Object.assign(settings, originalSettings);
            }

            resetStoredReports();

            if (autoRunSettings.enabled) {
                // Auto Run is active — refresh to guarantee a clean SPA state for the next scheduled run
                setTimeout(() => { location.reload(); }, 2000);
            } else {
                setTimeout(() => { hideOverlay(); runBtn.textContent = originalRunText; setControlsDisabled(false); }, 1500);
            }
        }
    }

    // --- UNIFIED SETTINGS MODAL ---

    function ensureSettingsModal() {
        if (settingsModalEl) return settingsModalEl;

        settingsModalEl = document.createElement('div');
        settingsModalEl.id = SETTINGS_OVERLAY_ID;

        Object.assign(settingsModalEl.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '100000',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.58)',
            backdropFilter: 'blur(1px)'
        });

        settingsModalEl.innerHTML = `
    <div style="width: min(900px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: auto; background: #111; color: #fff; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.45); padding: 12px 12px 10px; font-family: Arial, sans-serif;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 8px;">
            <div>
                <div style="font-size: 18px; font-weight: 700;">Bonus Hub Settings</div>
                <div style="font-size: 11px; opacity: 0.8; margin-top: 2px;">Reports, Posting, and Auto-Scheduling Configuration.</div>
            </div>
            <button type="button" data-close style="padding: 6px 10px; border-radius: 6px; border: 1px solid #666; background: #222; color: #fff; cursor: pointer; font-size: 13px;">Close</button>
        </div>

        <div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; align-items: stretch;">

            <!-- COLUMN 1: DATE RANGE MODE -->
            <div style="height:100%; display:flex; flex-direction:column; background:#171717; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:10px; box-sizing:border-box;">
                <div style="font-size: 14px; font-weight: 700; margin-bottom: 8px;">Date Range Mode</div>

                <label style="display:flex; align-items:center; gap:6px; margin-bottom:6px; cursor:pointer; font-size: 13px;">
                    <input type="radio" name="pak-report-mode" value="weekly" data-report-mode-weekly />
                    <span>Weekly</span>
                </label>

                <label style="display:flex; align-items:center; gap:6px; margin-bottom:6px; cursor:pointer; font-size: 13px;">
                    <input type="radio" name="pak-report-mode" value="daily" data-report-mode-daily />
                    <span>Daily</span>
                </label>

                <!-- NEW: Rolling Backfill Mode -->
                <label style="display:flex; align-items:center; gap:6px; margin-bottom:6px; cursor:pointer; font-size: 13px;">
                    <input type="radio" name="pak-report-mode" value="backfill" data-report-mode-backfill />
                    <span>Rolling Backfill</span>
                </label>

                <div data-weekly-count-section>
                    <label style="display:block; font-size: 12px; margin-bottom: 4px;">
                        <span data-count-label>Weeks to run</span>
                    </label>
                    <input type="number" min="1" max="99" step="1" data-period-count style="width:100%; box-sizing:border-box; padding:8px 10px; border-radius:6px; border:1px solid #555; background:#0f0f0f; color:#fff; outline:none;" />
                    <div style="margin-top: 8px; font-size: 11px; opacity: 0.8; line-height: 1.35;">Weekly runs complete Sunday-to-Sunday blocks.</div>
                </div>

                <!-- SHARED DAILY / BACKFILL SECTIONS -->
                <div data-daily-range-section style="display:none; margin-top: 8px;">
                    <div style="display:grid; gap: 8px; grid-template-columns: 1fr 1fr;">
                        <label style="display:grid; gap: 4px;">
                            <span class="pak-dyn-label" data-label-from style="font-size: 11px; color: rgba(255,255,255,0.65);">From Date</span>
                            <input data-daily-from-date type="date" style="width:85%; box-sizing:border-box; border-radius:8px; border:1px solid rgba(255,255,255,0.12); background:#ffffff; color:#111111; padding:8px 5px; outline:none; font-size:13px;" />
                        </label>

                        <label style="display:grid; gap: 4px;">
                            <span class="pak-dyn-label" data-label-to style="font-size: 11px; color: rgba(255,255,255,0.65);">To Date</span>
                            <input data-daily-to-date type="date" style="width:85%; box-sizing:border-box; border-radius:8px; border:1px solid rgba(255,255,255,0.12); background:#ffffff; color:#111111; padding:8px 5px; outline:none; font-size:13px;" />
                        </label>
                    </div>

                    <div id="pak-daily-hint" style="margin-top: 8px; font-size: 11px; opacity: 0.8; line-height: 1.35;">Daily mode uses the exact date range you choose here.</div>

                    <!-- BACKFILL SPECIFIC: Interval Input -->
                    <div id="pak-backfill-section" style="display:none; margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                        <label style="display:block; font-size: 12px; margin-bottom: 4px;">
                            Interval (Minutes)
                        </label>
                        <input type="number" min="1" max="1440" step="1" data-backfill-interval style="width:100%; box-sizing:border-box; padding:8px 10px; border-radius:6px; border:1px solid #555; background:#0f0f0f; color:#fff; outline:none;" />
                        <div style="margin-top: 8px; font-size: 11px; opacity: 0.8; line-height: 1.35;">Generates sequential reports based on the Start and End date/times.</div>
                    </div>
                </div>
            </div>

            <!-- COLUMN 2: POSTING + EXPORT MODE (SPLIT IN HALF) -->
            <div style="grid-column: 2 / 3; grid-row: 1; height:100%; display:flex; flex-direction:column; gap:10px; box-sizing:border-box;">

                <!-- POSTING -->
                <div style="flex:1; display:flex; flex-direction:column; background:#171717; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:10px; box-sizing:border-box;">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 6px;">
                        <div style="font-size: 14px; font-weight: 700;">Posting</div>

                        <label class="pak-switch" style="transform:scale(0.8);">
                            <input type="checkbox" id="pak-posting-enabled-check" data-post-enabled>
                            <span class="pak-slider"></span>
                        </label>
                    </div>

                    <div id="pak-posting-controls" style="opacity: 0.4; transition: opacity 0.2s;">
                        <div style="font-size: 12px; margin-bottom: 4px; color: #fff;">Post to Google Sheets after each report</div>
                        <div style="font-size: 11px; opacity: 0.8; line-height: 1.35;">Only mapped reports will actually post. Unmapped reports will still run and save.</div>
                    </div>
                </div>

                <!-- EXPORT MODE -->
                <div style="flex:1; display:flex; flex-direction:column; background:#171717; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:10px; box-sizing:border-box;">
                    <div style="font-size: 14px; font-weight: 700; margin-bottom: 8px;">Export Mode</div>
                    <div class="pak-export-options" style="display:flex; gap:12px; font-size:12px; margin-top:4px;">
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                            <input type="checkbox" name="pak-export-combined" data-export-combined checked>
                            <span>Combined Report</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                            <input type="checkbox" name="pak-export-individual" data-export-individual checked>
                            <span>Individual Reports</span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- COLUMN 3: AUTO RUN -->
            <div style="grid-column: 3; grid-row: 1 / span 2; background:#171717; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:10px; align-self:start;">
                <div style="font-size: 14px; font-weight: 700; margin-bottom: 8px; display:flex; justify-content:space-between;">
                    Auto Run
                    <label class="pak-switch" style="transform:scale(0.8);">
                        <input type="checkbox" id="pak-autorun-enabled-check">
                        <span class="pak-slider"></span>
                    </label>
                </div>

                <div id="pak-autorun-controls" style="opacity: 0.4; pointer-events: none; transition: opacity 0.2s;">
                    <div class="pak-form-group" style="margin-bottom:8px;">
                        <label class="pak-label" style="font-size:11px; color:#aaa;">Target Action</label>
                        <select id="pak-autorun-target-select" class="pak-select" style="width:100%; padding:5px; font-size:12px;">
                            <option value="native">Current Report (On Screen ONLY)</option>
                            <option value="script">All Selected Reports (Below Selected Saved Reports)</option>
                        </select>
                    </div>

                    <div class="pak-form-group" style="margin-bottom:8px;">
                        <label class="pak-label" style="font-size:11px; color:#aaa;">Schedule Mode</label>
                        <select id="pak-autorun-mode-select" class="pak-select" style="width:100%; padding:5px; font-size:12px;">
                            <option value="time">Specific Minutes (HH:MM)</option>
                            <option value="interval">Interval (Timer)</option>
                            <option value="rolling">Rolling Interval</option>
                        </select>
                    </div>

                    <!-- SPECIFIC MINUTES SECTION -->
                    <div id="pak-autorun-section-time" class="pak-section pak-hidden" style="border:none; padding:0; margin:0;">
                        <label class="pak-label" style="font-size:11px; color:#aaa;">Minutes (e.g. 1, 15, 30)</label>
                        <input type="text" id="pak-autorun-time-input" class="pak-input" value="1" style="width:100%; padding:5px; font-size:12px;">
                    </div>

                    <!-- INTERVAL SECTION -->
                    <div id="pak-autorun-section-interval" class="pak-section pak-hidden" style="border:none; padding:0; margin:0;">
                        <div class="pak-form-group" style="margin-bottom:8px;">
                            <label class="pak-label" style="font-size:11px; color:#aaa;">Interval (Minutes)</label>
                            <input type="number" id="pak-autorun-interval-input" class="pak-input" value="60" style="width:100%; padding:5px; font-size:12px;">
                        </div>

                        <div class="pak-form-group" style="margin-bottom:8px;">
                            <label class="pak-label" style="font-size:11px; color:#aaa;">Start Strategy</label>
                            <div style="display:flex; gap:10px; font-size:12px;">
                                <label><input type="radio" name="pak-autorun-start" value="now" checked> Start Now</label>
                                <label><input type="radio" name="pak-autorun-start" value="minute"> Specific Minute</label>
                            </div>
                        </div>

                        <div id="pak-autorun-specific-minute-group" class="pak-section pak-hidden" style="margin-bottom:8px; border:none; padding:0;">
                            <label class="pak-label" style="font-size:11px; color:#aaa;">Start at Minute (0-59)</label>
                            <input type="number" id="pak-autorun-start-minute-input" min="0" max="59" style="width:100%; padding:5px; font-size:12px; box-sizing:border-box;">
                        </div>
                    </div>

                    <!-- ROLLING SECTION -->
                    <div id="pak-autorun-section-rolling" class="pak-section pak-hidden" style="border:none; padding:0; margin:0;">
                         <div class="pak-form-group" style="margin-bottom:4px;">
                            <label class="pak-label" style="font-size:11px; color:#aaa;">Rolling Interval</label>
                            <select id="pak-autorun-rolling-select" class="pak-select" style="width:100%; padding:5px; font-size:12px;">
                                <option value="5">5 Minutes</option>
                                <option value="10">10 Minutes</option>
                                <option value="15" selected>15 Minutes</option>
                                <option value="30">30 Minutes</option>
                                <option value="60">1 Hour</option>
                            </select>
                        </div>
                        <div class="pak-form-group" style="margin-top:8px;">
                            <label class="pak-label" style="font-size:11px; color:#aaa;">Run Delay (Minutes)</label>
                            <select id="pak-autorun-rolling-delay-select" class="pak-select" style="width:100%; padding:5px; font-size:12px;">
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
                        <div style="font-size: 10px; color: rgba(255,255,255,0.5); line-height: 1.3; margin-top:4px;">
                            Automatically sets date/today to the last X minutes. <b>Run Delay</b> ensures the script executes after the window closes (e.g. runs at 11:01 for the 10:45-11:00 window).
                        </div>
                    </div>
                </div>
            </div>

            <!-- TIME RANGE -->
            <div style="grid-column: 1 / 3; background:#171717; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:10px;">
                <div style="font-size: 14px; font-weight: 700; margin-bottom: 8px;" id="pak-time-range-title">Time Range</div>
                <div style="display:grid; gap:8px; grid-template-columns: repeat(4, minmax(0, 1fr));">
                    <label style="display:grid; gap:4px;">
                        <span class="pak-dyn-label" data-label-hour-from style="font-size:11px; color: rgba(255,255,255,0.65);">Hour From</span>
                        <input data-hour-from type="number" min="0" max="23" step="1" inputmode="numeric" style="width:100%; box-sizing:border-box; border-radius:8px; border:1px solid rgba(255,255,255,0.12); background:#fff; color:#111; padding:8px; outline:none; font-size:13px;" />
                    </label>

                    <label style="display:grid; gap:4px;">
                        <span class="pak-dyn-label" data-label-minute-from style="font-size:11px; color: rgba(255,255,255,0.65);">Minute From</span>
                        <input data-minute-from type="number" min="0" max="59" step="1" inputmode="numeric" style="width:100%; box-sizing:border-box; border-radius:8px; border:1px solid rgba(255,255,255,0.12); background:#fff; color:#111; padding:8px; outline:none; font-size:13px;" />
                    </label>

                    <label style="display:grid; gap:4px;">
                        <span class="pak-dyn-label" data-label-hour-to style="font-size:11px; color: rgba(255,255,255,0.65);">Hour To</span>
                        <input data-hour-to type="number" min="0" max="23" step="1" inputmode="numeric" style="width:100%; box-sizing:border-box; border-radius:8px; border:1px solid rgba(255,255,255,0.12); background:#fff; color:#111; padding:8px; outline:none; font-size:13px;" />
                    </label>

                    <label style="display:grid; gap:4px;">
                        <span class="pak-dyn-label" data-label-minute-to style="font-size:11px; color: rgba(255,255,255,0.65);">Minute To</span>
                        <input data-minute-to type="number" min="0" max="59" step="1" inputmode="numeric" style="width:100%; box-sizing:border-box; border-radius:8px; border:1px solid rgba(255,255,255,0.12); background:#fff; color:#111; padding:8px; outline:none; font-size:13px;" />
                    </label>
                </div>
            </div>

            <!-- SAVED REPORTS -->
            <div style="grid-column: 1 / -1; background:#171717; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:10px;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom: 6px;">
                    <div style="font-size: 14px; font-weight: 700;">Saved reports</div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button type="button" data-select-all style="padding:4px 8px; border-radius:6px; border:1px solid #666; background:#222; color:#fff; cursor:pointer; font-size:11px;">Select all</button>
                        <button type="button" data-select-none style="padding:4px 8px; border-radius:6px; border:1px solid #666; background:#222; color:#fff; cursor:pointer; font-size:11px;">Select none</button>
                    </div>
                </div>

                <div style="font-size: 11px; opacity: 0.75; margin-bottom: 6px;">This list refreshes automatically when Settings opens.</div>

                <div data-report-list style="position:relative; max-height: 320px; overflow-y: auto; margin-right: -6px; padding-right: 6px; padding-bottom: 4px;">
                    <div data-report-loading style="display:flex; align-items:center; justify-content:center; gap:10px; min-height:100px; color: rgba(255,255,255,0.8);">
                        <div style="width:16px; height:16px; border-radius:50%; border:2px solid rgba(255,255,255,0.25); border-top-color:#fff; animation: pakSpin 0.85s linear infinite;"></div>
                        <div style="font-size: 12px;">Loading saved reports...</div>
                    </div>
                </div>
            </div>
        </div>

        <div data-error style="min-height:16px; font-size:12px; color:#ffb4b4; margin-top:8px;"></div>

        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:12px;">
            <button type="button" id="pak-clear-data-btn" title="Clear Background Data, click when tab is slowing down" style="width:32px; height:32px; border-radius:8px; border:1px solid #a33; background:#500; color:#fff; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                <i class="fa-solid fa-trash-can"></i>
            </button>

            <div style="display:flex; gap:8px;">
                <button type="button" data-cancel style="padding:8px 12px; border-radius:6px; border:1px solid #666; background:#222; color:#fff; cursor:pointer; font-size:13px;">Cancel</button>
                <button type="button" data-save style="padding:8px 12px; border-radius:6px; border:1px solid #2d9c57; background:#0f6b2e; color:#fff; cursor:pointer; font-weight:700; font-size:13px;">Save</button>
            </div>
        </div>
    </div>

    <style>
        @keyframes pakSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .pak-switch { position: relative; display: inline-block; width: 30px; height: 16px; }
        .pak-switch input { opacity: 0; width: 0; height: 0; }
        .pak-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #555; transition: .4s; border-radius: 16px; }
        .pak-slider:before { position: absolute; content: ""; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .pak-slider { background-color: #22c55e; }
        input:checked + .pak-slider:before { transform: translateX(14px); }
        .pak-hidden { display: none; }

        [data-report-list]::-webkit-scrollbar { width: 6px; }
        [data-report-list]::-webkit-scrollbar-track { background: #222; border-radius: 3px; }
        [data-report-list]::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
        [data-report-list]::-webkit-scrollbar-thumb:hover { background: #777; }
    </style>
`;

        document.body.appendChild(settingsModalEl);

        // Main Settings Elements
        settingsEls = {
            overlay: settingsModalEl,
            closeBtn: settingsModalEl.querySelector('[data-close]'),
            cancelBtn: settingsModalEl.querySelector('[data-cancel]'),
            saveBtn: settingsModalEl.querySelector('[data-save]'),
            postEnabledCheckbox: settingsModalEl.querySelector('[data-post-enabled]'),
            reportModeWeekly: settingsModalEl.querySelector('[data-report-mode-weekly]'),
            reportModeDaily: settingsModalEl.querySelector('[data-report-mode-daily]'),
            reportModeBackfill: settingsModalEl.querySelector('[data-report-mode-backfill]'), // NEW
            weeklyCountSection: settingsModalEl.querySelector('[data-weekly-count-section]'),
            dailyRangeSection: settingsModalEl.querySelector('[data-daily-range-section]'),
            dailyHint: settingsModalEl.querySelector('#pak-daily-hint'),
            backfillSection: settingsModalEl.querySelector('#pak-backfill-section'), // NEW
            periodCountInput: settingsModalEl.querySelector('[data-period-count]'),
            countLabel: settingsModalEl.querySelector('[data-count-label]'),
            dailyFromDateInput: settingsModalEl.querySelector('[data-daily-from-date]'),
            dailyToDateInput: settingsModalEl.querySelector('[data-daily-to-date]'),
            hourFromInput: settingsModalEl.querySelector('[data-hour-from]'),
            minuteFromInput: settingsModalEl.querySelector('[data-minute-from]'),
            hourToInput: settingsModalEl.querySelector('[data-hour-to]'),
            minuteToInput: settingsModalEl.querySelector('[data-minute-to]'),
            backfillIntervalInput: settingsModalEl.querySelector('[data-backfill-interval]'), // NEW
            reportList: settingsModalEl.querySelector('[data-report-list]'),
            selectAllBtn: settingsModalEl.querySelector('[data-select-all]'),
            selectNoneBtn: settingsModalEl.querySelector('[data-select-none]'),
            errorEl: settingsModalEl.querySelector('[data-error]'),
            clearDataBtn: settingsModalEl.querySelector('#pak-clear-data-btn'),
            exportCombinedCheckbox: settingsModalEl.querySelector('[data-export-combined]'),
            exportIndividualCheckbox: settingsModalEl.querySelector('[data-export-individual]'),
            postingCheck: settingsModalEl.querySelector('#pak-posting-enabled-check'),
            postingControls: settingsModalEl.querySelector('#pak-posting-controls'),
            // Dynamic Labels
            labelFromDate: settingsModalEl.querySelector('[data-label-from]'),
            labelToDate: settingsModalEl.querySelector('[data-label-to]'),
            labelHourFrom: settingsModalEl.querySelector('[data-label-hour-from]'),
            labelMinuteFrom: settingsModalEl.querySelector('[data-label-minute-from]'),
            labelHourTo: settingsModalEl.querySelector('[data-label-hour-to]'),
            labelMinuteTo: settingsModalEl.querySelector('[data-label-minute-to]'),
            timeRangeTitle: settingsModalEl.querySelector('#pak-time-range-title')
        };

        // Auto Run Specific Elements
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

        // Main Settings
        settingsEls.closeBtn.addEventListener('click', closeSettingsPanel);
        settingsEls.cancelBtn.addEventListener('click', closeSettingsPanel);
        settingsEls.saveBtn.addEventListener('click', saveSettingsPanel);
        settingsEls.reportModeWeekly.addEventListener('change', onReportModeChanged);
        settingsEls.reportModeDaily.addEventListener('change', onReportModeChanged);
        settingsEls.reportModeBackfill.addEventListener('change', onReportModeChanged); // NEW
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

        // Export Mode Constraint Logic
        settingsEls.exportCombinedCheckbox.addEventListener('change', function() {
            if (!this.checked && !settingsEls.exportIndividualCheckbox.checked) {
                settingsEls.exportIndividualCheckbox.checked = true;
                showToast('One export mode must be selected');
            }
        });

        settingsEls.exportIndividualCheckbox.addEventListener('change', function() {
            if (!this.checked && !settingsEls.exportCombinedCheckbox.checked) {
                settingsEls.exportCombinedCheckbox.checked = true;
                showToast('One export mode must be selected');
            }
        });

        // Auto Run Events
        settingsEls.enabledCheck.addEventListener('change', (e) => {
            const controls = settingsEls.controlsDiv;
            const isEnabled = e.target.checked;
            if (isEnabled) {
                controls.style.opacity = '1';
                controls.style.pointerEvents = 'auto';
            } else {
                controls.style.opacity = '0.4';
                controls.style.pointerEvents = 'none';
            }

            const mode = settingsEls.modeSelect.value;
            if (mode === 'rolling') {
                toggleDateInputsDisabled(isEnabled);
            }
        });

        // Schedule Mode Toggle
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

        // Start Strategy Toggle
        settingsModalEl.querySelectorAll('input[name="pak-autorun-start"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const strategy = e.target.value;
                if (strategy === 'minute') {
                    settingsEls.specificMinuteGroup.classList.remove('pak-hidden');
                } else {
                    settingsEls.specificMinuteGroup.classList.add('pak-hidden');
                }
            });
        });

        // Posting Toggle Logic
        if (settingsEls.postingCheck && settingsEls.postingControls) {
            settingsEls.postingCheck.addEventListener('change', (e) => {
                settingsEls.postingControls.style.opacity = e.target.checked ? '1' : '0.4';
            });
        }

        return settingsModalEl;
    }

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
            if(el) {
                el.disabled = disabled;
                el.style.opacity = disabled ? '0.5' : '1';
            }
        });
        const sections = [settingsEls.weeklyCountSection, settingsEls.dailyRangeSection];
        sections.forEach(sec => {
            if(sec) sec.style.opacity = disabled ? '0.5' : '1';
        });
    }

    function setSettingsError(message = '') { if (settingsEls?.errorEl) settingsEls.errorEl.textContent = message; }
    function setReportListLoadingState(isLoading, message = 'Loading saved reports...') { if (!settingsEls?.reportList) return; let loadingEl = settingsEls.reportList.querySelector('[data-report-loading]'); if (isLoading) { if (!loadingEl) { loadingEl = document.createElement('div'); loadingEl.setAttribute('data-report-loading', 'true'); Object.assign(loadingEl.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', minHeight: '100px', color: 'rgba(255,255,255,0.8)' }); loadingEl.innerHTML = `<div style="width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25); border-top-color: #fff; animation: pakSpin 0.85s linear infinite;"></div><div style="font-size: 12px;"></div>`; settingsEls.reportList.appendChild(loadingEl); } const textNode = loadingEl.querySelector('div:last-child'); if (textNode) textNode.textContent = message; return; } loadingEl?.remove(); }

    function onReportModeChanged() { updateModeUI(); renderSettingsReportList(); }

    function updateModeUI() {
        if (!settingsEls) return;

        const mode = settingsEls.reportModeDaily?.checked ? 'daily' : (settingsEls.reportModeBackfill?.checked ? 'backfill' : 'weekly');

        // Visibility
        settingsEls.weeklyCountSection.style.display = mode === 'weekly' ? '' : 'none';
        settingsEls.dailyRangeSection.style.display = (mode === 'daily' || mode === 'backfill') ? '' : 'none';
        settingsEls.backfillSection.style.display = mode === 'backfill' ? 'block' : 'none';
        settingsEls.dailyHint.style.display = mode === 'daily' ? 'block' : 'none';

        // Labels
        if (mode === 'backfill') {
            settingsEls.labelFromDate.textContent = "Start Date";
            settingsEls.labelToDate.textContent = "End Date";
            settingsEls.timeRangeTitle.textContent = "Start & End Times";
            settingsEls.labelHourFrom.textContent = "Start Hour";
            settingsEls.labelMinuteFrom.textContent = "Start Minute";
            settingsEls.labelHourTo.textContent = "End Hour";
            settingsEls.labelMinuteTo.textContent = "End Minute";
        } else {
            settingsEls.labelFromDate.textContent = "From Date";
            settingsEls.labelToDate.textContent = "To Date";
            settingsEls.timeRangeTitle.textContent = "Time Range";
            settingsEls.labelHourFrom.textContent = "Hour From";
            settingsEls.labelMinuteFrom.textContent = "Minute From";
            settingsEls.labelHourTo.textContent = "Hour To";
            settingsEls.labelMinuteTo.textContent = "Minute To";
        }
    }

    function syncSelectionStateFromCheckboxes() { if (!settingsEls?.reportList) return; Array.from(settingsEls.reportList.querySelectorAll('input[type="checkbox"]')).forEach(box => { const name = box.dataset.reportName; if (name) settings.selectedReports[name] = !!box.checked; }); }
    function setAllReportSelections(checked) { if (!settingsEls?.reportList) return; Array.from(settingsEls.reportList.querySelectorAll('input[type="checkbox"]')).forEach(box => { box.checked = checked; const name = box.dataset.reportName; if (name) settings.selectedReports[name] = checked; }); }

    function renderSettingsReportList() {
        if (!settingsEls?.reportList) return; settingsEls.reportList.innerHTML = '';
        const names = availableReports.length ? availableReports : reportNamesFallback();
        // Determine which URL map to use based on main report mode (daily vs weekly)
        // Note: Backfill usually implies Daily data points
        const activeMap = settingsEls.reportModeBackfill.checked ? REPORT_POST_URLS_BACKFILL
                : settingsEls.reportModeDaily.checked    ? REPORT_POST_URLS_DAILY
                :                                          REPORT_POST_URLS_WEEKLY;

        const grid = document.createElement('div'); Object.assign(grid.style, { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' });
        names.forEach(reportName => { if (typeof settings.selectedReports[reportName] !== 'boolean') settings.selectedReports[reportName] = true; const wrap = document.createElement('label'); Object.assign(wrap.style, { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', background: '#0f0f0f', cursor: 'pointer', minHeight: '44px', boxSizing: 'border-box' }); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.dataset.reportName = reportName; checkbox.checked = !!settings.selectedReports[reportName]; checkbox.style.transform = 'scale(1.05)'; checkbox.addEventListener('change', () => { settings.selectedReports[reportName] = !!checkbox.checked; }); const text = document.createElement('div'); Object.assign(text.style, { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '0' }); const title = document.createElement('div'); Object.assign(title.style, { fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px' }); title.textContent = reportName; const sub = document.createElement('div'); Object.assign(sub.style, { fontSize: '10px', opacity: '0.75' }); sub.textContent = !!findUrlInMap(activeMap, reportName) ? 'Mapped for posting' : 'Will run only'; text.appendChild(title); text.appendChild(sub); wrap.appendChild(checkbox); wrap.appendChild(text); grid.appendChild(wrap); });
        settingsEls.reportList.appendChild(grid);
    }

    function loadSettingsIntoPanel() {
        settingsEls.postEnabledCheckbox.checked = !!settings.postEnabled;

        const postingCheck = settingsModalEl.querySelector('#pak-posting-enabled-check');
        const postingControls = settingsModalEl.querySelector('#pak-posting-controls');
        if(postingCheck && postingControls) {
             postingControls.style.opacity = postingCheck.checked ? '1' : '0.4';
        }

        // Radio Buttons
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

        // Load Export Mode (Checkboxes)
        const exportMode = settings.exportMode || { combined: true, individual: true };
        settingsEls.exportCombinedCheckbox.checked = !!exportMode.combined;
        settingsEls.exportIndividualCheckbox.checked = !!exportMode.individual;

        // Load Auto Run Settings
        settingsEls.enabledCheck.checked = !!autoRunSettings.enabled;
        settingsEls.targetSelect.value = autoRunSettings.targetMode;
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
        if (checkedRadio) {
             const evt = new Event('change');
             checkedRadio.dispatchEvent(evt);
        } else {
            settingsEls.specificMinuteGroup.classList.add('pak-hidden');
        }

        updateModeUI(); renderSettingsReportList();
    }

    function saveSettingsPanel() {
        syncSelectionStateFromCheckboxes();
        const s = defaultSettings();
        s.postEnabled = !!settingsEls.postEnabledCheckbox.checked;

        // Mode
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

        // Save Export Mode (Checkboxes)
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
        startRadios.forEach(r => { if(r.checked) autoRunSettings.intervalStartMode = r.value; });

        autoRunSettings.intervalStartMinute = parseInt(settingsEls.startMinuteInput.value) || 0;

        localStorage.setItem(AUTORUN_STORAGE_KEY, JSON.stringify(autoRunSettings));

        setSettingsError('');
        closeSettingsPanel();
        resetAutoRunScheduler();
    }

    function openSettingsPanel() { if (controlsDisabled) return; settingsOpen = true; ensureSettingsModal(); setSettingsError(''); setReportListLoadingState(true, 'Loading live saved reports...'); settingsModalEl.style.display = 'flex'; document.body.style.overflow = 'hidden'; loadSettingsIntoPanel(); (async () => { try { await loadAvailableReportsAndNormalizeSettings(); if (!settingsOpen) return; loadSettingsIntoPanel(); setReportListLoadingState(false); setSettingsError(''); } catch (err) { console.warn('Could not load live reports:', err); if (!settingsOpen) return; setReportListLoadingState(false); setSettingsError('Could not load live reports. Showing cached list instead.'); } })(); }
    function closeSettingsPanel() { if (!settingsModalEl) return; settingsModalEl.style.display = 'none'; document.body.style.overflow = ''; settingsOpen = false; setTimeout(() => { clickReportBuilderTab().catch(() => {}); }, 150); }

    async function waitForPageReady() { if (document.readyState !== 'complete') await new Promise(resolve => window.addEventListener('load', resolve, { once: true })); const deadline = Date.now() + 15000; while (Date.now() < deadline) { if (document.querySelector('input[formcontrolname="from"]') && document.querySelector('input[formcontrolname="to"]')) return true; await sleep(120); } return false; }


    // --- AUTO RUN LOGIC (INTEGRATED) ---

    function createAutoRunStatusButton() {
        const btn = document.createElement('div');
        Object.assign(btn.style, {
            position: 'fixed', bottom: '10px', left: '10px', zIndex: '99999',
            background: '#202020', color: '#fff', border: '1px solid #444', borderRadius: '8px',
            padding: '8px 12px', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)', transition: 'background 0.2s'
        });

        btn.innerHTML = `
            <div id="pak-status-dot" class="pak-status-dot ${autoRunSettings.enabled ? 'active' : ''}" style="width: 8px; height: 8px; border-radius: 50%; background-color: #555;"></div>
            <i class="fa-solid fa-stopwatch"></i>
            <span id="pak-countdown" class="pak-countdown" style="font-size: 11px; font-family: monospace; color: #aaa;">...</span>
        `;

        btn.onclick = openSettingsPanel;
        btn.onmouseover = () => btn.style.background = '#333';
        btn.onmouseout = () => btn.style.background = '#202020';

        document.body.appendChild(btn);
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
                if (s === 0) {
                    nextM = m;
                } else {
                    nextM = m + interval;
                }
            }

            next = new Date(now);
            next.setMinutes(nextM, 0, 0);

            if (delayMins > 0) {
                next.setMinutes(next.getMinutes() + delayMins);
            }

            return next;

        } else if (autoRunSettings.mode === 'time') {
            const targetMins = autoRunSettings.timeMinutes.split(',')
                .map(s => parseInt(s.trim()))
                .filter(n => !isNaN(n) && n >= 0 && n <= 59)
                .sort((a,b) => a - b);

            if (targetMins.length === 0) return null;

            const currentMin = now.getMinutes();
            const currentHour = now.getHours();

            let found = targetMins.find(m => m > currentMin);

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
                if (delayMins > 0) {
                    tooltip += `\n(Execution delayed by ${delayMins}m)`;
                }
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
