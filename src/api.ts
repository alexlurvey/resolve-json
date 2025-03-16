import type { NumOrString } from '@thi.ng/api';
import { type Fiber, STATE_ACTIVE, fiber, untilPromise } from '@thi.ng/fibers';
import { isObjectFullyResolved, isResolvable } from './checks';
import { collectResources, toPlainObject } from './utils';

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
	fiber: Fiber<unknown>;
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
	tasks: Set<IResolvable>;
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
	fiber: Fiber<unknown>;
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
		this.fiber = this.defFiber();
	}

	defFiber() {
		const self = this;

		return fiber(function* (ctx) {
			const childs = self.references.map((ref) => ref.fiber);

			ctx.forkAll(...childs);
			yield* ctx.join();

			const resolveSelf = untilPromise(
				self.context.resolveAt(self.context.root, self.path, self.context),
			);

			ctx.fork(resolveSelf);
			yield* ctx.join();
		});
	}

	setAbsPath(path: NumOrString[]) {
		this.abs_path = path;
	}

	setReferences(refs: IResolvable[], ctx: ResolveContext) {
		this.context = ctx;
		this.references = refs;
		const resources = collectResources(refs);
		this.resources = resources;
		this.fiber = this.defFiber();
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
	fiber: Fiber<unknown>;
	references: IResolvable[];
	resources: Resource[];
	value: any;

	constructor(
		public readonly definition: TransformDef,
		public readonly path: NumOrString[],
		context: ResolveContext,
		{
			references = [],
			value = UNRESOLVED,
		}: Omit<ReferenceOpts, 'abs_path'> = {},
	) {
		this.context = context;
		this.references = references;
		this.resources = collectResources(references);
		this.value = value;
		this.fiber = this.defFiber();
	}

	defFiber(): Fiber<any> {
		const self = this;

		return fiber(function* (ctx: Fiber<unknown>) {
			if (self.resources.length === 0) {
				return;
			}

			const childs = self.resources.map((res) => res.fiber);

			ctx.forkAll(...childs);

			yield* ctx.join();

			const resolveSelf = untilPromise(
				self.context.resolveAt(self.context.root, self.path, self.context),
			);
			ctx.fork(resolveSelf);
			yield* ctx.join();
		});
	}

	setReferences(refs: IResolvable[], ctx: ResolveContext) {
		this.context = ctx;
		this.references = refs;
		this.resources = collectResources(refs);
		this.fiber = this.defFiber();
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
	fiber: Fiber<unknown>;
	references: IResolvable[];
	value: any;

	constructor(
		public readonly definition: VariableDef,
		public readonly path: Path,
		context: ResolveContext,
		{ value = UNRESOLVED }: Omit<ReferenceOpts, 'abs_path'> = {},
	) {
		const self = this;

		this.context = context;
		this.value = value;
		this.references = [];
		this.fiber = fiber(function* () {
			const value = self.context.vars[definition.slice(1)];

			self.setValue(value);

			return value;
		});
	}

	setReferences(_refs: IResolvable[], _ctx: ResolveContext) {
		throw new Error('Method not implemented.');
	}

	setValue(v: any) {
		this.value = v;
	}
}

export class Resource implements IResolvable {
	public context: ResolveContext;
	public fiber: Fiber<any>;
	public isFetched: boolean;
	public references: IResolvable[];
	public value: any;

	constructor(
		public readonly definition: ResourceDef,
		public readonly path: NumOrString[],
		context: ResolveContext,
	) {
		this.context = context;
		this.isFetched = false;
		this.fiber = this.defFiber();
		this.references = [];
		this.value = UNRESOLVED;
	}

	async fetcher(opts: { path: string; body?: any; query?: any }) {
		const { path, body, query } = opts;
		const def = this.definition;
		const hasQuery = !!query;
		const isQueryResolved = hasQuery && isObjectFullyResolved(query);

		if (hasQuery && !isQueryResolved) {
			return null;
		}

		const hasBody = !!body;
		const isBodyResolved = hasBody && isObjectFullyResolved(body);

		let url = path;

		if (isQueryResolved) {
			const querystring = new URLSearchParams(query).toString();
			url = `${path}?${querystring}`;
		}

		if (def.method === 'POST') {
			if (hasBody && !isBodyResolved) {
				return null;
			}

			const response = await fetch(url, {
				method: 'POST',
				body: JSON.stringify(body),
				headers: {
					Authorization: 'Bearer XXX',
					'Content-Type': 'application/json',
				},
			});

			const json = await response.json();
			this.value = json;
			this.isFetched = true;
			return json;
		}

		const response = await fetch(url, { method: 'GET' });
		const json = await response.json();
		this.value = json;
		this.isFetched = true;
		return json;
	}

	defBodyFiber() {
		if (this.definition.method === 'GET') {
			throw Error(
				'Should not be calling defBodyFiber for resource with method of GET',
			);
		}

		const promise = this.context.resolve(this.definition.body, {
			...this.context,
			currentLocation: [...this.path, 'body'],
			stack: [...this.context.stack, 'body'],
		});

		return untilPromise(promise);
	}

	defPathFiber() {
		const promise = this.context.resolve(this.definition.path, {
			...this.context,
			currentLocation: [...this.context.currentLocation, 'path'],
			stack: [...this.context.stack, 'path'],
		});

		return untilPromise(promise);
	}

	defQueryFiber() {
		if (!this.definition.query) {
			return fiber(function* () {
				return null;
			});
		}

		const promise = this.context.resolve(this.definition.query, {
			...this.context,
			currentLocation: [...this.context.currentLocation, 'query'],
			stack: [...this.context.stack, 'query'],
		});

		return untilPromise(promise);
	}

	defFiber() {
		const self = this;

		return fiber(function* (ctx) {
			const pathFiber = self.defPathFiber();
			const queryFiber = self.defQueryFiber();

			if (self.definition.method === 'POST') {
				const bodyFiber = self.defBodyFiber();

				ctx.forkAll(pathFiber, bodyFiber, queryFiber);

				yield* ctx.join();

				const path = toPlainObject(pathFiber.deref());
				const body = toPlainObject(bodyFiber.deref());
				const query = toPlainObject(queryFiber.deref());

				yield* untilPromise(self.fetcher({ path, body, query }));
			} else {
				ctx.forkAll(pathFiber, queryFiber);
				yield* ctx.join();
				const path = toPlainObject(pathFiber.deref());
				const query = toPlainObject(queryFiber.deref());

				yield* untilPromise(self.fetcher({ path, query }));
			}
		});
	}

	resolve(ctx: ResolveContext) {
		if (this.fiber.state > STATE_ACTIVE) {
			this.context = ctx;
			this.fiber = this.defFiber();
		}
	}

	setReferences(_refs: IResolvable[], _context: ResolveContext): void {
		throw new Error('Method not implemented.');
	}

	setValue(v: any): void {
		throw new Error('Method not implemented.');
	}
}
