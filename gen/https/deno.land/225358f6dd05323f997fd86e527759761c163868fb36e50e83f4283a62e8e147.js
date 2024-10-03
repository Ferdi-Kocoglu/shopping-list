// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// Copyright Joyent, Inc. and Node.js contributors. All rights reserved. MIT license.
import * as DenoUnstable from "../_deno_unstable.ts";
import { warnNotImplemented } from "./_utils.ts";
import { EventEmitter } from "./events.ts";
import { validateString } from "./internal/validators.mjs";
import { ERR_INVALID_ARG_TYPE, ERR_UNKNOWN_SIGNAL } from "./internal/errors.ts";
import { getOptionValue } from "./_options.ts";
import { assert } from "../_util/assert.ts";
import { fromFileUrl } from "../path/mod.ts";
import { arch, chdir, cwd, env, nextTick as _nextTick, pid, platform, version, versions } from "./_process/process.ts";
import { _exiting } from "./_process/exiting.ts";
export { _nextTick as nextTick, arch, chdir, cwd, env, pid, platform, version, versions };
import { stderr as stderr_, stdin as stdin_, stdout as stdout_ } from "./_process/streams.mjs";
// TODO(kt3k): Give better types to stdio objects
// deno-lint-ignore no-explicit-any
const stderr = stderr_;
// deno-lint-ignore no-explicit-any
const stdin = stdin_;
// deno-lint-ignore no-explicit-any
const stdout = stdout_;
export { stderr, stdin, stdout };
import { getBinding } from "./internal_binding/mod.ts";
import { buildAllowedFlags } from "./internal/process/per_thread.mjs";
const notImplementedEvents = [
  "beforeExit",
  "disconnect",
  "message",
  "multipleResolves",
  "rejectionHandled",
  "uncaughtException",
  "uncaughtExceptionMonitor",
  "unhandledRejection",
  "worker"
];
// The first 2 items are placeholders.
// They will be overwritten by the below Object.defineProperty calls.
const argv = [
  "",
  "",
  ...Deno.args
];
// Overwrites the 1st item with getter.
Object.defineProperty(argv, "0", {
  get: Deno.execPath
});
// Overwrites the 2st item with getter.
Object.defineProperty(argv, "1", {
  get: ()=>fromFileUrl(Deno.mainModule)
});
/** https://nodejs.org/api/process.html#process_process_exit_code */ export const exit = (code)=>{
  if (code || code === 0) {
    if (typeof code === "string") {
      const parsedCode = parseInt(code);
      process.exitCode = isNaN(parsedCode) ? undefined : parsedCode;
    } else {
      process.exitCode = code;
    }
  }
  if (!process._exiting) {
    process._exiting = true;
    process.emit("exit", process.exitCode || 0);
  }
  Deno.exit(process.exitCode || 0);
};
function addReadOnlyProcessAlias(name, option, enumerable = true) {
  const value = getOptionValue(option);
  if (value) {
    Object.defineProperty(process, name, {
      writable: false,
      configurable: true,
      enumerable,
      value
    });
  }
}
function createWarningObject(warning, type, code, // deno-lint-ignore ban-types
ctor, detail) {
  assert(typeof warning === "string");
  // deno-lint-ignore no-explicit-any
  const warningErr = new Error(warning);
  warningErr.name = String(type || "Warning");
  if (code !== undefined) {
    warningErr.code = code;
  }
  if (detail !== undefined) {
    warningErr.detail = detail;
  }
  // @ts-ignore this function is not available in lib.dom.d.ts
  Error.captureStackTrace(warningErr, ctor || process.emitWarning);
  return warningErr;
}
function doEmitWarning(warning) {
  process.emit("warning", warning);
}
/** https://nodejs.org/api/process.html#process_process_emitwarning_warning_options */ export function emitWarning(warning, type, code, // deno-lint-ignore ban-types
ctor) {
  let detail;
  if (type !== null && typeof type === "object" && !Array.isArray(type)) {
    ctor = type.ctor;
    code = type.code;
    if (typeof type.detail === "string") {
      detail = type.detail;
    }
    type = type.type || "Warning";
  } else if (typeof type === "function") {
    ctor = type;
    code = undefined;
    type = "Warning";
  }
  if (type !== undefined) {
    validateString(type, "type");
  }
  if (typeof code === "function") {
    ctor = code;
    code = undefined;
  } else if (code !== undefined) {
    validateString(code, "code");
  }
  if (typeof warning === "string") {
    warning = createWarningObject(warning, type, code, ctor, detail);
  } else if (!(warning instanceof Error)) {
    throw new ERR_INVALID_ARG_TYPE("warning", [
      "Error",
      "string"
    ], warning);
  }
  if (warning.name === "DeprecationWarning") {
    // deno-lint-ignore no-explicit-any
    if (process.noDeprecation) {
      return;
    }
    // deno-lint-ignore no-explicit-any
    if (process.throwDeprecation) {
      // Delay throwing the error to guarantee that all former warnings were
      // properly logged.
      return process.nextTick(()=>{
        throw warning;
      });
    }
  }
  process.nextTick(doEmitWarning, warning);
}
function hrtime(time) {
  const milli = performance.now();
  const sec = Math.floor(milli / 1000);
  const nano = Math.floor(milli * 1_000_000 - sec * 1_000_000_000);
  if (!time) {
    return [
      sec,
      nano
    ];
  }
  const [prevSec, prevNano] = time;
  return [
    sec - prevSec,
    nano - prevNano
  ];
}
hrtime.bigint = function() {
  const [sec, nano] = hrtime();
  return BigInt(sec) * 1_000_000_000n + BigInt(nano);
};
function memoryUsage() {
  return {
    ...Deno.memoryUsage(),
    arrayBuffers: 0
  };
}
memoryUsage.rss = function() {
  return memoryUsage().rss;
};
export function kill(pid, sig = "SIGTERM") {
  if (pid != (pid | 0)) {
    throw new ERR_INVALID_ARG_TYPE("pid", "number", pid);
  }
  if (typeof sig === "string") {
    try {
      Deno.kill(pid, sig);
    } catch (e) {
      if (e instanceof TypeError) {
        throw new ERR_UNKNOWN_SIGNAL(sig);
      }
      throw e;
    }
  } else {
    throw new ERR_UNKNOWN_SIGNAL(sig.toString());
  }
  return true;
}
class Process extends EventEmitter {
  constructor(){
    super();
    globalThis.addEventListener("unload", ()=>{
      if (!process._exiting) {
        process._exiting = true;
        super.emit("exit", process.exitCode || 0);
      }
    });
  }
  /** https://nodejs.org/api/process.html#process_process_arch */ arch = arch;
  /**
   * https://nodejs.org/api/process.html#process_process_argv
   * Read permissions are required in order to get the executable route
   */ argv = argv;
  /** https://nodejs.org/api/process.html#process_process_chdir_directory */ chdir = chdir;
  /** https://nodejs.org/api/process.html#processconfig */ config = {
    target_defaults: {},
    variables: {}
  };
  /** https://nodejs.org/api/process.html#process_process_cwd */ cwd = cwd;
  /**
   * https://nodejs.org/api/process.html#process_process_env
   * Requires env permissions
   */ env = env;
  /** https://nodejs.org/api/process.html#process_process_execargv */ execArgv = [];
  /** https://nodejs.org/api/process.html#process_process_exit_code */ exit = exit;
  _exiting = _exiting;
  /** https://nodejs.org/api/process.html#processexitcode_1 */ exitCode = undefined;
  // Typed as any to avoid importing "module" module for types
  // deno-lint-ignore no-explicit-any
  mainModule = undefined;
  /** https://nodejs.org/api/process.html#process_process_nexttick_callback_args */ nextTick = _nextTick;
  // deno-lint-ignore no-explicit-any
  on(event, listener) {
    if (notImplementedEvents.includes(event)) {
      warnNotImplemented(`process.on("${event}")`);
      super.on(event, listener);
    } else if (event.startsWith("SIG")) {
      if (event === "SIGBREAK" && Deno.build.os !== "windows") {
      // Ignores SIGBREAK if the platform is not windows.
      } else {
        DenoUnstable.addSignalListener(event, listener);
      }
    } else {
      super.on(event, listener);
    }
    return this;
  }
  // deno-lint-ignore no-explicit-any
  off(event, listener) {
    if (notImplementedEvents.includes(event)) {
      warnNotImplemented(`process.off("${event}")`);
      super.off(event, listener);
    } else if (event.startsWith("SIG")) {
      if (event === "SIGBREAK" && Deno.build.os !== "windows") {
      // Ignores SIGBREAK if the platform is not windows.
      } else {
        DenoUnstable.removeSignalListener(event, listener);
      }
    } else {
      super.off(event, listener);
    }
    return this;
  }
  // deno-lint-ignore no-explicit-any
  emit(event, ...args) {
    if (event.startsWith("SIG")) {
      if (event === "SIGBREAK" && Deno.build.os !== "windows") {
      // Ignores SIGBREAK if the platform is not windows.
      } else {
        Deno.kill(Deno.pid, event);
      }
    } else {
      return super.emit(event, ...args);
    }
    return true;
  }
  prependListener(event, // deno-lint-ignore no-explicit-any
  listener) {
    if (notImplementedEvents.includes(event)) {
      warnNotImplemented(`process.prependListener("${event}")`);
      super.prependListener(event, listener);
    } else if (event.startsWith("SIG")) {
      if (event === "SIGBREAK" && Deno.build.os !== "windows") {
      // Ignores SIGBREAK if the platform is not windows.
      } else {
        DenoUnstable.addSignalListener(event, listener);
      }
    } else {
      super.prependListener(event, listener);
    }
    return this;
  }
  /** https://nodejs.org/api/process.html#process_process_pid */ pid = pid;
  /** https://nodejs.org/api/process.html#process_process_platform */ platform = platform;
  addListener(event, // deno-lint-ignore no-explicit-any
  listener) {
    if (notImplementedEvents.includes(event)) {
      warnNotImplemented(`process.addListener("${event}")`);
    }
    return this.on(event, listener);
  }
  removeListener(event, // deno-lint-ignore no-explicit-any
  listener) {
    if (notImplementedEvents.includes(event)) {
      warnNotImplemented(`process.removeListener("${event}")`);
    }
    return this.off(event, listener);
  }
  /**
   * Returns the current high-resolution real time in a [seconds, nanoseconds]
   * tuple.
   *
   * Note: You need to give --allow-hrtime permission to Deno to actually get
   * nanoseconds precision values. If you don't give 'hrtime' permission, the returned
   * values only have milliseconds precision.
   *
   * `time` is an optional parameter that must be the result of a previous process.hrtime() call to diff with the current time.
   *
   * These times are relative to an arbitrary time in the past, and not related to the time of day and therefore not subject to clock drift. The primary use is for measuring performance between intervals.
   * https://nodejs.org/api/process.html#process_process_hrtime_time
   */ hrtime = hrtime;
  /** https://nodejs.org/api/process.html#processkillpid-signal */ kill = kill;
  memoryUsage = memoryUsage;
  /** https://nodejs.org/api/process.html#process_process_stderr */ stderr = stderr;
  /** https://nodejs.org/api/process.html#process_process_stdin */ stdin = stdin;
  /** https://nodejs.org/api/process.html#process_process_stdout */ stdout = stdout;
  /** https://nodejs.org/api/process.html#process_process_version */ version = version;
  /** https://nodejs.org/api/process.html#process_process_versions */ versions = versions;
  /** https://nodejs.org/api/process.html#process_process_emitwarning_warning_options */ emitWarning = emitWarning;
  binding(name) {
    return getBinding(name);
  }
  /** https://nodejs.org/api/process.html#processumaskmask */ umask() {
    // Always return the system default umask value.
    // We don't use Deno.umask here because it has a race
    // condition bug.
    // See https://github.com/denoland/deno_std/issues/1893#issuecomment-1032897779
    return 0o22;
  }
  /** https://nodejs.org/api/process.html#processgetuid */ getuid() {
    // TODO(kt3k): return user id in mac and linux
    return NaN;
  }
  /** https://nodejs.org/api/process.html#processgetgid */ getgid() {
    // TODO(kt3k): return group id in mac and linux
    return NaN;
  }
  // TODO(kt3k): Implement this when we added -e option to node compat mode
  _eval = undefined;
  /** https://nodejs.org/api/process.html#processexecpath */ get execPath() {
    return argv[0];
  }
  #startTime = Date.now();
  /** https://nodejs.org/api/process.html#processuptime */ uptime() {
    return (Date.now() - this.#startTime) / 1000;
  }
  #allowedFlags = buildAllowedFlags();
  /** https://nodejs.org/api/process.html#processallowednodeenvironmentflags */ get allowedNodeEnvironmentFlags() {
    return this.#allowedFlags;
  }
  features = {
    inspector: false
  };
}
/** https://nodejs.org/api/process.html#process_process */ const process = new Process();
Object.defineProperty(process, Symbol.toStringTag, {
  enumerable: false,
  writable: true,
  configurable: false,
  value: "process"
});
addReadOnlyProcessAlias("noDeprecation", "--no-deprecation");
addReadOnlyProcessAlias("throwDeprecation", "--throw-deprecation");
export const removeListener = process.removeListener;
export const removeAllListeners = process.removeAllListeners;
export default process;
//TODO(Soremwar)
//Remove on 1.0
//Kept for backwards compatibility with std
export { process };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL25vZGUvcHJvY2Vzcy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgTm9kZS5qcyBjb250cmlidXRvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuaW1wb3J0ICogYXMgRGVub1Vuc3RhYmxlIGZyb20gXCIuLi9fZGVub191bnN0YWJsZS50c1wiO1xuaW1wb3J0IHsgd2Fybk5vdEltcGxlbWVudGVkIH0gZnJvbSBcIi4vX3V0aWxzLnRzXCI7XG5pbXBvcnQgeyBFdmVudEVtaXR0ZXIgfSBmcm9tIFwiLi9ldmVudHMudHNcIjtcbmltcG9ydCB7IHZhbGlkYXRlU3RyaW5nIH0gZnJvbSBcIi4vaW50ZXJuYWwvdmFsaWRhdG9ycy5tanNcIjtcbmltcG9ydCB7IEVSUl9JTlZBTElEX0FSR19UWVBFLCBFUlJfVU5LTk9XTl9TSUdOQUwgfSBmcm9tIFwiLi9pbnRlcm5hbC9lcnJvcnMudHNcIjtcbmltcG9ydCB7IGdldE9wdGlvblZhbHVlIH0gZnJvbSBcIi4vX29wdGlvbnMudHNcIjtcbmltcG9ydCB7IGFzc2VydCB9IGZyb20gXCIuLi9fdXRpbC9hc3NlcnQudHNcIjtcbmltcG9ydCB7IGZyb21GaWxlVXJsIH0gZnJvbSBcIi4uL3BhdGgvbW9kLnRzXCI7XG5pbXBvcnQge1xuICBhcmNoLFxuICBjaGRpcixcbiAgY3dkLFxuICBlbnYsXG4gIG5leHRUaWNrIGFzIF9uZXh0VGljayxcbiAgcGlkLFxuICBwbGF0Zm9ybSxcbiAgdmVyc2lvbixcbiAgdmVyc2lvbnMsXG59IGZyb20gXCIuL19wcm9jZXNzL3Byb2Nlc3MudHNcIjtcbmltcG9ydCB7IF9leGl0aW5nIH0gZnJvbSBcIi4vX3Byb2Nlc3MvZXhpdGluZy50c1wiO1xuZXhwb3J0IHtcbiAgX25leHRUaWNrIGFzIG5leHRUaWNrLFxuICBhcmNoLFxuICBjaGRpcixcbiAgY3dkLFxuICBlbnYsXG4gIHBpZCxcbiAgcGxhdGZvcm0sXG4gIHZlcnNpb24sXG4gIHZlcnNpb25zLFxufTtcbmltcG9ydCB7XG4gIHN0ZGVyciBhcyBzdGRlcnJfLFxuICBzdGRpbiBhcyBzdGRpbl8sXG4gIHN0ZG91dCBhcyBzdGRvdXRfLFxufSBmcm9tIFwiLi9fcHJvY2Vzcy9zdHJlYW1zLm1qc1wiO1xuLy8gVE9ETyhrdDNrKTogR2l2ZSBiZXR0ZXIgdHlwZXMgdG8gc3RkaW8gb2JqZWN0c1xuLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbmNvbnN0IHN0ZGVyciA9IHN0ZGVycl8gYXMgYW55O1xuLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbmNvbnN0IHN0ZGluID0gc3RkaW5fIGFzIGFueTtcbi8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG5jb25zdCBzdGRvdXQgPSBzdGRvdXRfIGFzIGFueTtcbmV4cG9ydCB7IHN0ZGVyciwgc3RkaW4sIHN0ZG91dCB9O1xuaW1wb3J0IHsgZ2V0QmluZGluZyB9IGZyb20gXCIuL2ludGVybmFsX2JpbmRpbmcvbW9kLnRzXCI7XG5pbXBvcnQgdHlwZSB7IEJpbmRpbmdOYW1lIH0gZnJvbSBcIi4vaW50ZXJuYWxfYmluZGluZy9tb2QudHNcIjtcbmltcG9ydCB7IGJ1aWxkQWxsb3dlZEZsYWdzIH0gZnJvbSBcIi4vaW50ZXJuYWwvcHJvY2Vzcy9wZXJfdGhyZWFkLm1qc1wiO1xuXG5jb25zdCBub3RJbXBsZW1lbnRlZEV2ZW50cyA9IFtcbiAgXCJiZWZvcmVFeGl0XCIsXG4gIFwiZGlzY29ubmVjdFwiLFxuICBcIm1lc3NhZ2VcIixcbiAgXCJtdWx0aXBsZVJlc29sdmVzXCIsXG4gIFwicmVqZWN0aW9uSGFuZGxlZFwiLFxuICBcInVuY2F1Z2h0RXhjZXB0aW9uXCIsXG4gIFwidW5jYXVnaHRFeGNlcHRpb25Nb25pdG9yXCIsXG4gIFwidW5oYW5kbGVkUmVqZWN0aW9uXCIsXG4gIFwid29ya2VyXCIsXG5dO1xuXG4vLyBUaGUgZmlyc3QgMiBpdGVtcyBhcmUgcGxhY2Vob2xkZXJzLlxuLy8gVGhleSB3aWxsIGJlIG92ZXJ3cml0dGVuIGJ5IHRoZSBiZWxvdyBPYmplY3QuZGVmaW5lUHJvcGVydHkgY2FsbHMuXG5jb25zdCBhcmd2ID0gW1wiXCIsIFwiXCIsIC4uLkRlbm8uYXJnc107XG4vLyBPdmVyd3JpdGVzIHRoZSAxc3QgaXRlbSB3aXRoIGdldHRlci5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShhcmd2LCBcIjBcIiwgeyBnZXQ6IERlbm8uZXhlY1BhdGggfSk7XG4vLyBPdmVyd3JpdGVzIHRoZSAyc3QgaXRlbSB3aXRoIGdldHRlci5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShhcmd2LCBcIjFcIiwgeyBnZXQ6ICgpID0+IGZyb21GaWxlVXJsKERlbm8ubWFpbk1vZHVsZSkgfSk7XG5cbi8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfZXhpdF9jb2RlICovXG5leHBvcnQgY29uc3QgZXhpdCA9IChjb2RlPzogbnVtYmVyIHwgc3RyaW5nKSA9PiB7XG4gIGlmIChjb2RlIHx8IGNvZGUgPT09IDApIHtcbiAgICBpZiAodHlwZW9mIGNvZGUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgIGNvbnN0IHBhcnNlZENvZGUgPSBwYXJzZUludChjb2RlKTtcbiAgICAgIHByb2Nlc3MuZXhpdENvZGUgPSBpc05hTihwYXJzZWRDb2RlKSA/IHVuZGVmaW5lZCA6IHBhcnNlZENvZGU7XG4gICAgfSBlbHNlIHtcbiAgICAgIHByb2Nlc3MuZXhpdENvZGUgPSBjb2RlO1xuICAgIH1cbiAgfVxuXG4gIGlmICghcHJvY2Vzcy5fZXhpdGluZykge1xuICAgIHByb2Nlc3MuX2V4aXRpbmcgPSB0cnVlO1xuICAgIHByb2Nlc3MuZW1pdChcImV4aXRcIiwgcHJvY2Vzcy5leGl0Q29kZSB8fCAwKTtcbiAgfVxuXG4gIERlbm8uZXhpdChwcm9jZXNzLmV4aXRDb2RlIHx8IDApO1xufTtcblxuZnVuY3Rpb24gYWRkUmVhZE9ubHlQcm9jZXNzQWxpYXMoXG4gIG5hbWU6IHN0cmluZyxcbiAgb3B0aW9uOiBzdHJpbmcsXG4gIGVudW1lcmFibGUgPSB0cnVlLFxuKSB7XG4gIGNvbnN0IHZhbHVlID0gZ2V0T3B0aW9uVmFsdWUob3B0aW9uKTtcblxuICBpZiAodmFsdWUpIHtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkocHJvY2VzcywgbmFtZSwge1xuICAgICAgd3JpdGFibGU6IGZhbHNlLFxuICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgZW51bWVyYWJsZSxcbiAgICAgIHZhbHVlLFxuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVdhcm5pbmdPYmplY3QoXG4gIHdhcm5pbmc6IHN0cmluZyxcbiAgdHlwZTogc3RyaW5nLFxuICBjb2RlPzogc3RyaW5nLFxuICAvLyBkZW5vLWxpbnQtaWdub3JlIGJhbi10eXBlc1xuICBjdG9yPzogRnVuY3Rpb24sXG4gIGRldGFpbD86IHN0cmluZyxcbik6IEVycm9yIHtcbiAgYXNzZXJ0KHR5cGVvZiB3YXJuaW5nID09PSBcInN0cmluZ1wiKTtcblxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBjb25zdCB3YXJuaW5nRXJyOiBhbnkgPSBuZXcgRXJyb3Iod2FybmluZyk7XG4gIHdhcm5pbmdFcnIubmFtZSA9IFN0cmluZyh0eXBlIHx8IFwiV2FybmluZ1wiKTtcblxuICBpZiAoY29kZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgd2FybmluZ0Vyci5jb2RlID0gY29kZTtcbiAgfVxuICBpZiAoZGV0YWlsICE9PSB1bmRlZmluZWQpIHtcbiAgICB3YXJuaW5nRXJyLmRldGFpbCA9IGRldGFpbDtcbiAgfVxuXG4gIC8vIEB0cy1pZ25vcmUgdGhpcyBmdW5jdGlvbiBpcyBub3QgYXZhaWxhYmxlIGluIGxpYi5kb20uZC50c1xuICBFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSh3YXJuaW5nRXJyLCBjdG9yIHx8IHByb2Nlc3MuZW1pdFdhcm5pbmcpO1xuXG4gIHJldHVybiB3YXJuaW5nRXJyO1xufVxuXG5mdW5jdGlvbiBkb0VtaXRXYXJuaW5nKHdhcm5pbmc6IEVycm9yKSB7XG4gIHByb2Nlc3MuZW1pdChcIndhcm5pbmdcIiwgd2FybmluZyk7XG59XG5cbi8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfZW1pdHdhcm5pbmdfd2FybmluZ19vcHRpb25zICovXG5leHBvcnQgZnVuY3Rpb24gZW1pdFdhcm5pbmcoXG4gIHdhcm5pbmc6IHN0cmluZyB8IEVycm9yLFxuICB0eXBlOlxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgYmFuLXR5cGVzXG4gICAgfCB7IHR5cGU6IHN0cmluZzsgZGV0YWlsOiBzdHJpbmc7IGNvZGU6IHN0cmluZzsgY3RvcjogRnVuY3Rpb24gfVxuICAgIHwgc3RyaW5nXG4gICAgfCBudWxsLFxuICBjb2RlPzogc3RyaW5nLFxuICAvLyBkZW5vLWxpbnQtaWdub3JlIGJhbi10eXBlc1xuICBjdG9yPzogRnVuY3Rpb24sXG4pIHtcbiAgbGV0IGRldGFpbDtcblxuICBpZiAodHlwZSAhPT0gbnVsbCAmJiB0eXBlb2YgdHlwZSA9PT0gXCJvYmplY3RcIiAmJiAhQXJyYXkuaXNBcnJheSh0eXBlKSkge1xuICAgIGN0b3IgPSB0eXBlLmN0b3I7XG4gICAgY29kZSA9IHR5cGUuY29kZTtcblxuICAgIGlmICh0eXBlb2YgdHlwZS5kZXRhaWwgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgIGRldGFpbCA9IHR5cGUuZGV0YWlsO1xuICAgIH1cblxuICAgIHR5cGUgPSB0eXBlLnR5cGUgfHwgXCJXYXJuaW5nXCI7XG4gIH0gZWxzZSBpZiAodHlwZW9mIHR5cGUgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIGN0b3IgPSB0eXBlO1xuICAgIGNvZGUgPSB1bmRlZmluZWQ7XG4gICAgdHlwZSA9IFwiV2FybmluZ1wiO1xuICB9XG5cbiAgaWYgKHR5cGUgIT09IHVuZGVmaW5lZCkge1xuICAgIHZhbGlkYXRlU3RyaW5nKHR5cGUsIFwidHlwZVwiKTtcbiAgfVxuXG4gIGlmICh0eXBlb2YgY29kZSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgY3RvciA9IGNvZGU7XG4gICAgY29kZSA9IHVuZGVmaW5lZDtcbiAgfSBlbHNlIGlmIChjb2RlICE9PSB1bmRlZmluZWQpIHtcbiAgICB2YWxpZGF0ZVN0cmluZyhjb2RlLCBcImNvZGVcIik7XG4gIH1cblxuICBpZiAodHlwZW9mIHdhcm5pbmcgPT09IFwic3RyaW5nXCIpIHtcbiAgICB3YXJuaW5nID0gY3JlYXRlV2FybmluZ09iamVjdCh3YXJuaW5nLCB0eXBlIGFzIHN0cmluZywgY29kZSwgY3RvciwgZGV0YWlsKTtcbiAgfSBlbHNlIGlmICghKHdhcm5pbmcgaW5zdGFuY2VvZiBFcnJvcikpIHtcbiAgICB0aHJvdyBuZXcgRVJSX0lOVkFMSURfQVJHX1RZUEUoXCJ3YXJuaW5nXCIsIFtcIkVycm9yXCIsIFwic3RyaW5nXCJdLCB3YXJuaW5nKTtcbiAgfVxuXG4gIGlmICh3YXJuaW5nLm5hbWUgPT09IFwiRGVwcmVjYXRpb25XYXJuaW5nXCIpIHtcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIGlmICgocHJvY2VzcyBhcyBhbnkpLm5vRGVwcmVjYXRpb24pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIGlmICgocHJvY2VzcyBhcyBhbnkpLnRocm93RGVwcmVjYXRpb24pIHtcbiAgICAgIC8vIERlbGF5IHRocm93aW5nIHRoZSBlcnJvciB0byBndWFyYW50ZWUgdGhhdCBhbGwgZm9ybWVyIHdhcm5pbmdzIHdlcmVcbiAgICAgIC8vIHByb3Blcmx5IGxvZ2dlZC5cbiAgICAgIHJldHVybiBwcm9jZXNzLm5leHRUaWNrKCgpID0+IHtcbiAgICAgICAgdGhyb3cgd2FybmluZztcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIHByb2Nlc3MubmV4dFRpY2soZG9FbWl0V2FybmluZywgd2FybmluZyk7XG59XG5cbmZ1bmN0aW9uIGhydGltZSh0aW1lPzogW251bWJlciwgbnVtYmVyXSk6IFtudW1iZXIsIG51bWJlcl0ge1xuICBjb25zdCBtaWxsaSA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBzZWMgPSBNYXRoLmZsb29yKG1pbGxpIC8gMTAwMCk7XG4gIGNvbnN0IG5hbm8gPSBNYXRoLmZsb29yKG1pbGxpICogMV8wMDBfMDAwIC0gc2VjICogMV8wMDBfMDAwXzAwMCk7XG4gIGlmICghdGltZSkge1xuICAgIHJldHVybiBbc2VjLCBuYW5vXTtcbiAgfVxuICBjb25zdCBbcHJldlNlYywgcHJldk5hbm9dID0gdGltZTtcbiAgcmV0dXJuIFtzZWMgLSBwcmV2U2VjLCBuYW5vIC0gcHJldk5hbm9dO1xufVxuXG5ocnRpbWUuYmlnaW50ID0gZnVuY3Rpb24gKCk6IEJpZ0ludCB7XG4gIGNvbnN0IFtzZWMsIG5hbm9dID0gaHJ0aW1lKCk7XG4gIHJldHVybiBCaWdJbnQoc2VjKSAqIDFfMDAwXzAwMF8wMDBuICsgQmlnSW50KG5hbm8pO1xufTtcblxuZnVuY3Rpb24gbWVtb3J5VXNhZ2UoKToge1xuICByc3M6IG51bWJlcjtcbiAgaGVhcFRvdGFsOiBudW1iZXI7XG4gIGhlYXBVc2VkOiBudW1iZXI7XG4gIGV4dGVybmFsOiBudW1iZXI7XG4gIGFycmF5QnVmZmVyczogbnVtYmVyO1xufSB7XG4gIHJldHVybiB7XG4gICAgLi4uRGVuby5tZW1vcnlVc2FnZSgpLFxuICAgIGFycmF5QnVmZmVyczogMCxcbiAgfTtcbn1cblxubWVtb3J5VXNhZ2UucnNzID0gZnVuY3Rpb24gKCk6IG51bWJlciB7XG4gIHJldHVybiBtZW1vcnlVc2FnZSgpLnJzcztcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBraWxsKHBpZDogbnVtYmVyLCBzaWc6IERlbm8uU2lnbmFsIHwgbnVtYmVyID0gXCJTSUdURVJNXCIpIHtcbiAgaWYgKHBpZCAhPSAocGlkIHwgMCkpIHtcbiAgICB0aHJvdyBuZXcgRVJSX0lOVkFMSURfQVJHX1RZUEUoXCJwaWRcIiwgXCJudW1iZXJcIiwgcGlkKTtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygc2lnID09PSBcInN0cmluZ1wiKSB7XG4gICAgdHJ5IHtcbiAgICAgIERlbm8ua2lsbChwaWQsIHNpZyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGUgaW5zdGFuY2VvZiBUeXBlRXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVSUl9VTktOT1dOX1NJR05BTChzaWcpO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IEVSUl9VTktOT1dOX1NJR05BTChzaWcudG9TdHJpbmcoKSk7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn1cblxuY2xhc3MgUHJvY2VzcyBleHRlbmRzIEV2ZW50RW1pdHRlciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKCk7XG5cbiAgICBnbG9iYWxUaGlzLmFkZEV2ZW50TGlzdGVuZXIoXCJ1bmxvYWRcIiwgKCkgPT4ge1xuICAgICAgaWYgKCFwcm9jZXNzLl9leGl0aW5nKSB7XG4gICAgICAgIHByb2Nlc3MuX2V4aXRpbmcgPSB0cnVlO1xuICAgICAgICBzdXBlci5lbWl0KFwiZXhpdFwiLCBwcm9jZXNzLmV4aXRDb2RlIHx8IDApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2Vzc19hcmNoICovXG4gIGFyY2ggPSBhcmNoO1xuXG4gIC8qKlxuICAgKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfYXJndlxuICAgKiBSZWFkIHBlcm1pc3Npb25zIGFyZSByZXF1aXJlZCBpbiBvcmRlciB0byBnZXQgdGhlIGV4ZWN1dGFibGUgcm91dGVcbiAgICovXG4gIGFyZ3YgPSBhcmd2O1xuXG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfY2hkaXJfZGlyZWN0b3J5ICovXG4gIGNoZGlyID0gY2hkaXI7XG5cbiAgLyoqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3Njb25maWcgKi9cbiAgY29uZmlnID0ge1xuICAgIHRhcmdldF9kZWZhdWx0czoge30sXG4gICAgdmFyaWFibGVzOiB7fSxcbiAgfTtcblxuICAvKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19wcm9jZXNzX2N3ZCAqL1xuICBjd2QgPSBjd2Q7XG5cbiAgLyoqXG4gICAqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2Vzc19lbnZcbiAgICogUmVxdWlyZXMgZW52IHBlcm1pc3Npb25zXG4gICAqL1xuICBlbnYgPSBlbnY7XG5cbiAgLyoqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2Vzc19leGVjYXJndiAqL1xuICBleGVjQXJndjogc3RyaW5nW10gPSBbXTtcblxuICAvKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19wcm9jZXNzX2V4aXRfY29kZSAqL1xuICBleGl0ID0gZXhpdDtcblxuICBfZXhpdGluZyA9IF9leGl0aW5nO1xuXG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzZXhpdGNvZGVfMSAqL1xuICBleGl0Q29kZTogdW5kZWZpbmVkIHwgbnVtYmVyID0gdW5kZWZpbmVkO1xuXG4gIC8vIFR5cGVkIGFzIGFueSB0byBhdm9pZCBpbXBvcnRpbmcgXCJtb2R1bGVcIiBtb2R1bGUgZm9yIHR5cGVzXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIG1haW5Nb2R1bGU6IGFueSA9IHVuZGVmaW5lZDtcblxuICAvKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19wcm9jZXNzX25leHR0aWNrX2NhbGxiYWNrX2FyZ3MgKi9cbiAgbmV4dFRpY2sgPSBfbmV4dFRpY2s7XG5cbiAgLyoqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2Vzc19ldmVudHMgKi9cbiAgb3ZlcnJpZGUgb24oZXZlbnQ6IFwiZXhpdFwiLCBsaXN0ZW5lcjogKGNvZGU6IG51bWJlcikgPT4gdm9pZCk6IHRoaXM7XG4gIG92ZXJyaWRlIG9uKFxuICAgIGV2ZW50OiB0eXBlb2Ygbm90SW1wbGVtZW50ZWRFdmVudHNbbnVtYmVyXSxcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIGJhbi10eXBlc1xuICAgIGxpc3RlbmVyOiBGdW5jdGlvbixcbiAgKTogdGhpcztcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgb3ZlcnJpZGUgb24oZXZlbnQ6IHN0cmluZywgbGlzdGVuZXI6ICguLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCk6IHRoaXMge1xuICAgIGlmIChub3RJbXBsZW1lbnRlZEV2ZW50cy5pbmNsdWRlcyhldmVudCkpIHtcbiAgICAgIHdhcm5Ob3RJbXBsZW1lbnRlZChgcHJvY2Vzcy5vbihcIiR7ZXZlbnR9XCIpYCk7XG4gICAgICBzdXBlci5vbihldmVudCwgbGlzdGVuZXIpO1xuICAgIH0gZWxzZSBpZiAoZXZlbnQuc3RhcnRzV2l0aChcIlNJR1wiKSkge1xuICAgICAgaWYgKGV2ZW50ID09PSBcIlNJR0JSRUFLXCIgJiYgRGVuby5idWlsZC5vcyAhPT0gXCJ3aW5kb3dzXCIpIHtcbiAgICAgICAgLy8gSWdub3JlcyBTSUdCUkVBSyBpZiB0aGUgcGxhdGZvcm0gaXMgbm90IHdpbmRvd3MuXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBEZW5vVW5zdGFibGUuYWRkU2lnbmFsTGlzdGVuZXIoZXZlbnQgYXMgRGVuby5TaWduYWwsIGxpc3RlbmVyKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc3VwZXIub24oZXZlbnQsIGxpc3RlbmVyKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIG92ZXJyaWRlIG9mZihldmVudDogXCJleGl0XCIsIGxpc3RlbmVyOiAoY29kZTogbnVtYmVyKSA9PiB2b2lkKTogdGhpcztcbiAgb3ZlcnJpZGUgb2ZmKFxuICAgIGV2ZW50OiB0eXBlb2Ygbm90SW1wbGVtZW50ZWRFdmVudHNbbnVtYmVyXSxcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIGJhbi10eXBlc1xuICAgIGxpc3RlbmVyOiBGdW5jdGlvbixcbiAgKTogdGhpcztcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgb3ZlcnJpZGUgb2ZmKGV2ZW50OiBzdHJpbmcsIGxpc3RlbmVyOiAoLi4uYXJnczogYW55W10pID0+IHZvaWQpOiB0aGlzIHtcbiAgICBpZiAobm90SW1wbGVtZW50ZWRFdmVudHMuaW5jbHVkZXMoZXZlbnQpKSB7XG4gICAgICB3YXJuTm90SW1wbGVtZW50ZWQoYHByb2Nlc3Mub2ZmKFwiJHtldmVudH1cIilgKTtcbiAgICAgIHN1cGVyLm9mZihldmVudCwgbGlzdGVuZXIpO1xuICAgIH0gZWxzZSBpZiAoZXZlbnQuc3RhcnRzV2l0aChcIlNJR1wiKSkge1xuICAgICAgaWYgKGV2ZW50ID09PSBcIlNJR0JSRUFLXCIgJiYgRGVuby5idWlsZC5vcyAhPT0gXCJ3aW5kb3dzXCIpIHtcbiAgICAgICAgLy8gSWdub3JlcyBTSUdCUkVBSyBpZiB0aGUgcGxhdGZvcm0gaXMgbm90IHdpbmRvd3MuXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBEZW5vVW5zdGFibGUucmVtb3ZlU2lnbmFsTGlzdGVuZXIoZXZlbnQgYXMgRGVuby5TaWduYWwsIGxpc3RlbmVyKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc3VwZXIub2ZmKGV2ZW50LCBsaXN0ZW5lcik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBvdmVycmlkZSBlbWl0KGV2ZW50OiBzdHJpbmcsIC4uLmFyZ3M6IGFueVtdKTogYm9vbGVhbiB7XG4gICAgaWYgKGV2ZW50LnN0YXJ0c1dpdGgoXCJTSUdcIikpIHtcbiAgICAgIGlmIChldmVudCA9PT0gXCJTSUdCUkVBS1wiICYmIERlbm8uYnVpbGQub3MgIT09IFwid2luZG93c1wiKSB7XG4gICAgICAgIC8vIElnbm9yZXMgU0lHQlJFQUsgaWYgdGhlIHBsYXRmb3JtIGlzIG5vdCB3aW5kb3dzLlxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgRGVuby5raWxsKERlbm8ucGlkLCBldmVudCBhcyBEZW5vLlNpZ25hbCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBzdXBlci5lbWl0KGV2ZW50LCAuLi5hcmdzKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIG92ZXJyaWRlIHByZXBlbmRMaXN0ZW5lcihcbiAgICBldmVudDogXCJleGl0XCIsXG4gICAgbGlzdGVuZXI6IChjb2RlOiBudW1iZXIpID0+IHZvaWQsXG4gICk6IHRoaXM7XG4gIG92ZXJyaWRlIHByZXBlbmRMaXN0ZW5lcihcbiAgICBldmVudDogdHlwZW9mIG5vdEltcGxlbWVudGVkRXZlbnRzW251bWJlcl0sXG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBiYW4tdHlwZXNcbiAgICBsaXN0ZW5lcjogRnVuY3Rpb24sXG4gICk6IHRoaXM7XG4gIG92ZXJyaWRlIHByZXBlbmRMaXN0ZW5lcihcbiAgICBldmVudDogc3RyaW5nLFxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgbGlzdGVuZXI6ICguLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCxcbiAgKTogdGhpcyB7XG4gICAgaWYgKG5vdEltcGxlbWVudGVkRXZlbnRzLmluY2x1ZGVzKGV2ZW50KSkge1xuICAgICAgd2Fybk5vdEltcGxlbWVudGVkKGBwcm9jZXNzLnByZXBlbmRMaXN0ZW5lcihcIiR7ZXZlbnR9XCIpYCk7XG4gICAgICBzdXBlci5wcmVwZW5kTGlzdGVuZXIoZXZlbnQsIGxpc3RlbmVyKTtcbiAgICB9IGVsc2UgaWYgKGV2ZW50LnN0YXJ0c1dpdGgoXCJTSUdcIikpIHtcbiAgICAgIGlmIChldmVudCA9PT0gXCJTSUdCUkVBS1wiICYmIERlbm8uYnVpbGQub3MgIT09IFwid2luZG93c1wiKSB7XG4gICAgICAgIC8vIElnbm9yZXMgU0lHQlJFQUsgaWYgdGhlIHBsYXRmb3JtIGlzIG5vdCB3aW5kb3dzLlxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgRGVub1Vuc3RhYmxlLmFkZFNpZ25hbExpc3RlbmVyKGV2ZW50IGFzIERlbm8uU2lnbmFsLCBsaXN0ZW5lcik7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHN1cGVyLnByZXBlbmRMaXN0ZW5lcihldmVudCwgbGlzdGVuZXIpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2Vzc19waWQgKi9cbiAgcGlkID0gcGlkO1xuXG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfcGxhdGZvcm0gKi9cbiAgcGxhdGZvcm0gPSBwbGF0Zm9ybTtcblxuICBvdmVycmlkZSBhZGRMaXN0ZW5lcihldmVudDogXCJleGl0XCIsIGxpc3RlbmVyOiAoY29kZTogbnVtYmVyKSA9PiB2b2lkKTogdGhpcztcbiAgb3ZlcnJpZGUgYWRkTGlzdGVuZXIoXG4gICAgZXZlbnQ6IHR5cGVvZiBub3RJbXBsZW1lbnRlZEV2ZW50c1tudW1iZXJdLFxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgYmFuLXR5cGVzXG4gICAgbGlzdGVuZXI6IEZ1bmN0aW9uLFxuICApOiB0aGlzO1xuICBvdmVycmlkZSBhZGRMaXN0ZW5lcihcbiAgICBldmVudDogc3RyaW5nLFxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgbGlzdGVuZXI6ICguLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCxcbiAgKTogdGhpcyB7XG4gICAgaWYgKG5vdEltcGxlbWVudGVkRXZlbnRzLmluY2x1ZGVzKGV2ZW50KSkge1xuICAgICAgd2Fybk5vdEltcGxlbWVudGVkKGBwcm9jZXNzLmFkZExpc3RlbmVyKFwiJHtldmVudH1cIilgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5vbihldmVudCwgbGlzdGVuZXIpO1xuICB9XG5cbiAgb3ZlcnJpZGUgcmVtb3ZlTGlzdGVuZXIoXG4gICAgZXZlbnQ6IFwiZXhpdFwiLFxuICAgIGxpc3RlbmVyOiAoY29kZTogbnVtYmVyKSA9PiB2b2lkLFxuICApOiB0aGlzO1xuICBvdmVycmlkZSByZW1vdmVMaXN0ZW5lcihcbiAgICBldmVudDogdHlwZW9mIG5vdEltcGxlbWVudGVkRXZlbnRzW251bWJlcl0sXG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBiYW4tdHlwZXNcbiAgICBsaXN0ZW5lcjogRnVuY3Rpb24sXG4gICk6IHRoaXM7XG4gIG92ZXJyaWRlIHJlbW92ZUxpc3RlbmVyKFxuICAgIGV2ZW50OiBzdHJpbmcsXG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICBsaXN0ZW5lcjogKC4uLmFyZ3M6IGFueVtdKSA9PiB2b2lkLFxuICApOiB0aGlzIHtcbiAgICBpZiAobm90SW1wbGVtZW50ZWRFdmVudHMuaW5jbHVkZXMoZXZlbnQpKSB7XG4gICAgICB3YXJuTm90SW1wbGVtZW50ZWQoYHByb2Nlc3MucmVtb3ZlTGlzdGVuZXIoXCIke2V2ZW50fVwiKWApO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLm9mZihldmVudCwgbGlzdGVuZXIpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIGN1cnJlbnQgaGlnaC1yZXNvbHV0aW9uIHJlYWwgdGltZSBpbiBhIFtzZWNvbmRzLCBuYW5vc2Vjb25kc11cbiAgICogdHVwbGUuXG4gICAqXG4gICAqIE5vdGU6IFlvdSBuZWVkIHRvIGdpdmUgLS1hbGxvdy1ocnRpbWUgcGVybWlzc2lvbiB0byBEZW5vIHRvIGFjdHVhbGx5IGdldFxuICAgKiBuYW5vc2Vjb25kcyBwcmVjaXNpb24gdmFsdWVzLiBJZiB5b3UgZG9uJ3QgZ2l2ZSAnaHJ0aW1lJyBwZXJtaXNzaW9uLCB0aGUgcmV0dXJuZWRcbiAgICogdmFsdWVzIG9ubHkgaGF2ZSBtaWxsaXNlY29uZHMgcHJlY2lzaW9uLlxuICAgKlxuICAgKiBgdGltZWAgaXMgYW4gb3B0aW9uYWwgcGFyYW1ldGVyIHRoYXQgbXVzdCBiZSB0aGUgcmVzdWx0IG9mIGEgcHJldmlvdXMgcHJvY2Vzcy5ocnRpbWUoKSBjYWxsIHRvIGRpZmYgd2l0aCB0aGUgY3VycmVudCB0aW1lLlxuICAgKlxuICAgKiBUaGVzZSB0aW1lcyBhcmUgcmVsYXRpdmUgdG8gYW4gYXJiaXRyYXJ5IHRpbWUgaW4gdGhlIHBhc3QsIGFuZCBub3QgcmVsYXRlZCB0byB0aGUgdGltZSBvZiBkYXkgYW5kIHRoZXJlZm9yZSBub3Qgc3ViamVjdCB0byBjbG9jayBkcmlmdC4gVGhlIHByaW1hcnkgdXNlIGlzIGZvciBtZWFzdXJpbmcgcGVyZm9ybWFuY2UgYmV0d2VlbiBpbnRlcnZhbHMuXG4gICAqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2Vzc19ocnRpbWVfdGltZVxuICAgKi9cbiAgaHJ0aW1lID0gaHJ0aW1lO1xuXG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNza2lsbHBpZC1zaWduYWwgKi9cbiAga2lsbCA9IGtpbGw7XG5cbiAgbWVtb3J5VXNhZ2UgPSBtZW1vcnlVc2FnZTtcblxuICAvKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19wcm9jZXNzX3N0ZGVyciAqL1xuICBzdGRlcnIgPSBzdGRlcnI7XG5cbiAgLyoqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2Vzc19zdGRpbiAqL1xuICBzdGRpbiA9IHN0ZGluO1xuXG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3Nfc3Rkb3V0ICovXG4gIHN0ZG91dCA9IHN0ZG91dDtcblxuICAvKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19wcm9jZXNzX3ZlcnNpb24gKi9cbiAgdmVyc2lvbiA9IHZlcnNpb247XG5cbiAgLyoqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2Vzc192ZXJzaW9ucyAqL1xuICB2ZXJzaW9ucyA9IHZlcnNpb25zO1xuXG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfZW1pdHdhcm5pbmdfd2FybmluZ19vcHRpb25zICovXG4gIGVtaXRXYXJuaW5nID0gZW1pdFdhcm5pbmc7XG5cbiAgYmluZGluZyhuYW1lOiBCaW5kaW5nTmFtZSkge1xuICAgIHJldHVybiBnZXRCaW5kaW5nKG5hbWUpO1xuICB9XG5cbiAgLyoqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3N1bWFza21hc2sgKi9cbiAgdW1hc2soKSB7XG4gICAgLy8gQWx3YXlzIHJldHVybiB0aGUgc3lzdGVtIGRlZmF1bHQgdW1hc2sgdmFsdWUuXG4gICAgLy8gV2UgZG9uJ3QgdXNlIERlbm8udW1hc2sgaGVyZSBiZWNhdXNlIGl0IGhhcyBhIHJhY2VcbiAgICAvLyBjb25kaXRpb24gYnVnLlxuICAgIC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vZGVub2xhbmQvZGVub19zdGQvaXNzdWVzLzE4OTMjaXNzdWVjb21tZW50LTEwMzI4OTc3NzlcbiAgICByZXR1cm4gMG8yMjtcbiAgfVxuXG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzZ2V0dWlkICovXG4gIGdldHVpZCgpOiBudW1iZXIge1xuICAgIC8vIFRPRE8oa3Qzayk6IHJldHVybiB1c2VyIGlkIGluIG1hYyBhbmQgbGludXhcbiAgICByZXR1cm4gTmFOO1xuICB9XG5cbiAgLyoqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NnZXRnaWQgKi9cbiAgZ2V0Z2lkKCk6IG51bWJlciB7XG4gICAgLy8gVE9ETyhrdDNrKTogcmV0dXJuIGdyb3VwIGlkIGluIG1hYyBhbmQgbGludXhcbiAgICByZXR1cm4gTmFOO1xuICB9XG5cbiAgLy8gVE9ETyhrdDNrKTogSW1wbGVtZW50IHRoaXMgd2hlbiB3ZSBhZGRlZCAtZSBvcHRpb24gdG8gbm9kZSBjb21wYXQgbW9kZVxuICBfZXZhbDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzZXhlY3BhdGggKi9cbiAgZ2V0IGV4ZWNQYXRoKCkge1xuICAgIHJldHVybiBhcmd2WzBdO1xuICB9XG5cbiAgI3N0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzdXB0aW1lICovXG4gIHVwdGltZSgpIHtcbiAgICByZXR1cm4gKERhdGUubm93KCkgLSB0aGlzLiNzdGFydFRpbWUpIC8gMTAwMDtcbiAgfVxuXG4gICNhbGxvd2VkRmxhZ3MgPSBidWlsZEFsbG93ZWRGbGFncygpO1xuICAvKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc2FsbG93ZWRub2RlZW52aXJvbm1lbnRmbGFncyAqL1xuICBnZXQgYWxsb3dlZE5vZGVFbnZpcm9ubWVudEZsYWdzKCkge1xuICAgIHJldHVybiB0aGlzLiNhbGxvd2VkRmxhZ3M7XG4gIH1cblxuICBmZWF0dXJlcyA9IHsgaW5zcGVjdG9yOiBmYWxzZSB9O1xufVxuXG4vKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19wcm9jZXNzICovXG5jb25zdCBwcm9jZXNzID0gbmV3IFByb2Nlc3MoKTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KHByb2Nlc3MsIFN5bWJvbC50b1N0cmluZ1RhZywge1xuICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgd3JpdGFibGU6IHRydWUsXG4gIGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gIHZhbHVlOiBcInByb2Nlc3NcIixcbn0pO1xuXG5hZGRSZWFkT25seVByb2Nlc3NBbGlhcyhcIm5vRGVwcmVjYXRpb25cIiwgXCItLW5vLWRlcHJlY2F0aW9uXCIpO1xuYWRkUmVhZE9ubHlQcm9jZXNzQWxpYXMoXCJ0aHJvd0RlcHJlY2F0aW9uXCIsIFwiLS10aHJvdy1kZXByZWNhdGlvblwiKTtcblxuZXhwb3J0IGNvbnN0IHJlbW92ZUxpc3RlbmVyID0gcHJvY2Vzcy5yZW1vdmVMaXN0ZW5lcjtcbmV4cG9ydCBjb25zdCByZW1vdmVBbGxMaXN0ZW5lcnMgPSBwcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycztcblxuZXhwb3J0IGRlZmF1bHQgcHJvY2VzcztcblxuLy9UT0RPKFNvcmVtd2FyKVxuLy9SZW1vdmUgb24gMS4wXG4vL0tlcHQgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IHdpdGggc3RkXG5leHBvcnQgeyBwcm9jZXNzIH07XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBQzFFLHFGQUFxRjtBQUNyRixZQUFZLGtCQUFrQix1QkFBdUI7QUFDckQsU0FBUyxrQkFBa0IsUUFBUSxj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