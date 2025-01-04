import { ReferenceDef, TransformDef } from './api';
import { isRecord, isRef, isTransform } from './checks';
import { resolve } from './resolve';
import { transform } from './transform';

const resolveToObject = (
  x: any,
  vars: Record<string, any>,
  currentLocation: (string | number)[],
  root: Record<string, any>
): Record<string, any> | null => {
  if (isRecord(x)) {
    return x;
  }

  if (isTransform(x)) {
    const ctx = { currentLocation, root, vars };
    const transformed = transform(x, ctx);
    return resolveToObject(transformed, vars, currentLocation, root);
  }

  if (isRef(x)) {
    const resolved = resolve(x, vars, currentLocation, root);
    return resolveToObject(resolved.value, vars, currentLocation, root);
  }

  return null;
};

const mergeXFs = (
  array: (ReferenceDef | TransformDef | Record<string, any>)[],
  vars: Record<string, any>,
  currentLocation: (string | number)[],
  root: Record<string, any>
): Record<string, any> => {
  if (!Array.isArray(array)) {
    return {};
  }

  return array.reduce<Record<string, any>>((acc, arg) => {
    const maybeObject = resolveToObject(arg, vars, currentLocation, root);

    if (isRecord(maybeObject)) {
      acc = { ...acc, ...maybeObject };
    }

    return acc;
  }, {});
};

/**
 * Recursively walks the provided object and resolves the transforms/references
 * contained within the `xf_inherit` and `xf_extend` arrays. `obj` _is_ mutated.
 * Provide a copy via [structuredClone](https://developer.mozilla.org/en-US/docs/Web/API/structuredClone)
 * if the original version needs to be maintained.
 */
export const extend = (
  obj: Record<string, any>,
  vars: Record<string, any> = {},
  currentLocation: (string | number)[] = [],
  root?: any
): Record<string, any> => {
  if (!isRecord(obj)) {
    return obj;
  }

  root = root || obj;

  if ('xf_inherit' in obj) {
    const resolved = mergeXFs(obj.xf_inherit, vars, currentLocation, root);
    obj = { ...resolved, ...obj };
  }

  if ('xf_extend' in obj) {
    const resolved = mergeXFs(obj.xf_extend, vars, currentLocation, root);
    obj = { ...obj, ...resolved };
  }

  for (const key in obj) {
    if (isRecord(obj[key])) {
      obj[key] = extend(obj[key], vars, [...currentLocation, key], root);
    }
  }

  return obj;
};
