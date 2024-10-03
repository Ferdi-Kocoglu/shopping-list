// Copyright 2018-2023 the Deno authors. All rights reserved. MIT license.
// Copyright the Browserify authors. MIT License.
// Ported mostly from https://github.com/browserify/path-browserify/
// This module is browser compatible.
/**
 * Utilities for working with OS-specific file paths.
 *
 * Codes in the examples uses POSIX path but it automatically use Windows path
 * on Windows. Use methods under `posix` or `win32` object instead to handle non
 * platform specific path like:
 * ```ts
 * import { posix, win32 } from "https://deno.land/std@$STD_VERSION/path/mod.ts";
 * const p1 = posix.fromFileUrl("file:///home/foo");
 * const p2 = win32.fromFileUrl("file:///home/foo");
 * console.log(p1); // "/home/foo"
 * console.log(p2); // "\\home\\foo"
 * ```
 *
 * This module is browser compatible.
 *
 * @module
 */ import { isWindows } from "../_util/os.ts";
import * as _win32 from "./win32.ts";
import * as _posix from "./posix.ts";
const path = isWindows ? _win32 : _posix;
export const win32 = _win32;
export const posix = _posix;
export const { basename, delimiter, dirname, extname, format, fromFileUrl, isAbsolute, join, normalize, parse, relative, resolve, toFileUrl, toNamespacedPath } = path;
/** @deprecated (will be removed after 0.188.0) Use SEP intead. */ export const sep = path.sep;
export * from "./common.ts";
export { SEP, SEP_PATTERN } from "./separator.ts";
export * from "./_interface.ts";
export * from "./glob.ts";
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE4Ni4wL3BhdGgvbW9kLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjMgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG4vLyBDb3B5cmlnaHQgdGhlIEJyb3dzZXJpZnkgYXV0aG9ycy4gTUlUIExpY2Vuc2UuXG4vLyBQb3J0ZWQgbW9zdGx5IGZyb20gaHR0cHM6Ly9naXRodWIuY29tL2Jyb3dzZXJpZnkvcGF0aC1icm93c2VyaWZ5L1xuLy8gVGhpcyBtb2R1bGUgaXMgYnJvd3NlciBjb21wYXRpYmxlLlxuXG4vKipcbiAqIFV0aWxpdGllcyBmb3Igd29ya2luZyB3aXRoIE9TLXNwZWNpZmljIGZpbGUgcGF0aHMuXG4gKlxuICogQ29kZXMgaW4gdGhlIGV4YW1wbGVzIHVzZXMgUE9TSVggcGF0aCBidXQgaXQgYXV0b21hdGljYWxseSB1c2UgV2luZG93cyBwYXRoXG4gKiBvbiBXaW5kb3dzLiBVc2UgbWV0aG9kcyB1bmRlciBgcG9zaXhgIG9yIGB3aW4zMmAgb2JqZWN0IGluc3RlYWQgdG8gaGFuZGxlIG5vblxuICogcGxhdGZvcm0gc3BlY2lmaWMgcGF0aCBsaWtlOlxuICogYGBgdHNcbiAqIGltcG9ydCB7IHBvc2l4LCB3aW4zMiB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL3BhdGgvbW9kLnRzXCI7XG4gKiBjb25zdCBwMSA9IHBvc2l4LmZyb21GaWxlVXJsKFwiZmlsZTovLy9ob21lL2Zvb1wiKTtcbiAqIGNvbnN0IHAyID0gd2luMzIuZnJvbUZpbGVVcmwoXCJmaWxlOi8vL2hvbWUvZm9vXCIpO1xuICogY29uc29sZS5sb2cocDEpOyAvLyBcIi9ob21lL2Zvb1wiXG4gKiBjb25zb2xlLmxvZyhwMik7IC8vIFwiXFxcXGhvbWVcXFxcZm9vXCJcbiAqIGBgYFxuICpcbiAqIFRoaXMgbW9kdWxlIGlzIGJyb3dzZXIgY29tcGF0aWJsZS5cbiAqXG4gKiBAbW9kdWxlXG4gKi9cblxuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSBcIi4uL191dGlsL29zLnRzXCI7XG5pbXBvcnQgKiBhcyBfd2luMzIgZnJvbSBcIi4vd2luMzIudHNcIjtcbmltcG9ydCAqIGFzIF9wb3NpeCBmcm9tIFwiLi9wb3NpeC50c1wiO1xuXG5jb25zdCBwYXRoID0gaXNXaW5kb3dzID8gX3dpbjMyIDogX3Bvc2l4O1xuXG5leHBvcnQgY29uc3Qgd2luMzIgPSBfd2luMzI7XG5leHBvcnQgY29uc3QgcG9zaXggPSBfcG9zaXg7XG5leHBvcnQgY29uc3Qge1xuICBiYXNlbmFtZSxcbiAgZGVsaW1pdGVyLFxuICBkaXJuYW1lLFxuICBleHRuYW1lLFxuICBmb3JtYXQsXG4gIGZyb21GaWxlVXJsLFxuICBpc0Fic29sdXRlLFxuICBqb2luLFxuICBub3JtYWxpemUsXG4gIHBhcnNlLFxuICByZWxhdGl2ZSxcbiAgcmVzb2x2ZSxcbiAgdG9GaWxlVXJsLFxuICB0b05hbWVzcGFjZWRQYXRoLFxufSA9IHBhdGg7XG5cbi8qKiBAZGVwcmVjYXRlZCAod2lsbCBiZSByZW1vdmVkIGFmdGVyIDAuMTg4LjApIFVzZSBTRVAgaW50ZWFkLiAqL1xuZXhwb3J0IGNvbnN0IHNlcCA9IHBhdGguc2VwO1xuXG5leHBvcnQgKiBmcm9tIFwiLi9jb21tb24udHNcIjtcbmV4cG9ydCB7IFNFUCwgU0VQX1BBVFRFUk4gfSBmcm9tIFwiLi9zZXBhcmF0b3IudHNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL19pbnRlcmZhY2UudHNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL2dsb2IudHNcIjtcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwwRUFBMEU7QUFDMUUsaURBQWlEO0FBQ2pELG9FQUFvRTtBQUNwRSxxQ0FBcUM7QUFFckM7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBaUJDLEdBRUQsU0FBUyxTQUFTLFFBQVEsaUJBQWlCO0FBQzNDLFlBQVksWUFBWSxhQUFhO0FBQ3JDLFlBQVksWUFBWSxhQUFhO0FBRXJDLE1BQU0sT0FBTyxZQUFZLFNBQVM7QUFFbEMsT0FBTyxNQUFNLFFBQVEsT0FBTztBQUM1QixPQUFPLE1BQU0sUUFBUSxPQUFPO0FBQzVCLE9BQU8sTUFBTSxFQUNYLFFBQVEsRUFDUixTQUFTLEVBQ1QsT0FBTyxFQUNQLE9BQU8sRUFDUCxNQUFNLEVBQ04sV0FBVyxFQUNYLFVBQVUsRUFDVixJQUFJLEVBQ0osU0FBUyxFQUNULEtBQUssRUFDTCxRQUFRLEVBQ1IsT0FBTyxFQUNQLFNBQVMsRUFDVCxnQkFBZ0IsRUFDakIsR0FBRyxLQUFLO0FBRVQsZ0VBQWdFLEdBQ2hFLE9BQU8sTUFBTSxNQUFNLEtBQUssR0FBRyxDQUFDO0FBRTVCLGNBQWMsY0FBYztBQUM1QixTQUFTLEdBQUcsRUFBRSxXQUFXLFFBQVEsaUJBQWlCO0FBQ2xELGNBQWMsa0JBQWtCO0FBQ2hDLGNBQWMsWUFBWSJ9