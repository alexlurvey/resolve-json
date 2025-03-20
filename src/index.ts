import type { Resolvable } from './api';
import {
	defContext,
	defContextAsync,
	resolve as r,
	resolveAsync as rAsync,
	resolveAt as rAt,
	resolveAtAsync as rAtAsync,
} from './resolve';

export { toPlainObject } from './utils';

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
	variables: Record<string, any> = {},
): Promise<any> => {
	const context = defContextAsync(root, { variables });

	return rAsync(root, context);
};

export const resolveAtAsync = (
	root: Resolvable | Resolvable[],
	path: (string | number)[],
	variables: Record<string, any> = {},
): any => {
	const context = defContextAsync(root, { variables, currentLocation: path });

	return rAtAsync(root, path, context);
};
