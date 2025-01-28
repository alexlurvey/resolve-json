import { describe, expect, it } from 'vitest';
import { Transform } from '../api';
import { resolve } from '../resolve';
import { transform } from '../transform';

describe('transforms', () => {
	describe('xf_bool', () => {
		it('resolves to true', () => {
			const result = transform(['xf_bool', true, 1, 'hello', {}, []]);
			expect(result).toBe(true);
		});

		it('resolves to false due to presence of zero', () => {
			const result = transform(['xf_bool', true, {}, [], 42, 0]);
			expect(result).toBe(false);
		});

		it('resolves to false due to presence of empty string', () => {
			const result = transform(['xf_bool', true, {}, [], 42, '']);
			expect(result).toBe(false);
		});

		it('resolves to false due to presence of false', () => {
			const result = transform(['xf_bool', true, {}, [], 42, false]);
			expect(result).toBe(false);
		});
	});

	describe('xf_concat', () => {
		it('array values are flattened and joined with other arguments', () => {
			const result = transform(['xf_concat', 1, 2, [3, 4], 5]);
			expect(result).toEqual([1, 2, 3, 4, 5]);
		});

		it('wraps a single value in an array', () => {
			const result = transform(['xf_concat', 12]);
			expect(result).toEqual([12]);
		});
	});

	describe('xf_dateformat', () => {
		it('basic date formatting', () => {
			const date = new Date(2022, 11, 31, 3, 30, 2);
			const result = transform([
				'xf_dateformat',
				date,
				['MM', '/', 'dd', '/', 'yyyy', ' @ ', 'h', ':', 'mm', 'a'],
			]);
			expect(result).toBe('12/31/2022 @ 3:30am');
		});
	});

	describe('xf_first', () => {
		it('the first item in the list is returned', () => {
			const result = transform([
				'xf_first',
				[
					['xf_eq', 1, 1, 'first'],
					['xf_not_eq', 1, 2, 'second'],
				],
			]);
			expect(result).toBe('first');
		});

		it('the last item in the list is returned', () => {
			const result = transform([
				'xf_first',
				[
					['xf_eq', 1, 2, 'first'],
					['xf_not_eq', 1, 1, 'second'],
					['xf_some', [1, 2, 3], 2, 'third'],
				],
			]);
			expect(result).toBe('third');
		});

		it('absolute references can be used as the return value', () => {
			const root = { data: 42 };
			const ctx = { currentLocation: [], root, vars: {} };
			const result = transform(
				[
					'xf_first',
					[
						['xf_eq', 1, 2, 'not_eq'],
						['xf_eq', 1, 1, '@/data'],
					],
				],
				ctx,
			);
			expect(result).toBe(42);
		});

		it('relative references can be used as the return value', () => {
			const root = {
				nesting: {
					data: 42,
					xf: 'this is where the transform would be in the root object',
				},
			};
			const ctx = { currentLocation: ['nesting', 'xf'], root, vars: {} };
			const result = transform(
				[
					'xf_first',
					[
						['xf_eq', 1, 1, '@data'],
						['xf_eq', 1, 1, 'should not reach me'],
					],
				],
				ctx,
			);
			expect(result).toBe(42);
		});
	});

	describe('xf_map', () => {
		describe('transforms as mapping function', () => {
			it('xf_join', () => {
				const array = ['Alice', 'Frank', 'Zorp'];
				const mapper = ['xf_join', '__', '$', '__'];
				const result = transform(['xf_map', array, mapper]);
				expect(result).toEqual(['__Alice__', '__Frank__', '__Zorp__']);
			});

			it('xf_pick', () => {
				const array = [{ name: 'Alice' }, { name: 'Frank' }, { name: 'Zorp' }];
				const mapper = ['xf_pick', '$', ['name']];
				const result = transform(['xf_map', array, mapper]);
				expect(result).toEqual(['Alice', 'Frank', 'Zorp']);
			});

			it('xf_bool', () => {
				const array = [0, false, '', 1, true, 'testing'];
				const mapper = ['xf_bool', '$'];
				const result = transform(['xf_map', array, mapper]);
				expect(result).toEqual([false, false, false, true, true, true]);
			});
		});

		describe('transforms as an xf_map source', () => {
			it('xf_map is used as the array source of another xf_map', () => {
				const vars = {
					users: [{ name: 'Alice' }, { name: 'Frank' }, { name: 'Zorp' }],
				};
				const xf_map = [
					'xf_map',
					['xf_map', '$users', ['xf_pick', '$', ['name']]],
					['xf_join', '__', '$', '__'],
				];
				const result = resolve(xf_map, vars);
				expect(result).toBeInstanceOf(Transform);
				expect(result.value).toEqual(['__Alice__', '__Frank__', '__Zorp__']);
			});

			it('xf_concat is used as the array source of another xf_map', () => {
				const src = {
					data: {
						one: 'one',
						two: 'two',
						three: 'three',
					},
					numbers: [1, 2, 3],
				};
				const xf_map = [
					'xf_map',
					[
						'xf_concat',
						'@/numbers',
						'@/data/one',
						'@/data/two',
						'@/data/three',
					],
					['xf_pick', '$'], // just use xf_pick as identity function
				];
				const result = resolve(xf_map, {}, [], src);
				expect(result).toBeInstanceOf(Transform);
				expect(result.value).toEqual([1, 2, 3, 'one', 'two', 'three']);
			});
		});

		describe('references as an xf_map source', () => {
			it('absolute string reference', () => {
				const src = {
					nesting: {
						names: ['xf_map', '@/users', ['xf_pick', '$', ['name']]],
					},
					users: [{ name: 'Alice' }, { name: 'Frank' }, { name: 'Zorp' }],
				};
				const result = resolve(src);
				expect(result.nesting.names).toBeInstanceOf(Transform);
				expect(result.nesting.names.value).toEqual(['Alice', 'Frank', 'Zorp']);
			});

			it('absolute array reference', () => {
				const variables = {
					object_type: 'client_client',
				};
				const src = {
					nesting: {
						names: [
							'xf_map',
							['@@/users', '$object_type'],
							['xf_pick', '$', ['name']],
						],
					},
					users: {
						client_client: [
							{ name: 'Alice' },
							{ name: 'Frank' },
							{ name: 'Zorp' },
						],
					},
				};
				const result = resolve(src, variables);
				expect(result.nesting.names).toBeInstanceOf(Transform);
				expect(result.nesting.names.value).toEqual(['Alice', 'Frank', 'Zorp']);
			});

			it('relative string reference', () => {
				const src = {
					names: ['xf_map', '@users', ['xf_pick', '$', ['name']]],
					users: [{ name: 'Alice' }, { name: 'Frank' }, { name: 'Zorp' }],
				};
				const result = resolve(src);
				expect(result.names).toBeInstanceOf(Transform);
				expect(result.names.value).toEqual(['Alice', 'Frank', 'Zorp']);
			});

			it('relative array reference', () => {
				const variables = {
					object_type: 'client_client',
				};
				const src = {
					nesting: {
						users: {
							client_client: [
								{ name: 'Alice' },
								{ name: 'Frank' },
								{ name: 'Zorp' },
							],
						},
						names: [
							'xf_map',
							['@@users', '$object_type'],
							['xf_pick', '$', ['name']],
						],
					},
				};
				const result = resolve(src, variables);
				expect(result.nesting.names).toBeInstanceOf(Transform);
				expect(result.nesting.names.value).toEqual(['Alice', 'Frank', 'Zorp']);
			});
		});

		it('map with object definition', () => {
			const variables = {
				users: [
					{ first_name: 'Alice', last_name: 'Smith' },
					{ first_name: 'Frank', last_name: 'Smith' },
					{ first_name: 'Zorp', last_name: 'Smith' },
				],
			};
			const src = {
				names: [
					'xf_map',
					'$users',
					{
						full_name: [
							'xf_join',
							['xf_pick', '$', ['first_name']],
							' ',
							['xf_pick', '$', ['last_name']],
						],
					},
				],
			};
			const result = resolve(src, variables);
			expect(result.names).toBeInstanceOf(Transform);
			expect(result.names.value).toEqual([
				{ full_name: 'Alice Smith' },
				{ full_name: 'Frank Smith' },
				{ full_name: 'Zorp Smith' },
			]);
		});

		it('a reference used in a mapper does not pollute the source object at the current location', () => {
			const vars = {
				users: [{ name: 'Alice' }, { name: 'Frank' }, { name: 'Zorp' }],
			};
			const xf_map = [
				'xf_map',
				['xf_map', '$users', ['xf_pick', '$', ['name']]],
				{
					data: ['xf_join', '@/prefix', '$'],
				},
			];
			const src = {
				prefix: '__',
				nesting: {
					names: xf_map,
				},
			};
			const result = resolve(src, vars);
			expect(result.nesting.names).toBeInstanceOf(Transform);
			expect(result.nesting.names.value).toEqual([
				{ data: '__Alice' },
				{ data: '__Frank' },
				{ data: '__Zorp' },
			]);
			expect(result.nesting.prefix).toBeUndefined();
		});
	});

	describe('xf_pick', () => {
		it('returns the nested path value', () => {
			const src = { data: { array: ['one', 'two'] } };
			const xf_pick = ['xf_pick', '@/data', ['array', 1]];
			const result = resolve(xf_pick, {}, [], src);
			expect(result).toBeInstanceOf(Transform);
			expect(result.value).toBe('two');
		});

		it('returns the source value when there is no second argument', () => {
			const src = { data: 'data' };
			const xf_pick = ['xf_pick', '@/data'];
			const result = resolve(xf_pick, {}, [], src);
			expect(result).toBeInstanceOf(Transform);
			expect(result.value).toBe('data');
		});

		it('returns the source value when the second argument is an empty array', () => {
			const src = { data: 'data' };
			const xf_pick = ['xf_pick', '@/data', []];
			const result = resolve(xf_pick, {}, [], src);
			expect(result).toBeInstanceOf(Transform);
			expect(result.value).toBe('data');
		});
	});

	describe('xf_some', () => {
		it('boolean result transfrom as the comparator function', () => {
			const vars = {
				users: [{ name: 'Alice' }, { name: 'Frank' }, { name: 'Zorp' }],
			};
			const ctx = { currentLocation: [], vars, root: {} };
			const result = transform(
				['xf_some', '$users', ['xf_eq', ['xf_pick', '$', ['name']], 'Zorp']],
				ctx,
			);
			expect(result).toBe(true);
		});

		it('absolute reference as the comparator', () => {
			const root = { data: 'Frank' };
			const ctx = { currentLocation: [], root, vars: {} };
			const result = transform(
				['xf_some', ['Alice', 'Frank', 'Zorp'], '@/data'],
				ctx,
			);
			expect(result).toBe(true);
		});

		it('relative reference as the comparator', () => {
			const root = {
				nesting: { data: 'Frank', xf: 'xf location...' },
			};
			const ctx = { currentLocation: ['nesting', 'xf'], root, vars: {} };
			const result = transform(
				['xf_some', ['Alice', 'Frank', 'Zorp'], '@data'],
				ctx,
			);
			expect(result).toBe(true);
		});
	});
});
