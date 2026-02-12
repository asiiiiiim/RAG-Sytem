# Web Crawler System - Complete Explanation

## What We Built

A **generic web crawler** that can work with **any web application**. It automates:
1. **Logging in** to a website
2. **Navigating** to pages
3. **Filling forms** with configured values
4. **Taking screenshots** at different stages
5. **Storing data** in MongoDB for later processing

---

## Project Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                               │
├─────────────────────────────────────────────────────────────────────┤
│  CLI (cli.js)           │  Programmatic API (crawler.js)            │
│  npm run crawl --url    │  const crawler = new Crawler()            │
└────────────┬────────────┴────────────────────┬──────────────────────┘
             │                                  │
             ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         CORE MODULES                                 │
├──────────────┬──────────────┬──────────────┬───────────────────────┤
│  config.js   │  browser.js  │  auth.js     │  forms.js             │
│  Loads .env  │  Playwright  │  Login       │  Fill fields          │
│  settings    │  browser     │  detection   │  Submit forms         │
├──────────────┼──────────────┼──────────────┼───────────────────────┤
│ screenshots  │  database.js │  utils.js    │  tiler.js             │
│  Capture     │  MongoDB     │  Helpers     │  Image tiles          │
│  pages       │  GridFS      │  Logging     │  for vision           │
└──────────────┴──────────────┴──────────────┴───────────────────────┘
             │                                  │
             ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                               │
├─────────────────────────────────────────────────────────────────────┤
│  MongoDB (stores data)  │  Target Website  │  Browser (Playwright) │
└─────────────────────────┴──────────────────┴───────────────────────┘
```

---

## Core Modules Explained

### 1. `config.js` - Configuration Manager
**What it does:** Reads all settings from `.env` file and provides them to other modules.

```javascript
// Example usage in other modules:
const { getConfig } = require('./config');
const config = getConfig();
console.log(config.baseUrl);  // "https://your-app.com"
```

**Why it matters:** Centralizes all configuration so you only need to change `.env` to adapt to different websites.

---

### 2. `browser.js` - Browser Lifecycle
**What it does:** Manages Playwright browser (launch, create pages, close).

**Functions:**
- `launchBrowser()` - Starts Chrome/Brave browser
- `createContext()` - Creates browser session with cookies
- `createPage()` - Opens a new tab
- `closeBrowser()` - Cleanly shuts down

```javascript
const { launchBrowser, createPage } = require('./browser');
const { browser } = await launchBrowser({ headless: false });
const { page } = await createPage(browser);
```

---

### 3. `auth.js` - Authentication Handler
**What it does:** Detects login pages and automatically logs in.

**Functions:**
- `isLoginPage(page)` - Checks if current page is a login form
- `performLogin(page, config)` - Fills username/password and submits
- `ensureAuthenticated(page, config)` - Navigates to base URL, logs in if needed

**How login detection works:**
1. Checks URL for patterns like `/login`, `/signin`, `/auth`
2. Looks for password input fields
3. Checks for common login CSS classes (`.loginform`, `.login-body`)

---

### 4. `forms.js` - Form Handler
**What it does:** Fills form fields based on `form-fields.json` configuration.

**Functions:**
- `loadFormConfig()` - Reads form-fields.json
- `findFormConfigForUrl(url)` - Matches URL to form config
- `fillForm(page, config)` - Fills all fields
- `submitForm(page, config)` - Clicks submit button

**Example form-fields.json:**
```json
{
  "pages": {
    "statement_of_account": {
      "urlPattern": "statement_of_account_performance.php",
      "fields": [
        {
          "label": "Customer ID",
          "selector": "input[name='customerId']",
          "value": "10",
          "type": "text"
        },
        {
          "label": "Date From",
          "selector": "input[name='date_from']",
          "value": "01-01-2024",
          "type": "date"
        }
      ],
      "submitSelector": "input[type='submit']",
      "waitAfterSubmit": 3000
    }
  }
}
```

---

### 5. `screenshots.js` - Screenshot Capture
**What it does:** Takes screenshots of pages.

**Modes:**
- `full` - Single screenshot of entire page (scrolled)
- `batches` - Multiple viewport-sized screenshots while scrolling
- `hybrid` - Both full + batches (for tall pages)

**Functions:**
- `capture(page)` - Takes screenshot based on mode
- `captureWithLabel(page, "before")` - Labels for workflow stages
- `filterValidScreenshots()` - Removes images <28px (required for vision models)

---

### 6. `database.js` - MongoDB & GridFS
**What it does:** Stores page data and screenshots.

**Collections:**
- `web_pages` - Page metadata, screenshot references, form fill results
- `web_failures` - Failed crawl attempts with error details
- `web_screens.files/chunks` - GridFS storage for screenshot binaries

**Functions:**
- `connect()` - Connect to MongoDB
- `uploadScreenshots()` - Store images in GridFS
- `saveWebPage()` - Save page document
- `webPageExists()` - Check if already crawled

---

### 7. `utils.js` - Utilities
**What it does:** Shared helper functions.

- `routeKeyFromUrl(url)` - Converts URL to unique key: `domain/path`
- `sanitizeFilename(str)` - Makes strings safe for filenames
- `loadJson(path)` - Reads JSON files
- `sleep(ms)` - Async delay
- `logger` - Structured logging

---

### 8. `tiler.js` - Image Tiling
**What it does:** Calculates tile positions for batch screenshots.

Used for vision models that have input size limits (like qwen2.5vl).

---

## Entry Points

### `cli.js` - Command Line Interface
Run crawler from terminal:

```bash
# Single URL
node src/web/cli.js --url https://example.com/page.php

# All routes from routes.json
node src/web/cli.js --all

# Pattern matching
node src/web/cli.js --pattern "statement|report"

# With options
node src/web/cli.js --all --limit 10 --skip-existing --headless
```

### `crawler.js` - Programmatic API
Use in your own scripts:

```javascript
const { Crawler } = require('./src/web/crawler');

const crawler = new Crawler({ headless: true });
await crawler.init();
await crawler.start();

const result = await crawler.processUrl('https://example.com/page.php');
console.log(result);  // { success: true, routeKey: '...', screenshots: 3 }

await crawler.stop();
```

---

## Environment Variables Explained (.env.example)

### Database Settings

```bash
MONGODB_URI=mongodb://127.0.0.1:27017
```
**What:** Connection string to MongoDB server
**Format:** `mongodb://host:port` or `mongodb+srv://...` for Atlas

```bash
DB_NAME=rag_tree
```
**What:** Database name in MongoDB
**Contains:** All collections (web_pages, web_failures, etc.)

```bash
GRIDFS_BUCKET=web_screens
```
**What:** Name of GridFS bucket for screenshot storage
**Creates:** Collections `web_screens.files` and `web_screens.chunks`

---

### Target Website Settings

```bash
WEB_BASE_URL=https://your-webapp.example.com/home.php
```
**What:** The "home" page after login - crawler starts here
**Used for:** Initial navigation, session validation

```bash
WEB_ALLOWED_HOST=your-webapp.example.com
```
**What:** Restricts crawling to this domain only
**Prevents:** Following external links

```bash
WEB_ALLOWED_PATH_PREFIX=/
```
**What:** Only crawl URLs starting with this path
**Example:** `/brokers` would only crawl `/brokers/*` pages

---

### Authentication Settings

```bash
WEB_LOGIN_URL=https://your-webapp.example.com/login.php
```
**What:** URL of the login page
**Used when:** Crawler detects session expired

```bash
WEB_USERNAME=your_username
WEB_PASSWORD=your_password
```
**What:** Login credentials for the webapp
**Security:** These are in .env which is git-ignored

```bash
WEB_LOGGEDIN_URL_HINT=/home.php
```
**What:** URL pattern that indicates successful login
**Used for:** Verifying login worked

```bash
WEB_USER_SELECTOR=input[name="userName"]
WEB_PASS_SELECTOR=input[name="password"]
WEB_SUBMIT_SELECTOR=button[type="submit"]
```
**What:** CSS selectors for login form elements
**Customize per webapp:** Different sites have different form structures

---

### Browser Settings

```bash
HEADLESS=false
```
**What:** Run browser visibly (`false`) or hidden (`true`)
**Development:** Use `false` to see what's happening
**Production:** Use `true` for server/background execution

```bash
BROWSER_EXECUTABLE=/usr/bin/brave-browser
```
**What:** Path to custom browser (optional)
**Default:** Uses Playwright's bundled Chromium
**Options:** `/usr/bin/google-chrome`, `/usr/bin/chromium`

```bash
VIEWPORT_WIDTH=1280
VIEWPORT_HEIGHT=720
```
**What:** Browser window size
**Affects:** Screenshot dimensions, responsive layouts

---

### Session Storage

```bash
WEB_STORAGE_STATE=./storageState.web.json
```
**What:** File to save/load browser session (cookies, localStorage)
**Benefit:** Avoids logging in every run
**Contents:** Encrypted cookies and session data

---

### Crawling Behavior

```bash
WEB_CONCURRENCY=1
```
**What:** Number of pages to process simultaneously
**Recommendation:** Keep at 1 to avoid rate limiting

```bash
WEB_DELAY_MS=800
```
**What:** Pause between page requests (milliseconds)
**Purpose:** Prevents overwhelming the server

```bash
WEB_MAX_PAGES=500
```
**What:** Maximum pages to crawl in one session
**Safety:** Prevents infinite crawling

```bash
NAVIGATION_TIMEOUT=45000
```
**What:** How long to wait for page load (milliseconds)
**45000 = 45 seconds**

```bash
DISCOVERY_DROP_QUERY=true
```
**What:** Remove query parameters from URLs
**Example:** `/page.php?id=123` → `/page.php`
**Prevents:** Crawling same page with different parameters

```bash
DISCOVERY_CHECKPOINT_EVERY=25
```
**What:** Save routes.json every N pages discovered
**Purpose:** Recovery if crawler crashes

---

### Screenshot Settings

```bash
SCREENSHOT_MODE=full
```
**What:** How to capture screenshots
**Options:**
- `full` - Single full-page screenshot
- `batches` - Multiple viewport-sized tiles
- `hybrid` - Both full + tiles

```bash
TILE_OVERLAP=0.2
```
**What:** Overlap between batch tiles (20%)
**Purpose:** Ensures no content is cut at tile boundaries

---

### Vision Model (for future extraction)

```bash
OLLAMA_URL=http://127.0.0.1:11434
```
**What:** URL of Ollama server for vision model
**Used for:** Extracting data from screenshots

```bash
OLLAMA_VLM_MODEL=qwen2.5vl:3b
```
**What:** Vision-language model to use
**qwen2.5vl:3b** - Good balance of speed/quality

```bash
OLLAMA_TRIES=2
```
**What:** Retry attempts for failed model calls

---

### LLM & Embeddings (for RAG features)

```bash
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.1-8b-instant
```
**What:** Groq API for fast LLM inference
**Used for:** Text generation in RAG pipeline

```bash
NOMIC_API_KEY=your_nomic_api_key
```
**What:** Nomic API for embeddings
**Used for:** Vector similarity search

---

### File Paths

```bash
ROUTES_JSON=./routes.json
```
**What:** List of discovered/configured URLs to crawl
**Format:** Array of `{ routeKey, exampleUrl }` objects

```bash
FORM_FIELDS_JSON=./form-fields.json
```
**What:** Form filling configuration per page
**Structure:** Pages with URL patterns, field selectors, values

```bash
ROOT_DIR=./data
```
**What:** Directory for sample documents (PDFs, etc.)
**Used for:** Document ingestion in RAG system

---

## Workflow Summary

```
1. START
   └── Load .env configuration
   
2. CONNECT
   ├── Connect to MongoDB
   └── Launch browser with saved session
   
3. AUTHENTICATE
   ├── Navigate to base URL
   ├── Detect if on login page
   └── If login needed → fill credentials → submit
   
4. FOR EACH URL
   ├── Navigate to page
   ├── Check for form config match
   ├── Capture BEFORE screenshot
   ├── Fill form fields (if configured)
   ├── Capture FILLED screenshot
   ├── Submit form (if configured)
   ├── Capture SUBMITTED screenshot
   ├── Upload screenshots to GridFS
   └── Save page document to MongoDB
   
5. CLEANUP
   ├── Save session state
   ├── Close browser
   └── Disconnect from MongoDB
```

---

## What the User Needs to Continue

1. **Add more form configs** - Edit `form-fields.json` for other pages
2. **Implement extraction** - Use screenshots with Ollama to extract structured data
3. **Build the RAG pipeline** - Use extracted data to answer questions
4. **Deploy** - Run with `HEADLESS=true` on a server

The crawler is **production-ready** and **generic** - it can work with any web application by configuring the `.env` file.
