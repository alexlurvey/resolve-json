import {
	MISSING_PATH,
	UNRESOLVED,
	type AbsoluteArray,
	type AbsoluteString,
	type FirstTransform,
	type IResolvable,
	type MapTransform,
	type Path,
	type RelativeArray,
	Reference,
	type ReferenceDef,
	type RelativeString,
	type SomeTransform,
	Transform,
	type TransformDef,
	Variable,
	type VariableArray,
	type VariableString,
} from './api';

export const canTransform = (path: Path) => {
	return path.every((x) => x !== MISSING_PATH && x !== UNRESOLVED);
};

export const isBooleanResultTransform = (xf: any): xf is Transform => {
	return xf instanceof Transform && xf.isBooleanResult;
};

export const isRecord = (x: any): x is Record<string, any> => {
	return x != null && typeof x === 'object' && !Array.isArray(x);
};

export const isVariableString = (x: any): x is VariableString => {
	return typeof x === 'string' && x.startsWith('$');
};

export const isVariableArray = (x: any): x is VariableArray => {
	return Array.isArray(x) && typeof x[0] === 'string' && x[0].startsWith('$');
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

export const isValidPath = (path: Path): path is (string | number)[] => {
	return !path.includes(MISSING_PATH) && !path.includes(UNRESOLVED);
};

export const isResolvable = (x: any): x is IResolvable => {
	return (
		x instanceof Reference || x instanceof Transform || x instanceof Variable
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
		isVariableString(x) ||
		isVariableArray(x)
	);
};
