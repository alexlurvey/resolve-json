import type { NumOrString } from '@thi.ng/api/prim';
import { getInUnsafe } from '@thi.ng/paths/get-in';
import { mutInUnsafe } from '@thi.ng/paths/mut-in';
import { UNRESOLVED, Reference, Transform, Variable } from './api';
import type {
	AbsoluteArray,
	AbsoluteString,
	IResolvable,
	Path,
	PickPartial,
	ReferenceDef,
	ReferencePathPart,
	RelativeArray,
	RelativeString,
	Resolvable,
	ResolveContext,
	TransformDef,
	VariableString,
} from './api';
import {
	isAbsoluteArray,
	isAbsoluteString,
	isFirstTransform,
	isMapTransform,
	isRecord,
	isRef,
	isRelativeArray,
	isRelativeString,
	isResolvable,
	isSomeTransform,
	isTransform,
	isValidPath,
	isVariableString,
} from './checks';
import { transform } from './transform';
import { deref } from './utils';

type ExpandResult = {
	values: any[];
	references: IResolvable[];
};

const pathFromString = (
	def: AbsoluteString | RelativeString | AbsoluteArray[0] | RelativeArray[0],
): string[] => {
	if (def.startsWith('@@/')) {
		return def.substring(3).split('/').filter(Boolean);
	}
	if (def.startsWith('@@') || isAbsoluteString(def)) {
		return def.substring(2).split('/').filter(Boolean);
	}
	if (isRelativeString(def)) {
		return def.substring(1).split('/').filter(Boolean);
	}
	return [];
};

const absPath = (...path: Path) => {
	return path.reduce<Path>((acc, part) => {
		if (part === '.') {
			return acc;
		}
		if (part === '..') {
			if (!acc.length) {
				throw Error(`Invalid path ${path.join('/')}`);
			}
			return acc.slice(0, -1);
		}
		acc.push(part);
		return acc;
	}, []);
};

const getInRoot = (root: any, path: NumOrString[], rctx: ResolveContext) => {
	const n = path.length - 1;
	const currentLocation: NumOrString[] = [];
	let res = root;

	for (let i = 0; res != null && i <= n; i++) {
		res = res[path[i]];
		currentLocation.push(path[i]);
		const ctx: ResolveContext = { ...rctx, currentLocation };

		if (res instanceof Reference) {
			if (res.value === UNRESOLVED) {
				resolveRef(res, ctx);
			}
			res = res.value;
		} else if (res instanceof Transform) {
			if (res.value === UNRESOLVED) {
				resolveTransform(res, ctx);
			}
			res = res.value;
		} else if (res instanceof Variable) {
			if (res.value === UNRESOLVED) {
				resolveVariable(res, ctx);
			}
			res = res.value;
		} else if (isVariableString(res)) {
			res = ctx.vars[res.slice(1)];
		} else if (isRef(res)) {
			const resolved = resolveRef(res, ctx);
			res = resolved.value;
		} else if (isTransform(res)) {
			const resolved = resolveTransform(res, ctx);
			res = resolved.value;
		} else if (Array.isArray(res)) {
			res = resolveArray(res, ctx);
		}
	}

	return res;
};

/**
 * Resovler called on transforms and array forms of absolute/relative
 * references to collect the dependent references/transforms and the
 * current (possibly unresolved) values/arguments.
 */
const resolveArgs = (
	refs: ReferencePathPart | ReferencePathPart[],
	ctx: ResolveContext,
): ExpandResult => {
	const values = [];
	const references: IResolvable[] = [];
	const args = Array.isArray(refs) ? refs : [refs];

	for (const [idx, part] of Object.entries(args)) {
		const next_ctx = {
			...ctx,
			currentLocation: [...ctx.currentLocation, Number.parseInt(idx)],
		};

		if (isVariableString(part)) {
			const k = part === '$' ? part : part.substring(1);
			values.push(ctx.vars[k] ?? UNRESOLVED);
		} else if (isTransform(part)) {
			const xf = resolveTransform(part, next_ctx, false);
			values.push(xf.value);
			references.push(xf);
		} else if (
			isAbsoluteString(part) ||
			isRelativeString(part) ||
			isAbsoluteArray(part) ||
			isRelativeArray(part)
		) {
			const ref = resolveRef(part, next_ctx, false);
			values.push(ref.value);
			references.push(ref);
		} else {
			values.push(part);
		}
	}

	return { values, references };
};

/**
 * Similar to `resolveArgs` (which is used here) but specific to References.
 * Relative references are converted into their absolute path - which is
 * what `ExpandResult['values']` represents here.
 */
const expandRef = (ref: ReferenceDef, ctx: ResolveContext): ExpandResult => {
	const isInArray = typeof ctx.currentLocation.at(-1) === 'number';

	if (isAbsoluteString(ref)) {
		const path = pathFromString(ref);
		const value = resolveAt(ctx.root, path, ctx);

		if (isResolvable(value)) {
			return { values: path, references: [value] };
		}

		return { values: path, references: [] };
	}

	if (isAbsoluteArray(ref)) {
		const [start, ...rest] = ref;
		const { values: p2, references } = resolveArgs(rest, ctx);
		const p1 = pathFromString(start);
		return { values: [...p1, ...p2], references };
	}

	if (isRelativeString(ref)) {
		const p1 = ctx.currentLocation.slice(0, isInArray ? -2 : -1);
		const p2 = pathFromString(ref);
		const path = absPath(...p1, ...p2);

		if (isValidPath(path)) {
			const value = resolveAt(ctx.root, path, ctx);

			if (isResolvable(value)) {
				return { values: path, references: [value] };
			}
		}

		return { values: path, references: [] };
	}

	if (isRelativeArray(ref)) {
		const [start, ...rest] = ref;
		const { values: p3, references } = resolveArgs(rest, ctx);
		const p1 = ctx.currentLocation.slice(0, isInArray ? -2 : -1);
		const p2 = pathFromString(start);

		return {
			values: absPath(...p1, ...p2, ...p3),
			references,
		};
	}

	return { values: [], references: [] };
};

const resolveRef = (
	ref: Reference | ReferenceDef,
	ctx: ResolveContext,
	mutateRoot = true,
) => {
	const isVisited = ref instanceof Reference;
	const def = isVisited ? ref.definition : ref;
	const resolved = expandRef(def, ctx);
	const hasValidPath = isValidPath(resolved.values);

	let value: any;

	if (hasValidPath) {
		value = getInRoot(ctx.root, resolved.values, ctx);
	}

	if (isVisited) {
		if (hasValidPath && value !== undefined) {
			ref.setValue(value);
			ref.setAbsPath(resolved.values);
			ref.setReferences(resolved.references, ctx);
		}

		return ref;
	}

	const reference = new Reference(ref, ctx.currentLocation, ctx, {
		references: resolved.references,
		value,
		abs_path: hasValidPath ? resolved.values : UNRESOLVED,
	});

	if (mutateRoot) {
		mutInUnsafe(ctx.root, ctx.currentLocation, reference);
	}

	return reference;
};

const resolveArgsForTransform = (
	def: TransformDef,
	ctx: ResolveContext,
): ExpandResult => {
	if (isFirstTransform(def) || isMapTransform(def) || isSomeTransform(def)) {
		const resolved = resolveArgs([def[1]], ctx);

		return {
			references: resolved.references,
			values: [...resolved.values, ...def.slice(2)],
		};
	}

	return resolveArgs(def.slice(1), ctx);
};

const resolveTransform = (
	xform: Transform | TransformDef,
	ctx: ResolveContext,
	mutateRoot = true,
) => {
	const isVisited = xform instanceof Transform;
	const def = isVisited ? xform.definition : xform;
	const resolved = resolveArgsForTransform(def, ctx);
	const isReadyToTransform = resolved.values.every((x) => x !== UNRESOLVED);

	let value: any;

	if (isReadyToTransform) {
		value = transform([def[0], ...resolved.values], ctx);
	}

	if (isVisited) {
		if (isReadyToTransform && value !== undefined) {
			xform.setValue(value);
			xform.setReferences(resolved.references, ctx);
		}

		return xform;
	}

	const trans = new Transform(xform, ctx.currentLocation, ctx, {
		references: resolved.references,
		value,
	});

	if (mutateRoot) {
		mutInUnsafe(ctx.root, ctx.currentLocation, trans);
	}

	return trans;
};

const resolveVariable = (
	def: Variable | VariableString,
	ctx: ResolveContext,
	mutateRoot = true,
) => {
	const isVisited = def instanceof Variable;
	const definition = isVisited ? def.definition : def;
	const key = definition === '$' ? '$' : definition.substring(1);
	const value = ctx.vars[key] ?? UNRESOLVED;

	if (isVisited) {
		def.setValue(value);
		return def;
	}

	const variable = new Variable(def, ctx.currentLocation, ctx, { value });

	if (mutateRoot) {
		mutInUnsafe(ctx.root, ctx.currentLocation, variable);
	}

	return variable;
};

const resolveObject = (
	obj: Record<string, Resolvable>,
	ctx: ResolveContext,
): Record<string, Resolvable> => {
	if (isResolvable(obj)) {
		return obj;
	}

	for (const k in obj) {
		if (isResolvable(obj[k]) && obj[k].value !== UNRESOLVED) {
			continue;
		}

		const loc = [...ctx.currentLocation, k];
		ctx.resolve(obj[k], { ...ctx, currentLocation: loc });
	}

	return obj;
};

const resolveArray = (arr: Resolvable[], ctx: ResolveContext): Resolvable[] => {
	for (const [i, x] of arr.entries()) {
		if (isResolvable(x) && x.value !== UNRESOLVED) {
			continue;
		}
		const loc = [...ctx.currentLocation, i];
		ctx.resolve(arr[i], { ...ctx, currentLocation: loc });
	}
	return arr;
};

export const resolve = (
	obj: Resolvable | Resolvable[],
	context?: PickPartial<ResolveContext, 'root'>,
): any => {
	const ctx: ResolveContext = defContext({
		...context,
		root: context?.root ?? obj,
	});

	if (isVariableString(obj) || obj instanceof Variable) {
		return resolveVariable(obj, ctx);
	}

	if (isTransform(obj) || obj instanceof Transform) {
		return resolveTransform(obj, ctx);
	}

	if (isRef(obj) || obj instanceof Reference) {
		return resolveRef(obj, ctx);
	}

	if (Array.isArray(obj)) {
		return resolveArray(obj, ctx);
	}

	if (isRecord(obj)) {
		return resolveObject(obj, ctx);
	}

	return obj;
};

export const resolveAt = (
	root: Resolvable,
	path: NumOrString[],
	ctx: Omit<ResolveContext, 'currentLocation' | 'root'>,
): any => {
	const src = getInUnsafe(root, path);

	const result = resolve(src, { ...ctx, currentLocation: path, root });

	return result;
};

const resolveObjectImmediate = (
	obj: Record<string, Resolvable>,
	ctx: ResolveContext,
): Record<string, any> => {
	const result: Record<string, any> = {};

	for (const k in obj) {
		const loc = [...ctx.currentLocation, k];
		const resolved = resolveImmediate(obj[k], ctx.vars, loc, ctx.root);
		result[k] = deref(resolved);
	}

	return result;
};

const resolveArrayImmediate = (
	array: Resolvable[],
	ctx: ResolveContext,
): any[] => {
	const result: any[] = [];

	for (const [i, x] of array.entries()) {
		const loc = [...ctx.currentLocation, i];
		const resolved = resolveImmediate(x, ctx.vars, loc, ctx.root);
		result.push(deref(resolved));
	}

	return result;
};

export const resolveImmediate = (
	obj: Resolvable | Resolvable[],
	vars: Record<string, any> = {},
	path: NumOrString[] = [],
	root?: Resolvable | Resolvable[],
): any => {
	root = root || obj;

	const ctx: ResolveContext = {
		currentLocation: path,
		root,
		vars,
		resolve: resolveImmediate,
		resolveAt: resolveAt,
	};

	if (isVariableString(obj) || obj instanceof Variable) {
		return resolveVariable(obj, ctx, false);
	}

	if (isTransform(obj) || obj instanceof Transform) {
		const resolved = resolveTransform(obj, ctx, false);
		return resolveImmediate(resolved.value, vars);
	}

	if (isRef(obj) || obj instanceof Reference) {
		const resolved = resolveRef(obj, ctx, false);
		return resolveImmediate(resolved.value, vars);
	}

	if (Array.isArray(obj)) {
		return resolveArrayImmediate(obj, ctx);
	}

	if (isRecord(obj)) {
		return resolveObjectImmediate(obj, ctx);
	}

	return obj;
};

export const defContext = (
	ctx: Omit<
		PickPartial<ResolveContext, 'currentLocation' | 'vars'>,
		'resolve' | 'resolveAt'
	>,
): ResolveContext => {
	return {
		currentLocation: [],
		vars: {},
		resolve,
		resolveAt,
		...ctx,
	};
};
