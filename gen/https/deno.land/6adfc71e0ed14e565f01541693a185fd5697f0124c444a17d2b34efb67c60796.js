// Copyright 2018-2021 the Deno authors. All rights reserved. MIT license.
import { notImplemented } from "../_utils.ts";
import { fromFileUrl } from "../path.ts";
import { Buffer } from "../buffer.ts";
import { Readable as NodeReadable } from "../stream.ts";
class ReadStream extends NodeReadable {
  path;
  constructor(path, opts){
    path = path instanceof URL ? fromFileUrl(path) : path;
    const hasBadOptions = opts && (opts.fd || opts.start || opts.end || opts.fs);
    if (hasBadOptions) {
      notImplemented();
    }
    const file = Deno.openSync(path, {
      read: true
    });
    const buffer = new Uint8Array(16 * 1024);
    super({
      autoDestroy: true,
      emitClose: true,
      objectMode: false,
      read: async function(_size) {
        try {
          const n = await file.read(buffer);
          this.push(n ? Buffer.from(buffer.slice(0, n)) : null);
        } catch (err) {
          this.destroy(err);
        }
      },
      destroy: (err, cb)=>{
        try {
          file.close();
        // deno-lint-ignore no-empty
        } catch  {}
        cb(err);
      }
    });
    this.path = path;
  }
}
export function createReadStream(path, options) {
  return new ReadStream(path, options);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL25vZGUvX2ZzL19mc19zdHJlYW1zLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjEgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5pbXBvcnQgeyBub3RJbXBsZW1lbnRlZCB9IGZyb20gXCIuLi9fdXRpbHMudHNcIjtcbmltcG9ydCB7IGZyb21GaWxlVXJsIH0gZnJvbSBcIi4uL3BhdGgudHNcIjtcbmltcG9ydCB7IEJ1ZmZlciB9IGZyb20gXCIuLi9idWZmZXIudHNcIjtcbmltcG9ydCB7IFJlYWRhYmxlIGFzIE5vZGVSZWFkYWJsZSB9IGZyb20gXCIuLi9zdHJlYW0udHNcIjtcblxudHlwZSBSZWFkU3RyZWFtT3B0aW9ucyA9IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXG5jbGFzcyBSZWFkU3RyZWFtIGV4dGVuZHMgTm9kZVJlYWRhYmxlIHtcbiAgcHVibGljIHBhdGg6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihwYXRoOiBzdHJpbmcgfCBVUkwsIG9wdHM/OiBSZWFkU3RyZWFtT3B0aW9ucykge1xuICAgIHBhdGggPSBwYXRoIGluc3RhbmNlb2YgVVJMID8gZnJvbUZpbGVVcmwocGF0aCkgOiBwYXRoO1xuICAgIGNvbnN0IGhhc0JhZE9wdGlvbnMgPSBvcHRzICYmIChcbiAgICAgIG9wdHMuZmQgfHwgb3B0cy5zdGFydCB8fCBvcHRzLmVuZCB8fCBvcHRzLmZzXG4gICAgKTtcbiAgICBpZiAoaGFzQmFkT3B0aW9ucykge1xuICAgICAgbm90SW1wbGVtZW50ZWQoKTtcbiAgICB9XG4gICAgY29uc3QgZmlsZSA9IERlbm8ub3BlblN5bmMocGF0aCwgeyByZWFkOiB0cnVlIH0pO1xuICAgIGNvbnN0IGJ1ZmZlciA9IG5ldyBVaW50OEFycmF5KDE2ICogMTAyNCk7XG4gICAgc3VwZXIoe1xuICAgICAgYXV0b0Rlc3Ryb3k6IHRydWUsXG4gICAgICBlbWl0Q2xvc2U6IHRydWUsXG4gICAgICBvYmplY3RNb2RlOiBmYWxzZSxcbiAgICAgIHJlYWQ6IGFzeW5jIGZ1bmN0aW9uIChfc2l6ZSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IG4gPSBhd2FpdCBmaWxlLnJlYWQoYnVmZmVyKTtcbiAgICAgICAgICB0aGlzLnB1c2gobiA/IEJ1ZmZlci5mcm9tKGJ1ZmZlci5zbGljZSgwLCBuKSkgOiBudWxsKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgdGhpcy5kZXN0cm95KGVyciBhcyBFcnJvcik7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBkZXN0cm95OiAoZXJyLCBjYikgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGZpbGUuY2xvc2UoKTtcbiAgICAgICAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWVtcHR5XG4gICAgICAgIH0gY2F0Y2gge31cbiAgICAgICAgY2IoZXJyKTtcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgdGhpcy5wYXRoID0gcGF0aDtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUmVhZFN0cmVhbShcbiAgcGF0aDogc3RyaW5nIHwgVVJMLFxuICBvcHRpb25zPzogUmVhZFN0cmVhbU9wdGlvbnMsXG4pOiBSZWFkU3RyZWFtIHtcbiAgcmV0dXJuIG5ldyBSZWFkU3RyZWFtKHBhdGgsIG9wdGlvbnMpO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRSxTQUFTLGNBQWMsUUFBUSxlQUFlO0FBQzlDLFNBQVMsV0FBVyxRQUFRLGFBQWE7QUFDekMsU0FBUyxNQUFNLFFBQVEsZUFBZTtBQUN0QyxTQUFTLFlBQVksWUFBWSxRQUFRLGVBQWU7QUFJeEQsTUFBTSxtQkFBbUI7RUFDaEIsS0FBYTtFQUVwQixZQUFZLElBQWtCLEVBQUUsSUFBd0IsQ0FBRTtJQUN4RCxPQUFPLGdCQUFnQixNQUFNLFlBQVksUUFBUTtJQUNqRCxNQUFNLGdCQUFnQixRQUFRLENBQzVCLEtBQUssRUFBRSxJQUFJLEtBQUssS0FBSyxJQUFJLEtBQUssR0FBRyxJQUFJLEtBQUssRUFBRSxBQUM5QztJQUNBLElBQUksZUFBZTtNQUNqQjtJQUNGO0lBQ0EsTUFBTSxPQUFPLEtBQUssUUFBUSxDQUFDLE1BQU07TUFBRSxNQUFNO0lBQUs7SUFDOUMsTUFBTSxTQUFTLElBQUksV0FBVyxLQUFLO0lBQ25DLEtBQUssQ0FBQztNQUNKLGFBQWE7TUFDYixXQUFXO01BQ1gsWUFBWTtNQUNaLE1BQU0sZUFBZ0IsS0FBSztRQUN6QixJQUFJO1VBQ0YsTUFBTSxJQUFJLE1BQU0sS0FBSyxJQUFJLENBQUM7VUFDMUIsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLE9BQU8sSUFBSSxDQUFDLE9BQU8sS0FBSyxDQUFDLEdBQUcsTUFBTTtRQUNsRCxFQUFFLE9BQU8sS0FBSztVQUNaLElBQUksQ0FBQyxPQUFPLENBQUM7UUFDZjtNQUNGO01BQ0EsU0FBUyxDQUFDLEtBQUs7UUFDYixJQUFJO1VBQ0YsS0FBSyxLQUFLO1FBQ1YsNEJBQTRCO1FBQzlCLEVBQUUsT0FBTSxDQUFDO1FBQ1QsR0FBRztNQUNMO0lBQ0Y7SUFDQSxJQUFJLENBQUMsSUFBSSxHQUFHO0VBQ2Q7QUFDRjtBQUVBLE9BQU8sU0FBUyxpQkFDZCxJQUFrQixFQUNsQixPQUEyQjtFQUUzQixPQUFPLElBQUksV0FBVyxNQUFNO0FBQzlCIn0=