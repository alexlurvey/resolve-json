import get from 'lodash/get';
import set from 'lodash/set';
import {
	UNRESOLVED,
	Reference,
	Transform,
	Variable,
	type AbsoluteArray,
	type AbsoluteString,
	type IResolvable,
	type Path,
	type ReferenceDef,
	type ReferencePathPart,
	type RelativeArray,
	type RelativeString,
	type ResolveContext,
	type TransformDef,
	type VariableArray,
	type VariableString,
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
	isVariableArray,
	isVariableString,
} from './checks';
import { transform } from './transform';
import { deref } from './utils';

type ExpandResult = {
	// TOOD: with transforms and references being equal, path name is now confusing/inaccurate
	// For transforms, these are arguments (which _could_ be something other than string | number)
	path: Path;
	references: IResolvable[];
};

const shouldLog = (ctx: ResolveContext) => {
	if (!ctx.debugScope) {
		return false;
	}

	for (const [i, v] of ctx.debugScope.entries()) {
		if (v !== ctx.currentLocation[i]) {
			return false;
		}
	}

	return true;
};

const __LOG__ = (ref: any, ctx: ResolveContext) => {
	if (shouldLog(ctx)) {
		console.log('resolving: ', ref);
		console.log('ctx: ', ctx);
	}
};

const isCurrentLocationVisited = (ctx: ResolveContext) => {
	return isResolvable(get(ctx.root, ctx.currentLocation));
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

const getInRoot = (root: any, path: Path, vars: Record<string, string>) => {
	const n = path.length - 1;
	const currentLocation: Path = [];
	let res = root;

	for (let i = 0; res != null && i <= n; i++) {
		res = res[path[i]];
		currentLocation.push(path[i]);
		const ctx = { currentLocation, root, vars };

		if (res instanceof Reference) {
			res = res.value;
		} else if (res instanceof Transform) {
			res = res.value;
		} else if (isVariableString(res)) {
			res = vars[res.slice(1)];
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
	const path: Path = [];
	const references: IResolvable[] = [];

	for (const part of parts) {
		if (isTransform(part)) {
			const xf = new Transform(part, currentLocation);
			const [xform, ...args] = part;
			const expanded = resolveArgs(args, ctx);

			if (expanded.references.length) {
				xf.setReferences(expanded.references);
			}

			if (canTransform(expanded.path)) {
				const v = transform([xform, ...expanded.path], ctx);
				if (v !== undefined) {
					xf.setValue(v);
					path.push(v);
				} else {
					path.push(UNRESOLVED);
				}
			} else {
				path.push(UNRESOLVED);
			}

			references.push(xf);
		} else if (isAbsoluteString(part)) {
			const expanded = expandRef(part, ctx);
			if (isValidPath(expanded.path)) {
				const v = getInRoot(root, expanded.path, vars);
				references.push(
					new Reference(part, currentLocation, {
						abs_path: expanded.path,
						value: v,
					}),
				);
				path.push(v ?? UNRESOLVED);
			} else {
				path.push(UNRESOLVED);
			}
		} else if (isRelativeString(part)) {
			const expanded = expandRef(part, ctx);
			if (isValidPath(expanded.path)) {
				const v = getInRoot(root, expanded.path, vars);
				references.push(
					new Reference(part, currentLocation, {
						abs_path: expanded.path,
						value: v,
					}),
				);
				path.push(v ?? UNRESOLVED);
			} else {
				path.push(UNRESOLVED);
			}
		} else if (isVariableString(part)) {
			const k = part === '$' ? part : part.substring(1);
			path.push(vars[k] ?? UNRESOLVED);
		} else if (isVariableArray(part)) {
			const [v, ...args] = part;
			const key = v === '$' ? '$' : v.slice(1);
			const resolved = resolveArgs(args, ctx);

			if (isValidPath(resolved.path)) {
				const v = get(vars[key], resolved.path);
				references.push(new Variable(part, currentLocation, { value: v }));
				path.push(v);
			} else {
				path.push(UNRESOLVED);
			}
		} else if (isAbsoluteArray(part)) {
			const expanded = expandRef(part, ctx);
			if (isValidPath(expanded.path)) {
				const v = getInRoot(root, expanded.path, vars);
				references.push(
					new Reference(part, currentLocation, {
						abs_path: expanded.path,
						value: v,
						references: expanded.references,
					}),
				);
				path.push(v ?? UNRESOLVED);
			} else {
				path.push(UNRESOLVED);
			}
		} else if (isRelativeArray(part)) {
			const expanded = expandRef(part, ctx);
			if (isValidPath(expanded.path)) {
				const v = getInRoot(root, expanded.path, vars);
				references.push(
					new Reference(part, currentLocation, {
						abs_path: expanded.path,
						value: v,
						references: expanded.references,
					}),
				);

				path.push(v);
			} else {
				path.push(UNRESOLVED);
			}
		} else {
			path.push(part);
		}
	}

	return { path, references };
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
	if (isAbsoluteString(ref)) {
		return { path: pathFromString(ref), references: [] };
	}

	if (isAbsoluteArray(ref)) {
		const [start, ...rest] = ref;
		const { path: p2, references } = resolveArgs(rest, ctx);
		const p1 = pathFromString(start);
		return { path: [...p1, ...p2], references };
	}

	if (isRelativeString(ref)) {
		const p1 = ctx.currentLocation.slice(0, -1);
		const p2 = pathFromString(ref);
		return { path: absPath(...p1, ...p2), references: [] };
	}

	if (isRelativeArray(ref)) {
		const [start, ...rest] = ref;
		const { path: p3, references } = resolveArgs(rest, ctx);
		const p1 = ctx.currentLocation.slice(0, -1);
		const p2 = pathFromString(start);

		return {
			path: absPath(...p1, ...p2, ...p3),
			references,
		};
	}

	return { path: [], references: [] };
};

const resolveRef = (
	ref: Reference | ReferenceDef,
	ctx: ResolveContext,
	mutateRoot = true,
) => {
	const reference =
		ref instanceof Reference ? ref : new Reference(ref, ctx.currentLocation);

	__LOG__(ref, ctx);

	if (mutateRoot && !isCurrentLocationVisited(ctx)) {
		set(ctx.root, ctx.currentLocation, reference);
	}

	const resolved = expandRef(reference.definition, ctx);

	if (resolved.references.length) {
		reference.setReferences(resolved.references);
	}

	if (isValidPath(resolved.path)) {
		const v = getInRoot(ctx.root, resolved.path, ctx.vars);
		if (v) {
			reference.setValue(v);
			reference.setAbsPath(resolved.path);
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

	__LOG__(xform, ctx);

	if (mutateRoot && !isCurrentLocationVisited(ctx)) {
		set(ctx.root, ctx.currentLocation, trans);
	}

	if (
		isMapTransform(trans.definition) ||
		isSomeTransform(trans.definition) ||
		isFirstTransform(trans.definition)
	) {
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

	if (canTransform(resolved.path)) {
		const v = transform([xf, ...resolved.path], ctx);
		if (v !== undefined) {
			trans.setValue(v);
		}
	}

	return trans;
};

const resolveVariable = (
	def: Variable | VariableString | VariableArray,
	ctx: ResolveContext,
	mutateRoot = true,
) => {
	__LOG__(def, ctx);

	const getKey = (x: string) => (x === '$' ? '$' : x.substring(1));

	const variable =
		def instanceof Variable ? def : new Variable(def, ctx.currentLocation);

	const lookup = isVariableString(variable.definition)
		? variable.definition
		: variable.definition[0];

	const value = ctx.vars[getKey(lookup)] ?? UNRESOLVED;

	if (isVariableArray(variable.definition)) {
		const [_, ...args] = variable.definition;

		const resolved = resolveArgs(args, ctx);

		if (isValidPath(resolved.path)) {
			variable.setValue(get(value, resolved.path));
		}

		if (resolved.references) {
			variable.setReferences(resolved.references);
		}
	} else {
		variable.setValue(value);
	}

	if (mutateRoot && !isCurrentLocationVisited(ctx)) {
		set(ctx.root, ctx.currentLocation, variable);
	}

	return variable;
};

const resolveObject = (obj: any, ctx: ResolveContext) => {
	for (const k in obj) {
		if (isResolvable(obj[k]) && obj[k].value !== UNRESOLVED) {
			continue;
		}

		const downLevelCtx = {
			...ctx,
			currentLocation: [...ctx.currentLocation, k],
		};

		if (
			obj[k] instanceof Variable ||
			isVariableString(obj[k]) ||
			isVariableArray(obj[k])
		) {
			resolveVariable(obj[k], downLevelCtx);
		} else if (obj[k] instanceof Transform || isTransform(obj[k])) {
			resolveTransform(obj[k], downLevelCtx);
		} else if (obj[k] instanceof Reference || isRef(obj[k])) {
			resolveRef(obj[k], downLevelCtx);
		} else if (Array.isArray(obj[k])) {
			resolveArray(obj[k], downLevelCtx);
		} else if (isRecord(obj[k])) {
			obj[k] = resolveObject(obj[k], downLevelCtx);
		}
	}

	return obj;
};

const resolveArray = (arr: any[], ctx: ResolveContext) => {
	for (let i = 0; i < arr.length; i++) {
		if (isResolvable(arr[i])) {
			continue;
		}
		const currentLocation = [...ctx.currentLocation, i];
		const v = resolve(arr[i], ctx.vars, currentLocation, ctx.root);
		set(ctx.root, currentLocation, v);
	}
	return arr;
};

export const resolve = (
	obj: any,
	vars: Record<string, any> = {},
	path: Path = [],
	root?: any,
	debugScope?: string[],
) => {
	root = root || obj;
	const ctx = { currentLocation: path, root, vars, debugScope };

	if (isVariableString(obj) || isVariableArray(obj)) {
		return resolveVariable(obj, ctx);
	}

	if (isTransform(obj)) {
		return resolveTransform(obj, ctx);
	}

	if (isRef(obj)) {
		return resolveRef(obj, ctx);
	}

	if (isRecord(obj)) {
		return resolveObject(obj, ctx);
	}

	if (Array.isArray(obj)) {
		return resolveArray(obj, ctx);
	}

	return obj;
};

const resolveObjectImmediate = (obj: any, ctx: ResolveContext) => {
	const result: Record<string, any> = {};

	for (const k in obj) {
		const resolved = resolveImmediate(
			obj[k],
			ctx.vars,
			[...ctx.currentLocation, k],
			ctx.root,
		);

		result[k] = deref(resolved);
	}

	return result;
};

const resolveArrayImmediate = (array: any[], ctx: ResolveContext) => {
	const result: any[] = [];

	for (const x of array) {
		const resolved = resolveImmediate(x, ctx.vars, [], ctx.root);

		result.push(deref(resolved));
	}

	return result;
};

export const resolveImmediate = (
	obj: any,
	vars: Record<string, any> = {},
	path: Path = [],
	root?: any,
) => {
	root = root || obj;
	const ctx = { currentLocation: path, root, vars };

	if (isVariableString(obj) || isVariableArray(obj)) {
		return resolveVariable(obj, ctx, false);
	}

	if (isTransform(obj)) {
		return resolveTransform(obj, ctx, false);
	}

	if (isRef(obj)) {
		return resolveRef(obj, ctx, false);
	}

	if (isRecord(obj)) {
		return resolveObjectImmediate(obj, ctx);
	}

	if (Array.isArray(obj)) {
		return resolveArrayImmediate(obj, ctx);
	}

	return obj;
};
