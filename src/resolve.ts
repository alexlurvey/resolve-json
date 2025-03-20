import type { NumOrString } from '@thi.ng/api/prim';
import { type Fiber, asPromise } from '@thi.ng/fibers';
import { getInUnsafe } from '@thi.ng/paths/get-in';
import { UNRESOLVED, Reference, Transform, Variable, Resource } from './api';
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
	ResourceDef,
	TransformDef,
	VariableString,
} from './api';
import {
	isAbsoluteArray,
	isAbsoluteString,
	isAsyncContext,
	isFirstTransform,
	isMapTransform,
	isRecord,
	isRef,
	isRelativeArray,
	isRelativeString,
	isResolvable,
	isResource,
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

const mutInRoot = (root: any, path: NumOrString[], value: any) => {
	const n = path.length - 1;
	let x = root;

	for (let i = 0; i < n; i++) {
		if (!x) {
			return;
		}

		x = x[path[i]];

		if (
			x instanceof Reference ||
			x instanceof Transform ||
			x instanceof Resource
		) {
			x = x.definition;
		}
	}

	x[path[n]] = value;
};

const getInRoot = (root: any, path: NumOrString[], rctx: ResolveContext) => {
	const n = path.length - 1;
	const currentLocation: NumOrString[] = [];
	let res = root;
	let ref = null;

	for (let i = 0; res != null && i <= n; i++) {
		res = res[path[i]];
		currentLocation.push(path[i]);
		const ctx: ResolveContext = { ...rctx, currentLocation };

		if (res instanceof Resource) {
			if (res.value !== UNRESOLVED) {
				res = res.value;
			}
		} else if (res instanceof Reference) {
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
		} else if (isResource(res)) {
			const resolved = resolveResource(res, ctx);
			ref = resolved;
			res = resolved.value;
		} else if (isVariableString(res)) {
			res = ctx.variables[res.slice(1)];
		} else if (isRef(res)) {
			const resolved = resolveRef(res, ctx);
			ref = resolved;
			res = resolved.value;
		} else if (isTransform(res)) {
			const resolved = resolveTransform(res, ctx);
			ref = resolved;
			res = resolved.value;
		} else if (Array.isArray(res)) {
			res = resolveArray(res, ctx);
		}
	}

	return { value: res, ref };
};

/**
 * Resovler called on transforms and array forms of absolute/relative
 * references to collect the dependent references/transforms and the
 * current (possibly unresolved) values/arguments.
 */
const resolveArgs = (
	args: ReferencePathPart[],
	ctx: ResolveContext,
): ExpandResult => {
	const values = [];
	const references: IResolvable[] = [];

	for (const [idx, part] of Object.entries(args)) {
		const next_ctx = {
			...ctx,
			currentLocation: [...ctx.currentLocation, Number.parseInt(idx)],
		};

		if (isVariableString(part)) {
			const k = part === '$' ? part : part.substring(1);
			values.push(ctx.variables[k] ?? UNRESOLVED);
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
		} else if (isResource(part)) {
			const res = resolveResource(part, next_ctx, false);
			values.push(res.value);
			references.push(res);
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
	const allReferences = resolved.references;

	let value: any;

	if (hasValidPath) {
		const { value: v, ref } = getInRoot(ctx.root, resolved.values, ctx);

		value = v;

		if (ref) {
			allReferences.push(ref);
		}
	}

	if (isVisited) {
		ref.setReferences(allReferences, ctx);

		if (hasValidPath && value !== undefined) {
			ref.setValue(value);
			ref.setAbsPath(resolved.values);
		} else {
			if (isAsyncContext(ctx)) {
				ctx.tasks.add(ref);
			}
		}

		return ref;
	}

	const reference = new Reference(ref, ctx.currentLocation, ctx, {
		references: resolved.references,
		value,
		abs_path: hasValidPath ? resolved.values : UNRESOLVED,
	});

	if (mutateRoot) {
		mutInRoot(ctx.root, ctx.currentLocation, reference);
	}

	if (reference.value === UNRESOLVED && reference.resources.length) {
		if (isAsyncContext(ctx)) {
			ctx.tasks.add(reference);
		}
	}

	return reference;
};

const resolveResource = (
	ref: Resource | ResourceDef,
	ctx: ResolveContext,
	mutateRoot = true,
) => {
	const isVisited = ref instanceof Resource;
	const resource = isVisited
		? ref
		: new Resource(ref, ctx.currentLocation, ctx);

	if (!resource.isFetched && isAsyncContext(ctx)) {
		resource.resolve(ctx);
		ctx.tasks.add(resource);
	}

	if (mutateRoot && !isVisited) {
		mutInRoot(ctx.root, ctx.currentLocation, resource);
	}

	return resource;
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
		xform.setReferences(resolved.references, ctx);

		if (isReadyToTransform && value !== undefined) {
			xform.setValue(value);
		} else {
			if (isAsyncContext(ctx)) {
				ctx.tasks.add(xform);
			}
		}

		return xform;
	}

	const trans = new Transform(xform, ctx.currentLocation, ctx, {
		references: resolved.references,
		value,
	});

	if (trans.resources.length && isAsyncContext(ctx)) {
		ctx.tasks.add(trans);
	}

	if (mutateRoot) {
		mutInRoot(ctx.root, ctx.currentLocation, trans);
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
	const value = ctx.variables[key] ?? UNRESOLVED;

	if (isVisited) {
		def.setValue(value);
		return def;
	}

	const variable = new Variable(def, ctx.currentLocation, ctx, { value });

	if (mutateRoot) {
		mutInRoot(ctx.root, ctx.currentLocation, variable);
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
		ctx.resolve(obj[k], {
			...ctx,
			stack: [...ctx.stack, k],
			currentLocation: loc,
		});
	}

	return obj;
};

const resolveArray = (arr: Resolvable[], ctx: ResolveContext): Resolvable[] => {
	for (const [i, x] of arr.entries()) {
		if (isResolvable(x) && x.value !== UNRESOLVED) {
			continue;
		}
		const loc = [...ctx.currentLocation, i];
		ctx.resolve(arr[i], {
			...ctx,
			stack: [...ctx.stack, i],
			currentLocation: loc,
		});
	}
	return arr;
};

export const resolve = (
	obj: Resolvable | Resolvable[],
	context?: PickPartial<ResolveContext, 'root'>,
): any => {
	const ctx = defContext(context?.root ?? obj, context);

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

export const resolveAsync = async (
	obj: Resolvable | Resolvable[],
	context?: PickPartial<ResolveContext, 'root'>,
): Promise<any> => {
	const ctx = defContextAsync(context?.root ?? obj, context);

	let res: any = obj;

	if (isResource(obj) || obj instanceof Resource) {
		res = resolveResource(obj, ctx);
	} else if (isVariableString(obj) || obj instanceof Variable) {
		res = resolveVariable(obj, ctx);
	} else if (isTransform(obj) || obj instanceof Transform) {
		res = resolveTransform(obj, ctx);
	} else if (isRef(obj) || obj instanceof Reference) {
		res = resolveRef(obj, ctx);
	} else if (Array.isArray(obj)) {
		res = resolveArray(obj, ctx);
	} else if (isRecord(obj)) {
		res = resolveObject(obj, ctx);
	}

	if (ctx.stack.length === 0 && ctx.tasks.size) {
		await asPromise(function* (fctx: Fiber) {
			const rootFibers = [...ctx.tasks].map((task) => task.fiber);

			fctx.forkAll(...rootFibers);

			yield* fctx.join();
		});
	}

	return res;
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

export const resolveAtAsync = async (
	root: Resolvable,
	path: NumOrString[],
	ctx: Omit<ResolveContext, 'currentLocation' | 'root'>,
): Promise<any> => {
	const src = getInUnsafe(root, path);

	const result = await resolveAsync(src, { ...ctx, currentLocation: path });

	return result;
};

const resolveObjectImmediate = (
	obj: Record<string, Resolvable>,
	ctx: ResolveContext,
): Record<string, any> => {
	const result: Record<string, any> = {};

	for (const k in obj) {
		const loc = [...ctx.currentLocation, k];
		const resolved = resolveImmediate(obj[k], ctx.variables, loc, ctx.root);
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
		const resolved = resolveImmediate(x, ctx.variables, loc, ctx.root);
		result.push(deref(resolved));
	}

	return result;
};

export const resolveImmediate = (
	obj: Resolvable | Resolvable[],
	variables: Record<string, any> = {},
	path: NumOrString[] = [],
	root?: Resolvable | Resolvable[],
	stack: NumOrString[] = [],
): any => {
	root = root || obj;

	const ctx: ResolveContext = {
		currentLocation: path,
		root,
		variables,
		stack,
		resolve: resolveImmediate,
		resolveAt: resolveAt,
	};

	if (isResource(obj) || obj instanceof Resource) {
		return resolveResource(obj, ctx, false);
	}

	if (isVariableString(obj) || obj instanceof Variable) {
		return resolveVariable(obj, ctx, false);
	}

	if (isTransform(obj) || obj instanceof Transform) {
		const resolved = resolveTransform(obj, ctx, false);
		return resolveImmediate(resolved.value, variables);
	}

	if (isRef(obj) || obj instanceof Reference) {
		const resolved = resolveRef(obj, ctx, false);
		return resolveImmediate(resolved.value, variables);
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
	root: any,
	ctx: Partial<ResolveContext> = {},
): ResolveContext => {
	const { currentLocation = [], variables = {}, stack = [] } = ctx;

	return {
		currentLocation,
		root,
		stack,
		variables,
		resolve,
		resolveAt,
	};
};

export const defContextAsync = (
	root: any,
	ctx: Partial<ResolveContext> = {},
): Required<ResolveContext> => {
	const {
		currentLocation = [],
		variables = {},
		stack = [],
		tasks = new Set(),
	} = ctx;

	return {
		currentLocation,
		root,
		stack,
		tasks,
		variables,
		resolve: resolveAsync,
		resolveAt: resolveAtAsync,
	};
};
