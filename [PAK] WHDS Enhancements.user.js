// ==UserScript==
// @name         [PAK] WHDS Enhancements
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  On Returns page: auto-set End Time = Start + 1 hour (23:00 → +59 mins). On Returns + ProgressOverview: add scroll to top/bottom buttons.
// @author       Pak
// @match        http://whds-intranetweb:8089/reports/Returns*
// @match        http://whds-batchoverviewprogress:8087/Batch/ProgressOverview
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const url = location.href;

  /******************************************************************
   * PART 1 — AUTO END TIME (RETURNS PAGE ONLY)
   ******************************************************************/
  if (url.includes('/reports/Returns')) {

    const PLACEHOLDER = 'hh:mm';
    const POLL_MS = 300;

    const watched = new WeakSet();
    const lastValues = new WeakMap();

    function findTimeInputs() {
      return Array.from(document.querySelectorAll(`input[placeholder="${PLACEHOLDER}"]`));
    }

    function nearbyLabelText(inputEl) {
      let el = inputEl;
      while (el) {
        if (el.tagName && el.tagName.toLowerCase() === 'label') {
          return el.textContent.trim();
        }
        el = el.parentElement;
      }

      const candidates = [];
      if (inputEl.previousElementSibling) {
        candidates.push(inputEl.previousElementSibling);
      }
      if (inputEl.parentElement?.previousElementSibling) {
        const sib = inputEl.parentElement.previousElementSibling;
        candidates.push(sib, ...sib.querySelectorAll('*'));
      }

      for (const c of candidates) {
        const t = (c.textContent || '').trim();
        if (t) return t;
      }
      return '';
    }

    function parseTimeHHMM(s) {
      if (!s) return null;
      const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const hh = +m[1], mm = +m[2];
      if (hh > 23 || mm > 59) return null;
      return { hh, mm };
    }

    function formatHHMM({ hh, mm }) {
      return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
    }

    function addMinutes(t, mins) {
      const total = (t.hh * 60 + t.mm + mins) % 1440;
      return { hh: Math.floor(total / 60), mm: total % 60 };
    }

    function findMatchingEndInput(startEl) {
      const parent = startEl.closest('div') || startEl.parentElement;
      if (parent) {
        const inputs = Array.from(parent.querySelectorAll(`input[placeholder="${PLACEHOLDER}"]`));
        for (const i of inputs) {
          if (i !== startEl && nearbyLabelText(i).toLowerCase().includes('end')) {
            return i;
          }
        }
        const idx = inputs.indexOf(startEl);
        if (idx >= 0 && idx < inputs.length - 1) return inputs[idx + 1];
      }

      const all = findTimeInputs();
      const i = all.indexOf(startEl);
      return all[i + 1] || null;
    }

    function setInputValue(el, val) {
      el.value = val;
      el.setAttribute('value', val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    function onStartChanged(startEl, value) {
      const parsed = parseTimeHHMM(value);
      if (!parsed) return;

      const endEl = findMatchingEndInput(startEl);
      if (!endEl) return;

      // +1 hour normally, but 23:00 → +59 mins
      const minsToAdd = (parsed.hh === 23 && parsed.mm === 0) ? 59 : 60;
      const newVal = formatHHMM(addMinutes(parsed, minsToAdd));

      if (endEl.value === newVal) return;
      setInputValue(endEl, newVal);
    }

    function attachWatcher(inputEl) {
      if (watched.has(inputEl)) return;
      watched.add(inputEl);

      lastValues.set(inputEl, inputEl.value || '');

      const poll = setInterval(() => {
        if (!document.contains(inputEl)) return clearInterval(poll);
        const cur = inputEl.value || '';
        const prev = lastValues.get(inputEl);
        if (cur !== prev) {
          lastValues.set(inputEl, cur);
          onStartChanged(inputEl, cur);
        }
      }, POLL_MS);

      inputEl.addEventListener('input', () => onStartChanged(inputEl, inputEl.value));
      inputEl.addEventListener('change', () => onStartChanged(inputEl, inputEl.value));
    }

    function scan() {
      findTimeInputs().forEach(attachWatcher);
    }

    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });

    console.log('[PAK] Auto End Time active on Returns');
  }

  /******************************************************************
   * PART 2 — SCROLL BUTTONS (RETURNS + PROGRESS OVERVIEW)
   ******************************************************************/
  function createButton(label, bottomOffset, onClick) {
    const btn = document.createElement('button');
    btn.textContent = label;

    Object.assign(btn.style, {
      position: 'fixed',
      bottom: bottomOffset + 'px',
      right: '20px',
      zIndex: 1000,
      padding: '10px 16px',
      border: 'none',
      borderRadius: '5px',
      backgroundColor: 'rgba(0, 123, 255, 0.5)',
      color: 'white',
      fontSize: '14px',
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      transition: 'background-color 0.3s ease'
    });

    btn.onmouseenter = () => btn.style.backgroundColor = 'rgba(0, 123, 255, 0.8)';
    btn.onmouseleave = () => btn.style.backgroundColor = 'rgba(0, 123, 255, 0.5)';
    btn.onclick = onClick;

    document.body.appendChild(btn);
  }

  createButton('↑', 65, () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  createButton('↓', 20, () => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  });

})();
