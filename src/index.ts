import type { Resolvable } from './api';
import { defContext, resolve as r, resolveAt as rAt } from './resolve';

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
