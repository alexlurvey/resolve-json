import type { Resolvable } from './api';
import { resolve as r, resolveAt as ra } from './resolve';

export { toPlainObject } from './utils';

export const resolve = (
	source: Resolvable | Resolvable[],
	variables: Record<string, any> = {},
): any => {
	return r(source, variables);
};

export const resolveAt = (
	source: Resolvable | Resolvable[],
	path: (string | number)[],
	variables: Record<string, any> = {},
): any => {
	return ra(source, path, variables);
};
