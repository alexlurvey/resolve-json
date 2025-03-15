import type { NumOrString } from '@thi.ng/api';
import { isResolvable } from './checks';

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

export type ResolvableDef = ReferenceDef | TransformDef | VariableDef;

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

type ResolveAtFn = (
	root: Resolvable,
	path: NumOrString[],
	ctx: Omit<ResolveContext, 'currentLocation' | 'root'>,
) => any;

export type ResolveContext = {
	currentLocation: NumOrString[];
	root: Resolvable | Resolvable[];
	vars: Record<string, any>;
	resolve: ResolveFn;
	resolveAt: ResolveAtFn;
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
		this.value = value;
	}

	setAbsPath(path: NumOrString[]) {
		this.abs_path = path;
	}

	setReferences(refs: IResolvable[], ctx: ResolveContext) {
		this.context = ctx;
		this.references = refs;
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
		this.value = value;
	}

	setReferences(refs: IResolvable[], ctx: ResolveContext) {
		this.context = ctx;
		this.references = refs;
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
