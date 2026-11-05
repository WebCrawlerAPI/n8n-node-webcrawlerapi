import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError, sleep } from 'n8n-workflow';

const BASE_URL = 'https://api.webcrawlerapi.com';

function parseUrlList(raw: unknown): string[] {
	let list: unknown[] = [];
	if (Array.isArray(raw)) {
		list = raw;
	} else if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed.startsWith('[')) {
			try {
				const parsed = JSON.parse(trimmed);
				if (Array.isArray(parsed)) list = parsed;
			} catch {
				// fall through to delimiter split
			}
		}
		if (list.length === 0) list = trimmed.split(/[\s,]+/);
	}
	return list.map((u) => (typeof u === 'string' ? u.trim() : '')).filter((u) => u.length > 0);
}

function getByPath(obj: Record<string, unknown>, path: string): unknown {
	return path
		.split('.')
		.reduce<unknown>(
			(acc, key) =>
				acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
			obj,
		);
}

type BatchJson = Record<string, string | number | boolean | null | object>;

async function runBatchScrape(
	ctx: IExecuteFunctions,
	itemIndex: number,
	urls: string[],
): Promise<BatchJson[]> {
	const request = async (opts: Record<string, unknown>) => {
		try {
			return await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'webCrawlerApi', {
				json: true,
				...opts,
			} as never);
		} catch (error) {
			throw new NodeApiError(ctx.getNode(), error as JsonObject, { itemIndex });
		}
	};

	const outputFormats = ctx.getNodeParameter('batch_output_formats', itemIndex, [
		'markdown',
	]) as string[];
	const wait = ctx.getNodeParameter('batch_wait', itemIndex, true) as boolean;
	const split = wait && (ctx.getNodeParameter('batch_split_items', itemIndex, false) as boolean);
	const options = ctx.getNodeParameter('batch_options', itemIndex, {}) as {
		ignore_invalid_urls?: boolean;
		main_content_only?: boolean;
		max_age?: number;
		max_concurrency?: number;
		respect_robots_txt?: boolean;
		webhook_url?: string;
	};

	const body: Record<string, unknown> = { urls };
	if (outputFormats.length > 0) body.output_formats = outputFormats;
	if (options.ignore_invalid_urls !== undefined)
		body.ignore_invalid_urls = options.ignore_invalid_urls;
	if (options.main_content_only) body.main_content_only = true;
	if (options.max_age !== undefined) body.max_age = options.max_age;
	if (options.max_concurrency) body.max_concurrency = options.max_concurrency;
	if (options.respect_robots_txt) body.respect_robots_txt = true;
	if (options.webhook_url) body.webhook_url = options.webhook_url;

	const created = (await request({
		method: 'POST',
		url: `${BASE_URL}/v2/batch/scrape`,
		headers: { 'Content-Type': 'application/json' },
		body,
	})) as { id?: string; status_url?: string; invalid_urls?: unknown[] };

	const batchId = created.id;
	if (!batchId) {
		throw new NodeOperationError(ctx.getNode(), 'Batch scrape API returned no batch ID', {
			itemIndex,
		});
	}
	if (!wait) {
		return [created as BatchJson];
	}

	const statusUrl = `${BASE_URL}/v2/batch/scrape/${batchId}`;
	const deadline = Date.now() + 30 * 60 * 1000;
	while (true) {
		if (Date.now() > deadline) {
			throw new NodeOperationError(ctx.getNode(), 'Batch scrape timed out after 30 minutes', {
				itemIndex,
			});
		}
		const progress = (await request({
			method: 'GET',
			url: statusUrl,
			qs: { limit: 1 },
		})) as { status: string };
		if (progress.status !== 'scraping') {
			if (progress.status === 'failed') {
				throw new NodeOperationError(ctx.getNode(), `Batch scrape ${batchId} failed`, {
					itemIndex,
				});
			}
			break;
		}
		await sleep(3000);
	}

	// Fetch every page of items
	let status: Record<string, unknown> = {};
	const data: Record<string, unknown>[] = [];
	let cursor = '';
	do {
		const page = (await request({
			method: 'GET',
			url: statusUrl,
			qs: cursor ? { limit: 500, cursor } : { limit: 500 },
		})) as Record<string, unknown>;
		status = page;
		data.push(...((page.data as Record<string, unknown>[]) ?? []));
		cursor = (page.next as string) ?? '';
	} while (cursor);

	const { data: _data, next: _next, ...summary } = status;
	void _data;
	void _next;
	const invalidUrls = created.invalid_urls ?? [];

	if (split) {
		return data.map((row) => ({ ...row, batch_id: batchId }) as BatchJson);
	}
	return [{ ...summary, invalid_urls: invalidUrls, data } as BatchJson];
}

export class WebCrawlerApiNode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WebCrawlerAPI',
		name: 'webCrawlerApiNode',
		icon: 'file:webcrawlerapi.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Scrape or crawl web pages with WebCrawlerAPI',
		usableAsTool: true,
		defaults: {
			name: 'WebCrawlerAPI',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'webCrawlerApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Agent',
						value: 'agent',
						description: 'Run an AI agent to extract data from web pages',
						action: 'Run an AI agent to extract data from web pages',
					},
					{
						name: 'Batch Scrape',
						value: 'batch_scrape',
						description: 'Scrape a list of URLs in one async batch',
						action: 'Scrape a list of pages in one batch',
					},
					{
						name: 'Crawl',
						value: 'crawl',
						description: 'Crawl multiple pages starting from a URL',
						action: 'Crawl multiple pages starting from a URL',
					},
					{
						name: 'Scrape',
						value: 'scrape',
						description: 'Scrape a single page',
						action: 'Scrape a single page',
					},
					{
						name: 'URL to Markdown',
						value: 'url_to_markdown',
						description:
							'Get markdown cleaned with an LLM (removes nav, ads, footers). See https://webcrawlerapi.com/docs/markdown-cleaning.',
						action: 'Convert a url to llm cleaned markdown',
					},
				],
				default: 'url_to_markdown',
			},
			// URL to Markdown params
			{
				displayName: 'URL',
				name: 'url_to_markdown_url',
				type: 'string',
				required: true,
				default: '',
				description:
					'URL of the page to scrape and clean with an LLM into readable markdown. See https://webcrawlerapi.com/docs/markdown-cleaning.',
				displayOptions: { show: { operation: ['url_to_markdown'] } },
			},
			// Scrape params
			{
				displayName: 'URL to Scrape',
				name: 'url',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { operation: ['scrape'] } },
			},
			{
				displayName: 'Output Format',
				name: 'output_format',
				type: 'options',
				options: [
					{ name: 'Markdown', value: 'markdown' },
					{ name: 'Cleaned', value: 'cleaned' },
					{ name: 'HTML', value: 'html' },
					{ name: 'Links', value: 'links' },
				],
				default: 'markdown',
				description: 'The output format for the scraped content',
				displayOptions: { show: { operation: ['scrape'] } },
			},
			// Crawl params
			{
				displayName: 'URL to Crawl',
				name: 'crawl_url',
				type: 'string',
				required: true,
				default: '',
				description: 'Seed URL to start crawling from',
				displayOptions: { show: { operation: ['crawl'] } },
			},
			{
				displayName: 'Items Limit',
				name: 'items_limit',
				type: 'number',
				required: true,
				default: 10,
				description: 'Maximum number of pages to crawl',
				displayOptions: { show: { operation: ['crawl'] } },
			},
			{
				displayName: 'Whitelist Regexp',
				name: 'whitelist_regexp',
				type: 'string',
				default: '',
				description: 'Regex pattern — only URLs matching this are crawled',
				displayOptions: { show: { operation: ['crawl'] } },
			},
			{
				displayName: 'Blacklist Regexp',
				name: 'blacklist_regexp',
				type: 'string',
				default: '',
				description: 'Regex pattern — URLs matching this are skipped',
				displayOptions: { show: { operation: ['crawl'] } },
			},
			{
				displayName: 'Respect Robots.txt',
				name: 'respect_robots_txt',
				type: 'boolean',
				default: false,
				description: "Whether to honor the site's robots.txt rules",
				displayOptions: { show: { operation: ['crawl'] } },
			},
			{
				displayName: 'Max Depth',
				name: 'max_depth',
				type: 'number',
				default: 2,
				description: 'Maximum crawl depth from the seed URL',
				displayOptions: { show: { operation: ['crawl'] } },
			},
			{
				displayName: 'Output as File',
				name: 'output_as_file',
				type: 'boolean',
				default: false,
				description:
					'Whether to return a URL to the combined markdown file instead of inline content',
				displayOptions: { show: { operation: ['crawl'] } },
			},
			// Batch scrape params
			{
				displayName: 'URLs Source',
				name: 'batch_urls_source',
				type: 'options',
				options: [
					{
						name: 'Text Field or Expression',
						value: 'field',
						description: 'Comma, space or newline separated URLs (or a JSON array) in one field',
					},
					{
						name: 'Input Items',
						value: 'input_items',
						description: 'Every input item provides one URL; all items are sent as a single batch',
					},
				],
				default: 'field',
				displayOptions: { show: { operation: ['batch_scrape'] } },
			},
			{
				displayName: 'URLs',
				name: 'batch_urls',
				type: 'string',
				typeOptions: { rows: 4 },
				required: true,
				default: '',
				placeholder: 'https://example.com/\nhttps://example.com/pricing',
				description:
					'URLs to scrape, separated by commas or new lines. An expression returning an array also works.',
				displayOptions: { show: { operation: ['batch_scrape'], batch_urls_source: ['field'] } },
			},
			{
				displayName: 'URL Field',
				name: 'batch_url_field',
				type: 'string',
				required: true,
				default: 'url',
				description:
					'Name of the field in each input item that holds the URL (dot notation allowed)',
				displayOptions: {
					show: { operation: ['batch_scrape'], batch_urls_source: ['input_items'] },
				},
			},
			{
				displayName: 'Output Formats',
				name: 'batch_output_formats',
				type: 'multiOptions',
				options: [
					{ name: 'Cleaned', value: 'cleaned' },
					{ name: 'HTML', value: 'html' },
					{ name: 'Images', value: 'images' },
					{ name: 'Links', value: 'links' },
					{ name: 'Markdown', value: 'markdown' },
				],
				default: ['markdown'],
				description: 'Output formats to generate for every URL',
				displayOptions: { show: { operation: ['batch_scrape'] } },
			},
			{
				displayName: 'Wait for Completion',
				name: 'batch_wait',
				type: 'boolean',
				default: true,
				description:
					'Whether to poll until the batch finishes and return all items. If off, returns the batch ID right away.',
				displayOptions: { show: { operation: ['batch_scrape'] } },
			},
			{
				displayName: 'Split Items Into Separate Output Items',
				name: 'batch_split_items',
				type: 'boolean',
				default: false,
				description:
					'Whether to output one n8n item per scraped URL instead of a single item with a data array',
				displayOptions: { show: { operation: ['batch_scrape'], batch_wait: [true] } },
			},
			{
				displayName: 'Additional Options',
				name: 'batch_options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { operation: ['batch_scrape'] } },
				options: [
					{
						displayName: 'Ignore Invalid URLs',
						name: 'ignore_invalid_urls',
						type: 'boolean',
						default: true,
						description:
							'Whether to skip invalid URLs and report them in invalid_urls. If off, any invalid URL fails the request.',
					},
					{
						displayName: 'Main Content Only',
						name: 'main_content_only',
						type: 'boolean',
						default: false,
						description: 'Whether to extract only the main content of each page',
					},
					{
						displayName: 'Max Age (Seconds)',
						name: 'max_age',
						type: 'number',
						default: 604800,
						description: 'Cache duration in seconds. Set to 0 to bypass the cache.',
					},
					{
						displayName: 'Max Concurrency',
						name: 'max_concurrency',
						type: 'number',
						default: 0,
						description: 'Max URLs scraped in parallel for this batch. 0 means no per-batch cap.',
					},
					{
						displayName: 'Respect Robots.txt',
						name: 'respect_robots_txt',
						type: 'boolean',
						default: false,
						description: "Whether to honor each website's robots.txt rules",
					},
					{
						displayName: 'Webhook URL',
						name: 'webhook_url',
						type: 'string',
						default: '',
						description: 'Public http(s) URL called once when the batch finishes',
					},
				],
			},
			// Agent params
			{
				displayName: 'Prompt',
				name: 'agent_prompt',
				type: 'string',
				typeOptions: { rows: 4 },
				required: true,
				default: '',
				description: 'Natural language instruction describing what to extract or find',
				displayOptions: { show: { operation: ['agent'] } },
			},
			{
				displayName: 'Max Spend (USD)',
				name: 'max_spend_usd',
				type: 'number',
				required: true,
				default: 1,
				description: 'Maximum budget in USD the agent may spend',
				displayOptions: { show: { operation: ['agent'] } },
			},
			{
				displayName: 'URLs',
				name: 'agent_urls',
				type: 'string',
				default: '',
				description: 'Comma-separated seed URLs for the agent to start from',
				displayOptions: { show: { operation: ['agent'] } },
			},
			{
				displayName: 'Seed URLs Only',
				name: 'seed_urls_only',
				type: 'boolean',
				default: false,
				description: 'Whether to only process provided seed URLs and not follow links',
				displayOptions: { show: { operation: ['agent'] } },
			},
			{
				displayName: 'Model',
				name: 'agent_model',
				type: 'options',
				options: [
					{ name: 'Claude Sonnet 4.6', value: 'anthropic/claude-sonnet-4.6' },
					{ name: 'Gemini 3 Flash', value: 'google/gemini-3-flash-preview' },
					{ name: 'Gemini 3.1 Flash Lite', value: 'google/gemini-3.1-flash-lite-preview' },
					{ name: 'Gemini 3.1 Pro', value: 'google/gemini-3.1-pro-preview' },
					{ name: 'GPT-5.4', value: 'openai/gpt-5.4' },
					{ name: 'GPT-5.4 Mini', value: 'openai/gpt-5.4-mini' },
					{ name: 'GPT-5.5', value: 'openai/gpt-5.5' },
					{ name: 'GPT-5.6 Luna', value: 'openai/gpt-5.6-luna' },
				],
				default: 'openai/gpt-5.6-luna',
				description: 'LLM model to use for the agent',
				displayOptions: { show: { operation: ['agent'] } },
			},
			{
				displayName: 'Output Schema (JSON)',
				name: 'output_schema',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				description: 'JSON Schema describing the expected structure of extracted data (optional)',
				displayOptions: { show: { operation: ['agent'] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// Batch scrape in "Input Items" mode: all items form a single batch.
		if (
			items.length > 0 &&
			(this.getNodeParameter('operation', 0) as string) === 'batch_scrape' &&
			(this.getNodeParameter('batch_urls_source', 0, 'field') as string) === 'input_items'
		) {
			try {
				const field = this.getNodeParameter('batch_url_field', 0, 'url') as string;
				const urls: string[] = [];
				for (let i = 0; i < items.length; i++) {
					const value = getByPath(items[i].json as Record<string, unknown>, field);
					urls.push(...parseUrlList(value));
				}
				if (urls.length === 0) {
					throw new NodeOperationError(
						this.getNode(),
						`No URLs found in field "${field}" of the input items`,
					);
				}
				const results = await runBatchScrape(this, 0, urls);
				for (const json of results) {
					returnData.push({ json, pairedItem: items.map((_, item) => ({ item })) });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: items.map((_, item) => ({ item })),
					});
				} else {
					throw error instanceof NodeApiError || error instanceof NodeOperationError
						? error
						: new NodeOperationError(this.getNode(), error as Error);
				}
			}
			return [returnData];
		}

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				if (operation === 'url_to_markdown') {
					const url = this.getNodeParameter('url_to_markdown_url', i) as string;

					let response;
					try {
						response = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'webCrawlerApi',
							{
								method: 'POST',
								url: `${BASE_URL}/markdown`,
								headers: { 'Content-Type': 'application/json' },
								body: { url },
								json: true,
							},
						);
					} catch (error) {
						throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
					}

					if (!response.success) {
						throw new NodeOperationError(
							this.getNode(),
							`[${response.error_code}] ${response.error_message || 'Unknown error'}`,
							{ itemIndex: i },
						);
					}

					returnData.push({ json: response, pairedItem: { item: i } });
				} else if (operation === 'scrape') {
					const url = this.getNodeParameter('url', i) as string;
					const output_format = this.getNodeParameter('output_format', i, 'markdown') as string;

					const body: Record<string, unknown> = { url, output_formats: [output_format] };

					let response;
					try {
						response = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'webCrawlerApi',
							{
								method: 'POST',
								url: `${BASE_URL}/v2/scrape`,
								headers: { 'Content-Type': 'application/json' },
								body,
								json: true,
							},
						);
					} catch (error) {
						throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
					}

					if (!response.success) {
						throw new NodeOperationError(
							this.getNode(),
							`[${response.status}] ${response.error_message || 'Unknown error'}`,
							{ itemIndex: i },
						);
					}

					returnData.push({ json: response, pairedItem: { item: i } });
				} else if (operation === 'crawl') {
					const crawlUrl = this.getNodeParameter('crawl_url', i) as string;
					const itemsLimit = this.getNodeParameter('items_limit', i, 10) as number;
					const whitelistRegexp = this.getNodeParameter('whitelist_regexp', i, '') as string;
					const blacklistRegexp = this.getNodeParameter('blacklist_regexp', i, '') as string;
					const respectRobotsTxt = this.getNodeParameter('respect_robots_txt', i, false) as boolean;
					const maxDepth = this.getNodeParameter('max_depth', i, 2) as number;
					const outputAsFile = this.getNodeParameter('output_as_file', i, false) as boolean;

					const crawlBody: Record<string, unknown> = {
						url: crawlUrl,
						items_limit: itemsLimit,
						respect_robots_txt: respectRobotsTxt,
						max_depth: maxDepth,
					};
					if (whitelistRegexp) crawlBody.whitelist_regexp = whitelistRegexp;
					if (blacklistRegexp) crawlBody.blacklist_regexp = blacklistRegexp;

					// Start crawl job
					let crawlResponse: { id: string };
					try {
						crawlResponse = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'webCrawlerApi',
							{
								method: 'POST',
								url: `${BASE_URL}/v1/crawl`,
								headers: { 'Content-Type': 'application/json' },
								body: crawlBody,
								json: true,
							},
						);
					} catch (error) {
						throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
					}

					const jobId = crawlResponse.id;
					if (!jobId) {
						throw new NodeOperationError(this.getNode(), 'Crawl API returned no job ID', {
							itemIndex: i,
						});
					}

					// Poll until done
					let jobData: Record<string, unknown>;
					const crawlDeadline = Date.now() + 30 * 60 * 1000;
					while (true) {
						if (Date.now() > crawlDeadline) {
							throw new NodeOperationError(this.getNode(), 'Crawl job timed out after 30 minutes', {
								itemIndex: i,
							});
						}
						try {
							jobData = await this.helpers.httpRequestWithAuthentication.call(
								this,
								'webCrawlerApi',
								{
									method: 'GET',
									url: `${BASE_URL}/v1/job/${jobId}`,
									json: true,
								},
							);
						} catch (error) {
							throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
						}

						const status = jobData.status as string;

						if (status === 'error') {
							throw new NodeOperationError(
								this.getNode(),
								`Crawl job failed: ${(jobData.last_error as string) || 'Unknown error'}`,
								{ itemIndex: i },
							);
						}

						if (status === 'done') break;

						const delay = (jobData.recommended_pull_delay_ms as number) ?? 1000;
						await sleep(delay);
					}

					// Fetch markdown
					if (outputAsFile) {
						let markdownRef: { content_url: string };
						try {
							markdownRef = await this.helpers.httpRequestWithAuthentication.call(
								this,
								'webCrawlerApi',
								{
									method: 'GET',
									url: `${BASE_URL}/v1/job/${jobId}/markdown`,
									json: true,
								},
							);
						} catch (error) {
							throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
						}

						returnData.push({
							json: {
								job: jobData,
								content_url: markdownRef.content_url,
							},
							pairedItem: { item: i },
						});
					} else {
						let markdownContent: string;
						try {
							markdownContent = await this.helpers.httpRequestWithAuthentication.call(
								this,
								'webCrawlerApi',
								{
									method: 'GET',
									url: `${BASE_URL}/v1/job/${jobId}/markdown/content`,
									json: false,
								},
							);
						} catch (error) {
							throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
						}

						returnData.push({
							json: {
								job: jobData,
								markdown: markdownContent,
							},
							pairedItem: { item: i },
						});
					}
				} else if (operation === 'batch_scrape') {
					const urls = parseUrlList(this.getNodeParameter('batch_urls', i, ''));
					if (urls.length === 0) {
						throw new NodeOperationError(this.getNode(), 'At least one URL is required', {
							itemIndex: i,
						});
					}
					const results = await runBatchScrape(this, i, urls);
					for (const json of results) {
						returnData.push({ json, pairedItem: { item: i } });
					}
				} else if (operation === 'agent') {
					const prompt = this.getNodeParameter('agent_prompt', i) as string;
					const maxSpendUsd = this.getNodeParameter('max_spend_usd', i, 1) as number;
					const agentUrlsRaw = this.getNodeParameter('agent_urls', i, '') as string;
					const seedUrlsOnly = this.getNodeParameter('seed_urls_only', i, false) as boolean;
					const agentModel = this.getNodeParameter(
						'agent_model',
						i,
						'openai/gpt-5.6-luna',
					) as string;
					const outputSchemaRaw = this.getNodeParameter('output_schema', i, '') as string;

					const agentBody: Record<string, unknown> = {
						prompt,
						max_spend_usd: maxSpendUsd,
						model: agentModel,
					};

					if (agentUrlsRaw.trim()) {
						agentBody.urls = agentUrlsRaw
							.split(',')
							.map((u) => u.trim())
							.filter(Boolean);
					}

					if (seedUrlsOnly) {
						agentBody.seed_urls_only = true;
					}

					if (outputSchemaRaw.trim()) {
						try {
							agentBody.output_schema = JSON.parse(outputSchemaRaw) as Record<string, unknown>;
						} catch {
							throw new NodeOperationError(this.getNode(), 'Output Schema must be valid JSON', {
								itemIndex: i,
							});
						}
					}

					// Start agent run
					let agentRun: Record<string, unknown>;
					try {
						agentRun = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'webCrawlerApi',
							{
								method: 'POST',
								url: `${BASE_URL}/v1/agent`,
								headers: { 'Content-Type': 'application/json' },
								body: agentBody,
								json: true,
							},
						);
					} catch (error) {
						throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
					}

					const agentRunId = agentRun.id as string;
					if (!agentRunId) {
						throw new NodeOperationError(this.getNode(), 'Agent API returned no run ID', {
							itemIndex: i,
						});
					}

					// Poll until terminal status
					let agentData: Record<string, unknown>;
					const agentDeadline = Date.now() + 30 * 60 * 1000;
					while (true) {
						if (Date.now() > agentDeadline) {
							throw new NodeOperationError(this.getNode(), 'Agent run timed out after 30 minutes', {
								itemIndex: i,
							});
						}
						try {
							agentData = await this.helpers.httpRequestWithAuthentication.call(
								this,
								'webCrawlerApi',
								{
									method: 'GET',
									url: `${BASE_URL}/v1/agent/job/${agentRunId}`,
									json: true,
								},
							);
						} catch (error) {
							throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
						}

						const agentStatus = agentData.status as string;

						if (agentStatus === 'error') {
							throw new NodeOperationError(
								this.getNode(),
								`Agent run failed: ${(agentData.error_reason as string) || 'Unknown error'}`,
								{ itemIndex: i },
							);
						}

						if (agentStatus === 'canceled') {
							throw new NodeOperationError(this.getNode(), 'Agent run was canceled', {
								itemIndex: i,
							});
						}

						if (agentStatus === 'done') break;

						const agentDelay = (agentData.recommended_pull_delay_ms as number) ?? 3000;
						await sleep(agentDelay);
					}

					returnData.push({
						json: agentData as Record<string, string | number | boolean | null | object>,
						pairedItem: { item: i },
					});
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, {
						itemIndex: i,
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
				} else {
					// Already-wrapped n8n errors keep their context; anything else gets wrapped
					// so the n8n UI never receives a raw error.
					const nodeError =
						error instanceof NodeApiError || error instanceof NodeOperationError
							? error
							: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
					throw nodeError;
				}
			}
		}
		return [returnData];
	}
}

export default WebCrawlerApiNode;
