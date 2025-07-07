import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';

export class WebCrawlerApiNode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WebCrawlerAPI',
		name: 'webCrawlerApiNode',
		icon: 'file:webcrawlerapi.svg',
		group: ['transform'],
		version: 1,
		description: 'Scrape a webpage content in markdown format ready for LLM and RAG',
		defaults: {
			name: 'WebCrawlerAPI',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'webCrawlerApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'URL to Scrape',
				name: 'url',
				type: 'string',
				required: true,
				default: '',
			},
			{
				displayName: 'Output Format',
				name: 'output_format',
				type: 'options',
				options: [
					{ name: 'Markdown', value: 'markdown' },
					{ name: 'Cleaned', value: 'cleaned' },
					{ name: 'HTML', value: 'html' },
				],
				default: 'markdown',
				description: 'The output format for the scraped content',
			},
			{
				displayName: 'CSS Selectors to Remove',
				name: 'clean_selectors',
				type: 'string',
				default: '',
				description: 'CSS selectors to remove from the scraped content (comma-separated)',
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				default: '',
				description: 'A prompt to run on the scraped content to extract specific information',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const url = this.getNodeParameter('url', i) as string;
				const output_format = this.getNodeParameter('output_format', i, 'markdown') as string;
				const clean_selectors = this.getNodeParameter('clean_selectors', i, '') as string;
				const prompt = this.getNodeParameter('prompt', i, '') as string;

				const body: Record<string, any> = { url };
				if (output_format) body.output_format = output_format;
				if (clean_selectors) body.clean_selectors = clean_selectors;
				if (prompt) body.prompt = prompt;

				const response = await this.helpers.requestWithAuthentication.call(this, 'webCrawlerApi', {
					method: 'POST',
					url: 'https://api.webcrawlerapi.com/v2/scrape',
					body,
					json: true,
				});

				if (!response.success) {
					throw new NodeOperationError(
						this.getNode(),
						`[${response.status}] ${response.error_message || 'Unknown error'}`,
						{ itemIndex: i },
					);
				}

				returnData.push({ json: response });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: error.message }, pairedItem: i });
				} else {
					throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
				}
			}
		}
		return [returnData];
	}
}

export default WebCrawlerApiNode;
