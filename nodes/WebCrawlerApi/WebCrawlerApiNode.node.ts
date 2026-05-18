import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

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
					{ name: 'Links', value: 'links' },
				],
				default: 'markdown',
				description: 'The output format for the scraped content',
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

				const body: Record<string, any> = { url, output_formats: [output_format] };

				let response;
				try {
					response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'webCrawlerApi',
						{
							method: 'POST',
							url: 'https://api.webcrawlerapi.com/v2/scrape',
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
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: error.message }, pairedItem: i });
				} else {
					throw error;
				}
			}
		}
		return [returnData];
	}
}

export default WebCrawlerApiNode;
