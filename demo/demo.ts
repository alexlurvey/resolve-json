import { resolveAsync, toPlainObject } from 'resolve-json';
import { UNRESOLVED } from '../src/api';

const config = {
	// descriptions: {
	// 	single: ['xf_pick', ['xf_hoist', '$value'], ['name']],
	// 	many: [
	// 		'xf_map',
	// 		'$value',
	// 		['xf_join', " '", ['xf_pick', '$', 'name'], "'"],
	// 	],
	// },
	// description: ['@@descriptions', '@input_type'],
	// inputs: {
	// 	has: 'single',
	// 	has_not: 'single',
	// 	has_any: 'many',
	// 	has_none: 'multiselect',
	// },
	// input_type: ['@@inputs', '$condition'],
	resources: {
		repos: {
			path: 'https://api.github.com/users/alexlurvey/repos',
			method: 'GET',
		},
	},
	ref_one: '@/ref_two',
	ref_two: '@/resources/repos',
	data: {
		repo_names: ['xf_map', '@../ref_one', ['xf_pick', '$', ['full_name']]],
	},
};

console.log('resolve start', config);

const resolved = await resolveAsync(config);

// const repos = await resolved.repos;

// console.log('repos', repos);

// console.log('r1', toPlainObject(resolved));
console.log('r1', resolved);

console.log('__________________________________________');

let iter = 1;

const id = setInterval(() => {
	const plain = toPlainObject(resolved);

	console.log('r2... ', iter, plain);

	if (plain.data.repo_names !== UNRESOLVED) {
		clearInterval(id);
	}

	iter++;
}, 1);

// resolved = resolve(resolved, {
// 	condition: 'has_any',
// 	value: [{ name: 'Option 1' }, { name: 'Option 2' }],
// });

// console.log('r2', resolved);

// const plain = toPlainObject(resolved);

// console.log('to plain object', plain);

// console.log("String'd", String(plain.description).trim());
