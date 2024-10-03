// Copyright 2018-2024 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible.
/** Options for {@linkcode delay}. */ /**
 * Resolve a {@linkcode Promise} after a given amount of milliseconds.
 *
 * @example
 * ```ts
 * import { delay } from "https://deno.land/std@$STD_VERSION/async/delay.ts";
 *
 * // ...
 * const delayedPromise = delay(100);
 * const result = await delayedPromise;
 * // ...
 * ```
 *
 * To allow the process to continue to run as long as the timer exists.
 *
 * ```ts
 * import { delay } from "https://deno.land/std@$STD_VERSION/async/delay.ts";
 *
 * // ...
 * await delay(100, { persistent: false });
 * // ...
 * ```
 */ export function delay(ms, options = {}) {
  const { signal, persistent } = options;
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject)=>{
    const abort = ()=>{
      clearTimeout(i);
      reject(signal?.reason);
    };
    const done = ()=>{
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const i = setTimeout(done, ms);
    signal?.addEventListener("abort", abort, {
      once: true
    });
    if (persistent === false) {
      try {
        // @ts-ignore For browser compatibility
        Deno.unrefTimer(i);
      } catch (error) {
        if (!(error instanceof ReferenceError)) {
          throw error;
        }
        console.error("`persistent` option is only available in Deno");
      }
    }
  });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjIyMi4xL2FzeW5jL2RlbGF5LnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjQgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG4vLyBUaGlzIG1vZHVsZSBpcyBicm93c2VyIGNvbXBhdGlibGUuXG5cbi8qKiBPcHRpb25zIGZvciB7QGxpbmtjb2RlIGRlbGF5fS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRGVsYXlPcHRpb25zIHtcbiAgLyoqIFNpZ25hbCB1c2VkIHRvIGFib3J0IHRoZSBkZWxheS4gKi9cbiAgc2lnbmFsPzogQWJvcnRTaWduYWw7XG4gIC8qKiBJbmRpY2F0ZXMgd2hldGhlciB0aGUgcHJvY2VzcyBzaG91bGQgY29udGludWUgdG8gcnVuIGFzIGxvbmcgYXMgdGhlIHRpbWVyIGV4aXN0cy5cbiAgICpcbiAgICogQGRlZmF1bHQge3RydWV9XG4gICAqL1xuICBwZXJzaXN0ZW50PzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBSZXNvbHZlIGEge0BsaW5rY29kZSBQcm9taXNlfSBhZnRlciBhIGdpdmVuIGFtb3VudCBvZiBtaWxsaXNlY29uZHMuXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBkZWxheSB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2FzeW5jL2RlbGF5LnRzXCI7XG4gKlxuICogLy8gLi4uXG4gKiBjb25zdCBkZWxheWVkUHJvbWlzZSA9IGRlbGF5KDEwMCk7XG4gKiBjb25zdCByZXN1bHQgPSBhd2FpdCBkZWxheWVkUHJvbWlzZTtcbiAqIC8vIC4uLlxuICogYGBgXG4gKlxuICogVG8gYWxsb3cgdGhlIHByb2Nlc3MgdG8gY29udGludWUgdG8gcnVuIGFzIGxvbmcgYXMgdGhlIHRpbWVyIGV4aXN0cy5cbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgZGVsYXkgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9hc3luYy9kZWxheS50c1wiO1xuICpcbiAqIC8vIC4uLlxuICogYXdhaXQgZGVsYXkoMTAwLCB7IHBlcnNpc3RlbnQ6IGZhbHNlIH0pO1xuICogLy8gLi4uXG4gKiBgYGBcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlbGF5KG1zOiBudW1iZXIsIG9wdGlvbnM6IERlbGF5T3B0aW9ucyA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IHsgc2lnbmFsLCBwZXJzaXN0ZW50IH0gPSBvcHRpb25zO1xuICBpZiAoc2lnbmFsPy5hYm9ydGVkKSByZXR1cm4gUHJvbWlzZS5yZWplY3Qoc2lnbmFsLnJlYXNvbik7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgYWJvcnQgPSAoKSA9PiB7XG4gICAgICBjbGVhclRpbWVvdXQoaSk7XG4gICAgICByZWplY3Qoc2lnbmFsPy5yZWFzb24pO1xuICAgIH07XG4gICAgY29uc3QgZG9uZSA9ICgpID0+IHtcbiAgICAgIHNpZ25hbD8ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsIGFib3J0KTtcbiAgICAgIHJlc29sdmUoKTtcbiAgICB9O1xuICAgIGNvbnN0IGkgPSBzZXRUaW1lb3V0KGRvbmUsIG1zKTtcbiAgICBzaWduYWw/LmFkZEV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCBhYm9ydCwgeyBvbmNlOiB0cnVlIH0pO1xuICAgIGlmIChwZXJzaXN0ZW50ID09PSBmYWxzZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gQHRzLWlnbm9yZSBGb3IgYnJvd3NlciBjb21wYXRpYmlsaXR5XG4gICAgICAgIERlbm8udW5yZWZUaW1lcihpKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmICghKGVycm9yIGluc3RhbmNlb2YgUmVmZXJlbmNlRXJyb3IpKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgY29uc29sZS5lcnJvcihcImBwZXJzaXN0ZW50YCBvcHRpb24gaXMgb25seSBhdmFpbGFibGUgaW4gRGVub1wiKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRSxxQ0FBcUM7QUFFckMsbUNBQW1DLEdBV25DOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBc0JDLEdBQ0QsT0FBTyxTQUFTLE1BQU0sRUFBVSxFQUFFLFVBQXdCLENBQUMsQ0FBQztFQUMxRCxNQUFNLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxHQUFHO0VBQy9CLElBQUksUUFBUSxTQUFTLE9BQU8sUUFBUSxNQUFNLENBQUMsT0FBTyxNQUFNO0VBQ3hELE9BQU8sSUFBSSxRQUFRLENBQUMsU0FBUztJQUMzQixNQUFNLFFBQVE7TUFDWixhQUFhO01BQ2IsT0FBTyxRQUFRO0lBQ2pCO0lBQ0EsTUFBTSxPQUFPO01BQ1gsUUFBUSxvQkFBb0IsU0FBUztNQUNyQztJQUNGO0lBQ0EsTUFBTSxJQUFJLFdBQVcsTUFBTTtJQUMzQixRQUFRLGlCQUFpQixTQUFTLE9BQU87TUFBRSxNQUFNO0lBQUs7SUFDdEQsSUFBSSxlQUFlLE9BQU87TUFDeEIsSUFBSTtRQUNGLHVDQUF1QztRQUN2QyxLQUFLLFVBQVUsQ0FBQztNQUNsQixFQUFFLE9BQU8sT0FBTztRQUNkLElBQUksQ0FBQyxDQUFDLGlCQUFpQixjQUFjLEdBQUc7VUFDdEMsTUFBTTtRQUNSO1FBQ0EsUUFBUSxLQUFLLENBQUM7TUFDaEI7SUFDRjtFQUNGO0FBQ0YifQ==