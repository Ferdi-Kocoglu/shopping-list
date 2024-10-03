// Copyright the Browserify authors. MIT License.
// Ported from https://github.com/browserify/path-browserify/
import { CHAR_BACKWARD_SLASH, CHAR_COLON, CHAR_DOT, CHAR_QUESTION_MARK } from "./_constants.ts";
import { ERR_INVALID_ARG_TYPE } from "../internal/errors.ts";
import { _format, assertPath, encodeWhitespace, isPathSeparator, isWindowsDeviceRoot, normalizeString } from "./_util.ts";
import { assert } from "../../_util/assert.ts";
export const sep = "\\";
export const delimiter = ";";
/**
 * Resolves path segments into a `path`
 * @param pathSegments to process to path
 */ export function resolve(...pathSegments) {
  let resolvedDevice = "";
  let resolvedTail = "";
  let resolvedAbsolute = false;
  for(let i = pathSegments.length - 1; i >= -1; i--){
    let path;
    // deno-lint-ignore no-explicit-any
    const { Deno } = globalThis;
    if (i >= 0) {
      path = pathSegments[i];
    } else if (!resolvedDevice) {
      if (typeof Deno?.cwd !== "function") {
        throw new TypeError("Resolved a drive-letter-less path without a CWD.");
      }
      path = Deno.cwd();
    } else {
      if (typeof Deno?.env?.get !== "function" || typeof Deno?.cwd !== "function") {
        throw new TypeError("Resolved a relative path without a CWD.");
      }
      path = Deno.cwd();
      // Verify that a cwd was found and that it actually points
      // to our drive. If not, default to the drive's root.
      if (path === undefined || path.slice(0, 3).toLowerCase() !== `${resolvedDevice.toLowerCase()}\\`) {
        path = `${resolvedDevice}\\`;
      }
    }
    assertPath(path);
    const len = path.length;
    // Skip empty entries
    if (len === 0) continue;
    let rootEnd = 0;
    let device = "";
    let isAbsolute = false;
    const code = path.charCodeAt(0);
    // Try to match a root
    if (len > 1) {
      if (isPathSeparator(code)) {
        // Possible UNC root
        // If we started with a separator, we know we at least have an
        // absolute path of some kind (UNC or otherwise)
        isAbsolute = true;
        if (isPathSeparator(path.charCodeAt(1))) {
          // Matched double path separator at beginning
          let j = 2;
          let last = j;
          // Match 1 or more non-path separators
          for(; j < len; ++j){
            if (isPathSeparator(path.charCodeAt(j))) break;
          }
          if (j < len && j !== last) {
            const firstPart = path.slice(last, j);
            // Matched!
            last = j;
            // Match 1 or more path separators
            for(; j < len; ++j){
              if (!isPathSeparator(path.charCodeAt(j))) break;
            }
            if (j < len && j !== last) {
              // Matched!
              last = j;
              // Match 1 or more non-path separators
              for(; j < len; ++j){
                if (isPathSeparator(path.charCodeAt(j))) break;
              }
              if (j === len) {
                // We matched a UNC root only
                device = `\\\\${firstPart}\\${path.slice(last)}`;
                rootEnd = j;
              } else if (j !== last) {
                // We matched a UNC root with leftovers
                device = `\\\\${firstPart}\\${path.slice(last, j)}`;
                rootEnd = j;
              }
            }
          }
        } else {
          rootEnd = 1;
        }
      } else if (isWindowsDeviceRoot(code)) {
        // Possible device root
        if (path.charCodeAt(1) === CHAR_COLON) {
          device = path.slice(0, 2);
          rootEnd = 2;
          if (len > 2) {
            if (isPathSeparator(path.charCodeAt(2))) {
              // Treat separator following drive name as an absolute path
              // indicator
              isAbsolute = true;
              rootEnd = 3;
            }
          }
        }
      }
    } else if (isPathSeparator(code)) {
      // `path` contains just a path separator
      rootEnd = 1;
      isAbsolute = true;
    }
    if (device.length > 0 && resolvedDevice.length > 0 && device.toLowerCase() !== resolvedDevice.toLowerCase()) {
      continue;
    }
    if (resolvedDevice.length === 0 && device.length > 0) {
      resolvedDevice = device;
    }
    if (!resolvedAbsolute) {
      resolvedTail = `${path.slice(rootEnd)}\\${resolvedTail}`;
      resolvedAbsolute = isAbsolute;
    }
    if (resolvedAbsolute && resolvedDevice.length > 0) break;
  }
  // At this point the path should be resolved to a full absolute path,
  // but handle relative paths to be safe (might happen when process.cwd()
  // fails)
  // Normalize the tail path
  resolvedTail = normalizeString(resolvedTail, !resolvedAbsolute, "\\", isPathSeparator);
  return resolvedDevice + (resolvedAbsolute ? "\\" : "") + resolvedTail || ".";
}
/**
 * Normalizes a `path`
 * @param path to normalize
 */ export function normalize(path) {
  assertPath(path);
  const len = path.length;
  if (len === 0) return ".";
  let rootEnd = 0;
  let device;
  let isAbsolute = false;
  const code = path.charCodeAt(0);
  // Try to match a root
  if (len > 1) {
    if (isPathSeparator(code)) {
      // Possible UNC root
      // If we started with a separator, we know we at least have an absolute
      // path of some kind (UNC or otherwise)
      isAbsolute = true;
      if (isPathSeparator(path.charCodeAt(1))) {
        // Matched double path separator at beginning
        let j = 2;
        let last = j;
        // Match 1 or more non-path separators
        for(; j < len; ++j){
          if (isPathSeparator(path.charCodeAt(j))) break;
        }
        if (j < len && j !== last) {
          const firstPart = path.slice(last, j);
          // Matched!
          last = j;
          // Match 1 or more path separators
          for(; j < len; ++j){
            if (!isPathSeparator(path.charCodeAt(j))) break;
          }
          if (j < len && j !== last) {
            // Matched!
            last = j;
            // Match 1 or more non-path separators
            for(; j < len; ++j){
              if (isPathSeparator(path.charCodeAt(j))) break;
            }
            if (j === len) {
              // We matched a UNC root only
              // Return the normalized version of the UNC root since there
              // is nothing left to process
              return `\\\\${firstPart}\\${path.slice(last)}\\`;
            } else if (j !== last) {
              // We matched a UNC root with leftovers
              device = `\\\\${firstPart}\\${path.slice(last, j)}`;
              rootEnd = j;
            }
          }
        }
      } else {
        rootEnd = 1;
      }
    } else if (isWindowsDeviceRoot(code)) {
      // Possible device root
      if (path.charCodeAt(1) === CHAR_COLON) {
        device = path.slice(0, 2);
        rootEnd = 2;
        if (len > 2) {
          if (isPathSeparator(path.charCodeAt(2))) {
            // Treat separator following drive name as an absolute path
            // indicator
            isAbsolute = true;
            rootEnd = 3;
          }
        }
      }
    }
  } else if (isPathSeparator(code)) {
    // `path` contains just a path separator, exit early to avoid unnecessary
    // work
    return "\\";
  }
  let tail;
  if (rootEnd < len) {
    tail = normalizeString(path.slice(rootEnd), !isAbsolute, "\\", isPathSeparator);
  } else {
    tail = "";
  }
  if (tail.length === 0 && !isAbsolute) tail = ".";
  if (tail.length > 0 && isPathSeparator(path.charCodeAt(len - 1))) {
    tail += "\\";
  }
  if (device === undefined) {
    if (isAbsolute) {
      if (tail.length > 0) return `\\${tail}`;
      else return "\\";
    } else if (tail.length > 0) {
      return tail;
    } else {
      return "";
    }
  } else if (isAbsolute) {
    if (tail.length > 0) return `${device}\\${tail}`;
    else return `${device}\\`;
  } else if (tail.length > 0) {
    return device + tail;
  } else {
    return device;
  }
}
/**
 * Verifies whether path is absolute
 * @param path to verify
 */ export function isAbsolute(path) {
  assertPath(path);
  const len = path.length;
  if (len === 0) return false;
  const code = path.charCodeAt(0);
  if (isPathSeparator(code)) {
    return true;
  } else if (isWindowsDeviceRoot(code)) {
    // Possible device root
    if (len > 2 && path.charCodeAt(1) === CHAR_COLON) {
      if (isPathSeparator(path.charCodeAt(2))) return true;
    }
  }
  return false;
}
/**
 * Join all given a sequence of `paths`,then normalizes the resulting path.
 * @param paths to be joined and normalized
 */ export function join(...paths) {
  const pathsCount = paths.length;
  if (pathsCount === 0) return ".";
  let joined;
  let firstPart = null;
  for(let i = 0; i < pathsCount; ++i){
    const path = paths[i];
    assertPath(path);
    if (path.length > 0) {
      if (joined === undefined) joined = firstPart = path;
      else joined += `\\${path}`;
    }
  }
  if (joined === undefined) return ".";
  // Make sure that the joined path doesn't start with two slashes, because
  // normalize() will mistake it for an UNC path then.
  //
  // This step is skipped when it is very clear that the user actually
  // intended to point at an UNC path. This is assumed when the first
  // non-empty string arguments starts with exactly two slashes followed by
  // at least one more non-slash character.
  //
  // Note that for normalize() to treat a path as an UNC path it needs to
  // have at least 2 components, so we don't filter for that here.
  // This means that the user can use join to construct UNC paths from
  // a server name and a share name; for example:
  //   path.join('//server', 'share') -> '\\\\server\\share\\')
  let needsReplace = true;
  let slashCount = 0;
  assert(firstPart != null);
  if (isPathSeparator(firstPart.charCodeAt(0))) {
    ++slashCount;
    const firstLen = firstPart.length;
    if (firstLen > 1) {
      if (isPathSeparator(firstPart.charCodeAt(1))) {
        ++slashCount;
        if (firstLen > 2) {
          if (isPathSeparator(firstPart.charCodeAt(2))) ++slashCount;
          else {
            // We matched a UNC path in the first part
            needsReplace = false;
          }
        }
      }
    }
  }
  if (needsReplace) {
    // Find any more consecutive slashes we need to replace
    for(; slashCount < joined.length; ++slashCount){
      if (!isPathSeparator(joined.charCodeAt(slashCount))) break;
    }
    // Replace the slashes if needed
    if (slashCount >= 2) joined = `\\${joined.slice(slashCount)}`;
  }
  return normalize(joined);
}
/**
 * It will solve the relative path from `from` to `to`, for instance:
 *  from = 'C:\\orandea\\test\\aaa'
 *  to = 'C:\\orandea\\impl\\bbb'
 * The output of the function should be: '..\\..\\impl\\bbb'
 * @param from relative path
 * @param to relative path
 */ export function relative(from, to) {
  assertPath(from);
  assertPath(to);
  if (from === to) return "";
  const fromOrig = resolve(from);
  const toOrig = resolve(to);
  if (fromOrig === toOrig) return "";
  from = fromOrig.toLowerCase();
  to = toOrig.toLowerCase();
  if (from === to) return "";
  // Trim any leading backslashes
  let fromStart = 0;
  let fromEnd = from.length;
  for(; fromStart < fromEnd; ++fromStart){
    if (from.charCodeAt(fromStart) !== CHAR_BACKWARD_SLASH) break;
  }
  // Trim trailing backslashes (applicable to UNC paths only)
  for(; fromEnd - 1 > fromStart; --fromEnd){
    if (from.charCodeAt(fromEnd - 1) !== CHAR_BACKWARD_SLASH) break;
  }
  const fromLen = fromEnd - fromStart;
  // Trim any leading backslashes
  let toStart = 0;
  let toEnd = to.length;
  for(; toStart < toEnd; ++toStart){
    if (to.charCodeAt(toStart) !== CHAR_BACKWARD_SLASH) break;
  }
  // Trim trailing backslashes (applicable to UNC paths only)
  for(; toEnd - 1 > toStart; --toEnd){
    if (to.charCodeAt(toEnd - 1) !== CHAR_BACKWARD_SLASH) break;
  }
  const toLen = toEnd - toStart;
  // Compare paths to find the longest common path from root
  const length = fromLen < toLen ? fromLen : toLen;
  let lastCommonSep = -1;
  let i = 0;
  for(; i <= length; ++i){
    if (i === length) {
      if (toLen > length) {
        if (to.charCodeAt(toStart + i) === CHAR_BACKWARD_SLASH) {
          // We get here if `from` is the exact base path for `to`.
          // For example: from='C:\\foo\\bar'; to='C:\\foo\\bar\\baz'
          return toOrig.slice(toStart + i + 1);
        } else if (i === 2) {
          // We get here if `from` is the device root.
          // For example: from='C:\\'; to='C:\\foo'
          return toOrig.slice(toStart + i);
        }
      }
      if (fromLen > length) {
        if (from.charCodeAt(fromStart + i) === CHAR_BACKWARD_SLASH) {
          // We get here if `to` is the exact base path for `from`.
          // For example: from='C:\\foo\\bar'; to='C:\\foo'
          lastCommonSep = i;
        } else if (i === 2) {
          // We get here if `to` is the device root.
          // For example: from='C:\\foo\\bar'; to='C:\\'
          lastCommonSep = 3;
        }
      }
      break;
    }
    const fromCode = from.charCodeAt(fromStart + i);
    const toCode = to.charCodeAt(toStart + i);
    if (fromCode !== toCode) break;
    else if (fromCode === CHAR_BACKWARD_SLASH) lastCommonSep = i;
  }
  // We found a mismatch before the first common path separator was seen, so
  // return the original `to`.
  if (i !== length && lastCommonSep === -1) {
    return toOrig;
  }
  let out = "";
  if (lastCommonSep === -1) lastCommonSep = 0;
  // Generate the relative path based on the path difference between `to` and
  // `from`
  for(i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i){
    if (i === fromEnd || from.charCodeAt(i) === CHAR_BACKWARD_SLASH) {
      if (out.length === 0) out += "..";
      else out += "\\..";
    }
  }
  // Lastly, append the rest of the destination (`to`) path that comes after
  // the common path parts
  if (out.length > 0) {
    return out + toOrig.slice(toStart + lastCommonSep, toEnd);
  } else {
    toStart += lastCommonSep;
    if (toOrig.charCodeAt(toStart) === CHAR_BACKWARD_SLASH) ++toStart;
    return toOrig.slice(toStart, toEnd);
  }
}
/**
 * Resolves path to a namespace path
 * @param path to resolve to namespace
 */ export function toNamespacedPath(path) {
  // Note: this will *probably* throw somewhere.
  if (typeof path !== "string") return path;
  if (path.length === 0) return "";
  const resolvedPath = resolve(path);
  if (resolvedPath.length >= 3) {
    if (resolvedPath.charCodeAt(0) === CHAR_BACKWARD_SLASH) {
      // Possible UNC root
      if (resolvedPath.charCodeAt(1) === CHAR_BACKWARD_SLASH) {
        const code = resolvedPath.charCodeAt(2);
        if (code !== CHAR_QUESTION_MARK && code !== CHAR_DOT) {
          // Matched non-long UNC root, convert the path to a long UNC path
          return `\\\\?\\UNC\\${resolvedPath.slice(2)}`;
        }
      }
    } else if (isWindowsDeviceRoot(resolvedPath.charCodeAt(0))) {
      // Possible device root
      if (resolvedPath.charCodeAt(1) === CHAR_COLON && resolvedPath.charCodeAt(2) === CHAR_BACKWARD_SLASH) {
        // Matched device root, convert the path to a long UNC path
        return `\\\\?\\${resolvedPath}`;
      }
    }
  }
  return path;
}
/**
 * Return the directory name of a `path`.
 * @param path to determine name for
 */ export function dirname(path) {
  assertPath(path);
  const len = path.length;
  if (len === 0) return ".";
  let rootEnd = -1;
  let end = -1;
  let matchedSlash = true;
  let offset = 0;
  const code = path.charCodeAt(0);
  // Try to match a root
  if (len > 1) {
    if (isPathSeparator(code)) {
      // Possible UNC root
      rootEnd = offset = 1;
      if (isPathSeparator(path.charCodeAt(1))) {
        // Matched double path separator at beginning
        let j = 2;
        let last = j;
        // Match 1 or more non-path separators
        for(; j < len; ++j){
          if (isPathSeparator(path.charCodeAt(j))) break;
        }
        if (j < len && j !== last) {
          // Matched!
          last = j;
          // Match 1 or more path separators
          for(; j < len; ++j){
            if (!isPathSeparator(path.charCodeAt(j))) break;
          }
          if (j < len && j !== last) {
            // Matched!
            last = j;
            // Match 1 or more non-path separators
            for(; j < len; ++j){
              if (isPathSeparator(path.charCodeAt(j))) break;
            }
            if (j === len) {
              // We matched a UNC root only
              return path;
            }
            if (j !== last) {
              // We matched a UNC root with leftovers
              // Offset by 1 to include the separator after the UNC root to
              // treat it as a "normal root" on top of a (UNC) root
              rootEnd = offset = j + 1;
            }
          }
        }
      }
    } else if (isWindowsDeviceRoot(code)) {
      // Possible device root
      if (path.charCodeAt(1) === CHAR_COLON) {
        rootEnd = offset = 2;
        if (len > 2) {
          if (isPathSeparator(path.charCodeAt(2))) rootEnd = offset = 3;
        }
      }
    }
  } else if (isPathSeparator(code)) {
    // `path` contains just a path separator, exit early to avoid
    // unnecessary work
    return path;
  }
  for(let i = len - 1; i >= offset; --i){
    if (isPathSeparator(path.charCodeAt(i))) {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else {
      // We saw the first non-path separator
      matchedSlash = false;
    }
  }
  if (end === -1) {
    if (rootEnd === -1) return ".";
    else end = rootEnd;
  }
  return path.slice(0, end);
}
/**
 * Return the last portion of a `path`. Trailing directory separators are ignored.
 * @param path to process
 * @param ext of path directory
 */ export function basename(path, ext = "") {
  if (ext !== undefined && typeof ext !== "string") {
    throw new ERR_INVALID_ARG_TYPE("ext", [
      "string"
    ], ext);
  }
  assertPath(path);
  let start = 0;
  let end = -1;
  let matchedSlash = true;
  let i;
  // Check for a drive letter prefix so as not to mistake the following
  // path separator as an extra separator at the end of the path that can be
  // disregarded
  if (path.length >= 2) {
    const drive = path.charCodeAt(0);
    if (isWindowsDeviceRoot(drive)) {
      if (path.charCodeAt(1) === CHAR_COLON) start = 2;
    }
  }
  if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
    if (ext.length === path.length && ext === path) return "";
    let extIdx = ext.length - 1;
    let firstNonSlashEnd = -1;
    for(i = path.length - 1; i >= start; --i){
      const code = path.charCodeAt(i);
      if (isPathSeparator(code)) {
        // If we reached a path separator that was not part of a set of path
        // separators at the end of the string, stop now
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else {
        if (firstNonSlashEnd === -1) {
          // We saw the first non-path separator, remember this index in case
          // we need it if the extension ends up not matching
          matchedSlash = false;
          firstNonSlashEnd = i + 1;
        }
        if (extIdx >= 0) {
          // Try to match the explicit extension
          if (code === ext.charCodeAt(extIdx)) {
            if (--extIdx === -1) {
              // We matched the extension, so mark this as the end of our path
              // component
              end = i;
            }
          } else {
            // Extension does not match, so our result is the entire path
            // component
            extIdx = -1;
            end = firstNonSlashEnd;
          }
        }
      }
    }
    if (start === end) end = firstNonSlashEnd;
    else if (end === -1) end = path.length;
    return path.slice(start, end);
  } else {
    for(i = path.length - 1; i >= start; --i){
      if (isPathSeparator(path.charCodeAt(i))) {
        // If we reached a path separator that was not part of a set of path
        // separators at the end of the string, stop now
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else if (end === -1) {
        // We saw the first non-path separator, mark this as the end of our
        // path component
        matchedSlash = false;
        end = i + 1;
      }
    }
    if (end === -1) return "";
    return path.slice(start, end);
  }
}
/**
 * Return the extension of the `path`.
 * @param path with extension
 */ export function extname(path) {
  assertPath(path);
  let start = 0;
  let startDot = -1;
  let startPart = 0;
  let end = -1;
  let matchedSlash = true;
  // Track the state of characters (if any) we see before our first dot and
  // after any path separator we find
  let preDotState = 0;
  // Check for a drive letter prefix so as not to mistake the following
  // path separator as an extra separator at the end of the path that can be
  // disregarded
  if (path.length >= 2 && path.charCodeAt(1) === CHAR_COLON && isWindowsDeviceRoot(path.charCodeAt(0))) {
    start = startPart = 2;
  }
  for(let i = path.length - 1; i >= start; --i){
    const code = path.charCodeAt(i);
    if (isPathSeparator(code)) {
      // If we reached a path separator that was not part of a set of path
      // separators at the end of the string, stop now
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1) {
      // We saw the first non-path separator, mark this as the end of our
      // extension
      matchedSlash = false;
      end = i + 1;
    }
    if (code === CHAR_DOT) {
      // If this is our first dot, mark it as the start of our extension
      if (startDot === -1) startDot = i;
      else if (preDotState !== 1) preDotState = 1;
    } else if (startDot !== -1) {
      // We saw a non-dot and non-path separator before our dot, so we should
      // have a good chance at having a non-empty extension
      preDotState = -1;
    }
  }
  if (startDot === -1 || end === -1 || // We saw a non-dot character immediately before the dot
  preDotState === 0 || // The (right-most) trimmed path component is exactly '..'
  preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
    return "";
  }
  return path.slice(startDot, end);
}
/**
 * Generate a path from `FormatInputPathObject` object.
 * @param pathObject with path
 */ export function format(pathObject) {
  if (pathObject === null || typeof pathObject !== "object") {
    throw new ERR_INVALID_ARG_TYPE("pathObject", [
      "Object"
    ], pathObject);
  }
  return _format("\\", pathObject);
}
/**
 * Return a `ParsedPath` object of the `path`.
 * @param path to process
 */ export function parse(path) {
  assertPath(path);
  const ret = {
    root: "",
    dir: "",
    base: "",
    ext: "",
    name: ""
  };
  const len = path.length;
  if (len === 0) return ret;
  let rootEnd = 0;
  let code = path.charCodeAt(0);
  // Try to match a root
  if (len > 1) {
    if (isPathSeparator(code)) {
      // Possible UNC root
      rootEnd = 1;
      if (isPathSeparator(path.charCodeAt(1))) {
        // Matched double path separator at beginning
        let j = 2;
        let last = j;
        // Match 1 or more non-path separators
        for(; j < len; ++j){
          if (isPathSeparator(path.charCodeAt(j))) break;
        }
        if (j < len && j !== last) {
          // Matched!
          last = j;
          // Match 1 or more path separators
          for(; j < len; ++j){
            if (!isPathSeparator(path.charCodeAt(j))) break;
          }
          if (j < len && j !== last) {
            // Matched!
            last = j;
            // Match 1 or more non-path separators
            for(; j < len; ++j){
              if (isPathSeparator(path.charCodeAt(j))) break;
            }
            if (j === len) {
              // We matched a UNC root only
              rootEnd = j;
            } else if (j !== last) {
              // We matched a UNC root with leftovers
              rootEnd = j + 1;
            }
          }
        }
      }
    } else if (isWindowsDeviceRoot(code)) {
      // Possible device root
      if (path.charCodeAt(1) === CHAR_COLON) {
        rootEnd = 2;
        if (len > 2) {
          if (isPathSeparator(path.charCodeAt(2))) {
            if (len === 3) {
              // `path` contains just a drive root, exit early to avoid
              // unnecessary work
              ret.root = ret.dir = path;
              return ret;
            }
            rootEnd = 3;
          }
        } else {
          // `path` contains just a drive root, exit early to avoid
          // unnecessary work
          ret.root = ret.dir = path;
          return ret;
        }
      }
    }
  } else if (isPathSeparator(code)) {
    // `path` contains just a path separator, exit early to avoid
    // unnecessary work
    ret.root = ret.dir = path;
    return ret;
  }
  if (rootEnd > 0) ret.root = path.slice(0, rootEnd);
  let startDot = -1;
  let startPart = rootEnd;
  let end = -1;
  let matchedSlash = true;
  let i = path.length - 1;
  // Track the state of characters (if any) we see before our first dot and
  // after any path separator we find
  let preDotState = 0;
  // Get non-dir info
  for(; i >= rootEnd; --i){
    code = path.charCodeAt(i);
    if (isPathSeparator(code)) {
      // If we reached a path separator that was not part of a set of path
      // separators at the end of the string, stop now
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1) {
      // We saw the first non-path separator, mark this as the end of our
      // extension
      matchedSlash = false;
      end = i + 1;
    }
    if (code === CHAR_DOT) {
      // If this is our first dot, mark it as the start of our extension
      if (startDot === -1) startDot = i;
      else if (preDotState !== 1) preDotState = 1;
    } else if (startDot !== -1) {
      // We saw a non-dot and non-path separator before our dot, so we should
      // have a good chance at having a non-empty extension
      preDotState = -1;
    }
  }
  if (startDot === -1 || end === -1 || // We saw a non-dot character immediately before the dot
  preDotState === 0 || // The (right-most) trimmed path component is exactly '..'
  preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
    if (end !== -1) {
      ret.base = ret.name = path.slice(startPart, end);
    }
  } else {
    ret.name = path.slice(startPart, startDot);
    ret.base = path.slice(startPart, end);
    ret.ext = path.slice(startDot, end);
  }
  // If the directory is the root, use the entire root as the `dir` including
  // the trailing slash if any (`C:\abc` -> `C:\`). Otherwise, strip out the
  // trailing slash (`C:\abc\def` -> `C:\abc`).
  if (startPart > 0 && startPart !== rootEnd) {
    ret.dir = path.slice(0, startPart - 1);
  } else ret.dir = ret.root;
  return ret;
}
/**
 * Converts a file URL to a path string.
 *
 * ```ts
 *      import { fromFileUrl } from "./win32.ts";
 *      fromFileUrl("file:///home/foo"); // "\\home\\foo"
 *      fromFileUrl("file:///C:/Users/foo"); // "C:\\Users\\foo"
 *      fromFileUrl("file://localhost/home/foo"); // "\\\\localhost\\home\\foo"
 * ```
 * @param url of a file URL
 */ export function fromFileUrl(url) {
  url = url instanceof URL ? url : new URL(url);
  if (url.protocol != "file:") {
    throw new TypeError("Must be a file URL.");
  }
  let path = decodeURIComponent(url.pathname.replace(/\//g, "\\").replace(/%(?![0-9A-Fa-f]{2})/g, "%25")).replace(/^\\*([A-Za-z]:)(\\|$)/, "$1\\");
  if (url.hostname != "") {
    // Note: The `URL` implementation guarantees that the drive letter and
    // hostname are mutually exclusive. Otherwise it would not have been valid
    // to append the hostname and path like this.
    path = `\\\\${url.hostname}${path}`;
  }
  return path;
}
/**
 * Converts a path string to a file URL.
 *
 * ```ts
 *      import { toFileUrl } from "./win32.ts";
 *      toFileUrl("\\home\\foo"); // new URL("file:///home/foo")
 *      toFileUrl("C:\\Users\\foo"); // new URL("file:///C:/Users/foo")
 *      toFileUrl("\\\\127.0.0.1\\home\\foo"); // new URL("file://127.0.0.1/home/foo")
 * ```
 * @param path to convert to file URL
 */ export function toFileUrl(path) {
  if (!isAbsolute(path)) {
    throw new TypeError("Must be an absolute path.");
  }
  const [, hostname, pathname] = path.match(/^(?:[/\\]{2}([^/\\]+)(?=[/\\](?:[^/\\]|$)))?(.*)/);
  const url = new URL("file:///");
  url.pathname = encodeWhitespace(pathname.replace(/%/g, "%25"));
  if (hostname != null && hostname != "localhost") {
    url.hostname = hostname;
    if (!url.hostname) {
      throw new TypeError("Invalid hostname.");
    }
  }
  return url;
}
export default {
  basename,
  delimiter,
  dirname,
  extname,
  format,
  fromFileUrl,
  isAbsolute,
  join,
  normalize,
  parse,
  relative,
  resolve,
  sep,
  toFileUrl,
  toNamespacedPath
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL25vZGUvcGF0aC93aW4zMi50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgdGhlIEJyb3dzZXJpZnkgYXV0aG9ycy4gTUlUIExpY2Vuc2UuXG4vLyBQb3J0ZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vYnJvd3NlcmlmeS9wYXRoLWJyb3dzZXJpZnkvXG5cbmltcG9ydCB0eXBlIHsgRm9ybWF0SW5wdXRQYXRoT2JqZWN0LCBQYXJzZWRQYXRoIH0gZnJvbSBcIi4vX2ludGVyZmFjZS50c1wiO1xuaW1wb3J0IHtcbiAgQ0hBUl9CQUNLV0FSRF9TTEFTSCxcbiAgQ0hBUl9DT0xPTixcbiAgQ0hBUl9ET1QsXG4gIENIQVJfUVVFU1RJT05fTUFSSyxcbn0gZnJvbSBcIi4vX2NvbnN0YW50cy50c1wiO1xuaW1wb3J0IHsgRVJSX0lOVkFMSURfQVJHX1RZUEUgfSBmcm9tIFwiLi4vaW50ZXJuYWwvZXJyb3JzLnRzXCI7XG5cbmltcG9ydCB7XG4gIF9mb3JtYXQsXG4gIGFzc2VydFBhdGgsXG4gIGVuY29kZVdoaXRlc3BhY2UsXG4gIGlzUGF0aFNlcGFyYXRvcixcbiAgaXNXaW5kb3dzRGV2aWNlUm9vdCxcbiAgbm9ybWFsaXplU3RyaW5nLFxufSBmcm9tIFwiLi9fdXRpbC50c1wiO1xuaW1wb3J0IHsgYXNzZXJ0IH0gZnJvbSBcIi4uLy4uL191dGlsL2Fzc2VydC50c1wiO1xuXG5leHBvcnQgY29uc3Qgc2VwID0gXCJcXFxcXCI7XG5leHBvcnQgY29uc3QgZGVsaW1pdGVyID0gXCI7XCI7XG5cbi8qKlxuICogUmVzb2x2ZXMgcGF0aCBzZWdtZW50cyBpbnRvIGEgYHBhdGhgXG4gKiBAcGFyYW0gcGF0aFNlZ21lbnRzIHRvIHByb2Nlc3MgdG8gcGF0aFxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZSguLi5wYXRoU2VnbWVudHM6IHN0cmluZ1tdKTogc3RyaW5nIHtcbiAgbGV0IHJlc29sdmVkRGV2aWNlID0gXCJcIjtcbiAgbGV0IHJlc29sdmVkVGFpbCA9IFwiXCI7XG4gIGxldCByZXNvbHZlZEFic29sdXRlID0gZmFsc2U7XG5cbiAgZm9yIChsZXQgaSA9IHBhdGhTZWdtZW50cy5sZW5ndGggLSAxOyBpID49IC0xOyBpLS0pIHtcbiAgICBsZXQgcGF0aDogc3RyaW5nO1xuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgY29uc3QgeyBEZW5vIH0gPSBnbG9iYWxUaGlzIGFzIGFueTtcbiAgICBpZiAoaSA+PSAwKSB7XG4gICAgICBwYXRoID0gcGF0aFNlZ21lbnRzW2ldO1xuICAgIH0gZWxzZSBpZiAoIXJlc29sdmVkRGV2aWNlKSB7XG4gICAgICBpZiAodHlwZW9mIERlbm8/LmN3ZCAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJSZXNvbHZlZCBhIGRyaXZlLWxldHRlci1sZXNzIHBhdGggd2l0aG91dCBhIENXRC5cIik7XG4gICAgICB9XG4gICAgICBwYXRoID0gRGVuby5jd2QoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgRGVubz8uZW52Py5nZXQgIT09IFwiZnVuY3Rpb25cIiB8fCB0eXBlb2YgRGVubz8uY3dkICE9PSBcImZ1bmN0aW9uXCJcbiAgICAgICkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiUmVzb2x2ZWQgYSByZWxhdGl2ZSBwYXRoIHdpdGhvdXQgYSBDV0QuXCIpO1xuICAgICAgfVxuICAgICAgcGF0aCA9IERlbm8uY3dkKCk7XG5cbiAgICAgIC8vIFZlcmlmeSB0aGF0IGEgY3dkIHdhcyBmb3VuZCBhbmQgdGhhdCBpdCBhY3R1YWxseSBwb2ludHNcbiAgICAgIC8vIHRvIG91ciBkcml2ZS4gSWYgbm90LCBkZWZhdWx0IHRvIHRoZSBkcml2ZSdzIHJvb3QuXG4gICAgICBpZiAoXG4gICAgICAgIHBhdGggPT09IHVuZGVmaW5lZCB8fFxuICAgICAgICBwYXRoLnNsaWNlKDAsIDMpLnRvTG93ZXJDYXNlKCkgIT09IGAke3Jlc29sdmVkRGV2aWNlLnRvTG93ZXJDYXNlKCl9XFxcXGBcbiAgICAgICkge1xuICAgICAgICBwYXRoID0gYCR7cmVzb2x2ZWREZXZpY2V9XFxcXGA7XG4gICAgICB9XG4gICAgfVxuXG4gICAgYXNzZXJ0UGF0aChwYXRoKTtcblxuICAgIGNvbnN0IGxlbiA9IHBhdGgubGVuZ3RoO1xuXG4gICAgLy8gU2tpcCBlbXB0eSBlbnRyaWVzXG4gICAgaWYgKGxlbiA9PT0gMCkgY29udGludWU7XG5cbiAgICBsZXQgcm9vdEVuZCA9IDA7XG4gICAgbGV0IGRldmljZSA9IFwiXCI7XG4gICAgbGV0IGlzQWJzb2x1dGUgPSBmYWxzZTtcbiAgICBjb25zdCBjb2RlID0gcGF0aC5jaGFyQ29kZUF0KDApO1xuXG4gICAgLy8gVHJ5IHRvIG1hdGNoIGEgcm9vdFxuICAgIGlmIChsZW4gPiAxKSB7XG4gICAgICBpZiAoaXNQYXRoU2VwYXJhdG9yKGNvZGUpKSB7XG4gICAgICAgIC8vIFBvc3NpYmxlIFVOQyByb290XG5cbiAgICAgICAgLy8gSWYgd2Ugc3RhcnRlZCB3aXRoIGEgc2VwYXJhdG9yLCB3ZSBrbm93IHdlIGF0IGxlYXN0IGhhdmUgYW5cbiAgICAgICAgLy8gYWJzb2x1dGUgcGF0aCBvZiBzb21lIGtpbmQgKFVOQyBvciBvdGhlcndpc2UpXG4gICAgICAgIGlzQWJzb2x1dGUgPSB0cnVlO1xuXG4gICAgICAgIGlmIChpc1BhdGhTZXBhcmF0b3IocGF0aC5jaGFyQ29kZUF0KDEpKSkge1xuICAgICAgICAgIC8vIE1hdGNoZWQgZG91YmxlIHBhdGggc2VwYXJhdG9yIGF0IGJlZ2lubmluZ1xuICAgICAgICAgIGxldCBqID0gMjtcbiAgICAgICAgICBsZXQgbGFzdCA9IGo7XG4gICAgICAgICAgLy8gTWF0Y2ggMSBvciBtb3JlIG5vbi1wYXRoIHNlcGFyYXRvcnNcbiAgICAgICAgICBmb3IgKDsgaiA8IGxlbjsgKytqKSB7XG4gICAgICAgICAgICBpZiAoaXNQYXRoU2VwYXJhdG9yKHBhdGguY2hhckNvZGVBdChqKSkpIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoaiA8IGxlbiAmJiBqICE9PSBsYXN0KSB7XG4gICAgICAgICAgICBjb25zdCBmaXJzdFBhcnQgPSBwYXRoLnNsaWNlKGxhc3QsIGopO1xuICAgICAgICAgICAgLy8gTWF0Y2hlZCFcbiAgICAgICAgICAgIGxhc3QgPSBqO1xuICAgICAgICAgICAgLy8gTWF0Y2ggMSBvciBtb3JlIHBhdGggc2VwYXJhdG9yc1xuICAgICAgICAgICAgZm9yICg7IGogPCBsZW47ICsraikge1xuICAgICAgICAgICAgICBpZiAoIWlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoaikpKSBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChqIDwgbGVuICYmIGogIT09IGxhc3QpIHtcbiAgICAgICAgICAgICAgLy8gTWF0Y2hlZCFcbiAgICAgICAgICAgICAgbGFzdCA9IGo7XG4gICAgICAgICAgICAgIC8vIE1hdGNoIDEgb3IgbW9yZSBub24tcGF0aCBzZXBhcmF0b3JzXG4gICAgICAgICAgICAgIGZvciAoOyBqIDwgbGVuOyArK2opIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNQYXRoU2VwYXJhdG9yKHBhdGguY2hhckNvZGVBdChqKSkpIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChqID09PSBsZW4pIHtcbiAgICAgICAgICAgICAgICAvLyBXZSBtYXRjaGVkIGEgVU5DIHJvb3Qgb25seVxuICAgICAgICAgICAgICAgIGRldmljZSA9IGBcXFxcXFxcXCR7Zmlyc3RQYXJ0fVxcXFwke3BhdGguc2xpY2UobGFzdCl9YDtcbiAgICAgICAgICAgICAgICByb290RW5kID0gajtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChqICE9PSBsYXN0KSB7XG4gICAgICAgICAgICAgICAgLy8gV2UgbWF0Y2hlZCBhIFVOQyByb290IHdpdGggbGVmdG92ZXJzXG5cbiAgICAgICAgICAgICAgICBkZXZpY2UgPSBgXFxcXFxcXFwke2ZpcnN0UGFydH1cXFxcJHtwYXRoLnNsaWNlKGxhc3QsIGopfWA7XG4gICAgICAgICAgICAgICAgcm9vdEVuZCA9IGo7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcm9vdEVuZCA9IDE7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoaXNXaW5kb3dzRGV2aWNlUm9vdChjb2RlKSkge1xuICAgICAgICAvLyBQb3NzaWJsZSBkZXZpY2Ugcm9vdFxuXG4gICAgICAgIGlmIChwYXRoLmNoYXJDb2RlQXQoMSkgPT09IENIQVJfQ09MT04pIHtcbiAgICAgICAgICBkZXZpY2UgPSBwYXRoLnNsaWNlKDAsIDIpO1xuICAgICAgICAgIHJvb3RFbmQgPSAyO1xuICAgICAgICAgIGlmIChsZW4gPiAyKSB7XG4gICAgICAgICAgICBpZiAoaXNQYXRoU2VwYXJhdG9yKHBhdGguY2hhckNvZGVBdCgyKSkpIHtcbiAgICAgICAgICAgICAgLy8gVHJlYXQgc2VwYXJhdG9yIGZvbGxvd2luZyBkcml2ZSBuYW1lIGFzIGFuIGFic29sdXRlIHBhdGhcbiAgICAgICAgICAgICAgLy8gaW5kaWNhdG9yXG4gICAgICAgICAgICAgIGlzQWJzb2x1dGUgPSB0cnVlO1xuICAgICAgICAgICAgICByb290RW5kID0gMztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGlzUGF0aFNlcGFyYXRvcihjb2RlKSkge1xuICAgICAgLy8gYHBhdGhgIGNvbnRhaW5zIGp1c3QgYSBwYXRoIHNlcGFyYXRvclxuICAgICAgcm9vdEVuZCA9IDE7XG4gICAgICBpc0Fic29sdXRlID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICBkZXZpY2UubGVuZ3RoID4gMCAmJlxuICAgICAgcmVzb2x2ZWREZXZpY2UubGVuZ3RoID4gMCAmJlxuICAgICAgZGV2aWNlLnRvTG93ZXJDYXNlKCkgIT09IHJlc29sdmVkRGV2aWNlLnRvTG93ZXJDYXNlKClcbiAgICApIHtcbiAgICAgIC8vIFRoaXMgcGF0aCBwb2ludHMgdG8gYW5vdGhlciBkZXZpY2Ugc28gaXQgaXMgbm90IGFwcGxpY2FibGVcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChyZXNvbHZlZERldmljZS5sZW5ndGggPT09IDAgJiYgZGV2aWNlLmxlbmd0aCA+IDApIHtcbiAgICAgIHJlc29sdmVkRGV2aWNlID0gZGV2aWNlO1xuICAgIH1cbiAgICBpZiAoIXJlc29sdmVkQWJzb2x1dGUpIHtcbiAgICAgIHJlc29sdmVkVGFpbCA9IGAke3BhdGguc2xpY2Uocm9vdEVuZCl9XFxcXCR7cmVzb2x2ZWRUYWlsfWA7XG4gICAgICByZXNvbHZlZEFic29sdXRlID0gaXNBYnNvbHV0ZTtcbiAgICB9XG5cbiAgICBpZiAocmVzb2x2ZWRBYnNvbHV0ZSAmJiByZXNvbHZlZERldmljZS5sZW5ndGggPiAwKSBicmVhaztcbiAgfVxuXG4gIC8vIEF0IHRoaXMgcG9pbnQgdGhlIHBhdGggc2hvdWxkIGJlIHJlc29sdmVkIHRvIGEgZnVsbCBhYnNvbHV0ZSBwYXRoLFxuICAvLyBidXQgaGFuZGxlIHJlbGF0aXZlIHBhdGhzIHRvIGJlIHNhZmUgKG1pZ2h0IGhhcHBlbiB3aGVuIHByb2Nlc3MuY3dkKClcbiAgLy8gZmFpbHMpXG5cbiAgLy8gTm9ybWFsaXplIHRoZSB0YWlsIHBhdGhcbiAgcmVzb2x2ZWRUYWlsID0gbm9ybWFsaXplU3RyaW5nKFxuICAgIHJlc29sdmVkVGFpbCxcbiAgICAhcmVzb2x2ZWRBYnNvbHV0ZSxcbiAgICBcIlxcXFxcIixcbiAgICBpc1BhdGhTZXBhcmF0b3IsXG4gICk7XG5cbiAgcmV0dXJuIHJlc29sdmVkRGV2aWNlICsgKHJlc29sdmVkQWJzb2x1dGUgPyBcIlxcXFxcIiA6IFwiXCIpICsgcmVzb2x2ZWRUYWlsIHx8IFwiLlwiO1xufVxuXG4vKipcbiAqIE5vcm1hbGl6ZXMgYSBgcGF0aGBcbiAqIEBwYXJhbSBwYXRoIHRvIG5vcm1hbGl6ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gIGFzc2VydFBhdGgocGF0aCk7XG4gIGNvbnN0IGxlbiA9IHBhdGgubGVuZ3RoO1xuICBpZiAobGVuID09PSAwKSByZXR1cm4gXCIuXCI7XG4gIGxldCByb290RW5kID0gMDtcbiAgbGV0IGRldmljZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICBsZXQgaXNBYnNvbHV0ZSA9IGZhbHNlO1xuICBjb25zdCBjb2RlID0gcGF0aC5jaGFyQ29kZUF0KDApO1xuXG4gIC8vIFRyeSB0byBtYXRjaCBhIHJvb3RcbiAgaWYgKGxlbiA+IDEpIHtcbiAgICBpZiAoaXNQYXRoU2VwYXJhdG9yKGNvZGUpKSB7XG4gICAgICAvLyBQb3NzaWJsZSBVTkMgcm9vdFxuXG4gICAgICAvLyBJZiB3ZSBzdGFydGVkIHdpdGggYSBzZXBhcmF0b3IsIHdlIGtub3cgd2UgYXQgbGVhc3QgaGF2ZSBhbiBhYnNvbHV0ZVxuICAgICAgLy8gcGF0aCBvZiBzb21lIGtpbmQgKFVOQyBvciBvdGhlcndpc2UpXG4gICAgICBpc0Fic29sdXRlID0gdHJ1ZTtcblxuICAgICAgaWYgKGlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoMSkpKSB7XG4gICAgICAgIC8vIE1hdGNoZWQgZG91YmxlIHBhdGggc2VwYXJhdG9yIGF0IGJlZ2lubmluZ1xuICAgICAgICBsZXQgaiA9IDI7XG4gICAgICAgIGxldCBsYXN0ID0gajtcbiAgICAgICAgLy8gTWF0Y2ggMSBvciBtb3JlIG5vbi1wYXRoIHNlcGFyYXRvcnNcbiAgICAgICAgZm9yICg7IGogPCBsZW47ICsraikge1xuICAgICAgICAgIGlmIChpc1BhdGhTZXBhcmF0b3IocGF0aC5jaGFyQ29kZUF0KGopKSkgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGogPCBsZW4gJiYgaiAhPT0gbGFzdCkge1xuICAgICAgICAgIGNvbnN0IGZpcnN0UGFydCA9IHBhdGguc2xpY2UobGFzdCwgaik7XG4gICAgICAgICAgLy8gTWF0Y2hlZCFcbiAgICAgICAgICBsYXN0ID0gajtcbiAgICAgICAgICAvLyBNYXRjaCAxIG9yIG1vcmUgcGF0aCBzZXBhcmF0b3JzXG4gICAgICAgICAgZm9yICg7IGogPCBsZW47ICsraikge1xuICAgICAgICAgICAgaWYgKCFpc1BhdGhTZXBhcmF0b3IocGF0aC5jaGFyQ29kZUF0KGopKSkgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChqIDwgbGVuICYmIGogIT09IGxhc3QpIHtcbiAgICAgICAgICAgIC8vIE1hdGNoZWQhXG4gICAgICAgICAgICBsYXN0ID0gajtcbiAgICAgICAgICAgIC8vIE1hdGNoIDEgb3IgbW9yZSBub24tcGF0aCBzZXBhcmF0b3JzXG4gICAgICAgICAgICBmb3IgKDsgaiA8IGxlbjsgKytqKSB7XG4gICAgICAgICAgICAgIGlmIChpc1BhdGhTZXBhcmF0b3IocGF0aC5jaGFyQ29kZUF0KGopKSkgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaiA9PT0gbGVuKSB7XG4gICAgICAgICAgICAgIC8vIFdlIG1hdGNoZWQgYSBVTkMgcm9vdCBvbmx5XG4gICAgICAgICAgICAgIC8vIFJldHVybiB0aGUgbm9ybWFsaXplZCB2ZXJzaW9uIG9mIHRoZSBVTkMgcm9vdCBzaW5jZSB0aGVyZVxuICAgICAgICAgICAgICAvLyBpcyBub3RoaW5nIGxlZnQgdG8gcHJvY2Vzc1xuXG4gICAgICAgICAgICAgIHJldHVybiBgXFxcXFxcXFwke2ZpcnN0UGFydH1cXFxcJHtwYXRoLnNsaWNlKGxhc3QpfVxcXFxgO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChqICE9PSBsYXN0KSB7XG4gICAgICAgICAgICAgIC8vIFdlIG1hdGNoZWQgYSBVTkMgcm9vdCB3aXRoIGxlZnRvdmVyc1xuXG4gICAgICAgICAgICAgIGRldmljZSA9IGBcXFxcXFxcXCR7Zmlyc3RQYXJ0fVxcXFwke3BhdGguc2xpY2UobGFzdCwgail9YDtcbiAgICAgICAgICAgICAgcm9vdEVuZCA9IGo7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByb290RW5kID0gMTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGlzV2luZG93c0RldmljZVJvb3QoY29kZSkpIHtcbiAgICAgIC8vIFBvc3NpYmxlIGRldmljZSByb290XG5cbiAgICAgIGlmIChwYXRoLmNoYXJDb2RlQXQoMSkgPT09IENIQVJfQ09MT04pIHtcbiAgICAgICAgZGV2aWNlID0gcGF0aC5zbGljZSgwLCAyKTtcbiAgICAgICAgcm9vdEVuZCA9IDI7XG4gICAgICAgIGlmIChsZW4gPiAyKSB7XG4gICAgICAgICAgaWYgKGlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoMikpKSB7XG4gICAgICAgICAgICAvLyBUcmVhdCBzZXBhcmF0b3IgZm9sbG93aW5nIGRyaXZlIG5hbWUgYXMgYW4gYWJzb2x1dGUgcGF0aFxuICAgICAgICAgICAgLy8gaW5kaWNhdG9yXG4gICAgICAgICAgICBpc0Fic29sdXRlID0gdHJ1ZTtcbiAgICAgICAgICAgIHJvb3RFbmQgPSAzO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIGlmIChpc1BhdGhTZXBhcmF0b3IoY29kZSkpIHtcbiAgICAvLyBgcGF0aGAgY29udGFpbnMganVzdCBhIHBhdGggc2VwYXJhdG9yLCBleGl0IGVhcmx5IHRvIGF2b2lkIHVubmVjZXNzYXJ5XG4gICAgLy8gd29ya1xuICAgIHJldHVybiBcIlxcXFxcIjtcbiAgfVxuXG4gIGxldCB0YWlsOiBzdHJpbmc7XG4gIGlmIChyb290RW5kIDwgbGVuKSB7XG4gICAgdGFpbCA9IG5vcm1hbGl6ZVN0cmluZyhcbiAgICAgIHBhdGguc2xpY2Uocm9vdEVuZCksXG4gICAgICAhaXNBYnNvbHV0ZSxcbiAgICAgIFwiXFxcXFwiLFxuICAgICAgaXNQYXRoU2VwYXJhdG9yLFxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgdGFpbCA9IFwiXCI7XG4gIH1cbiAgaWYgKHRhaWwubGVuZ3RoID09PSAwICYmICFpc0Fic29sdXRlKSB0YWlsID0gXCIuXCI7XG4gIGlmICh0YWlsLmxlbmd0aCA+IDAgJiYgaXNQYXRoU2VwYXJhdG9yKHBhdGguY2hhckNvZGVBdChsZW4gLSAxKSkpIHtcbiAgICB0YWlsICs9IFwiXFxcXFwiO1xuICB9XG4gIGlmIChkZXZpY2UgPT09IHVuZGVmaW5lZCkge1xuICAgIGlmIChpc0Fic29sdXRlKSB7XG4gICAgICBpZiAodGFpbC5sZW5ndGggPiAwKSByZXR1cm4gYFxcXFwke3RhaWx9YDtcbiAgICAgIGVsc2UgcmV0dXJuIFwiXFxcXFwiO1xuICAgIH0gZWxzZSBpZiAodGFpbC5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4gdGFpbDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIFwiXCI7XG4gICAgfVxuICB9IGVsc2UgaWYgKGlzQWJzb2x1dGUpIHtcbiAgICBpZiAodGFpbC5sZW5ndGggPiAwKSByZXR1cm4gYCR7ZGV2aWNlfVxcXFwke3RhaWx9YDtcbiAgICBlbHNlIHJldHVybiBgJHtkZXZpY2V9XFxcXGA7XG4gIH0gZWxzZSBpZiAodGFpbC5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGRldmljZSArIHRhaWw7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGRldmljZTtcbiAgfVxufVxuXG4vKipcbiAqIFZlcmlmaWVzIHdoZXRoZXIgcGF0aCBpcyBhYnNvbHV0ZVxuICogQHBhcmFtIHBhdGggdG8gdmVyaWZ5XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0Fic29sdXRlKHBhdGg6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBhc3NlcnRQYXRoKHBhdGgpO1xuICBjb25zdCBsZW4gPSBwYXRoLmxlbmd0aDtcbiAgaWYgKGxlbiA9PT0gMCkgcmV0dXJuIGZhbHNlO1xuXG4gIGNvbnN0IGNvZGUgPSBwYXRoLmNoYXJDb2RlQXQoMCk7XG4gIGlmIChpc1BhdGhTZXBhcmF0b3IoY29kZSkpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBlbHNlIGlmIChpc1dpbmRvd3NEZXZpY2VSb290KGNvZGUpKSB7XG4gICAgLy8gUG9zc2libGUgZGV2aWNlIHJvb3RcblxuICAgIGlmIChsZW4gPiAyICYmIHBhdGguY2hhckNvZGVBdCgxKSA9PT0gQ0hBUl9DT0xPTikge1xuICAgICAgaWYgKGlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoMikpKSByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIEpvaW4gYWxsIGdpdmVuIGEgc2VxdWVuY2Ugb2YgYHBhdGhzYCx0aGVuIG5vcm1hbGl6ZXMgdGhlIHJlc3VsdGluZyBwYXRoLlxuICogQHBhcmFtIHBhdGhzIHRvIGJlIGpvaW5lZCBhbmQgbm9ybWFsaXplZFxuICovXG5leHBvcnQgZnVuY3Rpb24gam9pbiguLi5wYXRoczogc3RyaW5nW10pOiBzdHJpbmcge1xuICBjb25zdCBwYXRoc0NvdW50ID0gcGF0aHMubGVuZ3RoO1xuICBpZiAocGF0aHNDb3VudCA9PT0gMCkgcmV0dXJuIFwiLlwiO1xuXG4gIGxldCBqb2luZWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgbGV0IGZpcnN0UGFydDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcGF0aHNDb3VudDsgKytpKSB7XG4gICAgY29uc3QgcGF0aCA9IHBhdGhzW2ldO1xuICAgIGFzc2VydFBhdGgocGF0aCk7XG4gICAgaWYgKHBhdGgubGVuZ3RoID4gMCkge1xuICAgICAgaWYgKGpvaW5lZCA9PT0gdW5kZWZpbmVkKSBqb2luZWQgPSBmaXJzdFBhcnQgPSBwYXRoO1xuICAgICAgZWxzZSBqb2luZWQgKz0gYFxcXFwke3BhdGh9YDtcbiAgICB9XG4gIH1cblxuICBpZiAoam9pbmVkID09PSB1bmRlZmluZWQpIHJldHVybiBcIi5cIjtcblxuICAvLyBNYWtlIHN1cmUgdGhhdCB0aGUgam9pbmVkIHBhdGggZG9lc24ndCBzdGFydCB3aXRoIHR3byBzbGFzaGVzLCBiZWNhdXNlXG4gIC8vIG5vcm1hbGl6ZSgpIHdpbGwgbWlzdGFrZSBpdCBmb3IgYW4gVU5DIHBhdGggdGhlbi5cbiAgLy9cbiAgLy8gVGhpcyBzdGVwIGlzIHNraXBwZWQgd2hlbiBpdCBpcyB2ZXJ5IGNsZWFyIHRoYXQgdGhlIHVzZXIgYWN0dWFsbHlcbiAgLy8gaW50ZW5kZWQgdG8gcG9pbnQgYXQgYW4gVU5DIHBhdGguIFRoaXMgaXMgYXNzdW1lZCB3aGVuIHRoZSBmaXJzdFxuICAvLyBub24tZW1wdHkgc3RyaW5nIGFyZ3VtZW50cyBzdGFydHMgd2l0aCBleGFjdGx5IHR3byBzbGFzaGVzIGZvbGxvd2VkIGJ5XG4gIC8vIGF0IGxlYXN0IG9uZSBtb3JlIG5vbi1zbGFzaCBjaGFyYWN0ZXIuXG4gIC8vXG4gIC8vIE5vdGUgdGhhdCBmb3Igbm9ybWFsaXplKCkgdG8gdHJlYXQgYSBwYXRoIGFzIGFuIFVOQyBwYXRoIGl0IG5lZWRzIHRvXG4gIC8vIGhhdmUgYXQgbGVhc3QgMiBjb21wb25lbnRzLCBzbyB3ZSBkb24ndCBmaWx0ZXIgZm9yIHRoYXQgaGVyZS5cbiAgLy8gVGhpcyBtZWFucyB0aGF0IHRoZSB1c2VyIGNhbiB1c2Ugam9pbiB0byBjb25zdHJ1Y3QgVU5DIHBhdGhzIGZyb21cbiAgLy8gYSBzZXJ2ZXIgbmFtZSBhbmQgYSBzaGFyZSBuYW1lOyBmb3IgZXhhbXBsZTpcbiAgLy8gICBwYXRoLmpvaW4oJy8vc2VydmVyJywgJ3NoYXJlJykgLT4gJ1xcXFxcXFxcc2VydmVyXFxcXHNoYXJlXFxcXCcpXG4gIGxldCBuZWVkc1JlcGxhY2UgPSB0cnVlO1xuICBsZXQgc2xhc2hDb3VudCA9IDA7XG4gIGFzc2VydChmaXJzdFBhcnQgIT0gbnVsbCk7XG4gIGlmIChpc1BhdGhTZXBhcmF0b3IoZmlyc3RQYXJ0LmNoYXJDb2RlQXQoMCkpKSB7XG4gICAgKytzbGFzaENvdW50O1xuICAgIGNvbnN0IGZpcnN0TGVuID0gZmlyc3RQYXJ0Lmxlbmd0aDtcbiAgICBpZiAoZmlyc3RMZW4gPiAxKSB7XG4gICAgICBpZiAoaXNQYXRoU2VwYXJhdG9yKGZpcnN0UGFydC5jaGFyQ29kZUF0KDEpKSkge1xuICAgICAgICArK3NsYXNoQ291bnQ7XG4gICAgICAgIGlmIChmaXJzdExlbiA+IDIpIHtcbiAgICAgICAgICBpZiAoaXNQYXRoU2VwYXJhdG9yKGZpcnN0UGFydC5jaGFyQ29kZUF0KDIpKSkgKytzbGFzaENvdW50O1xuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgLy8gV2UgbWF0Y2hlZCBhIFVOQyBwYXRoIGluIHRoZSBmaXJzdCBwYXJ0XG4gICAgICAgICAgICBuZWVkc1JlcGxhY2UgPSBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKG5lZWRzUmVwbGFjZSkge1xuICAgIC8vIEZpbmQgYW55IG1vcmUgY29uc2VjdXRpdmUgc2xhc2hlcyB3ZSBuZWVkIHRvIHJlcGxhY2VcbiAgICBmb3IgKDsgc2xhc2hDb3VudCA8IGpvaW5lZC5sZW5ndGg7ICsrc2xhc2hDb3VudCkge1xuICAgICAgaWYgKCFpc1BhdGhTZXBhcmF0b3Ioam9pbmVkLmNoYXJDb2RlQXQoc2xhc2hDb3VudCkpKSBicmVhaztcbiAgICB9XG5cbiAgICAvLyBSZXBsYWNlIHRoZSBzbGFzaGVzIGlmIG5lZWRlZFxuICAgIGlmIChzbGFzaENvdW50ID49IDIpIGpvaW5lZCA9IGBcXFxcJHtqb2luZWQuc2xpY2Uoc2xhc2hDb3VudCl9YDtcbiAgfVxuXG4gIHJldHVybiBub3JtYWxpemUoam9pbmVkKTtcbn1cblxuLyoqXG4gKiBJdCB3aWxsIHNvbHZlIHRoZSByZWxhdGl2ZSBwYXRoIGZyb20gYGZyb21gIHRvIGB0b2AsIGZvciBpbnN0YW5jZTpcbiAqICBmcm9tID0gJ0M6XFxcXG9yYW5kZWFcXFxcdGVzdFxcXFxhYWEnXG4gKiAgdG8gPSAnQzpcXFxcb3JhbmRlYVxcXFxpbXBsXFxcXGJiYidcbiAqIFRoZSBvdXRwdXQgb2YgdGhlIGZ1bmN0aW9uIHNob3VsZCBiZTogJy4uXFxcXC4uXFxcXGltcGxcXFxcYmJiJ1xuICogQHBhcmFtIGZyb20gcmVsYXRpdmUgcGF0aFxuICogQHBhcmFtIHRvIHJlbGF0aXZlIHBhdGhcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbGF0aXZlKGZyb206IHN0cmluZywgdG86IHN0cmluZyk6IHN0cmluZyB7XG4gIGFzc2VydFBhdGgoZnJvbSk7XG4gIGFzc2VydFBhdGgodG8pO1xuXG4gIGlmIChmcm9tID09PSB0bykgcmV0dXJuIFwiXCI7XG5cbiAgY29uc3QgZnJvbU9yaWcgPSByZXNvbHZlKGZyb20pO1xuICBjb25zdCB0b09yaWcgPSByZXNvbHZlKHRvKTtcblxuICBpZiAoZnJvbU9yaWcgPT09IHRvT3JpZykgcmV0dXJuIFwiXCI7XG5cbiAgZnJvbSA9IGZyb21PcmlnLnRvTG93ZXJDYXNlKCk7XG4gIHRvID0gdG9PcmlnLnRvTG93ZXJDYXNlKCk7XG5cbiAgaWYgKGZyb20gPT09IHRvKSByZXR1cm4gXCJcIjtcblxuICAvLyBUcmltIGFueSBsZWFkaW5nIGJhY2tzbGFzaGVzXG4gIGxldCBmcm9tU3RhcnQgPSAwO1xuICBsZXQgZnJvbUVuZCA9IGZyb20ubGVuZ3RoO1xuICBmb3IgKDsgZnJvbVN0YXJ0IDwgZnJvbUVuZDsgKytmcm9tU3RhcnQpIHtcbiAgICBpZiAoZnJvbS5jaGFyQ29kZUF0KGZyb21TdGFydCkgIT09IENIQVJfQkFDS1dBUkRfU0xBU0gpIGJyZWFrO1xuICB9XG4gIC8vIFRyaW0gdHJhaWxpbmcgYmFja3NsYXNoZXMgKGFwcGxpY2FibGUgdG8gVU5DIHBhdGhzIG9ubHkpXG4gIGZvciAoOyBmcm9tRW5kIC0gMSA+IGZyb21TdGFydDsgLS1mcm9tRW5kKSB7XG4gICAgaWYgKGZyb20uY2hhckNvZGVBdChmcm9tRW5kIC0gMSkgIT09IENIQVJfQkFDS1dBUkRfU0xBU0gpIGJyZWFrO1xuICB9XG4gIGNvbnN0IGZyb21MZW4gPSBmcm9tRW5kIC0gZnJvbVN0YXJ0O1xuXG4gIC8vIFRyaW0gYW55IGxlYWRpbmcgYmFja3NsYXNoZXNcbiAgbGV0IHRvU3RhcnQgPSAwO1xuICBsZXQgdG9FbmQgPSB0by5sZW5ndGg7XG4gIGZvciAoOyB0b1N0YXJ0IDwgdG9FbmQ7ICsrdG9TdGFydCkge1xuICAgIGlmICh0by5jaGFyQ29kZUF0KHRvU3RhcnQpICE9PSBDSEFSX0JBQ0tXQVJEX1NMQVNIKSBicmVhaztcbiAgfVxuICAvLyBUcmltIHRyYWlsaW5nIGJhY2tzbGFzaGVzIChhcHBsaWNhYmxlIHRvIFVOQyBwYXRocyBvbmx5KVxuICBmb3IgKDsgdG9FbmQgLSAxID4gdG9TdGFydDsgLS10b0VuZCkge1xuICAgIGlmICh0by5jaGFyQ29kZUF0KHRvRW5kIC0gMSkgIT09IENIQVJfQkFDS1dBUkRfU0xBU0gpIGJyZWFrO1xuICB9XG4gIGNvbnN0IHRvTGVuID0gdG9FbmQgLSB0b1N0YXJ0O1xuXG4gIC8vIENvbXBhcmUgcGF0aHMgdG8gZmluZCB0aGUgbG9uZ2VzdCBjb21tb24gcGF0aCBmcm9tIHJvb3RcbiAgY29uc3QgbGVuZ3RoID0gZnJvbUxlbiA8IHRvTGVuID8gZnJvbUxlbiA6IHRvTGVuO1xuICBsZXQgbGFzdENvbW1vblNlcCA9IC0xO1xuICBsZXQgaSA9IDA7XG4gIGZvciAoOyBpIDw9IGxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGkgPT09IGxlbmd0aCkge1xuICAgICAgaWYgKHRvTGVuID4gbGVuZ3RoKSB7XG4gICAgICAgIGlmICh0by5jaGFyQ29kZUF0KHRvU3RhcnQgKyBpKSA9PT0gQ0hBUl9CQUNLV0FSRF9TTEFTSCkge1xuICAgICAgICAgIC8vIFdlIGdldCBoZXJlIGlmIGBmcm9tYCBpcyB0aGUgZXhhY3QgYmFzZSBwYXRoIGZvciBgdG9gLlxuICAgICAgICAgIC8vIEZvciBleGFtcGxlOiBmcm9tPSdDOlxcXFxmb29cXFxcYmFyJzsgdG89J0M6XFxcXGZvb1xcXFxiYXJcXFxcYmF6J1xuICAgICAgICAgIHJldHVybiB0b09yaWcuc2xpY2UodG9TdGFydCArIGkgKyAxKTtcbiAgICAgICAgfSBlbHNlIGlmIChpID09PSAyKSB7XG4gICAgICAgICAgLy8gV2UgZ2V0IGhlcmUgaWYgYGZyb21gIGlzIHRoZSBkZXZpY2Ugcm9vdC5cbiAgICAgICAgICAvLyBGb3IgZXhhbXBsZTogZnJvbT0nQzpcXFxcJzsgdG89J0M6XFxcXGZvbydcbiAgICAgICAgICByZXR1cm4gdG9PcmlnLnNsaWNlKHRvU3RhcnQgKyBpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGZyb21MZW4gPiBsZW5ndGgpIHtcbiAgICAgICAgaWYgKGZyb20uY2hhckNvZGVBdChmcm9tU3RhcnQgKyBpKSA9PT0gQ0hBUl9CQUNLV0FSRF9TTEFTSCkge1xuICAgICAgICAgIC8vIFdlIGdldCBoZXJlIGlmIGB0b2AgaXMgdGhlIGV4YWN0IGJhc2UgcGF0aCBmb3IgYGZyb21gLlxuICAgICAgICAgIC8vIEZvciBleGFtcGxlOiBmcm9tPSdDOlxcXFxmb29cXFxcYmFyJzsgdG89J0M6XFxcXGZvbydcbiAgICAgICAgICBsYXN0Q29tbW9uU2VwID0gaTtcbiAgICAgICAgfSBlbHNlIGlmIChpID09PSAyKSB7XG4gICAgICAgICAgLy8gV2UgZ2V0IGhlcmUgaWYgYHRvYCBpcyB0aGUgZGV2aWNlIHJvb3QuXG4gICAgICAgICAgLy8gRm9yIGV4YW1wbGU6IGZyb209J0M6XFxcXGZvb1xcXFxiYXInOyB0bz0nQzpcXFxcJ1xuICAgICAgICAgIGxhc3RDb21tb25TZXAgPSAzO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY29uc3QgZnJvbUNvZGUgPSBmcm9tLmNoYXJDb2RlQXQoZnJvbVN0YXJ0ICsgaSk7XG4gICAgY29uc3QgdG9Db2RlID0gdG8uY2hhckNvZGVBdCh0b1N0YXJ0ICsgaSk7XG4gICAgaWYgKGZyb21Db2RlICE9PSB0b0NvZGUpIGJyZWFrO1xuICAgIGVsc2UgaWYgKGZyb21Db2RlID09PSBDSEFSX0JBQ0tXQVJEX1NMQVNIKSBsYXN0Q29tbW9uU2VwID0gaTtcbiAgfVxuXG4gIC8vIFdlIGZvdW5kIGEgbWlzbWF0Y2ggYmVmb3JlIHRoZSBmaXJzdCBjb21tb24gcGF0aCBzZXBhcmF0b3Igd2FzIHNlZW4sIHNvXG4gIC8vIHJldHVybiB0aGUgb3JpZ2luYWwgYHRvYC5cbiAgaWYgKGkgIT09IGxlbmd0aCAmJiBsYXN0Q29tbW9uU2VwID09PSAtMSkge1xuICAgIHJldHVybiB0b09yaWc7XG4gIH1cblxuICBsZXQgb3V0ID0gXCJcIjtcbiAgaWYgKGxhc3RDb21tb25TZXAgPT09IC0xKSBsYXN0Q29tbW9uU2VwID0gMDtcbiAgLy8gR2VuZXJhdGUgdGhlIHJlbGF0aXZlIHBhdGggYmFzZWQgb24gdGhlIHBhdGggZGlmZmVyZW5jZSBiZXR3ZWVuIGB0b2AgYW5kXG4gIC8vIGBmcm9tYFxuICBmb3IgKGkgPSBmcm9tU3RhcnQgKyBsYXN0Q29tbW9uU2VwICsgMTsgaSA8PSBmcm9tRW5kOyArK2kpIHtcbiAgICBpZiAoaSA9PT0gZnJvbUVuZCB8fCBmcm9tLmNoYXJDb2RlQXQoaSkgPT09IENIQVJfQkFDS1dBUkRfU0xBU0gpIHtcbiAgICAgIGlmIChvdXQubGVuZ3RoID09PSAwKSBvdXQgKz0gXCIuLlwiO1xuICAgICAgZWxzZSBvdXQgKz0gXCJcXFxcLi5cIjtcbiAgICB9XG4gIH1cblxuICAvLyBMYXN0bHksIGFwcGVuZCB0aGUgcmVzdCBvZiB0aGUgZGVzdGluYXRpb24gKGB0b2ApIHBhdGggdGhhdCBjb21lcyBhZnRlclxuICAvLyB0aGUgY29tbW9uIHBhdGggcGFydHNcbiAgaWYgKG91dC5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIG91dCArIHRvT3JpZy5zbGljZSh0b1N0YXJ0ICsgbGFzdENvbW1vblNlcCwgdG9FbmQpO1xuICB9IGVsc2Uge1xuICAgIHRvU3RhcnQgKz0gbGFzdENvbW1vblNlcDtcbiAgICBpZiAodG9PcmlnLmNoYXJDb2RlQXQodG9TdGFydCkgPT09IENIQVJfQkFDS1dBUkRfU0xBU0gpICsrdG9TdGFydDtcbiAgICByZXR1cm4gdG9PcmlnLnNsaWNlKHRvU3RhcnQsIHRvRW5kKTtcbiAgfVxufVxuXG4vKipcbiAqIFJlc29sdmVzIHBhdGggdG8gYSBuYW1lc3BhY2UgcGF0aFxuICogQHBhcmFtIHBhdGggdG8gcmVzb2x2ZSB0byBuYW1lc3BhY2VcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvTmFtZXNwYWNlZFBhdGgocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgLy8gTm90ZTogdGhpcyB3aWxsICpwcm9iYWJseSogdGhyb3cgc29tZXdoZXJlLlxuICBpZiAodHlwZW9mIHBhdGggIT09IFwic3RyaW5nXCIpIHJldHVybiBwYXRoO1xuICBpZiAocGF0aC5sZW5ndGggPT09IDApIHJldHVybiBcIlwiO1xuXG4gIGNvbnN0IHJlc29sdmVkUGF0aCA9IHJlc29sdmUocGF0aCk7XG5cbiAgaWYgKHJlc29sdmVkUGF0aC5sZW5ndGggPj0gMykge1xuICAgIGlmIChyZXNvbHZlZFBhdGguY2hhckNvZGVBdCgwKSA9PT0gQ0hBUl9CQUNLV0FSRF9TTEFTSCkge1xuICAgICAgLy8gUG9zc2libGUgVU5DIHJvb3RcblxuICAgICAgaWYgKHJlc29sdmVkUGF0aC5jaGFyQ29kZUF0KDEpID09PSBDSEFSX0JBQ0tXQVJEX1NMQVNIKSB7XG4gICAgICAgIGNvbnN0IGNvZGUgPSByZXNvbHZlZFBhdGguY2hhckNvZGVBdCgyKTtcbiAgICAgICAgaWYgKGNvZGUgIT09IENIQVJfUVVFU1RJT05fTUFSSyAmJiBjb2RlICE9PSBDSEFSX0RPVCkge1xuICAgICAgICAgIC8vIE1hdGNoZWQgbm9uLWxvbmcgVU5DIHJvb3QsIGNvbnZlcnQgdGhlIHBhdGggdG8gYSBsb25nIFVOQyBwYXRoXG4gICAgICAgICAgcmV0dXJuIGBcXFxcXFxcXD9cXFxcVU5DXFxcXCR7cmVzb2x2ZWRQYXRoLnNsaWNlKDIpfWA7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGlzV2luZG93c0RldmljZVJvb3QocmVzb2x2ZWRQYXRoLmNoYXJDb2RlQXQoMCkpKSB7XG4gICAgICAvLyBQb3NzaWJsZSBkZXZpY2Ugcm9vdFxuXG4gICAgICBpZiAoXG4gICAgICAgIHJlc29sdmVkUGF0aC5jaGFyQ29kZUF0KDEpID09PSBDSEFSX0NPTE9OICYmXG4gICAgICAgIHJlc29sdmVkUGF0aC5jaGFyQ29kZUF0KDIpID09PSBDSEFSX0JBQ0tXQVJEX1NMQVNIXG4gICAgICApIHtcbiAgICAgICAgLy8gTWF0Y2hlZCBkZXZpY2Ugcm9vdCwgY29udmVydCB0aGUgcGF0aCB0byBhIGxvbmcgVU5DIHBhdGhcbiAgICAgICAgcmV0dXJuIGBcXFxcXFxcXD9cXFxcJHtyZXNvbHZlZFBhdGh9YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gcGF0aDtcbn1cblxuLyoqXG4gKiBSZXR1cm4gdGhlIGRpcmVjdG9yeSBuYW1lIG9mIGEgYHBhdGhgLlxuICogQHBhcmFtIHBhdGggdG8gZGV0ZXJtaW5lIG5hbWUgZm9yXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkaXJuYW1lKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gIGFzc2VydFBhdGgocGF0aCk7XG4gIGNvbnN0IGxlbiA9IHBhdGgubGVuZ3RoO1xuICBpZiAobGVuID09PSAwKSByZXR1cm4gXCIuXCI7XG4gIGxldCByb290RW5kID0gLTE7XG4gIGxldCBlbmQgPSAtMTtcbiAgbGV0IG1hdGNoZWRTbGFzaCA9IHRydWU7XG4gIGxldCBvZmZzZXQgPSAwO1xuICBjb25zdCBjb2RlID0gcGF0aC5jaGFyQ29kZUF0KDApO1xuXG4gIC8vIFRyeSB0byBtYXRjaCBhIHJvb3RcbiAgaWYgKGxlbiA+IDEpIHtcbiAgICBpZiAoaXNQYXRoU2VwYXJhdG9yKGNvZGUpKSB7XG4gICAgICAvLyBQb3NzaWJsZSBVTkMgcm9vdFxuXG4gICAgICByb290RW5kID0gb2Zmc2V0ID0gMTtcblxuICAgICAgaWYgKGlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoMSkpKSB7XG4gICAgICAgIC8vIE1hdGNoZWQgZG91YmxlIHBhdGggc2VwYXJhdG9yIGF0IGJlZ2lubmluZ1xuICAgICAgICBsZXQgaiA9IDI7XG4gICAgICAgIGxldCBsYXN0ID0gajtcbiAgICAgICAgLy8gTWF0Y2ggMSBvciBtb3JlIG5vbi1wYXRoIHNlcGFyYXRvcnNcbiAgICAgICAgZm9yICg7IGogPCBsZW47ICsraikge1xuICAgICAgICAgIGlmIChpc1BhdGhTZXBhcmF0b3IocGF0aC5jaGFyQ29kZUF0KGopKSkgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGogPCBsZW4gJiYgaiAhPT0gbGFzdCkge1xuICAgICAgICAgIC8vIE1hdGNoZWQhXG4gICAgICAgICAgbGFzdCA9IGo7XG4gICAgICAgICAgLy8gTWF0Y2ggMSBvciBtb3JlIHBhdGggc2VwYXJhdG9yc1xuICAgICAgICAgIGZvciAoOyBqIDwgbGVuOyArK2opIHtcbiAgICAgICAgICAgIGlmICghaXNQYXRoU2VwYXJhdG9yKHBhdGguY2hhckNvZGVBdChqKSkpIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoaiA8IGxlbiAmJiBqICE9PSBsYXN0KSB7XG4gICAgICAgICAgICAvLyBNYXRjaGVkIVxuICAgICAgICAgICAgbGFzdCA9IGo7XG4gICAgICAgICAgICAvLyBNYXRjaCAxIG9yIG1vcmUgbm9uLXBhdGggc2VwYXJhdG9yc1xuICAgICAgICAgICAgZm9yICg7IGogPCBsZW47ICsraikge1xuICAgICAgICAgICAgICBpZiAoaXNQYXRoU2VwYXJhdG9yKHBhdGguY2hhckNvZGVBdChqKSkpIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGogPT09IGxlbikge1xuICAgICAgICAgICAgICAvLyBXZSBtYXRjaGVkIGEgVU5DIHJvb3Qgb25seVxuICAgICAgICAgICAgICByZXR1cm4gcGF0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChqICE9PSBsYXN0KSB7XG4gICAgICAgICAgICAgIC8vIFdlIG1hdGNoZWQgYSBVTkMgcm9vdCB3aXRoIGxlZnRvdmVyc1xuXG4gICAgICAgICAgICAgIC8vIE9mZnNldCBieSAxIHRvIGluY2x1ZGUgdGhlIHNlcGFyYXRvciBhZnRlciB0aGUgVU5DIHJvb3QgdG9cbiAgICAgICAgICAgICAgLy8gdHJlYXQgaXQgYXMgYSBcIm5vcm1hbCByb290XCIgb24gdG9wIG9mIGEgKFVOQykgcm9vdFxuICAgICAgICAgICAgICByb290RW5kID0gb2Zmc2V0ID0gaiArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChpc1dpbmRvd3NEZXZpY2VSb290KGNvZGUpKSB7XG4gICAgICAvLyBQb3NzaWJsZSBkZXZpY2Ugcm9vdFxuXG4gICAgICBpZiAocGF0aC5jaGFyQ29kZUF0KDEpID09PSBDSEFSX0NPTE9OKSB7XG4gICAgICAgIHJvb3RFbmQgPSBvZmZzZXQgPSAyO1xuICAgICAgICBpZiAobGVuID4gMikge1xuICAgICAgICAgIGlmIChpc1BhdGhTZXBhcmF0b3IocGF0aC5jaGFyQ29kZUF0KDIpKSkgcm9vdEVuZCA9IG9mZnNldCA9IDM7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSBpZiAoaXNQYXRoU2VwYXJhdG9yKGNvZGUpKSB7XG4gICAgLy8gYHBhdGhgIGNvbnRhaW5zIGp1c3QgYSBwYXRoIHNlcGFyYXRvciwgZXhpdCBlYXJseSB0byBhdm9pZFxuICAgIC8vIHVubmVjZXNzYXJ5IHdvcmtcbiAgICByZXR1cm4gcGF0aDtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSBsZW4gLSAxOyBpID49IG9mZnNldDsgLS1pKSB7XG4gICAgaWYgKGlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoaSkpKSB7XG4gICAgICBpZiAoIW1hdGNoZWRTbGFzaCkge1xuICAgICAgICBlbmQgPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gV2Ugc2F3IHRoZSBmaXJzdCBub24tcGF0aCBzZXBhcmF0b3JcbiAgICAgIG1hdGNoZWRTbGFzaCA9IGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIGlmIChlbmQgPT09IC0xKSB7XG4gICAgaWYgKHJvb3RFbmQgPT09IC0xKSByZXR1cm4gXCIuXCI7XG4gICAgZWxzZSBlbmQgPSByb290RW5kO1xuICB9XG4gIHJldHVybiBwYXRoLnNsaWNlKDAsIGVuZCk7XG59XG5cbi8qKlxuICogUmV0dXJuIHRoZSBsYXN0IHBvcnRpb24gb2YgYSBgcGF0aGAuIFRyYWlsaW5nIGRpcmVjdG9yeSBzZXBhcmF0b3JzIGFyZSBpZ25vcmVkLlxuICogQHBhcmFtIHBhdGggdG8gcHJvY2Vzc1xuICogQHBhcmFtIGV4dCBvZiBwYXRoIGRpcmVjdG9yeVxuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZW5hbWUocGF0aDogc3RyaW5nLCBleHQgPSBcIlwiKTogc3RyaW5nIHtcbiAgaWYgKGV4dCAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiBleHQgIT09IFwic3RyaW5nXCIpIHtcbiAgICB0aHJvdyBuZXcgRVJSX0lOVkFMSURfQVJHX1RZUEUoXCJleHRcIiwgW1wic3RyaW5nXCJdLCBleHQpO1xuICB9XG5cbiAgYXNzZXJ0UGF0aChwYXRoKTtcblxuICBsZXQgc3RhcnQgPSAwO1xuICBsZXQgZW5kID0gLTE7XG4gIGxldCBtYXRjaGVkU2xhc2ggPSB0cnVlO1xuICBsZXQgaTogbnVtYmVyO1xuXG4gIC8vIENoZWNrIGZvciBhIGRyaXZlIGxldHRlciBwcmVmaXggc28gYXMgbm90IHRvIG1pc3Rha2UgdGhlIGZvbGxvd2luZ1xuICAvLyBwYXRoIHNlcGFyYXRvciBhcyBhbiBleHRyYSBzZXBhcmF0b3IgYXQgdGhlIGVuZCBvZiB0aGUgcGF0aCB0aGF0IGNhbiBiZVxuICAvLyBkaXNyZWdhcmRlZFxuICBpZiAocGF0aC5sZW5ndGggPj0gMikge1xuICAgIGNvbnN0IGRyaXZlID0gcGF0aC5jaGFyQ29kZUF0KDApO1xuICAgIGlmIChpc1dpbmRvd3NEZXZpY2VSb290KGRyaXZlKSkge1xuICAgICAgaWYgKHBhdGguY2hhckNvZGVBdCgxKSA9PT0gQ0hBUl9DT0xPTikgc3RhcnQgPSAyO1xuICAgIH1cbiAgfVxuXG4gIGlmIChleHQgIT09IHVuZGVmaW5lZCAmJiBleHQubGVuZ3RoID4gMCAmJiBleHQubGVuZ3RoIDw9IHBhdGgubGVuZ3RoKSB7XG4gICAgaWYgKGV4dC5sZW5ndGggPT09IHBhdGgubGVuZ3RoICYmIGV4dCA9PT0gcGF0aCkgcmV0dXJuIFwiXCI7XG4gICAgbGV0IGV4dElkeCA9IGV4dC5sZW5ndGggLSAxO1xuICAgIGxldCBmaXJzdE5vblNsYXNoRW5kID0gLTE7XG4gICAgZm9yIChpID0gcGF0aC5sZW5ndGggLSAxOyBpID49IHN0YXJ0OyAtLWkpIHtcbiAgICAgIGNvbnN0IGNvZGUgPSBwYXRoLmNoYXJDb2RlQXQoaSk7XG4gICAgICBpZiAoaXNQYXRoU2VwYXJhdG9yKGNvZGUpKSB7XG4gICAgICAgIC8vIElmIHdlIHJlYWNoZWQgYSBwYXRoIHNlcGFyYXRvciB0aGF0IHdhcyBub3QgcGFydCBvZiBhIHNldCBvZiBwYXRoXG4gICAgICAgIC8vIHNlcGFyYXRvcnMgYXQgdGhlIGVuZCBvZiB0aGUgc3RyaW5nLCBzdG9wIG5vd1xuICAgICAgICBpZiAoIW1hdGNoZWRTbGFzaCkge1xuICAgICAgICAgIHN0YXJ0ID0gaSArIDE7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaXJzdE5vblNsYXNoRW5kID09PSAtMSkge1xuICAgICAgICAgIC8vIFdlIHNhdyB0aGUgZmlyc3Qgbm9uLXBhdGggc2VwYXJhdG9yLCByZW1lbWJlciB0aGlzIGluZGV4IGluIGNhc2VcbiAgICAgICAgICAvLyB3ZSBuZWVkIGl0IGlmIHRoZSBleHRlbnNpb24gZW5kcyB1cCBub3QgbWF0Y2hpbmdcbiAgICAgICAgICBtYXRjaGVkU2xhc2ggPSBmYWxzZTtcbiAgICAgICAgICBmaXJzdE5vblNsYXNoRW5kID0gaSArIDE7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGV4dElkeCA+PSAwKSB7XG4gICAgICAgICAgLy8gVHJ5IHRvIG1hdGNoIHRoZSBleHBsaWNpdCBleHRlbnNpb25cbiAgICAgICAgICBpZiAoY29kZSA9PT0gZXh0LmNoYXJDb2RlQXQoZXh0SWR4KSkge1xuICAgICAgICAgICAgaWYgKC0tZXh0SWR4ID09PSAtMSkge1xuICAgICAgICAgICAgICAvLyBXZSBtYXRjaGVkIHRoZSBleHRlbnNpb24sIHNvIG1hcmsgdGhpcyBhcyB0aGUgZW5kIG9mIG91ciBwYXRoXG4gICAgICAgICAgICAgIC8vIGNvbXBvbmVudFxuICAgICAgICAgICAgICBlbmQgPSBpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBFeHRlbnNpb24gZG9lcyBub3QgbWF0Y2gsIHNvIG91ciByZXN1bHQgaXMgdGhlIGVudGlyZSBwYXRoXG4gICAgICAgICAgICAvLyBjb21wb25lbnRcbiAgICAgICAgICAgIGV4dElkeCA9IC0xO1xuICAgICAgICAgICAgZW5kID0gZmlyc3ROb25TbGFzaEVuZDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc3RhcnQgPT09IGVuZCkgZW5kID0gZmlyc3ROb25TbGFzaEVuZDtcbiAgICBlbHNlIGlmIChlbmQgPT09IC0xKSBlbmQgPSBwYXRoLmxlbmd0aDtcbiAgICByZXR1cm4gcGF0aC5zbGljZShzdGFydCwgZW5kKTtcbiAgfSBlbHNlIHtcbiAgICBmb3IgKGkgPSBwYXRoLmxlbmd0aCAtIDE7IGkgPj0gc3RhcnQ7IC0taSkge1xuICAgICAgaWYgKGlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoaSkpKSB7XG4gICAgICAgIC8vIElmIHdlIHJlYWNoZWQgYSBwYXRoIHNlcGFyYXRvciB0aGF0IHdhcyBub3QgcGFydCBvZiBhIHNldCBvZiBwYXRoXG4gICAgICAgIC8vIHNlcGFyYXRvcnMgYXQgdGhlIGVuZCBvZiB0aGUgc3RyaW5nLCBzdG9wIG5vd1xuICAgICAgICBpZiAoIW1hdGNoZWRTbGFzaCkge1xuICAgICAgICAgIHN0YXJ0ID0gaSArIDE7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoZW5kID09PSAtMSkge1xuICAgICAgICAvLyBXZSBzYXcgdGhlIGZpcnN0IG5vbi1wYXRoIHNlcGFyYXRvciwgbWFyayB0aGlzIGFzIHRoZSBlbmQgb2Ygb3VyXG4gICAgICAgIC8vIHBhdGggY29tcG9uZW50XG4gICAgICAgIG1hdGNoZWRTbGFzaCA9IGZhbHNlO1xuICAgICAgICBlbmQgPSBpICsgMTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZW5kID09PSAtMSkgcmV0dXJuIFwiXCI7XG4gICAgcmV0dXJuIHBhdGguc2xpY2Uoc3RhcnQsIGVuZCk7XG4gIH1cbn1cblxuLyoqXG4gKiBSZXR1cm4gdGhlIGV4dGVuc2lvbiBvZiB0aGUgYHBhdGhgLlxuICogQHBhcmFtIHBhdGggd2l0aCBleHRlbnNpb25cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV4dG5hbWUocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgYXNzZXJ0UGF0aChwYXRoKTtcbiAgbGV0IHN0YXJ0ID0gMDtcbiAgbGV0IHN0YXJ0RG90ID0gLTE7XG4gIGxldCBzdGFydFBhcnQgPSAwO1xuICBsZXQgZW5kID0gLTE7XG4gIGxldCBtYXRjaGVkU2xhc2ggPSB0cnVlO1xuICAvLyBUcmFjayB0aGUgc3RhdGUgb2YgY2hhcmFjdGVycyAoaWYgYW55KSB3ZSBzZWUgYmVmb3JlIG91ciBmaXJzdCBkb3QgYW5kXG4gIC8vIGFmdGVyIGFueSBwYXRoIHNlcGFyYXRvciB3ZSBmaW5kXG4gIGxldCBwcmVEb3RTdGF0ZSA9IDA7XG5cbiAgLy8gQ2hlY2sgZm9yIGEgZHJpdmUgbGV0dGVyIHByZWZpeCBzbyBhcyBub3QgdG8gbWlzdGFrZSB0aGUgZm9sbG93aW5nXG4gIC8vIHBhdGggc2VwYXJhdG9yIGFzIGFuIGV4dHJhIHNlcGFyYXRvciBhdCB0aGUgZW5kIG9mIHRoZSBwYXRoIHRoYXQgY2FuIGJlXG4gIC8vIGRpc3JlZ2FyZGVkXG5cbiAgaWYgKFxuICAgIHBhdGgubGVuZ3RoID49IDIgJiZcbiAgICBwYXRoLmNoYXJDb2RlQXQoMSkgPT09IENIQVJfQ09MT04gJiZcbiAgICBpc1dpbmRvd3NEZXZpY2VSb290KHBhdGguY2hhckNvZGVBdCgwKSlcbiAgKSB7XG4gICAgc3RhcnQgPSBzdGFydFBhcnQgPSAyO1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IHBhdGgubGVuZ3RoIC0gMTsgaSA+PSBzdGFydDsgLS1pKSB7XG4gICAgY29uc3QgY29kZSA9IHBhdGguY2hhckNvZGVBdChpKTtcbiAgICBpZiAoaXNQYXRoU2VwYXJhdG9yKGNvZGUpKSB7XG4gICAgICAvLyBJZiB3ZSByZWFjaGVkIGEgcGF0aCBzZXBhcmF0b3IgdGhhdCB3YXMgbm90IHBhcnQgb2YgYSBzZXQgb2YgcGF0aFxuICAgICAgLy8gc2VwYXJhdG9ycyBhdCB0aGUgZW5kIG9mIHRoZSBzdHJpbmcsIHN0b3Agbm93XG4gICAgICBpZiAoIW1hdGNoZWRTbGFzaCkge1xuICAgICAgICBzdGFydFBhcnQgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKGVuZCA9PT0gLTEpIHtcbiAgICAgIC8vIFdlIHNhdyB0aGUgZmlyc3Qgbm9uLXBhdGggc2VwYXJhdG9yLCBtYXJrIHRoaXMgYXMgdGhlIGVuZCBvZiBvdXJcbiAgICAgIC8vIGV4dGVuc2lvblxuICAgICAgbWF0Y2hlZFNsYXNoID0gZmFsc2U7XG4gICAgICBlbmQgPSBpICsgMTtcbiAgICB9XG4gICAgaWYgKGNvZGUgPT09IENIQVJfRE9UKSB7XG4gICAgICAvLyBJZiB0aGlzIGlzIG91ciBmaXJzdCBkb3QsIG1hcmsgaXQgYXMgdGhlIHN0YXJ0IG9mIG91ciBleHRlbnNpb25cbiAgICAgIGlmIChzdGFydERvdCA9PT0gLTEpIHN0YXJ0RG90ID0gaTtcbiAgICAgIGVsc2UgaWYgKHByZURvdFN0YXRlICE9PSAxKSBwcmVEb3RTdGF0ZSA9IDE7XG4gICAgfSBlbHNlIGlmIChzdGFydERvdCAhPT0gLTEpIHtcbiAgICAgIC8vIFdlIHNhdyBhIG5vbi1kb3QgYW5kIG5vbi1wYXRoIHNlcGFyYXRvciBiZWZvcmUgb3VyIGRvdCwgc28gd2Ugc2hvdWxkXG4gICAgICAvLyBoYXZlIGEgZ29vZCBjaGFuY2UgYXQgaGF2aW5nIGEgbm9uLWVtcHR5IGV4dGVuc2lvblxuICAgICAgcHJlRG90U3RhdGUgPSAtMTtcbiAgICB9XG4gIH1cblxuICBpZiAoXG4gICAgc3RhcnREb3QgPT09IC0xIHx8XG4gICAgZW5kID09PSAtMSB8fFxuICAgIC8vIFdlIHNhdyBhIG5vbi1kb3QgY2hhcmFjdGVyIGltbWVkaWF0ZWx5IGJlZm9yZSB0aGUgZG90XG4gICAgcHJlRG90U3RhdGUgPT09IDAgfHxcbiAgICAvLyBUaGUgKHJpZ2h0LW1vc3QpIHRyaW1tZWQgcGF0aCBjb21wb25lbnQgaXMgZXhhY3RseSAnLi4nXG4gICAgKHByZURvdFN0YXRlID09PSAxICYmIHN0YXJ0RG90ID09PSBlbmQgLSAxICYmIHN0YXJ0RG90ID09PSBzdGFydFBhcnQgKyAxKVxuICApIHtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuICByZXR1cm4gcGF0aC5zbGljZShzdGFydERvdCwgZW5kKTtcbn1cblxuLyoqXG4gKiBHZW5lcmF0ZSBhIHBhdGggZnJvbSBgRm9ybWF0SW5wdXRQYXRoT2JqZWN0YCBvYmplY3QuXG4gKiBAcGFyYW0gcGF0aE9iamVjdCB3aXRoIHBhdGhcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdChwYXRoT2JqZWN0OiBGb3JtYXRJbnB1dFBhdGhPYmplY3QpOiBzdHJpbmcge1xuICBpZiAocGF0aE9iamVjdCA9PT0gbnVsbCB8fCB0eXBlb2YgcGF0aE9iamVjdCAhPT0gXCJvYmplY3RcIikge1xuICAgIHRocm93IG5ldyBFUlJfSU5WQUxJRF9BUkdfVFlQRShcInBhdGhPYmplY3RcIiwgW1wiT2JqZWN0XCJdLCBwYXRoT2JqZWN0KTtcbiAgfVxuICByZXR1cm4gX2Zvcm1hdChcIlxcXFxcIiwgcGF0aE9iamVjdCk7XG59XG5cbi8qKlxuICogUmV0dXJuIGEgYFBhcnNlZFBhdGhgIG9iamVjdCBvZiB0aGUgYHBhdGhgLlxuICogQHBhcmFtIHBhdGggdG8gcHJvY2Vzc1xuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2UocGF0aDogc3RyaW5nKTogUGFyc2VkUGF0aCB7XG4gIGFzc2VydFBhdGgocGF0aCk7XG5cbiAgY29uc3QgcmV0OiBQYXJzZWRQYXRoID0geyByb290OiBcIlwiLCBkaXI6IFwiXCIsIGJhc2U6IFwiXCIsIGV4dDogXCJcIiwgbmFtZTogXCJcIiB9O1xuXG4gIGNvbnN0IGxlbiA9IHBhdGgubGVuZ3RoO1xuICBpZiAobGVuID09PSAwKSByZXR1cm4gcmV0O1xuXG4gIGxldCByb290RW5kID0gMDtcbiAgbGV0IGNvZGUgPSBwYXRoLmNoYXJDb2RlQXQoMCk7XG5cbiAgLy8gVHJ5IHRvIG1hdGNoIGEgcm9vdFxuICBpZiAobGVuID4gMSkge1xuICAgIGlmIChpc1BhdGhTZXBhcmF0b3IoY29kZSkpIHtcbiAgICAgIC8vIFBvc3NpYmxlIFVOQyByb290XG5cbiAgICAgIHJvb3RFbmQgPSAxO1xuICAgICAgaWYgKGlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoMSkpKSB7XG4gICAgICAgIC8vIE1hdGNoZWQgZG91YmxlIHBhdGggc2VwYXJhdG9yIGF0IGJlZ2lubmluZ1xuICAgICAgICBsZXQgaiA9IDI7XG4gICAgICAgIGxldCBsYXN0ID0gajtcbiAgICAgICAgLy8gTWF0Y2ggMSBvciBtb3JlIG5vbi1wYXRoIHNlcGFyYXRvcnNcbiAgICAgICAgZm9yICg7IGogPCBsZW47ICsraikge1xuICAgICAgICAgIGlmIChpc1BhdGhTZXBhcmF0b3IocGF0aC5jaGFyQ29kZUF0KGopKSkgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGogPCBsZW4gJiYgaiAhPT0gbGFzdCkge1xuICAgICAgICAgIC8vIE1hdGNoZWQhXG4gICAgICAgICAgbGFzdCA9IGo7XG4gICAgICAgICAgLy8gTWF0Y2ggMSBvciBtb3JlIHBhdGggc2VwYXJhdG9yc1xuICAgICAgICAgIGZvciAoOyBqIDwgbGVuOyArK2opIHtcbiAgICAgICAgICAgIGlmICghaXNQYXRoU2VwYXJhdG9yKHBhdGguY2hhckNvZGVBdChqKSkpIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoaiA8IGxlbiAmJiBqICE9PSBsYXN0KSB7XG4gICAgICAgICAgICAvLyBNYXRjaGVkIVxuICAgICAgICAgICAgbGFzdCA9IGo7XG4gICAgICAgICAgICAvLyBNYXRjaCAxIG9yIG1vcmUgbm9uLXBhdGggc2VwYXJhdG9yc1xuICAgICAgICAgICAgZm9yICg7IGogPCBsZW47ICsraikge1xuICAgICAgICAgICAgICBpZiAoaXNQYXRoU2VwYXJhdG9yKHBhdGguY2hhckNvZGVBdChqKSkpIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGogPT09IGxlbikge1xuICAgICAgICAgICAgICAvLyBXZSBtYXRjaGVkIGEgVU5DIHJvb3Qgb25seVxuXG4gICAgICAgICAgICAgIHJvb3RFbmQgPSBqO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChqICE9PSBsYXN0KSB7XG4gICAgICAgICAgICAgIC8vIFdlIG1hdGNoZWQgYSBVTkMgcm9vdCB3aXRoIGxlZnRvdmVyc1xuXG4gICAgICAgICAgICAgIHJvb3RFbmQgPSBqICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGlzV2luZG93c0RldmljZVJvb3QoY29kZSkpIHtcbiAgICAgIC8vIFBvc3NpYmxlIGRldmljZSByb290XG5cbiAgICAgIGlmIChwYXRoLmNoYXJDb2RlQXQoMSkgPT09IENIQVJfQ09MT04pIHtcbiAgICAgICAgcm9vdEVuZCA9IDI7XG4gICAgICAgIGlmIChsZW4gPiAyKSB7XG4gICAgICAgICAgaWYgKGlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoMikpKSB7XG4gICAgICAgICAgICBpZiAobGVuID09PSAzKSB7XG4gICAgICAgICAgICAgIC8vIGBwYXRoYCBjb250YWlucyBqdXN0IGEgZHJpdmUgcm9vdCwgZXhpdCBlYXJseSB0byBhdm9pZFxuICAgICAgICAgICAgICAvLyB1bm5lY2Vzc2FyeSB3b3JrXG4gICAgICAgICAgICAgIHJldC5yb290ID0gcmV0LmRpciA9IHBhdGg7XG4gICAgICAgICAgICAgIHJldHVybiByZXQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByb290RW5kID0gMztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gYHBhdGhgIGNvbnRhaW5zIGp1c3QgYSBkcml2ZSByb290LCBleGl0IGVhcmx5IHRvIGF2b2lkXG4gICAgICAgICAgLy8gdW5uZWNlc3Nhcnkgd29ya1xuICAgICAgICAgIHJldC5yb290ID0gcmV0LmRpciA9IHBhdGg7XG4gICAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIGlmIChpc1BhdGhTZXBhcmF0b3IoY29kZSkpIHtcbiAgICAvLyBgcGF0aGAgY29udGFpbnMganVzdCBhIHBhdGggc2VwYXJhdG9yLCBleGl0IGVhcmx5IHRvIGF2b2lkXG4gICAgLy8gdW5uZWNlc3Nhcnkgd29ya1xuICAgIHJldC5yb290ID0gcmV0LmRpciA9IHBhdGg7XG4gICAgcmV0dXJuIHJldDtcbiAgfVxuXG4gIGlmIChyb290RW5kID4gMCkgcmV0LnJvb3QgPSBwYXRoLnNsaWNlKDAsIHJvb3RFbmQpO1xuXG4gIGxldCBzdGFydERvdCA9IC0xO1xuICBsZXQgc3RhcnRQYXJ0ID0gcm9vdEVuZDtcbiAgbGV0IGVuZCA9IC0xO1xuICBsZXQgbWF0Y2hlZFNsYXNoID0gdHJ1ZTtcbiAgbGV0IGkgPSBwYXRoLmxlbmd0aCAtIDE7XG5cbiAgLy8gVHJhY2sgdGhlIHN0YXRlIG9mIGNoYXJhY3RlcnMgKGlmIGFueSkgd2Ugc2VlIGJlZm9yZSBvdXIgZmlyc3QgZG90IGFuZFxuICAvLyBhZnRlciBhbnkgcGF0aCBzZXBhcmF0b3Igd2UgZmluZFxuICBsZXQgcHJlRG90U3RhdGUgPSAwO1xuXG4gIC8vIEdldCBub24tZGlyIGluZm9cbiAgZm9yICg7IGkgPj0gcm9vdEVuZDsgLS1pKSB7XG4gICAgY29kZSA9IHBhdGguY2hhckNvZGVBdChpKTtcbiAgICBpZiAoaXNQYXRoU2VwYXJhdG9yKGNvZGUpKSB7XG4gICAgICAvLyBJZiB3ZSByZWFjaGVkIGEgcGF0aCBzZXBhcmF0b3IgdGhhdCB3YXMgbm90IHBhcnQgb2YgYSBzZXQgb2YgcGF0aFxuICAgICAgLy8gc2VwYXJhdG9ycyBhdCB0aGUgZW5kIG9mIHRoZSBzdHJpbmcsIHN0b3Agbm93XG4gICAgICBpZiAoIW1hdGNoZWRTbGFzaCkge1xuICAgICAgICBzdGFydFBhcnQgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKGVuZCA9PT0gLTEpIHtcbiAgICAgIC8vIFdlIHNhdyB0aGUgZmlyc3Qgbm9uLXBhdGggc2VwYXJhdG9yLCBtYXJrIHRoaXMgYXMgdGhlIGVuZCBvZiBvdXJcbiAgICAgIC8vIGV4dGVuc2lvblxuICAgICAgbWF0Y2hlZFNsYXNoID0gZmFsc2U7XG4gICAgICBlbmQgPSBpICsgMTtcbiAgICB9XG4gICAgaWYgKGNvZGUgPT09IENIQVJfRE9UKSB7XG4gICAgICAvLyBJZiB0aGlzIGlzIG91ciBmaXJzdCBkb3QsIG1hcmsgaXQgYXMgdGhlIHN0YXJ0IG9mIG91ciBleHRlbnNpb25cbiAgICAgIGlmIChzdGFydERvdCA9PT0gLTEpIHN0YXJ0RG90ID0gaTtcbiAgICAgIGVsc2UgaWYgKHByZURvdFN0YXRlICE9PSAxKSBwcmVEb3RTdGF0ZSA9IDE7XG4gICAgfSBlbHNlIGlmIChzdGFydERvdCAhPT0gLTEpIHtcbiAgICAgIC8vIFdlIHNhdyBhIG5vbi1kb3QgYW5kIG5vbi1wYXRoIHNlcGFyYXRvciBiZWZvcmUgb3VyIGRvdCwgc28gd2Ugc2hvdWxkXG4gICAgICAvLyBoYXZlIGEgZ29vZCBjaGFuY2UgYXQgaGF2aW5nIGEgbm9uLWVtcHR5IGV4dGVuc2lvblxuICAgICAgcHJlRG90U3RhdGUgPSAtMTtcbiAgICB9XG4gIH1cblxuICBpZiAoXG4gICAgc3RhcnREb3QgPT09IC0xIHx8XG4gICAgZW5kID09PSAtMSB8fFxuICAgIC8vIFdlIHNhdyBhIG5vbi1kb3QgY2hhcmFjdGVyIGltbWVkaWF0ZWx5IGJlZm9yZSB0aGUgZG90XG4gICAgcHJlRG90U3RhdGUgPT09IDAgfHxcbiAgICAvLyBUaGUgKHJpZ2h0LW1vc3QpIHRyaW1tZWQgcGF0aCBjb21wb25lbnQgaXMgZXhhY3RseSAnLi4nXG4gICAgKHByZURvdFN0YXRlID09PSAxICYmIHN0YXJ0RG90ID09PSBlbmQgLSAxICYmIHN0YXJ0RG90ID09PSBzdGFydFBhcnQgKyAxKVxuICApIHtcbiAgICBpZiAoZW5kICE9PSAtMSkge1xuICAgICAgcmV0LmJhc2UgPSByZXQubmFtZSA9IHBhdGguc2xpY2Uoc3RhcnRQYXJ0LCBlbmQpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICByZXQubmFtZSA9IHBhdGguc2xpY2Uoc3RhcnRQYXJ0LCBzdGFydERvdCk7XG4gICAgcmV0LmJhc2UgPSBwYXRoLnNsaWNlKHN0YXJ0UGFydCwgZW5kKTtcbiAgICByZXQuZXh0ID0gcGF0aC5zbGljZShzdGFydERvdCwgZW5kKTtcbiAgfVxuXG4gIC8vIElmIHRoZSBkaXJlY3RvcnkgaXMgdGhlIHJvb3QsIHVzZSB0aGUgZW50aXJlIHJvb3QgYXMgdGhlIGBkaXJgIGluY2x1ZGluZ1xuICAvLyB0aGUgdHJhaWxpbmcgc2xhc2ggaWYgYW55IChgQzpcXGFiY2AgLT4gYEM6XFxgKS4gT3RoZXJ3aXNlLCBzdHJpcCBvdXQgdGhlXG4gIC8vIHRyYWlsaW5nIHNsYXNoIChgQzpcXGFiY1xcZGVmYCAtPiBgQzpcXGFiY2ApLlxuICBpZiAoc3RhcnRQYXJ0ID4gMCAmJiBzdGFydFBhcnQgIT09IHJvb3RFbmQpIHtcbiAgICByZXQuZGlyID0gcGF0aC5zbGljZSgwLCBzdGFydFBhcnQgLSAxKTtcbiAgfSBlbHNlIHJldC5kaXIgPSByZXQucm9vdDtcblxuICByZXR1cm4gcmV0O1xufVxuXG4vKipcbiAqIENvbnZlcnRzIGEgZmlsZSBVUkwgdG8gYSBwYXRoIHN0cmluZy5cbiAqXG4gKiBgYGB0c1xuICogICAgICBpbXBvcnQgeyBmcm9tRmlsZVVybCB9IGZyb20gXCIuL3dpbjMyLnRzXCI7XG4gKiAgICAgIGZyb21GaWxlVXJsKFwiZmlsZTovLy9ob21lL2Zvb1wiKTsgLy8gXCJcXFxcaG9tZVxcXFxmb29cIlxuICogICAgICBmcm9tRmlsZVVybChcImZpbGU6Ly8vQzovVXNlcnMvZm9vXCIpOyAvLyBcIkM6XFxcXFVzZXJzXFxcXGZvb1wiXG4gKiAgICAgIGZyb21GaWxlVXJsKFwiZmlsZTovL2xvY2FsaG9zdC9ob21lL2Zvb1wiKTsgLy8gXCJcXFxcXFxcXGxvY2FsaG9zdFxcXFxob21lXFxcXGZvb1wiXG4gKiBgYGBcbiAqIEBwYXJhbSB1cmwgb2YgYSBmaWxlIFVSTFxuICovXG5leHBvcnQgZnVuY3Rpb24gZnJvbUZpbGVVcmwodXJsOiBzdHJpbmcgfCBVUkwpOiBzdHJpbmcge1xuICB1cmwgPSB1cmwgaW5zdGFuY2VvZiBVUkwgPyB1cmwgOiBuZXcgVVJMKHVybCk7XG4gIGlmICh1cmwucHJvdG9jb2wgIT0gXCJmaWxlOlwiKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIk11c3QgYmUgYSBmaWxlIFVSTC5cIik7XG4gIH1cbiAgbGV0IHBhdGggPSBkZWNvZGVVUklDb21wb25lbnQoXG4gICAgdXJsLnBhdGhuYW1lLnJlcGxhY2UoL1xcLy9nLCBcIlxcXFxcIikucmVwbGFjZSgvJSg/IVswLTlBLUZhLWZdezJ9KS9nLCBcIiUyNVwiKSxcbiAgKS5yZXBsYWNlKC9eXFxcXCooW0EtWmEtel06KShcXFxcfCQpLywgXCIkMVxcXFxcIik7XG4gIGlmICh1cmwuaG9zdG5hbWUgIT0gXCJcIikge1xuICAgIC8vIE5vdGU6IFRoZSBgVVJMYCBpbXBsZW1lbnRhdGlvbiBndWFyYW50ZWVzIHRoYXQgdGhlIGRyaXZlIGxldHRlciBhbmRcbiAgICAvLyBob3N0bmFtZSBhcmUgbXV0dWFsbHkgZXhjbHVzaXZlLiBPdGhlcndpc2UgaXQgd291bGQgbm90IGhhdmUgYmVlbiB2YWxpZFxuICAgIC8vIHRvIGFwcGVuZCB0aGUgaG9zdG5hbWUgYW5kIHBhdGggbGlrZSB0aGlzLlxuICAgIHBhdGggPSBgXFxcXFxcXFwke3VybC5ob3N0bmFtZX0ke3BhdGh9YDtcbiAgfVxuICByZXR1cm4gcGF0aDtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBhIHBhdGggc3RyaW5nIHRvIGEgZmlsZSBVUkwuXG4gKlxuICogYGBgdHNcbiAqICAgICAgaW1wb3J0IHsgdG9GaWxlVXJsIH0gZnJvbSBcIi4vd2luMzIudHNcIjtcbiAqICAgICAgdG9GaWxlVXJsKFwiXFxcXGhvbWVcXFxcZm9vXCIpOyAvLyBuZXcgVVJMKFwiZmlsZTovLy9ob21lL2Zvb1wiKVxuICogICAgICB0b0ZpbGVVcmwoXCJDOlxcXFxVc2Vyc1xcXFxmb29cIik7IC8vIG5ldyBVUkwoXCJmaWxlOi8vL0M6L1VzZXJzL2Zvb1wiKVxuICogICAgICB0b0ZpbGVVcmwoXCJcXFxcXFxcXDEyNy4wLjAuMVxcXFxob21lXFxcXGZvb1wiKTsgLy8gbmV3IFVSTChcImZpbGU6Ly8xMjcuMC4wLjEvaG9tZS9mb29cIilcbiAqIGBgYFxuICogQHBhcmFtIHBhdGggdG8gY29udmVydCB0byBmaWxlIFVSTFxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9GaWxlVXJsKHBhdGg6IHN0cmluZyk6IFVSTCB7XG4gIGlmICghaXNBYnNvbHV0ZShwYXRoKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJNdXN0IGJlIGFuIGFic29sdXRlIHBhdGguXCIpO1xuICB9XG4gIGNvbnN0IFssIGhvc3RuYW1lLCBwYXRobmFtZV0gPSBwYXRoLm1hdGNoKFxuICAgIC9eKD86Wy9cXFxcXXsyfShbXi9cXFxcXSspKD89Wy9cXFxcXSg/OlteL1xcXFxdfCQpKSk/KC4qKS8sXG4gICkhO1xuICBjb25zdCB1cmwgPSBuZXcgVVJMKFwiZmlsZTovLy9cIik7XG4gIHVybC5wYXRobmFtZSA9IGVuY29kZVdoaXRlc3BhY2UocGF0aG5hbWUucmVwbGFjZSgvJS9nLCBcIiUyNVwiKSk7XG4gIGlmIChob3N0bmFtZSAhPSBudWxsICYmIGhvc3RuYW1lICE9IFwibG9jYWxob3N0XCIpIHtcbiAgICB1cmwuaG9zdG5hbWUgPSBob3N0bmFtZTtcbiAgICBpZiAoIXVybC5ob3N0bmFtZSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkludmFsaWQgaG9zdG5hbWUuXCIpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdXJsO1xufVxuXG5leHBvcnQgZGVmYXVsdCB7XG4gIGJhc2VuYW1lLFxuICBkZWxpbWl0ZXIsXG4gIGRpcm5hbWUsXG4gIGV4dG5hbWUsXG4gIGZvcm1hdCxcbiAgZnJvbUZpbGVVcmwsXG4gIGlzQWJzb2x1dGUsXG4gIGpvaW4sXG4gIG5vcm1hbGl6ZSxcbiAgcGFyc2UsXG4gIHJlbGF0aXZlLFxuICByZXNvbHZlLFxuICBzZXAsXG4gIHRvRmlsZVVybCxcbiAgdG9OYW1lc3BhY2VkUGF0aCxcbn07XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsaURBQWlEO0FBQ2pELDZEQUE2RDtBQUc3RCxTQUNFLG1CQUFtQixFQUNuQixVQUFVLEVBQ1YsUUFBUSxFQUNSLGtCQUFrQixRQUNiLGtCQUFrQjtBQUN6QixTQUFTLG9CQUFvQixRQUFR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