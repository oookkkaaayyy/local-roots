// Minimal runtime shims so older iOS Safari (12 and 13) can run the app.
const stringProto = String.prototype as any;
if (!stringProto.replaceAll) {
  stringProto.replaceAll = function (this: string, search: string | RegExp, replacement: any) {
    if (search instanceof RegExp) {
      if (!search.global) throw new TypeError('replaceAll must be called with a global RegExp');
      return this.replace(search, replacement);
    }
    return this.split(search).join(typeof replacement === 'function' ? replacement(search) : replacement);
  };
}
const arrayProto = Array.prototype as any;
if (!arrayProto.at) {
  Object.defineProperty(arrayProto, 'at', { configurable: true, writable: true, value: function (this: any[], index: number) {
    const i = Math.trunc(index) || 0; const k = i < 0 ? this.length + i : i; return this[k];
  } });
}
if (!(Object as any).hasOwn) {
  (Object as any).hasOwn = (target: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(target, key);
}
const root: any = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : window);
if (!root.globalThis) root.globalThis = root;
if (typeof root.structuredClone !== 'function') {
  root.structuredClone = (value: unknown) => JSON.parse(JSON.stringify(value));
}
if (!(Object as any).fromEntries) {
  (Object as any).fromEntries = (entries: Iterable<[PropertyKey, unknown]>) => {
    const out: any = {}; for (const [k, v] of entries as any) out[k] = v; return out;
  };
}
if (!(Promise as any).allSettled) {
  (Promise as any).allSettled = (items: Iterable<unknown>) => Promise.all(Array.from(items, (item) =>
    Promise.resolve(item).then((value) => ({ status: 'fulfilled', value }), (reason) => ({ status: 'rejected', reason }))));
}
export {};
