import type { FetchOptions, Resolvable } from './api';
import {
	defContext,
	defContextAsync,
	resolve as r,
	resolveAsync as rAsync,
	resolveAt as rAt,
	resolveAtAsync as rAtAsync,
} from './resolve';

export { toPlainObject } from './utils';

type ResolveOptions = {
	variables?: Record<string, any>;
	fetchResource?: (opts: FetchOptions) => Promise<any>;
};

export const resolve = (
	root: Resolvable | Resolvable[],
	variables: Record<string, any> = {},
): any => {
	const context = defContext(root, { variables });

	return r(root, context);
};

export const resolveAt = (
	root: Resolvable | Resolvable[],
	path: (string | number)[],
	variables: Record<string, any> = {},
): any => {
	const context = defContext(root, { variables, currentLocation: path });

	return rAt(root, path, context);
};

export const resolveAsync = async (
	root: Resolvable | Resolvable[],
	options: ResolveOptions = {},
): Promise<any> => {
	const { variables = {}, fetchResource } = options;

	const context = defContextAsync(root, { variables, fetchResource });

	return rAsync(root, context);
};

export const resolveAtAsync = (
	root: Resolvable | Resolvable[],
	path: (string | number)[],
	options: ResolveOptions = {},
): any => {
	const { variables = {}, fetchResource } = options;

	const context = defContextAsync(root, {
		variables,
		currentLocation: path,
		fetchResource,
	});

	return rAtAsync(root, path, context);
};
