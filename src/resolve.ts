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
	canTransform,
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

const isCurrentLocationVisited = (ctx: ResolveContext) => {
	return isResolvable(getInUnsafe(ctx.root, ctx.currentLocation));
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

const resolveArgs = (
	parts: ReferencePathPart[],
	ctx: ResolveContext,
): ExpandResult => {
	const { currentLocation, root, vars } = ctx;
	const values = [];
	const references: IResolvable[] = [];

	for (const part of parts) {
		if (isTransform(part)) {
			const xf = new Transform(part, currentLocation);
			const [xform, ...args] = part;
			const expanded = resolveArgs(args, ctx);

			if (expanded.references.length) {
				xf.setReferences(expanded.references);
			}

			if (canTransform(expanded.values)) {
				const v = transform([xform, ...expanded.values], ctx);
				if (v !== undefined) {
					xf.setValue(v);
					values.push(v);
				} else {
					values.push(UNRESOLVED);
				}
			} else {
				values.push(UNRESOLVED);
			}

			references.push(xf);
		} else if (isAbsoluteString(part)) {
			const expanded = expandRef(part, ctx);
			if (isValidPath(expanded.values)) {
				const v = getInRoot(root, expanded.values, ctx);
				references.push(
					new Reference(part, currentLocation, {
						abs_path: expanded.values,
						value: v,
						references: expanded.references,
					}),
				);
				values.push(v ?? UNRESOLVED);
			} else {
				values.push(UNRESOLVED);
			}
		} else if (isRelativeString(part)) {
			const expanded = expandRef(part, ctx);
			if (isValidPath(expanded.values)) {
				const v = getInRoot(root, expanded.values, ctx);
				references.push(
					new Reference(part, currentLocation, {
						abs_path: expanded.values,
						value: v,
						references: expanded.references,
					}),
				);
				values.push(v ?? UNRESOLVED);
			} else {
				values.push(UNRESOLVED);
			}
		} else if (isVariableString(part)) {
			const k = part === '$' ? part : part.substring(1);
			values.push(vars[k] ?? UNRESOLVED);
		} else if (isAbsoluteArray(part)) {
			const expanded = expandRef(part, ctx);
			if (isValidPath(expanded.values)) {
				const v = getInRoot(root, expanded.values, ctx);
				references.push(
					new Reference(part, currentLocation, {
						abs_path: expanded.values,
						value: v,
						references: expanded.references,
					}),
				);
				values.push(v ?? UNRESOLVED);
			} else {
				values.push(UNRESOLVED);
			}
		} else if (isRelativeArray(part)) {
			const expanded = expandRef(part, ctx);
			if (isValidPath(expanded.values)) {
				const v = getInRoot(root, expanded.values, ctx);
				references.push(
					new Reference(part, currentLocation, {
						abs_path: expanded.values,
						value: v,
						references: expanded.references,
					}),
				);

				values.push(v);
			} else {
				values.push(UNRESOLVED);
			}
		} else {
			values.push(part);
		}
	}

	return { values, references };
};

/**
 * Attempts to resolve the absolute path of a ReferenceDef. If an array
 * variant, nested references & transforms will be resolved and returned.
 *
 * @param ref - an absolute or relative reference (string or array variant)
 * @param ctx
 * @returns
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
	const reference =
		ref instanceof Reference ? ref : new Reference(ref, ctx.currentLocation);

	if (mutateRoot && !isCurrentLocationVisited(ctx)) {
		mutInUnsafe(ctx.root, ctx.currentLocation, reference);
	}

	const resolved = expandRef(reference.definition, ctx);

	if (resolved.references.length) {
		reference.setReferences(resolved.references);
	}

	if (isValidPath(resolved.values)) {
		const v = getInRoot(ctx.root, resolved.values, ctx);
		if (v) {
			reference.setValue(v);
			reference.setAbsPath(resolved.values);
		}
	}

	return reference;
};

const resolveTransform = (
	xform: Transform | TransformDef,
	ctx: ResolveContext,
	mutateRoot = true,
) => {
	const trans =
		xform instanceof Transform
			? xform
			: new Transform(xform, ctx.currentLocation);

	if (mutateRoot && !isCurrentLocationVisited(ctx)) {
		mutInUnsafe(ctx.root, ctx.currentLocation, trans);
	}

	if (
		isMapTransform(trans.definition) ||
		isSomeTransform(trans.definition) ||
		isFirstTransform(trans.definition)
	) {
		const expanded = resolveArgs([trans.definition[1]], ctx);

		if (expanded.references.length) {
			trans.setReferences(expanded.references);
		}

		const v = transform(trans.definition, ctx);
		if (v !== undefined) {
			trans.setValue(v);
		}
		return trans;
	}

	const [xf, ...args] = trans.definition;
	const resolved = resolveArgs(args, ctx);

	if (resolved.references.length) {
		trans.setReferences(resolved.references);
	}

	if (canTransform(resolved.values)) {
		const v = transform([xf, ...resolved.values], ctx);
		if (v !== undefined) {
			trans.setValue(v);
		}
	}

	return trans;
};

const resolveVariable = (
	def: Variable | VariableString,
	ctx: ResolveContext,
	mutateRoot = true,
) => {
	const variable =
		def instanceof Variable ? def : new Variable(def, ctx.currentLocation);

	const key =
		variable.definition === '$' ? '$' : variable.definition.substring(1);

	const value = ctx.vars[key] ?? UNRESOLVED;

	variable.setValue(value);

	if (mutateRoot && !isCurrentLocationVisited(ctx)) {
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
