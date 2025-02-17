import { type IResolvable, Resource } from './api';
import { isRecord, isResolvable } from './checks';

/**
 * If `x` is an IResolvable then return its value.
 */
export const deref = (x: any) => {
	if (isResolvable(x)) {
		let v = x.value;

		while (isResolvable(v)) {
			v = v.value;
		}

		return v;
	}

	return x;
};

export const collectResources = (
	resolvable: IResolvable | IResolvable[],
): Resource[] => {
	const result: Resource[] = [];

	const refs = Array.isArray(resolvable)
		? resolvable.flatMap((res) => res.references)
		: resolvable.references;

	for (const ref of refs) {
		if (ref instanceof Resource) {
			result.push(ref);
		}

		result.push(...collectResources(ref));
	}

	return result;
};

export const toPlainObject = (obj: any): any => {
	if (obj instanceof Resource) {
		return obj.value;
	}
	if (isResolvable(obj)) {
		return deref(obj);
	}

	if (Array.isArray(obj)) {
		return obj.map(toPlainObject);
	}

	if (isRecord(obj)) {
		const res: any = {};

		for (const k in obj) {
			if (Array.isArray(obj[k])) {
				res[k] = obj[k].map(toPlainObject);
			} else if (isRecord(obj[k])) {
				res[k] = toPlainObject(obj[k]);
			} else {
				res[k] = deref(obj[k]);
			}
		}

		return res;
	}

	return obj;
};
