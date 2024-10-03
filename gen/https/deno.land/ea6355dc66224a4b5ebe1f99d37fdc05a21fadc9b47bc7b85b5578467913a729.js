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
import { ownerSymbol } from "./async_hooks.ts";
import { kArrayBufferOffset, kBytesWritten, kLastWriteWasAsync, streamBaseState, WriteWrap } from "../internal_binding/stream_wrap.ts";
import { isUint8Array } from "./util/types.ts";
import { errnoException } from "./errors.ts";
import { getTimerDuration, kTimeout } from "./timers.mjs";
import { setUnrefTimeout } from "../timers.ts";
import { validateCallback } from "./validators.mjs";
import { codeMap } from "../internal_binding/uv.ts";
import { Buffer } from "../buffer.ts";
export const kMaybeDestroy = Symbol("kMaybeDestroy");
export const kUpdateTimer = Symbol("kUpdateTimer");
export const kAfterAsyncWrite = Symbol("kAfterAsyncWrite");
export const kHandle = Symbol("kHandle");
export const kSession = Symbol("kSession");
export const kBuffer = Symbol("kBuffer");
export const kBufferGen = Symbol("kBufferGen");
export const kBufferCb = Symbol("kBufferCb");
// deno-lint-ignore no-explicit-any
function handleWriteReq(req, data, encoding) {
  const { handle } = req;
  switch(encoding){
    case "buffer":
      {
        const ret = handle.writeBuffer(req, data);
        if (streamBaseState[kLastWriteWasAsync]) {
          req.buffer = data;
        }
        return ret;
      }
    case "latin1":
    case "binary":
      return handle.writeLatin1String(req, data);
    case "utf8":
    case "utf-8":
      return handle.writeUtf8String(req, data);
    case "ascii":
      return handle.writeAsciiString(req, data);
    case "ucs2":
    case "ucs-2":
    case "utf16le":
    case "utf-16le":
      return handle.writeUcs2String(req, data);
    default:
      {
        const buffer = Buffer.from(data, encoding);
        const ret = handle.writeBuffer(req, buffer);
        if (streamBaseState[kLastWriteWasAsync]) {
          req.buffer = buffer;
        }
        return ret;
      }
  }
}
// deno-lint-ignore no-explicit-any
function onWriteComplete(status) {
  let stream = this.handle[ownerSymbol];
  if (stream.constructor.name === "ReusedHandle") {
    stream = stream.handle;
  }
  if (stream.destroyed) {
    if (typeof this.callback === "function") {
      this.callback(null);
    }
    return;
  }
  if (status < 0) {
    const ex = errnoException(status, "write", this.error);
    if (typeof this.callback === "function") {
      this.callback(ex);
    } else {
      stream.destroy(ex);
    }
    return;
  }
  stream[kUpdateTimer]();
  stream[kAfterAsyncWrite](this);
  if (typeof this.callback === "function") {
    this.callback(null);
  }
}
function createWriteWrap(handle, callback) {
  const req = new WriteWrap();
  req.handle = handle;
  req.oncomplete = onWriteComplete;
  req.async = false;
  req.bytes = 0;
  req.buffer = null;
  req.callback = callback;
  return req;
}
export function writevGeneric(// deno-lint-ignore no-explicit-any
owner, // deno-lint-ignore no-explicit-any
data, cb) {
  const req = createWriteWrap(owner[kHandle], cb);
  const allBuffers = data.allBuffers;
  let chunks;
  if (allBuffers) {
    chunks = data;
    for(let i = 0; i < data.length; i++){
      data[i] = data[i].chunk;
    }
  } else {
    chunks = new Array(data.length << 1);
    for(let i = 0; i < data.length; i++){
      const entry = data[i];
      chunks[i * 2] = entry.chunk;
      chunks[i * 2 + 1] = entry.encoding;
    }
  }
  const err = req.handle.writev(req, chunks, allBuffers);
  // Retain chunks
  if (err === 0) {
    req._chunks = chunks;
  }
  afterWriteDispatched(req, err, cb);
  return req;
}
export function writeGeneric(// deno-lint-ignore no-explicit-any
owner, // deno-lint-ignore no-explicit-any
data, encoding, cb) {
  const req = createWriteWrap(owner[kHandle], cb);
  const err = handleWriteReq(req, data, encoding);
  afterWriteDispatched(req, err, cb);
  return req;
}
function afterWriteDispatched(// deno-lint-ignore no-explicit-any
req, err, cb) {
  req.bytes = streamBaseState[kBytesWritten];
  req.async = !!streamBaseState[kLastWriteWasAsync];
  if (err !== 0) {
    return cb(errnoException(err, "write", req.error));
  }
  if (!req.async && typeof req.callback === "function") {
    req.callback();
  }
}
// Here we differ from Node slightly. Node makes use of the `kReadBytesOrError`
// entry of the `streamBaseState` array from the `stream_wrap` internal binding.
// Here we pass the `nread` value directly to this method as async Deno APIs
// don't grant us the ability to rely on some mutable array entry setting.
export function onStreamRead(arrayBuffer, nread) {
  // deno-lint-ignore no-this-alias
  const handle = this;
  let stream = this[ownerSymbol];
  if (stream.constructor.name === "ReusedHandle") {
    stream = stream.handle;
  }
  stream[kUpdateTimer]();
  if (nread > 0 && !stream.destroyed) {
    let ret;
    let result;
    const userBuf = stream[kBuffer];
    if (userBuf) {
      result = stream[kBufferCb](nread, userBuf) !== false;
      const bufGen = stream[kBufferGen];
      if (bufGen !== null) {
        const nextBuf = bufGen();
        if (isUint8Array(nextBuf)) {
          stream[kBuffer] = ret = nextBuf;
        }
      }
    } else {
      const offset = streamBaseState[kArrayBufferOffset];
      const buf = Buffer.from(arrayBuffer, offset, nread);
      result = stream.push(buf);
    }
    if (!result) {
      handle.reading = false;
      if (!stream.destroyed) {
        const err = handle.readStop();
        if (err) {
          stream.destroy(errnoException(err, "read"));
        }
      }
    }
    return ret;
  }
  if (nread === 0) {
    return;
  }
  if (nread !== codeMap.get("EOF")) {
    // CallJSOnreadMethod expects the return value to be a buffer.
    // Ref: https://github.com/nodejs/node/pull/34375
    stream.destroy(errnoException(nread, "read"));
    return;
  }
  // Defer this until we actually emit end
  if (stream._readableState.endEmitted) {
    if (stream[kMaybeDestroy]) {
      stream[kMaybeDestroy]();
    }
  } else {
    if (stream[kMaybeDestroy]) {
      stream.on("end", stream[kMaybeDestroy]);
    }
    if (handle.readStop) {
      const err = handle.readStop();
      if (err) {
        // CallJSOnreadMethod expects the return value to be a buffer.
        // Ref: https://github.com/nodejs/node/pull/34375
        stream.destroy(errnoException(err, "read"));
        return;
      }
    }
    // Push a null to signal the end of data.
    // Do it before `maybeDestroy` for correct order of events:
    // `end` -> `close`
    stream.push(null);
    stream.read(0);
  }
}
export function setStreamTimeout(msecs, callback) {
  if (this.destroyed) {
    return this;
  }
  this.timeout = msecs;
  // Type checking identical to timers.enroll()
  msecs = getTimerDuration(msecs, "msecs");
  // Attempt to clear an existing timer in both cases -
  //  even if it will be rescheduled we don't want to leak an existing timer.
  clearTimeout(this[kTimeout]);
  if (msecs === 0) {
    if (callback !== undefined) {
      validateCallback(callback);
      this.removeListener("timeout", callback);
    }
  } else {
    this[kTimeout] = setUnrefTimeout(this._onTimeout.bind(this), msecs);
    if (this[kSession]) {
      this[kSession][kUpdateTimer]();
    }
    if (callback !== undefined) {
      validateCallback(callback);
      this.once("timeout", callback);
    }
  }
  return this;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL25vZGUvaW50ZXJuYWwvc3RyZWFtX2Jhc2VfY29tbW9ucy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbmltcG9ydCB7IG93bmVyU3ltYm9sIH0gZnJvbSBcIi4vYXN5bmNfaG9va3MudHNcIjtcbmltcG9ydCB7XG4gIGtBcnJheUJ1ZmZlck9mZnNldCxcbiAga0J5dGVzV3JpdHRlbixcbiAga0xhc3RXcml0ZVdhc0FzeW5jLFxuICBMaWJ1dlN0cmVhbVdyYXAsXG4gIHN0cmVhbUJhc2VTdGF0ZSxcbiAgV3JpdGVXcmFwLFxufSBmcm9tIFwiLi4vaW50ZXJuYWxfYmluZGluZy9zdHJlYW1fd3JhcC50c1wiO1xuaW1wb3J0IHsgaXNVaW50OEFycmF5IH0gZnJvbSBcIi4vdXRpbC90eXBlcy50c1wiO1xuaW1wb3J0IHsgZXJybm9FeGNlcHRpb24gfSBmcm9tIFwiLi9lcnJvcnMudHNcIjtcbmltcG9ydCB7IGdldFRpbWVyRHVyYXRpb24sIGtUaW1lb3V0IH0gZnJvbSBcIi4vdGltZXJzLm1qc1wiO1xuaW1wb3J0IHsgc2V0VW5yZWZUaW1lb3V0IH0gZnJvbSBcIi4uL3RpbWVycy50c1wiO1xuaW1wb3J0IHsgdmFsaWRhdGVDYWxsYmFjayB9IGZyb20gXCIuL3ZhbGlkYXRvcnMubWpzXCI7XG5pbXBvcnQgeyBjb2RlTWFwIH0gZnJvbSBcIi4uL2ludGVybmFsX2JpbmRpbmcvdXYudHNcIjtcbmltcG9ydCB7IEJ1ZmZlciB9IGZyb20gXCIuLi9idWZmZXIudHNcIjtcblxuZXhwb3J0IGNvbnN0IGtNYXliZURlc3Ryb3kgPSBTeW1ib2woXCJrTWF5YmVEZXN0cm95XCIpO1xuZXhwb3J0IGNvbnN0IGtVcGRhdGVUaW1lciA9IFN5bWJvbChcImtVcGRhdGVUaW1lclwiKTtcbmV4cG9ydCBjb25zdCBrQWZ0ZXJBc3luY1dyaXRlID0gU3ltYm9sKFwia0FmdGVyQXN5bmNXcml0ZVwiKTtcbmV4cG9ydCBjb25zdCBrSGFuZGxlID0gU3ltYm9sKFwia0hhbmRsZVwiKTtcbmV4cG9ydCBjb25zdCBrU2Vzc2lvbiA9IFN5bWJvbChcImtTZXNzaW9uXCIpO1xuZXhwb3J0IGNvbnN0IGtCdWZmZXIgPSBTeW1ib2woXCJrQnVmZmVyXCIpO1xuZXhwb3J0IGNvbnN0IGtCdWZmZXJHZW4gPSBTeW1ib2woXCJrQnVmZmVyR2VuXCIpO1xuZXhwb3J0IGNvbnN0IGtCdWZmZXJDYiA9IFN5bWJvbChcImtCdWZmZXJDYlwiKTtcblxuLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbmZ1bmN0aW9uIGhhbmRsZVdyaXRlUmVxKHJlcTogYW55LCBkYXRhOiBhbnksIGVuY29kaW5nOiBzdHJpbmcpIHtcbiAgY29uc3QgeyBoYW5kbGUgfSA9IHJlcTtcblxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSBcImJ1ZmZlclwiOiB7XG4gICAgICBjb25zdCByZXQgPSBoYW5kbGUud3JpdGVCdWZmZXIocmVxLCBkYXRhKTtcblxuICAgICAgaWYgKHN0cmVhbUJhc2VTdGF0ZVtrTGFzdFdyaXRlV2FzQXN5bmNdKSB7XG4gICAgICAgIHJlcS5idWZmZXIgPSBkYXRhO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmV0O1xuICAgIH1cbiAgICBjYXNlIFwibGF0aW4xXCI6XG4gICAgY2FzZSBcImJpbmFyeVwiOlxuICAgICAgcmV0dXJuIGhhbmRsZS53cml0ZUxhdGluMVN0cmluZyhyZXEsIGRhdGEpO1xuICAgIGNhc2UgXCJ1dGY4XCI6XG4gICAgY2FzZSBcInV0Zi04XCI6XG4gICAgICByZXR1cm4gaGFuZGxlLndyaXRlVXRmOFN0cmluZyhyZXEsIGRhdGEpO1xuICAgIGNhc2UgXCJhc2NpaVwiOlxuICAgICAgcmV0dXJuIGhhbmRsZS53cml0ZUFzY2lpU3RyaW5nKHJlcSwgZGF0YSk7XG4gICAgY2FzZSBcInVjczJcIjpcbiAgICBjYXNlIFwidWNzLTJcIjpcbiAgICBjYXNlIFwidXRmMTZsZVwiOlxuICAgIGNhc2UgXCJ1dGYtMTZsZVwiOlxuICAgICAgcmV0dXJuIGhhbmRsZS53cml0ZVVjczJTdHJpbmcocmVxLCBkYXRhKTtcbiAgICBkZWZhdWx0OiB7XG4gICAgICBjb25zdCBidWZmZXIgPSBCdWZmZXIuZnJvbShkYXRhLCBlbmNvZGluZyk7XG4gICAgICBjb25zdCByZXQgPSBoYW5kbGUud3JpdGVCdWZmZXIocmVxLCBidWZmZXIpO1xuXG4gICAgICBpZiAoc3RyZWFtQmFzZVN0YXRlW2tMYXN0V3JpdGVXYXNBc3luY10pIHtcbiAgICAgICAgcmVxLmJ1ZmZlciA9IGJ1ZmZlcjtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJldDtcbiAgICB9XG4gIH1cbn1cblxuLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbmZ1bmN0aW9uIG9uV3JpdGVDb21wbGV0ZSh0aGlzOiBhbnksIHN0YXR1czogbnVtYmVyKSB7XG4gIGxldCBzdHJlYW0gPSB0aGlzLmhhbmRsZVtvd25lclN5bWJvbF07XG5cbiAgaWYgKHN0cmVhbS5jb25zdHJ1Y3Rvci5uYW1lID09PSBcIlJldXNlZEhhbmRsZVwiKSB7XG4gICAgc3RyZWFtID0gc3RyZWFtLmhhbmRsZTtcbiAgfVxuXG4gIGlmIChzdHJlYW0uZGVzdHJveWVkKSB7XG4gICAgaWYgKHR5cGVvZiB0aGlzLmNhbGxiYWNrID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgIHRoaXMuY2FsbGJhY2sobnVsbCk7XG4gICAgfVxuXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHN0YXR1cyA8IDApIHtcbiAgICBjb25zdCBleCA9IGVycm5vRXhjZXB0aW9uKHN0YXR1cywgXCJ3cml0ZVwiLCB0aGlzLmVycm9yKTtcblxuICAgIGlmICh0eXBlb2YgdGhpcy5jYWxsYmFjayA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICB0aGlzLmNhbGxiYWNrKGV4KTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RyZWFtLmRlc3Ryb3koZXgpO1xuICAgIH1cblxuICAgIHJldHVybjtcbiAgfVxuXG4gIHN0cmVhbVtrVXBkYXRlVGltZXJdKCk7XG4gIHN0cmVhbVtrQWZ0ZXJBc3luY1dyaXRlXSh0aGlzKTtcblxuICBpZiAodHlwZW9mIHRoaXMuY2FsbGJhY2sgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIHRoaXMuY2FsbGJhY2sobnVsbCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlV3JpdGVXcmFwKFxuICBoYW5kbGU6IExpYnV2U3RyZWFtV3JhcCxcbiAgY2FsbGJhY2s6IChlcnI/OiBFcnJvciB8IG51bGwpID0+IHZvaWQsXG4pIHtcbiAgY29uc3QgcmVxID0gbmV3IFdyaXRlV3JhcDxMaWJ1dlN0cmVhbVdyYXA+KCk7XG5cbiAgcmVxLmhhbmRsZSA9IGhhbmRsZTtcbiAgcmVxLm9uY29tcGxldGUgPSBvbldyaXRlQ29tcGxldGU7XG4gIHJlcS5hc3luYyA9IGZhbHNlO1xuICByZXEuYnl0ZXMgPSAwO1xuICByZXEuYnVmZmVyID0gbnVsbDtcbiAgcmVxLmNhbGxiYWNrID0gY2FsbGJhY2s7XG5cbiAgcmV0dXJuIHJlcTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdyaXRldkdlbmVyaWMoXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIG93bmVyOiBhbnksXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIGRhdGE6IGFueSxcbiAgY2I6IChlcnI/OiBFcnJvciB8IG51bGwpID0+IHZvaWQsXG4pIHtcbiAgY29uc3QgcmVxID0gY3JlYXRlV3JpdGVXcmFwKG93bmVyW2tIYW5kbGVdLCBjYik7XG4gIGNvbnN0IGFsbEJ1ZmZlcnMgPSBkYXRhLmFsbEJ1ZmZlcnM7XG4gIGxldCBjaHVua3M7XG5cbiAgaWYgKGFsbEJ1ZmZlcnMpIHtcbiAgICBjaHVua3MgPSBkYXRhO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICBkYXRhW2ldID0gZGF0YVtpXS5jaHVuaztcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY2h1bmtzID0gbmV3IEFycmF5KGRhdGEubGVuZ3RoIDw8IDEpO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBlbnRyeSA9IGRhdGFbaV07XG4gICAgICBjaHVua3NbaSAqIDJdID0gZW50cnkuY2h1bms7XG4gICAgICBjaHVua3NbaSAqIDIgKyAxXSA9IGVudHJ5LmVuY29kaW5nO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGVyciA9IHJlcS5oYW5kbGUud3JpdGV2KHJlcSwgY2h1bmtzLCBhbGxCdWZmZXJzKTtcblxuICAvLyBSZXRhaW4gY2h1bmtzXG4gIGlmIChlcnIgPT09IDApIHtcbiAgICByZXEuX2NodW5rcyA9IGNodW5rcztcbiAgfVxuXG4gIGFmdGVyV3JpdGVEaXNwYXRjaGVkKHJlcSwgZXJyLCBjYik7XG5cbiAgcmV0dXJuIHJlcTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdyaXRlR2VuZXJpYyhcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgb3duZXI6IGFueSxcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgZGF0YTogYW55LFxuICBlbmNvZGluZzogc3RyaW5nLFxuICBjYjogKGVycj86IEVycm9yIHwgbnVsbCkgPT4gdm9pZCxcbikge1xuICBjb25zdCByZXEgPSBjcmVhdGVXcml0ZVdyYXAob3duZXJba0hhbmRsZV0sIGNiKTtcbiAgY29uc3QgZXJyID0gaGFuZGxlV3JpdGVSZXEocmVxLCBkYXRhLCBlbmNvZGluZyk7XG5cbiAgYWZ0ZXJXcml0ZURpc3BhdGNoZWQocmVxLCBlcnIsIGNiKTtcblxuICByZXR1cm4gcmVxO1xufVxuXG5mdW5jdGlvbiBhZnRlcldyaXRlRGlzcGF0Y2hlZChcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgcmVxOiBhbnksXG4gIGVycjogbnVtYmVyLFxuICBjYjogKGVycj86IEVycm9yIHwgbnVsbCkgPT4gdm9pZCxcbikge1xuICByZXEuYnl0ZXMgPSBzdHJlYW1CYXNlU3RhdGVba0J5dGVzV3JpdHRlbl07XG4gIHJlcS5hc3luYyA9ICEhc3RyZWFtQmFzZVN0YXRlW2tMYXN0V3JpdGVXYXNBc3luY107XG5cbiAgaWYgKGVyciAhPT0gMCkge1xuICAgIHJldHVybiBjYihlcnJub0V4Y2VwdGlvbihlcnIsIFwid3JpdGVcIiwgcmVxLmVycm9yKSk7XG4gIH1cblxuICBpZiAoIXJlcS5hc3luYyAmJiB0eXBlb2YgcmVxLmNhbGxiYWNrID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICByZXEuY2FsbGJhY2soKTtcbiAgfVxufVxuXG4vLyBIZXJlIHdlIGRpZmZlciBmcm9tIE5vZGUgc2xpZ2h0bHkuIE5vZGUgbWFrZXMgdXNlIG9mIHRoZSBga1JlYWRCeXRlc09yRXJyb3JgXG4vLyBlbnRyeSBvZiB0aGUgYHN0cmVhbUJhc2VTdGF0ZWAgYXJyYXkgZnJvbSB0aGUgYHN0cmVhbV93cmFwYCBpbnRlcm5hbCBiaW5kaW5nLlxuLy8gSGVyZSB3ZSBwYXNzIHRoZSBgbnJlYWRgIHZhbHVlIGRpcmVjdGx5IHRvIHRoaXMgbWV0aG9kIGFzIGFzeW5jIERlbm8gQVBJc1xuLy8gZG9uJ3QgZ3JhbnQgdXMgdGhlIGFiaWxpdHkgdG8gcmVseSBvbiBzb21lIG11dGFibGUgYXJyYXkgZW50cnkgc2V0dGluZy5cbmV4cG9ydCBmdW5jdGlvbiBvblN0cmVhbVJlYWQoXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIHRoaXM6IGFueSxcbiAgYXJyYXlCdWZmZXI6IFVpbnQ4QXJyYXksXG4gIG5yZWFkOiBudW1iZXIsXG4pIHtcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby10aGlzLWFsaWFzXG4gIGNvbnN0IGhhbmRsZSA9IHRoaXM7XG5cbiAgbGV0IHN0cmVhbSA9IHRoaXNbb3duZXJTeW1ib2xdO1xuXG4gIGlmIChzdHJlYW0uY29uc3RydWN0b3IubmFtZSA9PT0gXCJSZXVzZWRIYW5kbGVcIikge1xuICAgIHN0cmVhbSA9IHN0cmVhbS5oYW5kbGU7XG4gIH1cblxuICBzdHJlYW1ba1VwZGF0ZVRpbWVyXSgpO1xuXG4gIGlmIChucmVhZCA+IDAgJiYgIXN0cmVhbS5kZXN0cm95ZWQpIHtcbiAgICBsZXQgcmV0O1xuICAgIGxldCByZXN1bHQ7XG4gICAgY29uc3QgdXNlckJ1ZiA9IHN0cmVhbVtrQnVmZmVyXTtcblxuICAgIGlmICh1c2VyQnVmKSB7XG4gICAgICByZXN1bHQgPSBzdHJlYW1ba0J1ZmZlckNiXShucmVhZCwgdXNlckJ1ZikgIT09IGZhbHNlO1xuICAgICAgY29uc3QgYnVmR2VuID0gc3RyZWFtW2tCdWZmZXJHZW5dO1xuXG4gICAgICBpZiAoYnVmR2VuICE9PSBudWxsKSB7XG4gICAgICAgIGNvbnN0IG5leHRCdWYgPSBidWZHZW4oKTtcblxuICAgICAgICBpZiAoaXNVaW50OEFycmF5KG5leHRCdWYpKSB7XG4gICAgICAgICAgc3RyZWFtW2tCdWZmZXJdID0gcmV0ID0gbmV4dEJ1ZjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBvZmZzZXQgPSBzdHJlYW1CYXNlU3RhdGVba0FycmF5QnVmZmVyT2Zmc2V0XTtcbiAgICAgIGNvbnN0IGJ1ZiA9IEJ1ZmZlci5mcm9tKGFycmF5QnVmZmVyLCBvZmZzZXQsIG5yZWFkKTtcbiAgICAgIHJlc3VsdCA9IHN0cmVhbS5wdXNoKGJ1Zik7XG4gICAgfVxuXG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgIGhhbmRsZS5yZWFkaW5nID0gZmFsc2U7XG5cbiAgICAgIGlmICghc3RyZWFtLmRlc3Ryb3llZCkge1xuICAgICAgICBjb25zdCBlcnIgPSBoYW5kbGUucmVhZFN0b3AoKTtcblxuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgc3RyZWFtLmRlc3Ryb3koZXJybm9FeGNlcHRpb24oZXJyLCBcInJlYWRcIikpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJldDtcbiAgfVxuXG4gIGlmIChucmVhZCA9PT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChucmVhZCAhPT0gY29kZU1hcC5nZXQoXCJFT0ZcIikpIHtcbiAgICAvLyBDYWxsSlNPbnJlYWRNZXRob2QgZXhwZWN0cyB0aGUgcmV0dXJuIHZhbHVlIHRvIGJlIGEgYnVmZmVyLlxuICAgIC8vIFJlZjogaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL3B1bGwvMzQzNzVcbiAgICBzdHJlYW0uZGVzdHJveShlcnJub0V4Y2VwdGlvbihucmVhZCwgXCJyZWFkXCIpKTtcblxuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIERlZmVyIHRoaXMgdW50aWwgd2UgYWN0dWFsbHkgZW1pdCBlbmRcbiAgaWYgKHN0cmVhbS5fcmVhZGFibGVTdGF0ZS5lbmRFbWl0dGVkKSB7XG4gICAgaWYgKHN0cmVhbVtrTWF5YmVEZXN0cm95XSkge1xuICAgICAgc3RyZWFtW2tNYXliZURlc3Ryb3ldKCk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGlmIChzdHJlYW1ba01heWJlRGVzdHJveV0pIHtcbiAgICAgIHN0cmVhbS5vbihcImVuZFwiLCBzdHJlYW1ba01heWJlRGVzdHJveV0pO1xuICAgIH1cblxuICAgIGlmIChoYW5kbGUucmVhZFN0b3ApIHtcbiAgICAgIGNvbnN0IGVyciA9IGhhbmRsZS5yZWFkU3RvcCgpO1xuXG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIC8vIENhbGxKU09ucmVhZE1ldGhvZCBleHBlY3RzIHRoZSByZXR1cm4gdmFsdWUgdG8gYmUgYSBidWZmZXIuXG4gICAgICAgIC8vIFJlZjogaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL3B1bGwvMzQzNzVcbiAgICAgICAgc3RyZWFtLmRlc3Ryb3koZXJybm9FeGNlcHRpb24oZXJyLCBcInJlYWRcIikpO1xuXG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBQdXNoIGEgbnVsbCB0byBzaWduYWwgdGhlIGVuZCBvZiBkYXRhLlxuICAgIC8vIERvIGl0IGJlZm9yZSBgbWF5YmVEZXN0cm95YCBmb3IgY29ycmVjdCBvcmRlciBvZiBldmVudHM6XG4gICAgLy8gYGVuZGAgLT4gYGNsb3NlYFxuICAgIHN0cmVhbS5wdXNoKG51bGwpO1xuICAgIHN0cmVhbS5yZWFkKDApO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRTdHJlYW1UaW1lb3V0KFxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICB0aGlzOiBhbnksXG4gIG1zZWNzOiBudW1iZXIsXG4gIGNhbGxiYWNrPzogKCkgPT4gdm9pZCxcbikge1xuICBpZiAodGhpcy5kZXN0cm95ZWQpIHtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIHRoaXMudGltZW91dCA9IG1zZWNzO1xuXG4gIC8vIFR5cGUgY2hlY2tpbmcgaWRlbnRpY2FsIHRvIHRpbWVycy5lbnJvbGwoKVxuICBtc2VjcyA9IGdldFRpbWVyRHVyYXRpb24obXNlY3MsIFwibXNlY3NcIik7XG5cbiAgLy8gQXR0ZW1wdCB0byBjbGVhciBhbiBleGlzdGluZyB0aW1lciBpbiBib3RoIGNhc2VzIC1cbiAgLy8gIGV2ZW4gaWYgaXQgd2lsbCBiZSByZXNjaGVkdWxlZCB3ZSBkb24ndCB3YW50IHRvIGxlYWsgYW4gZXhpc3RpbmcgdGltZXIuXG4gIGNsZWFyVGltZW91dCh0aGlzW2tUaW1lb3V0XSk7XG5cbiAgaWYgKG1zZWNzID09PSAwKSB7XG4gICAgaWYgKGNhbGxiYWNrICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHZhbGlkYXRlQ2FsbGJhY2soY2FsbGJhY2spO1xuICAgICAgdGhpcy5yZW1vdmVMaXN0ZW5lcihcInRpbWVvdXRcIiwgY2FsbGJhY2spO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aGlzW2tUaW1lb3V0XSA9IHNldFVucmVmVGltZW91dCh0aGlzLl9vblRpbWVvdXQuYmluZCh0aGlzKSwgbXNlY3MpO1xuXG4gICAgaWYgKHRoaXNba1Nlc3Npb25dKSB7XG4gICAgICB0aGlzW2tTZXNzaW9uXVtrVXBkYXRlVGltZXJdKCk7XG4gICAgfVxuXG4gICAgaWYgKGNhbGxiYWNrICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHZhbGlkYXRlQ2FsbGJhY2soY2FsbGJhY2spO1xuICAgICAgdGhpcy5vbmNlKFwidGltZW91dFwiLCBjYWxsYmFjayk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBQzFFLHNEQUFzRDtBQUN0RCxFQUFFO0FBQ0YsMEVBQTBFO0FBQzFFLGdFQUFnRTtBQUNoRSxzRUFBc0U7QUFDdEUsc0VBQXNFO0FBQ3RFLDRFQUE0RTtBQUM1RSxxRUFBcUU7QUFDckUsd0JBQXdCO0FBQ3hCLEVBQUU7QUFDRiwwRUFBMEU7QUFDMUUseURBQXlEO0FBQ3pELEVBQUU7QUFDRiwwRUFBMEU7QUFDMUUsNkRBQTZEO0FBQzdELDRFQUE0RTtBQUM1RSwyRUFBMkU7QUFDM0Usd0VBQXdFO0FBQ3hFLDRFQUE0RTtBQUM1RSx5Q0FBeUM7QUFFekMsU0FBUyxXQUFXLFFBQVEsbUJBQW1CO0FBQy9DLFNBQ0Usa0JBQWtCLEVBQ2xCLGFBQWEsRUFDYixrQkFBa0Is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