import { describe, expect, it } from 'vitest';
import { Reference, Transform, UNRESOLVED } from '../api';
import { resolve } from '../resolve';
import { toPlainObject } from '../utils';

describe('resolve', () => {
	describe('basic', () => {
		it('absolute string reference', () => {
			const src = {
				global_value: 'global',
				nesting: {
					value: '@/global_value',
				},
			};
			const result = toPlainObject(resolve(src));
			expect(result.nesting.value).toBe('global');
		});

		it('relative string reference', () => {
			const src = {
				one: 'one',
				two: '@one',
			};
			const result = toPlainObject(resolve(src));
			expect(result.two).toBe('one');
		});

		it('variable string', () => {
			const vars = { gimmesomething: 'something' };
			const src = { value: '$gimmesomething' };
			const result = toPlainObject(resolve(src, vars));
			expect(result.value).toBe('something');
		});

		it('absolute array refrence', () => {
			const src = {
				lookup: {
					dropdown: 'dd_value',
				},
				nesting: {
					value: ['@@/lookup', 'dropdown'],
				},
			};
			const result = toPlainObject(resolve(src));
			expect(result.nesting.value).toBe('dd_value');
		});

		it('absolute array refrence', () => {
			const src = {
				lookup: {
					dropdown: 'dd_value',
				},
				value: ['@@lookup', 'dropdown'],
			};
			const result = toPlainObject(resolve(src));
			expect(result.value).toBe('dd_value');
		});

		it('array of references', () => {
			const vars = { three: 'three' };
			const src = {
				lookup: {
					one: 1,
					two: 2,
					three: 3,
				},
				values: ['@/lookup/one', '@/lookup/two', ['@@/lookup', '$three']],
			};
			const result = toPlainObject(resolve(src, vars));
			expect(result.values).toEqual([1, 2, 3]);
		});
	});

	describe('with variables', () => {
		it('absolute array', () => {
			const vars = { field_type: 'dropdown' };
			const src = {
				lookup: {
					dropdown: 'dd_value',
				},
				nesting: {
					value: ['@@/lookup', '$field_type'],
				},
			};
			const result = toPlainObject(resolve(src, vars));
			expect(result.nesting.value).toBe('dd_value');
		});

		it('relative array', () => {
			const vars = { field_type: 'dropdown' };
			const src = {
				lookup: {
					dropdown: 'dd_value',
				},
				value: ['@@lookup', '$field_type'],
			};
			const result = toPlainObject(resolve(src, vars));
			expect(result.value).toBe('dd_value');
		});
	});

	describe('nested references', () => {
		it('absolute array w/ relative array', () => {
			const vars = { field_type: 'dropdown' };
			const src = {
				lookup: {
					key: 'lookup_value',
				},
				other_data: {
					dropdown: {
						key: 'key',
					},
				},
				main_reference: ['@@/lookup', ['@@other_data', '$field_type', 'key']],
			};
			const result = toPlainObject(resolve(src, vars));
			expect(result.main_reference).toBe('lookup_value');
		});

		it('relative array w/ absolute array', () => {
			const vars = { field_type: 'dropdown' };
			const src = {
				lookup: {
					key: 'lookup_value',
				},
				other_data: {
					dropdown: {
						key: 'key',
					},
				},
				main_reference: ['@@lookup', ['@@/other_data', '$field_type', 'key']],
			};
			const result = toPlainObject(resolve(src, vars));
			expect(result.main_reference).toBe('lookup_value');
		});
	});

	describe('unresolved references', () => {
		it('absolute reference has UNRESOLVED value', () => {
			const src = {
				string: '@/not_found/item',
				array: ['@@/not_found/item'],
			};
			const result = toPlainObject(resolve(src));
			expect(result.string).toBe(UNRESOLVED);
			expect(result.array).toBe(UNRESOLVED);
		});

		it('relative reference has UNRESOLVED value', () => {
			const src = {
				nesting: {
					string: '@not_found/item',
					array: ['@@not_found/item'],
				},
			};
			const result = toPlainObject(resolve(src));
			expect(result.nesting.string).toBe(UNRESOLVED);
			expect(result.nesting.array).toBe(UNRESOLVED);
		});

		it('transform with unresolved reference has UNRESOLVED value', () => {
			const src = {
				xform: ['xf_join', 'testing', ['@@/lookup/not_found']],
			};
			const result = toPlainObject(resolve(src));
			expect(result.xform).toBe(UNRESOLVED);
		});
	});

	describe('kitchen sink', () => {
		it('all the things', () => {
			const vars = {
				activity: {
					id: 'xxx',
					name: 'Test Activity',
				},
				field: {
					field_type: 'dropdown',
				},
				object_type: 'client_client',
				users: [
					{ id: 'aaa', first_name: 'Alice', last_name: 'Smith' },
					{ id: 'bbb', first_name: 'Frank', last_name: 'Smith' },
					{ id: 'bbb', first_name: 'Zorp', last_name: 'Smith' },
				],
			};
			const src = {
				__labels: {
					activity: 'Activity',
				},
				__data: {
					client_client: [
						'xf_join',
						'/activity/',
						['xf_pick', '$activity', ['id']],
					],
				},
				usernames: [
					'xf_map',
					'$users',
					[
						'xf_join',
						'"',
						['xf_pick', '$', ['first_name']],
						' ',
						['xf_pick', '$', ['last_name']],
						'"',
					],
				],
				step_data: {
					urls: {
						absolute: ['@@/__data', '$object_type'],
						relative: ['@@../../__data', '$object_type'],
					},
				},
			};
			const result = toPlainObject(resolve(src, vars));

			expect(result.usernames).toEqual([
				'"Alice Smith"',
				'"Frank Smith"',
				'"Zorp Smith"',
			]);
			expect(result.step_data.urls.absolute).toBe('/activity/xxx');
			expect(result.step_data.urls.relative).toBe('/activity/xxx');
		});
	});

	describe('re-resolving values', () => {
		it('variables re-resolve successfully', () => {
			const data = {
				testing: '$variable',
			};

			let resolved = resolve(data);

			resolved = resolve(resolved, { variable: 'hello' });

			expect(resolved.testing.value).toBe('hello');
		});

		it('relative reference re-resolve successfully', () => {
			const data = {
				testing: ['@@data', '$value'],
				data: {
					property: 123,
				},
			};

			let resolved = resolve(data);

			expect(resolved.testing).toBeInstanceOf(Reference);
			expect(resolved.testing.value).toBe(UNRESOLVED);

			resolved = resolve(resolved, { value: 'property' });

			expect(resolved.testing.value).toBe(123);
		});

		it('transforms re-resolve successfully', () => {
			const data = {
				testing: ['xf_map', '$value', ['xf_pick', '$', ['value']]],
			};

			let resolved = resolve(data);

			expect(resolved.testing).toBeInstanceOf(Transform);
			expect(resolved.testing.value).toBe(UNRESOLVED);

			resolved = resolve(resolved, { value: [{ value: 1 }, { value: 2 }] });

			expect(resolved.testing.value).toEqual([1, 2]);
		});

		it('re-resolving a string reference used within a reference is successful', () => {
			const data = {
				descriptions: {
					single: ['xf_pick', ['xf_hoist', '$value'], ['name']],
					many: ['xf_map', '$value', ['xf_join', " '", ['$', 'name'], "'"]],
				},
				description: ['@@descriptions', '@input_type'],
				inputs: {
					has: 'single',
					has_not: 'single',
					has_any: 'many',
					has_none: 'multiselect',
				},
				labels: {
					single: 'Find One',
					many: 'Find Multiple',
				},
				sizes: {
					single: 250,
					many: 300,
				},
				input_type: ['@@inputs', '$condition'],
				label: ['@@labels', '@input_type'],
				size: ['@sizes', '@input_type'],
			};

			let resolved = resolve(data);

			expect(resolved.input_type).toBeInstanceOf(Reference);
			expect(resolved.input_type.value).toBe(UNRESOLVED);

			resolved = resolve(resolved, { condition: 'has' });

			expect(resolved.input_type).toBeInstanceOf(Reference);
			expect(resolved.input_type.value).toBe('single');
			expect(resolved.description).toBeInstanceOf(Reference);
			expect(resolved.description.value).toBe(UNRESOLVED);

			resolved = resolve(resolved, {
				condition: 'has',
				value: [{ name: 'Option 1' }],
			});

			expect(resolved.description).toBeInstanceOf(Reference);
			expect(resolved.description.value).toBe('Option 1');

			const result = toPlainObject(resolved);
			expect(result.input_type).toBe('single');
			expect(result.description).toBe('Option 1');
		});
	});
});
