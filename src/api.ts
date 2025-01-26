import type { NumOrString } from '@thi.ng/api';

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
	TransformDef | Path | Record<string, any>,
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
	definition: string | any[];
	path: Path;
	value: any;
	references: IResolvable[];
	setReferences(refs: IResolvable[]): void;
	setValue(v: any): void;
}

export type ResolveContext = {
	currentLocation: NumOrString[];
	root: Resolvable;
	vars: Record<string, any>;
	debugScope?: string[];
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
	references: IResolvable[];
	value: any;

	constructor(
		public readonly definition: ReferenceDef,
		public readonly path: Path,
		{
			abs_path = UNRESOLVED,
			references = [],
			value = UNRESOLVED,
		}: ReferenceOpts = {},
	) {
		this.abs_path = abs_path;
		this.references = references;
		this.value = value;
	}

	setAbsPath(path: NumOrString[]) {
		this.abs_path = path;
	}

	setReferences(refs: IResolvable[]) {
		this.references = refs;
	}

	setValue(value: any) {
		this.value = value;
	}
}

export class Transform implements IResolvable {
	references: IResolvable[];
	value: any;

	constructor(
		public readonly definition: TransformDef,
		public readonly path: Path,
		{
			references = [],
			value = UNRESOLVED,
		}: Omit<ReferenceOpts, 'abs_path'> = {},
	) {
		this.references = references;
		this.value = value;
	}

	get isBooleanResult() {
		return (
			this.definition[0] === 'xf_bool' ||
			this.definition[0] === 'xf_eq' ||
			this.definition[0] === 'xf_invert' ||
			this.definition[0] === 'xf_not_eq' ||
			this.definition[0] === 'xf_some'
		);
	}

	setReferences(refs: IResolvable[]) {
		this.references = refs;
	}

	setValue(value: any) {
		this.value = value;
	}
}

export class Variable implements IResolvable {
	references: IResolvable[];
	value: any;

	constructor(
		public readonly definition: VariableDef,
		public readonly path: Path,
		{ value = UNRESOLVED }: Omit<ReferenceOpts, 'abs_path'> = {},
	) {
		this.value = value;
		this.references = [];
	}

	setReferences(refs: IResolvable[]) {
		this.references = refs;
	}

	setValue(v: any) {
		this.value = v;
	}
}
