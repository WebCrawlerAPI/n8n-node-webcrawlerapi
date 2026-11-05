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

## Batch Scrape

Operation **Batch Scrape** scrapes a list of URLs in one async request (`POST /v2/batch/scrape`) and, by default, waits for it to finish (polls `GET /v2/batch/scrape/:id`, up to 30 minutes) before returning all items.

| Parameter | Required | Description |
|---|---|---|
| **URLs Source** | Yes | `Text Field or Expression` (URLs separated by commas, spaces or new lines, or an expression returning an array) or `Input Items` (every input item provides one URL; all items are sent as a single batch) |
| **URLs** | Yes | The URL list (when source is a field) |
| **URL Field** | Yes | Field in each input item holding the URL, default `url` (when source is input items) |
| **Output Formats** | No | Any of `markdown` (default), `cleaned`, `html`, `links`, `images` |
| **Wait for Completion** | No | On by default. Off returns `id`, `status_url` and `invalid_urls` immediately |
| **Split Items into Separate Output Items** | No | Output one n8n item per scraped URL instead of one item with a `data` array |
| **Additional Options** | No | `ignore_invalid_urls`, `main_content_only`, `max_age`, `max_concurrency`, `respect_robots_txt`, `webhook_url` |

Output (when waiting): `id`, `status` (`completed`, `cancelled`), `total`, `completed`, `failed`, `canceled`, `invalid_urls`, and `data` (per-URL `url`, `status`, `title`, `page_status_code`, `markdown_url` / `cleaned_url` / `html_url`, `from_cache`, `error_code`, `error_message`). Failed URLs appear in `data` with `status: error`; the node only throws if the whole batch fails. URLs are normalized and deduplicated by the API; duplicates and rejected URLs are listed in `invalid_urls`.

## Documentation

Full API docs: [webcrawlerapi.com/docs](https://webcrawlerapi.com/docs)

## License

MIT
