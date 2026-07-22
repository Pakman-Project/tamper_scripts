// ==UserScript==
// @name         [PAK] WHDS Returns Confirmed
// @namespace    http://tampermonkey.net/
// @version      11.6
// @description  Ensures End Time updates whenever Start changes; removes readonly on End input and keeps it removed (observer+poller). END is always written directly to the input (no picker fallback). Keeps autos, hourly/daily jobs, and Copy UI. Faster 8000 selection.
// @Author       Pak
// @match        http://whds-intranetweb:8089/reports/Returns*
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  'use strict';

  /**************** CONFIG ****************/
  const TARGET_VALUE = "8000";
  const WAREHOUSE_VALUE = "X - Elmsall";
  const ACTIVE_BG = "rgba(0, 122, 122, 0.12)";

  // Faster autos
  const AUTO_SELECT_SCAN_MS = 200;
  const AUTO_SELECT_RETRY_MS = 900;
  const AUTO_OPTION_CLICK_DELAY_MS = 60;

  const START_POLL_MS = 300; // poll as fallback for display text
  const DISPLAY_POLL_MS = 500; // additional fallback
  const END_READONLY_CLEAN_MS = 450; // how often poll to remove readonly

  /**************** STATE ****************/
  let lastSeenStart = null;

  // tracking attachments
  let attachedStartDisplay = null; // DOM node for visible Start text (mud-input-slot)
  let attachedEndInput = null;
  let displayObserver = null;
  let startDisplayPollerId = null;

  // end readonly management
  let endReadonlyObserver = null;
  let endReadonlyPollerId = null;

  /**************** HELPERS ****************/
  const safeText = el => (el && (el.textContent || el.innerText || "") || "").trim();

  function toast(msg, ms = 1200) {
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText = `
      position: fixed; bottom: 20px; right: 20px;
      background: #000; color: #fff; padding: 10px 14px;
      border-radius: 6px; font-size: 13px; z-index: 9999999;
      opacity: 0; transition: opacity .12s;
    `;
    document.body.appendChild(t);
    requestAnimationFrame(() => (t.style.opacity = 1));
    setTimeout(() => { t.style.opacity = 0; setTimeout(() => t.remove(), 220); }, ms);
  }

  function isActiveMenu() {
    const el = Array.from(document.querySelectorAll(".mud-nav-link-text"))
      .find(x => safeText(x) === "Returns Confirmed Putaway Monitoring");
    const wrapper = el?.closest(".mud-nav-link");
    return !!wrapper && getComputedStyle(wrapper).backgroundColor === ACTIVE_BG;
  }

  /**************** TIME INPUT HELPERS ****************/
  function findTimeInputs() {
    const labels = Array.from(document.querySelectorAll("label.mud-input-label"));
    const startLabel = labels.find(l => safeText(l) === "Start Time");
    const endLabel = labels.find(l => safeText(l) === "End Time");
    const startInput = startLabel?.closest(".mud-input-control")?.querySelector("input");
    const endInput = endLabel?.closest(".mud-input-control")?.querySelector("input");
    return { startInput, endInput };
  }

  // reliable display node (MudBlazor shows the visible time here)
  function findStartDisplayNode() {
    const labels = Array.from(document.querySelectorAll("label.mud-input-label"));
    const startLabel = labels.find(l => safeText(l) === "Start Time");
    if (!startLabel) return null;
    const root = startLabel.closest(".mud-input-control");
    if (!root) return null;
    return root.querySelector(".mud-input-slot") || root.querySelector(".mud-input-control-input-container") || root.querySelector("input") || null;
  }

  function findDateInput() {
    let el = document.querySelector('input[placeholder="dd/mm/yyyy"], input[placeholder="dd/mm/yyyy"].mud-input-slot');
    if (el) return el;

    const label = Array.from(document.querySelectorAll("label.mud-input-label"))
      .find(l => /date/i.test(safeText(l)));
    if (label) {
      const container = label.closest(".mud-input-control");
      el = container?.querySelector("input");
      if (el) return el;
    }

    el = Array.from(document.querySelectorAll('input[placeholder], input[type="text"]')).find(i => {
      const ph = (i.getAttribute('placeholder') || '').toLowerCase();
      return ph.includes('dd') || ph.includes('date') || ph.includes('/');
    });

    return el || null;
  }

  function parseHHMM(hm) {
    if (!hm) return null;
    const s = String(hm).trim();
    const m = s.match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const mi = parseInt(m[2], 10);
    if (Number.isNaN(h) || Number.isNaN(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) return null;
    return { h, m: mi };
  }

  function formatHHMM(h, m) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function computeEndFromStart(startVal) {
    const parsed = parseHHMM(startVal);
    if (!parsed) return null;

    // +1 hour normally, but 23:00 → 23:59
    const minsToAdd = (parsed.h === 23 && parsed.m === 0) ? 59 : 60;

    const d = new Date(2000, 0, 1, parsed.h, parsed.m);
    d.setMinutes(d.getMinutes() + minsToAdd);

    return formatHHMM(d.getHours(), d.getMinutes());
  }

  function parseDDMMYYYY(s) {
    if (!s) return null;
    const m = String(s).trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!m) return null;
    let d = parseInt(m[1], 10);
    let mo = parseInt(m[2], 10) - 1;
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return new Date(y, mo, d);
  }

  function formatDDMMYYYY(date) {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  }

  // Remove readonly from the End input and keep it removed using observer + poller
  function ensureEndNotReadonly(endInput) {
    try {
      if (!endInput) return;
      // immediate remove
      try { endInput.removeAttribute('readonly'); } catch (e) {}
      try { endInput.readOnly = false; } catch (e) {}

      // clear previous management
      if (endReadonlyObserver) { try { endReadonlyObserver.disconnect(); } catch (e) {} endReadonlyObserver = null; }
      if (endReadonlyPollerId) { try { clearInterval(endReadonlyPollerId); } catch (e) {} endReadonlyPollerId = null; }

      // MutationObserver: whenever attributes change, ensure readonly is removed
      endReadonlyObserver = new MutationObserver(() => {
        try { if (endInput.hasAttribute && endInput.hasAttribute('readonly')) endInput.removeAttribute('readonly'); } catch (e) {}
        try { if (endInput.readOnly === true) endInput.readOnly = false; } catch (e) {}
      });
      try {
        endReadonlyObserver.observe(endInput, { attributes: true, attributeFilter: ['readonly'] });
      } catch (e) {
        // ignore
      }

      // Poller: periodic safety net to remove readonly in case it reappears via re-render
      endReadonlyPollerId = setInterval(() => {
        try {
          if (!document.contains(endInput)) {
            clearInterval(endReadonlyPollerId);
            endReadonlyPollerId = null;
            return;
          }
        } catch (e) {}
        try { if (endInput.hasAttribute && endInput.hasAttribute('readonly')) endInput.removeAttribute('readonly'); } catch (e) {}
        try { if (endInput.readOnly === true) endInput.readOnly = false; } catch (e) {}
      }, END_READONLY_CLEAN_MS);
    } catch (err) {
      console.warn('[WHDS] ensureEndNotReadonly error', err);
    }
  }

  // Setter that removes readonly (permanent) then sets the value and dispatches events
  function setInputValueRemoveReadonly(inputEl, value) {
    if (!inputEl) return false;
    try {
      try { inputEl.removeAttribute('readonly'); } catch (e) {}
      try { inputEl.readOnly = false; } catch (e) {}
      try { inputEl.focus?.(); } catch (e) {}
      inputEl.value = value;
      try { inputEl.setAttribute && inputEl.setAttribute('value', value); } catch (e) {}
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      // don't re-add readonly - we want it removed
      setTimeout(() => { try { inputEl.blur?.(); } catch (e) {} }, 80);
      return true;
    } catch (e) {
      console.warn("[WHDS] setInputValueRemoveReadonly failed", e);
      return false;
    }
  }

  // *** DIRECT WRITE ONLY: no picker fallback ***
  async function setEndFromStart(startVal) {
    const desired = computeEndFromStart(startVal);
    if (!desired) return false;
    const { endInput } = findTimeInputs();

    // Direct-write only (user requested): remove readonly and set value
    const backup = setInputValueRemoveReadonly(endInput, desired);
    if (backup) {
      console.log("[WHDS] set End via direct write ->", desired);
      return true;
    }

    console.warn("[WHDS] failed to set End to", desired);
    return false;
  }

  /**************** START MONITOR (observe display text) ****************/
  function detachStartMonitor() {
    try {
      if (displayObserver) {
        try { displayObserver.disconnect(); } catch (e) {}
        displayObserver = null;
      }
      if (startDisplayPollerId) {
        try { clearInterval(startDisplayPollerId); } catch (e) {}
        startDisplayPollerId = null;
      }
    } finally {
      attachedStartDisplay = null;
      attachedEndInput = null;
      lastSeenStart = null;
    }
  }

  // Mutation observer to react to Start display changes
  displayObserver = new MutationObserver(mutations => {
    try {
      const display = attachedStartDisplay;
      if (!display) return;
      const txt = safeText(display);
      if (txt && txt !== lastSeenStart) {
        lastSeenStart = txt;
        // when Start display changed, set End accordingly
        setEndFromStart(txt).catch(e => console.warn('[WHDS] setEndFromStart error', e));
      }
    } catch (e) {
      console.warn('[WHDS] displayObserver callback error', e);
    }
  });

  function attachStartMonitor() {
    const display = findStartDisplayNode();
    const timeInputs = findTimeInputs();
    if (!display || !timeInputs.endInput) {
      return;
    }

    if (attachedStartDisplay === display) {
      lastSeenStart = lastSeenStart || safeText(display);
      // still ensure end not readonly for the current end input
      ensureEndNotReadonly(timeInputs.endInput);
      return;
    }

    detachStartMonitor();
    attachedStartDisplay = display;
    attachedEndInput = timeInputs.endInput;
    lastSeenStart = safeText(display);

    // ensure end is editable and kept editable
    ensureEndNotReadonly(attachedEndInput);

    try {
      displayObserver.observe(display, { childList: true, characterData: true, subtree: true });
    } catch (e) {
      console.warn('[WHDS monitor] displayObserver.observe failed, fallback to poll', e);
      if (startDisplayPollerId) clearInterval(startDisplayPollerId);
      startDisplayPollerId = setInterval(() => {
        try {
          const txt = safeText(display);
          if (txt && txt !== lastSeenStart) {
            lastSeenStart = txt;
            setEndFromStart(txt).catch(() => {});
          }
        } catch (e2) {}
      }, DISPLAY_POLL_MS);
    }

    console.log('[WHDS monitor] attached to Start display text (mud-input-slot) and ensured End editable');
  }

  // initial-first-appearance setter + attach monitor
  function handleStartAppearance() {
    const { startInput, endInput } = findTimeInputs();
    const display = findStartDisplayNode();

    if (!display || !endInput) return;

    if (!attachedStartDisplay) {
      const now = new Date();
      const prevHour = (now.getHours() + 23) % 24;
      const initStart = `${String(prevHour).padStart(2, '0')}:00`;

      if (startInput) {
        // set start input if available (will be caught by display observer)
        setInputValueRemoveReadonly(startInput, initStart);
        setTimeout(() => setEndFromStart(initStart), 180);
      } else {
        const disp = safeText(display);
        if (parseHHMM(disp)) setTimeout(() => setEndFromStart(disp), 180);
      }
    }

    attachStartMonitor();
  }

  const startAppearObserver = new MutationObserver(() => { try { handleStartAppearance(); } catch (e) {} });
  startAppearObserver.observe(document.body, { childList: true, subtree: true });
  setTimeout(handleStartAppearance, 600);
  setTimeout(handleStartAppearance, 2000);

  /**************** TABLE SCRAPER ****************/
  function readTableArray(excludeTotals = true) {
    try {
      const rows = Array.from(document.querySelectorAll("tr.mud-table-row"));
      if (rows.length) {
        const arr = rows.map(row => Array.from(row.querySelectorAll("td")).map(td => safeText(td))).filter(r => r.length);
        return excludeTotals ? arr.filter(r => !r.some(c => /totals/i.test(c))) : arr;
      }
      const tbody = document.querySelector("tbody.mud-table-body");
      if (tbody) {
        const tr = Array.from(tbody.querySelectorAll("tr"));
        if (tr.length) {
          const arr = tr.map(r => Array.from(r.querySelectorAll("td")).map(td => safeText(td))).filter(r => r.length);
          return excludeTotals ? arr.filter(r => !r.some(c => /totals/i.test(c))) : arr;
        }
      }
      const roleRows = Array.from(document.querySelectorAll("[role='row']"));
      if (roleRows.length) {
        const arr = roleRows.map(r => Array.from(r.querySelectorAll("[role='cell'], td, div")).map(c => safeText(c))).filter(r => r.length);
        return excludeTotals ? arr.filter(r => !r.some(c => /totals/i.test(c))) : arr;
      }
      return [];
    } catch (err) {
      console.error('[WHDS] readTableArray', err);
      return [];
    }
  }

  function totalsRowExists() {
    const all = readTableArray(false);
    return all.some(r => r.some(c => /totals/i.test(c)));
  }

  function getTotalRowCount() {
    try {
      const info = document.querySelector(".mud-table-page-number-information");
      if (!info) return null;

      const text = info.textContent || "";
      const m = text.match(/of\s+(\d+)/i);
      if (!m) return null;

      return parseInt(m[1], 10);
    } catch {
      return null;
    }
  }

  function rowsPerPageIs8000() {
    try {
      const totalRows = getTotalRowCount();

      // If total rows are 25 or fewer, we do NOT care about 8000
      if (totalRows !== null && totalRows <= 25) {
        return true; // treat as "OK", prevents auto-switch
      }

      // From here on: totalRows > 25 → must be 8000
      const exact = Array.from(
        document.querySelectorAll("button, span, div, td, label, option")
      ).find(el => safeText(el) === "8000");

      if (exact) return true;

      const inputs = Array.from(document.querySelectorAll("input, select"));
      for (const i of inputs) {
        const v = (i.value || i.getAttribute("value") || "").trim();
        if (v === "8000") return true;
      }

      const bodyText = document.body.innerText || "";
      if (/rows per page/i.test(bodyText) && bodyText.includes("8000")) return true;

      return false;
    } catch {
      return false;
    }
  }

  /**************** AUTOS ****************/
  function autoSelect8000() {
    if (!isActiveMenu()) return;

    const totalRows = getTotalRowCount();

    // 🔒 CRITICAL GATE
    if (totalRows !== null && totalRows <= 25) {
      return; // do NOT touch rows-per-page
    }

    const candidates = Array.from(
      document.querySelectorAll(
        'div.mud-select-input[tabindex="0"], div.mud-input-slot.mud-input-root'
      )
    );

    if (!candidates.length) return;

    for (const displayDiv of candidates) {
      const visibleText = safeText(displayDiv);

      if (visibleText === TARGET_VALUE) continue;
      if (!/^\d+$/.test(visibleText)) continue;

      const last = parseInt(displayDiv.dataset._lastAttempt || "0", 10);
      const now = Date.now();
      if (now - last < AUTO_SELECT_RETRY_MS) continue;

      displayDiv.dataset._lastAttempt = String(now);

      try { displayDiv.click(); } catch (e) {}

      setTimeout(() => {
        const option = Array.from(
          document.querySelectorAll('.mud-list-item .mud-typography, .mud-list-item')
        ).find(p => safeText(p) === TARGET_VALUE);

        if (option) {
          const li = option.closest('.mud-list-item');
          try { li ? li.click() : option.click(); } catch (e) {}
        }
      }, AUTO_OPTION_CLICK_DELAY_MS);

      break;
    }
  }

  function autoSelectWarehouse() {
    if (!isActiveMenu()) return;
    const label = Array.from(document.querySelectorAll("label.mud-input-label")).find(l => safeText(l) === "Warehouse");
    if (!label) return;
    const container = label.closest(".mud-input-control-input-container") || label.parentElement;
    if (!container) return;
    const displayDiv = container.querySelector('div.mud-input-slot.mud-input-root, div.mud-input-slot');
    if (!displayDiv) return;
    const currentValue = safeText(displayDiv);
    if (currentValue === WAREHOUSE_VALUE) return;
    const last = parseInt(container.dataset._whAttempt || "0", 10);
    const now = Date.now();
    if (now - last < 3000) return;
    container.dataset._whAttempt = String(now);
    try { container.click(); } catch (e) {}
    setTimeout(() => {
      const option = Array.from(document.querySelectorAll(".mud-list-item .mud-typography, .mud-list-item"))
        .find(p => safeText(p) === WAREHOUSE_VALUE);
      if (!option) return;
      const li = option.closest('.mud-list-item');
      try { if (li) li.click(); else option.click(); } catch (e) {}
    }, 150);
  }

  /**************** HOURLY & DAILY SCHEDULERS ****************/
  function computePreviousHourTimes(now = new Date()) {
    // New behaviour:
    // - normally: Start = previousHour:00, End = currentHour:00
    // - special case at 00:00: Start = 23:00, End = 23:59
    const currHour = now.getHours();
    if (currHour === 0) {
      return { startVal: '23:00', endVal: '23:59' };
    } else {
      const prevHour = (currHour + 23) % 24;
      const startVal = `${String(prevHour).padStart(2, '0')}:00`;
      const endVal = `${String(currHour).padStart(2, '0')}:00`;
      return { startVal, endVal };
    }
  }

  // date increment at 01:00 daily
  function incrementDateInputByOne(inputEl) {
    if (!inputEl) return false;
    try {
      const cur = inputEl.value || inputEl.getAttribute("value") || '';
      const dt = parseDDMMYYYY(cur);
      if (!dt) {
        const t = new Date();
        t.setDate(t.getDate() + 1);
        forceSetInput(inputEl, formatDDMMYYYY(t));
        return true;
      }
      dt.setDate(dt.getDate() + 1);
      const newVal = formatDDMMYYYY(dt);
      if (newVal !== cur) forceSetInput(inputEl, newVal);
      return true;
    } catch (e) {
      console.warn('[WHDS] increment date failed', e);
      return false;
    }
  }

  function forceSetInput(inputEl, value) {
    if (!inputEl) return;
    try {
      try { inputEl.removeAttribute('readonly'); } catch (e) {}
      try { inputEl.readOnly = false; } catch (e) {}
      try { inputEl.focus?.(); } catch (e) {}
      inputEl.value = value;
      inputEl.setAttribute && inputEl.setAttribute("value", value);
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => { try { inputEl.blur?.(); } catch (e) {} }, 80);
    } catch (e) {
      console.warn('[WHDS] forceSetInput fail', e);
    }
  }

  function scheduleDailyDateIncrement() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(1, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = next.getTime() - now.getTime();
    setTimeout(() => {
      try {
        const dateInput = findDateInput();
        if (dateInput) incrementDateInputByOne(dateInput);
      }
      catch (e) {
        console.warn('[WHDS] date increment error', e);
      }
      setInterval(() => {
        try {
          const dateInput = findDateInput();
          if (dateInput) incrementDateInputByOne(dateInput);
        } catch (e) {
          console.warn(e);
        }
      }, 24 * 3600 * 1000);
    }, delay);
  }
  scheduleDailyDateIncrement();

  // hourly run at HH:01
  async function runHourlyTask() {
    try {
      const { startVal, endVal } = computePreviousHourTimes(new Date());
      const { startInput, endInput } = findTimeInputs();
      if (startInput && endInput) {
        forceSetInput(startInput, startVal);
        setTimeout(() => forceSetInput(endInput, endVal), 180);

        setTimeout(() => {
          // Improved selector: prefer span.mud-button-label nodes containing "Show Results"
          let btn = null;
          try {
            const labelSpan = Array.from(document.querySelectorAll('span.mud-button-label'))
              .find(s => /show\s*results/i.test(safeText(s)));
            if (labelSpan) {
              btn = labelSpan.closest('button, a, [role="button"]') || labelSpan.parentElement?.closest('button, a, [role="button"]');
            }
          } catch (e) {}

          // fallback to generic search if not found
          if (!btn) {
            btn = Array.from(document.querySelectorAll("button, a, [role='button']")).find(el => /show\s*results/i.test(safeText(el)));
          }

          if (btn) try { btn.click(); } catch (e) { console.warn('[WHDS hourly] show results click failed', e); }
        }, 450);
      }

      // --- wait-for-table instead of fixed sleep ---
      try {
        await waitForCondition(() => {
          const rows = readTableArray(true);
          return Array.isArray(rows) && rows.length > 0 && totalsRowExists() && rowsPerPageIs8000();
        }, 15000, 300);
      } catch (err) {
        console.warn('[WHDS hourly] results not ready within timeout', err);
        toast('Results not ready', 2500);
        return;
      }

      console.log('[WHDS hourly] ready');
    } catch (err) {
      console.error('[WHDS hourly] run error', err);
    }
  }

  // Wait for a condition function to become truthy, with timeout & polling.
  function waitForCondition(fn, timeout = 15000, interval = 300) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      try {
        const check = () => {
          try {
            const ok = !!fn();
            if (ok) {
              clearInterval(id);
              resolve(true);
              return;
            }
            if (Date.now() - start > timeout) {
              clearInterval(id);
              reject(new Error('waitForCondition timeout'));
            }
          } catch (err) {
            if (Date.now() - start > timeout) {
              clearInterval(id);
              reject(err);
            }
          }
        };
        const id = setInterval(check, interval);
        check();
      } catch (err) {
        reject(err);
      }
    });
  }

  function scheduleHourlyRun() {
    const now = new Date();
    const next = new Date(now);
    next.setMinutes(1, 0, 0);
    if (next <= now) next.setHours(next.getHours() + 1);
    const delay = next.getTime() - now.getTime();
    setTimeout(() => {
      runHourlyTask();
      setInterval(runHourlyTask, 60 * 60 * 1000);
    }, delay);
  }
  scheduleHourlyRun();

  /**************** BUTTON STYLES ****************/
  const style = document.createElement("style");
  style.textContent = `
  #whds-widget button {
    transition:
      background-color 0.15s ease,
      transform 0.08s ease,
      box-shadow 0.08s ease,
      opacity 0.15s ease;
  }

  /* Hover */
  #whds-widget button:hover:not(:disabled) {
    background-color: #009999;
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(0, 122, 122, 0.35);
  }

  /* Pressed */
  #whds-widget button:active:not(:disabled) {
    background-color: #006666;
    transform: translateY(0);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25) inset;
  }

  /* Disabled */
  #whds-widget button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    box-shadow: none;
    transform: none;
  }
`;
  document.head.appendChild(style);

  /**************** UI (Copy button only) ****************/
  const widget = document.createElement("div");
  widget.id = "whds-widget";
  widget.style.cssText = `
    position: absolute; top: 250px; left: 470px;
    background:#fff;padding:6px;z-index:999999;font-size:13px;border-radius:8px;
    box-shadow:0 6px 18px rgba(0,0,0,0.00); display:none;
  `;
  widget.innerHTML = `
  <div style="display:flex;justify-content:center;min-width:133.766px;">
    <button id="copyBtn" style="
      width:133.766px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:6px;
      padding:6px 12px;
      border:none;
      background:#007A7A;
      color:#fff;
      border-radius:20px;
      font-weight:700;
      font-size:14px;
      cursor:pointer;
      white-space:nowrap;
    ">
      <i class="fa fa-copy" aria-hidden="true"></i>
      <span>COPY TABLE</span>
    </button>
  </div>
`;
  document.body.appendChild(widget);
  const copyBtn = document.getElementById("copyBtn");

  copyBtn.addEventListener("click", async () => {
    copyBtn.disabled = true;
    try {
      const rows = readTableArray(true);
      if (!rows.length) {
        toast("No rows to copy");
        return;
      }
      const tsv = rows.map(r => r.join("\t")).join("\n");
      try {
        GM_setClipboard(tsv, "text");
      } catch (e) {
        if (navigator.clipboard?.writeText) {
          try { await navigator.clipboard.writeText(tsv); } catch {}
        }
      }
      toast("Copied");
    } finally {
      copyBtn.disabled = false;
    }
  });

  /**************** MAIN LOOP ****************/
  // Fast autos for quicker 8000 selection.
  setInterval(() => {
    autoSelect8000();
    autoSelectWarehouse();
  }, AUTO_SELECT_SCAN_MS);

  // Slower UI/monitor upkeep.
  setInterval(() => {
    widget.style.display = isActiveMenu() ? "block" : "none";
    try { handleStartAppearance(); } catch (e) {}
  }, 1000);

  /**************** DEBUG HELPERS ****************/
  window._whds_force_attach_monitor = () => { detachStartMonitor(); handleStartAppearance(); };
  window._whds_runHourlyNow = runHourlyTask;
  window._whds_readTableArray = readTableArray;
  window._whds_findStartDisplay = () => findStartDisplayNode();
  window._whds_debug_start = () => console.log("Start display:", safeText(findStartDisplayNode()));

  console.log('[WHDS] v11.6 loaded — faster 8000 autos, Start->End monitor observes Start display text; End input readonly is removed and kept removed; End is always set by direct write (no picker). Hourly Start/End adjusted and Show Results selector improved. Posting removed. Copy UI retained.');
})();