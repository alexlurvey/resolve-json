import { resolveAsync, toPlainObject } from 'resolve-json';
import type { FetchOptions } from '../src/api';

const wait = (ms: number) => {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
};

const fetchResource = async (opts: FetchOptions) => {
	const headers = {
		Authorization: 'Bearer XXX',
		'Content-Type': 'application/json',
	};

	let url = opts.path;

	if (opts.query) {
		const params = new URLSearchParams(opts.query).toString();
		url = `${opts.path}?${params}`;
	}

	if (opts.method === 'GET') {
		const response = await fetch(url, { method: 'GET', headers });
		const json = await response.json();
		return json;
	}

	const response = await fetch(url, {
		method: 'POST',
		body: JSON.stringify(opts.body ?? {}),
		headers,
	});
	const json = await response.json();
	return json;
};

const config = {
	resources: {
		umbrella: {
			path: 'https://api.github.com/repos/thi-ng/umbrella',
			// query: { param: ['xf_join', 'useless_param_', '$selected_topic'] },
			method: 'GET',
		},
		discussions: {
			path: 'https://api.github.com/graphql',
			method: 'POST',
			body: {
				query: [
					'xf_join',
					'{ search(query: "repo:thi-ng/umbrella discussion ',
					'$selected_topic',
					'", type: DISCUSSION, first: 10) { nodes { ... on Discussion { title bodyText url createdAt author { login } } } } }',
				],
			},
		},
	},
	data: {
		topics: ['xf_pick', '@/resources/umbrella', ['topics']],
		discussions: [
			'xf_pick',
			'@/resources/discussions',
			['data', 'search', 'nodes'],
		],
	},
};

console.log('resolve start', config);

let resolved = await resolveAsync(config, { fetchResource });

console.log('r1', resolved);
console.log('r1 - plain', toPlainObject(resolved));
console.log('__________________________________________');

await wait(2000);

resolved = await resolveAsync(resolved, {
	variables: { selected_topic: 'transducers' },
	fetchResource,
});

console.log('r2', resolved);
console.log('r2 - plain', toPlainObject(resolved));
