import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class WebCrawlerApi implements ICredentialType {
	name = 'webCrawlerApi';
	displayName = 'WebCrawler API';
	documentationUrl = 'https://webcrawlerapi.com/docs';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			default: '',
			typeOptions: {
				password: true,
			},
			description: 'Go to https://dash.webcrawlerapi.com/access to obtain your API key',
			required: true,
		},
	];

	// This allows the credential to be used by other parts of n8n
	// stating how this credential is injected as part of the request
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{"Bearer " + $credentials.apiKey}}',
			},
		},
	};

	// The block below tells how this credential can be tested
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.webcrawlerapi.com',
			url: '/v1/auth',
			method: 'GET',
			headers: {
				Authorization: '={{"Bearer " + $credentials.apiKey}}',
			},
		},
		rules: [
			{
				type: 'responseCode',
				properties: {
					value: 200,
					message: 'API key test failed: Invalid API key or network error',
				},
			},
		],
	};
}
