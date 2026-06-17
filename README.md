# Tampermonkey Scripts

Collection of Tampermonkey user scripts for OSR Deployment Dashboard.

## Scripts

### Bonus Hub Enhancements
**File:** `bonus-hub-enhancements.user.js`

**Description:** 
Enhances the Bonus Hub reports interface with powerful productivity features:

- **Copy Full Table** - Copy entire table data to clipboard with customizable options
  - Toggle header inclusion (H)
  - Toggle footer inclusion (F)
  - Toggle apostrophe prefix for first column (')
  - User preferences saved in localStorage
  
- **Cell Copy Icons** - Quick copy icons on each table cell for instant single-cell copying
  - Appears only on active tabs
  - Skips first column
  - Visual feedback (checkmark on copy)
  
- **Scroll Buttons** - Fixed position scroll buttons for easy navigation
  - Scroll to top (↑)
  - Scroll to bottom (↓)
  - Only visible when scrollable content exists

**Version:** 2.5  
**Author:** Pak  
**Target:** `https://pon-wpws27/Whds.Dashboard.Web/bonushub/reports*`

**Installation:**
1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Create a new script and paste the contents of `bonus-hub-enhancements.user.js`
3. Save and enable the script
4. Visit the Bonus Hub reports page to see the enhancements in action

**Features:**
- Full table copy with optional headers/footers
- Individual cell copy with icons
- Fixed scroll buttons for quick navigation
- Configurable via toggle buttons
- Persistent user preferences using localStorage
