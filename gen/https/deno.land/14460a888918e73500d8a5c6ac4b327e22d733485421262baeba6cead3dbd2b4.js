import { copyProps } from "./utils.ts";
/**
 * Handles storage and accessing of values
 *
 * In this case, we use it to store compiled template functions
 * Indexed by their `name` or `filename`
 */ class Cacher {
  cache;
  constructor(cache){
    this.cache = cache;
  }
  define(key, val) {
    this.cache[key] = val;
  }
  get(key) {
    // string | array.
    // TODO: allow array of keys to look down
    // TODO: create plugin to allow referencing helpers, filters with dot notation
    return this.cache[key];
  }
  remove(key) {
    delete this.cache[key];
  }
  reset() {
    this.cache = {};
  }
  load(cacheObj) {
    copyProps(this.cache, cacheObj);
  }
}
export { Cacher };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvZXRhQHYyLjIuMC9zdG9yYWdlLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGNvcHlQcm9wcyB9IGZyb20gXCIuL3V0aWxzLnRzXCI7XG5cbi8qKlxuICogSGFuZGxlcyBzdG9yYWdlIGFuZCBhY2Nlc3Npbmcgb2YgdmFsdWVzXG4gKlxuICogSW4gdGhpcyBjYXNlLCB3ZSB1c2UgaXQgdG8gc3RvcmUgY29tcGlsZWQgdGVtcGxhdGUgZnVuY3Rpb25zXG4gKiBJbmRleGVkIGJ5IHRoZWlyIGBuYW1lYCBvciBgZmlsZW5hbWVgXG4gKi9cbmNsYXNzIENhY2hlcjxUPiB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgY2FjaGU6IFJlY29yZDxzdHJpbmcsIFQ+KSB7fVxuICBkZWZpbmUoa2V5OiBzdHJpbmcsIHZhbDogVCk6IHZvaWQge1xuICAgIHRoaXMuY2FjaGVba2V5XSA9IHZhbDtcbiAgfVxuICBnZXQoa2V5OiBzdHJpbmcpOiBUIHtcbiAgICAvLyBzdHJpbmcgfCBhcnJheS5cbiAgICAvLyBUT0RPOiBhbGxvdyBhcnJheSBvZiBrZXlzIHRvIGxvb2sgZG93blxuICAgIC8vIFRPRE86IGNyZWF0ZSBwbHVnaW4gdG8gYWxsb3cgcmVmZXJlbmNpbmcgaGVscGVycywgZmlsdGVycyB3aXRoIGRvdCBub3RhdGlvblxuICAgIHJldHVybiB0aGlzLmNhY2hlW2tleV07XG4gIH1cbiAgcmVtb3ZlKGtleTogc3RyaW5nKTogdm9pZCB7XG4gICAgZGVsZXRlIHRoaXMuY2FjaGVba2V5XTtcbiAgfVxuICByZXNldCgpOiB2b2lkIHtcbiAgICB0aGlzLmNhY2hlID0ge307XG4gIH1cbiAgbG9hZChjYWNoZU9iajogUmVjb3JkPHN0cmluZywgVD4pOiB2b2lkIHtcbiAgICBjb3B5UHJvcHModGhpcy5jYWNoZSwgY2FjaGVPYmopO1xuICB9XG59XG5cbmV4cG9ydCB7IENhY2hlciB9O1xuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFNBQVMsU0FBUyxRQUFRLGFBQWE7QUFFdkM7Ozs7O0NBS0MsR0FDRCxNQUFNO0VBQ2dCO0VBQXBCLFlBQW9CLE1BQTBCO2lCQUExQjtFQUEyQjtFQUMvQyxPQUFPLEdBQVcsRUFBRSxHQUFNLEVBQVE7SUFDaEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUc7RUFDcEI7RUFDQSxJQUFJLEdBQVcsRUFBSztJQUNsQixrQkFBa0I7SUFDbEIseUNBQXlDO0lBQ3pDLDhFQUE4RTtJQUM5RSxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSTtFQUN4QjtFQUNBLE9BQU8sR0FBVyxFQUFRO0lBQ3hCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJO0VBQ3hCO0VBQ0EsUUFBYztJQUNaLElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQztFQUNoQjtFQUNBLEtBQUssUUFBMkIsRUFBUTtJQUN0QyxVQUFVLElBQUksQ0FBQyxLQUFLLEVBQUU7RUFDeEI7QUFDRjtBQUVBLFNBQVMsTUFBTSxHQUFHIn0=