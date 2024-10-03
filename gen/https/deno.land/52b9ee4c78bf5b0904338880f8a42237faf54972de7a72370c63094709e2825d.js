// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// Copyright Node.js contributors. All rights reserved. MIT License.
/** ********** NOT IMPLEMENTED
 * ERR_MANIFEST_ASSERT_INTEGRITY
 * ERR_QUICSESSION_VERSION_NEGOTIATION
 * ERR_REQUIRE_ESM
 * ERR_TLS_CERT_ALTNAME_INVALID
 * ERR_WORKER_INVALID_EXEC_ARGV
 * ERR_WORKER_PATH
 * ERR_QUIC_ERROR
 * ERR_SOCKET_BUFFER_SIZE //System error, shouldn't ever happen inside Deno
 * ERR_SYSTEM_ERROR //System error, shouldn't ever happen inside Deno
 * ERR_TTY_INIT_FAILED //System error, shouldn't ever happen inside Deno
 * ERR_INVALID_PACKAGE_CONFIG // package.json stuff, probably useless
 * *********** */ import { getSystemErrorName } from "../util.ts";
import { inspect } from "../internal/util/inspect.mjs";
import { codes } from "./error_codes.ts";
import { codeMap, errorMap, mapSysErrnoToUvErrno } from "../internal_binding/uv.ts";
import { assert } from "../../_util/assert.ts";
import { isWindows } from "../../_util/os.ts";
import { os as osConstants } from "../internal_binding/constants.ts";
const { errno: { ENOTDIR, ENOENT } } = osConstants;
import { hideStackFrames } from "./hide_stack_frames.ts";
export { errorMap };
const kIsNodeError = Symbol("kIsNodeError");
/**
 * @see https://github.com/nodejs/node/blob/f3eb224/lib/internal/errors.js
 */ const classRegExp = /^([A-Z][a-z0-9]*)+$/;
/**
 * @see https://github.com/nodejs/node/blob/f3eb224/lib/internal/errors.js
 * @description Sorted by a rough estimate on most frequently used entries.
 */ const kTypes = [
  "string",
  "function",
  "number",
  "object",
  // Accept 'Function' and 'Object' as alternative to the lower cased version.
  "Function",
  "Object",
  "boolean",
  "bigint",
  "symbol"
];
// Node uses an AbortError that isn't exactly the same as the DOMException
// to make usage of the error in userland and readable-stream easier.
// It is a regular error with `.code` and `.name`.
export class AbortError extends Error {
  code;
  constructor(){
    super("The operation was aborted");
    this.code = "ABORT_ERR";
    this.name = "AbortError";
  }
}
let maxStack_ErrorName;
let maxStack_ErrorMessage;
/**
 * Returns true if `err.name` and `err.message` are equal to engine-specific
 * values indicating max call stack size has been exceeded.
 * "Maximum call stack size exceeded" in V8.
 */ export function isStackOverflowError(err) {
  if (maxStack_ErrorMessage === undefined) {
    try {
      // deno-lint-ignore no-inner-declarations
      function overflowStack() {
        overflowStack();
      }
      overflowStack();
    // deno-lint-ignore no-explicit-any
    } catch (err) {
      maxStack_ErrorMessage = err.message;
      maxStack_ErrorName = err.name;
    }
  }
  return err && err.name === maxStack_ErrorName && err.message === maxStack_ErrorMessage;
}
function addNumericalSeparator(val) {
  let res = "";
  let i = val.length;
  const start = val[0] === "-" ? 1 : 0;
  for(; i >= start + 4; i -= 3){
    res = `_${val.slice(i - 3, i)}${res}`;
  }
  return `${val.slice(0, i)}${res}`;
}
const captureLargerStackTrace = hideStackFrames(function captureLargerStackTrace(err) {
  // @ts-ignore this function is not available in lib.dom.d.ts
  Error.captureStackTrace(err);
  return err;
});
/**
 * This creates an error compatible with errors produced in the C++
 * This function should replace the deprecated
 * `exceptionWithHostPort()` function.
 *
 * @param err A libuv error number
 * @param syscall
 * @param address
 * @param port
 * @return The error.
 */ export const uvExceptionWithHostPort = hideStackFrames(function uvExceptionWithHostPort(err, syscall, address, port) {
  const { 0: code, 1: uvmsg } = uvErrmapGet(err) || uvUnmappedError;
  const message = `${syscall} ${code}: ${uvmsg}`;
  let details = "";
  if (port && port > 0) {
    details = ` ${address}:${port}`;
  } else if (address) {
    details = ` ${address}`;
  }
  // deno-lint-ignore no-explicit-any
  const ex = new Error(`${message}${details}`);
  ex.code = code;
  ex.errno = err;
  ex.syscall = syscall;
  ex.address = address;
  if (port) {
    ex.port = port;
  }
  return captureLargerStackTrace(ex);
});
/**
 * This used to be `util._errnoException()`.
 *
 * @param err A libuv error number
 * @param syscall
 * @param original
 * @return A `ErrnoException`
 */ export const errnoException = hideStackFrames(function errnoException(err, syscall, original) {
  const code = getSystemErrorName(err);
  const message = original ? `${syscall} ${code} ${original}` : `${syscall} ${code}`;
  // deno-lint-ignore no-explicit-any
  const ex = new Error(message);
  ex.errno = err;
  ex.code = code;
  ex.syscall = syscall;
  return captureLargerStackTrace(ex);
});
function uvErrmapGet(name) {
  return errorMap.get(name);
}
const uvUnmappedError = [
  "UNKNOWN",
  "unknown error"
];
/**
 * This creates an error compatible with errors produced in the C++
 * function UVException using a context object with data assembled in C++.
 * The goal is to migrate them to ERR_* errors later when compatibility is
 * not a concern.
 *
 * @param ctx
 * @return The error.
 */ export const uvException = hideStackFrames(function uvException(ctx) {
  const { 0: code, 1: uvmsg } = uvErrmapGet(ctx.errno) || uvUnmappedError;
  let message = `${code}: ${ctx.message || uvmsg}, ${ctx.syscall}`;
  let path;
  let dest;
  if (ctx.path) {
    path = ctx.path.toString();
    message += ` '${path}'`;
  }
  if (ctx.dest) {
    dest = ctx.dest.toString();
    message += ` -> '${dest}'`;
  }
  // deno-lint-ignore no-explicit-any
  const err = new Error(message);
  for (const prop of Object.keys(ctx)){
    if (prop === "message" || prop === "path" || prop === "dest") {
      continue;
    }
    err[prop] = ctx[prop];
  }
  err.code = code;
  if (path) {
    err.path = path;
  }
  if (dest) {
    err.dest = dest;
  }
  return captureLargerStackTrace(err);
});
/**
 * Deprecated, new function is `uvExceptionWithHostPort()`
 * New function added the error description directly
 * from C++. this method for backwards compatibility
 * @param err A libuv error number
 * @param syscall
 * @param address
 * @param port
 * @param additional
 */ export const exceptionWithHostPort = hideStackFrames(function exceptionWithHostPort(err, syscall, address, port, additional) {
  const code = getSystemErrorName(err);
  let details = "";
  if (port && port > 0) {
    details = ` ${address}:${port}`;
  } else if (address) {
    details = ` ${address}`;
  }
  if (additional) {
    details += ` - Local (${additional})`;
  }
  // deno-lint-ignore no-explicit-any
  const ex = new Error(`${syscall} ${code}${details}`);
  ex.errno = err;
  ex.code = code;
  ex.syscall = syscall;
  ex.address = address;
  if (port) {
    ex.port = port;
  }
  return captureLargerStackTrace(ex);
});
/**
 * @param code A libuv error number or a c-ares error code
 * @param syscall
 * @param hostname
 */ export const dnsException = hideStackFrames(function(code, syscall, hostname) {
  let errno;
  // If `code` is of type number, it is a libuv error number, else it is a
  // c-ares error code.
  if (typeof code === "number") {
    errno = code;
    // ENOTFOUND is not a proper POSIX error, but this error has been in place
    // long enough that it's not practical to remove it.
    if (code === codeMap.get("EAI_NODATA") || code === codeMap.get("EAI_NONAME")) {
      code = "ENOTFOUND"; // Fabricated error name.
    } else {
      code = getSystemErrorName(code);
    }
  }
  const message = `${syscall} ${code}${hostname ? ` ${hostname}` : ""}`;
  // deno-lint-ignore no-explicit-any
  const ex = new Error(message);
  ex.errno = errno;
  ex.code = code;
  ex.syscall = syscall;
  if (hostname) {
    ex.hostname = hostname;
  }
  return captureLargerStackTrace(ex);
});
/**
 * All error instances in Node have additional methods and properties
 * This export class is meant to be extended by these instances abstracting native JS error instances
 */ export class NodeErrorAbstraction extends Error {
  code;
  constructor(name, code, message){
    super(message);
    this.code = code;
    this.name = name;
    //This number changes depending on the name of this class
    //20 characters as of now
    this.stack = this.stack && `${name} [${this.code}]${this.stack.slice(20)}`;
  }
  toString() {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}
export class NodeError extends NodeErrorAbstraction {
  constructor(code, message){
    super(Error.prototype.name, code, message);
  }
}
export class NodeSyntaxError extends NodeErrorAbstraction {
  constructor(code, message){
    super(SyntaxError.prototype.name, code, message);
    Object.setPrototypeOf(this, SyntaxError.prototype);
    this.toString = function() {
      return `${this.name} [${this.code}]: ${this.message}`;
    };
  }
}
export class NodeRangeError extends NodeErrorAbstraction {
  constructor(code, message){
    super(RangeError.prototype.name, code, message);
    Object.setPrototypeOf(this, RangeError.prototype);
    this.toString = function() {
      return `${this.name} [${this.code}]: ${this.message}`;
    };
  }
}
export class NodeTypeError extends NodeErrorAbstraction {
  constructor(code, message){
    super(TypeError.prototype.name, code, message);
    Object.setPrototypeOf(this, TypeError.prototype);
    this.toString = function() {
      return `${this.name} [${this.code}]: ${this.message}`;
    };
  }
}
export class NodeURIError extends NodeErrorAbstraction {
  constructor(code, message){
    super(URIError.prototype.name, code, message);
    Object.setPrototypeOf(this, URIError.prototype);
    this.toString = function() {
      return `${this.name} [${this.code}]: ${this.message}`;
    };
  }
}
// A specialized Error that includes an additional info property with
// additional information about the error condition.
// It has the properties present in a UVException but with a custom error
// message followed by the uv error code and uv error message.
// It also has its own error code with the original uv error context put into
// `err.info`.
// The context passed into this error must have .code, .syscall and .message,
// and may have .path and .dest.
class NodeSystemError extends NodeErrorAbstraction {
  constructor(key, context, msgPrefix){
    let message = `${msgPrefix}: ${context.syscall} returned ` + `${context.code} (${context.message})`;
    if (context.path !== undefined) {
      message += ` ${context.path}`;
    }
    if (context.dest !== undefined) {
      message += ` => ${context.dest}`;
    }
    super("SystemError", key, message);
    captureLargerStackTrace(this);
    Object.defineProperties(this, {
      [kIsNodeError]: {
        value: true,
        enumerable: false,
        writable: false,
        configurable: true
      },
      info: {
        value: context,
        enumerable: true,
        configurable: true,
        writable: false
      },
      errno: {
        get () {
          return context.errno;
        },
        set: (value)=>{
          context.errno = value;
        },
        enumerable: true,
        configurable: true
      },
      syscall: {
        get () {
          return context.syscall;
        },
        set: (value)=>{
          context.syscall = value;
        },
        enumerable: true,
        configurable: true
      }
    });
    if (context.path !== undefined) {
      Object.defineProperty(this, "path", {
        get () {
          return context.path;
        },
        set: (value)=>{
          context.path = value;
        },
        enumerable: true,
        configurable: true
      });
    }
    if (context.dest !== undefined) {
      Object.defineProperty(this, "dest", {
        get () {
          return context.dest;
        },
        set: (value)=>{
          context.dest = value;
        },
        enumerable: true,
        configurable: true
      });
    }
  }
  toString() {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}
function makeSystemErrorWithCode(key, msgPrfix) {
  return class NodeError extends NodeSystemError {
    constructor(ctx){
      super(key, ctx, msgPrfix);
    }
  };
}
export const ERR_FS_EISDIR = makeSystemErrorWithCode("ERR_FS_EISDIR", "Path is a directory");
function createInvalidArgType(name, expected) {
  // https://github.com/nodejs/node/blob/f3eb224/lib/internal/errors.js#L1037-L1087
  expected = Array.isArray(expected) ? expected : [
    expected
  ];
  let msg = "The ";
  if (name.endsWith(" argument")) {
    // For cases like 'first argument'
    msg += `${name} `;
  } else {
    const type = name.includes(".") ? "property" : "argument";
    msg += `"${name}" ${type} `;
  }
  msg += "must be ";
  const types = [];
  const instances = [];
  const other = [];
  for (const value of expected){
    if (kTypes.includes(value)) {
      types.push(value.toLocaleLowerCase());
    } else if (classRegExp.test(value)) {
      instances.push(value);
    } else {
      other.push(value);
    }
  }
  // Special handle `object` in case other instances are allowed to outline
  // the differences between each other.
  if (instances.length > 0) {
    const pos = types.indexOf("object");
    if (pos !== -1) {
      types.splice(pos, 1);
      instances.push("Object");
    }
  }
  if (types.length > 0) {
    if (types.length > 2) {
      const last = types.pop();
      msg += `one of type ${types.join(", ")}, or ${last}`;
    } else if (types.length === 2) {
      msg += `one of type ${types[0]} or ${types[1]}`;
    } else {
      msg += `of type ${types[0]}`;
    }
    if (instances.length > 0 || other.length > 0) {
      msg += " or ";
    }
  }
  if (instances.length > 0) {
    if (instances.length > 2) {
      const last = instances.pop();
      msg += `an instance of ${instances.join(", ")}, or ${last}`;
    } else {
      msg += `an instance of ${instances[0]}`;
      if (instances.length === 2) {
        msg += ` or ${instances[1]}`;
      }
    }
    if (other.length > 0) {
      msg += " or ";
    }
  }
  if (other.length > 0) {
    if (other.length > 2) {
      const last = other.pop();
      msg += `one of ${other.join(", ")}, or ${last}`;
    } else if (other.length === 2) {
      msg += `one of ${other[0]} or ${other[1]}`;
    } else {
      if (other[0].toLowerCase() !== other[0]) {
        msg += "an ";
      }
      msg += `${other[0]}`;
    }
  }
  return msg;
}
export class ERR_INVALID_ARG_TYPE_RANGE extends NodeRangeError {
  constructor(name, expected, actual){
    const msg = createInvalidArgType(name, expected);
    super("ERR_INVALID_ARG_TYPE", `${msg}.${invalidArgTypeHelper(actual)}`);
  }
}
export class ERR_INVALID_ARG_TYPE extends NodeTypeError {
  constructor(name, expected, actual){
    const msg = createInvalidArgType(name, expected);
    super("ERR_INVALID_ARG_TYPE", `${msg}.${invalidArgTypeHelper(actual)}`);
  }
  static RangeError = ERR_INVALID_ARG_TYPE_RANGE;
}
class ERR_INVALID_ARG_VALUE_RANGE extends NodeRangeError {
  constructor(name, value, reason = "is invalid"){
    const type = name.includes(".") ? "property" : "argument";
    const inspected = inspect(value);
    super("ERR_INVALID_ARG_VALUE", `The ${type} '${name}' ${reason}. Received ${inspected}`);
  }
}
export class ERR_INVALID_ARG_VALUE extends NodeTypeError {
  constructor(name, value, reason = "is invalid"){
    const type = name.includes(".") ? "property" : "argument";
    const inspected = inspect(value);
    super("ERR_INVALID_ARG_VALUE", `The ${type} '${name}' ${reason}. Received ${inspected}`);
  }
  static RangeError = ERR_INVALID_ARG_VALUE_RANGE;
}
// A helper function to simplify checking for ERR_INVALID_ARG_TYPE output.
// deno-lint-ignore no-explicit-any
function invalidArgTypeHelper(input) {
  if (input == null) {
    return ` Received ${input}`;
  }
  if (typeof input === "function" && input.name) {
    return ` Received function ${input.name}`;
  }
  if (typeof input === "object") {
    if (input.constructor && input.constructor.name) {
      return ` Received an instance of ${input.constructor.name}`;
    }
    return ` Received ${inspect(input, {
      depth: -1
    })}`;
  }
  let inspected = inspect(input, {
    colors: false
  });
  if (inspected.length > 25) {
    inspected = `${inspected.slice(0, 25)}...`;
  }
  return ` Received type ${typeof input} (${inspected})`;
}
export class ERR_OUT_OF_RANGE extends RangeError {
  code = "ERR_OUT_OF_RANGE";
  constructor(str, range, input, replaceDefaultBoolean = false){
    assert(range, 'Missing "range" argument');
    let msg = replaceDefaultBoolean ? str : `The value of "${str}" is out of range.`;
    let received;
    if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
      received = addNumericalSeparator(String(input));
    } else if (typeof input === "bigint") {
      received = String(input);
      if (input > 2n ** 32n || input < -(2n ** 32n)) {
        received = addNumericalSeparator(received);
      }
      received += "n";
    } else {
      received = inspect(input);
    }
    msg += ` It must be ${range}. Received ${received}`;
    super(msg);
    const { name } = this;
    // Add the error code to the name to include it in the stack trace.
    this.name = `${name} [${this.code}]`;
    // Access the stack to generate the error message including the error code from the name.
    this.stack;
    // Reset the name to the actual name.
    this.name = name;
  }
}
export class ERR_AMBIGUOUS_ARGUMENT extends NodeTypeError {
  constructor(x, y){
    super("ERR_AMBIGUOUS_ARGUMENT", `The "${x}" argument is ambiguous. ${y}`);
  }
}
export class ERR_ARG_NOT_ITERABLE extends NodeTypeError {
  constructor(x){
    super("ERR_ARG_NOT_ITERABLE", `${x} must be iterable`);
  }
}
export class ERR_ASSERTION extends NodeError {
  constructor(x){
    super("ERR_ASSERTION", `${x}`);
  }
}
export class ERR_ASYNC_CALLBACK extends NodeTypeError {
  constructor(x){
    super("ERR_ASYNC_CALLBACK", `${x} must be a function`);
  }
}
export class ERR_ASYNC_TYPE extends NodeTypeError {
  constructor(x){
    super("ERR_ASYNC_TYPE", `Invalid name for async "type": ${x}`);
  }
}
export class ERR_BROTLI_INVALID_PARAM extends NodeRangeError {
  constructor(x){
    super("ERR_BROTLI_INVALID_PARAM", `${x} is not a valid Brotli parameter`);
  }
}
export class ERR_BUFFER_OUT_OF_BOUNDS extends NodeRangeError {
  constructor(name){
    super("ERR_BUFFER_OUT_OF_BOUNDS", name ? `"${name}" is outside of buffer bounds` : "Attempt to access memory outside buffer bounds");
  }
}
export class ERR_BUFFER_TOO_LARGE extends NodeRangeError {
  constructor(x){
    super("ERR_BUFFER_TOO_LARGE", `Cannot create a Buffer larger than ${x} bytes`);
  }
}
export class ERR_CANNOT_WATCH_SIGINT extends NodeError {
  constructor(){
    super("ERR_CANNOT_WATCH_SIGINT", "Cannot watch for SIGINT signals");
  }
}
export class ERR_CHILD_CLOSED_BEFORE_REPLY extends NodeError {
  constructor(){
    super("ERR_CHILD_CLOSED_BEFORE_REPLY", "Child closed before reply received");
  }
}
export class ERR_CHILD_PROCESS_IPC_REQUIRED extends NodeError {
  constructor(x){
    super("ERR_CHILD_PROCESS_IPC_REQUIRED", `Forked processes must have an IPC channel, missing value 'ipc' in ${x}`);
  }
}
export class ERR_CHILD_PROCESS_STDIO_MAXBUFFER extends NodeRangeError {
  constructor(x){
    super("ERR_CHILD_PROCESS_STDIO_MAXBUFFER", `${x} maxBuffer length exceeded`);
  }
}
export class ERR_CONSOLE_WRITABLE_STREAM extends NodeTypeError {
  constructor(x){
    super("ERR_CONSOLE_WRITABLE_STREAM", `Console expects a writable stream instance for ${x}`);
  }
}
export class ERR_CONTEXT_NOT_INITIALIZED extends NodeError {
  constructor(){
    super("ERR_CONTEXT_NOT_INITIALIZED", "context used is not initialized");
  }
}
export class ERR_CPU_USAGE extends NodeError {
  constructor(x){
    super("ERR_CPU_USAGE", `Unable to obtain cpu usage ${x}`);
  }
}
export class ERR_CRYPTO_CUSTOM_ENGINE_NOT_SUPPORTED extends NodeError {
  constructor(){
    super("ERR_CRYPTO_CUSTOM_ENGINE_NOT_SUPPORTED", "Custom engines not supported by this OpenSSL");
  }
}
export class ERR_CRYPTO_ECDH_INVALID_FORMAT extends NodeTypeError {
  constructor(x){
    super("ERR_CRYPTO_ECDH_INVALID_FORMAT", `Invalid ECDH format: ${x}`);
  }
}
export class ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY extends NodeError {
  constructor(){
    super("ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY", "Public key is not valid for specified curve");
  }
}
export class ERR_CRYPTO_ENGINE_UNKNOWN extends NodeError {
  constructor(x){
    super("ERR_CRYPTO_ENGINE_UNKNOWN", `Engine "${x}" was not found`);
  }
}
export class ERR_CRYPTO_FIPS_FORCED extends NodeError {
  constructor(){
    super("ERR_CRYPTO_FIPS_FORCED", "Cannot set FIPS mode, it was forced with --force-fips at startup.");
  }
}
export class ERR_CRYPTO_FIPS_UNAVAILABLE extends NodeError {
  constructor(){
    super("ERR_CRYPTO_FIPS_UNAVAILABLE", "Cannot set FIPS mode in a non-FIPS build.");
  }
}
export class ERR_CRYPTO_HASH_FINALIZED extends NodeError {
  constructor(){
    super("ERR_CRYPTO_HASH_FINALIZED", "Digest already called");
  }
}
export class ERR_CRYPTO_HASH_UPDATE_FAILED extends NodeError {
  constructor(){
    super("ERR_CRYPTO_HASH_UPDATE_FAILED", "Hash update failed");
  }
}
export class ERR_CRYPTO_INCOMPATIBLE_KEY extends NodeError {
  constructor(x, y){
    super("ERR_CRYPTO_INCOMPATIBLE_KEY", `Incompatible ${x}: ${y}`);
  }
}
export class ERR_CRYPTO_INCOMPATIBLE_KEY_OPTIONS extends NodeError {
  constructor(x, y){
    super("ERR_CRYPTO_INCOMPATIBLE_KEY_OPTIONS", `The selected key encoding ${x} ${y}.`);
  }
}
export class ERR_CRYPTO_INVALID_DIGEST extends NodeTypeError {
  constructor(x){
    super("ERR_CRYPTO_INVALID_DIGEST", `Invalid digest: ${x}`);
  }
}
export class ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE extends NodeTypeError {
  constructor(x, y){
    super("ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE", `Invalid key object type ${x}, expected ${y}.`);
  }
}
export class ERR_CRYPTO_INVALID_STATE extends NodeError {
  constructor(x){
    super("ERR_CRYPTO_INVALID_STATE", `Invalid state for operation ${x}`);
  }
}
export class ERR_CRYPTO_PBKDF2_ERROR extends NodeError {
  constructor(){
    super("ERR_CRYPTO_PBKDF2_ERROR", "PBKDF2 error");
  }
}
export class ERR_CRYPTO_SCRYPT_INVALID_PARAMETER extends NodeError {
  constructor(){
    super("ERR_CRYPTO_SCRYPT_INVALID_PARAMETER", "Invalid scrypt parameter");
  }
}
export class ERR_CRYPTO_SCRYPT_NOT_SUPPORTED extends NodeError {
  constructor(){
    super("ERR_CRYPTO_SCRYPT_NOT_SUPPORTED", "Scrypt algorithm not supported");
  }
}
export class ERR_CRYPTO_SIGN_KEY_REQUIRED extends NodeError {
  constructor(){
    super("ERR_CRYPTO_SIGN_KEY_REQUIRED", "No key provided to sign");
  }
}
export class ERR_DIR_CLOSED extends NodeError {
  constructor(){
    super("ERR_DIR_CLOSED", "Directory handle was closed");
  }
}
export class ERR_DIR_CONCURRENT_OPERATION extends NodeError {
  constructor(){
    super("ERR_DIR_CONCURRENT_OPERATION", "Cannot do synchronous work on directory handle with concurrent asynchronous operations");
  }
}
export class ERR_DNS_SET_SERVERS_FAILED extends NodeError {
  constructor(x, y){
    super("ERR_DNS_SET_SERVERS_FAILED", `c-ares failed to set servers: "${x}" [${y}]`);
  }
}
export class ERR_DOMAIN_CALLBACK_NOT_AVAILABLE extends NodeError {
  constructor(){
    super("ERR_DOMAIN_CALLBACK_NOT_AVAILABLE", "A callback was registered through " + "process.setUncaughtExceptionCaptureCallback(), which is mutually " + "exclusive with using the `domain` module");
  }
}
export class ERR_DOMAIN_CANNOT_SET_UNCAUGHT_EXCEPTION_CAPTURE extends NodeError {
  constructor(){
    super("ERR_DOMAIN_CANNOT_SET_UNCAUGHT_EXCEPTION_CAPTURE", "The `domain` module is in use, which is mutually exclusive with calling " + "process.setUncaughtExceptionCaptureCallback()");
  }
}
export class ERR_ENCODING_INVALID_ENCODED_DATA extends NodeErrorAbstraction {
  errno;
  constructor(encoding, ret){
    super(TypeError.prototype.name, "ERR_ENCODING_INVALID_ENCODED_DATA", `The encoded data was not valid for encoding ${encoding}`);
    Object.setPrototypeOf(this, TypeError.prototype);
    this.errno = ret;
  }
}
export class ERR_ENCODING_NOT_SUPPORTED extends NodeRangeError {
  constructor(x){
    super("ERR_ENCODING_NOT_SUPPORTED", `The "${x}" encoding is not supported`);
  }
}
export class ERR_EVAL_ESM_CANNOT_PRINT extends NodeError {
  constructor(){
    super("ERR_EVAL_ESM_CANNOT_PRINT", `--print cannot be used with ESM input`);
  }
}
export class ERR_EVENT_RECURSION extends NodeError {
  constructor(x){
    super("ERR_EVENT_RECURSION", `The event "${x}" is already being dispatched`);
  }
}
export class ERR_FEATURE_UNAVAILABLE_ON_PLATFORM extends NodeTypeError {
  constructor(x){
    super("ERR_FEATURE_UNAVAILABLE_ON_PLATFORM", `The feature ${x} is unavailable on the current platform, which is being used to run Node.js`);
  }
}
export class ERR_FS_FILE_TOO_LARGE extends NodeRangeError {
  constructor(x){
    super("ERR_FS_FILE_TOO_LARGE", `File size (${x}) is greater than 2 GB`);
  }
}
export class ERR_FS_INVALID_SYMLINK_TYPE extends NodeError {
  constructor(x){
    super("ERR_FS_INVALID_SYMLINK_TYPE", `Symlink type must be one of "dir", "file", or "junction". Received "${x}"`);
  }
}
export class ERR_HTTP2_ALTSVC_INVALID_ORIGIN extends NodeTypeError {
  constructor(){
    super("ERR_HTTP2_ALTSVC_INVALID_ORIGIN", `HTTP/2 ALTSVC frames require a valid origin`);
  }
}
export class ERR_HTTP2_ALTSVC_LENGTH extends NodeTypeError {
  constructor(){
    super("ERR_HTTP2_ALTSVC_LENGTH", `HTTP/2 ALTSVC frames are limited to 16382 bytes`);
  }
}
export class ERR_HTTP2_CONNECT_AUTHORITY extends NodeError {
  constructor(){
    super("ERR_HTTP2_CONNECT_AUTHORITY", `:authority header is required for CONNECT requests`);
  }
}
export class ERR_HTTP2_CONNECT_PATH extends NodeError {
  constructor(){
    super("ERR_HTTP2_CONNECT_PATH", `The :path header is forbidden for CONNECT requests`);
  }
}
export class ERR_HTTP2_CONNECT_SCHEME extends NodeError {
  constructor(){
    super("ERR_HTTP2_CONNECT_SCHEME", `The :scheme header is forbidden for CONNECT requests`);
  }
}
export class ERR_HTTP2_GOAWAY_SESSION extends NodeError {
  constructor(){
    super("ERR_HTTP2_GOAWAY_SESSION", `New streams cannot be created after receiving a GOAWAY`);
  }
}
export class ERR_HTTP2_HEADERS_AFTER_RESPOND extends NodeError {
  constructor(){
    super("ERR_HTTP2_HEADERS_AFTER_RESPOND", `Cannot specify additional headers after response initiated`);
  }
}
export class ERR_HTTP2_HEADERS_SENT extends NodeError {
  constructor(){
    super("ERR_HTTP2_HEADERS_SENT", `Response has already been initiated.`);
  }
}
export class ERR_HTTP2_HEADER_SINGLE_VALUE extends NodeTypeError {
  constructor(x){
    super("ERR_HTTP2_HEADER_SINGLE_VALUE", `Header field "${x}" must only have a single value`);
  }
}
export class ERR_HTTP2_INFO_STATUS_NOT_ALLOWED extends NodeRangeError {
  constructor(){
    super("ERR_HTTP2_INFO_STATUS_NOT_ALLOWED", `Informational status codes cannot be used`);
  }
}
export class ERR_HTTP2_INVALID_CONNECTION_HEADERS extends NodeTypeError {
  constructor(x){
    super("ERR_HTTP2_INVALID_CONNECTION_HEADERS", `HTTP/1 Connection specific headers are forbidden: "${x}"`);
  }
}
export class ERR_HTTP2_INVALID_HEADER_VALUE extends NodeTypeError {
  constructor(x, y){
    super("ERR_HTTP2_INVALID_HEADER_VALUE", `Invalid value "${x}" for header "${y}"`);
  }
}
export class ERR_HTTP2_INVALID_INFO_STATUS extends NodeRangeError {
  constructor(x){
    super("ERR_HTTP2_INVALID_INFO_STATUS", `Invalid informational status code: ${x}`);
  }
}
export class ERR_HTTP2_INVALID_ORIGIN extends NodeTypeError {
  constructor(){
    super("ERR_HTTP2_INVALID_ORIGIN", `HTTP/2 ORIGIN frames require a valid origin`);
  }
}
export class ERR_HTTP2_INVALID_PACKED_SETTINGS_LENGTH extends NodeRangeError {
  constructor(){
    super("ERR_HTTP2_INVALID_PACKED_SETTINGS_LENGTH", `Packed settings length must be a multiple of six`);
  }
}
export class ERR_HTTP2_INVALID_PSEUDOHEADER extends NodeTypeError {
  constructor(x){
    super("ERR_HTTP2_INVALID_PSEUDOHEADER", `"${x}" is an invalid pseudoheader or is used incorrectly`);
  }
}
export class ERR_HTTP2_INVALID_SESSION extends NodeError {
  constructor(){
    super("ERR_HTTP2_INVALID_SESSION", `The session has been destroyed`);
  }
}
export class ERR_HTTP2_INVALID_STREAM extends NodeError {
  constructor(){
    super("ERR_HTTP2_INVALID_STREAM", `The stream has been destroyed`);
  }
}
export class ERR_HTTP2_MAX_PENDING_SETTINGS_ACK extends NodeError {
  constructor(){
    super("ERR_HTTP2_MAX_PENDING_SETTINGS_ACK", `Maximum number of pending settings acknowledgements`);
  }
}
export class ERR_HTTP2_NESTED_PUSH extends NodeError {
  constructor(){
    super("ERR_HTTP2_NESTED_PUSH", `A push stream cannot initiate another push stream.`);
  }
}
export class ERR_HTTP2_NO_SOCKET_MANIPULATION extends NodeError {
  constructor(){
    super("ERR_HTTP2_NO_SOCKET_MANIPULATION", `HTTP/2 sockets should not be directly manipulated (e.g. read and written)`);
  }
}
export class ERR_HTTP2_ORIGIN_LENGTH extends NodeTypeError {
  constructor(){
    super("ERR_HTTP2_ORIGIN_LENGTH", `HTTP/2 ORIGIN frames are limited to 16382 bytes`);
  }
}
export class ERR_HTTP2_OUT_OF_STREAMS extends NodeError {
  constructor(){
    super("ERR_HTTP2_OUT_OF_STREAMS", `No stream ID is available because maximum stream ID has been reached`);
  }
}
export class ERR_HTTP2_PAYLOAD_FORBIDDEN extends NodeError {
  constructor(x){
    super("ERR_HTTP2_PAYLOAD_FORBIDDEN", `Responses with ${x} status must not have a payload`);
  }
}
export class ERR_HTTP2_PING_CANCEL extends NodeError {
  constructor(){
    super("ERR_HTTP2_PING_CANCEL", `HTTP2 ping cancelled`);
  }
}
export class ERR_HTTP2_PING_LENGTH extends NodeRangeError {
  constructor(){
    super("ERR_HTTP2_PING_LENGTH", `HTTP2 ping payload must be 8 bytes`);
  }
}
export class ERR_HTTP2_PSEUDOHEADER_NOT_ALLOWED extends NodeTypeError {
  constructor(){
    super("ERR_HTTP2_PSEUDOHEADER_NOT_ALLOWED", `Cannot set HTTP/2 pseudo-headers`);
  }
}
export class ERR_HTTP2_PUSH_DISABLED extends NodeError {
  constructor(){
    super("ERR_HTTP2_PUSH_DISABLED", `HTTP/2 client has disabled push streams`);
  }
}
export class ERR_HTTP2_SEND_FILE extends NodeError {
  constructor(){
    super("ERR_HTTP2_SEND_FILE", `Directories cannot be sent`);
  }
}
export class ERR_HTTP2_SEND_FILE_NOSEEK extends NodeError {
  constructor(){
    super("ERR_HTTP2_SEND_FILE_NOSEEK", `Offset or length can only be specified for regular files`);
  }
}
export class ERR_HTTP2_SESSION_ERROR extends NodeError {
  constructor(x){
    super("ERR_HTTP2_SESSION_ERROR", `Session closed with error code ${x}`);
  }
}
export class ERR_HTTP2_SETTINGS_CANCEL extends NodeError {
  constructor(){
    super("ERR_HTTP2_SETTINGS_CANCEL", `HTTP2 session settings canceled`);
  }
}
export class ERR_HTTP2_SOCKET_BOUND extends NodeError {
  constructor(){
    super("ERR_HTTP2_SOCKET_BOUND", `The socket is already bound to an Http2Session`);
  }
}
export class ERR_HTTP2_SOCKET_UNBOUND extends NodeError {
  constructor(){
    super("ERR_HTTP2_SOCKET_UNBOUND", `The socket has been disconnected from the Http2Session`);
  }
}
export class ERR_HTTP2_STATUS_101 extends NodeError {
  constructor(){
    super("ERR_HTTP2_STATUS_101", `HTTP status code 101 (Switching Protocols) is forbidden in HTTP/2`);
  }
}
export class ERR_HTTP2_STATUS_INVALID extends NodeRangeError {
  constructor(x){
    super("ERR_HTTP2_STATUS_INVALID", `Invalid status code: ${x}`);
  }
}
export class ERR_HTTP2_STREAM_ERROR extends NodeError {
  constructor(x){
    super("ERR_HTTP2_STREAM_ERROR", `Stream closed with error code ${x}`);
  }
}
export class ERR_HTTP2_STREAM_SELF_DEPENDENCY extends NodeError {
  constructor(){
    super("ERR_HTTP2_STREAM_SELF_DEPENDENCY", `A stream cannot depend on itself`);
  }
}
export class ERR_HTTP2_TRAILERS_ALREADY_SENT extends NodeError {
  constructor(){
    super("ERR_HTTP2_TRAILERS_ALREADY_SENT", `Trailing headers have already been sent`);
  }
}
export class ERR_HTTP2_TRAILERS_NOT_READY extends NodeError {
  constructor(){
    super("ERR_HTTP2_TRAILERS_NOT_READY", `Trailing headers cannot be sent until after the wantTrailers event is emitted`);
  }
}
export class ERR_HTTP2_UNSUPPORTED_PROTOCOL extends NodeError {
  constructor(x){
    super("ERR_HTTP2_UNSUPPORTED_PROTOCOL", `protocol "${x}" is unsupported.`);
  }
}
export class ERR_HTTP_HEADERS_SENT extends NodeError {
  constructor(x){
    super("ERR_HTTP_HEADERS_SENT", `Cannot ${x} headers after they are sent to the client`);
  }
}
export class ERR_HTTP_INVALID_HEADER_VALUE extends NodeTypeError {
  constructor(x, y){
    super("ERR_HTTP_INVALID_HEADER_VALUE", `Invalid value "${x}" for header "${y}"`);
  }
}
export class ERR_HTTP_INVALID_STATUS_CODE extends NodeRangeError {
  constructor(x){
    super("ERR_HTTP_INVALID_STATUS_CODE", `Invalid status code: ${x}`);
  }
}
export class ERR_HTTP_SOCKET_ENCODING extends NodeError {
  constructor(){
    super("ERR_HTTP_SOCKET_ENCODING", `Changing the socket encoding is not allowed per RFC7230 Section 3.`);
  }
}
export class ERR_HTTP_TRAILER_INVALID extends NodeError {
  constructor(){
    super("ERR_HTTP_TRAILER_INVALID", `Trailers are invalid with this transfer encoding`);
  }
}
export class ERR_INCOMPATIBLE_OPTION_PAIR extends NodeTypeError {
  constructor(x, y){
    super("ERR_INCOMPATIBLE_OPTION_PAIR", `Option "${x}" cannot be used in combination with option "${y}"`);
  }
}
export class ERR_INPUT_TYPE_NOT_ALLOWED extends NodeError {
  constructor(){
    super("ERR_INPUT_TYPE_NOT_ALLOWED", `--input-type can only be used with string input via --eval, --print, or STDIN`);
  }
}
export class ERR_INSPECTOR_ALREADY_ACTIVATED extends NodeError {
  constructor(){
    super("ERR_INSPECTOR_ALREADY_ACTIVATED", `Inspector is already activated. Close it with inspector.close() before activating it again.`);
  }
}
export class ERR_INSPECTOR_ALREADY_CONNECTED extends NodeError {
  constructor(x){
    super("ERR_INSPECTOR_ALREADY_CONNECTED", `${x} is already connected`);
  }
}
export class ERR_INSPECTOR_CLOSED extends NodeError {
  constructor(){
    super("ERR_INSPECTOR_CLOSED", `Session was closed`);
  }
}
export class ERR_INSPECTOR_COMMAND extends NodeError {
  constructor(x, y){
    super("ERR_INSPECTOR_COMMAND", `Inspector error ${x}: ${y}`);
  }
}
export class ERR_INSPECTOR_NOT_ACTIVE extends NodeError {
  constructor(){
    super("ERR_INSPECTOR_NOT_ACTIVE", `Inspector is not active`);
  }
}
export class ERR_INSPECTOR_NOT_AVAILABLE extends NodeError {
  constructor(){
    super("ERR_INSPECTOR_NOT_AVAILABLE", `Inspector is not available`);
  }
}
export class ERR_INSPECTOR_NOT_CONNECTED extends NodeError {
  constructor(){
    super("ERR_INSPECTOR_NOT_CONNECTED", `Session is not connected`);
  }
}
export class ERR_INSPECTOR_NOT_WORKER extends NodeError {
  constructor(){
    super("ERR_INSPECTOR_NOT_WORKER", `Current thread is not a worker`);
  }
}
export class ERR_INVALID_ASYNC_ID extends NodeRangeError {
  constructor(x, y){
    super("ERR_INVALID_ASYNC_ID", `Invalid ${x} value: ${y}`);
  }
}
export class ERR_INVALID_BUFFER_SIZE extends NodeRangeError {
  constructor(x){
    super("ERR_INVALID_BUFFER_SIZE", `Buffer size must be a multiple of ${x}`);
  }
}
export class ERR_INVALID_CALLBACK extends NodeTypeError {
  constructor(object){
    super("ERR_INVALID_CALLBACK", `Callback must be a function. Received ${inspect(object)}`);
  }
}
export class ERR_INVALID_CURSOR_POS extends NodeTypeError {
  constructor(){
    super("ERR_INVALID_CURSOR_POS", `Cannot set cursor row without setting its column`);
  }
}
export class ERR_INVALID_FD extends NodeRangeError {
  constructor(x){
    super("ERR_INVALID_FD", `"fd" must be a positive integer: ${x}`);
  }
}
export class ERR_INVALID_FD_TYPE extends NodeTypeError {
  constructor(x){
    super("ERR_INVALID_FD_TYPE", `Unsupported fd type: ${x}`);
  }
}
export class ERR_INVALID_FILE_URL_HOST extends NodeTypeError {
  constructor(x){
    super("ERR_INVALID_FILE_URL_HOST", `File URL host must be "localhost" or empty on ${x}`);
  }
}
export class ERR_INVALID_FILE_URL_PATH extends NodeTypeError {
  constructor(x){
    super("ERR_INVALID_FILE_URL_PATH", `File URL path ${x}`);
  }
}
export class ERR_INVALID_HANDLE_TYPE extends NodeTypeError {
  constructor(){
    super("ERR_INVALID_HANDLE_TYPE", `This handle type cannot be sent`);
  }
}
export class ERR_INVALID_HTTP_TOKEN extends NodeTypeError {
  constructor(x, y){
    super("ERR_INVALID_HTTP_TOKEN", `${x} must be a valid HTTP token ["${y}"]`);
  }
}
export class ERR_INVALID_IP_ADDRESS extends NodeTypeError {
  constructor(x){
    super("ERR_INVALID_IP_ADDRESS", `Invalid IP address: ${x}`);
  }
}
export class ERR_INVALID_OPT_VALUE_ENCODING extends NodeTypeError {
  constructor(x){
    super("ERR_INVALID_OPT_VALUE_ENCODING", `The value "${x}" is invalid for option "encoding"`);
  }
}
export class ERR_INVALID_PERFORMANCE_MARK extends NodeError {
  constructor(x){
    super("ERR_INVALID_PERFORMANCE_MARK", `The "${x}" performance mark has not been set`);
  }
}
export class ERR_INVALID_PROTOCOL extends NodeTypeError {
  constructor(x, y){
    super("ERR_INVALID_PROTOCOL", `Protocol "${x}" not supported. Expected "${y}"`);
  }
}
export class ERR_INVALID_REPL_EVAL_CONFIG extends NodeTypeError {
  constructor(){
    super("ERR_INVALID_REPL_EVAL_CONFIG", `Cannot specify both "breakEvalOnSigint" and "eval" for REPL`);
  }
}
export class ERR_INVALID_REPL_INPUT extends NodeTypeError {
  constructor(x){
    super("ERR_INVALID_REPL_INPUT", `${x}`);
  }
}
export class ERR_INVALID_SYNC_FORK_INPUT extends NodeTypeError {
  constructor(x){
    super("ERR_INVALID_SYNC_FORK_INPUT", `Asynchronous forks do not support Buffer, TypedArray, DataView or string input: ${x}`);
  }
}
export class ERR_INVALID_THIS extends NodeTypeError {
  constructor(x){
    super("ERR_INVALID_THIS", `Value of "this" must be of type ${x}`);
  }
}
export class ERR_INVALID_TUPLE extends NodeTypeError {
  constructor(x, y){
    super("ERR_INVALID_TUPLE", `${x} must be an iterable ${y} tuple`);
  }
}
export class ERR_INVALID_URI extends NodeURIError {
  constructor(){
    super("ERR_INVALID_URI", `URI malformed`);
  }
}
export class ERR_IPC_CHANNEL_CLOSED extends NodeError {
  constructor(){
    super("ERR_IPC_CHANNEL_CLOSED", `Channel closed`);
  }
}
export class ERR_IPC_DISCONNECTED extends NodeError {
  constructor(){
    super("ERR_IPC_DISCONNECTED", `IPC channel is already disconnected`);
  }
}
export class ERR_IPC_ONE_PIPE extends NodeError {
  constructor(){
    super("ERR_IPC_ONE_PIPE", `Child process can have only one IPC pipe`);
  }
}
export class ERR_IPC_SYNC_FORK extends NodeError {
  constructor(){
    super("ERR_IPC_SYNC_FORK", `IPC cannot be used with synchronous forks`);
  }
}
export class ERR_MANIFEST_DEPENDENCY_MISSING extends NodeError {
  constructor(x, y){
    super("ERR_MANIFEST_DEPENDENCY_MISSING", `Manifest resource ${x} does not list ${y} as a dependency specifier`);
  }
}
export class ERR_MANIFEST_INTEGRITY_MISMATCH extends NodeSyntaxError {
  constructor(x){
    super("ERR_MANIFEST_INTEGRITY_MISMATCH", `Manifest resource ${x} has multiple entries but integrity lists do not match`);
  }
}
export class ERR_MANIFEST_INVALID_RESOURCE_FIELD extends NodeTypeError {
  constructor(x, y){
    super("ERR_MANIFEST_INVALID_RESOURCE_FIELD", `Manifest resource ${x} has invalid property value for ${y}`);
  }
}
export class ERR_MANIFEST_TDZ extends NodeError {
  constructor(){
    super("ERR_MANIFEST_TDZ", `Manifest initialization has not yet run`);
  }
}
export class ERR_MANIFEST_UNKNOWN_ONERROR extends NodeSyntaxError {
  constructor(x){
    super("ERR_MANIFEST_UNKNOWN_ONERROR", `Manifest specified unknown error behavior "${x}".`);
  }
}
export class ERR_METHOD_NOT_IMPLEMENTED extends NodeError {
  constructor(x){
    super("ERR_METHOD_NOT_IMPLEMENTED", `The ${x} method is not implemented`);
  }
}
export class ERR_MISSING_ARGS extends NodeTypeError {
  constructor(...args){
    let msg = "The ";
    const len = args.length;
    const wrap = (a)=>`"${a}"`;
    args = args.map((a)=>Array.isArray(a) ? a.map(wrap).join(" or ") : wrap(a));
    switch(len){
      case 1:
        msg += `${args[0]} argument`;
        break;
      case 2:
        msg += `${args[0]} and ${args[1]} arguments`;
        break;
      default:
        msg += args.slice(0, len - 1).join(", ");
        msg += `, and ${args[len - 1]} arguments`;
        break;
    }
    super("ERR_MISSING_ARGS", `${msg} must be specified`);
  }
}
export class ERR_MISSING_OPTION extends NodeTypeError {
  constructor(x){
    super("ERR_MISSING_OPTION", `${x} is required`);
  }
}
export class ERR_MULTIPLE_CALLBACK extends NodeError {
  constructor(){
    super("ERR_MULTIPLE_CALLBACK", `Callback called multiple times`);
  }
}
export class ERR_NAPI_CONS_FUNCTION extends NodeTypeError {
  constructor(){
    super("ERR_NAPI_CONS_FUNCTION", `Constructor must be a function`);
  }
}
export class ERR_NAPI_INVALID_DATAVIEW_ARGS extends NodeRangeError {
  constructor(){
    super("ERR_NAPI_INVALID_DATAVIEW_ARGS", `byte_offset + byte_length should be less than or equal to the size in bytes of the array passed in`);
  }
}
export class ERR_NAPI_INVALID_TYPEDARRAY_ALIGNMENT extends NodeRangeError {
  constructor(x, y){
    super("ERR_NAPI_INVALID_TYPEDARRAY_ALIGNMENT", `start offset of ${x} should be a multiple of ${y}`);
  }
}
export class ERR_NAPI_INVALID_TYPEDARRAY_LENGTH extends NodeRangeError {
  constructor(){
    super("ERR_NAPI_INVALID_TYPEDARRAY_LENGTH", `Invalid typed array length`);
  }
}
export class ERR_NO_CRYPTO extends NodeError {
  constructor(){
    super("ERR_NO_CRYPTO", `Node.js is not compiled with OpenSSL crypto support`);
  }
}
export class ERR_NO_ICU extends NodeTypeError {
  constructor(x){
    super("ERR_NO_ICU", `${x} is not supported on Node.js compiled without ICU`);
  }
}
export class ERR_QUICCLIENTSESSION_FAILED extends NodeError {
  constructor(x){
    super("ERR_QUICCLIENTSESSION_FAILED", `Failed to create a new QuicClientSession: ${x}`);
  }
}
export class ERR_QUICCLIENTSESSION_FAILED_SETSOCKET extends NodeError {
  constructor(){
    super("ERR_QUICCLIENTSESSION_FAILED_SETSOCKET", `Failed to set the QuicSocket`);
  }
}
export class ERR_QUICSESSION_DESTROYED extends NodeError {
  constructor(x){
    super("ERR_QUICSESSION_DESTROYED", `Cannot call ${x} after a QuicSession has been destroyed`);
  }
}
export class ERR_QUICSESSION_INVALID_DCID extends NodeError {
  constructor(x){
    super("ERR_QUICSESSION_INVALID_DCID", `Invalid DCID value: ${x}`);
  }
}
export class ERR_QUICSESSION_UPDATEKEY extends NodeError {
  constructor(){
    super("ERR_QUICSESSION_UPDATEKEY", `Unable to update QuicSession keys`);
  }
}
export class ERR_QUICSOCKET_DESTROYED extends NodeError {
  constructor(x){
    super("ERR_QUICSOCKET_DESTROYED", `Cannot call ${x} after a QuicSocket has been destroyed`);
  }
}
export class ERR_QUICSOCKET_INVALID_STATELESS_RESET_SECRET_LENGTH extends NodeError {
  constructor(){
    super("ERR_QUICSOCKET_INVALID_STATELESS_RESET_SECRET_LENGTH", `The stateResetToken must be exactly 16-bytes in length`);
  }
}
export class ERR_QUICSOCKET_LISTENING extends NodeError {
  constructor(){
    super("ERR_QUICSOCKET_LISTENING", `This QuicSocket is already listening`);
  }
}
export class ERR_QUICSOCKET_UNBOUND extends NodeError {
  constructor(x){
    super("ERR_QUICSOCKET_UNBOUND", `Cannot call ${x} before a QuicSocket has been bound`);
  }
}
export class ERR_QUICSTREAM_DESTROYED extends NodeError {
  constructor(x){
    super("ERR_QUICSTREAM_DESTROYED", `Cannot call ${x} after a QuicStream has been destroyed`);
  }
}
export class ERR_QUICSTREAM_INVALID_PUSH extends NodeError {
  constructor(){
    super("ERR_QUICSTREAM_INVALID_PUSH", `Push streams are only supported on client-initiated, bidirectional streams`);
  }
}
export class ERR_QUICSTREAM_OPEN_FAILED extends NodeError {
  constructor(){
    super("ERR_QUICSTREAM_OPEN_FAILED", `Opening a new QuicStream failed`);
  }
}
export class ERR_QUICSTREAM_UNSUPPORTED_PUSH extends NodeError {
  constructor(){
    super("ERR_QUICSTREAM_UNSUPPORTED_PUSH", `Push streams are not supported on this QuicSession`);
  }
}
export class ERR_QUIC_TLS13_REQUIRED extends NodeError {
  constructor(){
    super("ERR_QUIC_TLS13_REQUIRED", `QUIC requires TLS version 1.3`);
  }
}
export class ERR_SCRIPT_EXECUTION_INTERRUPTED extends NodeError {
  constructor(){
    super("ERR_SCRIPT_EXECUTION_INTERRUPTED", "Script execution was interrupted by `SIGINT`");
  }
}
export class ERR_SERVER_ALREADY_LISTEN extends NodeError {
  constructor(){
    super("ERR_SERVER_ALREADY_LISTEN", `Listen method has been called more than once without closing.`);
  }
}
export class ERR_SERVER_NOT_RUNNING extends NodeError {
  constructor(){
    super("ERR_SERVER_NOT_RUNNING", `Server is not running.`);
  }
}
export class ERR_SOCKET_ALREADY_BOUND extends NodeError {
  constructor(){
    super("ERR_SOCKET_ALREADY_BOUND", `Socket is already bound`);
  }
}
export class ERR_SOCKET_BAD_BUFFER_SIZE extends NodeTypeError {
  constructor(){
    super("ERR_SOCKET_BAD_BUFFER_SIZE", `Buffer size must be a positive integer`);
  }
}
export class ERR_SOCKET_BAD_PORT extends NodeRangeError {
  constructor(name, port, allowZero = true){
    assert(typeof allowZero === "boolean", "The 'allowZero' argument must be of type boolean.");
    const operator = allowZero ? ">=" : ">";
    super("ERR_SOCKET_BAD_PORT", `${name} should be ${operator} 0 and < 65536. Received ${port}.`);
  }
}
export class ERR_SOCKET_BAD_TYPE extends NodeTypeError {
  constructor(){
    super("ERR_SOCKET_BAD_TYPE", `Bad socket type specified. Valid types are: udp4, udp6`);
  }
}
export class ERR_SOCKET_CLOSED extends NodeError {
  constructor(){
    super("ERR_SOCKET_CLOSED", `Socket is closed`);
  }
}
export class ERR_SOCKET_DGRAM_IS_CONNECTED extends NodeError {
  constructor(){
    super("ERR_SOCKET_DGRAM_IS_CONNECTED", `Already connected`);
  }
}
export class ERR_SOCKET_DGRAM_NOT_CONNECTED extends NodeError {
  constructor(){
    super("ERR_SOCKET_DGRAM_NOT_CONNECTED", `Not connected`);
  }
}
export class ERR_SOCKET_DGRAM_NOT_RUNNING extends NodeError {
  constructor(){
    super("ERR_SOCKET_DGRAM_NOT_RUNNING", `Not running`);
  }
}
export class ERR_SRI_PARSE extends NodeSyntaxError {
  constructor(name, char, position){
    super("ERR_SRI_PARSE", `Subresource Integrity string ${name} had an unexpected ${char} at position ${position}`);
  }
}
export class ERR_STREAM_ALREADY_FINISHED extends NodeError {
  constructor(x){
    super("ERR_STREAM_ALREADY_FINISHED", `Cannot call ${x} after a stream was finished`);
  }
}
export class ERR_STREAM_CANNOT_PIPE extends NodeError {
  constructor(){
    super("ERR_STREAM_CANNOT_PIPE", `Cannot pipe, not readable`);
  }
}
export class ERR_STREAM_DESTROYED extends NodeError {
  constructor(x){
    super("ERR_STREAM_DESTROYED", `Cannot call ${x} after a stream was destroyed`);
  }
}
export class ERR_STREAM_NULL_VALUES extends NodeTypeError {
  constructor(){
    super("ERR_STREAM_NULL_VALUES", `May not write null values to stream`);
  }
}
export class ERR_STREAM_PREMATURE_CLOSE extends NodeError {
  constructor(){
    super("ERR_STREAM_PREMATURE_CLOSE", `Premature close`);
  }
}
export class ERR_STREAM_PUSH_AFTER_EOF extends NodeError {
  constructor(){
    super("ERR_STREAM_PUSH_AFTER_EOF", `stream.push() after EOF`);
  }
}
export class ERR_STREAM_UNSHIFT_AFTER_END_EVENT extends NodeError {
  constructor(){
    super("ERR_STREAM_UNSHIFT_AFTER_END_EVENT", `stream.unshift() after end event`);
  }
}
export class ERR_STREAM_WRAP extends NodeError {
  constructor(){
    super("ERR_STREAM_WRAP", `Stream has StringDecoder set or is in objectMode`);
  }
}
export class ERR_STREAM_WRITE_AFTER_END extends NodeError {
  constructor(){
    super("ERR_STREAM_WRITE_AFTER_END", `write after end`);
  }
}
export class ERR_SYNTHETIC extends NodeError {
  constructor(){
    super("ERR_SYNTHETIC", `JavaScript Callstack`);
  }
}
export class ERR_TLS_CERT_ALTNAME_INVALID extends NodeError {
  reason;
  host;
  cert;
  constructor(reason, host, cert){
    super("ERR_TLS_CERT_ALTNAME_INVALID", `Hostname/IP does not match certificate's altnames: ${reason}`);
    this.reason = reason;
    this.host = host;
    this.cert = cert;
  }
}
export class ERR_TLS_DH_PARAM_SIZE extends NodeError {
  constructor(x){
    super("ERR_TLS_DH_PARAM_SIZE", `DH parameter size ${x} is less than 2048`);
  }
}
export class ERR_TLS_HANDSHAKE_TIMEOUT extends NodeError {
  constructor(){
    super("ERR_TLS_HANDSHAKE_TIMEOUT", `TLS handshake timeout`);
  }
}
export class ERR_TLS_INVALID_CONTEXT extends NodeTypeError {
  constructor(x){
    super("ERR_TLS_INVALID_CONTEXT", `${x} must be a SecureContext`);
  }
}
export class ERR_TLS_INVALID_STATE extends NodeError {
  constructor(){
    super("ERR_TLS_INVALID_STATE", `TLS socket connection must be securely established`);
  }
}
export class ERR_TLS_INVALID_PROTOCOL_VERSION extends NodeTypeError {
  constructor(protocol, x){
    super("ERR_TLS_INVALID_PROTOCOL_VERSION", `${protocol} is not a valid ${x} TLS protocol version`);
  }
}
export class ERR_TLS_PROTOCOL_VERSION_CONFLICT extends NodeTypeError {
  constructor(prevProtocol, protocol){
    super("ERR_TLS_PROTOCOL_VERSION_CONFLICT", `TLS protocol version ${prevProtocol} conflicts with secureProtocol ${protocol}`);
  }
}
export class ERR_TLS_RENEGOTIATION_DISABLED extends NodeError {
  constructor(){
    super("ERR_TLS_RENEGOTIATION_DISABLED", `TLS session renegotiation disabled for this socket`);
  }
}
export class ERR_TLS_REQUIRED_SERVER_NAME extends NodeError {
  constructor(){
    super("ERR_TLS_REQUIRED_SERVER_NAME", `"servername" is required parameter for Server.addContext`);
  }
}
export class ERR_TLS_SESSION_ATTACK extends NodeError {
  constructor(){
    super("ERR_TLS_SESSION_ATTACK", `TLS session renegotiation attack detected`);
  }
}
export class ERR_TLS_SNI_FROM_SERVER extends NodeError {
  constructor(){
    super("ERR_TLS_SNI_FROM_SERVER", `Cannot issue SNI from a TLS server-side socket`);
  }
}
export class ERR_TRACE_EVENTS_CATEGORY_REQUIRED extends NodeTypeError {
  constructor(){
    super("ERR_TRACE_EVENTS_CATEGORY_REQUIRED", `At least one category is required`);
  }
}
export class ERR_TRACE_EVENTS_UNAVAILABLE extends NodeError {
  constructor(){
    super("ERR_TRACE_EVENTS_UNAVAILABLE", `Trace events are unavailable`);
  }
}
export class ERR_UNAVAILABLE_DURING_EXIT extends NodeError {
  constructor(){
    super("ERR_UNAVAILABLE_DURING_EXIT", `Cannot call function in process exit handler`);
  }
}
export class ERR_UNCAUGHT_EXCEPTION_CAPTURE_ALREADY_SET extends NodeError {
  constructor(){
    super("ERR_UNCAUGHT_EXCEPTION_CAPTURE_ALREADY_SET", "`process.setupUncaughtExceptionCapture()` was called while a capture callback was already active");
  }
}
export class ERR_UNESCAPED_CHARACTERS extends NodeTypeError {
  constructor(x){
    super("ERR_UNESCAPED_CHARACTERS", `${x} contains unescaped characters`);
  }
}
export class ERR_UNHANDLED_ERROR extends NodeError {
  constructor(x){
    super("ERR_UNHANDLED_ERROR", `Unhandled error. (${x})`);
  }
}
export class ERR_UNKNOWN_BUILTIN_MODULE extends NodeError {
  constructor(x){
    super("ERR_UNKNOWN_BUILTIN_MODULE", `No such built-in module: ${x}`);
  }
}
export class ERR_UNKNOWN_CREDENTIAL extends NodeError {
  constructor(x, y){
    super("ERR_UNKNOWN_CREDENTIAL", `${x} identifier does not exist: ${y}`);
  }
}
export class ERR_UNKNOWN_ENCODING extends NodeTypeError {
  constructor(x){
    super("ERR_UNKNOWN_ENCODING", `Unknown encoding: ${x}`);
  }
}
export class ERR_UNKNOWN_FILE_EXTENSION extends NodeTypeError {
  constructor(x, y){
    super("ERR_UNKNOWN_FILE_EXTENSION", `Unknown file extension "${x}" for ${y}`);
  }
}
export class ERR_UNKNOWN_MODULE_FORMAT extends NodeRangeError {
  constructor(x){
    super("ERR_UNKNOWN_MODULE_FORMAT", `Unknown module format: ${x}`);
  }
}
export class ERR_UNKNOWN_SIGNAL extends NodeTypeError {
  constructor(x){
    super("ERR_UNKNOWN_SIGNAL", `Unknown signal: ${x}`);
  }
}
export class ERR_UNSUPPORTED_DIR_IMPORT extends NodeError {
  constructor(x, y){
    super("ERR_UNSUPPORTED_DIR_IMPORT", `Directory import '${x}' is not supported resolving ES modules, imported from ${y}`);
  }
}
export class ERR_UNSUPPORTED_ESM_URL_SCHEME extends NodeError {
  constructor(){
    super("ERR_UNSUPPORTED_ESM_URL_SCHEME", `Only file and data URLs are supported by the default ESM loader`);
  }
}
export class ERR_V8BREAKITERATOR extends NodeError {
  constructor(){
    super("ERR_V8BREAKITERATOR", `Full ICU data not installed. See https://github.com/nodejs/node/wiki/Intl`);
  }
}
export class ERR_VALID_PERFORMANCE_ENTRY_TYPE extends NodeError {
  constructor(){
    super("ERR_VALID_PERFORMANCE_ENTRY_TYPE", `At least one valid performance entry type is required`);
  }
}
export class ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING extends NodeTypeError {
  constructor(){
    super("ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING", `A dynamic import callback was not specified.`);
  }
}
export class ERR_VM_MODULE_ALREADY_LINKED extends NodeError {
  constructor(){
    super("ERR_VM_MODULE_ALREADY_LINKED", `Module has already been linked`);
  }
}
export class ERR_VM_MODULE_CANNOT_CREATE_CACHED_DATA extends NodeError {
  constructor(){
    super("ERR_VM_MODULE_CANNOT_CREATE_CACHED_DATA", `Cached data cannot be created for a module which has been evaluated`);
  }
}
export class ERR_VM_MODULE_DIFFERENT_CONTEXT extends NodeError {
  constructor(){
    super("ERR_VM_MODULE_DIFFERENT_CONTEXT", `Linked modules must use the same context`);
  }
}
export class ERR_VM_MODULE_LINKING_ERRORED extends NodeError {
  constructor(){
    super("ERR_VM_MODULE_LINKING_ERRORED", `Linking has already failed for the provided module`);
  }
}
export class ERR_VM_MODULE_NOT_MODULE extends NodeError {
  constructor(){
    super("ERR_VM_MODULE_NOT_MODULE", `Provided module is not an instance of Module`);
  }
}
export class ERR_VM_MODULE_STATUS extends NodeError {
  constructor(x){
    super("ERR_VM_MODULE_STATUS", `Module status ${x}`);
  }
}
export class ERR_WASI_ALREADY_STARTED extends NodeError {
  constructor(){
    super("ERR_WASI_ALREADY_STARTED", `WASI instance has already started`);
  }
}
export class ERR_WORKER_INIT_FAILED extends NodeError {
  constructor(x){
    super("ERR_WORKER_INIT_FAILED", `Worker initialization failure: ${x}`);
  }
}
export class ERR_WORKER_NOT_RUNNING extends NodeError {
  constructor(){
    super("ERR_WORKER_NOT_RUNNING", `Worker instance not running`);
  }
}
export class ERR_WORKER_OUT_OF_MEMORY extends NodeError {
  constructor(x){
    super("ERR_WORKER_OUT_OF_MEMORY", `Worker terminated due to reaching memory limit: ${x}`);
  }
}
export class ERR_WORKER_UNSERIALIZABLE_ERROR extends NodeError {
  constructor(){
    super("ERR_WORKER_UNSERIALIZABLE_ERROR", `Serializing an uncaught exception failed`);
  }
}
export class ERR_WORKER_UNSUPPORTED_EXTENSION extends NodeTypeError {
  constructor(x){
    super("ERR_WORKER_UNSUPPORTED_EXTENSION", `The worker script extension must be ".js", ".mjs", or ".cjs". Received "${x}"`);
  }
}
export class ERR_WORKER_UNSUPPORTED_OPERATION extends NodeTypeError {
  constructor(x){
    super("ERR_WORKER_UNSUPPORTED_OPERATION", `${x} is not supported in workers`);
  }
}
export class ERR_ZLIB_INITIALIZATION_FAILED extends NodeError {
  constructor(){
    super("ERR_ZLIB_INITIALIZATION_FAILED", `Initialization failed`);
  }
}
export class ERR_FALSY_VALUE_REJECTION extends NodeError {
  reason;
  constructor(reason){
    super("ERR_FALSY_VALUE_REJECTION", "Promise was rejected with falsy value");
    this.reason = reason;
  }
}
export class ERR_HTTP2_INVALID_SETTING_VALUE extends NodeRangeError {
  actual;
  min;
  max;
  constructor(name, actual, min, max){
    super("ERR_HTTP2_INVALID_SETTING_VALUE", `Invalid value for setting "${name}": ${actual}`);
    this.actual = actual;
    if (min !== undefined) {
      this.min = min;
      this.max = max;
    }
  }
}
export class ERR_HTTP2_STREAM_CANCEL extends NodeError {
  cause;
  constructor(error){
    super("ERR_HTTP2_STREAM_CANCEL", typeof error.message === "string" ? `The pending stream has been canceled (caused by: ${error.message})` : "The pending stream has been canceled");
    if (error) {
      this.cause = error;
    }
  }
}
export class ERR_INVALID_ADDRESS_FAMILY extends NodeRangeError {
  host;
  port;
  constructor(addressType, host, port){
    super("ERR_INVALID_ADDRESS_FAMILY", `Invalid address family: ${addressType} ${host}:${port}`);
    this.host = host;
    this.port = port;
  }
}
export class ERR_INVALID_CHAR extends NodeTypeError {
  constructor(name, field){
    super("ERR_INVALID_CHAR", field ? `Invalid character in ${name}` : `Invalid character in ${name} ["${field}"]`);
  }
}
export class ERR_INVALID_OPT_VALUE extends NodeTypeError {
  constructor(name, value){
    super("ERR_INVALID_OPT_VALUE", `The value "${value}" is invalid for option "${name}"`);
  }
}
export class ERR_INVALID_RETURN_PROPERTY extends NodeTypeError {
  constructor(input, name, prop, value){
    super("ERR_INVALID_RETURN_PROPERTY", `Expected a valid ${input} to be returned for the "${prop}" from the "${name}" function but got ${value}.`);
  }
}
// deno-lint-ignore no-explicit-any
function buildReturnPropertyType(value) {
  if (value && value.constructor && value.constructor.name) {
    return `instance of ${value.constructor.name}`;
  } else {
    return `type ${typeof value}`;
  }
}
export class ERR_INVALID_RETURN_PROPERTY_VALUE extends NodeTypeError {
  constructor(input, name, prop, value){
    super("ERR_INVALID_RETURN_PROPERTY_VALUE", `Expected ${input} to be returned for the "${prop}" from the "${name}" function but got ${buildReturnPropertyType(value)}.`);
  }
}
export class ERR_INVALID_RETURN_VALUE extends NodeTypeError {
  constructor(input, name, value){
    super("ERR_INVALID_RETURN_VALUE", `Expected ${input} to be returned from the "${name}" function but got ${buildReturnPropertyType(value)}.`);
  }
}
export class ERR_INVALID_URL extends NodeTypeError {
  input;
  constructor(input){
    super("ERR_INVALID_URL", `Invalid URL: ${input}`);
    this.input = input;
  }
}
export class ERR_INVALID_URL_SCHEME extends NodeTypeError {
  constructor(expected){
    expected = Array.isArray(expected) ? expected : [
      expected
    ];
    const res = expected.length === 2 ? `one of scheme ${expected[0]} or ${expected[1]}` : `of scheme ${expected[0]}`;
    super("ERR_INVALID_URL_SCHEME", `The URL must be ${res}`);
  }
}
export class ERR_MODULE_NOT_FOUND extends NodeError {
  constructor(path, base, type = "package"){
    super("ERR_MODULE_NOT_FOUND", `Cannot find ${type} '${path}' imported from ${base}`);
  }
}
export class ERR_INVALID_PACKAGE_CONFIG extends NodeError {
  constructor(path, base, message){
    const msg = `Invalid package config ${path}${base ? ` while importing ${base}` : ""}${message ? `. ${message}` : ""}`;
    super("ERR_INVALID_PACKAGE_CONFIG", msg);
  }
}
export class ERR_INVALID_MODULE_SPECIFIER extends NodeTypeError {
  constructor(request, reason, base){
    super("ERR_INVALID_MODULE_SPECIFIER", `Invalid module "${request}" ${reason}${base ? ` imported from ${base}` : ""}`);
  }
}
export class ERR_INVALID_PACKAGE_TARGET extends NodeError {
  constructor(pkgPath, key, // deno-lint-ignore no-explicit-any
  target, isImport, base){
    let msg;
    const relError = typeof target === "string" && !isImport && target.length && !target.startsWith("./");
    if (key === ".") {
      assert(isImport === false);
      msg = `Invalid "exports" main target ${JSON.stringify(target)} defined ` + `in the package config ${pkgPath}package.json${base ? ` imported from ${base}` : ""}${relError ? '; targets must start with "./"' : ""}`;
    } else {
      msg = `Invalid "${isImport ? "imports" : "exports"}" target ${JSON.stringify(target)} defined for '${key}' in the package config ${pkgPath}package.json${base ? ` imported from ${base}` : ""}${relError ? '; targets must start with "./"' : ""}`;
    }
    super("ERR_INVALID_PACKAGE_TARGET", msg);
  }
}
export class ERR_PACKAGE_IMPORT_NOT_DEFINED extends NodeTypeError {
  constructor(specifier, packagePath, base){
    const msg = `Package import specifier "${specifier}" is not defined${packagePath ? ` in package ${packagePath}package.json` : ""} imported from ${base}`;
    super("ERR_PACKAGE_IMPORT_NOT_DEFINED", msg);
  }
}
export class ERR_PACKAGE_PATH_NOT_EXPORTED extends NodeError {
  constructor(subpath, pkgPath, basePath){
    let msg;
    if (subpath === ".") {
      msg = `No "exports" main defined in ${pkgPath}package.json${basePath ? ` imported from ${basePath}` : ""}`;
    } else {
      msg = `Package subpath '${subpath}' is not defined by "exports" in ${pkgPath}package.json${basePath ? ` imported from ${basePath}` : ""}`;
    }
    super("ERR_PACKAGE_PATH_NOT_EXPORTED", msg);
  }
}
export class ERR_INTERNAL_ASSERTION extends NodeError {
  constructor(message){
    const suffix = "This is caused by either a bug in Node.js " + "or incorrect usage of Node.js internals.\n" + "Please open an issue with this stack trace at " + "https://github.com/nodejs/node/issues\n";
    super("ERR_INTERNAL_ASSERTION", message === undefined ? suffix : `${message}\n${suffix}`);
  }
}
// Using `fs.rmdir` on a path that is a file results in an ENOENT error on Windows and an ENOTDIR error on POSIX.
export class ERR_FS_RMDIR_ENOTDIR extends NodeSystemError {
  constructor(path){
    const code = isWindows ? "ENOENT" : "ENOTDIR";
    const ctx = {
      message: "not a directory",
      path,
      syscall: "rmdir",
      code,
      errno: isWindows ? ENOENT : ENOTDIR
    };
    super(code, ctx, "Path is not a directory");
  }
}
export function denoErrorToNodeError(e, ctx) {
  const errno = extractOsErrorNumberFromErrorMessage(e);
  if (typeof errno === "undefined") {
    return e;
  }
  const ex = uvException({
    errno: mapSysErrnoToUvErrno(errno),
    ...ctx
  });
  return ex;
}
function extractOsErrorNumberFromErrorMessage(e) {
  const match = e instanceof Error ? e.message.match(/\(os error (\d+)\)/) : false;
  if (match) {
    return +match[1];
  }
  return undefined;
}
export function connResetException(msg) {
  const ex = new Error(msg);
  // deno-lint-ignore no-explicit-any
  ex.code = "ECONNRESET";
  return ex;
}
export function aggregateTwoErrors(innerError, outerError) {
  if (innerError && outerError && innerError !== outerError) {
    if (Array.isArray(outerError.errors)) {
      // If `outerError` is already an `AggregateError`.
      outerError.errors.push(innerError);
      return outerError;
    }
    // eslint-disable-next-line no-restricted-syntax
    const err = new AggregateError([
      outerError,
      innerError
    ], outerError.message);
    // deno-lint-ignore no-explicit-any
    err.code = outerError.code;
    return err;
  }
  return innerError || outerError;
}
codes.ERR_IPC_CHANNEL_CLOSED = ERR_IPC_CHANNEL_CLOSED;
codes.ERR_INVALID_ARG_TYPE = ERR_INVALID_ARG_TYPE;
codes.ERR_INVALID_ARG_VALUE = ERR_INVALID_ARG_VALUE;
codes.ERR_INVALID_CALLBACK = ERR_INVALID_CALLBACK;
codes.ERR_OUT_OF_RANGE = ERR_OUT_OF_RANGE;
codes.ERR_SOCKET_BAD_PORT = ERR_SOCKET_BAD_PORT;
codes.ERR_BUFFER_OUT_OF_BOUNDS = ERR_BUFFER_OUT_OF_BOUNDS;
codes.ERR_UNKNOWN_ENCODING = ERR_UNKNOWN_ENCODING;
// TODO(kt3k): assign all error classes here.
export { codes, hideStackFrames };
export default {
  AbortError,
  aggregateTwoErrors,
  codes
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL25vZGUvaW50ZXJuYWwvZXJyb3JzLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjIgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG4vLyBDb3B5cmlnaHQgTm9kZS5qcyBjb250cmlidXRvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBMaWNlbnNlLlxuLyoqICoqKioqKioqKiogTk9UIElNUExFTUVOVEVEXG4gKiBFUlJfTUFOSUZFU1RfQVNTRVJUX0lOVEVHUklUWVxuICogRVJSX1FVSUNTRVNTSU9OX1ZFUlNJT05fTkVHT1RJQVRJT05cbiAqIEVSUl9SRVFVSVJFX0VTTVxuICogRVJSX1RMU19DRVJUX0FMVE5BTUVfSU5WQUxJRFxuICogRVJSX1dPUktFUl9JTlZBTElEX0VYRUNfQVJHVlxuICogRVJSX1dPUktFUl9QQVRIXG4gKiBFUlJfUVVJQ19FUlJPUlxuICogRVJSX1NPQ0tFVF9CVUZGRVJfU0laRSAvL1N5c3RlbSBlcnJvciwgc2hvdWxkbid0IGV2ZXIgaGFwcGVuIGluc2lkZSBEZW5vXG4gKiBFUlJfU1lTVEVNX0VSUk9SIC8vU3lzdGVtIGVycm9yLCBzaG91bGRuJ3QgZXZlciBoYXBwZW4gaW5zaWRlIERlbm9cbiAqIEVSUl9UVFlfSU5JVF9GQUlMRUQgLy9TeXN0ZW0gZXJyb3IsIHNob3VsZG4ndCBldmVyIGhhcHBlbiBpbnNpZGUgRGVub1xuICogRVJSX0lOVkFMSURfUEFDS0FHRV9DT05GSUcgLy8gcGFja2FnZS5qc29uIHN0dWZmLCBwcm9iYWJseSB1c2VsZXNzXG4gKiAqKioqKioqKioqKiAqL1xuXG5pbXBvcnQgeyBnZXRTeXN0ZW1FcnJvck5hbWUgfSBmcm9tIFwiLi4vdXRpbC50c1wiO1xuaW1wb3J0IHsgaW5zcGVjdCB9IGZyb20gXCIuLi9pbnRlcm5hbC91dGlsL2luc3BlY3QubWpzXCI7XG5pbXBvcnQgeyBjb2RlcyB9IGZyb20gXCIuL2Vycm9yX2NvZGVzLnRzXCI7XG5pbXBvcnQge1xuICBjb2RlTWFwLFxuICBlcnJvck1hcCxcbiAgbWFwU3lzRXJybm9Ub1V2RXJybm8sXG59IGZyb20gXCIuLi9pbnRlcm5hbF9iaW5kaW5nL3V2LnRzXCI7XG5pbXBvcnQgeyBhc3NlcnQgfSBmcm9tIFwiLi4vLi4vX3V0aWwvYXNzZXJ0LnRzXCI7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tIFwiLi4vLi4vX3V0aWwvb3MudHNcIjtcbmltcG9ydCB7IG9zIGFzIG9zQ29uc3RhbnRzIH0gZnJvbSBcIi4uL2ludGVybmFsX2JpbmRpbmcvY29uc3RhbnRzLnRzXCI7XG5jb25zdCB7XG4gIGVycm5vOiB7IEVOT1RESVIsIEVOT0VOVCB9LFxufSA9IG9zQ29uc3RhbnRzO1xuaW1wb3J0IHsgaGlkZVN0YWNrRnJhbWVzIH0gZnJvbSBcIi4vaGlkZV9zdGFja19mcmFtZXMudHNcIjtcblxuZXhwb3J0IHsgZXJyb3JNYXAgfTtcblxuY29uc3Qga0lzTm9kZUVycm9yID0gU3ltYm9sKFwia0lzTm9kZUVycm9yXCIpO1xuXG4vKipcbiAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2Jsb2IvZjNlYjIyNC9saWIvaW50ZXJuYWwvZXJyb3JzLmpzXG4gKi9cbmNvbnN0IGNsYXNzUmVnRXhwID0gL14oW0EtWl1bYS16MC05XSopKyQvO1xuXG4vKipcbiAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2Jsb2IvZjNlYjIyNC9saWIvaW50ZXJuYWwvZXJyb3JzLmpzXG4gKiBAZGVzY3JpcHRpb24gU29ydGVkIGJ5IGEgcm91Z2ggZXN0aW1hdGUgb24gbW9zdCBmcmVxdWVudGx5IHVzZWQgZW50cmllcy5cbiAqL1xuY29uc3Qga1R5cGVzID0gW1xuICBcInN0cmluZ1wiLFxuICBcImZ1bmN0aW9uXCIsXG4gIFwibnVtYmVyXCIsXG4gIFwib2JqZWN0XCIsXG4gIC8vIEFjY2VwdCAnRnVuY3Rpb24nIGFuZCAnT2JqZWN0JyBhcyBhbHRlcm5hdGl2ZSB0byB0aGUgbG93ZXIgY2FzZWQgdmVyc2lvbi5cbiAgXCJGdW5jdGlvblwiLFxuICBcIk9iamVjdFwiLFxuICBcImJvb2xlYW5cIixcbiAgXCJiaWdpbnRcIixcbiAgXCJzeW1ib2xcIixcbl07XG5cbi8vIE5vZGUgdXNlcyBhbiBBYm9ydEVycm9yIHRoYXQgaXNuJ3QgZXhhY3RseSB0aGUgc2FtZSBhcyB0aGUgRE9NRXhjZXB0aW9uXG4vLyB0byBtYWtlIHVzYWdlIG9mIHRoZSBlcnJvciBpbiB1c2VybGFuZCBhbmQgcmVhZGFibGUtc3RyZWFtIGVhc2llci5cbi8vIEl0IGlzIGEgcmVndWxhciBlcnJvciB3aXRoIGAuY29kZWAgYW5kIGAubmFtZWAuXG5leHBvcnQgY2xhc3MgQWJvcnRFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgY29kZTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiVGhlIG9wZXJhdGlvbiB3YXMgYWJvcnRlZFwiKTtcbiAgICB0aGlzLmNvZGUgPSBcIkFCT1JUX0VSUlwiO1xuICAgIHRoaXMubmFtZSA9IFwiQWJvcnRFcnJvclwiO1xuICB9XG59XG5cbi8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG50eXBlIEdlbmVyaWNGdW5jdGlvbiA9ICguLi5hcmdzOiBhbnlbXSkgPT4gYW55O1xuXG5sZXQgbWF4U3RhY2tfRXJyb3JOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5sZXQgbWF4U3RhY2tfRXJyb3JNZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiBgZXJyLm5hbWVgIGFuZCBgZXJyLm1lc3NhZ2VgIGFyZSBlcXVhbCB0byBlbmdpbmUtc3BlY2lmaWNcbiAqIHZhbHVlcyBpbmRpY2F0aW5nIG1heCBjYWxsIHN0YWNrIHNpemUgaGFzIGJlZW4gZXhjZWVkZWQuXG4gKiBcIk1heGltdW0gY2FsbCBzdGFjayBzaXplIGV4Y2VlZGVkXCIgaW4gVjguXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1N0YWNrT3ZlcmZsb3dFcnJvcihlcnI6IEVycm9yKTogYm9vbGVhbiB7XG4gIGlmIChtYXhTdGFja19FcnJvck1lc3NhZ2UgPT09IHVuZGVmaW5lZCkge1xuICAgIHRyeSB7XG4gICAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWlubmVyLWRlY2xhcmF0aW9uc1xuICAgICAgZnVuY3Rpb24gb3ZlcmZsb3dTdGFjaygpIHtcbiAgICAgICAgb3ZlcmZsb3dTdGFjaygpO1xuICAgICAgfVxuICAgICAgb3ZlcmZsb3dTdGFjaygpO1xuICAgICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgbWF4U3RhY2tfRXJyb3JNZXNzYWdlID0gZXJyLm1lc3NhZ2U7XG4gICAgICBtYXhTdGFja19FcnJvck5hbWUgPSBlcnIubmFtZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZXJyICYmIGVyci5uYW1lID09PSBtYXhTdGFja19FcnJvck5hbWUgJiZcbiAgICBlcnIubWVzc2FnZSA9PT0gbWF4U3RhY2tfRXJyb3JNZXNzYWdlO1xufVxuXG5mdW5jdGlvbiBhZGROdW1lcmljYWxTZXBhcmF0b3IodmFsOiBzdHJpbmcpIHtcbiAgbGV0IHJlcyA9IFwiXCI7XG4gIGxldCBpID0gdmFsLmxlbmd0aDtcbiAgY29uc3Qgc3RhcnQgPSB2YWxbMF0gPT09IFwiLVwiID8gMSA6IDA7XG4gIGZvciAoOyBpID49IHN0YXJ0ICsgNDsgaSAtPSAzKSB7XG4gICAgcmVzID0gYF8ke3ZhbC5zbGljZShpIC0gMywgaSl9JHtyZXN9YDtcbiAgfVxuICByZXR1cm4gYCR7dmFsLnNsaWNlKDAsIGkpfSR7cmVzfWA7XG59XG5cbmNvbnN0IGNhcHR1cmVMYXJnZXJTdGFja1RyYWNlID0gaGlkZVN0YWNrRnJhbWVzKFxuICBmdW5jdGlvbiBjYXB0dXJlTGFyZ2VyU3RhY2tUcmFjZShlcnIpIHtcbiAgICAvLyBAdHMtaWdub3JlIHRoaXMgZnVuY3Rpb24gaXMgbm90IGF2YWlsYWJsZSBpbiBsaWIuZG9tLmQudHNcbiAgICBFcnJvci5jYXB0dXJlU3RhY2tUcmFjZShlcnIpO1xuXG4gICAgcmV0dXJuIGVycjtcbiAgfSxcbik7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXJybm9FeGNlcHRpb24gZXh0ZW5kcyBFcnJvciB7XG4gIGVycm5vPzogbnVtYmVyO1xuICBjb2RlPzogc3RyaW5nO1xuICBwYXRoPzogc3RyaW5nO1xuICBzeXNjYWxsPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFRoaXMgY3JlYXRlcyBhbiBlcnJvciBjb21wYXRpYmxlIHdpdGggZXJyb3JzIHByb2R1Y2VkIGluIHRoZSBDKytcbiAqIFRoaXMgZnVuY3Rpb24gc2hvdWxkIHJlcGxhY2UgdGhlIGRlcHJlY2F0ZWRcbiAqIGBleGNlcHRpb25XaXRoSG9zdFBvcnQoKWAgZnVuY3Rpb24uXG4gKlxuICogQHBhcmFtIGVyciBBIGxpYnV2IGVycm9yIG51bWJlclxuICogQHBhcmFtIHN5c2NhbGxcbiAqIEBwYXJhbSBhZGRyZXNzXG4gKiBAcGFyYW0gcG9ydFxuICogQHJldHVybiBUaGUgZXJyb3IuXG4gKi9cbmV4cG9ydCBjb25zdCB1dkV4Y2VwdGlvbldpdGhIb3N0UG9ydCA9IGhpZGVTdGFja0ZyYW1lcyhcbiAgZnVuY3Rpb24gdXZFeGNlcHRpb25XaXRoSG9zdFBvcnQoXG4gICAgZXJyOiBudW1iZXIsXG4gICAgc3lzY2FsbDogc3RyaW5nLFxuICAgIGFkZHJlc3M/OiBzdHJpbmcgfCBudWxsLFxuICAgIHBvcnQ/OiBudW1iZXIgfCBudWxsLFxuICApIHtcbiAgICBjb25zdCB7IDA6IGNvZGUsIDE6IHV2bXNnIH0gPSB1dkVycm1hcEdldChlcnIpIHx8IHV2VW5tYXBwZWRFcnJvcjtcbiAgICBjb25zdCBtZXNzYWdlID0gYCR7c3lzY2FsbH0gJHtjb2RlfTogJHt1dm1zZ31gO1xuICAgIGxldCBkZXRhaWxzID0gXCJcIjtcblxuICAgIGlmIChwb3J0ICYmIHBvcnQgPiAwKSB7XG4gICAgICBkZXRhaWxzID0gYCAke2FkZHJlc3N9OiR7cG9ydH1gO1xuICAgIH0gZWxzZSBpZiAoYWRkcmVzcykge1xuICAgICAgZGV0YWlscyA9IGAgJHthZGRyZXNzfWA7XG4gICAgfVxuXG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICBjb25zdCBleDogYW55ID0gbmV3IEVycm9yKGAke21lc3NhZ2V9JHtkZXRhaWxzfWApO1xuICAgIGV4LmNvZGUgPSBjb2RlO1xuICAgIGV4LmVycm5vID0gZXJyO1xuICAgIGV4LnN5c2NhbGwgPSBzeXNjYWxsO1xuICAgIGV4LmFkZHJlc3MgPSBhZGRyZXNzO1xuXG4gICAgaWYgKHBvcnQpIHtcbiAgICAgIGV4LnBvcnQgPSBwb3J0O1xuICAgIH1cblxuICAgIHJldHVybiBjYXB0dXJlTGFyZ2VyU3RhY2tUcmFjZShleCk7XG4gIH0sXG4pO1xuXG4vKipcbiAqIFRoaXMgdXNlZCB0byBiZSBgdXRpbC5fZXJybm9FeGNlcHRpb24oKWAuXG4gKlxuICogQHBhcmFtIGVyciBBIGxpYnV2IGVycm9yIG51bWJlclxuICogQHBhcmFtIHN5c2NhbGxcbiAqIEBwYXJhbSBvcmlnaW5hbFxuICogQHJldHVybiBBIGBFcnJub0V4Y2VwdGlvbmBcbiAqL1xuZXhwb3J0IGNvbnN0IGVycm5vRXhjZXB0aW9uID0gaGlkZVN0YWNrRnJhbWVzKGZ1bmN0aW9uIGVycm5vRXhjZXB0aW9uKFxuICBlcnIsXG4gIHN5c2NhbGwsXG4gIG9yaWdpbmFsPyxcbik6IEVycm5vRXhjZXB0aW9uIHtcbiAgY29uc3QgY29kZSA9IGdldFN5c3RlbUVycm9yTmFtZShlcnIpO1xuICBjb25zdCBtZXNzYWdlID0gb3JpZ2luYWxcbiAgICA/IGAke3N5c2NhbGx9ICR7Y29kZX0gJHtvcmlnaW5hbH1gXG4gICAgOiBgJHtzeXNjYWxsfSAke2NvZGV9YDtcblxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBjb25zdCBleDogYW55ID0gbmV3IEVycm9yKG1lc3NhZ2UpO1xuICBleC5lcnJubyA9IGVycjtcbiAgZXguY29kZSA9IGNvZGU7XG4gIGV4LnN5c2NhbGwgPSBzeXNjYWxsO1xuXG4gIHJldHVybiBjYXB0dXJlTGFyZ2VyU3RhY2tUcmFjZShleCk7XG59KTtcblxuZnVuY3Rpb24gdXZFcnJtYXBHZXQobmFtZTogbnVtYmVyKSB7XG4gIHJldHVybiBlcnJvck1hcC5nZXQobmFtZSk7XG59XG5cbmNvbnN0IHV2VW5tYXBwZWRFcnJvciA9IFtcIlVOS05PV05cIiwgXCJ1bmtub3duIGVycm9yXCJdO1xuXG4vKipcbiAqIFRoaXMgY3JlYXRlcyBhbiBlcnJvciBjb21wYXRpYmxlIHdpdGggZXJyb3JzIHByb2R1Y2VkIGluIHRoZSBDKytcbiAqIGZ1bmN0aW9uIFVWRXhjZXB0aW9uIHVzaW5nIGEgY29udGV4dCBvYmplY3Qgd2l0aCBkYXRhIGFzc2VtYmxlZCBpbiBDKysuXG4gKiBUaGUgZ29hbCBpcyB0byBtaWdyYXRlIHRoZW0gdG8gRVJSXyogZXJyb3JzIGxhdGVyIHdoZW4gY29tcGF0aWJpbGl0eSBpc1xuICogbm90IGEgY29uY2Vybi5cbiAqXG4gKiBAcGFyYW0gY3R4XG4gKiBAcmV0dXJuIFRoZSBlcnJvci5cbiAqL1xuZXhwb3J0IGNvbnN0IHV2RXhjZXB0aW9uID0gaGlkZVN0YWNrRnJhbWVzKGZ1bmN0aW9uIHV2RXhjZXB0aW9uKGN0eCkge1xuICBjb25zdCB7IDA6IGNvZGUsIDE6IHV2bXNnIH0gPSB1dkVycm1hcEdldChjdHguZXJybm8pIHx8IHV2VW5tYXBwZWRFcnJvcjtcblxuICBsZXQgbWVzc2FnZSA9IGAke2NvZGV9OiAke2N0eC5tZXNzYWdlIHx8IHV2bXNnfSwgJHtjdHguc3lzY2FsbH1gO1xuXG4gIGxldCBwYXRoO1xuICBsZXQgZGVzdDtcblxuICBpZiAoY3R4LnBhdGgpIHtcbiAgICBwYXRoID0gY3R4LnBhdGgudG9TdHJpbmcoKTtcbiAgICBtZXNzYWdlICs9IGAgJyR7cGF0aH0nYDtcbiAgfVxuICBpZiAoY3R4LmRlc3QpIHtcbiAgICBkZXN0ID0gY3R4LmRlc3QudG9TdHJpbmcoKTtcbiAgICBtZXNzYWdlICs9IGAgLT4gJyR7ZGVzdH0nYDtcbiAgfVxuXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIGNvbnN0IGVycjogYW55ID0gbmV3IEVycm9yKG1lc3NhZ2UpO1xuXG4gIGZvciAoY29uc3QgcHJvcCBvZiBPYmplY3Qua2V5cyhjdHgpKSB7XG4gICAgaWYgKHByb3AgPT09IFwibWVzc2FnZVwiIHx8IHByb3AgPT09IFwicGF0aFwiIHx8IHByb3AgPT09IFwiZGVzdFwiKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBlcnJbcHJvcF0gPSBjdHhbcHJvcF07XG4gIH1cblxuICBlcnIuY29kZSA9IGNvZGU7XG5cbiAgaWYgKHBhdGgpIHtcbiAgICBlcnIucGF0aCA9IHBhdGg7XG4gIH1cblxuICBpZiAoZGVzdCkge1xuICAgIGVyci5kZXN0ID0gZGVzdDtcbiAgfVxuXG4gIHJldHVybiBjYXB0dXJlTGFyZ2VyU3RhY2tUcmFjZShlcnIpO1xufSk7XG5cbi8qKlxuICogRGVwcmVjYXRlZCwgbmV3IGZ1bmN0aW9uIGlzIGB1dkV4Y2VwdGlvbldpdGhIb3N0UG9ydCgpYFxuICogTmV3IGZ1bmN0aW9uIGFkZGVkIHRoZSBlcnJvciBkZXNjcmlwdGlvbiBkaXJlY3RseVxuICogZnJvbSBDKysuIHRoaXMgbWV0aG9kIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuICogQHBhcmFtIGVyciBBIGxpYnV2IGVycm9yIG51bWJlclxuICogQHBhcmFtIHN5c2NhbGxcbiAqIEBwYXJhbSBhZGRyZXNzXG4gKiBAcGFyYW0gcG9ydFxuICogQHBhcmFtIGFkZGl0aW9uYWxcbiAqL1xuZXhwb3J0IGNvbnN0IGV4Y2VwdGlvbldpdGhIb3N0UG9ydCA9IGhpZGVTdGFja0ZyYW1lcyhcbiAgZnVuY3Rpb24gZXhjZXB0aW9uV2l0aEhvc3RQb3J0KFxuICAgIGVycjogbnVtYmVyLFxuICAgIHN5c2NhbGw6IHN0cmluZyxcbiAgICBhZGRyZXNzOiBzdHJpbmcsXG4gICAgcG9ydDogbnVtYmVyLFxuICAgIGFkZGl0aW9uYWw/OiBzdHJpbmcsXG4gICkge1xuICAgIGNvbnN0IGNvZGUgPSBnZXRTeXN0ZW1FcnJvck5hbWUoZXJyKTtcbiAgICBsZXQgZGV0YWlscyA9IFwiXCI7XG5cbiAgICBpZiAocG9ydCAmJiBwb3J0ID4gMCkge1xuICAgICAgZGV0YWlscyA9IGAgJHthZGRyZXNzfToke3BvcnR9YDtcbiAgICB9IGVsc2UgaWYgKGFkZHJlc3MpIHtcbiAgICAgIGRldGFpbHMgPSBgICR7YWRkcmVzc31gO1xuICAgIH1cblxuICAgIGlmIChhZGRpdGlvbmFsKSB7XG4gICAgICBkZXRhaWxzICs9IGAgLSBMb2NhbCAoJHthZGRpdGlvbmFsfSlgO1xuICAgIH1cblxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgY29uc3QgZXg6IGFueSA9IG5ldyBFcnJvcihgJHtzeXNjYWxsfSAke2NvZGV9JHtkZXRhaWxzfWApO1xuICAgIGV4LmVycm5vID0gZXJyO1xuICAgIGV4LmNvZGUgPSBjb2RlO1xuICAgIGV4LnN5c2NhbGwgPSBzeXNjYWxsO1xuICAgIGV4LmFkZHJlc3MgPSBhZGRyZXNzO1xuXG4gICAgaWYgKHBvcnQpIHtcbiAgICAgIGV4LnBvcnQgPSBwb3J0O1xuICAgIH1cblxuICAgIHJldHVybiBjYXB0dXJlTGFyZ2VyU3RhY2tUcmFjZShleCk7XG4gIH0sXG4pO1xuXG4vKipcbiAqIEBwYXJhbSBjb2RlIEEgbGlidXYgZXJyb3IgbnVtYmVyIG9yIGEgYy1hcmVzIGVycm9yIGNvZGVcbiAqIEBwYXJhbSBzeXNjYWxsXG4gKiBAcGFyYW0gaG9zdG5hbWVcbiAqL1xuZXhwb3J0IGNvbnN0IGRuc0V4Y2VwdGlvbiA9IGhpZGVTdGFja0ZyYW1lcyhmdW5jdGlvbiAoY29kZSwgc3lzY2FsbCwgaG9zdG5hbWUpIHtcbiAgbGV0IGVycm5vO1xuXG4gIC8vIElmIGBjb2RlYCBpcyBvZiB0eXBlIG51bWJlciwgaXQgaXMgYSBsaWJ1diBlcnJvciBudW1iZXIsIGVsc2UgaXQgaXMgYVxuICAvLyBjLWFyZXMgZXJyb3IgY29kZS5cbiAgaWYgKHR5cGVvZiBjb2RlID09PSBcIm51bWJlclwiKSB7XG4gICAgZXJybm8gPSBjb2RlO1xuICAgIC8vIEVOT1RGT1VORCBpcyBub3QgYSBwcm9wZXIgUE9TSVggZXJyb3IsIGJ1dCB0aGlzIGVycm9yIGhhcyBiZWVuIGluIHBsYWNlXG4gICAgLy8gbG9uZyBlbm91Z2ggdGhhdCBpdCdzIG5vdCBwcmFjdGljYWwgdG8gcmVtb3ZlIGl0LlxuICAgIGlmIChcbiAgICAgIGNvZGUgPT09IGNvZGVNYXAuZ2V0KFwiRUFJX05PREFUQVwiKSB8fFxuICAgICAgY29kZSA9PT0gY29kZU1hcC5nZXQoXCJFQUlfTk9OQU1FXCIpXG4gICAgKSB7XG4gICAgICBjb2RlID0gXCJFTk9URk9VTkRcIjsgLy8gRmFicmljYXRlZCBlcnJvciBuYW1lLlxuICAgIH0gZWxzZSB7XG4gICAgICBjb2RlID0gZ2V0U3lzdGVtRXJyb3JOYW1lKGNvZGUpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IG1lc3NhZ2UgPSBgJHtzeXNjYWxsfSAke2NvZGV9JHtob3N0bmFtZSA/IGAgJHtob3N0bmFtZX1gIDogXCJcIn1gO1xuXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIGNvbnN0IGV4OiBhbnkgPSBuZXcgRXJyb3IobWVzc2FnZSk7XG4gIGV4LmVycm5vID0gZXJybm87XG4gIGV4LmNvZGUgPSBjb2RlO1xuICBleC5zeXNjYWxsID0gc3lzY2FsbDtcblxuICBpZiAoaG9zdG5hbWUpIHtcbiAgICBleC5ob3N0bmFtZSA9IGhvc3RuYW1lO1xuICB9XG5cbiAgcmV0dXJuIGNhcHR1cmVMYXJnZXJTdGFja1RyYWNlKGV4KTtcbn0pO1xuXG4vKipcbiAqIEFsbCBlcnJvciBpbnN0YW5jZXMgaW4gTm9kZSBoYXZlIGFkZGl0aW9uYWwgbWV0aG9kcyBhbmQgcHJvcGVydGllc1xuICogVGhpcyBleHBvcnQgY2xhc3MgaXMgbWVhbnQgdG8gYmUgZXh0ZW5kZWQgYnkgdGhlc2UgaW5zdGFuY2VzIGFic3RyYWN0aW5nIG5hdGl2ZSBKUyBlcnJvciBpbnN0YW5jZXNcbiAqL1xuZXhwb3J0IGNsYXNzIE5vZGVFcnJvckFic3RyYWN0aW9uIGV4dGVuZHMgRXJyb3Ige1xuICBjb2RlOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3IobmFtZTogc3RyaW5nLCBjb2RlOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZykge1xuICAgIHN1cGVyKG1lc3NhZ2UpO1xuICAgIHRoaXMuY29kZSA9IGNvZGU7XG4gICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICAvL1RoaXMgbnVtYmVyIGNoYW5nZXMgZGVwZW5kaW5nIG9uIHRoZSBuYW1lIG9mIHRoaXMgY2xhc3NcbiAgICAvLzIwIGNoYXJhY3RlcnMgYXMgb2Ygbm93XG4gICAgdGhpcy5zdGFjayA9IHRoaXMuc3RhY2sgJiYgYCR7bmFtZX0gWyR7dGhpcy5jb2RlfV0ke3RoaXMuc3RhY2suc2xpY2UoMjApfWA7XG4gIH1cblxuICBvdmVycmlkZSB0b1N0cmluZygpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5uYW1lfSBbJHt0aGlzLmNvZGV9XTogJHt0aGlzLm1lc3NhZ2V9YDtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgTm9kZUVycm9yIGV4dGVuZHMgTm9kZUVycm9yQWJzdHJhY3Rpb24ge1xuICBjb25zdHJ1Y3Rvcihjb2RlOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZykge1xuICAgIHN1cGVyKEVycm9yLnByb3RvdHlwZS5uYW1lLCBjb2RlLCBtZXNzYWdlKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgTm9kZVN5bnRheEVycm9yIGV4dGVuZHMgTm9kZUVycm9yQWJzdHJhY3Rpb25cbiAgaW1wbGVtZW50cyBTeW50YXhFcnJvciB7XG4gIGNvbnN0cnVjdG9yKGNvZGU6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nKSB7XG4gICAgc3VwZXIoU3ludGF4RXJyb3IucHJvdG90eXBlLm5hbWUsIGNvZGUsIG1lc3NhZ2UpO1xuICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZih0aGlzLCBTeW50YXhFcnJvci5wcm90b3R5cGUpO1xuICAgIHRoaXMudG9TdHJpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gYCR7dGhpcy5uYW1lfSBbJHt0aGlzLmNvZGV9XTogJHt0aGlzLm1lc3NhZ2V9YDtcbiAgICB9O1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBOb2RlUmFuZ2VFcnJvciBleHRlbmRzIE5vZGVFcnJvckFic3RyYWN0aW9uIHtcbiAgY29uc3RydWN0b3IoY29kZTogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcpIHtcbiAgICBzdXBlcihSYW5nZUVycm9yLnByb3RvdHlwZS5uYW1lLCBjb2RlLCBtZXNzYWdlKTtcbiAgICBPYmplY3Quc2V0UHJvdG90eXBlT2YodGhpcywgUmFuZ2VFcnJvci5wcm90b3R5cGUpO1xuICAgIHRoaXMudG9TdHJpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gYCR7dGhpcy5uYW1lfSBbJHt0aGlzLmNvZGV9XTogJHt0aGlzLm1lc3NhZ2V9YDtcbiAgICB9O1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBOb2RlVHlwZUVycm9yIGV4dGVuZHMgTm9kZUVycm9yQWJzdHJhY3Rpb24gaW1wbGVtZW50cyBUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcihjb2RlOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZykge1xuICAgIHN1cGVyKFR5cGVFcnJvci5wcm90b3R5cGUubmFtZSwgY29kZSwgbWVzc2FnZSk7XG4gICAgT2JqZWN0LnNldFByb3RvdHlwZU9mKHRoaXMsIFR5cGVFcnJvci5wcm90b3R5cGUpO1xuICAgIHRoaXMudG9TdHJpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gYCR7dGhpcy5uYW1lfSBbJHt0aGlzLmNvZGV9XTogJHt0aGlzLm1lc3NhZ2V9YDtcbiAgICB9O1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBOb2RlVVJJRXJyb3IgZXh0ZW5kcyBOb2RlRXJyb3JBYnN0cmFjdGlvbiBpbXBsZW1lbnRzIFVSSUVycm9yIHtcbiAgY29uc3RydWN0b3IoY29kZTogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcpIHtcbiAgICBzdXBlcihVUklFcnJvci5wcm90b3R5cGUubmFtZSwgY29kZSwgbWVzc2FnZSk7XG4gICAgT2JqZWN0LnNldFByb3RvdHlwZU9mKHRoaXMsIFVSSUVycm9yLnByb3RvdHlwZSk7XG4gICAgdGhpcy50b1N0cmluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBgJHt0aGlzLm5hbWV9IFske3RoaXMuY29kZX1dOiAke3RoaXMubWVzc2FnZX1gO1xuICAgIH07XG4gIH1cbn1cblxuaW50ZXJmYWNlIE5vZGVTeXN0ZW1FcnJvckN0eCB7XG4gIGNvZGU6IHN0cmluZztcbiAgc3lzY2FsbDogc3RyaW5nO1xuICBtZXNzYWdlOiBzdHJpbmc7XG4gIGVycm5vOiBudW1iZXI7XG4gIHBhdGg/OiBzdHJpbmc7XG4gIGRlc3Q/OiBzdHJpbmc7XG59XG4vLyBBIHNwZWNpYWxpemVkIEVycm9yIHRoYXQgaW5jbHVkZXMgYW4gYWRkaXRpb25hbCBpbmZvIHByb3BlcnR5IHdpdGhcbi8vIGFkZGl0aW9uYWwgaW5mb3JtYXRpb24gYWJvdXQgdGhlIGVycm9yIGNvbmRpdGlvbi5cbi8vIEl0IGhhcyB0aGUgcHJvcGVydGllcyBwcmVzZW50IGluIGEgVVZFeGNlcHRpb24gYnV0IHdpdGggYSBjdXN0b20gZXJyb3Jcbi8vIG1lc3NhZ2UgZm9sbG93ZWQgYnkgdGhlIHV2IGVycm9yIGNvZGUgYW5kIHV2IGVycm9yIG1lc3NhZ2UuXG4vLyBJdCBhbHNvIGhhcyBpdHMgb3duIGVycm9yIGNvZGUgd2l0aCB0aGUgb3JpZ2luYWwgdXYgZXJyb3IgY29udGV4dCBwdXQgaW50b1xuLy8gYGVyci5pbmZvYC5cbi8vIFRoZSBjb250ZXh0IHBhc3NlZCBpbnRvIHRoaXMgZXJyb3IgbXVzdCBoYXZlIC5jb2RlLCAuc3lzY2FsbCBhbmQgLm1lc3NhZ2UsXG4vLyBhbmQgbWF5IGhhdmUgLnBhdGggYW5kIC5kZXN0LlxuY2xhc3MgTm9kZVN5c3RlbUVycm9yIGV4dGVuZHMgTm9kZUVycm9yQWJzdHJhY3Rpb24ge1xuICBjb25zdHJ1Y3RvcihrZXk6IHN0cmluZywgY29udGV4dDogTm9kZVN5c3RlbUVycm9yQ3R4LCBtc2dQcmVmaXg6IHN0cmluZykge1xuICAgIGxldCBtZXNzYWdlID0gYCR7bXNnUHJlZml4fTogJHtjb250ZXh0LnN5c2NhbGx9IHJldHVybmVkIGAgK1xuICAgICAgYCR7Y29udGV4dC5jb2RlfSAoJHtjb250ZXh0Lm1lc3NhZ2V9KWA7XG5cbiAgICBpZiAoY29udGV4dC5wYXRoICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIG1lc3NhZ2UgKz0gYCAke2NvbnRleHQucGF0aH1gO1xuICAgIH1cbiAgICBpZiAoY29udGV4dC5kZXN0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIG1lc3NhZ2UgKz0gYCA9PiAke2NvbnRleHQuZGVzdH1gO1xuICAgIH1cblxuICAgIHN1cGVyKFwiU3lzdGVtRXJyb3JcIiwga2V5LCBtZXNzYWdlKTtcblxuICAgIGNhcHR1cmVMYXJnZXJTdGFja1RyYWNlKHRoaXMpO1xuXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXModGhpcywge1xuICAgICAgW2tJc05vZGVFcnJvcl06IHtcbiAgICAgICAgdmFsdWU6IHRydWUsXG4gICAgICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgICAgICB3cml0YWJsZTogZmFsc2UsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBpbmZvOiB7XG4gICAgICAgIHZhbHVlOiBjb250ZXh0LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgICAgIHdyaXRhYmxlOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBlcnJubzoge1xuICAgICAgICBnZXQoKSB7XG4gICAgICAgICAgcmV0dXJuIGNvbnRleHQuZXJybm87XG4gICAgICAgIH0sXG4gICAgICAgIHNldDogKHZhbHVlKSA9PiB7XG4gICAgICAgICAgY29udGV4dC5lcnJubyA9IHZhbHVlO1xuICAgICAgICB9LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgICB9LFxuICAgICAgc3lzY2FsbDoge1xuICAgICAgICBnZXQoKSB7XG4gICAgICAgICAgcmV0dXJuIGNvbnRleHQuc3lzY2FsbDtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiAodmFsdWUpID0+IHtcbiAgICAgICAgICBjb250ZXh0LnN5c2NhbGwgPSB2YWx1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChjb250ZXh0LnBhdGggIT09IHVuZGVmaW5lZCkge1xuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIFwicGF0aFwiLCB7XG4gICAgICAgIGdldCgpIHtcbiAgICAgICAgICByZXR1cm4gY29udGV4dC5wYXRoO1xuICAgICAgICB9LFxuICAgICAgICBzZXQ6ICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIGNvbnRleHQucGF0aCA9IHZhbHVlO1xuICAgICAgICB9LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoY29udGV4dC5kZXN0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCBcImRlc3RcIiwge1xuICAgICAgICBnZXQoKSB7XG4gICAgICAgICAgcmV0dXJuIGNvbnRleHQuZGVzdDtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiAodmFsdWUpID0+IHtcbiAgICAgICAgICBjb250ZXh0LmRlc3QgPSB2YWx1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgb3ZlcnJpZGUgdG9TdHJpbmcoKSB7XG4gICAgcmV0dXJuIGAke3RoaXMubmFtZX0gWyR7dGhpcy5jb2RlfV06ICR7dGhpcy5tZXNzYWdlfWA7XG4gIH1cbn1cblxuZnVuY3Rpb24gbWFrZVN5c3RlbUVycm9yV2l0aENvZGUoa2V5OiBzdHJpbmcsIG1zZ1ByZml4OiBzdHJpbmcpIHtcbiAgcmV0dXJuIGNsYXNzIE5vZGVFcnJvciBleHRlbmRzIE5vZGVTeXN0ZW1FcnJvciB7XG4gICAgY29uc3RydWN0b3IoY3R4OiBOb2RlU3lzdGVtRXJyb3JDdHgpIHtcbiAgICAgIHN1cGVyKGtleSwgY3R4LCBtc2dQcmZpeCk7XG4gICAgfVxuICB9O1xufVxuXG5leHBvcnQgY29uc3QgRVJSX0ZTX0VJU0RJUiA9IG1ha2VTeXN0ZW1FcnJvcldpdGhDb2RlKFxuICBcIkVSUl9GU19FSVNESVJcIixcbiAgXCJQYXRoIGlzIGEgZGlyZWN0b3J5XCIsXG4pO1xuXG5mdW5jdGlvbiBjcmVhdGVJbnZhbGlkQXJnVHlwZShcbiAgbmFtZTogc3RyaW5nLFxuICBleHBlY3RlZDogc3RyaW5nIHwgc3RyaW5nW10sXG4pOiBzdHJpbmcge1xuICAvLyBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvYmxvYi9mM2ViMjI0L2xpYi9pbnRlcm5hbC9lcnJvcnMuanMjTDEwMzctTDEwODdcbiAgZXhwZWN0ZWQgPSBBcnJheS5pc0FycmF5KGV4cGVjdGVkKSA/IGV4cGVjdGVkIDogW2V4cGVjdGVkXTtcbiAgbGV0IG1zZyA9IFwiVGhlIFwiO1xuICBpZiAobmFtZS5lbmRzV2l0aChcIiBhcmd1bWVudFwiKSkge1xuICAgIC8vIEZvciBjYXNlcyBsaWtlICdmaXJzdCBhcmd1bWVudCdcbiAgICBtc2cgKz0gYCR7bmFtZX0gYDtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCB0eXBlID0gbmFtZS5pbmNsdWRlcyhcIi5cIikgPyBcInByb3BlcnR5XCIgOiBcImFyZ3VtZW50XCI7XG4gICAgbXNnICs9IGBcIiR7bmFtZX1cIiAke3R5cGV9IGA7XG4gIH1cbiAgbXNnICs9IFwibXVzdCBiZSBcIjtcblxuICBjb25zdCB0eXBlcyA9IFtdO1xuICBjb25zdCBpbnN0YW5jZXMgPSBbXTtcbiAgY29uc3Qgb3RoZXIgPSBbXTtcbiAgZm9yIChjb25zdCB2YWx1ZSBvZiBleHBlY3RlZCkge1xuICAgIGlmIChrVHlwZXMuaW5jbHVkZXModmFsdWUpKSB7XG4gICAgICB0eXBlcy5wdXNoKHZhbHVlLnRvTG9jYWxlTG93ZXJDYXNlKCkpO1xuICAgIH0gZWxzZSBpZiAoY2xhc3NSZWdFeHAudGVzdCh2YWx1ZSkpIHtcbiAgICAgIGluc3RhbmNlcy5wdXNoKHZhbHVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgb3RoZXIucHVzaCh2YWx1ZSk7XG4gICAgfVxuICB9XG5cbiAgLy8gU3BlY2lhbCBoYW5kbGUgYG9iamVjdGAgaW4gY2FzZSBvdGhlciBpbnN0YW5jZXMgYXJlIGFsbG93ZWQgdG8gb3V0bGluZVxuICAvLyB0aGUgZGlmZmVyZW5jZXMgYmV0d2VlbiBlYWNoIG90aGVyLlxuICBpZiAoaW5zdGFuY2VzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBwb3MgPSB0eXBlcy5pbmRleE9mKFwib2JqZWN0XCIpO1xuICAgIGlmIChwb3MgIT09IC0xKSB7XG4gICAgICB0eXBlcy5zcGxpY2UocG9zLCAxKTtcbiAgICAgIGluc3RhbmNlcy5wdXNoKFwiT2JqZWN0XCIpO1xuICAgIH1cbiAgfVxuXG4gIGlmICh0eXBlcy5sZW5ndGggPiAwKSB7XG4gICAgaWYgKHR5cGVzLmxlbmd0aCA+IDIpIHtcbiAgICAgIGNvbnN0IGxhc3QgPSB0eXBlcy5wb3AoKTtcbiAgICAgIG1zZyArPSBgb25lIG9mIHR5cGUgJHt0eXBlcy5qb2luKFwiLCBcIil9LCBvciAke2xhc3R9YDtcbiAgICB9IGVsc2UgaWYgKHR5cGVzLmxlbmd0aCA9PT0gMikge1xuICAgICAgbXNnICs9IGBvbmUgb2YgdHlwZSAke3R5cGVzWzBdfSBvciAke3R5cGVzWzFdfWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIG1zZyArPSBgb2YgdHlwZSAke3R5cGVzWzBdfWA7XG4gICAgfVxuICAgIGlmIChpbnN0YW5jZXMubGVuZ3RoID4gMCB8fCBvdGhlci5sZW5ndGggPiAwKSB7XG4gICAgICBtc2cgKz0gXCIgb3IgXCI7XG4gICAgfVxuICB9XG5cbiAgaWYgKGluc3RhbmNlcy5sZW5ndGggPiAwKSB7XG4gICAgaWYgKGluc3RhbmNlcy5sZW5ndGggPiAyKSB7XG4gICAgICBjb25zdCBsYXN0ID0gaW5zdGFuY2VzLnBvcCgpO1xuICAgICAgbXNnICs9IGBhbiBpbnN0YW5jZSBvZiAke2luc3RhbmNlcy5qb2luKFwiLCBcIil9LCBvciAke2xhc3R9YDtcbiAgICB9IGVsc2Uge1xuICAgICAgbXNnICs9IGBhbiBpbnN0YW5jZSBvZiAke2luc3RhbmNlc1swXX1gO1xuICAgICAgaWYgKGluc3RhbmNlcy5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgbXNnICs9IGAgb3IgJHtpbnN0YW5jZXNbMV19YDtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG90aGVyLmxlbmd0aCA+IDApIHtcbiAgICAgIG1zZyArPSBcIiBvciBcIjtcbiAgICB9XG4gIH1cblxuICBpZiAob3RoZXIubGVuZ3RoID4gMCkge1xuICAgIGlmIChvdGhlci5sZW5ndGggPiAyKSB7XG4gICAgICBjb25zdCBsYXN0ID0gb3RoZXIucG9wKCk7XG4gICAgICBtc2cgKz0gYG9uZSBvZiAke290aGVyLmpvaW4oXCIsIFwiKX0sIG9yICR7bGFzdH1gO1xuICAgIH0gZWxzZSBpZiAob3RoZXIubGVuZ3RoID09PSAyKSB7XG4gICAgICBtc2cgKz0gYG9uZSBvZiAke290aGVyWzBdfSBvciAke290aGVyWzFdfWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChvdGhlclswXS50b0xvd2VyQ2FzZSgpICE9PSBvdGhlclswXSkge1xuICAgICAgICBtc2cgKz0gXCJhbiBcIjtcbiAgICAgIH1cbiAgICAgIG1zZyArPSBgJHtvdGhlclswXX1gO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBtc2c7XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9BUkdfVFlQRV9SQU5HRSBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgY29uc3RydWN0b3IobmFtZTogc3RyaW5nLCBleHBlY3RlZDogc3RyaW5nIHwgc3RyaW5nW10sIGFjdHVhbDogdW5rbm93bikge1xuICAgIGNvbnN0IG1zZyA9IGNyZWF0ZUludmFsaWRBcmdUeXBlKG5hbWUsIGV4cGVjdGVkKTtcblxuICAgIHN1cGVyKFwiRVJSX0lOVkFMSURfQVJHX1RZUEVcIiwgYCR7bXNnfS4ke2ludmFsaWRBcmdUeXBlSGVscGVyKGFjdHVhbCl9YCk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX0FSR19UWVBFIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZyB8IHN0cmluZ1tdLCBhY3R1YWw6IHVua25vd24pIHtcbiAgICBjb25zdCBtc2cgPSBjcmVhdGVJbnZhbGlkQXJnVHlwZShuYW1lLCBleHBlY3RlZCk7XG5cbiAgICBzdXBlcihcIkVSUl9JTlZBTElEX0FSR19UWVBFXCIsIGAke21zZ30uJHtpbnZhbGlkQXJnVHlwZUhlbHBlcihhY3R1YWwpfWApO1xuICB9XG5cbiAgc3RhdGljIFJhbmdlRXJyb3IgPSBFUlJfSU5WQUxJRF9BUkdfVFlQRV9SQU5HRTtcbn1cblxuY2xhc3MgRVJSX0lOVkFMSURfQVJHX1ZBTFVFX1JBTkdFIGV4dGVuZHMgTm9kZVJhbmdlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihuYW1lOiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCByZWFzb246IHN0cmluZyA9IFwiaXMgaW52YWxpZFwiKSB7XG4gICAgY29uc3QgdHlwZSA9IG5hbWUuaW5jbHVkZXMoXCIuXCIpID8gXCJwcm9wZXJ0eVwiIDogXCJhcmd1bWVudFwiO1xuICAgIGNvbnN0IGluc3BlY3RlZCA9IGluc3BlY3QodmFsdWUpO1xuXG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9JTlZBTElEX0FSR19WQUxVRVwiLFxuICAgICAgYFRoZSAke3R5cGV9ICcke25hbWV9JyAke3JlYXNvbn0uIFJlY2VpdmVkICR7aW5zcGVjdGVkfWAsXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfQVJHX1ZBTFVFIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywgdmFsdWU6IHVua25vd24sIHJlYXNvbjogc3RyaW5nID0gXCJpcyBpbnZhbGlkXCIpIHtcbiAgICBjb25zdCB0eXBlID0gbmFtZS5pbmNsdWRlcyhcIi5cIikgPyBcInByb3BlcnR5XCIgOiBcImFyZ3VtZW50XCI7XG4gICAgY29uc3QgaW5zcGVjdGVkID0gaW5zcGVjdCh2YWx1ZSk7XG5cbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0lOVkFMSURfQVJHX1ZBTFVFXCIsXG4gICAgICBgVGhlICR7dHlwZX0gJyR7bmFtZX0nICR7cmVhc29ufS4gUmVjZWl2ZWQgJHtpbnNwZWN0ZWR9YCxcbiAgICApO1xuICB9XG5cbiAgc3RhdGljIFJhbmdlRXJyb3IgPSBFUlJfSU5WQUxJRF9BUkdfVkFMVUVfUkFOR0U7XG59XG5cbi8vIEEgaGVscGVyIGZ1bmN0aW9uIHRvIHNpbXBsaWZ5IGNoZWNraW5nIGZvciBFUlJfSU5WQUxJRF9BUkdfVFlQRSBvdXRwdXQuXG4vLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuZnVuY3Rpb24gaW52YWxpZEFyZ1R5cGVIZWxwZXIoaW5wdXQ6IGFueSkge1xuICBpZiAoaW5wdXQgPT0gbnVsbCkge1xuICAgIHJldHVybiBgIFJlY2VpdmVkICR7aW5wdXR9YDtcbiAgfVxuICBpZiAodHlwZW9mIGlucHV0ID09PSBcImZ1bmN0aW9uXCIgJiYgaW5wdXQubmFtZSkge1xuICAgIHJldHVybiBgIFJlY2VpdmVkIGZ1bmN0aW9uICR7aW5wdXQubmFtZX1gO1xuICB9XG4gIGlmICh0eXBlb2YgaW5wdXQgPT09IFwib2JqZWN0XCIpIHtcbiAgICBpZiAoaW5wdXQuY29uc3RydWN0b3IgJiYgaW5wdXQuY29uc3RydWN0b3IubmFtZSkge1xuICAgICAgcmV0dXJuIGAgUmVjZWl2ZWQgYW4gaW5zdGFuY2Ugb2YgJHtpbnB1dC5jb25zdHJ1Y3Rvci5uYW1lfWA7XG4gICAgfVxuICAgIHJldHVybiBgIFJlY2VpdmVkICR7aW5zcGVjdChpbnB1dCwgeyBkZXB0aDogLTEgfSl9YDtcbiAgfVxuICBsZXQgaW5zcGVjdGVkID0gaW5zcGVjdChpbnB1dCwgeyBjb2xvcnM6IGZhbHNlIH0pO1xuICBpZiAoaW5zcGVjdGVkLmxlbmd0aCA+IDI1KSB7XG4gICAgaW5zcGVjdGVkID0gYCR7aW5zcGVjdGVkLnNsaWNlKDAsIDI1KX0uLi5gO1xuICB9XG4gIHJldHVybiBgIFJlY2VpdmVkIHR5cGUgJHt0eXBlb2YgaW5wdXR9ICgke2luc3BlY3RlZH0pYDtcbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9PVVRfT0ZfUkFOR0UgZXh0ZW5kcyBSYW5nZUVycm9yIHtcbiAgY29kZSA9IFwiRVJSX09VVF9PRl9SQU5HRVwiO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHN0cjogc3RyaW5nLFxuICAgIHJhbmdlOiBzdHJpbmcsXG4gICAgaW5wdXQ6IHVua25vd24sXG4gICAgcmVwbGFjZURlZmF1bHRCb29sZWFuID0gZmFsc2UsXG4gICkge1xuICAgIGFzc2VydChyYW5nZSwgJ01pc3NpbmcgXCJyYW5nZVwiIGFyZ3VtZW50Jyk7XG4gICAgbGV0IG1zZyA9IHJlcGxhY2VEZWZhdWx0Qm9vbGVhblxuICAgICAgPyBzdHJcbiAgICAgIDogYFRoZSB2YWx1ZSBvZiBcIiR7c3RyfVwiIGlzIG91dCBvZiByYW5nZS5gO1xuICAgIGxldCByZWNlaXZlZDtcbiAgICBpZiAoTnVtYmVyLmlzSW50ZWdlcihpbnB1dCkgJiYgTWF0aC5hYnMoaW5wdXQgYXMgbnVtYmVyKSA+IDIgKiogMzIpIHtcbiAgICAgIHJlY2VpdmVkID0gYWRkTnVtZXJpY2FsU2VwYXJhdG9yKFN0cmluZyhpbnB1dCkpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGlucHV0ID09PSBcImJpZ2ludFwiKSB7XG4gICAgICByZWNlaXZlZCA9IFN0cmluZyhpbnB1dCk7XG4gICAgICBpZiAoaW5wdXQgPiAybiAqKiAzMm4gfHwgaW5wdXQgPCAtKDJuICoqIDMybikpIHtcbiAgICAgICAgcmVjZWl2ZWQgPSBhZGROdW1lcmljYWxTZXBhcmF0b3IocmVjZWl2ZWQpO1xuICAgICAgfVxuICAgICAgcmVjZWl2ZWQgKz0gXCJuXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlY2VpdmVkID0gaW5zcGVjdChpbnB1dCk7XG4gICAgfVxuICAgIG1zZyArPSBgIEl0IG11c3QgYmUgJHtyYW5nZX0uIFJlY2VpdmVkICR7cmVjZWl2ZWR9YDtcblxuICAgIHN1cGVyKG1zZyk7XG5cbiAgICBjb25zdCB7IG5hbWUgfSA9IHRoaXM7XG4gICAgLy8gQWRkIHRoZSBlcnJvciBjb2RlIHRvIHRoZSBuYW1lIHRvIGluY2x1ZGUgaXQgaW4gdGhlIHN0YWNrIHRyYWNlLlxuICAgIHRoaXMubmFtZSA9IGAke25hbWV9IFske3RoaXMuY29kZX1dYDtcbiAgICAvLyBBY2Nlc3MgdGhlIHN0YWNrIHRvIGdlbmVyYXRlIHRoZSBlcnJvciBtZXNzYWdlIGluY2x1ZGluZyB0aGUgZXJyb3IgY29kZSBmcm9tIHRoZSBuYW1lLlxuICAgIHRoaXMuc3RhY2s7XG4gICAgLy8gUmVzZXQgdGhlIG5hbWUgdG8gdGhlIGFjdHVhbCBuYW1lLlxuICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9BTUJJR1VPVVNfQVJHVU1FTlQgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nLCB5OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9BTUJJR1VPVVNfQVJHVU1FTlRcIiwgYFRoZSBcIiR7eH1cIiBhcmd1bWVudCBpcyBhbWJpZ3VvdXMuICR7eX1gKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0FSR19OT1RfSVRFUkFCTEUgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfQVJHX05PVF9JVEVSQUJMRVwiLCBgJHt4fSBtdXN0IGJlIGl0ZXJhYmxlYCk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9BU1NFUlRJT04gZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9BU1NFUlRJT05cIiwgYCR7eH1gKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0FTWU5DX0NBTExCQUNLIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0FTWU5DX0NBTExCQUNLXCIsIGAke3h9IG11c3QgYmUgYSBmdW5jdGlvbmApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQVNZTkNfVFlQRSBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9BU1lOQ19UWVBFXCIsIGBJbnZhbGlkIG5hbWUgZm9yIGFzeW5jIFwidHlwZVwiOiAke3h9YCk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9CUk9UTElfSU5WQUxJRF9QQVJBTSBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfQlJPVExJX0lOVkFMSURfUEFSQU1cIiwgYCR7eH0gaXMgbm90IGEgdmFsaWQgQnJvdGxpIHBhcmFtZXRlcmApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQlVGRkVSX09VVF9PRl9CT1VORFMgZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKG5hbWU/OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0JVRkZFUl9PVVRfT0ZfQk9VTkRTXCIsXG4gICAgICBuYW1lXG4gICAgICAgID8gYFwiJHtuYW1lfVwiIGlzIG91dHNpZGUgb2YgYnVmZmVyIGJvdW5kc2BcbiAgICAgICAgOiBcIkF0dGVtcHQgdG8gYWNjZXNzIG1lbW9yeSBvdXRzaWRlIGJ1ZmZlciBib3VuZHNcIixcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQlVGRkVSX1RPT19MQVJHRSBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9CVUZGRVJfVE9PX0xBUkdFXCIsXG4gICAgICBgQ2Fubm90IGNyZWF0ZSBhIEJ1ZmZlciBsYXJnZXIgdGhhbiAke3h9IGJ5dGVzYCxcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ0FOTk9UX1dBVENIX1NJR0lOVCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0NBTk5PVF9XQVRDSF9TSUdJTlRcIiwgXCJDYW5ub3Qgd2F0Y2ggZm9yIFNJR0lOVCBzaWduYWxzXCIpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ0hJTERfQ0xPU0VEX0JFRk9SRV9SRVBMWSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfQ0hJTERfQ0xPU0VEX0JFRk9SRV9SRVBMWVwiLFxuICAgICAgXCJDaGlsZCBjbG9zZWQgYmVmb3JlIHJlcGx5IHJlY2VpdmVkXCIsXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0NISUxEX1BST0NFU1NfSVBDX1JFUVVJUkVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9DSElMRF9QUk9DRVNTX0lQQ19SRVFVSVJFRFwiLFxuICAgICAgYEZvcmtlZCBwcm9jZXNzZXMgbXVzdCBoYXZlIGFuIElQQyBjaGFubmVsLCBtaXNzaW5nIHZhbHVlICdpcGMnIGluICR7eH1gLFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9DSElMRF9QUk9DRVNTX1NURElPX01BWEJVRkZFUiBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9DSElMRF9QUk9DRVNTX1NURElPX01BWEJVRkZFUlwiLFxuICAgICAgYCR7eH0gbWF4QnVmZmVyIGxlbmd0aCBleGNlZWRlZGAsXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0NPTlNPTEVfV1JJVEFCTEVfU1RSRUFNIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfQ09OU09MRV9XUklUQUJMRV9TVFJFQU1cIixcbiAgICAgIGBDb25zb2xlIGV4cGVjdHMgYSB3cml0YWJsZSBzdHJlYW0gaW5zdGFuY2UgZm9yICR7eH1gLFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9DT05URVhUX05PVF9JTklUSUFMSVpFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0NPTlRFWFRfTk9UX0lOSVRJQUxJWkVEXCIsIFwiY29udGV4dCB1c2VkIGlzIG5vdCBpbml0aWFsaXplZFwiKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0NQVV9VU0FHRSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0NQVV9VU0FHRVwiLCBgVW5hYmxlIHRvIG9idGFpbiBjcHUgdXNhZ2UgJHt4fWApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ1JZUFRPX0NVU1RPTV9FTkdJTkVfTk9UX1NVUFBPUlRFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfQ1JZUFRPX0NVU1RPTV9FTkdJTkVfTk9UX1NVUFBPUlRFRFwiLFxuICAgICAgXCJDdXN0b20gZW5naW5lcyBub3Qgc3VwcG9ydGVkIGJ5IHRoaXMgT3BlblNTTFwiLFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9DUllQVE9fRUNESF9JTlZBTElEX0ZPUk1BVCBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9DUllQVE9fRUNESF9JTlZBTElEX0ZPUk1BVFwiLCBgSW52YWxpZCBFQ0RIIGZvcm1hdDogJHt4fWApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ1JZUFRPX0VDREhfSU5WQUxJRF9QVUJMSUNfS0VZIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9DUllQVE9fRUNESF9JTlZBTElEX1BVQkxJQ19LRVlcIixcbiAgICAgIFwiUHVibGljIGtleSBpcyBub3QgdmFsaWQgZm9yIHNwZWNpZmllZCBjdXJ2ZVwiLFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9DUllQVE9fRU5HSU5FX1VOS05PV04gZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9DUllQVE9fRU5HSU5FX1VOS05PV05cIiwgYEVuZ2luZSBcIiR7eH1cIiB3YXMgbm90IGZvdW5kYCk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9DUllQVE9fRklQU19GT1JDRUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0NSWVBUT19GSVBTX0ZPUkNFRFwiLFxuICAgICAgXCJDYW5ub3Qgc2V0IEZJUFMgbW9kZSwgaXQgd2FzIGZvcmNlZCB3aXRoIC0tZm9yY2UtZmlwcyBhdCBzdGFydHVwLlwiLFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9DUllQVE9fRklQU19VTkFWQUlMQUJMRSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfQ1JZUFRPX0ZJUFNfVU5BVkFJTEFCTEVcIixcbiAgICAgIFwiQ2Fubm90IHNldCBGSVBTIG1vZGUgaW4gYSBub24tRklQUyBidWlsZC5cIixcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ1JZUFRPX0hBU0hfRklOQUxJWkVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfQ1JZUFRPX0hBU0hfRklOQUxJWkVEXCIsIFwiRGlnZXN0IGFscmVhZHkgY2FsbGVkXCIpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ1JZUFRPX0hBU0hfVVBEQVRFX0ZBSUxFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0NSWVBUT19IQVNIX1VQREFURV9GQUlMRURcIiwgXCJIYXNoIHVwZGF0ZSBmYWlsZWRcIik7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9DUllQVE9fSU5DT01QQVRJQkxFX0tFWSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZywgeTogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfQ1JZUFRPX0lOQ09NUEFUSUJMRV9LRVlcIiwgYEluY29tcGF0aWJsZSAke3h9OiAke3l9YCk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9DUllQVE9fSU5DT01QQVRJQkxFX0tFWV9PUFRJT05TIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nLCB5OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0NSWVBUT19JTkNPTVBBVElCTEVfS0VZX09QVElPTlNcIixcbiAgICAgIGBUaGUgc2VsZWN0ZWQga2V5IGVuY29kaW5nICR7eH0gJHt5fS5gLFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9DUllQVE9fSU5WQUxJRF9ESUdFU1QgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfQ1JZUFRPX0lOVkFMSURfRElHRVNUXCIsIGBJbnZhbGlkIGRpZ2VzdDogJHt4fWApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ1JZUFRPX0lOVkFMSURfS0VZX09CSkVDVF9UWVBFIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZywgeTogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9DUllQVE9fSU5WQUxJRF9LRVlfT0JKRUNUX1RZUEVcIixcbiAgICAgIGBJbnZhbGlkIGtleSBvYmplY3QgdHlwZSAke3h9LCBleHBlY3RlZCAke3l9LmAsXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0NSWVBUT19JTlZBTElEX1NUQVRFIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfQ1JZUFRPX0lOVkFMSURfU1RBVEVcIiwgYEludmFsaWQgc3RhdGUgZm9yIG9wZXJhdGlvbiAke3h9YCk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9DUllQVE9fUEJLREYyX0VSUk9SIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfQ1JZUFRPX1BCS0RGMl9FUlJPUlwiLCBcIlBCS0RGMiBlcnJvclwiKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0NSWVBUT19TQ1JZUFRfSU5WQUxJRF9QQVJBTUVURVIgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9DUllQVE9fU0NSWVBUX0lOVkFMSURfUEFSQU1FVEVSXCIsIFwiSW52YWxpZCBzY3J5cHQgcGFyYW1ldGVyXCIpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ1JZUFRPX1NDUllQVF9OT1RfU1VQUE9SVEVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfQ1JZUFRPX1NDUllQVF9OT1RfU1VQUE9SVEVEXCIsIFwiU2NyeXB0IGFsZ29yaXRobSBub3Qgc3VwcG9ydGVkXCIpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ1JZUFRPX1NJR05fS0VZX1JFUVVJUkVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfQ1JZUFRPX1NJR05fS0VZX1JFUVVJUkVEXCIsIFwiTm8ga2V5IHByb3ZpZGVkIHRvIHNpZ25cIik7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9ESVJfQ0xPU0VEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfRElSX0NMT1NFRFwiLCBcIkRpcmVjdG9yeSBoYW5kbGUgd2FzIGNsb3NlZFwiKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0RJUl9DT05DVVJSRU5UX09QRVJBVElPTiBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfRElSX0NPTkNVUlJFTlRfT1BFUkFUSU9OXCIsXG4gICAgICBcIkNhbm5vdCBkbyBzeW5jaHJvbm91cyB3b3JrIG9uIGRpcmVjdG9yeSBoYW5kbGUgd2l0aCBjb25jdXJyZW50IGFzeW5jaHJvbm91cyBvcGVyYXRpb25zXCIsXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0ROU19TRVRfU0VSVkVSU19GQUlMRUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcsIHk6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfRE5TX1NFVF9TRVJWRVJTX0ZBSUxFRFwiLFxuICAgICAgYGMtYXJlcyBmYWlsZWQgdG8gc2V0IHNlcnZlcnM6IFwiJHt4fVwiIFske3l9XWAsXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0RPTUFJTl9DQUxMQkFDS19OT1RfQVZBSUxBQkxFIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9ET01BSU5fQ0FMTEJBQ0tfTk9UX0FWQUlMQUJMRVwiLFxuICAgICAgXCJBIGNhbGxiYWNrIHdhcyByZWdpc3RlcmVkIHRocm91Z2ggXCIgK1xuICAgICAgICBcInByb2Nlc3Muc2V0VW5jYXVnaHRFeGNlcHRpb25DYXB0dXJlQ2FsbGJhY2soKSwgd2hpY2ggaXMgbXV0dWFsbHkgXCIgK1xuICAgICAgICBcImV4Y2x1c2l2ZSB3aXRoIHVzaW5nIHRoZSBgZG9tYWluYCBtb2R1bGVcIixcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfRE9NQUlOX0NBTk5PVF9TRVRfVU5DQVVHSFRfRVhDRVBUSU9OX0NBUFRVUkVcbiAgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0RPTUFJTl9DQU5OT1RfU0VUX1VOQ0FVR0hUX0VYQ0VQVElPTl9DQVBUVVJFXCIsXG4gICAgICBcIlRoZSBgZG9tYWluYCBtb2R1bGUgaXMgaW4gdXNlLCB3aGljaCBpcyBtdXR1YWxseSBleGNsdXNpdmUgd2l0aCBjYWxsaW5nIFwiICtcbiAgICAgICAgXCJwcm9jZXNzLnNldFVuY2F1Z2h0RXhjZXB0aW9uQ2FwdHVyZUNhbGxiYWNrKClcIixcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfRU5DT0RJTkdfSU5WQUxJRF9FTkNPREVEX0RBVEEgZXh0ZW5kcyBOb2RlRXJyb3JBYnN0cmFjdGlvblxuICBpbXBsZW1lbnRzIFR5cGVFcnJvciB7XG4gIGVycm5vOiBudW1iZXI7XG4gIGNvbnN0cnVjdG9yKGVuY29kaW5nOiBzdHJpbmcsIHJldDogbnVtYmVyKSB7XG4gICAgc3VwZXIoXG4gICAgICBUeXBlRXJyb3IucHJvdG90eXBlLm5hbWUsXG4gICAgICBcIkVSUl9FTkNPRElOR19JTlZBTElEX0VOQ09ERURfREFUQVwiLFxuICAgICAgYFRoZSBlbmNvZGVkIGRhdGEgd2FzIG5vdCB2YWxpZCBmb3IgZW5jb2RpbmcgJHtlbmNvZGluZ31gLFxuICAgICk7XG4gICAgT2JqZWN0LnNldFByb3RvdHlwZU9mKHRoaXMsIFR5cGVFcnJvci5wcm90b3R5cGUpO1xuXG4gICAgdGhpcy5lcnJubyA9IHJldDtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0VOQ09ESU5HX05PVF9TVVBQT1JURUQgZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0VOQ09ESU5HX05PVF9TVVBQT1JURURcIiwgYFRoZSBcIiR7eH1cIiBlbmNvZGluZyBpcyBub3Qgc3VwcG9ydGVkYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfRVZBTF9FU01fQ0FOTk9UX1BSSU5UIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfRVZBTF9FU01fQ0FOTk9UX1BSSU5UXCIsIGAtLXByaW50IGNhbm5vdCBiZSB1c2VkIHdpdGggRVNNIGlucHV0YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfRVZFTlRfUkVDVVJTSU9OIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9FVkVOVF9SRUNVUlNJT05cIixcbiAgICAgIGBUaGUgZXZlbnQgXCIke3h9XCIgaXMgYWxyZWFkeSBiZWluZyBkaXNwYXRjaGVkYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0ZFQVRVUkVfVU5BVkFJTEFCTEVfT05fUExBVEZPUk0gZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9GRUFUVVJFX1VOQVZBSUxBQkxFX09OX1BMQVRGT1JNXCIsXG4gICAgICBgVGhlIGZlYXR1cmUgJHt4fSBpcyB1bmF2YWlsYWJsZSBvbiB0aGUgY3VycmVudCBwbGF0Zm9ybSwgd2hpY2ggaXMgYmVpbmcgdXNlZCB0byBydW4gTm9kZS5qc2AsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9GU19GSUxFX1RPT19MQVJHRSBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfRlNfRklMRV9UT09fTEFSR0VcIiwgYEZpbGUgc2l6ZSAoJHt4fSkgaXMgZ3JlYXRlciB0aGFuIDIgR0JgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9GU19JTlZBTElEX1NZTUxJTktfVFlQRSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfRlNfSU5WQUxJRF9TWU1MSU5LX1RZUEVcIixcbiAgICAgIGBTeW1saW5rIHR5cGUgbXVzdCBiZSBvbmUgb2YgXCJkaXJcIiwgXCJmaWxlXCIsIG9yIFwianVuY3Rpb25cIi4gUmVjZWl2ZWQgXCIke3h9XCJgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfQUxUU1ZDX0lOVkFMSURfT1JJR0lOIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfQUxUU1ZDX0lOVkFMSURfT1JJR0lOXCIsXG4gICAgICBgSFRUUC8yIEFMVFNWQyBmcmFtZXMgcmVxdWlyZSBhIHZhbGlkIG9yaWdpbmAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9BTFRTVkNfTEVOR1RIIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfQUxUU1ZDX0xFTkdUSFwiLFxuICAgICAgYEhUVFAvMiBBTFRTVkMgZnJhbWVzIGFyZSBsaW1pdGVkIHRvIDE2MzgyIGJ5dGVzYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX0NPTk5FQ1RfQVVUSE9SSVRZIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9DT05ORUNUX0FVVEhPUklUWVwiLFxuICAgICAgYDphdXRob3JpdHkgaGVhZGVyIGlzIHJlcXVpcmVkIGZvciBDT05ORUNUIHJlcXVlc3RzYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX0NPTk5FQ1RfUEFUSCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfQ09OTkVDVF9QQVRIXCIsXG4gICAgICBgVGhlIDpwYXRoIGhlYWRlciBpcyBmb3JiaWRkZW4gZm9yIENPTk5FQ1QgcmVxdWVzdHNgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfQ09OTkVDVF9TQ0hFTUUgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX0NPTk5FQ1RfU0NIRU1FXCIsXG4gICAgICBgVGhlIDpzY2hlbWUgaGVhZGVyIGlzIGZvcmJpZGRlbiBmb3IgQ09OTkVDVCByZXF1ZXN0c2AsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9HT0FXQVlfU0VTU0lPTiBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfR09BV0FZX1NFU1NJT05cIixcbiAgICAgIGBOZXcgc3RyZWFtcyBjYW5ub3QgYmUgY3JlYXRlZCBhZnRlciByZWNlaXZpbmcgYSBHT0FXQVlgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfSEVBREVSU19BRlRFUl9SRVNQT05EIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9IRUFERVJTX0FGVEVSX1JFU1BPTkRcIixcbiAgICAgIGBDYW5ub3Qgc3BlY2lmeSBhZGRpdGlvbmFsIGhlYWRlcnMgYWZ0ZXIgcmVzcG9uc2UgaW5pdGlhdGVkYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX0hFQURFUlNfU0VOVCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0hUVFAyX0hFQURFUlNfU0VOVFwiLCBgUmVzcG9uc2UgaGFzIGFscmVhZHkgYmVlbiBpbml0aWF0ZWQuYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfSEVBREVSX1NJTkdMRV9WQUxVRSBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX0hFQURFUl9TSU5HTEVfVkFMVUVcIixcbiAgICAgIGBIZWFkZXIgZmllbGQgXCIke3h9XCIgbXVzdCBvbmx5IGhhdmUgYSBzaW5nbGUgdmFsdWVgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfSU5GT19TVEFUVVNfTk9UX0FMTE9XRUQgZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfSU5GT19TVEFUVVNfTk9UX0FMTE9XRURcIixcbiAgICAgIGBJbmZvcm1hdGlvbmFsIHN0YXR1cyBjb2RlcyBjYW5ub3QgYmUgdXNlZGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9JTlZBTElEX0NPTk5FQ1RJT05fSEVBREVSUyBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX0lOVkFMSURfQ09OTkVDVElPTl9IRUFERVJTXCIsXG4gICAgICBgSFRUUC8xIENvbm5lY3Rpb24gc3BlY2lmaWMgaGVhZGVycyBhcmUgZm9yYmlkZGVuOiBcIiR7eH1cImAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9JTlZBTElEX0hFQURFUl9WQUxVRSBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcsIHk6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfSU5WQUxJRF9IRUFERVJfVkFMVUVcIixcbiAgICAgIGBJbnZhbGlkIHZhbHVlIFwiJHt4fVwiIGZvciBoZWFkZXIgXCIke3l9XCJgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfSU5WQUxJRF9JTkZPX1NUQVRVUyBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9JTlZBTElEX0lORk9fU1RBVFVTXCIsXG4gICAgICBgSW52YWxpZCBpbmZvcm1hdGlvbmFsIHN0YXR1cyBjb2RlOiAke3h9YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX0lOVkFMSURfT1JJR0lOIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfSU5WQUxJRF9PUklHSU5cIixcbiAgICAgIGBIVFRQLzIgT1JJR0lOIGZyYW1lcyByZXF1aXJlIGEgdmFsaWQgb3JpZ2luYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX0lOVkFMSURfUEFDS0VEX1NFVFRJTkdTX0xFTkdUSCBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9JTlZBTElEX1BBQ0tFRF9TRVRUSU5HU19MRU5HVEhcIixcbiAgICAgIGBQYWNrZWQgc2V0dGluZ3MgbGVuZ3RoIG11c3QgYmUgYSBtdWx0aXBsZSBvZiBzaXhgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfSU5WQUxJRF9QU0VVRE9IRUFERVIgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9JTlZBTElEX1BTRVVET0hFQURFUlwiLFxuICAgICAgYFwiJHt4fVwiIGlzIGFuIGludmFsaWQgcHNldWRvaGVhZGVyIG9yIGlzIHVzZWQgaW5jb3JyZWN0bHlgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfSU5WQUxJRF9TRVNTSU9OIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfSFRUUDJfSU5WQUxJRF9TRVNTSU9OXCIsIGBUaGUgc2Vzc2lvbiBoYXMgYmVlbiBkZXN0cm95ZWRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9JTlZBTElEX1NUUkVBTSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0hUVFAyX0lOVkFMSURfU1RSRUFNXCIsIGBUaGUgc3RyZWFtIGhhcyBiZWVuIGRlc3Ryb3llZGApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX01BWF9QRU5ESU5HX1NFVFRJTkdTX0FDSyBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfTUFYX1BFTkRJTkdfU0VUVElOR1NfQUNLXCIsXG4gICAgICBgTWF4aW11bSBudW1iZXIgb2YgcGVuZGluZyBzZXR0aW5ncyBhY2tub3dsZWRnZW1lbnRzYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX05FU1RFRF9QVVNIIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9ORVNURURfUFVTSFwiLFxuICAgICAgYEEgcHVzaCBzdHJlYW0gY2Fubm90IGluaXRpYXRlIGFub3RoZXIgcHVzaCBzdHJlYW0uYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX05PX1NPQ0tFVF9NQU5JUFVMQVRJT04gZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX05PX1NPQ0tFVF9NQU5JUFVMQVRJT05cIixcbiAgICAgIGBIVFRQLzIgc29ja2V0cyBzaG91bGQgbm90IGJlIGRpcmVjdGx5IG1hbmlwdWxhdGVkIChlLmcuIHJlYWQgYW5kIHdyaXR0ZW4pYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX09SSUdJTl9MRU5HVEggZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9PUklHSU5fTEVOR1RIXCIsXG4gICAgICBgSFRUUC8yIE9SSUdJTiBmcmFtZXMgYXJlIGxpbWl0ZWQgdG8gMTYzODIgYnl0ZXNgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfT1VUX09GX1NUUkVBTVMgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX09VVF9PRl9TVFJFQU1TXCIsXG4gICAgICBgTm8gc3RyZWFtIElEIGlzIGF2YWlsYWJsZSBiZWNhdXNlIG1heGltdW0gc3RyZWFtIElEIGhhcyBiZWVuIHJlYWNoZWRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfUEFZTE9BRF9GT1JCSURERU4gZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX1BBWUxPQURfRk9SQklEREVOXCIsXG4gICAgICBgUmVzcG9uc2VzIHdpdGggJHt4fSBzdGF0dXMgbXVzdCBub3QgaGF2ZSBhIHBheWxvYWRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfUElOR19DQU5DRUwgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9IVFRQMl9QSU5HX0NBTkNFTFwiLCBgSFRUUDIgcGluZyBjYW5jZWxsZWRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9QSU5HX0xFTkdUSCBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfSFRUUDJfUElOR19MRU5HVEhcIiwgYEhUVFAyIHBpbmcgcGF5bG9hZCBtdXN0IGJlIDggYnl0ZXNgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9QU0VVRE9IRUFERVJfTk9UX0FMTE9XRUQgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9QU0VVRE9IRUFERVJfTk9UX0FMTE9XRURcIixcbiAgICAgIGBDYW5ub3Qgc2V0IEhUVFAvMiBwc2V1ZG8taGVhZGVyc2AsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9QVVNIX0RJU0FCTEVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfSFRUUDJfUFVTSF9ESVNBQkxFRFwiLCBgSFRUUC8yIGNsaWVudCBoYXMgZGlzYWJsZWQgcHVzaCBzdHJlYW1zYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfU0VORF9GSUxFIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfSFRUUDJfU0VORF9GSUxFXCIsIGBEaXJlY3RvcmllcyBjYW5ub3QgYmUgc2VudGApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX1NFTkRfRklMRV9OT1NFRUsgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX1NFTkRfRklMRV9OT1NFRUtcIixcbiAgICAgIGBPZmZzZXQgb3IgbGVuZ3RoIGNhbiBvbmx5IGJlIHNwZWNpZmllZCBmb3IgcmVndWxhciBmaWxlc2AsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9TRVNTSU9OX0VSUk9SIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfSFRUUDJfU0VTU0lPTl9FUlJPUlwiLCBgU2Vzc2lvbiBjbG9zZWQgd2l0aCBlcnJvciBjb2RlICR7eH1gKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9TRVRUSU5HU19DQU5DRUwgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9IVFRQMl9TRVRUSU5HU19DQU5DRUxcIiwgYEhUVFAyIHNlc3Npb24gc2V0dGluZ3MgY2FuY2VsZWRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9TT0NLRVRfQk9VTkQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX1NPQ0tFVF9CT1VORFwiLFxuICAgICAgYFRoZSBzb2NrZXQgaXMgYWxyZWFkeSBib3VuZCB0byBhbiBIdHRwMlNlc3Npb25gLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfU09DS0VUX1VOQk9VTkQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX1NPQ0tFVF9VTkJPVU5EXCIsXG4gICAgICBgVGhlIHNvY2tldCBoYXMgYmVlbiBkaXNjb25uZWN0ZWQgZnJvbSB0aGUgSHR0cDJTZXNzaW9uYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX1NUQVRVU18xMDEgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX1NUQVRVU18xMDFcIixcbiAgICAgIGBIVFRQIHN0YXR1cyBjb2RlIDEwMSAoU3dpdGNoaW5nIFByb3RvY29scykgaXMgZm9yYmlkZGVuIGluIEhUVFAvMmAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9TVEFUVVNfSU5WQUxJRCBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfSFRUUDJfU1RBVFVTX0lOVkFMSURcIiwgYEludmFsaWQgc3RhdHVzIGNvZGU6ICR7eH1gKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9TVFJFQU1fRVJST1IgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9IVFRQMl9TVFJFQU1fRVJST1JcIiwgYFN0cmVhbSBjbG9zZWQgd2l0aCBlcnJvciBjb2RlICR7eH1gKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9TVFJFQU1fU0VMRl9ERVBFTkRFTkNZIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9TVFJFQU1fU0VMRl9ERVBFTkRFTkNZXCIsXG4gICAgICBgQSBzdHJlYW0gY2Fubm90IGRlcGVuZCBvbiBpdHNlbGZgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfVFJBSUxFUlNfQUxSRUFEWV9TRU5UIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9UUkFJTEVSU19BTFJFQURZX1NFTlRcIixcbiAgICAgIGBUcmFpbGluZyBoZWFkZXJzIGhhdmUgYWxyZWFkeSBiZWVuIHNlbnRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfVFJBSUxFUlNfTk9UX1JFQURZIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9UUkFJTEVSU19OT1RfUkVBRFlcIixcbiAgICAgIGBUcmFpbGluZyBoZWFkZXJzIGNhbm5vdCBiZSBzZW50IHVudGlsIGFmdGVyIHRoZSB3YW50VHJhaWxlcnMgZXZlbnQgaXMgZW1pdHRlZGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9VTlNVUFBPUlRFRF9QUk9UT0NPTCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0hUVFAyX1VOU1VQUE9SVEVEX1BST1RPQ09MXCIsIGBwcm90b2NvbCBcIiR7eH1cIiBpcyB1bnN1cHBvcnRlZC5gKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQX0hFQURFUlNfU0VOVCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUF9IRUFERVJTX1NFTlRcIixcbiAgICAgIGBDYW5ub3QgJHt4fSBoZWFkZXJzIGFmdGVyIHRoZXkgYXJlIHNlbnQgdG8gdGhlIGNsaWVudGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQX0lOVkFMSURfSEVBREVSX1ZBTFVFIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZywgeTogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQX0lOVkFMSURfSEVBREVSX1ZBTFVFXCIsXG4gICAgICBgSW52YWxpZCB2YWx1ZSBcIiR7eH1cIiBmb3IgaGVhZGVyIFwiJHt5fVwiYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFBfSU5WQUxJRF9TVEFUVVNfQ09ERSBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfSFRUUF9JTlZBTElEX1NUQVRVU19DT0RFXCIsIGBJbnZhbGlkIHN0YXR1cyBjb2RlOiAke3h9YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUF9TT0NLRVRfRU5DT0RJTkcgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFBfU09DS0VUX0VOQ09ESU5HXCIsXG4gICAgICBgQ2hhbmdpbmcgdGhlIHNvY2tldCBlbmNvZGluZyBpcyBub3QgYWxsb3dlZCBwZXIgUkZDNzIzMCBTZWN0aW9uIDMuYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFBfVFJBSUxFUl9JTlZBTElEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQX1RSQUlMRVJfSU5WQUxJRFwiLFxuICAgICAgYFRyYWlsZXJzIGFyZSBpbnZhbGlkIHdpdGggdGhpcyB0cmFuc2ZlciBlbmNvZGluZ2AsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTkNPTVBBVElCTEVfT1BUSU9OX1BBSVIgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nLCB5OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0lOQ09NUEFUSUJMRV9PUFRJT05fUEFJUlwiLFxuICAgICAgYE9wdGlvbiBcIiR7eH1cIiBjYW5ub3QgYmUgdXNlZCBpbiBjb21iaW5hdGlvbiB3aXRoIG9wdGlvbiBcIiR7eX1cImAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlBVVF9UWVBFX05PVF9BTExPV0VEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9JTlBVVF9UWVBFX05PVF9BTExPV0VEXCIsXG4gICAgICBgLS1pbnB1dC10eXBlIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCBzdHJpbmcgaW5wdXQgdmlhIC0tZXZhbCwgLS1wcmludCwgb3IgU1RESU5gLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5TUEVDVE9SX0FMUkVBRFlfQUNUSVZBVEVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9JTlNQRUNUT1JfQUxSRUFEWV9BQ1RJVkFURURcIixcbiAgICAgIGBJbnNwZWN0b3IgaXMgYWxyZWFkeSBhY3RpdmF0ZWQuIENsb3NlIGl0IHdpdGggaW5zcGVjdG9yLmNsb3NlKCkgYmVmb3JlIGFjdGl2YXRpbmcgaXQgYWdhaW4uYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lOU1BFQ1RPUl9BTFJFQURZX0NPTk5FQ1RFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0lOU1BFQ1RPUl9BTFJFQURZX0NPTk5FQ1RFRFwiLCBgJHt4fSBpcyBhbHJlYWR5IGNvbm5lY3RlZGApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lOU1BFQ1RPUl9DTE9TRUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9JTlNQRUNUT1JfQ0xPU0VEXCIsIGBTZXNzaW9uIHdhcyBjbG9zZWRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlNQRUNUT1JfQ09NTUFORCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfSU5TUEVDVE9SX0NPTU1BTkRcIiwgYEluc3BlY3RvciBlcnJvciAke3h9OiAke3l9YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5TUEVDVE9SX05PVF9BQ1RJVkUgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9JTlNQRUNUT1JfTk9UX0FDVElWRVwiLCBgSW5zcGVjdG9yIGlzIG5vdCBhY3RpdmVgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlNQRUNUT1JfTk9UX0FWQUlMQUJMRSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0lOU1BFQ1RPUl9OT1RfQVZBSUxBQkxFXCIsIGBJbnNwZWN0b3IgaXMgbm90IGF2YWlsYWJsZWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lOU1BFQ1RPUl9OT1RfQ09OTkVDVEVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfSU5TUEVDVE9SX05PVF9DT05ORUNURURcIiwgYFNlc3Npb24gaXMgbm90IGNvbm5lY3RlZGApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lOU1BFQ1RPUl9OT1RfV09SS0VSIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfSU5TUEVDVE9SX05PVF9XT1JLRVJcIiwgYEN1cnJlbnQgdGhyZWFkIGlzIG5vdCBhIHdvcmtlcmApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfQVNZTkNfSUQgZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZywgeTogc3RyaW5nIHwgbnVtYmVyKSB7XG4gICAgc3VwZXIoXCJFUlJfSU5WQUxJRF9BU1lOQ19JRFwiLCBgSW52YWxpZCAke3h9IHZhbHVlOiAke3l9YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9CVUZGRVJfU0laRSBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfSU5WQUxJRF9CVUZGRVJfU0laRVwiLCBgQnVmZmVyIHNpemUgbXVzdCBiZSBhIG11bHRpcGxlIG9mICR7eH1gKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX0NBTExCQUNLIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKG9iamVjdDogdW5rbm93bikge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSU5WQUxJRF9DQUxMQkFDS1wiLFxuICAgICAgYENhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbi4gUmVjZWl2ZWQgJHtpbnNwZWN0KG9iamVjdCl9YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfQ1VSU09SX1BPUyBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0lOVkFMSURfQ1VSU09SX1BPU1wiLFxuICAgICAgYENhbm5vdCBzZXQgY3Vyc29yIHJvdyB3aXRob3V0IHNldHRpbmcgaXRzIGNvbHVtbmAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX0ZEIGV4dGVuZHMgTm9kZVJhbmdlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9JTlZBTElEX0ZEXCIsIGBcImZkXCIgbXVzdCBiZSBhIHBvc2l0aXZlIGludGVnZXI6ICR7eH1gKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX0ZEX1RZUEUgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfSU5WQUxJRF9GRF9UWVBFXCIsIGBVbnN1cHBvcnRlZCBmZCB0eXBlOiAke3h9YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9GSUxFX1VSTF9IT1NUIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSU5WQUxJRF9GSUxFX1VSTF9IT1NUXCIsXG4gICAgICBgRmlsZSBVUkwgaG9zdCBtdXN0IGJlIFwibG9jYWxob3N0XCIgb3IgZW1wdHkgb24gJHt4fWAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX0ZJTEVfVVJMX1BBVEggZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfSU5WQUxJRF9GSUxFX1VSTF9QQVRIXCIsIGBGaWxlIFVSTCBwYXRoICR7eH1gKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX0hBTkRMRV9UWVBFIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0lOVkFMSURfSEFORExFX1RZUEVcIiwgYFRoaXMgaGFuZGxlIHR5cGUgY2Fubm90IGJlIHNlbnRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX0hUVFBfVE9LRU4gZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nLCB5OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9JTlZBTElEX0hUVFBfVE9LRU5cIiwgYCR7eH0gbXVzdCBiZSBhIHZhbGlkIEhUVFAgdG9rZW4gW1wiJHt5fVwiXWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfSVBfQUREUkVTUyBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9JTlZBTElEX0lQX0FERFJFU1NcIiwgYEludmFsaWQgSVAgYWRkcmVzczogJHt4fWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfT1BUX1ZBTFVFX0VOQ09ESU5HIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSU5WQUxJRF9PUFRfVkFMVUVfRU5DT0RJTkdcIixcbiAgICAgIGBUaGUgdmFsdWUgXCIke3h9XCIgaXMgaW52YWxpZCBmb3Igb3B0aW9uIFwiZW5jb2RpbmdcImAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX1BFUkZPUk1BTkNFX01BUksgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0lOVkFMSURfUEVSRk9STUFOQ0VfTUFSS1wiLFxuICAgICAgYFRoZSBcIiR7eH1cIiBwZXJmb3JtYW5jZSBtYXJrIGhhcyBub3QgYmVlbiBzZXRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9QUk9UT0NPTCBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcsIHk6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSU5WQUxJRF9QUk9UT0NPTFwiLFxuICAgICAgYFByb3RvY29sIFwiJHt4fVwiIG5vdCBzdXBwb3J0ZWQuIEV4cGVjdGVkIFwiJHt5fVwiYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfUkVQTF9FVkFMX0NPTkZJRyBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0lOVkFMSURfUkVQTF9FVkFMX0NPTkZJR1wiLFxuICAgICAgYENhbm5vdCBzcGVjaWZ5IGJvdGggXCJicmVha0V2YWxPblNpZ2ludFwiIGFuZCBcImV2YWxcIiBmb3IgUkVQTGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX1JFUExfSU5QVVQgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfSU5WQUxJRF9SRVBMX0lOUFVUXCIsIGAke3h9YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9TWU5DX0ZPUktfSU5QVVQgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9JTlZBTElEX1NZTkNfRk9SS19JTlBVVFwiLFxuICAgICAgYEFzeW5jaHJvbm91cyBmb3JrcyBkbyBub3Qgc3VwcG9ydCBCdWZmZXIsIFR5cGVkQXJyYXksIERhdGFWaWV3IG9yIHN0cmluZyBpbnB1dDogJHt4fWAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX1RISVMgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfSU5WQUxJRF9USElTXCIsIGBWYWx1ZSBvZiBcInRoaXNcIiBtdXN0IGJlIG9mIHR5cGUgJHt4fWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfVFVQTEUgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nLCB5OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9JTlZBTElEX1RVUExFXCIsIGAke3h9IG11c3QgYmUgYW4gaXRlcmFibGUgJHt5fSB0dXBsZWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfVVJJIGV4dGVuZHMgTm9kZVVSSUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfSU5WQUxJRF9VUklcIiwgYFVSSSBtYWxmb3JtZWRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JUENfQ0hBTk5FTF9DTE9TRUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9JUENfQ0hBTk5FTF9DTE9TRURcIiwgYENoYW5uZWwgY2xvc2VkYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSVBDX0RJU0NPTk5FQ1RFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0lQQ19ESVNDT05ORUNURURcIiwgYElQQyBjaGFubmVsIGlzIGFscmVhZHkgZGlzY29ubmVjdGVkYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSVBDX09ORV9QSVBFIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfSVBDX09ORV9QSVBFXCIsIGBDaGlsZCBwcm9jZXNzIGNhbiBoYXZlIG9ubHkgb25lIElQQyBwaXBlYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSVBDX1NZTkNfRk9SSyBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0lQQ19TWU5DX0ZPUktcIiwgYElQQyBjYW5ub3QgYmUgdXNlZCB3aXRoIHN5bmNocm9ub3VzIGZvcmtzYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfTUFOSUZFU1RfREVQRU5ERU5DWV9NSVNTSU5HIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nLCB5OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX01BTklGRVNUX0RFUEVOREVOQ1lfTUlTU0lOR1wiLFxuICAgICAgYE1hbmlmZXN0IHJlc291cmNlICR7eH0gZG9lcyBub3QgbGlzdCAke3l9IGFzIGEgZGVwZW5kZW5jeSBzcGVjaWZpZXJgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfTUFOSUZFU1RfSU5URUdSSVRZX01JU01BVENIIGV4dGVuZHMgTm9kZVN5bnRheEVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9NQU5JRkVTVF9JTlRFR1JJVFlfTUlTTUFUQ0hcIixcbiAgICAgIGBNYW5pZmVzdCByZXNvdXJjZSAke3h9IGhhcyBtdWx0aXBsZSBlbnRyaWVzIGJ1dCBpbnRlZ3JpdHkgbGlzdHMgZG8gbm90IG1hdGNoYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX01BTklGRVNUX0lOVkFMSURfUkVTT1VSQ0VfRklFTEQgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nLCB5OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX01BTklGRVNUX0lOVkFMSURfUkVTT1VSQ0VfRklFTERcIixcbiAgICAgIGBNYW5pZmVzdCByZXNvdXJjZSAke3h9IGhhcyBpbnZhbGlkIHByb3BlcnR5IHZhbHVlIGZvciAke3l9YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX01BTklGRVNUX1REWiBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX01BTklGRVNUX1REWlwiLCBgTWFuaWZlc3QgaW5pdGlhbGl6YXRpb24gaGFzIG5vdCB5ZXQgcnVuYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfTUFOSUZFU1RfVU5LTk9XTl9PTkVSUk9SIGV4dGVuZHMgTm9kZVN5bnRheEVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9NQU5JRkVTVF9VTktOT1dOX09ORVJST1JcIixcbiAgICAgIGBNYW5pZmVzdCBzcGVjaWZpZWQgdW5rbm93biBlcnJvciBiZWhhdmlvciBcIiR7eH1cIi5gLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfTUVUSE9EX05PVF9JTVBMRU1FTlRFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX01FVEhPRF9OT1RfSU1QTEVNRU5URURcIiwgYFRoZSAke3h9IG1ldGhvZCBpcyBub3QgaW1wbGVtZW50ZWRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9NSVNTSU5HX0FSR1MgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoLi4uYXJnczogKHN0cmluZyB8IHN0cmluZ1tdKVtdKSB7XG4gICAgbGV0IG1zZyA9IFwiVGhlIFwiO1xuXG4gICAgY29uc3QgbGVuID0gYXJncy5sZW5ndGg7XG5cbiAgICBjb25zdCB3cmFwID0gKGE6IHVua25vd24pID0+IGBcIiR7YX1cImA7XG5cbiAgICBhcmdzID0gYXJncy5tYXAoKGEpID0+XG4gICAgICBBcnJheS5pc0FycmF5KGEpID8gYS5tYXAod3JhcCkuam9pbihcIiBvciBcIikgOiB3cmFwKGEpXG4gICAgKTtcblxuICAgIHN3aXRjaCAobGVuKSB7XG4gICAgICBjYXNlIDE6XG4gICAgICAgIG1zZyArPSBgJHthcmdzWzBdfSBhcmd1bWVudGA7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAyOlxuICAgICAgICBtc2cgKz0gYCR7YXJnc1swXX0gYW5kICR7YXJnc1sxXX0gYXJndW1lbnRzYDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBtc2cgKz0gYXJncy5zbGljZSgwLCBsZW4gLSAxKS5qb2luKFwiLCBcIik7XG4gICAgICAgIG1zZyArPSBgLCBhbmQgJHthcmdzW2xlbiAtIDFdfSBhcmd1bWVudHNgO1xuICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICBzdXBlcihcIkVSUl9NSVNTSU5HX0FSR1NcIiwgYCR7bXNnfSBtdXN0IGJlIHNwZWNpZmllZGApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX01JU1NJTkdfT1BUSU9OIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX01JU1NJTkdfT1BUSU9OXCIsIGAke3h9IGlzIHJlcXVpcmVkYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfTVVMVElQTEVfQ0FMTEJBQ0sgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9NVUxUSVBMRV9DQUxMQkFDS1wiLCBgQ2FsbGJhY2sgY2FsbGVkIG11bHRpcGxlIHRpbWVzYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfTkFQSV9DT05TX0ZVTkNUSU9OIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX05BUElfQ09OU19GVU5DVElPTlwiLCBgQ29uc3RydWN0b3IgbXVzdCBiZSBhIGZ1bmN0aW9uYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfTkFQSV9JTlZBTElEX0RBVEFWSUVXX0FSR1MgZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfTkFQSV9JTlZBTElEX0RBVEFWSUVXX0FSR1NcIixcbiAgICAgIGBieXRlX29mZnNldCArIGJ5dGVfbGVuZ3RoIHNob3VsZCBiZSBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gdGhlIHNpemUgaW4gYnl0ZXMgb2YgdGhlIGFycmF5IHBhc3NlZCBpbmAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9OQVBJX0lOVkFMSURfVFlQRURBUlJBWV9BTElHTk1FTlQgZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZywgeTogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9OQVBJX0lOVkFMSURfVFlQRURBUlJBWV9BTElHTk1FTlRcIixcbiAgICAgIGBzdGFydCBvZmZzZXQgb2YgJHt4fSBzaG91bGQgYmUgYSBtdWx0aXBsZSBvZiAke3l9YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX05BUElfSU5WQUxJRF9UWVBFREFSUkFZX0xFTkdUSCBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfTkFQSV9JTlZBTElEX1RZUEVEQVJSQVlfTEVOR1RIXCIsIGBJbnZhbGlkIHR5cGVkIGFycmF5IGxlbmd0aGApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX05PX0NSWVBUTyBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfTk9fQ1JZUFRPXCIsXG4gICAgICBgTm9kZS5qcyBpcyBub3QgY29tcGlsZWQgd2l0aCBPcGVuU1NMIGNyeXB0byBzdXBwb3J0YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX05PX0lDVSBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX05PX0lDVVwiLFxuICAgICAgYCR7eH0gaXMgbm90IHN1cHBvcnRlZCBvbiBOb2RlLmpzIGNvbXBpbGVkIHdpdGhvdXQgSUNVYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1FVSUNDTElFTlRTRVNTSU9OX0ZBSUxFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfUVVJQ0NMSUVOVFNFU1NJT05fRkFJTEVEXCIsXG4gICAgICBgRmFpbGVkIHRvIGNyZWF0ZSBhIG5ldyBRdWljQ2xpZW50U2Vzc2lvbjogJHt4fWAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9RVUlDQ0xJRU5UU0VTU0lPTl9GQUlMRURfU0VUU09DS0VUIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9RVUlDQ0xJRU5UU0VTU0lPTl9GQUlMRURfU0VUU09DS0VUXCIsXG4gICAgICBgRmFpbGVkIHRvIHNldCB0aGUgUXVpY1NvY2tldGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9RVUlDU0VTU0lPTl9ERVNUUk9ZRUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1FVSUNTRVNTSU9OX0RFU1RST1lFRFwiLFxuICAgICAgYENhbm5vdCBjYWxsICR7eH0gYWZ0ZXIgYSBRdWljU2Vzc2lvbiBoYXMgYmVlbiBkZXN0cm95ZWRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfUVVJQ1NFU1NJT05fSU5WQUxJRF9EQ0lEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfUVVJQ1NFU1NJT05fSU5WQUxJRF9EQ0lEXCIsIGBJbnZhbGlkIERDSUQgdmFsdWU6ICR7eH1gKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9RVUlDU0VTU0lPTl9VUERBVEVLRVkgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9RVUlDU0VTU0lPTl9VUERBVEVLRVlcIiwgYFVuYWJsZSB0byB1cGRhdGUgUXVpY1Nlc3Npb24ga2V5c2ApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1FVSUNTT0NLRVRfREVTVFJPWUVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9RVUlDU09DS0VUX0RFU1RST1lFRFwiLFxuICAgICAgYENhbm5vdCBjYWxsICR7eH0gYWZ0ZXIgYSBRdWljU29ja2V0IGhhcyBiZWVuIGRlc3Ryb3llZGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9RVUlDU09DS0VUX0lOVkFMSURfU1RBVEVMRVNTX1JFU0VUX1NFQ1JFVF9MRU5HVEhcbiAgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1FVSUNTT0NLRVRfSU5WQUxJRF9TVEFURUxFU1NfUkVTRVRfU0VDUkVUX0xFTkdUSFwiLFxuICAgICAgYFRoZSBzdGF0ZVJlc2V0VG9rZW4gbXVzdCBiZSBleGFjdGx5IDE2LWJ5dGVzIGluIGxlbmd0aGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9RVUlDU09DS0VUX0xJU1RFTklORyBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX1FVSUNTT0NLRVRfTElTVEVOSU5HXCIsIGBUaGlzIFF1aWNTb2NrZXQgaXMgYWxyZWFkeSBsaXN0ZW5pbmdgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9RVUlDU09DS0VUX1VOQk9VTkQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1FVSUNTT0NLRVRfVU5CT1VORFwiLFxuICAgICAgYENhbm5vdCBjYWxsICR7eH0gYmVmb3JlIGEgUXVpY1NvY2tldCBoYXMgYmVlbiBib3VuZGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9RVUlDU1RSRUFNX0RFU1RST1lFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfUVVJQ1NUUkVBTV9ERVNUUk9ZRURcIixcbiAgICAgIGBDYW5ub3QgY2FsbCAke3h9IGFmdGVyIGEgUXVpY1N0cmVhbSBoYXMgYmVlbiBkZXN0cm95ZWRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfUVVJQ1NUUkVBTV9JTlZBTElEX1BVU0ggZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1FVSUNTVFJFQU1fSU5WQUxJRF9QVVNIXCIsXG4gICAgICBgUHVzaCBzdHJlYW1zIGFyZSBvbmx5IHN1cHBvcnRlZCBvbiBjbGllbnQtaW5pdGlhdGVkLCBiaWRpcmVjdGlvbmFsIHN0cmVhbXNgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfUVVJQ1NUUkVBTV9PUEVOX0ZBSUxFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX1FVSUNTVFJFQU1fT1BFTl9GQUlMRURcIiwgYE9wZW5pbmcgYSBuZXcgUXVpY1N0cmVhbSBmYWlsZWRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9RVUlDU1RSRUFNX1VOU1VQUE9SVEVEX1BVU0ggZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1FVSUNTVFJFQU1fVU5TVVBQT1JURURfUFVTSFwiLFxuICAgICAgYFB1c2ggc3RyZWFtcyBhcmUgbm90IHN1cHBvcnRlZCBvbiB0aGlzIFF1aWNTZXNzaW9uYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1FVSUNfVExTMTNfUkVRVUlSRUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9RVUlDX1RMUzEzX1JFUVVJUkVEXCIsIGBRVUlDIHJlcXVpcmVzIFRMUyB2ZXJzaW9uIDEuM2ApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1NDUklQVF9FWEVDVVRJT05fSU5URVJSVVBURUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1NDUklQVF9FWEVDVVRJT05fSU5URVJSVVBURURcIixcbiAgICAgIFwiU2NyaXB0IGV4ZWN1dGlvbiB3YXMgaW50ZXJydXB0ZWQgYnkgYFNJR0lOVGBcIixcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1NFUlZFUl9BTFJFQURZX0xJU1RFTiBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfU0VSVkVSX0FMUkVBRFlfTElTVEVOXCIsXG4gICAgICBgTGlzdGVuIG1ldGhvZCBoYXMgYmVlbiBjYWxsZWQgbW9yZSB0aGFuIG9uY2Ugd2l0aG91dCBjbG9zaW5nLmAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9TRVJWRVJfTk9UX1JVTk5JTkcgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9TRVJWRVJfTk9UX1JVTk5JTkdcIiwgYFNlcnZlciBpcyBub3QgcnVubmluZy5gKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9TT0NLRVRfQUxSRUFEWV9CT1VORCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX1NPQ0tFVF9BTFJFQURZX0JPVU5EXCIsIGBTb2NrZXQgaXMgYWxyZWFkeSBib3VuZGApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1NPQ0tFVF9CQURfQlVGRkVSX1NJWkUgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9TT0NLRVRfQkFEX0JVRkZFUl9TSVpFXCIsXG4gICAgICBgQnVmZmVyIHNpemUgbXVzdCBiZSBhIHBvc2l0aXZlIGludGVnZXJgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfU09DS0VUX0JBRF9QT1JUIGV4dGVuZHMgTm9kZVJhbmdlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihuYW1lOiBzdHJpbmcsIHBvcnQ6IHVua25vd24sIGFsbG93WmVybyA9IHRydWUpIHtcbiAgICBhc3NlcnQoXG4gICAgICB0eXBlb2YgYWxsb3daZXJvID09PSBcImJvb2xlYW5cIixcbiAgICAgIFwiVGhlICdhbGxvd1plcm8nIGFyZ3VtZW50IG11c3QgYmUgb2YgdHlwZSBib29sZWFuLlwiLFxuICAgICk7XG5cbiAgICBjb25zdCBvcGVyYXRvciA9IGFsbG93WmVybyA/IFwiPj1cIiA6IFwiPlwiO1xuXG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9TT0NLRVRfQkFEX1BPUlRcIixcbiAgICAgIGAke25hbWV9IHNob3VsZCBiZSAke29wZXJhdG9yfSAwIGFuZCA8IDY1NTM2LiBSZWNlaXZlZCAke3BvcnR9LmAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9TT0NLRVRfQkFEX1RZUEUgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9TT0NLRVRfQkFEX1RZUEVcIixcbiAgICAgIGBCYWQgc29ja2V0IHR5cGUgc3BlY2lmaWVkLiBWYWxpZCB0eXBlcyBhcmU6IHVkcDQsIHVkcDZgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfU09DS0VUX0NMT1NFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX1NPQ0tFVF9DTE9TRURcIiwgYFNvY2tldCBpcyBjbG9zZWRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9TT0NLRVRfREdSQU1fSVNfQ09OTkVDVEVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfU09DS0VUX0RHUkFNX0lTX0NPTk5FQ1RFRFwiLCBgQWxyZWFkeSBjb25uZWN0ZWRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9TT0NLRVRfREdSQU1fTk9UX0NPTk5FQ1RFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX1NPQ0tFVF9ER1JBTV9OT1RfQ09OTkVDVEVEXCIsIGBOb3QgY29ubmVjdGVkYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfU09DS0VUX0RHUkFNX05PVF9SVU5OSU5HIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfU09DS0VUX0RHUkFNX05PVF9SVU5OSU5HXCIsIGBOb3QgcnVubmluZ2ApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1NSSV9QQVJTRSBleHRlbmRzIE5vZGVTeW50YXhFcnJvciB7XG4gIGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywgY2hhcjogc3RyaW5nLCBwb3NpdGlvbjogbnVtYmVyKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9TUklfUEFSU0VcIixcbiAgICAgIGBTdWJyZXNvdXJjZSBJbnRlZ3JpdHkgc3RyaW5nICR7bmFtZX0gaGFkIGFuIHVuZXhwZWN0ZWQgJHtjaGFyfSBhdCBwb3NpdGlvbiAke3Bvc2l0aW9ufWAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9TVFJFQU1fQUxSRUFEWV9GSU5JU0hFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfU1RSRUFNX0FMUkVBRFlfRklOSVNIRURcIixcbiAgICAgIGBDYW5ub3QgY2FsbCAke3h9IGFmdGVyIGEgc3RyZWFtIHdhcyBmaW5pc2hlZGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9TVFJFQU1fQ0FOTk9UX1BJUEUgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9TVFJFQU1fQ0FOTk9UX1BJUEVcIiwgYENhbm5vdCBwaXBlLCBub3QgcmVhZGFibGVgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9TVFJFQU1fREVTVFJPWUVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9TVFJFQU1fREVTVFJPWUVEXCIsXG4gICAgICBgQ2Fubm90IGNhbGwgJHt4fSBhZnRlciBhIHN0cmVhbSB3YXMgZGVzdHJveWVkYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1NUUkVBTV9OVUxMX1ZBTFVFUyBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9TVFJFQU1fTlVMTF9WQUxVRVNcIiwgYE1heSBub3Qgd3JpdGUgbnVsbCB2YWx1ZXMgdG8gc3RyZWFtYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfU1RSRUFNX1BSRU1BVFVSRV9DTE9TRSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX1NUUkVBTV9QUkVNQVRVUkVfQ0xPU0VcIiwgYFByZW1hdHVyZSBjbG9zZWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1NUUkVBTV9QVVNIX0FGVEVSX0VPRiBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX1NUUkVBTV9QVVNIX0FGVEVSX0VPRlwiLCBgc3RyZWFtLnB1c2goKSBhZnRlciBFT0ZgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9TVFJFQU1fVU5TSElGVF9BRlRFUl9FTkRfRVZFTlQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1NUUkVBTV9VTlNISUZUX0FGVEVSX0VORF9FVkVOVFwiLFxuICAgICAgYHN0cmVhbS51bnNoaWZ0KCkgYWZ0ZXIgZW5kIGV2ZW50YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1NUUkVBTV9XUkFQIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9TVFJFQU1fV1JBUFwiLFxuICAgICAgYFN0cmVhbSBoYXMgU3RyaW5nRGVjb2RlciBzZXQgb3IgaXMgaW4gb2JqZWN0TW9kZWAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9TVFJFQU1fV1JJVEVfQUZURVJfRU5EIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfU1RSRUFNX1dSSVRFX0FGVEVSX0VORFwiLCBgd3JpdGUgYWZ0ZXIgZW5kYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfU1lOVEhFVElDIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfU1lOVEhFVElDXCIsIGBKYXZhU2NyaXB0IENhbGxzdGFja2ApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1RMU19DRVJUX0FMVE5BTUVfSU5WQUxJRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIHJlYXNvbjogc3RyaW5nO1xuICBob3N0OiBzdHJpbmc7XG4gIGNlcnQ6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihyZWFzb246IHN0cmluZywgaG9zdDogc3RyaW5nLCBjZXJ0OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1RMU19DRVJUX0FMVE5BTUVfSU5WQUxJRFwiLFxuICAgICAgYEhvc3RuYW1lL0lQIGRvZXMgbm90IG1hdGNoIGNlcnRpZmljYXRlJ3MgYWx0bmFtZXM6ICR7cmVhc29ufWAsXG4gICAgKTtcbiAgICB0aGlzLnJlYXNvbiA9IHJlYXNvbjtcbiAgICB0aGlzLmhvc3QgPSBob3N0O1xuICAgIHRoaXMuY2VydCA9IGNlcnQ7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVExTX0RIX1BBUkFNX1NJWkUgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9UTFNfREhfUEFSQU1fU0laRVwiLCBgREggcGFyYW1ldGVyIHNpemUgJHt4fSBpcyBsZXNzIHRoYW4gMjA0OGApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1RMU19IQU5EU0hBS0VfVElNRU9VVCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX1RMU19IQU5EU0hBS0VfVElNRU9VVFwiLCBgVExTIGhhbmRzaGFrZSB0aW1lb3V0YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVExTX0lOVkFMSURfQ09OVEVYVCBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9UTFNfSU5WQUxJRF9DT05URVhUXCIsIGAke3h9IG11c3QgYmUgYSBTZWN1cmVDb250ZXh0YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVExTX0lOVkFMSURfU1RBVEUgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1RMU19JTlZBTElEX1NUQVRFXCIsXG4gICAgICBgVExTIHNvY2tldCBjb25uZWN0aW9uIG11c3QgYmUgc2VjdXJlbHkgZXN0YWJsaXNoZWRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVExTX0lOVkFMSURfUFJPVE9DT0xfVkVSU0lPTiBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcihwcm90b2NvbDogc3RyaW5nLCB4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1RMU19JTlZBTElEX1BST1RPQ09MX1ZFUlNJT05cIixcbiAgICAgIGAke3Byb3RvY29sfSBpcyBub3QgYSB2YWxpZCAke3h9IFRMUyBwcm90b2NvbCB2ZXJzaW9uYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1RMU19QUk9UT0NPTF9WRVJTSU9OX0NPTkZMSUNUIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHByZXZQcm90b2NvbDogc3RyaW5nLCBwcm90b2NvbDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9UTFNfUFJPVE9DT0xfVkVSU0lPTl9DT05GTElDVFwiLFxuICAgICAgYFRMUyBwcm90b2NvbCB2ZXJzaW9uICR7cHJldlByb3RvY29sfSBjb25mbGljdHMgd2l0aCBzZWN1cmVQcm90b2NvbCAke3Byb3RvY29sfWAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9UTFNfUkVORUdPVElBVElPTl9ESVNBQkxFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfVExTX1JFTkVHT1RJQVRJT05fRElTQUJMRURcIixcbiAgICAgIGBUTFMgc2Vzc2lvbiByZW5lZ290aWF0aW9uIGRpc2FibGVkIGZvciB0aGlzIHNvY2tldGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9UTFNfUkVRVUlSRURfU0VSVkVSX05BTUUgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1RMU19SRVFVSVJFRF9TRVJWRVJfTkFNRVwiLFxuICAgICAgYFwic2VydmVybmFtZVwiIGlzIHJlcXVpcmVkIHBhcmFtZXRlciBmb3IgU2VydmVyLmFkZENvbnRleHRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVExTX1NFU1NJT05fQVRUQUNLIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9UTFNfU0VTU0lPTl9BVFRBQ0tcIixcbiAgICAgIGBUTFMgc2Vzc2lvbiByZW5lZ290aWF0aW9uIGF0dGFjayBkZXRlY3RlZGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9UTFNfU05JX0ZST01fU0VSVkVSIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9UTFNfU05JX0ZST01fU0VSVkVSXCIsXG4gICAgICBgQ2Fubm90IGlzc3VlIFNOSSBmcm9tIGEgVExTIHNlcnZlci1zaWRlIHNvY2tldGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9UUkFDRV9FVkVOVFNfQ0FURUdPUllfUkVRVUlSRUQgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9UUkFDRV9FVkVOVFNfQ0FURUdPUllfUkVRVUlSRURcIixcbiAgICAgIGBBdCBsZWFzdCBvbmUgY2F0ZWdvcnkgaXMgcmVxdWlyZWRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVFJBQ0VfRVZFTlRTX1VOQVZBSUxBQkxFIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfVFJBQ0VfRVZFTlRTX1VOQVZBSUxBQkxFXCIsIGBUcmFjZSBldmVudHMgYXJlIHVuYXZhaWxhYmxlYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVU5BVkFJTEFCTEVfRFVSSU5HX0VYSVQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1VOQVZBSUxBQkxFX0RVUklOR19FWElUXCIsXG4gICAgICBgQ2Fubm90IGNhbGwgZnVuY3Rpb24gaW4gcHJvY2VzcyBleGl0IGhhbmRsZXJgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVU5DQVVHSFRfRVhDRVBUSU9OX0NBUFRVUkVfQUxSRUFEWV9TRVQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1VOQ0FVR0hUX0VYQ0VQVElPTl9DQVBUVVJFX0FMUkVBRFlfU0VUXCIsXG4gICAgICBcImBwcm9jZXNzLnNldHVwVW5jYXVnaHRFeGNlcHRpb25DYXB0dXJlKClgIHdhcyBjYWxsZWQgd2hpbGUgYSBjYXB0dXJlIGNhbGxiYWNrIHdhcyBhbHJlYWR5IGFjdGl2ZVwiLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVU5FU0NBUEVEX0NIQVJBQ1RFUlMgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfVU5FU0NBUEVEX0NIQVJBQ1RFUlNcIiwgYCR7eH0gY29udGFpbnMgdW5lc2NhcGVkIGNoYXJhY3RlcnNgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9VTkhBTkRMRURfRVJST1IgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9VTkhBTkRMRURfRVJST1JcIiwgYFVuaGFuZGxlZCBlcnJvci4gKCR7eH0pYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVU5LTk9XTl9CVUlMVElOX01PRFVMRSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX1VOS05PV05fQlVJTFRJTl9NT0RVTEVcIiwgYE5vIHN1Y2ggYnVpbHQtaW4gbW9kdWxlOiAke3h9YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVU5LTk9XTl9DUkVERU5USUFMIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nLCB5OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9VTktOT1dOX0NSRURFTlRJQUxcIiwgYCR7eH0gaWRlbnRpZmllciBkb2VzIG5vdCBleGlzdDogJHt5fWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1VOS05PV05fRU5DT0RJTkcgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfVU5LTk9XTl9FTkNPRElOR1wiLCBgVW5rbm93biBlbmNvZGluZzogJHt4fWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1VOS05PV05fRklMRV9FWFRFTlNJT04gZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nLCB5OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1VOS05PV05fRklMRV9FWFRFTlNJT05cIixcbiAgICAgIGBVbmtub3duIGZpbGUgZXh0ZW5zaW9uIFwiJHt4fVwiIGZvciAke3l9YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1VOS05PV05fTU9EVUxFX0ZPUk1BVCBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfVU5LTk9XTl9NT0RVTEVfRk9STUFUXCIsIGBVbmtub3duIG1vZHVsZSBmb3JtYXQ6ICR7eH1gKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9VTktOT1dOX1NJR05BTCBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9VTktOT1dOX1NJR05BTFwiLCBgVW5rbm93biBzaWduYWw6ICR7eH1gKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9VTlNVUFBPUlRFRF9ESVJfSU1QT1JUIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nLCB5OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1VOU1VQUE9SVEVEX0RJUl9JTVBPUlRcIixcbiAgICAgIGBEaXJlY3RvcnkgaW1wb3J0ICcke3h9JyBpcyBub3Qgc3VwcG9ydGVkIHJlc29sdmluZyBFUyBtb2R1bGVzLCBpbXBvcnRlZCBmcm9tICR7eX1gLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVU5TVVBQT1JURURfRVNNX1VSTF9TQ0hFTUUgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1VOU1VQUE9SVEVEX0VTTV9VUkxfU0NIRU1FXCIsXG4gICAgICBgT25seSBmaWxlIGFuZCBkYXRhIFVSTHMgYXJlIHN1cHBvcnRlZCBieSB0aGUgZGVmYXVsdCBFU00gbG9hZGVyYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1Y4QlJFQUtJVEVSQVRPUiBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfVjhCUkVBS0lURVJBVE9SXCIsXG4gICAgICBgRnVsbCBJQ1UgZGF0YSBub3QgaW5zdGFsbGVkLiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL3dpa2kvSW50bGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9WQUxJRF9QRVJGT1JNQU5DRV9FTlRSWV9UWVBFIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9WQUxJRF9QRVJGT1JNQU5DRV9FTlRSWV9UWVBFXCIsXG4gICAgICBgQXQgbGVhc3Qgb25lIHZhbGlkIHBlcmZvcm1hbmNlIGVudHJ5IHR5cGUgaXMgcmVxdWlyZWRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVk1fRFlOQU1JQ19JTVBPUlRfQ0FMTEJBQ0tfTUlTU0lORyBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1ZNX0RZTkFNSUNfSU1QT1JUX0NBTExCQUNLX01JU1NJTkdcIixcbiAgICAgIGBBIGR5bmFtaWMgaW1wb3J0IGNhbGxiYWNrIHdhcyBub3Qgc3BlY2lmaWVkLmAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9WTV9NT0RVTEVfQUxSRUFEWV9MSU5LRUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9WTV9NT0RVTEVfQUxSRUFEWV9MSU5LRURcIiwgYE1vZHVsZSBoYXMgYWxyZWFkeSBiZWVuIGxpbmtlZGApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1ZNX01PRFVMRV9DQU5OT1RfQ1JFQVRFX0NBQ0hFRF9EQVRBIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9WTV9NT0RVTEVfQ0FOTk9UX0NSRUFURV9DQUNIRURfREFUQVwiLFxuICAgICAgYENhY2hlZCBkYXRhIGNhbm5vdCBiZSBjcmVhdGVkIGZvciBhIG1vZHVsZSB3aGljaCBoYXMgYmVlbiBldmFsdWF0ZWRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVk1fTU9EVUxFX0RJRkZFUkVOVF9DT05URVhUIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9WTV9NT0RVTEVfRElGRkVSRU5UX0NPTlRFWFRcIixcbiAgICAgIGBMaW5rZWQgbW9kdWxlcyBtdXN0IHVzZSB0aGUgc2FtZSBjb250ZXh0YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1ZNX01PRFVMRV9MSU5LSU5HX0VSUk9SRUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1ZNX01PRFVMRV9MSU5LSU5HX0VSUk9SRURcIixcbiAgICAgIGBMaW5raW5nIGhhcyBhbHJlYWR5IGZhaWxlZCBmb3IgdGhlIHByb3ZpZGVkIG1vZHVsZWAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9WTV9NT0RVTEVfTk9UX01PRFVMRSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfVk1fTU9EVUxFX05PVF9NT0RVTEVcIixcbiAgICAgIGBQcm92aWRlZCBtb2R1bGUgaXMgbm90IGFuIGluc3RhbmNlIG9mIE1vZHVsZWAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9WTV9NT0RVTEVfU1RBVFVTIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfVk1fTU9EVUxFX1NUQVRVU1wiLCBgTW9kdWxlIHN0YXR1cyAke3h9YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfV0FTSV9BTFJFQURZX1NUQVJURUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9XQVNJX0FMUkVBRFlfU1RBUlRFRFwiLCBgV0FTSSBpbnN0YW5jZSBoYXMgYWxyZWFkeSBzdGFydGVkYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfV09SS0VSX0lOSVRfRkFJTEVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfV09SS0VSX0lOSVRfRkFJTEVEXCIsIGBXb3JrZXIgaW5pdGlhbGl6YXRpb24gZmFpbHVyZTogJHt4fWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1dPUktFUl9OT1RfUlVOTklORyBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX1dPUktFUl9OT1RfUlVOTklOR1wiLCBgV29ya2VyIGluc3RhbmNlIG5vdCBydW5uaW5nYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfV09SS0VSX09VVF9PRl9NRU1PUlkgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1dPUktFUl9PVVRfT0ZfTUVNT1JZXCIsXG4gICAgICBgV29ya2VyIHRlcm1pbmF0ZWQgZHVlIHRvIHJlYWNoaW5nIG1lbW9yeSBsaW1pdDogJHt4fWAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9XT1JLRVJfVU5TRVJJQUxJWkFCTEVfRVJST1IgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1dPUktFUl9VTlNFUklBTElaQUJMRV9FUlJPUlwiLFxuICAgICAgYFNlcmlhbGl6aW5nIGFuIHVuY2F1Z2h0IGV4Y2VwdGlvbiBmYWlsZWRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfV09SS0VSX1VOU1VQUE9SVEVEX0VYVEVOU0lPTiBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1dPUktFUl9VTlNVUFBPUlRFRF9FWFRFTlNJT05cIixcbiAgICAgIGBUaGUgd29ya2VyIHNjcmlwdCBleHRlbnNpb24gbXVzdCBiZSBcIi5qc1wiLCBcIi5tanNcIiwgb3IgXCIuY2pzXCIuIFJlY2VpdmVkIFwiJHt4fVwiYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1dPUktFUl9VTlNVUFBPUlRFRF9PUEVSQVRJT04gZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9XT1JLRVJfVU5TVVBQT1JURURfT1BFUkFUSU9OXCIsXG4gICAgICBgJHt4fSBpcyBub3Qgc3VwcG9ydGVkIGluIHdvcmtlcnNgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfWkxJQl9JTklUSUFMSVpBVElPTl9GQUlMRUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9aTElCX0lOSVRJQUxJWkFUSU9OX0ZBSUxFRFwiLCBgSW5pdGlhbGl6YXRpb24gZmFpbGVkYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfRkFMU1lfVkFMVUVfUkVKRUNUSU9OIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgcmVhc29uOiBzdHJpbmc7XG4gIGNvbnN0cnVjdG9yKHJlYXNvbjogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfRkFMU1lfVkFMVUVfUkVKRUNUSU9OXCIsIFwiUHJvbWlzZSB3YXMgcmVqZWN0ZWQgd2l0aCBmYWxzeSB2YWx1ZVwiKTtcbiAgICB0aGlzLnJlYXNvbiA9IHJlYXNvbjtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9JTlZBTElEX1NFVFRJTkdfVkFMVUUgZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGFjdHVhbDogdW5rbm93bjtcbiAgbWluPzogbnVtYmVyO1xuICBtYXg/OiBudW1iZXI7XG5cbiAgY29uc3RydWN0b3IobmFtZTogc3RyaW5nLCBhY3R1YWw6IHVua25vd24sIG1pbj86IG51bWJlciwgbWF4PzogbnVtYmVyKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9JTlZBTElEX1NFVFRJTkdfVkFMVUVcIixcbiAgICAgIGBJbnZhbGlkIHZhbHVlIGZvciBzZXR0aW5nIFwiJHtuYW1lfVwiOiAke2FjdHVhbH1gLFxuICAgICk7XG4gICAgdGhpcy5hY3R1YWwgPSBhY3R1YWw7XG4gICAgaWYgKG1pbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICB0aGlzLm1pbiA9IG1pbjtcbiAgICAgIHRoaXMubWF4ID0gbWF4O1xuICAgIH1cbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9TVFJFQU1fQ0FOQ0VMIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgb3ZlcnJpZGUgY2F1c2U/OiBFcnJvcjtcbiAgY29uc3RydWN0b3IoZXJyb3I6IEVycm9yKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9TVFJFQU1fQ0FOQ0VMXCIsXG4gICAgICB0eXBlb2YgZXJyb3IubWVzc2FnZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgICA/IGBUaGUgcGVuZGluZyBzdHJlYW0gaGFzIGJlZW4gY2FuY2VsZWQgKGNhdXNlZCBieTogJHtlcnJvci5tZXNzYWdlfSlgXG4gICAgICAgIDogXCJUaGUgcGVuZGluZyBzdHJlYW0gaGFzIGJlZW4gY2FuY2VsZWRcIixcbiAgICApO1xuICAgIGlmIChlcnJvcikge1xuICAgICAgdGhpcy5jYXVzZSA9IGVycm9yO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfQUREUkVTU19GQU1JTFkgZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGhvc3Q6IHN0cmluZztcbiAgcG9ydDogbnVtYmVyO1xuICBjb25zdHJ1Y3RvcihhZGRyZXNzVHlwZTogc3RyaW5nLCBob3N0OiBzdHJpbmcsIHBvcnQ6IG51bWJlcikge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSU5WQUxJRF9BRERSRVNTX0ZBTUlMWVwiLFxuICAgICAgYEludmFsaWQgYWRkcmVzcyBmYW1pbHk6ICR7YWRkcmVzc1R5cGV9ICR7aG9zdH06JHtwb3J0fWAsXG4gICAgKTtcbiAgICB0aGlzLmhvc3QgPSBob3N0O1xuICAgIHRoaXMucG9ydCA9IHBvcnQ7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX0NIQVIgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IobmFtZTogc3RyaW5nLCBmaWVsZD86IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSU5WQUxJRF9DSEFSXCIsXG4gICAgICBmaWVsZFxuICAgICAgICA/IGBJbnZhbGlkIGNoYXJhY3RlciBpbiAke25hbWV9YFxuICAgICAgICA6IGBJbnZhbGlkIGNoYXJhY3RlciBpbiAke25hbWV9IFtcIiR7ZmllbGR9XCJdYCxcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9PUFRfVkFMVUUgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IobmFtZTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bikge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSU5WQUxJRF9PUFRfVkFMVUVcIixcbiAgICAgIGBUaGUgdmFsdWUgXCIke3ZhbHVlfVwiIGlzIGludmFsaWQgZm9yIG9wdGlvbiBcIiR7bmFtZX1cImAsXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfUkVUVVJOX1BST1BFUlRZIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKGlucHV0OiBzdHJpbmcsIG5hbWU6IHN0cmluZywgcHJvcDogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9JTlZBTElEX1JFVFVSTl9QUk9QRVJUWVwiLFxuICAgICAgYEV4cGVjdGVkIGEgdmFsaWQgJHtpbnB1dH0gdG8gYmUgcmV0dXJuZWQgZm9yIHRoZSBcIiR7cHJvcH1cIiBmcm9tIHRoZSBcIiR7bmFtZX1cIiBmdW5jdGlvbiBidXQgZ290ICR7dmFsdWV9LmAsXG4gICAgKTtcbiAgfVxufVxuXG4vLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuZnVuY3Rpb24gYnVpbGRSZXR1cm5Qcm9wZXJ0eVR5cGUodmFsdWU6IGFueSkge1xuICBpZiAodmFsdWUgJiYgdmFsdWUuY29uc3RydWN0b3IgJiYgdmFsdWUuY29uc3RydWN0b3IubmFtZSkge1xuICAgIHJldHVybiBgaW5zdGFuY2Ugb2YgJHt2YWx1ZS5jb25zdHJ1Y3Rvci5uYW1lfWA7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGB0eXBlICR7dHlwZW9mIHZhbHVlfWA7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX1JFVFVSTl9QUk9QRVJUWV9WQUxVRSBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihpbnB1dDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIHByb3A6IHN0cmluZywgdmFsdWU6IHVua25vd24pIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0lOVkFMSURfUkVUVVJOX1BST1BFUlRZX1ZBTFVFXCIsXG4gICAgICBgRXhwZWN0ZWQgJHtpbnB1dH0gdG8gYmUgcmV0dXJuZWQgZm9yIHRoZSBcIiR7cHJvcH1cIiBmcm9tIHRoZSBcIiR7bmFtZX1cIiBmdW5jdGlvbiBidXQgZ290ICR7XG4gICAgICAgIGJ1aWxkUmV0dXJuUHJvcGVydHlUeXBlKFxuICAgICAgICAgIHZhbHVlLFxuICAgICAgICApXG4gICAgICB9LmAsXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfUkVUVVJOX1ZBTFVFIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKGlucHV0OiBzdHJpbmcsIG5hbWU6IHN0cmluZywgdmFsdWU6IHVua25vd24pIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0lOVkFMSURfUkVUVVJOX1ZBTFVFXCIsXG4gICAgICBgRXhwZWN0ZWQgJHtpbnB1dH0gdG8gYmUgcmV0dXJuZWQgZnJvbSB0aGUgXCIke25hbWV9XCIgZnVuY3Rpb24gYnV0IGdvdCAke1xuICAgICAgICBidWlsZFJldHVyblByb3BlcnR5VHlwZShcbiAgICAgICAgICB2YWx1ZSxcbiAgICAgICAgKVxuICAgICAgfS5gLFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX1VSTCBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBpbnB1dDogc3RyaW5nO1xuICBjb25zdHJ1Y3RvcihpbnB1dDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfSU5WQUxJRF9VUkxcIiwgYEludmFsaWQgVVJMOiAke2lucHV0fWApO1xuICAgIHRoaXMuaW5wdXQgPSBpbnB1dDtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfVVJMX1NDSEVNRSBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihleHBlY3RlZDogc3RyaW5nIHwgW3N0cmluZ10gfCBbc3RyaW5nLCBzdHJpbmddKSB7XG4gICAgZXhwZWN0ZWQgPSBBcnJheS5pc0FycmF5KGV4cGVjdGVkKSA/IGV4cGVjdGVkIDogW2V4cGVjdGVkXTtcbiAgICBjb25zdCByZXMgPSBleHBlY3RlZC5sZW5ndGggPT09IDJcbiAgICAgID8gYG9uZSBvZiBzY2hlbWUgJHtleHBlY3RlZFswXX0gb3IgJHtleHBlY3RlZFsxXX1gXG4gICAgICA6IGBvZiBzY2hlbWUgJHtleHBlY3RlZFswXX1gO1xuICAgIHN1cGVyKFwiRVJSX0lOVkFMSURfVVJMX1NDSEVNRVwiLCBgVGhlIFVSTCBtdXN0IGJlICR7cmVzfWApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfTU9EVUxFX05PVF9GT1VORCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHBhdGg6IHN0cmluZywgYmFzZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcgPSBcInBhY2thZ2VcIikge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfTU9EVUxFX05PVF9GT1VORFwiLFxuICAgICAgYENhbm5vdCBmaW5kICR7dHlwZX0gJyR7cGF0aH0nIGltcG9ydGVkIGZyb20gJHtiYXNlfWAsXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfUEFDS0FHRV9DT05GSUcgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihwYXRoOiBzdHJpbmcsIGJhc2U/OiBzdHJpbmcsIG1lc3NhZ2U/OiBzdHJpbmcpIHtcbiAgICBjb25zdCBtc2cgPSBgSW52YWxpZCBwYWNrYWdlIGNvbmZpZyAke3BhdGh9JHtcbiAgICAgIGJhc2UgPyBgIHdoaWxlIGltcG9ydGluZyAke2Jhc2V9YCA6IFwiXCJcbiAgICB9JHttZXNzYWdlID8gYC4gJHttZXNzYWdlfWAgOiBcIlwifWA7XG4gICAgc3VwZXIoXCJFUlJfSU5WQUxJRF9QQUNLQUdFX0NPTkZJR1wiLCBtc2cpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9NT0RVTEVfU1BFQ0lGSUVSIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHJlcXVlc3Q6IHN0cmluZywgcmVhc29uOiBzdHJpbmcsIGJhc2U/OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0lOVkFMSURfTU9EVUxFX1NQRUNJRklFUlwiLFxuICAgICAgYEludmFsaWQgbW9kdWxlIFwiJHtyZXF1ZXN0fVwiICR7cmVhc29ufSR7XG4gICAgICAgIGJhc2UgPyBgIGltcG9ydGVkIGZyb20gJHtiYXNlfWAgOiBcIlwiXG4gICAgICB9YCxcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9QQUNLQUdFX1RBUkdFVCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHBrZ1BhdGg6IHN0cmluZyxcbiAgICBrZXk6IHN0cmluZyxcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIHRhcmdldDogYW55LFxuICAgIGlzSW1wb3J0PzogYm9vbGVhbixcbiAgICBiYXNlPzogc3RyaW5nLFxuICApIHtcbiAgICBsZXQgbXNnOiBzdHJpbmc7XG4gICAgY29uc3QgcmVsRXJyb3IgPSB0eXBlb2YgdGFyZ2V0ID09PSBcInN0cmluZ1wiICYmXG4gICAgICAhaXNJbXBvcnQgJiZcbiAgICAgIHRhcmdldC5sZW5ndGggJiZcbiAgICAgICF0YXJnZXQuc3RhcnRzV2l0aChcIi4vXCIpO1xuICAgIGlmIChrZXkgPT09IFwiLlwiKSB7XG4gICAgICBhc3NlcnQoaXNJbXBvcnQgPT09IGZhbHNlKTtcbiAgICAgIG1zZyA9IGBJbnZhbGlkIFwiZXhwb3J0c1wiIG1haW4gdGFyZ2V0ICR7SlNPTi5zdHJpbmdpZnkodGFyZ2V0KX0gZGVmaW5lZCBgICtcbiAgICAgICAgYGluIHRoZSBwYWNrYWdlIGNvbmZpZyAke3BrZ1BhdGh9cGFja2FnZS5qc29uJHtcbiAgICAgICAgICBiYXNlID8gYCBpbXBvcnRlZCBmcm9tICR7YmFzZX1gIDogXCJcIlxuICAgICAgICB9JHtyZWxFcnJvciA/ICc7IHRhcmdldHMgbXVzdCBzdGFydCB3aXRoIFwiLi9cIicgOiBcIlwifWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIG1zZyA9IGBJbnZhbGlkIFwiJHtpc0ltcG9ydCA/IFwiaW1wb3J0c1wiIDogXCJleHBvcnRzXCJ9XCIgdGFyZ2V0ICR7XG4gICAgICAgIEpTT04uc3RyaW5naWZ5KFxuICAgICAgICAgIHRhcmdldCxcbiAgICAgICAgKVxuICAgICAgfSBkZWZpbmVkIGZvciAnJHtrZXl9JyBpbiB0aGUgcGFja2FnZSBjb25maWcgJHtwa2dQYXRofXBhY2thZ2UuanNvbiR7XG4gICAgICAgIGJhc2UgPyBgIGltcG9ydGVkIGZyb20gJHtiYXNlfWAgOiBcIlwiXG4gICAgICB9JHtyZWxFcnJvciA/ICc7IHRhcmdldHMgbXVzdCBzdGFydCB3aXRoIFwiLi9cIicgOiBcIlwifWA7XG4gICAgfVxuICAgIHN1cGVyKFwiRVJSX0lOVkFMSURfUEFDS0FHRV9UQVJHRVRcIiwgbXNnKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX1BBQ0tBR0VfSU1QT1JUX05PVF9ERUZJTkVEIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHNwZWNpZmllcjogc3RyaW5nLFxuICAgIHBhY2thZ2VQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQsXG4gICAgYmFzZTogc3RyaW5nLFxuICApIHtcbiAgICBjb25zdCBtc2cgPSBgUGFja2FnZSBpbXBvcnQgc3BlY2lmaWVyIFwiJHtzcGVjaWZpZXJ9XCIgaXMgbm90IGRlZmluZWQke1xuICAgICAgcGFja2FnZVBhdGggPyBgIGluIHBhY2thZ2UgJHtwYWNrYWdlUGF0aH1wYWNrYWdlLmpzb25gIDogXCJcIlxuICAgIH0gaW1wb3J0ZWQgZnJvbSAke2Jhc2V9YDtcblxuICAgIHN1cGVyKFwiRVJSX1BBQ0tBR0VfSU1QT1JUX05PVF9ERUZJTkVEXCIsIG1zZyk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9QQUNLQUdFX1BBVEhfTk9UX0VYUE9SVEVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3Ioc3VicGF0aDogc3RyaW5nLCBwa2dQYXRoOiBzdHJpbmcsIGJhc2VQYXRoPzogc3RyaW5nKSB7XG4gICAgbGV0IG1zZzogc3RyaW5nO1xuICAgIGlmIChzdWJwYXRoID09PSBcIi5cIikge1xuICAgICAgbXNnID0gYE5vIFwiZXhwb3J0c1wiIG1haW4gZGVmaW5lZCBpbiAke3BrZ1BhdGh9cGFja2FnZS5qc29uJHtcbiAgICAgICAgYmFzZVBhdGggPyBgIGltcG9ydGVkIGZyb20gJHtiYXNlUGF0aH1gIDogXCJcIlxuICAgICAgfWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIG1zZyA9XG4gICAgICAgIGBQYWNrYWdlIHN1YnBhdGggJyR7c3VicGF0aH0nIGlzIG5vdCBkZWZpbmVkIGJ5IFwiZXhwb3J0c1wiIGluICR7cGtnUGF0aH1wYWNrYWdlLmpzb24ke1xuICAgICAgICAgIGJhc2VQYXRoID8gYCBpbXBvcnRlZCBmcm9tICR7YmFzZVBhdGh9YCA6IFwiXCJcbiAgICAgICAgfWA7XG4gICAgfVxuXG4gICAgc3VwZXIoXCJFUlJfUEFDS0FHRV9QQVRIX05PVF9FWFBPUlRFRFwiLCBtc2cpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfSU5URVJOQUxfQVNTRVJUSU9OIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IobWVzc2FnZT86IHN0cmluZykge1xuICAgIGNvbnN0IHN1ZmZpeCA9IFwiVGhpcyBpcyBjYXVzZWQgYnkgZWl0aGVyIGEgYnVnIGluIE5vZGUuanMgXCIgK1xuICAgICAgXCJvciBpbmNvcnJlY3QgdXNhZ2Ugb2YgTm9kZS5qcyBpbnRlcm5hbHMuXFxuXCIgK1xuICAgICAgXCJQbGVhc2Ugb3BlbiBhbiBpc3N1ZSB3aXRoIHRoaXMgc3RhY2sgdHJhY2UgYXQgXCIgK1xuICAgICAgXCJodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvaXNzdWVzXFxuXCI7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9JTlRFUk5BTF9BU1NFUlRJT05cIixcbiAgICAgIG1lc3NhZ2UgPT09IHVuZGVmaW5lZCA/IHN1ZmZpeCA6IGAke21lc3NhZ2V9XFxuJHtzdWZmaXh9YCxcbiAgICApO1xuICB9XG59XG5cbi8vIFVzaW5nIGBmcy5ybWRpcmAgb24gYSBwYXRoIHRoYXQgaXMgYSBmaWxlIHJlc3VsdHMgaW4gYW4gRU5PRU5UIGVycm9yIG9uIFdpbmRvd3MgYW5kIGFuIEVOT1RESVIgZXJyb3Igb24gUE9TSVguXG5leHBvcnQgY2xhc3MgRVJSX0ZTX1JNRElSX0VOT1RESVIgZXh0ZW5kcyBOb2RlU3lzdGVtRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBjb2RlID0gaXNXaW5kb3dzID8gXCJFTk9FTlRcIiA6IFwiRU5PVERJUlwiO1xuICAgIGNvbnN0IGN0eDogTm9kZVN5c3RlbUVycm9yQ3R4ID0ge1xuICAgICAgbWVzc2FnZTogXCJub3QgYSBkaXJlY3RvcnlcIixcbiAgICAgIHBhdGgsXG4gICAgICBzeXNjYWxsOiBcInJtZGlyXCIsXG4gICAgICBjb2RlLFxuICAgICAgZXJybm86IGlzV2luZG93cyA/IEVOT0VOVCA6IEVOT1RESVIsXG4gICAgfTtcbiAgICBzdXBlcihjb2RlLCBjdHgsIFwiUGF0aCBpcyBub3QgYSBkaXJlY3RvcnlcIik7XG4gIH1cbn1cblxuaW50ZXJmYWNlIFV2RXhjZXB0aW9uQ29udGV4dCB7XG4gIHN5c2NhbGw6IHN0cmluZztcbn1cbmV4cG9ydCBmdW5jdGlvbiBkZW5vRXJyb3JUb05vZGVFcnJvcihlOiBFcnJvciwgY3R4OiBVdkV4Y2VwdGlvbkNvbnRleHQpIHtcbiAgY29uc3QgZXJybm8gPSBleHRyYWN0T3NFcnJvck51bWJlckZyb21FcnJvck1lc3NhZ2UoZSk7XG4gIGlmICh0eXBlb2YgZXJybm8gPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICByZXR1cm4gZTtcbiAgfVxuXG4gIGNvbnN0IGV4ID0gdXZFeGNlcHRpb24oe1xuICAgIGVycm5vOiBtYXBTeXNFcnJub1RvVXZFcnJubyhlcnJubyksXG4gICAgLi4uY3R4LFxuICB9KTtcbiAgcmV0dXJuIGV4O1xufVxuXG5mdW5jdGlvbiBleHRyYWN0T3NFcnJvck51bWJlckZyb21FcnJvck1lc3NhZ2UoZTogdW5rbm93bik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IG1hdGNoID0gZSBpbnN0YW5jZW9mIEVycm9yXG4gICAgPyBlLm1lc3NhZ2UubWF0Y2goL1xcKG9zIGVycm9yIChcXGQrKVxcKS8pXG4gICAgOiBmYWxzZTtcblxuICBpZiAobWF0Y2gpIHtcbiAgICByZXR1cm4gK21hdGNoWzFdO1xuICB9XG5cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbm5SZXNldEV4Y2VwdGlvbihtc2c6IHN0cmluZykge1xuICBjb25zdCBleCA9IG5ldyBFcnJvcihtc2cpO1xuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAoZXggYXMgYW55KS5jb2RlID0gXCJFQ09OTlJFU0VUXCI7XG4gIHJldHVybiBleDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFnZ3JlZ2F0ZVR3b0Vycm9ycyhcbiAgaW5uZXJFcnJvcjogQWdncmVnYXRlRXJyb3IsXG4gIG91dGVyRXJyb3I6IEFnZ3JlZ2F0ZUVycm9yICYgeyBjb2RlOiBzdHJpbmcgfSxcbikge1xuICBpZiAoaW5uZXJFcnJvciAmJiBvdXRlckVycm9yICYmIGlubmVyRXJyb3IgIT09IG91dGVyRXJyb3IpIHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShvdXRlckVycm9yLmVycm9ycykpIHtcbiAgICAgIC8vIElmIGBvdXRlckVycm9yYCBpcyBhbHJlYWR5IGFuIGBBZ2dyZWdhdGVFcnJvcmAuXG4gICAgICBvdXRlckVycm9yLmVycm9ycy5wdXNoKGlubmVyRXJyb3IpO1xuICAgICAgcmV0dXJuIG91dGVyRXJyb3I7XG4gICAgfVxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuICAgIGNvbnN0IGVyciA9IG5ldyBBZ2dyZWdhdGVFcnJvcihcbiAgICAgIFtcbiAgICAgICAgb3V0ZXJFcnJvcixcbiAgICAgICAgaW5uZXJFcnJvcixcbiAgICAgIF0sXG4gICAgICBvdXRlckVycm9yLm1lc3NhZ2UsXG4gICAgKTtcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIChlcnIgYXMgYW55KS5jb2RlID0gb3V0ZXJFcnJvci5jb2RlO1xuICAgIHJldHVybiBlcnI7XG4gIH1cbiAgcmV0dXJuIGlubmVyRXJyb3IgfHwgb3V0ZXJFcnJvcjtcbn1cbmNvZGVzLkVSUl9JUENfQ0hBTk5FTF9DTE9TRUQgPSBFUlJfSVBDX0NIQU5ORUxfQ0xPU0VEO1xuY29kZXMuRVJSX0lOVkFMSURfQVJHX1RZUEUgPSBFUlJfSU5WQUxJRF9BUkdfVFlQRTtcbmNvZGVzLkVSUl9JTlZBTElEX0FSR19WQUxVRSA9IEVSUl9JTlZBTElEX0FSR19WQUxVRTtcbmNvZGVzLkVSUl9JTlZBTElEX0NBTExCQUNLID0gRVJSX0lOVkFMSURfQ0FMTEJBQ0s7XG5jb2Rlcy5FUlJfT1VUX09GX1JBTkdFID0gRVJSX09VVF9PRl9SQU5HRTtcbmNvZGVzLkVSUl9TT0NLRVRfQkFEX1BPUlQgPSBFUlJfU09DS0VUX0JBRF9QT1JUO1xuY29kZXMuRVJSX0JVRkZFUl9PVVRfT0ZfQk9VTkRTID0gRVJSX0JVRkZFUl9PVVRfT0ZfQk9VTkRTO1xuY29kZXMuRVJSX1VOS05PV05fRU5DT0RJTkcgPSBFUlJfVU5LTk9XTl9FTkNPRElORztcbi8vIFRPRE8oa3Qzayk6IGFzc2lnbiBhbGwgZXJyb3IgY2xhc3NlcyBoZXJlLlxuXG5leHBvcnQgeyBjb2RlcywgaGlkZVN0YWNrRnJhbWVzIH07XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgQWJvcnRFcnJvcixcbiAgYWdncmVnYXRlVHdvRXJyb3JzLFxuICBjb2Rlcyxcbn07XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBQzFFLG9FQUFvRTtBQUNwRTs7Ozs7Ozs7Ozs7O2VBWWUsR0FFZixTQUFTLGtCQUFrQixRQUFRLGFBQWE7QUFDaEQsU0FBUyxPQUFPLFFBQVEsK0JBQStCO0FBQ3ZELFNBQVMsS0FBSyxRQUFRLG1CQUFtQjtBQUN6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