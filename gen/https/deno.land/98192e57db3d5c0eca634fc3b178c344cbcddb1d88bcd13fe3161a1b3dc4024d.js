// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
import { Buffer } from "./buffer.ts";
import { encodeStr, hexTable } from "./internal/querystring.ts";
/**
 * Alias of querystring.parse()
 * @legacy
 */ export const decode = parse;
/**
 * Alias of querystring.stringify()
 * @legacy
 */ export const encode = stringify;
/**
 * replaces encodeURIComponent()
 * @see https://www.ecma-international.org/ecma-262/5.1/#sec-15.1.3.4
 */ function qsEscape(str) {
  if (typeof str !== "string") {
    if (typeof str === "object") {
      str = String(str);
    } else {
      str += "";
    }
  }
  return encodeStr(str, noEscape, hexTable);
}
/**
 * Performs URL percent-encoding on the given `str` in a manner that is optimized for the specific requirements of URL query strings.
 * Used by `querystring.stringify()` and is generally not expected to be used directly.
 * It is exported primarily to allow application code to provide a replacement percent-encoding implementation if necessary by assigning `querystring.escape` to an alternative function.
 * @legacy
 * @see Tested in `test-querystring-escape.js`
 */ export const escape = qsEscape;
// deno-fmt-ignore
const isHexTable = new Int8Array([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  1,
  1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  1,
  1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0
]);
function charCodes(str) {
  const ret = new Array(str.length);
  for(let i = 0; i < str.length; ++i){
    ret[i] = str.charCodeAt(i);
  }
  return ret;
}
function addKeyVal(obj, key, value, keyEncoded, valEncoded, decode) {
  if (key.length > 0 && keyEncoded) {
    key = decode(key);
  }
  if (value.length > 0 && valEncoded) {
    value = decode(value);
  }
  if (obj[key] === undefined) {
    obj[key] = value;
  } else {
    const curValue = obj[key];
    // A simple Array-specific property check is enough here to
    // distinguish from a string value and is faster and still safe
    // since we are generating all of the values being assigned.
    if (curValue.pop) {
      curValue[curValue.length] = value;
    } else {
      obj[key] = [
        curValue,
        value
      ];
    }
  }
}
/**
 * Parses a URL query string into a collection of key and value pairs.
 * @param str The URL query string to parse
 * @param sep The substring used to delimit key and value pairs in the query string. Default: '&'.
 * @param eq The substring used to delimit keys and values in the query string. Default: '='.
 * @param options The parse options
 * @param options.decodeURIComponent The function to use when decoding percent-encoded characters in the query string. Default: `querystring.unescape()`.
 * @param options.maxKeys Specifies the maximum number of keys to parse. Specify `0` to remove key counting limitations. Default: `1000`.
 * @legacy
 * @see Tested in test-querystring.js
 */ export function parse(str, sep = "&", eq = "=", { decodeURIComponent: decodeURIComponent1 = unescape, maxKeys = 1000 } = {}) {
  const obj = Object.create(null);
  if (typeof str !== "string" || str.length === 0) {
    return obj;
  }
  const sepCodes = !sep ? [
    38
  ] : charCodes(String(sep));
  const eqCodes = !eq ? [
    61
  ] : charCodes(String(eq));
  const sepLen = sepCodes.length;
  const eqLen = eqCodes.length;
  let pairs = 1000;
  if (typeof maxKeys === "number") {
    // -1 is used in place of a value like Infinity for meaning
    // "unlimited pairs" because of additional checks V8 (at least as of v5.4)
    // has to do when using variables that contain values like Infinity. Since
    // `pairs` is always decremented and checked explicitly for 0, -1 works
    // effectively the same as Infinity, while providing a significant
    // performance boost.
    pairs = maxKeys > 0 ? maxKeys : -1;
  }
  let decode = unescape;
  if (decodeURIComponent1) {
    decode = decodeURIComponent1;
  }
  const customDecode = decode !== unescape;
  let lastPos = 0;
  let sepIdx = 0;
  let eqIdx = 0;
  let key = "";
  let value = "";
  let keyEncoded = customDecode;
  let valEncoded = customDecode;
  const plusChar = customDecode ? "%20" : " ";
  let encodeCheck = 0;
  for(let i = 0; i < str.length; ++i){
    const code = str.charCodeAt(i);
    // Try matching key/value pair separator (e.g. '&')
    if (code === sepCodes[sepIdx]) {
      if (++sepIdx === sepLen) {
        // Key/value pair separator match!
        const end = i - sepIdx + 1;
        if (eqIdx < eqLen) {
          // We didn't find the (entire) key/value separator
          if (lastPos < end) {
            // Treat the substring as part of the key instead of the value
            key += str.slice(lastPos, end);
          } else if (key.length === 0) {
            // We saw an empty substring between separators
            if (--pairs === 0) {
              return obj;
            }
            lastPos = i + 1;
            sepIdx = eqIdx = 0;
            continue;
          }
        } else if (lastPos < end) {
          value += str.slice(lastPos, end);
        }
        addKeyVal(obj, key, value, keyEncoded, valEncoded, decode);
        if (--pairs === 0) {
          return obj;
        }
        key = value = "";
        encodeCheck = 0;
        lastPos = i + 1;
        sepIdx = eqIdx = 0;
      }
    } else {
      sepIdx = 0;
      // Try matching key/value separator (e.g. '=') if we haven't already
      if (eqIdx < eqLen) {
        if (code === eqCodes[eqIdx]) {
          if (++eqIdx === eqLen) {
            // Key/value separator match!
            const end = i - eqIdx + 1;
            if (lastPos < end) {
              key += str.slice(lastPos, end);
            }
            encodeCheck = 0;
            lastPos = i + 1;
          }
          continue;
        } else {
          eqIdx = 0;
          if (!keyEncoded) {
            // Try to match an (valid) encoded byte once to minimize unnecessary
            // calls to string decoding functions
            if (code === 37 /* % */ ) {
              encodeCheck = 1;
              continue;
            } else if (encodeCheck > 0) {
              if (isHexTable[code] === 1) {
                if (++encodeCheck === 3) {
                  keyEncoded = true;
                }
                continue;
              } else {
                encodeCheck = 0;
              }
            }
          }
        }
        if (code === 43 /* + */ ) {
          if (lastPos < i) {
            key += str.slice(lastPos, i);
          }
          key += plusChar;
          lastPos = i + 1;
          continue;
        }
      }
      if (code === 43 /* + */ ) {
        if (lastPos < i) {
          value += str.slice(lastPos, i);
        }
        value += plusChar;
        lastPos = i + 1;
      } else if (!valEncoded) {
        // Try to match an (valid) encoded byte (once) to minimize unnecessary
        // calls to string decoding functions
        if (code === 37 /* % */ ) {
          encodeCheck = 1;
        } else if (encodeCheck > 0) {
          if (isHexTable[code] === 1) {
            if (++encodeCheck === 3) {
              valEncoded = true;
            }
          } else {
            encodeCheck = 0;
          }
        }
      }
    }
  }
  // Deal with any leftover key or value data
  if (lastPos < str.length) {
    if (eqIdx < eqLen) {
      key += str.slice(lastPos);
    } else if (sepIdx < sepLen) {
      value += str.slice(lastPos);
    }
  } else if (eqIdx === 0 && key.length === 0) {
    // We ended on an empty substring
    return obj;
  }
  addKeyVal(obj, key, value, keyEncoded, valEncoded, decode);
  return obj;
}
/**
 * These characters do not need escaping when generating query strings:
 * ! - . _ ~
 * ' ( ) *
 * digits
 * alpha (uppercase)
 * alpha (lowercase)
 */ // deno-fmt-ignore
const noEscape = new Int8Array([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  0,
  0,
  1,
  1,
  0,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  0,
  0,
  0,
  1,
  0
]);
// deno-lint-ignore no-explicit-any
function stringifyPrimitive(v) {
  if (typeof v === "string") {
    return v;
  }
  if (typeof v === "number" && isFinite(v)) {
    return "" + v;
  }
  if (typeof v === "bigint") {
    return "" + v;
  }
  if (typeof v === "boolean") {
    return v ? "true" : "false";
  }
  return "";
}
function encodeStringifiedCustom(// deno-lint-ignore no-explicit-any
v, encode) {
  return encode(stringifyPrimitive(v));
}
// deno-lint-ignore no-explicit-any
function encodeStringified(v, encode) {
  if (typeof v === "string") {
    return v.length ? encode(v) : "";
  }
  if (typeof v === "number" && isFinite(v)) {
    // Values >= 1e21 automatically switch to scientific notation which requires
    // escaping due to the inclusion of a '+' in the output
    return Math.abs(v) < 1e21 ? "" + v : encode("" + v);
  }
  if (typeof v === "bigint") {
    return "" + v;
  }
  if (typeof v === "boolean") {
    return v ? "true" : "false";
  }
  return "";
}
/**
 * Produces a URL query string from a given obj by iterating through the object's "own properties".
 * @param obj The object to serialize into a URL query string.
 * @param sep The substring used to delimit key and value pairs in the query string. Default: '&'.
 * @param eq The substring used to delimit keys and values in the query string. Default: '='.
 * @param options The stringify options
 * @param options.encodeURIComponent The function to use when converting URL-unsafe characters to percent-encoding in the query string. Default: `querystring.escape()`.
 * @legacy
 * @see Tested in `test-querystring.js`
 */ export function stringify(// deno-lint-ignore no-explicit-any
obj, sep, eq, options) {
  sep ||= "&";
  eq ||= "=";
  const encode = options ? options.encodeURIComponent : qsEscape;
  const convert = options ? encodeStringifiedCustom : encodeStringified;
  if (obj !== null && typeof obj === "object") {
    const keys = Object.keys(obj);
    const len = keys.length;
    let fields = "";
    for(let i = 0; i < len; ++i){
      const k = keys[i];
      const v = obj[k];
      let ks = convert(k, encode);
      ks += eq;
      if (Array.isArray(v)) {
        const vlen = v.length;
        if (vlen === 0) continue;
        if (fields) {
          fields += sep;
        }
        for(let j = 0; j < vlen; ++j){
          if (j) {
            fields += sep;
          }
          fields += ks;
          fields += convert(v[j], encode);
        }
      } else {
        if (fields) {
          fields += sep;
        }
        fields += ks;
        fields += convert(v, encode);
      }
    }
    return fields;
  }
  return "";
}
// deno-fmt-ignore
const unhexTable = new Int8Array([
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  +0,
  +1,
  +2,
  +3,
  +4,
  +5,
  +6,
  +7,
  +8,
  +9,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  10,
  11,
  12,
  13,
  14,
  15,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  10,
  11,
  12,
  13,
  14,
  15,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1
]);
/**
 * A safe fast alternative to decodeURIComponent
 */ export function unescapeBuffer(s, decodeSpaces = false) {
  const out = new Buffer(s.length);
  let index = 0;
  let outIndex = 0;
  let currentChar;
  let nextChar;
  let hexHigh;
  let hexLow;
  const maxLength = s.length - 2;
  // Flag to know if some hex chars have been decoded
  let hasHex = false;
  while(index < s.length){
    currentChar = s.charCodeAt(index);
    if (currentChar === 43 /* '+' */  && decodeSpaces) {
      out[outIndex++] = 32; // ' '
      index++;
      continue;
    }
    if (currentChar === 37 /* '%' */  && index < maxLength) {
      currentChar = s.charCodeAt(++index);
      hexHigh = unhexTable[currentChar];
      if (!(hexHigh >= 0)) {
        out[outIndex++] = 37; // '%'
        continue;
      } else {
        nextChar = s.charCodeAt(++index);
        hexLow = unhexTable[nextChar];
        if (!(hexLow >= 0)) {
          out[outIndex++] = 37; // '%'
          index--;
        } else {
          hasHex = true;
          currentChar = hexHigh * 16 + hexLow;
        }
      }
    }
    out[outIndex++] = currentChar;
    index++;
  }
  return hasHex ? out.slice(0, outIndex) : out;
}
function qsUnescape(s) {
  try {
    return decodeURIComponent(s);
  } catch  {
    return unescapeBuffer(s).toString();
  }
}
/**
 * Performs decoding of URL percent-encoded characters on the given `str`.
 * Used by `querystring.parse()` and is generally not expected to be used directly.
 * It is exported primarily to allow application code to provide a replacement decoding implementation if necessary by assigning `querystring.unescape` to an alternative function.
 * @legacy
 * @see Tested in `test-querystring-escape.js`
 */ export const unescape = qsUnescape;
export default {
  parse,
  stringify,
  decode,
  encode,
  unescape,
  escape,
  unescapeBuffer
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL25vZGUvcXVlcnlzdHJpbmcudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMiB0aGUgRGVubyBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cbmltcG9ydCB7IEJ1ZmZlciB9IGZyb20gXCIuL2J1ZmZlci50c1wiO1xuaW1wb3J0IHsgZW5jb2RlU3RyLCBoZXhUYWJsZSB9IGZyb20gXCIuL2ludGVybmFsL3F1ZXJ5c3RyaW5nLnRzXCI7XG5cbi8qKlxuICogQWxpYXMgb2YgcXVlcnlzdHJpbmcucGFyc2UoKVxuICogQGxlZ2FjeVxuICovXG5leHBvcnQgY29uc3QgZGVjb2RlID0gcGFyc2U7XG5cbi8qKlxuICogQWxpYXMgb2YgcXVlcnlzdHJpbmcuc3RyaW5naWZ5KClcbiAqIEBsZWdhY3lcbiAqL1xuZXhwb3J0IGNvbnN0IGVuY29kZSA9IHN0cmluZ2lmeTtcblxuLyoqXG4gKiByZXBsYWNlcyBlbmNvZGVVUklDb21wb25lbnQoKVxuICogQHNlZSBodHRwczovL3d3dy5lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzUuMS8jc2VjLTE1LjEuMy40XG4gKi9cbmZ1bmN0aW9uIHFzRXNjYXBlKHN0cjogdW5rbm93bik6IHN0cmluZyB7XG4gIGlmICh0eXBlb2Ygc3RyICE9PSBcInN0cmluZ1wiKSB7XG4gICAgaWYgKHR5cGVvZiBzdHIgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgIHN0ciA9IFN0cmluZyhzdHIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgKz0gXCJcIjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGVuY29kZVN0cihzdHIgYXMgc3RyaW5nLCBub0VzY2FwZSwgaGV4VGFibGUpO1xufVxuXG4vKipcbiAqIFBlcmZvcm1zIFVSTCBwZXJjZW50LWVuY29kaW5nIG9uIHRoZSBnaXZlbiBgc3RyYCBpbiBhIG1hbm5lciB0aGF0IGlzIG9wdGltaXplZCBmb3IgdGhlIHNwZWNpZmljIHJlcXVpcmVtZW50cyBvZiBVUkwgcXVlcnkgc3RyaW5ncy5cbiAqIFVzZWQgYnkgYHF1ZXJ5c3RyaW5nLnN0cmluZ2lmeSgpYCBhbmQgaXMgZ2VuZXJhbGx5IG5vdCBleHBlY3RlZCB0byBiZSB1c2VkIGRpcmVjdGx5LlxuICogSXQgaXMgZXhwb3J0ZWQgcHJpbWFyaWx5IHRvIGFsbG93IGFwcGxpY2F0aW9uIGNvZGUgdG8gcHJvdmlkZSBhIHJlcGxhY2VtZW50IHBlcmNlbnQtZW5jb2RpbmcgaW1wbGVtZW50YXRpb24gaWYgbmVjZXNzYXJ5IGJ5IGFzc2lnbmluZyBgcXVlcnlzdHJpbmcuZXNjYXBlYCB0byBhbiBhbHRlcm5hdGl2ZSBmdW5jdGlvbi5cbiAqIEBsZWdhY3lcbiAqIEBzZWUgVGVzdGVkIGluIGB0ZXN0LXF1ZXJ5c3RyaW5nLWVzY2FwZS5qc2BcbiAqL1xuZXhwb3J0IGNvbnN0IGVzY2FwZSA9IHFzRXNjYXBlO1xuXG5leHBvcnQgaW50ZXJmYWNlIFBhcnNlZFVybFF1ZXJ5IHtcbiAgW2tleTogc3RyaW5nXTogc3RyaW5nIHwgc3RyaW5nW10gfCB1bmRlZmluZWQ7XG59XG5cbmludGVyZmFjZSBQYXJzZU9wdGlvbnMge1xuICAvKiogVGhlIGZ1bmN0aW9uIHRvIHVzZSB3aGVuIGRlY29kaW5nIHBlcmNlbnQtZW5jb2RlZCBjaGFyYWN0ZXJzIGluIHRoZSBxdWVyeSBzdHJpbmcuICovXG4gIGRlY29kZVVSSUNvbXBvbmVudD86IChzdHJpbmc6IHN0cmluZykgPT4gc3RyaW5nO1xuICAvKiogU3BlY2lmaWVzIHRoZSBtYXhpbXVtIG51bWJlciBvZiBrZXlzIHRvIHBhcnNlLiAqL1xuICBtYXhLZXlzPzogbnVtYmVyO1xufVxuXG4vLyBkZW5vLWZtdC1pZ25vcmVcbmNvbnN0IGlzSGV4VGFibGUgPSBuZXcgSW50OEFycmF5KFtcbiAgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgLy8gMCAtIDE1XG4gIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIC8vIDE2IC0gMzFcbiAgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgLy8gMzIgLSA0N1xuICAxLCAxLCAxLCAxLCAxLCAxLCAxLCAxLCAxLCAxLCAwLCAwLCAwLCAwLCAwLCAwLCAvLyA0OCAtIDYzXG4gIDAsIDEsIDEsIDEsIDEsIDEsIDEsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIC8vIDY0IC0gNzlcbiAgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgLy8gODAgLSA5NVxuICAwLCAxLCAxLCAxLCAxLCAxLCAxLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAvLyA5NiAtIDExMVxuICAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAvLyAxMTIgLSAxMjdcbiAgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgLy8gMTI4IC4uLlxuICAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLFxuICAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLFxuICAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLFxuICAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLFxuICAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLFxuICAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLFxuICAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAgLy8gLi4uIDI1NlxuXSk7XG5cbmZ1bmN0aW9uIGNoYXJDb2RlcyhzdHI6IHN0cmluZyk6IG51bWJlcltdIHtcbiAgY29uc3QgcmV0ID0gbmV3IEFycmF5KHN0ci5sZW5ndGgpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHN0ci5sZW5ndGg7ICsraSkge1xuICAgIHJldFtpXSA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuICB9XG4gIHJldHVybiByZXQ7XG59XG5cbmZ1bmN0aW9uIGFkZEtleVZhbChcbiAgb2JqOiBQYXJzZWRVcmxRdWVyeSxcbiAga2V5OiBzdHJpbmcsXG4gIHZhbHVlOiBzdHJpbmcsXG4gIGtleUVuY29kZWQ6IGJvb2xlYW4sXG4gIHZhbEVuY29kZWQ6IGJvb2xlYW4sXG4gIGRlY29kZTogKGVuY29kZWRVUklDb21wb25lbnQ6IHN0cmluZykgPT4gc3RyaW5nLFxuKTogdm9pZCB7XG4gIGlmIChrZXkubGVuZ3RoID4gMCAmJiBrZXlFbmNvZGVkKSB7XG4gICAga2V5ID0gZGVjb2RlKGtleSk7XG4gIH1cbiAgaWYgKHZhbHVlLmxlbmd0aCA+IDAgJiYgdmFsRW5jb2RlZCkge1xuICAgIHZhbHVlID0gZGVjb2RlKHZhbHVlKTtcbiAgfVxuXG4gIGlmIChvYmpba2V5XSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgb2JqW2tleV0gPSB2YWx1ZTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBjdXJWYWx1ZSA9IG9ialtrZXldO1xuICAgIC8vIEEgc2ltcGxlIEFycmF5LXNwZWNpZmljIHByb3BlcnR5IGNoZWNrIGlzIGVub3VnaCBoZXJlIHRvXG4gICAgLy8gZGlzdGluZ3Vpc2ggZnJvbSBhIHN0cmluZyB2YWx1ZSBhbmQgaXMgZmFzdGVyIGFuZCBzdGlsbCBzYWZlXG4gICAgLy8gc2luY2Ugd2UgYXJlIGdlbmVyYXRpbmcgYWxsIG9mIHRoZSB2YWx1ZXMgYmVpbmcgYXNzaWduZWQuXG4gICAgaWYgKChjdXJWYWx1ZSBhcyBzdHJpbmdbXSkucG9wKSB7XG4gICAgICAoY3VyVmFsdWUgYXMgc3RyaW5nW10pW2N1clZhbHVlIS5sZW5ndGhdID0gdmFsdWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIG9ialtrZXldID0gW2N1clZhbHVlIGFzIHN0cmluZywgdmFsdWVdO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIFBhcnNlcyBhIFVSTCBxdWVyeSBzdHJpbmcgaW50byBhIGNvbGxlY3Rpb24gb2Yga2V5IGFuZCB2YWx1ZSBwYWlycy5cbiAqIEBwYXJhbSBzdHIgVGhlIFVSTCBxdWVyeSBzdHJpbmcgdG8gcGFyc2VcbiAqIEBwYXJhbSBzZXAgVGhlIHN1YnN0cmluZyB1c2VkIHRvIGRlbGltaXQga2V5IGFuZCB2YWx1ZSBwYWlycyBpbiB0aGUgcXVlcnkgc3RyaW5nLiBEZWZhdWx0OiAnJicuXG4gKiBAcGFyYW0gZXEgVGhlIHN1YnN0cmluZyB1c2VkIHRvIGRlbGltaXQga2V5cyBhbmQgdmFsdWVzIGluIHRoZSBxdWVyeSBzdHJpbmcuIERlZmF1bHQ6ICc9Jy5cbiAqIEBwYXJhbSBvcHRpb25zIFRoZSBwYXJzZSBvcHRpb25zXG4gKiBAcGFyYW0gb3B0aW9ucy5kZWNvZGVVUklDb21wb25lbnQgVGhlIGZ1bmN0aW9uIHRvIHVzZSB3aGVuIGRlY29kaW5nIHBlcmNlbnQtZW5jb2RlZCBjaGFyYWN0ZXJzIGluIHRoZSBxdWVyeSBzdHJpbmcuIERlZmF1bHQ6IGBxdWVyeXN0cmluZy51bmVzY2FwZSgpYC5cbiAqIEBwYXJhbSBvcHRpb25zLm1heEtleXMgU3BlY2lmaWVzIHRoZSBtYXhpbXVtIG51bWJlciBvZiBrZXlzIHRvIHBhcnNlLiBTcGVjaWZ5IGAwYCB0byByZW1vdmUga2V5IGNvdW50aW5nIGxpbWl0YXRpb25zLiBEZWZhdWx0OiBgMTAwMGAuXG4gKiBAbGVnYWN5XG4gKiBAc2VlIFRlc3RlZCBpbiB0ZXN0LXF1ZXJ5c3RyaW5nLmpzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZShcbiAgc3RyOiBzdHJpbmcsXG4gIHNlcCA9IFwiJlwiLFxuICBlcSA9IFwiPVwiLFxuICB7IGRlY29kZVVSSUNvbXBvbmVudCA9IHVuZXNjYXBlLCBtYXhLZXlzID0gMTAwMCB9OiBQYXJzZU9wdGlvbnMgPSB7fSxcbik6IFBhcnNlZFVybFF1ZXJ5IHtcbiAgY29uc3Qgb2JqOiBQYXJzZWRVcmxRdWVyeSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cbiAgaWYgKHR5cGVvZiBzdHIgIT09IFwic3RyaW5nXCIgfHwgc3RyLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBvYmo7XG4gIH1cblxuICBjb25zdCBzZXBDb2RlcyA9ICghc2VwID8gWzM4XSAvKiAmICovIDogY2hhckNvZGVzKFN0cmluZyhzZXApKSk7XG4gIGNvbnN0IGVxQ29kZXMgPSAoIWVxID8gWzYxXSAvKiA9ICovIDogY2hhckNvZGVzKFN0cmluZyhlcSkpKTtcbiAgY29uc3Qgc2VwTGVuID0gc2VwQ29kZXMubGVuZ3RoO1xuICBjb25zdCBlcUxlbiA9IGVxQ29kZXMubGVuZ3RoO1xuXG4gIGxldCBwYWlycyA9IDEwMDA7XG4gIGlmICh0eXBlb2YgbWF4S2V5cyA9PT0gXCJudW1iZXJcIikge1xuICAgIC8vIC0xIGlzIHVzZWQgaW4gcGxhY2Ugb2YgYSB2YWx1ZSBsaWtlIEluZmluaXR5IGZvciBtZWFuaW5nXG4gICAgLy8gXCJ1bmxpbWl0ZWQgcGFpcnNcIiBiZWNhdXNlIG9mIGFkZGl0aW9uYWwgY2hlY2tzIFY4IChhdCBsZWFzdCBhcyBvZiB2NS40KVxuICAgIC8vIGhhcyB0byBkbyB3aGVuIHVzaW5nIHZhcmlhYmxlcyB0aGF0IGNvbnRhaW4gdmFsdWVzIGxpa2UgSW5maW5pdHkuIFNpbmNlXG4gICAgLy8gYHBhaXJzYCBpcyBhbHdheXMgZGVjcmVtZW50ZWQgYW5kIGNoZWNrZWQgZXhwbGljaXRseSBmb3IgMCwgLTEgd29ya3NcbiAgICAvLyBlZmZlY3RpdmVseSB0aGUgc2FtZSBhcyBJbmZpbml0eSwgd2hpbGUgcHJvdmlkaW5nIGEgc2lnbmlmaWNhbnRcbiAgICAvLyBwZXJmb3JtYW5jZSBib29zdC5cbiAgICBwYWlycyA9IG1heEtleXMgPiAwID8gbWF4S2V5cyA6IC0xO1xuICB9XG5cbiAgbGV0IGRlY29kZSA9IHVuZXNjYXBlO1xuICBpZiAoZGVjb2RlVVJJQ29tcG9uZW50KSB7XG4gICAgZGVjb2RlID0gZGVjb2RlVVJJQ29tcG9uZW50O1xuICB9XG4gIGNvbnN0IGN1c3RvbURlY29kZSA9IChkZWNvZGUgIT09IHVuZXNjYXBlKTtcblxuICBsZXQgbGFzdFBvcyA9IDA7XG4gIGxldCBzZXBJZHggPSAwO1xuICBsZXQgZXFJZHggPSAwO1xuICBsZXQga2V5ID0gXCJcIjtcbiAgbGV0IHZhbHVlID0gXCJcIjtcbiAgbGV0IGtleUVuY29kZWQgPSBjdXN0b21EZWNvZGU7XG4gIGxldCB2YWxFbmNvZGVkID0gY3VzdG9tRGVjb2RlO1xuICBjb25zdCBwbHVzQ2hhciA9IChjdXN0b21EZWNvZGUgPyBcIiUyMFwiIDogXCIgXCIpO1xuICBsZXQgZW5jb2RlQ2hlY2sgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHN0ci5sZW5ndGg7ICsraSkge1xuICAgIGNvbnN0IGNvZGUgPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgIC8vIFRyeSBtYXRjaGluZyBrZXkvdmFsdWUgcGFpciBzZXBhcmF0b3IgKGUuZy4gJyYnKVxuICAgIGlmIChjb2RlID09PSBzZXBDb2Rlc1tzZXBJZHhdKSB7XG4gICAgICBpZiAoKytzZXBJZHggPT09IHNlcExlbikge1xuICAgICAgICAvLyBLZXkvdmFsdWUgcGFpciBzZXBhcmF0b3IgbWF0Y2ghXG4gICAgICAgIGNvbnN0IGVuZCA9IGkgLSBzZXBJZHggKyAxO1xuICAgICAgICBpZiAoZXFJZHggPCBlcUxlbikge1xuICAgICAgICAgIC8vIFdlIGRpZG4ndCBmaW5kIHRoZSAoZW50aXJlKSBrZXkvdmFsdWUgc2VwYXJhdG9yXG4gICAgICAgICAgaWYgKGxhc3RQb3MgPCBlbmQpIHtcbiAgICAgICAgICAgIC8vIFRyZWF0IHRoZSBzdWJzdHJpbmcgYXMgcGFydCBvZiB0aGUga2V5IGluc3RlYWQgb2YgdGhlIHZhbHVlXG4gICAgICAgICAgICBrZXkgKz0gc3RyLnNsaWNlKGxhc3RQb3MsIGVuZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChrZXkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAvLyBXZSBzYXcgYW4gZW1wdHkgc3Vic3RyaW5nIGJldHdlZW4gc2VwYXJhdG9yc1xuICAgICAgICAgICAgaWYgKC0tcGFpcnMgPT09IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9iajtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgICAgIHNlcElkeCA9IGVxSWR4ID0gMDtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChsYXN0UG9zIDwgZW5kKSB7XG4gICAgICAgICAgdmFsdWUgKz0gc3RyLnNsaWNlKGxhc3RQb3MsIGVuZCk7XG4gICAgICAgIH1cblxuICAgICAgICBhZGRLZXlWYWwob2JqLCBrZXksIHZhbHVlLCBrZXlFbmNvZGVkLCB2YWxFbmNvZGVkLCBkZWNvZGUpO1xuXG4gICAgICAgIGlmICgtLXBhaXJzID09PSAwKSB7XG4gICAgICAgICAgcmV0dXJuIG9iajtcbiAgICAgICAgfVxuICAgICAgICBrZXkgPSB2YWx1ZSA9IFwiXCI7XG4gICAgICAgIGVuY29kZUNoZWNrID0gMDtcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBzZXBJZHggPSBlcUlkeCA9IDA7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHNlcElkeCA9IDA7XG4gICAgICAvLyBUcnkgbWF0Y2hpbmcga2V5L3ZhbHVlIHNlcGFyYXRvciAoZS5nLiAnPScpIGlmIHdlIGhhdmVuJ3QgYWxyZWFkeVxuICAgICAgaWYgKGVxSWR4IDwgZXFMZW4pIHtcbiAgICAgICAgaWYgKGNvZGUgPT09IGVxQ29kZXNbZXFJZHhdKSB7XG4gICAgICAgICAgaWYgKCsrZXFJZHggPT09IGVxTGVuKSB7XG4gICAgICAgICAgICAvLyBLZXkvdmFsdWUgc2VwYXJhdG9yIG1hdGNoIVxuICAgICAgICAgICAgY29uc3QgZW5kID0gaSAtIGVxSWR4ICsgMTtcbiAgICAgICAgICAgIGlmIChsYXN0UG9zIDwgZW5kKSB7XG4gICAgICAgICAgICAgIGtleSArPSBzdHIuc2xpY2UobGFzdFBvcywgZW5kKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVuY29kZUNoZWNrID0gMDtcbiAgICAgICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZXFJZHggPSAwO1xuICAgICAgICAgIGlmICgha2V5RW5jb2RlZCkge1xuICAgICAgICAgICAgLy8gVHJ5IHRvIG1hdGNoIGFuICh2YWxpZCkgZW5jb2RlZCBieXRlIG9uY2UgdG8gbWluaW1pemUgdW5uZWNlc3NhcnlcbiAgICAgICAgICAgIC8vIGNhbGxzIHRvIHN0cmluZyBkZWNvZGluZyBmdW5jdGlvbnNcbiAgICAgICAgICAgIGlmIChjb2RlID09PSAzNyAvKiAlICovKSB7XG4gICAgICAgICAgICAgIGVuY29kZUNoZWNrID0gMTtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGVuY29kZUNoZWNrID4gMCkge1xuICAgICAgICAgICAgICBpZiAoaXNIZXhUYWJsZVtjb2RlXSA9PT0gMSkge1xuICAgICAgICAgICAgICAgIGlmICgrK2VuY29kZUNoZWNrID09PSAzKSB7XG4gICAgICAgICAgICAgICAgICBrZXlFbmNvZGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5jb2RlQ2hlY2sgPSAwO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChjb2RlID09PSA0MyAvKiArICovKSB7XG4gICAgICAgICAgaWYgKGxhc3RQb3MgPCBpKSB7XG4gICAgICAgICAgICBrZXkgKz0gc3RyLnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBrZXkgKz0gcGx1c0NoYXI7XG4gICAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoY29kZSA9PT0gNDMgLyogKyAqLykge1xuICAgICAgICBpZiAobGFzdFBvcyA8IGkpIHtcbiAgICAgICAgICB2YWx1ZSArPSBzdHIuc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsdWUgKz0gcGx1c0NoYXI7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgIH0gZWxzZSBpZiAoIXZhbEVuY29kZWQpIHtcbiAgICAgICAgLy8gVHJ5IHRvIG1hdGNoIGFuICh2YWxpZCkgZW5jb2RlZCBieXRlIChvbmNlKSB0byBtaW5pbWl6ZSB1bm5lY2Vzc2FyeVxuICAgICAgICAvLyBjYWxscyB0byBzdHJpbmcgZGVjb2RpbmcgZnVuY3Rpb25zXG4gICAgICAgIGlmIChjb2RlID09PSAzNyAvKiAlICovKSB7XG4gICAgICAgICAgZW5jb2RlQ2hlY2sgPSAxO1xuICAgICAgICB9IGVsc2UgaWYgKGVuY29kZUNoZWNrID4gMCkge1xuICAgICAgICAgIGlmIChpc0hleFRhYmxlW2NvZGVdID09PSAxKSB7XG4gICAgICAgICAgICBpZiAoKytlbmNvZGVDaGVjayA9PT0gMykge1xuICAgICAgICAgICAgICB2YWxFbmNvZGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZW5jb2RlQ2hlY2sgPSAwO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIERlYWwgd2l0aCBhbnkgbGVmdG92ZXIga2V5IG9yIHZhbHVlIGRhdGFcbiAgaWYgKGxhc3RQb3MgPCBzdHIubGVuZ3RoKSB7XG4gICAgaWYgKGVxSWR4IDwgZXFMZW4pIHtcbiAgICAgIGtleSArPSBzdHIuc2xpY2UobGFzdFBvcyk7XG4gICAgfSBlbHNlIGlmIChzZXBJZHggPCBzZXBMZW4pIHtcbiAgICAgIHZhbHVlICs9IHN0ci5zbGljZShsYXN0UG9zKTtcbiAgICB9XG4gIH0gZWxzZSBpZiAoZXFJZHggPT09IDAgJiYga2V5Lmxlbmd0aCA9PT0gMCkge1xuICAgIC8vIFdlIGVuZGVkIG9uIGFuIGVtcHR5IHN1YnN0cmluZ1xuICAgIHJldHVybiBvYmo7XG4gIH1cblxuICBhZGRLZXlWYWwob2JqLCBrZXksIHZhbHVlLCBrZXlFbmNvZGVkLCB2YWxFbmNvZGVkLCBkZWNvZGUpO1xuXG4gIHJldHVybiBvYmo7XG59XG5cbmludGVyZmFjZSBTdHJpbmdpZnlPcHRpb25zIHtcbiAgLyoqIFRoZSBmdW5jdGlvbiB0byB1c2Ugd2hlbiBjb252ZXJ0aW5nIFVSTC11bnNhZmUgY2hhcmFjdGVycyB0byBwZXJjZW50LWVuY29kaW5nIGluIHRoZSBxdWVyeSBzdHJpbmcuICovXG4gIGVuY29kZVVSSUNvbXBvbmVudDogKHN0cmluZzogc3RyaW5nKSA9PiBzdHJpbmc7XG59XG5cbi8qKlxuICogVGhlc2UgY2hhcmFjdGVycyBkbyBub3QgbmVlZCBlc2NhcGluZyB3aGVuIGdlbmVyYXRpbmcgcXVlcnkgc3RyaW5nczpcbiAqICEgLSAuIF8gflxuICogJyAoICkgKlxuICogZGlnaXRzXG4gKiBhbHBoYSAodXBwZXJjYXNlKVxuICogYWxwaGEgKGxvd2VyY2FzZSlcbiAqL1xuLy8gZGVuby1mbXQtaWdub3JlXG5jb25zdCBub0VzY2FwZSA9IG5ldyBJbnQ4QXJyYXkoW1xuICAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAvLyAwIC0gMTVcbiAgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgLy8gMTYgLSAzMVxuICAwLCAxLCAwLCAwLCAwLCAwLCAwLCAxLCAxLCAxLCAxLCAwLCAwLCAxLCAxLCAwLCAvLyAzMiAtIDQ3XG4gIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDAsIDAsIDAsIDAsIDAsIDAsIC8vIDQ4IC0gNjNcbiAgMCwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgMSwgLy8gNjQgLSA3OVxuICAxLCAxLCAxLCAxLCAxLCAxLCAxLCAxLCAxLCAxLCAxLCAwLCAwLCAwLCAwLCAxLCAvLyA4MCAtIDk1XG4gIDAsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIC8vIDk2IC0gMTExXG4gIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDAsIDAsIDAsIDEsIDAsICAvLyAxMTIgLSAxMjdcbl0pO1xuXG4vLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuZnVuY3Rpb24gc3RyaW5naWZ5UHJpbWl0aXZlKHY6IGFueSk6IHN0cmluZyB7XG4gIGlmICh0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIikge1xuICAgIHJldHVybiB2O1xuICB9XG4gIGlmICh0eXBlb2YgdiA9PT0gXCJudW1iZXJcIiAmJiBpc0Zpbml0ZSh2KSkge1xuICAgIHJldHVybiBcIlwiICsgdjtcbiAgfVxuICBpZiAodHlwZW9mIHYgPT09IFwiYmlnaW50XCIpIHtcbiAgICByZXR1cm4gXCJcIiArIHY7XG4gIH1cbiAgaWYgKHR5cGVvZiB2ID09PSBcImJvb2xlYW5cIikge1xuICAgIHJldHVybiB2ID8gXCJ0cnVlXCIgOiBcImZhbHNlXCI7XG4gIH1cbiAgcmV0dXJuIFwiXCI7XG59XG5cbmZ1bmN0aW9uIGVuY29kZVN0cmluZ2lmaWVkQ3VzdG9tKFxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICB2OiBhbnksXG4gIGVuY29kZTogKHN0cmluZzogc3RyaW5nKSA9PiBzdHJpbmcsXG4pOiBzdHJpbmcge1xuICByZXR1cm4gZW5jb2RlKHN0cmluZ2lmeVByaW1pdGl2ZSh2KSk7XG59XG5cbi8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG5mdW5jdGlvbiBlbmNvZGVTdHJpbmdpZmllZCh2OiBhbnksIGVuY29kZTogKHN0cmluZzogc3RyaW5nKSA9PiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIpIHtcbiAgICByZXR1cm4gKHYubGVuZ3RoID8gZW5jb2RlKHYpIDogXCJcIik7XG4gIH1cbiAgaWYgKHR5cGVvZiB2ID09PSBcIm51bWJlclwiICYmIGlzRmluaXRlKHYpKSB7XG4gICAgLy8gVmFsdWVzID49IDFlMjEgYXV0b21hdGljYWxseSBzd2l0Y2ggdG8gc2NpZW50aWZpYyBub3RhdGlvbiB3aGljaCByZXF1aXJlc1xuICAgIC8vIGVzY2FwaW5nIGR1ZSB0byB0aGUgaW5jbHVzaW9uIG9mIGEgJysnIGluIHRoZSBvdXRwdXRcbiAgICByZXR1cm4gKE1hdGguYWJzKHYpIDwgMWUyMSA/IFwiXCIgKyB2IDogZW5jb2RlKFwiXCIgKyB2KSk7XG4gIH1cbiAgaWYgKHR5cGVvZiB2ID09PSBcImJpZ2ludFwiKSB7XG4gICAgcmV0dXJuIFwiXCIgKyB2O1xuICB9XG4gIGlmICh0eXBlb2YgdiA9PT0gXCJib29sZWFuXCIpIHtcbiAgICByZXR1cm4gdiA/IFwidHJ1ZVwiIDogXCJmYWxzZVwiO1xuICB9XG4gIHJldHVybiBcIlwiO1xufVxuXG4vKipcbiAqIFByb2R1Y2VzIGEgVVJMIHF1ZXJ5IHN0cmluZyBmcm9tIGEgZ2l2ZW4gb2JqIGJ5IGl0ZXJhdGluZyB0aHJvdWdoIHRoZSBvYmplY3QncyBcIm93biBwcm9wZXJ0aWVzXCIuXG4gKiBAcGFyYW0gb2JqIFRoZSBvYmplY3QgdG8gc2VyaWFsaXplIGludG8gYSBVUkwgcXVlcnkgc3RyaW5nLlxuICogQHBhcmFtIHNlcCBUaGUgc3Vic3RyaW5nIHVzZWQgdG8gZGVsaW1pdCBrZXkgYW5kIHZhbHVlIHBhaXJzIGluIHRoZSBxdWVyeSBzdHJpbmcuIERlZmF1bHQ6ICcmJy5cbiAqIEBwYXJhbSBlcSBUaGUgc3Vic3RyaW5nIHVzZWQgdG8gZGVsaW1pdCBrZXlzIGFuZCB2YWx1ZXMgaW4gdGhlIHF1ZXJ5IHN0cmluZy4gRGVmYXVsdDogJz0nLlxuICogQHBhcmFtIG9wdGlvbnMgVGhlIHN0cmluZ2lmeSBvcHRpb25zXG4gKiBAcGFyYW0gb3B0aW9ucy5lbmNvZGVVUklDb21wb25lbnQgVGhlIGZ1bmN0aW9uIHRvIHVzZSB3aGVuIGNvbnZlcnRpbmcgVVJMLXVuc2FmZSBjaGFyYWN0ZXJzIHRvIHBlcmNlbnQtZW5jb2RpbmcgaW4gdGhlIHF1ZXJ5IHN0cmluZy4gRGVmYXVsdDogYHF1ZXJ5c3RyaW5nLmVzY2FwZSgpYC5cbiAqIEBsZWdhY3lcbiAqIEBzZWUgVGVzdGVkIGluIGB0ZXN0LXF1ZXJ5c3RyaW5nLmpzYFxuICovXG5leHBvcnQgZnVuY3Rpb24gc3RyaW5naWZ5KFxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBvYmo6IFJlY29yZDxzdHJpbmcsIGFueT4sXG4gIHNlcD86IHN0cmluZyxcbiAgZXE/OiBzdHJpbmcsXG4gIG9wdGlvbnM/OiBTdHJpbmdpZnlPcHRpb25zLFxuKTogc3RyaW5nIHtcbiAgc2VwIHx8PSBcIiZcIjtcbiAgZXEgfHw9IFwiPVwiO1xuICBjb25zdCBlbmNvZGUgPSBvcHRpb25zID8gb3B0aW9ucy5lbmNvZGVVUklDb21wb25lbnQgOiBxc0VzY2FwZTtcbiAgY29uc3QgY29udmVydCA9IG9wdGlvbnMgPyBlbmNvZGVTdHJpbmdpZmllZEN1c3RvbSA6IGVuY29kZVN0cmluZ2lmaWVkO1xuXG4gIGlmIChvYmogIT09IG51bGwgJiYgdHlwZW9mIG9iaiA9PT0gXCJvYmplY3RcIikge1xuICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhvYmopO1xuICAgIGNvbnN0IGxlbiA9IGtleXMubGVuZ3RoO1xuICAgIGxldCBmaWVsZHMgPSBcIlwiO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuOyArK2kpIHtcbiAgICAgIGNvbnN0IGsgPSBrZXlzW2ldO1xuICAgICAgY29uc3QgdiA9IG9ialtrXTtcbiAgICAgIGxldCBrcyA9IGNvbnZlcnQoaywgZW5jb2RlKTtcbiAgICAgIGtzICs9IGVxO1xuXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheSh2KSkge1xuICAgICAgICBjb25zdCB2bGVuID0gdi5sZW5ndGg7XG4gICAgICAgIGlmICh2bGVuID09PSAwKSBjb250aW51ZTtcbiAgICAgICAgaWYgKGZpZWxkcykge1xuICAgICAgICAgIGZpZWxkcyArPSBzZXA7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCB2bGVuOyArK2opIHtcbiAgICAgICAgICBpZiAoaikge1xuICAgICAgICAgICAgZmllbGRzICs9IHNlcDtcbiAgICAgICAgICB9XG4gICAgICAgICAgZmllbGRzICs9IGtzO1xuICAgICAgICAgIGZpZWxkcyArPSBjb252ZXJ0KHZbal0sIGVuY29kZSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZHMpIHtcbiAgICAgICAgICBmaWVsZHMgKz0gc2VwO1xuICAgICAgICB9XG4gICAgICAgIGZpZWxkcyArPSBrcztcbiAgICAgICAgZmllbGRzICs9IGNvbnZlcnQodiwgZW5jb2RlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZpZWxkcztcbiAgfVxuICByZXR1cm4gXCJcIjtcbn1cblxuLy8gZGVuby1mbXQtaWdub3JlXG5jb25zdCB1bmhleFRhYmxlID0gbmV3IEludDhBcnJheShbXG4gIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAvLyAwIC0gMTVcbiAgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC8vIDE2IC0gMzFcbiAgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC8vIDMyIC0gNDdcbiAgKzAsICsxLCArMiwgKzMsICs0LCArNSwgKzYsICs3LCArOCwgKzksIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC8vIDQ4IC0gNjNcbiAgLTEsIDEwLCAxMSwgMTIsIDEzLCAxNCwgMTUsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC8vIDY0IC0gNzlcbiAgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC8vIDgwIC0gOTVcbiAgLTEsIDEwLCAxMSwgMTIsIDEzLCAxNCwgMTUsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC8vIDk2IC0gMTExXG4gIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAvLyAxMTIgLSAxMjdcbiAgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC8vIDEyOCAuLi5cbiAgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsXG4gIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLFxuICAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSxcbiAgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsXG4gIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLFxuICAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSxcbiAgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC8vIC4uLiAyNTVcbl0pO1xuXG4vKipcbiAqIEEgc2FmZSBmYXN0IGFsdGVybmF0aXZlIHRvIGRlY29kZVVSSUNvbXBvbmVudFxuICovXG5leHBvcnQgZnVuY3Rpb24gdW5lc2NhcGVCdWZmZXIoczogc3RyaW5nLCBkZWNvZGVTcGFjZXMgPSBmYWxzZSk6IEJ1ZmZlciB7XG4gIGNvbnN0IG91dCA9IG5ldyBCdWZmZXIocy5sZW5ndGgpO1xuICBsZXQgaW5kZXggPSAwO1xuICBsZXQgb3V0SW5kZXggPSAwO1xuICBsZXQgY3VycmVudENoYXI7XG4gIGxldCBuZXh0Q2hhcjtcbiAgbGV0IGhleEhpZ2g7XG4gIGxldCBoZXhMb3c7XG4gIGNvbnN0IG1heExlbmd0aCA9IHMubGVuZ3RoIC0gMjtcbiAgLy8gRmxhZyB0byBrbm93IGlmIHNvbWUgaGV4IGNoYXJzIGhhdmUgYmVlbiBkZWNvZGVkXG4gIGxldCBoYXNIZXggPSBmYWxzZTtcbiAgd2hpbGUgKGluZGV4IDwgcy5sZW5ndGgpIHtcbiAgICBjdXJyZW50Q2hhciA9IHMuY2hhckNvZGVBdChpbmRleCk7XG4gICAgaWYgKGN1cnJlbnRDaGFyID09PSA0MyAvKiAnKycgKi8gJiYgZGVjb2RlU3BhY2VzKSB7XG4gICAgICBvdXRbb3V0SW5kZXgrK10gPSAzMjsgLy8gJyAnXG4gICAgICBpbmRleCsrO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChjdXJyZW50Q2hhciA9PT0gMzcgLyogJyUnICovICYmIGluZGV4IDwgbWF4TGVuZ3RoKSB7XG4gICAgICBjdXJyZW50Q2hhciA9IHMuY2hhckNvZGVBdCgrK2luZGV4KTtcbiAgICAgIGhleEhpZ2ggPSB1bmhleFRhYmxlW2N1cnJlbnRDaGFyXTtcbiAgICAgIGlmICghKGhleEhpZ2ggPj0gMCkpIHtcbiAgICAgICAgb3V0W291dEluZGV4KytdID0gMzc7IC8vICclJ1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5leHRDaGFyID0gcy5jaGFyQ29kZUF0KCsraW5kZXgpO1xuICAgICAgICBoZXhMb3cgPSB1bmhleFRhYmxlW25leHRDaGFyXTtcbiAgICAgICAgaWYgKCEoaGV4TG93ID49IDApKSB7XG4gICAgICAgICAgb3V0W291dEluZGV4KytdID0gMzc7IC8vICclJ1xuICAgICAgICAgIGluZGV4LS07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaGFzSGV4ID0gdHJ1ZTtcbiAgICAgICAgICBjdXJyZW50Q2hhciA9IGhleEhpZ2ggKiAxNiArIGhleExvdztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBvdXRbb3V0SW5kZXgrK10gPSBjdXJyZW50Q2hhcjtcbiAgICBpbmRleCsrO1xuICB9XG4gIHJldHVybiBoYXNIZXggPyBvdXQuc2xpY2UoMCwgb3V0SW5kZXgpIDogb3V0O1xufVxuXG5mdW5jdGlvbiBxc1VuZXNjYXBlKHM6IHN0cmluZyk6IHN0cmluZyB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChzKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHVuZXNjYXBlQnVmZmVyKHMpLnRvU3RyaW5nKCk7XG4gIH1cbn1cblxuLyoqXG4gKiBQZXJmb3JtcyBkZWNvZGluZyBvZiBVUkwgcGVyY2VudC1lbmNvZGVkIGNoYXJhY3RlcnMgb24gdGhlIGdpdmVuIGBzdHJgLlxuICogVXNlZCBieSBgcXVlcnlzdHJpbmcucGFyc2UoKWAgYW5kIGlzIGdlbmVyYWxseSBub3QgZXhwZWN0ZWQgdG8gYmUgdXNlZCBkaXJlY3RseS5cbiAqIEl0IGlzIGV4cG9ydGVkIHByaW1hcmlseSB0byBhbGxvdyBhcHBsaWNhdGlvbiBjb2RlIHRvIHByb3ZpZGUgYSByZXBsYWNlbWVudCBkZWNvZGluZyBpbXBsZW1lbnRhdGlvbiBpZiBuZWNlc3NhcnkgYnkgYXNzaWduaW5nIGBxdWVyeXN0cmluZy51bmVzY2FwZWAgdG8gYW4gYWx0ZXJuYXRpdmUgZnVuY3Rpb24uXG4gKiBAbGVnYWN5XG4gKiBAc2VlIFRlc3RlZCBpbiBgdGVzdC1xdWVyeXN0cmluZy1lc2NhcGUuanNgXG4gKi9cbmV4cG9ydCBjb25zdCB1bmVzY2FwZSA9IHFzVW5lc2NhcGU7XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgcGFyc2UsXG4gIHN0cmluZ2lmeSxcbiAgZGVjb2RlLFxuICBlbmNvZGUsXG4gIHVuZXNjYXBlLFxuICBlc2NhcGUsXG4gIHVuZXNjYXBlQnVmZmVyLFxufTtcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwwRUFBMEU7QUFDMUUsU0FBUyxNQUFNLFFBQVEsY0FBYztBQUNyQyxTQUFTLFNBQVMsRUFBRSxRQUFRLFFBQVEsNEJBQTRCO0FBRWhFOzs7Q0FHQyxHQUNELE9BQU8sTUFBTSxTQUFTLE1BQU07QUFFNUI7OztDQUdDLEdBQ0QsT0FBTyxNQUFNLFNBQVMsVUFBVTtBQUVoQzs7O0NBR0MsR0FDRCxTQUFTLFNBQVMsR0FBWTtFQUM1QixJQUFJLE9BQU8sUUFBUSxVQUFVO0lBQzNCLElBQUksT0FBTyxRQUFRLFVBQVU7TUFDM0IsTUFBTSxPQUFPO0lBQ2YsT0FBTztNQUNMLE9BQU87SUFDVDtFQUNGO0VBQ0EsT0FBTyxVQUFVLEtBQWUsVUFBVTtBQUM1QztBQUVBOzs7Ozs7Q0FNQyxHQUNELE9BQU8sTUFBTSxTQUFTLFNBQVM7QUFhL0Isa0JBQWtCO0FBQ2xCLE1BQU0sYUFBYSxJQUFJLFVBQVU7RUFDL0I7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFDN0M7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFDN0M7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFDN0M7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFDN0M7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFDN0M7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFDN0M7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFDN0M7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFDN0M7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFDN0M7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFDN0M7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFDN0M7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFDN0M7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFDN0M7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VBQUc7RUFBRztFQUFHO0VB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RyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFDN0QsQ0FBQztFQUFHO0VBQUk7RUFBSTtFQUFJO0VBQUk7RUFBSTtFQUFJLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUM3RCxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQzdELENBQUM7RUFBRztFQUFJO0VBQUk7RUFBSTtFQUFJO0VBQUk7RUFBSSxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFDN0QsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUM3RCxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQzdELENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFDN0QsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUM3RCxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQzdELENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFDN0QsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUM3RCxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQzdELENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7RUFBRyxDQUFDO0VBQUcsQ0FBQztFQUFHLENBQUM7Q0FDOUQ7QUFFRDs7Q0FFQyxHQUNELE9BQU8sU0FBUyxlQUFlLENBQVMsRUFBRSxlQUFlLEtBQUs7RUFDNUQsTUFBTSxNQUFNLElBQUksT0FBTyxFQUFFLE1BQU07RUFDL0IsSUFBSSxRQUFRO0VBQ1osSUFBSSxXQUFXO0VBQ2YsSUFBSTtFQUNKLElBQUk7RUFDSixJQUFJO0VBQ0osSUFBSTtFQUNKLE1BQU0sWUFBWSxFQUFFLE1BQU0sR0FBRztFQUM3QixtREFBbUQ7RUFDbkQsSUFBSSxTQUFTO0VBQ2IsTUFBTyxRQUFRLEVBQUUsTUFBTSxDQUFFO0lBQ3ZCLGNBQWMsRUFBRSxVQUFVLENBQUM7SUFDM0IsSUFBSSxnQkFBZ0IsR0FBRyxPQUFPLE9BQU0sY0FBYztNQUNoRCxHQUFHLENBQUMsV0FBVyxHQUFHLElBQUksTUFBTTtNQUM1QjtNQUNBO0lBQ0Y7SUFDQSxJQUFJLGdCQUFnQixHQUFHLE9BQU8sT0FBTSxRQUFRLFdBQVc7TUFDckQsY0FBYyxFQUFFLFVBQVUsQ0FBQyxFQUFFO01BQzdCLFVBQVUsVUFBVSxDQUFDLFlBQVk7TUFDakMsSUFBSSxDQUFDLENBQUMsV0FBVyxDQUFDLEdBQUc7UUFDbkIsR0FBRyxDQUFDLFdBQVcsR0FBRyxJQUFJLE1BQU07UUFDNUI7TUFDRixPQUFPO1FBQ0wsV0FBVyxFQUFFLFVBQVUsQ0FBQyxFQUFFO1FBQzFCLFNBQVMsVUFBVSxDQUFDLFNBQVM7UUFDN0IsSUFBSSxDQUFDLENBQUMsVUFBVSxDQUFDLEdBQUc7VUFDbEIsR0FBRyxDQUFDLFdBQVcsR0FBRyxJQUFJLE1BQU07VUFDNUI7UUFDRixPQUFPO1VBQ0wsU0FBUztVQUNULGNBQWMsVUFBVSxLQUFLO1FBQy9CO01BQ0Y7SUFDRjtJQUNBLEdBQUcsQ0FBQyxXQUFXLEdBQUc7SUFDbEI7RUFDRjtFQUNBLE9BQU8sU0FBUyxJQUFJLEtBQUssQ0FBQyxHQUFHLFlBQVk7QUFDM0M7QUFFQSxTQUFTLFdBQVcsQ0FBUztFQUMzQixJQUFJO0lBQ0YsT0FBTyxtQkFBbUI7RUFDNUIsRUFBRSxPQUFNO0lBQ04sT0FBTyxlQUFlLEdBQUcsUUFBUTtFQUNuQztBQUNGO0FBRUE7Ozs7OztDQU1DLEdBQ0QsT0FBTyxNQUFNLFdBQVcsV0FBVztBQUVuQyxlQUFlO0VBQ2I7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7QUFDRixFQUFFIn0=