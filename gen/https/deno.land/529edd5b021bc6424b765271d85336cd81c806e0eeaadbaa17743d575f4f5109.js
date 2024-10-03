// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible.
/** EndOfLine character enum */ export var EOL;
(function(EOL) {
  EOL["LF"] = "\n";
  EOL["CRLF"] = "\r\n";
})(EOL || (EOL = {}));
const regDetect = /(?:\r?\n)/g;
/**
 * Detect the EOL character for string input.
 * returns null if no newline
 */ export function detect(content) {
  const d = content.match(regDetect);
  if (!d || d.length === 0) {
    return null;
  }
  const hasCRLF = d.some((x)=>x === EOL.CRLF);
  return hasCRLF ? EOL.CRLF : EOL.LF;
}
/** Format the file to the targeted EOL */ export function format(content, eol) {
  return content.replace(regDetect, eol);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL2ZzL2VvbC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gVGhpcyBtb2R1bGUgaXMgYnJvd3NlciBjb21wYXRpYmxlLlxuXG4vKiogRW5kT2ZMaW5lIGNoYXJhY3RlciBlbnVtICovXG5leHBvcnQgZW51bSBFT0wge1xuICBMRiA9IFwiXFxuXCIsXG4gIENSTEYgPSBcIlxcclxcblwiLFxufVxuXG5jb25zdCByZWdEZXRlY3QgPSAvKD86XFxyP1xcbikvZztcblxuLyoqXG4gKiBEZXRlY3QgdGhlIEVPTCBjaGFyYWN0ZXIgZm9yIHN0cmluZyBpbnB1dC5cbiAqIHJldHVybnMgbnVsbCBpZiBubyBuZXdsaW5lXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZXRlY3QoY29udGVudDogc3RyaW5nKTogRU9MIHwgbnVsbCB7XG4gIGNvbnN0IGQgPSBjb250ZW50Lm1hdGNoKHJlZ0RldGVjdCk7XG4gIGlmICghZCB8fCBkLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGNvbnN0IGhhc0NSTEYgPSBkLnNvbWUoKHg6IHN0cmluZyk6IGJvb2xlYW4gPT4geCA9PT0gRU9MLkNSTEYpO1xuXG4gIHJldHVybiBoYXNDUkxGID8gRU9MLkNSTEYgOiBFT0wuTEY7XG59XG5cbi8qKiBGb3JtYXQgdGhlIGZpbGUgdG8gdGhlIHRhcmdldGVkIEVPTCAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdChjb250ZW50OiBzdHJpbmcsIGVvbDogRU9MKTogc3RyaW5nIHtcbiAgcmV0dXJuIGNvbnRlbnQucmVwbGFjZShyZWdEZXRlY3QsIGVvbCk7XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBQzFFLHFDQUFxQztBQUVyQyw2QkFBNkIsY0FDdEI7VUFBSyxHQUFHO0VBQUgsSUFDVixRQUFLO0VBREssSUFFVixVQUFPO0dBRkcsUUFBQTtBQUtaLE1BQU0sWUFBWTtBQUVsQjs7O0NBR0MsR0FDRCxPQUFPLFNBQVMsT0FBTyxPQUFlO0VBQ3BDLE1BQU0sSUFBSSxRQUFRLEtBQUssQ0FBQztFQUN4QixJQUFJLENBQUMsS0FBSyxFQUFFLE1BQU0sS0FBSyxHQUFHO0lBQ3hCLE9BQU87RUFDVDtFQUNBLE1BQU0sVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDLElBQXVCLE1BQU0sSUFBSSxJQUFJO0VBRTdELE9BQU8sVUFBVSxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFDcEM7QUFFQSx3Q0FBd0MsR0FDeEMsT0FBTyxTQUFTLE9BQU8sT0FBZSxFQUFFLEdBQVE7RUFDOUMsT0FBTyxRQUFRLE9BQU8sQ0FBQyxXQUFXO0FBQ3BDIn0=