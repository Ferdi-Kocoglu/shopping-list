// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
import { notImplemented } from "./_utils.ts";
import { EventEmitter } from "./events.ts";
import { isIP, isIPv4, isIPv6, normalizedArgsSymbol } from "./internal/net.ts";
import { Duplex } from "./stream.ts";
import { asyncIdSymbol, defaultTriggerAsyncIdScope, newAsyncId, ownerSymbol } from "./internal/async_hooks.ts";
import { ERR_INVALID_ADDRESS_FAMILY, ERR_INVALID_ARG_TYPE, ERR_INVALID_ARG_VALUE, ERR_INVALID_FD_TYPE, ERR_INVALID_IP_ADDRESS, ERR_MISSING_ARGS, ERR_SERVER_ALREADY_LISTEN, ERR_SERVER_NOT_RUNNING, ERR_SOCKET_CLOSED, errnoException, exceptionWithHostPort, NodeError, uvExceptionWithHostPort } from "./internal/errors.ts";
import { isUint8Array } from "./internal/util/types.ts";
import { kAfterAsyncWrite, kBuffer, kBufferCb, kBufferGen, kHandle, kUpdateTimer, onStreamRead, setStreamTimeout, writeGeneric, writevGeneric } from "./internal/stream_base_commons.ts";
import { kTimeout } from "./internal/timers.mjs";
import { nextTick } from "./_next_tick.ts";
import { DTRACE_NET_SERVER_CONNECTION, DTRACE_NET_STREAM_END } from "./internal/dtrace.ts";
import { Buffer } from "./buffer.ts";
import { validateAbortSignal, validateFunction, validateInt32, validateNumber, validatePort, validateString } from "./internal/validators.mjs";
import { constants as TCPConstants, TCP, TCPConnectWrap } from "./internal_binding/tcp_wrap.ts";
import { constants as PipeConstants, Pipe, PipeConnectWrap } from "./internal_binding/pipe_wrap.ts";
import { ShutdownWrap } from "./internal_binding/stream_wrap.ts";
import { assert } from "../_util/assert.ts";
import { isWindows } from "../_util/os.ts";
import { ADDRCONFIG, lookup as dnsLookup } from "./dns.ts";
import { codeMap } from "./internal_binding/uv.ts";
import { guessHandleType } from "./internal_binding/util.ts";
import { debuglog } from "./internal/util/debuglog.ts";
let debug = debuglog("net", (fn)=>{
  debug = fn;
});
const kLastWriteQueueSize = Symbol("lastWriteQueueSize");
const kSetNoDelay = Symbol("kSetNoDelay");
const kBytesRead = Symbol("kBytesRead");
const kBytesWritten = Symbol("kBytesWritten");
const DEFAULT_IPV4_ADDR = "0.0.0.0";
const DEFAULT_IPV6_ADDR = "::";
function _getNewAsyncId(handle) {
  return !handle || typeof handle.getAsyncId !== "function" ? newAsyncId() : handle.getAsyncId();
}
const _noop = (_arrayBuffer, _nread)=>{
  return;
};
function _toNumber(x) {
  return (x = Number(x)) >= 0 ? x : false;
}
function _isPipeName(s) {
  return typeof s === "string" && _toNumber(s) === false;
}
function _createHandle(fd, isServer) {
  validateInt32(fd, "fd", 0);
  const type = guessHandleType(fd);
  if (type === "PIPE") {
    return new Pipe(isServer ? PipeConstants.SERVER : PipeConstants.SOCKET);
  }
  if (type === "TCP") {
    return new TCP(isServer ? TCPConstants.SERVER : TCPConstants.SOCKET);
  }
  throw new ERR_INVALID_FD_TYPE(type);
}
// Returns an array [options, cb], where options is an object,
// cb is either a function or null.
// Used to normalize arguments of `Socket.prototype.connect()` and
// `Server.prototype.listen()`. Possible combinations of parameters:
// - (options[...][, cb])
// - (path[...][, cb])
// - ([port][, host][...][, cb])
// For `Socket.prototype.connect()`, the [...] part is ignored
// For `Server.prototype.listen()`, the [...] part is [, backlog]
// but will not be handled here (handled in listen())
export function _normalizeArgs(args) {
  let arr;
  if (args.length === 0) {
    arr = [
      {},
      null
    ];
    arr[normalizedArgsSymbol] = true;
    return arr;
  }
  const arg0 = args[0];
  let options = {};
  if (typeof arg0 === "object" && arg0 !== null) {
    // (options[...][, cb])
    options = arg0;
  } else if (_isPipeName(arg0)) {
    // (path[...][, cb])
    options.path = arg0;
  } else {
    // ([port][, host][...][, cb])
    options.port = arg0;
    if (args.length > 1 && typeof args[1] === "string") {
      options.host = args[1];
    }
  }
  const cb = args[args.length - 1];
  if (!_isConnectionListener(cb)) {
    arr = [
      options,
      null
    ];
  } else {
    arr = [
      options,
      cb
    ];
  }
  arr[normalizedArgsSymbol] = true;
  return arr;
}
function _isTCPConnectWrap(req) {
  return "localAddress" in req && "localPort" in req;
}
function _afterConnect(status, // deno-lint-ignore no-explicit-any
handle, req, readable, writable) {
  let socket = handle[ownerSymbol];
  if (socket.constructor.name === "ReusedHandle") {
    socket = socket.handle;
  }
  // Callback may come after call to destroy
  if (socket.destroyed) {
    return;
  }
  debug("afterConnect");
  assert(socket.connecting);
  socket.connecting = false;
  socket._sockname = null;
  if (status === 0) {
    if (socket.readable && !readable) {
      socket.push(null);
      socket.read();
    }
    if (socket.writable && !writable) {
      socket.end();
    }
    socket._unrefTimer();
    socket.emit("connect");
    socket.emit("ready");
    // Start the first read, or get an immediate EOF.
    // this doesn't actually consume any bytes, because len=0.
    if (readable && !socket.isPaused()) {
      socket.read(0);
    }
  } else {
    socket.connecting = false;
    let details;
    if (_isTCPConnectWrap(req)) {
      details = req.localAddress + ":" + req.localPort;
    }
    const ex = exceptionWithHostPort(status, "connect", req.address, req.port, details);
    if (_isTCPConnectWrap(req)) {
      ex.localAddress = req.localAddress;
      ex.localPort = req.localPort;
    }
    socket.destroy(ex);
  }
}
function _checkBindError(err, port, handle) {
  // EADDRINUSE may not be reported until we call `listen()` or `connect()`.
  // To complicate matters, a failed `bind()` followed by `listen()` or `connect()`
  // will implicitly bind to a random port. Ergo, check that the socket is
  // bound to the expected port before calling `listen()` or `connect()`.
  if (err === 0 && port > 0 && handle.getsockname) {
    const out = {};
    err = handle.getsockname(out);
    if (err === 0 && port !== out.port) {
      err = codeMap.get("EADDRINUSE");
    }
  }
  return err;
}
function _isPipe(options) {
  return "path" in options && !!options.path;
}
function _connectErrorNT(socket, err) {
  socket.destroy(err);
}
function _internalConnect(socket, address, port, addressType, localAddress, localPort, flags) {
  assert(socket.connecting);
  let err;
  if (localAddress || localPort) {
    if (addressType === 4) {
      localAddress = localAddress || DEFAULT_IPV4_ADDR;
      err = socket._handle.bind(localAddress, localPort);
    } else {
      // addressType === 6
      localAddress = localAddress || DEFAULT_IPV6_ADDR;
      err = socket._handle.bind6(localAddress, localPort, flags);
    }
    debug("binding to localAddress: %s and localPort: %d (addressType: %d)", localAddress, localPort, addressType);
    err = _checkBindError(err, localPort, socket._handle);
    if (err) {
      const ex = exceptionWithHostPort(err, "bind", localAddress, localPort);
      socket.destroy(ex);
      return;
    }
  }
  if (addressType === 6 || addressType === 4) {
    const req = new TCPConnectWrap();
    req.oncomplete = _afterConnect;
    req.address = address;
    req.port = port;
    req.localAddress = localAddress;
    req.localPort = localPort;
    if (addressType === 4) {
      err = socket._handle.connect(req, address, port);
    } else {
      err = socket._handle.connect6(req, address, port);
    }
  } else {
    const req = new PipeConnectWrap();
    req.oncomplete = _afterConnect;
    req.address = address;
    err = socket._handle.connect(req, address, _afterConnect);
  }
  if (err) {
    let details = "";
    const sockname = socket._getsockname();
    if (sockname) {
      details = `${sockname.address}:${sockname.port}`;
    }
    const ex = exceptionWithHostPort(err, "connect", address, port, details);
    socket.destroy(ex);
  }
}
// Provide a better error message when we call end() as a result
// of the other side sending a FIN.  The standard "write after end"
// is overly vague, and makes it seem like the user's code is to blame.
function _writeAfterFIN(// deno-lint-ignore no-explicit-any
chunk, encoding, cb) {
  if (!this.writableEnded) {
    return Duplex.prototype.write.call(this, chunk, encoding, // @ts-expect-error Using `call` seem to be interfering with the overload for write
    cb);
  }
  if (typeof encoding === "function") {
    cb = encoding;
    encoding = null;
  }
  const err = new NodeError("EPIPE", "This socket has been ended by the other party");
  if (typeof cb === "function") {
    defaultTriggerAsyncIdScope(this[asyncIdSymbol], nextTick, cb, err);
  }
  this.destroy(err);
  return false;
}
function _tryReadStart(socket) {
  // Not already reading, start the flow.
  debug("Socket._handle.readStart");
  socket._handle.reading = true;
  const err = socket._handle.readStart();
  if (err) {
    socket.destroy(errnoException(err, "read"));
  }
}
// Called when the "end" event is emitted.
function _onReadableStreamEnd() {
  if (!this.allowHalfOpen) {
    this.write = _writeAfterFIN;
  }
}
// Called when creating new Socket, or when re-using a closed Socket
function _initSocketHandle(socket) {
  socket._undestroy();
  socket._sockname = undefined;
  // Handle creation may be deferred to bind() or connect() time.
  if (socket._handle) {
    // deno-lint-ignore no-explicit-any
    socket._handle[ownerSymbol] = socket;
    socket._handle.onread = onStreamRead;
    socket[asyncIdSymbol] = _getNewAsyncId(socket._handle);
    let userBuf = socket[kBuffer];
    if (userBuf) {
      const bufGen = socket[kBufferGen];
      if (bufGen !== null) {
        userBuf = bufGen();
        if (!isUint8Array(userBuf)) {
          return;
        }
        socket[kBuffer] = userBuf;
      }
      socket._handle.useUserBuffer(userBuf);
    }
  }
}
function _lookupAndConnect(self, options) {
  const { localAddress, localPort } = options;
  const host = options.host || "localhost";
  let { port } = options;
  if (localAddress && !isIP(localAddress)) {
    throw new ERR_INVALID_IP_ADDRESS(localAddress);
  }
  if (localPort) {
    validateNumber(localPort, "options.localPort");
  }
  if (typeof port !== "undefined") {
    if (typeof port !== "number" && typeof port !== "string") {
      throw new ERR_INVALID_ARG_TYPE("options.port", [
        "number",
        "string"
      ], port);
    }
    validatePort(port);
  }
  port |= 0;
  // If host is an IP, skip performing a lookup
  const addressType = isIP(host);
  if (addressType) {
    defaultTriggerAsyncIdScope(self[asyncIdSymbol], nextTick, ()=>{
      if (self.connecting) {
        defaultTriggerAsyncIdScope(self[asyncIdSymbol], _internalConnect, self, host, port, addressType, localAddress, localPort);
      }
    });
    return;
  }
  if (options.lookup !== undefined) {
    validateFunction(options.lookup, "options.lookup");
  }
  const dnsOpts = {
    family: options.family,
    hints: options.hints || 0
  };
  if (!isWindows && dnsOpts.family !== 4 && dnsOpts.family !== 6 && dnsOpts.hints === 0) {
    dnsOpts.hints = ADDRCONFIG;
  }
  debug("connect: find host", host);
  debug("connect: dns options", dnsOpts);
  self._host = host;
  const lookup = options.lookup || dnsLookup;
  defaultTriggerAsyncIdScope(self[asyncIdSymbol], function() {
    lookup(host, dnsOpts, function emitLookup(err, ip, addressType) {
      self.emit("lookup", err, ip, addressType, host);
      // It's possible we were destroyed while looking this up.
      // XXX it would be great if we could cancel the promise returned by
      // the look up.
      if (!self.connecting) {
        return;
      }
      if (err) {
        // net.createConnection() creates a net.Socket object and immediately
        // calls net.Socket.connect() on it (that's us). There are no event
        // listeners registered yet so defer the error event to the next tick.
        nextTick(_connectErrorNT, self, err);
      } else if (!isIP(ip)) {
        err = new ERR_INVALID_IP_ADDRESS(ip);
        nextTick(_connectErrorNT, self, err);
      } else if (addressType !== 4 && addressType !== 6) {
        err = new ERR_INVALID_ADDRESS_FAMILY(`${addressType}`, options.host, options.port);
        nextTick(_connectErrorNT, self, err);
      } else {
        self._unrefTimer();
        defaultTriggerAsyncIdScope(self[asyncIdSymbol], _internalConnect, self, ip, port, addressType, localAddress, localPort);
      }
    });
  });
}
function _afterShutdown() {
  // deno-lint-ignore no-explicit-any
  const self = this.handle[ownerSymbol];
  debug("afterShutdown destroyed=%j", self.destroyed, self._readableState);
  this.callback();
}
function _emitCloseNT(socket) {
  debug("SERVER: emit close");
  socket.emit("close");
}
/**
 * This class is an abstraction of a TCP socket or a streaming `IPC` endpoint
 * (uses named pipes on Windows, and Unix domain sockets otherwise). It is also
 * an `EventEmitter`.
 *
 * A `net.Socket` can be created by the user and used directly to interact with
 * a server. For example, it is returned by `createConnection`,
 * so the user can use it to talk to the server.
 *
 * It can also be created by Node.js and passed to the user when a connection
 * is received. For example, it is passed to the listeners of a `"connection"` event emitted on a `Server`, so the user can use
 * it to interact with the client.
 */ export class Socket extends Duplex {
  // Problem with this is that users can supply their own handle, that may not
  // have `handle.getAsyncId()`. In this case an `[asyncIdSymbol]` should
  // probably be supplied by `async_hooks`.
  [asyncIdSymbol] = -1;
  [kHandle] = null;
  [kSetNoDelay] = false;
  [kLastWriteQueueSize] = 0;
  // deno-lint-ignore no-explicit-any
  [kTimeout] = null;
  [kBuffer] = null;
  [kBufferCb] = null;
  [kBufferGen] = null;
  // Used after `.destroy()`
  [kBytesRead] = 0;
  [kBytesWritten] = 0;
  // Reserved properties
  server = null;
  // deno-lint-ignore no-explicit-any
  _server = null;
  _peername;
  _sockname;
  _pendingData = null;
  _pendingEncoding = "";
  _host = null;
  // deno-lint-ignore no-explicit-any
  _parent = null;
  constructor(options){
    if (typeof options === "number") {
      // Legacy interface.
      options = {
        fd: options
      };
    } else {
      options = {
        ...options
      };
    }
    // Default to *not* allowing half open sockets.
    options.allowHalfOpen = Boolean(options.allowHalfOpen);
    // For backwards compat do not emit close on destroy.
    options.emitClose = false;
    options.autoDestroy = true;
    // Handle strings directly.
    options.decodeStrings = false;
    super(options);
    if (options.handle) {
      this._handle = options.handle;
      this[asyncIdSymbol] = _getNewAsyncId(this._handle);
    } else if (options.fd !== undefined) {
      // REF: https://github.com/denoland/deno/issues/6529
      notImplemented();
    }
    const onread = options.onread;
    if (onread !== null && typeof onread === "object" && (isUint8Array(onread.buffer) || typeof onread.buffer === "function") && typeof onread.callback === "function") {
      if (typeof onread.buffer === "function") {
        this[kBuffer] = true;
        this[kBufferGen] = onread.buffer;
      } else {
        this[kBuffer] = onread.buffer;
      }
      this[kBufferCb] = onread.callback;
    }
    this.on("end", _onReadableStreamEnd);
    _initSocketHandle(this);
    // If we have a handle, then start the flow of data into the
    // buffer. If not, then this will happen when we connect.
    if (this._handle && options.readable !== false) {
      if (options.pauseOnCreate) {
        // Stop the handle from reading and pause the stream
        this._handle.reading = false;
        this._handle.readStop();
        // @ts-expect-error This property shouldn't be modified
        this.readableFlowing = false;
      } else if (!options.manualStart) {
        this.read(0);
      }
    }
  }
  connect(...args) {
    let normalized;
    // If passed an array, it's treated as an array of arguments that have
    // already been normalized (so we don't normalize more than once). This has
    // been solved before in https://github.com/nodejs/node/pull/12342, but was
    // reverted as it had unintended side effects.
    if (Array.isArray(args[0]) && args[0][normalizedArgsSymbol]) {
      normalized = args[0];
    } else {
      normalized = _normalizeArgs(args);
    }
    const options = normalized[0];
    const cb = normalized[1];
    // `options.port === null` will be checked later.
    if (options.port === undefined && options.path == null) {
      throw new ERR_MISSING_ARGS([
        "options",
        "port",
        "path"
      ]);
    }
    if (this.write !== Socket.prototype.write) {
      this.write = Socket.prototype.write;
    }
    if (this.destroyed) {
      this._handle = null;
      this._peername = undefined;
      this._sockname = undefined;
    }
    const { path } = options;
    const pipe = _isPipe(options);
    debug("pipe", pipe, path);
    if (!this._handle) {
      this._handle = pipe ? new Pipe(PipeConstants.SOCKET) : new TCP(TCPConstants.SOCKET);
      _initSocketHandle(this);
    }
    if (cb !== null) {
      this.once("connect", cb);
    }
    this._unrefTimer();
    this.connecting = true;
    if (pipe) {
      validateString(path, "options.path");
      defaultTriggerAsyncIdScope(this[asyncIdSymbol], _internalConnect, this, path);
    } else {
      _lookupAndConnect(this, options);
    }
    return this;
  }
  /**
   * Pauses the reading of data. That is, `"data"` events will not be emitted.
   * Useful to throttle back an upload.
   *
   * @return The socket itself.
   */ pause() {
    if (this[kBuffer] && !this.connecting && this._handle && this._handle.reading) {
      this._handle.reading = false;
      if (!this.destroyed) {
        const err = this._handle.readStop();
        if (err) {
          this.destroy(errnoException(err, "read"));
        }
      }
    }
    return Duplex.prototype.pause.call(this);
  }
  /**
   * Resumes reading after a call to `socket.pause()`.
   *
   * @return The socket itself.
   */ resume() {
    if (this[kBuffer] && !this.connecting && this._handle && !this._handle.reading) {
      _tryReadStart(this);
    }
    return Duplex.prototype.resume.call(this);
  }
  /**
   * Sets the socket to timeout after `timeout` milliseconds of inactivity on
   * the socket. By default `net.Socket` do not have a timeout.
   *
   * When an idle timeout is triggered the socket will receive a `"timeout"` event but the connection will not be severed. The user must manually call `socket.end()` or `socket.destroy()` to
   * end the connection.
   *
   * ```ts
   * import { createRequire } from "https://deno.land/std@$STD_VERSION/node/module.ts";
   *
   * const require = createRequire(import.meta.url);
   * const net = require("net");
   *
   * const socket = new net.Socket();
   * socket.setTimeout(3000);
   * socket.on("timeout", () => {
   *   console.log("socket timeout");
   *   socket.end();
   * });
   * ```
   *
   * If `timeout` is `0`, then the existing idle timeout is disabled.
   *
   * The optional `callback` parameter will be added as a one-time listener for the `"timeout"` event.
   * @return The socket itself.
   */ setTimeout = setStreamTimeout;
  /**
   * Enable/disable the use of Nagle's algorithm.
   *
   * When a TCP connection is created, it will have Nagle's algorithm enabled.
   *
   * Nagle's algorithm delays data before it is sent via the network. It attempts
   * to optimize throughput at the expense of latency.
   *
   * Passing `true` for `noDelay` or not passing an argument will disable Nagle's
   * algorithm for the socket. Passing `false` for `noDelay` will enable Nagle's
   * algorithm.
   *
   * @param noDelay
   * @return The socket itself.
   */ setNoDelay(noDelay) {
    if (!this._handle) {
      this.once("connect", noDelay ? this.setNoDelay : ()=>this.setNoDelay(noDelay));
      return this;
    }
    // Backwards compatibility: assume true when `noDelay` is omitted
    const newValue = noDelay === undefined ? true : !!noDelay;
    if ("setNoDelay" in this._handle && this._handle.setNoDelay && newValue !== this[kSetNoDelay]) {
      this[kSetNoDelay] = newValue;
      this._handle.setNoDelay(newValue);
    }
    return this;
  }
  /**
   * Enable/disable keep-alive functionality, and optionally set the initial
   * delay before the first keepalive probe is sent on an idle socket.
   *
   * Set `initialDelay` (in milliseconds) to set the delay between the last
   * data packet received and the first keepalive probe. Setting `0` for`initialDelay` will leave the value unchanged from the default
   * (or previous) setting.
   *
   * Enabling the keep-alive functionality will set the following socket options:
   *
   * - `SO_KEEPALIVE=1`
   * - `TCP_KEEPIDLE=initialDelay`
   * - `TCP_KEEPCNT=10`
   * - `TCP_KEEPINTVL=1`
   *
   * @param enable
   * @param initialDelay
   * @return The socket itself.
   */ setKeepAlive(enable, initialDelay) {
    if (!this._handle) {
      this.once("connect", ()=>this.setKeepAlive(enable, initialDelay));
      return this;
    }
    if ("setKeepAlive" in this._handle) {
      this._handle.setKeepAlive(enable, ~~(initialDelay / 1000));
    }
    return this;
  }
  /**
   * Returns the bound `address`, the address `family` name and `port` of the
   * socket as reported by the operating system:`{ port: 12346, family: "IPv4", address: "127.0.0.1" }`
   */ address() {
    return this._getsockname();
  }
  /**
   * Calling `unref()` on a socket will allow the program to exit if this is the only
   * active socket in the event system. If the socket is already `unref`ed calling`unref()` again will have no effect.
   *
   * @return The socket itself.
   */ unref() {
    if (!this._handle) {
      this.once("connect", this.unref);
      return this;
    }
    if (typeof this._handle.unref === "function") {
      this._handle.unref();
    }
    return this;
  }
  /**
   * Opposite of `unref()`, calling `ref()` on a previously `unref`ed socket will_not_ let the program exit if it's the only socket left (the default behavior).
   * If the socket is `ref`ed calling `ref` again will have no effect.
   *
   * @return The socket itself.
   */ ref() {
    if (!this._handle) {
      this.once("connect", this.ref);
      return this;
    }
    if (typeof this._handle.ref === "function") {
      this._handle.ref();
    }
    return this;
  }
  /**
   * This property shows the number of characters buffered for writing. The buffer
   * may contain strings whose length after encoding is not yet known. So this number
   * is only an approximation of the number of bytes in the buffer.
   *
   * `net.Socket` has the property that `socket.write()` always works. This is to
   * help users get up and running quickly. The computer cannot always keep up
   * with the amount of data that is written to a socket. The network connection
   * simply might be too slow. Node.js will internally queue up the data written to a
   * socket and send it out over the wire when it is possible.
   *
   * The consequence of this internal buffering is that memory may grow.
   * Users who experience large or growing `bufferSize` should attempt to
   * "throttle" the data flows in their program with `socket.pause()` and `socket.resume()`.
   *
   * @deprecated Use `writableLength` instead.
   */ get bufferSize() {
    if (this._handle) {
      return this.writableLength;
    }
    return 0;
  }
  /**
   * The amount of received bytes.
   */ get bytesRead() {
    return this._handle ? this._handle.bytesRead : this[kBytesRead];
  }
  /**
   * The amount of bytes sent.
   */ get bytesWritten() {
    let bytes = this._bytesDispatched;
    const data = this._pendingData;
    const encoding = this._pendingEncoding;
    const writableBuffer = this.writableBuffer;
    if (!writableBuffer) {
      return undefined;
    }
    for (const el of writableBuffer){
      bytes += el.chunk instanceof Buffer ? el.chunk.length : Buffer.byteLength(el.chunk, el.encoding);
    }
    if (Array.isArray(data)) {
      // Was a writev, iterate over chunks to get total length
      for(let i = 0; i < data.length; i++){
        const chunk = data[i];
        // deno-lint-ignore no-explicit-any
        if (data.allBuffers || chunk instanceof Buffer) {
          bytes += chunk.length;
        } else {
          bytes += Buffer.byteLength(chunk.chunk, chunk.encoding);
        }
      }
    } else if (data) {
      // Writes are either a string or a Buffer.
      if (typeof data !== "string") {
        bytes += data.length;
      } else {
        bytes += Buffer.byteLength(data, encoding);
      }
    }
    return bytes;
  }
  /**
   * If `true`,`socket.connect(options[, connectListener])` was
   * called and has not yet finished. It will stay `true` until the socket becomes
   * connected, then it is set to `false` and the `"connect"` event is emitted. Note
   * that the `socket.connect(options[, connectListener])` callback is a listener for the `"connect"` event.
   */ connecting = false;
  /**
   * The string representation of the local IP address the remote client is
   * connecting on. For example, in a server listening on `"0.0.0.0"`, if a client
   * connects on `"192.168.1.1"`, the value of `socket.localAddress` would be`"192.168.1.1"`.
   */ get localAddress() {
    return this._getsockname().address;
  }
  /**
   * The numeric representation of the local port. For example, `80` or `21`.
   */ get localPort() {
    return this._getsockname().port;
  }
  /**
   * The string representation of the remote IP address. For example,`"74.125.127.100"` or `"2001:4860:a005::68"`. Value may be `undefined` if
   * the socket is destroyed (for example, if the client disconnected).
   */ get remoteAddress() {
    return this._getpeername().address;
  }
  /**
   * The string representation of the remote IP family. `"IPv4"` or `"IPv6"`.
   */ get remoteFamily() {
    return this._getpeername().family;
  }
  /**
   * The numeric representation of the remote port. For example, `80` or `21`.
   */ get remotePort() {
    return this._getpeername().port;
  }
  get pending() {
    return !this._handle || this.connecting;
  }
  get readyState() {
    if (this.connecting) {
      return "opening";
    } else if (this.readable && this.writable) {
      return "open";
    } else if (this.readable && !this.writable) {
      return "readOnly";
    } else if (!this.readable && this.writable) {
      return "writeOnly";
    }
    return "closed";
  }
  end(data, encoding, cb) {
    Duplex.prototype.end.call(this, data, encoding, cb);
    DTRACE_NET_STREAM_END(this);
    return this;
  }
  /**
   * @param size Optional argument to specify how much data to read.
   */ read(size) {
    if (this[kBuffer] && !this.connecting && this._handle && !this._handle.reading) {
      _tryReadStart(this);
    }
    return Duplex.prototype.read.call(this, size);
  }
  destroySoon() {
    if (this.writable) {
      this.end();
    }
    if (this.writableFinished) {
      this.destroy();
    } else {
      this.once("finish", this.destroy);
    }
  }
  _unrefTimer() {
    // deno-lint-ignore no-this-alias
    for(let s = this; s !== null; s = s._parent){
      if (s[kTimeout]) {
        s[kTimeout].refresh();
      }
    }
  }
  // The user has called .end(), and all the bytes have been
  // sent out to the other side.
  // deno-lint-ignore no-explicit-any
  _final = (cb)=>{
    // If still connecting - defer handling `_final` until 'connect' will happen
    if (this.pending) {
      debug("_final: not yet connected");
      return this.once("connect", ()=>this._final(cb));
    }
    if (!this._handle) {
      return cb();
    }
    debug("_final: not ended, call shutdown()");
    const req = new ShutdownWrap();
    req.oncomplete = _afterShutdown;
    req.handle = this._handle;
    req.callback = cb;
    const err = this._handle.shutdown(req);
    if (err === 1 || err === codeMap.get("ENOTCONN")) {
      // synchronous finish
      return cb();
    } else if (err !== 0) {
      return cb(errnoException(err, "shutdown"));
    }
  };
  _onTimeout() {
    const handle = this._handle;
    const lastWriteQueueSize = this[kLastWriteQueueSize];
    if (lastWriteQueueSize > 0 && handle) {
      // `lastWriteQueueSize !== writeQueueSize` means there is
      // an active write in progress, so we suppress the timeout.
      const { writeQueueSize } = handle;
      if (lastWriteQueueSize !== writeQueueSize) {
        this[kLastWriteQueueSize] = writeQueueSize;
        this._unrefTimer();
        return;
      }
    }
    debug("_onTimeout");
    this.emit("timeout");
  }
  _read(size) {
    debug("_read");
    if (this.connecting || !this._handle) {
      debug("_read wait for connection");
      this.once("connect", ()=>this._read(size));
    } else if (!this._handle.reading) {
      _tryReadStart(this);
    }
  }
  _destroy(exception, cb) {
    debug("destroy");
    this.connecting = false;
    // deno-lint-ignore no-this-alias
    for(let s = this; s !== null; s = s._parent){
      clearTimeout(s[kTimeout]);
    }
    debug("close");
    if (this._handle) {
      debug("close handle");
      const isException = exception ? true : false;
      // `bytesRead` and `kBytesWritten` should be accessible after `.destroy()`
      this[kBytesRead] = this._handle.bytesRead;
      this[kBytesWritten] = this._handle.bytesWritten;
      // deno-lint-ignore no-this-alias
      const that = this;
      this._handle.close(()=>{
        // Close is async, so we differ from Node here in explicitly waiting for
        // the callback to have fired.
        that._handle.onread = _noop;
        that._handle = null;
        that._sockname = undefined;
        cb(exception);
        debug("emit close");
        this.emit("close", isException);
      });
    } else {
      cb(exception);
      nextTick(_emitCloseNT, this);
    }
    if (this._server) {
      debug("has server");
      this._server._connections--;
      if (this._server._emitCloseIfDrained) {
        this._server._emitCloseIfDrained();
      }
    }
  }
  _getpeername() {
    if (!this._handle || !("getpeername" in this._handle)) {
      return this._peername || {};
    } else if (!this._peername) {
      this._peername = {};
      this._handle.getpeername(this._peername);
    }
    return this._peername;
  }
  _getsockname() {
    if (!this._handle || !("getsockname" in this._handle)) {
      return {};
    } else if (!this._sockname) {
      this._sockname = {};
      this._handle.getsockname(this._sockname);
    }
    return this._sockname;
  }
  _writeGeneric(writev, // deno-lint-ignore no-explicit-any
  data, encoding, cb) {
    // If we are still connecting, then buffer this for later.
    // The Writable logic will buffer up any more writes while
    // waiting for this one to be done.
    if (this.connecting) {
      this._pendingData = data;
      this._pendingEncoding = encoding;
      this.once("connect", function connect() {
        this._writeGeneric(writev, data, encoding, cb);
      });
      return;
    }
    this._pendingData = null;
    this._pendingEncoding = "";
    if (!this._handle) {
      cb(new ERR_SOCKET_CLOSED());
      return false;
    }
    this._unrefTimer();
    let req;
    if (writev) {
      req = writevGeneric(this, data, cb);
    } else {
      req = writeGeneric(this, data, encoding, cb);
    }
    if (req.async) {
      this[kLastWriteQueueSize] = req.bytes;
    }
  }
  // @ts-ignore Duplex defining as a property when want a method.
  _writev(// deno-lint-ignore no-explicit-any
  chunks, cb) {
    this._writeGeneric(true, chunks, "", cb);
  }
  _write(// deno-lint-ignore no-explicit-any
  data, encoding, cb) {
    this._writeGeneric(false, data, encoding, cb);
  }
  [kAfterAsyncWrite]() {
    this[kLastWriteQueueSize] = 0;
  }
  get [kUpdateTimer]() {
    return this._unrefTimer;
  }
  get _connecting() {
    return this.connecting;
  }
  // Legacy alias. Having this is probably being overly cautious, but it doesn't
  // really hurt anyone either. This can probably be removed safely if desired.
  get _bytesDispatched() {
    return this._handle ? this._handle.bytesWritten : this[kBytesWritten];
  }
  get _handle() {
    return this[kHandle];
  }
  set _handle(v) {
    this[kHandle] = v;
  }
}
export const Stream = Socket;
export function connect(...args) {
  const normalized = _normalizeArgs(args);
  const options = normalized[0];
  debug("createConnection", normalized);
  const socket = new Socket(options);
  if (options.timeout) {
    socket.setTimeout(options.timeout);
  }
  return socket.connect(normalized);
}
export const createConnection = connect;
function _isServerSocketOptions(options) {
  return options === null || typeof options === "undefined" || typeof options === "object";
}
function _isConnectionListener(connectionListener) {
  return typeof connectionListener === "function";
}
function _getFlags(ipv6Only) {
  return ipv6Only === true ? TCPConstants.UV_TCP_IPV6ONLY : 0;
}
function _listenInCluster(server, address, port, addressType, backlog, fd, exclusive, flags) {
  exclusive = !!exclusive;
  // TODO(cmorten): here we deviate somewhat from the Node implementation which
  // makes use of the https://nodejs.org/api/cluster.html module to run servers
  // across a "cluster" of Node processes to take advantage of multi-core
  // systems.
  //
  // Though Deno has has a Worker capability from which we could simulate this,
  // for now we assert that we are _always_ on the primary process.
  const isPrimary = true;
  if (isPrimary || exclusive) {
    // Will create a new handle
    // _listen2 sets up the listened handle, it is still named like this
    // to avoid breaking code that wraps this method
    server._listen2(address, port, addressType, backlog, fd, flags);
    return;
  }
}
function _lookupAndListen(server, port, address, backlog, exclusive, flags) {
  dnsLookup(address, function doListen(err, ip, addressType) {
    if (err) {
      server.emit("error", err);
    } else {
      addressType = ip ? addressType : 4;
      _listenInCluster(server, ip, port, addressType, backlog, null, exclusive, flags);
    }
  });
}
function _addAbortSignalOption(server, options) {
  if (options?.signal === undefined) {
    return;
  }
  validateAbortSignal(options.signal, "options.signal");
  const { signal } = options;
  const onAborted = ()=>{
    server.close();
  };
  if (signal.aborted) {
    nextTick(onAborted);
  } else {
    signal.addEventListener("abort", onAborted);
    server.once("close", ()=>signal.removeEventListener("abort", onAborted));
  }
}
// Returns handle if it can be created, or error code if it can't
export function _createServerHandle(address, port, addressType, fd, flags) {
  let err = 0;
  // Assign handle in listen, and clean up if bind or listen fails
  let handle;
  let isTCP = false;
  if (typeof fd === "number" && fd >= 0) {
    try {
      handle = _createHandle(fd, true);
    } catch (e) {
      // Not a fd we can listen on. This will trigger an error.
      debug("listen invalid fd=%d:", fd, e.message);
      return codeMap.get("EINVAL");
    }
    err = handle.open(fd);
    if (err) {
      return err;
    }
    assert(!address && !port);
  } else if (port === -1 && addressType === -1) {
    handle = new Pipe(PipeConstants.SERVER);
    if (isWindows) {
      const instances = Number.parseInt(Deno.env.get("NODE_PENDING_PIPE_INSTANCES") ?? "");
      if (!Number.isNaN(instances)) {
        handle.setPendingInstances(instances);
      }
    }
  } else {
    handle = new TCP(TCPConstants.SERVER);
    isTCP = true;
  }
  if (address || port || isTCP) {
    debug("bind to", address || "any");
    if (!address) {
      // Try binding to ipv6 first
      err = handle.bind6(DEFAULT_IPV6_ADDR, port ?? 0, flags ?? 0);
      if (err) {
        handle.close();
        // Fallback to ipv4
        return _createServerHandle(DEFAULT_IPV4_ADDR, port, 4, null, flags);
      }
    } else if (addressType === 6) {
      err = handle.bind6(address, port ?? 0, flags ?? 0);
    } else {
      err = handle.bind(address, port ?? 0);
    }
  }
  if (err) {
    handle.close();
    return err;
  }
  return handle;
}
function _emitErrorNT(server, err) {
  server.emit("error", err);
}
function _emitListeningNT(server) {
  // Ensure handle hasn't closed
  if (server._handle) {
    server.emit("listening");
  }
}
// deno-lint-ignore no-explicit-any
function _onconnection(err, clientHandle) {
  // deno-lint-ignore no-this-alias
  const handle = this;
  const self = handle[ownerSymbol];
  debug("onconnection");
  if (err) {
    self.emit("error", errnoException(err, "accept"));
    return;
  }
  if (self.maxConnections && self._connections >= self.maxConnections) {
    clientHandle.close();
    return;
  }
  const socket = new Socket({
    handle: clientHandle,
    allowHalfOpen: self.allowHalfOpen,
    pauseOnCreate: self.pauseOnConnect,
    readable: true,
    writable: true
  });
  self._connections++;
  socket.server = self;
  socket._server = self;
  DTRACE_NET_SERVER_CONNECTION(socket);
  self.emit("connection", socket);
}
function _setupListenHandle(address, port, addressType, backlog, fd, flags) {
  debug("setupListenHandle", address, port, addressType, backlog, fd);
  // If there is not yet a handle, we need to create one and bind.
  // In the case of a server sent via IPC, we don't need to do this.
  if (this._handle) {
    debug("setupListenHandle: have a handle already");
  } else {
    debug("setupListenHandle: create a handle");
    let rval = null;
    // Try to bind to the unspecified IPv6 address, see if IPv6 is available
    if (!address && typeof fd !== "number") {
      rval = _createServerHandle(DEFAULT_IPV6_ADDR, port, 6, fd, flags);
      if (typeof rval === "number") {
        rval = null;
        address = DEFAULT_IPV4_ADDR;
        addressType = 4;
      } else {
        address = DEFAULT_IPV6_ADDR;
        addressType = 6;
      }
    }
    if (rval === null) {
      rval = _createServerHandle(address, port, addressType, fd, flags);
    }
    if (typeof rval === "number") {
      const error = uvExceptionWithHostPort(rval, "listen", address, port);
      nextTick(_emitErrorNT, this, error);
      return;
    }
    this._handle = rval;
  }
  this[asyncIdSymbol] = _getNewAsyncId(this._handle);
  this._handle.onconnection = _onconnection;
  this._handle[ownerSymbol] = this;
  // Use a backlog of 512 entries. We pass 511 to the listen() call because
  // the kernel does: backlogsize = roundup_pow_of_two(backlogsize + 1);
  // which will thus give us a backlog of 512 entries.
  const err = this._handle.listen(backlog || 511);
  if (err) {
    const ex = uvExceptionWithHostPort(err, "listen", address, port);
    this._handle.close();
    this._handle = null;
    defaultTriggerAsyncIdScope(this[asyncIdSymbol], nextTick, _emitErrorNT, this, ex);
    return;
  }
  // Generate connection key, this should be unique to the connection
  this._connectionKey = addressType + ":" + address + ":" + port;
  // Unref the handle if the server was unref'ed prior to listening
  if (this._unref) {
    this.unref();
  }
  defaultTriggerAsyncIdScope(this[asyncIdSymbol], nextTick, _emitListeningNT, this);
}
/** This class is used to create a TCP or IPC server. */ export class Server extends EventEmitter {
  [asyncIdSymbol] = -1;
  allowHalfOpen = false;
  pauseOnConnect = false;
  // deno-lint-ignore no-explicit-any
  _handle = null;
  _connections = 0;
  _usingWorkers = false;
  // deno-lint-ignore no-explicit-any
  _workers = [];
  _unref = false;
  _pipeName;
  _connectionKey;
  constructor(options, connectionListener){
    super();
    if (_isConnectionListener(options)) {
      this.on("connection", options);
    } else if (_isServerSocketOptions(options)) {
      this.allowHalfOpen = options?.allowHalfOpen || false;
      this.pauseOnConnect = !!options?.pauseOnConnect;
      if (_isConnectionListener(connectionListener)) {
        this.on("connection", connectionListener);
      }
    } else {
      throw new ERR_INVALID_ARG_TYPE("options", "Object", options);
    }
  }
  listen(...args) {
    const normalized = _normalizeArgs(args);
    let options = normalized[0];
    const cb = normalized[1];
    if (this._handle) {
      throw new ERR_SERVER_ALREADY_LISTEN();
    }
    if (cb !== null) {
      this.once("listening", cb);
    }
    const backlogFromArgs = // (handle, backlog) or (path, backlog) or (port, backlog)
    _toNumber(args.length > 1 && args[1]) || _toNumber(args.length > 2 && args[2]); // (port, host, backlog)
    // deno-lint-ignore no-explicit-any
    options = options._handle || options.handle || options;
    const flags = _getFlags(options.ipv6Only);
    // (handle[, backlog][, cb]) where handle is an object with a handle
    if (options instanceof TCP) {
      this._handle = options;
      this[asyncIdSymbol] = this._handle.getAsyncId();
      _listenInCluster(this, null, -1, -1, backlogFromArgs);
      return this;
    }
    _addAbortSignalOption(this, options);
    // (handle[, backlog][, cb]) where handle is an object with a fd
    if (typeof options.fd === "number" && options.fd >= 0) {
      _listenInCluster(this, null, null, null, backlogFromArgs, options.fd);
      return this;
    }
    // ([port][, host][, backlog][, cb]) where port is omitted,
    // that is, listen(), listen(null), listen(cb), or listen(null, cb)
    // or (options[, cb]) where options.port is explicitly set as undefined or
    // null, bind to an arbitrary unused port
    if (args.length === 0 || typeof args[0] === "function" || typeof options.port === "undefined" && "port" in options || options.port === null) {
      options.port = 0;
    }
    // ([port][, host][, backlog][, cb]) where port is specified
    // or (options[, cb]) where options.port is specified
    // or if options.port is normalized as 0 before
    let backlog;
    if (typeof options.port === "number" || typeof options.port === "string") {
      validatePort(options.port, "options.port");
      backlog = options.backlog || backlogFromArgs;
      // start TCP server listening on host:port
      if (options.host) {
        _lookupAndListen(this, options.port | 0, options.host, backlog, !!options.exclusive, flags);
      } else {
        // Undefined host, listens on unspecified address
        // Default addressType 4 will be used to search for primary server
        _listenInCluster(this, null, options.port | 0, 4, backlog, undefined, options.exclusive);
      }
      return this;
    }
    // (path[, backlog][, cb]) or (options[, cb])
    // where path or options.path is a UNIX domain socket or Windows pipe
    if (options.path && _isPipeName(options.path)) {
      const pipeName = this._pipeName = options.path;
      backlog = options.backlog || backlogFromArgs;
      _listenInCluster(this, pipeName, -1, -1, backlog, undefined, options.exclusive);
      if (!this._handle) {
        // Failed and an error shall be emitted in the next tick.
        // Therefore, we directly return.
        return this;
      }
      let mode = 0;
      if (options.readableAll === true) {
        mode |= PipeConstants.UV_READABLE;
      }
      if (options.writableAll === true) {
        mode |= PipeConstants.UV_WRITABLE;
      }
      if (mode !== 0) {
        const err = this._handle.fchmod(mode);
        if (err) {
          this._handle.close();
          this._handle = null;
          throw errnoException(err, "uv_pipe_chmod");
        }
      }
      return this;
    }
    if (!("port" in options || "path" in options)) {
      throw new ERR_INVALID_ARG_VALUE("options", options, 'must have the property "port" or "path"');
    }
    throw new ERR_INVALID_ARG_VALUE("options", options);
  }
  /**
   * Stops the server from accepting new connections and keeps existing
   * connections. This function is asynchronous, the server is finally closed
   * when all connections are ended and the server emits a `"close"` event.
   * The optional `callback` will be called once the `"close"` event occurs. Unlike
   * that event, it will be called with an `Error` as its only argument if the server
   * was not open when it was closed.
   *
   * @param cb Called when the server is closed.
   */ close(cb) {
    if (typeof cb === "function") {
      if (!this._handle) {
        this.once("close", function close() {
          cb(new ERR_SERVER_NOT_RUNNING());
        });
      } else {
        this.once("close", cb);
      }
    }
    if (this._handle) {
      this._handle.close();
      this._handle = null;
    }
    if (this._usingWorkers) {
      let left = this._workers.length;
      const onWorkerClose = ()=>{
        if (--left !== 0) {
          return;
        }
        this._connections = 0;
        this._emitCloseIfDrained();
      };
      // Increment connections to be sure that, even if all sockets will be closed
      // during polling of workers, `close` event will be emitted only once.
      this._connections++;
      // Poll workers
      for(let n = 0; n < this._workers.length; n++){
        this._workers[n].close(onWorkerClose);
      }
    } else {
      this._emitCloseIfDrained();
    }
    return this;
  }
  /**
   * Returns the bound `address`, the address `family` name, and `port` of the server
   * as reported by the operating system if listening on an IP socket
   * (useful to find which port was assigned when getting an OS-assigned address):`{ port: 12346, family: "IPv4", address: "127.0.0.1" }`.
   *
   * For a server listening on a pipe or Unix domain socket, the name is returned
   * as a string.
   *
   * ```ts
   * import { createRequire } from "https://deno.land/std@$STD_VERSION/node/module.ts";
   * import { Socket } from "https://deno.land/std@$STD_VERSION/node/net.ts";
   *
   * const require = createRequire(import.meta.url);
   * const net = require("net");
   *
   * const server = net.createServer((socket: Socket) => {
   *   socket.end("goodbye\n");
   * }).on("error", (err: Error) => {
   *   // Handle errors here.
   *   throw err;
   * });
   *
   * // Grab an arbitrary unused port.
   * server.listen(() => {
   *   console.log("opened server on", server.address());
   * });
   * ```
   *
   * `server.address()` returns `null` before the `"listening"` event has been
   * emitted or after calling `server.close()`.
   */ address() {
    if (this._handle && this._handle.getsockname) {
      const out = {};
      const err = this._handle.getsockname(out);
      if (err) {
        throw errnoException(err, "address");
      }
      return out;
    } else if (this._pipeName) {
      return this._pipeName;
    }
    return null;
  }
  /**
   * Asynchronously get the number of concurrent connections on the server. Works
   * when sockets were sent to forks.
   *
   * Callback should take two arguments `err` and `count`.
   */ getConnections(cb) {
    // deno-lint-ignore no-this-alias
    const server = this;
    function end(err, connections) {
      defaultTriggerAsyncIdScope(server[asyncIdSymbol], nextTick, cb, err, connections);
    }
    if (!this._usingWorkers) {
      end(null, this._connections);
      return this;
    }
    // Poll workers
    let left = this._workers.length;
    let total = this._connections;
    function oncount(err, count) {
      if (err) {
        left = -1;
        return end(err);
      }
      total += count;
      if (--left === 0) {
        return end(null, total);
      }
    }
    for(let n = 0; n < this._workers.length; n++){
      this._workers[n].getConnections(oncount);
    }
    return this;
  }
  /**
   * Calling `unref()` on a server will allow the program to exit if this is the only
   * active server in the event system. If the server is already `unref`ed calling `unref()` again will have no effect.
   */ unref() {
    this._unref = true;
    if (this._handle) {
      this._handle.unref();
    }
    return this;
  }
  /**
   * Opposite of `unref()`, calling `ref()` on a previously `unref`ed server will _not_ let the program exit if it's the only server left (the default behavior).
   * If the server is `ref`ed calling `ref()` again will have no effect.
   */ ref() {
    this._unref = false;
    if (this._handle) {
      this._handle.ref();
    }
    return this;
  }
  /**
   * Indicates whether or not the server is listening for connections.
   */ get listening() {
    return !!this._handle;
  }
  _listen2 = _setupListenHandle;
  _emitCloseIfDrained() {
    debug("SERVER _emitCloseIfDrained");
    if (this._handle || this._connections) {
      debug(`SERVER handle? ${!!this._handle}   connections? ${this._connections}`);
      return;
    }
    defaultTriggerAsyncIdScope(this[asyncIdSymbol], nextTick, _emitCloseNT, this);
  }
  _setupWorker(socketList) {
    this._usingWorkers = true;
    this._workers.push(socketList);
    // deno-lint-ignore no-explicit-any
    socketList.once("exit", (socketList)=>{
      const index = this._workers.indexOf(socketList);
      this._workers.splice(index, 1);
    });
  }
  [EventEmitter.captureRejectionSymbol](err, event, sock) {
    switch(event){
      case "connection":
        {
          sock.destroy(err);
          break;
        }
      default:
        {
          this.emit("error", err);
        }
    }
  }
}
/**
 * Creates a new TCP or IPC server.
 *
 * Accepts an `options` object with properties `allowHalfOpen` (default `false`)
 * and `pauseOnConnect` (default `false`).
 *
 * If `allowHalfOpen` is set to `false`, then the socket will
 * automatically end the writable side when the readable side ends.
 *
 * If `allowHalfOpen` is set to `true`, when the other end of the socket
 * signals the end of transmission, the server will only send back the end of
 * transmission when `socket.end()` is explicitly called. For example, in the
 * context of TCP, when a FIN packed is received, a FIN packed is sent back
 * only when `socket.end()` is explicitly called. Until then the connection is
 * half-closed (non-readable but still writable). See `"end"` event and RFC 1122
 * (section 4.2.2.13) for more information.
 *
 * `pauseOnConnect` indicates whether the socket should be paused on incoming
 * connections.
 *
 * If `pauseOnConnect` is set to `true`, then the socket associated with each
 * incoming connection will be paused, and no data will be read from its
 * handle. This allows connections to be passed between processes without any
 * data being read by the original process. To begin reading data from a paused
 * socket, call `socket.resume()`.
 *
 * The server can be a TCP server or an IPC server, depending on what it
 * `listen()` to.
 *
 * Here is an example of an TCP echo server which listens for connections on
 * port 8124:
 *
 * ```ts
 * import { createRequire } from "https://deno.land/std@$STD_VERSION/node/module.ts";
 * import { Socket } from "https://deno.land/std@$STD_VERSION/node/net.ts";
 *
 * const require = createRequire(import.meta.url);
 * const net = require("net");
 *
 * const server = net.createServer((c: Socket) => {
 *   // "connection" listener.
 *   console.log("client connected");
 *   c.on("end", () => {
 *     console.log("client disconnected");
 *   });
 *   c.write("hello\r\n");
 *   c.pipe(c);
 * });
 *
 * server.on("error", (err: Error) => {
 *   throw err;
 * });
 *
 * server.listen(8124, () => {
 *   console.log("server bound");
 * });
 * ```
 *
 * Test this by using `telnet`:
 *
 * ```console
 * $ telnet localhost 8124
 * ```
 *
 * @param options Socket options.
 * @param connectionListener Automatically set as a listener for the `"connection"` event.
 * @return A `net.Server`.
 */ export function createServer(options, connectionListener) {
  return new Server(options, connectionListener);
}
export { isIP, isIPv4, isIPv6 };
export default {
  _createServerHandle,
  _normalizeArgs,
  isIP,
  isIPv4,
  isIPv6,
  connect,
  createConnection,
  createServer,
  Server,
  Socket,
  Stream
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL25vZGUvbmV0LnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjIgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG4vLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuaW1wb3J0IHsgbm90SW1wbGVtZW50ZWQgfSBmcm9tIFwiLi9fdXRpbHMudHNcIjtcbmltcG9ydCB7IEV2ZW50RW1pdHRlciB9IGZyb20gXCIuL2V2ZW50cy50c1wiO1xuaW1wb3J0IHsgaXNJUCwgaXNJUHY0LCBpc0lQdjYsIG5vcm1hbGl6ZWRBcmdzU3ltYm9sIH0gZnJvbSBcIi4vaW50ZXJuYWwvbmV0LnRzXCI7XG5pbXBvcnQgeyBEdXBsZXggfSBmcm9tIFwiLi9zdHJlYW0udHNcIjtcbmltcG9ydCB7XG4gIGFzeW5jSWRTeW1ib2wsXG4gIGRlZmF1bHRUcmlnZ2VyQXN5bmNJZFNjb3BlLFxuICBuZXdBc3luY0lkLFxuICBvd25lclN5bWJvbCxcbn0gZnJvbSBcIi4vaW50ZXJuYWwvYXN5bmNfaG9va3MudHNcIjtcbmltcG9ydCB7XG4gIEVSUl9JTlZBTElEX0FERFJFU1NfRkFNSUxZLFxuICBFUlJfSU5WQUxJRF9BUkdfVFlQRSxcbiAgRVJSX0lOVkFMSURfQVJHX1ZBTFVFLFxuICBFUlJfSU5WQUxJRF9GRF9UWVBFLFxuICBFUlJfSU5WQUxJRF9JUF9BRERSRVNTLFxuICBFUlJfTUlTU0lOR19BUkdTLFxuICBFUlJfU0VSVkVSX0FMUkVBRFlfTElTVEVOLFxuICBFUlJfU0VSVkVSX05PVF9SVU5OSU5HLFxuICBFUlJfU09DS0VUX0NMT1NFRCxcbiAgZXJybm9FeGNlcHRpb24sXG4gIGV4Y2VwdGlvbldpdGhIb3N0UG9ydCxcbiAgTm9kZUVycm9yLFxuICB1dkV4Y2VwdGlvbldpdGhIb3N0UG9ydCxcbn0gZnJvbSBcIi4vaW50ZXJuYWwvZXJyb3JzLnRzXCI7XG5pbXBvcnQgdHlwZSB7IEVycm5vRXhjZXB0aW9uIH0gZnJvbSBcIi4vaW50ZXJuYWwvZXJyb3JzLnRzXCI7XG5pbXBvcnQgeyBFbmNvZGluZ3MgfSBmcm9tIFwiLi9fdXRpbHMudHNcIjtcbmltcG9ydCB7IGlzVWludDhBcnJheSB9IGZyb20gXCIuL2ludGVybmFsL3V0aWwvdHlwZXMudHNcIjtcbmltcG9ydCB7XG4gIGtBZnRlckFzeW5jV3JpdGUsXG4gIGtCdWZmZXIsXG4gIGtCdWZmZXJDYixcbiAga0J1ZmZlckdlbixcbiAga0hhbmRsZSxcbiAga1VwZGF0ZVRpbWVyLFxuICBvblN0cmVhbVJlYWQsXG4gIHNldFN0cmVhbVRpbWVvdXQsXG4gIHdyaXRlR2VuZXJpYyxcbiAgd3JpdGV2R2VuZXJpYyxcbn0gZnJvbSBcIi4vaW50ZXJuYWwvc3RyZWFtX2Jhc2VfY29tbW9ucy50c1wiO1xuaW1wb3J0IHsga1RpbWVvdXQgfSBmcm9tIFwiLi9pbnRlcm5hbC90aW1lcnMubWpzXCI7XG5pbXBvcnQgeyBuZXh0VGljayB9IGZyb20gXCIuL19uZXh0X3RpY2sudHNcIjtcbmltcG9ydCB7XG4gIERUUkFDRV9ORVRfU0VSVkVSX0NPTk5FQ1RJT04sXG4gIERUUkFDRV9ORVRfU1RSRUFNX0VORCxcbn0gZnJvbSBcIi4vaW50ZXJuYWwvZHRyYWNlLnRzXCI7XG5pbXBvcnQgeyBCdWZmZXIgfSBmcm9tIFwiLi9idWZmZXIudHNcIjtcbmltcG9ydCB0eXBlIHsgTG9va3VwT25lT3B0aW9ucyB9IGZyb20gXCIuL2Rucy50c1wiO1xuaW1wb3J0IHtcbiAgdmFsaWRhdGVBYm9ydFNpZ25hbCxcbiAgdmFsaWRhdGVGdW5jdGlvbixcbiAgdmFsaWRhdGVJbnQzMixcbiAgdmFsaWRhdGVOdW1iZXIsXG4gIHZhbGlkYXRlUG9ydCxcbiAgdmFsaWRhdGVTdHJpbmcsXG59IGZyb20gXCIuL2ludGVybmFsL3ZhbGlkYXRvcnMubWpzXCI7XG5pbXBvcnQge1xuICBjb25zdGFudHMgYXMgVENQQ29uc3RhbnRzLFxuICBUQ1AsXG4gIFRDUENvbm5lY3RXcmFwLFxufSBmcm9tIFwiLi9pbnRlcm5hbF9iaW5kaW5nL3RjcF93cmFwLnRzXCI7XG5pbXBvcnQge1xuICBjb25zdGFudHMgYXMgUGlwZUNvbnN0YW50cyxcbiAgUGlwZSxcbiAgUGlwZUNvbm5lY3RXcmFwLFxufSBmcm9tIFwiLi9pbnRlcm5hbF9iaW5kaW5nL3BpcGVfd3JhcC50c1wiO1xuaW1wb3J0IHsgU2h1dGRvd25XcmFwIH0gZnJvbSBcIi4vaW50ZXJuYWxfYmluZGluZy9zdHJlYW1fd3JhcC50c1wiO1xuaW1wb3J0IHsgYXNzZXJ0IH0gZnJvbSBcIi4uL191dGlsL2Fzc2VydC50c1wiO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSBcIi4uL191dGlsL29zLnRzXCI7XG5pbXBvcnQgeyBBRERSQ09ORklHLCBsb29rdXAgYXMgZG5zTG9va3VwIH0gZnJvbSBcIi4vZG5zLnRzXCI7XG5pbXBvcnQgeyBjb2RlTWFwIH0gZnJvbSBcIi4vaW50ZXJuYWxfYmluZGluZy91di50c1wiO1xuaW1wb3J0IHsgZ3Vlc3NIYW5kbGVUeXBlIH0gZnJvbSBcIi4vaW50ZXJuYWxfYmluZGluZy91dGlsLnRzXCI7XG5pbXBvcnQgeyBkZWJ1Z2xvZyB9IGZyb20gXCIuL2ludGVybmFsL3V0aWwvZGVidWdsb2cudHNcIjtcbmltcG9ydCB0eXBlIHsgRHVwbGV4T3B0aW9ucyB9IGZyb20gXCIuL19zdHJlYW0uZC50c1wiO1xuaW1wb3J0IHR5cGUgeyBCdWZmZXJFbmNvZGluZyB9IGZyb20gXCIuL19nbG9iYWwuZC50c1wiO1xuXG5sZXQgZGVidWcgPSBkZWJ1Z2xvZyhcIm5ldFwiLCAoZm4pID0+IHtcbiAgZGVidWcgPSBmbjtcbn0pO1xuXG5jb25zdCBrTGFzdFdyaXRlUXVldWVTaXplID0gU3ltYm9sKFwibGFzdFdyaXRlUXVldWVTaXplXCIpO1xuY29uc3Qga1NldE5vRGVsYXkgPSBTeW1ib2woXCJrU2V0Tm9EZWxheVwiKTtcbmNvbnN0IGtCeXRlc1JlYWQgPSBTeW1ib2woXCJrQnl0ZXNSZWFkXCIpO1xuY29uc3Qga0J5dGVzV3JpdHRlbiA9IFN5bWJvbChcImtCeXRlc1dyaXR0ZW5cIik7XG5cbmNvbnN0IERFRkFVTFRfSVBWNF9BRERSID0gXCIwLjAuMC4wXCI7XG5jb25zdCBERUZBVUxUX0lQVjZfQUREUiA9IFwiOjpcIjtcblxudHlwZSBIYW5kbGUgPSBUQ1AgfCBQaXBlO1xuXG5pbnRlcmZhY2UgSGFuZGxlT3B0aW9ucyB7XG4gIHBhdXNlT25DcmVhdGU/OiBib29sZWFuO1xuICBtYW51YWxTdGFydD86IGJvb2xlYW47XG4gIGhhbmRsZT86IEhhbmRsZTtcbn1cblxuaW50ZXJmYWNlIE9uUmVhZE9wdGlvbnMge1xuICBidWZmZXI6IFVpbnQ4QXJyYXkgfCAoKCkgPT4gVWludDhBcnJheSk7XG4gIC8qKlxuICAgKiBUaGlzIGZ1bmN0aW9uIGlzIGNhbGxlZCBmb3IgZXZlcnkgY2h1bmsgb2YgaW5jb21pbmcgZGF0YS5cbiAgICpcbiAgICogVHdvIGFyZ3VtZW50cyBhcmUgcGFzc2VkIHRvIGl0OiB0aGUgbnVtYmVyIG9mIGJ5dGVzIHdyaXR0ZW4gdG8gYnVmZmVyIGFuZFxuICAgKiBhIHJlZmVyZW5jZSB0byBidWZmZXIuXG4gICAqXG4gICAqIFJldHVybiBgZmFsc2VgIGZyb20gdGhpcyBmdW5jdGlvbiB0byBpbXBsaWNpdGx5IGBwYXVzZSgpYCB0aGUgc29ja2V0LlxuICAgKi9cbiAgY2FsbGJhY2soYnl0ZXNXcml0dGVuOiBudW1iZXIsIGJ1ZjogVWludDhBcnJheSk6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBDb25uZWN0T3B0aW9ucyB7XG4gIC8qKlxuICAgKiBJZiBzcGVjaWZpZWQsIGluY29taW5nIGRhdGEgaXMgc3RvcmVkIGluIGEgc2luZ2xlIGJ1ZmZlciBhbmQgcGFzc2VkIHRvIHRoZVxuICAgKiBzdXBwbGllZCBjYWxsYmFjayB3aGVuIGRhdGEgYXJyaXZlcyBvbiB0aGUgc29ja2V0LlxuICAgKlxuICAgKiBOb3RlOiB0aGlzIHdpbGwgY2F1c2UgdGhlIHN0cmVhbWluZyBmdW5jdGlvbmFsaXR5IHRvIG5vdCBwcm92aWRlIGFueSBkYXRhLFxuICAgKiBob3dldmVyIGV2ZW50cyBsaWtlIGBcImVycm9yXCJgLCBgXCJlbmRcImAsIGFuZCBgXCJjbG9zZVwiYCB3aWxsIHN0aWxsIGJlXG4gICAqIGVtaXR0ZWQgYXMgbm9ybWFsIGFuZCBtZXRob2RzIGxpa2UgYHBhdXNlKClgIGFuZCBgcmVzdW1lKClgIHdpbGwgYWxzb1xuICAgKiBiZWhhdmUgYXMgZXhwZWN0ZWQuXG4gICAqL1xuICBvbnJlYWQ/OiBPblJlYWRPcHRpb25zO1xufVxuXG5pbnRlcmZhY2UgU29ja2V0T3B0aW9ucyBleHRlbmRzIENvbm5lY3RPcHRpb25zLCBIYW5kbGVPcHRpb25zLCBEdXBsZXhPcHRpb25zIHtcbiAgLyoqXG4gICAqIElmIHNwZWNpZmllZCwgd3JhcCBhcm91bmQgYW4gZXhpc3Rpbmcgc29ja2V0IHdpdGggdGhlIGdpdmVuIGZpbGVcbiAgICogZGVzY3JpcHRvciwgb3RoZXJ3aXNlIGEgbmV3IHNvY2tldCB3aWxsIGJlIGNyZWF0ZWQuXG4gICAqL1xuICBmZD86IG51bWJlcjtcbiAgLyoqXG4gICAqIElmIHNldCB0byBgZmFsc2VgLCB0aGVuIHRoZSBzb2NrZXQgd2lsbCBhdXRvbWF0aWNhbGx5IGVuZCB0aGUgd3JpdGFibGVcbiAgICogc2lkZSB3aGVuIHRoZSByZWFkYWJsZSBzaWRlIGVuZHMuIFNlZSBgbmV0LmNyZWF0ZVNlcnZlcigpYCBhbmQgdGhlIGBcImVuZFwiYFxuICAgKiBldmVudCBmb3IgZGV0YWlscy4gRGVmYXVsdDogYGZhbHNlYC5cbiAgICovXG4gIGFsbG93SGFsZk9wZW4/OiBib29sZWFuO1xuICAvKipcbiAgICogQWxsb3cgcmVhZHMgb24gdGhlIHNvY2tldCB3aGVuIGFuIGZkIGlzIHBhc3NlZCwgb3RoZXJ3aXNlIGlnbm9yZWQuXG4gICAqIERlZmF1bHQ6IGBmYWxzZWAuXG4gICAqL1xuICByZWFkYWJsZT86IGJvb2xlYW47XG4gIC8qKlxuICAgKiBBbGxvdyB3cml0ZXMgb24gdGhlIHNvY2tldCB3aGVuIGFuIGZkIGlzIHBhc3NlZCwgb3RoZXJ3aXNlIGlnbm9yZWQuXG4gICAqIERlZmF1bHQ6IGBmYWxzZWAuXG4gICAqL1xuICB3cml0YWJsZT86IGJvb2xlYW47XG4gIC8qKiBBbiBBYm9ydCBzaWduYWwgdGhhdCBtYXkgYmUgdXNlZCB0byBkZXN0cm95IHRoZSBzb2NrZXQuICovXG4gIHNpZ25hbD86IEFib3J0U2lnbmFsO1xufVxuXG5pbnRlcmZhY2UgVGNwTmV0Q29ubmVjdE9wdGlvbnMgZXh0ZW5kcyBUY3BTb2NrZXRDb25uZWN0T3B0aW9ucywgU29ja2V0T3B0aW9ucyB7XG4gIHRpbWVvdXQ/OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJcGNOZXRDb25uZWN0T3B0aW9ucyBleHRlbmRzIElwY1NvY2tldENvbm5lY3RPcHRpb25zLCBTb2NrZXRPcHRpb25zIHtcbiAgdGltZW91dD86IG51bWJlcjtcbn1cblxudHlwZSBOZXRDb25uZWN0T3B0aW9ucyA9IFRjcE5ldENvbm5lY3RPcHRpb25zIHwgSXBjTmV0Q29ubmVjdE9wdGlvbnM7XG5cbmludGVyZmFjZSBBZGRyZXNzSW5mbyB7XG4gIGFkZHJlc3M6IHN0cmluZztcbiAgZmFtaWx5Pzogc3RyaW5nO1xuICBwb3J0OiBudW1iZXI7XG59XG5cbnR5cGUgTG9va3VwRnVuY3Rpb24gPSAoXG4gIGhvc3RuYW1lOiBzdHJpbmcsXG4gIG9wdGlvbnM6IExvb2t1cE9uZU9wdGlvbnMsXG4gIGNhbGxiYWNrOiAoXG4gICAgZXJyOiBFcnJub0V4Y2VwdGlvbiB8IG51bGwsXG4gICAgYWRkcmVzczogc3RyaW5nLFxuICAgIGZhbWlseTogbnVtYmVyLFxuICApID0+IHZvaWQsXG4pID0+IHZvaWQ7XG5cbmludGVyZmFjZSBUY3BTb2NrZXRDb25uZWN0T3B0aW9ucyBleHRlbmRzIENvbm5lY3RPcHRpb25zIHtcbiAgcG9ydDogbnVtYmVyO1xuICBob3N0Pzogc3RyaW5nO1xuICBsb2NhbEFkZHJlc3M/OiBzdHJpbmc7XG4gIGxvY2FsUG9ydD86IG51bWJlcjtcbiAgaGludHM/OiBudW1iZXI7XG4gIGZhbWlseT86IG51bWJlcjtcbiAgbG9va3VwPzogTG9va3VwRnVuY3Rpb247XG59XG5cbmludGVyZmFjZSBJcGNTb2NrZXRDb25uZWN0T3B0aW9ucyBleHRlbmRzIENvbm5lY3RPcHRpb25zIHtcbiAgcGF0aDogc3RyaW5nO1xufVxuXG50eXBlIFNvY2tldENvbm5lY3RPcHRpb25zID0gVGNwU29ja2V0Q29ubmVjdE9wdGlvbnMgfCBJcGNTb2NrZXRDb25uZWN0T3B0aW9ucztcblxuZnVuY3Rpb24gX2dldE5ld0FzeW5jSWQoaGFuZGxlPzogSGFuZGxlKTogbnVtYmVyIHtcbiAgcmV0dXJuICghaGFuZGxlIHx8IHR5cGVvZiBoYW5kbGUuZ2V0QXN5bmNJZCAhPT0gXCJmdW5jdGlvblwiKVxuICAgID8gbmV3QXN5bmNJZCgpXG4gICAgOiBoYW5kbGUuZ2V0QXN5bmNJZCgpO1xufVxuXG5pbnRlcmZhY2UgTm9ybWFsaXplZEFyZ3Mge1xuICAwOiBQYXJ0aWFsPE5ldENvbm5lY3RPcHRpb25zIHwgTGlzdGVuT3B0aW9ucz47XG4gIDE6IENvbm5lY3Rpb25MaXN0ZW5lciB8IG51bGw7XG4gIFtub3JtYWxpemVkQXJnc1N5bWJvbF0/OiBib29sZWFuO1xufVxuXG5jb25zdCBfbm9vcCA9IChfYXJyYXlCdWZmZXI6IFVpbnQ4QXJyYXksIF9ucmVhZDogbnVtYmVyKTogdW5kZWZpbmVkID0+IHtcbiAgcmV0dXJuO1xufTtcblxuZnVuY3Rpb24gX3RvTnVtYmVyKHg6IHVua25vd24pOiBudW1iZXIgfCBmYWxzZSB7XG4gIHJldHVybiAoeCA9IE51bWJlcih4KSkgPj0gMCA/IHggYXMgbnVtYmVyIDogZmFsc2U7XG59XG5cbmZ1bmN0aW9uIF9pc1BpcGVOYW1lKHM6IHVua25vd24pOiBzIGlzIHN0cmluZyB7XG4gIHJldHVybiB0eXBlb2YgcyA9PT0gXCJzdHJpbmdcIiAmJiBfdG9OdW1iZXIocykgPT09IGZhbHNlO1xufVxuXG5mdW5jdGlvbiBfY3JlYXRlSGFuZGxlKGZkOiBudW1iZXIsIGlzU2VydmVyOiBib29sZWFuKTogSGFuZGxlIHtcbiAgdmFsaWRhdGVJbnQzMihmZCwgXCJmZFwiLCAwKTtcblxuICBjb25zdCB0eXBlID0gZ3Vlc3NIYW5kbGVUeXBlKGZkKTtcblxuICBpZiAodHlwZSA9PT0gXCJQSVBFXCIpIHtcbiAgICByZXR1cm4gbmV3IFBpcGUoXG4gICAgICBpc1NlcnZlciA/IFBpcGVDb25zdGFudHMuU0VSVkVSIDogUGlwZUNvbnN0YW50cy5TT0NLRVQsXG4gICAgKTtcbiAgfVxuXG4gIGlmICh0eXBlID09PSBcIlRDUFwiKSB7XG4gICAgcmV0dXJuIG5ldyBUQ1AoXG4gICAgICBpc1NlcnZlciA/IFRDUENvbnN0YW50cy5TRVJWRVIgOiBUQ1BDb25zdGFudHMuU09DS0VULFxuICAgICk7XG4gIH1cblxuICB0aHJvdyBuZXcgRVJSX0lOVkFMSURfRkRfVFlQRSh0eXBlKTtcbn1cblxuLy8gUmV0dXJucyBhbiBhcnJheSBbb3B0aW9ucywgY2JdLCB3aGVyZSBvcHRpb25zIGlzIGFuIG9iamVjdCxcbi8vIGNiIGlzIGVpdGhlciBhIGZ1bmN0aW9uIG9yIG51bGwuXG4vLyBVc2VkIHRvIG5vcm1hbGl6ZSBhcmd1bWVudHMgb2YgYFNvY2tldC5wcm90b3R5cGUuY29ubmVjdCgpYCBhbmRcbi8vIGBTZXJ2ZXIucHJvdG90eXBlLmxpc3RlbigpYC4gUG9zc2libGUgY29tYmluYXRpb25zIG9mIHBhcmFtZXRlcnM6XG4vLyAtIChvcHRpb25zWy4uLl1bLCBjYl0pXG4vLyAtIChwYXRoWy4uLl1bLCBjYl0pXG4vLyAtIChbcG9ydF1bLCBob3N0XVsuLi5dWywgY2JdKVxuLy8gRm9yIGBTb2NrZXQucHJvdG90eXBlLmNvbm5lY3QoKWAsIHRoZSBbLi4uXSBwYXJ0IGlzIGlnbm9yZWRcbi8vIEZvciBgU2VydmVyLnByb3RvdHlwZS5saXN0ZW4oKWAsIHRoZSBbLi4uXSBwYXJ0IGlzIFssIGJhY2tsb2ddXG4vLyBidXQgd2lsbCBub3QgYmUgaGFuZGxlZCBoZXJlIChoYW5kbGVkIGluIGxpc3RlbigpKVxuZXhwb3J0IGZ1bmN0aW9uIF9ub3JtYWxpemVBcmdzKGFyZ3M6IHVua25vd25bXSk6IE5vcm1hbGl6ZWRBcmdzIHtcbiAgbGV0IGFycjogTm9ybWFsaXplZEFyZ3M7XG5cbiAgaWYgKGFyZ3MubGVuZ3RoID09PSAwKSB7XG4gICAgYXJyID0gW3t9LCBudWxsXTtcbiAgICBhcnJbbm9ybWFsaXplZEFyZ3NTeW1ib2xdID0gdHJ1ZTtcblxuICAgIHJldHVybiBhcnI7XG4gIH1cblxuICBjb25zdCBhcmcwID0gYXJnc1swXSBhcyBQYXJ0aWFsPE5ldENvbm5lY3RPcHRpb25zPiB8IG51bWJlciB8IHN0cmluZztcbiAgbGV0IG9wdGlvbnM6IFBhcnRpYWw8U29ja2V0Q29ubmVjdE9wdGlvbnM+ID0ge307XG5cbiAgaWYgKHR5cGVvZiBhcmcwID09PSBcIm9iamVjdFwiICYmIGFyZzAgIT09IG51bGwpIHtcbiAgICAvLyAob3B0aW9uc1suLi5dWywgY2JdKVxuICAgIG9wdGlvbnMgPSBhcmcwO1xuICB9IGVsc2UgaWYgKF9pc1BpcGVOYW1lKGFyZzApKSB7XG4gICAgLy8gKHBhdGhbLi4uXVssIGNiXSlcbiAgICAob3B0aW9ucyBhcyBJcGNTb2NrZXRDb25uZWN0T3B0aW9ucykucGF0aCA9IGFyZzA7XG4gIH0gZWxzZSB7XG4gICAgLy8gKFtwb3J0XVssIGhvc3RdWy4uLl1bLCBjYl0pXG4gICAgKG9wdGlvbnMgYXMgVGNwU29ja2V0Q29ubmVjdE9wdGlvbnMpLnBvcnQgPSBhcmcwO1xuXG4gICAgaWYgKGFyZ3MubGVuZ3RoID4gMSAmJiB0eXBlb2YgYXJnc1sxXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgKG9wdGlvbnMgYXMgVGNwU29ja2V0Q29ubmVjdE9wdGlvbnMpLmhvc3QgPSBhcmdzWzFdO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGNiID0gYXJnc1thcmdzLmxlbmd0aCAtIDFdO1xuXG4gIGlmICghX2lzQ29ubmVjdGlvbkxpc3RlbmVyKGNiKSkge1xuICAgIGFyciA9IFtvcHRpb25zLCBudWxsXTtcbiAgfSBlbHNlIHtcbiAgICBhcnIgPSBbb3B0aW9ucywgY2JdO1xuICB9XG5cbiAgYXJyW25vcm1hbGl6ZWRBcmdzU3ltYm9sXSA9IHRydWU7XG5cbiAgcmV0dXJuIGFycjtcbn1cblxuZnVuY3Rpb24gX2lzVENQQ29ubmVjdFdyYXAoXG4gIHJlcTogVENQQ29ubmVjdFdyYXAgfCBQaXBlQ29ubmVjdFdyYXAsXG4pOiByZXEgaXMgVENQQ29ubmVjdFdyYXAge1xuICByZXR1cm4gXCJsb2NhbEFkZHJlc3NcIiBpbiByZXEgJiYgXCJsb2NhbFBvcnRcIiBpbiByZXE7XG59XG5cbmZ1bmN0aW9uIF9hZnRlckNvbm5lY3QoXG4gIHN0YXR1czogbnVtYmVyLFxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBoYW5kbGU6IGFueSxcbiAgcmVxOiBQaXBlQ29ubmVjdFdyYXAgfCBUQ1BDb25uZWN0V3JhcCxcbiAgcmVhZGFibGU6IGJvb2xlYW4sXG4gIHdyaXRhYmxlOiBib29sZWFuLFxuKSB7XG4gIGxldCBzb2NrZXQgPSBoYW5kbGVbb3duZXJTeW1ib2xdO1xuXG4gIGlmIChzb2NrZXQuY29uc3RydWN0b3IubmFtZSA9PT0gXCJSZXVzZWRIYW5kbGVcIikge1xuICAgIHNvY2tldCA9IHNvY2tldC5oYW5kbGU7XG4gIH1cblxuICAvLyBDYWxsYmFjayBtYXkgY29tZSBhZnRlciBjYWxsIHRvIGRlc3Ryb3lcbiAgaWYgKHNvY2tldC5kZXN0cm95ZWQpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBkZWJ1ZyhcImFmdGVyQ29ubmVjdFwiKTtcblxuICBhc3NlcnQoc29ja2V0LmNvbm5lY3RpbmcpO1xuXG4gIHNvY2tldC5jb25uZWN0aW5nID0gZmFsc2U7XG4gIHNvY2tldC5fc29ja25hbWUgPSBudWxsO1xuXG4gIGlmIChzdGF0dXMgPT09IDApIHtcbiAgICBpZiAoc29ja2V0LnJlYWRhYmxlICYmICFyZWFkYWJsZSkge1xuICAgICAgc29ja2V0LnB1c2gobnVsbCk7XG4gICAgICBzb2NrZXQucmVhZCgpO1xuICAgIH1cblxuICAgIGlmIChzb2NrZXQud3JpdGFibGUgJiYgIXdyaXRhYmxlKSB7XG4gICAgICBzb2NrZXQuZW5kKCk7XG4gICAgfVxuXG4gICAgc29ja2V0Ll91bnJlZlRpbWVyKCk7XG5cbiAgICBzb2NrZXQuZW1pdChcImNvbm5lY3RcIik7XG4gICAgc29ja2V0LmVtaXQoXCJyZWFkeVwiKTtcblxuICAgIC8vIFN0YXJ0IHRoZSBmaXJzdCByZWFkLCBvciBnZXQgYW4gaW1tZWRpYXRlIEVPRi5cbiAgICAvLyB0aGlzIGRvZXNuJ3QgYWN0dWFsbHkgY29uc3VtZSBhbnkgYnl0ZXMsIGJlY2F1c2UgbGVuPTAuXG4gICAgaWYgKHJlYWRhYmxlICYmICFzb2NrZXQuaXNQYXVzZWQoKSkge1xuICAgICAgc29ja2V0LnJlYWQoMCk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHNvY2tldC5jb25uZWN0aW5nID0gZmFsc2U7XG4gICAgbGV0IGRldGFpbHM7XG5cbiAgICBpZiAoX2lzVENQQ29ubmVjdFdyYXAocmVxKSkge1xuICAgICAgZGV0YWlscyA9IHJlcS5sb2NhbEFkZHJlc3MgKyBcIjpcIiArIHJlcS5sb2NhbFBvcnQ7XG4gICAgfVxuXG4gICAgY29uc3QgZXggPSBleGNlcHRpb25XaXRoSG9zdFBvcnQoXG4gICAgICBzdGF0dXMsXG4gICAgICBcImNvbm5lY3RcIixcbiAgICAgIHJlcS5hZGRyZXNzLFxuICAgICAgKHJlcSBhcyBUQ1BDb25uZWN0V3JhcCkucG9ydCxcbiAgICAgIGRldGFpbHMsXG4gICAgKTtcblxuICAgIGlmIChfaXNUQ1BDb25uZWN0V3JhcChyZXEpKSB7XG4gICAgICBleC5sb2NhbEFkZHJlc3MgPSByZXEubG9jYWxBZGRyZXNzO1xuICAgICAgZXgubG9jYWxQb3J0ID0gcmVxLmxvY2FsUG9ydDtcbiAgICB9XG5cbiAgICBzb2NrZXQuZGVzdHJveShleCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gX2NoZWNrQmluZEVycm9yKGVycjogbnVtYmVyLCBwb3J0OiBudW1iZXIsIGhhbmRsZTogVENQKSB7XG4gIC8vIEVBRERSSU5VU0UgbWF5IG5vdCBiZSByZXBvcnRlZCB1bnRpbCB3ZSBjYWxsIGBsaXN0ZW4oKWAgb3IgYGNvbm5lY3QoKWAuXG4gIC8vIFRvIGNvbXBsaWNhdGUgbWF0dGVycywgYSBmYWlsZWQgYGJpbmQoKWAgZm9sbG93ZWQgYnkgYGxpc3RlbigpYCBvciBgY29ubmVjdCgpYFxuICAvLyB3aWxsIGltcGxpY2l0bHkgYmluZCB0byBhIHJhbmRvbSBwb3J0LiBFcmdvLCBjaGVjayB0aGF0IHRoZSBzb2NrZXQgaXNcbiAgLy8gYm91bmQgdG8gdGhlIGV4cGVjdGVkIHBvcnQgYmVmb3JlIGNhbGxpbmcgYGxpc3RlbigpYCBvciBgY29ubmVjdCgpYC5cbiAgaWYgKGVyciA9PT0gMCAmJiBwb3J0ID4gMCAmJiBoYW5kbGUuZ2V0c29ja25hbWUpIHtcbiAgICBjb25zdCBvdXQ6IEFkZHJlc3NJbmZvIHwgUmVjb3JkPHN0cmluZywgbmV2ZXI+ID0ge307XG4gICAgZXJyID0gaGFuZGxlLmdldHNvY2tuYW1lKG91dCk7XG5cbiAgICBpZiAoZXJyID09PSAwICYmIHBvcnQgIT09IG91dC5wb3J0KSB7XG4gICAgICBlcnIgPSBjb2RlTWFwLmdldChcIkVBRERSSU5VU0VcIikhO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBlcnI7XG59XG5cbmZ1bmN0aW9uIF9pc1BpcGUoXG4gIG9wdGlvbnM6IFBhcnRpYWw8U29ja2V0Q29ubmVjdE9wdGlvbnM+LFxuKTogb3B0aW9ucyBpcyBJcGNTb2NrZXRDb25uZWN0T3B0aW9ucyB7XG4gIHJldHVybiBcInBhdGhcIiBpbiBvcHRpb25zICYmICEhb3B0aW9ucy5wYXRoO1xufVxuXG5mdW5jdGlvbiBfY29ubmVjdEVycm9yTlQoc29ja2V0OiBTb2NrZXQsIGVycjogRXJyb3IpIHtcbiAgc29ja2V0LmRlc3Ryb3koZXJyKTtcbn1cblxuZnVuY3Rpb24gX2ludGVybmFsQ29ubmVjdChcbiAgc29ja2V0OiBTb2NrZXQsXG4gIGFkZHJlc3M6IHN0cmluZyxcbiAgcG9ydDogbnVtYmVyLFxuICBhZGRyZXNzVHlwZTogbnVtYmVyLFxuICBsb2NhbEFkZHJlc3M6IHN0cmluZyxcbiAgbG9jYWxQb3J0OiBudW1iZXIsXG4gIGZsYWdzOiBudW1iZXIsXG4pIHtcbiAgYXNzZXJ0KHNvY2tldC5jb25uZWN0aW5nKTtcblxuICBsZXQgZXJyO1xuXG4gIGlmIChsb2NhbEFkZHJlc3MgfHwgbG9jYWxQb3J0KSB7XG4gICAgaWYgKGFkZHJlc3NUeXBlID09PSA0KSB7XG4gICAgICBsb2NhbEFkZHJlc3MgPSBsb2NhbEFkZHJlc3MgfHwgREVGQVVMVF9JUFY0X0FERFI7XG4gICAgICBlcnIgPSAoc29ja2V0Ll9oYW5kbGUgYXMgVENQKS5iaW5kKGxvY2FsQWRkcmVzcywgbG9jYWxQb3J0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gYWRkcmVzc1R5cGUgPT09IDZcbiAgICAgIGxvY2FsQWRkcmVzcyA9IGxvY2FsQWRkcmVzcyB8fCBERUZBVUxUX0lQVjZfQUREUjtcbiAgICAgIGVyciA9IChzb2NrZXQuX2hhbmRsZSBhcyBUQ1ApLmJpbmQ2KGxvY2FsQWRkcmVzcywgbG9jYWxQb3J0LCBmbGFncyk7XG4gICAgfVxuXG4gICAgZGVidWcoXG4gICAgICBcImJpbmRpbmcgdG8gbG9jYWxBZGRyZXNzOiAlcyBhbmQgbG9jYWxQb3J0OiAlZCAoYWRkcmVzc1R5cGU6ICVkKVwiLFxuICAgICAgbG9jYWxBZGRyZXNzLFxuICAgICAgbG9jYWxQb3J0LFxuICAgICAgYWRkcmVzc1R5cGUsXG4gICAgKTtcblxuICAgIGVyciA9IF9jaGVja0JpbmRFcnJvcihlcnIsIGxvY2FsUG9ydCwgc29ja2V0Ll9oYW5kbGUgYXMgVENQKTtcblxuICAgIGlmIChlcnIpIHtcbiAgICAgIGNvbnN0IGV4ID0gZXhjZXB0aW9uV2l0aEhvc3RQb3J0KGVyciwgXCJiaW5kXCIsIGxvY2FsQWRkcmVzcywgbG9jYWxQb3J0KTtcbiAgICAgIHNvY2tldC5kZXN0cm95KGV4KTtcblxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfVxuXG4gIGlmIChhZGRyZXNzVHlwZSA9PT0gNiB8fCBhZGRyZXNzVHlwZSA9PT0gNCkge1xuICAgIGNvbnN0IHJlcSA9IG5ldyBUQ1BDb25uZWN0V3JhcCgpO1xuICAgIHJlcS5vbmNvbXBsZXRlID0gX2FmdGVyQ29ubmVjdDtcbiAgICByZXEuYWRkcmVzcyA9IGFkZHJlc3M7XG4gICAgcmVxLnBvcnQgPSBwb3J0O1xuICAgIHJlcS5sb2NhbEFkZHJlc3MgPSBsb2NhbEFkZHJlc3M7XG4gICAgcmVxLmxvY2FsUG9ydCA9IGxvY2FsUG9ydDtcblxuICAgIGlmIChhZGRyZXNzVHlwZSA9PT0gNCkge1xuICAgICAgZXJyID0gKHNvY2tldC5faGFuZGxlIGFzIFRDUCkuY29ubmVjdChyZXEsIGFkZHJlc3MsIHBvcnQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBlcnIgPSAoc29ja2V0Ll9oYW5kbGUgYXMgVENQKS5jb25uZWN0NihyZXEsIGFkZHJlc3MsIHBvcnQpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjb25zdCByZXEgPSBuZXcgUGlwZUNvbm5lY3RXcmFwKCk7XG4gICAgcmVxLm9uY29tcGxldGUgPSBfYWZ0ZXJDb25uZWN0O1xuICAgIHJlcS5hZGRyZXNzID0gYWRkcmVzcztcblxuICAgIGVyciA9IChzb2NrZXQuX2hhbmRsZSBhcyBQaXBlKS5jb25uZWN0KHJlcSwgYWRkcmVzcywgX2FmdGVyQ29ubmVjdCk7XG4gIH1cblxuICBpZiAoZXJyKSB7XG4gICAgbGV0IGRldGFpbHMgPSBcIlwiO1xuXG4gICAgY29uc3Qgc29ja25hbWUgPSBzb2NrZXQuX2dldHNvY2tuYW1lKCk7XG5cbiAgICBpZiAoc29ja25hbWUpIHtcbiAgICAgIGRldGFpbHMgPSBgJHtzb2NrbmFtZS5hZGRyZXNzfToke3NvY2tuYW1lLnBvcnR9YDtcbiAgICB9XG5cbiAgICBjb25zdCBleCA9IGV4Y2VwdGlvbldpdGhIb3N0UG9ydChlcnIsIFwiY29ubmVjdFwiLCBhZGRyZXNzLCBwb3J0LCBkZXRhaWxzKTtcbiAgICBzb2NrZXQuZGVzdHJveShleCk7XG4gIH1cbn1cblxuLy8gUHJvdmlkZSBhIGJldHRlciBlcnJvciBtZXNzYWdlIHdoZW4gd2UgY2FsbCBlbmQoKSBhcyBhIHJlc3VsdFxuLy8gb2YgdGhlIG90aGVyIHNpZGUgc2VuZGluZyBhIEZJTi4gIFRoZSBzdGFuZGFyZCBcIndyaXRlIGFmdGVyIGVuZFwiXG4vLyBpcyBvdmVybHkgdmFndWUsIGFuZCBtYWtlcyBpdCBzZWVtIGxpa2UgdGhlIHVzZXIncyBjb2RlIGlzIHRvIGJsYW1lLlxuZnVuY3Rpb24gX3dyaXRlQWZ0ZXJGSU4oXG4gIHRoaXM6IFNvY2tldCxcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgY2h1bms6IGFueSxcbiAgZW5jb2Rpbmc/OlxuICAgIHwgQnVmZmVyRW5jb2RpbmdcbiAgICB8IG51bGxcbiAgICB8ICgoZXJyb3I6IEVycm9yIHwgbnVsbCB8IHVuZGVmaW5lZCkgPT4gdm9pZCksXG4gIGNiPzogKChlcnJvcjogRXJyb3IgfCBudWxsIHwgdW5kZWZpbmVkKSA9PiB2b2lkKSxcbik6IGJvb2xlYW4ge1xuICBpZiAoIXRoaXMud3JpdGFibGVFbmRlZCkge1xuICAgIHJldHVybiBEdXBsZXgucHJvdG90eXBlLndyaXRlLmNhbGwoXG4gICAgICB0aGlzLFxuICAgICAgY2h1bmssXG4gICAgICBlbmNvZGluZyBhcyBCdWZmZXJFbmNvZGluZyB8IG51bGwsXG4gICAgICAvLyBAdHMtZXhwZWN0LWVycm9yIFVzaW5nIGBjYWxsYCBzZWVtIHRvIGJlIGludGVyZmVyaW5nIHdpdGggdGhlIG92ZXJsb2FkIGZvciB3cml0ZVxuICAgICAgY2IsXG4gICAgKTtcbiAgfVxuXG4gIGlmICh0eXBlb2YgZW5jb2RpbmcgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIGNiID0gZW5jb2Rpbmc7XG4gICAgZW5jb2RpbmcgPSBudWxsO1xuICB9XG5cbiAgY29uc3QgZXJyID0gbmV3IE5vZGVFcnJvcihcbiAgICBcIkVQSVBFXCIsXG4gICAgXCJUaGlzIHNvY2tldCBoYXMgYmVlbiBlbmRlZCBieSB0aGUgb3RoZXIgcGFydHlcIixcbiAgKTtcblxuICBpZiAodHlwZW9mIGNiID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICBkZWZhdWx0VHJpZ2dlckFzeW5jSWRTY29wZShcbiAgICAgIHRoaXNbYXN5bmNJZFN5bWJvbF0sXG4gICAgICBuZXh0VGljayxcbiAgICAgIGNiLFxuICAgICAgZXJyLFxuICAgICk7XG4gIH1cblxuICB0aGlzLmRlc3Ryb3koZXJyKTtcblxuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIF90cnlSZWFkU3RhcnQoc29ja2V0OiBTb2NrZXQpOiB2b2lkIHtcbiAgLy8gTm90IGFscmVhZHkgcmVhZGluZywgc3RhcnQgdGhlIGZsb3cuXG4gIGRlYnVnKFwiU29ja2V0Ll9oYW5kbGUucmVhZFN0YXJ0XCIpO1xuICBzb2NrZXQuX2hhbmRsZSEucmVhZGluZyA9IHRydWU7XG4gIGNvbnN0IGVyciA9IHNvY2tldC5faGFuZGxlIS5yZWFkU3RhcnQoKTtcblxuICBpZiAoZXJyKSB7XG4gICAgc29ja2V0LmRlc3Ryb3koZXJybm9FeGNlcHRpb24oZXJyLCBcInJlYWRcIikpO1xuICB9XG59XG5cbi8vIENhbGxlZCB3aGVuIHRoZSBcImVuZFwiIGV2ZW50IGlzIGVtaXR0ZWQuXG5mdW5jdGlvbiBfb25SZWFkYWJsZVN0cmVhbUVuZCh0aGlzOiBTb2NrZXQpOiB2b2lkIHtcbiAgaWYgKCF0aGlzLmFsbG93SGFsZk9wZW4pIHtcbiAgICB0aGlzLndyaXRlID0gX3dyaXRlQWZ0ZXJGSU47XG4gIH1cbn1cblxuLy8gQ2FsbGVkIHdoZW4gY3JlYXRpbmcgbmV3IFNvY2tldCwgb3Igd2hlbiByZS11c2luZyBhIGNsb3NlZCBTb2NrZXRcbmZ1bmN0aW9uIF9pbml0U29ja2V0SGFuZGxlKHNvY2tldDogU29ja2V0KTogdm9pZCB7XG4gIHNvY2tldC5fdW5kZXN0cm95KCk7XG4gIHNvY2tldC5fc29ja25hbWUgPSB1bmRlZmluZWQ7XG5cbiAgLy8gSGFuZGxlIGNyZWF0aW9uIG1heSBiZSBkZWZlcnJlZCB0byBiaW5kKCkgb3IgY29ubmVjdCgpIHRpbWUuXG4gIGlmIChzb2NrZXQuX2hhbmRsZSkge1xuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgKHNvY2tldC5faGFuZGxlIGFzIGFueSlbb3duZXJTeW1ib2xdID0gc29ja2V0O1xuICAgIHNvY2tldC5faGFuZGxlLm9ucmVhZCA9IG9uU3RyZWFtUmVhZDtcbiAgICBzb2NrZXRbYXN5bmNJZFN5bWJvbF0gPSBfZ2V0TmV3QXN5bmNJZChzb2NrZXQuX2hhbmRsZSk7XG5cbiAgICBsZXQgdXNlckJ1ZiA9IHNvY2tldFtrQnVmZmVyXTtcblxuICAgIGlmICh1c2VyQnVmKSB7XG4gICAgICBjb25zdCBidWZHZW4gPSBzb2NrZXRba0J1ZmZlckdlbl07XG5cbiAgICAgIGlmIChidWZHZW4gIT09IG51bGwpIHtcbiAgICAgICAgdXNlckJ1ZiA9IGJ1ZkdlbigpO1xuXG4gICAgICAgIGlmICghaXNVaW50OEFycmF5KHVzZXJCdWYpKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgc29ja2V0W2tCdWZmZXJdID0gdXNlckJ1ZjtcbiAgICAgIH1cblxuICAgICAgc29ja2V0Ll9oYW5kbGUudXNlVXNlckJ1ZmZlcih1c2VyQnVmKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gX2xvb2t1cEFuZENvbm5lY3QoXG4gIHNlbGY6IFNvY2tldCxcbiAgb3B0aW9uczogVGNwU29ja2V0Q29ubmVjdE9wdGlvbnMsXG4pOiB2b2lkIHtcbiAgY29uc3QgeyBsb2NhbEFkZHJlc3MsIGxvY2FsUG9ydCB9ID0gb3B0aW9ucztcbiAgY29uc3QgaG9zdCA9IG9wdGlvbnMuaG9zdCB8fCBcImxvY2FsaG9zdFwiO1xuICBsZXQgeyBwb3J0IH0gPSBvcHRpb25zO1xuXG4gIGlmIChsb2NhbEFkZHJlc3MgJiYgIWlzSVAobG9jYWxBZGRyZXNzKSkge1xuICAgIHRocm93IG5ldyBFUlJfSU5WQUxJRF9JUF9BRERSRVNTKGxvY2FsQWRkcmVzcyk7XG4gIH1cblxuICBpZiAobG9jYWxQb3J0KSB7XG4gICAgdmFsaWRhdGVOdW1iZXIobG9jYWxQb3J0LCBcIm9wdGlvbnMubG9jYWxQb3J0XCIpO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBwb3J0ICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgaWYgKHR5cGVvZiBwb3J0ICE9PSBcIm51bWJlclwiICYmIHR5cGVvZiBwb3J0ICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICB0aHJvdyBuZXcgRVJSX0lOVkFMSURfQVJHX1RZUEUoXG4gICAgICAgIFwib3B0aW9ucy5wb3J0XCIsXG4gICAgICAgIFtcIm51bWJlclwiLCBcInN0cmluZ1wiXSxcbiAgICAgICAgcG9ydCxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgdmFsaWRhdGVQb3J0KHBvcnQpO1xuICB9XG5cbiAgcG9ydCB8PSAwO1xuXG4gIC8vIElmIGhvc3QgaXMgYW4gSVAsIHNraXAgcGVyZm9ybWluZyBhIGxvb2t1cFxuICBjb25zdCBhZGRyZXNzVHlwZSA9IGlzSVAoaG9zdCk7XG4gIGlmIChhZGRyZXNzVHlwZSkge1xuICAgIGRlZmF1bHRUcmlnZ2VyQXN5bmNJZFNjb3BlKFxuICAgICAgc2VsZlthc3luY0lkU3ltYm9sXSxcbiAgICAgIG5leHRUaWNrLFxuICAgICAgKCkgPT4ge1xuICAgICAgICBpZiAoc2VsZi5jb25uZWN0aW5nKSB7XG4gICAgICAgICAgZGVmYXVsdFRyaWdnZXJBc3luY0lkU2NvcGUoXG4gICAgICAgICAgICBzZWxmW2FzeW5jSWRTeW1ib2xdLFxuICAgICAgICAgICAgX2ludGVybmFsQ29ubmVjdCxcbiAgICAgICAgICAgIHNlbGYsXG4gICAgICAgICAgICBob3N0LFxuICAgICAgICAgICAgcG9ydCxcbiAgICAgICAgICAgIGFkZHJlc3NUeXBlLFxuICAgICAgICAgICAgbG9jYWxBZGRyZXNzLFxuICAgICAgICAgICAgbG9jYWxQb3J0LFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgKTtcblxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChvcHRpb25zLmxvb2t1cCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgdmFsaWRhdGVGdW5jdGlvbihvcHRpb25zLmxvb2t1cCwgXCJvcHRpb25zLmxvb2t1cFwiKTtcbiAgfVxuXG4gIGNvbnN0IGRuc09wdHMgPSB7XG4gICAgZmFtaWx5OiBvcHRpb25zLmZhbWlseSxcbiAgICBoaW50czogb3B0aW9ucy5oaW50cyB8fCAwLFxuICB9O1xuXG4gIGlmIChcbiAgICAhaXNXaW5kb3dzICYmXG4gICAgZG5zT3B0cy5mYW1pbHkgIT09IDQgJiZcbiAgICBkbnNPcHRzLmZhbWlseSAhPT0gNiAmJlxuICAgIGRuc09wdHMuaGludHMgPT09IDBcbiAgKSB7XG4gICAgZG5zT3B0cy5oaW50cyA9IEFERFJDT05GSUc7XG4gIH1cblxuICBkZWJ1ZyhcImNvbm5lY3Q6IGZpbmQgaG9zdFwiLCBob3N0KTtcbiAgZGVidWcoXCJjb25uZWN0OiBkbnMgb3B0aW9uc1wiLCBkbnNPcHRzKTtcbiAgc2VsZi5faG9zdCA9IGhvc3Q7XG4gIGNvbnN0IGxvb2t1cCA9IG9wdGlvbnMubG9va3VwIHx8IGRuc0xvb2t1cDtcblxuICBkZWZhdWx0VHJpZ2dlckFzeW5jSWRTY29wZShzZWxmW2FzeW5jSWRTeW1ib2xdLCBmdW5jdGlvbiAoKSB7XG4gICAgbG9va3VwKFxuICAgICAgaG9zdCxcbiAgICAgIGRuc09wdHMsXG4gICAgICBmdW5jdGlvbiBlbWl0TG9va3VwKFxuICAgICAgICBlcnI6IEVycm5vRXhjZXB0aW9uIHwgbnVsbCxcbiAgICAgICAgaXA6IHN0cmluZyxcbiAgICAgICAgYWRkcmVzc1R5cGU6IG51bWJlcixcbiAgICAgICkge1xuICAgICAgICBzZWxmLmVtaXQoXCJsb29rdXBcIiwgZXJyLCBpcCwgYWRkcmVzc1R5cGUsIGhvc3QpO1xuXG4gICAgICAgIC8vIEl0J3MgcG9zc2libGUgd2Ugd2VyZSBkZXN0cm95ZWQgd2hpbGUgbG9va2luZyB0aGlzIHVwLlxuICAgICAgICAvLyBYWFggaXQgd291bGQgYmUgZ3JlYXQgaWYgd2UgY291bGQgY2FuY2VsIHRoZSBwcm9taXNlIHJldHVybmVkIGJ5XG4gICAgICAgIC8vIHRoZSBsb29rIHVwLlxuICAgICAgICBpZiAoIXNlbGYuY29ubmVjdGluZykge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAvLyBuZXQuY3JlYXRlQ29ubmVjdGlvbigpIGNyZWF0ZXMgYSBuZXQuU29ja2V0IG9iamVjdCBhbmQgaW1tZWRpYXRlbHlcbiAgICAgICAgICAvLyBjYWxscyBuZXQuU29ja2V0LmNvbm5lY3QoKSBvbiBpdCAodGhhdCdzIHVzKS4gVGhlcmUgYXJlIG5vIGV2ZW50XG4gICAgICAgICAgLy8gbGlzdGVuZXJzIHJlZ2lzdGVyZWQgeWV0IHNvIGRlZmVyIHRoZSBlcnJvciBldmVudCB0byB0aGUgbmV4dCB0aWNrLlxuICAgICAgICAgIG5leHRUaWNrKF9jb25uZWN0RXJyb3JOVCwgc2VsZiwgZXJyKTtcbiAgICAgICAgfSBlbHNlIGlmICghaXNJUChpcCkpIHtcbiAgICAgICAgICBlcnIgPSBuZXcgRVJSX0lOVkFMSURfSVBfQUREUkVTUyhpcCk7XG5cbiAgICAgICAgICBuZXh0VGljayhfY29ubmVjdEVycm9yTlQsIHNlbGYsIGVycik7XG4gICAgICAgIH0gZWxzZSBpZiAoYWRkcmVzc1R5cGUgIT09IDQgJiYgYWRkcmVzc1R5cGUgIT09IDYpIHtcbiAgICAgICAgICBlcnIgPSBuZXcgRVJSX0lOVkFMSURfQUREUkVTU19GQU1JTFkoXG4gICAgICAgICAgICBgJHthZGRyZXNzVHlwZX1gLFxuICAgICAgICAgICAgb3B0aW9ucy5ob3N0ISxcbiAgICAgICAgICAgIG9wdGlvbnMucG9ydCxcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgbmV4dFRpY2soX2Nvbm5lY3RFcnJvck5ULCBzZWxmLCBlcnIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNlbGYuX3VucmVmVGltZXIoKTtcblxuICAgICAgICAgIGRlZmF1bHRUcmlnZ2VyQXN5bmNJZFNjb3BlKFxuICAgICAgICAgICAgc2VsZlthc3luY0lkU3ltYm9sXSxcbiAgICAgICAgICAgIF9pbnRlcm5hbENvbm5lY3QsXG4gICAgICAgICAgICBzZWxmLFxuICAgICAgICAgICAgaXAsXG4gICAgICAgICAgICBwb3J0LFxuICAgICAgICAgICAgYWRkcmVzc1R5cGUsXG4gICAgICAgICAgICBsb2NhbEFkZHJlc3MsXG4gICAgICAgICAgICBsb2NhbFBvcnQsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICApO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gX2FmdGVyU2h1dGRvd24odGhpczogU2h1dGRvd25XcmFwPFRDUD4pIHtcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgY29uc3Qgc2VsZjogYW55ID0gdGhpcy5oYW5kbGVbb3duZXJTeW1ib2xdO1xuXG4gIGRlYnVnKFwiYWZ0ZXJTaHV0ZG93biBkZXN0cm95ZWQ9JWpcIiwgc2VsZi5kZXN0cm95ZWQsIHNlbGYuX3JlYWRhYmxlU3RhdGUpO1xuXG4gIHRoaXMuY2FsbGJhY2soKTtcbn1cblxuZnVuY3Rpb24gX2VtaXRDbG9zZU5UKHNvY2tldDogU29ja2V0KSB7XG4gIGRlYnVnKFwiU0VSVkVSOiBlbWl0IGNsb3NlXCIpO1xuICBzb2NrZXQuZW1pdChcImNsb3NlXCIpO1xufVxuXG4vKipcbiAqIFRoaXMgY2xhc3MgaXMgYW4gYWJzdHJhY3Rpb24gb2YgYSBUQ1Agc29ja2V0IG9yIGEgc3RyZWFtaW5nIGBJUENgIGVuZHBvaW50XG4gKiAodXNlcyBuYW1lZCBwaXBlcyBvbiBXaW5kb3dzLCBhbmQgVW5peCBkb21haW4gc29ja2V0cyBvdGhlcndpc2UpLiBJdCBpcyBhbHNvXG4gKiBhbiBgRXZlbnRFbWl0dGVyYC5cbiAqXG4gKiBBIGBuZXQuU29ja2V0YCBjYW4gYmUgY3JlYXRlZCBieSB0aGUgdXNlciBhbmQgdXNlZCBkaXJlY3RseSB0byBpbnRlcmFjdCB3aXRoXG4gKiBhIHNlcnZlci4gRm9yIGV4YW1wbGUsIGl0IGlzIHJldHVybmVkIGJ5IGBjcmVhdGVDb25uZWN0aW9uYCxcbiAqIHNvIHRoZSB1c2VyIGNhbiB1c2UgaXQgdG8gdGFsayB0byB0aGUgc2VydmVyLlxuICpcbiAqIEl0IGNhbiBhbHNvIGJlIGNyZWF0ZWQgYnkgTm9kZS5qcyBhbmQgcGFzc2VkIHRvIHRoZSB1c2VyIHdoZW4gYSBjb25uZWN0aW9uXG4gKiBpcyByZWNlaXZlZC4gRm9yIGV4YW1wbGUsIGl0IGlzIHBhc3NlZCB0byB0aGUgbGlzdGVuZXJzIG9mIGEgYFwiY29ubmVjdGlvblwiYCBldmVudCBlbWl0dGVkIG9uIGEgYFNlcnZlcmAsIHNvIHRoZSB1c2VyIGNhbiB1c2VcbiAqIGl0IHRvIGludGVyYWN0IHdpdGggdGhlIGNsaWVudC5cbiAqL1xuZXhwb3J0IGNsYXNzIFNvY2tldCBleHRlbmRzIER1cGxleCB7XG4gIC8vIFByb2JsZW0gd2l0aCB0aGlzIGlzIHRoYXQgdXNlcnMgY2FuIHN1cHBseSB0aGVpciBvd24gaGFuZGxlLCB0aGF0IG1heSBub3RcbiAgLy8gaGF2ZSBgaGFuZGxlLmdldEFzeW5jSWQoKWAuIEluIHRoaXMgY2FzZSBhbiBgW2FzeW5jSWRTeW1ib2xdYCBzaG91bGRcbiAgLy8gcHJvYmFibHkgYmUgc3VwcGxpZWQgYnkgYGFzeW5jX2hvb2tzYC5cbiAgW2FzeW5jSWRTeW1ib2xdID0gLTE7XG5cbiAgW2tIYW5kbGVdOiBIYW5kbGUgfCBudWxsID0gbnVsbDtcbiAgW2tTZXROb0RlbGF5XSA9IGZhbHNlO1xuICBba0xhc3RXcml0ZVF1ZXVlU2l6ZV0gPSAwO1xuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBba1RpbWVvdXRdOiBhbnkgPSBudWxsO1xuICBba0J1ZmZlcl06IFVpbnQ4QXJyYXkgfCBib29sZWFuIHwgbnVsbCA9IG51bGw7XG4gIFtrQnVmZmVyQ2JdOiBPblJlYWRPcHRpb25zW1wiY2FsbGJhY2tcIl0gfCBudWxsID0gbnVsbDtcbiAgW2tCdWZmZXJHZW5dOiAoKCkgPT4gVWludDhBcnJheSkgfCBudWxsID0gbnVsbDtcblxuICAvLyBVc2VkIGFmdGVyIGAuZGVzdHJveSgpYFxuICBba0J5dGVzUmVhZF0gPSAwO1xuICBba0J5dGVzV3JpdHRlbl0gPSAwO1xuXG4gIC8vIFJlc2VydmVkIHByb3BlcnRpZXNcbiAgc2VydmVyID0gbnVsbDtcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgX3NlcnZlcjogYW55ID0gbnVsbDtcblxuICBfcGVlcm5hbWU/OiBBZGRyZXNzSW5mbyB8IFJlY29yZDxzdHJpbmcsIG5ldmVyPjtcbiAgX3NvY2tuYW1lPzogQWRkcmVzc0luZm8gfCBSZWNvcmQ8c3RyaW5nLCBuZXZlcj47XG4gIF9wZW5kaW5nRGF0YTogVWludDhBcnJheSB8IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBfcGVuZGluZ0VuY29kaW5nID0gXCJcIjtcbiAgX2hvc3Q6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBfcGFyZW50OiBhbnkgPSBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKG9wdGlvbnM6IFNvY2tldE9wdGlvbnMgfCBudW1iZXIpIHtcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMgPT09IFwibnVtYmVyXCIpIHtcbiAgICAgIC8vIExlZ2FjeSBpbnRlcmZhY2UuXG4gICAgICBvcHRpb25zID0geyBmZDogb3B0aW9ucyB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBvcHRpb25zID0geyAuLi5vcHRpb25zIH07XG4gICAgfVxuXG4gICAgLy8gRGVmYXVsdCB0byAqbm90KiBhbGxvd2luZyBoYWxmIG9wZW4gc29ja2V0cy5cbiAgICBvcHRpb25zLmFsbG93SGFsZk9wZW4gPSBCb29sZWFuKG9wdGlvbnMuYWxsb3dIYWxmT3Blbik7XG4gICAgLy8gRm9yIGJhY2t3YXJkcyBjb21wYXQgZG8gbm90IGVtaXQgY2xvc2Ugb24gZGVzdHJveS5cbiAgICBvcHRpb25zLmVtaXRDbG9zZSA9IGZhbHNlO1xuICAgIG9wdGlvbnMuYXV0b0Rlc3Ryb3kgPSB0cnVlO1xuICAgIC8vIEhhbmRsZSBzdHJpbmdzIGRpcmVjdGx5LlxuICAgIG9wdGlvbnMuZGVjb2RlU3RyaW5ncyA9IGZhbHNlO1xuXG4gICAgc3VwZXIob3B0aW9ucyk7XG5cbiAgICBpZiAob3B0aW9ucy5oYW5kbGUpIHtcbiAgICAgIHRoaXMuX2hhbmRsZSA9IG9wdGlvbnMuaGFuZGxlO1xuICAgICAgdGhpc1thc3luY0lkU3ltYm9sXSA9IF9nZXROZXdBc3luY0lkKHRoaXMuX2hhbmRsZSk7XG4gICAgfSBlbHNlIGlmIChvcHRpb25zLmZkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIC8vIFJFRjogaHR0cHM6Ly9naXRodWIuY29tL2Rlbm9sYW5kL2Rlbm8vaXNzdWVzLzY1MjlcbiAgICAgIG5vdEltcGxlbWVudGVkKCk7XG4gICAgfVxuXG4gICAgY29uc3Qgb25yZWFkID0gb3B0aW9ucy5vbnJlYWQ7XG5cbiAgICBpZiAoXG4gICAgICBvbnJlYWQgIT09IG51bGwgJiYgdHlwZW9mIG9ucmVhZCA9PT0gXCJvYmplY3RcIiAmJlxuICAgICAgKGlzVWludDhBcnJheShvbnJlYWQuYnVmZmVyKSB8fCB0eXBlb2Ygb25yZWFkLmJ1ZmZlciA9PT0gXCJmdW5jdGlvblwiKSAmJlxuICAgICAgdHlwZW9mIG9ucmVhZC5jYWxsYmFjayA9PT0gXCJmdW5jdGlvblwiXG4gICAgKSB7XG4gICAgICBpZiAodHlwZW9mIG9ucmVhZC5idWZmZXIgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICB0aGlzW2tCdWZmZXJdID0gdHJ1ZTtcbiAgICAgICAgdGhpc1trQnVmZmVyR2VuXSA9IG9ucmVhZC5idWZmZXI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzW2tCdWZmZXJdID0gb25yZWFkLmJ1ZmZlcjtcbiAgICAgIH1cblxuICAgICAgdGhpc1trQnVmZmVyQ2JdID0gb25yZWFkLmNhbGxiYWNrO1xuICAgIH1cblxuICAgIHRoaXMub24oXCJlbmRcIiwgX29uUmVhZGFibGVTdHJlYW1FbmQpO1xuXG4gICAgX2luaXRTb2NrZXRIYW5kbGUodGhpcyk7XG5cbiAgICAvLyBJZiB3ZSBoYXZlIGEgaGFuZGxlLCB0aGVuIHN0YXJ0IHRoZSBmbG93IG9mIGRhdGEgaW50byB0aGVcbiAgICAvLyBidWZmZXIuIElmIG5vdCwgdGhlbiB0aGlzIHdpbGwgaGFwcGVuIHdoZW4gd2UgY29ubmVjdC5cbiAgICBpZiAodGhpcy5faGFuZGxlICYmIG9wdGlvbnMucmVhZGFibGUgIT09IGZhbHNlKSB7XG4gICAgICBpZiAob3B0aW9ucy5wYXVzZU9uQ3JlYXRlKSB7XG4gICAgICAgIC8vIFN0b3AgdGhlIGhhbmRsZSBmcm9tIHJlYWRpbmcgYW5kIHBhdXNlIHRoZSBzdHJlYW1cbiAgICAgICAgdGhpcy5faGFuZGxlLnJlYWRpbmcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5faGFuZGxlLnJlYWRTdG9wKCk7XG4gICAgICAgIC8vIEB0cy1leHBlY3QtZXJyb3IgVGhpcyBwcm9wZXJ0eSBzaG91bGRuJ3QgYmUgbW9kaWZpZWRcbiAgICAgICAgdGhpcy5yZWFkYWJsZUZsb3dpbmcgPSBmYWxzZTtcbiAgICAgIH0gZWxzZSBpZiAoIW9wdGlvbnMubWFudWFsU3RhcnQpIHtcbiAgICAgICAgdGhpcy5yZWFkKDApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBJbml0aWF0ZSBhIGNvbm5lY3Rpb24gb24gYSBnaXZlbiBzb2NrZXQuXG4gICAqXG4gICAqIFBvc3NpYmxlIHNpZ25hdHVyZXM6XG4gICAqXG4gICAqIC0gYHNvY2tldC5jb25uZWN0KG9wdGlvbnNbLCBjb25uZWN0TGlzdGVuZXJdKWBcbiAgICogLSBgc29ja2V0LmNvbm5lY3QocGF0aFssIGNvbm5lY3RMaXN0ZW5lcl0pYCBmb3IgYElQQ2AgY29ubmVjdGlvbnMuXG4gICAqIC0gYHNvY2tldC5jb25uZWN0KHBvcnRbLCBob3N0XVssIGNvbm5lY3RMaXN0ZW5lcl0pYCBmb3IgVENQIGNvbm5lY3Rpb25zLlxuICAgKiAtIFJldHVybnM6IGBuZXQuU29ja2V0YCBUaGUgc29ja2V0IGl0c2VsZi5cbiAgICpcbiAgICogVGhpcyBmdW5jdGlvbiBpcyBhc3luY2hyb25vdXMuIFdoZW4gdGhlIGNvbm5lY3Rpb24gaXMgZXN0YWJsaXNoZWQsIHRoZSBgXCJjb25uZWN0XCJgIGV2ZW50IHdpbGwgYmUgZW1pdHRlZC4gSWYgdGhlcmUgaXMgYSBwcm9ibGVtIGNvbm5lY3RpbmcsXG4gICAqIGluc3RlYWQgb2YgYSBgXCJjb25uZWN0XCJgIGV2ZW50LCBhbiBgXCJlcnJvclwiYCBldmVudCB3aWxsIGJlIGVtaXR0ZWQgd2l0aFxuICAgKiB0aGUgZXJyb3IgcGFzc2VkIHRvIHRoZSBgXCJlcnJvclwiYCBsaXN0ZW5lci5cbiAgICogVGhlIGxhc3QgcGFyYW1ldGVyIGBjb25uZWN0TGlzdGVuZXJgLCBpZiBzdXBwbGllZCwgd2lsbCBiZSBhZGRlZCBhcyBhIGxpc3RlbmVyXG4gICAqIGZvciB0aGUgYFwiY29ubmVjdFwiYCBldmVudCAqKm9uY2UqKi5cbiAgICpcbiAgICogVGhpcyBmdW5jdGlvbiBzaG91bGQgb25seSBiZSB1c2VkIGZvciByZWNvbm5lY3RpbmcgYSBzb2NrZXQgYWZ0ZXIgYFwiY2xvc2VcImAgaGFzIGJlZW4gZW1pdHRlZCBvciBvdGhlcndpc2UgaXQgbWF5IGxlYWQgdG8gdW5kZWZpbmVkXG4gICAqIGJlaGF2aW9yLlxuICAgKi9cbiAgY29ubmVjdChcbiAgICBvcHRpb25zOiBTb2NrZXRDb25uZWN0T3B0aW9ucyB8IE5vcm1hbGl6ZWRBcmdzLFxuICAgIGNvbm5lY3Rpb25MaXN0ZW5lcj86IENvbm5lY3Rpb25MaXN0ZW5lcixcbiAgKTogdGhpcztcbiAgY29ubmVjdChcbiAgICBwb3J0OiBudW1iZXIsXG4gICAgaG9zdDogc3RyaW5nLFxuICAgIGNvbm5lY3Rpb25MaXN0ZW5lcj86IENvbm5lY3Rpb25MaXN0ZW5lcixcbiAgKTogdGhpcztcbiAgY29ubmVjdChwb3J0OiBudW1iZXIsIGNvbm5lY3Rpb25MaXN0ZW5lcj86IENvbm5lY3Rpb25MaXN0ZW5lcik6IHRoaXM7XG4gIGNvbm5lY3QocGF0aDogc3RyaW5nLCBjb25uZWN0aW9uTGlzdGVuZXI/OiBDb25uZWN0aW9uTGlzdGVuZXIpOiB0aGlzO1xuICBjb25uZWN0KC4uLmFyZ3M6IHVua25vd25bXSk6IHRoaXMge1xuICAgIGxldCBub3JtYWxpemVkOiBOb3JtYWxpemVkQXJncztcblxuICAgIC8vIElmIHBhc3NlZCBhbiBhcnJheSwgaXQncyB0cmVhdGVkIGFzIGFuIGFycmF5IG9mIGFyZ3VtZW50cyB0aGF0IGhhdmVcbiAgICAvLyBhbHJlYWR5IGJlZW4gbm9ybWFsaXplZCAoc28gd2UgZG9uJ3Qgbm9ybWFsaXplIG1vcmUgdGhhbiBvbmNlKS4gVGhpcyBoYXNcbiAgICAvLyBiZWVuIHNvbHZlZCBiZWZvcmUgaW4gaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL3B1bGwvMTIzNDIsIGJ1dCB3YXNcbiAgICAvLyByZXZlcnRlZCBhcyBpdCBoYWQgdW5pbnRlbmRlZCBzaWRlIGVmZmVjdHMuXG4gICAgaWYgKFxuICAgICAgQXJyYXkuaXNBcnJheShhcmdzWzBdKSAmJlxuICAgICAgKGFyZ3NbMF0gYXMgdW5rbm93biBhcyBOb3JtYWxpemVkQXJncylbbm9ybWFsaXplZEFyZ3NTeW1ib2xdXG4gICAgKSB7XG4gICAgICBub3JtYWxpemVkID0gYXJnc1swXSBhcyB1bmtub3duIGFzIE5vcm1hbGl6ZWRBcmdzO1xuICAgIH0gZWxzZSB7XG4gICAgICBub3JtYWxpemVkID0gX25vcm1hbGl6ZUFyZ3MoYXJncyk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3B0aW9ucyA9IG5vcm1hbGl6ZWRbMF07XG4gICAgY29uc3QgY2IgPSBub3JtYWxpemVkWzFdO1xuXG4gICAgLy8gYG9wdGlvbnMucG9ydCA9PT0gbnVsbGAgd2lsbCBiZSBjaGVja2VkIGxhdGVyLlxuICAgIGlmIChcbiAgICAgIChvcHRpb25zIGFzIFRjcFNvY2tldENvbm5lY3RPcHRpb25zKS5wb3J0ID09PSB1bmRlZmluZWQgJiZcbiAgICAgIChvcHRpb25zIGFzIElwY1NvY2tldENvbm5lY3RPcHRpb25zKS5wYXRoID09IG51bGxcbiAgICApIHtcbiAgICAgIHRocm93IG5ldyBFUlJfTUlTU0lOR19BUkdTKFtcIm9wdGlvbnNcIiwgXCJwb3J0XCIsIFwicGF0aFwiXSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMud3JpdGUgIT09IFNvY2tldC5wcm90b3R5cGUud3JpdGUpIHtcbiAgICAgIHRoaXMud3JpdGUgPSBTb2NrZXQucHJvdG90eXBlLndyaXRlO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmRlc3Ryb3llZCkge1xuICAgICAgdGhpcy5faGFuZGxlID0gbnVsbDtcbiAgICAgIHRoaXMuX3BlZXJuYW1lID0gdW5kZWZpbmVkO1xuICAgICAgdGhpcy5fc29ja25hbWUgPSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgY29uc3QgeyBwYXRoIH0gPSBvcHRpb25zIGFzIElwY05ldENvbm5lY3RPcHRpb25zO1xuICAgIGNvbnN0IHBpcGUgPSBfaXNQaXBlKG9wdGlvbnMpO1xuICAgIGRlYnVnKFwicGlwZVwiLCBwaXBlLCBwYXRoKTtcblxuICAgIGlmICghdGhpcy5faGFuZGxlKSB7XG4gICAgICB0aGlzLl9oYW5kbGUgPSBwaXBlXG4gICAgICAgID8gbmV3IFBpcGUoUGlwZUNvbnN0YW50cy5TT0NLRVQpXG4gICAgICAgIDogbmV3IFRDUChUQ1BDb25zdGFudHMuU09DS0VUKTtcblxuICAgICAgX2luaXRTb2NrZXRIYW5kbGUodGhpcyk7XG4gICAgfVxuXG4gICAgaWYgKGNiICE9PSBudWxsKSB7XG4gICAgICB0aGlzLm9uY2UoXCJjb25uZWN0XCIsIGNiKTtcbiAgICB9XG5cbiAgICB0aGlzLl91bnJlZlRpbWVyKCk7XG5cbiAgICB0aGlzLmNvbm5lY3RpbmcgPSB0cnVlO1xuXG4gICAgaWYgKHBpcGUpIHtcbiAgICAgIHZhbGlkYXRlU3RyaW5nKHBhdGgsIFwib3B0aW9ucy5wYXRoXCIpO1xuICAgICAgZGVmYXVsdFRyaWdnZXJBc3luY0lkU2NvcGUoXG4gICAgICAgIHRoaXNbYXN5bmNJZFN5bWJvbF0sXG4gICAgICAgIF9pbnRlcm5hbENvbm5lY3QsXG4gICAgICAgIHRoaXMsXG4gICAgICAgIHBhdGgsXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBfbG9va3VwQW5kQ29ubmVjdCh0aGlzLCBvcHRpb25zIGFzIFRjcFNvY2tldENvbm5lY3RPcHRpb25zKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBQYXVzZXMgdGhlIHJlYWRpbmcgb2YgZGF0YS4gVGhhdCBpcywgYFwiZGF0YVwiYCBldmVudHMgd2lsbCBub3QgYmUgZW1pdHRlZC5cbiAgICogVXNlZnVsIHRvIHRocm90dGxlIGJhY2sgYW4gdXBsb2FkLlxuICAgKlxuICAgKiBAcmV0dXJuIFRoZSBzb2NrZXQgaXRzZWxmLlxuICAgKi9cbiAgb3ZlcnJpZGUgcGF1c2UoKTogdGhpcyB7XG4gICAgaWYgKFxuICAgICAgdGhpc1trQnVmZmVyXSAmJiAhdGhpcy5jb25uZWN0aW5nICYmIHRoaXMuX2hhbmRsZSAmJlxuICAgICAgdGhpcy5faGFuZGxlLnJlYWRpbmdcbiAgICApIHtcbiAgICAgIHRoaXMuX2hhbmRsZS5yZWFkaW5nID0gZmFsc2U7XG5cbiAgICAgIGlmICghdGhpcy5kZXN0cm95ZWQpIHtcbiAgICAgICAgY29uc3QgZXJyID0gdGhpcy5faGFuZGxlLnJlYWRTdG9wKCk7XG5cbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHRoaXMuZGVzdHJveShlcnJub0V4Y2VwdGlvbihlcnIsIFwicmVhZFwiKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gRHVwbGV4LnByb3RvdHlwZS5wYXVzZS5jYWxsKHRoaXMpIGFzIHVua25vd24gYXMgdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXN1bWVzIHJlYWRpbmcgYWZ0ZXIgYSBjYWxsIHRvIGBzb2NrZXQucGF1c2UoKWAuXG4gICAqXG4gICAqIEByZXR1cm4gVGhlIHNvY2tldCBpdHNlbGYuXG4gICAqL1xuICBvdmVycmlkZSByZXN1bWUoKTogdGhpcyB7XG4gICAgaWYgKFxuICAgICAgdGhpc1trQnVmZmVyXSAmJiAhdGhpcy5jb25uZWN0aW5nICYmIHRoaXMuX2hhbmRsZSAmJlxuICAgICAgIXRoaXMuX2hhbmRsZS5yZWFkaW5nXG4gICAgKSB7XG4gICAgICBfdHJ5UmVhZFN0YXJ0KHRoaXMpO1xuICAgIH1cblxuICAgIHJldHVybiBEdXBsZXgucHJvdG90eXBlLnJlc3VtZS5jYWxsKHRoaXMpIGFzIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogU2V0cyB0aGUgc29ja2V0IHRvIHRpbWVvdXQgYWZ0ZXIgYHRpbWVvdXRgIG1pbGxpc2Vjb25kcyBvZiBpbmFjdGl2aXR5IG9uXG4gICAqIHRoZSBzb2NrZXQuIEJ5IGRlZmF1bHQgYG5ldC5Tb2NrZXRgIGRvIG5vdCBoYXZlIGEgdGltZW91dC5cbiAgICpcbiAgICogV2hlbiBhbiBpZGxlIHRpbWVvdXQgaXMgdHJpZ2dlcmVkIHRoZSBzb2NrZXQgd2lsbCByZWNlaXZlIGEgYFwidGltZW91dFwiYCBldmVudCBidXQgdGhlIGNvbm5lY3Rpb24gd2lsbCBub3QgYmUgc2V2ZXJlZC4gVGhlIHVzZXIgbXVzdCBtYW51YWxseSBjYWxsIGBzb2NrZXQuZW5kKClgIG9yIGBzb2NrZXQuZGVzdHJveSgpYCB0b1xuICAgKiBlbmQgdGhlIGNvbm5lY3Rpb24uXG4gICAqXG4gICAqIGBgYHRzXG4gICAqIGltcG9ydCB7IGNyZWF0ZVJlcXVpcmUgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9ub2RlL21vZHVsZS50c1wiO1xuICAgKlxuICAgKiBjb25zdCByZXF1aXJlID0gY3JlYXRlUmVxdWlyZShpbXBvcnQubWV0YS51cmwpO1xuICAgKiBjb25zdCBuZXQgPSByZXF1aXJlKFwibmV0XCIpO1xuICAgKlxuICAgKiBjb25zdCBzb2NrZXQgPSBuZXcgbmV0LlNvY2tldCgpO1xuICAgKiBzb2NrZXQuc2V0VGltZW91dCgzMDAwKTtcbiAgICogc29ja2V0Lm9uKFwidGltZW91dFwiLCAoKSA9PiB7XG4gICAqICAgY29uc29sZS5sb2coXCJzb2NrZXQgdGltZW91dFwiKTtcbiAgICogICBzb2NrZXQuZW5kKCk7XG4gICAqIH0pO1xuICAgKiBgYGBcbiAgICpcbiAgICogSWYgYHRpbWVvdXRgIGlzIGAwYCwgdGhlbiB0aGUgZXhpc3RpbmcgaWRsZSB0aW1lb3V0IGlzIGRpc2FibGVkLlxuICAgKlxuICAgKiBUaGUgb3B0aW9uYWwgYGNhbGxiYWNrYCBwYXJhbWV0ZXIgd2lsbCBiZSBhZGRlZCBhcyBhIG9uZS10aW1lIGxpc3RlbmVyIGZvciB0aGUgYFwidGltZW91dFwiYCBldmVudC5cbiAgICogQHJldHVybiBUaGUgc29ja2V0IGl0c2VsZi5cbiAgICovXG4gIHNldFRpbWVvdXQgPSBzZXRTdHJlYW1UaW1lb3V0O1xuXG4gIC8qKlxuICAgKiBFbmFibGUvZGlzYWJsZSB0aGUgdXNlIG9mIE5hZ2xlJ3MgYWxnb3JpdGhtLlxuICAgKlxuICAgKiBXaGVuIGEgVENQIGNvbm5lY3Rpb24gaXMgY3JlYXRlZCwgaXQgd2lsbCBoYXZlIE5hZ2xlJ3MgYWxnb3JpdGhtIGVuYWJsZWQuXG4gICAqXG4gICAqIE5hZ2xlJ3MgYWxnb3JpdGhtIGRlbGF5cyBkYXRhIGJlZm9yZSBpdCBpcyBzZW50IHZpYSB0aGUgbmV0d29yay4gSXQgYXR0ZW1wdHNcbiAgICogdG8gb3B0aW1pemUgdGhyb3VnaHB1dCBhdCB0aGUgZXhwZW5zZSBvZiBsYXRlbmN5LlxuICAgKlxuICAgKiBQYXNzaW5nIGB0cnVlYCBmb3IgYG5vRGVsYXlgIG9yIG5vdCBwYXNzaW5nIGFuIGFyZ3VtZW50IHdpbGwgZGlzYWJsZSBOYWdsZSdzXG4gICAqIGFsZ29yaXRobSBmb3IgdGhlIHNvY2tldC4gUGFzc2luZyBgZmFsc2VgIGZvciBgbm9EZWxheWAgd2lsbCBlbmFibGUgTmFnbGUnc1xuICAgKiBhbGdvcml0aG0uXG4gICAqXG4gICAqIEBwYXJhbSBub0RlbGF5XG4gICAqIEByZXR1cm4gVGhlIHNvY2tldCBpdHNlbGYuXG4gICAqL1xuICBzZXROb0RlbGF5KG5vRGVsYXk/OiBib29sZWFuKTogdGhpcyB7XG4gICAgaWYgKCF0aGlzLl9oYW5kbGUpIHtcbiAgICAgIHRoaXMub25jZShcbiAgICAgICAgXCJjb25uZWN0XCIsXG4gICAgICAgIG5vRGVsYXkgPyB0aGlzLnNldE5vRGVsYXkgOiAoKSA9PiB0aGlzLnNldE5vRGVsYXkobm9EZWxheSksXG4gICAgICApO1xuXG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvLyBCYWNrd2FyZHMgY29tcGF0aWJpbGl0eTogYXNzdW1lIHRydWUgd2hlbiBgbm9EZWxheWAgaXMgb21pdHRlZFxuICAgIGNvbnN0IG5ld1ZhbHVlID0gbm9EZWxheSA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6ICEhbm9EZWxheTtcblxuICAgIGlmIChcbiAgICAgIFwic2V0Tm9EZWxheVwiIGluIHRoaXMuX2hhbmRsZSAmJiB0aGlzLl9oYW5kbGUuc2V0Tm9EZWxheSAmJlxuICAgICAgbmV3VmFsdWUgIT09IHRoaXNba1NldE5vRGVsYXldXG4gICAgKSB7XG4gICAgICB0aGlzW2tTZXROb0RlbGF5XSA9IG5ld1ZhbHVlO1xuICAgICAgdGhpcy5faGFuZGxlLnNldE5vRGVsYXkobmV3VmFsdWUpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIEVuYWJsZS9kaXNhYmxlIGtlZXAtYWxpdmUgZnVuY3Rpb25hbGl0eSwgYW5kIG9wdGlvbmFsbHkgc2V0IHRoZSBpbml0aWFsXG4gICAqIGRlbGF5IGJlZm9yZSB0aGUgZmlyc3Qga2VlcGFsaXZlIHByb2JlIGlzIHNlbnQgb24gYW4gaWRsZSBzb2NrZXQuXG4gICAqXG4gICAqIFNldCBgaW5pdGlhbERlbGF5YCAoaW4gbWlsbGlzZWNvbmRzKSB0byBzZXQgdGhlIGRlbGF5IGJldHdlZW4gdGhlIGxhc3RcbiAgICogZGF0YSBwYWNrZXQgcmVjZWl2ZWQgYW5kIHRoZSBmaXJzdCBrZWVwYWxpdmUgcHJvYmUuIFNldHRpbmcgYDBgIGZvcmBpbml0aWFsRGVsYXlgIHdpbGwgbGVhdmUgdGhlIHZhbHVlIHVuY2hhbmdlZCBmcm9tIHRoZSBkZWZhdWx0XG4gICAqIChvciBwcmV2aW91cykgc2V0dGluZy5cbiAgICpcbiAgICogRW5hYmxpbmcgdGhlIGtlZXAtYWxpdmUgZnVuY3Rpb25hbGl0eSB3aWxsIHNldCB0aGUgZm9sbG93aW5nIHNvY2tldCBvcHRpb25zOlxuICAgKlxuICAgKiAtIGBTT19LRUVQQUxJVkU9MWBcbiAgICogLSBgVENQX0tFRVBJRExFPWluaXRpYWxEZWxheWBcbiAgICogLSBgVENQX0tFRVBDTlQ9MTBgXG4gICAqIC0gYFRDUF9LRUVQSU5UVkw9MWBcbiAgICpcbiAgICogQHBhcmFtIGVuYWJsZVxuICAgKiBAcGFyYW0gaW5pdGlhbERlbGF5XG4gICAqIEByZXR1cm4gVGhlIHNvY2tldCBpdHNlbGYuXG4gICAqL1xuICBzZXRLZWVwQWxpdmUoZW5hYmxlOiBib29sZWFuLCBpbml0aWFsRGVsYXk/OiBudW1iZXIpOiB0aGlzIHtcbiAgICBpZiAoIXRoaXMuX2hhbmRsZSkge1xuICAgICAgdGhpcy5vbmNlKFwiY29ubmVjdFwiLCAoKSA9PiB0aGlzLnNldEtlZXBBbGl2ZShlbmFibGUsIGluaXRpYWxEZWxheSkpO1xuXG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBpZiAoXCJzZXRLZWVwQWxpdmVcIiBpbiB0aGlzLl9oYW5kbGUpIHtcbiAgICAgIHRoaXMuX2hhbmRsZS5zZXRLZWVwQWxpdmUoZW5hYmxlLCB+fihpbml0aWFsRGVsYXkhIC8gMTAwMCkpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIGJvdW5kIGBhZGRyZXNzYCwgdGhlIGFkZHJlc3MgYGZhbWlseWAgbmFtZSBhbmQgYHBvcnRgIG9mIHRoZVxuICAgKiBzb2NrZXQgYXMgcmVwb3J0ZWQgYnkgdGhlIG9wZXJhdGluZyBzeXN0ZW06YHsgcG9ydDogMTIzNDYsIGZhbWlseTogXCJJUHY0XCIsIGFkZHJlc3M6IFwiMTI3LjAuMC4xXCIgfWBcbiAgICovXG4gIGFkZHJlc3MoKTogQWRkcmVzc0luZm8gfCBSZWNvcmQ8c3RyaW5nLCBuZXZlcj4ge1xuICAgIHJldHVybiB0aGlzLl9nZXRzb2NrbmFtZSgpO1xuICB9XG5cbiAgLyoqXG4gICAqIENhbGxpbmcgYHVucmVmKClgIG9uIGEgc29ja2V0IHdpbGwgYWxsb3cgdGhlIHByb2dyYW0gdG8gZXhpdCBpZiB0aGlzIGlzIHRoZSBvbmx5XG4gICAqIGFjdGl2ZSBzb2NrZXQgaW4gdGhlIGV2ZW50IHN5c3RlbS4gSWYgdGhlIHNvY2tldCBpcyBhbHJlYWR5IGB1bnJlZmBlZCBjYWxsaW5nYHVucmVmKClgIGFnYWluIHdpbGwgaGF2ZSBubyBlZmZlY3QuXG4gICAqXG4gICAqIEByZXR1cm4gVGhlIHNvY2tldCBpdHNlbGYuXG4gICAqL1xuICB1bnJlZigpOiB0aGlzIHtcbiAgICBpZiAoIXRoaXMuX2hhbmRsZSkge1xuICAgICAgdGhpcy5vbmNlKFwiY29ubmVjdFwiLCB0aGlzLnVucmVmKTtcblxuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiB0aGlzLl9oYW5kbGUudW5yZWYgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgdGhpcy5faGFuZGxlLnVucmVmKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogT3Bwb3NpdGUgb2YgYHVucmVmKClgLCBjYWxsaW5nIGByZWYoKWAgb24gYSBwcmV2aW91c2x5IGB1bnJlZmBlZCBzb2NrZXQgd2lsbF9ub3RfIGxldCB0aGUgcHJvZ3JhbSBleGl0IGlmIGl0J3MgdGhlIG9ubHkgc29ja2V0IGxlZnQgKHRoZSBkZWZhdWx0IGJlaGF2aW9yKS5cbiAgICogSWYgdGhlIHNvY2tldCBpcyBgcmVmYGVkIGNhbGxpbmcgYHJlZmAgYWdhaW4gd2lsbCBoYXZlIG5vIGVmZmVjdC5cbiAgICpcbiAgICogQHJldHVybiBUaGUgc29ja2V0IGl0c2VsZi5cbiAgICovXG4gIHJlZigpOiB0aGlzIHtcbiAgICBpZiAoIXRoaXMuX2hhbmRsZSkge1xuICAgICAgdGhpcy5vbmNlKFwiY29ubmVjdFwiLCB0aGlzLnJlZik7XG5cbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgdGhpcy5faGFuZGxlLnJlZiA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICB0aGlzLl9oYW5kbGUucmVmKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBwcm9wZXJ0eSBzaG93cyB0aGUgbnVtYmVyIG9mIGNoYXJhY3RlcnMgYnVmZmVyZWQgZm9yIHdyaXRpbmcuIFRoZSBidWZmZXJcbiAgICogbWF5IGNvbnRhaW4gc3RyaW5ncyB3aG9zZSBsZW5ndGggYWZ0ZXIgZW5jb2RpbmcgaXMgbm90IHlldCBrbm93bi4gU28gdGhpcyBudW1iZXJcbiAgICogaXMgb25seSBhbiBhcHByb3hpbWF0aW9uIG9mIHRoZSBudW1iZXIgb2YgYnl0ZXMgaW4gdGhlIGJ1ZmZlci5cbiAgICpcbiAgICogYG5ldC5Tb2NrZXRgIGhhcyB0aGUgcHJvcGVydHkgdGhhdCBgc29ja2V0LndyaXRlKClgIGFsd2F5cyB3b3Jrcy4gVGhpcyBpcyB0b1xuICAgKiBoZWxwIHVzZXJzIGdldCB1cCBhbmQgcnVubmluZyBxdWlja2x5LiBUaGUgY29tcHV0ZXIgY2Fubm90IGFsd2F5cyBrZWVwIHVwXG4gICAqIHdpdGggdGhlIGFtb3VudCBvZiBkYXRhIHRoYXQgaXMgd3JpdHRlbiB0byBhIHNvY2tldC4gVGhlIG5ldHdvcmsgY29ubmVjdGlvblxuICAgKiBzaW1wbHkgbWlnaHQgYmUgdG9vIHNsb3cuIE5vZGUuanMgd2lsbCBpbnRlcm5hbGx5IHF1ZXVlIHVwIHRoZSBkYXRhIHdyaXR0ZW4gdG8gYVxuICAgKiBzb2NrZXQgYW5kIHNlbmQgaXQgb3V0IG92ZXIgdGhlIHdpcmUgd2hlbiBpdCBpcyBwb3NzaWJsZS5cbiAgICpcbiAgICogVGhlIGNvbnNlcXVlbmNlIG9mIHRoaXMgaW50ZXJuYWwgYnVmZmVyaW5nIGlzIHRoYXQgbWVtb3J5IG1heSBncm93LlxuICAgKiBVc2VycyB3aG8gZXhwZXJpZW5jZSBsYXJnZSBvciBncm93aW5nIGBidWZmZXJTaXplYCBzaG91bGQgYXR0ZW1wdCB0b1xuICAgKiBcInRocm90dGxlXCIgdGhlIGRhdGEgZmxvd3MgaW4gdGhlaXIgcHJvZ3JhbSB3aXRoIGBzb2NrZXQucGF1c2UoKWAgYW5kIGBzb2NrZXQucmVzdW1lKClgLlxuICAgKlxuICAgKiBAZGVwcmVjYXRlZCBVc2UgYHdyaXRhYmxlTGVuZ3RoYCBpbnN0ZWFkLlxuICAgKi9cbiAgZ2V0IGJ1ZmZlclNpemUoKTogbnVtYmVyIHtcbiAgICBpZiAodGhpcy5faGFuZGxlKSB7XG4gICAgICByZXR1cm4gdGhpcy53cml0YWJsZUxlbmd0aDtcbiAgICB9XG5cbiAgICByZXR1cm4gMDtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGUgYW1vdW50IG9mIHJlY2VpdmVkIGJ5dGVzLlxuICAgKi9cbiAgZ2V0IGJ5dGVzUmVhZCgpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLl9oYW5kbGUgPyB0aGlzLl9oYW5kbGUuYnl0ZXNSZWFkIDogdGhpc1trQnl0ZXNSZWFkXTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGUgYW1vdW50IG9mIGJ5dGVzIHNlbnQuXG4gICAqL1xuICBnZXQgYnl0ZXNXcml0dGVuKCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG4gICAgbGV0IGJ5dGVzID0gdGhpcy5fYnl0ZXNEaXNwYXRjaGVkO1xuICAgIGNvbnN0IGRhdGEgPSB0aGlzLl9wZW5kaW5nRGF0YTtcbiAgICBjb25zdCBlbmNvZGluZyA9IHRoaXMuX3BlbmRpbmdFbmNvZGluZztcbiAgICBjb25zdCB3cml0YWJsZUJ1ZmZlciA9IHRoaXMud3JpdGFibGVCdWZmZXI7XG5cbiAgICBpZiAoIXdyaXRhYmxlQnVmZmVyKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgZWwgb2Ygd3JpdGFibGVCdWZmZXIpIHtcbiAgICAgIGJ5dGVzICs9IGVsIS5jaHVuayBpbnN0YW5jZW9mIEJ1ZmZlclxuICAgICAgICA/IGVsIS5jaHVuay5sZW5ndGhcbiAgICAgICAgOiBCdWZmZXIuYnl0ZUxlbmd0aChlbCEuY2h1bmssIGVsIS5lbmNvZGluZyk7XG4gICAgfVxuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgIC8vIFdhcyBhIHdyaXRldiwgaXRlcmF0ZSBvdmVyIGNodW5rcyB0byBnZXQgdG90YWwgbGVuZ3RoXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgY2h1bmsgPSBkYXRhW2ldO1xuXG4gICAgICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgICAgIGlmICgoZGF0YSBhcyBhbnkpLmFsbEJ1ZmZlcnMgfHwgY2h1bmsgaW5zdGFuY2VvZiBCdWZmZXIpIHtcbiAgICAgICAgICBieXRlcyArPSBjaHVuay5sZW5ndGg7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYnl0ZXMgKz0gQnVmZmVyLmJ5dGVMZW5ndGgoY2h1bmsuY2h1bmssIGNodW5rLmVuY29kaW5nKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZGF0YSkge1xuICAgICAgLy8gV3JpdGVzIGFyZSBlaXRoZXIgYSBzdHJpbmcgb3IgYSBCdWZmZXIuXG4gICAgICBpZiAodHlwZW9mIGRhdGEgIT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgYnl0ZXMgKz0gKGRhdGEgYXMgQnVmZmVyKS5sZW5ndGg7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBieXRlcyArPSBCdWZmZXIuYnl0ZUxlbmd0aChkYXRhLCBlbmNvZGluZyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGJ5dGVzO1xuICB9XG5cbiAgLyoqXG4gICAqIElmIGB0cnVlYCxgc29ja2V0LmNvbm5lY3Qob3B0aW9uc1ssIGNvbm5lY3RMaXN0ZW5lcl0pYCB3YXNcbiAgICogY2FsbGVkIGFuZCBoYXMgbm90IHlldCBmaW5pc2hlZC4gSXQgd2lsbCBzdGF5IGB0cnVlYCB1bnRpbCB0aGUgc29ja2V0IGJlY29tZXNcbiAgICogY29ubmVjdGVkLCB0aGVuIGl0IGlzIHNldCB0byBgZmFsc2VgIGFuZCB0aGUgYFwiY29ubmVjdFwiYCBldmVudCBpcyBlbWl0dGVkLiBOb3RlXG4gICAqIHRoYXQgdGhlIGBzb2NrZXQuY29ubmVjdChvcHRpb25zWywgY29ubmVjdExpc3RlbmVyXSlgIGNhbGxiYWNrIGlzIGEgbGlzdGVuZXIgZm9yIHRoZSBgXCJjb25uZWN0XCJgIGV2ZW50LlxuICAgKi9cbiAgY29ubmVjdGluZyA9IGZhbHNlO1xuXG4gIC8qKlxuICAgKiBUaGUgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBsb2NhbCBJUCBhZGRyZXNzIHRoZSByZW1vdGUgY2xpZW50IGlzXG4gICAqIGNvbm5lY3Rpbmcgb24uIEZvciBleGFtcGxlLCBpbiBhIHNlcnZlciBsaXN0ZW5pbmcgb24gYFwiMC4wLjAuMFwiYCwgaWYgYSBjbGllbnRcbiAgICogY29ubmVjdHMgb24gYFwiMTkyLjE2OC4xLjFcImAsIHRoZSB2YWx1ZSBvZiBgc29ja2V0LmxvY2FsQWRkcmVzc2Agd291bGQgYmVgXCIxOTIuMTY4LjEuMVwiYC5cbiAgICovXG4gIGdldCBsb2NhbEFkZHJlc3MoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5fZ2V0c29ja25hbWUoKS5hZGRyZXNzO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoZSBudW1lcmljIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBsb2NhbCBwb3J0LiBGb3IgZXhhbXBsZSwgYDgwYCBvciBgMjFgLlxuICAgKi9cbiAgZ2V0IGxvY2FsUG9ydCgpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLl9nZXRzb2NrbmFtZSgpLnBvcnQ7XG4gIH1cblxuICAvKipcbiAgICogVGhlIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgcmVtb3RlIElQIGFkZHJlc3MuIEZvciBleGFtcGxlLGBcIjc0LjEyNS4xMjcuMTAwXCJgIG9yIGBcIjIwMDE6NDg2MDphMDA1Ojo2OFwiYC4gVmFsdWUgbWF5IGJlIGB1bmRlZmluZWRgIGlmXG4gICAqIHRoZSBzb2NrZXQgaXMgZGVzdHJveWVkIChmb3IgZXhhbXBsZSwgaWYgdGhlIGNsaWVudCBkaXNjb25uZWN0ZWQpLlxuICAgKi9cbiAgZ2V0IHJlbW90ZUFkZHJlc3MoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy5fZ2V0cGVlcm5hbWUoKS5hZGRyZXNzO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoZSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIHJlbW90ZSBJUCBmYW1pbHkuIGBcIklQdjRcImAgb3IgYFwiSVB2NlwiYC5cbiAgICovXG4gIGdldCByZW1vdGVGYW1pbHkoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy5fZ2V0cGVlcm5hbWUoKS5mYW1pbHk7XG4gIH1cblxuICAvKipcbiAgICogVGhlIG51bWVyaWMgcmVwcmVzZW50YXRpb24gb2YgdGhlIHJlbW90ZSBwb3J0LiBGb3IgZXhhbXBsZSwgYDgwYCBvciBgMjFgLlxuICAgKi9cbiAgZ2V0IHJlbW90ZVBvcnQoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy5fZ2V0cGVlcm5hbWUoKS5wb3J0O1xuICB9XG5cbiAgZ2V0IHBlbmRpbmcoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuICF0aGlzLl9oYW5kbGUgfHwgdGhpcy5jb25uZWN0aW5nO1xuICB9XG5cbiAgZ2V0IHJlYWR5U3RhdGUoKTogc3RyaW5nIHtcbiAgICBpZiAodGhpcy5jb25uZWN0aW5nKSB7XG4gICAgICByZXR1cm4gXCJvcGVuaW5nXCI7XG4gICAgfSBlbHNlIGlmICh0aGlzLnJlYWRhYmxlICYmIHRoaXMud3JpdGFibGUpIHtcbiAgICAgIHJldHVybiBcIm9wZW5cIjtcbiAgICB9IGVsc2UgaWYgKHRoaXMucmVhZGFibGUgJiYgIXRoaXMud3JpdGFibGUpIHtcbiAgICAgIHJldHVybiBcInJlYWRPbmx5XCI7XG4gICAgfSBlbHNlIGlmICghdGhpcy5yZWFkYWJsZSAmJiB0aGlzLndyaXRhYmxlKSB7XG4gICAgICByZXR1cm4gXCJ3cml0ZU9ubHlcIjtcbiAgICB9XG4gICAgcmV0dXJuIFwiY2xvc2VkXCI7XG4gIH1cblxuICAvKipcbiAgICogSGFsZi1jbG9zZXMgdGhlIHNvY2tldC4gaS5lLiwgaXQgc2VuZHMgYSBGSU4gcGFja2V0LiBJdCBpcyBwb3NzaWJsZSB0aGVcbiAgICogc2VydmVyIHdpbGwgc3RpbGwgc2VuZCBzb21lIGRhdGEuXG4gICAqXG4gICAqIFNlZSBgd3JpdGFibGUuZW5kKClgIGZvciBmdXJ0aGVyIGRldGFpbHMuXG4gICAqXG4gICAqIEBwYXJhbSBlbmNvZGluZyBPbmx5IHVzZWQgd2hlbiBkYXRhIGlzIGBzdHJpbmdgLlxuICAgKiBAcGFyYW0gY2IgT3B0aW9uYWwgY2FsbGJhY2sgZm9yIHdoZW4gdGhlIHNvY2tldCBpcyBmaW5pc2hlZC5cbiAgICogQHJldHVybiBUaGUgc29ja2V0IGl0c2VsZi5cbiAgICovXG4gIG92ZXJyaWRlIGVuZChjYj86ICgpID0+IHZvaWQpOiB0aGlzO1xuICBvdmVycmlkZSBlbmQoYnVmZmVyOiBVaW50OEFycmF5IHwgc3RyaW5nLCBjYj86ICgpID0+IHZvaWQpOiB0aGlzO1xuICBvdmVycmlkZSBlbmQoXG4gICAgZGF0YTogVWludDhBcnJheSB8IHN0cmluZyxcbiAgICBlbmNvZGluZz86IEVuY29kaW5ncyxcbiAgICBjYj86ICgpID0+IHZvaWQsXG4gICk6IHRoaXM7XG4gIG92ZXJyaWRlIGVuZChcbiAgICBkYXRhPzogVWludDhBcnJheSB8IHN0cmluZyB8ICgoKSA9PiB2b2lkKSxcbiAgICBlbmNvZGluZz86IEVuY29kaW5ncyB8ICgoKSA9PiB2b2lkKSxcbiAgICBjYj86ICgpID0+IHZvaWQsXG4gICk6IHRoaXMge1xuICAgIER1cGxleC5wcm90b3R5cGUuZW5kLmNhbGwodGhpcywgZGF0YSwgZW5jb2RpbmcgYXMgRW5jb2RpbmdzLCBjYik7XG4gICAgRFRSQUNFX05FVF9TVFJFQU1fRU5EKHRoaXMpO1xuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogQHBhcmFtIHNpemUgT3B0aW9uYWwgYXJndW1lbnQgdG8gc3BlY2lmeSBob3cgbXVjaCBkYXRhIHRvIHJlYWQuXG4gICAqL1xuICBvdmVycmlkZSByZWFkKFxuICAgIHNpemU/OiBudW1iZXIsXG4gICk6IHN0cmluZyB8IFVpbnQ4QXJyYXkgfCBCdWZmZXIgfCBudWxsIHwgdW5kZWZpbmVkIHtcbiAgICBpZiAoXG4gICAgICB0aGlzW2tCdWZmZXJdICYmICF0aGlzLmNvbm5lY3RpbmcgJiYgdGhpcy5faGFuZGxlICYmXG4gICAgICAhdGhpcy5faGFuZGxlLnJlYWRpbmdcbiAgICApIHtcbiAgICAgIF90cnlSZWFkU3RhcnQodGhpcyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIER1cGxleC5wcm90b3R5cGUucmVhZC5jYWxsKHRoaXMsIHNpemUpO1xuICB9XG5cbiAgZGVzdHJveVNvb24oKTogdm9pZCB7XG4gICAgaWYgKHRoaXMud3JpdGFibGUpIHtcbiAgICAgIHRoaXMuZW5kKCk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMud3JpdGFibGVGaW5pc2hlZCkge1xuICAgICAgdGhpcy5kZXN0cm95KCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMub25jZShcImZpbmlzaFwiLCB0aGlzLmRlc3Ryb3kpO1xuICAgIH1cbiAgfVxuXG4gIF91bnJlZlRpbWVyKCkge1xuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tdGhpcy1hbGlhc1xuICAgIGZvciAobGV0IHMgPSB0aGlzOyBzICE9PSBudWxsOyBzID0gcy5fcGFyZW50KSB7XG4gICAgICBpZiAoc1trVGltZW91dF0pIHtcbiAgICAgICAgc1trVGltZW91dF0ucmVmcmVzaCgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFRoZSB1c2VyIGhhcyBjYWxsZWQgLmVuZCgpLCBhbmQgYWxsIHRoZSBieXRlcyBoYXZlIGJlZW5cbiAgLy8gc2VudCBvdXQgdG8gdGhlIG90aGVyIHNpZGUuXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIG92ZXJyaWRlIF9maW5hbCA9IChjYjogYW55KTogYW55ID0+IHtcbiAgICAvLyBJZiBzdGlsbCBjb25uZWN0aW5nIC0gZGVmZXIgaGFuZGxpbmcgYF9maW5hbGAgdW50aWwgJ2Nvbm5lY3QnIHdpbGwgaGFwcGVuXG4gICAgaWYgKHRoaXMucGVuZGluZykge1xuICAgICAgZGVidWcoXCJfZmluYWw6IG5vdCB5ZXQgY29ubmVjdGVkXCIpO1xuICAgICAgcmV0dXJuIHRoaXMub25jZShcImNvbm5lY3RcIiwgKCkgPT4gdGhpcy5fZmluYWwoY2IpKTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuX2hhbmRsZSkge1xuICAgICAgcmV0dXJuIGNiKCk7XG4gICAgfVxuXG4gICAgZGVidWcoXCJfZmluYWw6IG5vdCBlbmRlZCwgY2FsbCBzaHV0ZG93bigpXCIpO1xuXG4gICAgY29uc3QgcmVxID0gbmV3IFNodXRkb3duV3JhcDxIYW5kbGU+KCk7XG4gICAgcmVxLm9uY29tcGxldGUgPSBfYWZ0ZXJTaHV0ZG93bjtcbiAgICByZXEuaGFuZGxlID0gdGhpcy5faGFuZGxlO1xuICAgIHJlcS5jYWxsYmFjayA9IGNiO1xuICAgIGNvbnN0IGVyciA9IHRoaXMuX2hhbmRsZS5zaHV0ZG93bihyZXEpO1xuXG4gICAgaWYgKGVyciA9PT0gMSB8fCBlcnIgPT09IGNvZGVNYXAuZ2V0KFwiRU5PVENPTk5cIikpIHtcbiAgICAgIC8vIHN5bmNocm9ub3VzIGZpbmlzaFxuICAgICAgcmV0dXJuIGNiKCk7XG4gICAgfSBlbHNlIGlmIChlcnIgIT09IDApIHtcbiAgICAgIHJldHVybiBjYihlcnJub0V4Y2VwdGlvbihlcnIsIFwic2h1dGRvd25cIikpO1xuICAgIH1cbiAgfTtcblxuICBfb25UaW1lb3V0KCkge1xuICAgIGNvbnN0IGhhbmRsZSA9IHRoaXMuX2hhbmRsZTtcbiAgICBjb25zdCBsYXN0V3JpdGVRdWV1ZVNpemUgPSB0aGlzW2tMYXN0V3JpdGVRdWV1ZVNpemVdO1xuXG4gICAgaWYgKGxhc3RXcml0ZVF1ZXVlU2l6ZSA+IDAgJiYgaGFuZGxlKSB7XG4gICAgICAvLyBgbGFzdFdyaXRlUXVldWVTaXplICE9PSB3cml0ZVF1ZXVlU2l6ZWAgbWVhbnMgdGhlcmUgaXNcbiAgICAgIC8vIGFuIGFjdGl2ZSB3cml0ZSBpbiBwcm9ncmVzcywgc28gd2Ugc3VwcHJlc3MgdGhlIHRpbWVvdXQuXG4gICAgICBjb25zdCB7IHdyaXRlUXVldWVTaXplIH0gPSBoYW5kbGU7XG5cbiAgICAgIGlmIChsYXN0V3JpdGVRdWV1ZVNpemUgIT09IHdyaXRlUXVldWVTaXplKSB7XG4gICAgICAgIHRoaXNba0xhc3RXcml0ZVF1ZXVlU2l6ZV0gPSB3cml0ZVF1ZXVlU2l6ZTtcbiAgICAgICAgdGhpcy5fdW5yZWZUaW1lcigpO1xuXG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBkZWJ1ZyhcIl9vblRpbWVvdXRcIik7XG4gICAgdGhpcy5lbWl0KFwidGltZW91dFwiKTtcbiAgfVxuXG4gIG92ZXJyaWRlIF9yZWFkKHNpemU/OiBudW1iZXIpOiB2b2lkIHtcbiAgICBkZWJ1ZyhcIl9yZWFkXCIpO1xuICAgIGlmICh0aGlzLmNvbm5lY3RpbmcgfHwgIXRoaXMuX2hhbmRsZSkge1xuICAgICAgZGVidWcoXCJfcmVhZCB3YWl0IGZvciBjb25uZWN0aW9uXCIpO1xuICAgICAgdGhpcy5vbmNlKFwiY29ubmVjdFwiLCAoKSA9PiB0aGlzLl9yZWFkKHNpemUpKTtcbiAgICB9IGVsc2UgaWYgKCF0aGlzLl9oYW5kbGUucmVhZGluZykge1xuICAgICAgX3RyeVJlYWRTdGFydCh0aGlzKTtcbiAgICB9XG4gIH1cblxuICBvdmVycmlkZSBfZGVzdHJveShcbiAgICBleGNlcHRpb246IEVycm9yIHwgbnVsbCxcbiAgICBjYjogKGVycjogRXJyb3IgfCBudWxsKSA9PiB2b2lkLFxuICApIHtcbiAgICBkZWJ1ZyhcImRlc3Ryb3lcIik7XG4gICAgdGhpcy5jb25uZWN0aW5nID0gZmFsc2U7XG5cbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLXRoaXMtYWxpYXNcbiAgICBmb3IgKGxldCBzID0gdGhpczsgcyAhPT0gbnVsbDsgcyA9IHMuX3BhcmVudCkge1xuICAgICAgY2xlYXJUaW1lb3V0KHNba1RpbWVvdXRdKTtcbiAgICB9XG5cbiAgICBkZWJ1ZyhcImNsb3NlXCIpO1xuICAgIGlmICh0aGlzLl9oYW5kbGUpIHtcbiAgICAgIGRlYnVnKFwiY2xvc2UgaGFuZGxlXCIpO1xuICAgICAgY29uc3QgaXNFeGNlcHRpb24gPSBleGNlcHRpb24gPyB0cnVlIDogZmFsc2U7XG4gICAgICAvLyBgYnl0ZXNSZWFkYCBhbmQgYGtCeXRlc1dyaXR0ZW5gIHNob3VsZCBiZSBhY2Nlc3NpYmxlIGFmdGVyIGAuZGVzdHJveSgpYFxuICAgICAgdGhpc1trQnl0ZXNSZWFkXSA9IHRoaXMuX2hhbmRsZS5ieXRlc1JlYWQ7XG4gICAgICB0aGlzW2tCeXRlc1dyaXR0ZW5dID0gdGhpcy5faGFuZGxlLmJ5dGVzV3JpdHRlbjtcblxuICAgICAgLy8gZGVuby1saW50LWlnbm9yZSBuby10aGlzLWFsaWFzXG4gICAgICBjb25zdCB0aGF0ID0gdGhpcztcblxuICAgICAgdGhpcy5faGFuZGxlLmNsb3NlKCgpID0+IHtcbiAgICAgICAgLy8gQ2xvc2UgaXMgYXN5bmMsIHNvIHdlIGRpZmZlciBmcm9tIE5vZGUgaGVyZSBpbiBleHBsaWNpdGx5IHdhaXRpbmcgZm9yXG4gICAgICAgIC8vIHRoZSBjYWxsYmFjayB0byBoYXZlIGZpcmVkLlxuICAgICAgICB0aGF0Ll9oYW5kbGUhLm9ucmVhZCA9IF9ub29wO1xuICAgICAgICB0aGF0Ll9oYW5kbGUgPSBudWxsO1xuICAgICAgICB0aGF0Ll9zb2NrbmFtZSA9IHVuZGVmaW5lZDtcblxuICAgICAgICBjYihleGNlcHRpb24pO1xuXG4gICAgICAgIGRlYnVnKFwiZW1pdCBjbG9zZVwiKTtcbiAgICAgICAgdGhpcy5lbWl0KFwiY2xvc2VcIiwgaXNFeGNlcHRpb24pO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNiKGV4Y2VwdGlvbik7XG4gICAgICBuZXh0VGljayhfZW1pdENsb3NlTlQsIHRoaXMpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9zZXJ2ZXIpIHtcbiAgICAgIGRlYnVnKFwiaGFzIHNlcnZlclwiKTtcbiAgICAgIHRoaXMuX3NlcnZlci5fY29ubmVjdGlvbnMtLTtcblxuICAgICAgaWYgKHRoaXMuX3NlcnZlci5fZW1pdENsb3NlSWZEcmFpbmVkKSB7XG4gICAgICAgIHRoaXMuX3NlcnZlci5fZW1pdENsb3NlSWZEcmFpbmVkKCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgX2dldHBlZXJuYW1lKCk6IEFkZHJlc3NJbmZvIHwgUmVjb3JkPHN0cmluZywgbmV2ZXI+IHtcbiAgICBpZiAoIXRoaXMuX2hhbmRsZSB8fCAhKFwiZ2V0cGVlcm5hbWVcIiBpbiB0aGlzLl9oYW5kbGUpKSB7XG4gICAgICByZXR1cm4gdGhpcy5fcGVlcm5hbWUgfHwge307XG4gICAgfSBlbHNlIGlmICghdGhpcy5fcGVlcm5hbWUpIHtcbiAgICAgIHRoaXMuX3BlZXJuYW1lID0ge307XG4gICAgICB0aGlzLl9oYW5kbGUuZ2V0cGVlcm5hbWUodGhpcy5fcGVlcm5hbWUpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9wZWVybmFtZTtcbiAgfVxuXG4gIF9nZXRzb2NrbmFtZSgpOiBBZGRyZXNzSW5mbyB8IFJlY29yZDxzdHJpbmcsIG5ldmVyPiB7XG4gICAgaWYgKCF0aGlzLl9oYW5kbGUgfHwgIShcImdldHNvY2tuYW1lXCIgaW4gdGhpcy5faGFuZGxlKSkge1xuICAgICAgcmV0dXJuIHt9O1xuICAgIH0gZWxzZSBpZiAoIXRoaXMuX3NvY2tuYW1lKSB7XG4gICAgICB0aGlzLl9zb2NrbmFtZSA9IHt9O1xuICAgICAgdGhpcy5faGFuZGxlLmdldHNvY2tuYW1lKHRoaXMuX3NvY2tuYW1lKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fc29ja25hbWU7XG4gIH1cblxuICBfd3JpdGVHZW5lcmljKFxuICAgIHdyaXRldjogYm9vbGVhbixcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIGRhdGE6IGFueSxcbiAgICBlbmNvZGluZzogc3RyaW5nLFxuICAgIGNiOiAoZXJyb3I/OiBFcnJvciB8IG51bGwpID0+IHZvaWQsXG4gICkge1xuICAgIC8vIElmIHdlIGFyZSBzdGlsbCBjb25uZWN0aW5nLCB0aGVuIGJ1ZmZlciB0aGlzIGZvciBsYXRlci5cbiAgICAvLyBUaGUgV3JpdGFibGUgbG9naWMgd2lsbCBidWZmZXIgdXAgYW55IG1vcmUgd3JpdGVzIHdoaWxlXG4gICAgLy8gd2FpdGluZyBmb3IgdGhpcyBvbmUgdG8gYmUgZG9uZS5cbiAgICBpZiAodGhpcy5jb25uZWN0aW5nKSB7XG4gICAgICB0aGlzLl9wZW5kaW5nRGF0YSA9IGRhdGE7XG4gICAgICB0aGlzLl9wZW5kaW5nRW5jb2RpbmcgPSBlbmNvZGluZztcbiAgICAgIHRoaXMub25jZShcImNvbm5lY3RcIiwgZnVuY3Rpb24gY29ubmVjdCh0aGlzOiBTb2NrZXQpIHtcbiAgICAgICAgdGhpcy5fd3JpdGVHZW5lcmljKHdyaXRldiwgZGF0YSwgZW5jb2RpbmcsIGNiKTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5fcGVuZGluZ0RhdGEgPSBudWxsO1xuICAgIHRoaXMuX3BlbmRpbmdFbmNvZGluZyA9IFwiXCI7XG5cbiAgICBpZiAoIXRoaXMuX2hhbmRsZSkge1xuICAgICAgY2IobmV3IEVSUl9TT0NLRVRfQ0xPU0VEKCkpO1xuXG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgdGhpcy5fdW5yZWZUaW1lcigpO1xuXG4gICAgbGV0IHJlcTtcblxuICAgIGlmICh3cml0ZXYpIHtcbiAgICAgIHJlcSA9IHdyaXRldkdlbmVyaWModGhpcywgZGF0YSwgY2IpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXEgPSB3cml0ZUdlbmVyaWModGhpcywgZGF0YSwgZW5jb2RpbmcsIGNiKTtcbiAgICB9XG4gICAgaWYgKHJlcS5hc3luYykge1xuICAgICAgdGhpc1trTGFzdFdyaXRlUXVldWVTaXplXSA9IHJlcS5ieXRlcztcbiAgICB9XG4gIH1cblxuICAvLyBAdHMtaWdub3JlIER1cGxleCBkZWZpbmluZyBhcyBhIHByb3BlcnR5IHdoZW4gd2FudCBhIG1ldGhvZC5cbiAgX3dyaXRldihcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIGNodW5rczogQXJyYXk8eyBjaHVuazogYW55OyBlbmNvZGluZzogc3RyaW5nIH0+LFxuICAgIGNiOiAoZXJyb3I/OiBFcnJvciB8IG51bGwpID0+IHZvaWQsXG4gICkge1xuICAgIHRoaXMuX3dyaXRlR2VuZXJpYyh0cnVlLCBjaHVua3MsIFwiXCIsIGNiKTtcbiAgfVxuXG4gIG92ZXJyaWRlIF93cml0ZShcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIGRhdGE6IGFueSxcbiAgICBlbmNvZGluZzogc3RyaW5nLFxuICAgIGNiOiAoZXJyb3I/OiBFcnJvciB8IG51bGwpID0+IHZvaWQsXG4gICkge1xuICAgIHRoaXMuX3dyaXRlR2VuZXJpYyhmYWxzZSwgZGF0YSwgZW5jb2RpbmcsIGNiKTtcbiAgfVxuXG4gIFtrQWZ0ZXJBc3luY1dyaXRlXSgpOiB2b2lkIHtcbiAgICB0aGlzW2tMYXN0V3JpdGVRdWV1ZVNpemVdID0gMDtcbiAgfVxuXG4gIGdldCBba1VwZGF0ZVRpbWVyXSgpIHtcbiAgICByZXR1cm4gdGhpcy5fdW5yZWZUaW1lcjtcbiAgfVxuXG4gIGdldCBfY29ubmVjdGluZygpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5jb25uZWN0aW5nO1xuICB9XG5cbiAgLy8gTGVnYWN5IGFsaWFzLiBIYXZpbmcgdGhpcyBpcyBwcm9iYWJseSBiZWluZyBvdmVybHkgY2F1dGlvdXMsIGJ1dCBpdCBkb2Vzbid0XG4gIC8vIHJlYWxseSBodXJ0IGFueW9uZSBlaXRoZXIuIFRoaXMgY2FuIHByb2JhYmx5IGJlIHJlbW92ZWQgc2FmZWx5IGlmIGRlc2lyZWQuXG4gIGdldCBfYnl0ZXNEaXNwYXRjaGVkKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuX2hhbmRsZSA/IHRoaXMuX2hhbmRsZS5ieXRlc1dyaXR0ZW4gOiB0aGlzW2tCeXRlc1dyaXR0ZW5dO1xuICB9XG5cbiAgZ2V0IF9oYW5kbGUoKTogSGFuZGxlIHwgbnVsbCB7XG4gICAgcmV0dXJuIHRoaXNba0hhbmRsZV07XG4gIH1cblxuICBzZXQgX2hhbmRsZSh2OiBIYW5kbGUgfCBudWxsKSB7XG4gICAgdGhpc1trSGFuZGxlXSA9IHY7XG4gIH1cbn1cblxuZXhwb3J0IGNvbnN0IFN0cmVhbSA9IFNvY2tldDtcblxuLy8gVGFyZ2V0IEFQSTpcbi8vXG4vLyBsZXQgcyA9IG5ldC5jb25uZWN0KHtwb3J0OiA4MCwgaG9zdDogJ2dvb2dsZS5jb20nfSwgZnVuY3Rpb24oKSB7XG4vLyAgIC4uLlxuLy8gfSk7XG4vL1xuLy8gVGhlcmUgYXJlIHZhcmlvdXMgZm9ybXM6XG4vL1xuLy8gY29ubmVjdChvcHRpb25zLCBbY2JdKVxuLy8gY29ubmVjdChwb3J0LCBbaG9zdF0sIFtjYl0pXG4vLyBjb25uZWN0KHBhdGgsIFtjYl0pO1xuLy9cbmV4cG9ydCBmdW5jdGlvbiBjb25uZWN0KFxuICBvcHRpb25zOiBOZXRDb25uZWN0T3B0aW9ucyxcbiAgY29ubmVjdGlvbkxpc3RlbmVyPzogKCkgPT4gdm9pZCxcbik6IFNvY2tldDtcbmV4cG9ydCBmdW5jdGlvbiBjb25uZWN0KFxuICBwb3J0OiBudW1iZXIsXG4gIGhvc3Q/OiBzdHJpbmcsXG4gIGNvbm5lY3Rpb25MaXN0ZW5lcj86ICgpID0+IHZvaWQsXG4pOiBTb2NrZXQ7XG5leHBvcnQgZnVuY3Rpb24gY29ubmVjdChwYXRoOiBzdHJpbmcsIGNvbm5lY3Rpb25MaXN0ZW5lcj86ICgpID0+IHZvaWQpOiBTb2NrZXQ7XG5leHBvcnQgZnVuY3Rpb24gY29ubmVjdCguLi5hcmdzOiB1bmtub3duW10pIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IF9ub3JtYWxpemVBcmdzKGFyZ3MpO1xuICBjb25zdCBvcHRpb25zID0gbm9ybWFsaXplZFswXSBhcyBQYXJ0aWFsPE5ldENvbm5lY3RPcHRpb25zPjtcbiAgZGVidWcoXCJjcmVhdGVDb25uZWN0aW9uXCIsIG5vcm1hbGl6ZWQpO1xuICBjb25zdCBzb2NrZXQgPSBuZXcgU29ja2V0KG9wdGlvbnMpO1xuXG4gIGlmIChvcHRpb25zLnRpbWVvdXQpIHtcbiAgICBzb2NrZXQuc2V0VGltZW91dChvcHRpb25zLnRpbWVvdXQpO1xuICB9XG5cbiAgcmV0dXJuIHNvY2tldC5jb25uZWN0KG5vcm1hbGl6ZWQpO1xufVxuXG5leHBvcnQgY29uc3QgY3JlYXRlQ29ubmVjdGlvbiA9IGNvbm5lY3Q7XG5cbmludGVyZmFjZSBBYm9ydGFibGUge1xuICAvKipcbiAgICogV2hlbiBwcm92aWRlZCB0aGUgY29ycmVzcG9uZGluZyBgQWJvcnRDb250cm9sbGVyYCBjYW4gYmUgdXNlZCB0byBjYW5jZWwgYW4gYXN5bmNocm9ub3VzIGFjdGlvbi5cbiAgICovXG4gIHNpZ25hbD86IEFib3J0U2lnbmFsIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIExpc3Rlbk9wdGlvbnMgZXh0ZW5kcyBBYm9ydGFibGUge1xuICBmZD86IG51bWJlcjtcbiAgcG9ydD86IG51bWJlciB8IHVuZGVmaW5lZDtcbiAgaG9zdD86IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgYmFja2xvZz86IG51bWJlciB8IHVuZGVmaW5lZDtcbiAgcGF0aD86IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgZXhjbHVzaXZlPzogYm9vbGVhbiB8IHVuZGVmaW5lZDtcbiAgcmVhZGFibGVBbGw/OiBib29sZWFuIHwgdW5kZWZpbmVkO1xuICB3cml0YWJsZUFsbD86IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG4gIC8qKlxuICAgKiBEZWZhdWx0OiBgZmFsc2VgXG4gICAqL1xuICBpcHY2T25seT86IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG59XG5cbnR5cGUgQ29ubmVjdGlvbkxpc3RlbmVyID0gKHNvY2tldDogU29ja2V0KSA9PiB2b2lkO1xuXG5pbnRlcmZhY2UgU2VydmVyT3B0aW9ucyB7XG4gIC8qKlxuICAgKiBJbmRpY2F0ZXMgd2hldGhlciBoYWxmLW9wZW5lZCBUQ1AgY29ubmVjdGlvbnMgYXJlIGFsbG93ZWQuXG4gICAqIERlZmF1bHQ6IGZhbHNlXG4gICAqL1xuICBhbGxvd0hhbGZPcGVuPzogYm9vbGVhbiB8IHVuZGVmaW5lZDtcbiAgLyoqXG4gICAqIEluZGljYXRlcyB3aGV0aGVyIHRoZSBzb2NrZXQgc2hvdWxkIGJlIHBhdXNlZCBvbiBpbmNvbWluZyBjb25uZWN0aW9ucy5cbiAgICogRGVmYXVsdDogZmFsc2VcbiAgICovXG4gIHBhdXNlT25Db25uZWN0PzogYm9vbGVhbiB8IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gX2lzU2VydmVyU29ja2V0T3B0aW9ucyhcbiAgb3B0aW9uczogdW5rbm93bixcbik6IG9wdGlvbnMgaXMgbnVsbCB8IHVuZGVmaW5lZCB8IFNlcnZlck9wdGlvbnMge1xuICByZXR1cm4gb3B0aW9ucyA9PT0gbnVsbCB8fCB0eXBlb2Ygb3B0aW9ucyA9PT0gXCJ1bmRlZmluZWRcIiB8fFxuICAgIHR5cGVvZiBvcHRpb25zID09PSBcIm9iamVjdFwiO1xufVxuXG5mdW5jdGlvbiBfaXNDb25uZWN0aW9uTGlzdGVuZXIoXG4gIGNvbm5lY3Rpb25MaXN0ZW5lcjogdW5rbm93bixcbik6IGNvbm5lY3Rpb25MaXN0ZW5lciBpcyBDb25uZWN0aW9uTGlzdGVuZXIge1xuICByZXR1cm4gdHlwZW9mIGNvbm5lY3Rpb25MaXN0ZW5lciA9PT0gXCJmdW5jdGlvblwiO1xufVxuXG5mdW5jdGlvbiBfZ2V0RmxhZ3MoaXB2Nk9ubHk/OiBib29sZWFuKTogbnVtYmVyIHtcbiAgcmV0dXJuIGlwdjZPbmx5ID09PSB0cnVlID8gVENQQ29uc3RhbnRzLlVWX1RDUF9JUFY2T05MWSA6IDA7XG59XG5cbmZ1bmN0aW9uIF9saXN0ZW5JbkNsdXN0ZXIoXG4gIHNlcnZlcjogU2VydmVyLFxuICBhZGRyZXNzOiBzdHJpbmcgfCBudWxsLFxuICBwb3J0OiBudW1iZXIgfCBudWxsLFxuICBhZGRyZXNzVHlwZTogbnVtYmVyIHwgbnVsbCxcbiAgYmFja2xvZzogbnVtYmVyLFxuICBmZD86IG51bWJlciB8IG51bGwsXG4gIGV4Y2x1c2l2ZT86IGJvb2xlYW4sXG4gIGZsYWdzPzogbnVtYmVyLFxuKSB7XG4gIGV4Y2x1c2l2ZSA9ICEhZXhjbHVzaXZlO1xuXG4gIC8vIFRPRE8oY21vcnRlbik6IGhlcmUgd2UgZGV2aWF0ZSBzb21ld2hhdCBmcm9tIHRoZSBOb2RlIGltcGxlbWVudGF0aW9uIHdoaWNoXG4gIC8vIG1ha2VzIHVzZSBvZiB0aGUgaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9jbHVzdGVyLmh0bWwgbW9kdWxlIHRvIHJ1biBzZXJ2ZXJzXG4gIC8vIGFjcm9zcyBhIFwiY2x1c3RlclwiIG9mIE5vZGUgcHJvY2Vzc2VzIHRvIHRha2UgYWR2YW50YWdlIG9mIG11bHRpLWNvcmVcbiAgLy8gc3lzdGVtcy5cbiAgLy9cbiAgLy8gVGhvdWdoIERlbm8gaGFzIGhhcyBhIFdvcmtlciBjYXBhYmlsaXR5IGZyb20gd2hpY2ggd2UgY291bGQgc2ltdWxhdGUgdGhpcyxcbiAgLy8gZm9yIG5vdyB3ZSBhc3NlcnQgdGhhdCB3ZSBhcmUgX2Fsd2F5c18gb24gdGhlIHByaW1hcnkgcHJvY2Vzcy5cbiAgY29uc3QgaXNQcmltYXJ5ID0gdHJ1ZTtcblxuICBpZiAoaXNQcmltYXJ5IHx8IGV4Y2x1c2l2ZSkge1xuICAgIC8vIFdpbGwgY3JlYXRlIGEgbmV3IGhhbmRsZVxuICAgIC8vIF9saXN0ZW4yIHNldHMgdXAgdGhlIGxpc3RlbmVkIGhhbmRsZSwgaXQgaXMgc3RpbGwgbmFtZWQgbGlrZSB0aGlzXG4gICAgLy8gdG8gYXZvaWQgYnJlYWtpbmcgY29kZSB0aGF0IHdyYXBzIHRoaXMgbWV0aG9kXG4gICAgc2VydmVyLl9saXN0ZW4yKGFkZHJlc3MsIHBvcnQsIGFkZHJlc3NUeXBlLCBiYWNrbG9nLCBmZCwgZmxhZ3MpO1xuXG4gICAgcmV0dXJuO1xuICB9XG59XG5cbmZ1bmN0aW9uIF9sb29rdXBBbmRMaXN0ZW4oXG4gIHNlcnZlcjogU2VydmVyLFxuICBwb3J0OiBudW1iZXIsXG4gIGFkZHJlc3M6IHN0cmluZyxcbiAgYmFja2xvZzogbnVtYmVyLFxuICBleGNsdXNpdmU6IGJvb2xlYW4sXG4gIGZsYWdzOiBudW1iZXIsXG4pIHtcbiAgZG5zTG9va3VwKGFkZHJlc3MsIGZ1bmN0aW9uIGRvTGlzdGVuKGVyciwgaXAsIGFkZHJlc3NUeXBlKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgc2VydmVyLmVtaXQoXCJlcnJvclwiLCBlcnIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBhZGRyZXNzVHlwZSA9IGlwID8gYWRkcmVzc1R5cGUgOiA0O1xuXG4gICAgICBfbGlzdGVuSW5DbHVzdGVyKFxuICAgICAgICBzZXJ2ZXIsXG4gICAgICAgIGlwLFxuICAgICAgICBwb3J0LFxuICAgICAgICBhZGRyZXNzVHlwZSxcbiAgICAgICAgYmFja2xvZyxcbiAgICAgICAgbnVsbCxcbiAgICAgICAgZXhjbHVzaXZlLFxuICAgICAgICBmbGFncyxcbiAgICAgICk7XG4gICAgfVxuICB9KTtcbn1cblxuZnVuY3Rpb24gX2FkZEFib3J0U2lnbmFsT3B0aW9uKHNlcnZlcjogU2VydmVyLCBvcHRpb25zOiBMaXN0ZW5PcHRpb25zKSB7XG4gIGlmIChvcHRpb25zPy5zaWduYWwgPT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhbGlkYXRlQWJvcnRTaWduYWwob3B0aW9ucy5zaWduYWwsIFwib3B0aW9ucy5zaWduYWxcIik7XG5cbiAgY29uc3QgeyBzaWduYWwgfSA9IG9wdGlvbnM7XG5cbiAgY29uc3Qgb25BYm9ydGVkID0gKCkgPT4ge1xuICAgIHNlcnZlci5jbG9zZSgpO1xuICB9O1xuXG4gIGlmIChzaWduYWwuYWJvcnRlZCkge1xuICAgIG5leHRUaWNrKG9uQWJvcnRlZCk7XG4gIH0gZWxzZSB7XG4gICAgc2lnbmFsLmFkZEV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCBvbkFib3J0ZWQpO1xuICAgIHNlcnZlci5vbmNlKFwiY2xvc2VcIiwgKCkgPT4gc2lnbmFsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCBvbkFib3J0ZWQpKTtcbiAgfVxufVxuXG4vLyBSZXR1cm5zIGhhbmRsZSBpZiBpdCBjYW4gYmUgY3JlYXRlZCwgb3IgZXJyb3IgY29kZSBpZiBpdCBjYW4ndFxuZXhwb3J0IGZ1bmN0aW9uIF9jcmVhdGVTZXJ2ZXJIYW5kbGUoXG4gIGFkZHJlc3M6IHN0cmluZyB8IG51bGwsXG4gIHBvcnQ6IG51bWJlciB8IG51bGwsXG4gIGFkZHJlc3NUeXBlOiBudW1iZXIgfCBudWxsLFxuICBmZD86IG51bWJlciB8IG51bGwsXG4gIGZsYWdzPzogbnVtYmVyLFxuKTogSGFuZGxlIHwgbnVtYmVyIHtcbiAgbGV0IGVyciA9IDA7XG4gIC8vIEFzc2lnbiBoYW5kbGUgaW4gbGlzdGVuLCBhbmQgY2xlYW4gdXAgaWYgYmluZCBvciBsaXN0ZW4gZmFpbHNcbiAgbGV0IGhhbmRsZTtcbiAgbGV0IGlzVENQID0gZmFsc2U7XG5cbiAgaWYgKHR5cGVvZiBmZCA9PT0gXCJudW1iZXJcIiAmJiBmZCA+PSAwKSB7XG4gICAgdHJ5IHtcbiAgICAgIGhhbmRsZSA9IF9jcmVhdGVIYW5kbGUoZmQsIHRydWUpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIC8vIE5vdCBhIGZkIHdlIGNhbiBsaXN0ZW4gb24uIFRoaXMgd2lsbCB0cmlnZ2VyIGFuIGVycm9yLlxuICAgICAgZGVidWcoXCJsaXN0ZW4gaW52YWxpZCBmZD0lZDpcIiwgZmQsIChlIGFzIEVycm9yKS5tZXNzYWdlKTtcblxuICAgICAgcmV0dXJuIGNvZGVNYXAuZ2V0KFwiRUlOVkFMXCIpITtcbiAgICB9XG5cbiAgICBlcnIgPSBoYW5kbGUub3BlbihmZCk7XG5cbiAgICBpZiAoZXJyKSB7XG4gICAgICByZXR1cm4gZXJyO1xuICAgIH1cblxuICAgIGFzc2VydCghYWRkcmVzcyAmJiAhcG9ydCk7XG4gIH0gZWxzZSBpZiAocG9ydCA9PT0gLTEgJiYgYWRkcmVzc1R5cGUgPT09IC0xKSB7XG4gICAgaGFuZGxlID0gbmV3IFBpcGUoUGlwZUNvbnN0YW50cy5TRVJWRVIpO1xuXG4gICAgaWYgKGlzV2luZG93cykge1xuICAgICAgY29uc3QgaW5zdGFuY2VzID0gTnVtYmVyLnBhcnNlSW50KFxuICAgICAgICBEZW5vLmVudi5nZXQoXCJOT0RFX1BFTkRJTkdfUElQRV9JTlNUQU5DRVNcIikgPz8gXCJcIixcbiAgICAgICk7XG5cbiAgICAgIGlmICghTnVtYmVyLmlzTmFOKGluc3RhbmNlcykpIHtcbiAgICAgICAgaGFuZGxlLnNldFBlbmRpbmdJbnN0YW5jZXMhKGluc3RhbmNlcyk7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGhhbmRsZSA9IG5ldyBUQ1AoVENQQ29uc3RhbnRzLlNFUlZFUik7XG4gICAgaXNUQ1AgPSB0cnVlO1xuICB9XG5cbiAgaWYgKGFkZHJlc3MgfHwgcG9ydCB8fCBpc1RDUCkge1xuICAgIGRlYnVnKFwiYmluZCB0b1wiLCBhZGRyZXNzIHx8IFwiYW55XCIpO1xuXG4gICAgaWYgKCFhZGRyZXNzKSB7XG4gICAgICAvLyBUcnkgYmluZGluZyB0byBpcHY2IGZpcnN0XG4gICAgICBlcnIgPSAoaGFuZGxlIGFzIFRDUCkuYmluZDYoXG4gICAgICAgIERFRkFVTFRfSVBWNl9BRERSLFxuICAgICAgICBwb3J0ID8/IDAsXG4gICAgICAgIGZsYWdzID8/IDAsXG4gICAgICApO1xuXG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIGhhbmRsZS5jbG9zZSgpO1xuXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGlwdjRcbiAgICAgICAgcmV0dXJuIF9jcmVhdGVTZXJ2ZXJIYW5kbGUoREVGQVVMVF9JUFY0X0FERFIsIHBvcnQsIDQsIG51bGwsIGZsYWdzKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGFkZHJlc3NUeXBlID09PSA2KSB7XG4gICAgICBlcnIgPSAoaGFuZGxlIGFzIFRDUCkuYmluZDYoYWRkcmVzcywgcG9ydCA/PyAwLCBmbGFncyA/PyAwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZXJyID0gKGhhbmRsZSBhcyBUQ1ApLmJpbmQoYWRkcmVzcywgcG9ydCA/PyAwKTtcbiAgICB9XG4gIH1cblxuICBpZiAoZXJyKSB7XG4gICAgaGFuZGxlLmNsb3NlKCk7XG5cbiAgICByZXR1cm4gZXJyO1xuICB9XG5cbiAgcmV0dXJuIGhhbmRsZTtcbn1cblxuZnVuY3Rpb24gX2VtaXRFcnJvck5UKHNlcnZlcjogU2VydmVyLCBlcnI6IEVycm9yKSB7XG4gIHNlcnZlci5lbWl0KFwiZXJyb3JcIiwgZXJyKTtcbn1cblxuZnVuY3Rpb24gX2VtaXRMaXN0ZW5pbmdOVChzZXJ2ZXI6IFNlcnZlcikge1xuICAvLyBFbnN1cmUgaGFuZGxlIGhhc24ndCBjbG9zZWRcbiAgaWYgKHNlcnZlci5faGFuZGxlKSB7XG4gICAgc2VydmVyLmVtaXQoXCJsaXN0ZW5pbmdcIik7XG4gIH1cbn1cblxuLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbmZ1bmN0aW9uIF9vbmNvbm5lY3Rpb24odGhpczogYW55LCBlcnI6IG51bWJlciwgY2xpZW50SGFuZGxlPzogSGFuZGxlKSB7XG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tdGhpcy1hbGlhc1xuICBjb25zdCBoYW5kbGUgPSB0aGlzO1xuICBjb25zdCBzZWxmID0gaGFuZGxlW293bmVyU3ltYm9sXTtcblxuICBkZWJ1ZyhcIm9uY29ubmVjdGlvblwiKTtcblxuICBpZiAoZXJyKSB7XG4gICAgc2VsZi5lbWl0KFwiZXJyb3JcIiwgZXJybm9FeGNlcHRpb24oZXJyLCBcImFjY2VwdFwiKSk7XG5cbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoc2VsZi5tYXhDb25uZWN0aW9ucyAmJiBzZWxmLl9jb25uZWN0aW9ucyA+PSBzZWxmLm1heENvbm5lY3Rpb25zKSB7XG4gICAgY2xpZW50SGFuZGxlIS5jbG9zZSgpO1xuXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgc29ja2V0ID0gbmV3IFNvY2tldCh7XG4gICAgaGFuZGxlOiBjbGllbnRIYW5kbGUsXG4gICAgYWxsb3dIYWxmT3Blbjogc2VsZi5hbGxvd0hhbGZPcGVuLFxuICAgIHBhdXNlT25DcmVhdGU6IHNlbGYucGF1c2VPbkNvbm5lY3QsXG4gICAgcmVhZGFibGU6IHRydWUsXG4gICAgd3JpdGFibGU6IHRydWUsXG4gIH0pO1xuXG4gIHNlbGYuX2Nvbm5lY3Rpb25zKys7XG4gIHNvY2tldC5zZXJ2ZXIgPSBzZWxmO1xuICBzb2NrZXQuX3NlcnZlciA9IHNlbGY7XG5cbiAgRFRSQUNFX05FVF9TRVJWRVJfQ09OTkVDVElPTihzb2NrZXQpO1xuICBzZWxmLmVtaXQoXCJjb25uZWN0aW9uXCIsIHNvY2tldCk7XG59XG5cbmZ1bmN0aW9uIF9zZXR1cExpc3RlbkhhbmRsZShcbiAgdGhpczogU2VydmVyLFxuICBhZGRyZXNzOiBzdHJpbmcgfCBudWxsLFxuICBwb3J0OiBudW1iZXIgfCBudWxsLFxuICBhZGRyZXNzVHlwZTogbnVtYmVyIHwgbnVsbCxcbiAgYmFja2xvZzogbnVtYmVyLFxuICBmZD86IG51bWJlciB8IG51bGwsXG4gIGZsYWdzPzogbnVtYmVyLFxuKTogdm9pZCB7XG4gIGRlYnVnKFwic2V0dXBMaXN0ZW5IYW5kbGVcIiwgYWRkcmVzcywgcG9ydCwgYWRkcmVzc1R5cGUsIGJhY2tsb2csIGZkKTtcblxuICAvLyBJZiB0aGVyZSBpcyBub3QgeWV0IGEgaGFuZGxlLCB3ZSBuZWVkIHRvIGNyZWF0ZSBvbmUgYW5kIGJpbmQuXG4gIC8vIEluIHRoZSBjYXNlIG9mIGEgc2VydmVyIHNlbnQgdmlhIElQQywgd2UgZG9uJ3QgbmVlZCB0byBkbyB0aGlzLlxuICBpZiAodGhpcy5faGFuZGxlKSB7XG4gICAgZGVidWcoXCJzZXR1cExpc3RlbkhhbmRsZTogaGF2ZSBhIGhhbmRsZSBhbHJlYWR5XCIpO1xuICB9IGVsc2Uge1xuICAgIGRlYnVnKFwic2V0dXBMaXN0ZW5IYW5kbGU6IGNyZWF0ZSBhIGhhbmRsZVwiKTtcblxuICAgIGxldCBydmFsID0gbnVsbDtcblxuICAgIC8vIFRyeSB0byBiaW5kIHRvIHRoZSB1bnNwZWNpZmllZCBJUHY2IGFkZHJlc3MsIHNlZSBpZiBJUHY2IGlzIGF2YWlsYWJsZVxuICAgIGlmICghYWRkcmVzcyAmJiB0eXBlb2YgZmQgIT09IFwibnVtYmVyXCIpIHtcbiAgICAgIHJ2YWwgPSBfY3JlYXRlU2VydmVySGFuZGxlKERFRkFVTFRfSVBWNl9BRERSLCBwb3J0LCA2LCBmZCwgZmxhZ3MpO1xuXG4gICAgICBpZiAodHlwZW9mIHJ2YWwgPT09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgcnZhbCA9IG51bGw7XG4gICAgICAgIGFkZHJlc3MgPSBERUZBVUxUX0lQVjRfQUREUjtcbiAgICAgICAgYWRkcmVzc1R5cGUgPSA0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYWRkcmVzcyA9IERFRkFVTFRfSVBWNl9BRERSO1xuICAgICAgICBhZGRyZXNzVHlwZSA9IDY7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHJ2YWwgPT09IG51bGwpIHtcbiAgICAgIHJ2YWwgPSBfY3JlYXRlU2VydmVySGFuZGxlKGFkZHJlc3MsIHBvcnQsIGFkZHJlc3NUeXBlLCBmZCwgZmxhZ3MpO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgcnZhbCA9PT0gXCJudW1iZXJcIikge1xuICAgICAgY29uc3QgZXJyb3IgPSB1dkV4Y2VwdGlvbldpdGhIb3N0UG9ydChydmFsLCBcImxpc3RlblwiLCBhZGRyZXNzLCBwb3J0KTtcbiAgICAgIG5leHRUaWNrKF9lbWl0RXJyb3JOVCwgdGhpcywgZXJyb3IpO1xuXG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5faGFuZGxlID0gcnZhbDtcbiAgfVxuXG4gIHRoaXNbYXN5bmNJZFN5bWJvbF0gPSBfZ2V0TmV3QXN5bmNJZCh0aGlzLl9oYW5kbGUpO1xuICB0aGlzLl9oYW5kbGUub25jb25uZWN0aW9uID0gX29uY29ubmVjdGlvbjtcbiAgdGhpcy5faGFuZGxlW293bmVyU3ltYm9sXSA9IHRoaXM7XG5cbiAgLy8gVXNlIGEgYmFja2xvZyBvZiA1MTIgZW50cmllcy4gV2UgcGFzcyA1MTEgdG8gdGhlIGxpc3RlbigpIGNhbGwgYmVjYXVzZVxuICAvLyB0aGUga2VybmVsIGRvZXM6IGJhY2tsb2dzaXplID0gcm91bmR1cF9wb3dfb2ZfdHdvKGJhY2tsb2dzaXplICsgMSk7XG4gIC8vIHdoaWNoIHdpbGwgdGh1cyBnaXZlIHVzIGEgYmFja2xvZyBvZiA1MTIgZW50cmllcy5cbiAgY29uc3QgZXJyID0gdGhpcy5faGFuZGxlLmxpc3RlbihiYWNrbG9nIHx8IDUxMSk7XG5cbiAgaWYgKGVycikge1xuICAgIGNvbnN0IGV4ID0gdXZFeGNlcHRpb25XaXRoSG9zdFBvcnQoZXJyLCBcImxpc3RlblwiLCBhZGRyZXNzLCBwb3J0KTtcbiAgICB0aGlzLl9oYW5kbGUuY2xvc2UoKTtcbiAgICB0aGlzLl9oYW5kbGUgPSBudWxsO1xuXG4gICAgZGVmYXVsdFRyaWdnZXJBc3luY0lkU2NvcGUoXG4gICAgICB0aGlzW2FzeW5jSWRTeW1ib2xdLFxuICAgICAgbmV4dFRpY2ssXG4gICAgICBfZW1pdEVycm9yTlQsXG4gICAgICB0aGlzLFxuICAgICAgZXgsXG4gICAgKTtcblxuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEdlbmVyYXRlIGNvbm5lY3Rpb24ga2V5LCB0aGlzIHNob3VsZCBiZSB1bmlxdWUgdG8gdGhlIGNvbm5lY3Rpb25cbiAgdGhpcy5fY29ubmVjdGlvbktleSA9IGFkZHJlc3NUeXBlICsgXCI6XCIgKyBhZGRyZXNzICsgXCI6XCIgKyBwb3J0O1xuXG4gIC8vIFVucmVmIHRoZSBoYW5kbGUgaWYgdGhlIHNlcnZlciB3YXMgdW5yZWYnZWQgcHJpb3IgdG8gbGlzdGVuaW5nXG4gIGlmICh0aGlzLl91bnJlZikge1xuICAgIHRoaXMudW5yZWYoKTtcbiAgfVxuXG4gIGRlZmF1bHRUcmlnZ2VyQXN5bmNJZFNjb3BlKFxuICAgIHRoaXNbYXN5bmNJZFN5bWJvbF0sXG4gICAgbmV4dFRpY2ssXG4gICAgX2VtaXRMaXN0ZW5pbmdOVCxcbiAgICB0aGlzLFxuICApO1xufVxuXG4vKiogVGhpcyBjbGFzcyBpcyB1c2VkIHRvIGNyZWF0ZSBhIFRDUCBvciBJUEMgc2VydmVyLiAqL1xuZXhwb3J0IGNsYXNzIFNlcnZlciBleHRlbmRzIEV2ZW50RW1pdHRlciB7XG4gIFthc3luY0lkU3ltYm9sXSA9IC0xO1xuXG4gIGFsbG93SGFsZk9wZW4gPSBmYWxzZTtcbiAgcGF1c2VPbkNvbm5lY3QgPSBmYWxzZTtcblxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBfaGFuZGxlOiBhbnkgPSBudWxsO1xuICBfY29ubmVjdGlvbnMgPSAwO1xuICBfdXNpbmdXb3JrZXJzID0gZmFsc2U7XG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIF93b3JrZXJzOiBhbnlbXSA9IFtdO1xuICBfdW5yZWYgPSBmYWxzZTtcbiAgX3BpcGVOYW1lPzogc3RyaW5nO1xuICBfY29ubmVjdGlvbktleT86IHN0cmluZztcblxuICAvKipcbiAgICogYG5ldC5TZXJ2ZXJgIGlzIGFuIGBFdmVudEVtaXR0ZXJgIHdpdGggdGhlIGZvbGxvd2luZyBldmVudHM6XG4gICAqXG4gICAqIC0gYFwiY2xvc2VcImAgLSBFbWl0dGVkIHdoZW4gdGhlIHNlcnZlciBjbG9zZXMuIElmIGNvbm5lY3Rpb25zIGV4aXN0LCB0aGlzXG4gICAqIGV2ZW50IGlzIG5vdCBlbWl0dGVkIHVudGlsIGFsbCBjb25uZWN0aW9ucyBhcmUgZW5kZWQuXG4gICAqIC0gYFwiY29ubmVjdGlvblwiYCAtIEVtaXR0ZWQgd2hlbiBhIG5ldyBjb25uZWN0aW9uIGlzIG1hZGUuIGBzb2NrZXRgIGlzIGFuXG4gICAqIGluc3RhbmNlIG9mIGBuZXQuU29ja2V0YC5cbiAgICogLSBgXCJlcnJvclwiYCAtIEVtaXR0ZWQgd2hlbiBhbiBlcnJvciBvY2N1cnMuIFVubGlrZSBgbmV0LlNvY2tldGAsIHRoZVxuICAgKiBgXCJjbG9zZVwiYCBldmVudCB3aWxsIG5vdCBiZSBlbWl0dGVkIGRpcmVjdGx5IGZvbGxvd2luZyB0aGlzIGV2ZW50IHVubGVzc1xuICAgKiBgc2VydmVyLmNsb3NlKClgIGlzIG1hbnVhbGx5IGNhbGxlZC4gU2VlIHRoZSBleGFtcGxlIGluIGRpc2N1c3Npb24gb2ZcbiAgICogYHNlcnZlci5saXN0ZW4oKWAuXG4gICAqIC0gYFwibGlzdGVuaW5nXCJgIC0gRW1pdHRlZCB3aGVuIHRoZSBzZXJ2ZXIgaGFzIGJlZW4gYm91bmQgYWZ0ZXIgY2FsbGluZ1xuICAgKiBgc2VydmVyLmxpc3RlbigpYC5cbiAgICovXG4gIGNvbnN0cnVjdG9yKGNvbm5lY3Rpb25MaXN0ZW5lcj86IENvbm5lY3Rpb25MaXN0ZW5lcik7XG4gIGNvbnN0cnVjdG9yKG9wdGlvbnM/OiBTZXJ2ZXJPcHRpb25zLCBjb25uZWN0aW9uTGlzdGVuZXI/OiBDb25uZWN0aW9uTGlzdGVuZXIpO1xuICBjb25zdHJ1Y3RvcihcbiAgICBvcHRpb25zPzogU2VydmVyT3B0aW9ucyB8IENvbm5lY3Rpb25MaXN0ZW5lcixcbiAgICBjb25uZWN0aW9uTGlzdGVuZXI/OiBDb25uZWN0aW9uTGlzdGVuZXIsXG4gICkge1xuICAgIHN1cGVyKCk7XG5cbiAgICBpZiAoX2lzQ29ubmVjdGlvbkxpc3RlbmVyKG9wdGlvbnMpKSB7XG4gICAgICB0aGlzLm9uKFwiY29ubmVjdGlvblwiLCBvcHRpb25zKTtcbiAgICB9IGVsc2UgaWYgKF9pc1NlcnZlclNvY2tldE9wdGlvbnMob3B0aW9ucykpIHtcbiAgICAgIHRoaXMuYWxsb3dIYWxmT3BlbiA9IG9wdGlvbnM/LmFsbG93SGFsZk9wZW4gfHwgZmFsc2U7XG4gICAgICB0aGlzLnBhdXNlT25Db25uZWN0ID0gISFvcHRpb25zPy5wYXVzZU9uQ29ubmVjdDtcblxuICAgICAgaWYgKF9pc0Nvbm5lY3Rpb25MaXN0ZW5lcihjb25uZWN0aW9uTGlzdGVuZXIpKSB7XG4gICAgICAgIHRoaXMub24oXCJjb25uZWN0aW9uXCIsIGNvbm5lY3Rpb25MaXN0ZW5lcik7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFUlJfSU5WQUxJRF9BUkdfVFlQRShcIm9wdGlvbnNcIiwgXCJPYmplY3RcIiwgb3B0aW9ucyk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN0YXJ0IGEgc2VydmVyIGxpc3RlbmluZyBmb3IgY29ubmVjdGlvbnMuIEEgYG5ldC5TZXJ2ZXJgIGNhbiBiZSBhIFRDUCBvclxuICAgKiBhbiBgSVBDYCBzZXJ2ZXIgZGVwZW5kaW5nIG9uIHdoYXQgaXQgbGlzdGVucyB0by5cbiAgICpcbiAgICogUG9zc2libGUgc2lnbmF0dXJlczpcbiAgICpcbiAgICogLSBgc2VydmVyLmxpc3RlbihoYW5kbGVbLCBiYWNrbG9nXVssIGNhbGxiYWNrXSlgXG4gICAqIC0gYHNlcnZlci5saXN0ZW4ob3B0aW9uc1ssIGNhbGxiYWNrXSlgXG4gICAqIC0gYHNlcnZlci5saXN0ZW4ocGF0aFssIGJhY2tsb2ddWywgY2FsbGJhY2tdKWAgZm9yIGBJUENgIHNlcnZlcnNcbiAgICogLSBgc2VydmVyLmxpc3RlbihbcG9ydFssIGhvc3RbLCBiYWNrbG9nXV1dWywgY2FsbGJhY2tdKWAgZm9yIFRDUCBzZXJ2ZXJzXG4gICAqXG4gICAqIFRoaXMgZnVuY3Rpb24gaXMgYXN5bmNocm9ub3VzLiBXaGVuIHRoZSBzZXJ2ZXIgc3RhcnRzIGxpc3RlbmluZywgdGhlIGAnbGlzdGVuaW5nJ2AgZXZlbnQgd2lsbCBiZSBlbWl0dGVkLiBUaGUgbGFzdCBwYXJhbWV0ZXIgYGNhbGxiYWNrYHdpbGwgYmUgYWRkZWQgYXMgYSBsaXN0ZW5lciBmb3IgdGhlIGAnbGlzdGVuaW5nJ2BcbiAgICogZXZlbnQuXG4gICAqXG4gICAqIEFsbCBgbGlzdGVuKClgIG1ldGhvZHMgY2FuIHRha2UgYSBgYmFja2xvZ2AgcGFyYW1ldGVyIHRvIHNwZWNpZnkgdGhlIG1heGltdW1cbiAgICogbGVuZ3RoIG9mIHRoZSBxdWV1ZSBvZiBwZW5kaW5nIGNvbm5lY3Rpb25zLiBUaGUgYWN0dWFsIGxlbmd0aCB3aWxsIGJlIGRldGVybWluZWRcbiAgICogYnkgdGhlIE9TIHRocm91Z2ggc3lzY3RsIHNldHRpbmdzIHN1Y2ggYXMgYHRjcF9tYXhfc3luX2JhY2tsb2dgIGFuZCBgc29tYXhjb25uYCBvbiBMaW51eC4gVGhlIGRlZmF1bHQgdmFsdWUgb2YgdGhpcyBwYXJhbWV0ZXIgaXMgNTExIChub3QgNTEyKS5cbiAgICpcbiAgICogQWxsIGBTb2NrZXRgIGFyZSBzZXQgdG8gYFNPX1JFVVNFQUREUmAgKHNlZSBbYHNvY2tldCg3KWBdKGh0dHBzOi8vbWFuNy5vcmcvbGludXgvbWFuLXBhZ2VzL21hbjcvc29ja2V0LjcuaHRtbCkgZm9yXG4gICAqIGRldGFpbHMpLlxuICAgKlxuICAgKiBUaGUgYHNlcnZlci5saXN0ZW4oKWAgbWV0aG9kIGNhbiBiZSBjYWxsZWQgYWdhaW4gaWYgYW5kIG9ubHkgaWYgdGhlcmUgd2FzIGFuXG4gICAqIGVycm9yIGR1cmluZyB0aGUgZmlyc3QgYHNlcnZlci5saXN0ZW4oKWAgY2FsbCBvciBgc2VydmVyLmNsb3NlKClgIGhhcyBiZWVuXG4gICAqIGNhbGxlZC4gT3RoZXJ3aXNlLCBhbiBgRVJSX1NFUlZFUl9BTFJFQURZX0xJU1RFTmAgZXJyb3Igd2lsbCBiZSB0aHJvd24uXG4gICAqXG4gICAqIE9uZSBvZiB0aGUgbW9zdCBjb21tb24gZXJyb3JzIHJhaXNlZCB3aGVuIGxpc3RlbmluZyBpcyBgRUFERFJJTlVTRWAuXG4gICAqIFRoaXMgaGFwcGVucyB3aGVuIGFub3RoZXIgc2VydmVyIGlzIGFscmVhZHkgbGlzdGVuaW5nIG9uIHRoZSByZXF1ZXN0ZWRgcG9ydGAvYHBhdGhgL2BoYW5kbGVgLiBPbmUgd2F5IHRvIGhhbmRsZSB0aGlzIHdvdWxkIGJlIHRvIHJldHJ5XG4gICAqIGFmdGVyIGEgY2VydGFpbiBhbW91bnQgb2YgdGltZTpcbiAgICpcbiAgICogYGBgdHNcbiAgICogaW1wb3J0IHsgY3JlYXRlUmVxdWlyZSB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL25vZGUvbW9kdWxlLnRzXCI7XG4gICAqXG4gICAqIGNvbnN0IHJlcXVpcmUgPSBjcmVhdGVSZXF1aXJlKGltcG9ydC5tZXRhLnVybCk7XG4gICAqIGNvbnN0IG5ldCA9IHJlcXVpcmUoXCJuZXRcIik7XG4gICAqXG4gICAqIGNvbnN0IFBPUlQgPSAzMDAwO1xuICAgKiBjb25zdCBIT1NUID0gXCIxMjcuMC4wLjFcIjtcbiAgICogY29uc3Qgc2VydmVyID0gbmV3IG5ldC5TZXJ2ZXIoKTtcbiAgICpcbiAgICogc2VydmVyLm9uKFwiZXJyb3JcIiwgKGU6IEVycm9yICYgeyBjb2RlOiBzdHJpbmc7IH0pID0+IHtcbiAgICogICBpZiAoZS5jb2RlID09PSBcIkVBRERSSU5VU0VcIikge1xuICAgKiAgICAgY29uc29sZS5sb2coXCJBZGRyZXNzIGluIHVzZSwgcmV0cnlpbmcuLi5cIik7XG4gICAqICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICogICAgICAgc2VydmVyLmNsb3NlKCk7XG4gICAqICAgICAgIHNlcnZlci5saXN0ZW4oUE9SVCwgSE9TVCk7XG4gICAqICAgICB9LCAxMDAwKTtcbiAgICogICB9XG4gICAqIH0pO1xuICAgKiBgYGBcbiAgICovXG4gIGxpc3RlbihcbiAgICBwb3J0PzogbnVtYmVyLFxuICAgIGhvc3RuYW1lPzogc3RyaW5nLFxuICAgIGJhY2tsb2c/OiBudW1iZXIsXG4gICAgbGlzdGVuaW5nTGlzdGVuZXI/OiAoKSA9PiB2b2lkLFxuICApOiB0aGlzO1xuICBsaXN0ZW4oXG4gICAgcG9ydD86IG51bWJlcixcbiAgICBob3N0bmFtZT86IHN0cmluZyxcbiAgICBsaXN0ZW5pbmdMaXN0ZW5lcj86ICgpID0+IHZvaWQsXG4gICk6IHRoaXM7XG4gIGxpc3Rlbihwb3J0PzogbnVtYmVyLCBiYWNrbG9nPzogbnVtYmVyLCBsaXN0ZW5pbmdMaXN0ZW5lcj86ICgpID0+IHZvaWQpOiB0aGlzO1xuICBsaXN0ZW4ocG9ydD86IG51bWJlciwgbGlzdGVuaW5nTGlzdGVuZXI/OiAoKSA9PiB2b2lkKTogdGhpcztcbiAgbGlzdGVuKHBhdGg6IHN0cmluZywgYmFja2xvZz86IG51bWJlciwgbGlzdGVuaW5nTGlzdGVuZXI/OiAoKSA9PiB2b2lkKTogdGhpcztcbiAgbGlzdGVuKHBhdGg6IHN0cmluZywgbGlzdGVuaW5nTGlzdGVuZXI/OiAoKSA9PiB2b2lkKTogdGhpcztcbiAgbGlzdGVuKG9wdGlvbnM6IExpc3Rlbk9wdGlvbnMsIGxpc3RlbmluZ0xpc3RlbmVyPzogKCkgPT4gdm9pZCk6IHRoaXM7XG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIGxpc3RlbihoYW5kbGU6IGFueSwgYmFja2xvZz86IG51bWJlciwgbGlzdGVuaW5nTGlzdGVuZXI/OiAoKSA9PiB2b2lkKTogdGhpcztcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgbGlzdGVuKGhhbmRsZTogYW55LCBsaXN0ZW5pbmdMaXN0ZW5lcj86ICgpID0+IHZvaWQpOiB0aGlzO1xuICBsaXN0ZW4oLi4uYXJnczogdW5rbm93bltdKTogdGhpcyB7XG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IF9ub3JtYWxpemVBcmdzKGFyZ3MpO1xuICAgIGxldCBvcHRpb25zID0gbm9ybWFsaXplZFswXSBhcyBQYXJ0aWFsPExpc3Rlbk9wdGlvbnM+O1xuICAgIGNvbnN0IGNiID0gbm9ybWFsaXplZFsxXTtcblxuICAgIGlmICh0aGlzLl9oYW5kbGUpIHtcbiAgICAgIHRocm93IG5ldyBFUlJfU0VSVkVSX0FMUkVBRFlfTElTVEVOKCk7XG4gICAgfVxuXG4gICAgaWYgKGNiICE9PSBudWxsKSB7XG4gICAgICB0aGlzLm9uY2UoXCJsaXN0ZW5pbmdcIiwgY2IpO1xuICAgIH1cblxuICAgIGNvbnN0IGJhY2tsb2dGcm9tQXJnczogbnVtYmVyID1cbiAgICAgIC8vIChoYW5kbGUsIGJhY2tsb2cpIG9yIChwYXRoLCBiYWNrbG9nKSBvciAocG9ydCwgYmFja2xvZylcbiAgICAgIF90b051bWJlcihhcmdzLmxlbmd0aCA+IDEgJiYgYXJnc1sxXSkgfHxcbiAgICAgIF90b051bWJlcihhcmdzLmxlbmd0aCA+IDIgJiYgYXJnc1syXSkgYXMgbnVtYmVyOyAvLyAocG9ydCwgaG9zdCwgYmFja2xvZylcblxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgb3B0aW9ucyA9IChvcHRpb25zIGFzIGFueSkuX2hhbmRsZSB8fCAob3B0aW9ucyBhcyBhbnkpLmhhbmRsZSB8fCBvcHRpb25zO1xuICAgIGNvbnN0IGZsYWdzID0gX2dldEZsYWdzKG9wdGlvbnMuaXB2Nk9ubHkpO1xuXG4gICAgLy8gKGhhbmRsZVssIGJhY2tsb2ddWywgY2JdKSB3aGVyZSBoYW5kbGUgaXMgYW4gb2JqZWN0IHdpdGggYSBoYW5kbGVcbiAgICBpZiAob3B0aW9ucyBpbnN0YW5jZW9mIFRDUCkge1xuICAgICAgdGhpcy5faGFuZGxlID0gb3B0aW9ucztcbiAgICAgIHRoaXNbYXN5bmNJZFN5bWJvbF0gPSB0aGlzLl9oYW5kbGUuZ2V0QXN5bmNJZCgpO1xuXG4gICAgICBfbGlzdGVuSW5DbHVzdGVyKHRoaXMsIG51bGwsIC0xLCAtMSwgYmFja2xvZ0Zyb21BcmdzKTtcblxuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgX2FkZEFib3J0U2lnbmFsT3B0aW9uKHRoaXMsIG9wdGlvbnMpO1xuXG4gICAgLy8gKGhhbmRsZVssIGJhY2tsb2ddWywgY2JdKSB3aGVyZSBoYW5kbGUgaXMgYW4gb2JqZWN0IHdpdGggYSBmZFxuICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5mZCA9PT0gXCJudW1iZXJcIiAmJiBvcHRpb25zLmZkID49IDApIHtcbiAgICAgIF9saXN0ZW5JbkNsdXN0ZXIodGhpcywgbnVsbCwgbnVsbCwgbnVsbCwgYmFja2xvZ0Zyb21BcmdzLCBvcHRpb25zLmZkKTtcblxuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLy8gKFtwb3J0XVssIGhvc3RdWywgYmFja2xvZ11bLCBjYl0pIHdoZXJlIHBvcnQgaXMgb21pdHRlZCxcbiAgICAvLyB0aGF0IGlzLCBsaXN0ZW4oKSwgbGlzdGVuKG51bGwpLCBsaXN0ZW4oY2IpLCBvciBsaXN0ZW4obnVsbCwgY2IpXG4gICAgLy8gb3IgKG9wdGlvbnNbLCBjYl0pIHdoZXJlIG9wdGlvbnMucG9ydCBpcyBleHBsaWNpdGx5IHNldCBhcyB1bmRlZmluZWQgb3JcbiAgICAvLyBudWxsLCBiaW5kIHRvIGFuIGFyYml0cmFyeSB1bnVzZWQgcG9ydFxuICAgIGlmIChcbiAgICAgIGFyZ3MubGVuZ3RoID09PSAwIHx8IHR5cGVvZiBhcmdzWzBdID09PSBcImZ1bmN0aW9uXCIgfHxcbiAgICAgICh0eXBlb2Ygb3B0aW9ucy5wb3J0ID09PSBcInVuZGVmaW5lZFwiICYmIFwicG9ydFwiIGluIG9wdGlvbnMpIHx8XG4gICAgICBvcHRpb25zLnBvcnQgPT09IG51bGxcbiAgICApIHtcbiAgICAgIG9wdGlvbnMucG9ydCA9IDA7XG4gICAgfVxuXG4gICAgLy8gKFtwb3J0XVssIGhvc3RdWywgYmFja2xvZ11bLCBjYl0pIHdoZXJlIHBvcnQgaXMgc3BlY2lmaWVkXG4gICAgLy8gb3IgKG9wdGlvbnNbLCBjYl0pIHdoZXJlIG9wdGlvbnMucG9ydCBpcyBzcGVjaWZpZWRcbiAgICAvLyBvciBpZiBvcHRpb25zLnBvcnQgaXMgbm9ybWFsaXplZCBhcyAwIGJlZm9yZVxuICAgIGxldCBiYWNrbG9nO1xuXG4gICAgaWYgKHR5cGVvZiBvcHRpb25zLnBvcnQgPT09IFwibnVtYmVyXCIgfHwgdHlwZW9mIG9wdGlvbnMucG9ydCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgdmFsaWRhdGVQb3J0KG9wdGlvbnMucG9ydCwgXCJvcHRpb25zLnBvcnRcIik7XG4gICAgICBiYWNrbG9nID0gb3B0aW9ucy5iYWNrbG9nIHx8IGJhY2tsb2dGcm9tQXJncztcblxuICAgICAgLy8gc3RhcnQgVENQIHNlcnZlciBsaXN0ZW5pbmcgb24gaG9zdDpwb3J0XG4gICAgICBpZiAob3B0aW9ucy5ob3N0KSB7XG4gICAgICAgIF9sb29rdXBBbmRMaXN0ZW4oXG4gICAgICAgICAgdGhpcyxcbiAgICAgICAgICBvcHRpb25zLnBvcnQgfCAwLFxuICAgICAgICAgIG9wdGlvbnMuaG9zdCxcbiAgICAgICAgICBiYWNrbG9nLFxuICAgICAgICAgICEhb3B0aW9ucy5leGNsdXNpdmUsXG4gICAgICAgICAgZmxhZ3MsXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBVbmRlZmluZWQgaG9zdCwgbGlzdGVucyBvbiB1bnNwZWNpZmllZCBhZGRyZXNzXG4gICAgICAgIC8vIERlZmF1bHQgYWRkcmVzc1R5cGUgNCB3aWxsIGJlIHVzZWQgdG8gc2VhcmNoIGZvciBwcmltYXJ5IHNlcnZlclxuICAgICAgICBfbGlzdGVuSW5DbHVzdGVyKFxuICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgbnVsbCxcbiAgICAgICAgICBvcHRpb25zLnBvcnQgfCAwLFxuICAgICAgICAgIDQsXG4gICAgICAgICAgYmFja2xvZyxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgb3B0aW9ucy5leGNsdXNpdmUsXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8vIChwYXRoWywgYmFja2xvZ11bLCBjYl0pIG9yIChvcHRpb25zWywgY2JdKVxuICAgIC8vIHdoZXJlIHBhdGggb3Igb3B0aW9ucy5wYXRoIGlzIGEgVU5JWCBkb21haW4gc29ja2V0IG9yIFdpbmRvd3MgcGlwZVxuICAgIGlmIChvcHRpb25zLnBhdGggJiYgX2lzUGlwZU5hbWUob3B0aW9ucy5wYXRoKSkge1xuICAgICAgY29uc3QgcGlwZU5hbWUgPSB0aGlzLl9waXBlTmFtZSA9IG9wdGlvbnMucGF0aDtcbiAgICAgIGJhY2tsb2cgPSBvcHRpb25zLmJhY2tsb2cgfHwgYmFja2xvZ0Zyb21BcmdzO1xuXG4gICAgICBfbGlzdGVuSW5DbHVzdGVyKFxuICAgICAgICB0aGlzLFxuICAgICAgICBwaXBlTmFtZSxcbiAgICAgICAgLTEsXG4gICAgICAgIC0xLFxuICAgICAgICBiYWNrbG9nLFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIG9wdGlvbnMuZXhjbHVzaXZlLFxuICAgICAgKTtcblxuICAgICAgaWYgKCF0aGlzLl9oYW5kbGUpIHtcbiAgICAgICAgLy8gRmFpbGVkIGFuZCBhbiBlcnJvciBzaGFsbCBiZSBlbWl0dGVkIGluIHRoZSBuZXh0IHRpY2suXG4gICAgICAgIC8vIFRoZXJlZm9yZSwgd2UgZGlyZWN0bHkgcmV0dXJuLlxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cblxuICAgICAgbGV0IG1vZGUgPSAwO1xuXG4gICAgICBpZiAob3B0aW9ucy5yZWFkYWJsZUFsbCA9PT0gdHJ1ZSkge1xuICAgICAgICBtb2RlIHw9IFBpcGVDb25zdGFudHMuVVZfUkVBREFCTEU7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcHRpb25zLndyaXRhYmxlQWxsID09PSB0cnVlKSB7XG4gICAgICAgIG1vZGUgfD0gUGlwZUNvbnN0YW50cy5VVl9XUklUQUJMRTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vZGUgIT09IDApIHtcbiAgICAgICAgY29uc3QgZXJyID0gdGhpcy5faGFuZGxlLmZjaG1vZChtb2RlKTtcblxuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgdGhpcy5faGFuZGxlLmNsb3NlKCk7XG4gICAgICAgICAgdGhpcy5faGFuZGxlID0gbnVsbDtcblxuICAgICAgICAgIHRocm93IGVycm5vRXhjZXB0aW9uKGVyciwgXCJ1dl9waXBlX2NobW9kXCIpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIGlmICghKChcInBvcnRcIiBpbiBvcHRpb25zKSB8fCAoXCJwYXRoXCIgaW4gb3B0aW9ucykpKSB7XG4gICAgICB0aHJvdyBuZXcgRVJSX0lOVkFMSURfQVJHX1ZBTFVFKFxuICAgICAgICBcIm9wdGlvbnNcIixcbiAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgJ211c3QgaGF2ZSB0aGUgcHJvcGVydHkgXCJwb3J0XCIgb3IgXCJwYXRoXCInLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgRVJSX0lOVkFMSURfQVJHX1ZBTFVFKFwib3B0aW9uc1wiLCBvcHRpb25zKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdG9wcyB0aGUgc2VydmVyIGZyb20gYWNjZXB0aW5nIG5ldyBjb25uZWN0aW9ucyBhbmQga2VlcHMgZXhpc3RpbmdcbiAgICogY29ubmVjdGlvbnMuIFRoaXMgZnVuY3Rpb24gaXMgYXN5bmNocm9ub3VzLCB0aGUgc2VydmVyIGlzIGZpbmFsbHkgY2xvc2VkXG4gICAqIHdoZW4gYWxsIGNvbm5lY3Rpb25zIGFyZSBlbmRlZCBhbmQgdGhlIHNlcnZlciBlbWl0cyBhIGBcImNsb3NlXCJgIGV2ZW50LlxuICAgKiBUaGUgb3B0aW9uYWwgYGNhbGxiYWNrYCB3aWxsIGJlIGNhbGxlZCBvbmNlIHRoZSBgXCJjbG9zZVwiYCBldmVudCBvY2N1cnMuIFVubGlrZVxuICAgKiB0aGF0IGV2ZW50LCBpdCB3aWxsIGJlIGNhbGxlZCB3aXRoIGFuIGBFcnJvcmAgYXMgaXRzIG9ubHkgYXJndW1lbnQgaWYgdGhlIHNlcnZlclxuICAgKiB3YXMgbm90IG9wZW4gd2hlbiBpdCB3YXMgY2xvc2VkLlxuICAgKlxuICAgKiBAcGFyYW0gY2IgQ2FsbGVkIHdoZW4gdGhlIHNlcnZlciBpcyBjbG9zZWQuXG4gICAqL1xuICBjbG9zZShjYj86IChlcnI/OiBFcnJvcikgPT4gdm9pZCk6IHRoaXMge1xuICAgIGlmICh0eXBlb2YgY2IgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgaWYgKCF0aGlzLl9oYW5kbGUpIHtcbiAgICAgICAgdGhpcy5vbmNlKFwiY2xvc2VcIiwgZnVuY3Rpb24gY2xvc2UoKSB7XG4gICAgICAgICAgY2IobmV3IEVSUl9TRVJWRVJfTk9UX1JVTk5JTkcoKSk7XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5vbmNlKFwiY2xvc2VcIiwgY2IpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0aGlzLl9oYW5kbGUpIHtcbiAgICAgICh0aGlzLl9oYW5kbGUgYXMgVENQKS5jbG9zZSgpO1xuICAgICAgdGhpcy5faGFuZGxlID0gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fdXNpbmdXb3JrZXJzKSB7XG4gICAgICBsZXQgbGVmdCA9IHRoaXMuX3dvcmtlcnMubGVuZ3RoO1xuICAgICAgY29uc3Qgb25Xb3JrZXJDbG9zZSA9ICgpID0+IHtcbiAgICAgICAgaWYgKC0tbGVmdCAhPT0gMCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb25zID0gMDtcbiAgICAgICAgdGhpcy5fZW1pdENsb3NlSWZEcmFpbmVkKCk7XG4gICAgICB9O1xuXG4gICAgICAvLyBJbmNyZW1lbnQgY29ubmVjdGlvbnMgdG8gYmUgc3VyZSB0aGF0LCBldmVuIGlmIGFsbCBzb2NrZXRzIHdpbGwgYmUgY2xvc2VkXG4gICAgICAvLyBkdXJpbmcgcG9sbGluZyBvZiB3b3JrZXJzLCBgY2xvc2VgIGV2ZW50IHdpbGwgYmUgZW1pdHRlZCBvbmx5IG9uY2UuXG4gICAgICB0aGlzLl9jb25uZWN0aW9ucysrO1xuXG4gICAgICAvLyBQb2xsIHdvcmtlcnNcbiAgICAgIGZvciAobGV0IG4gPSAwOyBuIDwgdGhpcy5fd29ya2Vycy5sZW5ndGg7IG4rKykge1xuICAgICAgICB0aGlzLl93b3JrZXJzW25dLmNsb3NlKG9uV29ya2VyQ2xvc2UpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9lbWl0Q2xvc2VJZkRyYWluZWQoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBib3VuZCBgYWRkcmVzc2AsIHRoZSBhZGRyZXNzIGBmYW1pbHlgIG5hbWUsIGFuZCBgcG9ydGAgb2YgdGhlIHNlcnZlclxuICAgKiBhcyByZXBvcnRlZCBieSB0aGUgb3BlcmF0aW5nIHN5c3RlbSBpZiBsaXN0ZW5pbmcgb24gYW4gSVAgc29ja2V0XG4gICAqICh1c2VmdWwgdG8gZmluZCB3aGljaCBwb3J0IHdhcyBhc3NpZ25lZCB3aGVuIGdldHRpbmcgYW4gT1MtYXNzaWduZWQgYWRkcmVzcyk6YHsgcG9ydDogMTIzNDYsIGZhbWlseTogXCJJUHY0XCIsIGFkZHJlc3M6IFwiMTI3LjAuMC4xXCIgfWAuXG4gICAqXG4gICAqIEZvciBhIHNlcnZlciBsaXN0ZW5pbmcgb24gYSBwaXBlIG9yIFVuaXggZG9tYWluIHNvY2tldCwgdGhlIG5hbWUgaXMgcmV0dXJuZWRcbiAgICogYXMgYSBzdHJpbmcuXG4gICAqXG4gICAqIGBgYHRzXG4gICAqIGltcG9ydCB7IGNyZWF0ZVJlcXVpcmUgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9ub2RlL21vZHVsZS50c1wiO1xuICAgKiBpbXBvcnQgeyBTb2NrZXQgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9ub2RlL25ldC50c1wiO1xuICAgKlxuICAgKiBjb25zdCByZXF1aXJlID0gY3JlYXRlUmVxdWlyZShpbXBvcnQubWV0YS51cmwpO1xuICAgKiBjb25zdCBuZXQgPSByZXF1aXJlKFwibmV0XCIpO1xuICAgKlxuICAgKiBjb25zdCBzZXJ2ZXIgPSBuZXQuY3JlYXRlU2VydmVyKChzb2NrZXQ6IFNvY2tldCkgPT4ge1xuICAgKiAgIHNvY2tldC5lbmQoXCJnb29kYnllXFxuXCIpO1xuICAgKiB9KS5vbihcImVycm9yXCIsIChlcnI6IEVycm9yKSA9PiB7XG4gICAqICAgLy8gSGFuZGxlIGVycm9ycyBoZXJlLlxuICAgKiAgIHRocm93IGVycjtcbiAgICogfSk7XG4gICAqXG4gICAqIC8vIEdyYWIgYW4gYXJiaXRyYXJ5IHVudXNlZCBwb3J0LlxuICAgKiBzZXJ2ZXIubGlzdGVuKCgpID0+IHtcbiAgICogICBjb25zb2xlLmxvZyhcIm9wZW5lZCBzZXJ2ZXIgb25cIiwgc2VydmVyLmFkZHJlc3MoKSk7XG4gICAqIH0pO1xuICAgKiBgYGBcbiAgICpcbiAgICogYHNlcnZlci5hZGRyZXNzKClgIHJldHVybnMgYG51bGxgIGJlZm9yZSB0aGUgYFwibGlzdGVuaW5nXCJgIGV2ZW50IGhhcyBiZWVuXG4gICAqIGVtaXR0ZWQgb3IgYWZ0ZXIgY2FsbGluZyBgc2VydmVyLmNsb3NlKClgLlxuICAgKi9cbiAgYWRkcmVzcygpOiBBZGRyZXNzSW5mbyB8IHN0cmluZyB8IG51bGwge1xuICAgIGlmICh0aGlzLl9oYW5kbGUgJiYgdGhpcy5faGFuZGxlLmdldHNvY2tuYW1lKSB7XG4gICAgICBjb25zdCBvdXQgPSB7fTtcbiAgICAgIGNvbnN0IGVyciA9IHRoaXMuX2hhbmRsZS5nZXRzb2NrbmFtZShvdXQpO1xuXG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHRocm93IGVycm5vRXhjZXB0aW9uKGVyciwgXCJhZGRyZXNzXCIpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gb3V0IGFzIEFkZHJlc3NJbmZvO1xuICAgIH0gZWxzZSBpZiAodGhpcy5fcGlwZU5hbWUpIHtcbiAgICAgIHJldHVybiB0aGlzLl9waXBlTmFtZTtcbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIC8qKlxuICAgKiBBc3luY2hyb25vdXNseSBnZXQgdGhlIG51bWJlciBvZiBjb25jdXJyZW50IGNvbm5lY3Rpb25zIG9uIHRoZSBzZXJ2ZXIuIFdvcmtzXG4gICAqIHdoZW4gc29ja2V0cyB3ZXJlIHNlbnQgdG8gZm9ya3MuXG4gICAqXG4gICAqIENhbGxiYWNrIHNob3VsZCB0YWtlIHR3byBhcmd1bWVudHMgYGVycmAgYW5kIGBjb3VudGAuXG4gICAqL1xuICBnZXRDb25uZWN0aW9ucyhjYjogKGVycjogRXJyb3IgfCBudWxsLCBjb3VudDogbnVtYmVyKSA9PiB2b2lkKTogdGhpcyB7XG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby10aGlzLWFsaWFzXG4gICAgY29uc3Qgc2VydmVyID0gdGhpcztcblxuICAgIGZ1bmN0aW9uIGVuZChlcnI6IEVycm9yIHwgbnVsbCwgY29ubmVjdGlvbnM/OiBudW1iZXIpIHtcbiAgICAgIGRlZmF1bHRUcmlnZ2VyQXN5bmNJZFNjb3BlKFxuICAgICAgICBzZXJ2ZXJbYXN5bmNJZFN5bWJvbF0sXG4gICAgICAgIG5leHRUaWNrLFxuICAgICAgICBjYixcbiAgICAgICAgZXJyLFxuICAgICAgICBjb25uZWN0aW9ucyxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLl91c2luZ1dvcmtlcnMpIHtcbiAgICAgIGVuZChudWxsLCB0aGlzLl9jb25uZWN0aW9ucyk7XG5cbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8vIFBvbGwgd29ya2Vyc1xuICAgIGxldCBsZWZ0ID0gdGhpcy5fd29ya2Vycy5sZW5ndGg7XG4gICAgbGV0IHRvdGFsID0gdGhpcy5fY29ubmVjdGlvbnM7XG5cbiAgICBmdW5jdGlvbiBvbmNvdW50KGVycjogRXJyb3IsIGNvdW50OiBudW1iZXIpIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgbGVmdCA9IC0xO1xuXG4gICAgICAgIHJldHVybiBlbmQoZXJyKTtcbiAgICAgIH1cblxuICAgICAgdG90YWwgKz0gY291bnQ7XG5cbiAgICAgIGlmICgtLWxlZnQgPT09IDApIHtcbiAgICAgICAgcmV0dXJuIGVuZChudWxsLCB0b3RhbCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChsZXQgbiA9IDA7IG4gPCB0aGlzLl93b3JrZXJzLmxlbmd0aDsgbisrKSB7XG4gICAgICB0aGlzLl93b3JrZXJzW25dLmdldENvbm5lY3Rpb25zKG9uY291bnQpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIENhbGxpbmcgYHVucmVmKClgIG9uIGEgc2VydmVyIHdpbGwgYWxsb3cgdGhlIHByb2dyYW0gdG8gZXhpdCBpZiB0aGlzIGlzIHRoZSBvbmx5XG4gICAqIGFjdGl2ZSBzZXJ2ZXIgaW4gdGhlIGV2ZW50IHN5c3RlbS4gSWYgdGhlIHNlcnZlciBpcyBhbHJlYWR5IGB1bnJlZmBlZCBjYWxsaW5nIGB1bnJlZigpYCBhZ2FpbiB3aWxsIGhhdmUgbm8gZWZmZWN0LlxuICAgKi9cbiAgdW5yZWYoKTogdGhpcyB7XG4gICAgdGhpcy5fdW5yZWYgPSB0cnVlO1xuXG4gICAgaWYgKHRoaXMuX2hhbmRsZSkge1xuICAgICAgdGhpcy5faGFuZGxlLnVucmVmKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogT3Bwb3NpdGUgb2YgYHVucmVmKClgLCBjYWxsaW5nIGByZWYoKWAgb24gYSBwcmV2aW91c2x5IGB1bnJlZmBlZCBzZXJ2ZXIgd2lsbCBfbm90XyBsZXQgdGhlIHByb2dyYW0gZXhpdCBpZiBpdCdzIHRoZSBvbmx5IHNlcnZlciBsZWZ0ICh0aGUgZGVmYXVsdCBiZWhhdmlvcikuXG4gICAqIElmIHRoZSBzZXJ2ZXIgaXMgYHJlZmBlZCBjYWxsaW5nIGByZWYoKWAgYWdhaW4gd2lsbCBoYXZlIG5vIGVmZmVjdC5cbiAgICovXG4gIHJlZigpOiB0aGlzIHtcbiAgICB0aGlzLl91bnJlZiA9IGZhbHNlO1xuXG4gICAgaWYgKHRoaXMuX2hhbmRsZSkge1xuICAgICAgdGhpcy5faGFuZGxlLnJlZigpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIEluZGljYXRlcyB3aGV0aGVyIG9yIG5vdCB0aGUgc2VydmVyIGlzIGxpc3RlbmluZyBmb3IgY29ubmVjdGlvbnMuXG4gICAqL1xuICBnZXQgbGlzdGVuaW5nKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiAhIXRoaXMuX2hhbmRsZTtcbiAgfVxuXG4gIF9saXN0ZW4yID0gX3NldHVwTGlzdGVuSGFuZGxlO1xuXG4gIF9lbWl0Q2xvc2VJZkRyYWluZWQoKTogdm9pZCB7XG4gICAgZGVidWcoXCJTRVJWRVIgX2VtaXRDbG9zZUlmRHJhaW5lZFwiKTtcbiAgICBpZiAodGhpcy5faGFuZGxlIHx8IHRoaXMuX2Nvbm5lY3Rpb25zKSB7XG4gICAgICBkZWJ1ZyhcbiAgICAgICAgYFNFUlZFUiBoYW5kbGU/ICR7ISF0aGlzLl9oYW5kbGV9ICAgY29ubmVjdGlvbnM/ICR7dGhpcy5fY29ubmVjdGlvbnN9YCxcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZGVmYXVsdFRyaWdnZXJBc3luY0lkU2NvcGUoXG4gICAgICB0aGlzW2FzeW5jSWRTeW1ib2xdLFxuICAgICAgbmV4dFRpY2ssXG4gICAgICBfZW1pdENsb3NlTlQsXG4gICAgICB0aGlzLFxuICAgICk7XG4gIH1cblxuICBfc2V0dXBXb3JrZXIoc29ja2V0TGlzdDogRXZlbnRFbWl0dGVyKTogdm9pZCB7XG4gICAgdGhpcy5fdXNpbmdXb3JrZXJzID0gdHJ1ZTtcbiAgICB0aGlzLl93b3JrZXJzLnB1c2goc29ja2V0TGlzdCk7XG5cbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIHNvY2tldExpc3Qub25jZShcImV4aXRcIiwgKHNvY2tldExpc3Q6IGFueSkgPT4ge1xuICAgICAgY29uc3QgaW5kZXggPSB0aGlzLl93b3JrZXJzLmluZGV4T2Yoc29ja2V0TGlzdCk7XG4gICAgICB0aGlzLl93b3JrZXJzLnNwbGljZShpbmRleCwgMSk7XG4gICAgfSk7XG4gIH1cblxuICBbRXZlbnRFbWl0dGVyLmNhcHR1cmVSZWplY3Rpb25TeW1ib2xdKFxuICAgIGVycjogRXJyb3IsXG4gICAgZXZlbnQ6IHN0cmluZyxcbiAgICBzb2NrOiBTb2NrZXQsXG4gICk6IHZvaWQge1xuICAgIHN3aXRjaCAoZXZlbnQpIHtcbiAgICAgIGNhc2UgXCJjb25uZWN0aW9uXCI6IHtcbiAgICAgICAgc29jay5kZXN0cm95KGVycik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgZGVmYXVsdDoge1xuICAgICAgICB0aGlzLmVtaXQoXCJlcnJvclwiLCBlcnIpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgVENQIG9yIElQQyBzZXJ2ZXIuXG4gKlxuICogQWNjZXB0cyBhbiBgb3B0aW9uc2Agb2JqZWN0IHdpdGggcHJvcGVydGllcyBgYWxsb3dIYWxmT3BlbmAgKGRlZmF1bHQgYGZhbHNlYClcbiAqIGFuZCBgcGF1c2VPbkNvbm5lY3RgIChkZWZhdWx0IGBmYWxzZWApLlxuICpcbiAqIElmIGBhbGxvd0hhbGZPcGVuYCBpcyBzZXQgdG8gYGZhbHNlYCwgdGhlbiB0aGUgc29ja2V0IHdpbGxcbiAqIGF1dG9tYXRpY2FsbHkgZW5kIHRoZSB3cml0YWJsZSBzaWRlIHdoZW4gdGhlIHJlYWRhYmxlIHNpZGUgZW5kcy5cbiAqXG4gKiBJZiBgYWxsb3dIYWxmT3BlbmAgaXMgc2V0IHRvIGB0cnVlYCwgd2hlbiB0aGUgb3RoZXIgZW5kIG9mIHRoZSBzb2NrZXRcbiAqIHNpZ25hbHMgdGhlIGVuZCBvZiB0cmFuc21pc3Npb24sIHRoZSBzZXJ2ZXIgd2lsbCBvbmx5IHNlbmQgYmFjayB0aGUgZW5kIG9mXG4gKiB0cmFuc21pc3Npb24gd2hlbiBgc29ja2V0LmVuZCgpYCBpcyBleHBsaWNpdGx5IGNhbGxlZC4gRm9yIGV4YW1wbGUsIGluIHRoZVxuICogY29udGV4dCBvZiBUQ1AsIHdoZW4gYSBGSU4gcGFja2VkIGlzIHJlY2VpdmVkLCBhIEZJTiBwYWNrZWQgaXMgc2VudCBiYWNrXG4gKiBvbmx5IHdoZW4gYHNvY2tldC5lbmQoKWAgaXMgZXhwbGljaXRseSBjYWxsZWQuIFVudGlsIHRoZW4gdGhlIGNvbm5lY3Rpb24gaXNcbiAqIGhhbGYtY2xvc2VkIChub24tcmVhZGFibGUgYnV0IHN0aWxsIHdyaXRhYmxlKS4gU2VlIGBcImVuZFwiYCBldmVudCBhbmQgUkZDIDExMjJcbiAqIChzZWN0aW9uIDQuMi4yLjEzKSBmb3IgbW9yZSBpbmZvcm1hdGlvbi5cbiAqXG4gKiBgcGF1c2VPbkNvbm5lY3RgIGluZGljYXRlcyB3aGV0aGVyIHRoZSBzb2NrZXQgc2hvdWxkIGJlIHBhdXNlZCBvbiBpbmNvbWluZ1xuICogY29ubmVjdGlvbnMuXG4gKlxuICogSWYgYHBhdXNlT25Db25uZWN0YCBpcyBzZXQgdG8gYHRydWVgLCB0aGVuIHRoZSBzb2NrZXQgYXNzb2NpYXRlZCB3aXRoIGVhY2hcbiAqIGluY29taW5nIGNvbm5lY3Rpb24gd2lsbCBiZSBwYXVzZWQsIGFuZCBubyBkYXRhIHdpbGwgYmUgcmVhZCBmcm9tIGl0c1xuICogaGFuZGxlLiBUaGlzIGFsbG93cyBjb25uZWN0aW9ucyB0byBiZSBwYXNzZWQgYmV0d2VlbiBwcm9jZXNzZXMgd2l0aG91dCBhbnlcbiAqIGRhdGEgYmVpbmcgcmVhZCBieSB0aGUgb3JpZ2luYWwgcHJvY2Vzcy4gVG8gYmVnaW4gcmVhZGluZyBkYXRhIGZyb20gYSBwYXVzZWRcbiAqIHNvY2tldCwgY2FsbCBgc29ja2V0LnJlc3VtZSgpYC5cbiAqXG4gKiBUaGUgc2VydmVyIGNhbiBiZSBhIFRDUCBzZXJ2ZXIgb3IgYW4gSVBDIHNlcnZlciwgZGVwZW5kaW5nIG9uIHdoYXQgaXRcbiAqIGBsaXN0ZW4oKWAgdG8uXG4gKlxuICogSGVyZSBpcyBhbiBleGFtcGxlIG9mIGFuIFRDUCBlY2hvIHNlcnZlciB3aGljaCBsaXN0ZW5zIGZvciBjb25uZWN0aW9ucyBvblxuICogcG9ydCA4MTI0OlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBjcmVhdGVSZXF1aXJlIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAkU1REX1ZFUlNJT04vbm9kZS9tb2R1bGUudHNcIjtcbiAqIGltcG9ydCB7IFNvY2tldCB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL25vZGUvbmV0LnRzXCI7XG4gKlxuICogY29uc3QgcmVxdWlyZSA9IGNyZWF0ZVJlcXVpcmUoaW1wb3J0Lm1ldGEudXJsKTtcbiAqIGNvbnN0IG5ldCA9IHJlcXVpcmUoXCJuZXRcIik7XG4gKlxuICogY29uc3Qgc2VydmVyID0gbmV0LmNyZWF0ZVNlcnZlcigoYzogU29ja2V0KSA9PiB7XG4gKiAgIC8vIFwiY29ubmVjdGlvblwiIGxpc3RlbmVyLlxuICogICBjb25zb2xlLmxvZyhcImNsaWVudCBjb25uZWN0ZWRcIik7XG4gKiAgIGMub24oXCJlbmRcIiwgKCkgPT4ge1xuICogICAgIGNvbnNvbGUubG9nKFwiY2xpZW50IGRpc2Nvbm5lY3RlZFwiKTtcbiAqICAgfSk7XG4gKiAgIGMud3JpdGUoXCJoZWxsb1xcclxcblwiKTtcbiAqICAgYy5waXBlKGMpO1xuICogfSk7XG4gKlxuICogc2VydmVyLm9uKFwiZXJyb3JcIiwgKGVycjogRXJyb3IpID0+IHtcbiAqICAgdGhyb3cgZXJyO1xuICogfSk7XG4gKlxuICogc2VydmVyLmxpc3Rlbig4MTI0LCAoKSA9PiB7XG4gKiAgIGNvbnNvbGUubG9nKFwic2VydmVyIGJvdW5kXCIpO1xuICogfSk7XG4gKiBgYGBcbiAqXG4gKiBUZXN0IHRoaXMgYnkgdXNpbmcgYHRlbG5ldGA6XG4gKlxuICogYGBgY29uc29sZVxuICogJCB0ZWxuZXQgbG9jYWxob3N0IDgxMjRcbiAqIGBgYFxuICpcbiAqIEBwYXJhbSBvcHRpb25zIFNvY2tldCBvcHRpb25zLlxuICogQHBhcmFtIGNvbm5lY3Rpb25MaXN0ZW5lciBBdXRvbWF0aWNhbGx5IHNldCBhcyBhIGxpc3RlbmVyIGZvciB0aGUgYFwiY29ubmVjdGlvblwiYCBldmVudC5cbiAqIEByZXR1cm4gQSBgbmV0LlNlcnZlcmAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTZXJ2ZXIoXG4gIG9wdGlvbnM/OiBTZXJ2ZXJPcHRpb25zLFxuICBjb25uZWN0aW9uTGlzdGVuZXI/OiBDb25uZWN0aW9uTGlzdGVuZXIsXG4pOiBTZXJ2ZXIge1xuICByZXR1cm4gbmV3IFNlcnZlcihvcHRpb25zLCBjb25uZWN0aW9uTGlzdGVuZXIpO1xufVxuXG5leHBvcnQgeyBpc0lQLCBpc0lQdjQsIGlzSVB2NiB9O1xuXG5leHBvcnQgZGVmYXVsdCB7XG4gIF9jcmVhdGVTZXJ2ZXJIYW5kbGUsXG4gIF9ub3JtYWxpemVBcmdzLFxuICBpc0lQLFxuICBpc0lQdjQsXG4gIGlzSVB2NixcbiAgY29ubmVjdCxcbiAgY3JlYXRlQ29ubmVjdGlvbixcbiAgY3JlYXRlU2VydmVyLFxuICBTZXJ2ZXIsXG4gIFNvY2tldCxcbiAgU3RyZWFtLFxufTtcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwwRUFBMEU7QUFDMUUsc0RBQXNEO0FBQ3RELEVBQUU7QUFDRiwwRUFBMEU7QUFDMUUsZ0VBQWdFO0FBQ2hFLHNFQUFzRTtBQUN0RSxzRUFBc0U7QUFDdEUsNEVBQTRFO0FBQzVFLHFFQUFxRTtBQUNyRSx3QkFBd0I7QUFDeEIsRUFBRTtBQUNGLDBFQUEwRTtBQUMxRSx5REFBeUQ7QUFDekQsRUFBRTtBQUNGLDBFQUEwRTtBQUMxRSw2REFBNkQ7QUFDN0QsNEVBQTRFO0FBQzVFLDJFQUEyRTtBQUMzRSx3RUFBd0U7QUFDeEUsNEVBQTRFO0FBQzVFLHlDQUF5QztBQUV6QyxTQUFTLGNBQWMsUUFBUSxjQUFjO0FBQzdDLFNBQVMsWUFBWSxRQUFRLGNBQWM7QUFDM0MsU0FBUyxJQUFJLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxvQkFBb0IsUUFBUSxvQkFBb0I7QUFDL0UsU0FBUyxNQUFNLFFBQVEsY0FBYztBQUNyQyxTQUNFLGFBQWEsRUFDYiwwQkFBMEIsRUFDMUIsVUFBVSxFQUNWLFdBQVcsUUFDTiw0QkFBNEI7QUFDbkMsU0FDRSwwQkFBMEIsRUFDMUIsb0JBQW9CLEVBQ3BCLHFCQUFxQixFQUNyQixtQkFBbUIsRUFDbkIsc0JBQXNCLEVBQ3RCLGdCQUFnQixFQUNoQix5QkFBeUIsRUFDekIsc0JBQXNCLEVBQ3RCLGlCQUFpQixFQUNqQixjQUFjLEVBQ2QscUJBQXFCLEVBQ3JCLFNBQVMsRUFDVCx1QkFBdUIsUUFDbEIsdUJBQXVCO0FBRzlCLFNBQVMsWUFBWSxRQUFRLDJCQUEyQjtBQUN4RCxTQUNFLGdCQUFnQixFQUNoQixPQUFPLEVBQ1As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