// ==UserScript==
// @name         [PAK] BatchPickWalk Auto Extract + Cycle
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Extract R rows, post to Google Script, build UI, and auto-cycle between two URLs every minute
// @author       Pak
// @match        http://ws-whs.next-uk.next.loc/DirectoryManagement/BatchPickWalk3.asp*
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const GOOGLE_POST = "https://script.google.com/a/macros/next.co.uk/s/AKfycbzjEeNZl972K-rqcPdqt3_vMCmoTO395Hmpzfvj4dHXAd_bobOtXog6GyMGv-afmL8sEw/exec";

    // URLs to cycle between
    const URLS = [
        "http://ws-whs.next-uk.next.loc/DirectoryManagement/BatchPickWalk3.asp?Warehouse=Elmsall&Batch=999&Day=1&FromBatch=80&ToBatch=99",
        "http://ws-whs.next-uk.next.loc/DirectoryManagement/BatchPickWalk3.asp?Warehouse=Elmsall&Batch=999&Day=0&FromBatch=1&ToBatch=99"
    ];

    // ===== Get Log Meta =====
    function getLogMeta() {
        const now = new Date();
        const logDate =
            String(now.getDate()).padStart(2, "0") + "/" +
            String(now.getMonth() + 1).padStart(2, "0") + "/" +
            now.getFullYear();
        const hour = now.getHours();
        const logTime = String(hour).padStart(2, "0") + ":00";
        const translatedHour = (hour + 24 - 5) % 24;
        return { logDate, logTime, translatedHour };
    }

    // ===== Get Date from URL Day param =====
    function getDateFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const dayOffset = parseInt(params.get("Day") || "0", 10);
        const d = new Date();
        d.setDate(d.getDate() - dayOffset);
        return d.toISOString().split("T")[0]; // YYYY-MM-DD
    }

    // ===== Extract Rows =====
    function extractRows() {
        const results = [];
        const runDate = getDateFromUrl();
        const meta = getLogMeta();

        results.push([
            "Packing Station", "Bonus Number", "Outstanding", "Packed",
            "Wrong Picks", "No Stocks", "Missing Items", "",
            "Log Time", "Hour Translated", "Data Date", "Log Date"
        ]);

        const params = [...document.querySelectorAll('param[name^="R"]')];
        if (params.length === 0) console.warn("No R rows found. Check if content is dynamic or in iframe.");

        params.forEach(p => {
            let cols = (p.getAttribute("value") || "").split(",").map(c => c.trim());
            cols = cols.slice(0, 7);
            while (cols.length < 7) cols.push("");

            const numericFields = cols.slice(2, 7);
            if (!numericFields.some(v => v !== "" && !isNaN(v))) return;

            results.push([
                ...cols,
                "",
                meta.logTime,
                meta.translatedHour,
                runDate,
                meta.logDate
            ]);
        });

        return results;
    }

    // ===== CSV/TSV =====
    function toCSV(data) { return data.map(r => r.map(v => `"${v}"`).join(",")).join("\n"); }
    function toTSV(data) { return data.map(r => r.join("\t")).join("\n"); }

    // ===== Build UI =====
    function buildUI(results) {
        const csv = toCSV(results);
        const tsv = toTSV(results);

        const panel = document.createElement("div");
        panel.style.position = "fixed";
        panel.style.top = "10px";
        panel.style.right = "10px";
        panel.style.background = "white";
        panel.style.border = "2px solid black";
        panel.style.padding = "6px";
        panel.style.zIndex = 999999;
        panel.style.fontSize = "12px";
        panel.style.fontFamily = "monospace";
        panel.style.maxWidth = "220px";
        panel.style.overflow = "auto";

        const copyBtn = document.createElement("button");
        copyBtn.textContent = "📋 Copy TSV";
        copyBtn.onclick = () => { GM_setClipboard(tsv); console.log("Clipboard updated"); };

        const downloadBtn = document.createElement("button");
        downloadBtn.textContent = "⬇ Download CSV";
        downloadBtn.style.marginLeft = "5px";
        downloadBtn.onclick = () => {
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "BatchPickWalk.csv";
            a.click();
            URL.revokeObjectURL(url);
        };

        panel.appendChild(copyBtn);
        panel.appendChild(downloadBtn);
        document.body.appendChild(panel);
    }

    // ===== POST =====
    function postToGoogleScript(payload) {
        GM_xmlhttpRequest({
            method: "POST",
            url: GOOGLE_POST,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(payload),
            onload: r => console.log("✅ Posted to Google Script:", r.responseText),
            onerror: e => console.error("❌ Post error:", e)
        });
    }

    // ===== Cycle URLs =====
    function scheduleNextUrl() {
        const params = new URLSearchParams(window.location.search);
        const currentDay = params.get("Day") || "0";

        const nextUrl = currentDay === "0"
        ? "http://ws-whs.next-uk.next.loc/DirectoryManagement/BatchPickWalk3.asp?Warehouse=Elmsall&Batch=999&Day=1&FromBatch=80&ToBatch=99"
        : "http://ws-whs.next-uk.next.loc/DirectoryManagement/BatchPickWalk3.asp?Warehouse=Elmsall&Batch=999&Day=0&FromBatch=1&ToBatch=99";

        // Wait until next full minute
        const now = new Date();
        const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

        setTimeout(() => {
            window.location.href = nextUrl;
        }, msToNextMinute);
    }


    // ===== Main =====
    window.addEventListener("load", () => {
        setTimeout(() => {
            const results = extractRows();
            if (results.length > 1) {
                console.log("Extracted rows:", results);
                buildUI(results);

                const payload = { timestamp: new Date().toISOString(), data: results };
                postToGoogleScript(payload);
            } else {
                console.warn("No rows extracted.");
            }

            // Schedule next URL cycle aligned with real-time minute
            scheduleNextUrl();

        }, 1000); // slight delay to allow DOM load
    });

})();
