import { extend } from '../extend';

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
		test('plain objects are returned and merged', () => {
			const src = {
				xf_inherit: [{ two: 'two', three: 'three' }],
				one: 'one',
			};
			const extended = extend(src);
			const result = withoutXFKeys(extended);
			expect(result).toEqual({
				one: 'one',
				two: 'two',
				three: 'three',
			});
		});

		test('references are resolved (with a variable)', () => {
			const src = {
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
			const extended = extend(src, vars);
			const result = withoutXFKeys(extended.config);
			expect(result).toEqual({
				one: 'one',
				two: 'two',
				three: 'three',
			});
		});

		test('transforms are resolved', () => {
			const src = {
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
			const extended = extend(src);
			const result = withoutXFKeys(extended);
			expect(result).toEqual({ one: 'one', two: 'two', three: 'three' });
		});

		test('a transform can return a reference and both are resolved', () => {
			const src = {
				shared_config: {
					share_property: 'shared!',
				},
				config: {
					xf_inherit: [['xf_eq', 1, 1, '@/shared_config']],
					one: 'one',
				},
			};
			const extended = extend(src);
			const result = withoutXFKeys(extended.config);
			expect(result).toEqual({ share_property: 'shared!', one: 'one' });
		});

		test('inherited configs are overridden', () => {
			const src = {
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
			const extended = extend(src);
			const result = withoutXFKeys(extended);
			expect(result).toEqual({ one: 'one', two: 'two', three: 'three' });
		});
	});

	describe('xf_extend', () => {
		test('values applied from xf_extend override existing values', () => {
			const src = {
				one: 'one',
				two: 'two',
				three: 'three',
				xf_extend: [['xf_eq', 1, 1, { one: 1, two: 2 }]],
			};
			const extended = extend(src);
			const result = withoutXFKeys(extended);
			expect(result).toEqual({ one: 1, two: 2, three: 'three' });
		});
	});

	test('xf_extend values override those applied in from xf_inherit', () => {
		const src = {
			three: 3,
			xf_extend: [['xf_eq', 1, 1, { one: 1, two: 2 }]],
			xf_inherit: [['xf_eq', 1, 1, { one: 'one', two: 'two' }]],
		};
		const extended = extend(src);
		const result = withoutXFKeys(extended);
		expect(result).toEqual({ one: 1, two: 2, three: 3 });
	});
});
