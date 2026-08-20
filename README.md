# Tampermonkey Scripts

Userscripts that add reporting, export and automation features to the Next warehouse
systems used on site at Elmsall — the WHDS dashboards, the Batch Progress Overview,
Bonus Hub, the legacy ASP screens and a handful of other internal tools.

All scripts are internal: every `@match` points at an on-site host, so they only do
anything while you are on the warehouse network.

## Contents

- [Installing](#installing)
- [Naming convention](#naming-convention)
- [Batch Progress Overview](#batch-progress-overview)
- [WHDS Dashboard Web](#whds-dashboard-web-pon-wpws27)
- [Bonus Hub (PSD)](#bonus-hub-psd)
- [Legacy ASP screens](#legacy-asp-screens)
- [Other systems](#other-systems)
- [Google Sheets integration](#google-sheets-integration)

## Installing

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.
2. Open the raw file for the script you want from this repo and Tampermonkey will
   offer to install it, or create a new script and paste the file contents in.
3. Save, make sure the script is enabled, then open the matching page.

Every script carries `@updateURL` / `@downloadURL` pointing back at `main` in this
repo, so once installed Tampermonkey pulls updates automatically — push a change here
and it reaches everyone on their next update check.

## Naming convention

The prefix in each filename marks who wrote it:

| Prefix | Author |
| --- | --- |
| `[PAK]` | Pak |
| `[MCK]` | Mateusz Mucek |
| `[MCK & PAK]` | Both |

## Batch Progress Overview

These all target the Batch Progress Overview page and match **both** layouts — the
legacy `whds-batchoverviewprogress:8087` host and the Modern `pon-wdws21:8087` one —
detecting which is in use from the DOM.

| Script | Ver | What it does |
| --- | --- | --- |
| [PO Total Complete Widget](%5BPAK%5D%20PO%20Total%20Complete%20Widget.user.js) | 10.7 | Draggable Day-Before-Yesterday / Yesterday / Today widget with logging, tooltips, download, today-lock, per-tab auto-refresh, stage click sequence and a Google Sheet push. Blocking overlay while the DBY→Y→T sequence runs. |
| [PO Progress Float Panel](%5BPAK%5D%20PO%20Progress%20Float%20Panel.user.js) | 7.4 | Floating panel that runs the Inducting→Picking→Way→Drive sequence behind a full-screen overlay with a spinner. Only auto-clicks new batches that have both Picking and Inducting. |
| [ToPack](%5BPAK%5D%20ToPack.user.js) | 5.8 | Extracts the ToPack figures with the Sorter6 exception (kept and converted to C999). Dark modal preview, refresh that re-runs picking and extraction, tab-delimited clipboard copy and toast. |
| [Progress Update_ALL](%5BPAK%5D%20Progress%20Update_ALL.user.js) | 1.18 | Auto-clicks batch stages, Drive groups, Sorters and numeric rows 1–999, then exports batch details as CSV. Dark overlay with copy / download / close / refresh kept in sync (table + TSV + CSV). |
| [WHDS Full Screen Dashboard](%5BPAK%5D%20WHDS%20Full%20Screen%20Dashboard.user.js) | 3.8 | Full-screen dashboard view with a combined card view for the bars and colour dots on the stacked bar legends. |
| [WHDS Enhancements](%5BPAK%5D%20WHDS%20Enhancements.user.js) | 2.1 | Scroll-to-top/bottom buttons on Progress Overview, plus auto End Time = Start + 1 hour on the Returns page (23:00 rolls to +59 mins). Also matches `whds-intranetweb:8089/reports/Returns`. |

## WHDS Dashboard Web (`pon-wpws27`)

| Script | Ver | Page | What it does |
| --- | --- | --- | --- |
| [E3 Dropzone](%5BMCK%20%26%20PAK%5D%20E3%20Dropzone.user.js) | 4.9 | `/e3/dropzone` | Top-centre bar flush to the top with ALL / Y / T copy and a centred toast. Auto run and refresh on aligned 30-minute boundaries, Google Sheet push, midnight refresh and a download log. |
| [E3 Combined Progress Export](%5BPAK%5D%20E3%20Combined%20Progress%20Export.user.js) | 4.2 | `/e3/picking`, `/e3/packing` | Exports E3 Induct (picking) and Depot Progress (packing) into a single CSV, with a black modal preview, refresh, clipboard copy and toast. |
| [Orders Batch Report / Volume Predictor](%5BMCK%20%26%20PAK%5D%20Orders%20Batch%20Report%20-%20Volume%20Predictor.user.js) | 9.0 | `/reports/OrdersBatchReport*` | Volume Predictor plus Collation (Courier / NDTS / INT). Copies collation as formulas (`=Orig-Evri-Sale`), switches to the Saturday formula when the datepicker is on a Saturday, and shows Monday Courier and Sat Cou columns on Saturdays only (with reduced column min-width so the grid does not spill). Includes an A&R column. |
| [OrdersBatchReport – International Widget](%5BPAK%5D%20OrdersBatchReport%20-%20International%20Widget.user.js) | 2.6 | `/reports/OrdersBatchReport*` | Floating INTERNATIONAL widget with filtered carriers and smart copy. |
| [Orders Batch Report AutoSelect (Persistent)](%5BPAK%5D%20Orders%20Batch%20Report%20AutoSelect%20%28Persistent%29.user.js) | 5.0 | `/reports/OrdersBatchReport` | Constantly re-enforces the hub and "M - Elmsall - M" selection. Angular-safe and re-render proof. |
| [Intake Productivity – Elmsall 3 Completed Row](%5BPAK%5D%20Intake%20Productivity%20-%20Elmsall%203%20Completed%20Row.user.js) | 2.5 | `/intake/productivity*` | Finds the Elmsall 3 table and collects the Completed rows for last-Saturday-to-last-Saturday by driving the datepicker, then shows them as an overlay below the navbar. |

## Bonus Hub (PSD)

Three scripts share `pon-wpws27/Whds.Dashboard.Web/bonushub/reports` and are designed
to work together: Auto Selector sets the filters, Report Runner runs and exports, and
Enhancements handles copying out of the rendered table.

| Script | Ver | What it does |
| --- | --- | --- |
| [PSD – Bonus Hub Report Runner](%5BPAK%5D%20PSD%20-%20Bonus%20Hub%20Report%20Runner.user.js) | 11.0 | Opens each saved report, runs it, saves rows to localStorage, copies TSV and downloads CSV (Combined / Individual / Both). Can post each report's TSV to its own Google Sheet. Includes the unified Auto-RUN Manager with Rolling Mode, Delay and Rolling Backfill Mode. The largest script in the repo. |
| [PSD – BonusHub Auto Selector](%5BPAK%5D%20PSD%20-%20BonusHub%20Auto%20Selector.user.js) | 5.6 | Auto-selects the warehouse and saved date range, visually opening the dropdown and scraping the live list off the screen. |
| [PSD – Bonus Hub Enhancements](%5BPAK%5D%20PSD%20-%20Bonus%20Hub%20Enhancements.user.js) | 2.5 | Copy Full Table with toggles for header (H), footer (F) and apostrophe-prefixing the first column, saved to localStorage. Per-cell copy icons on active tabs (first column skipped, checkmark on copy) and fixed scroll-to-top/bottom buttons. |

## Legacy ASP screens

Older `ws-whs` pages written for Internet Explorer. The Chrome Fix scripts render the
legacy `<PARAM R*>` DataGrid markup that Chrome ignores and replace VBScript-driven
behaviour with working equivalents.

| Script | Ver | Target | What it does |
| --- | --- | --- | --- |
| [Chrome Fix (Batch Viwer)](%5BMCK%5D%20Chrome%20Fix%20%28Batch%20Viwer%29.user.js) | 7.3 | `ws-whs` Batch Header / Data / PickWalk3, Locating, Bonus Report | Replaces the VBScript Refresh, renders the legacy DataGrid, fixes the PickWalk (P) links and shows the Updated time next to Refresh. |
| [Chrome Fix (TPA)](%5BMCK%5D%20Chrome%20Fix%20%28TPA%29.user.js) | 1.4 | `ws-whs/putaway/forward/locating/*` | Keeps the original teal TPA Locating look in Chrome by rendering `<PARAM R*>` into a classic table. Run Report loads into RepData, quantities are click-to-copy without commas, and the internal scrollbar is removed so the full list shows. |
| [BatchPickWalk Auto Extract + Cycle](%5BPAK%5D%20BatchPickWalk%20Auto%20Extract%20%2B%20Cycle.user.js) | 3.2 | `ws-whs` BatchPickWalk3 | Extracts R rows, posts them to a Google Script, builds a UI and auto-cycles between two URLs every minute. |
| [Pigeonholes Automation](%5BPAK%5D%20Pigeonholes%20Automation.user.js) | 20.3 | Deployment Board Sorter (`ws-whs` and `whds-deployment-board:8084`) | Extracts deployment board data, sorts by Station, posts every page and exports a combined CSV. Auto-runs hourly from 10:00 to 05:00 and includes StationSub. UI matches the E3 Dropzone look. |

## Other systems

| Script | Ver | Target | What it does |
| --- | --- | --- | --- |
| [Stats Detail – Automation Utilisation](%5BMCK%20%26%20PAK%5D%20Stats%20Detail%20-%20Automation%20Utilisation.user.js) | 2.30 | `pon-wpas46-cl01` RSPS2 | Fit-to-width bottom bar with no scrollbars, auto-refreshing every 5 minutes with refresh info on the right. IN PROGRESS row comes from the newest changed row; column order is fixed with missing values shown dimmed as 0. Minimise state is remembered per tab, and clicking a Total Value cell copies it with a yellow flash. |
| [StatsDetail → GoogleSheet Poster](%5BPAK%5D%20StatsDetail%20%E2%86%92%20GoogleSheet%20Poster.user.js) | 1.5 | `pon-wpas46-cl01` RSPS2 | Posts every active row on the stats bar to a Google Apps Script web app once a minute, skipping rows marked IN PROGRESS. Event name in column A, stamp time in B, hour in C, log time in AC. |
| [WHDS Returns Confirmed](%5BPAK%5D%20WHDS%20Returns%20Confirmed.user.js) | 11.6 | `whds-intranetweb:8089/reports/Returns*` | Keeps End Time in step whenever Start changes, stripping the readonly attribute off the End input and keeping it off via an observer and poller. Writes END straight to the input with no picker fallback, and keeps the autos, hourly/daily jobs and Copy UI. |
| [WHDS Induct](%5BPAK%5D%20WHDS%20Induct.user.js) | 2.7 | `whds-warehousereports-web:8101` | Induct station reporting across the fixed IS station list, with Refresh, Copy to Clipboard, Send to Logger now and Auto Run on the hour. Posts to a Google Sheet logger, retries while no data has landed and rolls the date parameter to today after 01:00. |
| [RTF Monitor – Widget + 15min Auto Search + Logging](%5BPAK%5D%20RTF%20Monitor%20%E2%80%93%20Widget%20%2B%2015min%20Auto%20Search%20%2B%20Logging.user.js) | 2.5 | `pon-wpws22:8091` RTFMonitor | Widget that runs an auto search on aligned 15-minute boundaries with profile rules, logging and CSV export. |
| [Export ReGen CSV](%5BPAK%5D%20Export%20ReGen%20CSV.user.js) | 4.0 | `whds-directory-web-v1:8091/ReGen.aspx` | Exports a merged CSV from E1, E2, E3 and S6 with a black modal preview, refresh, copy, download and a time column rounded from `#clock`. |
| [Export Cranes in Fault](%5BPAK%5D%20Export%20Cranes%20in%20Fault.user.js) | 2.2 | `pon-wpas48` miniload-overview | Exports the visible table as CSV via on-screen refresh, copy and download buttons. Copy uses TSV so it pastes as a table. Includes toast and auto-refresh. |
| [StationSetUp Copy Button](%5BPAK%5D%20StationSetUp%20Copy%20Button.user.js) | 2.3 | `ibm-red` Packing / Store StationSetUp | Copies the first 5 or 8 columns as TSV, excluding the header. |

## Google Sheets integration

Several scripts push their output to Google Apps Script web apps so the data lands in
a sheet without anyone copying it by hand. Those scripts request `GM_xmlhttpRequest`
and declare `@connect script.google.com` (and `script.googleusercontent.com` where the
web app redirects):

- E3 Dropzone
- PO Total Complete Widget
- Pigeonholes Automation
- BatchPickWalk Auto Extract + Cycle
- RTF Monitor
- StatsDetail → GoogleSheet Poster
- WHDS Induct
- PSD – Bonus Hub Report Runner (one sheet per report, optional)

The web app URLs are hardcoded in each script. If a sheet or its Apps Script
deployment is replaced, the matching URL constant needs updating and pushing here so
everyone picks it up on the next Tampermonkey update check.
