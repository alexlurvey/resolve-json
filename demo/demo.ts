import { resolve, toPlainObject } from 'resolve-json';

const config = {
	descriptions: {
		single: ['xf_pick', ['xf_hoist', '$value'], ['name']],
		many: [
			'xf_map',
			'$value',
			['xf_join', " '", ['xf_pick', '$', 'name'], "'"],
		],
	},
	description: ['@@descriptions', '@input_type'],
	inputs: {
		has: 'single',
		has_not: 'single',
		has_any: 'many',
		has_none: 'multiselect',
	},
	input_type: ['@@inputs', '$condition'],
};

let resolved = resolve(config);

console.log('r1', resolved);

console.log('__________________________________________');

resolved = resolve(resolved, {
	condition: 'has_any',
	value: [{ name: 'Option 1' }, { name: 'Option 2' }],
});

console.log('r2', resolved);

const plain = toPlainObject(resolved);

console.log('to plain object', plain);

console.log("String'd", String(plain.description).trim());
