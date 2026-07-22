// ==UserScript==
// @name         [PAK] OrdersBatchReport - International Widget
// @namespace    http://tampermonkey.net/
// @version      2.6
// @author       Pak
// @description  Floating INTERNATIONAL widget with filtered carriers + smart copy
// @match        https://pon-wpws27/Whds.Dashboard.Web/reports/OrdersBatchReport*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const WIDGET_ID = "obr-international-widget";
  const MODE_KEY = "obr-international-mode";

  let minimised = false;
  let currentMode = localStorage.getItem(MODE_KEY) || "AM";

  const TYPE_ORDER_AM = [
    "DHL - 51",
    "ASE - 76",
    "SKY - 77",
    "DPD - 72",
    "DPD - 70",
    "",
    "MEE - 61",
    "DPD - 62",
    "EVR - 33"
  ];

  const TYPE_ORDER_PM = [
    "DHL - 51",
    "ASE - 76",
    "SKY - 77",
    "DPD - 72",
    "DPD - 70",
    "MEE - 61",
    "DPD - 62",
    "EVR - 33",
    "DHL - 65"
  ];

  GM_addStyle(`
    #${WIDGET_ID}{
      position:fixed;
      right:0px;
      bottom:45px;
      width:340px;
      max-height:65vh;
      background:#020617;
      border-radius:16px;
      box-shadow:0 20px 40px rgba(0,0,0,0.45);
      border:1px solid rgba(255,255,255,0.08);
      z-index:999999;
      overflow:hidden;
      font-family:Segoe UI,Arial,sans-serif;
    }

    #${WIDGET_ID}.min{
      width:360px;
      max-height:none;
    }

    #${WIDGET_ID}, #${WIDGET_ID} *{
      color:#f1f5f9 !important;
      box-sizing:border-box;
    }

    #${WIDGET_ID} .header{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      padding:10px 14px;
      background:#0f172a;
      border-bottom:1px solid rgba(255,255,255,0.08);
    }

    #${WIDGET_ID}.min .header{
      display:grid;
      grid-template-columns: 1fr auto;
      grid-template-areas:
        "title actions"
        "modes actions";
      gap:6px 10px;
      align-items:center;
    }

    #${WIDGET_ID} .header-left{
      display:flex;
      align-items:center;
      gap:10px;
      min-width:0;
      flex-wrap:wrap;
    }

    #${WIDGET_ID}.min .header-left{
      display:contents;
    }

    #${WIDGET_ID} .title{
      font-weight:700;
      font-size:14px;
      white-space:nowrap;
    }

    #${WIDGET_ID}.min .title{
      grid-area:title;
    }

    #${WIDGET_ID} .mode-buttons{
      display:flex;
      gap:6px;
      flex-wrap:wrap;
    }

    #${WIDGET_ID}.min .mode-buttons{
      grid-area:modes;
    }

    #${WIDGET_ID} .actions{
      display:flex;
      gap:6px;
      justify-content:flex-end;
      flex-wrap:wrap;
    }

    #${WIDGET_ID}.min .actions{
      grid-area:actions;
      align-self:center;
    }

    #${WIDGET_ID} button{
      border:none;
      cursor:pointer;
      border-radius:8px;
      padding:6px 10px;
      font-weight:600;
      display:flex;
      align-items:center;
      gap:6px;
      transition:all .15s ease;
      white-space:nowrap;
    }

    #${WIDGET_ID} button:hover{
      transform:translateY(-1px);
      filter:brightness(1.1);
    }

    #${WIDGET_ID} button:active{
      transform:scale(.96);
    }

    .copy-btn{
      background:#2563eb;
    }

    .copy-btn.copied{
      background:#16a34a;
    }

    .toggle-btn{
      background:#1e293b;
    }

    .mode-btn{
      background:#334155;
      min-width:52px;
      justify-content:center;
    }

    .mode-btn.active{
      background:#0ea5e9;
    }

    #${WIDGET_ID} .body{
      overflow:auto;
      max-height:80vh;
      padding:10px 10px 14px 10px;
    }

    #${WIDGET_ID}.min .body{
      display:none;
    }

    #${WIDGET_ID} table{
      width:100%;
      border-collapse:collapse;
      margin-bottom:6px;
    }

    #${WIDGET_ID} th{
      text-align:left;
      padding:6px 8px;
      background:#1e293b;
      border-bottom:1px solid rgba(255,255,255,0.08);
    }

    #${WIDGET_ID} td{
      padding:8px 8px;
      vertical-align:middle;
    }

    #${WIDGET_ID} tr:nth-child(even){
      background:#020617;
    }

    #${WIDGET_ID} tr:nth-child(odd){
      background:#0f172a;
    }

    #${WIDGET_ID} .spacer-row td{
      height:10px;
      padding:0;
      background:transparent !important;
    }

    #${WIDGET_ID} .empty-state{
      padding:14px 12px;
      text-align:center;
      opacity:0.8;
      border:1px dashed rgba(255,255,255,0.18);
      border-radius:14px;
    }
  `);

  function copyIcon() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
      <path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm4 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h12v14z"/>
    </svg>`;
  }

  function tickIcon() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
      <path d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.5z"/>
    </svg>`;
  }

  function chevronUp() {
    return `<i class="fa-solid fa-chevron-up"></i>`;
  }

  function chevronDown() {
    return `<i class="fa-solid fa-chevron-down"></i>`;
  }

  function getTypeOrder() {
    return currentMode === "PM" ? TYPE_ORDER_PM : TYPE_ORDER_AM;
  }

  function createWidget() {
    let w = document.getElementById(WIDGET_ID);
    if (w) return w;

    w = document.createElement("div");
    w.id = WIDGET_ID;

    w.innerHTML = `
      <div class="header">
        <div class="header-left">
          <div class="title">INTERNATIONAL Total</div>
          <div class="mode-buttons">
            <button class="mode-btn am-btn" type="button">Int'l Summary</button>
            <button class="mode-btn pm-btn" type="button">O/N Handover</button>
          </div>
        </div>

        <div class="actions">
          <button class="copy-btn" type="button">${copyIcon()}</button>
          <button class="toggle-btn" type="button">${chevronDown()}</button>
        </div>
      </div>

      <div class="body">
        <div class="table-wrap"></div>
      </div>
    `;

    document.body.appendChild(w);

    const toggle = w.querySelector(".toggle-btn");
    toggle.onclick = () => {
      minimised = !minimised;
      if (minimised) {
        w.classList.add("min");
        toggle.innerHTML = chevronUp();
      } else {
        w.classList.remove("min");
        toggle.innerHTML = chevronDown();
      }
    };

    const amBtn = w.querySelector(".am-btn");
    const pmBtn = w.querySelector(".pm-btn");

    const syncModeButtons = () => {
      amBtn.classList.toggle("active", currentMode === "AM");
      pmBtn.classList.toggle("active", currentMode === "PM");
    };

    amBtn.onclick = () => {
      currentMode = "AM";
      localStorage.setItem(MODE_KEY, currentMode);
      syncModeButtons();
      render();
    };

    pmBtn.onclick = () => {
      currentMode = "PM";
      localStorage.setItem(MODE_KEY, currentMode);
      syncModeButtons();
      render();
    };

    syncModeButtons();
    return w;
  }

  function internationalActive() {
    return [...document.querySelectorAll('[role="tab"]')].some(t => {
      const text = (t.innerText || "").trim().toUpperCase();
      return text === "INTERNATIONAL" &&
        (t.classList.contains("mdc-tab--active") ||
         t.getAttribute("aria-selected") === "true");
    });
  }

  function findTable() {
    return document.querySelector("mat-table.next-obr-table") || document.querySelector("mat-table");
  }

  function getRowMap(table) {
    const map = {};

    [...table.querySelectorAll("mat-row")].forEach(r => {
      const cells = [...r.querySelectorAll("mat-cell")];
      const type = cells[0]?.innerText.trim();
      const orders = cells[1]?.innerText.trim();
      const items = cells[3]?.innerText.trim();

      if (type) map[type] = { orders, items };
    });

    return map;
  }

  function buildTable(table) {
    const map = getRowMap(table);
    const order = getTypeOrder();

    const newTable = document.createElement("table");
    const header = document.createElement("tr");

    if (currentMode === "PM") {
      header.innerHTML = `
        <th>Type</th>
        <th style="text-align:right">Items</th>
      `;
    } else {
      header.innerHTML = `
        <th>Type</th>
        <th style="text-align:right">Orders</th>
        <th style="text-align:right">Items</th>
      `;
    }

    newTable.appendChild(header);

    order.forEach(type => {
      if (type === "") {
        const spacer = document.createElement("tr");
        spacer.className = "spacer-row";
        spacer.innerHTML = `<td colspan="${currentMode === "PM" ? 2 : 3}"></td>`;
        newTable.appendChild(spacer);
        return;
      }

      if (!map[type]) return;

      const tr = document.createElement("tr");

      if (currentMode === "PM") {
        tr.innerHTML = `
          <td>${type}</td>
          <td style="text-align:right">${map[type].items}</td>
        `;
      } else {
        tr.innerHTML = `
          <td>${type}</td>
          <td style="text-align:right">${map[type].orders}</td>
          <td style="text-align:right">${map[type].items}</td>
        `;
      }

      newTable.appendChild(tr);
    });

    return newTable;
  }

  function buildCopyText(table) {
    const map = getRowMap(table);
    const order = getTypeOrder();
    const rows = [];

    order.forEach(type => {
      if (type === "") {
        rows.push("");
        return;
      }

      if (!map[type]) {
        rows.push(currentMode === "PM" ? "0" : "0\t0");
        return;
      }

      if (currentMode === "PM") {
        rows.push(`${map[type].items || 0}`);
      } else {
        rows.push(`${map[type].orders || 0}\t${map[type].items || 0}`);
      }
    });

    return rows.join("\n");
  }

  async function copy(table, btn) {
    await navigator.clipboard.writeText(buildCopyText(table));

    btn.classList.add("copied");
    btn.innerHTML = tickIcon();

    setTimeout(() => {
      btn.classList.remove("copied");
      btn.innerHTML = copyIcon();
    }, 2000);
  }

  function render() {
    const widget = createWidget();

    if (!internationalActive()) {
      widget.style.display = "none";
      return;
    }

    const table = findTable();
    if (!table) return;

    widget.style.display = "block";

    const amBtn = widget.querySelector(".am-btn");
    const pmBtn = widget.querySelector(".pm-btn");
    if (amBtn && pmBtn) {
      amBtn.classList.toggle("active", currentMode === "AM");
      pmBtn.classList.toggle("active", currentMode === "PM");
    }

    const wrap = widget.querySelector(".table-wrap");
    wrap.innerHTML = "";
    wrap.appendChild(buildTable(table));

    const copyBtn = widget.querySelector(".copy-btn");
    copyBtn.onclick = () => copy(table, copyBtn);
  }

  let scheduled = false;

  function schedule() {
    if (scheduled) return;

    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      render();
    });
  }

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true
  });

  setInterval(schedule, 1000);
  schedule();
})();