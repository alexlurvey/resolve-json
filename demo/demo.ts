import { resolveAsync, toPlainObject } from 'resolve-json';

const wait = (ms: number) => {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
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

let resolved = await resolveAsync(config);

console.log('r1', resolved);
console.log('r1 - plain', toPlainObject(resolved));
console.log('__________________________________________');

await wait(2000);

resolved = await resolveAsync(resolved, { selected_topic: 'transducers' });

console.log('r2', resolved);
console.log('r2 - plain', toPlainObject(resolved));
