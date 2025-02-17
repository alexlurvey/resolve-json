import type { NumOrString } from '@thi.ng/api';
import {
	UNRESOLVED,
	Reference,
	Resource,
	Transform,
	Variable,
	type AbsoluteArray,
	type AbsoluteString,
	type FirstTransform,
	type IResolvable,
	type MapTransform,
	type Path,
	type RelativeArray,
	type ReferenceDef,
	type ResourceDef,
	type RelativeString,
	type ResolvableDef,
	type SomeTransform,
	type TransformDef,
	type VariableString,
} from './api';

export const isBooleanResultTransform = (
	xf: ResolvableDef,
): xf is TransformDef => {
	return (
		isTransform(xf) &&
		(xf[0] === 'xf_bool' ||
			xf[0] === 'xf_eq' ||
			xf[0] === 'xf_invert' ||
			xf[0] === 'xf_not_eq' ||
			xf[0] === 'xf_some')
	);
};

export const isRecord = (x: any): x is Record<string, any> => {
	return x != null && typeof x === 'object' && !Array.isArray(x);
};

export const isVariableString = (x: any): x is VariableString => {
	return typeof x === 'string' && x.startsWith('$');
};

export const isAbsoluteString = (x: any): x is AbsoluteString => {
	return typeof x === 'string' && x.startsWith('@/');
};

export const isAbsoluteArray = (x: any): x is AbsoluteArray => {
	return Array.isArray(x) && typeof x[0] === 'string' && x[0].startsWith('@@/');
};

export const isRelativeString = (x: any): x is RelativeString => {
	return typeof x === 'string' && x.startsWith('@');
};

export const isRelativeArray = (x: any): x is RelativeArray => {
	return Array.isArray(x) && typeof x[0] === 'string' && x[0].startsWith('@@');
};

export const isTransform = (x: any): x is TransformDef => {
	return Array.isArray(x) && typeof x[0] === 'string' && x[0].startsWith('xf_');
};

export const isFirstTransform = (x: any): x is FirstTransform => {
	return Array.isArray(x) && x[0] === 'xf_first';
};

export const isMapTransform = (x: any): x is MapTransform => {
	return Array.isArray(x) && x[0] === 'xf_map';
};

export const isSomeTransform = (x: any): x is SomeTransform => {
	return Array.isArray(x) && x[0] === 'xf_some';
};

export const isResource = (x: any): x is ResourceDef => {
	if (x == null || typeof x !== 'object') {
		return false;
	}

	return Object.hasOwn(x, 'path') && Object.hasOwn(x, 'method');
};

export const isValidPath = (path: Path): path is NumOrString[] => {
	return !path.includes(UNRESOLVED);
};

export const isResolvable = (x: any): x is IResolvable => {
	return (
		x instanceof Reference ||
		x instanceof Resource ||
		x instanceof Transform ||
		x instanceof Variable
	);
};

export const isUnresovled = (x: any) => {
	return isResolvable(x) && x.value === UNRESOLVED;
};

export const isRef = (x: any): x is ReferenceDef => {
	return (
		isAbsoluteString(x) ||
		isRelativeString(x) ||
		isAbsoluteArray(x) ||
		isRelativeArray(x) ||
		isVariableString(x)
	);
};
