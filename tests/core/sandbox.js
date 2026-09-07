/**
 * sandbox.js — localStorage isolation for BeerDex tests.
 * 
 * Intercepts all localStorage calls and routes them to an in-memory Map.
 * Real user data is never touched during test execution.
 * 
 * Usage:
 *   Sandbox.enter();   // start isolation
 *   ... tests ...
 *   Sandbox.exit();    // restore real localStorage
 */

const _realStorage = {};
let _virtualStore = new Map();
let _isActive = false;

/**
 * Capture references to the real localStorage methods once.
 */
function _captureReal() {
    _realStorage.getItem = localStorage.getItem.bind(localStorage);
    _realStorage.setItem = localStorage.setItem.bind(localStorage);
    _realStorage.removeItem = localStorage.removeItem.bind(localStorage);
    _realStorage.clear = localStorage.clear.bind(localStorage);
    _realStorage.key = localStorage.key.bind(localStorage);
    // length is a getter, we handle it via defineProperty
}

/**
 * Replace localStorage methods with virtual implementations.
 */
function _installVirtual() {
    localStorage.getItem = (key) => {
        return _virtualStore.has(key) ? _virtualStore.get(key) : null;
    };

    localStorage.setItem = (key, value) => {
        _virtualStore.set(key, String(value));
    };

    localStorage.removeItem = (key) => {
        _virtualStore.delete(key);
    };

    localStorage.clear = () => {
        _virtualStore.clear();
    };

    localStorage.key = (index) => {
        const keys = [..._virtualStore.keys()];
        return index < keys.length ? keys[index] : null;
    };

    // Override length
    try {
        Object.defineProperty(localStorage, 'length', {
            get: () => _virtualStore.size,
            configurable: true
        });
    } catch (_) {
        // Some browsers may not allow redefining length — it's non-critical
    }
}

/**
 * Restore real localStorage methods.
 */
function _restoreReal() {
    localStorage.getItem = _realStorage.getItem;
    localStorage.setItem = _realStorage.setItem;
    localStorage.removeItem = _realStorage.removeItem;
    localStorage.clear = _realStorage.clear;
    localStorage.key = _realStorage.key;

    try {
        // Restore the native length property by deleting our override
        delete localStorage.length;
    } catch (_) { /* noop */ }
}

export const Sandbox = {
    /**
     * Activate the sandbox. All localStorage operations will be
     * redirected to an in-memory store.
     * 
     * @param {Object} [initialData] - Optional seed data as { key: value }
     */
    enter(initialData = {}) {
        if (_isActive) return; // prevent double-enter
        _captureReal();
        _virtualStore = new Map();

        // Seed initial data
        for (const [k, v] of Object.entries(initialData)) {
            _virtualStore.set(k, typeof v === 'string' ? v : JSON.stringify(v));
        }

        _installVirtual();
        _isActive = true;
    },

    /**
     * Deactivate the sandbox and restore the real localStorage.
     */
    exit() {
        if (!_isActive) return;
        _restoreReal();
        _virtualStore.clear();
        _isActive = false;
    },

    /**
     * Reset the virtual store without exiting the sandbox.
     * @param {Object} [newData] - Optional new seed data
     */
    reset(newData = {}) {
        _virtualStore.clear();
        for (const [k, v] of Object.entries(newData)) {
            _virtualStore.set(k, typeof v === 'string' ? v : JSON.stringify(v));
        }
    },

    /**
     * Get a snapshot of the virtual store for debugging.
     * @returns {Object}
     */
    snapshot() {
        const obj = {};
        for (const [k, v] of _virtualStore.entries()) {
            obj[k] = v;
        }
        return obj;
    },

    /**
     * Check if sandbox is active.
     * @returns {boolean}
     */
    get isActive() {
        return _isActive;
    }
};
