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
// This module ports:
// - https://github.com/nodejs/node/blob/master/src/stream_base-inl.h
// - https://github.com/nodejs/node/blob/master/src/stream_base.h
// - https://github.com/nodejs/node/blob/master/src/stream_base.cc
// - https://github.com/nodejs/node/blob/master/src/stream_wrap.h
// - https://github.com/nodejs/node/blob/master/src/stream_wrap.cc
import { Buffer } from "../buffer.ts";
import { notImplemented } from "../_utils.ts";
import { HandleWrap } from "./handle_wrap.ts";
import { AsyncWrap, providerType } from "./async_wrap.ts";
import { codeMap } from "./uv.ts";
import { writeAll } from "../../streams/conversion.ts";
var StreamBaseStateFields;
(function(StreamBaseStateFields) {
  StreamBaseStateFields[StreamBaseStateFields["kReadBytesOrError"] = 0] = "kReadBytesOrError";
  StreamBaseStateFields[StreamBaseStateFields["kArrayBufferOffset"] = 1] = "kArrayBufferOffset";
  StreamBaseStateFields[StreamBaseStateFields["kBytesWritten"] = 2] = "kBytesWritten";
  StreamBaseStateFields[StreamBaseStateFields["kLastWriteWasAsync"] = 3] = "kLastWriteWasAsync";
  StreamBaseStateFields[StreamBaseStateFields["kNumStreamBaseStateFields"] = 4] = "kNumStreamBaseStateFields";
})(StreamBaseStateFields || (StreamBaseStateFields = {}));
export const kReadBytesOrError = StreamBaseStateFields.kReadBytesOrError;
export const kArrayBufferOffset = StreamBaseStateFields.kArrayBufferOffset;
export const kBytesWritten = StreamBaseStateFields.kBytesWritten;
export const kLastWriteWasAsync = StreamBaseStateFields.kLastWriteWasAsync;
export const kNumStreamBaseStateFields = StreamBaseStateFields.kNumStreamBaseStateFields;
export const streamBaseState = new Uint8Array(5);
// This is Deno, it always will be async.
streamBaseState[kLastWriteWasAsync] = 1;
export class WriteWrap extends AsyncWrap {
  handle;
  oncomplete;
  async;
  bytes;
  buffer;
  callback;
  _chunks;
  constructor(){
    super(providerType.WRITEWRAP);
  }
}
export class ShutdownWrap extends AsyncWrap {
  handle;
  oncomplete;
  callback;
  constructor(){
    super(providerType.SHUTDOWNWRAP);
  }
}
export const kStreamBaseField = Symbol("kStreamBaseField");
const SUGGESTED_SIZE = 64 * 1024;
export class LibuvStreamWrap extends HandleWrap {
  [kStreamBaseField];
  reading;
  #reading = false;
  #currentReads = new Set();
  #currentWrites = new Set();
  destroyed = false;
  writeQueueSize = 0;
  bytesRead = 0;
  bytesWritten = 0;
  onread;
  constructor(provider, stream){
    super(provider);
    this.#attachToObject(stream);
  }
  /**
   * Start the reading of the stream.
   * @return An error status code.
   */ readStart() {
    if (!this.#reading) {
      this.#reading = true;
      const readPromise = this.#read();
      this.#currentReads.add(readPromise);
      readPromise.then(()=>this.#currentReads.delete(readPromise), ()=>this.#currentReads.delete(readPromise));
    }
    return 0;
  }
  /**
   * Stop the reading of the stream.
   * @return An error status code.
   */ readStop() {
    this.#reading = false;
    return 0;
  }
  /**
   * Shutdown the stream.
   * @param req A shutdown request wrapper.
   * @return An error status code.
   */ shutdown(req) {
    (async ()=>{
      const status = await this._onClose();
      try {
        req.oncomplete(status);
      } catch  {
      // swallow callback error.
      }
    })();
    return 0;
  }
  /**
   * @param userBuf
   * @return An error status code.
   */ useUserBuffer(_userBuf) {
    // TODO(cmorten)
    notImplemented();
  }
  /**
   * Write a buffer to the stream.
   * @param req A write request wrapper.
   * @param data The Uint8Array buffer to write to the stream.
   * @return An error status code.
   */ writeBuffer(req, data) {
    const currentWrite = this.#write(req, data);
    this.#currentWrites.add(currentWrite);
    currentWrite.then(()=>this.#currentWrites.delete(currentWrite), ()=>this.#currentWrites.delete(currentWrite));
    return 0;
  }
  /**
   * Write multiple chunks at once.
   * @param req A write request wrapper.
   * @param chunks
   * @param allBuffers
   * @return An error status code.
   */ writev(_req, // deno-lint-ignore no-explicit-any
  _chunks, _allBuffers) {
    // TODO(cmorten)
    notImplemented();
  }
  /**
   * Write an ASCII string to the stream.
   * @return An error status code.
   */ writeAsciiString(req, data) {
    const buffer = new TextEncoder().encode(data);
    return this.writeBuffer(req, buffer);
  }
  /**
   * Write an UTF8 string to the stream.
   * @return An error status code.
   */ writeUtf8String(req, data) {
    const buffer = new TextEncoder().encode(data);
    return this.writeBuffer(req, buffer);
  }
  /**
   * Write an UCS2 string to the stream.
   * @return An error status code.
   */ writeUcs2String(_req, _data) {
    notImplemented();
  }
  /**
   * Write an LATIN1 string to the stream.
   * @return An error status code.
   */ writeLatin1String(req, data) {
    const buffer = Buffer.from(data, "latin1");
    return this.writeBuffer(req, buffer);
  }
  async _onClose() {
    let status = 0;
    this.#reading = false;
    try {
      this[kStreamBaseField]?.close();
    } catch  {
      status = codeMap.get("ENOTCONN");
    }
    await Promise.allSettled(this.#currentWrites);
    await Promise.allSettled(this.#currentReads);
    return status;
  }
  /**
   * Attaches the class to the underlying stream.
   * @param stream The stream to attach to.
   */ #attachToObject(stream) {
    this[kStreamBaseField] = stream;
  }
  /** Internal method for reading from the attached stream. */ async #read() {
    let buf = new Uint8Array(SUGGESTED_SIZE);
    let nread;
    try {
      nread = await this[kStreamBaseField].read(buf);
    } catch (e) {
      if (e instanceof Deno.errors.Interrupted || e instanceof Deno.errors.BadResource) {
        nread = codeMap.get("EOF");
      } else {
        nread = codeMap.get("UNKNOWN");
      }
      buf = new Uint8Array(0);
    }
    nread ??= codeMap.get("EOF");
    streamBaseState[kReadBytesOrError] = nread;
    if (nread > 0) {
      this.bytesRead += nread;
    }
    buf = buf.slice(0, nread);
    streamBaseState[kArrayBufferOffset] = 0;
    try {
      this.onread(buf, nread);
    } catch  {
    // swallow callback errors.
    }
    if (nread >= 0 && this.#reading) {
      const readPromise = this.#read();
      this.#currentReads.add(readPromise);
      readPromise.then(()=>this.#currentReads.delete(readPromise), ()=>this.#currentReads.delete(readPromise));
    }
  }
  /**
   * Internal method for writing to the attached stream.
   * @param req A write request wrapper.
   * @param data The Uint8Array buffer to write to the stream.
   */ async #write(req, data) {
    const { byteLength } = data;
    try {
      // TODO(cmorten): somewhat over simplifying what Node does.
      await writeAll(this[kStreamBaseField], data);
    } catch  {
      // TODO(cmorten): map err to status codes
      const status = codeMap.get("UNKNOWN");
      try {
        req.oncomplete(status);
      } catch  {
      // swallow callback errors.
      }
      return;
    }
    streamBaseState[kBytesWritten] = byteLength;
    this.bytesWritten += byteLength;
    try {
      req.oncomplete(0);
    } catch  {
    // swallow callback errors.
    }
    return;
  }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL25vZGUvaW50ZXJuYWxfYmluZGluZy9zdHJlYW1fd3JhcC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbi8vIFRoaXMgbW9kdWxlIHBvcnRzOlxuLy8gLSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvYmxvYi9tYXN0ZXIvc3JjL3N0cmVhbV9iYXNlLWlubC5oXG4vLyAtIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9ibG9iL21hc3Rlci9zcmMvc3RyZWFtX2Jhc2UuaFxuLy8gLSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvYmxvYi9tYXN0ZXIvc3JjL3N0cmVhbV9iYXNlLmNjXG4vLyAtIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9ibG9iL21hc3Rlci9zcmMvc3RyZWFtX3dyYXAuaFxuLy8gLSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvYmxvYi9tYXN0ZXIvc3JjL3N0cmVhbV93cmFwLmNjXG5cbmltcG9ydCB7IEJ1ZmZlciB9IGZyb20gXCIuLi9idWZmZXIudHNcIjtcbmltcG9ydCB7IG5vdEltcGxlbWVudGVkIH0gZnJvbSBcIi4uL191dGlscy50c1wiO1xuaW1wb3J0IHsgSGFuZGxlV3JhcCB9IGZyb20gXCIuL2hhbmRsZV93cmFwLnRzXCI7XG5pbXBvcnQgeyBBc3luY1dyYXAsIHByb3ZpZGVyVHlwZSB9IGZyb20gXCIuL2FzeW5jX3dyYXAudHNcIjtcbmltcG9ydCB7IGNvZGVNYXAgfSBmcm9tIFwiLi91di50c1wiO1xuaW1wb3J0IHsgd3JpdGVBbGwgfSBmcm9tIFwiLi4vLi4vc3RyZWFtcy9jb252ZXJzaW9uLnRzXCI7XG5cbmVudW0gU3RyZWFtQmFzZVN0YXRlRmllbGRzIHtcbiAga1JlYWRCeXRlc09yRXJyb3IsXG4gIGtBcnJheUJ1ZmZlck9mZnNldCxcbiAga0J5dGVzV3JpdHRlbixcbiAga0xhc3RXcml0ZVdhc0FzeW5jLFxuICBrTnVtU3RyZWFtQmFzZVN0YXRlRmllbGRzLFxufVxuXG5leHBvcnQgY29uc3Qga1JlYWRCeXRlc09yRXJyb3IgPSBTdHJlYW1CYXNlU3RhdGVGaWVsZHMua1JlYWRCeXRlc09yRXJyb3I7XG5leHBvcnQgY29uc3Qga0FycmF5QnVmZmVyT2Zmc2V0ID0gU3RyZWFtQmFzZVN0YXRlRmllbGRzLmtBcnJheUJ1ZmZlck9mZnNldDtcbmV4cG9ydCBjb25zdCBrQnl0ZXNXcml0dGVuID0gU3RyZWFtQmFzZVN0YXRlRmllbGRzLmtCeXRlc1dyaXR0ZW47XG5leHBvcnQgY29uc3Qga0xhc3RXcml0ZVdhc0FzeW5jID0gU3RyZWFtQmFzZVN0YXRlRmllbGRzLmtMYXN0V3JpdGVXYXNBc3luYztcbmV4cG9ydCBjb25zdCBrTnVtU3RyZWFtQmFzZVN0YXRlRmllbGRzID1cbiAgU3RyZWFtQmFzZVN0YXRlRmllbGRzLmtOdW1TdHJlYW1CYXNlU3RhdGVGaWVsZHM7XG5cbmV4cG9ydCBjb25zdCBzdHJlYW1CYXNlU3RhdGUgPSBuZXcgVWludDhBcnJheSg1KTtcblxuLy8gVGhpcyBpcyBEZW5vLCBpdCBhbHdheXMgd2lsbCBiZSBhc3luYy5cbnN0cmVhbUJhc2VTdGF0ZVtrTGFzdFdyaXRlV2FzQXN5bmNdID0gMTtcblxuZXhwb3J0IGNsYXNzIFdyaXRlV3JhcDxIIGV4dGVuZHMgSGFuZGxlV3JhcD4gZXh0ZW5kcyBBc3luY1dyYXAge1xuICBoYW5kbGUhOiBIO1xuICBvbmNvbXBsZXRlITogKHN0YXR1czogbnVtYmVyKSA9PiB2b2lkO1xuICBhc3luYyE6IGJvb2xlYW47XG4gIGJ5dGVzITogbnVtYmVyO1xuICBidWZmZXIhOiB1bmtub3duO1xuICBjYWxsYmFjayE6IHVua25vd247XG4gIF9jaHVua3MhOiB1bmtub3duW107XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIocHJvdmlkZXJUeXBlLldSSVRFV1JBUCk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIFNodXRkb3duV3JhcDxIIGV4dGVuZHMgSGFuZGxlV3JhcD4gZXh0ZW5kcyBBc3luY1dyYXAge1xuICBoYW5kbGUhOiBIO1xuICBvbmNvbXBsZXRlITogKHN0YXR1czogbnVtYmVyKSA9PiB2b2lkO1xuICBjYWxsYmFjayE6ICgpID0+IHZvaWQ7XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIocHJvdmlkZXJUeXBlLlNIVVRET1dOV1JBUCk7XG4gIH1cbn1cblxuZXhwb3J0IGNvbnN0IGtTdHJlYW1CYXNlRmllbGQgPSBTeW1ib2woXCJrU3RyZWFtQmFzZUZpZWxkXCIpO1xuXG5jb25zdCBTVUdHRVNURURfU0laRSA9IDY0ICogMTAyNDtcblxuZXhwb3J0IGNsYXNzIExpYnV2U3RyZWFtV3JhcCBleHRlbmRzIEhhbmRsZVdyYXAge1xuICBba1N0cmVhbUJhc2VGaWVsZF0/OiBEZW5vLlJlYWRlciAmIERlbm8uV3JpdGVyICYgRGVuby5DbG9zZXI7XG5cbiAgcmVhZGluZyE6IGJvb2xlYW47XG4gICNyZWFkaW5nID0gZmFsc2U7XG4gICNjdXJyZW50UmVhZHM6IFNldDxQcm9taXNlPHZvaWQ+PiA9IG5ldyBTZXQoKTtcbiAgI2N1cnJlbnRXcml0ZXM6IFNldDxQcm9taXNlPHZvaWQ+PiA9IG5ldyBTZXQoKTtcbiAgZGVzdHJveWVkID0gZmFsc2U7XG4gIHdyaXRlUXVldWVTaXplID0gMDtcbiAgYnl0ZXNSZWFkID0gMDtcbiAgYnl0ZXNXcml0dGVuID0gMDtcblxuICBvbnJlYWQhOiAoX2FycmF5QnVmZmVyOiBVaW50OEFycmF5LCBfbnJlYWQ6IG51bWJlcikgPT4gVWludDhBcnJheSB8IHVuZGVmaW5lZDtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcm92aWRlcjogcHJvdmlkZXJUeXBlLFxuICAgIHN0cmVhbT86IERlbm8uUmVhZGVyICYgRGVuby5Xcml0ZXIgJiBEZW5vLkNsb3NlcixcbiAgKSB7XG4gICAgc3VwZXIocHJvdmlkZXIpO1xuICAgIHRoaXMuI2F0dGFjaFRvT2JqZWN0KHN0cmVhbSk7XG4gIH1cblxuICAvKipcbiAgICogU3RhcnQgdGhlIHJlYWRpbmcgb2YgdGhlIHN0cmVhbS5cbiAgICogQHJldHVybiBBbiBlcnJvciBzdGF0dXMgY29kZS5cbiAgICovXG4gIHJlYWRTdGFydCgpOiBudW1iZXIge1xuICAgIGlmICghdGhpcy4jcmVhZGluZykge1xuICAgICAgdGhpcy4jcmVhZGluZyA9IHRydWU7XG4gICAgICBjb25zdCByZWFkUHJvbWlzZSA9IHRoaXMuI3JlYWQoKTtcbiAgICAgIHRoaXMuI2N1cnJlbnRSZWFkcy5hZGQocmVhZFByb21pc2UpO1xuICAgICAgcmVhZFByb21pc2UudGhlbihcbiAgICAgICAgKCkgPT4gdGhpcy4jY3VycmVudFJlYWRzLmRlbGV0ZShyZWFkUHJvbWlzZSksXG4gICAgICAgICgpID0+IHRoaXMuI2N1cnJlbnRSZWFkcy5kZWxldGUocmVhZFByb21pc2UpLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gMDtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdG9wIHRoZSByZWFkaW5nIG9mIHRoZSBzdHJlYW0uXG4gICAqIEByZXR1cm4gQW4gZXJyb3Igc3RhdHVzIGNvZGUuXG4gICAqL1xuICByZWFkU3RvcCgpOiBudW1iZXIge1xuICAgIHRoaXMuI3JlYWRpbmcgPSBmYWxzZTtcblxuICAgIHJldHVybiAwO1xuICB9XG5cbiAgLyoqXG4gICAqIFNodXRkb3duIHRoZSBzdHJlYW0uXG4gICAqIEBwYXJhbSByZXEgQSBzaHV0ZG93biByZXF1ZXN0IHdyYXBwZXIuXG4gICAqIEByZXR1cm4gQW4gZXJyb3Igc3RhdHVzIGNvZGUuXG4gICAqL1xuICBzaHV0ZG93bihyZXE6IFNodXRkb3duV3JhcDxMaWJ1dlN0cmVhbVdyYXA+KTogbnVtYmVyIHtcbiAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhdHVzID0gYXdhaXQgdGhpcy5fb25DbG9zZSgpO1xuXG4gICAgICB0cnkge1xuICAgICAgICByZXEub25jb21wbGV0ZShzdGF0dXMpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIHN3YWxsb3cgY2FsbGJhY2sgZXJyb3IuXG4gICAgICB9XG4gICAgfSkoKTtcblxuICAgIHJldHVybiAwO1xuICB9XG5cbiAgLyoqXG4gICAqIEBwYXJhbSB1c2VyQnVmXG4gICAqIEByZXR1cm4gQW4gZXJyb3Igc3RhdHVzIGNvZGUuXG4gICAqL1xuICB1c2VVc2VyQnVmZmVyKF91c2VyQnVmOiB1bmtub3duKTogbnVtYmVyIHtcbiAgICAvLyBUT0RPKGNtb3J0ZW4pXG4gICAgbm90SW1wbGVtZW50ZWQoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBXcml0ZSBhIGJ1ZmZlciB0byB0aGUgc3RyZWFtLlxuICAgKiBAcGFyYW0gcmVxIEEgd3JpdGUgcmVxdWVzdCB3cmFwcGVyLlxuICAgKiBAcGFyYW0gZGF0YSBUaGUgVWludDhBcnJheSBidWZmZXIgdG8gd3JpdGUgdG8gdGhlIHN0cmVhbS5cbiAgICogQHJldHVybiBBbiBlcnJvciBzdGF0dXMgY29kZS5cbiAgICovXG4gIHdyaXRlQnVmZmVyKHJlcTogV3JpdGVXcmFwPExpYnV2U3RyZWFtV3JhcD4sIGRhdGE6IFVpbnQ4QXJyYXkpOiBudW1iZXIge1xuICAgIGNvbnN0IGN1cnJlbnRXcml0ZSA9IHRoaXMuI3dyaXRlKHJlcSwgZGF0YSk7XG4gICAgdGhpcy4jY3VycmVudFdyaXRlcy5hZGQoY3VycmVudFdyaXRlKTtcbiAgICBjdXJyZW50V3JpdGUudGhlbihcbiAgICAgICgpID0+IHRoaXMuI2N1cnJlbnRXcml0ZXMuZGVsZXRlKGN1cnJlbnRXcml0ZSksXG4gICAgICAoKSA9PiB0aGlzLiNjdXJyZW50V3JpdGVzLmRlbGV0ZShjdXJyZW50V3JpdGUpLFxuICAgICk7XG5cbiAgICByZXR1cm4gMDtcbiAgfVxuXG4gIC8qKlxuICAgKiBXcml0ZSBtdWx0aXBsZSBjaHVua3MgYXQgb25jZS5cbiAgICogQHBhcmFtIHJlcSBBIHdyaXRlIHJlcXVlc3Qgd3JhcHBlci5cbiAgICogQHBhcmFtIGNodW5rc1xuICAgKiBAcGFyYW0gYWxsQnVmZmVyc1xuICAgKiBAcmV0dXJuIEFuIGVycm9yIHN0YXR1cyBjb2RlLlxuICAgKi9cbiAgd3JpdGV2KFxuICAgIF9yZXE6IFdyaXRlV3JhcDxMaWJ1dlN0cmVhbVdyYXA+LFxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgX2NodW5rczogYW55LFxuICAgIF9hbGxCdWZmZXJzOiBib29sZWFuLFxuICApOiBudW1iZXIge1xuICAgIC8vIFRPRE8oY21vcnRlbilcbiAgICBub3RJbXBsZW1lbnRlZCgpO1xuICB9XG5cbiAgLyoqXG4gICAqIFdyaXRlIGFuIEFTQ0lJIHN0cmluZyB0byB0aGUgc3RyZWFtLlxuICAgKiBAcmV0dXJuIEFuIGVycm9yIHN0YXR1cyBjb2RlLlxuICAgKi9cbiAgd3JpdGVBc2NpaVN0cmluZyhyZXE6IFdyaXRlV3JhcDxMaWJ1dlN0cmVhbVdyYXA+LCBkYXRhOiBzdHJpbmcpOiBudW1iZXIge1xuICAgIGNvbnN0IGJ1ZmZlciA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShkYXRhKTtcblxuICAgIHJldHVybiB0aGlzLndyaXRlQnVmZmVyKHJlcSwgYnVmZmVyKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBXcml0ZSBhbiBVVEY4IHN0cmluZyB0byB0aGUgc3RyZWFtLlxuICAgKiBAcmV0dXJuIEFuIGVycm9yIHN0YXR1cyBjb2RlLlxuICAgKi9cbiAgd3JpdGVVdGY4U3RyaW5nKHJlcTogV3JpdGVXcmFwPExpYnV2U3RyZWFtV3JhcD4sIGRhdGE6IHN0cmluZyk6IG51bWJlciB7XG4gICAgY29uc3QgYnVmZmVyID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKGRhdGEpO1xuXG4gICAgcmV0dXJuIHRoaXMud3JpdGVCdWZmZXIocmVxLCBidWZmZXIpO1xuICB9XG5cbiAgLyoqXG4gICAqIFdyaXRlIGFuIFVDUzIgc3RyaW5nIHRvIHRoZSBzdHJlYW0uXG4gICAqIEByZXR1cm4gQW4gZXJyb3Igc3RhdHVzIGNvZGUuXG4gICAqL1xuICB3cml0ZVVjczJTdHJpbmcoX3JlcTogV3JpdGVXcmFwPExpYnV2U3RyZWFtV3JhcD4sIF9kYXRhOiBzdHJpbmcpOiBudW1iZXIge1xuICAgIG5vdEltcGxlbWVudGVkKCk7XG4gIH1cblxuICAvKipcbiAgICogV3JpdGUgYW4gTEFUSU4xIHN0cmluZyB0byB0aGUgc3RyZWFtLlxuICAgKiBAcmV0dXJuIEFuIGVycm9yIHN0YXR1cyBjb2RlLlxuICAgKi9cbiAgd3JpdGVMYXRpbjFTdHJpbmcocmVxOiBXcml0ZVdyYXA8TGlidXZTdHJlYW1XcmFwPiwgZGF0YTogc3RyaW5nKTogbnVtYmVyIHtcbiAgICBjb25zdCBidWZmZXIgPSBCdWZmZXIuZnJvbShkYXRhLCBcImxhdGluMVwiKTtcbiAgICByZXR1cm4gdGhpcy53cml0ZUJ1ZmZlcihyZXEsIGJ1ZmZlcik7XG4gIH1cblxuICBvdmVycmlkZSBhc3luYyBfb25DbG9zZSgpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIGxldCBzdGF0dXMgPSAwO1xuICAgIHRoaXMuI3JlYWRpbmcgPSBmYWxzZTtcblxuICAgIHRyeSB7XG4gICAgICB0aGlzW2tTdHJlYW1CYXNlRmllbGRdPy5jbG9zZSgpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgc3RhdHVzID0gY29kZU1hcC5nZXQoXCJFTk9UQ09OTlwiKSE7XG4gICAgfVxuXG4gICAgYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHRoaXMuI2N1cnJlbnRXcml0ZXMpO1xuICAgIGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZCh0aGlzLiNjdXJyZW50UmVhZHMpO1xuXG4gICAgcmV0dXJuIHN0YXR1cztcbiAgfVxuXG4gIC8qKlxuICAgKiBBdHRhY2hlcyB0aGUgY2xhc3MgdG8gdGhlIHVuZGVybHlpbmcgc3RyZWFtLlxuICAgKiBAcGFyYW0gc3RyZWFtIFRoZSBzdHJlYW0gdG8gYXR0YWNoIHRvLlxuICAgKi9cbiAgI2F0dGFjaFRvT2JqZWN0KHN0cmVhbT86IERlbm8uUmVhZGVyICYgRGVuby5Xcml0ZXIgJiBEZW5vLkNsb3Nlcik6IHZvaWQge1xuICAgIHRoaXNba1N0cmVhbUJhc2VGaWVsZF0gPSBzdHJlYW07XG4gIH1cblxuICAvKiogSW50ZXJuYWwgbWV0aG9kIGZvciByZWFkaW5nIGZyb20gdGhlIGF0dGFjaGVkIHN0cmVhbS4gKi9cbiAgYXN5bmMgI3JlYWQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbGV0IGJ1ZiA9IG5ldyBVaW50OEFycmF5KFNVR0dFU1RFRF9TSVpFKTtcblxuICAgIGxldCBucmVhZDogbnVtYmVyIHwgbnVsbDtcbiAgICB0cnkge1xuICAgICAgbnJlYWQgPSBhd2FpdCB0aGlzW2tTdHJlYW1CYXNlRmllbGRdIS5yZWFkKGJ1Zik7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKFxuICAgICAgICBlIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuSW50ZXJydXB0ZWQgfHxcbiAgICAgICAgZSBpbnN0YW5jZW9mIERlbm8uZXJyb3JzLkJhZFJlc291cmNlXG4gICAgICApIHtcbiAgICAgICAgbnJlYWQgPSBjb2RlTWFwLmdldChcIkVPRlwiKSE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBucmVhZCA9IGNvZGVNYXAuZ2V0KFwiVU5LTk9XTlwiKSE7XG4gICAgICB9XG5cbiAgICAgIGJ1ZiA9IG5ldyBVaW50OEFycmF5KDApO1xuICAgIH1cblxuICAgIG5yZWFkID8/PSBjb2RlTWFwLmdldChcIkVPRlwiKSE7XG5cbiAgICBzdHJlYW1CYXNlU3RhdGVba1JlYWRCeXRlc09yRXJyb3JdID0gbnJlYWQ7XG5cbiAgICBpZiAobnJlYWQgPiAwKSB7XG4gICAgICB0aGlzLmJ5dGVzUmVhZCArPSBucmVhZDtcbiAgICB9XG5cbiAgICBidWYgPSBidWYuc2xpY2UoMCwgbnJlYWQpO1xuXG4gICAgc3RyZWFtQmFzZVN0YXRlW2tBcnJheUJ1ZmZlck9mZnNldF0gPSAwO1xuXG4gICAgdHJ5IHtcbiAgICAgIHRoaXMub25yZWFkIShidWYsIG5yZWFkKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIHN3YWxsb3cgY2FsbGJhY2sgZXJyb3JzLlxuICAgIH1cblxuICAgIGlmIChucmVhZCA+PSAwICYmIHRoaXMuI3JlYWRpbmcpIHtcbiAgICAgIGNvbnN0IHJlYWRQcm9taXNlID0gdGhpcy4jcmVhZCgpO1xuICAgICAgdGhpcy4jY3VycmVudFJlYWRzLmFkZChyZWFkUHJvbWlzZSk7XG4gICAgICByZWFkUHJvbWlzZS50aGVuKFxuICAgICAgICAoKSA9PiB0aGlzLiNjdXJyZW50UmVhZHMuZGVsZXRlKHJlYWRQcm9taXNlKSxcbiAgICAgICAgKCkgPT4gdGhpcy4jY3VycmVudFJlYWRzLmRlbGV0ZShyZWFkUHJvbWlzZSksXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBJbnRlcm5hbCBtZXRob2QgZm9yIHdyaXRpbmcgdG8gdGhlIGF0dGFjaGVkIHN0cmVhbS5cbiAgICogQHBhcmFtIHJlcSBBIHdyaXRlIHJlcXVlc3Qgd3JhcHBlci5cbiAgICogQHBhcmFtIGRhdGEgVGhlIFVpbnQ4QXJyYXkgYnVmZmVyIHRvIHdyaXRlIHRvIHRoZSBzdHJlYW0uXG4gICAqL1xuICBhc3luYyAjd3JpdGUocmVxOiBXcml0ZVdyYXA8TGlidXZTdHJlYW1XcmFwPiwgZGF0YTogVWludDhBcnJheSkge1xuICAgIGNvbnN0IHsgYnl0ZUxlbmd0aCB9ID0gZGF0YTtcblxuICAgIHRyeSB7XG4gICAgICAvLyBUT0RPKGNtb3J0ZW4pOiBzb21ld2hhdCBvdmVyIHNpbXBsaWZ5aW5nIHdoYXQgTm9kZSBkb2VzLlxuICAgICAgYXdhaXQgd3JpdGVBbGwodGhpc1trU3RyZWFtQmFzZUZpZWxkXSEsIGRhdGEpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gVE9ETyhjbW9ydGVuKTogbWFwIGVyciB0byBzdGF0dXMgY29kZXNcbiAgICAgIGNvbnN0IHN0YXR1cyA9IGNvZGVNYXAuZ2V0KFwiVU5LTk9XTlwiKSE7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIHJlcS5vbmNvbXBsZXRlKHN0YXR1cyk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gc3dhbGxvdyBjYWxsYmFjayBlcnJvcnMuXG4gICAgICB9XG5cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBzdHJlYW1CYXNlU3RhdGVba0J5dGVzV3JpdHRlbl0gPSBieXRlTGVuZ3RoO1xuICAgIHRoaXMuYnl0ZXNXcml0dGVuICs9IGJ5dGVMZW5ndGg7XG5cbiAgICB0cnkge1xuICAgICAgcmVxLm9uY29tcGxldGUoMCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBzd2FsbG93IGNhbGxiYWNrIGVycm9ycy5cbiAgICB9XG5cbiAgICByZXR1cm47XG4gIH1cbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwwRUFBMEU7QUFDMUUsc0RBQXNEO0FBQ3RELEVBQUU7QUFDRiwwRUFBMEU7QUFDMUUsZ0VBQWdFO0FBQ2hFLHNFQUFzRTtBQUN0RSxzRUFBc0U7QUFDdEUsNEVBQTRFO0FBQzVFLHFFQUFxRTtBQUNyRSx3QkFBd0I7QUFDeEIsRUFBRTtBQUNGLDBFQUEwRTtBQUMxRSx5REFBeUQ7QUFDekQsRUFBRTtBQUNGLDBFQUEwRTtBQUMxRSw2REFBNkQ7QUFDN0QsNEVBQTRFO0FBQzVFLDJFQUEyRTtBQUMzRSx3RUFBd0U7QUFDeEUsNEVBQTRFO0FBQzVFLHlDQUF5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