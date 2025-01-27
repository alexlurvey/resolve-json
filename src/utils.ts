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

export const toPlainObject = (obj: any): any => {
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
