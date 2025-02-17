import type { NumOrString } from '@thi.ng/api';
import { isResolvable } from './checks';
import { collectResources } from './utils';

export type PickPartial<T, K extends keyof T> = Omit<T, K> &
	Partial<Pick<T, K>>;

export const UNRESOLVED = Symbol('__UNRESOLVED__');

export type VariableString = `$${string}`;
export type AbsoluteString = `@/${string}`;
export type AbsoluteArray = [`@@/${string}`, ...ReferencePathPart[]];
export type RelativeString = `@${string}`;
export type RelativeArray = [`@@${string}`, ...ReferencePathPart[]];

export type ReferencePathPart = string | ResolvableDef;

export type Path = (NumOrString | typeof UNRESOLVED)[];

export type VariableDef = `$${string}`;

export type ReferenceDef =
	| AbsoluteString
	| AbsoluteArray
	| RelativeString
	| RelativeArray;

type Primitive = string | number | boolean | null;

export type Json<Additional = Primitive> =
	| Primitive
	| Additional
	| Json<Additional>[]
	| { [k: string]: Json<Additional> };

export type Resolvable = Json<ResolvableDef | Reference | Transform | Variable>;

export type JsonObject = Record<string, Json>;

export type XF =
	| 'xf_bool'
	| 'xf_concat'
	| 'xf_dateformat'
	| 'xf_eq'
	| 'xf_first'
	| 'xf_hoist'
	| 'xf_invert'
	| 'xf_join'
	| 'xf_map'
	| 'xf_not_eq'
	| 'xf_pick'
	| 'xf_some';

export type BoolTransform = ['xf_bool', ...ResolvableDef[]];
export type ConcatTransform = ['xf_concat', ...ResolvableDef[]];
export type DateFormatTransform = ['xf_dateformat', ResolvableDef, string];
export type EqualTransform = ['xf_eq', ResolvableDef, ResolvableDef, any];
export type FirstTransform = ['xf_first', ...ResolvableDef[]];
export type HoistTransform = ['xf_hoist', ResolvableDef];
export type InvertTransform = ['xf_invert', ResolvableDef];
export type JoinTransform = ['xf_join', ...ResolvableDef[]];
export type MapTransform = [
	'xf_map',
	ResolvableDef,
	TransformDef | Record<string, any>,
];
export type NotEqualTransform = [
	'xf_not_eq',
	ResolvableDef,
	ResolvableDef,
	any,
];
export type PickTransform = ['xf_pick', ResolvableDef, Path];
export type SomeTransform = ['xf_some', ResolvableDef, TransformDef];

export type TransformDef =
	| BoolTransform
	| ConcatTransform
	| DateFormatTransform
	| EqualTransform
	| FirstTransform
	| HoistTransform
	| InvertTransform
	| JoinTransform
	| MapTransform
	| NotEqualTransform
	| PickTransform
	| SomeTransform;

export type ResolvableDef =
	| ReferenceDef
	| ResourceDef
	| TransformDef
	| VariableDef;

export interface IResolvable {
	context: ResolveContext;
	definition: ResolvableDef;
	path: Path;
	value: any;
	references: IResolvable[];
	setReferences(refs: IResolvable[], ctx: ResolveContext): void;
	setValue(v: any): void;
}

type ResolveFn = (
	obj: Resolvable | Resolvable[],
	context?: PickPartial<ResolveContext, 'root'>,
) => any;

type ResolveAsyncFn = (
	obj: Resolvable | Resolvable[],
	context?: PickPartial<ResolveContext, 'root'>,
) => Promise<any>;

type ResolveAtFn = (
	root: Resolvable,
	path: NumOrString[],
	ctx: Omit<ResolveContext, 'currentLocation' | 'root'>,
) => any;

type ResolveAtAsyncFn = (
	root: Resolvable,
	path: NumOrString[],
	ctx: Omit<ResolveContext, 'currentLocation' | 'root'>,
) => Promise<any>;

export type ResolveContext = {
	currentLocation: NumOrString[];
	root: Resolvable | Resolvable[];
	vars: Record<string, any>;
	stack: NumOrString[];
	tasks: Promise<any>[];
	resolve: ResolveFn | ResolveAsyncFn;
	resolveAt: ResolveAtFn | ResolveAtAsyncFn;
};

export type ResourceDef =
	| {
			path: string;
			method: 'GET';
			query?: Record<string, string>;
	  }
	| {
			path: string;
			method: 'POST';
			body: Record<string, Json> | Json[];
			query?: Record<string, string>;
	  };

type ReferenceOpts = {
	/**
	 * Path to the value of the reference
	 */
	abs_path?: NumOrString[] | typeof UNRESOLVED;
	references?: IResolvable[];
	value?: any;
};

export class Reference implements IResolvable {
	abs_path: NumOrString[] | typeof UNRESOLVED;
	context: ResolveContext;
	references: IResolvable[];
	resources: Resource[];
	value: any;

	constructor(
		public readonly definition: ReferenceDef,
		public readonly path: NumOrString[],
		context: ResolveContext,
		{
			abs_path = UNRESOLVED,
			references = [],
			value = UNRESOLVED,
		}: ReferenceOpts = {},
	) {
		this.abs_path = abs_path;
		this.context = context;
		this.references = references;
		this.resources = [];
		this.value = value;
	}

	setAbsPath(path: NumOrString[]) {
		this.abs_path = path;
	}

	setReferences(refs: IResolvable[], ctx: ResolveContext) {
		this.context = ctx;
		this.references = refs;

		const resources = collectResources(refs);

		if (resources.length) {
			this.resources = resources;
		}
	}

	setValue(value: any) {
		this.value = value;

		if (isResolvable(value)) {
			this.references.push(value);
		}
	}
}

export class Transform implements IResolvable {
	context: ResolveContext;
	references: IResolvable[];
	resources: Resource[];
	value: any;

	constructor(
		public readonly definition: TransformDef,
		public readonly path: Path,
		context: ResolveContext,
		{
			references = [],
			value = UNRESOLVED,
		}: Omit<ReferenceOpts, 'abs_path'> = {},
	) {
		this.context = context;
		this.references = references;
		this.resources = [];
		this.value = value;
	}

	setReferences(refs: IResolvable[], ctx: ResolveContext) {
		this.context = ctx;
		this.references = refs;

		const resources = collectResources(refs);

		if (resources.length) {
			this.resources = resources;
		}
	}

	setValue(value: any) {
		this.value = value;

		if (isResolvable(value)) {
			this.references.push(value);
		}
	}
}

export class Variable implements IResolvable {
	context: ResolveContext;
	references: IResolvable[];
	value: any;

	constructor(
		public readonly definition: VariableDef,
		public readonly path: Path,
		context: ResolveContext,
		{ value = UNRESOLVED }: Omit<ReferenceOpts, 'abs_path'> = {},
	) {
		this.context = context;
		this.value = value;
		this.references = [];
	}

	setReferences(_refs: IResolvable[], _ctx: ResolveContext) {
		throw new Error('Method not implemented.');
	}

	setValue(v: any) {
		this.value = v;
	}
}

export class Resource implements IResolvable {
	context: ResolveContext;
	private promise: Promise<any>;
	public references: IResolvable[];
	public value: any;

	constructor(
		public readonly definition: ResourceDef,
		public readonly path: NumOrString[],
		context: ResolveContext,
	) {
		this.context = context;
		this.promise = this.getter(definition);
		this.references = [];
		this.value = UNRESOLVED;
	}

	private async getter(def: ResourceDef) {
		const querystring = def.query
			? new URLSearchParams(def.query).toString()
			: '';

		const url = querystring ? `${def.path}?${querystring}` : def.path;

		if (def.method === 'POST') {
			return fetch(url, {
				method: def.method,
				body: def.body as any,
			});
		}

		const response = await fetch(url, { method: def.method });
		const json = await response.json();

		this.value = json;
		return json;
	}

	setReferences(refs: IResolvable[]): void {
		throw new Error('Method not implemented.');
	}

	setValue(v: any): void {
		throw new Error('Method not implemented.');
	}

	then(resolve: any) {
		this.promise.then(resolve);
	}
}
