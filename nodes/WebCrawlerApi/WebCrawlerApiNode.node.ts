import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

const BASE_URL = 'https://api.webcrawlerapi.com';

export class WebCrawlerApiNode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WebCrawlerAPI',
		name: 'webCrawlerApiNode',
		icon: 'file:webcrawlerapi.svg',
		group: ['transform'],
		version: 1,
		description: 'Scrape or crawl web pages with WebCrawlerAPI',
		defaults: {
			name: 'WebCrawlerAPI',
		},
		inputs: ['main'],
		outputs: ['main'],
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
						name: 'Scrape',
						value: 'scrape',
						description: 'Scrape a single page',
						action: 'Scrape a single page',
					},
					{
						name: 'Crawl',
						value: 'crawl',
						description: 'Crawl multiple pages starting from a URL',
						action: 'Crawl multiple pages starting from a URL',
					},
					{
						name: 'Agent',
						value: 'agent',
						description: 'Run an AI agent to extract data from web pages',
						action: 'Run an AI agent to extract data from web pages',
					},
				],
				default: 'scrape',
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
				description: 'Whether to honor the site\'s robots.txt rules',
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
				description: 'Whether to return a URL to the combined markdown file instead of inline content',
				displayOptions: { show: { operation: ['crawl'] } },
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
				],
				default: 'openai/gpt-5.4-mini',
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

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				if (operation === 'scrape') {
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

					returnData.push({ json: response });
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
							throw new NodeOperationError(
								this.getNode(),
								'Crawl job timed out after 30 minutes',
								{ itemIndex: i },
							);
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
						await new Promise<void>((resolve) => setTimeout(resolve, delay));
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
						});
					}
				} else if (operation === 'agent') {
					const prompt = this.getNodeParameter('agent_prompt', i) as string;
					const maxSpendUsd = this.getNodeParameter('max_spend_usd', i, 1) as number;
					const agentUrlsRaw = this.getNodeParameter('agent_urls', i, '') as string;
					const seedUrlsOnly = this.getNodeParameter('seed_urls_only', i, false) as boolean;
					const agentModel = this.getNodeParameter('agent_model', i, 'openai/gpt-5.4-mini') as string;
					const outputSchemaRaw = this.getNodeParameter('output_schema', i, '') as string;

					const agentBody: Record<string, unknown> = {
						prompt,
						max_spend_usd: maxSpendUsd,
						model: agentModel,
					};

					if (agentUrlsRaw.trim()) {
						agentBody.urls = agentUrlsRaw.split(',').map((u) => u.trim()).filter(Boolean);
					}

					if (seedUrlsOnly) {
						agentBody.seed_urls_only = true;
					}

					if (outputSchemaRaw.trim()) {
						try {
							agentBody.output_schema = JSON.parse(outputSchemaRaw) as Record<string, unknown>;
						} catch {
							throw new NodeOperationError(
								this.getNode(),
								'Output Schema must be valid JSON',
								{ itemIndex: i },
							);
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
							throw new NodeOperationError(
								this.getNode(),
								'Agent run timed out after 30 minutes',
								{ itemIndex: i },
							);
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
							throw new NodeOperationError(
								this.getNode(),
								'Agent run was canceled',
								{ itemIndex: i },
							);
						}

						if (agentStatus === 'done') break;

						const agentDelay = (agentData.recommended_pull_delay_ms as number) ?? 3000;
						await new Promise<void>((resolve) => setTimeout(resolve, agentDelay));
					}

					returnData.push({ json: agentData as Record<string, string | number | boolean | null | object> });
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unknown operation: ${operation}`,
						{ itemIndex: i },
					);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: i });
				} else {
					throw error;
				}
			}
		}
		return [returnData];
	}
}

export default WebCrawlerApiNode;
