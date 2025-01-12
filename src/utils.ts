import { isRecord, isResolvable } from './checks';

/**
 * If `x` is an IResolvable then returns its value.
 */
export const deref = (x: any) => {
	if (isResolvable(x)) {
		return x.value;
	}
	return x;
};

export const toPlainObject = (obj: any): Record<string, any> => {
	if (isResolvable(obj)) {
		return obj.value;
	}

	if (Array.isArray(obj)) {
		return obj.map((x: any) => {
			return isResolvable(x) ? x.value : toPlainObject(x);
		});
	}

	if (isRecord(obj)) {
		const res: any = {};

		for (const k in obj) {
			if (isResolvable(obj[k])) {
				res[k] = obj[k].value;
			} else if (Array.isArray(obj[k])) {
				res[k] = obj[k].map((x: any) => {
					return isResolvable(x) ? x.value : toPlainObject(x);
				});
			} else if (isRecord(obj[k])) {
				res[k] = toPlainObject(obj[k]);
			} else {
				res[k] = obj[k];
			}
		}

		return res;
	}

	return obj;
};
