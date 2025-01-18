import type { NumOrString } from '@thi.ng/api';
import { getInUnsafe } from '@thi.ng/paths/get-in';
import { format } from 'date-fns';
import type { ResolveContext, XF } from './api';
import { isBooleanResultTransform, isUnresovled } from './checks';
import { resolveImmediate } from './resolve';
import { deref } from './utils';

const bool = (...args: any[]) => {
	return args.every(Boolean);
};

const concat = (...args: any[]) => {
	return args.reduce((acc, x) => {
		if (Array.isArray(x)) {
			acc.push(...x.map(deref));
		} else {
			acc.push(deref(x));
		}
		return acc;
	}, []);
};

const dateFormat = (value: string, fmt: string) => {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : format(date, fmt);
};

const eq = (a: any, b: any, returnVal?: any) => {
	const isEqual = a === b;
	return Boolean(returnVal) && isEqual ? returnVal : isEqual;
};

const first = (refs: any[], resolver: (ref: any) => any) => {
	for (const ref of deref(refs)) {
		const resolved = resolver(ref);
		if (isBooleanResultTransform(resolved)) {
			if (resolved.value !== false) {
				return resolved.value;
			}
			continue;
		}

		const res = deref(resolved);
		if (!isUnresovled(res) && res !== undefined) {
			return res;
		}
	}
};

const hoist = (x: any) => {
	const v = Array.isArray(x) ? x[0] : x;
	return deref(v);
};

const invert = (x: any) => {
	return !x;
};

const join = (...args: any[]): any => {
	return args.filter((x) => x !== undefined && x !== null).join('');
};

export const map = (src: any[], resolver: ($: any) => any) => {
	return deref(src).map((x: any) => {
		return deref(resolver(x));
	});
};

const notEq = (a: any, b: any, returnVal?: any) => {
	const isNotEqual = a !== b;
	return Boolean(returnVal) && isNotEqual ? returnVal : isNotEqual;
};

const pick = (src: object, path?: NumOrString[]) => {
	if (path?.length) {
		return getInUnsafe(src, path);
	}
	return src;
};

const some = (src: any[], resolver: ($: any) => any, returnVal?: any) => {
	const result = deref(src).some((x: any) => {
		const resolved = resolver(x);

		if (isBooleanResultTransform(resolved)) {
			return resolved.value;
		}

		return deref(resolved) === x;
	});
	return Boolean(returnVal) && result ? returnVal : result;
};

export const transform = (def: [XF, ...any[]], ctx?: ResolveContext): any => {
	const { currentLocation = [], vars = {}, root = {} } = ctx ?? {};
	const [xform, ...args] = def;

	if (xform === 'xf_bool') {
		return bool(...args);
	}
	if (xform === 'xf_concat') {
		return concat(...args);
	}
	if (xform === 'xf_dateformat') {
		return dateFormat(args[0], args[1]);
	}
	if (xform === 'xf_eq') {
		return eq(args[0], args[1], args[2]);
	}
	if (xform === 'xf_first') {
		const resolver = ($: any) => {
			return resolveImmediate($, vars, currentLocation, root);
		};
		return first(args[0], resolver);
	}
	if (xform === 'xf_hoist') {
		return hoist(args[0]);
	}
	if (xform === 'xf_invert') {
		return invert(args[0]);
	}
	if (xform === 'xf_join') {
		return join(...args);
	}
	if (xform === 'xf_map') {
		const src = resolveImmediate(args[0], vars, currentLocation, root);

		if (isUnresovled(src)) {
			return undefined;
		}

		const resolver = ($: any) => {
			return resolveImmediate(args[1], { ...vars, $ }, currentLocation, root);
		};
		return map(src, resolver);
	}
	if (xform === 'xf_not_eq') {
		return notEq(args[0], args[1], args[2]);
	}
	if (xform === 'xf_pick') {
		return pick(args[0], args[1]);
	}
	if (xform === 'xf_some') {
		const src = resolveImmediate(args[0], vars, currentLocation, root);

		if (isUnresovled(src)) {
			return undefined;
		}

		const resolver = ($: any) => {
			return resolveImmediate(args[1], { ...vars, $ }, currentLocation, root);
		};
		return some(src, resolver, args[2]);
	}

	throw Error(`Unknown transform ${xform}`);
};
