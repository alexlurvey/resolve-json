import type { ReferenceDef, ResolveContext, TransformDef } from './api';
import { isRecord, isRef, isTransform } from './checks';
import { resolve } from './resolve';
import { transform } from './transform';

const resolveToObject = (
	x: any,
	ctx: ResolveContext,
): Record<string, any> | null => {
	if (isRecord(x)) {
		return x;
	}

	if (isTransform(x)) {
		const transformed = transform(x, ctx);
		return resolveToObject(transformed, ctx);
	}

	if (isRef(x)) {
		const resolved = resolve(x, ctx);
		return resolveToObject(resolved.value, ctx);
	}

	return null;
};

const mergeXFs = (
	array: (ReferenceDef | TransformDef | Record<string, any>)[],
	ctx: ResolveContext,
): Record<string, any> => {
	if (!Array.isArray(array)) {
		return {};
	}

	return array.reduce<Record<string, any>>((acc, arg) => {
		const maybeObject = resolveToObject(arg, ctx);

		if (isRecord(maybeObject)) {
			for (const [k, v] of Object.entries(maybeObject)) {
				acc[k] = v;
			}
		}

		return acc;
	}, {});
};

/**
 * Recursively walks the provided object and resolves the transforms/references
 * contained within the `xf_inherit` and `xf_extend` arrays. `obj` _is_ mutated.
 * Provide a copy via [structuredClone](https://developer.mozilla.org/en-US/docs/Web/API/structuredClone)
 * if the original version needs to be maintained.
 */
export const extend = (
	obj: Record<string, any>,
	ctx: ResolveContext,
): Record<string, any> => {
	if (!isRecord(obj)) {
		return obj;
	}

	if ('xf_inherit' in obj) {
		const resolved = mergeXFs(obj.xf_inherit, ctx);
		obj = { ...resolved, ...obj };
	}

	if ('xf_extend' in obj) {
		const resolved = mergeXFs(obj.xf_extend, ctx);
		obj = { ...obj, ...resolved };
	}

	for (const key in obj) {
		if (isRecord(obj[key])) {
			obj[key] = extend(obj[key], {
				...ctx,
				currentLocation: [...ctx.currentLocation, key],
			});
		}
	}

	return obj;
};
