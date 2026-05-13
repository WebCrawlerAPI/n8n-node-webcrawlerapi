# n8n WebCrawlerAPI Node

Turn docs and websites into clean markdown for AI agents — directly inside n8n.

[WebCrawlerAPI](https://webcrawlerapi.com/) is a web crawling and data extraction API built for AI teams. One API call loads the page, removes menus, banners, ads, and clutter, and returns clean content ready for LLM prompts, RAG pipelines, or vector storage.

## Features

- Scrape any URL via the `/v2/scrape` endpoint
- Output formats: **Markdown**, **Cleaned**, **HTML**, or **Links**
- Smart caching — cached pages return in ~0.9s instead of ~4.7s
- Proxies, retries, headless browsers, and anti-bot handling included — no infra to manage

## Installation

Search for `n8n-nodes-webcrawlerapi` in the n8n community nodes panel, or install manually:

```bash
npm install n8n-nodes-webcrawlerapi
```

## Credentials

Get your API key at [dash.webcrawlerapi.com/access](https://dash.webcrawlerapi.com/access).

## Node Parameters

| Parameter | Required | Description |
|---|---|---|
| **URL to Scrape** | Yes | The URL of the page to scrape |
| **Output Format** | No | `markdown` (default), `cleaned`, `html`, or `links` |

## Response Fields

| Field | Description |
|---|---|
| `success` | `true` if scrape succeeded |
| `status` | Job status |
| `markdown` | Page content as clean Markdown |
| `cleaned_content` | Cleaned plain text |
| `raw_content` | Raw HTML |
| `links` | Extracted links (when output format is `links`) |
| `page_title` | Page title |
| `page_status_code` | HTTP status of the scraped page |

## Usage

1. Add **WebCrawlerAPI** node to your workflow
2. Configure credentials with your API key
3. Set the URL to scrape
4. Choose output format
5. Connect output to your LLM, vector store, or any downstream node

## Documentation

Full API docs: [webcrawlerapi.com/docs](https://webcrawlerapi.com/docs)

## License

MIT
