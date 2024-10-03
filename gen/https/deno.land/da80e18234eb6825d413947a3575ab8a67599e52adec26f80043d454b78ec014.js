// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// Copyright Joyent and Node contributors. All rights reserved. MIT license.
import { sprintf } from "../../../fmt/printf.ts";
import { inspect } from "./inspect.mjs";
// `debugImpls` and `testEnabled` are deliberately not initialized so any call
// to `debuglog()` before `initializeDebugEnv()` is called will throw.
let debugImpls;
let testEnabled;
// `debugEnv` is initial value of process.env.NODE_DEBUG
function initializeDebugEnv(debugEnv) {
  debugImpls = Object.create(null);
  if (debugEnv) {
    // This is run before any user code, it's OK not to use primordials.
    debugEnv = debugEnv.replace(/[|\\{}()[\]^$+?.]/g, "\\$&").replaceAll("*", ".*").replaceAll(",", "$|^");
    const debugEnvRegex = new RegExp(`^${debugEnv}$`, "i");
    testEnabled = (str)=>debugEnvRegex.exec(str) !== null;
  } else {
    testEnabled = ()=>false;
  }
}
// Emits warning when user sets
// NODE_DEBUG=http or NODE_DEBUG=http2.
function emitWarningIfNeeded(set) {
  if ("HTTP" === set || "HTTP2" === set) {
    console.warn("Setting the NODE_DEBUG environment variable " + "to '" + set.toLowerCase() + "' can expose sensitive " + "data (such as passwords, tokens and authentication headers) " + "in the resulting log.");
  }
}
const noop = ()=>{};
function debuglogImpl(enabled, set) {
  if (debugImpls[set] === undefined) {
    if (enabled) {
      emitWarningIfNeeded(set);
      debugImpls[set] = function debug(...args) {
        const msg = args.map((arg)=>inspect(arg)).join(" ");
        console.error(sprintf("%s %s: %s", set, String(Deno.pid), msg));
      };
    } else {
      debugImpls[set] = noop;
    }
  }
  return debugImpls[set];
}
// debuglogImpl depends on process.pid and process.env.NODE_DEBUG,
// so it needs to be called lazily in top scopes of internal modules
// that may be loaded before these run time states are allowed to
// be accessed.
export function debuglog(set, cb) {
  function init() {
    set = set.toUpperCase();
    enabled = testEnabled(set);
  }
  let debug = (...args)=>{
    init();
    // Only invokes debuglogImpl() when the debug function is
    // called for the first time.
    debug = debuglogImpl(enabled, set);
    if (typeof cb === "function") {
      cb(debug);
    }
    return debug(...args);
  };
  let enabled;
  let test = ()=>{
    init();
    test = ()=>enabled;
    return enabled;
  };
  const logger = (...args)=>debug(...args);
  Object.defineProperty(logger, "enabled", {
    get () {
      return test();
    },
    configurable: true,
    enumerable: true
  });
  return logger;
}
let state = "";
if (Deno.permissions) {
  state = (await Deno.permissions.query({
    name: "env",
    variable: "NODE_DEBUG"
  })).state;
}
if (state === "granted") {
  initializeDebugEnv(Deno.env.get("NODE_DEBUG") ?? "");
} else {
  initializeDebugEnv("");
}
export default {
  debuglog
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL25vZGUvaW50ZXJuYWwvdXRpbC9kZWJ1Z2xvZy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gQ29weXJpZ2h0IEpveWVudCBhbmQgTm9kZSBjb250cmlidXRvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuaW1wb3J0IHsgc3ByaW50ZiB9IGZyb20gXCIuLi8uLi8uLi9mbXQvcHJpbnRmLnRzXCI7XG5pbXBvcnQgeyBpbnNwZWN0IH0gZnJvbSBcIi4vaW5zcGVjdC5tanNcIjtcblxuLy8gYGRlYnVnSW1wbHNgIGFuZCBgdGVzdEVuYWJsZWRgIGFyZSBkZWxpYmVyYXRlbHkgbm90IGluaXRpYWxpemVkIHNvIGFueSBjYWxsXG4vLyB0byBgZGVidWdsb2coKWAgYmVmb3JlIGBpbml0aWFsaXplRGVidWdFbnYoKWAgaXMgY2FsbGVkIHdpbGwgdGhyb3cuXG5sZXQgZGVidWdJbXBsczogUmVjb3JkPHN0cmluZywgKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZD47XG5sZXQgdGVzdEVuYWJsZWQ6IChzdHI6IHN0cmluZykgPT4gYm9vbGVhbjtcblxuLy8gYGRlYnVnRW52YCBpcyBpbml0aWFsIHZhbHVlIG9mIHByb2Nlc3MuZW52Lk5PREVfREVCVUdcbmZ1bmN0aW9uIGluaXRpYWxpemVEZWJ1Z0VudihkZWJ1Z0Vudjogc3RyaW5nKSB7XG4gIGRlYnVnSW1wbHMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICBpZiAoZGVidWdFbnYpIHtcbiAgICAvLyBUaGlzIGlzIHJ1biBiZWZvcmUgYW55IHVzZXIgY29kZSwgaXQncyBPSyBub3QgdG8gdXNlIHByaW1vcmRpYWxzLlxuICAgIGRlYnVnRW52ID0gZGVidWdFbnYucmVwbGFjZSgvW3xcXFxce30oKVtcXF1eJCs/Ll0vZywgXCJcXFxcJCZcIilcbiAgICAgIC5yZXBsYWNlQWxsKFwiKlwiLCBcIi4qXCIpXG4gICAgICAucmVwbGFjZUFsbChcIixcIiwgXCIkfF5cIik7XG4gICAgY29uc3QgZGVidWdFbnZSZWdleCA9IG5ldyBSZWdFeHAoYF4ke2RlYnVnRW52fSRgLCBcImlcIik7XG4gICAgdGVzdEVuYWJsZWQgPSAoc3RyKSA9PiBkZWJ1Z0VudlJlZ2V4LmV4ZWMoc3RyKSAhPT0gbnVsbDtcbiAgfSBlbHNlIHtcbiAgICB0ZXN0RW5hYmxlZCA9ICgpID0+IGZhbHNlO1xuICB9XG59XG5cbi8vIEVtaXRzIHdhcm5pbmcgd2hlbiB1c2VyIHNldHNcbi8vIE5PREVfREVCVUc9aHR0cCBvciBOT0RFX0RFQlVHPWh0dHAyLlxuZnVuY3Rpb24gZW1pdFdhcm5pbmdJZk5lZWRlZChzZXQ6IHN0cmluZykge1xuICBpZiAoXCJIVFRQXCIgPT09IHNldCB8fCBcIkhUVFAyXCIgPT09IHNldCkge1xuICAgIGNvbnNvbGUud2FybihcbiAgICAgIFwiU2V0dGluZyB0aGUgTk9ERV9ERUJVRyBlbnZpcm9ubWVudCB2YXJpYWJsZSBcIiArXG4gICAgICAgIFwidG8gJ1wiICsgc2V0LnRvTG93ZXJDYXNlKCkgKyBcIicgY2FuIGV4cG9zZSBzZW5zaXRpdmUgXCIgK1xuICAgICAgICBcImRhdGEgKHN1Y2ggYXMgcGFzc3dvcmRzLCB0b2tlbnMgYW5kIGF1dGhlbnRpY2F0aW9uIGhlYWRlcnMpIFwiICtcbiAgICAgICAgXCJpbiB0aGUgcmVzdWx0aW5nIGxvZy5cIixcbiAgICApO1xuICB9XG59XG5cbmNvbnN0IG5vb3AgPSAoKSA9PiB7fTtcblxuZnVuY3Rpb24gZGVidWdsb2dJbXBsKFxuICBlbmFibGVkOiBib29sZWFuLFxuICBzZXQ6IHN0cmluZyxcbik6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQge1xuICBpZiAoZGVidWdJbXBsc1tzZXRdID09PSB1bmRlZmluZWQpIHtcbiAgICBpZiAoZW5hYmxlZCkge1xuICAgICAgZW1pdFdhcm5pbmdJZk5lZWRlZChzZXQpO1xuICAgICAgZGVidWdJbXBsc1tzZXRdID0gZnVuY3Rpb24gZGVidWcoLi4uYXJnczogdW5rbm93bltdKSB7XG4gICAgICAgIGNvbnN0IG1zZyA9IGFyZ3MubWFwKChhcmcpID0+IGluc3BlY3QoYXJnKSkuam9pbihcIiBcIik7XG4gICAgICAgIGNvbnNvbGUuZXJyb3Ioc3ByaW50ZihcIiVzICVzOiAlc1wiLCBzZXQsIFN0cmluZyhEZW5vLnBpZCksIG1zZykpO1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGVidWdJbXBsc1tzZXRdID0gbm9vcDtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZGVidWdJbXBsc1tzZXRdO1xufVxuXG4vLyBkZWJ1Z2xvZ0ltcGwgZGVwZW5kcyBvbiBwcm9jZXNzLnBpZCBhbmQgcHJvY2Vzcy5lbnYuTk9ERV9ERUJVRyxcbi8vIHNvIGl0IG5lZWRzIHRvIGJlIGNhbGxlZCBsYXppbHkgaW4gdG9wIHNjb3BlcyBvZiBpbnRlcm5hbCBtb2R1bGVzXG4vLyB0aGF0IG1heSBiZSBsb2FkZWQgYmVmb3JlIHRoZXNlIHJ1biB0aW1lIHN0YXRlcyBhcmUgYWxsb3dlZCB0b1xuLy8gYmUgYWNjZXNzZWQuXG5leHBvcnQgZnVuY3Rpb24gZGVidWdsb2coXG4gIHNldDogc3RyaW5nLFxuICBjYjogKGRlYnVnOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkKSA9PiB2b2lkLFxuKSB7XG4gIGZ1bmN0aW9uIGluaXQoKSB7XG4gICAgc2V0ID0gc2V0LnRvVXBwZXJDYXNlKCk7XG4gICAgZW5hYmxlZCA9IHRlc3RFbmFibGVkKHNldCk7XG4gIH1cblxuICBsZXQgZGVidWcgPSAoLi4uYXJnczogdW5rbm93bltdKTogdm9pZCA9PiB7XG4gICAgaW5pdCgpO1xuICAgIC8vIE9ubHkgaW52b2tlcyBkZWJ1Z2xvZ0ltcGwoKSB3aGVuIHRoZSBkZWJ1ZyBmdW5jdGlvbiBpc1xuICAgIC8vIGNhbGxlZCBmb3IgdGhlIGZpcnN0IHRpbWUuXG4gICAgZGVidWcgPSBkZWJ1Z2xvZ0ltcGwoZW5hYmxlZCwgc2V0KTtcblxuICAgIGlmICh0eXBlb2YgY2IgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgY2IoZGVidWcpO1xuICAgIH1cblxuICAgIHJldHVybiBkZWJ1ZyguLi5hcmdzKTtcbiAgfTtcblxuICBsZXQgZW5hYmxlZDogYm9vbGVhbjtcbiAgbGV0IHRlc3QgPSAoKSA9PiB7XG4gICAgaW5pdCgpO1xuICAgIHRlc3QgPSAoKSA9PiBlbmFibGVkO1xuICAgIHJldHVybiBlbmFibGVkO1xuICB9O1xuXG4gIGNvbnN0IGxvZ2dlciA9ICguLi5hcmdzOiB1bmtub3duW10pID0+IGRlYnVnKC4uLmFyZ3MpO1xuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShsb2dnZXIsIFwiZW5hYmxlZFwiLCB7XG4gICAgZ2V0KCkge1xuICAgICAgcmV0dXJuIHRlc3QoKTtcbiAgICB9LFxuICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICB9KTtcblxuICByZXR1cm4gbG9nZ2VyO1xufVxuXG5sZXQgc3RhdGUgPSBcIlwiO1xuXG5pZiAoRGVuby5wZXJtaXNzaW9ucykge1xuICBzdGF0ZSA9IChhd2FpdCBEZW5vLnBlcm1pc3Npb25zLnF1ZXJ5KHtcbiAgICBuYW1lOiBcImVudlwiLFxuICAgIHZhcmlhYmxlOiBcIk5PREVfREVCVUdcIixcbiAgfSkpLnN0YXRlO1xufVxuXG5pZiAoc3RhdGUgPT09IFwiZ3JhbnRlZFwiKSB7XG4gIGluaXRpYWxpemVEZWJ1Z0VudihEZW5vLmVudi5nZXQoXCJOT0RFX0RFQlVHXCIpID8/IFwiXCIpO1xufSBlbHNlIHtcbiAgaW5pdGlhbGl6ZURlYnVnRW52KFwiXCIpO1xufVxuXG5leHBvcnQgZGVmYXVsdCB7IGRlYnVnbG9nIH07XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBQzFFLDRFQUE0RTtBQUM1RSxTQUFTLE9BQU8sUUFBUSx5QkFBeUI7QUFDakQsU0FBUyxPQUFPLFFBQVEsZ0JBQWdCO0FBRXhDLDhFQUE4RTtBQUM5RSxzRUFBc0U7QUFDdEUsSUFBSTtBQUNKLElBQUk7QUFFSix3REFBd0Q7QUFDeEQsU0FBUyxtQkFBbUIsUUFBZ0I7RUFDMUMsYUFBYSxPQUFPLE1BQU0sQ0FBQztFQUMzQixJQUFJLFVBQVU7SUFDWixvRUFBb0U7SUFDcEUsV0FBVyxTQUFTLE9BQU8sQ0FBQyxzQkFBc0IsUUFDL0MsVUFBVSxDQUFDLEtBQUssTUFDaEIsVUFBVSxDQUFDLEtBQUs7SUFDbkIsTUFBTSxnQkFBZ0IsSUFBSSxPQUFPLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDLEVBQUU7SUFDbEQsY0FBYyxDQUFDLE1BQVEsY0FBYyxJQUFJLENBQUMsU0FBUztFQUNyRCxPQUFPO0lBQ0wsY0FBYyxJQUFNO0VBQ3RCO0FBQ0Y7QUFFQSwrQkFBK0I7QUFDL0IsdUNBQXVDO0FBQ3ZDLFNBQVMsb0JBQW9CLEdBQVc7RUFDdEMsSUFBSSxXQUFXLE9BQU8sWUFBWSxLQUFLO0lBQ3JDLFFBQVEsSUFBSSxDQUNWLGlEQUNFLFNBQVMsSUFBSSxXQUFXLEtBQUssNEJBQzdCLGlFQUNBO0VBRU47QUFDRjtBQUVBLE1BQU0sT0FBTyxLQUFPO0FBRXBCLFNBQVMsYUFDUCxPQUFnQixFQUNoQixHQUFXO0VBRVgsSUFBSSxVQUFVLENBQUMsSUFBSSxLQUFLLFdBQVc7SUFDakMsSUFBSSxTQUFTO01BQ1gsb0JBQW9CO01BQ3BCLFVBQVUsQ0FBQyxJQUFJLEdBQUcsU0FBUyxNQUFNLEdBQUcsSUFBZTtRQUNqRCxNQUFNLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxNQUFRLFFBQVEsTUFBTSxJQUFJLENBQUM7UUFDakQsUUFBUSxLQUFLLENBQUMsUUFBUSxhQUFhLEtBQUssT0FBTyxLQUFLLEdBQUcsR0FBRztNQUM1RDtJQUNGLE9BQU87TUFDTCxVQUFVLENBQUMsSUFBSSxHQUFHO0lBQ3BCO0VBQ0Y7RUFFQSxPQUFPLFVBQVUsQ0FBQyxJQUFJO0FBQ3hCO0FBRUEsa0VBQWtFO0FBQ2xFLG9FQUFvRTtBQUNwRSxpRUFBaUU7QUFDakUsZUFBZTtBQUNmLE9BQU8sU0FBUyxTQUNkLEdBQVcsRUFDWCxFQUFpRDtFQUVqRCxTQUFTO0lBQ1AsTUFBTSxJQUFJLFdBQVc7SUFDckIsVUFBVSxZQUFZO0VBQ3hCO0VBRUEsSUFBSSxRQUFRLENBQUMsR0FBRztJQUNkO0lBQ0EseURBQXlEO0lBQ3pELDZCQUE2QjtJQUM3QixRQUFRLGFBQWEsU0FBUztJQUU5QixJQUFJLE9BQU8sT0FBTyxZQUFZO01BQzVCLEdBQUc7SUFDTDtJQUVBLE9BQU8sU0FBUztFQUNsQjtFQUVBLElBQUk7RUFDSixJQUFJLE9BQU87SUFDVDtJQUNBLE9BQU8sSUFBTTtJQUNiLE9BQU87RUFDVDtFQUVBLE1BQU0sU0FBUyxDQUFDLEdBQUcsT0FBb0IsU0FBUztFQUVoRCxPQUFPLGNBQWMsQ0FBQyxRQUFRLFdBQVc7SUFDdkM7TUFDRSxPQUFPO0lBQ1Q7SUFDQSxjQUFjO0lBQ2QsWUFBWTtFQUNkO0VBRUEsT0FBTztBQUNUO0FBRUEsSUFBSSxRQUFRO0FBRVosSUFBSSxLQUFLLFdBQVcsRUFBRTtFQUNwQixRQUFRLENBQUMsTUFBTSxLQUFLLFdBQVcsQ0FBQyxLQUFLLENBQUM7SUFDcEMsTUFBTTtJQUNOLFVBQVU7RUFDWixFQUFFLEVBQUUsS0FBSztBQUNYO0FBRUEsSUFBSSxVQUFVLFdBQVc7RUFDdkIsbUJBQW1CLEtBQUssR0FBRyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUI7QUFDbkQsT0FBTztFQUNMLG1CQUFtQjtBQUNyQjtBQUVBLGVBQWU7RUFBRTtBQUFTLEVBQUUifQ==