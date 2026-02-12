# RAG System - Web Crawler

A portable, modular web crawler for extracting data from web applications. Supports authentication, form filling, screenshot capture, and MongoDB storage.

## Features

- 🔐 **Automatic Authentication** - Detects login pages and handles authentication
- 📝 **Form Filling** - JSON-configurable form field values
- 📸 **Screenshot Capture** - Multiple modes (full, batches, hybrid)
- 💾 **GridFS Storage** - Screenshots stored in MongoDB GridFS
- 🔄 **Session Persistence** - Maintains login state between runs
- 🎯 **Pattern Matching** - Filter routes by URL patterns
- 🚀 **CLI Interface** - Easy command-line usage

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Run Crawler

```bash
# Crawl single URL
npm run crawl -- --url https://example.com/page.php

# Crawl all routes
npm run crawl -- --all

# Crawl with pattern
npm run crawl -- --pattern "statement.*account" --limit 5
```

## Configuration

### Environment Variables (.env)

```bash
# Database
MONGODB_URI=mongodb://127.0.0.1:27017
DB_NAME=rag_tree
GRIDFS_BUCKET=web_screens

# Target webapp
WEB_BASE_URL=https://your-webapp.example.com/home.php
WEB_ALLOWED_HOST=your-webapp.example.com

# Authentication
WEB_LOGIN_URL=https://your-webapp.example.com/login.php
WEB_USERNAME=your_username
WEB_PASSWORD=your_password
WEB_USER_SELECTOR=input[name="userName"]
WEB_PASS_SELECTOR=input[name="password"]
WEB_SUBMIT_SELECTOR=button[type="submit"]

# Browser
HEADLESS=false
BROWSER_EXECUTABLE=/usr/bin/brave-browser  # Optional

# Session
WEB_STORAGE_STATE=./storageState.web.json

# Screenshots (full, batches, hybrid)
SCREENSHOT_MODE=full
```

### Form Fields (form-fields.json)

Configure form fields for automatic filling:

```json
{
  "pages": {
    "example_page": {
      "urlPattern": "example_page.php",
      "fields": [
        {
          "label": "Date From",
          "selector": "input[name='date_from']",
          "value": "2024-01-01",
          "type": "date"
        }
      ],
      "submitSelector": "button[type='submit']",
      "waitAfterSubmit": 3000
    }
  }
}
```

### Routes (routes.json)

Define URLs to crawl:

```json
[
  { "routeKey": "example.com/page1.php", "exampleUrl": "https://example.com/page1.php" },
  { "routeKey": "example.com/page2.php", "exampleUrl": "https://example.com/page2.php" }
]
```

## CLI Usage

```bash
# Show help
node src/web/cli.js --help

# Single URL
node src/web/cli.js --url https://example.com/page.php

# All routes
node src/web/cli.js --all

# Pattern matching
node src/web/cli.js --pattern "report|statement"

# With options
node src/web/cli.js --all \
  --limit 10 \
  --skip-existing \
  --headless \
  --mode full

# Skip form submission
node src/web/cli.js --url https://example.com/form.php --no-submit
```

## Programmatic Usage

```javascript
const { Crawler, crawl, crawlAll } = require("./src/web/crawler");

// Quick crawl
const results = await crawl("https://example.com/page.php");

// Crawl all routes
const allResults = await crawlAll({ limit: 10, skipExisting: true });

// Advanced: use Crawler class
const crawler = new Crawler({ headless: true });
await crawler.init();
await crawler.start();

const result = await crawler.processUrl("https://example.com/page.php");
console.log(result);

await crawler.stop();
```

## Project Structure

```
rag-system/
├── src/
│   └── web/
│       ├── core/               # Core modules
│       │   ├── index.js        # Re-exports all modules
│       │   ├── config.js       # Configuration management
│       │   ├── utils.js        # Shared utilities
│       │   ├── browser.js      # Browser lifecycle
│       │   ├── auth.js         # Authentication
│       │   ├── forms.js        # Form handling
│       │   ├── screenshots.js  # Screenshot capture
│       │   ├── database.js     # MongoDB/GridFS
│       │   └── tiler.js        # Image tiling utilities
│       ├── crawler.js          # Main Crawler class
│       ├── cli.js              # CLI entry point
│       └── ingest/
│           └── ingestWithForms.js  # Standalone ingestion script
├── scripts/
│   └── export-routes.js        # Export routes from database
├── testing/
│   └── testFormFill.js         # Form filling test utility
├── form-fields.json            # Form field configurations
├── routes.json                 # Routes to crawl
├── storageState.web.json       # Session storage (git-ignored)
├── .env                        # Environment config (git-ignored)
├── .env.example                # Environment template
└── package.json
```

## Database Collections

| Collection | Purpose |
|------------|---------|
| `web_pages` | Successfully crawled pages with screenshot references |
| `web_failures` | Failed crawl attempts with error details |
| `web_screens.files/chunks` | GridFS screenshot storage |

## Screenshot Modes

| Mode | Description |
|------|-------------|
| `full` | Single full-page screenshot |
| `batches` | Multiple viewport-sized screenshots (scrolling) |
| `hybrid` | Full page + batches if page is tall |

## NPM Scripts

```bash
npm run crawl           # Run crawler CLI
npm run crawl:url       # Crawl single URL
npm run crawl:all       # Crawl all routes
npm run crawl:pattern   # Crawl matching routes
npm run migrate         # Run database migrations
```

## Troubleshooting

### Session Expired
The crawler automatically re-authenticates if it detects a login page during navigation.

### Form Not Filling
1. Check `form-fields.json` has correct URL pattern
2. Verify selectors match actual form elements
3. Use `--verbose` to see debug output

### Screenshots Too Small
Screenshots < 28px are filtered out (required for vision models). Check page is loading correctly.

## Dependencies

- **playwright** - Browser automation
- **mongodb** - Database driver  
- **dotenv** - Environment configuration
