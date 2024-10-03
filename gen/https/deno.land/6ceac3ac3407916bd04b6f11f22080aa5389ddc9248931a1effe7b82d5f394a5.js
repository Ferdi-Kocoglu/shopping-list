// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// Copyright Joyent, Inc. and Node.js contributors. All rights reserved. MIT license.
// The following are all the process APIs that don't depend on the stream module
// They have to be split this way to prevent a circular dependency
import { isWindows } from "../../_util/os.ts";
import { nextTick as _nextTick } from "../_next_tick.ts";
/** Returns the operating system CPU architecture for which the Deno binary was compiled */ function _arch() {
  if (Deno.build.arch == "x86_64") {
    return "x64";
  } else if (Deno.build.arch == "aarch64") {
    return "arm64";
  } else {
    throw Error("unreachable");
  }
}
/** https://nodejs.org/api/process.html#process_process_arch */ export const arch = _arch();
/** https://nodejs.org/api/process.html#process_process_chdir_directory */ export const chdir = Deno.chdir;
/** https://nodejs.org/api/process.html#process_process_cwd */ export const cwd = Deno.cwd;
/** https://nodejs.org/api/process.html#process_process_nexttick_callback_args */ export const nextTick = _nextTick;
/**
 * https://nodejs.org/api/process.html#process_process_env
 * Requires env permissions
 */ export const env = new Proxy({}, {
  get (_target, prop) {
    return Deno.env.get(String(prop));
  },
  ownKeys: ()=>Reflect.ownKeys(Deno.env.toObject()),
  getOwnPropertyDescriptor: (_target, name)=>{
    const e = Deno.env.toObject();
    if (name in Deno.env.toObject()) {
      const o = {
        enumerable: true,
        configurable: true
      };
      if (typeof name === "string") {
        // @ts-ignore we do want to set it only when name is of type string
        o.value = e[name];
      }
      return o;
    }
  },
  set (_target, prop, value) {
    Deno.env.set(String(prop), String(value));
    return value;
  }
});
/** https://nodejs.org/api/process.html#process_process_pid */ export const pid = Deno.pid;
/** https://nodejs.org/api/process.html#process_process_platform */ export const platform = isWindows ? "win32" : Deno.build.os;
/**
 * https://nodejs.org/api/process.html#process_process_version
 *
 * This value is hard coded to latest stable release of Node, as
 * some packages are checking it for compatibility. Previously
 * it pointed to Deno version, but that led to incompability
 * with some packages.
 */ export const version = "v16.11.1";
/**
 * https://nodejs.org/api/process.html#process_process_versions
 *
 * This value is hard coded to latest stable release of Node, as
 * some packages are checking it for compatibility. Previously
 * it contained only output of `Deno.version`, but that led to incompability
 * with some packages. Value of `v8` field is still taken from `Deno.version`.
 */ export const versions = {
  node: "16.11.1",
  uv: "1.42.0",
  zlib: "1.2.11",
  brotli: "1.0.9",
  ares: "1.17.2",
  modules: "93",
  nghttp2: "1.45.1",
  napi: "8",
  llhttp: "6.0.4",
  openssl: "1.1.1l",
  cldr: "39.0",
  icu: "69.1",
  tz: "2021a",
  unicode: "13.0",
  ...Deno.version
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL25vZGUvX3Byb2Nlc3MvcHJvY2Vzcy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgTm9kZS5qcyBjb250cmlidXRvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuXG4vLyBUaGUgZm9sbG93aW5nIGFyZSBhbGwgdGhlIHByb2Nlc3MgQVBJcyB0aGF0IGRvbid0IGRlcGVuZCBvbiB0aGUgc3RyZWFtIG1vZHVsZVxuLy8gVGhleSBoYXZlIHRvIGJlIHNwbGl0IHRoaXMgd2F5IHRvIHByZXZlbnQgYSBjaXJjdWxhciBkZXBlbmRlbmN5XG5cbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gXCIuLi8uLi9fdXRpbC9vcy50c1wiO1xuaW1wb3J0IHsgbmV4dFRpY2sgYXMgX25leHRUaWNrIH0gZnJvbSBcIi4uL19uZXh0X3RpY2sudHNcIjtcbmltcG9ydCB7IF9leGl0aW5nIH0gZnJvbSBcIi4vZXhpdGluZy50c1wiO1xuXG4vKiogUmV0dXJucyB0aGUgb3BlcmF0aW5nIHN5c3RlbSBDUFUgYXJjaGl0ZWN0dXJlIGZvciB3aGljaCB0aGUgRGVubyBiaW5hcnkgd2FzIGNvbXBpbGVkICovXG5mdW5jdGlvbiBfYXJjaCgpOiBzdHJpbmcge1xuICBpZiAoRGVuby5idWlsZC5hcmNoID09IFwieDg2XzY0XCIpIHtcbiAgICByZXR1cm4gXCJ4NjRcIjtcbiAgfSBlbHNlIGlmIChEZW5vLmJ1aWxkLmFyY2ggPT0gXCJhYXJjaDY0XCIpIHtcbiAgICByZXR1cm4gXCJhcm02NFwiO1xuICB9IGVsc2Uge1xuICAgIHRocm93IEVycm9yKFwidW5yZWFjaGFibGVcIik7XG4gIH1cbn1cblxuLyoqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2Vzc19hcmNoICovXG5leHBvcnQgY29uc3QgYXJjaCA9IF9hcmNoKCk7XG5cbi8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfY2hkaXJfZGlyZWN0b3J5ICovXG5leHBvcnQgY29uc3QgY2hkaXIgPSBEZW5vLmNoZGlyO1xuXG4vKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19wcm9jZXNzX2N3ZCAqL1xuZXhwb3J0IGNvbnN0IGN3ZCA9IERlbm8uY3dkO1xuXG4vKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19wcm9jZXNzX25leHR0aWNrX2NhbGxiYWNrX2FyZ3MgKi9cbmV4cG9ydCBjb25zdCBuZXh0VGljayA9IF9uZXh0VGljaztcblxuLyoqXG4gKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfZW52XG4gKiBSZXF1aXJlcyBlbnYgcGVybWlzc2lvbnNcbiAqL1xuZXhwb3J0IGNvbnN0IGVudjogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IG5ldyBQcm94eSh7fSwge1xuICBnZXQoX3RhcmdldCwgcHJvcCkge1xuICAgIHJldHVybiBEZW5vLmVudi5nZXQoU3RyaW5nKHByb3ApKTtcbiAgfSxcbiAgb3duS2V5czogKCkgPT4gUmVmbGVjdC5vd25LZXlzKERlbm8uZW52LnRvT2JqZWN0KCkpLFxuICBnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3I6IChfdGFyZ2V0LCBuYW1lKSA9PiB7XG4gICAgY29uc3QgZSA9IERlbm8uZW52LnRvT2JqZWN0KCk7XG4gICAgaWYgKG5hbWUgaW4gRGVuby5lbnYudG9PYmplY3QoKSkge1xuICAgICAgY29uc3QgbyA9IHsgZW51bWVyYWJsZTogdHJ1ZSwgY29uZmlndXJhYmxlOiB0cnVlIH07XG4gICAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgLy8gQHRzLWlnbm9yZSB3ZSBkbyB3YW50IHRvIHNldCBpdCBvbmx5IHdoZW4gbmFtZSBpcyBvZiB0eXBlIHN0cmluZ1xuICAgICAgICBvLnZhbHVlID0gZVtuYW1lXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvO1xuICAgIH1cbiAgfSxcbiAgc2V0KF90YXJnZXQsIHByb3AsIHZhbHVlKSB7XG4gICAgRGVuby5lbnYuc2V0KFN0cmluZyhwcm9wKSwgU3RyaW5nKHZhbHVlKSk7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9LFxufSk7XG5cbi8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfcGlkICovXG5leHBvcnQgY29uc3QgcGlkID0gRGVuby5waWQ7XG5cbi8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfcGxhdGZvcm0gKi9cbmV4cG9ydCBjb25zdCBwbGF0Zm9ybSA9IGlzV2luZG93cyA/IFwid2luMzJcIiA6IERlbm8uYnVpbGQub3M7XG5cbi8qKlxuICogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19wcm9jZXNzX3ZlcnNpb25cbiAqXG4gKiBUaGlzIHZhbHVlIGlzIGhhcmQgY29kZWQgdG8gbGF0ZXN0IHN0YWJsZSByZWxlYXNlIG9mIE5vZGUsIGFzXG4gKiBzb21lIHBhY2thZ2VzIGFyZSBjaGVja2luZyBpdCBmb3IgY29tcGF0aWJpbGl0eS4gUHJldmlvdXNseVxuICogaXQgcG9pbnRlZCB0byBEZW5vIHZlcnNpb24sIGJ1dCB0aGF0IGxlZCB0byBpbmNvbXBhYmlsaXR5XG4gKiB3aXRoIHNvbWUgcGFja2FnZXMuXG4gKi9cbmV4cG9ydCBjb25zdCB2ZXJzaW9uID0gXCJ2MTYuMTEuMVwiO1xuXG4vKipcbiAqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2Vzc192ZXJzaW9uc1xuICpcbiAqIFRoaXMgdmFsdWUgaXMgaGFyZCBjb2RlZCB0byBsYXRlc3Qgc3RhYmxlIHJlbGVhc2Ugb2YgTm9kZSwgYXNcbiAqIHNvbWUgcGFja2FnZXMgYXJlIGNoZWNraW5nIGl0IGZvciBjb21wYXRpYmlsaXR5LiBQcmV2aW91c2x5XG4gKiBpdCBjb250YWluZWQgb25seSBvdXRwdXQgb2YgYERlbm8udmVyc2lvbmAsIGJ1dCB0aGF0IGxlZCB0byBpbmNvbXBhYmlsaXR5XG4gKiB3aXRoIHNvbWUgcGFja2FnZXMuIFZhbHVlIG9mIGB2OGAgZmllbGQgaXMgc3RpbGwgdGFrZW4gZnJvbSBgRGVuby52ZXJzaW9uYC5cbiAqL1xuZXhwb3J0IGNvbnN0IHZlcnNpb25zID0ge1xuICBub2RlOiBcIjE2LjExLjFcIixcbiAgdXY6IFwiMS40Mi4wXCIsXG4gIHpsaWI6IFwiMS4yLjExXCIsXG4gIGJyb3RsaTogXCIxLjAuOVwiLFxuICBhcmVzOiBcIjEuMTcuMlwiLFxuICBtb2R1bGVzOiBcIjkzXCIsXG4gIG5naHR0cDI6IFwiMS40NS4xXCIsXG4gIG5hcGk6IFwiOFwiLFxuICBsbGh0dHA6IFwiNi4wLjRcIixcbiAgb3BlbnNzbDogXCIxLjEuMWxcIixcbiAgY2xkcjogXCIzOS4wXCIsXG4gIGljdTogXCI2OS4xXCIsXG4gIHR6OiBcIjIwMjFhXCIsXG4gIHVuaWNvZGU6IFwiMTMuMFwiLFxuICAuLi5EZW5vLnZlcnNpb24sXG59O1xuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRSxxRkFBcUY7QUFFckYsZ0ZBQWdGO0FBQ2hGLGtFQUFrRTtBQUVsRSxTQUFTLFNBQVMsUUFBUSxvQkFBb0I7QUFDOUMsU0FBUyxZQUFZLFNBQVMsUUFBUSxtQkFBbUI7QUFHekQseUZBQXlGLEdBQ3pGLFNBQVM7RUFDUCxJQUFJLEtBQUssS0FBSyxDQUFDLElBQUksSUFBSSxVQUFVO0lBQy9CLE9BQU87RUFDVCxPQUFPLElBQUksS0FBSyxLQUFLLENBQUMsSUFBSSxJQUFJLFdBQVc7SUFDdkMsT0FBTztFQUNULE9BQU87SUFDTCxNQUFNLE1BQU07RUFDZDtBQUNGO0FBRUEsNkRBQTZELEdBQzdELE9BQU8sTUFBTSxPQUFPLFFBQVE7QUFFNUIsd0VBQXdFLEdBQ3hFLE9BQU8sTUFBTSxRQUFRLEtBQUssS0FBSyxDQUFDO0FBRWhDLDREQUE0RCxHQUM1RCxPQUFPLE1BQU0sTUFBTSxLQUFLLEdBQUcsQ0FBQztBQUU1QiwrRUFBK0UsR0FDL0UsT0FBTyxNQUFNLFdBQVcsVUFBVTtBQUVsQzs7O0NBR0MsR0FDRCxPQUFPLE1BQU0sTUFBOEIsSUFBSSxNQUFNLENBQUMsR0FBRztFQUN2RCxLQUFJLE9BQU8sRUFBRSxJQUFJO0lBQ2YsT0FBTyxLQUFLLEdBQUcsQ0FBQyxHQUFHLENBQUMsT0FBTztFQUM3QjtFQUNBLFNBQVMsSUFBTSxRQUFRLE9BQU8sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxRQUFRO0VBQ2hELDBCQUEwQixDQUFDLFNBQVM7SUFDbEMsTUFBTSxJQUFJLEtBQUssR0FBRyxDQUFDLFFBQVE7SUFDM0IsSUFBSSxRQUFRLEtBQUssR0FBRyxDQUFDLFFBQVEsSUFBSTtNQUMvQixNQUFNLElBQUk7UUFBRSxZQUFZO1FBQU0sY0FBYztNQUFLO01BQ2pELElBQUksT0FBTyxTQUFTLFVBQVU7UUFDNUIsbUVBQW1FO1FBQ25FLEVBQUUsS0FBSyxHQUFHLENBQUMsQ0FBQyxLQUFLO01BQ25CO01BQ0EsT0FBTztJQUNUO0VBQ0Y7RUFDQSxLQUFJLE9BQU8sRUFBRSxJQUFJLEVBQUUsS0FBSztJQUN0QixLQUFLLEdBQUcsQ0FBQyxHQUFHLENBQUMsT0FBTyxPQUFPLE9BQU87SUFDbEMsT0FBTztFQUNUO0FBQ0YsR0FBRztBQUVILDREQUE0RCxHQUM1RCxPQUFPLE1BQU0sTUFBTSxLQUFLLEdBQUcsQ0FBQztBQUU1QixpRUFBaUUsR0FDakUsT0FBTyxNQUFNLFdBQVcsWUFBWSxVQUFVLEtBQUssS0FBSyxDQUFDLEVBQUUsQ0FBQztBQUU1RDs7Ozs7OztDQU9DLEdBQ0QsT0FBTyxNQUFNLFVBQVUsV0FBVztBQUVsQzs7Ozs7OztDQU9DLEdBQ0QsT0FBTyxNQUFNLFdBQVc7RUFDdEIsTUFBTTtFQUNOLElBQUk7RUFDSixNQUFNO0VBQ04sUUFBUTtFQUNSLE1BQU07RUFDTixTQUFTO0VBQ1QsU0FBUztFQUNULE1BQU07RUFDTixRQUFRO0VBQ1IsU0FBUztFQUNULE1BQU07RUFDTixLQUFLO0VBQ0wsSUFBSTtFQUNKLFNBQVM7RUFDVCxHQUFHLEtBQUssT0FBTztBQUNqQixFQUFFIn0=