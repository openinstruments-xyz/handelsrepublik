import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

type Matcher = {
  __matcher: 'any' | 'objectContaining';
  value: unknown;
};

type Expectation = {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toMatchObject(expected: Record<string, unknown>): void;
  toContain(expected: unknown): void;
  toHaveLength(expected: number): void;
  toBeDefined(): void;
  toBeUndefined(): void;
  toMatch(expected: RegExp): void;
};

type AsyncExpectation = {
  resolves: {
    toEqual(expected: unknown): Promise<void>;
    toMatchObject(expected: Record<string, unknown>): Promise<void>;
  };
};

type Expect = {
  (actual: unknown): Expectation & AsyncExpectation;
  any(value: unknown): Matcher;
  objectContaining(value: Record<string, unknown>): Matcher;
};

function expectValue(actual: unknown): Expectation & AsyncExpectation {
  return {
    toBe(expected: unknown) {
      assert.equal(actual, expected);
    },
    toEqual(expected: unknown) {
      assertMatches(actual, expected);
    },
    toMatchObject(expected: Record<string, unknown>) {
      assertPartialObject(actual, expected);
    },
    toContain(expected: unknown) {
      assert.ok(typeof actual === 'string' || Array.isArray(actual), 'actual value must support contains');
      assert.ok((actual as string | unknown[]).includes(expected as never));
    },
    toHaveLength(expected: number) {
      assert.equal((actual as { length?: unknown }).length, expected);
    },
    toBeDefined() {
      assert.notEqual(actual, undefined);
    },
    toBeUndefined() {
      assert.equal(actual, undefined);
    },
    toMatch(expected: RegExp) {
      assert.equal(typeof actual, 'string');
      assert.match(actual as string, expected);
    },
    resolves: {
      async toEqual(expected: unknown) {
        assertMatches(await actual, expected);
      },
      async toMatchObject(expected: Record<string, unknown>) {
        assertPartialObject(await actual, expected);
      },
    },
  };
}

function any(value: unknown): Matcher {
  return { __matcher: 'any', value };
}

function objectContaining(value: Record<string, unknown>): Matcher {
  return { __matcher: 'objectContaining', value };
}

function assertMatches(actual: unknown, expected: unknown): void {
  if (isMatcher(expected)) {
    assertMatcher(actual, expected);
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), 'actual value must be an array');
    assert.equal(actual.length, expected.length);
    for (let index = 0; index < expected.length; index += 1) {
      assertMatches(actual[index], expected[index]);
    }
    return;
  }
  if (isPlainObject(expected)) {
    assert.ok(isPlainObject(actual), 'actual value must be an object');
    const actualRecord = actual as Record<string, unknown>;
    for (const [key, value] of Object.entries(expected)) {
      assertMatches(actualRecord[key], value);
    }
    return;
  }
  assert.deepEqual(actual, expected);
}

function assertPartialObject(actual: unknown, expected: Record<string, unknown>): void {
  assert.ok(isPlainObject(actual), 'actual value must be an object');
  const actualRecord = actual as Record<string, unknown>;
  for (const [key, value] of Object.entries(expected)) {
    assertMatches(actualRecord[key], value);
  }
}

function assertMatcher(actual: unknown, matcher: Matcher): void {
  if (matcher.__matcher === 'any') {
    if (matcher.value === Object) {
      assert.ok(actual !== null && typeof actual === 'object');
      return;
    }
    assert.ok(actual instanceof (matcher.value as new (...args: never[]) => unknown));
    return;
  }
  assertPartialObject(actual, matcher.value as Record<string, unknown>);
}

function isMatcher(value: unknown): value is Matcher {
  return isPlainObject(value) && (value as Matcher).__matcher !== undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const expect = expectValue as Expect;
expect.any = any;
expect.objectContaining = objectContaining;

export { describe, expect, it };
