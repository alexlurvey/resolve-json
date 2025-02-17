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
	vars: Record<string, any> = {},
): any => {
	const context = defContext({ root, vars });

	return r(root, context);
};

export const resolveAt = (
	root: Resolvable | Resolvable[],
	path: (string | number)[],
	vars: Record<string, any> = {},
): any => {
	const context = defContext({ root, vars, currentLocation: path });

	return rAt(root, path, context);
};

export const resolveAsync = async (
	root: Resolvable | Resolvable[],
	vars: Record<string, any> = {},
): Promise<any> => {
	const context = defContextAsync({ root, vars });

	return rAsync(root, context);
};

export const resolveAtAsync = (
	root: Resolvable | Resolvable[],
	path: (string | number)[],
	vars: Record<string, any> = {},
): any => {
	const context = defContextAsync({ root, vars, currentLocation: path });

	return rAtAsync(root, path, context);
};
