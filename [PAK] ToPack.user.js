// ==UserScript==
// @name         [PAK] ToPack
// @namespace    http://tampermonkey.net/
// @version      5.6
// @description  ToPack with Sorter6 exception: keep and convert to C999. Modal preview (black theme). Refresh button re-runs picking & extraction. toggleDepotCheckbox + auto-refresh only on modal close. Tab-delimited clipboard copy (GM_setClipboard) & toast. Sticky header fixed, subtle borders, hover effects. ALL BUTTONS USE FONT AWESOME ICONS (uniform size & style)
// @author       Pak
// @match        http://whds-batchoverviewprogress:8087/Batch/ProgressOverview
// @match        http://pon-wdws21:8087/Modern/Batch/ProgressOverview
// @grant        GM_setClipboard
// @updateURL    https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20ToPack.user.js
// @downloadURL  https://raw.githubusercontent.com/Pakman-Project/tamper_scripts/main/%5BPAK%5D%20ToPack.user.js
// ==/UserScript==

(function() {
'use strict';

let isRunning = false;

// --------------------------
// Config: button sizing & visuals
// --------------------------
const BTN_SIZE = '36px';        // change this to resize all modal buttons
const MAIN_BTN_SIZE = '40px';   // size for the floating main button
const BTN_RADIUS = '7px';
const BTN_BORDER = '1px solid rgba(255,255,255,0.92)';
const BTN_BG = '#000';
const BTN_BG_ALT = '#111';
const BTN_ICON_FONTSIZE = '14px';
const HOVER_SHADOW = '0 6px 18px rgba(255,255,255,0.06)';

// --------------------------
// Inject Font Awesome + spinner CSS (unique names to avoid collisions)
// --------------------------
(function injectAssets(){
    // Font Awesome v4.7 (keeps class names like `fa fa-copy` used elsewhere)
    if(!document.querySelector('link[href*="font-awesome"]')){
        const fa = document.createElement('link');
        fa.rel = 'stylesheet';
        fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css';
        fa.id = 'toPack-fa-css';
        document.head.appendChild(fa);
    }

    if(document.getElementById('toPack-spinner-styles')) return;
    const style = document.createElement('style');
    style.id = 'toPack-spinner-styles';
    style.textContent = `
    @keyframes toPack-refresh-rotate {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
    }
    .toPack-refresh-spin {
        display: inline-block;
        animation: toPack-refresh-rotate 800ms linear infinite;
        transform-origin: 50% 50%;
        will-change: transform;
    }
    /* small visual tweak so the icon stays centered */
    .toPack-refresh-icon, .toPack-modal-icon {
        display: inline-block;
        line-height: 1;
        pointer-events: none; /* ensure clicking the icon hits the button */
    }
    `;
    document.head.appendChild(style);
})();

// --------------------------
// helper: style icon-only buttons (modal + main)
// --------------------------
function styleIconButton(btn, {size=BTN_SIZE, radius=BTN_RADIUS, bg=BTN_BG, border=BTN_BORDER, fontSize=BTN_ICON_FONTSIZE, alt=false} = {}){
    Object.assign(btn.style, {
        width: size,
        height: size,
        padding: '0',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: fontSize,
        borderRadius: radius,
        border: border,
        background: bg,
        color: '#fff',
        cursor: 'pointer',
        boxSizing: 'border-box',
        transition: 'transform 120ms ease, box-shadow 140ms ease, background-color 140ms ease, opacity 140ms ease',
        outline: 'none',
        lineHeight: '1'
    });

    // pointer-events none for icon element(s) inside
    const icons = btn.querySelectorAll('i, span.toPack-modal-icon');
    icons.forEach(ic => { ic.style.pointerEvents = 'none'; });

    btn.addEventListener('mouseenter', ()=> {
        btn.style.transform = 'translateY(-2px)';
        btn.style.boxShadow = HOVER_SHADOW;
        if(alt) btn.style.backgroundColor = lightenHex(bg, 10);
    });
    btn.addEventListener('mouseleave', ()=> {
        btn.style.transform = 'translateY(0)';
        btn.style.boxShadow = 'none';
        if(alt) btn.style.backgroundColor = bg;
    });

    // keyboard focus style
    btn.addEventListener('focus', ()=> {
        btn.style.boxShadow = '0 0 0 3px rgba(255,255,255,0.06)';
    });
    btn.addEventListener('blur', ()=> {
        btn.style.boxShadow = 'none';
    });
}

// utility to lighten a hex by amount (returns rgb) — re-used from your modal code
function lightenHex(hex, amount){
    if(!hex) return hex;
    if(hex.startsWith('rgb')) return hex;
    hex = hex.replace('#','');
    if(hex.length===3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    const num = parseInt(hex,16);
    let r = (num >> 16) + amount;
    let g = ((num >> 8) & 0x00FF) + amount;
    let b = (num & 0x0000FF) + amount;
    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));
    return `rgb(${r}, ${g}, ${b})`;
}

// --------------------------
// UI BUTTON (floating main button, icon-only)
// --------------------------
const mainButton = document.createElement('button');
mainButton.id = 'auto-batch-button';
mainButton.innerHTML = '<i class="fa fa-archive" aria-hidden="true"></i>';
mainButton.title = 'To Pack';
mainButton.setAttribute('aria-label','To Pack');

Object.assign(mainButton.style,{
    position:'fixed',
    top:'10px',
    right:'120px',
    zIndex:'10000',
    // visual reset: we'll run styleIconButton for consistent sizing
    padding:'0',
    fontFamily:'"Roboto Mono", monospace',
    fontWeight:'700',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
});
document.body.appendChild(mainButton);
styleIconButton(mainButton, { size: MAIN_BTN_SIZE, radius: BTN_RADIUS, bg: '#000000de', border: '1px solid #666', fontSize: '16px' });

// --------------------------
function log(msg){
    const time=new Date().toLocaleTimeString();
    console.log(`[PU ${time}] ${msg}`);
}

const delay = ms => new Promise(res=>setTimeout(res,ms));

// --------------------------
// Reload / Freeze detectors
// --------------------------

async function waitForTableReload(timeout=20000){
    const label=document.querySelector('#last-update-label');
    if(!label) return;
    const start=label.textContent;
    const startTime=Date.now();
    while(Date.now()-startTime<timeout){
        await delay(500);
        if(label.textContent!==start){
            log("Table refresh detected");
            await waitForFreeze(5);
            return;
        }
    }
    log("Reload timeout");
}

async function waitForFreeze(seconds=5,timeoutMs=20000){
    const lastLabel=document.querySelector('#last-update-label');
    if(!lastLabel){
        return new Promise(resolve=>{
            let timer=null;
            const mo=new MutationObserver(()=>{
                clearTimeout(timer);
                timer=setTimeout(()=>{
                    mo.disconnect();
                    resolve();
                },seconds*1000);
            });
            mo.observe(document.body,{subtree:true,childList:true,characterData:true});
            setTimeout(()=>{ mo.disconnect(); resolve(); },timeoutMs);
        });
    }else{
        return new Promise(resolve=>{
            let last=lastLabel.textContent.trim();
            let count=0;
            const interval=setInterval(()=>{
                const now=lastLabel.textContent.trim();
                if(now===last){
                    if(++count>=seconds){
                        clearInterval(interval);
                        resolve();
                    }
                }else{
                    last=now;
                    count=0;
                }
            },1000);
            setTimeout(()=>{ clearInterval(interval); resolve(); },timeoutMs);
        });
    }
}

// --------------------------
// Helpers
// --------------------------

function escapeCSV(val){
    val=String(val??'').trim();
    if(val.includes('"')) val=val.replace(/"/g,'""');
    if(/[",\n]/.test(val)) val=`"${val}"`;
    return val;
}

function getRoundedTimeUpHour(){
    const now=new Date();
    const rounded=new Date(now);
    if(now.getMinutes()>=30) rounded.setHours(now.getHours()+1);
    rounded.setMinutes(0,0,0);
    return `${String(rounded.getHours()).padStart(2,'0')}:00`;
}

// --------------------------
// Totals block / clicks
// --------------------------

function getTotalsBlock(){
    const batches=document.querySelectorAll('div.batch-row[id^="Batch-"]');
    for(const b of batches){
        const bn=b.querySelector('.batchNo');
        if(bn && bn.textContent.trim()==='Totals') return b;
    }
    const alt=[...document.querySelectorAll('div')].find(d=>d.textContent && /\bTotals\b/.test(d.textContent));
    if(alt) return alt.closest('div.batch-row') || alt.parentElement;
    return null;
}

function clickLabelsInsideTotals(labels){
    const totals=getTotalsBlock();
    if(!totals) return 0;
    let clicked=0;
    totals.querySelectorAll('div.batch-row-item.description-column').forEach(el=>{
        const txt=el.textContent.trim();
        if(labels.includes(txt) && getComputedStyle(el).cursor.includes('pointer')){
            el.click(); clicked++;
        }
    });
    return clicked;
}

function clickStagesOrdered_BPP_first(){
    clickLabelsInsideTotals(['BPP']);
    clickLabelsInsideTotals(['Packing']);
    clickLabelsInsideTotals(["Int'l Packing"]);
}
function clickDriveGroup(){ return clickLabelsInsideTotals(['Drive','Elmsall3','Way']); }
function clickSorters(){ return clickLabelsInsideTotals(['Sorter 1','Sorter 2','Sorter 3','Sorter 4','Sorter 5','Sorter 6']); }
function clickPicking(){ return clickLabelsInsideTotals(['Picking']); }

function clickNumericRows(){
    const totals=getTotalsBlock();
    if(!totals) return 0;
    const numericRows=[...totals.querySelectorAll('.description-column')]
    .map(el=>{
        const num=Number(el.textContent.trim());
        return (getComputedStyle(el).cursor.includes('pointer') && !isNaN(num) && num>=1 && num<=999) ? {el,num} : null;
    })
    .filter(Boolean)
    .sort((a,b)=>b.num-a.num);
    numericRows.forEach(r=>r.el.click());
    return numericRows.length;
}

// --------------------------
// Number extraction / formatting
// --------------------------

function extractNumber(txt,paren=false){
    txt=txt?.replace(/\u00A0/g,' ').trim()??'';
    const m=paren ? txt.match(/\(([\d,]+)\)/) : txt.match(/([\d,]+)/);
    return m ? m[1].replace(/,/g,'') : '';
}

function formatNumber(val){
    const n=parseInt(String(val).replace(/[^\d]/g,''),10);
    return isNaN(n)?'' : n.toLocaleString();
}

function extractBatchRows(){
    const totals=getTotalsBlock();
    if(!totals) return {data:[],progressDayValue:'',currentHour:''};
    const progressDayValue=document.querySelector('#ProgressDay')?.value.trim() || '';
    const currentHour=getRoundedTimeUpHour();
    const createdElem=totals.querySelector('.createdDate');
    let batchTime='';
    if(createdElem){
        batchTime=createdElem.innerHTML.split('<br>').map(s=>s.replace(/<[^>]*>/g,'').trim()).filter(Boolean).reverse().join(' ');
    }
    const data=[];
    let currentParent='';
    totals.querySelectorAll('.description-column').forEach(desc=>{
        const text=desc.textContent.trim();
        const clickable=getComputedStyle(desc).cursor.includes('pointer');
        if(clickable && !desc.getAttribute('style')?.includes('calc')) currentParent=text;
        const area=text;
        const totalElem=desc.parentElement.querySelector('.total-column');
        let totalVal=totalElem ? totalElem.innerText.split('\n')[0].trim() : '';
        let completedVal='';
        const isBPP=/^BPP$/i.test(currentParent);
        const isIntl=/Int'?l Packing/i.test(currentParent);
        const isPacking=/^Packing$/i.test(currentParent);
        if(isBPP || isIntl){
            completedVal=extractNumber(desc.parentElement.querySelector('.progress-complete .bar-label')?.textContent);
        }else if(isPacking){
            completedVal=extractNumber(desc.parentElement.querySelector('.parcels-packed .bar-label')?.textContent, true) || '0';
        }else{
            completedVal=extractNumber(desc.parentElement.querySelector('.progress-complete .bar-label')?.textContent);
        }
        const allocatedVal=extractNumber(desc.parentElement.querySelector('.progress-allocated .bar-label')?.textContent);
        const heldVal=extractNumber(desc.parentElement.querySelector('.progress-held .bar-label')?.textContent);
        const totalNum=parseInt(totalVal.replace(/,/g,'')) || 0;
        const compNum=parseInt(String(completedVal).replace(/,/g,'')) || 0;
        let outstandingVal='';
        if(isBPP || isIntl){
            outstandingVal=extractNumber(desc.parentElement.querySelector('.progress-outstanding .bar-label')?.textContent);
        }else{
            outstandingVal=(totalNum-compNum).toLocaleString();
        }
        data.push({
            ProgressDay:progressDayValue,
            "Batch No.":'Totals',
            "Batch Time":batchTime,
            ParentArea:currentParent,
            Area:area,
            Total:formatNumber(totalVal),
            Completed:formatNumber(completedVal),
            "% Completed":totalNum>0 ? ((compNum/totalNum)*100).toFixed(2)+'%' : '0%',
            Outstanding:outstandingVal,
            Allocated:formatNumber(allocatedVal),
            "Held/Cancelled":formatNumber(heldVal),
            CurrentHour:currentHour
        });
    });
    return {data,progressDayValue,currentHour};
}

// --------------------------
// Modal & CSV preview (black theme, sticky header fixed, borders)
// --------------------------

function showModalCSVPreview(csvRows){
    const existing = document.getElementById('toPack-csv-modal');
    if(existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'toPack-csv-modal';
    Object.assign(modal.style,{
        position:'fixed',
        top:'50%',
        left:'50%',
        transform:'translate(-50%, -50%)',
        backgroundColor:'#000000',
        color:'#ffffff',
        borderRadius:'8px',
        zIndex:'100000',
        maxHeight:'80%',
        overflow:'hidden',
        padding:'12px',
        fontFamily:'"Roboto Mono", monospace',
        minWidth:'760px',
        boxShadow:'0 8px 40px rgba(0,0,0,0.8)'
    });

    // Header
    const header = document.createElement('div');
    Object.assign(header.style,{
        display:'flex',
        justifyContent:'space-between',
        alignItems:'center',
        marginBottom:'10px',
        gap:'8px'
    });

    const title = document.createElement('div');
    title.textContent = `Preview — ${Math.max(0, csvRows.length-1)} rows`;
    Object.assign(title.style,{fontWeight:'700', fontSize:'13px', color:'#ffffff'});

    const controls = document.createElement('div');
    Object.assign(controls.style,{display:'flex', gap:'8px', alignItems:'center'});

    // buttons (icon-only)
    const refreshBtn = document.createElement('button');
    refreshBtn.innerHTML = '<span class="toPack-modal-icon toPack-refresh-icon"><i class="fa fa-refresh" aria-hidden="true"></i></span>';
    refreshBtn.title = 'Refresh';
    refreshBtn.setAttribute('aria-label','Refresh');
    styleIconButton(refreshBtn, { size: BTN_SIZE, radius: BTN_RADIUS, bg: BTN_BG, border: BTN_BORDER, fontSize: BTN_ICON_FONTSIZE });

    // copy button already using Font Awesome — keep the icon-only style
    const copyBtn = document.createElement('button');
    copyBtn.innerHTML = '<i class="fa fa-copy" aria-hidden="true"></i>';
    copyBtn.setAttribute('aria-label', 'Copy to clipboard');
    copyBtn.title = 'Copy';
    styleIconButton(copyBtn, { size: BTN_SIZE, radius: BTN_RADIUS, bg: BTN_BG, border: BTN_BORDER, fontSize: BTN_ICON_FONTSIZE });

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('aria-label','Close');
    styleIconButton(closeBtn, { size: BTN_SIZE, radius: BTN_RADIUS, bg: BTN_BG, border: BTN_BORDER, fontSize: BTN_ICON_FONTSIZE });

    const downloadBtn = document.createElement('button');
    downloadBtn.innerHTML = '<i class="fa fa-download" aria-hidden="true"></i>';
    downloadBtn.title = 'Download CSV';
    downloadBtn.setAttribute('aria-label','Download CSV');
    styleIconButton(downloadBtn, { size: BTN_SIZE, radius: BTN_RADIUS, bg: BTN_BG_ALT, border: BTN_BORDER, fontSize: BTN_ICON_FONTSIZE, alt: true });

    // subtle hover helper applied inside styleIconButton already

    // refresh behaviour: run picking clicks then re-extract and show modal
    refreshBtn.addEventListener('click', async ()=>{
        // add spinner to the icon span and disable the button while running
        const iconSpan = refreshBtn.querySelector('.toPack-refresh-icon');
        try{
            refreshBtn.disabled = true;
            if(iconSpan) iconSpan.classList.add('toPack-refresh-spin');

            log("Refresh requested — clicking picking twice then re-extracting");
            // close current modal to avoid duplicates
            const m = document.getElementById('toPack-csv-modal');
            if(m) m.remove();

            clickPicking();
            await delay(800);
            clickPicking();
            await delay(800);
            clickPicking();
            await delay(800);

            // re-extract and show updated modal
            const extracted = extractBatchRows();
            exportCSV(extracted);
        }catch(e){
            console.error(e);
        }finally{
            // remove spinner and re-enable
            if(iconSpan) iconSpan.classList.remove('toPack-refresh-spin');
            refreshBtn.disabled = false;
        }
    });

    // copy action (tab-delimited) — DO NOT close modal after copying
    copyBtn.addEventListener('click', ()=>{
        try{
            const rows = csvRows.map(r => parseCSVRowToCells(r)); // arrays
            const tableText = rows.map(cells => cells.join('\t')).join('\n');
            GM_setClipboard(tableText);
            showToastAtElement(copyBtn, 'Copied ✓', 3000);
            // keep modal open
        }catch(e){
            log("Clipboard copy failed: " + e);
            alert("Copy failed — " + e);
        }
    });

    // close: remove modal AND run depot toggle + auto refresh
    closeBtn.addEventListener('click', async ()=>{
        try{
            const m = document.getElementById('toPack-csv-modal');
            if(m) m.remove();
            // Run the restore actions now
            await toggleDepotCheckbox();
            clickAutoRefresh();
            log("toggleDepotCheckbox and clickAutoRefresh executed on close");
        }catch(e){
            console.error(e);
        }
    });

    downloadBtn.addEventListener('click', ()=> downloadCSV(csvRows));

    // assemble controls (refresh, copy, close)
    controls.appendChild(refreshBtn);
    controls.appendChild(copyBtn);
    controls.appendChild(closeBtn);

    header.appendChild(title);
    header.appendChild(controls);

    // Table container
    const tableWrap = document.createElement('div');
    Object.assign(tableWrap.style,{
        overflowY:'auto',
        maxHeight:'62vh',
        borderTop:'1px solid rgba(255,255,255,0.06)',
        paddingTop:'0px'
    });

    const table = document.createElement('table');
    table.style.borderCollapse='collapse';
    table.style.width='100%';
    table.style.tableLayout='fixed';
    table.style.fontSize='12px';
    table.style.color='#ffffff';

    const cellBorder = '1px solid rgba(255,255,255,0.08)';
    const headerBg = '#0b0b0b';

    // Build rows
    csvRows.forEach((row, idx)=>{
        const tr = document.createElement('tr');
        const cells = parseCSVRowToCells(row);
        cells.forEach((cell)=>{
            const tag = idx===0 ? 'th' : 'td';
            const cellEl = document.createElement(tag);
            cellEl.textContent = cell;
            Object.assign(cellEl.style,{
                border: cellBorder,
                padding:'6px 8px',
                textAlign:'left',
                overflow:'hidden',
                whiteSpace:'nowrap',
                textOverflow:'ellipsis',
                color:'#ffffff',
                boxSizing:'border-box'
            });
            if(idx===0){
                Object.assign(cellEl.style,{
                    position:'sticky',
                    top:'0',
                    zIndex:'5',
                    background: headerBg
                });
            }
            tr.appendChild(cellEl);
        });
        table.appendChild(tr);
    });

    tableWrap.appendChild(table);

    // Footer (download)
    const footer = document.createElement('div');
    Object.assign(footer.style,{
        marginTop:'8px',
        display:'flex',
        justifyContent:'flex-end',
        gap:'8px'
    });

    footer.appendChild(downloadBtn);

    modal.appendChild(header);
    modal.appendChild(tableWrap);
    modal.appendChild(footer);

    document.body.appendChild(modal);
    copyBtn.focus();
}

// --------------------------
// Toast (positioned to the right of an element)
// --------------------------

function showToastAtElement(el, message, duration=3000){
    const rect = el.getBoundingClientRect();
    const toast = document.createElement('div');
    toast.textContent = message;
    Object.assign(toast.style,{
        position: 'fixed',
        left: `${Math.min(window.innerWidth - 20, Math.max(8, Math.round(rect.right + 10)))}px`,
        top: `${Math.max(8, Math.round(rect.top))}px`,
        background: '#000',
        color: '#fff',
        padding: '6px 10px',
        borderRadius: '4px',
        border: '1px solid rgba(255,255,255,0.08)',
        zIndex: 200000,
        fontFamily: '"Roboto Mono", monospace',
        fontSize: '12px',
        boxShadow: '0 6px 18px rgba(0,0,0,0.6)',
        opacity: '0',
        transition: 'opacity 160ms ease'
    });
    document.body.appendChild(toast);
    requestAnimationFrame(()=> toast.style.opacity='1');
    setTimeout(()=>{
        toast.style.opacity='0';
        setTimeout(()=> toast.remove(), 220);
    }, duration);
}

// --------------------------
// CSV parsing helper (handles quoted fields)
// --------------------------

function parseCSVRowToCells(row){
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for(let i=0;i<row.length;i++){
        const ch = row[i];
        if(ch === '"'){
            if(inQuotes && row[i+1] === '"'){
                cur += '"';
                i++;
            }else{
                inQuotes = !inQuotes;
            }
            continue;
        }
        if(ch === ',' && !inQuotes){
            cells.push(cur);
            cur = '';
            continue;
        }
        cur += ch;
    }
    cells.push(cur);
    return cells;
}

// --------------------------
// Download CSV
// --------------------------

function downloadCSV(csvRows){
    const csv = csvRows.join('\n');
    const blob=new Blob([csv],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const now = new Date();
    const pd = now.toISOString().slice(0,10);
    const hour = getRoundedTimeUpHour().replace(':','-');
    a.download = `Progress_ToPack_${pd}_${hour}.csv`;
    a.href=url;
    a.style.display='none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    log("CSV downloaded via modal");
}

// --------------------------
// CSV Export (filters & build rows)
// --------------------------

function exportCSV({data,progressDayValue,currentHour}){
    const headers=[
        'Packing Station',
        'Total',
        'Outstanding',
        'Complete',
        '',
        '',
        '',
        '',
        currentHour
    ];
    const csvRows=[headers.join(',')];
    let includedCount = 0;
    let skippedCount = 0;

    data.forEach(r=>{
        const rawArea = String(r.Area ?? '').trim();
        if(!rawArea) { skippedCount++; return; }

        // Exception: Sorter6 — keep always and output as C999 in column A
        const isSorter6 = /sorter\s*6/i.test(rawArea);
        if(isSorter6){
            const areaOut = 'C999';
            csvRows.push([
                escapeCSV(areaOut),
                escapeCSV(r.Total),
                escapeCSV(r.Outstanding),
                escapeCSV(r.Completed),
                '',
                '',
                '',
                '',
                escapeCSV(r.CurrentHour)
            ].join(','));
            includedCount++;
            return;
        }

        // ---- RULE 1: Must start with digit OR A/B ----
        if(!/^[0-9ABab]/.test(rawArea)){ skippedCount++; return; }

        // ---- Normalization: convert leading A/B to numbers for validation ----
        let normalized = rawArea.replace(/^[Aa]/, '10').replace(/^[Bb]/, '11');

        // Remove any non-digit characters (we only want the numeric check)
        const numericOnly = normalized.replace(/[^\d]/g, '');

        // If nothing left or not a valid number -> skip row
        if(!numericOnly || isNaN(Number(numericOnly))){ skippedCount++; return; }

        const numericVal = Number(numericOnly);

        // ---- RULE 3: Remove rows where Column A is less than 1000 ----
        if(numericVal < 1000){ skippedCount++; return; }

        // ---- RULE 4: If numeric > 10000 and begins with 10... or 11..., substitute 10->A and 11->B for the CSV Area value ----
        let areaOut = rawArea; // default CSV Area value
        if(numericVal > 10000 && (numericOnly.startsWith('10') || numericOnly.startsWith('11'))){
            if(numericOnly.startsWith('10')) areaOut = 'A' + numericOnly.slice(2);
            else if(numericOnly.startsWith('11')) areaOut = 'B' + numericOnly.slice(2);
        }

        // Include the validated row
        csvRows.push([
            escapeCSV(areaOut),
            escapeCSV(r.Total),
            escapeCSV(r.Outstanding),
            escapeCSV(r.Completed),
            '',
            '',
            '',
            '',
            escapeCSV(r.CurrentHour)
        ].join(','));

        includedCount++;
    });

    log(`CSV build complete — included: ${includedCount}, skipped: ${skippedCount}`);
    showModalCSVPreview(csvRows);
}

// --------------------------
// Depot toggle / auto refresh
// --------------------------

async function toggleDepotCheckbox(){
    const cb=document.querySelector('#DepotsView');
    if(!cb) return;
    cb.click(); await delay(1200);
    cb.click(); await delay(1200);
}
function clickAutoRefresh(){ const cb=document.querySelector('#AutoRefresh'); if(cb) cb.click(); }

// --------------------------
// MAIN
// --------------------------

mainButton.addEventListener('click',async()=>{
    if(isRunning){ log("Script already running"); return; }
    isRunning=true;
    // show spinner icon on the main button
    mainButton.innerHTML = '<i class="fa fa-spinner toPack-refresh-spin" aria-hidden="true"></i>';
    mainButton.disabled=true;
    mainButton.style.backgroundColor='#333';
    try{
        log("Clicking BPP → Packing → Int'l Packing");
        clickStagesOrdered_BPP_first();
        await waitForTableReload();

        log("Clicking Drive");
        clickPicking(); await delay(300); clickPicking();
        await waitForFreeze(8);
        clickDriveGroup();
        await waitForTableReload();

        log("Clicking Sorters");
        clickPicking(); await delay(300); clickPicking();
        await waitForFreeze(8);
        clickSorters();
        await waitForTableReload();

        log("Click numeric");
        clickPicking(); await delay(300); clickPicking();
        await waitForFreeze(8);
        clickNumericRows();
        await waitForFreeze(8);
        clickPicking(); await delay(300); clickPicking();
        await delay(600); clickPicking(); await delay(300); clickPicking();
        await waitForFreeze(8);

        log("Extracting rows");
        const extracted = extractBatchRows();

        log("Exporting CSV (showing modal preview)");
        exportCSV(extracted);

        // DO NOT run toggleDepotCheckbox() or clickAutoRefresh() here.
        // They will run only when the user clicks the modal Close button.

        log("Done");
    }catch(err){ console.error(err); }
    finally{
        isRunning=false;
        // show check icon briefly
        mainButton.innerHTML = '<i class="fa fa-check" aria-hidden="true"></i>';
        mainButton.style.backgroundColor='#888';
        mainButton.disabled=true;
        setTimeout(()=>{
            // revert to archive icon
            mainButton.innerHTML = '<i class="fa fa-archive" aria-hidden="true"></i>';
            mainButton.style.backgroundColor='#000000de';
            mainButton.disabled=false;
        },3000);
    }
});

log("Progress Update_ToPack v5.6 (icons, uniform) loaded");

})();