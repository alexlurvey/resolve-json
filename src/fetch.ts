import type { FetchOptions } from './api';

export const fetchResource = async (opts: FetchOptions): Promise<any> => {
	const { method, path, query, headers } = opts;

	let url = path;

	if (query) {
		const querystring = new URLSearchParams(query).toString();
		url = `${path}?${querystring}`;
	}

	if (method === 'POST') {
		const response = await fetch(url, {
			method: 'POST',
			body: JSON.stringify(opts.body ?? {}),
			headers: headers,
		});

		const json = await response.json();
		return json;
	}

	const response = await fetch(url, { method: 'GET', headers });
	const json = await response.json();
	return json;
};
