// ==UserScript==
// @name         [PAK] PO Total Complete Widget
// @namespace    http://tampermonkey.net/
// @version      10.3
// @description  DBY + Yesterday + Today widget with logging, tooltip, download, today-lock, auto-refresh (per tab), draggable widget, stage click sequence, Google Sheet push. Unified icon buttons + blocking overlay for DBY→Y→T. Supports both legacy and Modern (pon-wdws21) page layouts.
// @author       Pak
// @match        http://whds-batchoverviewprogress:8087/Batch/ProgressOverview
// @match        http://pon-wdws21:8087/Modern/Batch/ProgressOverview
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @updateURL    https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20PO%20Total%20Complete%20Widget.user.js
// @downloadURL  https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20PO%20Total%20Complete%20Widget.user.js
// ==/UserScript==

/* -------------------- EARLY BLOCKING OVERLAY (instant) -------------------- */
(function(){
    const style = document.createElement("style");
    style.innerHTML = `
    #tcw-block-overlay{
        position:fixed;
        top:0;
        left:0;
        width:100vw;
        height:100vh;
        background:rgba(0,0,0,0.38);
        z-index:99999999;
        display:flex;
        align-items:center;
        justify-content:center;
        font-family:Segoe UI,Arial;
        color:white;
    }
    #tcw-block-overlay .tcw-spinner{ width:44px; height:44px; border-radius:50%; border:5px solid rgba(255,255,255,0.12); border-top-color:rgba(255,255,255,0.95); animation: tcw-spin 1s linear infinite; margin: 8px auto; }
    @keyframes tcw-spin{ to{transform:rotate(360deg);} }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "tcw-block-overlay";
    overlay.innerHTML = `
        <div style="text-align:center">
            <div class="tcw-spinner"></div>
            <div id="tcw-block-status">Loading widget...</div>
        </div>
    `;
    document.documentElement.appendChild(overlay);
})();

(function($) {
    'use strict';

    /* -------------------- Layout adapter (legacy vs Modern page) -------------------- */
    // The Modern page (pon-wdws21 /Modern/) renders the same data as a
    // Bootstrap div grid instead of the legacy table markup: totals rows are
    // #endElement-Totals_<Key> instead of #ProgRow-Totals_<Key>-999999999,
    // bar text sits directly on the .progress-bar segment instead of a
    // .bar-label child, and drill-down clicks must go through jQuery
    // .trigger('click') on the row because the page's handler ignores
    // untrusted native clicks.
    const PAK_MODERN = /\/modern\//i.test(location.pathname);
    function pakTotalsBarText($progress, key, barClass) {
        return PAK_MODERN
            ? $progress.find('#endElement-Totals_' + key + ' .progress-bar.' + barClass).first().text().trim()
            : $progress.find('#ProgRow-Totals_' + key + '-999999999 .' + barClass + ' .bar-label').first().text().trim();
    }

    /* -------------------- Load Font Awesome (if missing) -------------------- */
    const FA_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css';
    if (!document.querySelector('link[href*="font-awesome"], link[href*="fontawesome"], link[href*="4.7.0"]')) {
        const fa = document.createElement('link');
        fa.rel = 'stylesheet';
        fa.href = FA_CDN;
        document.head.appendChild(fa);
    }

    /* ------------------------------------------------------ DATA MODELS ------------------------------------------------------ */
    let dayBeforeValues = { picking: "", packing: "", intl: "", bpp: "" };
    let yesterdayValues = { picking: "", packing: "", intl: "", bpp: "" };
    let todayValues = { picking: "", packing: "", intl: "", bpp: "" };
    let safeObserver = null;
    let lastTodaySignature = "";
    let realTodayProgressEl = null;

    const DAY_ORDER = ['db', 'y', 't'];

    /* ------------------------------------------------------ LOGGING (localStorage) ------------------------------------------------------ */
    const LOG_KEY = "TCW_LOG_V93";
    function loadLog() {
        return JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    }
    function saveLog(arr) {
        localStorage.setItem(LOG_KEY, JSON.stringify(arr));
    }
    function cleanupOldLogs() {
        const logs = loadLog();
        const now = Date.now();
        const cutoff = now - (72 * 60 * 60 * 1000);
        const filtered = logs.filter(line => {
            const m = line.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/);
            if (!m) return false;
            const [_, dd, mm, yyyy, HH, MM] = m;
            const ts = new Date(`${yyyy}-${mm}-${dd}T${HH}:${MM}:00`).getTime();
            return ts >= cutoff;
        });
        saveLog(filtered);
    }
    function addLogLine() {
        const now = new Date();
        const pad = n => String(n).padStart(2,"0");
        const timestamp = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        const line = [
            `${timestamp}`,
            `DBY-Picking: ${dayBeforeValues.picking}`,
            `DBY-Packing: ${dayBeforeValues.packing}`,
            `DBY-Int'l: ${dayBeforeValues.intl}`,
            `DBY-BPP: ${dayBeforeValues.bpp}`,
            `Y-Picking: ${yesterdayValues.picking}`,
            `Y-Packing: ${yesterdayValues.packing}`,
            `Y-Int'l: ${yesterdayValues.intl}`,
            `Y-BPP: ${yesterdayValues.bpp}`,
            `T-Picking: ${todayValues.picking}`,
            `T-Packing: ${todayValues.packing}`,
            `T-Int'l: ${todayValues.intl}`,
            `T-BPP: ${todayValues.bpp}`
        ].join(" | ");
        const logs = loadLog();
        logs.push(line);
        saveLog(logs);
        cleanupOldLogs();
    }

    /* ------------------------------------------------------ UTILITY ------------------------------------------------------ */
    function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

    function captureProgressToggleState() {
        const btn = document.getElementById('progress-toggle');
        if (!btn) return;
        const wasHidden = btn.textContent.includes('Hide Progress');
        sessionStorage.setItem('progressWasHidden', wasHidden ? '1' : '0');
    }
    function restoreProgressToggleIfNeeded() {
        const wasHidden = sessionStorage.getItem('progressWasHidden') === '1';
        if (!wasHidden) return;
        const btn = document.getElementById('progress-toggle');
        if (!btn) return;
        if (btn.textContent.includes('Hide Progress')) btn.click();
        sessionStorage.removeItem('progressWasHidden');
    }

    function formatOnlyNumberPrefix(raw) {
        if(!raw) return "";
        const m = raw.match(/[\d,]+/);
        return m ? m[0] : "";
    }
    function extractProgressContainer() {
        if (PAK_MODERN) {
            // Modern: .batchNo is a div inside .progress-overview-batch-info;
            // its sibling .progress-overview-batch-rows holds the rows.
            const $totalsNo = $('.batchNo').filter(function() {
                return $(this).text().trim()==='Totals';
            }).first();
            if (!$totalsNo.length) return null;
            const $rows = $totalsNo.closest('div.progress-overview-batch').find('.progress-overview-batch-rows').first();
            return $rows.length ? $rows : null;
        }
        const $totalsSpan = $('span.batchNo').filter(function() {
            return $(this).text().trim()==='Totals';
        }).first();
        if (!$totalsSpan.length) return null;
        const $batchCol = $totalsSpan.closest('div.batch-number-column');
        if (!$batchCol.length) return null;
        const idMatch = ($batchCol.attr('id')||'').match(/BatchNoCol-(\d+)/);
        if (!idMatch) return null;
        return $('#BatchProgress-' + idMatch[1]);
    }
    function calcPackSum(pack,intl){
        return ((parseInt((pack||"").replace(/,/g,""))||0) + (parseInt((intl||"").replace(/,/g,""))||0)).toLocaleString();
    }
    function extractValuesFromProgress($progress){
        if(!$progress || !$progress.length) return null;
        const pickRaw = pakTotalsBarText($progress, 'Picking', 'progress-complete');
        const picking = formatOnlyNumberPrefix(pickRaw);
        const bppRaw = pakTotalsBarText($progress, 'BPP', 'progress-complete');
        const bpp = formatOnlyNumberPrefix(bppRaw);
        const intlRaw = pakTotalsBarText($progress, 'Int_l_Packing', 'progress-complete');
        const intl = formatOnlyNumberPrefix(intlRaw);
        const packingRaw = pakTotalsBarText($progress, 'Packing', 'parcels-packed');
        let packing = "";
        if(packingRaw){
            const pm = packingRaw.match(/\(([\d,]+)\)/);
            packing = pm ? pm[1] : formatOnlyNumberPrefix(packingRaw);
        }
        return { picking, packing, intl, bpp, container:$progress };
    }

    function getDayValues(dayKey) {
        if (dayKey === 'db') return dayBeforeValues;
        if (dayKey === 'y') return yesterdayValues;
        return todayValues;
    }
    function sanitizeFormulaValue(v) {
        return String(v || '').replace(/,/g, '').trim();
    }
    function buildCumulativeFormula(metric, dayKey) {
        const order = ['t', 'y', 'db'];
        const idx = order.indexOf(dayKey);
        if (idx === -1) return '';
        const activeDays = order.slice(0, idx + 1);

        if (metric === 'packing') {
            const parts = [];
            activeDays.forEach(d => {
                const v = getDayValues(d);
                const intl = sanitizeFormulaValue(v.intl);
                const pack = sanitizeFormulaValue(v.packing);
                if (intl) parts.push(intl);
                if (pack) parts.push(pack);
            });
            return parts.length ? '=' + parts.join('+') : '=';
        }

        const values = activeDays
            .map(d => sanitizeFormulaValue(getDayValues(d)[metric]))
            .filter(Boolean);
        return values.length ? '=' + values.join('+') : '=';
    }

    function copyToClipboard(text) {
        const value = String(text || '');
        if (!value) return;

        const fallbackCopy = () => {
            const ta = document.createElement('textarea');
            ta.value = value;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '0';
            document.body.appendChild(ta);
            ta.select();
            ta.setSelectionRange(0, ta.value.length);
            try {
                document.execCommand('copy');
            } catch (e) {
                console.error('Copy failed', e);
            }
            document.body.removeChild(ta);
        };

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(value).catch(fallbackCopy);
        } else {
            fallbackCopy();
        }
    }

    /* ------------------------------------------------------ TOOLTIP ------------------------------------------------------ */
    function buildTooltip(){
        if($("#tcw-tooltip").length) return;
        $("body").append($('<div id="tcw-tooltip" style="position:absolute;background:rgba(0,0,0,0.85);color:white;padding:6px 10px;font-size:12px;border-radius:8px;display:none;z-index:999999;white-space:nowrap;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>'));
    }
    function showTooltip(target,content){
        const $tip=$("#tcw-tooltip");
        if(!$tip.length) return;
        const off=$(target).offset();
        const w=$(target).outerWidth();
        $tip.html(content).css({top:off.top,left:off.left+w+10}).fadeIn(100);
    }
    function hideTooltip(){
        $("#tcw-tooltip").hide();
    }

    /* ------------------------------------------------------ DRAGGABLE WIDGET ------------------------------------------------------ */
    function makeDraggable($el){
        let isDown=false, offsetX=0, offsetY=0;
        $el.css("cursor","move");
        $el.on("mousedown", function(e){
            if($(e.target).closest("button").length || $(e.target).is("input")) return;
            isDown=true;
            const pos=$el.position();
            offsetX=e.pageX-pos.left;
            offsetY=e.pageY-pos.top;
            $el.css("transition","none");
            e.preventDefault();
        });
        $(document).on("mousemove", function(e){
            if(!isDown) return;
            $el.css({left:(e.pageX-offsetX)+"px",top:(e.pageY-offsetY)+"px",transform:"none"});
        });
        $(document).on("mouseup", function(){
            isDown=false;
        });
    }

    /* ------------------------------------------------------ STAGE CLICK SEQUENCE ------------------------------------------------------ */
    const clickSequence=["BPP","Picking","Int'l Packing","Packing","Picking","Picking"];
    const clickDelay={"BPP":20,"Int'l Packing":20,"Packing":20,"Picking":20};
    const pickingRepeatDelay=200;
    function clickSequenceOneByOne($progress){
        const items=$progress.find(PAK_MODERN ? '.progress-overview-description-cell' : 'div.batch-row-item.description-column');
        function clickAt(i){
            if(i>=clickSequence.length) return;
            const stage=clickSequence[i];
            items.each(function(){
                const text=$(this).text().trim();
                if(text!==stage) return;
                if(PAK_MODERN){
                    // Modern: the row is the click target and the page's
                    // handler ignores untrusted native clicks, so trigger
                    // through jQuery on the clickable row.
                    const $row=$(this).closest('.progress-overview-row');
                    if($row.hasClass('progress-overview-clickable')){
                        try{ $row.trigger('click'); }catch(e){}
                    }
                    return;
                }
                const style=window.getComputedStyle(this);
                if(style.cursor==="pointer"){
                    try{ this.click(); }catch(e){}
                }
            });
            const delayTime=stage==="Picking"?pickingRepeatDelay:(clickDelay[stage]||200);
            setTimeout(()=>clickAt(i+1),delayTime);
        }
        clickAt(0);
    }

    /* ------------------------------------------------------ UNIFIED BUTTON STYLES + BLOCKING OVERLAY ------------------------------ */
    (function injectUnifiedStyles(){
        if(document.getElementById('tcw-unified-styles')) return;
        const s=document.createElement('style');
        s.id='tcw-unified-styles';
        s.textContent=`
        .tcw-btn {
            width: 36px;
            height: 36px;
            padding: 0;
            display:inline-flex;
            align-items:center;
            justify-content:center;
            border-radius:6px;
            border:1px solid rgba(255,255,255,0.12);
            background:#0b0b0b;
            color:#fff;
            cursor:pointer;
            box-sizing:border-box;
            transition: transform 120ms ease, box-shadow 140ms ease, background 140ms ease;
            font-size:16px;
        }
        .tcw-btn.alt { background:#111; }
        .tcw-btn:disabled { opacity:.45; cursor:not-allowed; transform:none; box-shadow:none; }
        .tcw-btn:hover:not(:disabled){ transform:translateY(-2px); box-shadow:0 8px 20px rgba(0,0,0,0.45); }
        .tcw-btn .fa { pointer-events:none; line-height:1; }

        .tcw-pill {
            display:inline-flex;
            align-items:center;
            justify-content:center;
            min-width:72px;
            padding:3px 11px;
            border-radius:999px;
            border:1px solid rgba(255,255,255,0.15);
            background:#121212;
            color:#90ee90;
            font-weight:700;
            font-size:12px;
            line-height:1;
            cursor:pointer;
            user-select:none;
            transition: transform 120ms ease, box-shadow 140ms ease, background 140ms ease, color 140ms ease, border-color 140ms ease, opacity 140ms ease;
            box-shadow:0 1px 3px rgba(0,0,0,0.25);
            gap:5px;
        }
        .tcw-pill:hover { transform:translateY(-1px); }
        .tcw-pill.tcw-react {
            background: #90EE90;
            color: #0a0a0a;
            border-color: #90EE90;
            box-shadow:0 6px 16px rgba(255,216,0,0.26);
        }
        .tcw-pill.tcw-copied { animation: tcw-pop 220ms ease-out; }
        .tcw-pill .tcw-pill-text,
        .tcw-pill .tcw-pill-check {
            display:inline-flex;
            align-items:center;
            justify-content:center;
        }
        .tcw-pill .tcw-pill-check { font-size:11px; }
        .tcw-pill .tcw-pill-check.is-hidden { display:none; }
        .tcw-pill .tcw-pill-text.is-hidden { display:none; }
        @keyframes tcw-pop {
            0% { transform: scale(1); }
            50% { transform: scale(1.08); }
            100% { transform: scale(1); }
        }

        #tcw-block-overlay {
            position:fixed; left:0; top:0; right:0; bottom:0;
            background: rgba(0,0,0,0.38);
            z-index: 9999999;
            display:none;
            align-items:center; justify-content:center;
        }
        #tcw-block-overlay .tcw-block-inner { color:#fff; text-align:center; font-family: Consolas, monospace; }
        #tcw-block-overlay .spinner { width:44px; height:44px; border-radius:50%; border:5px solid rgba(255,255,255,0.12); border-top-color:rgba(255,255,255,0.95); animation: tcw-spin 1s linear infinite; margin: 8px auto; }
        @keyframes tcw-spin { to { transform: rotate(360deg); } }
        `;
        document.head.appendChild(s);

        if(!document.getElementById('tcw-block-overlay')){
            const ov=document.createElement('div');
            ov.id='tcw-block-overlay';
            ov.innerHTML = `<div class="tcw-block-inner"><div class="spinner" aria-hidden="true"></div><div id="tcw-block-status" style="margin-top:6px;font-size:15px;max-width:720px"></div></div>`;
            document.body.appendChild(ov);
        }
    })();

    function showBlockingOverlay(message){
        const ov=document.getElementById('tcw-block-overlay');
        if(!ov) return;
        const st=document.getElementById('tcw-block-status');
        if(st) st.textContent = message || 'Running sequence — please wait...';
        ov.style.display = 'flex';
        document.activeElement && document.activeElement.blur();
    }
    function hideBlockingOverlay(){
        const ov=document.getElementById('tcw-block-overlay');
        if(!ov) return;
        ov.style.display = 'none';
    }

    function clearPillHover(){
        $('.tcw-pill').removeClass('tcw-react');
    }
    function reactToPillHover(dayKey, metric){
        const startIndex = DAY_ORDER.indexOf(dayKey);
        if (startIndex === -1) return;
        const activeDays = DAY_ORDER.slice(startIndex);
        clearPillHover();
        $('.tcw-pill').each(function(){
            const d = $(this).data('day');
            const m = $(this).data('metric');
            if (m === metric && activeDays.includes(d)) {
                $(this).addClass('tcw-react');
            }
        });
    }

    function setPillDisplay($pill, showTick) {
        const $text = $pill.find('.tcw-pill-text');
        const $check = $pill.find('.tcw-pill-check');
        if (showTick) {
            $text.addClass('is-hidden');
            $check.removeClass('is-hidden');
        } else {
            $text.removeClass('is-hidden');
            $check.addClass('is-hidden');
        }
    }

    function flashCopiedGroup(dayKey, metric){
        const startIndex = DAY_ORDER.indexOf(dayKey);
        if (startIndex === -1) return;
        const activeDays = DAY_ORDER.slice(startIndex);

        $('.tcw-pill').each(function(){
            const $pill = $(this);
            const d = $pill.data('day');
            const m = $pill.data('metric');
            if (m !== metric || !activeDays.includes(d)) return;

            window.clearTimeout($pill.data('tcw-copy-reset'));
            setPillDisplay($pill, true);
            $pill.addClass('tcw-copied');

            const timer = window.setTimeout(() => {
                setPillDisplay($pill, false);
                $pill.removeClass('tcw-copied');
            }, 1000);
            $pill.data('tcw-copy-reset', timer);
        });
    }

    function renderPill(dayKey, metric, value){
        const safeValue = (value === '' || value == null) ? '' : String(value);
        return `<button type="button" class="tcw-pill" data-day="${dayKey}" data-metric="${metric}" title="Click to copy formula"><span class="tcw-pill-text">${safeValue}</span><i class="fa fa-check tcw-pill-check is-hidden" aria-hidden="true"></i></button>`;
    }

    /* ------------------------------------------------------ WIDGET UI ------------------------------------------------------ */
    function createWidgetIfMissing(){
        let $box=$("#compact-widget");
        if($box.length) return $box;
        buildTooltip();
        $box=$('<div id="compact-widget"></div>').css({
            position:'fixed',top:'1px',left:'50%',transform:'translateX(-50%)',
            padding:'8px 20px',background:'rgba(0,0,0,0.70)',color:'white',
            fontSize:'14px',fontWeight:'bold',borderRadius:'12px',
            boxShadow:'0 3px 10px rgba(0,0,0,0.35)',fontFamily:'Segoe UI, Tahoma',
            zIndex:99999,whiteSpace:'nowrap'
        });
        $("body").append($box);
        makeDraggable($box);
        return $box;
    }

    function updateWidget(){
        const $box=createWidgetIfMissing();
        const dbPackSum=calcPackSum(dayBeforeValues.packing,dayBeforeValues.intl);
        const yPackSum=calcPackSum(yesterdayValues.packing,yesterdayValues.intl);
        const tPackSum=calcPackSum(todayValues.packing,todayValues.intl);

        $box.html(
`<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:4px;">
    <div style="font-size:13px;font-weight:bold;text-decoration:underline;flex:1;text-align:center;">
        TOTAL COMPLETED
    </div>
    <div style="display:flex;gap:4px;">
        <button id="compact-refresh-btn" class="tcw-btn" title="Refresh (DBY → Y → T)" style="font-size:13px;padding:2px 4px;"><i class="fa fa-refresh"></i></button>
        <button id="tcw-download-btn" class="tcw-btn" title="Download log" style="font-size:13px;padding:2px 4px;"><i class="fa fa-download"></i></button>
        <button id="tcw-toggle-btn" class="tcw-btn alt" title="Stage click sequence (6AM Use)" style="font-size:13px;padding:2px 4px;"><i class="fa fa-exchange"></i></button>
    </div>
    <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;">
        <input type="checkbox" id="tcw-auto-click-min" style="transform:scale(0.8);">
        Auto
    </label>
</div>

<div style="display:grid;grid-template-columns:30px auto auto auto;row-gap:3px;column-gap:10px;font-size:12px;align-items:center;">
    <div style="color:#ffd800;">DBY</div>
    <div>P: ${renderPill('db', 'picking', dayBeforeValues.picking)}</div>
    <div class="tcw-packsum" data-day="db">Pk: ${renderPill('db', 'packing', dbPackSum)}</div>
    <div>B: ${renderPill('db', 'bpp', dayBeforeValues.bpp)}</div>

    <div style="color:#ffd800;">Y</div>
    <div>P: ${renderPill('y', 'picking', yesterdayValues.picking)}</div>
    <div class="tcw-packsum" data-day="y">Pk: ${renderPill('y', 'packing', yPackSum)}</div>
    <div>B: ${renderPill('y', 'bpp', yesterdayValues.bpp)}</div>

    <div style="color:#87cefa;">T</div>
    <div>P: ${renderPill('t', 'picking', todayValues.picking)}</div>
    <div class="tcw-packsum" data-day="t">Pk: ${renderPill('t', 'packing', tPackSum)}</div>
    <div>B: ${renderPill('t', 'bpp', todayValues.bpp)}</div>
</div>`
);

        $('.tcw-packsum').off().hover(function(){
            const d=$(this).data('day');
            let v=d==='db'?dayBeforeValues:(d==='y'?yesterdayValues:todayValues);
            showTooltip(this,`Packing: ${v.packing}<br>Int'l: ${v.intl}`);
        },hideTooltip);

        $box.off('mouseenter.tcwpill', '.tcw-pill')
            .on('mouseenter.tcwpill', '.tcw-pill', function(){
                reactToPillHover($(this).data('day'), $(this).data('metric'));
            });

        $box.off('mouseleave.tcwpill', '.tcw-pill')
            .on('mouseleave.tcwpill', '.tcw-pill', function(){
                clearPillHover();
            });

        $box.off('click.tcwpill', '.tcw-pill')
            .on('click.tcwpill', '.tcw-pill', function(e){
                e.stopPropagation();
                const dayKey = $(this).data('day');
                const metric = $(this).data('metric');
                const formula = buildCumulativeFormula(metric, dayKey);
                copyToClipboard(formula);
                flashCopiedGroup(dayKey, metric);
            });

        $('#compact-refresh-btn').off().on('click', async (e)=>{
            e.stopPropagation();
            await runFullSequence();
        });

        $('#tcw-download-btn').off().on('click',function(){
            const logs=loadLog().join("\n");
            const blob=new Blob([logs],{type:"text/plain"});
            const url=URL.createObjectURL(blob);
            const a=document.createElement("a");
            a.href=url;a.download="TotalCompleteLog.txt";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });

        $('#tcw-toggle-btn').off().on('click',function(){
            const $progress=extractProgressContainer();
            if($progress) clickSequenceOneByOne($progress);
        });

        let autoClickTimeout = null;
        const savedState = sessionStorage.getItem('TCW_AUTO_CLICK_MIN');
        $('#tcw-auto-click-min').prop('checked', savedState === 'true');

        function scheduleNextAutoRefresh() {
            const now = new Date();
            const minutes = now.getMinutes();
            const seconds = now.getSeconds();
            const ms = now.getMilliseconds();
            const targetMinutes = minutes < 30 ? 30 : 60;
            const msToNext = ((targetMinutes - minutes) * 60 * 1000) - (seconds * 1000) - ms;
            autoClickTimeout = setTimeout(() => {
                const $btn = $('#compact-refresh-btn');
                if ($btn.length) $btn.click();
                if ($('#tcw-auto-click-min').prop('checked')) scheduleNextAutoRefresh();
            }, msToNext);
        }

        $('#tcw-auto-click-min').off().on('change', function () {
            const isChecked = this.checked;
            sessionStorage.setItem('TCW_AUTO_CLICK_MIN', isChecked ? 'true' : 'false');
            if (autoClickTimeout) {
                clearTimeout(autoClickTimeout);
                autoClickTimeout = null;
            }
            if (isChecked) scheduleNextAutoRefresh();
        });

        if (savedState === 'true') scheduleNextAutoRefresh();
    }

    /* ------------------------------------------------------ MIDNIGHT AUTO RELOAD ------------------------------------------------------ */
    function scheduleMidnightReload() {
        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setHours(24, 0, 0, 0);
        const msToMidnight = nextMidnight.getTime() - now.getTime();
        setTimeout(() => {
            console.log('TCW: Midnight reload triggered');
            location.reload();
        }, msToMidnight);
    }

    /* ------------------------------------------------------ 15-MIN QUARTER-ALIGNED AUTO RELOAD ------------------------------------------------------ */
    function schedule15MinReload() {
        const now = new Date();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        const ms = now.getMilliseconds();
        let nextQuarter;
        if (minutes < 15) nextQuarter = 15;
        else if (minutes < 30) nextQuarter = 30;
        else if (minutes < 45) nextQuarter = 45;
        else nextQuarter = 60;
        const msToNext = ((nextQuarter - minutes) * 60 * 1000) - (seconds * 1000) - ms;
        setTimeout(() => {
            if (isAutoRefreshEnabled()) {
                console.log('TCW: 15-min reload triggered');
                location.reload();
            }
            schedule15MinReload();
        }, msToNext);
    }

    /* ------------------------------------------------------ OBSERVERS ------------------------------------------------------ */
    function attachSafeObserverToProgress($progress){
        if(safeObserver) safeObserver.disconnect();
        realTodayProgressEl=$progress[0];
        safeObserver=new MutationObserver(()=> {
            const v=extractValuesFromProgress($(realTodayProgressEl));
            if(!v) return;
            const sig=JSON.stringify(v);
            if(sig!==lastTodaySignature){
                lastTodaySignature=sig;
                todayValues=v;
                updateWidget();
            }
        });
        safeObserver.observe(realTodayProgressEl,{childList:true,subtree:true,characterData:true});
    }
    function startLastUpdateWatcher(){
        const target=document.querySelector('#last-update-label');
        if(!target) return setTimeout(startLastUpdateWatcher,500);
        let oldVal=target.textContent.trim();
        const obs=new MutationObserver(()=> {
            const nowVal=target.textContent.trim();
            if(nowVal!==oldVal){
                oldVal=nowVal;
                updateWidget();
            }
        });
        obs.observe(target,{childList:true,subtree:true,characterData:true});
    }

    /* ------------------------------------------------------ FULL SEQUENCE: DBY -> Y -> T (async with blocking overlay) ---------------- */
    async function runFullSequenceOriginal() {
        if (isAutoRefreshEnabled()) {
            captureProgressToggleState();
        }

        const $sel = $('#ProgressDay');
        if (!$sel.length) return;

        const dbIndex = 2, yIndex = 1, tIndex = 0;
        const opts = $sel.find('option');
        if (opts.length <= Math.max(dbIndex, yIndex, tIndex)) {
            await attemptFallbackSequence();
            return;
        }

        const dbOpt = $sel.find('option').eq(dbIndex);
        const yOpt  = $sel.find('option').eq(yIndex);
        const tOpt  = $sel.find('option').eq(tIndex);

        if (!dbOpt.length || !yOpt.length || !tOpt.length) {
            await attemptFallbackSequence();
            return;
        }

        try {
            showBlockingOverlay('Loading DBY (Day Before) — please wait...');
            $sel.val(dbOpt.val()).trigger('change');
            await delay(1000);
            const $p_db = extractProgressContainer();
            if ($p_db) dayBeforeValues = extractValuesFromProgress($p_db) || dayBeforeValues;

            showBlockingOverlay('Loading Yesterday — please wait...');
            $sel.val(yOpt.val()).trigger('change');
            await delay(1000);
            const $p_y = extractProgressContainer();
            if ($p_y) yesterdayValues = extractValuesFromProgress($p_y) || yesterdayValues;

            showBlockingOverlay('Loading Today — please wait...');
            $sel.val(tOpt.val()).trigger('change');
            await delay(1000);
            const $p_t = extractProgressContainer();
            if ($p_t) {
                todayValues = extractValuesFromProgress($p_t) || todayValues;
                attachSafeObserverToProgress($p_t);
            }

            updateWidget();
            addLogLine();
            pushOnceAfterInitialLoad();

            if (isAutoRefreshEnabled()) {
                await delay(300);
                restoreProgressToggleIfNeeded();
            }
        } catch(e) {
            console.error('runFullSequenceOriginal error', e);
        } finally {
            hideBlockingOverlay();
        }
    }

    async function attemptFallbackSequence(){
        const $sel=$('#ProgressDay');
        if(!$sel.length) return;
        const opts=$sel.find('option');
        const len=opts.length;
        const dbIndex=(len>2)?2:len-1;
        const yIndex=(len>1)?1:0;
        const tIndex=0;
        showBlockingOverlay('Running fallback sequence — please wait...');
        try {
            async function tryLoad(idx, assign) {
                const opt=opts.eq(idx);
                if(!opt.length) return;
                $sel.val(opt.val()).trigger('change');
                await delay(800);
                const $p=extractProgressContainer();
                if($p){
                    const v=extractValuesFromProgress($p);
                    if(v) assign(v);
                }
            }
            await tryLoad(dbIndex,v=>dayBeforeValues=v);
            await tryLoad(yIndex,v=>yesterdayValues=v);
            await tryLoad(tIndex,v=>{
                todayValues=v;
                const $p=extractProgressContainer();
                if($p) attachSafeObserverToProgress($p);
                updateWidget();
                addLogLine();
            });
            await delay(500);
            updateWidget();
        } catch(e) {
            console.error('attemptFallbackSequence error', e);
        } finally {
            hideBlockingOverlay();
        }
    }

    /* ------------------------------------------------------ GOOGLE SHEET PUSH ------------------------------------------------------ */
    const WEB_APP_URL="https://script.google.com/a/macros/next.co.uk/s/AKfycby9TKFDmla-VkkZuLEBfEr3sBTakWaf_1G6oqyYqAHA2fwS4L5aZJs6Hk8rpU3YFgjV1w/exec";
    let lastSheetSignature="";
    let latestSnapshot=null;
    function buildSnapshot(){
        return { dayBefore:{...dayBeforeValues}, yesterday:{...yesterdayValues}, today:{...todayValues} };
    }
    function pushToSheet(snapshot){
        if(!snapshot) return;
        const sig=JSON.stringify(snapshot);
        if(sig===lastSheetSignature) return;
        lastSheetSignature=sig;
        const timestamp=new Date().toLocaleString();
        console.log(`TCW Sheet push at ${timestamp}:`,snapshot);
        GM_xmlhttpRequest({
            method:"POST",
            url:WEB_APP_URL,
            headers:{"Content-Type":"application/json"},
            data:JSON.stringify(snapshot),
            onload:res=>console.log("Push success:",res.responseText),
            onerror:err=>console.error("Push error:",err)
        });
    }
    const originalUpdateWidget=updateWidget;
    updateWidget=function(){
        originalUpdateWidget();
        latestSnapshot=buildSnapshot();
    };
    function isAutoRefreshEnabled(){
        return sessionStorage.getItem('TCW_AUTO_CLICK_MIN')==='true';
    }
    setInterval(()=>{ latestSnapshot=buildSnapshot(); },60*1000);
    function pushOnceAfterInitialLoad() {
        if (!isAutoRefreshEnabled()) return;
        if (!latestSnapshot) return;
        pushToSheet(latestSnapshot);
    }
    const originalRunFullSequence = runFullSequenceOriginal;
    async function runFullSequence() {
        await originalRunFullSequence();
        setTimeout(pushOnceAfterInitialLoad, 5000);
    }
    function scheduleSheetPush() {
        const now = new Date();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        const ms = now.getMilliseconds();
        const nextBoundaryMinutes = minutes < 30 ? 30 : 60;
        const minutesToWait = nextBoundaryMinutes - minutes;
        const msToNext30 = (minutesToWait * 60 * 1000) - (seconds * 1000) - ms;
        setTimeout(() => {
            if (isAutoRefreshEnabled() && latestSnapshot) {
                pushToSheet(latestSnapshot);
            }
            scheduleSheetPush();
        }, msToNext30);
    }
    scheduleSheetPush();

    /* ------------------------------------------------------ INIT ------------------------------------------------------ */
    $(function(){
        createWidgetIfMissing();
        (function waitForSel(){
            const $sel=$('#ProgressDay');
            if($sel.length) runFullSequence();
            else setTimeout(waitForSel,2000);
        })();
        startLastUpdateWatcher();
        scheduleMidnightReload();
        schedule15MinReload();
    });

})(jQuery);

