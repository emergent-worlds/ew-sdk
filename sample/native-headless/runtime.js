// Only native primitives required by the unchanged SDK and Kestrel core are supplied.
globalThis.TextEncoder = class { encode(value = '') { return Uint8Array.from(__utf8(String(value))); } };
globalThis.btoa = value => { const result = __btoa(String(value)); if (result == null) throw Error('Invalid base64 input'); return result; };
globalThis.atob = value => { const result = __atob(String(value)); if (result == null) throw Error('Invalid base64 input'); return result; };
globalThis.setTimeout = (callback, delay = 0, ...args) => { if (typeof callback !== 'function') throw Error('Invalid timer'); return __timer(() => callback(...args), Number(delay)); };
globalThis.clearTimeout = id => __clearTimer(id);
globalThis.console = Object.freeze({log() {}, warn() {}, error() {}});
globalThis.URL = class {
  constructor(value) {
    if (value !== __launch.url) throw Error('Only the exact launcher address is available');
    Object.assign(this, {href: __launch.url, protocol: 'ws:', hostname: '127.0.0.1', port: __launch.port, username: '', password: '', search: '', hash: ''});
  }
};
globalThis.WebSocket = class {
  readyState = 0;
  #listeners = new Map();
  constructor(address) {
    if (!__open(address, (type, data) => {
      if (type === 'open') this.readyState = 1;
      else if (type === 'close' || type === 'error') this.readyState = 3;
      for (const listener of [...(this.#listeners.get(type) ?? [])]) listener({type, data});
    })) throw Error('The original launcher connection is unavailable');
  }
  addEventListener(type, callback) { if (!this.#listeners.has(type)) this.#listeners.set(type, new Set()); this.#listeners.get(type).add(callback); }
  removeEventListener(type, callback) { this.#listeners.get(type)?.delete(callback); }
  send(data) { if (this.readyState !== 1 || typeof data !== 'string' || !__send(data)) throw Error('The launcher connection is unavailable'); }
  close() { this.readyState = 3; __close(); }
};
