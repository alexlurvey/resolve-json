import { UNRESOLVED } from '../api';
import { resolve } from '../resolve';
import { toPlainObject } from '../utils';

describe('resolve', () => {
  describe('basic', () => {
    test('absolute string reference', () => {
      const src = {
        global_value: 'global',
        nesting: {
          value: '@/global_value',
        },
      };
      const result = toPlainObject(resolve(src));
      expect(result.nesting.value).toBe('global');
    });

    test('relative string reference', () => {
      const src = {
        one: 'one',
        two: '@one',
      };
      const result = toPlainObject(resolve(src));
      expect(result.two).toBe('one');
    });

    test('variable string', () => {
      const vars = { gimmesomething: 'something' };
      const src = { value: '$gimmesomething' };
      const result = toPlainObject(resolve(src, vars));
      expect(result.value).toBe('something');
    });

    test('variable array', () => {
      const vars = { test: { value: 'vvv' } };
      const src = { value: ['$test', 'value'] };
      const result = toPlainObject(resolve(src, vars));
      expect(result.value).toBe('vvv');
    });

    test('absolute array refrence', () => {
      const src = {
        lookup: {
          dropdown: 'dd_value',
        },
        nesting: {
          value: ['@@/lookup', 'dropdown'],
        },
      };
      const result = toPlainObject(resolve(src));
      expect(result.nesting.value).toBe('dd_value');
    });

    test('absolute array refrence', () => {
      const src = {
        lookup: {
          dropdown: 'dd_value',
        },
        value: ['@@lookup', 'dropdown'],
      };
      const result = toPlainObject(resolve(src));
      expect(result.value).toBe('dd_value');
    });

    test('array of references', () => {
      const vars = { three: 'three' };
      const src = {
        lookup: {
          one: 1,
          two: 2,
          three: 3,
        },
        values: ['@/lookup/one', '@/lookup/two', ['@@/lookup', '$three']],
      };
      const result = toPlainObject(resolve(src, vars));
      expect(result.values).toEqual([1, 2, 3]);
    });
  });

  describe('with variables', () => {
    test('absolute array', () => {
      const vars = { field_type: 'dropdown' };
      const src = {
        lookup: {
          dropdown: 'dd_value',
        },
        nesting: {
          value: ['@@/lookup', '$field_type'],
        },
      };
      const result = toPlainObject(resolve(src, vars));
      expect(result.nesting.value).toBe('dd_value');
    });

    test('relative array', () => {
      const vars = { field_type: 'dropdown' };
      const src = {
        lookup: {
          dropdown: 'dd_value',
        },
        value: ['@@lookup', '$field_type'],
      };
      const result = toPlainObject(resolve(src, vars));
      expect(result.value).toBe('dd_value');
    });
  });

  describe('nested references', () => {
    test('absolute array w/ relative array', () => {
      const vars = { field_type: 'dropdown' };
      const src = {
        lookup: {
          key: 'lookup_value',
        },
        other_data: {
          dropdown: {
            key: 'key',
          },
        },
        main_reference: ['@@/lookup', ['@@other_data', '$field_type', 'key']],
      };
      const result = toPlainObject(resolve(src, vars));
      expect(result.main_reference).toBe('lookup_value');
    });

    test('relative array w/ absolute array', () => {
      const vars = { field_type: 'dropdown' };
      const src = {
        lookup: {
          key: 'lookup_value',
        },
        other_data: {
          dropdown: {
            key: 'key',
          },
        },
        main_reference: ['@@lookup', ['@@/other_data', '$field_type', 'key']],
      };
      const result = toPlainObject(resolve(src, vars));
      expect(result.main_reference).toBe('lookup_value');
    });
  });

  describe('unresolved references', () => {
    test('absolute reference has UNRESOLVED value', () => {
      const src = {
        string: '@/not_found/item',
        array: ['@@/not_found/item'],
      };
      const result = toPlainObject(resolve(src));
      expect(result.string).toBe(UNRESOLVED);
      expect(result.array).toBe(UNRESOLVED);
    });

    test('relative reference has UNRESOLVED value', () => {
      const src = {
        nesting: {
          string: '@not_found/item',
          array: ['@@not_found/item'],
        },
      };
      const result = toPlainObject(resolve(src));
      expect(result.nesting.string).toBe(UNRESOLVED);
      expect(result.nesting.array).toBe(UNRESOLVED);
    });

    test('transform with unresolved reference has UNRESOLVED value', () => {
      const src = {
        xform: ['xf_join', 'testing', ['@@/lookup/not_found']],
      };
      const result = toPlainObject(resolve(src));
      expect(result.xform).toBe(UNRESOLVED);
    });
  });

  describe('kitchen sink', () => {
    test('all the things', () => {
      const vars = {
        activity: {
          id: 'xxx',
          name: 'Test Activity',
        },
        field: {
          field_type: 'dropdown',
        },
        object_type: 'client_client',
        users: [
          { id: 'aaa', first_name: 'Alice', last_name: 'Smith' },
          { id: 'bbb', first_name: 'Frank', last_name: 'Smith' },
          { id: 'bbb', first_name: 'Zorp', last_name: 'Smith' },
        ],
      };
      const src = {
        __labels: {
          activity: 'Activity',
        },
        __data: {
          client_client: ['xf_join', '/activity/', ['$activity', 'id']],
        },
        usernames: [
          'xf_map',
          '$users',
          [
            'xf_join',
            '"',
            ['xf_pick', '$', ['first_name']],
            ' ',
            ['xf_pick', '$', ['last_name']],
            '"',
          ],
        ],
        step_data: {
          urls: {
            absolute: ['@@/__data', '$object_type'],
            relative: ['@@../../__data', '$object_type'],
          },
        },
      };
      const result = toPlainObject(resolve(src, vars));

      expect(result.usernames).toEqual([
        '"Alice Smith"',
        '"Frank Smith"',
        '"Zorp Smith"',
      ]);
      expect(result.step_data.urls.absolute).toBe('/activity/xxx');
      expect(result.step_data.urls.relative).toBe('/activity/xxx');
    });
  });
});
