/**
 * test-framework.js — Micro test framework for BeerDex (zero dependencies).
 * 
 * API:  describe(name, fn)  ·  it(name, fn)  ·  expect(val)
 *       beforeEach(fn)  ·  afterEach(fn)  ·  skip(name, fn)
 * 
 * Each `describe` block produces a Suite; each `it` produces a Test.
 * Results are collected in a global registry consumable by the runner.
 */

// ============================================================ //
//  Global Registry                                              //
// ============================================================ //

const _suites = [];
let _currentSuite = null;

export function getSuites() { return _suites; }

export function clearSuites() { _suites.length = 0; }

// ============================================================ //
//  describe / it / hooks                                       //
// ============================================================ //

export function describe(name, fn) {
    const suite = {
        name,
        tests: [],
        beforeEachFns: [],
        afterEachFns: [],
        passed: 0,
        failed: 0,
        skipped: 0,
        durationMs: 0,
        errors: []
    };

    const parentSuite = _currentSuite;
    _currentSuite = suite;

    try {
        fn();
    } catch (err) {
        suite.errors.push({ test: '(suite setup)', error: err });
    }

    _currentSuite = parentSuite;
    _suites.push(suite);
    return suite;
}

export function it(name, fn) {
    if (!_currentSuite) throw new Error('it() must be called inside describe()');
    _currentSuite.tests.push({ name, fn, skip: false });
}

export function skip(name, _fn) {
    if (!_currentSuite) throw new Error('skip() must be called inside describe()');
    _currentSuite.tests.push({ name, fn: null, skip: true });
}

export function beforeEach(fn) {
    if (!_currentSuite) throw new Error('beforeEach() must be called inside describe()');
    _currentSuite.beforeEachFns.push(fn);
}

export function afterEach(fn) {
    if (!_currentSuite) throw new Error('afterEach() must be called inside describe()');
    _currentSuite.afterEachFns.push(fn);
}

// ============================================================ //
//  Assertion engine – expect(value)                            //
// ============================================================ //

class AssertionError extends Error {
    constructor(message, expected, received) {
        super(message);
        this.name = 'AssertionError';
        this.expected = expected;
        this.received = received;
    }
}

function deepEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return false;

    if (Array.isArray(a) !== Array.isArray(b)) return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;

    return keysA.every(k => deepEqual(a[k], b[k]));
}

function pretty(val) {
    if (val === undefined) return 'undefined';
    if (val === null) return 'null';
    if (typeof val === 'string') return `"${val}"`;
    if (typeof val === 'object') {
        try { return JSON.stringify(val, null, 2); } catch { return String(val); }
    }
    return String(val);
}

export function expect(received) {
    return {
        // ── Equality ──
        toBe(expected) {
            if (received !== expected) {
                throw new AssertionError(
                    `Expected ${pretty(expected)} but received ${pretty(received)}`,
                    expected, received
                );
            }
        },

        toEqual(expected) {
            if (!deepEqual(received, expected)) {
                throw new AssertionError(
                    `Deep equality failed.\nExpected: ${pretty(expected)}\nReceived: ${pretty(received)}`,
                    expected, received
                );
            }
        },

        toNotBe(expected) {
            if (received === expected) {
                throw new AssertionError(
                    `Expected value NOT to be ${pretty(expected)}`,
                    `not ${pretty(expected)}`, received
                );
            }
        },

        // ── Truthiness ──
        toBeTruthy() {
            if (!received) {
                throw new AssertionError(`Expected truthy but received ${pretty(received)}`, 'truthy', received);
            }
        },

        toBeFalsy() {
            if (received) {
                throw new AssertionError(`Expected falsy but received ${pretty(received)}`, 'falsy', received);
            }
        },

        toBeNull() {
            if (received !== null) {
                throw new AssertionError(`Expected null but received ${pretty(received)}`, null, received);
            }
        },

        toBeDefined() {
            if (received === undefined) {
                throw new AssertionError('Expected value to be defined', 'defined', 'undefined');
            }
        },

        toBeUndefined() {
            if (received !== undefined) {
                throw new AssertionError(`Expected undefined but received ${pretty(received)}`, 'undefined', received);
            }
        },

        // ── Numbers ──
        toBeGreaterThan(expected) {
            if (typeof received !== 'number' || received <= expected) {
                throw new AssertionError(
                    `Expected ${pretty(received)} > ${pretty(expected)}`,
                    `> ${expected}`, received
                );
            }
        },

        toBeGreaterThanOrEqual(expected) {
            if (typeof received !== 'number' || received < expected) {
                throw new AssertionError(
                    `Expected ${pretty(received)} >= ${pretty(expected)}`,
                    `>= ${expected}`, received
                );
            }
        },

        toBeLessThan(expected) {
            if (typeof received !== 'number' || received >= expected) {
                throw new AssertionError(
                    `Expected ${pretty(received)} < ${pretty(expected)}`,
                    `< ${expected}`, received
                );
            }
        },

        toBeLessThanOrEqual(expected) {
            if (typeof received !== 'number' || received > expected) {
                throw new AssertionError(
                    `Expected ${pretty(received)} <= ${pretty(expected)}`,
                    `<= ${expected}`, received
                );
            }
        },

        toBeCloseTo(expected, precision = 2) {
            const factor = Math.pow(10, precision);
            if (Math.round(received * factor) !== Math.round(expected * factor)) {
                throw new AssertionError(
                    `Expected ${received} to be close to ${expected} (precision ${precision})`,
                    expected, received
                );
            }
        },

        // ── Type ──
        toBeInstanceOf(cls) {
            if (!(received instanceof cls)) {
                throw new AssertionError(
                    `Expected instance of ${cls.name} but received ${typeof received}`,
                    cls.name, typeof received
                );
            }
        },

        toBeTypeOf(expectedType) {
            if (typeof received !== expectedType) {
                throw new AssertionError(
                    `Expected typeof "${expectedType}" but received "${typeof received}"`,
                    expectedType, typeof received
                );
            }
        },

        // ── Strings ──
        toContain(expected) {
            if (typeof received === 'string') {
                if (!received.includes(expected)) {
                    throw new AssertionError(
                        `Expected string to contain "${expected}"`,
                        `contains "${expected}"`, received
                    );
                }
            } else if (Array.isArray(received)) {
                if (!received.includes(expected)) {
                    throw new AssertionError(
                        `Expected array to contain ${pretty(expected)}`,
                        `contains ${pretty(expected)}`, received
                    );
                }
            } else {
                throw new AssertionError('toContain expects a string or array', 'string|array', typeof received);
            }
        },

        toMatch(pattern) {
            const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
            if (!regex.test(received)) {
                throw new AssertionError(
                    `Expected "${received}" to match ${regex}`,
                    `match ${regex}`, received
                );
            }
        },

        toStartWith(prefix) {
            if (typeof received !== 'string' || !received.startsWith(prefix)) {
                throw new AssertionError(
                    `Expected string to start with "${prefix}"`,
                    `starts with "${prefix}"`, received
                );
            }
        },

        // ── Arrays / Objects ──
        toHaveLength(expected) {
            const len = received?.length;
            if (len !== expected) {
                throw new AssertionError(
                    `Expected length ${expected} but received ${len}`,
                    expected, len
                );
            }
        },

        toHaveProperty(key) {
            if (received == null || !(key in received)) {
                throw new AssertionError(
                    `Expected object to have property "${key}"`,
                    `has "${key}"`, Object.keys(received || {})
                );
            }
        },

        // ── Exceptions ──
        toThrow(expectedMessage) {
            if (typeof received !== 'function') {
                throw new AssertionError('toThrow expects a function', 'function', typeof received);
            }
            let threw = false;
            try {
                received();
            } catch (e) {
                threw = true;
                if (expectedMessage && !e.message.includes(expectedMessage)) {
                    throw new AssertionError(
                        `Expected thrown error to include "${expectedMessage}" but got "${e.message}"`,
                        expectedMessage, e.message
                    );
                }
            }
            if (!threw) {
                throw new AssertionError('Expected function to throw but it did not', 'throws', 'no throw');
            }
        },

        not: {
            toBe(expected) {
                if (received === expected) {
                    throw new AssertionError(
                        `Expected value NOT to be ${pretty(expected)}`,
                        `not ${pretty(expected)}`, received
                    );
                }
            },
            toEqual(expected) {
                if (deepEqual(received, expected)) {
                    throw new AssertionError(
                        `Expected values NOT to be deeply equal`,
                        `not ${pretty(expected)}`, received
                    );
                }
            },
            toContain(expected) {
                if (typeof received === 'string' && received.includes(expected)) {
                    throw new AssertionError(
                        `Expected string NOT to contain "${expected}"`,
                        `not contains "${expected}"`, received
                    );
                }
                if (Array.isArray(received) && received.includes(expected)) {
                    throw new AssertionError(
                        `Expected array NOT to contain ${pretty(expected)}`,
                        `not contains ${pretty(expected)}`, received
                    );
                }
            },
            toBeNull() {
                if (received === null) {
                    throw new AssertionError('Expected value NOT to be null', 'not null', null);
                }
            },
            toThrow() {
                if (typeof received !== 'function') {
                    throw new AssertionError('toThrow expects a function', 'function', typeof received);
                }
                try {
                    received();
                } catch (e) {
                    throw new AssertionError(
                        `Expected function NOT to throw but it threw: ${e.message}`,
                        'no throw', e.message
                    );
                }
            }
        }
    };
}

// ============================================================ //
//  Runner: execute all registered suites                       //
// ============================================================ //

export async function runAllSuites(onProgress) {
    const results = [];
    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    const startAll = performance.now();

    for (const suite of _suites) {
        const suiteStart = performance.now();
        const suiteResult = {
            name: suite.name,
            tests: [],
            passed: 0,
            failed: 0,
            skipped: 0,
            durationMs: 0
        };

        for (const test of suite.tests) {
            if (test.skip) {
                suiteResult.tests.push({ name: test.name, status: 'skipped', durationMs: 0 });
                suiteResult.skipped++;
                totalSkipped++;
                if (onProgress) onProgress({ suite: suite.name, test: test.name, status: 'skipped' });
                continue;
            }

            const testStart = performance.now();
            let status = 'passed';
            let errorDetail = null;

            try {
                // Run beforeEach hooks
                for (const hook of suite.beforeEachFns) { await hook(); }
                // Run the test (support async)
                await test.fn();
                // Run afterEach hooks
                for (const hook of suite.afterEachFns) { await hook(); }
            } catch (err) {
                status = 'failed';
                errorDetail = {
                    message: err.message || String(err),
                    expected: err.expected !== undefined ? err.expected : undefined,
                    received: err.received !== undefined ? err.received : undefined,
                    stack: err.stack || ''
                };
                // Still run afterEach on failure
                try {
                    for (const hook of suite.afterEachFns) { await hook(); }
                } catch (_) { /* ignore cleanup errors */ }
            }

            const testDuration = performance.now() - testStart;
            suiteResult.tests.push({
                name: test.name,
                status,
                durationMs: Math.round(testDuration * 100) / 100,
                error: errorDetail
            });

            if (status === 'passed') { suiteResult.passed++; totalPassed++; }
            else { suiteResult.failed++; totalFailed++; }

            if (onProgress) {
                onProgress({ suite: suite.name, test: test.name, status, error: errorDetail });
            }
        }

        suiteResult.durationMs = Math.round((performance.now() - suiteStart) * 100) / 100;
        results.push(suiteResult);
    }

    const totalDuration = Math.round((performance.now() - startAll) * 100) / 100;

    return {
        suites: results,
        summary: { total: totalPassed + totalFailed + totalSkipped, passed: totalPassed, failed: totalFailed, skipped: totalSkipped, durationMs: totalDuration }
    };
}
