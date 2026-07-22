// ==UserScript==
// @name         [PAK] Orders Batch Report AutoSelect (Persistent)
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Constantly enforces hub + "M - Elmsall - M" selection (Angular-safe, re-render proof)
// @author       Pak
// @match        https://pon-wpws27/Whds.Dashboard.Web/reports/OrdersBatchReport
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const HUB_TARGETS = [
    "A - Ireland",
    "H - Stadium",
    "D - Dearne Pallet",
    "C - Middle Eastern Hub",
    "S - DVB - Rapids",
    "F - VS",
    "V - DVP VNA"
  ];

  const FINAL_TARGET = "M - Elmsall - M";

  const normalize = t =>
    t?.replace(/\u00A0/g, " ").trim().replace(/\s+/g, " ");

  let dropdownOpen = false;

  /* -------------------------------------------------
     STEP 1 — Enforce hub dropdown
  --------------------------------------------------*/
  function enforceHubSelection() {
    const spans = document.querySelectorAll("span.mat-mdc-select-min-line");

    for (const span of spans) {
      const text = normalize(span.textContent);
      if (HUB_TARGETS.includes(text)) {
        const select = span.closest(".mat-mdc-select");

        if (select && !dropdownOpen) {
          dropdownOpen = true;
          select.click();
          setTimeout(() => {
            enforceElmsall();
            dropdownOpen = false;
          }, 80);
        }
        return;
      }
    }
  }

  /* -------------------------------------------------
     STEP 2 — Enforce Elmsall selection
  --------------------------------------------------*/
  function enforceElmsall() {
    const options = document.querySelectorAll(
      "mat-option .mdc-list-item__primary-text"
    );

    for (const opt of options) {
      if (normalize(opt.textContent) === FINAL_TARGET) {
        const matOpt = opt.closest("mat-option");
        if (matOpt && !matOpt.classList.contains("mdc-list-item--selected")) {
          matOpt.click();
        }
        return;
      }
    }
  }

  /* -------------------------------------------------
     GLOBAL OBSERVER — Angular-proof
  --------------------------------------------------*/
  const observer = new MutationObserver(() => {
    enforceHubSelection();
    enforceElmsall();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  /* -------------------------------------------------
     SAFETY POLLER — catches silent changes
  --------------------------------------------------*/
  setInterval(() => {
    enforceHubSelection();
    enforceElmsall();
  }, 500);

})();
