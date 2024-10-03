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
import { Buffer } from "./buffer.ts";
import { normalizeEncoding as castEncoding, notImplemented } from "./_utils.ts";
var NotImplemented;
(function(NotImplemented) {
  NotImplemented[NotImplemented["ascii"] = 0] = "ascii";
  NotImplemented[NotImplemented["latin1"] = 1] = "latin1";
  NotImplemented[NotImplemented["utf16le"] = 2] = "utf16le";
})(NotImplemented || (NotImplemented = {}));
function normalizeEncoding(enc) {
  const encoding = castEncoding(enc ?? null);
  if (encoding && encoding in NotImplemented) notImplemented(encoding);
  if (!encoding && typeof enc === "string" && enc.toLowerCase() !== "raw") {
    throw new Error(`Unknown encoding: ${enc}`);
  }
  return String(encoding);
}
/*
 * Checks the type of a UTF-8 byte, whether it's ASCII, a leading byte, or a
 * continuation byte. If an invalid byte is detected, -2 is returned.
 * */ function utf8CheckByte(byte) {
  if (byte <= 0x7f) return 0;
  else if (byte >> 5 === 0x06) return 2;
  else if (byte >> 4 === 0x0e) return 3;
  else if (byte >> 3 === 0x1e) return 4;
  return byte >> 6 === 0x02 ? -1 : -2;
}
/*
 * Checks at most 3 bytes at the end of a Buffer in order to detect an
 * incomplete multi-byte UTF-8 character. The total number of bytes (2, 3, or 4)
 * needed to complete the UTF-8 character (if applicable) are returned.
 * */ function utf8CheckIncomplete(self, buf, i) {
  let j = buf.length - 1;
  if (j < i) return 0;
  let nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 1;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 2;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) {
      if (nb === 2) nb = 0;
      else self.lastNeed = nb - 3;
    }
    return nb;
  }
  return 0;
}
/*
 * Validates as many continuation bytes for a multi-byte UTF-8 character as
 * needed or are available. If we see a non-continuation byte where we expect
 * one, we "replace" the validated continuation bytes we've seen so far with
 * a single UTF-8 replacement character ('\ufffd'), to match v8's UTF-8 decoding
 * behavior. The continuation byte check is included three times in the case
 * where all of the continuation bytes for a character exist in the same buffer.
 * It is also done this way as a slight performance increase instead of using a
 * loop.
 * */ function utf8CheckExtraBytes(self, buf) {
  if ((buf[0] & 0xc0) !== 0x80) {
    self.lastNeed = 0;
    return "\ufffd";
  }
  if (self.lastNeed > 1 && buf.length > 1) {
    if ((buf[1] & 0xc0) !== 0x80) {
      self.lastNeed = 1;
      return "\ufffd";
    }
    if (self.lastNeed > 2 && buf.length > 2) {
      if ((buf[2] & 0xc0) !== 0x80) {
        self.lastNeed = 2;
        return "\ufffd";
      }
    }
  }
}
/*
 * Attempts to complete a multi-byte UTF-8 character using bytes from a Buffer.
 * */ function utf8FillLastComplete(buf) {
  const p = this.lastTotal - this.lastNeed;
  const r = utf8CheckExtraBytes(this, buf);
  if (r !== undefined) return r;
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, p, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, p, 0, buf.length);
  this.lastNeed -= buf.length;
}
/*
 * Attempts to complete a partial non-UTF-8 character using bytes from a Buffer
 * */ function utf8FillLastIncomplete(buf) {
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, buf.length);
  this.lastNeed -= buf.length;
}
/*
 * Returns all complete UTF-8 characters in a Buffer. If the Buffer ended on a
 * partial character, the character's bytes are buffered until the required
 * number of bytes are available.
 * */ function utf8Text(buf, i) {
  const total = utf8CheckIncomplete(this, buf, i);
  if (!this.lastNeed) return buf.toString("utf8", i);
  this.lastTotal = total;
  const end = buf.length - (total - this.lastNeed);
  buf.copy(this.lastChar, 0, end);
  return buf.toString("utf8", i, end);
}
/*
 * For UTF-8, a replacement character is added when ending on a partial
 * character.
 * */ function utf8End(buf) {
  const r = buf && buf.length ? this.write(buf) : "";
  if (this.lastNeed) return r + "\ufffd";
  return r;
}
function utf8Write(buf) {
  if (typeof buf === "string") {
    return buf;
  }
  if (buf.length === 0) return "";
  let r;
  let i;
  if (this.lastNeed) {
    r = this.fillLast(buf);
    if (r === undefined) return "";
    i = this.lastNeed;
    this.lastNeed = 0;
  } else {
    i = 0;
  }
  if (i < buf.length) return r ? r + this.text(buf, i) : this.text(buf, i);
  return r || "";
}
function base64Text(buf, i) {
  const n = (buf.length - i) % 3;
  if (n === 0) return buf.toString("base64", i);
  this.lastNeed = 3 - n;
  this.lastTotal = 3;
  if (n === 1) {
    this.lastChar[0] = buf[buf.length - 1];
  } else {
    this.lastChar[0] = buf[buf.length - 2];
    this.lastChar[1] = buf[buf.length - 1];
  }
  return buf.toString("base64", i, buf.length - n);
}
function base64End(buf) {
  const r = buf && buf.length ? this.write(buf) : "";
  if (this.lastNeed) {
    return r + this.lastChar.toString("base64", 0, 3 - this.lastNeed);
  }
  return r;
}
function simpleWrite(buf) {
  if (typeof buf === "string") {
    return buf;
  }
  return buf.toString(this.encoding);
}
function simpleEnd(buf) {
  return buf && buf.length ? this.write(buf) : "";
}
class StringDecoderBase {
  encoding;
  lastChar;
  lastNeed;
  lastTotal;
  constructor(encoding, nb){
    this.encoding = encoding;
    this.lastNeed = 0;
    this.lastTotal = 0;
    this.lastChar = Buffer.allocUnsafe(nb);
  }
}
class Base64Decoder extends StringDecoderBase {
  end = base64End;
  fillLast = utf8FillLastIncomplete;
  text = base64Text;
  write = utf8Write;
  constructor(encoding){
    super(normalizeEncoding(encoding), 3);
  }
}
class GenericDecoder extends StringDecoderBase {
  end = simpleEnd;
  fillLast = undefined;
  text = utf8Text;
  write = simpleWrite;
  constructor(encoding){
    super(normalizeEncoding(encoding), 4);
  }
}
class Utf8Decoder extends StringDecoderBase {
  end = utf8End;
  fillLast = utf8FillLastComplete;
  text = utf8Text;
  write = utf8Write;
  constructor(encoding){
    super(normalizeEncoding(encoding), 4);
  }
}
/*
 * StringDecoder provides an interface for efficiently splitting a series of
 * buffers into a series of JS strings without breaking apart multi-byte
 * characters.
 * */ export class StringDecoder {
  encoding;
  end;
  fillLast;
  lastChar;
  lastNeed;
  lastTotal;
  text;
  write;
  constructor(encoding){
    let decoder;
    switch(encoding){
      case "utf8":
        decoder = new Utf8Decoder(encoding);
        break;
      case "base64":
        decoder = new Base64Decoder(encoding);
        break;
      default:
        decoder = new GenericDecoder(encoding);
    }
    this.encoding = decoder.encoding;
    this.end = decoder.end;
    this.fillLast = decoder.fillLast;
    this.lastChar = decoder.lastChar;
    this.lastNeed = decoder.lastNeed;
    this.lastTotal = decoder.lastTotal;
    this.text = decoder.text;
    this.write = decoder.write;
  }
}
// Allow calling StringDecoder() without new
const PStringDecoder = new Proxy(StringDecoder, {
  apply (_target, thisArg, args) {
    // @ts-ignore tedious to replicate types ...
    return Object.assign(thisArg, new StringDecoder(...args));
  }
});
export default {
  StringDecoder: PStringDecoder
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL25vZGUvc3RyaW5nX2RlY29kZXIudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMiB0aGUgRGVubyBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cbi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG5pbXBvcnQgeyBCdWZmZXIgfSBmcm9tIFwiLi9idWZmZXIudHNcIjtcbmltcG9ydCB7IG5vcm1hbGl6ZUVuY29kaW5nIGFzIGNhc3RFbmNvZGluZywgbm90SW1wbGVtZW50ZWQgfSBmcm9tIFwiLi9fdXRpbHMudHNcIjtcblxuZW51bSBOb3RJbXBsZW1lbnRlZCB7XG4gIFwiYXNjaWlcIixcbiAgXCJsYXRpbjFcIixcbiAgXCJ1dGYxNmxlXCIsXG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZUVuY29kaW5nKGVuYz86IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGVuY29kaW5nID0gY2FzdEVuY29kaW5nKGVuYyA/PyBudWxsKTtcbiAgaWYgKGVuY29kaW5nICYmIGVuY29kaW5nIGluIE5vdEltcGxlbWVudGVkKSBub3RJbXBsZW1lbnRlZChlbmNvZGluZyk7XG4gIGlmICghZW5jb2RpbmcgJiYgdHlwZW9mIGVuYyA9PT0gXCJzdHJpbmdcIiAmJiBlbmMudG9Mb3dlckNhc2UoKSAhPT0gXCJyYXdcIikge1xuICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBlbmNvZGluZzogJHtlbmN9YCk7XG4gIH1cbiAgcmV0dXJuIFN0cmluZyhlbmNvZGluZyk7XG59XG4vKlxuICogQ2hlY2tzIHRoZSB0eXBlIG9mIGEgVVRGLTggYnl0ZSwgd2hldGhlciBpdCdzIEFTQ0lJLCBhIGxlYWRpbmcgYnl0ZSwgb3IgYVxuICogY29udGludWF0aW9uIGJ5dGUuIElmIGFuIGludmFsaWQgYnl0ZSBpcyBkZXRlY3RlZCwgLTIgaXMgcmV0dXJuZWQuXG4gKiAqL1xuZnVuY3Rpb24gdXRmOENoZWNrQnl0ZShieXRlOiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoYnl0ZSA8PSAweDdmKSByZXR1cm4gMDtcbiAgZWxzZSBpZiAoYnl0ZSA+PiA1ID09PSAweDA2KSByZXR1cm4gMjtcbiAgZWxzZSBpZiAoYnl0ZSA+PiA0ID09PSAweDBlKSByZXR1cm4gMztcbiAgZWxzZSBpZiAoYnl0ZSA+PiAzID09PSAweDFlKSByZXR1cm4gNDtcbiAgcmV0dXJuIGJ5dGUgPj4gNiA9PT0gMHgwMiA/IC0xIDogLTI7XG59XG5cbi8qXG4gKiBDaGVja3MgYXQgbW9zdCAzIGJ5dGVzIGF0IHRoZSBlbmQgb2YgYSBCdWZmZXIgaW4gb3JkZXIgdG8gZGV0ZWN0IGFuXG4gKiBpbmNvbXBsZXRlIG11bHRpLWJ5dGUgVVRGLTggY2hhcmFjdGVyLiBUaGUgdG90YWwgbnVtYmVyIG9mIGJ5dGVzICgyLCAzLCBvciA0KVxuICogbmVlZGVkIHRvIGNvbXBsZXRlIHRoZSBVVEYtOCBjaGFyYWN0ZXIgKGlmIGFwcGxpY2FibGUpIGFyZSByZXR1cm5lZC5cbiAqICovXG5mdW5jdGlvbiB1dGY4Q2hlY2tJbmNvbXBsZXRlKFxuICBzZWxmOiBTdHJpbmdEZWNvZGVyQmFzZSxcbiAgYnVmOiBCdWZmZXIsXG4gIGk6IG51bWJlcixcbik6IG51bWJlciB7XG4gIGxldCBqID0gYnVmLmxlbmd0aCAtIDE7XG4gIGlmIChqIDwgaSkgcmV0dXJuIDA7XG4gIGxldCBuYiA9IHV0ZjhDaGVja0J5dGUoYnVmW2pdKTtcbiAgaWYgKG5iID49IDApIHtcbiAgICBpZiAobmIgPiAwKSBzZWxmLmxhc3ROZWVkID0gbmIgLSAxO1xuICAgIHJldHVybiBuYjtcbiAgfVxuICBpZiAoLS1qIDwgaSB8fCBuYiA9PT0gLTIpIHJldHVybiAwO1xuICBuYiA9IHV0ZjhDaGVja0J5dGUoYnVmW2pdKTtcbiAgaWYgKG5iID49IDApIHtcbiAgICBpZiAobmIgPiAwKSBzZWxmLmxhc3ROZWVkID0gbmIgLSAyO1xuICAgIHJldHVybiBuYjtcbiAgfVxuICBpZiAoLS1qIDwgaSB8fCBuYiA9PT0gLTIpIHJldHVybiAwO1xuICBuYiA9IHV0ZjhDaGVja0J5dGUoYnVmW2pdKTtcbiAgaWYgKG5iID49IDApIHtcbiAgICBpZiAobmIgPiAwKSB7XG4gICAgICBpZiAobmIgPT09IDIpIG5iID0gMDtcbiAgICAgIGVsc2Ugc2VsZi5sYXN0TmVlZCA9IG5iIC0gMztcbiAgICB9XG4gICAgcmV0dXJuIG5iO1xuICB9XG4gIHJldHVybiAwO1xufVxuXG4vKlxuICogVmFsaWRhdGVzIGFzIG1hbnkgY29udGludWF0aW9uIGJ5dGVzIGZvciBhIG11bHRpLWJ5dGUgVVRGLTggY2hhcmFjdGVyIGFzXG4gKiBuZWVkZWQgb3IgYXJlIGF2YWlsYWJsZS4gSWYgd2Ugc2VlIGEgbm9uLWNvbnRpbnVhdGlvbiBieXRlIHdoZXJlIHdlIGV4cGVjdFxuICogb25lLCB3ZSBcInJlcGxhY2VcIiB0aGUgdmFsaWRhdGVkIGNvbnRpbnVhdGlvbiBieXRlcyB3ZSd2ZSBzZWVuIHNvIGZhciB3aXRoXG4gKiBhIHNpbmdsZSBVVEYtOCByZXBsYWNlbWVudCBjaGFyYWN0ZXIgKCdcXHVmZmZkJyksIHRvIG1hdGNoIHY4J3MgVVRGLTggZGVjb2RpbmdcbiAqIGJlaGF2aW9yLiBUaGUgY29udGludWF0aW9uIGJ5dGUgY2hlY2sgaXMgaW5jbHVkZWQgdGhyZWUgdGltZXMgaW4gdGhlIGNhc2VcbiAqIHdoZXJlIGFsbCBvZiB0aGUgY29udGludWF0aW9uIGJ5dGVzIGZvciBhIGNoYXJhY3RlciBleGlzdCBpbiB0aGUgc2FtZSBidWZmZXIuXG4gKiBJdCBpcyBhbHNvIGRvbmUgdGhpcyB3YXkgYXMgYSBzbGlnaHQgcGVyZm9ybWFuY2UgaW5jcmVhc2UgaW5zdGVhZCBvZiB1c2luZyBhXG4gKiBsb29wLlxuICogKi9cbmZ1bmN0aW9uIHV0ZjhDaGVja0V4dHJhQnl0ZXMoXG4gIHNlbGY6IFN0cmluZ0RlY29kZXJCYXNlLFxuICBidWY6IEJ1ZmZlcixcbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGlmICgoYnVmWzBdICYgMHhjMCkgIT09IDB4ODApIHtcbiAgICBzZWxmLmxhc3ROZWVkID0gMDtcbiAgICByZXR1cm4gXCJcXHVmZmZkXCI7XG4gIH1cbiAgaWYgKHNlbGYubGFzdE5lZWQgPiAxICYmIGJ1Zi5sZW5ndGggPiAxKSB7XG4gICAgaWYgKChidWZbMV0gJiAweGMwKSAhPT0gMHg4MCkge1xuICAgICAgc2VsZi5sYXN0TmVlZCA9IDE7XG4gICAgICByZXR1cm4gXCJcXHVmZmZkXCI7XG4gICAgfVxuICAgIGlmIChzZWxmLmxhc3ROZWVkID4gMiAmJiBidWYubGVuZ3RoID4gMikge1xuICAgICAgaWYgKChidWZbMl0gJiAweGMwKSAhPT0gMHg4MCkge1xuICAgICAgICBzZWxmLmxhc3ROZWVkID0gMjtcbiAgICAgICAgcmV0dXJuIFwiXFx1ZmZmZFwiO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG4vKlxuICogQXR0ZW1wdHMgdG8gY29tcGxldGUgYSBtdWx0aS1ieXRlIFVURi04IGNoYXJhY3RlciB1c2luZyBieXRlcyBmcm9tIGEgQnVmZmVyLlxuICogKi9cbmZ1bmN0aW9uIHV0ZjhGaWxsTGFzdENvbXBsZXRlKFxuICB0aGlzOiBTdHJpbmdEZWNvZGVyQmFzZSxcbiAgYnVmOiBCdWZmZXIsXG4pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBjb25zdCBwID0gdGhpcy5sYXN0VG90YWwgLSB0aGlzLmxhc3ROZWVkO1xuICBjb25zdCByID0gdXRmOENoZWNrRXh0cmFCeXRlcyh0aGlzLCBidWYpO1xuICBpZiAociAhPT0gdW5kZWZpbmVkKSByZXR1cm4gcjtcbiAgaWYgKHRoaXMubGFzdE5lZWQgPD0gYnVmLmxlbmd0aCkge1xuICAgIGJ1Zi5jb3B5KHRoaXMubGFzdENoYXIsIHAsIDAsIHRoaXMubGFzdE5lZWQpO1xuICAgIHJldHVybiB0aGlzLmxhc3RDaGFyLnRvU3RyaW5nKHRoaXMuZW5jb2RpbmcsIDAsIHRoaXMubGFzdFRvdGFsKTtcbiAgfVxuICBidWYuY29weSh0aGlzLmxhc3RDaGFyLCBwLCAwLCBidWYubGVuZ3RoKTtcbiAgdGhpcy5sYXN0TmVlZCAtPSBidWYubGVuZ3RoO1xufVxuXG4vKlxuICogQXR0ZW1wdHMgdG8gY29tcGxldGUgYSBwYXJ0aWFsIG5vbi1VVEYtOCBjaGFyYWN0ZXIgdXNpbmcgYnl0ZXMgZnJvbSBhIEJ1ZmZlclxuICogKi9cbmZ1bmN0aW9uIHV0ZjhGaWxsTGFzdEluY29tcGxldGUoXG4gIHRoaXM6IFN0cmluZ0RlY29kZXJCYXNlLFxuICBidWY6IEJ1ZmZlcixcbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGlmICh0aGlzLmxhc3ROZWVkIDw9IGJ1Zi5sZW5ndGgpIHtcbiAgICBidWYuY29weSh0aGlzLmxhc3RDaGFyLCB0aGlzLmxhc3RUb3RhbCAtIHRoaXMubGFzdE5lZWQsIDAsIHRoaXMubGFzdE5lZWQpO1xuICAgIHJldHVybiB0aGlzLmxhc3RDaGFyLnRvU3RyaW5nKHRoaXMuZW5jb2RpbmcsIDAsIHRoaXMubGFzdFRvdGFsKTtcbiAgfVxuICBidWYuY29weSh0aGlzLmxhc3RDaGFyLCB0aGlzLmxhc3RUb3RhbCAtIHRoaXMubGFzdE5lZWQsIDAsIGJ1Zi5sZW5ndGgpO1xuICB0aGlzLmxhc3ROZWVkIC09IGJ1Zi5sZW5ndGg7XG59XG5cbi8qXG4gKiBSZXR1cm5zIGFsbCBjb21wbGV0ZSBVVEYtOCBjaGFyYWN0ZXJzIGluIGEgQnVmZmVyLiBJZiB0aGUgQnVmZmVyIGVuZGVkIG9uIGFcbiAqIHBhcnRpYWwgY2hhcmFjdGVyLCB0aGUgY2hhcmFjdGVyJ3MgYnl0ZXMgYXJlIGJ1ZmZlcmVkIHVudGlsIHRoZSByZXF1aXJlZFxuICogbnVtYmVyIG9mIGJ5dGVzIGFyZSBhdmFpbGFibGUuXG4gKiAqL1xuZnVuY3Rpb24gdXRmOFRleHQodGhpczogU3RyaW5nRGVjb2RlckJhc2UsIGJ1ZjogQnVmZmVyLCBpOiBudW1iZXIpOiBzdHJpbmcge1xuICBjb25zdCB0b3RhbCA9IHV0ZjhDaGVja0luY29tcGxldGUodGhpcywgYnVmLCBpKTtcbiAgaWYgKCF0aGlzLmxhc3ROZWVkKSByZXR1cm4gYnVmLnRvU3RyaW5nKFwidXRmOFwiLCBpKTtcbiAgdGhpcy5sYXN0VG90YWwgPSB0b3RhbDtcbiAgY29uc3QgZW5kID0gYnVmLmxlbmd0aCAtICh0b3RhbCAtIHRoaXMubGFzdE5lZWQpO1xuICBidWYuY29weSh0aGlzLmxhc3RDaGFyLCAwLCBlbmQpO1xuICByZXR1cm4gYnVmLnRvU3RyaW5nKFwidXRmOFwiLCBpLCBlbmQpO1xufVxuXG4vKlxuICogRm9yIFVURi04LCBhIHJlcGxhY2VtZW50IGNoYXJhY3RlciBpcyBhZGRlZCB3aGVuIGVuZGluZyBvbiBhIHBhcnRpYWxcbiAqIGNoYXJhY3Rlci5cbiAqICovXG5mdW5jdGlvbiB1dGY4RW5kKHRoaXM6IFV0ZjhEZWNvZGVyLCBidWY/OiBCdWZmZXIpOiBzdHJpbmcge1xuICBjb25zdCByID0gYnVmICYmIGJ1Zi5sZW5ndGggPyB0aGlzLndyaXRlKGJ1ZikgOiBcIlwiO1xuICBpZiAodGhpcy5sYXN0TmVlZCkgcmV0dXJuIHIgKyBcIlxcdWZmZmRcIjtcbiAgcmV0dXJuIHI7XG59XG5cbmZ1bmN0aW9uIHV0ZjhXcml0ZShcbiAgdGhpczogVXRmOERlY29kZXIgfCBCYXNlNjREZWNvZGVyLFxuICBidWY6IEJ1ZmZlciB8IHN0cmluZyxcbik6IHN0cmluZyB7XG4gIGlmICh0eXBlb2YgYnVmID09PSBcInN0cmluZ1wiKSB7XG4gICAgcmV0dXJuIGJ1ZjtcbiAgfVxuICBpZiAoYnVmLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFwiXCI7XG4gIGxldCByO1xuICBsZXQgaTtcbiAgaWYgKHRoaXMubGFzdE5lZWQpIHtcbiAgICByID0gdGhpcy5maWxsTGFzdChidWYpO1xuICAgIGlmIChyID09PSB1bmRlZmluZWQpIHJldHVybiBcIlwiO1xuICAgIGkgPSB0aGlzLmxhc3ROZWVkO1xuICAgIHRoaXMubGFzdE5lZWQgPSAwO1xuICB9IGVsc2Uge1xuICAgIGkgPSAwO1xuICB9XG4gIGlmIChpIDwgYnVmLmxlbmd0aCkgcmV0dXJuIHIgPyByICsgdGhpcy50ZXh0KGJ1ZiwgaSkgOiB0aGlzLnRleHQoYnVmLCBpKTtcbiAgcmV0dXJuIHIgfHwgXCJcIjtcbn1cblxuZnVuY3Rpb24gYmFzZTY0VGV4dCh0aGlzOiBTdHJpbmdEZWNvZGVyQmFzZSwgYnVmOiBCdWZmZXIsIGk6IG51bWJlcik6IHN0cmluZyB7XG4gIGNvbnN0IG4gPSAoYnVmLmxlbmd0aCAtIGkpICUgMztcbiAgaWYgKG4gPT09IDApIHJldHVybiBidWYudG9TdHJpbmcoXCJiYXNlNjRcIiwgaSk7XG4gIHRoaXMubGFzdE5lZWQgPSAzIC0gbjtcbiAgdGhpcy5sYXN0VG90YWwgPSAzO1xuICBpZiAobiA9PT0gMSkge1xuICAgIHRoaXMubGFzdENoYXJbMF0gPSBidWZbYnVmLmxlbmd0aCAtIDFdO1xuICB9IGVsc2Uge1xuICAgIHRoaXMubGFzdENoYXJbMF0gPSBidWZbYnVmLmxlbmd0aCAtIDJdO1xuICAgIHRoaXMubGFzdENoYXJbMV0gPSBidWZbYnVmLmxlbmd0aCAtIDFdO1xuICB9XG4gIHJldHVybiBidWYudG9TdHJpbmcoXCJiYXNlNjRcIiwgaSwgYnVmLmxlbmd0aCAtIG4pO1xufVxuXG5mdW5jdGlvbiBiYXNlNjRFbmQodGhpczogQmFzZTY0RGVjb2RlciwgYnVmPzogQnVmZmVyKTogc3RyaW5nIHtcbiAgY29uc3QgciA9IGJ1ZiAmJiBidWYubGVuZ3RoID8gdGhpcy53cml0ZShidWYpIDogXCJcIjtcbiAgaWYgKHRoaXMubGFzdE5lZWQpIHtcbiAgICByZXR1cm4gciArIHRoaXMubGFzdENoYXIudG9TdHJpbmcoXCJiYXNlNjRcIiwgMCwgMyAtIHRoaXMubGFzdE5lZWQpO1xuICB9XG4gIHJldHVybiByO1xufVxuXG5mdW5jdGlvbiBzaW1wbGVXcml0ZShcbiAgdGhpczogU3RyaW5nRGVjb2RlckJhc2UsXG4gIGJ1ZjogQnVmZmVyIHwgc3RyaW5nLFxuKTogc3RyaW5nIHtcbiAgaWYgKHR5cGVvZiBidWYgPT09IFwic3RyaW5nXCIpIHtcbiAgICByZXR1cm4gYnVmO1xuICB9XG4gIHJldHVybiBidWYudG9TdHJpbmcodGhpcy5lbmNvZGluZyk7XG59XG5cbmZ1bmN0aW9uIHNpbXBsZUVuZCh0aGlzOiBHZW5lcmljRGVjb2RlciwgYnVmPzogQnVmZmVyKTogc3RyaW5nIHtcbiAgcmV0dXJuIGJ1ZiAmJiBidWYubGVuZ3RoID8gdGhpcy53cml0ZShidWYpIDogXCJcIjtcbn1cblxuY2xhc3MgU3RyaW5nRGVjb2RlckJhc2Uge1xuICBwdWJsaWMgbGFzdENoYXI6IEJ1ZmZlcjtcbiAgcHVibGljIGxhc3ROZWVkID0gMDtcbiAgcHVibGljIGxhc3RUb3RhbCA9IDA7XG4gIGNvbnN0cnVjdG9yKHB1YmxpYyBlbmNvZGluZzogc3RyaW5nLCBuYjogbnVtYmVyKSB7XG4gICAgdGhpcy5sYXN0Q2hhciA9IEJ1ZmZlci5hbGxvY1Vuc2FmZShuYik7XG4gIH1cbn1cblxuY2xhc3MgQmFzZTY0RGVjb2RlciBleHRlbmRzIFN0cmluZ0RlY29kZXJCYXNlIHtcbiAgcHVibGljIGVuZCA9IGJhc2U2NEVuZDtcbiAgcHVibGljIGZpbGxMYXN0ID0gdXRmOEZpbGxMYXN0SW5jb21wbGV0ZTtcbiAgcHVibGljIHRleHQgPSBiYXNlNjRUZXh0O1xuICBwdWJsaWMgd3JpdGUgPSB1dGY4V3JpdGU7XG5cbiAgY29uc3RydWN0b3IoZW5jb2Rpbmc/OiBzdHJpbmcpIHtcbiAgICBzdXBlcihub3JtYWxpemVFbmNvZGluZyhlbmNvZGluZyksIDMpO1xuICB9XG59XG5cbmNsYXNzIEdlbmVyaWNEZWNvZGVyIGV4dGVuZHMgU3RyaW5nRGVjb2RlckJhc2Uge1xuICBwdWJsaWMgZW5kID0gc2ltcGxlRW5kO1xuICBwdWJsaWMgZmlsbExhc3QgPSB1bmRlZmluZWQ7XG4gIHB1YmxpYyB0ZXh0ID0gdXRmOFRleHQ7XG4gIHB1YmxpYyB3cml0ZSA9IHNpbXBsZVdyaXRlO1xuXG4gIGNvbnN0cnVjdG9yKGVuY29kaW5nPzogc3RyaW5nKSB7XG4gICAgc3VwZXIobm9ybWFsaXplRW5jb2RpbmcoZW5jb2RpbmcpLCA0KTtcbiAgfVxufVxuXG5jbGFzcyBVdGY4RGVjb2RlciBleHRlbmRzIFN0cmluZ0RlY29kZXJCYXNlIHtcbiAgcHVibGljIGVuZCA9IHV0ZjhFbmQ7XG4gIHB1YmxpYyBmaWxsTGFzdCA9IHV0ZjhGaWxsTGFzdENvbXBsZXRlO1xuICBwdWJsaWMgdGV4dCA9IHV0ZjhUZXh0O1xuICBwdWJsaWMgd3JpdGUgPSB1dGY4V3JpdGU7XG5cbiAgY29uc3RydWN0b3IoZW5jb2Rpbmc/OiBzdHJpbmcpIHtcbiAgICBzdXBlcihub3JtYWxpemVFbmNvZGluZyhlbmNvZGluZyksIDQpO1xuICB9XG59XG5cbi8qXG4gKiBTdHJpbmdEZWNvZGVyIHByb3ZpZGVzIGFuIGludGVyZmFjZSBmb3IgZWZmaWNpZW50bHkgc3BsaXR0aW5nIGEgc2VyaWVzIG9mXG4gKiBidWZmZXJzIGludG8gYSBzZXJpZXMgb2YgSlMgc3RyaW5ncyB3aXRob3V0IGJyZWFraW5nIGFwYXJ0IG11bHRpLWJ5dGVcbiAqIGNoYXJhY3RlcnMuXG4gKiAqL1xuZXhwb3J0IGNsYXNzIFN0cmluZ0RlY29kZXIge1xuICBwdWJsaWMgZW5jb2Rpbmc6IHN0cmluZztcbiAgcHVibGljIGVuZDogKGJ1Zj86IEJ1ZmZlcikgPT4gc3RyaW5nO1xuICBwdWJsaWMgZmlsbExhc3Q6ICgoYnVmOiBCdWZmZXIpID0+IHN0cmluZyB8IHVuZGVmaW5lZCkgfCB1bmRlZmluZWQ7XG4gIHB1YmxpYyBsYXN0Q2hhcjogQnVmZmVyO1xuICBwdWJsaWMgbGFzdE5lZWQ6IG51bWJlcjtcbiAgcHVibGljIGxhc3RUb3RhbDogbnVtYmVyO1xuICBwdWJsaWMgdGV4dDogKGJ1ZjogQnVmZmVyLCBuOiBudW1iZXIpID0+IHN0cmluZztcbiAgcHVibGljIHdyaXRlOiAoYnVmOiBCdWZmZXIpID0+IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihlbmNvZGluZz86IHN0cmluZykge1xuICAgIGxldCBkZWNvZGVyO1xuICAgIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICAgIGNhc2UgXCJ1dGY4XCI6XG4gICAgICAgIGRlY29kZXIgPSBuZXcgVXRmOERlY29kZXIoZW5jb2RpbmcpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJiYXNlNjRcIjpcbiAgICAgICAgZGVjb2RlciA9IG5ldyBCYXNlNjREZWNvZGVyKGVuY29kaW5nKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBkZWNvZGVyID0gbmV3IEdlbmVyaWNEZWNvZGVyKGVuY29kaW5nKTtcbiAgICB9XG4gICAgdGhpcy5lbmNvZGluZyA9IGRlY29kZXIuZW5jb2Rpbmc7XG4gICAgdGhpcy5lbmQgPSBkZWNvZGVyLmVuZDtcbiAgICB0aGlzLmZpbGxMYXN0ID0gZGVjb2Rlci5maWxsTGFzdDtcbiAgICB0aGlzLmxhc3RDaGFyID0gZGVjb2Rlci5sYXN0Q2hhcjtcbiAgICB0aGlzLmxhc3ROZWVkID0gZGVjb2Rlci5sYXN0TmVlZDtcbiAgICB0aGlzLmxhc3RUb3RhbCA9IGRlY29kZXIubGFzdFRvdGFsO1xuICAgIHRoaXMudGV4dCA9IGRlY29kZXIudGV4dDtcbiAgICB0aGlzLndyaXRlID0gZGVjb2Rlci53cml0ZTtcbiAgfVxufVxuLy8gQWxsb3cgY2FsbGluZyBTdHJpbmdEZWNvZGVyKCkgd2l0aG91dCBuZXdcbmNvbnN0IFBTdHJpbmdEZWNvZGVyID0gbmV3IFByb3h5KFN0cmluZ0RlY29kZXIsIHtcbiAgYXBwbHkoX3RhcmdldCwgdGhpc0FyZywgYXJncykge1xuICAgIC8vIEB0cy1pZ25vcmUgdGVkaW91cyB0byByZXBsaWNhdGUgdHlwZXMgLi4uXG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24odGhpc0FyZywgbmV3IFN0cmluZ0RlY29kZXIoLi4uYXJncykpO1xuICB9LFxufSk7XG5cbmV4cG9ydCBkZWZhdWx0IHsgU3RyaW5nRGVjb2RlcjogUFN0cmluZ0RlY29kZXIgfTtcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwwRUFBMEU7QUFDMUUsc0RBQXNEO0FBQ3RELEVBQUU7QUFDRiwwRUFBMEU7QUFDMUUsZ0VBQWdFO0FBQ2hFLHNFQUFzRTtBQUN0RSxzRUFBc0U7QUFDdEUsNEVBQTRFO0FBQzVFLHFFQUFxRTtBQUNyRSx3QkFBd0I7QUFDeEIsRUFBRTtBQUNGLDBFQUEwRTtBQUMxRSx5REFBeUQ7QUFDekQsRUFBRTtBQUNGLDBFQUEwRTtBQUMxRSw2REFBNkQ7QUFDN0QsNEVBQTRFO0FBQzVFLDJFQUEyRTtBQUMzRSx3RUFBd0U7QUFDeEUsNEVBQTRFO0FBQzVFLHlDQUF5QztBQUV6QyxTQUFTLE1BQU0sUUFBUSxjQUFjO0FBQ3JDLFNBQVMscUJBQXFCLFlBQVksRUFBRSxjQUFjLFFBQVEsY0FBYztJQUVoRjtVQUFLLGNBQWM7RUFBZCxlQUFBLGVBQ0gsV0FBQSxLQUFBO0VBREcsZUFBQSxlQUVILFlBQUEsS0FBQTtFQUZHLGVBQUEsZUFHSCxhQUFBLEtBQUE7R0FIRyxtQkFBQTtBQU1MLFNBQVMsa0JBQWtCLEdBQVk7RUFDckMsTUFBTSxXQUFXLGFBQWEsT0FBTztFQUNyQyxJQUFJLFlBQVksWUFBWSxnQkFBZ0IsZUFBZTtFQUMzRCxJQUFJLENBQUMsWUFBWSxPQUFPLFFBQVEsWUFBWSxJQUFJLFdBQVcsT0FBTyxPQUFPO0lBQ3ZFLE1BQU0sSUFBSSxNQUFNLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDO0VBQzVDO0VBQ0EsT0FBTyxPQUFPO0FBQ2hCO0FBQ0E7OztHQUdHLEdBQ0gsU0FBUyxjQUFjLElBQVk7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