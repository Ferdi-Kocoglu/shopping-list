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
import { ERR_INVALID_ARG_TYPE, ERR_INVALID_ARG_VALUE, ERR_INVALID_FILE_URL_HOST, ERR_INVALID_FILE_URL_PATH, ERR_INVALID_URL_SCHEME } from "./internal/errors.ts";
import { CHAR_0, CHAR_9, CHAR_AT, CHAR_BACKWARD_SLASH, CHAR_CARRIAGE_RETURN, CHAR_CIRCUMFLEX_ACCENT, CHAR_DOT, CHAR_DOUBLE_QUOTE, CHAR_FORM_FEED, CHAR_FORWARD_SLASH, CHAR_GRAVE_ACCENT, CHAR_HASH, CHAR_HYPHEN_MINUS, CHAR_LEFT_ANGLE_BRACKET, CHAR_LEFT_CURLY_BRACKET, CHAR_LEFT_SQUARE_BRACKET, CHAR_LINE_FEED, CHAR_LOWERCASE_A, CHAR_LOWERCASE_Z, CHAR_NO_BREAK_SPACE, CHAR_PERCENT, CHAR_PLUS, CHAR_QUESTION_MARK, CHAR_RIGHT_ANGLE_BRACKET, CHAR_RIGHT_CURLY_BRACKET, CHAR_RIGHT_SQUARE_BRACKET, CHAR_SEMICOLON, CHAR_SINGLE_QUOTE, CHAR_SPACE, CHAR_TAB, CHAR_UNDERSCORE, CHAR_UPPERCASE_A, CHAR_UPPERCASE_Z, CHAR_VERTICAL_LINE, CHAR_ZERO_WIDTH_NOBREAK_SPACE } from "../path/_constants.ts";
import * as path from "./path.ts";
import { toASCII } from "./internal/idna.ts";
import { isWindows, osType } from "../_util/os.ts";
import { encodeStr, hexTable } from "./internal/querystring.ts";
import querystring from "./querystring.ts";
const forwardSlashRegEx = /\//g;
const percentRegEx = /%/g;
const backslashRegEx = /\\/g;
const newlineRegEx = /\n/g;
const carriageReturnRegEx = /\r/g;
const tabRegEx = /\t/g;
// Reference: RFC 3986, RFC 1808, RFC 2396
// define these here so at least they only have to be
// compiled once on the first module load.
const protocolPattern = /^[a-z0-9.+-]+:/i;
const portPattern = /:[0-9]*$/;
const hostPattern = /^\/\/[^@/]+@[^@/]+/;
// Special case for a simple path URL
const simplePathPattern = /^(\/\/?(?!\/)[^?\s]*)(\?[^\s]*)?$/;
// Protocols that can allow "unsafe" and "unwise" chars.
const unsafeProtocol = new Set([
  "javascript",
  "javascript:"
]);
// Protocols that never have a hostname.
const hostlessProtocol = new Set([
  "javascript",
  "javascript:"
]);
// Protocols that always contain a // bit.
const slashedProtocol = new Set([
  "http",
  "http:",
  "https",
  "https:",
  "ftp",
  "ftp:",
  "gopher",
  "gopher:",
  "file",
  "file:",
  "ws",
  "ws:",
  "wss",
  "wss:"
]);
const hostnameMaxLen = 255;
// These characters do not need escaping:
// ! - . _ ~
// ' ( ) * :
// digits
// alpha (uppercase)
// alpha (lowercase)
// deno-fmt-ignore
const noEscapeAuth = new Int8Array([
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
  1,
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
const _url = URL;
export { _url as URL };
// Legacy URL API
export class Url {
  protocol;
  slashes;
  auth;
  host;
  port;
  hostname;
  hash;
  search;
  query;
  pathname;
  path;
  href;
  constructor(){
    this.protocol = null;
    this.slashes = null;
    this.auth = null;
    this.host = null;
    this.port = null;
    this.hostname = null;
    this.hash = null;
    this.search = null;
    this.query = null;
    this.pathname = null;
    this.path = null;
    this.href = null;
  }
  parseHost() {
    let host = this.host || "";
    let port = portPattern.exec(host);
    if (port) {
      port = port[0];
      if (port !== ":") {
        this.port = port.slice(1);
      }
      host = host.slice(0, host.length - port.length);
    }
    if (host) this.hostname = host;
  }
  resolve(relative) {
    return this.resolveObject(parse(relative, false, true)).format();
  }
  resolveObject(relative) {
    if (typeof relative === "string") {
      const rel = new Url();
      rel.urlParse(relative, false, true);
      relative = rel;
    }
    const result = new Url();
    const tkeys = Object.keys(this);
    for(let tk = 0; tk < tkeys.length; tk++){
      const tkey = tkeys[tk];
      result[tkey] = this[tkey];
    }
    // Hash is always overridden, no matter what.
    // even href="" will remove it.
    result.hash = relative.hash;
    // If the relative url is empty, then there's nothing left to do here.
    if (relative.href === "") {
      result.href = result.format();
      return result;
    }
    // Hrefs like //foo/bar always cut to the protocol.
    if (relative.slashes && !relative.protocol) {
      // Take everything except the protocol from relative
      const rkeys = Object.keys(relative);
      for(let rk = 0; rk < rkeys.length; rk++){
        const rkey = rkeys[rk];
        if (rkey !== "protocol") result[rkey] = relative[rkey];
      }
      // urlParse appends trailing / to urls like http://www.example.com
      if (result.protocol && slashedProtocol.has(result.protocol) && result.hostname && !result.pathname) {
        result.path = result.pathname = "/";
      }
      result.href = result.format();
      return result;
    }
    if (relative.protocol && relative.protocol !== result.protocol) {
      // If it's a known url protocol, then changing
      // the protocol does weird things
      // first, if it's not file:, then we MUST have a host,
      // and if there was a path
      // to begin with, then we MUST have a path.
      // if it is file:, then the host is dropped,
      // because that's known to be hostless.
      // anything else is assumed to be absolute.
      if (!slashedProtocol.has(relative.protocol)) {
        const keys = Object.keys(relative);
        for(let v = 0; v < keys.length; v++){
          const k = keys[v];
          result[k] = relative[k];
        }
        result.href = result.format();
        return result;
      }
      result.protocol = relative.protocol;
      if (!relative.host && !/^file:?$/.test(relative.protocol) && !hostlessProtocol.has(relative.protocol)) {
        const relPath = (relative.pathname || "").split("/");
        while(relPath.length && !(relative.host = relPath.shift() || null));
        if (!relative.host) relative.host = "";
        if (!relative.hostname) relative.hostname = "";
        if (relPath[0] !== "") relPath.unshift("");
        if (relPath.length < 2) relPath.unshift("");
        result.pathname = relPath.join("/");
      } else {
        result.pathname = relative.pathname;
      }
      result.search = relative.search;
      result.query = relative.query;
      result.host = relative.host || "";
      result.auth = relative.auth;
      result.hostname = relative.hostname || relative.host;
      result.port = relative.port;
      // To support http.request
      if (result.pathname || result.search) {
        const p = result.pathname || "";
        const s = result.search || "";
        result.path = p + s;
      }
      result.slashes = result.slashes || relative.slashes;
      result.href = result.format();
      return result;
    }
    const isSourceAbs = result.pathname && result.pathname.charAt(0) === "/";
    const isRelAbs = relative.host || relative.pathname && relative.pathname.charAt(0) === "/";
    let mustEndAbs = isRelAbs || isSourceAbs || result.host && relative.pathname;
    const removeAllDots = mustEndAbs;
    let srcPath = result.pathname && result.pathname.split("/") || [];
    const relPath = relative.pathname && relative.pathname.split("/") || [];
    const noLeadingSlashes = result.protocol && !slashedProtocol.has(result.protocol);
    // If the url is a non-slashed url, then relative
    // links like ../.. should be able
    // to crawl up to the hostname, as well.  This is strange.
    // result.protocol has already been set by now.
    // Later on, put the first path part into the host field.
    if (noLeadingSlashes) {
      result.hostname = "";
      result.port = null;
      if (result.host) {
        if (srcPath[0] === "") srcPath[0] = result.host;
        else srcPath.unshift(result.host);
      }
      result.host = "";
      if (relative.protocol) {
        relative.hostname = null;
        relative.port = null;
        result.auth = null;
        if (relative.host) {
          if (relPath[0] === "") relPath[0] = relative.host;
          else relPath.unshift(relative.host);
        }
        relative.host = null;
      }
      mustEndAbs = mustEndAbs && (relPath[0] === "" || srcPath[0] === "");
    }
    if (isRelAbs) {
      // it's absolute.
      if (relative.host || relative.host === "") {
        if (result.host !== relative.host) result.auth = null;
        result.host = relative.host;
        result.port = relative.port;
      }
      if (relative.hostname || relative.hostname === "") {
        if (result.hostname !== relative.hostname) result.auth = null;
        result.hostname = relative.hostname;
      }
      result.search = relative.search;
      result.query = relative.query;
      srcPath = relPath;
    // Fall through to the dot-handling below.
    } else if (relPath.length) {
      // it's relative
      // throw away the existing file, and take the new path instead.
      if (!srcPath) srcPath = [];
      srcPath.pop();
      srcPath = srcPath.concat(relPath);
      result.search = relative.search;
      result.query = relative.query;
    } else if (relative.search !== null && relative.search !== undefined) {
      // Just pull out the search.
      // like href='?foo'.
      // Put this after the other two cases because it simplifies the booleans
      if (noLeadingSlashes) {
        result.hostname = result.host = srcPath.shift() || null;
        // Occasionally the auth can get stuck only in host.
        // This especially happens in cases like
        // url.resolveObject('mailto:local1@domain1', 'local2@domain2')
        const authInHost = result.host && result.host.indexOf("@") > 0 && result.host.split("@");
        if (authInHost) {
          result.auth = authInHost.shift() || null;
          result.host = result.hostname = authInHost.shift() || null;
        }
      }
      result.search = relative.search;
      result.query = relative.query;
      // To support http.request
      if (result.pathname !== null || result.search !== null) {
        result.path = (result.pathname ? result.pathname : "") + (result.search ? result.search : "");
      }
      result.href = result.format();
      return result;
    }
    if (!srcPath.length) {
      // No path at all. All other things were already handled above.
      result.pathname = null;
      // To support http.request
      if (result.search) {
        result.path = "/" + result.search;
      } else {
        result.path = null;
      }
      result.href = result.format();
      return result;
    }
    // If a url ENDs in . or .., then it must get a trailing slash.
    // however, if it ends in anything else non-slashy,
    // then it must NOT get a trailing slash.
    let last = srcPath.slice(-1)[0];
    const hasTrailingSlash = (result.host || relative.host || srcPath.length > 1) && (last === "." || last === "..") || last === "";
    // Strip single dots, resolve double dots to parent dir
    // if the path tries to go above the root, `up` ends up > 0
    let up = 0;
    for(let i = srcPath.length - 1; i >= 0; i--){
      last = srcPath[i];
      if (last === ".") {
        srcPath.splice(i, 1);
      } else if (last === "..") {
        srcPath.splice(i, 1);
        up++;
      } else if (up) {
        srcPath.splice(i, 1);
        up--;
      }
    }
    // If the path is allowed to go above the root, restore leading ..s
    if (!mustEndAbs && !removeAllDots) {
      while(up--){
        srcPath.unshift("..");
      }
    }
    if (mustEndAbs && srcPath[0] !== "" && (!srcPath[0] || srcPath[0].charAt(0) !== "/")) {
      srcPath.unshift("");
    }
    if (hasTrailingSlash && srcPath.join("/").substr(-1) !== "/") {
      srcPath.push("");
    }
    const isAbsolute = srcPath[0] === "" || srcPath[0] && srcPath[0].charAt(0) === "/";
    // put the host back
    if (noLeadingSlashes) {
      result.hostname = result.host = isAbsolute ? "" : srcPath.length ? srcPath.shift() || null : "";
      // Occasionally the auth can get stuck only in host.
      // This especially happens in cases like
      // url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      const authInHost = result.host && result.host.indexOf("@") > 0 ? result.host.split("@") : false;
      if (authInHost) {
        result.auth = authInHost.shift() || null;
        result.host = result.hostname = authInHost.shift() || null;
      }
    }
    mustEndAbs = mustEndAbs || result.host && srcPath.length;
    if (mustEndAbs && !isAbsolute) {
      srcPath.unshift("");
    }
    if (!srcPath.length) {
      result.pathname = null;
      result.path = null;
    } else {
      result.pathname = srcPath.join("/");
    }
    // To support request.http
    if (result.pathname !== null || result.search !== null) {
      result.path = (result.pathname ? result.pathname : "") + (result.search ? result.search : "");
    }
    result.auth = relative.auth || result.auth;
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }
  format() {
    let auth = this.auth || "";
    if (auth) {
      auth = encodeStr(auth, noEscapeAuth, hexTable);
      auth += "@";
    }
    let protocol = this.protocol || "";
    let pathname = this.pathname || "";
    let hash = this.hash || "";
    let host = "";
    let query = "";
    if (this.host) {
      host = auth + this.host;
    } else if (this.hostname) {
      host = auth + (this.hostname.includes(":") && !isIpv6Hostname(this.hostname) ? "[" + this.hostname + "]" : this.hostname);
      if (this.port) {
        host += ":" + this.port;
      }
    }
    if (this.query !== null && typeof this.query === "object") {
      query = querystring.stringify(this.query);
    }
    let search = this.search || query && "?" + query || "";
    if (protocol && protocol.charCodeAt(protocol.length - 1) !== 58 /* : */ ) {
      protocol += ":";
    }
    let newPathname = "";
    let lastPos = 0;
    for(let i = 0; i < pathname.length; ++i){
      switch(pathname.charCodeAt(i)){
        case CHAR_HASH:
          if (i - lastPos > 0) {
            newPathname += pathname.slice(lastPos, i);
          }
          newPathname += "%23";
          lastPos = i + 1;
          break;
        case CHAR_QUESTION_MARK:
          if (i - lastPos > 0) {
            newPathname += pathname.slice(lastPos, i);
          }
          newPathname += "%3F";
          lastPos = i + 1;
          break;
      }
    }
    if (lastPos > 0) {
      if (lastPos !== pathname.length) {
        pathname = newPathname + pathname.slice(lastPos);
      } else pathname = newPathname;
    }
    // Only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
    // unless they had them to begin with.
    if (this.slashes || slashedProtocol.has(protocol)) {
      if (this.slashes || host) {
        if (pathname && pathname.charCodeAt(0) !== CHAR_FORWARD_SLASH) {
          pathname = "/" + pathname;
        }
        host = "//" + host;
      } else if (protocol.length >= 4 && protocol.charCodeAt(0) === 102 /* f */  && protocol.charCodeAt(1) === 105 /* i */  && protocol.charCodeAt(2) === 108 /* l */  && protocol.charCodeAt(3) === 101 /* e */ ) {
        host = "//";
      }
    }
    search = search.replace(/#/g, "%23");
    if (hash && hash.charCodeAt(0) !== CHAR_HASH) {
      hash = "#" + hash;
    }
    if (search && search.charCodeAt(0) !== CHAR_QUESTION_MARK) {
      search = "?" + search;
    }
    return protocol + host + pathname + search + hash;
  }
  urlParse(url, parseQueryString, slashesDenoteHost) {
    // Copy chrome, IE, opera backslash-handling behavior.
    // Back slashes before the query string get converted to forward slashes
    // See: https://code.google.com/p/chromium/issues/detail?id=25916
    let hasHash = false;
    let start = -1;
    let end = -1;
    let rest = "";
    let lastPos = 0;
    for(let i = 0, inWs = false, split = false; i < url.length; ++i){
      const code = url.charCodeAt(i);
      // Find first and last non-whitespace characters for trimming
      const isWs = code === CHAR_SPACE || code === CHAR_TAB || code === CHAR_CARRIAGE_RETURN || code === CHAR_LINE_FEED || code === CHAR_FORM_FEED || code === CHAR_NO_BREAK_SPACE || code === CHAR_ZERO_WIDTH_NOBREAK_SPACE;
      if (start === -1) {
        if (isWs) continue;
        lastPos = start = i;
      } else if (inWs) {
        if (!isWs) {
          end = -1;
          inWs = false;
        }
      } else if (isWs) {
        end = i;
        inWs = true;
      }
      // Only convert backslashes while we haven't seen a split character
      if (!split) {
        switch(code){
          case CHAR_HASH:
            hasHash = true;
          // Fall through
          case CHAR_QUESTION_MARK:
            split = true;
            break;
          case CHAR_BACKWARD_SLASH:
            if (i - lastPos > 0) rest += url.slice(lastPos, i);
            rest += "/";
            lastPos = i + 1;
            break;
        }
      } else if (!hasHash && code === CHAR_HASH) {
        hasHash = true;
      }
    }
    // Check if string was non-empty (including strings with only whitespace)
    if (start !== -1) {
      if (lastPos === start) {
        // We didn't convert any backslashes
        if (end === -1) {
          if (start === 0) rest = url;
          else rest = url.slice(start);
        } else {
          rest = url.slice(start, end);
        }
      } else if (end === -1 && lastPos < url.length) {
        // We converted some backslashes and have only part of the entire string
        rest += url.slice(lastPos);
      } else if (end !== -1 && lastPos < end) {
        // We converted some backslashes and have only part of the entire string
        rest += url.slice(lastPos, end);
      }
    }
    if (!slashesDenoteHost && !hasHash) {
      // Try fast path regexp
      const simplePath = simplePathPattern.exec(rest);
      if (simplePath) {
        this.path = rest;
        this.href = rest;
        this.pathname = simplePath[1];
        if (simplePath[2]) {
          this.search = simplePath[2];
          if (parseQueryString) {
            this.query = querystring.parse(this.search.slice(1));
          } else {
            this.query = this.search.slice(1);
          }
        } else if (parseQueryString) {
          this.search = null;
          this.query = Object.create(null);
        }
        return this;
      }
    }
    let proto = protocolPattern.exec(rest);
    let lowerProto = "";
    if (proto) {
      proto = proto[0];
      lowerProto = proto.toLowerCase();
      this.protocol = lowerProto;
      rest = rest.slice(proto.length);
    }
    // Figure out if it's got a host
    // user@server is *always* interpreted as a hostname, and url
    // resolution will treat //foo/bar as host=foo,path=bar because that's
    // how the browser resolves relative URLs.
    let slashes;
    if (slashesDenoteHost || proto || hostPattern.test(rest)) {
      slashes = rest.charCodeAt(0) === CHAR_FORWARD_SLASH && rest.charCodeAt(1) === CHAR_FORWARD_SLASH;
      if (slashes && !(proto && hostlessProtocol.has(lowerProto))) {
        rest = rest.slice(2);
        this.slashes = true;
      }
    }
    if (!hostlessProtocol.has(lowerProto) && (slashes || proto && !slashedProtocol.has(proto))) {
      // there's a hostname.
      // the first instance of /, ?, ;, or # ends the host.
      //
      // If there is an @ in the hostname, then non-host chars *are* allowed
      // to the left of the last @ sign, unless some host-ending character
      // comes *before* the @-sign.
      // URLs are obnoxious.
      //
      // ex:
      // http://a@b@c/ => user:a@b host:c
      // http://a@b?@c => user:a host:b path:/?@c
      let hostEnd = -1;
      let atSign = -1;
      let nonHost = -1;
      for(let i = 0; i < rest.length; ++i){
        switch(rest.charCodeAt(i)){
          case CHAR_TAB:
          case CHAR_LINE_FEED:
          case CHAR_CARRIAGE_RETURN:
          case CHAR_SPACE:
          case CHAR_DOUBLE_QUOTE:
          case CHAR_PERCENT:
          case CHAR_SINGLE_QUOTE:
          case CHAR_SEMICOLON:
          case CHAR_LEFT_ANGLE_BRACKET:
          case CHAR_RIGHT_ANGLE_BRACKET:
          case CHAR_BACKWARD_SLASH:
          case CHAR_CIRCUMFLEX_ACCENT:
          case CHAR_GRAVE_ACCENT:
          case CHAR_LEFT_CURLY_BRACKET:
          case CHAR_VERTICAL_LINE:
          case CHAR_RIGHT_CURLY_BRACKET:
            // Characters that are never ever allowed in a hostname from RFC 2396
            if (nonHost === -1) nonHost = i;
            break;
          case CHAR_HASH:
          case CHAR_FORWARD_SLASH:
          case CHAR_QUESTION_MARK:
            // Find the first instance of any host-ending characters
            if (nonHost === -1) nonHost = i;
            hostEnd = i;
            break;
          case CHAR_AT:
            // At this point, either we have an explicit point where the
            // auth portion cannot go past, or the last @ char is the decider.
            atSign = i;
            nonHost = -1;
            break;
        }
        if (hostEnd !== -1) break;
      }
      start = 0;
      if (atSign !== -1) {
        this.auth = decodeURIComponent(rest.slice(0, atSign));
        start = atSign + 1;
      }
      if (nonHost === -1) {
        this.host = rest.slice(start);
        rest = "";
      } else {
        this.host = rest.slice(start, nonHost);
        rest = rest.slice(nonHost);
      }
      // pull out port.
      this.parseHost();
      // We've indicated that there is a hostname,
      // so even if it's empty, it has to be present.
      if (typeof this.hostname !== "string") this.hostname = "";
      const hostname = this.hostname;
      // If hostname begins with [ and ends with ]
      // assume that it's an IPv6 address.
      const ipv6Hostname = isIpv6Hostname(hostname);
      // validate a little.
      if (!ipv6Hostname) {
        rest = getHostname(this, rest, hostname);
      }
      if (this.hostname.length > hostnameMaxLen) {
        this.hostname = "";
      } else {
        // Hostnames are always lower case.
        this.hostname = this.hostname.toLowerCase();
      }
      if (!ipv6Hostname) {
        // IDNA Support: Returns a punycoded representation of "domain".
        // It only converts parts of the domain name that
        // have non-ASCII characters, i.e. it doesn't matter if
        // you call it with a domain that already is ASCII-only.
        // Use lenient mode (`true`) to try to support even non-compliant
        // URLs.
        this.hostname = toASCII(this.hostname);
      }
      const p = this.port ? ":" + this.port : "";
      const h = this.hostname || "";
      this.host = h + p;
      // strip [ and ] from the hostname
      // the host field still retains them, though
      if (ipv6Hostname) {
        this.hostname = this.hostname.slice(1, -1);
        if (rest[0] !== "/") {
          rest = "/" + rest;
        }
      }
    }
    // Now rest is set to the post-host stuff.
    // Chop off any delim chars.
    if (!unsafeProtocol.has(lowerProto)) {
      // First, make 100% sure that any "autoEscape" chars get
      // escaped, even if encodeURIComponent doesn't think they
      // need to be.
      rest = autoEscapeStr(rest);
    }
    let questionIdx = -1;
    let hashIdx = -1;
    for(let i = 0; i < rest.length; ++i){
      const code = rest.charCodeAt(i);
      if (code === CHAR_HASH) {
        this.hash = rest.slice(i);
        hashIdx = i;
        break;
      } else if (code === CHAR_QUESTION_MARK && questionIdx === -1) {
        questionIdx = i;
      }
    }
    if (questionIdx !== -1) {
      if (hashIdx === -1) {
        this.search = rest.slice(questionIdx);
        this.query = rest.slice(questionIdx + 1);
      } else {
        this.search = rest.slice(questionIdx, hashIdx);
        this.query = rest.slice(questionIdx + 1, hashIdx);
      }
      if (parseQueryString) {
        this.query = querystring.parse(this.query);
      }
    } else if (parseQueryString) {
      // No query string, but parseQueryString still requested
      this.search = null;
      this.query = Object.create(null);
    }
    const useQuestionIdx = questionIdx !== -1 && (hashIdx === -1 || questionIdx < hashIdx);
    const firstIdx = useQuestionIdx ? questionIdx : hashIdx;
    if (firstIdx === -1) {
      if (rest.length > 0) this.pathname = rest;
    } else if (firstIdx > 0) {
      this.pathname = rest.slice(0, firstIdx);
    }
    if (slashedProtocol.has(lowerProto) && this.hostname && !this.pathname) {
      this.pathname = "/";
    }
    // To support http.request
    if (this.pathname || this.search) {
      const p = this.pathname || "";
      const s = this.search || "";
      this.path = p + s;
    }
    // Finally, reconstruct the href based on what has been validated.
    this.href = this.format();
    return this;
  }
}
export function format(urlObject, options) {
  if (urlObject instanceof URL) {
    return formatWhatwg(urlObject, options);
  }
  if (typeof urlObject === "string") {
    urlObject = parse(urlObject, true, false);
  }
  return urlObject.format();
}
/**
 * The URL object has both a `toString()` method and `href` property that return string serializations of the URL.
 * These are not, however, customizable in any way.
 * This method allows for basic customization of the output.
 * @see Tested in `parallel/test-url-format-whatwg.js`.
 * @param urlObject
 * @param options
 * @param options.auth `true` if the serialized URL string should include the username and password, `false` otherwise. **Default**: `true`.
 * @param options.fragment `true` if the serialized URL string should include the fragment, `false` otherwise. **Default**: `true`.
 * @param options.search `true` if the serialized URL string should include the search query, **Default**: `true`.
 * @param options.unicode `true` if Unicode characters appearing in the host component of the URL string should be encoded directly as opposed to being Punycode encoded. **Default**: `false`.
 * @returns a customizable serialization of a URL `String` representation of a `WHATWG URL` object.
 */ function formatWhatwg(urlObject, options) {
  if (typeof urlObject === "string") {
    urlObject = new URL(urlObject);
  }
  if (options) {
    if (typeof options !== "object") {
      throw new ERR_INVALID_ARG_TYPE("options", "object", options);
    }
  }
  options = {
    auth: true,
    fragment: true,
    search: true,
    unicode: false,
    ...options
  };
  let ret = urlObject.protocol;
  if (urlObject.host !== null) {
    ret += "//";
    const hasUsername = !!urlObject.username;
    const hasPassword = !!urlObject.password;
    if (options.auth && (hasUsername || hasPassword)) {
      if (hasUsername) {
        ret += urlObject.username;
      }
      if (hasPassword) {
        ret += `:${urlObject.password}`;
      }
      ret += "@";
    }
    // TODO(wafuwfu13): Support unicode option
    // ret += options.unicode ?
    //   domainToUnicode(urlObject.host) : urlObject.host;
    ret += urlObject.host;
    if (urlObject.port) {
      ret += `:${urlObject.port}`;
    }
  }
  ret += urlObject.pathname;
  if (options.search && urlObject.search) {
    ret += urlObject.search;
  }
  if (options.fragment && urlObject.hash) {
    ret += urlObject.hash;
  }
  return ret;
}
function isIpv6Hostname(hostname) {
  return hostname.charCodeAt(0) === CHAR_LEFT_SQUARE_BRACKET && hostname.charCodeAt(hostname.length - 1) === CHAR_RIGHT_SQUARE_BRACKET;
}
function getHostname(self, rest, hostname) {
  for(let i = 0; i < hostname.length; ++i){
    const code = hostname.charCodeAt(i);
    const isValid = code >= CHAR_LOWERCASE_A && code <= CHAR_LOWERCASE_Z || code === CHAR_DOT || code >= CHAR_UPPERCASE_A && code <= CHAR_UPPERCASE_Z || code >= CHAR_0 && code <= CHAR_9 || code === CHAR_HYPHEN_MINUS || code === CHAR_PLUS || code === CHAR_UNDERSCORE || code > 127;
    // Invalid host character
    if (!isValid) {
      self.hostname = hostname.slice(0, i);
      return `/${hostname.slice(i)}${rest}`;
    }
  }
  return rest;
}
// Escaped characters. Use empty strings to fill up unused entries.
// Using Array is faster than Object/Map
// deno-fmt-ignore
const escapedCodes = [
  /* 0 - 9 */ "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "%09",
  /* 10 - 19 */ "%0A",
  "",
  "",
  "%0D",
  "",
  "",
  "",
  "",
  "",
  "",
  /* 20 - 29 */ "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  /* 30 - 39 */ "",
  "",
  "%20",
  "",
  "%22",
  "",
  "",
  "",
  "",
  "%27",
  /* 40 - 49 */ "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  /* 50 - 59 */ "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  /* 60 - 69 */ "%3C",
  "",
  "%3E",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  /* 70 - 79 */ "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  /* 80 - 89 */ "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  /* 90 - 99 */ "",
  "",
  "%5C",
  "",
  "%5E",
  "",
  "%60",
  "",
  "",
  "",
  /* 100 - 109 */ "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  /* 110 - 119 */ "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  /* 120 - 125 */ "",
  "",
  "",
  "%7B",
  "%7C",
  "%7D"
];
// Automatically escape all delimiters and unwise characters from RFC 2396.
// Also escape single quotes in case of an XSS attack.
// Return the escaped string.
function autoEscapeStr(rest) {
  let escaped = "";
  let lastEscapedPos = 0;
  for(let i = 0; i < rest.length; ++i){
    // `escaped` contains substring up to the last escaped character.
    const escapedChar = escapedCodes[rest.charCodeAt(i)];
    if (escapedChar) {
      // Concat if there are ordinary characters in the middle.
      if (i > lastEscapedPos) {
        escaped += rest.slice(lastEscapedPos, i);
      }
      escaped += escapedChar;
      lastEscapedPos = i + 1;
    }
  }
  if (lastEscapedPos === 0) {
    // Nothing has been escaped.
    return rest;
  }
  // There are ordinary characters at the end.
  if (lastEscapedPos < rest.length) {
    escaped += rest.slice(lastEscapedPos);
  }
  return escaped;
}
/**
 * The url.urlParse() method takes a URL string, parses it, and returns a URL object.
 *
 * @see Tested in `parallel/test-url-parse-format.js`.
 * @param url The URL string to parse.
 * @param parseQueryString If `true`, the query property will always be set to an object returned by the querystring module's parse() method. If false,
 * the query property on the returned URL object will be an unparsed, undecoded string. Default: false.
 * @param slashesDenoteHost If `true`, the first token after the literal string // and preceding the next / will be interpreted as the host
 */ export function parse(url, parseQueryString, slashesDenoteHost) {
  if (url instanceof Url) return url;
  const urlObject = new Url();
  urlObject.urlParse(url, parseQueryString, slashesDenoteHost);
  return urlObject;
}
/** The url.resolve() method resolves a target URL relative to a base URL in a manner similar to that of a Web browser resolving an anchor tag HREF.
 * @see https://nodejs.org/api/url.html#urlresolvefrom-to
 * @legacy
 */ export function resolve(from, to) {
  return parse(from, false, true).resolve(to);
}
export function resolveObject(source, relative) {
  if (!source) return relative;
  return parse(source, false, true).resolveObject(relative);
}
/**
 * This function ensures the correct decodings of percent-encoded characters as well as ensuring a cross-platform valid absolute path string.
 * @see Tested in `parallel/test-fileurltopath.js`.
 * @param path The file URL string or URL object to convert to a path.
 * @returns The fully-resolved platform-specific Node.js file path.
 */ export function fileURLToPath(path) {
  if (typeof path === "string") path = new URL(path);
  else if (!(path instanceof URL)) {
    throw new ERR_INVALID_ARG_TYPE("path", [
      "string",
      "URL"
    ], path);
  }
  if (path.protocol !== "file:") {
    throw new ERR_INVALID_URL_SCHEME("file");
  }
  return isWindows ? getPathFromURLWin(path) : getPathFromURLPosix(path);
}
function getPathFromURLWin(url) {
  const hostname = url.hostname;
  let pathname = url.pathname;
  for(let n = 0; n < pathname.length; n++){
    if (pathname[n] === "%") {
      const third = pathname.codePointAt(n + 2) | 0x20;
      if (pathname[n + 1] === "2" && third === 102 || // 2f 2F /
      pathname[n + 1] === "5" && third === 99 // 5c 5C \
      ) {
        throw new ERR_INVALID_FILE_URL_PATH("must not include encoded \\ or / characters");
      }
    }
  }
  pathname = pathname.replace(forwardSlashRegEx, "\\");
  pathname = decodeURIComponent(pathname);
  if (hostname !== "") {
    // TODO(bartlomieju): add support for punycode encodings
    return `\\\\${hostname}${pathname}`;
  } else {
    // Otherwise, it's a local path that requires a drive letter
    const letter = pathname.codePointAt(1) | 0x20;
    const sep = pathname[2];
    if (letter < CHAR_LOWERCASE_A || letter > CHAR_LOWERCASE_Z || // a..z A..Z
    sep !== ":") {
      throw new ERR_INVALID_FILE_URL_PATH("must be absolute");
    }
    return pathname.slice(1);
  }
}
function getPathFromURLPosix(url) {
  if (url.hostname !== "") {
    throw new ERR_INVALID_FILE_URL_HOST(osType);
  }
  const pathname = url.pathname;
  for(let n = 0; n < pathname.length; n++){
    if (pathname[n] === "%") {
      const third = pathname.codePointAt(n + 2) | 0x20;
      if (pathname[n + 1] === "2" && third === 102) {
        throw new ERR_INVALID_FILE_URL_PATH("must not include encoded / characters");
      }
    }
  }
  return decodeURIComponent(pathname);
}
/**
 *  The following characters are percent-encoded when converting from file path
 *  to URL:
 *  - %: The percent character is the only character not encoded by the
 *       `pathname` setter.
 *  - \: Backslash is encoded on non-windows platforms since it's a valid
 *       character but the `pathname` setters replaces it by a forward slash.
 *  - LF: The newline character is stripped out by the `pathname` setter.
 *        (See whatwg/url#419)
 *  - CR: The carriage return character is also stripped out by the `pathname`
 *        setter.
 *  - TAB: The tab character is also stripped out by the `pathname` setter.
 */ function encodePathChars(filepath) {
  if (filepath.includes("%")) {
    filepath = filepath.replace(percentRegEx, "%25");
  }
  // In posix, backslash is a valid character in paths:
  if (!isWindows && filepath.includes("\\")) {
    filepath = filepath.replace(backslashRegEx, "%5C");
  }
  if (filepath.includes("\n")) {
    filepath = filepath.replace(newlineRegEx, "%0A");
  }
  if (filepath.includes("\r")) {
    filepath = filepath.replace(carriageReturnRegEx, "%0D");
  }
  if (filepath.includes("\t")) {
    filepath = filepath.replace(tabRegEx, "%09");
  }
  return filepath;
}
/**
 * This function ensures that `filepath` is resolved absolutely, and that the URL control characters are correctly encoded when converting into a File URL.
 * @see Tested in `parallel/test-url-pathtofileurl.js`.
 * @param filepath The file path string to convert to a file URL.
 * @returns The file URL object.
 */ export function pathToFileURL(filepath) {
  const outURL = new URL("file://");
  if (isWindows && filepath.startsWith("\\\\")) {
    // UNC path format: \\server\share\resource
    const paths = filepath.split("\\");
    if (paths.length <= 3) {
      throw new ERR_INVALID_ARG_VALUE("filepath", filepath, "Missing UNC resource path");
    }
    const hostname = paths[2];
    if (hostname.length === 0) {
      throw new ERR_INVALID_ARG_VALUE("filepath", filepath, "Empty UNC servername");
    }
    // TODO(wafuwafu13): To be `outURL.hostname = domainToASCII(hostname)` once `domainToASCII` are implemented
    outURL.hostname = hostname;
    outURL.pathname = encodePathChars(paths.slice(3).join("/"));
  } else {
    let resolved = path.resolve(filepath);
    // path.resolve strips trailing slashes so we must add them back
    const filePathLast = filepath.charCodeAt(filepath.length - 1);
    if ((filePathLast === CHAR_FORWARD_SLASH || isWindows && filePathLast === CHAR_BACKWARD_SLASH) && resolved[resolved.length - 1] !== path.sep) {
      resolved += "/";
    }
    outURL.pathname = encodePathChars(resolved);
  }
  return outURL;
}
/**
 * This utility function converts a URL object into an ordinary options object as expected by the `http.request()` and `https.request()` APIs.
 * @see Tested in `parallel/test-url-urltooptions.js`.
 * @param url The `WHATWG URL` object to convert to an options object.
 * @returns HttpOptions
 * @returns HttpOptions.protocol Protocol to use.
 * @returns HttpOptions.hostname A domain name or IP address of the server to issue the request to.
 * @returns HttpOptions.hash The fragment portion of the URL.
 * @returns HttpOptions.search The serialized query portion of the URL.
 * @returns HttpOptions.pathname The path portion of the URL.
 * @returns HttpOptions.path Request path. Should include query string if any. E.G. `'/index.html?page=12'`. An exception is thrown when the request path contains illegal characters. Currently, only spaces are rejected but that may change in the future.
 * @returns HttpOptions.href The serialized URL.
 * @returns HttpOptions.port Port of remote server.
 * @returns HttpOptions.auth Basic authentication i.e. `'user:password'` to compute an Authorization header.
 */ function urlToHttpOptions(url) {
  const options = {
    protocol: url.protocol,
    hostname: typeof url.hostname === "string" && url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname,
    hash: url.hash,
    search: url.search,
    pathname: url.pathname,
    path: `${url.pathname || ""}${url.search || ""}`,
    href: url.href
  };
  if (url.port !== "") {
    options.port = Number(url.port);
  }
  if (url.username || url.password) {
    options.auth = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
  }
  return options;
}
export default {
  parse,
  format,
  resolve,
  resolveObject,
  fileURLToPath,
  pathToFileURL,
  urlToHttpOptions,
  Url,
  URL,
  URLSearchParams
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL25vZGUvdXJsLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjIgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG4vLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuaW1wb3J0IHtcbiAgRVJSX0lOVkFMSURfQVJHX1RZUEUsXG4gIEVSUl9JTlZBTElEX0FSR19WQUxVRSxcbiAgRVJSX0lOVkFMSURfRklMRV9VUkxfSE9TVCxcbiAgRVJSX0lOVkFMSURfRklMRV9VUkxfUEFUSCxcbiAgRVJSX0lOVkFMSURfVVJMX1NDSEVNRSxcbn0gZnJvbSBcIi4vaW50ZXJuYWwvZXJyb3JzLnRzXCI7XG5pbXBvcnQge1xuICBDSEFSXzAsXG4gIENIQVJfOSxcbiAgQ0hBUl9BVCxcbiAgQ0hBUl9CQUNLV0FSRF9TTEFTSCxcbiAgQ0hBUl9DQVJSSUFHRV9SRVRVUk4sXG4gIENIQVJfQ0lSQ1VNRkxFWF9BQ0NFTlQsXG4gIENIQVJfRE9ULFxuICBDSEFSX0RPVUJMRV9RVU9URSxcbiAgQ0hBUl9GT1JNX0ZFRUQsXG4gIENIQVJfRk9SV0FSRF9TTEFTSCxcbiAgQ0hBUl9HUkFWRV9BQ0NFTlQsXG4gIENIQVJfSEFTSCxcbiAgQ0hBUl9IWVBIRU5fTUlOVVMsXG4gIENIQVJfTEVGVF9BTkdMRV9CUkFDS0VULFxuICBDSEFSX0xFRlRfQ1VSTFlfQlJBQ0tFVCxcbiAgQ0hBUl9MRUZUX1NRVUFSRV9CUkFDS0VULFxuICBDSEFSX0xJTkVfRkVFRCxcbiAgQ0hBUl9MT1dFUkNBU0VfQSxcbiAgQ0hBUl9MT1dFUkNBU0VfWixcbiAgQ0hBUl9OT19CUkVBS19TUEFDRSxcbiAgQ0hBUl9QRVJDRU5ULFxuICBDSEFSX1BMVVMsXG4gIENIQVJfUVVFU1RJT05fTUFSSyxcbiAgQ0hBUl9SSUdIVF9BTkdMRV9CUkFDS0VULFxuICBDSEFSX1JJR0hUX0NVUkxZX0JSQUNLRVQsXG4gIENIQVJfUklHSFRfU1FVQVJFX0JSQUNLRVQsXG4gIENIQVJfU0VNSUNPTE9OLFxuICBDSEFSX1NJTkdMRV9RVU9URSxcbiAgQ0hBUl9TUEFDRSxcbiAgQ0hBUl9UQUIsXG4gIENIQVJfVU5ERVJTQ09SRSxcbiAgQ0hBUl9VUFBFUkNBU0VfQSxcbiAgQ0hBUl9VUFBFUkNBU0VfWixcbiAgQ0hBUl9WRVJUSUNBTF9MSU5FLFxuICBDSEFSX1pFUk9fV0lEVEhfTk9CUkVBS19TUEFDRSxcbn0gZnJvbSBcIi4uL3BhdGgvX2NvbnN0YW50cy50c1wiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwiLi9wYXRoLnRzXCI7XG5pbXBvcnQgeyB0b0FTQ0lJIH0gZnJvbSBcIi4vaW50ZXJuYWwvaWRuYS50c1wiO1xuaW1wb3J0IHsgaXNXaW5kb3dzLCBvc1R5cGUgfSBmcm9tIFwiLi4vX3V0aWwvb3MudHNcIjtcbmltcG9ydCB7IGVuY29kZVN0ciwgaGV4VGFibGUgfSBmcm9tIFwiLi9pbnRlcm5hbC9xdWVyeXN0cmluZy50c1wiO1xuaW1wb3J0IHF1ZXJ5c3RyaW5nIGZyb20gXCIuL3F1ZXJ5c3RyaW5nLnRzXCI7XG5pbXBvcnQgdHlwZSB7IFBhcnNlZFVybFF1ZXJ5IH0gZnJvbSBcIi4vcXVlcnlzdHJpbmcudHNcIjtcblxuY29uc3QgZm9yd2FyZFNsYXNoUmVnRXggPSAvXFwvL2c7XG5jb25zdCBwZXJjZW50UmVnRXggPSAvJS9nO1xuY29uc3QgYmFja3NsYXNoUmVnRXggPSAvXFxcXC9nO1xuY29uc3QgbmV3bGluZVJlZ0V4ID0gL1xcbi9nO1xuY29uc3QgY2FycmlhZ2VSZXR1cm5SZWdFeCA9IC9cXHIvZztcbmNvbnN0IHRhYlJlZ0V4ID0gL1xcdC9nO1xuLy8gUmVmZXJlbmNlOiBSRkMgMzk4NiwgUkZDIDE4MDgsIFJGQyAyMzk2XG5cbi8vIGRlZmluZSB0aGVzZSBoZXJlIHNvIGF0IGxlYXN0IHRoZXkgb25seSBoYXZlIHRvIGJlXG4vLyBjb21waWxlZCBvbmNlIG9uIHRoZSBmaXJzdCBtb2R1bGUgbG9hZC5cbmNvbnN0IHByb3RvY29sUGF0dGVybiA9IC9eW2EtejAtOS4rLV0rOi9pO1xuY29uc3QgcG9ydFBhdHRlcm4gPSAvOlswLTldKiQvO1xuY29uc3QgaG9zdFBhdHRlcm4gPSAvXlxcL1xcL1teQC9dK0BbXkAvXSsvO1xuLy8gU3BlY2lhbCBjYXNlIGZvciBhIHNpbXBsZSBwYXRoIFVSTFxuY29uc3Qgc2ltcGxlUGF0aFBhdHRlcm4gPSAvXihcXC9cXC8/KD8hXFwvKVteP1xcc10qKShcXD9bXlxcc10qKT8kLztcbi8vIFByb3RvY29scyB0aGF0IGNhbiBhbGxvdyBcInVuc2FmZVwiIGFuZCBcInVud2lzZVwiIGNoYXJzLlxuY29uc3QgdW5zYWZlUHJvdG9jb2wgPSBuZXcgU2V0KFtcImphdmFzY3JpcHRcIiwgXCJqYXZhc2NyaXB0OlwiXSk7XG4vLyBQcm90b2NvbHMgdGhhdCBuZXZlciBoYXZlIGEgaG9zdG5hbWUuXG5jb25zdCBob3N0bGVzc1Byb3RvY29sID0gbmV3IFNldChbXCJqYXZhc2NyaXB0XCIsIFwiamF2YXNjcmlwdDpcIl0pO1xuLy8gUHJvdG9jb2xzIHRoYXQgYWx3YXlzIGNvbnRhaW4gYSAvLyBiaXQuXG5jb25zdCBzbGFzaGVkUHJvdG9jb2wgPSBuZXcgU2V0KFtcbiAgXCJodHRwXCIsXG4gIFwiaHR0cDpcIixcbiAgXCJodHRwc1wiLFxuICBcImh0dHBzOlwiLFxuICBcImZ0cFwiLFxuICBcImZ0cDpcIixcbiAgXCJnb3BoZXJcIixcbiAgXCJnb3BoZXI6XCIsXG4gIFwiZmlsZVwiLFxuICBcImZpbGU6XCIsXG4gIFwid3NcIixcbiAgXCJ3czpcIixcbiAgXCJ3c3NcIixcbiAgXCJ3c3M6XCIsXG5dKTtcblxuY29uc3QgaG9zdG5hbWVNYXhMZW4gPSAyNTU7XG5cbi8vIFRoZXNlIGNoYXJhY3RlcnMgZG8gbm90IG5lZWQgZXNjYXBpbmc6XG4vLyAhIC0gLiBfIH5cbi8vICcgKCApICogOlxuLy8gZGlnaXRzXG4vLyBhbHBoYSAodXBwZXJjYXNlKVxuLy8gYWxwaGEgKGxvd2VyY2FzZSlcbi8vIGRlbm8tZm10LWlnbm9yZVxuY29uc3Qgbm9Fc2NhcGVBdXRoID0gbmV3IEludDhBcnJheShbXG4gIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIC8vIDB4MDAgLSAweDBGXG4gIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIC8vIDB4MTAgLSAweDFGXG4gIDAsIDEsIDAsIDAsIDAsIDAsIDAsIDEsIDEsIDEsIDEsIDAsIDAsIDEsIDEsIDAsIC8vIDB4MjAgLSAweDJGXG4gIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDAsIDAsIDAsIDAsIDAsIC8vIDB4MzAgLSAweDNGXG4gIDAsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIC8vIDB4NDAgLSAweDRGXG4gIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDAsIDAsIDAsIDAsIDEsIC8vIDB4NTAgLSAweDVGXG4gIDAsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIC8vIDB4NjAgLSAweDZGXG4gIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDAsIDAsIDAsIDEsIDAsICAvLyAweDcwIC0gMHg3RlxuXSk7XG5cbmNvbnN0IF91cmwgPSBVUkw7XG5leHBvcnQgeyBfdXJsIGFzIFVSTCB9O1xuXG4vLyBMZWdhY3kgVVJMIEFQSVxuZXhwb3J0IGNsYXNzIFVybCB7XG4gIHB1YmxpYyBwcm90b2NvbDogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGljIHNsYXNoZXM6IGJvb2xlYW4gfCBudWxsO1xuICBwdWJsaWMgYXV0aDogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGljIGhvc3Q6IHN0cmluZyB8IG51bGw7XG4gIHB1YmxpYyBwb3J0OiBzdHJpbmcgfCBudWxsO1xuICBwdWJsaWMgaG9zdG5hbWU6IHN0cmluZyB8IG51bGw7XG4gIHB1YmxpYyBoYXNoOiBzdHJpbmcgfCBudWxsO1xuICBwdWJsaWMgc2VhcmNoOiBzdHJpbmcgfCBudWxsO1xuICBwdWJsaWMgcXVlcnk6IHN0cmluZyB8IFBhcnNlZFVybFF1ZXJ5IHwgbnVsbDtcbiAgcHVibGljIHBhdGhuYW1lOiBzdHJpbmcgfCBudWxsO1xuICBwdWJsaWMgcGF0aDogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGljIGhyZWY6IHN0cmluZyB8IG51bGw7XG4gIFtrZXk6IHN0cmluZ106IHVua25vd25cblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLnByb3RvY29sID0gbnVsbDtcbiAgICB0aGlzLnNsYXNoZXMgPSBudWxsO1xuICAgIHRoaXMuYXV0aCA9IG51bGw7XG4gICAgdGhpcy5ob3N0ID0gbnVsbDtcbiAgICB0aGlzLnBvcnQgPSBudWxsO1xuICAgIHRoaXMuaG9zdG5hbWUgPSBudWxsO1xuICAgIHRoaXMuaGFzaCA9IG51bGw7XG4gICAgdGhpcy5zZWFyY2ggPSBudWxsO1xuICAgIHRoaXMucXVlcnkgPSBudWxsO1xuICAgIHRoaXMucGF0aG5hbWUgPSBudWxsO1xuICAgIHRoaXMucGF0aCA9IG51bGw7XG4gICAgdGhpcy5ocmVmID0gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgcGFyc2VIb3N0KCkge1xuICAgIGxldCBob3N0ID0gdGhpcy5ob3N0IHx8IFwiXCI7XG4gICAgbGV0IHBvcnQ6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwgfCBzdHJpbmcgPSBwb3J0UGF0dGVybi5leGVjKGhvc3QpO1xuICAgIGlmIChwb3J0KSB7XG4gICAgICBwb3J0ID0gcG9ydFswXTtcbiAgICAgIGlmIChwb3J0ICE9PSBcIjpcIikge1xuICAgICAgICB0aGlzLnBvcnQgPSBwb3J0LnNsaWNlKDEpO1xuICAgICAgfVxuICAgICAgaG9zdCA9IGhvc3Quc2xpY2UoMCwgaG9zdC5sZW5ndGggLSBwb3J0Lmxlbmd0aCk7XG4gICAgfVxuICAgIGlmIChob3N0KSB0aGlzLmhvc3RuYW1lID0gaG9zdDtcbiAgfVxuXG4gIHB1YmxpYyByZXNvbHZlKHJlbGF0aXZlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5yZXNvbHZlT2JqZWN0KHBhcnNlKHJlbGF0aXZlLCBmYWxzZSwgdHJ1ZSkpLmZvcm1hdCgpO1xuICB9XG5cbiAgcHVibGljIHJlc29sdmVPYmplY3QocmVsYXRpdmU6IHN0cmluZyB8IFVybCkge1xuICAgIGlmICh0eXBlb2YgcmVsYXRpdmUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgIGNvbnN0IHJlbCA9IG5ldyBVcmwoKTtcbiAgICAgIHJlbC51cmxQYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpO1xuICAgICAgcmVsYXRpdmUgPSByZWw7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0gbmV3IFVybCgpO1xuICAgIGNvbnN0IHRrZXlzID0gT2JqZWN0LmtleXModGhpcyk7XG4gICAgZm9yIChsZXQgdGsgPSAwOyB0ayA8IHRrZXlzLmxlbmd0aDsgdGsrKykge1xuICAgICAgY29uc3QgdGtleSA9IHRrZXlzW3RrXTtcbiAgICAgIHJlc3VsdFt0a2V5XSA9IHRoaXNbdGtleV07XG4gICAgfVxuXG4gICAgLy8gSGFzaCBpcyBhbHdheXMgb3ZlcnJpZGRlbiwgbm8gbWF0dGVyIHdoYXQuXG4gICAgLy8gZXZlbiBocmVmPVwiXCIgd2lsbCByZW1vdmUgaXQuXG4gICAgcmVzdWx0Lmhhc2ggPSByZWxhdGl2ZS5oYXNoO1xuXG4gICAgLy8gSWYgdGhlIHJlbGF0aXZlIHVybCBpcyBlbXB0eSwgdGhlbiB0aGVyZSdzIG5vdGhpbmcgbGVmdCB0byBkbyBoZXJlLlxuICAgIGlmIChyZWxhdGl2ZS5ocmVmID09PSBcIlwiKSB7XG4gICAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLy8gSHJlZnMgbGlrZSAvL2Zvby9iYXIgYWx3YXlzIGN1dCB0byB0aGUgcHJvdG9jb2wuXG4gICAgaWYgKHJlbGF0aXZlLnNsYXNoZXMgJiYgIXJlbGF0aXZlLnByb3RvY29sKSB7XG4gICAgICAvLyBUYWtlIGV2ZXJ5dGhpbmcgZXhjZXB0IHRoZSBwcm90b2NvbCBmcm9tIHJlbGF0aXZlXG4gICAgICBjb25zdCBya2V5cyA9IE9iamVjdC5rZXlzKHJlbGF0aXZlKTtcbiAgICAgIGZvciAobGV0IHJrID0gMDsgcmsgPCBya2V5cy5sZW5ndGg7IHJrKyspIHtcbiAgICAgICAgY29uc3QgcmtleSA9IHJrZXlzW3JrXTtcbiAgICAgICAgaWYgKHJrZXkgIT09IFwicHJvdG9jb2xcIikgcmVzdWx0W3JrZXldID0gcmVsYXRpdmVbcmtleV07XG4gICAgICB9XG5cbiAgICAgIC8vIHVybFBhcnNlIGFwcGVuZHMgdHJhaWxpbmcgLyB0byB1cmxzIGxpa2UgaHR0cDovL3d3dy5leGFtcGxlLmNvbVxuICAgICAgaWYgKFxuICAgICAgICByZXN1bHQucHJvdG9jb2wgJiZcbiAgICAgICAgc2xhc2hlZFByb3RvY29sLmhhcyhyZXN1bHQucHJvdG9jb2wpICYmXG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSAmJlxuICAgICAgICAhcmVzdWx0LnBhdGhuYW1lXG4gICAgICApIHtcbiAgICAgICAgcmVzdWx0LnBhdGggPSByZXN1bHQucGF0aG5hbWUgPSBcIi9cIjtcbiAgICAgIH1cblxuICAgICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIGlmIChyZWxhdGl2ZS5wcm90b2NvbCAmJiByZWxhdGl2ZS5wcm90b2NvbCAhPT0gcmVzdWx0LnByb3RvY29sKSB7XG4gICAgICAvLyBJZiBpdCdzIGEga25vd24gdXJsIHByb3RvY29sLCB0aGVuIGNoYW5naW5nXG4gICAgICAvLyB0aGUgcHJvdG9jb2wgZG9lcyB3ZWlyZCB0aGluZ3NcbiAgICAgIC8vIGZpcnN0LCBpZiBpdCdzIG5vdCBmaWxlOiwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBob3N0LFxuICAgICAgLy8gYW5kIGlmIHRoZXJlIHdhcyBhIHBhdGhcbiAgICAgIC8vIHRvIGJlZ2luIHdpdGgsIHRoZW4gd2UgTVVTVCBoYXZlIGEgcGF0aC5cbiAgICAgIC8vIGlmIGl0IGlzIGZpbGU6LCB0aGVuIHRoZSBob3N0IGlzIGRyb3BwZWQsXG4gICAgICAvLyBiZWNhdXNlIHRoYXQncyBrbm93biB0byBiZSBob3N0bGVzcy5cbiAgICAgIC8vIGFueXRoaW5nIGVsc2UgaXMgYXNzdW1lZCB0byBiZSBhYnNvbHV0ZS5cbiAgICAgIGlmICghc2xhc2hlZFByb3RvY29sLmhhcyhyZWxhdGl2ZS5wcm90b2NvbCkpIHtcbiAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHJlbGF0aXZlKTtcbiAgICAgICAgZm9yIChsZXQgdiA9IDA7IHYgPCBrZXlzLmxlbmd0aDsgdisrKSB7XG4gICAgICAgICAgY29uc3QgayA9IGtleXNbdl07XG4gICAgICAgICAgcmVzdWx0W2tdID0gcmVsYXRpdmVba107XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9XG5cbiAgICAgIHJlc3VsdC5wcm90b2NvbCA9IHJlbGF0aXZlLnByb3RvY29sO1xuICAgICAgaWYgKFxuICAgICAgICAhcmVsYXRpdmUuaG9zdCAmJlxuICAgICAgICAhL15maWxlOj8kLy50ZXN0KHJlbGF0aXZlLnByb3RvY29sKSAmJlxuICAgICAgICAhaG9zdGxlc3NQcm90b2NvbC5oYXMocmVsYXRpdmUucHJvdG9jb2wpXG4gICAgICApIHtcbiAgICAgICAgY29uc3QgcmVsUGF0aCA9IChyZWxhdGl2ZS5wYXRobmFtZSB8fCBcIlwiKS5zcGxpdChcIi9cIik7XG4gICAgICAgIHdoaWxlIChyZWxQYXRoLmxlbmd0aCAmJiAhKHJlbGF0aXZlLmhvc3QgPSByZWxQYXRoLnNoaWZ0KCkgfHwgbnVsbCkpO1xuICAgICAgICBpZiAoIXJlbGF0aXZlLmhvc3QpIHJlbGF0aXZlLmhvc3QgPSBcIlwiO1xuICAgICAgICBpZiAoIXJlbGF0aXZlLmhvc3RuYW1lKSByZWxhdGl2ZS5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgIGlmIChyZWxQYXRoWzBdICE9PSBcIlwiKSByZWxQYXRoLnVuc2hpZnQoXCJcIik7XG4gICAgICAgIGlmIChyZWxQYXRoLmxlbmd0aCA8IDIpIHJlbFBhdGgudW5zaGlmdChcIlwiKTtcbiAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gcmVsUGF0aC5qb2luKFwiL1wiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbGF0aXZlLnBhdGhuYW1lO1xuICAgICAgfVxuICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgICAgcmVzdWx0Lmhvc3QgPSByZWxhdGl2ZS5ob3N0IHx8IFwiXCI7XG4gICAgICByZXN1bHQuYXV0aCA9IHJlbGF0aXZlLmF1dGg7XG4gICAgICByZXN1bHQuaG9zdG5hbWUgPSByZWxhdGl2ZS5ob3N0bmFtZSB8fCByZWxhdGl2ZS5ob3N0O1xuICAgICAgcmVzdWx0LnBvcnQgPSByZWxhdGl2ZS5wb3J0O1xuICAgICAgLy8gVG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICAgIGlmIChyZXN1bHQucGF0aG5hbWUgfHwgcmVzdWx0LnNlYXJjaCkge1xuICAgICAgICBjb25zdCBwID0gcmVzdWx0LnBhdGhuYW1lIHx8IFwiXCI7XG4gICAgICAgIGNvbnN0IHMgPSByZXN1bHQuc2VhcmNoIHx8IFwiXCI7XG4gICAgICAgIHJlc3VsdC5wYXRoID0gcCArIHM7XG4gICAgICB9XG4gICAgICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gICAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgY29uc3QgaXNTb3VyY2VBYnMgPSByZXN1bHQucGF0aG5hbWUgJiYgcmVzdWx0LnBhdGhuYW1lLmNoYXJBdCgwKSA9PT0gXCIvXCI7XG4gICAgY29uc3QgaXNSZWxBYnMgPSByZWxhdGl2ZS5ob3N0IHx8XG4gICAgICAocmVsYXRpdmUucGF0aG5hbWUgJiYgcmVsYXRpdmUucGF0aG5hbWUuY2hhckF0KDApID09PSBcIi9cIik7XG4gICAgbGV0IG11c3RFbmRBYnM6IHN0cmluZyB8IGJvb2xlYW4gfCBudW1iZXIgfCBudWxsID0gaXNSZWxBYnMgfHxcbiAgICAgIGlzU291cmNlQWJzIHx8IChyZXN1bHQuaG9zdCAmJiByZWxhdGl2ZS5wYXRobmFtZSk7XG4gICAgY29uc3QgcmVtb3ZlQWxsRG90cyA9IG11c3RFbmRBYnM7XG4gICAgbGV0IHNyY1BhdGggPSAocmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5zcGxpdChcIi9cIikpIHx8IFtdO1xuICAgIGNvbnN0IHJlbFBhdGggPSAocmVsYXRpdmUucGF0aG5hbWUgJiYgcmVsYXRpdmUucGF0aG5hbWUuc3BsaXQoXCIvXCIpKSB8fCBbXTtcbiAgICBjb25zdCBub0xlYWRpbmdTbGFzaGVzID0gcmVzdWx0LnByb3RvY29sICYmXG4gICAgICAhc2xhc2hlZFByb3RvY29sLmhhcyhyZXN1bHQucHJvdG9jb2wpO1xuXG4gICAgLy8gSWYgdGhlIHVybCBpcyBhIG5vbi1zbGFzaGVkIHVybCwgdGhlbiByZWxhdGl2ZVxuICAgIC8vIGxpbmtzIGxpa2UgLi4vLi4gc2hvdWxkIGJlIGFibGVcbiAgICAvLyB0byBjcmF3bCB1cCB0byB0aGUgaG9zdG5hbWUsIGFzIHdlbGwuICBUaGlzIGlzIHN0cmFuZ2UuXG4gICAgLy8gcmVzdWx0LnByb3RvY29sIGhhcyBhbHJlYWR5IGJlZW4gc2V0IGJ5IG5vdy5cbiAgICAvLyBMYXRlciBvbiwgcHV0IHRoZSBmaXJzdCBwYXRoIHBhcnQgaW50byB0aGUgaG9zdCBmaWVsZC5cbiAgICBpZiAobm9MZWFkaW5nU2xhc2hlcykge1xuICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gXCJcIjtcbiAgICAgIHJlc3VsdC5wb3J0ID0gbnVsbDtcbiAgICAgIGlmIChyZXN1bHQuaG9zdCkge1xuICAgICAgICBpZiAoc3JjUGF0aFswXSA9PT0gXCJcIikgc3JjUGF0aFswXSA9IHJlc3VsdC5ob3N0O1xuICAgICAgICBlbHNlIHNyY1BhdGgudW5zaGlmdChyZXN1bHQuaG9zdCk7XG4gICAgICB9XG4gICAgICByZXN1bHQuaG9zdCA9IFwiXCI7XG4gICAgICBpZiAocmVsYXRpdmUucHJvdG9jb2wpIHtcbiAgICAgICAgcmVsYXRpdmUuaG9zdG5hbWUgPSBudWxsO1xuICAgICAgICByZWxhdGl2ZS5wb3J0ID0gbnVsbDtcbiAgICAgICAgcmVzdWx0LmF1dGggPSBudWxsO1xuICAgICAgICBpZiAocmVsYXRpdmUuaG9zdCkge1xuICAgICAgICAgIGlmIChyZWxQYXRoWzBdID09PSBcIlwiKSByZWxQYXRoWzBdID0gcmVsYXRpdmUuaG9zdDtcbiAgICAgICAgICBlbHNlIHJlbFBhdGgudW5zaGlmdChyZWxhdGl2ZS5ob3N0KTtcbiAgICAgICAgfVxuICAgICAgICByZWxhdGl2ZS5ob3N0ID0gbnVsbDtcbiAgICAgIH1cbiAgICAgIG11c3RFbmRBYnMgPSBtdXN0RW5kQWJzICYmIChyZWxQYXRoWzBdID09PSBcIlwiIHx8IHNyY1BhdGhbMF0gPT09IFwiXCIpO1xuICAgIH1cblxuICAgIGlmIChpc1JlbEFicykge1xuICAgICAgLy8gaXQncyBhYnNvbHV0ZS5cbiAgICAgIGlmIChyZWxhdGl2ZS5ob3N0IHx8IHJlbGF0aXZlLmhvc3QgPT09IFwiXCIpIHtcbiAgICAgICAgaWYgKHJlc3VsdC5ob3N0ICE9PSByZWxhdGl2ZS5ob3N0KSByZXN1bHQuYXV0aCA9IG51bGw7XG4gICAgICAgIHJlc3VsdC5ob3N0ID0gcmVsYXRpdmUuaG9zdDtcbiAgICAgICAgcmVzdWx0LnBvcnQgPSByZWxhdGl2ZS5wb3J0O1xuICAgICAgfVxuICAgICAgaWYgKHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3RuYW1lID09PSBcIlwiKSB7XG4gICAgICAgIGlmIChyZXN1bHQuaG9zdG5hbWUgIT09IHJlbGF0aXZlLmhvc3RuYW1lKSByZXN1bHQuYXV0aCA9IG51bGw7XG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lO1xuICAgICAgfVxuICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgICAgc3JjUGF0aCA9IHJlbFBhdGg7XG4gICAgICAvLyBGYWxsIHRocm91Z2ggdG8gdGhlIGRvdC1oYW5kbGluZyBiZWxvdy5cbiAgICB9IGVsc2UgaWYgKHJlbFBhdGgubGVuZ3RoKSB7XG4gICAgICAvLyBpdCdzIHJlbGF0aXZlXG4gICAgICAvLyB0aHJvdyBhd2F5IHRoZSBleGlzdGluZyBmaWxlLCBhbmQgdGFrZSB0aGUgbmV3IHBhdGggaW5zdGVhZC5cbiAgICAgIGlmICghc3JjUGF0aCkgc3JjUGF0aCA9IFtdO1xuICAgICAgc3JjUGF0aC5wb3AoKTtcbiAgICAgIHNyY1BhdGggPSBzcmNQYXRoLmNvbmNhdChyZWxQYXRoKTtcbiAgICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgICB9IGVsc2UgaWYgKHJlbGF0aXZlLnNlYXJjaCAhPT0gbnVsbCAmJiByZWxhdGl2ZS5zZWFyY2ggIT09IHVuZGVmaW5lZCkge1xuICAgICAgLy8gSnVzdCBwdWxsIG91dCB0aGUgc2VhcmNoLlxuICAgICAgLy8gbGlrZSBocmVmPSc/Zm9vJy5cbiAgICAgIC8vIFB1dCB0aGlzIGFmdGVyIHRoZSBvdGhlciB0d28gY2FzZXMgYmVjYXVzZSBpdCBzaW1wbGlmaWVzIHRoZSBib29sZWFuc1xuICAgICAgaWYgKG5vTGVhZGluZ1NsYXNoZXMpIHtcbiAgICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSBzcmNQYXRoLnNoaWZ0KCkgfHwgbnVsbDtcbiAgICAgICAgLy8gT2NjYXNpb25hbGx5IHRoZSBhdXRoIGNhbiBnZXQgc3R1Y2sgb25seSBpbiBob3N0LlxuICAgICAgICAvLyBUaGlzIGVzcGVjaWFsbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgICAgIC8vIHVybC5yZXNvbHZlT2JqZWN0KCdtYWlsdG86bG9jYWwxQGRvbWFpbjEnLCAnbG9jYWwyQGRvbWFpbjInKVxuICAgICAgICBjb25zdCBhdXRoSW5Ib3N0ID0gcmVzdWx0Lmhvc3QgJiYgcmVzdWx0Lmhvc3QuaW5kZXhPZihcIkBcIikgPiAwICYmXG4gICAgICAgICAgcmVzdWx0Lmhvc3Quc3BsaXQoXCJAXCIpO1xuICAgICAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgICAgIHJlc3VsdC5hdXRoID0gYXV0aEluSG9zdC5zaGlmdCgpIHx8IG51bGw7XG4gICAgICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCkgfHwgbnVsbDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgICAgLy8gVG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICAgIGlmIChyZXN1bHQucGF0aG5hbWUgIT09IG51bGwgfHwgcmVzdWx0LnNlYXJjaCAhPT0gbnVsbCkge1xuICAgICAgICByZXN1bHQucGF0aCA9IChyZXN1bHQucGF0aG5hbWUgPyByZXN1bHQucGF0aG5hbWUgOiBcIlwiKSArXG4gICAgICAgICAgKHJlc3VsdC5zZWFyY2ggPyByZXN1bHQuc2VhcmNoIDogXCJcIik7XG4gICAgICB9XG4gICAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgaWYgKCFzcmNQYXRoLmxlbmd0aCkge1xuICAgICAgLy8gTm8gcGF0aCBhdCBhbGwuIEFsbCBvdGhlciB0aGluZ3Mgd2VyZSBhbHJlYWR5IGhhbmRsZWQgYWJvdmUuXG4gICAgICByZXN1bHQucGF0aG5hbWUgPSBudWxsO1xuICAgICAgLy8gVG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICAgIGlmIChyZXN1bHQuc2VhcmNoKSB7XG4gICAgICAgIHJlc3VsdC5wYXRoID0gXCIvXCIgKyByZXN1bHQuc2VhcmNoO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0LnBhdGggPSBudWxsO1xuICAgICAgfVxuICAgICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8vIElmIGEgdXJsIEVORHMgaW4gLiBvciAuLiwgdGhlbiBpdCBtdXN0IGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICAgIC8vIGhvd2V2ZXIsIGlmIGl0IGVuZHMgaW4gYW55dGhpbmcgZWxzZSBub24tc2xhc2h5LFxuICAgIC8vIHRoZW4gaXQgbXVzdCBOT1QgZ2V0IGEgdHJhaWxpbmcgc2xhc2guXG4gICAgbGV0IGxhc3QgPSBzcmNQYXRoLnNsaWNlKC0xKVswXTtcbiAgICBjb25zdCBoYXNUcmFpbGluZ1NsYXNoID1cbiAgICAgICgocmVzdWx0Lmhvc3QgfHwgcmVsYXRpdmUuaG9zdCB8fCBzcmNQYXRoLmxlbmd0aCA+IDEpICYmXG4gICAgICAgIChsYXN0ID09PSBcIi5cIiB8fCBsYXN0ID09PSBcIi4uXCIpKSB8fFxuICAgICAgbGFzdCA9PT0gXCJcIjtcblxuICAgIC8vIFN0cmlwIHNpbmdsZSBkb3RzLCByZXNvbHZlIGRvdWJsZSBkb3RzIHRvIHBhcmVudCBkaXJcbiAgICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICAgIGxldCB1cCA9IDA7XG4gICAgZm9yIChsZXQgaSA9IHNyY1BhdGgubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIGxhc3QgPSBzcmNQYXRoW2ldO1xuICAgICAgaWYgKGxhc3QgPT09IFwiLlwiKSB7XG4gICAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgICAgfSBlbHNlIGlmIChsYXN0ID09PSBcIi4uXCIpIHtcbiAgICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICAgIHVwKys7XG4gICAgICB9IGVsc2UgaWYgKHVwKSB7XG4gICAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgICAgICB1cC0tO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIElmIHRoZSBwYXRoIGlzIGFsbG93ZWQgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIHJlc3RvcmUgbGVhZGluZyAuLnNcbiAgICBpZiAoIW11c3RFbmRBYnMgJiYgIXJlbW92ZUFsbERvdHMpIHtcbiAgICAgIHdoaWxlICh1cC0tKSB7XG4gICAgICAgIHNyY1BhdGgudW5zaGlmdChcIi4uXCIpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChcbiAgICAgIG11c3RFbmRBYnMgJiZcbiAgICAgIHNyY1BhdGhbMF0gIT09IFwiXCIgJiZcbiAgICAgICghc3JjUGF0aFswXSB8fCBzcmNQYXRoWzBdLmNoYXJBdCgwKSAhPT0gXCIvXCIpXG4gICAgKSB7XG4gICAgICBzcmNQYXRoLnVuc2hpZnQoXCJcIik7XG4gICAgfVxuXG4gICAgaWYgKGhhc1RyYWlsaW5nU2xhc2ggJiYgc3JjUGF0aC5qb2luKFwiL1wiKS5zdWJzdHIoLTEpICE9PSBcIi9cIikge1xuICAgICAgc3JjUGF0aC5wdXNoKFwiXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IGlzQWJzb2x1dGUgPSBzcmNQYXRoWzBdID09PSBcIlwiIHx8XG4gICAgICAoc3JjUGF0aFswXSAmJiBzcmNQYXRoWzBdLmNoYXJBdCgwKSA9PT0gXCIvXCIpO1xuXG4gICAgLy8gcHV0IHRoZSBob3N0IGJhY2tcbiAgICBpZiAobm9MZWFkaW5nU2xhc2hlcykge1xuICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSBpc0Fic29sdXRlXG4gICAgICAgID8gXCJcIlxuICAgICAgICA6IHNyY1BhdGgubGVuZ3RoXG4gICAgICAgID8gc3JjUGF0aC5zaGlmdCgpIHx8IG51bGxcbiAgICAgICAgOiBcIlwiO1xuICAgICAgLy8gT2NjYXNpb25hbGx5IHRoZSBhdXRoIGNhbiBnZXQgc3R1Y2sgb25seSBpbiBob3N0LlxuICAgICAgLy8gVGhpcyBlc3BlY2lhbGx5IGhhcHBlbnMgaW4gY2FzZXMgbGlrZVxuICAgICAgLy8gdXJsLnJlc29sdmVPYmplY3QoJ21haWx0bzpsb2NhbDFAZG9tYWluMScsICdsb2NhbDJAZG9tYWluMicpXG4gICAgICBjb25zdCBhdXRoSW5Ib3N0ID0gcmVzdWx0Lmhvc3QgJiYgcmVzdWx0Lmhvc3QuaW5kZXhPZihcIkBcIikgPiAwXG4gICAgICAgID8gcmVzdWx0Lmhvc3Quc3BsaXQoXCJAXCIpXG4gICAgICAgIDogZmFsc2U7XG4gICAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKSB8fCBudWxsO1xuICAgICAgICByZXN1bHQuaG9zdCA9IHJlc3VsdC5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKSB8fCBudWxsO1xuICAgICAgfVxuICAgIH1cblxuICAgIG11c3RFbmRBYnMgPSBtdXN0RW5kQWJzIHx8IChyZXN1bHQuaG9zdCAmJiBzcmNQYXRoLmxlbmd0aCk7XG5cbiAgICBpZiAobXVzdEVuZEFicyAmJiAhaXNBYnNvbHV0ZSkge1xuICAgICAgc3JjUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgIH1cblxuICAgIGlmICghc3JjUGF0aC5sZW5ndGgpIHtcbiAgICAgIHJlc3VsdC5wYXRobmFtZSA9IG51bGw7XG4gICAgICByZXN1bHQucGF0aCA9IG51bGw7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHNyY1BhdGguam9pbihcIi9cIik7XG4gICAgfVxuXG4gICAgLy8gVG8gc3VwcG9ydCByZXF1ZXN0Lmh0dHBcbiAgICBpZiAocmVzdWx0LnBhdGhuYW1lICE9PSBudWxsIHx8IHJlc3VsdC5zZWFyY2ggIT09IG51bGwpIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gKHJlc3VsdC5wYXRobmFtZSA/IHJlc3VsdC5wYXRobmFtZSA6IFwiXCIpICtcbiAgICAgICAgKHJlc3VsdC5zZWFyY2ggPyByZXN1bHQuc2VhcmNoIDogXCJcIik7XG4gICAgfVxuICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aCB8fCByZXN1bHQuYXV0aDtcbiAgICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGZvcm1hdCgpIHtcbiAgICBsZXQgYXV0aCA9IHRoaXMuYXV0aCB8fCBcIlwiO1xuICAgIGlmIChhdXRoKSB7XG4gICAgICBhdXRoID0gZW5jb2RlU3RyKGF1dGgsIG5vRXNjYXBlQXV0aCwgaGV4VGFibGUpO1xuICAgICAgYXV0aCArPSBcIkBcIjtcbiAgICB9XG5cbiAgICBsZXQgcHJvdG9jb2wgPSB0aGlzLnByb3RvY29sIHx8IFwiXCI7XG4gICAgbGV0IHBhdGhuYW1lID0gdGhpcy5wYXRobmFtZSB8fCBcIlwiO1xuICAgIGxldCBoYXNoID0gdGhpcy5oYXNoIHx8IFwiXCI7XG4gICAgbGV0IGhvc3QgPSBcIlwiO1xuICAgIGxldCBxdWVyeSA9IFwiXCI7XG5cbiAgICBpZiAodGhpcy5ob3N0KSB7XG4gICAgICBob3N0ID0gYXV0aCArIHRoaXMuaG9zdDtcbiAgICB9IGVsc2UgaWYgKHRoaXMuaG9zdG5hbWUpIHtcbiAgICAgIGhvc3QgPSBhdXRoICtcbiAgICAgICAgKHRoaXMuaG9zdG5hbWUuaW5jbHVkZXMoXCI6XCIpICYmICFpc0lwdjZIb3N0bmFtZSh0aGlzLmhvc3RuYW1lKVxuICAgICAgICAgID8gXCJbXCIgKyB0aGlzLmhvc3RuYW1lICsgXCJdXCJcbiAgICAgICAgICA6IHRoaXMuaG9zdG5hbWUpO1xuICAgICAgaWYgKHRoaXMucG9ydCkge1xuICAgICAgICBob3N0ICs9IFwiOlwiICsgdGhpcy5wb3J0O1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0aGlzLnF1ZXJ5ICE9PSBudWxsICYmIHR5cGVvZiB0aGlzLnF1ZXJ5ID09PSBcIm9iamVjdFwiKSB7XG4gICAgICBxdWVyeSA9IHF1ZXJ5c3RyaW5nLnN0cmluZ2lmeSh0aGlzLnF1ZXJ5KTtcbiAgICB9XG5cbiAgICBsZXQgc2VhcmNoID0gdGhpcy5zZWFyY2ggfHwgKHF1ZXJ5ICYmIFwiP1wiICsgcXVlcnkpIHx8IFwiXCI7XG5cbiAgICBpZiAocHJvdG9jb2wgJiYgcHJvdG9jb2wuY2hhckNvZGVBdChwcm90b2NvbC5sZW5ndGggLSAxKSAhPT0gNTggLyogOiAqLykge1xuICAgICAgcHJvdG9jb2wgKz0gXCI6XCI7XG4gICAgfVxuXG4gICAgbGV0IG5ld1BhdGhuYW1lID0gXCJcIjtcbiAgICBsZXQgbGFzdFBvcyA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXRobmFtZS5sZW5ndGg7ICsraSkge1xuICAgICAgc3dpdGNoIChwYXRobmFtZS5jaGFyQ29kZUF0KGkpKSB7XG4gICAgICAgIGNhc2UgQ0hBUl9IQVNIOlxuICAgICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIHtcbiAgICAgICAgICAgIG5ld1BhdGhuYW1lICs9IHBhdGhuYW1lLnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBuZXdQYXRobmFtZSArPSBcIiUyM1wiO1xuICAgICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBDSEFSX1FVRVNUSU9OX01BUks6XG4gICAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkge1xuICAgICAgICAgICAgbmV3UGF0aG5hbWUgKz0gcGF0aG5hbWUuc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG5ld1BhdGhuYW1lICs9IFwiJTNGXCI7XG4gICAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAobGFzdFBvcyA+IDApIHtcbiAgICAgIGlmIChsYXN0UG9zICE9PSBwYXRobmFtZS5sZW5ndGgpIHtcbiAgICAgICAgcGF0aG5hbWUgPSBuZXdQYXRobmFtZSArIHBhdGhuYW1lLnNsaWNlKGxhc3RQb3MpO1xuICAgICAgfSBlbHNlIHBhdGhuYW1lID0gbmV3UGF0aG5hbWU7XG4gICAgfVxuXG4gICAgLy8gT25seSB0aGUgc2xhc2hlZFByb3RvY29scyBnZXQgdGhlIC8vLiAgTm90IG1haWx0bzosIHhtcHA6LCBldGMuXG4gICAgLy8gdW5sZXNzIHRoZXkgaGFkIHRoZW0gdG8gYmVnaW4gd2l0aC5cbiAgICBpZiAodGhpcy5zbGFzaGVzIHx8IHNsYXNoZWRQcm90b2NvbC5oYXMocHJvdG9jb2wpKSB7XG4gICAgICBpZiAodGhpcy5zbGFzaGVzIHx8IGhvc3QpIHtcbiAgICAgICAgaWYgKHBhdGhuYW1lICYmIHBhdGhuYW1lLmNoYXJDb2RlQXQoMCkgIT09IENIQVJfRk9SV0FSRF9TTEFTSCkge1xuICAgICAgICAgIHBhdGhuYW1lID0gXCIvXCIgKyBwYXRobmFtZTtcbiAgICAgICAgfVxuICAgICAgICBob3N0ID0gXCIvL1wiICsgaG9zdDtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIHByb3RvY29sLmxlbmd0aCA+PSA0ICYmXG4gICAgICAgIHByb3RvY29sLmNoYXJDb2RlQXQoMCkgPT09IDEwMiAvKiBmICovICYmXG4gICAgICAgIHByb3RvY29sLmNoYXJDb2RlQXQoMSkgPT09IDEwNSAvKiBpICovICYmXG4gICAgICAgIHByb3RvY29sLmNoYXJDb2RlQXQoMikgPT09IDEwOCAvKiBsICovICYmXG4gICAgICAgIHByb3RvY29sLmNoYXJDb2RlQXQoMykgPT09IDEwMSAvKiBlICovXG4gICAgICApIHtcbiAgICAgICAgaG9zdCA9IFwiLy9cIjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBzZWFyY2ggPSBzZWFyY2gucmVwbGFjZSgvIy9nLCBcIiUyM1wiKTtcblxuICAgIGlmIChoYXNoICYmIGhhc2guY2hhckNvZGVBdCgwKSAhPT0gQ0hBUl9IQVNIKSB7XG4gICAgICBoYXNoID0gXCIjXCIgKyBoYXNoO1xuICAgIH1cbiAgICBpZiAoc2VhcmNoICYmIHNlYXJjaC5jaGFyQ29kZUF0KDApICE9PSBDSEFSX1FVRVNUSU9OX01BUkspIHtcbiAgICAgIHNlYXJjaCA9IFwiP1wiICsgc2VhcmNoO1xuICAgIH1cblxuICAgIHJldHVybiBwcm90b2NvbCArIGhvc3QgKyBwYXRobmFtZSArIHNlYXJjaCArIGhhc2g7XG4gIH1cblxuICBwdWJsaWMgdXJsUGFyc2UoXG4gICAgdXJsOiBzdHJpbmcsXG4gICAgcGFyc2VRdWVyeVN0cmluZzogYm9vbGVhbixcbiAgICBzbGFzaGVzRGVub3RlSG9zdDogYm9vbGVhbixcbiAgKSB7XG4gICAgLy8gQ29weSBjaHJvbWUsIElFLCBvcGVyYSBiYWNrc2xhc2gtaGFuZGxpbmcgYmVoYXZpb3IuXG4gICAgLy8gQmFjayBzbGFzaGVzIGJlZm9yZSB0aGUgcXVlcnkgc3RyaW5nIGdldCBjb252ZXJ0ZWQgdG8gZm9yd2FyZCBzbGFzaGVzXG4gICAgLy8gU2VlOiBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL2Nocm9taXVtL2lzc3Vlcy9kZXRhaWw/aWQ9MjU5MTZcbiAgICBsZXQgaGFzSGFzaCA9IGZhbHNlO1xuICAgIGxldCBzdGFydCA9IC0xO1xuICAgIGxldCBlbmQgPSAtMTtcbiAgICBsZXQgcmVzdCA9IFwiXCI7XG4gICAgbGV0IGxhc3RQb3MgPSAwO1xuICAgIGZvciAobGV0IGkgPSAwLCBpbldzID0gZmFsc2UsIHNwbGl0ID0gZmFsc2U7IGkgPCB1cmwubGVuZ3RoOyArK2kpIHtcbiAgICAgIGNvbnN0IGNvZGUgPSB1cmwuY2hhckNvZGVBdChpKTtcblxuICAgICAgLy8gRmluZCBmaXJzdCBhbmQgbGFzdCBub24td2hpdGVzcGFjZSBjaGFyYWN0ZXJzIGZvciB0cmltbWluZ1xuICAgICAgY29uc3QgaXNXcyA9IGNvZGUgPT09IENIQVJfU1BBQ0UgfHxcbiAgICAgICAgY29kZSA9PT0gQ0hBUl9UQUIgfHxcbiAgICAgICAgY29kZSA9PT0gQ0hBUl9DQVJSSUFHRV9SRVRVUk4gfHxcbiAgICAgICAgY29kZSA9PT0gQ0hBUl9MSU5FX0ZFRUQgfHxcbiAgICAgICAgY29kZSA9PT0gQ0hBUl9GT1JNX0ZFRUQgfHxcbiAgICAgICAgY29kZSA9PT0gQ0hBUl9OT19CUkVBS19TUEFDRSB8fFxuICAgICAgICBjb2RlID09PSBDSEFSX1pFUk9fV0lEVEhfTk9CUkVBS19TUEFDRTtcbiAgICAgIGlmIChzdGFydCA9PT0gLTEpIHtcbiAgICAgICAgaWYgKGlzV3MpIGNvbnRpbnVlO1xuICAgICAgICBsYXN0UG9zID0gc3RhcnQgPSBpO1xuICAgICAgfSBlbHNlIGlmIChpbldzKSB7XG4gICAgICAgIGlmICghaXNXcykge1xuICAgICAgICAgIGVuZCA9IC0xO1xuICAgICAgICAgIGluV3MgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChpc1dzKSB7XG4gICAgICAgIGVuZCA9IGk7XG4gICAgICAgIGluV3MgPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBPbmx5IGNvbnZlcnQgYmFja3NsYXNoZXMgd2hpbGUgd2UgaGF2ZW4ndCBzZWVuIGEgc3BsaXQgY2hhcmFjdGVyXG4gICAgICBpZiAoIXNwbGl0KSB7XG4gICAgICAgIHN3aXRjaCAoY29kZSkge1xuICAgICAgICAgIGNhc2UgQ0hBUl9IQVNIOlxuICAgICAgICAgICAgaGFzSGFzaCA9IHRydWU7XG4gICAgICAgICAgLy8gRmFsbCB0aHJvdWdoXG4gICAgICAgICAgY2FzZSBDSEFSX1FVRVNUSU9OX01BUks6XG4gICAgICAgICAgICBzcGxpdCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIENIQVJfQkFDS1dBUkRfU0xBU0g6XG4gICAgICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSByZXN0ICs9IHVybC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgICAgIHJlc3QgKz0gXCIvXCI7XG4gICAgICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICghaGFzSGFzaCAmJiBjb2RlID09PSBDSEFSX0hBU0gpIHtcbiAgICAgICAgaGFzSGFzaCA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgc3RyaW5nIHdhcyBub24tZW1wdHkgKGluY2x1ZGluZyBzdHJpbmdzIHdpdGggb25seSB3aGl0ZXNwYWNlKVxuICAgIGlmIChzdGFydCAhPT0gLTEpIHtcbiAgICAgIGlmIChsYXN0UG9zID09PSBzdGFydCkge1xuICAgICAgICAvLyBXZSBkaWRuJ3QgY29udmVydCBhbnkgYmFja3NsYXNoZXNcblxuICAgICAgICBpZiAoZW5kID09PSAtMSkge1xuICAgICAgICAgIGlmIChzdGFydCA9PT0gMCkgcmVzdCA9IHVybDtcbiAgICAgICAgICBlbHNlIHJlc3QgPSB1cmwuc2xpY2Uoc3RhcnQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc3QgPSB1cmwuc2xpY2Uoc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoZW5kID09PSAtMSAmJiBsYXN0UG9zIDwgdXJsLmxlbmd0aCkge1xuICAgICAgICAvLyBXZSBjb252ZXJ0ZWQgc29tZSBiYWNrc2xhc2hlcyBhbmQgaGF2ZSBvbmx5IHBhcnQgb2YgdGhlIGVudGlyZSBzdHJpbmdcbiAgICAgICAgcmVzdCArPSB1cmwuc2xpY2UobGFzdFBvcyk7XG4gICAgICB9IGVsc2UgaWYgKGVuZCAhPT0gLTEgJiYgbGFzdFBvcyA8IGVuZCkge1xuICAgICAgICAvLyBXZSBjb252ZXJ0ZWQgc29tZSBiYWNrc2xhc2hlcyBhbmQgaGF2ZSBvbmx5IHBhcnQgb2YgdGhlIGVudGlyZSBzdHJpbmdcbiAgICAgICAgcmVzdCArPSB1cmwuc2xpY2UobGFzdFBvcywgZW5kKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIXNsYXNoZXNEZW5vdGVIb3N0ICYmICFoYXNIYXNoKSB7XG4gICAgICAvLyBUcnkgZmFzdCBwYXRoIHJlZ2V4cFxuICAgICAgY29uc3Qgc2ltcGxlUGF0aCA9IHNpbXBsZVBhdGhQYXR0ZXJuLmV4ZWMocmVzdCk7XG4gICAgICBpZiAoc2ltcGxlUGF0aCkge1xuICAgICAgICB0aGlzLnBhdGggPSByZXN0O1xuICAgICAgICB0aGlzLmhyZWYgPSByZXN0O1xuICAgICAgICB0aGlzLnBhdGhuYW1lID0gc2ltcGxlUGF0aFsxXTtcbiAgICAgICAgaWYgKHNpbXBsZVBhdGhbMl0pIHtcbiAgICAgICAgICB0aGlzLnNlYXJjaCA9IHNpbXBsZVBhdGhbMl07XG4gICAgICAgICAgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnkgPSBxdWVyeXN0cmluZy5wYXJzZSh0aGlzLnNlYXJjaC5zbGljZSgxKSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnkgPSB0aGlzLnNlYXJjaC5zbGljZSgxKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgICAgIHRoaXMuc2VhcmNoID0gbnVsbDtcbiAgICAgICAgICB0aGlzLnF1ZXJ5ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBsZXQgcHJvdG86IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwgfCBzdHJpbmcgPSBwcm90b2NvbFBhdHRlcm4uZXhlYyhyZXN0KTtcbiAgICBsZXQgbG93ZXJQcm90byA9IFwiXCI7XG4gICAgaWYgKHByb3RvKSB7XG4gICAgICBwcm90byA9IHByb3RvWzBdO1xuICAgICAgbG93ZXJQcm90byA9IHByb3RvLnRvTG93ZXJDYXNlKCk7XG4gICAgICB0aGlzLnByb3RvY29sID0gbG93ZXJQcm90bztcbiAgICAgIHJlc3QgPSByZXN0LnNsaWNlKHByb3RvLmxlbmd0aCk7XG4gICAgfVxuXG4gICAgLy8gRmlndXJlIG91dCBpZiBpdCdzIGdvdCBhIGhvc3RcbiAgICAvLyB1c2VyQHNlcnZlciBpcyAqYWx3YXlzKiBpbnRlcnByZXRlZCBhcyBhIGhvc3RuYW1lLCBhbmQgdXJsXG4gICAgLy8gcmVzb2x1dGlvbiB3aWxsIHRyZWF0IC8vZm9vL2JhciBhcyBob3N0PWZvbyxwYXRoPWJhciBiZWNhdXNlIHRoYXQnc1xuICAgIC8vIGhvdyB0aGUgYnJvd3NlciByZXNvbHZlcyByZWxhdGl2ZSBVUkxzLlxuICAgIGxldCBzbGFzaGVzO1xuICAgIGlmIChzbGFzaGVzRGVub3RlSG9zdCB8fCBwcm90byB8fCBob3N0UGF0dGVybi50ZXN0KHJlc3QpKSB7XG4gICAgICBzbGFzaGVzID0gcmVzdC5jaGFyQ29kZUF0KDApID09PSBDSEFSX0ZPUldBUkRfU0xBU0ggJiZcbiAgICAgICAgcmVzdC5jaGFyQ29kZUF0KDEpID09PSBDSEFSX0ZPUldBUkRfU0xBU0g7XG4gICAgICBpZiAoc2xhc2hlcyAmJiAhKHByb3RvICYmIGhvc3RsZXNzUHJvdG9jb2wuaGFzKGxvd2VyUHJvdG8pKSkge1xuICAgICAgICByZXN0ID0gcmVzdC5zbGljZSgyKTtcbiAgICAgICAgdGhpcy5zbGFzaGVzID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICAhaG9zdGxlc3NQcm90b2NvbC5oYXMobG93ZXJQcm90bykgJiZcbiAgICAgIChzbGFzaGVzIHx8IChwcm90byAmJiAhc2xhc2hlZFByb3RvY29sLmhhcyhwcm90bykpKVxuICAgICkge1xuICAgICAgLy8gdGhlcmUncyBhIGhvc3RuYW1lLlxuICAgICAgLy8gdGhlIGZpcnN0IGluc3RhbmNlIG9mIC8sID8sIDssIG9yICMgZW5kcyB0aGUgaG9zdC5cbiAgICAgIC8vXG4gICAgICAvLyBJZiB0aGVyZSBpcyBhbiBAIGluIHRoZSBob3N0bmFtZSwgdGhlbiBub24taG9zdCBjaGFycyAqYXJlKiBhbGxvd2VkXG4gICAgICAvLyB0byB0aGUgbGVmdCBvZiB0aGUgbGFzdCBAIHNpZ24sIHVubGVzcyBzb21lIGhvc3QtZW5kaW5nIGNoYXJhY3RlclxuICAgICAgLy8gY29tZXMgKmJlZm9yZSogdGhlIEAtc2lnbi5cbiAgICAgIC8vIFVSTHMgYXJlIG9ibm94aW91cy5cbiAgICAgIC8vXG4gICAgICAvLyBleDpcbiAgICAgIC8vIGh0dHA6Ly9hQGJAYy8gPT4gdXNlcjphQGIgaG9zdDpjXG4gICAgICAvLyBodHRwOi8vYUBiP0BjID0+IHVzZXI6YSBob3N0OmIgcGF0aDovP0BjXG5cbiAgICAgIGxldCBob3N0RW5kID0gLTE7XG4gICAgICBsZXQgYXRTaWduID0gLTE7XG4gICAgICBsZXQgbm9uSG9zdCA9IC0xO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCByZXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHN3aXRjaCAocmVzdC5jaGFyQ29kZUF0KGkpKSB7XG4gICAgICAgICAgY2FzZSBDSEFSX1RBQjpcbiAgICAgICAgICBjYXNlIENIQVJfTElORV9GRUVEOlxuICAgICAgICAgIGNhc2UgQ0hBUl9DQVJSSUFHRV9SRVRVUk46XG4gICAgICAgICAgY2FzZSBDSEFSX1NQQUNFOlxuICAgICAgICAgIGNhc2UgQ0hBUl9ET1VCTEVfUVVPVEU6XG4gICAgICAgICAgY2FzZSBDSEFSX1BFUkNFTlQ6XG4gICAgICAgICAgY2FzZSBDSEFSX1NJTkdMRV9RVU9URTpcbiAgICAgICAgICBjYXNlIENIQVJfU0VNSUNPTE9OOlxuICAgICAgICAgIGNhc2UgQ0hBUl9MRUZUX0FOR0xFX0JSQUNLRVQ6XG4gICAgICAgICAgY2FzZSBDSEFSX1JJR0hUX0FOR0xFX0JSQUNLRVQ6XG4gICAgICAgICAgY2FzZSBDSEFSX0JBQ0tXQVJEX1NMQVNIOlxuICAgICAgICAgIGNhc2UgQ0hBUl9DSVJDVU1GTEVYX0FDQ0VOVDpcbiAgICAgICAgICBjYXNlIENIQVJfR1JBVkVfQUNDRU5UOlxuICAgICAgICAgIGNhc2UgQ0hBUl9MRUZUX0NVUkxZX0JSQUNLRVQ6XG4gICAgICAgICAgY2FzZSBDSEFSX1ZFUlRJQ0FMX0xJTkU6XG4gICAgICAgICAgY2FzZSBDSEFSX1JJR0hUX0NVUkxZX0JSQUNLRVQ6XG4gICAgICAgICAgICAvLyBDaGFyYWN0ZXJzIHRoYXQgYXJlIG5ldmVyIGV2ZXIgYWxsb3dlZCBpbiBhIGhvc3RuYW1lIGZyb20gUkZDIDIzOTZcbiAgICAgICAgICAgIGlmIChub25Ib3N0ID09PSAtMSkgbm9uSG9zdCA9IGk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIENIQVJfSEFTSDpcbiAgICAgICAgICBjYXNlIENIQVJfRk9SV0FSRF9TTEFTSDpcbiAgICAgICAgICBjYXNlIENIQVJfUVVFU1RJT05fTUFSSzpcbiAgICAgICAgICAgIC8vIEZpbmQgdGhlIGZpcnN0IGluc3RhbmNlIG9mIGFueSBob3N0LWVuZGluZyBjaGFyYWN0ZXJzXG4gICAgICAgICAgICBpZiAobm9uSG9zdCA9PT0gLTEpIG5vbkhvc3QgPSBpO1xuICAgICAgICAgICAgaG9zdEVuZCA9IGk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIENIQVJfQVQ6XG4gICAgICAgICAgICAvLyBBdCB0aGlzIHBvaW50LCBlaXRoZXIgd2UgaGF2ZSBhbiBleHBsaWNpdCBwb2ludCB3aGVyZSB0aGVcbiAgICAgICAgICAgIC8vIGF1dGggcG9ydGlvbiBjYW5ub3QgZ28gcGFzdCwgb3IgdGhlIGxhc3QgQCBjaGFyIGlzIHRoZSBkZWNpZGVyLlxuICAgICAgICAgICAgYXRTaWduID0gaTtcbiAgICAgICAgICAgIG5vbkhvc3QgPSAtMTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGlmIChob3N0RW5kICE9PSAtMSkgYnJlYWs7XG4gICAgICB9XG4gICAgICBzdGFydCA9IDA7XG4gICAgICBpZiAoYXRTaWduICE9PSAtMSkge1xuICAgICAgICB0aGlzLmF1dGggPSBkZWNvZGVVUklDb21wb25lbnQocmVzdC5zbGljZSgwLCBhdFNpZ24pKTtcbiAgICAgICAgc3RhcnQgPSBhdFNpZ24gKyAxO1xuICAgICAgfVxuICAgICAgaWYgKG5vbkhvc3QgPT09IC0xKSB7XG4gICAgICAgIHRoaXMuaG9zdCA9IHJlc3Quc2xpY2Uoc3RhcnQpO1xuICAgICAgICByZXN0ID0gXCJcIjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuaG9zdCA9IHJlc3Quc2xpY2Uoc3RhcnQsIG5vbkhvc3QpO1xuICAgICAgICByZXN0ID0gcmVzdC5zbGljZShub25Ib3N0KTtcbiAgICAgIH1cblxuICAgICAgLy8gcHVsbCBvdXQgcG9ydC5cbiAgICAgIHRoaXMucGFyc2VIb3N0KCk7XG5cbiAgICAgIC8vIFdlJ3ZlIGluZGljYXRlZCB0aGF0IHRoZXJlIGlzIGEgaG9zdG5hbWUsXG4gICAgICAvLyBzbyBldmVuIGlmIGl0J3MgZW1wdHksIGl0IGhhcyB0byBiZSBwcmVzZW50LlxuICAgICAgaWYgKHR5cGVvZiB0aGlzLmhvc3RuYW1lICE9PSBcInN0cmluZ1wiKSB0aGlzLmhvc3RuYW1lID0gXCJcIjtcblxuICAgICAgY29uc3QgaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lO1xuXG4gICAgICAvLyBJZiBob3N0bmFtZSBiZWdpbnMgd2l0aCBbIGFuZCBlbmRzIHdpdGggXVxuICAgICAgLy8gYXNzdW1lIHRoYXQgaXQncyBhbiBJUHY2IGFkZHJlc3MuXG4gICAgICBjb25zdCBpcHY2SG9zdG5hbWUgPSBpc0lwdjZIb3N0bmFtZShob3N0bmFtZSk7XG5cbiAgICAgIC8vIHZhbGlkYXRlIGEgbGl0dGxlLlxuICAgICAgaWYgKCFpcHY2SG9zdG5hbWUpIHtcbiAgICAgICAgcmVzdCA9IGdldEhvc3RuYW1lKHRoaXMsIHJlc3QsIGhvc3RuYW1lKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuaG9zdG5hbWUubGVuZ3RoID4gaG9zdG5hbWVNYXhMZW4pIHtcbiAgICAgICAgdGhpcy5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBIb3N0bmFtZXMgYXJlIGFsd2F5cyBsb3dlciBjYXNlLlxuICAgICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIWlwdjZIb3N0bmFtZSkge1xuICAgICAgICAvLyBJRE5BIFN1cHBvcnQ6IFJldHVybnMgYSBwdW55Y29kZWQgcmVwcmVzZW50YXRpb24gb2YgXCJkb21haW5cIi5cbiAgICAgICAgLy8gSXQgb25seSBjb252ZXJ0cyBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgdGhhdFxuICAgICAgICAvLyBoYXZlIG5vbi1BU0NJSSBjaGFyYWN0ZXJzLCBpLmUuIGl0IGRvZXNuJ3QgbWF0dGVyIGlmXG4gICAgICAgIC8vIHlvdSBjYWxsIGl0IHdpdGggYSBkb21haW4gdGhhdCBhbHJlYWR5IGlzIEFTQ0lJLW9ubHkuXG5cbiAgICAgICAgLy8gVXNlIGxlbmllbnQgbW9kZSAoYHRydWVgKSB0byB0cnkgdG8gc3VwcG9ydCBldmVuIG5vbi1jb21wbGlhbnRcbiAgICAgICAgLy8gVVJMcy5cbiAgICAgICAgdGhpcy5ob3N0bmFtZSA9IHRvQVNDSUkodGhpcy5ob3N0bmFtZSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHAgPSB0aGlzLnBvcnQgPyBcIjpcIiArIHRoaXMucG9ydCA6IFwiXCI7XG4gICAgICBjb25zdCBoID0gdGhpcy5ob3N0bmFtZSB8fCBcIlwiO1xuICAgICAgdGhpcy5ob3N0ID0gaCArIHA7XG5cbiAgICAgIC8vIHN0cmlwIFsgYW5kIF0gZnJvbSB0aGUgaG9zdG5hbWVcbiAgICAgIC8vIHRoZSBob3N0IGZpZWxkIHN0aWxsIHJldGFpbnMgdGhlbSwgdGhvdWdoXG4gICAgICBpZiAoaXB2Nkhvc3RuYW1lKSB7XG4gICAgICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lLnNsaWNlKDEsIC0xKTtcbiAgICAgICAgaWYgKHJlc3RbMF0gIT09IFwiL1wiKSB7XG4gICAgICAgICAgcmVzdCA9IFwiL1wiICsgcmVzdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIE5vdyByZXN0IGlzIHNldCB0byB0aGUgcG9zdC1ob3N0IHN0dWZmLlxuICAgIC8vIENob3Agb2ZmIGFueSBkZWxpbSBjaGFycy5cbiAgICBpZiAoIXVuc2FmZVByb3RvY29sLmhhcyhsb3dlclByb3RvKSkge1xuICAgICAgLy8gRmlyc3QsIG1ha2UgMTAwJSBzdXJlIHRoYXQgYW55IFwiYXV0b0VzY2FwZVwiIGNoYXJzIGdldFxuICAgICAgLy8gZXNjYXBlZCwgZXZlbiBpZiBlbmNvZGVVUklDb21wb25lbnQgZG9lc24ndCB0aGluayB0aGV5XG4gICAgICAvLyBuZWVkIHRvIGJlLlxuICAgICAgcmVzdCA9IGF1dG9Fc2NhcGVTdHIocmVzdCk7XG4gICAgfVxuXG4gICAgbGV0IHF1ZXN0aW9uSWR4ID0gLTE7XG4gICAgbGV0IGhhc2hJZHggPSAtMTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHJlc3QubGVuZ3RoOyArK2kpIHtcbiAgICAgIGNvbnN0IGNvZGUgPSByZXN0LmNoYXJDb2RlQXQoaSk7XG4gICAgICBpZiAoY29kZSA9PT0gQ0hBUl9IQVNIKSB7XG4gICAgICAgIHRoaXMuaGFzaCA9IHJlc3Quc2xpY2UoaSk7XG4gICAgICAgIGhhc2hJZHggPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH0gZWxzZSBpZiAoY29kZSA9PT0gQ0hBUl9RVUVTVElPTl9NQVJLICYmIHF1ZXN0aW9uSWR4ID09PSAtMSkge1xuICAgICAgICBxdWVzdGlvbklkeCA9IGk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHF1ZXN0aW9uSWR4ICE9PSAtMSkge1xuICAgICAgaWYgKGhhc2hJZHggPT09IC0xKSB7XG4gICAgICAgIHRoaXMuc2VhcmNoID0gcmVzdC5zbGljZShxdWVzdGlvbklkeCk7XG4gICAgICAgIHRoaXMucXVlcnkgPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4ICsgMSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnNlYXJjaCA9IHJlc3Quc2xpY2UocXVlc3Rpb25JZHgsIGhhc2hJZHgpO1xuICAgICAgICB0aGlzLnF1ZXJ5ID0gcmVzdC5zbGljZShxdWVzdGlvbklkeCArIDEsIGhhc2hJZHgpO1xuICAgICAgfVxuICAgICAgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAgICAgdGhpcy5xdWVyeSA9IHF1ZXJ5c3RyaW5nLnBhcnNlKHRoaXMucXVlcnkpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgLy8gTm8gcXVlcnkgc3RyaW5nLCBidXQgcGFyc2VRdWVyeVN0cmluZyBzdGlsbCByZXF1ZXN0ZWRcbiAgICAgIHRoaXMuc2VhcmNoID0gbnVsbDtcbiAgICAgIHRoaXMucXVlcnkgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZVF1ZXN0aW9uSWR4ID0gcXVlc3Rpb25JZHggIT09IC0xICYmXG4gICAgICAoaGFzaElkeCA9PT0gLTEgfHwgcXVlc3Rpb25JZHggPCBoYXNoSWR4KTtcbiAgICBjb25zdCBmaXJzdElkeCA9IHVzZVF1ZXN0aW9uSWR4ID8gcXVlc3Rpb25JZHggOiBoYXNoSWR4O1xuICAgIGlmIChmaXJzdElkeCA9PT0gLTEpIHtcbiAgICAgIGlmIChyZXN0Lmxlbmd0aCA+IDApIHRoaXMucGF0aG5hbWUgPSByZXN0O1xuICAgIH0gZWxzZSBpZiAoZmlyc3RJZHggPiAwKSB7XG4gICAgICB0aGlzLnBhdGhuYW1lID0gcmVzdC5zbGljZSgwLCBmaXJzdElkeCk7XG4gICAgfVxuICAgIGlmIChzbGFzaGVkUHJvdG9jb2wuaGFzKGxvd2VyUHJvdG8pICYmIHRoaXMuaG9zdG5hbWUgJiYgIXRoaXMucGF0aG5hbWUpIHtcbiAgICAgIHRoaXMucGF0aG5hbWUgPSBcIi9cIjtcbiAgICB9XG5cbiAgICAvLyBUbyBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmICh0aGlzLnBhdGhuYW1lIHx8IHRoaXMuc2VhcmNoKSB7XG4gICAgICBjb25zdCBwID0gdGhpcy5wYXRobmFtZSB8fCBcIlwiO1xuICAgICAgY29uc3QgcyA9IHRoaXMuc2VhcmNoIHx8IFwiXCI7XG4gICAgICB0aGlzLnBhdGggPSBwICsgcztcbiAgICB9XG5cbiAgICAvLyBGaW5hbGx5LCByZWNvbnN0cnVjdCB0aGUgaHJlZiBiYXNlZCBvbiB3aGF0IGhhcyBiZWVuIHZhbGlkYXRlZC5cbiAgICB0aGlzLmhyZWYgPSB0aGlzLmZvcm1hdCgpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXQoXG4gIHVybE9iamVjdDogc3RyaW5nIHwgVVJMIHwgVXJsLFxuICBvcHRpb25zPzoge1xuICAgIGF1dGg6IGJvb2xlYW47XG4gICAgZnJhZ21lbnQ6IGJvb2xlYW47XG4gICAgc2VhcmNoOiBib29sZWFuO1xuICAgIHVuaWNvZGU6IGJvb2xlYW47XG4gIH0sXG4pOiBzdHJpbmcge1xuICBpZiAodXJsT2JqZWN0IGluc3RhbmNlb2YgVVJMKSB7XG4gICAgcmV0dXJuIGZvcm1hdFdoYXR3Zyh1cmxPYmplY3QsIG9wdGlvbnMpO1xuICB9XG5cbiAgaWYgKHR5cGVvZiB1cmxPYmplY3QgPT09IFwic3RyaW5nXCIpIHtcbiAgICB1cmxPYmplY3QgPSBwYXJzZSh1cmxPYmplY3QsIHRydWUsIGZhbHNlKTtcbiAgfVxuICByZXR1cm4gdXJsT2JqZWN0LmZvcm1hdCgpO1xufVxuXG4vKipcbiAqIFRoZSBVUkwgb2JqZWN0IGhhcyBib3RoIGEgYHRvU3RyaW5nKClgIG1ldGhvZCBhbmQgYGhyZWZgIHByb3BlcnR5IHRoYXQgcmV0dXJuIHN0cmluZyBzZXJpYWxpemF0aW9ucyBvZiB0aGUgVVJMLlxuICogVGhlc2UgYXJlIG5vdCwgaG93ZXZlciwgY3VzdG9taXphYmxlIGluIGFueSB3YXkuXG4gKiBUaGlzIG1ldGhvZCBhbGxvd3MgZm9yIGJhc2ljIGN1c3RvbWl6YXRpb24gb2YgdGhlIG91dHB1dC5cbiAqIEBzZWUgVGVzdGVkIGluIGBwYXJhbGxlbC90ZXN0LXVybC1mb3JtYXQtd2hhdHdnLmpzYC5cbiAqIEBwYXJhbSB1cmxPYmplY3RcbiAqIEBwYXJhbSBvcHRpb25zXG4gKiBAcGFyYW0gb3B0aW9ucy5hdXRoIGB0cnVlYCBpZiB0aGUgc2VyaWFsaXplZCBVUkwgc3RyaW5nIHNob3VsZCBpbmNsdWRlIHRoZSB1c2VybmFtZSBhbmQgcGFzc3dvcmQsIGBmYWxzZWAgb3RoZXJ3aXNlLiAqKkRlZmF1bHQqKjogYHRydWVgLlxuICogQHBhcmFtIG9wdGlvbnMuZnJhZ21lbnQgYHRydWVgIGlmIHRoZSBzZXJpYWxpemVkIFVSTCBzdHJpbmcgc2hvdWxkIGluY2x1ZGUgdGhlIGZyYWdtZW50LCBgZmFsc2VgIG90aGVyd2lzZS4gKipEZWZhdWx0Kio6IGB0cnVlYC5cbiAqIEBwYXJhbSBvcHRpb25zLnNlYXJjaCBgdHJ1ZWAgaWYgdGhlIHNlcmlhbGl6ZWQgVVJMIHN0cmluZyBzaG91bGQgaW5jbHVkZSB0aGUgc2VhcmNoIHF1ZXJ5LCAqKkRlZmF1bHQqKjogYHRydWVgLlxuICogQHBhcmFtIG9wdGlvbnMudW5pY29kZSBgdHJ1ZWAgaWYgVW5pY29kZSBjaGFyYWN0ZXJzIGFwcGVhcmluZyBpbiB0aGUgaG9zdCBjb21wb25lbnQgb2YgdGhlIFVSTCBzdHJpbmcgc2hvdWxkIGJlIGVuY29kZWQgZGlyZWN0bHkgYXMgb3Bwb3NlZCB0byBiZWluZyBQdW55Y29kZSBlbmNvZGVkLiAqKkRlZmF1bHQqKjogYGZhbHNlYC5cbiAqIEByZXR1cm5zIGEgY3VzdG9taXphYmxlIHNlcmlhbGl6YXRpb24gb2YgYSBVUkwgYFN0cmluZ2AgcmVwcmVzZW50YXRpb24gb2YgYSBgV0hBVFdHIFVSTGAgb2JqZWN0LlxuICovXG5mdW5jdGlvbiBmb3JtYXRXaGF0d2coXG4gIHVybE9iamVjdDogc3RyaW5nIHwgVVJMLFxuICBvcHRpb25zPzoge1xuICAgIGF1dGg6IGJvb2xlYW47XG4gICAgZnJhZ21lbnQ6IGJvb2xlYW47XG4gICAgc2VhcmNoOiBib29sZWFuO1xuICAgIHVuaWNvZGU6IGJvb2xlYW47XG4gIH0sXG4pOiBzdHJpbmcge1xuICBpZiAodHlwZW9mIHVybE9iamVjdCA9PT0gXCJzdHJpbmdcIikge1xuICAgIHVybE9iamVjdCA9IG5ldyBVUkwodXJsT2JqZWN0KTtcbiAgfVxuICBpZiAob3B0aW9ucykge1xuICAgIGlmICh0eXBlb2Ygb3B0aW9ucyAhPT0gXCJvYmplY3RcIikge1xuICAgICAgdGhyb3cgbmV3IEVSUl9JTlZBTElEX0FSR19UWVBFKFwib3B0aW9uc1wiLCBcIm9iamVjdFwiLCBvcHRpb25zKTtcbiAgICB9XG4gIH1cblxuICBvcHRpb25zID0ge1xuICAgIGF1dGg6IHRydWUsXG4gICAgZnJhZ21lbnQ6IHRydWUsXG4gICAgc2VhcmNoOiB0cnVlLFxuICAgIHVuaWNvZGU6IGZhbHNlLFxuICAgIC4uLm9wdGlvbnMsXG4gIH07XG5cbiAgbGV0IHJldCA9IHVybE9iamVjdC5wcm90b2NvbDtcbiAgaWYgKHVybE9iamVjdC5ob3N0ICE9PSBudWxsKSB7XG4gICAgcmV0ICs9IFwiLy9cIjtcbiAgICBjb25zdCBoYXNVc2VybmFtZSA9ICEhdXJsT2JqZWN0LnVzZXJuYW1lO1xuICAgIGNvbnN0IGhhc1Bhc3N3b3JkID0gISF1cmxPYmplY3QucGFzc3dvcmQ7XG4gICAgaWYgKG9wdGlvbnMuYXV0aCAmJiAoaGFzVXNlcm5hbWUgfHwgaGFzUGFzc3dvcmQpKSB7XG4gICAgICBpZiAoaGFzVXNlcm5hbWUpIHtcbiAgICAgICAgcmV0ICs9IHVybE9iamVjdC51c2VybmFtZTtcbiAgICAgIH1cbiAgICAgIGlmIChoYXNQYXNzd29yZCkge1xuICAgICAgICByZXQgKz0gYDoke3VybE9iamVjdC5wYXNzd29yZH1gO1xuICAgICAgfVxuICAgICAgcmV0ICs9IFwiQFwiO1xuICAgIH1cbiAgICAvLyBUT0RPKHdhZnV3ZnUxMyk6IFN1cHBvcnQgdW5pY29kZSBvcHRpb25cbiAgICAvLyByZXQgKz0gb3B0aW9ucy51bmljb2RlID9cbiAgICAvLyAgIGRvbWFpblRvVW5pY29kZSh1cmxPYmplY3QuaG9zdCkgOiB1cmxPYmplY3QuaG9zdDtcbiAgICByZXQgKz0gdXJsT2JqZWN0Lmhvc3Q7XG4gICAgaWYgKHVybE9iamVjdC5wb3J0KSB7XG4gICAgICByZXQgKz0gYDoke3VybE9iamVjdC5wb3J0fWA7XG4gICAgfVxuICB9XG5cbiAgcmV0ICs9IHVybE9iamVjdC5wYXRobmFtZTtcblxuICBpZiAob3B0aW9ucy5zZWFyY2ggJiYgdXJsT2JqZWN0LnNlYXJjaCkge1xuICAgIHJldCArPSB1cmxPYmplY3Quc2VhcmNoO1xuICB9XG4gIGlmIChvcHRpb25zLmZyYWdtZW50ICYmIHVybE9iamVjdC5oYXNoKSB7XG4gICAgcmV0ICs9IHVybE9iamVjdC5oYXNoO1xuICB9XG5cbiAgcmV0dXJuIHJldDtcbn1cblxuZnVuY3Rpb24gaXNJcHY2SG9zdG5hbWUoaG9zdG5hbWU6IHN0cmluZykge1xuICByZXR1cm4gKFxuICAgIGhvc3RuYW1lLmNoYXJDb2RlQXQoMCkgPT09IENIQVJfTEVGVF9TUVVBUkVfQlJBQ0tFVCAmJlxuICAgIGhvc3RuYW1lLmNoYXJDb2RlQXQoaG9zdG5hbWUubGVuZ3RoIC0gMSkgPT09IENIQVJfUklHSFRfU1FVQVJFX0JSQUNLRVRcbiAgKTtcbn1cblxuZnVuY3Rpb24gZ2V0SG9zdG5hbWUoc2VsZjogVXJsLCByZXN0OiBzdHJpbmcsIGhvc3RuYW1lOiBzdHJpbmcpIHtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBob3N0bmFtZS5sZW5ndGg7ICsraSkge1xuICAgIGNvbnN0IGNvZGUgPSBob3N0bmFtZS5jaGFyQ29kZUF0KGkpO1xuICAgIGNvbnN0IGlzVmFsaWQgPSAoY29kZSA+PSBDSEFSX0xPV0VSQ0FTRV9BICYmIGNvZGUgPD0gQ0hBUl9MT1dFUkNBU0VfWikgfHxcbiAgICAgIGNvZGUgPT09IENIQVJfRE9UIHx8XG4gICAgICAoY29kZSA+PSBDSEFSX1VQUEVSQ0FTRV9BICYmIGNvZGUgPD0gQ0hBUl9VUFBFUkNBU0VfWikgfHxcbiAgICAgIChjb2RlID49IENIQVJfMCAmJiBjb2RlIDw9IENIQVJfOSkgfHxcbiAgICAgIGNvZGUgPT09IENIQVJfSFlQSEVOX01JTlVTIHx8XG4gICAgICBjb2RlID09PSBDSEFSX1BMVVMgfHxcbiAgICAgIGNvZGUgPT09IENIQVJfVU5ERVJTQ09SRSB8fFxuICAgICAgY29kZSA+IDEyNztcblxuICAgIC8vIEludmFsaWQgaG9zdCBjaGFyYWN0ZXJcbiAgICBpZiAoIWlzVmFsaWQpIHtcbiAgICAgIHNlbGYuaG9zdG5hbWUgPSBob3N0bmFtZS5zbGljZSgwLCBpKTtcbiAgICAgIHJldHVybiBgLyR7aG9zdG5hbWUuc2xpY2UoaSl9JHtyZXN0fWA7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN0O1xufVxuXG4vLyBFc2NhcGVkIGNoYXJhY3RlcnMuIFVzZSBlbXB0eSBzdHJpbmdzIHRvIGZpbGwgdXAgdW51c2VkIGVudHJpZXMuXG4vLyBVc2luZyBBcnJheSBpcyBmYXN0ZXIgdGhhbiBPYmplY3QvTWFwXG4vLyBkZW5vLWZtdC1pZ25vcmVcbmNvbnN0IGVzY2FwZWRDb2RlcyA9IFtcbiAgLyogMCAtIDkgKi8gXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCIlMDlcIixcbiAgLyogMTAgLSAxOSAqLyBcIiUwQVwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIiUwRFwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICAvKiAyMCAtIDI5ICovIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIC8qIDMwIC0gMzkgKi8gXCJcIixcbiAgXCJcIixcbiAgXCIlMjBcIixcbiAgXCJcIixcbiAgXCIlMjJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCIlMjdcIixcbiAgLyogNDAgLSA0OSAqLyBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICAvKiA1MCAtIDU5ICovIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIC8qIDYwIC0gNjkgKi8gXCIlM0NcIixcbiAgXCJcIixcbiAgXCIlM0VcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgLyogNzAgLSA3OSAqLyBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICAvKiA4MCAtIDg5ICovIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIC8qIDkwIC0gOTkgKi8gXCJcIixcbiAgXCJcIixcbiAgXCIlNUNcIixcbiAgXCJcIixcbiAgXCIlNUVcIixcbiAgXCJcIixcbiAgXCIlNjBcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgLyogMTAwIC0gMTA5ICovIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIC8qIDExMCAtIDExOSAqLyBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICAvKiAxMjAgLSAxMjUgKi8gXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCIlN0JcIixcbiAgXCIlN0NcIixcbiAgXCIlN0RcIlxuXTtcblxuLy8gQXV0b21hdGljYWxseSBlc2NhcGUgYWxsIGRlbGltaXRlcnMgYW5kIHVud2lzZSBjaGFyYWN0ZXJzIGZyb20gUkZDIDIzOTYuXG4vLyBBbHNvIGVzY2FwZSBzaW5nbGUgcXVvdGVzIGluIGNhc2Ugb2YgYW4gWFNTIGF0dGFjay5cbi8vIFJldHVybiB0aGUgZXNjYXBlZCBzdHJpbmcuXG5mdW5jdGlvbiBhdXRvRXNjYXBlU3RyKHJlc3Q6IHN0cmluZykge1xuICBsZXQgZXNjYXBlZCA9IFwiXCI7XG4gIGxldCBsYXN0RXNjYXBlZFBvcyA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcmVzdC5sZW5ndGg7ICsraSkge1xuICAgIC8vIGBlc2NhcGVkYCBjb250YWlucyBzdWJzdHJpbmcgdXAgdG8gdGhlIGxhc3QgZXNjYXBlZCBjaGFyYWN0ZXIuXG4gICAgY29uc3QgZXNjYXBlZENoYXIgPSBlc2NhcGVkQ29kZXNbcmVzdC5jaGFyQ29kZUF0KGkpXTtcbiAgICBpZiAoZXNjYXBlZENoYXIpIHtcbiAgICAgIC8vIENvbmNhdCBpZiB0aGVyZSBhcmUgb3JkaW5hcnkgY2hhcmFjdGVycyBpbiB0aGUgbWlkZGxlLlxuICAgICAgaWYgKGkgPiBsYXN0RXNjYXBlZFBvcykge1xuICAgICAgICBlc2NhcGVkICs9IHJlc3Quc2xpY2UobGFzdEVzY2FwZWRQb3MsIGkpO1xuICAgICAgfVxuICAgICAgZXNjYXBlZCArPSBlc2NhcGVkQ2hhcjtcbiAgICAgIGxhc3RFc2NhcGVkUG9zID0gaSArIDE7XG4gICAgfVxuICB9XG4gIGlmIChsYXN0RXNjYXBlZFBvcyA9PT0gMCkge1xuICAgIC8vIE5vdGhpbmcgaGFzIGJlZW4gZXNjYXBlZC5cbiAgICByZXR1cm4gcmVzdDtcbiAgfVxuXG4gIC8vIFRoZXJlIGFyZSBvcmRpbmFyeSBjaGFyYWN0ZXJzIGF0IHRoZSBlbmQuXG4gIGlmIChsYXN0RXNjYXBlZFBvcyA8IHJlc3QubGVuZ3RoKSB7XG4gICAgZXNjYXBlZCArPSByZXN0LnNsaWNlKGxhc3RFc2NhcGVkUG9zKTtcbiAgfVxuXG4gIHJldHVybiBlc2NhcGVkO1xufVxuXG4vKipcbiAqIFRoZSB1cmwudXJsUGFyc2UoKSBtZXRob2QgdGFrZXMgYSBVUkwgc3RyaW5nLCBwYXJzZXMgaXQsIGFuZCByZXR1cm5zIGEgVVJMIG9iamVjdC5cbiAqXG4gKiBAc2VlIFRlc3RlZCBpbiBgcGFyYWxsZWwvdGVzdC11cmwtcGFyc2UtZm9ybWF0LmpzYC5cbiAqIEBwYXJhbSB1cmwgVGhlIFVSTCBzdHJpbmcgdG8gcGFyc2UuXG4gKiBAcGFyYW0gcGFyc2VRdWVyeVN0cmluZyBJZiBgdHJ1ZWAsIHRoZSBxdWVyeSBwcm9wZXJ0eSB3aWxsIGFsd2F5cyBiZSBzZXQgdG8gYW4gb2JqZWN0IHJldHVybmVkIGJ5IHRoZSBxdWVyeXN0cmluZyBtb2R1bGUncyBwYXJzZSgpIG1ldGhvZC4gSWYgZmFsc2UsXG4gKiB0aGUgcXVlcnkgcHJvcGVydHkgb24gdGhlIHJldHVybmVkIFVSTCBvYmplY3Qgd2lsbCBiZSBhbiB1bnBhcnNlZCwgdW5kZWNvZGVkIHN0cmluZy4gRGVmYXVsdDogZmFsc2UuXG4gKiBAcGFyYW0gc2xhc2hlc0Rlbm90ZUhvc3QgSWYgYHRydWVgLCB0aGUgZmlyc3QgdG9rZW4gYWZ0ZXIgdGhlIGxpdGVyYWwgc3RyaW5nIC8vIGFuZCBwcmVjZWRpbmcgdGhlIG5leHQgLyB3aWxsIGJlIGludGVycHJldGVkIGFzIHRoZSBob3N0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZShcbiAgdXJsOiBzdHJpbmcgfCBVcmwsXG4gIHBhcnNlUXVlcnlTdHJpbmc6IGJvb2xlYW4sXG4gIHNsYXNoZXNEZW5vdGVIb3N0OiBib29sZWFuLFxuKSB7XG4gIGlmICh1cmwgaW5zdGFuY2VvZiBVcmwpIHJldHVybiB1cmw7XG5cbiAgY29uc3QgdXJsT2JqZWN0ID0gbmV3IFVybCgpO1xuICB1cmxPYmplY3QudXJsUGFyc2UodXJsLCBwYXJzZVF1ZXJ5U3RyaW5nLCBzbGFzaGVzRGVub3RlSG9zdCk7XG4gIHJldHVybiB1cmxPYmplY3Q7XG59XG5cbi8qKiBUaGUgdXJsLnJlc29sdmUoKSBtZXRob2QgcmVzb2x2ZXMgYSB0YXJnZXQgVVJMIHJlbGF0aXZlIHRvIGEgYmFzZSBVUkwgaW4gYSBtYW5uZXIgc2ltaWxhciB0byB0aGF0IG9mIGEgV2ViIGJyb3dzZXIgcmVzb2x2aW5nIGFuIGFuY2hvciB0YWcgSFJFRi5cbiAqIEBzZWUgaHR0cHM6Ly9ub2RlanMub3JnL2FwaS91cmwuaHRtbCN1cmxyZXNvbHZlZnJvbS10b1xuICogQGxlZ2FjeVxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZShmcm9tOiBzdHJpbmcsIHRvOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHBhcnNlKGZyb20sIGZhbHNlLCB0cnVlKS5yZXNvbHZlKHRvKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVPYmplY3Qoc291cmNlOiBzdHJpbmcgfCBVcmwsIHJlbGF0aXZlOiBzdHJpbmcpIHtcbiAgaWYgKCFzb3VyY2UpIHJldHVybiByZWxhdGl2ZTtcbiAgcmV0dXJuIHBhcnNlKHNvdXJjZSwgZmFsc2UsIHRydWUpLnJlc29sdmVPYmplY3QocmVsYXRpdmUpO1xufVxuXG4vKipcbiAqIFRoaXMgZnVuY3Rpb24gZW5zdXJlcyB0aGUgY29ycmVjdCBkZWNvZGluZ3Mgb2YgcGVyY2VudC1lbmNvZGVkIGNoYXJhY3RlcnMgYXMgd2VsbCBhcyBlbnN1cmluZyBhIGNyb3NzLXBsYXRmb3JtIHZhbGlkIGFic29sdXRlIHBhdGggc3RyaW5nLlxuICogQHNlZSBUZXN0ZWQgaW4gYHBhcmFsbGVsL3Rlc3QtZmlsZXVybHRvcGF0aC5qc2AuXG4gKiBAcGFyYW0gcGF0aCBUaGUgZmlsZSBVUkwgc3RyaW5nIG9yIFVSTCBvYmplY3QgdG8gY29udmVydCB0byBhIHBhdGguXG4gKiBAcmV0dXJucyBUaGUgZnVsbHktcmVzb2x2ZWQgcGxhdGZvcm0tc3BlY2lmaWMgTm9kZS5qcyBmaWxlIHBhdGguXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaWxlVVJMVG9QYXRoKHBhdGg6IHN0cmluZyB8IFVSTCk6IHN0cmluZyB7XG4gIGlmICh0eXBlb2YgcGF0aCA9PT0gXCJzdHJpbmdcIikgcGF0aCA9IG5ldyBVUkwocGF0aCk7XG4gIGVsc2UgaWYgKCEocGF0aCBpbnN0YW5jZW9mIFVSTCkpIHtcbiAgICB0aHJvdyBuZXcgRVJSX0lOVkFMSURfQVJHX1RZUEUoXCJwYXRoXCIsIFtcInN0cmluZ1wiLCBcIlVSTFwiXSwgcGF0aCk7XG4gIH1cbiAgaWYgKHBhdGgucHJvdG9jb2wgIT09IFwiZmlsZTpcIikge1xuICAgIHRocm93IG5ldyBFUlJfSU5WQUxJRF9VUkxfU0NIRU1FKFwiZmlsZVwiKTtcbiAgfVxuICByZXR1cm4gaXNXaW5kb3dzID8gZ2V0UGF0aEZyb21VUkxXaW4ocGF0aCkgOiBnZXRQYXRoRnJvbVVSTFBvc2l4KHBhdGgpO1xufVxuXG5mdW5jdGlvbiBnZXRQYXRoRnJvbVVSTFdpbih1cmw6IFVSTCk6IHN0cmluZyB7XG4gIGNvbnN0IGhvc3RuYW1lID0gdXJsLmhvc3RuYW1lO1xuICBsZXQgcGF0aG5hbWUgPSB1cmwucGF0aG5hbWU7XG4gIGZvciAobGV0IG4gPSAwOyBuIDwgcGF0aG5hbWUubGVuZ3RoOyBuKyspIHtcbiAgICBpZiAocGF0aG5hbWVbbl0gPT09IFwiJVwiKSB7XG4gICAgICBjb25zdCB0aGlyZCA9IHBhdGhuYW1lLmNvZGVQb2ludEF0KG4gKyAyKSEgfCAweDIwO1xuICAgICAgaWYgKFxuICAgICAgICAocGF0aG5hbWVbbiArIDFdID09PSBcIjJcIiAmJiB0aGlyZCA9PT0gMTAyKSB8fCAvLyAyZiAyRiAvXG4gICAgICAgIChwYXRobmFtZVtuICsgMV0gPT09IFwiNVwiICYmIHRoaXJkID09PSA5OSkgLy8gNWMgNUMgXFxcbiAgICAgICkge1xuICAgICAgICB0aHJvdyBuZXcgRVJSX0lOVkFMSURfRklMRV9VUkxfUEFUSChcbiAgICAgICAgICBcIm11c3Qgbm90IGluY2x1ZGUgZW5jb2RlZCBcXFxcIG9yIC8gY2hhcmFjdGVyc1wiLFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHBhdGhuYW1lID0gcGF0aG5hbWUucmVwbGFjZShmb3J3YXJkU2xhc2hSZWdFeCwgXCJcXFxcXCIpO1xuICBwYXRobmFtZSA9IGRlY29kZVVSSUNvbXBvbmVudChwYXRobmFtZSk7XG4gIGlmIChob3N0bmFtZSAhPT0gXCJcIikge1xuICAgIC8vIFRPRE8oYmFydGxvbWllanUpOiBhZGQgc3VwcG9ydCBmb3IgcHVueWNvZGUgZW5jb2RpbmdzXG4gICAgcmV0dXJuIGBcXFxcXFxcXCR7aG9zdG5hbWV9JHtwYXRobmFtZX1gO1xuICB9IGVsc2Uge1xuICAgIC8vIE90aGVyd2lzZSwgaXQncyBhIGxvY2FsIHBhdGggdGhhdCByZXF1aXJlcyBhIGRyaXZlIGxldHRlclxuICAgIGNvbnN0IGxldHRlciA9IHBhdGhuYW1lLmNvZGVQb2ludEF0KDEpISB8IDB4MjA7XG4gICAgY29uc3Qgc2VwID0gcGF0aG5hbWVbMl07XG4gICAgaWYgKFxuICAgICAgbGV0dGVyIDwgQ0hBUl9MT1dFUkNBU0VfQSB8fFxuICAgICAgbGV0dGVyID4gQ0hBUl9MT1dFUkNBU0VfWiB8fCAvLyBhLi56IEEuLlpcbiAgICAgIHNlcCAhPT0gXCI6XCJcbiAgICApIHtcbiAgICAgIHRocm93IG5ldyBFUlJfSU5WQUxJRF9GSUxFX1VSTF9QQVRIKFwibXVzdCBiZSBhYnNvbHV0ZVwiKTtcbiAgICB9XG4gICAgcmV0dXJuIHBhdGhuYW1lLnNsaWNlKDEpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldFBhdGhGcm9tVVJMUG9zaXgodXJsOiBVUkwpOiBzdHJpbmcge1xuICBpZiAodXJsLmhvc3RuYW1lICE9PSBcIlwiKSB7XG4gICAgdGhyb3cgbmV3IEVSUl9JTlZBTElEX0ZJTEVfVVJMX0hPU1Qob3NUeXBlKTtcbiAgfVxuICBjb25zdCBwYXRobmFtZSA9IHVybC5wYXRobmFtZTtcbiAgZm9yIChsZXQgbiA9IDA7IG4gPCBwYXRobmFtZS5sZW5ndGg7IG4rKykge1xuICAgIGlmIChwYXRobmFtZVtuXSA9PT0gXCIlXCIpIHtcbiAgICAgIGNvbnN0IHRoaXJkID0gcGF0aG5hbWUuY29kZVBvaW50QXQobiArIDIpISB8IDB4MjA7XG4gICAgICBpZiAocGF0aG5hbWVbbiArIDFdID09PSBcIjJcIiAmJiB0aGlyZCA9PT0gMTAyKSB7XG4gICAgICAgIHRocm93IG5ldyBFUlJfSU5WQUxJRF9GSUxFX1VSTF9QQVRIKFxuICAgICAgICAgIFwibXVzdCBub3QgaW5jbHVkZSBlbmNvZGVkIC8gY2hhcmFjdGVyc1wiLFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHBhdGhuYW1lKTtcbn1cblxuLyoqXG4gKiAgVGhlIGZvbGxvd2luZyBjaGFyYWN0ZXJzIGFyZSBwZXJjZW50LWVuY29kZWQgd2hlbiBjb252ZXJ0aW5nIGZyb20gZmlsZSBwYXRoXG4gKiAgdG8gVVJMOlxuICogIC0gJTogVGhlIHBlcmNlbnQgY2hhcmFjdGVyIGlzIHRoZSBvbmx5IGNoYXJhY3RlciBub3QgZW5jb2RlZCBieSB0aGVcbiAqICAgICAgIGBwYXRobmFtZWAgc2V0dGVyLlxuICogIC0gXFw6IEJhY2tzbGFzaCBpcyBlbmNvZGVkIG9uIG5vbi13aW5kb3dzIHBsYXRmb3JtcyBzaW5jZSBpdCdzIGEgdmFsaWRcbiAqICAgICAgIGNoYXJhY3RlciBidXQgdGhlIGBwYXRobmFtZWAgc2V0dGVycyByZXBsYWNlcyBpdCBieSBhIGZvcndhcmQgc2xhc2guXG4gKiAgLSBMRjogVGhlIG5ld2xpbmUgY2hhcmFjdGVyIGlzIHN0cmlwcGVkIG91dCBieSB0aGUgYHBhdGhuYW1lYCBzZXR0ZXIuXG4gKiAgICAgICAgKFNlZSB3aGF0d2cvdXJsIzQxOSlcbiAqICAtIENSOiBUaGUgY2FycmlhZ2UgcmV0dXJuIGNoYXJhY3RlciBpcyBhbHNvIHN0cmlwcGVkIG91dCBieSB0aGUgYHBhdGhuYW1lYFxuICogICAgICAgIHNldHRlci5cbiAqICAtIFRBQjogVGhlIHRhYiBjaGFyYWN0ZXIgaXMgYWxzbyBzdHJpcHBlZCBvdXQgYnkgdGhlIGBwYXRobmFtZWAgc2V0dGVyLlxuICovXG5mdW5jdGlvbiBlbmNvZGVQYXRoQ2hhcnMoZmlsZXBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmIChmaWxlcGF0aC5pbmNsdWRlcyhcIiVcIikpIHtcbiAgICBmaWxlcGF0aCA9IGZpbGVwYXRoLnJlcGxhY2UocGVyY2VudFJlZ0V4LCBcIiUyNVwiKTtcbiAgfVxuICAvLyBJbiBwb3NpeCwgYmFja3NsYXNoIGlzIGEgdmFsaWQgY2hhcmFjdGVyIGluIHBhdGhzOlxuICBpZiAoIWlzV2luZG93cyAmJiBmaWxlcGF0aC5pbmNsdWRlcyhcIlxcXFxcIikpIHtcbiAgICBmaWxlcGF0aCA9IGZpbGVwYXRoLnJlcGxhY2UoYmFja3NsYXNoUmVnRXgsIFwiJTVDXCIpO1xuICB9XG4gIGlmIChmaWxlcGF0aC5pbmNsdWRlcyhcIlxcblwiKSkge1xuICAgIGZpbGVwYXRoID0gZmlsZXBhdGgucmVwbGFjZShuZXdsaW5lUmVnRXgsIFwiJTBBXCIpO1xuICB9XG4gIGlmIChmaWxlcGF0aC5pbmNsdWRlcyhcIlxcclwiKSkge1xuICAgIGZpbGVwYXRoID0gZmlsZXBhdGgucmVwbGFjZShjYXJyaWFnZVJldHVyblJlZ0V4LCBcIiUwRFwiKTtcbiAgfVxuICBpZiAoZmlsZXBhdGguaW5jbHVkZXMoXCJcXHRcIikpIHtcbiAgICBmaWxlcGF0aCA9IGZpbGVwYXRoLnJlcGxhY2UodGFiUmVnRXgsIFwiJTA5XCIpO1xuICB9XG4gIHJldHVybiBmaWxlcGF0aDtcbn1cblxuLyoqXG4gKiBUaGlzIGZ1bmN0aW9uIGVuc3VyZXMgdGhhdCBgZmlsZXBhdGhgIGlzIHJlc29sdmVkIGFic29sdXRlbHksIGFuZCB0aGF0IHRoZSBVUkwgY29udHJvbCBjaGFyYWN0ZXJzIGFyZSBjb3JyZWN0bHkgZW5jb2RlZCB3aGVuIGNvbnZlcnRpbmcgaW50byBhIEZpbGUgVVJMLlxuICogQHNlZSBUZXN0ZWQgaW4gYHBhcmFsbGVsL3Rlc3QtdXJsLXBhdGh0b2ZpbGV1cmwuanNgLlxuICogQHBhcmFtIGZpbGVwYXRoIFRoZSBmaWxlIHBhdGggc3RyaW5nIHRvIGNvbnZlcnQgdG8gYSBmaWxlIFVSTC5cbiAqIEByZXR1cm5zIFRoZSBmaWxlIFVSTCBvYmplY3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXRoVG9GaWxlVVJMKGZpbGVwYXRoOiBzdHJpbmcpOiBVUkwge1xuICBjb25zdCBvdXRVUkwgPSBuZXcgVVJMKFwiZmlsZTovL1wiKTtcbiAgaWYgKGlzV2luZG93cyAmJiBmaWxlcGF0aC5zdGFydHNXaXRoKFwiXFxcXFxcXFxcIikpIHtcbiAgICAvLyBVTkMgcGF0aCBmb3JtYXQ6IFxcXFxzZXJ2ZXJcXHNoYXJlXFxyZXNvdXJjZVxuICAgIGNvbnN0IHBhdGhzID0gZmlsZXBhdGguc3BsaXQoXCJcXFxcXCIpO1xuICAgIGlmIChwYXRocy5sZW5ndGggPD0gMykge1xuICAgICAgdGhyb3cgbmV3IEVSUl9JTlZBTElEX0FSR19WQUxVRShcbiAgICAgICAgXCJmaWxlcGF0aFwiLFxuICAgICAgICBmaWxlcGF0aCxcbiAgICAgICAgXCJNaXNzaW5nIFVOQyByZXNvdXJjZSBwYXRoXCIsXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCBob3N0bmFtZSA9IHBhdGhzWzJdO1xuICAgIGlmIChob3N0bmFtZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBFUlJfSU5WQUxJRF9BUkdfVkFMVUUoXG4gICAgICAgIFwiZmlsZXBhdGhcIixcbiAgICAgICAgZmlsZXBhdGgsXG4gICAgICAgIFwiRW1wdHkgVU5DIHNlcnZlcm5hbWVcIixcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gVE9ETyh3YWZ1d2FmdTEzKTogVG8gYmUgYG91dFVSTC5ob3N0bmFtZSA9IGRvbWFpblRvQVNDSUkoaG9zdG5hbWUpYCBvbmNlIGBkb21haW5Ub0FTQ0lJYCBhcmUgaW1wbGVtZW50ZWRcbiAgICBvdXRVUkwuaG9zdG5hbWUgPSBob3N0bmFtZTtcbiAgICBvdXRVUkwucGF0aG5hbWUgPSBlbmNvZGVQYXRoQ2hhcnMocGF0aHMuc2xpY2UoMykuam9pbihcIi9cIikpO1xuICB9IGVsc2Uge1xuICAgIGxldCByZXNvbHZlZCA9IHBhdGgucmVzb2x2ZShmaWxlcGF0aCk7XG4gICAgLy8gcGF0aC5yZXNvbHZlIHN0cmlwcyB0cmFpbGluZyBzbGFzaGVzIHNvIHdlIG11c3QgYWRkIHRoZW0gYmFja1xuICAgIGNvbnN0IGZpbGVQYXRoTGFzdCA9IGZpbGVwYXRoLmNoYXJDb2RlQXQoZmlsZXBhdGgubGVuZ3RoIC0gMSk7XG4gICAgaWYgKFxuICAgICAgKGZpbGVQYXRoTGFzdCA9PT0gQ0hBUl9GT1JXQVJEX1NMQVNIIHx8XG4gICAgICAgIChpc1dpbmRvd3MgJiYgZmlsZVBhdGhMYXN0ID09PSBDSEFSX0JBQ0tXQVJEX1NMQVNIKSkgJiZcbiAgICAgIHJlc29sdmVkW3Jlc29sdmVkLmxlbmd0aCAtIDFdICE9PSBwYXRoLnNlcFxuICAgICkge1xuICAgICAgcmVzb2x2ZWQgKz0gXCIvXCI7XG4gICAgfVxuXG4gICAgb3V0VVJMLnBhdGhuYW1lID0gZW5jb2RlUGF0aENoYXJzKHJlc29sdmVkKTtcbiAgfVxuICByZXR1cm4gb3V0VVJMO1xufVxuXG5pbnRlcmZhY2UgSHR0cE9wdGlvbnMge1xuICBwcm90b2NvbDogc3RyaW5nO1xuICBob3N0bmFtZTogc3RyaW5nO1xuICBoYXNoOiBzdHJpbmc7XG4gIHNlYXJjaDogc3RyaW5nO1xuICBwYXRobmFtZTogc3RyaW5nO1xuICBwYXRoOiBzdHJpbmc7XG4gIGhyZWY6IHN0cmluZztcbiAgcG9ydD86IG51bWJlcjtcbiAgYXV0aD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBUaGlzIHV0aWxpdHkgZnVuY3Rpb24gY29udmVydHMgYSBVUkwgb2JqZWN0IGludG8gYW4gb3JkaW5hcnkgb3B0aW9ucyBvYmplY3QgYXMgZXhwZWN0ZWQgYnkgdGhlIGBodHRwLnJlcXVlc3QoKWAgYW5kIGBodHRwcy5yZXF1ZXN0KClgIEFQSXMuXG4gKiBAc2VlIFRlc3RlZCBpbiBgcGFyYWxsZWwvdGVzdC11cmwtdXJsdG9vcHRpb25zLmpzYC5cbiAqIEBwYXJhbSB1cmwgVGhlIGBXSEFUV0cgVVJMYCBvYmplY3QgdG8gY29udmVydCB0byBhbiBvcHRpb25zIG9iamVjdC5cbiAqIEByZXR1cm5zIEh0dHBPcHRpb25zXG4gKiBAcmV0dXJucyBIdHRwT3B0aW9ucy5wcm90b2NvbCBQcm90b2NvbCB0byB1c2UuXG4gKiBAcmV0dXJucyBIdHRwT3B0aW9ucy5ob3N0bmFtZSBBIGRvbWFpbiBuYW1lIG9yIElQIGFkZHJlc3Mgb2YgdGhlIHNlcnZlciB0byBpc3N1ZSB0aGUgcmVxdWVzdCB0by5cbiAqIEByZXR1cm5zIEh0dHBPcHRpb25zLmhhc2ggVGhlIGZyYWdtZW50IHBvcnRpb24gb2YgdGhlIFVSTC5cbiAqIEByZXR1cm5zIEh0dHBPcHRpb25zLnNlYXJjaCBUaGUgc2VyaWFsaXplZCBxdWVyeSBwb3J0aW9uIG9mIHRoZSBVUkwuXG4gKiBAcmV0dXJucyBIdHRwT3B0aW9ucy5wYXRobmFtZSBUaGUgcGF0aCBwb3J0aW9uIG9mIHRoZSBVUkwuXG4gKiBAcmV0dXJucyBIdHRwT3B0aW9ucy5wYXRoIFJlcXVlc3QgcGF0aC4gU2hvdWxkIGluY2x1ZGUgcXVlcnkgc3RyaW5nIGlmIGFueS4gRS5HLiBgJy9pbmRleC5odG1sP3BhZ2U9MTInYC4gQW4gZXhjZXB0aW9uIGlzIHRocm93biB3aGVuIHRoZSByZXF1ZXN0IHBhdGggY29udGFpbnMgaWxsZWdhbCBjaGFyYWN0ZXJzLiBDdXJyZW50bHksIG9ubHkgc3BhY2VzIGFyZSByZWplY3RlZCBidXQgdGhhdCBtYXkgY2hhbmdlIGluIHRoZSBmdXR1cmUuXG4gKiBAcmV0dXJucyBIdHRwT3B0aW9ucy5ocmVmIFRoZSBzZXJpYWxpemVkIFVSTC5cbiAqIEByZXR1cm5zIEh0dHBPcHRpb25zLnBvcnQgUG9ydCBvZiByZW1vdGUgc2VydmVyLlxuICogQHJldHVybnMgSHR0cE9wdGlvbnMuYXV0aCBCYXNpYyBhdXRoZW50aWNhdGlvbiBpLmUuIGAndXNlcjpwYXNzd29yZCdgIHRvIGNvbXB1dGUgYW4gQXV0aG9yaXphdGlvbiBoZWFkZXIuXG4gKi9cbmZ1bmN0aW9uIHVybFRvSHR0cE9wdGlvbnModXJsOiBVUkwpOiBIdHRwT3B0aW9ucyB7XG4gIGNvbnN0IG9wdGlvbnM6IEh0dHBPcHRpb25zID0ge1xuICAgIHByb3RvY29sOiB1cmwucHJvdG9jb2wsXG4gICAgaG9zdG5hbWU6IHR5cGVvZiB1cmwuaG9zdG5hbWUgPT09IFwic3RyaW5nXCIgJiYgdXJsLmhvc3RuYW1lLnN0YXJ0c1dpdGgoXCJbXCIpXG4gICAgICA/IHVybC5ob3N0bmFtZS5zbGljZSgxLCAtMSlcbiAgICAgIDogdXJsLmhvc3RuYW1lLFxuICAgIGhhc2g6IHVybC5oYXNoLFxuICAgIHNlYXJjaDogdXJsLnNlYXJjaCxcbiAgICBwYXRobmFtZTogdXJsLnBhdGhuYW1lLFxuICAgIHBhdGg6IGAke3VybC5wYXRobmFtZSB8fCBcIlwifSR7dXJsLnNlYXJjaCB8fCBcIlwifWAsXG4gICAgaHJlZjogdXJsLmhyZWYsXG4gIH07XG4gIGlmICh1cmwucG9ydCAhPT0gXCJcIikge1xuICAgIG9wdGlvbnMucG9ydCA9IE51bWJlcih1cmwucG9ydCk7XG4gIH1cbiAgaWYgKHVybC51c2VybmFtZSB8fCB1cmwucGFzc3dvcmQpIHtcbiAgICBvcHRpb25zLmF1dGggPSBgJHtkZWNvZGVVUklDb21wb25lbnQodXJsLnVzZXJuYW1lKX06JHtcbiAgICAgIGRlY29kZVVSSUNvbXBvbmVudChcbiAgICAgICAgdXJsLnBhc3N3b3JkLFxuICAgICAgKVxuICAgIH1gO1xuICB9XG4gIHJldHVybiBvcHRpb25zO1xufVxuXG5leHBvcnQgZGVmYXVsdCB7XG4gIHBhcnNlLFxuICBmb3JtYXQsXG4gIHJlc29sdmUsXG4gIHJlc29sdmVPYmplY3QsXG4gIGZpbGVVUkxUb1BhdGgsXG4gIHBhdGhUb0ZpbGVVUkwsXG4gIHVybFRvSHR0cE9wdGlvbnMsXG4gIFVybCxcbiAgVVJMLFxuICBVUkxTZWFyY2hQYXJhbXMsXG59O1xuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRSxzREFBc0Q7QUFDdEQsRUFBRTtBQUNGLDBFQUEwRTtBQUMxRSxnRUFBZ0U7QUFDaEUsc0VBQXNFO0FBQ3RFLHNFQUFzRTtBQUN0RSw0RUFBNEU7QUFDNUUscUVBQXFFO0FBQ3JFLHdCQUF3QjtBQUN4QixFQUFFO0FBQ0YsMEVBQTBFO0FBQzFFLHlEQUF5RDtBQUN6RCxFQUFFO0FBQ0YsMEVBQTBFO0FBQzFFLDZEQUE2RDtBQUM3RCw0RUFBNEU7QUFDNUUsMkVBQTJFO0FBQzNFLHdFQUF3RTtBQUN4RSw0RUFBNEU7QUFDNUUseUNBQXlDO0FBRXpDLFNBQ0Usb0JBQW9CLEVBQ3BCLHFCQUFxQixFQUNyQix5QkFBeUIsRUFDekIseUJBQXlCLEVBQ3pCLHNCQUFzQixRQUNqQix1QkFBdUI7QUFDOUIsU0FDRSxNQUFN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