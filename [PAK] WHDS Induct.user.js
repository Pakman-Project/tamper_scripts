// ==UserScript==
// @name         [PAK] WHDS Induct
// @namespace    http://tampermonkey.net/
// @version      2.7
// @match        http://whds-warehousereports-web:8101/*
// @author       Pak
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    const IS_LIST = [
        11,12,13,14,15,
        21,22,23,24,25,
        31,32,33,34,35,
        41,42,43,44,45,
        51,52,53,54,
        61,62,63,64,65,
        71,72,73,74,75,
        81,82,83,84,85,
        91,92,93,94,95,
        111,112,113,114,115,
        121,122,123,124,125
    ];

    const GOOGLE_SHEET_URL =
        "https://script.google.com/a/macros/next.co.uk/s/AKfycbwwWU8ADmobBC8zve_3VglNFJ57ZzZ5VyEJAgnTMETMv5JsvqQe1OgQQzqBzovr0TKR/exec";

    const AUTO_KEY = "inductAutoRun";
    const PENDING_EXPORT_KEY = "inductPendingExport";
    const NO_DATA_KEY = "inductWaitingForData";
    const NO_DATA_REFRESH_MS = 5000;

    let autoTimer = null;

    function loadFontAwesome() {
        if (document.getElementById("induct-fa")) return;
        const link = document.createElement("link");
        link.id = "induct-fa";
        link.rel = "stylesheet";
        link.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css";
        document.head.appendChild(link);
    }

    window.addEventListener("load", () => {
        loadFontAwesome();

        // ===== AUTO DATE ROLL AFTER 01:00 =====
        (function ensureTodayDateAtOneAM() {
            try {
                const url = new URL(location.href);
                const urlDate = url.searchParams.get("date");
                if (!urlDate) return;
                const now = new Date();
                if (now.getHours() < 1) return;

                const todayStr =
                    now.getFullYear() + "-" +
                    String(now.getMonth() + 1).padStart(2, "0") + "-" +
                    String(now.getDate()).padStart(2, "0");

                if (urlDate !== todayStr) {
                    url.searchParams.set("date", todayStr);
                    location.replace(url.toString());
                }
            } catch (e) {
                console.warn("[Induct] date roll error", e);
            }
        })();

        // ===== MIDNIGHT NO DATA WATCHDOG =====
        const noDataDiv = document.querySelector("#div1");
        if (noDataDiv && /no data found/i.test(noDataDiv.innerText)) {
            localStorage.setItem(NO_DATA_KEY, "1");

            if (localStorage.getItem(AUTO_KEY) === "1") scheduleNext();
            setTimeout(() => location.reload(), NO_DATA_REFRESH_MS);
            console.warn("[Induct] No data yet — retrying in 5s");
            return;
        }

        const form = document.querySelector("form#form1");
        if (!form) return;
        const table = form.querySelector("table");
        if (!table) return;

        const rows = [...table.querySelectorAll("tr")];
        if (rows.length < 2) return;

        const extracted = new Map();
        rows.slice(1).forEach(tr => {
            const tds = tr.querySelectorAll("td");
            if (tds.length >= 2) {
                const id = parseInt(tds[0].innerText.trim(), 10);
                const val = parseInt(tds[1].innerText.trim(), 10);
                if (!isNaN(id) && !isNaN(val)) extracted.set(id, val);
            }
        });

        const exportValues = IS_LIST.map(id => extracted.get(id) || 0);

        // ===== EXPORT AFTER AUTO REFRESH =====
        if (localStorage.getItem(PENDING_EXPORT_KEY) === "1") {
            localStorage.removeItem(PENDING_EXPORT_KEY);
            if (localStorage.getItem(NO_DATA_KEY) === "1") localStorage.removeItem(NO_DATA_KEY);
            postToGoogleSheet(exportValues);
        }

        // ================= BOTTOM BAR UI =================
        const BAR_ID = 'induct-bottom-bar';

        const bar = document.createElement('div');
        bar.id = BAR_ID;
        bar.innerHTML = `
          <div id="induct-inner">

            <div id="induct-title">Induct</div>

            <div id="induct-controls">
              <button class="induct-pill" id="induct-copy" title="Copy to Clipboard">
                <i class="fa fa-copy"></i>
              </button>
              <button class="induct-pill" id="induct-export" title="Send to Logger now">
                <i class="fa fa-paper-plane"></i>
              </button>
              <button class="induct-pill" id="induct-auto" title="Auto Run on the hour">
                <i class="fa fa-clock-o"></i>
              </button>
            </div>

            <button class="induct-pill" id="induct-refresh" title="Refresh">
              <i class="fa fa-refresh"></i>
            </button>

          </div>
        `;
        document.body.appendChild(bar);

        const style = document.createElement('style');
        style.textContent = `
          /* bar container */
          #${BAR_ID} {
            position: fixed;
            left: 8px;
            right: 8px;
            bottom: 8px;
            z-index: 999999;
            background: transparent;
            pointer-events: auto;
            font-family: Arial, sans-serif;
          }

          /* inner pill wrapper */
          #induct-inner {
            display:flex;
            align-items:center;
            gap:10px;
            background:#000;
            border:1px solid #333;
            padding:8px 12px;
            border-radius:16px;
            box-shadow: 0 6px 18px rgba(0,0,0,0.6);
          }

          #induct-title {
            font-weight:800;
            color:#aaa;
            font-size:13px;
            text-transform:uppercase;
            margin-right:8px;
            letter-spacing:.04em;
            min-width:0;
          }

          #induct-controls {
            display:flex;
            gap:8px;
            align-items:center;
            flex: 1 1 auto;
          }

          .induct-pill {
            background:#000;
            border:1px solid #333;
            color:#ddd;
            padding:6px 10px;
            border-radius:999px;
            font-size:16px;
            cursor:pointer;
            transition: transform .12s ease, background .12s ease, border-color .12s ease;
            display:inline-flex;
            align-items:center;
            justify-content:center;
            min-width:44px;
          }

          .induct-pill i {
            font-size: 15px;
            line-height: 1;
          }

          .induct-pill:hover {
            background:#080808;
            border-color:#4a4a4a;
            transform: translateY(-2px);
          }

          .induct-pill.active {
            background:#071420;
            border-color:#165c3a;
            color:#22c55e;
            box-shadow: 0 4px 10px rgba(34,197,94,0.06);
            transform: none;
          }

          #induct-refresh {
            min-width:44px;
            background:#000;
            border:1px solid #333;
            color:#ddd;
          }

          /* smaller screens */
          @media (max-width:720px) {
            #induct-inner { padding:6px 8px; gap:6px; }
            .induct-pill { padding:6px 8px; font-size:15px; min-width:40px; }
            #induct-title { display:none; }
          }
        `;
        document.head.appendChild(style);

        // buttons
        const copyBtn = document.getElementById('induct-copy');
        const exportBtn = document.getElementById('induct-export');
        const autoBtn = document.getElementById('induct-auto');
        const refreshBtn = document.getElementById('induct-refresh');

        // initial auto state
        const autoEnabled = localStorage.getItem(AUTO_KEY) === "1";
        if (autoEnabled) {
            autoBtn.classList.add('active');
            if (!autoTimer) startAuto();
        } else {
            autoBtn.classList.remove('active');
        }

        // copy behaviour
        copyBtn.addEventListener('click', () => {
            try {
                if (typeof GM_setClipboard === 'function') GM_setClipboard(exportValues.join("\n"));
                else if (navigator.clipboard?.writeText) navigator.clipboard.writeText(exportValues.join("\n"));
                flashCopy(copyBtn);
                toast("Copied to clipboard");
            } catch (e) {
                console.error("[Induct] copy error", e);
                toast("Copy failed");
            }
        });

        // export behaviour
        exportBtn.addEventListener('click', () => {
            flashExport(exportBtn);
            postToGoogleSheet(exportValues);
        });

        // refresh behaviour
        refreshBtn.addEventListener('click', () => {
            refreshBtn.disabled = true;
            setTimeout(() => refreshBtn.disabled = false, 1200);
            location.reload();
        });

        // auto toggle behaviour
        autoBtn.addEventListener('click', () => {
            const enabled = localStorage.getItem(AUTO_KEY) === "1";
            if (enabled) {
                localStorage.setItem(AUTO_KEY, "0");
                stopAuto();
                autoBtn.classList.remove('active');
                toast("Auto OFF");
            } else {
                localStorage.setItem(AUTO_KEY, "1");
                startAuto();
                autoBtn.classList.add('active');
                toast("Auto ON");
            }
        });

        function flashCopy(btn) {
            const icon = btn.querySelector("i");
            const origClass = icon ? icon.className : "";
            if (icon) icon.className = "fa fa-check";
            btn.style.borderColor = "#15803d";
            setTimeout(() => {
                if (icon) icon.className = origClass;
                btn.style.borderColor = "";
            }, 900);
        }

        function flashExport(btn) {
            const icon = btn.querySelector("i");
            const origClass = icon ? icon.className : "";
            if (icon) icon.className = "fa fa-spinner fa-spin";
            btn.style.borderColor = "#0369a1";
            setTimeout(() => {
                if (icon) icon.className = origClass;
                btn.style.borderColor = "";
            }, 900);
        }

        function toast(msg) {
            const t = document.createElement("div");
            t.textContent = msg;
            t.style.cssText = `
                position:fixed;bottom:72px;right:20px;
                background:#000;color:#fff;padding:8px 14px;
                border-radius:6px;z-index:100000;opacity:0;transition:opacity .18s;
            `;
            document.body.appendChild(t);
            requestAnimationFrame(() => t.style.opacity = 1);
            setTimeout(() => { t.style.opacity = 0; setTimeout(() => t.remove(), 220); }, 1400);
        }

        // ================= AUTO RUN LOGIC (on the hour) =================
        if (localStorage.getItem(AUTO_KEY) === "1") startAuto();

        function startAuto() {
            stopAuto(true);
            scheduleNext();
        }

        function stopAuto() {
            if (autoTimer) {
                clearTimeout(autoTimer);
                autoTimer = null;
            }
        }

        function scheduleNext() {
            const now = new Date();
            const next = new Date(now);
            next.setHours(now.getHours() + 1, 0, 0, 0);
            const ms = next.getTime() - now.getTime();

            autoTimer = setTimeout(() => {
                try { localStorage.setItem(PENDING_EXPORT_KEY, "1"); } catch (e) {}
                location.reload();
            }, Math.max(ms, 0));
        }

        // ================= EXPORT (Google Sheets) =================
        function postToGoogleSheet(values) {
            GM_xmlhttpRequest({
                method: "POST",
                url: GOOGLE_SHEET_URL,
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify({ values }),
                onload: () => {
                    toast("Exported");
                    console.log("[Induct] Export success");
                },
                onerror: () => {
                    toast("Export failed");
                    console.error("[Induct] Export failed");
                }
            });
        }

        // keep UI in sync if the page mutates
        const obs = new MutationObserver(() => {
            if (window.__inductObsTimer) clearTimeout(window.__inductObsTimer);
            window.__inductObsTimer = setTimeout(() => {
                if (localStorage.getItem(AUTO_KEY) === "1" && !autoTimer) startAuto();
            }, 200);
        });
        obs.observe(document.body, { childList: true, subtree: true });

    });
})();