import { describe, expect, it } from 'vitest';
import { extend } from '../extend';
import { defContext } from '../resolve';

const withoutKeys = (
	object: Record<string, any>,
	keys: string[],
): Record<string, any> => {
	return Object.entries(object).reduce<Record<string, any>>((acc, [k, v]) => {
		if (!keys.includes(k)) {
			acc[k] = v;
		}
		return acc;
	}, {});
};

const withoutXFKeys = (object: Record<string, any>) => {
	return withoutKeys(object, ['xf_extend', 'xf_inherit']);
};

describe('extend', () => {
	describe('xf_inherit', () => {
		it('plain objects are returned and merged', () => {
			const root = {
				xf_inherit: [{ two: 'two', three: 'three' }],
				one: 'one',
			};
			const extended = extend(root, defContext({ root }));
			const result = withoutXFKeys(extended);
			expect(result).toEqual({
				one: 'one',
				two: 'two',
				three: 'three',
			});
		});

		it('references are resolved (with a variable)', () => {
			const root = {
				lookup: {
					client_client: {
						two: 'two',
						three: 'three',
					},
				},
				config: {
					xf_inherit: [['@@/lookup', '$object_type']],
					one: 'one',
				},
			};
			const vars = { object_type: 'client_client' };
			const extended = extend(root, defContext({ vars, root }));
			const result = withoutXFKeys(extended.config);
			expect(result).toEqual({
				one: 'one',
				two: 'two',
				three: 'three',
			});
		});

		it('transforms are resolved', () => {
			const root = {
				xf_inherit: [
					[
						'xf_not_eq',
						1,
						'one',
						{
							two: 'two',
							three: 'three',
						},
					],
				],
				one: 'one',
			};
			const extended = extend(root, defContext({ root }));
			const result = withoutXFKeys(extended);
			expect(result).toEqual({ one: 'one', two: 'two', three: 'three' });
		});

		it('a transform can return a reference and both are resolved', () => {
			const root = {
				shared_config: {
					share_property: 'shared!',
				},
				config: {
					xf_inherit: [['xf_eq', 1, 1, '@/shared_config']],
					one: 'one',
				},
			};
			const extended = extend(root, defContext({ root }));
			const result = withoutXFKeys(extended.config);
			expect(result).toEqual({ share_property: 'shared!', one: 'one' });
		});

		it('inherited configs are overridden', () => {
			const root = {
				xf_inherit: [
					[
						'xf_some',
						[1, 2, 3],
						3,
						{
							one: 1,
							two: 2,
						},
					],
				],
				one: 'one',
				two: 'two',
				three: 'three',
			};
			const extended = extend(root, defContext({ root }));
			const result = withoutXFKeys(extended);
			expect(result).toEqual({ one: 'one', two: 'two', three: 'three' });
		});
	});

	describe('xf_extend', () => {
		it('values applied from xf_extend override existing values', () => {
			const root = {
				one: 'one',
				two: 'two',
				three: 'three',
				xf_extend: [['xf_eq', 1, 1, { one: 1, two: 2 }]],
			};
			const extended = extend(root, defContext({ root }));
			const result = withoutXFKeys(extended);
			expect(result).toEqual({ one: 1, two: 2, three: 'three' });
		});
	});

	it('xf_extend values override those applied in from xf_inherit', () => {
		const root = {
			three: 3,
			xf_extend: [['xf_eq', 1, 1, { one: 1, two: 2 }]],
			xf_inherit: [['xf_eq', 1, 1, { one: 'one', two: 'two' }]],
		};
		const extended = extend(root, defContext({ root }));
		const result = withoutXFKeys(extended);
		expect(result).toEqual({ one: 1, two: 2, three: 3 });
	});
});
