// Copyright 2018-2021 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible.
import { SEP } from "./separator.ts";
/** Determines the common path from a set of paths, using an optional separator,
 * which defaults to the OS default separator.
 *
 * ```ts
 *       import { common } from "https://deno.land/std@$STD_VERSION/path/mod.ts";
 *       const p = common([
 *         "./deno/std/path/mod.ts",
 *         "./deno/std/fs/mod.ts",
 *       ]);
 *       console.log(p); // "./deno/std/"
 * ```
 */ export function common(paths, sep = SEP) {
  const [first = "", ...remaining] = paths;
  if (first === "" || remaining.length === 0) {
    return first.substring(0, first.lastIndexOf(sep) + 1);
  }
  const parts = first.split(sep);
  let endOfPrefix = parts.length;
  for (const path of remaining){
    const compare = path.split(sep);
    for(let i = 0; i < endOfPrefix; i++){
      if (compare[i] !== parts[i]) {
        endOfPrefix = i;
      }
    }
    if (endOfPrefix === 0) {
      return "";
    }
  }
  const prefix = parts.slice(0, endOfPrefix).join(sep);
  return prefix.endsWith(sep) ? prefix : `${prefix}${sep}`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL25vZGUvcGF0aC9jb21tb24udHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMSB0aGUgRGVubyBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cbi8vIFRoaXMgbW9kdWxlIGlzIGJyb3dzZXIgY29tcGF0aWJsZS5cblxuaW1wb3J0IHsgU0VQIH0gZnJvbSBcIi4vc2VwYXJhdG9yLnRzXCI7XG5cbi8qKiBEZXRlcm1pbmVzIHRoZSBjb21tb24gcGF0aCBmcm9tIGEgc2V0IG9mIHBhdGhzLCB1c2luZyBhbiBvcHRpb25hbCBzZXBhcmF0b3IsXG4gKiB3aGljaCBkZWZhdWx0cyB0byB0aGUgT1MgZGVmYXVsdCBzZXBhcmF0b3IuXG4gKlxuICogYGBgdHNcbiAqICAgICAgIGltcG9ydCB7IGNvbW1vbiB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL3BhdGgvbW9kLnRzXCI7XG4gKiAgICAgICBjb25zdCBwID0gY29tbW9uKFtcbiAqICAgICAgICAgXCIuL2Rlbm8vc3RkL3BhdGgvbW9kLnRzXCIsXG4gKiAgICAgICAgIFwiLi9kZW5vL3N0ZC9mcy9tb2QudHNcIixcbiAqICAgICAgIF0pO1xuICogICAgICAgY29uc29sZS5sb2cocCk7IC8vIFwiLi9kZW5vL3N0ZC9cIlxuICogYGBgXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21tb24ocGF0aHM6IHN0cmluZ1tdLCBzZXAgPSBTRVApOiBzdHJpbmcge1xuICBjb25zdCBbZmlyc3QgPSBcIlwiLCAuLi5yZW1haW5pbmddID0gcGF0aHM7XG4gIGlmIChmaXJzdCA9PT0gXCJcIiB8fCByZW1haW5pbmcubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIGZpcnN0LnN1YnN0cmluZygwLCBmaXJzdC5sYXN0SW5kZXhPZihzZXApICsgMSk7XG4gIH1cbiAgY29uc3QgcGFydHMgPSBmaXJzdC5zcGxpdChzZXApO1xuXG4gIGxldCBlbmRPZlByZWZpeCA9IHBhcnRzLmxlbmd0aDtcbiAgZm9yIChjb25zdCBwYXRoIG9mIHJlbWFpbmluZykge1xuICAgIGNvbnN0IGNvbXBhcmUgPSBwYXRoLnNwbGl0KHNlcCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBlbmRPZlByZWZpeDsgaSsrKSB7XG4gICAgICBpZiAoY29tcGFyZVtpXSAhPT0gcGFydHNbaV0pIHtcbiAgICAgICAgZW5kT2ZQcmVmaXggPSBpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChlbmRPZlByZWZpeCA9PT0gMCkge1xuICAgICAgcmV0dXJuIFwiXCI7XG4gICAgfVxuICB9XG4gIGNvbnN0IHByZWZpeCA9IHBhcnRzLnNsaWNlKDAsIGVuZE9mUHJlZml4KS5qb2luKHNlcCk7XG4gIHJldHVybiBwcmVmaXguZW5kc1dpdGgoc2VwKSA/IHByZWZpeCA6IGAke3ByZWZpeH0ke3NlcH1gO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRSxxQ0FBcUM7QUFFckMsU0FBUyxHQUFHLFFBQVEsaUJBQWlCO0FBRXJDOzs7Ozs7Ozs7OztDQVdDLEdBQ0QsT0FBTyxTQUFTLE9BQU8sS0FBZSxFQUFFLE1BQU0sR0FBRztFQUMvQyxNQUFNLENBQUMsUUFBUSxFQUFFLEVBQUUsR0FBRyxVQUFVLEdBQUc7RUFDbkMsSUFBSSxVQUFVLE1BQU0sVUFBVSxNQUFNLEtBQUssR0FBRztJQUMxQyxPQUFPLE1BQU0sU0FBUyxDQUFDLEdBQUcsTUFBTSxXQUFXLENBQUMsT0FBTztFQUNyRDtFQUNBLE1BQU0sUUFBUSxNQUFNLEtBQUssQ0FBQztFQUUxQixJQUFJLGNBQWMsTUFBTSxNQUFNO0VBQzlCLEtBQUssTUFBTSxRQUFRLFVBQVc7SUFDNUIsTUFBTSxVQUFVLEtBQUssS0FBSyxDQUFDO0lBQzNCLElBQUssSUFBSSxJQUFJLEdBQUcsSUFBSSxhQUFhLElBQUs7TUFDcEMsSUFBSSxPQUFPLENBQUMsRUFBRSxLQUFLLEtBQUssQ0FBQyxFQUFFLEVBQUU7UUFDM0IsY0FBYztNQUNoQjtJQUNGO0lBRUEsSUFBSSxnQkFBZ0IsR0FBRztNQUNyQixPQUFPO0lBQ1Q7RUFDRjtFQUNBLE1BQU0sU0FBUyxNQUFNLEtBQUssQ0FBQyxHQUFHLGFBQWEsSUFBSSxDQUFDO0VBQ2hELE9BQU8sT0FBTyxRQUFRLENBQUMsT0FBTyxTQUFTLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDO0FBQzFEIn0=