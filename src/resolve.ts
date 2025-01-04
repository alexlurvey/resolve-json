import get from 'lodash/get';
import set from 'lodash/set';
import {
  MISSING_PATH,
  UNRESOLVED,
  AbsoluteArray,
  AbsoluteString,
  IResolvable,
  Path,
  Reference,
  ReferenceDef,
  ReferencePathPart,
  RelativeArray,
  RelativeString,
  ResolveContext,
  Transform,
  TransformDef,
  Variable,
  VariableArray,
  VariableString,
} from './api';
import {
  canTransform,
  isAbsoluteArray,
  isAbsoluteString,
  isFirstTransform,
  isMapTransform,
  isRecord,
  isRef,
  isRelativeArray,
  isRelativeString,
  isResolvable,
  isSomeTransform,
  isTransform,
  isValidPath,
  isVariableArray,
  isVariableString,
} from './checks';
import { transform } from './transform';
import { derefResolvable } from './utils';

type ExpandResult = {
  // TOOD: with transforms and references being equal, path name is now confusing/inaccurate
  // For transforms, these are arguments (which _could_ be something other than string | number)
  path: Path;
  references: IResolvable[];
};

const isLocationResolved = (location: Path, root: any) => {
  return isResolvable(get(root, location));
};

const pathFromString = (
  def: AbsoluteString | RelativeString | AbsoluteArray[0] | RelativeArray[0]
): string[] => {
  if (def.startsWith('@@/')) {
    return def
      .substring(3)
      .split('/')
      .filter(Boolean);
  }
  if (def.startsWith('@@') || isAbsoluteString(def)) {
    return def
      .substring(2)
      .split('/')
      .filter(Boolean);
  }
  if (isRelativeString(def)) {
    return def
      .substring(1)
      .split('/')
      .filter(Boolean);
  }
  return [];
};

const absPath = (...path: Path) => {
  return path.reduce<Path>((acc, part) => {
    if (part === '.') {
      return acc;
    }
    if (part === '..') {
      if (!acc.length) {
        throw Error(`Invalid path ${path.join('/')}`);
      }
      return acc.slice(0, -1);
    }
    acc.push(part);
    return acc;
  }, []);
};

const getInRoot = (root: any, path: Path, vars: Record<string, string>) => {
  const n = path.length - 1;
  const currentLocation: Path = [];
  let res = root;

  for (let i = 0; res != null && i <= n; i++) {
    res = res[path[i]];
    currentLocation.push(path[i]);
    const ctx = { currentLocation, root, vars };

    if (res instanceof Reference) {
      res = res.value;
    } else if (res instanceof Transform) {
      res = res.value;
    } else if (isVariableString(res)) {
      res = vars[res.slice(1)];
    } else if (isRef(res)) {
      const resolved = resolveRef(res, ctx);
      res = resolved.value;
    } else if (isTransform(res)) {
      const resolved = resolveTransform(res, ctx);
      res = resolved.value;
    } else if (Array.isArray(res)) {
      res = resolveArray(res, ctx);
    }
  }

  return res;
};

/**
 *
 * @param parts - the "path parts" or arguments provided to a reference (array varaint) or transform
 * @param currentLocation - current path within the root object
 * @param root - the root object
 * @param vars - original variables provided to `resolve`
 */
const resolveArgs = (
  parts: ReferencePathPart[],
  ctx: ResolveContext
): ExpandResult => {
  const { currentLocation, root, vars } = ctx;
  const references: IResolvable[] = [];

  const path = parts.reduce<(Path[number] | typeof MISSING_PATH)[]>(
    (acc, part) => {
      if (isTransform(part)) {
        const xf = new Transform(part, currentLocation);
        const [xform, ...args] = part;
        const expanded = resolveArgs(args, ctx);

        if (expanded.references.length) {
          xf.setReferences(expanded.references);
        }

        if (canTransform(expanded.path)) {
          const v = transform([xform, ...expanded.path], ctx);
          if (v !== undefined) {
            xf.setValue(v);
            acc.push(v);
          }
        }

        references.push(xf);
      } else if (isAbsoluteString(part)) {
        const expanded = expandRef(part, ctx);
        if (isValidPath(expanded.path)) {
          const v = getInRoot(root, expanded.path, vars);
          references.push(
            new Reference(part, currentLocation, {
              abs_path: expanded.path,
              value: v,
            })
          );
          acc.push(v ?? MISSING_PATH);
        } else {
          acc.push(MISSING_PATH);
        }
      } else if (isRelativeString(part)) {
        const expanded = expandRef(part, ctx);
        if (isValidPath(expanded.path)) {
          const v = getInRoot(root, expanded.path, vars);
          references.push(
            new Reference(part, currentLocation, {
              abs_path: expanded.path,
              value: v,
            })
          );
          acc.push(v ?? MISSING_PATH);
        } else {
          acc.push(MISSING_PATH);
        }
      } else if (isVariableString(part)) {
        const k = part === '$' ? part : part.substring(1);
        acc.push(vars[k] ?? MISSING_PATH);
      } else if (isVariableArray(part)) {
        const [v, ...args] = part;
        const key = v === '$' ? '$' : v.slice(1);
        const resolved = resolveArgs(args, ctx);

        if (isValidPath(resolved.path)) {
          const v = get(vars[key], resolved.path);
          references.push(new Variable(part, currentLocation, { value: v }));
          acc.push(v);
        } else {
          acc.push(MISSING_PATH);
        }
      } else if (isAbsoluteArray(part)) {
        const expanded = expandRef(part, ctx);
        if (isValidPath(expanded.path)) {
          const v = getInRoot(root, expanded.path, vars);
          references.push(
            new Reference(part, currentLocation, {
              abs_path: expanded.path,
              value: v,
              references: expanded.references,
            })
          );
          acc.push(v ?? MISSING_PATH);
        } else {
          acc.push(MISSING_PATH);
        }
      } else if (isRelativeArray(part)) {
        const expanded = expandRef(part, ctx);
        if (isValidPath(expanded.path)) {
          const v = getInRoot(root, expanded.path, vars);
          references.push(
            new Reference(part, currentLocation, {
              abs_path: expanded.path,
              value: v,
              references: expanded.references,
            })
          );

          acc.push(v);
        } else {
          acc.push(MISSING_PATH);
        }
      } else {
        acc.push(part);
      }
      return acc;
    },
    []
  );

  return { path, references };
};

/**
 * Attempts to resolve the absolute path of a ReferenceDef. If an array
 * variant, nested references & transforms will be resolved and returned.
 *
 * @param ref - an absolute or relative reference (string or array variant)
 * @param ctx
 * @returns
 */
const expandRef = (ref: ReferenceDef, ctx: ResolveContext): ExpandResult => {
  if (isAbsoluteString(ref)) {
    return { path: pathFromString(ref), references: [] };
  }

  if (isAbsoluteArray(ref)) {
    const [start, ...rest] = ref;
    const { path: p2, references } = resolveArgs(rest, ctx);
    const p1 = pathFromString(start);
    return { path: [...p1, ...p2], references };
  }

  if (isRelativeString(ref)) {
    const p1 = ctx.currentLocation.slice(0, -1);
    const p2 = pathFromString(ref);
    return { path: absPath(...p1, ...p2), references: [] };
  }

  if (isRelativeArray(ref)) {
    const [start, ...rest] = ref;
    const { path: p3, references } = resolveArgs(rest, ctx);
    const p1 = ctx.currentLocation.slice(0, -1);
    const p2 = pathFromString(start);

    return {
      path: absPath(...p1, ...p2, ...p3),
      references,
    };
  }

  return { path: [], references: [] };
};

const resolveRef = (
  ref: ReferenceDef,
  ctx: ResolveContext,
  mutateRoot = true
) => {
  const reference = new Reference(ref, ctx.currentLocation);

  if (mutateRoot && !isLocationResolved(ctx.currentLocation, ctx.root)) {
    set(ctx.root, ctx.currentLocation, reference);
  }

  const resolved = expandRef(reference.definition, ctx);

  if (resolved.references.length) {
    reference.setReferences(resolved.references);
  }

  if (isValidPath(resolved.path)) {
    const v = getInRoot(ctx.root, resolved.path, ctx.vars);
    if (v) {
      reference.setValue(v);
      reference.setAbsPath(resolved.path);
    }
  }

  return reference;
};

const resolveTransform = (
  xform: TransformDef,
  ctx: ResolveContext,
  mutateRoot = true
) => {
  const trans = new Transform(xform, ctx.currentLocation);

  if (mutateRoot && !isLocationResolved(ctx.currentLocation, ctx.root)) {
    set(ctx.root, ctx.currentLocation, trans);
  }

  if (
    isMapTransform(xform) ||
    isSomeTransform(xform) ||
    isFirstTransform(xform)
  ) {
    const v = transform(xform, ctx);
    if (v !== undefined) {
      trans.setValue(v);
    }
    return trans;
  }

  const [xf, ...args] = trans.definition;
  const resolved = resolveArgs(args, ctx);

  if (resolved.references.length) {
    trans.setReferences(resolved.references);
  }

  if (canTransform(resolved.path)) {
    const v = transform([xf, ...resolved.path], ctx);
    if (v !== undefined) {
      trans.setValue(v);
    }
  }

  return trans;
};

const resolveArray = (arr: any[], ctx: ResolveContext) => {
  for (let i = 0; i < arr.length; i++) {
    if (isResolvable(arr[i])) {
      continue;
    }
    const currentLocation = [...ctx.currentLocation, i];
    const v = resolve(arr[i], ctx.vars, currentLocation, ctx.root);
    set(ctx.root, currentLocation, v);
  }
  return arr;
};

const resolveVariable = (
  def: VariableString | VariableArray,
  ctx: ResolveContext,
  mutateRoot = true
) => {
  const getKey = (x: string) => (x === '$' ? '$' : x.substring(1));

  if (isVariableString(def)) {
    const value = ctx.vars[getKey(def)] ?? UNRESOLVED;
    const variable = new Variable(def, ctx.currentLocation, { value });
    if (mutateRoot && !isLocationResolved(ctx.currentLocation, ctx.root)) {
      set(ctx.root, ctx.currentLocation, variable);
    }
    return variable;
  }

  const [v, ...args] = def;
  const src = ctx.vars[getKey(v)];
  const resolved = resolveArgs(args, ctx);
  const variable = new Variable(def, ctx.currentLocation);
  if (mutateRoot && !isLocationResolved(ctx.currentLocation, ctx.root)) {
    set(ctx.root, ctx.currentLocation, variable);
  }

  if (isValidPath(resolved.path)) {
    variable.setValue(get(src, resolved.path));
  }

  if (resolved.references) {
    variable.setReferences(resolved.references);
  }

  return variable;
};

const resolveObject = (obj: any, ctx: ResolveContext) => {
  for (const k in obj) {
    if (isResolvable(obj[k])) {
      continue;
    }

    const downLevelCtx = {
      ...ctx,
      currentLocation: [...ctx.currentLocation, k],
    };

    if (isVariableString(obj[k]) || isVariableArray(obj[k])) {
      resolveVariable(obj[k], downLevelCtx);
    } else if (isTransform(obj[k])) {
      resolveTransform(obj[k], downLevelCtx);
    } else if (isRef(obj[k])) {
      resolveRef(obj[k], downLevelCtx);
    } else if (Array.isArray(obj[k])) {
      resolveArray(obj[k], downLevelCtx);
    } else if (isRecord(obj[k])) {
      obj[k] = resolveObject(obj[k], downLevelCtx);
    }
  }

  return obj;
};

const resolveObjectImmediate = (obj: any, ctx: ResolveContext) => {
  const result: Record<string, any> = {};

  for (const k in obj) {
    result[k] = derefResolvable(
      resolveImmediate(obj[k], ctx.vars, [...ctx.currentLocation, k], ctx.root)
    );
  }

  return result;
};

const resolveArrayImmediate = (array: any[], ctx: ResolveContext) => {
  const result: any[] = [];

  for (let i = 0; i < array.length; i++) {
    result.push(
      derefResolvable(resolveImmediate(array[i], ctx.vars, [], ctx.root))
    );
  }

  return result;
};

export const resolve = (
  obj: any,
  vars: Record<string, any> = {},
  path: Path = [],
  root?: any
) => {
  root = root || obj;
  const ctx = { currentLocation: path, root, vars };

  if (isVariableString(obj) || isVariableArray(obj)) {
    return resolveVariable(obj, ctx);
  }

  if (isTransform(obj)) {
    return resolveTransform(obj, ctx);
  }

  if (isRef(obj)) {
    return resolveRef(obj, ctx);
  }

  if (isRecord(obj)) {
    return resolveObject(obj, ctx);
  }

  if (Array.isArray(obj)) {
    return resolveArray(obj, ctx);
  }

  return obj;
};

export const resolveImmediate = (
  obj: any,
  vars: Record<string, any> = {},
  path: Path = [],
  root?: any
) => {
  root = root || obj;
  const ctx = { currentLocation: path, root, vars };

  if (isVariableString(obj) || isVariableArray(obj)) {
    return resolveVariable(obj, ctx, false);
  }

  if (isTransform(obj)) {
    return resolveTransform(obj, ctx, false);
  }

  if (isRef(obj)) {
    return resolveRef(obj, ctx, false);
  }

  if (isRecord(obj)) {
    return resolveObjectImmediate(obj, ctx);
  }

  if (Array.isArray(obj)) {
    return resolveArrayImmediate(obj, ctx);
  }

  return obj;
};
