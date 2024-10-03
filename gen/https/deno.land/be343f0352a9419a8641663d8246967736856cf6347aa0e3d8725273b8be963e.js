import { ParseErr } from "./err.ts";
import { trimWS } from "./utils.ts";
/* END TYPES */ const templateLitReg = /`(?:\\[\s\S]|\${(?:[^{}]|{(?:[^{}]|{[^}]*})*})*}|(?!\${)[^\\`])*`/g;
const singleQuoteReg = /'(?:\\[\s\w"'\\`]|[^\n\r'\\])*?'/g;
const doubleQuoteReg = /"(?:\\[\s\w"'\\`]|[^\n\r"\\])*?"/g;
/** Escape special regular expression characters inside a string */ function escapeRegExp(string) {
  // From MDN
  return string.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}
export default function parse(str, config) {
  let buffer = [];
  let trimLeftOfNextStr = false;
  let lastIndex = 0;
  const parseOptions = config.parse;
  if (config.plugins) {
    for(let i = 0; i < config.plugins.length; i++){
      const plugin = config.plugins[i];
      if (plugin.processTemplate) {
        str = plugin.processTemplate(str, config);
      }
    }
  }
  /* Adding for EJS compatibility */ if (config.rmWhitespace) {
    // Code taken directly from EJS
    // Have to use two separate replaces here as `^` and `$` operators don't
    // work well with `\r` and empty lines don't work well with the `m` flag.
    // Essentially, this replaces the whitespace at the beginning and end of
    // each line and removes multiple newlines.
    str = str.replace(/[\r\n]+/g, "\n").replace(/^\s+|\s+$/gm, "");
  }
  /* End rmWhitespace option */ templateLitReg.lastIndex = 0;
  singleQuoteReg.lastIndex = 0;
  doubleQuoteReg.lastIndex = 0;
  function pushString(strng, shouldTrimRightOfString) {
    if (strng) {
      // if string is truthy it must be of type 'string'
      strng = trimWS(strng, config, trimLeftOfNextStr, shouldTrimRightOfString);
      if (strng) {
        // replace \ with \\, ' with \'
        // we're going to convert all CRLF to LF so it doesn't take more than one replace
        strng = strng.replace(/\\|'/g, "\\$&").replace(/\r\n|\n|\r/g, "\\n");
        buffer.push(strng);
      }
    }
  }
  const prefixes = [
    parseOptions.exec,
    parseOptions.interpolate,
    parseOptions.raw
  ].reduce(function(accumulator, prefix) {
    if (accumulator && prefix) {
      return accumulator + "|" + escapeRegExp(prefix);
    } else if (prefix) {
      // accumulator is falsy
      return escapeRegExp(prefix);
    } else {
      // prefix and accumulator are both falsy
      return accumulator;
    }
  }, "");
  const parseOpenReg = new RegExp(escapeRegExp(config.tags[0]) + "(-|_)?\\s*(" + prefixes + ")?\\s*", "g");
  const parseCloseReg = new RegExp("'|\"|`|\\/\\*|(\\s*(-|_)?" + escapeRegExp(config.tags[1]) + ")", "g");
  // TODO: benchmark having the \s* on either side vs using str.trim()
  let m;
  while(m = parseOpenReg.exec(str)){
    const precedingString = str.slice(lastIndex, m.index);
    lastIndex = m[0].length + m.index;
    const wsLeft = m[1];
    const prefix = m[2] || ""; // by default either ~, =, or empty
    pushString(precedingString, wsLeft);
    parseCloseReg.lastIndex = lastIndex;
    let closeTag;
    let currentObj = false;
    while(closeTag = parseCloseReg.exec(str)){
      if (closeTag[1]) {
        const content = str.slice(lastIndex, closeTag.index);
        parseOpenReg.lastIndex = lastIndex = parseCloseReg.lastIndex;
        trimLeftOfNextStr = closeTag[2];
        const currentType = prefix === parseOptions.exec ? "e" : prefix === parseOptions.raw ? "r" : prefix === parseOptions.interpolate ? "i" : "";
        currentObj = {
          t: currentType,
          val: content
        };
        break;
      } else {
        const char = closeTag[0];
        if (char === "/*") {
          const commentCloseInd = str.indexOf("*/", parseCloseReg.lastIndex);
          if (commentCloseInd === -1) {
            ParseErr("unclosed comment", str, closeTag.index);
          }
          parseCloseReg.lastIndex = commentCloseInd;
        } else if (char === "'") {
          singleQuoteReg.lastIndex = closeTag.index;
          const singleQuoteMatch = singleQuoteReg.exec(str);
          if (singleQuoteMatch) {
            parseCloseReg.lastIndex = singleQuoteReg.lastIndex;
          } else {
            ParseErr("unclosed string", str, closeTag.index);
          }
        } else if (char === '"') {
          doubleQuoteReg.lastIndex = closeTag.index;
          const doubleQuoteMatch = doubleQuoteReg.exec(str);
          if (doubleQuoteMatch) {
            parseCloseReg.lastIndex = doubleQuoteReg.lastIndex;
          } else {
            ParseErr("unclosed string", str, closeTag.index);
          }
        } else if (char === "`") {
          templateLitReg.lastIndex = closeTag.index;
          const templateLitMatch = templateLitReg.exec(str);
          if (templateLitMatch) {
            parseCloseReg.lastIndex = templateLitReg.lastIndex;
          } else {
            ParseErr("unclosed string", str, closeTag.index);
          }
        }
      }
    }
    if (currentObj) {
      buffer.push(currentObj);
    } else {
      ParseErr("unclosed tag", str, m.index + precedingString.length);
    }
  }
  pushString(str.slice(lastIndex, str.length), false);
  if (config.plugins) {
    for(let i = 0; i < config.plugins.length; i++){
      const plugin = config.plugins[i];
      if (plugin.processAST) {
        buffer = plugin.processAST(buffer, config);
      }
    }
  }
  return buffer;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvZXRhQHYyLjIuMC9wYXJzZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBQYXJzZUVyciB9IGZyb20gXCIuL2Vyci50c1wiO1xuaW1wb3J0IHsgdHJpbVdTIH0gZnJvbSBcIi4vdXRpbHMudHNcIjtcblxuLyogVFlQRVMgKi9cblxuaW1wb3J0IHR5cGUgeyBFdGFDb25maWcgfSBmcm9tIFwiLi9jb25maWcudHNcIjtcblxuZXhwb3J0IHR5cGUgVGFnVHlwZSA9IFwiclwiIHwgXCJlXCIgfCBcImlcIiB8IFwiXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVtcGxhdGVPYmplY3Qge1xuICB0OiBUYWdUeXBlO1xuICB2YWw6IHN0cmluZztcbn1cblxuZXhwb3J0IHR5cGUgQXN0T2JqZWN0ID0gc3RyaW5nIHwgVGVtcGxhdGVPYmplY3Q7XG5cbi8qIEVORCBUWVBFUyAqL1xuXG5jb25zdCB0ZW1wbGF0ZUxpdFJlZyA9XG4gIC9gKD86XFxcXFtcXHNcXFNdfFxcJHsoPzpbXnt9XXx7KD86W157fV18e1tefV0qfSkqfSkqfXwoPyFcXCR7KVteXFxcXGBdKSpgL2c7XG5cbmNvbnN0IHNpbmdsZVF1b3RlUmVnID0gLycoPzpcXFxcW1xcc1xcd1wiJ1xcXFxgXXxbXlxcblxccidcXFxcXSkqPycvZztcblxuY29uc3QgZG91YmxlUXVvdGVSZWcgPSAvXCIoPzpcXFxcW1xcc1xcd1wiJ1xcXFxgXXxbXlxcblxcclwiXFxcXF0pKj9cIi9nO1xuXG4vKiogRXNjYXBlIHNwZWNpYWwgcmVndWxhciBleHByZXNzaW9uIGNoYXJhY3RlcnMgaW5zaWRlIGEgc3RyaW5nICovXG5cbmZ1bmN0aW9uIGVzY2FwZVJlZ0V4cChzdHJpbmc6IHN0cmluZykge1xuICAvLyBGcm9tIE1ETlxuICByZXR1cm4gc3RyaW5nLnJlcGxhY2UoL1suKitcXC0/XiR7fSgpfFtcXF1cXFxcXS9nLCBcIlxcXFwkJlwiKTsgLy8gJCYgbWVhbnMgdGhlIHdob2xlIG1hdGNoZWQgc3RyaW5nXG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHBhcnNlKFxuICBzdHI6IHN0cmluZyxcbiAgY29uZmlnOiBFdGFDb25maWcsXG4pOiBBcnJheTxBc3RPYmplY3Q+IHtcbiAgbGV0IGJ1ZmZlcjogQXJyYXk8QXN0T2JqZWN0PiA9IFtdO1xuICBsZXQgdHJpbUxlZnRPZk5leHRTdHI6IHN0cmluZyB8IGZhbHNlID0gZmFsc2U7XG4gIGxldCBsYXN0SW5kZXggPSAwO1xuICBjb25zdCBwYXJzZU9wdGlvbnMgPSBjb25maWcucGFyc2U7XG5cbiAgaWYgKGNvbmZpZy5wbHVnaW5zKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb25maWcucGx1Z2lucy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgcGx1Z2luID0gY29uZmlnLnBsdWdpbnNbaV07XG4gICAgICBpZiAocGx1Z2luLnByb2Nlc3NUZW1wbGF0ZSkge1xuICAgICAgICBzdHIgPSBwbHVnaW4ucHJvY2Vzc1RlbXBsYXRlKHN0ciwgY29uZmlnKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKiBBZGRpbmcgZm9yIEVKUyBjb21wYXRpYmlsaXR5ICovXG4gIGlmIChjb25maWcucm1XaGl0ZXNwYWNlKSB7XG4gICAgLy8gQ29kZSB0YWtlbiBkaXJlY3RseSBmcm9tIEVKU1xuICAgIC8vIEhhdmUgdG8gdXNlIHR3byBzZXBhcmF0ZSByZXBsYWNlcyBoZXJlIGFzIGBeYCBhbmQgYCRgIG9wZXJhdG9ycyBkb24ndFxuICAgIC8vIHdvcmsgd2VsbCB3aXRoIGBcXHJgIGFuZCBlbXB0eSBsaW5lcyBkb24ndCB3b3JrIHdlbGwgd2l0aCB0aGUgYG1gIGZsYWcuXG4gICAgLy8gRXNzZW50aWFsbHksIHRoaXMgcmVwbGFjZXMgdGhlIHdoaXRlc3BhY2UgYXQgdGhlIGJlZ2lubmluZyBhbmQgZW5kIG9mXG4gICAgLy8gZWFjaCBsaW5lIGFuZCByZW1vdmVzIG11bHRpcGxlIG5ld2xpbmVzLlxuICAgIHN0ciA9IHN0ci5yZXBsYWNlKC9bXFxyXFxuXSsvZywgXCJcXG5cIikucmVwbGFjZSgvXlxccyt8XFxzKyQvZ20sIFwiXCIpO1xuICB9XG4gIC8qIEVuZCBybVdoaXRlc3BhY2Ugb3B0aW9uICovXG5cbiAgdGVtcGxhdGVMaXRSZWcubGFzdEluZGV4ID0gMDtcbiAgc2luZ2xlUXVvdGVSZWcubGFzdEluZGV4ID0gMDtcbiAgZG91YmxlUXVvdGVSZWcubGFzdEluZGV4ID0gMDtcblxuICBmdW5jdGlvbiBwdXNoU3RyaW5nKHN0cm5nOiBzdHJpbmcsIHNob3VsZFRyaW1SaWdodE9mU3RyaW5nPzogc3RyaW5nIHwgZmFsc2UpIHtcbiAgICBpZiAoc3RybmcpIHtcbiAgICAgIC8vIGlmIHN0cmluZyBpcyB0cnV0aHkgaXQgbXVzdCBiZSBvZiB0eXBlICdzdHJpbmcnXG5cbiAgICAgIHN0cm5nID0gdHJpbVdTKFxuICAgICAgICBzdHJuZyxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICB0cmltTGVmdE9mTmV4dFN0ciwgLy8gdGhpcyB3aWxsIG9ubHkgYmUgZmFsc2Ugb24gdGhlIGZpcnN0IHN0ciwgdGhlIG5leHQgb25lcyB3aWxsIGJlIG51bGwgb3IgdW5kZWZpbmVkXG4gICAgICAgIHNob3VsZFRyaW1SaWdodE9mU3RyaW5nLFxuICAgICAgKTtcblxuICAgICAgaWYgKHN0cm5nKSB7XG4gICAgICAgIC8vIHJlcGxhY2UgXFwgd2l0aCBcXFxcLCAnIHdpdGggXFwnXG4gICAgICAgIC8vIHdlJ3JlIGdvaW5nIHRvIGNvbnZlcnQgYWxsIENSTEYgdG8gTEYgc28gaXQgZG9lc24ndCB0YWtlIG1vcmUgdGhhbiBvbmUgcmVwbGFjZVxuXG4gICAgICAgIHN0cm5nID0gc3RybmcucmVwbGFjZSgvXFxcXHwnL2csIFwiXFxcXCQmXCIpLnJlcGxhY2UoL1xcclxcbnxcXG58XFxyL2csIFwiXFxcXG5cIik7XG5cbiAgICAgICAgYnVmZmVyLnB1c2goc3RybmcpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHByZWZpeGVzID0gW1xuICAgIHBhcnNlT3B0aW9ucy5leGVjLFxuICAgIHBhcnNlT3B0aW9ucy5pbnRlcnBvbGF0ZSxcbiAgICBwYXJzZU9wdGlvbnMucmF3LFxuICBdLnJlZHVjZShmdW5jdGlvbiAoXG4gICAgYWNjdW11bGF0b3IsXG4gICAgcHJlZml4LFxuICApIHtcbiAgICBpZiAoYWNjdW11bGF0b3IgJiYgcHJlZml4KSB7XG4gICAgICByZXR1cm4gYWNjdW11bGF0b3IgKyBcInxcIiArIGVzY2FwZVJlZ0V4cChwcmVmaXgpO1xuICAgIH0gZWxzZSBpZiAocHJlZml4KSB7XG4gICAgICAvLyBhY2N1bXVsYXRvciBpcyBmYWxzeVxuICAgICAgcmV0dXJuIGVzY2FwZVJlZ0V4cChwcmVmaXgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBwcmVmaXggYW5kIGFjY3VtdWxhdG9yIGFyZSBib3RoIGZhbHN5XG4gICAgICByZXR1cm4gYWNjdW11bGF0b3I7XG4gICAgfVxuICB9LCBcIlwiKTtcblxuICBjb25zdCBwYXJzZU9wZW5SZWcgPSBuZXcgUmVnRXhwKFxuICAgIGVzY2FwZVJlZ0V4cChjb25maWcudGFnc1swXSkgKyBcIigtfF8pP1xcXFxzKihcIiArIHByZWZpeGVzICsgXCIpP1xcXFxzKlwiLFxuICAgIFwiZ1wiLFxuICApO1xuXG4gIGNvbnN0IHBhcnNlQ2xvc2VSZWcgPSBuZXcgUmVnRXhwKFxuICAgIFwiJ3xcXFwifGB8XFxcXC9cXFxcKnwoXFxcXHMqKC18Xyk/XCIgKyBlc2NhcGVSZWdFeHAoY29uZmlnLnRhZ3NbMV0pICsgXCIpXCIsXG4gICAgXCJnXCIsXG4gICk7XG4gIC8vIFRPRE86IGJlbmNobWFyayBoYXZpbmcgdGhlIFxccyogb24gZWl0aGVyIHNpZGUgdnMgdXNpbmcgc3RyLnRyaW0oKVxuXG4gIGxldCBtO1xuXG4gIHdoaWxlICgobSA9IHBhcnNlT3BlblJlZy5leGVjKHN0cikpKSB7XG4gICAgY29uc3QgcHJlY2VkaW5nU3RyaW5nID0gc3RyLnNsaWNlKGxhc3RJbmRleCwgbS5pbmRleCk7XG5cbiAgICBsYXN0SW5kZXggPSBtWzBdLmxlbmd0aCArIG0uaW5kZXg7XG5cbiAgICBjb25zdCB3c0xlZnQgPSBtWzFdO1xuICAgIGNvbnN0IHByZWZpeCA9IG1bMl0gfHwgXCJcIjsgLy8gYnkgZGVmYXVsdCBlaXRoZXIgfiwgPSwgb3IgZW1wdHlcblxuICAgIHB1c2hTdHJpbmcocHJlY2VkaW5nU3RyaW5nLCB3c0xlZnQpO1xuXG4gICAgcGFyc2VDbG9zZVJlZy5sYXN0SW5kZXggPSBsYXN0SW5kZXg7XG4gICAgbGV0IGNsb3NlVGFnO1xuICAgIGxldCBjdXJyZW50T2JqOiBBc3RPYmplY3QgfCBmYWxzZSA9IGZhbHNlO1xuXG4gICAgd2hpbGUgKChjbG9zZVRhZyA9IHBhcnNlQ2xvc2VSZWcuZXhlYyhzdHIpKSkge1xuICAgICAgaWYgKGNsb3NlVGFnWzFdKSB7XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBzdHIuc2xpY2UobGFzdEluZGV4LCBjbG9zZVRhZy5pbmRleCk7XG5cbiAgICAgICAgcGFyc2VPcGVuUmVnLmxhc3RJbmRleCA9IGxhc3RJbmRleCA9IHBhcnNlQ2xvc2VSZWcubGFzdEluZGV4O1xuXG4gICAgICAgIHRyaW1MZWZ0T2ZOZXh0U3RyID0gY2xvc2VUYWdbMl07XG5cbiAgICAgICAgY29uc3QgY3VycmVudFR5cGU6IFRhZ1R5cGUgPSBwcmVmaXggPT09IHBhcnNlT3B0aW9ucy5leGVjXG4gICAgICAgICAgPyBcImVcIlxuICAgICAgICAgIDogcHJlZml4ID09PSBwYXJzZU9wdGlvbnMucmF3XG4gICAgICAgICAgPyBcInJcIlxuICAgICAgICAgIDogcHJlZml4ID09PSBwYXJzZU9wdGlvbnMuaW50ZXJwb2xhdGVcbiAgICAgICAgICA/IFwiaVwiXG4gICAgICAgICAgOiBcIlwiO1xuXG4gICAgICAgIGN1cnJlbnRPYmogPSB7IHQ6IGN1cnJlbnRUeXBlLCB2YWw6IGNvbnRlbnQgfTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBjaGFyID0gY2xvc2VUYWdbMF07XG4gICAgICAgIGlmIChjaGFyID09PSBcIi8qXCIpIHtcbiAgICAgICAgICBjb25zdCBjb21tZW50Q2xvc2VJbmQgPSBzdHIuaW5kZXhPZihcIiovXCIsIHBhcnNlQ2xvc2VSZWcubGFzdEluZGV4KTtcblxuICAgICAgICAgIGlmIChjb21tZW50Q2xvc2VJbmQgPT09IC0xKSB7XG4gICAgICAgICAgICBQYXJzZUVycihcInVuY2xvc2VkIGNvbW1lbnRcIiwgc3RyLCBjbG9zZVRhZy5pbmRleCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHBhcnNlQ2xvc2VSZWcubGFzdEluZGV4ID0gY29tbWVudENsb3NlSW5kO1xuICAgICAgICB9IGVsc2UgaWYgKGNoYXIgPT09IFwiJ1wiKSB7XG4gICAgICAgICAgc2luZ2xlUXVvdGVSZWcubGFzdEluZGV4ID0gY2xvc2VUYWcuaW5kZXg7XG5cbiAgICAgICAgICBjb25zdCBzaW5nbGVRdW90ZU1hdGNoID0gc2luZ2xlUXVvdGVSZWcuZXhlYyhzdHIpO1xuICAgICAgICAgIGlmIChzaW5nbGVRdW90ZU1hdGNoKSB7XG4gICAgICAgICAgICBwYXJzZUNsb3NlUmVnLmxhc3RJbmRleCA9IHNpbmdsZVF1b3RlUmVnLmxhc3RJbmRleDtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgUGFyc2VFcnIoXCJ1bmNsb3NlZCBzdHJpbmdcIiwgc3RyLCBjbG9zZVRhZy5pbmRleCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGNoYXIgPT09ICdcIicpIHtcbiAgICAgICAgICBkb3VibGVRdW90ZVJlZy5sYXN0SW5kZXggPSBjbG9zZVRhZy5pbmRleDtcbiAgICAgICAgICBjb25zdCBkb3VibGVRdW90ZU1hdGNoID0gZG91YmxlUXVvdGVSZWcuZXhlYyhzdHIpO1xuXG4gICAgICAgICAgaWYgKGRvdWJsZVF1b3RlTWF0Y2gpIHtcbiAgICAgICAgICAgIHBhcnNlQ2xvc2VSZWcubGFzdEluZGV4ID0gZG91YmxlUXVvdGVSZWcubGFzdEluZGV4O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBQYXJzZUVycihcInVuY2xvc2VkIHN0cmluZ1wiLCBzdHIsIGNsb3NlVGFnLmluZGV4KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoY2hhciA9PT0gXCJgXCIpIHtcbiAgICAgICAgICB0ZW1wbGF0ZUxpdFJlZy5sYXN0SW5kZXggPSBjbG9zZVRhZy5pbmRleDtcbiAgICAgICAgICBjb25zdCB0ZW1wbGF0ZUxpdE1hdGNoID0gdGVtcGxhdGVMaXRSZWcuZXhlYyhzdHIpO1xuICAgICAgICAgIGlmICh0ZW1wbGF0ZUxpdE1hdGNoKSB7XG4gICAgICAgICAgICBwYXJzZUNsb3NlUmVnLmxhc3RJbmRleCA9IHRlbXBsYXRlTGl0UmVnLmxhc3RJbmRleDtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgUGFyc2VFcnIoXCJ1bmNsb3NlZCBzdHJpbmdcIiwgc3RyLCBjbG9zZVRhZy5pbmRleCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChjdXJyZW50T2JqKSB7XG4gICAgICBidWZmZXIucHVzaChjdXJyZW50T2JqKTtcbiAgICB9IGVsc2Uge1xuICAgICAgUGFyc2VFcnIoXCJ1bmNsb3NlZCB0YWdcIiwgc3RyLCBtLmluZGV4ICsgcHJlY2VkaW5nU3RyaW5nLmxlbmd0aCk7XG4gICAgfVxuICB9XG5cbiAgcHVzaFN0cmluZyhzdHIuc2xpY2UobGFzdEluZGV4LCBzdHIubGVuZ3RoKSwgZmFsc2UpO1xuXG4gIGlmIChjb25maWcucGx1Z2lucykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY29uZmlnLnBsdWdpbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHBsdWdpbiA9IGNvbmZpZy5wbHVnaW5zW2ldO1xuICAgICAgaWYgKHBsdWdpbi5wcm9jZXNzQVNUKSB7XG4gICAgICAgIGJ1ZmZlciA9IHBsdWdpbi5wcm9jZXNzQVNUKGJ1ZmZlciwgY29uZmlnKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gYnVmZmVyO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFNBQVMsUUFBUSxRQUFRLFdBQVc7QUFDcEMsU0FBUyxNQUFNLFFBQVEsYUFBYTtBQWVwQyxhQUFhLEdBRWIsTUFBTSxpQkFDSjtBQUVGLE1BQU0saUJBQWlCO0FBRXZCLE1BQU0saUJBQWlCO0FBRXZCLGlFQUFpRSxHQUVqRSxTQUFTLGFBQWEsTUFBYztFQUNsQyxXQUFXO0VBQ1gsT0FBTyxPQUFPLE9BQU8sQ0FBQyx5QkFBeUIsU0FBUyxvQ0FBb0M7QUFDOUY7QUFFQSxlQUFlLFNBQVMsTUFDdEIsR0FBVyxFQUNYLE1BQWlCO0VBRWpCLElBQUksU0FBMkIsRUFBRTtFQUNqQyxJQUFJLG9CQUFvQztFQUN4QyxJQUFJLFlBQVk7RUFDaEIsTUFBTSxlQUFlLE9BQU8sS0FBSztFQUVqQyxJQUFJLE9BQU8sT0FBTyxFQUFFO0lBQ2xCLElBQUssSUFBSSxJQUFJLEdBQUcsSUFBSSxPQUFPLE9BQU8sQ0FBQyxNQUFNLEVBQUUsSUFBSztNQUM5QyxNQUFNLFNBQVMsT0FBTyxPQUFPLENBQUMsRUFBRTtNQUNoQyxJQUFJLE9BQU8sZUFBZSxFQUFFO1FBQzFCLE1BQU0sT0FBTyxlQUFlLENBQUMsS0FBSztNQUNwQztJQUNGO0VBQ0Y7RUFFQSxnQ0FBZ0MsR0FDaEMsSUFBSSxPQUFPLFlBQVksRUFBRTtJQUN2QiwrQkFBK0I7SUFDL0Isd0VBQXdFO0lBQ3hFLHlFQUF5RTtJQUN6RSx3RUFBd0U7SUFDeEUsMkNBQTJDO0lBQzNDLE1BQU0sSUFBSSxPQUFPLENBQUMsWUFBWSxNQUFNLE9BQU8sQ0FBQyxlQUFlO0VBQzdEO0VBQ0EsMkJBQTJCLEdBRTNCLGVBQWUsU0FBUyxHQUFHO0VBQzNCLGVBQWUsU0FBUyxHQUFHO0VBQzNCLGVBQWUsU0FBUyxHQUFHO0VBRTNCLFNBQVMsV0FBVyxLQUFhLEVBQUUsdUJBQXdDO0lBQ3pFLElBQUksT0FBTztN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