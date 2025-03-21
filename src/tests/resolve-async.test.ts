import { describe, expect, it } from 'vitest';
import { Resource, UNRESOLVED } from '../api';
import { resolveAsync } from '../index';
import { toPlainObject } from '../utils';

const wait = (ms: number) => {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
};

const buildFetchResource = (data: any) => {
	return async () => {
		await wait(20);
		return Promise.resolve(data);
	};
};

describe('resolveAsync', () => {
	it('resolves a simple resource (new resources add themselves as a task)', async () => {
		const resourceData = { testing: 123 };
		const fetchResource = buildFetchResource(resourceData);
		const root = {
			resource: {
				method: 'GET',
				path: 'https://api.example.com/get/my/data',
			},
		};

		const resolved = await resolveAsync(root, { fetchResource });
		const plain = toPlainObject(resolved);
		expect(plain.resource).toEqual(resourceData);
	});

	it('resolves a resources on the second call to resolveAsync', async () => {
		const resourceData = { testing: 123 };
		const fetchResource = buildFetchResource(resourceData);
		const variables = { path: '/get/my/data' };
		const root = {
			resource: {
				method: 'GET',
				path: ['xf_join', 'https://api.example.com', '$path'],
			},
		};

		let resolved = await resolveAsync(root, { fetchResource });
		expect(resolved.resource).toBeInstanceOf(Resource);
		expect(resolved.resource.value).toBe(UNRESOLVED);

		resolved = await resolveAsync(resolved, { variables, fetchResource });
		const plain = toPlainObject(resolved);
		expect(plain.resource).toEqual(resourceData);
	});

	it('xf_map uses a reference to a resource as its source argument', async () => {
		const resourceData = [
			{ name: 'Alice' },
			{ name: 'Frank' },
			{ name: 'Zorp' },
		];
		const fetchResource = buildFetchResource(resourceData);
		const root = {
			resource: {
				method: 'GET',
				path: 'https://api.example.com/users',
			},
			names: ['xf_map', '@/resource', ['xf_pick', '$', ['name']]],
		};

		const result = await resolveAsync(root, { fetchResource });
		const plain = toPlainObject(result);
		expect(plain.names).toEqual(['Alice', 'Frank', 'Zorp']);
	});
});
