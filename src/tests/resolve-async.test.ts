import { describe, expect, it } from 'vitest';
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

		const root = {
			resource: {
				method: 'GET',
				path: 'https://api.example.com/get/my/data',
			},
		};

		const resolved = await resolveAsync(root, {
			fetchResource: buildFetchResource(resourceData),
		});

		const plain = toPlainObject(resolved);

		expect(plain.resource).toEqual(resourceData);
	});
});
