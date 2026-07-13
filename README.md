# Ma Maison Review Management Dashboard

A comprehensive, browser-based review management system for Ma Maison restaurant outlets. Manage customer reviews, track responses, categorize concerns, and monitor action items—all without uploading data to external servers.

## Features

### 📊 Review Management
- **Import & Process**: Upload review data from JSON (Google Reviews, Google Business Profile) or CSV/TSV files
- **Automatic Language Detection**: Detects and displays reviews in Japanese, Chinese, Korean, Thai, and English
- **Translation Ready**: Supports original language alongside English translations
- **Data Validation**: Automatic detection of duplicates and missing required fields

### 🎯 Concern Tracking
- **Smart Flagging**: Automatically identifies concern reviews based on:
  - Low ratings (≤2 stars)
  - High/Critical severity issues
  - Manual flags
- **Status Workflow**: Track action items through Not Started → In Progress → Pending Verification → Completed/Closed
- **Timeline Management**: Set recommended action dates and track overdue items

### 📈 Analytics & Reporting
- **Monthly Trends**: Visualize rating trends and review volume over time
- **Outlet Performance**: Compare concern rates and ratings across outlets
- **Category Breakdown**: Analyze complaint categories to identify patterns
- **Action Status Dashboard**: Monitor completion rates across all concerns

### 💬 Response Management
- **Draft Replies**: Compose management replies before publishing
- **Reply Status Tracking**: Monitor published, draft, and unanswered reviews
- **Bulk Updates**: Edit multiple reviews at once

### 🔒 Privacy First
- **100% Local Processing**: All data stays in your browser
- **No Server Upload**: Reviews are never transmitted externally
- **Export Anytime**: Download all data or error reports as CSV

## Quick Start

1. **Open the Dashboard**: Load the HTML file in your browser
2. **Import Data**: 
   - Click "+ Add Data" or drag & drop a JSON/CSV file
   - Review the auto-mapped field columns
   - Confirm import (invalid rows are reported)
3. **Explore**: Switch between Overview, Concern Reviews, and All Reviews tabs
4. **Edit & Track**: Update status, assign responsibilities, draft replies
5. **Export**: Download updated data with all edits preserved

## Data Format

### Required Columns
- **Outlet** - Restaurant location/branch name
- **Reviewer** - Customer name or "Anonymous"
- **Review Date** - Date of review (auto-detected format)
- **Rating** - Star rating (1–5, or platform-specific format)
- **Original Review** - Full review text

### Optional Columns
- **Original Language** - Language code or auto-detected
- **English Translation** - Translated review text
- **Existing Management Reply** - Published response
- **Concern Review** - Flag (yes/no) to override auto-detection
- **Category** - Services, Food Standard, Food Quality, Cleanliness, Price, Others
- **Severity** - Low, Low-Medium, Medium, High, Critical
- **Root Cause** - Possible root cause analysis
- **Responsible** - Department or person assigned
- **Sales Recovery** - Action taken (Refund, Replacement, etc.)
- **Action Plan** - Steps to prevent recurrence
- **Status** - Not Started, In Progress, Pending Verification, Completed, Requires Confirmation, Closed
- **Management Notes** - Internal remarks

### Supported Import Formats
- **Google Reviews JSON** - Direct export from Google Business Profile
- **CSV/TSV** - Spreadsheet-compatible format
- **Custom JSON** - Array of review objects with flexible field names

## Color Scheme

- **Ivory** (#FBF8F1) - Primary background
- **Gold** (#B08D57) - Primary accent, interactions
- **Charcoal** (#2E2A25) - Text and emphasis
- **Green** (#4F7A5B) - Good/positive status
- **Amber** (#C98A2B) - Warning/attention
- **Red** (#B4483C) - Danger/critical

## Browser Support

- Chrome, Safari, Firefox, Edge (latest versions)
- Requires ES6 support
- Recommended: 1920×1080 or larger display

## Local Storage

- Reviews and edits are stored in browser localStorage
- Key: `ma_maison_reviews_v1`
- Persistent across sessions until manually cleared

## Dependencies

All libraries loaded via CDN:
- **React 18.2** - UI framework
- **TailwindCSS 3** - Styling
- **Chart.js 4.4** - Data visualization
- **PapaParse 5.4** - CSV parsing
- **Babel Standalone** - JSX transpilation

## Tips & Tricks

1. **Bulk Edit**: Select multiple concerns in the Concern Reviews tab to update status/responsible across all at once
2. **Filter & Export**: Apply filters, then export to share a subset of data
3. **Search**: Use the search box to find reviews by reviewer name, text, or notes
4. **Sort Options**: Sort by date, outlet, rating, severity, or action status
5. **Error Reports**: Failed imports? Export the error report and review the missing/invalid rows

## Troubleshooting

**Import fails with "format could not be read"**
- Ensure JSON files are valid or CSV has standard delimiters (comma, tab)
- Check that required columns are present

**Data disappears after refresh**
- Browser localStorage may have been cleared
- Check browser storage settings and try importing again

**Charts won't load**
- Ensure Chart.js CDN is accessible
- Try refreshing the page or checking browser console for errors

---

Built for **Ma Maison** restaurant management. All feedback welcome.
