// ==UserScript==
// @name         [PAK] PSD - BonusHub Auto Selector
// @namespace    http://tampermonkey.net/
// @version      5.6
// @description  Auto-select warehouse and saved date range. Enhanced warehouse fetching to visually open the dropdown and scrape the live list from the screen.
// @author       Pak
// @match        https://pon-wpws27/Whds.Dashboard.Web/bonushub/reports
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20PSD%20-%20BonusHub%20Auto%20Selector.user.js
// @downloadURL  https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20PSD%20-%20BonusHub%20Auto%20Selector.user.js
// ==/UserScript==

(function () {
    'use strict';

    /************ Speed Tuning ************/
    const FAST = true;
    const BASE = FAST ? 0.45 : 1;
    const sleep = (ms) => new Promise((res) => setTimeout(res, Math.max(20, Math.round(ms * BASE))));

    /************ Storage ************/
    const STORAGE_KEY = '[PAK] BonusHub Auto Selector Settings';
    const PROMPTED_KEY = '[PAK] BonusHub Auto Selector Prompted';
    const WAREHOUSE_OPTIONS_KEY = '[PAK] BonusHub Warehouse Options';

    function getDefaultSettings() {
        return { warehouse: 'Elmsall', periodType: '1 week', customCount: '1', customUnit: 'week', hourFrom: '00', minuteFrom: '00', hourTo: '23', minuteTo: '59' };
    }

    function clampPad2(value, min, max, fallback) {
        const n = Number.parseInt(value, 10);
        if (!Number.isInteger(n) || n < min || n > max) return fallback;
        return String(n).padStart(2, '0');
    }

    function loadSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            return {
                warehouse: String(parsed.warehouse || '').trim() || 'Elmsall',
                periodType: String(parsed.periodType || '1 week').trim(),
                customCount: String(parsed.customCount || '1').trim(),
                customUnit: String(parsed.customUnit || 'week').trim(),
                hourFrom: clampPad2(parsed.hourFrom, 0, 23, '00'),
                minuteFrom: clampPad2(parsed.minuteFrom, 0, 59, '00'),
                hourTo: clampPad2(parsed.hourTo, 0, 23, '23'),
                minuteTo: clampPad2(parsed.minuteTo, 0, 59, '59')
            };
        } catch (err) {
            console.warn('Failed to load settings:', err);
            return null;
        }
    }

    function saveSettings(settings) { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
    function hasBeenPrompted() { return localStorage.getItem(PROMPTED_KEY) === '1'; }
    function markPrompted() { localStorage.setItem(PROMPTED_KEY, '1'); }
    function pad2(value) { return String(value).padStart(2, '0'); }

    function getCachedWarehouseOptions() {
        try {
            const raw = localStorage.getItem(WAREHOUSE_OPTIONS_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch (err) {
            return [];
        }
    }

    function saveCachedWarehouseOptions(options) {
        try {
            const unique = [...new Set((options || []).map(v => normalizeText(v)).filter(Boolean))];
            if (unique.length) localStorage.setItem(WAREHOUSE_OPTIONS_KEY, JSON.stringify(unique));
        } catch (err) {
            console.warn('Failed to save warehouse options cache:', err);
        }
    }

    function clearWarehouseCache() {
        try {
            localStorage.removeItem(WAREHOUSE_OPTIONS_KEY);
            warehouseOptions = [];
            console.log('[PAK] Warehouse cache cleared.');
        } catch (err) {
            console.warn('[PAK] Failed to clear warehouse cache:', err);
        }
    }

    /************ Helpers ************/
    function normalizeText(text) { return (text || '').replace(/\u00a0/g, ' ').trim(); }
    function isVisible(el) { return !!el && el.offsetParent !== null; }

    function toISODate(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function fromISODate(value) {
        if (!value) return null;
        const d = new Date(`${value}T00:00:00`);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function formatCalendarLabel(date) { return `${date.getDate()} ${date.toLocaleString('en-US', { month: 'long' })} ${date.getFullYear()}`; }

    function closePopupPanels() {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
        document.body.click();
    }

    /************ Overlay (Running) ************/
    let overlayEl = null, statusTextEl = null, progressTextEl = null;

    function ensureOverlay() {
        if (overlayEl) return;
        overlayEl = document.createElement('div');
        Object.assign(overlayEl.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(0,0,0,0.73)',
            zIndex: '99999',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'all',
            userSelect: 'none'
        });

        overlayEl.innerHTML = `
            <div style="width: min(520px, calc(100vw - 32px)); padding: 28px 24px 22px; border-radius: 18px; background: rgba(16,16,16,0.92); box-shadow: 0 18px 50px rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.08); text-align: center; color: #fff; backdrop-filter: blur(2px);">
                <div style="margin-bottom: 14px;"><i class="fa fa-thumb-tack" style="font-size: 54px; color: #ffffff; display: inline-block; animation: pakPinPulse 1.15s ease-in-out infinite; transform-origin: 50% 72%;"></i></div>
                <div data-status style="font-size: 20px; font-weight: 700; letter-spacing: 0.2px; margin-bottom: 10px;">Running...</div>
                <div data-progress style="font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.88); min-height: 20px; line-height: 1.4;">Preparing...</div>
            </div>
            <style>@keyframes pakPinPulse { 0% { transform: translateY(0) rotate(0deg) scale(1); opacity: 0.95; } 25% { transform: translateY(-3px) rotate(-8deg) scale(1.03); opacity: 1; } 50% { transform: translateY(0) rotate(0deg) scale(1); opacity: 0.95; } 75% { transform: translateY(-2px) rotate(8deg) scale(1.03); opacity: 1; } 100% { transform: translateY(0) rotate(0deg) scale(1); opacity: 0.95; } }</style>
        `;
        document.body.appendChild(overlayEl);
        progressTextEl = overlayEl.querySelector('[data-progress]');
        statusTextEl = overlayEl.querySelector('[data-status]');
    }

    function showOverlay(status = 'Running...', progress = 'Preparing...') {
        ensureOverlay();
        statusTextEl.textContent = status;
        progressTextEl.textContent = progress;
        overlayEl.style.display = 'flex';
    }

    function setOverlay(status, progress) {
        if (statusTextEl && typeof status === 'string') statusTextEl.textContent = status;
        if (progressTextEl && typeof progress === 'string') progressTextEl.textContent = progress;
    }

    function hideOverlay() { if (overlayEl) overlayEl.style.display = 'none'; }

    /************ Settings Modal ************/
    let settingsOverlayEl = null, settingsOpen = false;
    let settingsWarehouseSelect = null, settingsPeriodTypeSelect = null;
    let settingsCustomWrap = null, settingsCustomCountInput = null, settingsCustomUnitSelect = null;
    let settingsHourFromInput = null, settingsMinuteFromInput = null, settingsHourToInput = null, settingsMinuteToInput = null;
    let settingsErrorEl = null, warehouseOptions = [];

    const INPUT_STYLE = "width: 100%; box-sizing: border-box; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12); background: #ffffff; color: #111111; padding: 12px 12px; outline: none; font-size: 15px;";

    function ensureSettingsModal() {
        if (settingsOverlayEl) return;
        settingsOverlayEl = document.createElement('div');
        Object.assign(settingsOverlayEl.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(0,0,0,0.78)',
            zIndex: '100000',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'all',
            userSelect: 'none'
        });

        settingsOverlayEl.innerHTML = `
            <div data-panel style="width: min(720px, calc(100vw - 28px)); border-radius: 18px; background: rgba(18,18,18,0.96); border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 24px 70px rgba(0,0,0,0.55); color: #fff; padding: 22px 22px 18px; backdrop-filter: blur(3px);">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 18px;">
                    <div style="font-size: 20px; font-weight: 700;">Auto Select Settings</div>
                    <button type="button" data-close style="background: transparent; border: 0; color: rgba(255,255,255,0.82); font-size: 28px; line-height: 1; cursor: pointer; padding: 0 4px;" aria-label="Close settings">×</button>
                </div>
                <div style="display:grid; gap: 14px;">
                    <label style="display:grid; gap: 6px;">
                        <span style="font-size: 13px; color: rgba(255,255,255,0.78);">Warehouse</span>
                        <select data-warehouse-select style="${INPUT_STYLE}">
                            <option value="" disabled selected style="color:#999;">Loading warehouses...</option>
                        </select>
                    </label>
                    <label style="display:grid; gap: 6px;">
                        <span style="font-size: 13px; color: rgba(255,255,255,0.78);">Date range</span>
                        <select data-period-type style="${INPUT_STYLE}">
                            <option value="1 day" style="color:#111;">Previous day</option>
                            <option value="2 days" style="color:#111;">The day before</option>
                            <option value="1 week" style="color:#111;">Previous week (Sun-Sun)</option>
                            <option value="2 weeks" style="color:#111;">The week before (Sun-Sun)</option>
                            <option value="custom" style="color:#111;">Customise</option>
                        </select>
                    </label>
                    <div data-custom-wrap style="display:none; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr));">
                        <label style="display:grid; gap: 6px;">
                            <span style="font-size: 13px; color: rgba(255,255,255,0.78);">Custom Count</span>
                            <input data-custom-count type="number" min="1" step="1" inputmode="numeric" value="1" style="${INPUT_STYLE}">
                        </label>
                        <label style="display:grid; gap: 6px;">
                            <span style="font-size: 13px; color: rgba(255,255,255,0.78);">Custom Unit</span>
                            <select data-custom-unit style="${INPUT_STYLE}">
                                <option value="day" style="color:#111;">Day(s)</option>
                                <option value="week" style="color:#111;">Week(s)</option>
                            </select>
                        </label>
                    </div>
                    <div data-custom-help style="font-size: 12px; color: rgba(255,255,255,0.55); margin-top: -4px;">Custom ranges count back from today and include today (days) or last complete Sunday (weeks).</div>
                    <div style="display:grid; gap: 6px;">
                        <span style="font-size: 13px; color: rgba(255,255,255,0.78);">Time range</span>
                        <div style="display:grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr));">
                            ${['Hour From|data-hour-from|0|23', 'Minute From|data-minute-from|0|59', 'Hour To|data-hour-to|0|23', 'Minute To|data-minute-to|0|59'].map(s => {
                                const [label, data, min, max] = s.split('|');
                                return `<label style="display:grid; gap: 6px;"><span style="font-size: 12px; color: rgba(255,255,255,0.65);">${label}</span><input ${data} type="number" min="${min}" max="${max}" step="1" inputmode="numeric" style="${INPUT_STYLE}"></label>`;
                            }).join('')}
                        </div>
                    </div>
                    <div data-error style="min-height: 18px; font-size: 13px; color: #ffb4b4;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; gap: 10px; margin-top: 18px;">
                    <button type="button" data-clear-cache
                        title="Clear warehouse cache"
                        style="border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color: #fff; border-radius: 12px; padding: 10px 14px; cursor: pointer; font-size: 14px; font-weight: 600; display:inline-flex; align-items:center; gap:8px;">
                        <i class="fa fa-trash"></i>

                    </button>

                    <div style="display:flex; gap: 10px;">
                        <button type="button" data-cancel style="border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color: #fff; border-radius: 12px; padding: 10px 16px; cursor: pointer; font-size: 14px; font-weight: 600;">Cancel</button>
                        <button type="button" data-save style="border: 0; background: #ffffff; color: #111; border-radius: 12px; padding: 10px 18px; cursor: pointer; font-size: 14px; font-weight: 700;">Save</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(settingsOverlayEl);

        const panel = settingsOverlayEl.querySelector('[data-panel]');
        settingsWarehouseSelect = settingsOverlayEl.querySelector('[data-warehouse-select]');
        settingsPeriodTypeSelect = settingsOverlayEl.querySelector('[data-period-type]');
        settingsCustomWrap = settingsOverlayEl.querySelector('[data-custom-wrap]');
        settingsCustomCountInput = settingsOverlayEl.querySelector('[data-custom-count]');
        settingsCustomUnitSelect = settingsOverlayEl.querySelector('[data-custom-unit]');
        settingsHourFromInput = settingsOverlayEl.querySelector('[data-hour-from]');
        settingsMinuteFromInput = settingsOverlayEl.querySelector('[data-minute-from]');
        settingsHourToInput = settingsOverlayEl.querySelector('[data-hour-to]');
        settingsMinuteToInput = settingsOverlayEl.querySelector('[data-minute-to]');
        settingsErrorEl = settingsOverlayEl.querySelector('[data-error]');

        settingsOverlayEl.addEventListener('click', (e) => e.stopPropagation());
        panel.addEventListener('click', (e) => e.stopPropagation());
        settingsOverlayEl.querySelector('[data-close]').addEventListener('click', closeSettingsModal);
        settingsOverlayEl.querySelector('[data-cancel]').addEventListener('click', closeSettingsModal);
        settingsOverlayEl.querySelector('[data-save]').addEventListener('click', onSaveSettings);
        settingsOverlayEl.querySelector('[data-clear-cache]').addEventListener('click', async () => {
            clearWarehouseCache();
            setSettingsError('Warehouse cache cleared. Re-fetching...');
            await populateWarehousePicker(settingsWarehouseSelect?.value || 'Elmsall');
            setSettingsError('Warehouse cache cleared.');
        });
        settingsPeriodTypeSelect.addEventListener('change', updateCustomVisibility);
        settingsCustomUnitSelect.addEventListener('change', () => {
            if (settingsCustomUnitSelect.value === 'week') {
                settingsCustomCountInput.max = '5';
                if (Number(settingsCustomCountInput.value) > 5) {
                    settingsCustomCountInput.value = '5';
                }
            } else if (settingsCustomUnitSelect.value === 'day') {
                settingsCustomCountInput.max = '35';
                if (Number(settingsCustomCountInput.value) > 35) {
                    settingsCustomCountInput.value = '35';
                }
            }
        });
    }

    function setSettingsError(message = '') {
        if (settingsErrorEl) settingsErrorEl.textContent = message;
    }

    function updateCustomVisibility() {
        if (settingsPeriodTypeSelect && settingsCustomWrap) {
            settingsCustomWrap.style.display = settingsPeriodTypeSelect.value === 'custom' ? 'grid' : 'none';
        }
    }

    /**
     * Enhanced Fetcher: Visually opens the dropdown, waits for the overlay to populate,
     * scrapes the options, and then closes the panel.
     */
    async function fetchWarehouseOptionsFromPage() {
        try {
            const formFields = Array.from(document.querySelectorAll('mat-form-field, .mat-mdc-form-field'));
            const field = formFields.find(f => normalizeText(f.innerText).toLowerCase().includes('warehouse'));
            if (!field) {
                console.warn('[PAK] Warehouse form field not found on page.');
                return [];
            }

            let trigger = field.querySelector('.mat-mdc-select-trigger, .mat-select-trigger');
            if (!trigger) {
                const input = field.querySelector('input');
                if (input) trigger = input;
                else trigger = field;
            }

            trigger.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(300);

            console.log('[PAK] Clicking Warehouse dropdown to open list...');
            trigger.click();
            await sleep(400);

            let options = [];
            const deadline = Date.now() + 8000;

            while (Date.now() < deadline) {
                const overlayPane = document.querySelector('.cdk-overlay-pane');
                const searchRoot = overlayPane || document.body;
                const optionElements = searchRoot.querySelectorAll('mat-option, .mat-mdc-option');

                if (optionElements.length > 0) {
                    const rawTexts = Array.from(optionElements).map(opt => normalizeText(opt.innerText || opt.textContent));
                    options = rawTexts.filter(t => t && t !== '' && t !== ' ' && t.toLowerCase() !== 'warehouse');
                }

                if (options.length > 0) break;

                await sleep(200);
            }

            closePopupPanels();
            await sleep(300);

            if (options.length === 0) {
                console.warn('[PAK] No warehouse options found after opening dropdown.');
                const cached = getCachedWarehouseOptions();
                if (cached.length) return cached;
                return ['Elmsall'];
            }

            const unique = [...new Set(options)];
            saveCachedWarehouseOptions(unique);
            console.log(`[PAK] Successfully fetched ${unique.length} warehouses:`, unique);
            return unique;

        } catch (err) {
            console.warn('[PAK] Exception while fetching warehouse options:', err);
            closePopupPanels();
            return [];
        }
    }

    async function ensureWarehouseOptionsLoaded() {
        if (warehouseOptions.length) return warehouseOptions;
        warehouseOptions = getCachedWarehouseOptions();
        if (warehouseOptions.length) return warehouseOptions;
        warehouseOptions = await fetchWarehouseOptionsFromPage();
        return warehouseOptions;
    }

    async function populateWarehousePicker(selectedValue) {
        await ensureWarehouseOptionsLoaded();
        if (!warehouseOptions.length) warehouseOptions = ['Elmsall'];

        settingsWarehouseSelect.innerHTML = '';
        warehouseOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            option.style.color = '#111';
            settingsWarehouseSelect.appendChild(option);
        });

        const targetValue = selectedValue || warehouseOptions[0] || 'Elmsall';
        if (warehouseOptions.includes(targetValue)) {
            settingsWarehouseSelect.value = targetValue;
        } else {
            settingsWarehouseSelect.value = warehouseOptions[0];
        }
    }

    async function openSettingsModal(initialSettings = null) {
        ensureSettingsModal();
        const settings = initialSettings || loadSettings() || getDefaultSettings();
        settingsOpen = true;
        setSettingsError('');

        await populateWarehousePicker(settings.warehouse || 'Elmsall');

        settingsPeriodTypeSelect.value = settings.periodType || '1 week';
        settingsCustomCountInput.value = settings.customCount || '1';
        if (settingsCustomUnitSelect.value === 'week') {
            settingsCustomCountInput.max = '5';
        } else if (settingsCustomUnitSelect.value === 'day') {
            settingsCustomCountInput.max = '35';
        } else {
            settingsCustomCountInput.removeAttribute('max');
        }
        settingsHourFromInput.value = pad2(settings.hourFrom || '00');
        settingsMinuteFromInput.value = pad2(settings.minuteFrom || '00');
        settingsHourToInput.value = pad2(settings.hourTo || '23');
        settingsMinuteToInput.value = pad2(settings.minuteTo || '59');
        updateCustomVisibility();
        settingsOverlayEl.style.display = 'flex';
        settingsWarehouseSelect.focus();
    }

    function closeSettingsModal() {
        if (settingsOverlayEl) settingsOverlayEl.style.display = 'none';
        settingsOpen = false;
    }

    function readSettingsForm() {
        return {
            warehouse: normalizeText(settingsWarehouseSelect?.value || ''),
            periodType: normalizeText(settingsPeriodTypeSelect?.value || '1 week'),
            customCount: normalizeText(settingsCustomCountInput?.value || '1'),
            customUnit: normalizeText(settingsCustomUnitSelect?.value || 'week'),
            hourFrom: clampPad2(settingsHourFromInput?.value, 0, 23, '00'),
            minuteFrom: clampPad2(settingsMinuteFromInput?.value, 0, 59, '00'),
            hourTo: clampPad2(settingsHourToInput?.value, 0, 23, '23'),
            minuteTo: clampPad2(settingsMinuteToInput?.value, 0, 59, '59')
        };
    }

    function validateSettings(settings) {
        if (!settings.warehouse) return 'Please choose a warehouse.';
        if (!new Set(['1 day', '2 days', '1 week', '2 weeks', 'custom']).has(settings.periodType)) return 'Please choose a valid date range.';
        if (settings.periodType === 'custom') {
            const n = Number(settings.customCount);
            if (!Number.isInteger(n) || n < 1) return 'Custom number must be a whole number greater than 0.';
            if (!['day', 'week'].includes(settings.customUnit)) return 'Please choose a valid custom unit.';
            if (settings.customUnit === 'week' && n > 5) return 'Custom week range cannot exceed 5 weeks.';
            if (settings.customUnit === 'day' && n > 35) return 'Custom day range cannot exceed 35 days.';
        }
        if (!Number.isInteger(Number(settings.hourFrom)) || Number(settings.hourFrom) < 0 || Number(settings.hourFrom) > 23) return 'Hour From must be between 00 and 23.';
        if (!Number.isInteger(Number(settings.hourTo)) || Number(settings.hourTo) < 0 || Number(settings.hourTo) > 23) return 'Hour To must be between 00 and 23.';
        if (!Number.isInteger(Number(settings.minuteFrom)) || Number(settings.minuteFrom) < 0 || Number(settings.minuteFrom) > 59) return 'Minute From must be between 00 and 59.';
        if (!Number.isInteger(Number(settings.minuteTo)) || Number(settings.minuteTo) < 0 || Number(settings.minuteTo) > 59) return 'Minute To must be between 00 and 59.';
        return '';
    }

    async function onSaveSettings() {
        const settings = readSettingsForm();
        const error = validateSettings(settings);
        if (error) {
            setSettingsError(error);
            return;
        }

        saveSettings(settings);
        markPrompted();
        setSettingsError('');
        closeSettingsModal();
        setTimeout(() => location.reload(), 300);
    }

    async function waitWhileSettingsOpen() {
        while (settingsOpen) await sleep(100);
    }

    /************ Gear Button ************/
    function ensureGearButton() {
        if (document.getElementById('pak-bonushub-gear-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'pak-bonushub-gear-btn';
        btn.type = 'button';
        btn.title = 'Auto Select Settings';
        btn.innerHTML = '<i class="fa fa-gear" aria-hidden="true"></i>';
        Object.assign(btn.style, {
            position: 'fixed',
            top: '12px',
            left: '135px',
            zIndex: '99998',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            borderRadius: '4px',
            border: '0px solid rgba(176,176,176,1)',
            background: 'rgba(18,18,18,0.92)',
            color: '#fff',
            fontSize: '21px',
            fontWeight: '700',
            cursor: 'pointer',
            boxShadow: '0 10px 28px rgba(0,0,0,0.28)'
        });
        btn.addEventListener('click', async () => await openSettingsModal(loadSettings() || getDefaultSettings()));
        document.body.appendChild(btn);
    }

    /************ Page readiness ************/
    async function waitForPageReady() {
        if (document.readyState !== 'complete') {
            await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
        }
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
            if (document.querySelector('input[formcontrolname="from"]') && document.querySelector('input[formcontrolname="to"]') && document.querySelectorAll('.mat-mdc-select').length > 0) return true;
            await sleep(120);
        }
        return false;
    }

    /************ Warehouse selection ************/
    function getWarehouseDropdown() {
        const field = Array.from(document.querySelectorAll('mat-form-field, .mat-mdc-form-field')).find(f => normalizeText(f.innerText).toLowerCase().includes('warehouse'));
        if (!field) return null;
        const dropdown = field.querySelector('.mat-mdc-select');
        return dropdown && isVisible(dropdown) ? dropdown : null;
    }

    function getDropdownDisplayText(dropdown) {
        const valueText = dropdown.querySelector('.mat-mdc-select-value-text');
        return normalizeText(valueText ? valueText.textContent : dropdown.textContent);
    }

    function findOption(text) {
        const target = normalizeText(text).toLowerCase();
        return Array.from(document.querySelectorAll('mat-option')).find((opt) => normalizeText(opt.innerText).toLowerCase() === target);
    }

    async function selectWarehouse(warehouseName) {
        const target = normalizeText(warehouseName);
        const targetLower = target.toLowerCase();
        const deadline = Date.now() + 12000;
        while (Date.now() < deadline) {
            await waitWhileSettingsOpen();
            const dropdown = getWarehouseDropdown();
            if (!dropdown) {
                await sleep(120);
                continue;
            }
            const displayLower = normalizeText(getDropdownDisplayText(dropdown)).toLowerCase();
            if (displayLower === targetLower || displayLower.includes(targetLower)) return true;

            dropdown.click();
            await sleep(120);

            for (let i = 0; i < 8; i++) {
                const option = findOption(target);
                if (option) {
                    option.click();
                    await sleep(140);
                    const afterLower = normalizeText(getDropdownDisplayText(dropdown)).toLowerCase();
                    if (afterLower === targetLower || afterLower.includes(targetLower)) {
                        console.log(`✅ Selected "${target}"`);
                        return true;
                    }
                    break;
                }
                await sleep(80);
            }
            closePopupPanels();
            await sleep(120);
        }
        console.warn(`❌ Warehouse "${target}" not found or not updated in time`);
        return false;
    }

    /************ Date Logic ************/
    function getLastSunday(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - d.getDay());
        return d;
    }

    function resolveDateRange(settings) {
        const type = normalizeText(settings.periodType || '1 week');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let fromDate, toDate;

        let anchorSunday = getLastSunday(today);
        if (today.getDay() === 0) {
            anchorSunday.setDate(anchorSunday.getDate() - 7);
        }

        if (type === '1 day') {
            toDate = new Date(today);
            fromDate = new Date(today);
            fromDate.setDate(toDate.getDate() - 1);
        }
        else if (type === '2 days') {
            toDate = new Date(today);
            toDate.setDate(today.getDate() - 1);
            fromDate = new Date(toDate);
            fromDate.setDate(toDate.getDate() - 1);
        }
        else if (type === '1 week') {
            toDate = new Date(anchorSunday);
            fromDate = new Date(anchorSunday);
            fromDate.setDate(anchorSunday.getDate() - 7);
        }
        else if (type === '2 weeks') {
            toDate = new Date(anchorSunday);
            fromDate = new Date(anchorSunday);
            fromDate.setDate(anchorSunday.getDate() - 14);
        }
        else {
            const n = Math.max(1, parseInt(settings.customCount || '1', 10) || 1);
            const unit = normalizeText(settings.customUnit || 'week');

            if (unit === 'day') {
                fromDate = new Date(today);
                fromDate.setDate(today.getDate() - n);
                toDate = new Date(today);
            } else {
                toDate = new Date(anchorSunday);
                fromDate = new Date(anchorSunday);
                fromDate.setDate(anchorSunday.getDate() - (n * 7));
            }
        }
        fromDate.setHours(0, 0, 0, 0);
        toDate.setHours(0, 0, 0, 0);
        return { fromDate, toDate };
    }

    /************ Calendar UI ************/
    function monthIndexFromName(name) {
        return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(normalizeText(name).slice(0, 3).toLowerCase());
    }

    function getVisibleCalendarMonthYear() {
        const text = normalizeText(document.querySelector('.mat-calendar-period-button')?.textContent || '');
        const match = text.match(/^([A-Za-z]+)\s+(\d{4})$/);
        if (!match) return null;
        const monthIndex = monthIndexFromName(match[1]), year = Number(match[2]);
        return (monthIndex < 0 || Number.isNaN(year)) ? null : { monthIndex, year };
    }

    function clickCalendarPrev() { document.querySelector('.mat-calendar-previous-button')?.click(); }
    function clickCalendarNext() { document.querySelector('.mat-calendar-next-button')?.click(); }

    async function openCalendar() {
        const fromInput = document.querySelector('input[formcontrolname="from"]');
        const toggleBtn = document.querySelector('mat-datepicker-toggle button') || document.querySelector('button[aria-label*="Open calendar"]');
        if (fromInput) {
            fromInput.focus();
            fromInput.click();
            await sleep(120);
        }
        if (!document.querySelector('mat-datepicker-content, .mat-datepicker-content') && toggleBtn) {
            toggleBtn.click();
            await sleep(180);
        }
        for (let i = 0; i < 10; i++) {
            if (document.querySelector('mat-datepicker-content, .mat-datepicker-content')) return true;
            await sleep(60);
        }
        return !!document.querySelector('mat-datepicker-content, .mat-datepicker-content');
    }

    async function goToMonthYear(targetDate) {
        const targetMonthIndex = targetDate.getMonth(), targetYear = targetDate.getFullYear();
        for (let i = 0; i < 18; i++) {
            const visible = getVisibleCalendarMonthYear();
            if (visible && visible.monthIndex === targetMonthIndex && visible.year === targetYear) return true;
            if (!visible) {
                await sleep(60);
                continue;
            }
            (visible.year * 12 + visible.monthIndex < targetYear * 12 + targetMonthIndex) ? clickCalendarNext() : clickCalendarPrev();
            await sleep(90);
        }
        return false;
    }

    function findCalendarDateButton(targetDate) {
        const content = document.querySelector('mat-datepicker-content, .mat-datepicker-content');
        if (!content) return null;

        const day = String(targetDate.getDate());
        const monthLong = targetDate.toLocaleString('en-US', { month: 'long' }).toLowerCase();
        const monthShort = targetDate.toLocaleString('en-US', { month: 'short' }).toLowerCase();
        const year = String(targetDate.getFullYear());
        const dayRegex = new RegExp(`(^|\\D)${day}(\\D|$)`);

        return Array.from(content.querySelectorAll('button[aria-label], button')).find(btn => {
            if (btn.disabled) return false;
            const aria = normalizeText(btn.getAttribute('aria-label') || '').toLowerCase();
            const text = normalizeText(btn.textContent || '').toLowerCase();
            return (aria.includes(monthLong) || aria.includes(monthShort)) && aria.includes(year) && (dayRegex.test(aria) || text === day);
        }) || null;
    }

    async function clickCalendarDate(targetDate) {
        for (let i = 0; i < 8; i++) {
            if (!await goToMonthYear(targetDate)) await sleep(80);
            const button = findCalendarDateButton(targetDate);
            if (button) {
                button.click();
                return true;
            }
            await sleep(80);
        }
        return false;
    }

    function closeCalendar() {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
        const w = window.innerWidth, h = window.innerHeight;
        for (let i = 0; i < 6; i++) {
            const el = document.elementFromPoint(Math.random() * w, Math.random() * h);
            if (!el || el.closest('mat-datepicker-content, mat-option, button, input, [data-panel]')) continue;
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            return;
        }
        document.body.click();
    }

    async function setDateRangeByCalendar(fromValue, toValue) {
        const fromDate = fromISODate(fromValue), toDate = fromISODate(toValue);
        if (!fromDate || !toDate) {
            console.warn('❌ Invalid date range');
            return false;
        }
        if (!document.querySelector('input[formcontrolname="from"]') || !document.querySelector('input[formcontrolname="to"]')) {
            console.warn('❌ Date inputs not found');
            return false;
        }
        await waitWhileSettingsOpen();

        setOverlay('Running...', 'Opening calendar...');
        if (!await openCalendar()) {
            console.warn('❌ Calendar did not open');
            return false;
        }

        setOverlay('Running...', `Selecting ${formatCalendarLabel(fromDate)}...`);
        if (!await clickCalendarDate(fromDate)) {
            console.warn('❌ Start date not found in calendar');
            return false;
        }
        await sleep(120);

        setOverlay('Running...', `Selecting ${formatCalendarLabel(toDate)}...`);
        if (!await clickCalendarDate(toDate)) {
            console.warn('❌ End date not found in calendar');
            return false;
        }
        await sleep(120);
        closeCalendar();
        console.log(`📅 Calendar range selected: ${fromDate.toDateString()} → ${toDate.toDateString()}`);
        return true;
    }

    function findFieldContainerByLabel(labelText) {
        const wanted = normalizeText(labelText).toLowerCase();
        const label = Array.from(document.querySelectorAll('mat-label, label, .mat-mdc-floating-label, .mdc-floating-label')).find(el => normalizeText(el.textContent).toLowerCase() === wanted);
        return label ? (label.closest('mat-form-field, .mat-mdc-form-field, .mat-form-field') || label.parentElement) : null;
    }

    function setNativeFieldValue(el, value) {
        if (!el) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, value); else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
    }

    async function setFieldByLabel(labelText, value) {
        const field = findFieldContainerByLabel(labelText);
        if (!field) {
            console.warn(`Field not found: ${labelText}`);
            return false;
        }
        const formatted = pad2(value);
        const input = field.querySelector('input');
        if (input) return setNativeFieldValue(input, formatted);

        const selectEl = field.querySelector('select');
        if (selectEl) {
            selectEl.value = formatted;
            selectEl.dispatchEvent(new Event('input', { bubbles: true }));
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }

        const trigger = field.querySelector('.mat-mdc-select-trigger, .mat-select-trigger, [role="combobox"]') || field.querySelector('.mat-mdc-select');
        if (!trigger) {
            console.warn(`No editable control found for: ${labelText}`);
            return false;
        }
        trigger.click();
        await sleep(150);
        const target = Array.from(document.querySelectorAll('mat-option, .mat-mdc-option')).find(opt => normalizeText(opt.textContent) === formatted);
        if (!target) {
            console.warn(`Option not found for ${labelText}: ${formatted}`);
            return false;
        }
        target.click();
        await sleep(150);
        return true;
    }

    async function applyTimeSettingsToScreen(settings) {
        await setFieldByLabel('Hour From', settings.hourFrom);
        await setFieldByLabel('Minute From', settings.minuteFrom);
        await setFieldByLabel('Hour To', settings.hourTo);
        await setFieldByLabel('Minute To', settings.minuteTo);
    }

    /************ Main ************/
    async function main() {
        try {
            ensureGearButton();
            showOverlay('Running...', 'Waiting for page to fully load...');
            if (!await waitForPageReady()) {
                setOverlay('Failed', 'Page did not finish loading in time.');
                return;
            }

            let settings = loadSettings();
            if (!settings && !hasBeenPrompted()) {
                await openSettingsModal(getDefaultSettings());
                await waitWhileSettingsOpen();
                markPrompted();
                settings = loadSettings() || getDefaultSettings();
            } else if (!settings) {
                settings = getDefaultSettings();
            }

            await waitWhileSettingsOpen();
            setOverlay('Running...', `Selecting ${settings.warehouse}...`);
            await selectWarehouse(settings.warehouse);

            const range = resolveDateRange(settings);
            await sleep(120);

            setOverlay('Running...', 'Setting date range...');
            await setDateRangeByCalendar(toISODate(range.fromDate), toISODate(range.toDate));
            await applyTimeSettingsToScreen(settings);

            setOverlay('Done', 'Finished successfully.');
            await sleep(500);
        } catch (err) {
            console.error(err);
            setOverlay('Error', 'Something went wrong. Check the console.');
            await sleep(1000);
        } finally {
            hideOverlay();
        }
    }

    if (document.readyState === 'complete') main();
    else window.addEventListener('load', main);
})();