// TODO: allow '-' to trim up until newline. Use [^\S\n\r] instead of \s
// TODO: only include trimLeft polyfill if not in ES6
import { trimLeft, trimRight } from "./polyfills.ts";
/* END TYPES */ export function hasOwnProp(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}
export function copyProps(toObj, fromObj) {
  for(const key in fromObj){
    if (hasOwnProp(fromObj, key)) {
      toObj[key] = fromObj[key];
    }
  }
  return toObj;
}
/**
 * Takes a string within a template and trims it, based on the preceding tag's whitespace control and `config.autoTrim`
 */ function trimWS(str, config, wsLeft, wsRight) {
  let leftTrim;
  let rightTrim;
  if (Array.isArray(config.autoTrim)) {
    // kinda confusing
    // but _}} will trim the left side of the following string
    leftTrim = config.autoTrim[1];
    rightTrim = config.autoTrim[0];
  } else {
    leftTrim = rightTrim = config.autoTrim;
  }
  if (wsLeft || wsLeft === false) {
    leftTrim = wsLeft;
  }
  if (wsRight || wsRight === false) {
    rightTrim = wsRight;
  }
  if (!rightTrim && !leftTrim) {
    return str;
  }
  if (leftTrim === "slurp" && rightTrim === "slurp") {
    return str.trim();
  }
  if (leftTrim === "_" || leftTrim === "slurp") {
    // console.log('trimming left' + leftTrim)
    // full slurp
    str = trimLeft(str);
  } else if (leftTrim === "-" || leftTrim === "nl") {
    // nl trim
    str = str.replace(/^(?:\r\n|\n|\r)/, "");
  }
  if (rightTrim === "_" || rightTrim === "slurp") {
    // full slurp
    str = trimRight(str);
  } else if (rightTrim === "-" || rightTrim === "nl") {
    // nl trim
    str = str.replace(/(?:\r\n|\n|\r)$/, ""); // TODO: make sure this gets \r\n
  }
  return str;
}
/**
 * A map of special HTML characters to their XML-escaped equivalents
 */ const escMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
function replaceChar(s) {
  return escMap[s];
}
/**
 * XML-escapes an input value after converting it to a string
 *
 * @param str - Input value (usually a string)
 * @returns XML-escaped string
 */ function XMLEscape(str) {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  // To deal with XSS. Based on Escape implementations of Mustache.JS and Marko, then customized.
  const newStr = String(str);
  if (/[&<>"']/.test(newStr)) {
    return newStr.replace(/[&<>"']/g, replaceChar);
  } else {
    return newStr;
  }
}
export { trimWS, XMLEscape };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvZXRhQHYyLjIuMC91dGlscy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBUT0RPOiBhbGxvdyAnLScgdG8gdHJpbSB1cCB1bnRpbCBuZXdsaW5lLiBVc2UgW15cXFNcXG5cXHJdIGluc3RlYWQgb2YgXFxzXG4vLyBUT0RPOiBvbmx5IGluY2x1ZGUgdHJpbUxlZnQgcG9seWZpbGwgaWYgbm90IGluIEVTNlxuXG5pbXBvcnQgeyB0cmltTGVmdCwgdHJpbVJpZ2h0IH0gZnJvbSBcIi4vcG9seWZpbGxzLnRzXCI7XG5cbi8qIFRZUEVTICovXG5cbmltcG9ydCB0eXBlIHsgRXRhQ29uZmlnIH0gZnJvbSBcIi4vY29uZmlnLnRzXCI7XG5cbmludGVyZmFjZSBFc2NhcGVNYXAge1xuICBcIiZcIjogXCImYW1wO1wiO1xuICBcIjxcIjogXCImbHQ7XCI7XG4gIFwiPlwiOiBcIiZndDtcIjtcbiAgJ1wiJzogXCImcXVvdDtcIjtcbiAgXCInXCI6IFwiJiMzOTtcIjtcbiAgW2luZGV4OiBzdHJpbmddOiBzdHJpbmc7XG59XG5cbi8qIEVORCBUWVBFUyAqL1xuXG5leHBvcnQgZnVuY3Rpb24gaGFzT3duUHJvcChvYmo6IG9iamVjdCwgcHJvcDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvcHlQcm9wczxUPih0b09iajogVCwgZnJvbU9iajogVCk6IFQge1xuICBmb3IgKGNvbnN0IGtleSBpbiBmcm9tT2JqKSB7XG4gICAgaWYgKGhhc093blByb3AoZnJvbU9iaiBhcyB1bmtub3duIGFzIG9iamVjdCwga2V5KSkge1xuICAgICAgdG9PYmpba2V5XSA9IGZyb21PYmpba2V5XTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRvT2JqO1xufVxuXG4vKipcbiAqIFRha2VzIGEgc3RyaW5nIHdpdGhpbiBhIHRlbXBsYXRlIGFuZCB0cmltcyBpdCwgYmFzZWQgb24gdGhlIHByZWNlZGluZyB0YWcncyB3aGl0ZXNwYWNlIGNvbnRyb2wgYW5kIGBjb25maWcuYXV0b1RyaW1gXG4gKi9cblxuZnVuY3Rpb24gdHJpbVdTKFxuICBzdHI6IHN0cmluZyxcbiAgY29uZmlnOiBFdGFDb25maWcsXG4gIHdzTGVmdDogc3RyaW5nIHwgZmFsc2UsXG4gIHdzUmlnaHQ/OiBzdHJpbmcgfCBmYWxzZSxcbik6IHN0cmluZyB7XG4gIGxldCBsZWZ0VHJpbTtcbiAgbGV0IHJpZ2h0VHJpbTtcblxuICBpZiAoQXJyYXkuaXNBcnJheShjb25maWcuYXV0b1RyaW0pKSB7XG4gICAgLy8ga2luZGEgY29uZnVzaW5nXG4gICAgLy8gYnV0IF99fSB3aWxsIHRyaW0gdGhlIGxlZnQgc2lkZSBvZiB0aGUgZm9sbG93aW5nIHN0cmluZ1xuICAgIGxlZnRUcmltID0gY29uZmlnLmF1dG9UcmltWzFdO1xuICAgIHJpZ2h0VHJpbSA9IGNvbmZpZy5hdXRvVHJpbVswXTtcbiAgfSBlbHNlIHtcbiAgICBsZWZ0VHJpbSA9IHJpZ2h0VHJpbSA9IGNvbmZpZy5hdXRvVHJpbTtcbiAgfVxuXG4gIGlmICh3c0xlZnQgfHwgd3NMZWZ0ID09PSBmYWxzZSkge1xuICAgIGxlZnRUcmltID0gd3NMZWZ0O1xuICB9XG5cbiAgaWYgKHdzUmlnaHQgfHwgd3NSaWdodCA9PT0gZmFsc2UpIHtcbiAgICByaWdodFRyaW0gPSB3c1JpZ2h0O1xuICB9XG5cbiAgaWYgKCFyaWdodFRyaW0gJiYgIWxlZnRUcmltKSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxuXG4gIGlmIChsZWZ0VHJpbSA9PT0gXCJzbHVycFwiICYmIHJpZ2h0VHJpbSA9PT0gXCJzbHVycFwiKSB7XG4gICAgcmV0dXJuIHN0ci50cmltKCk7XG4gIH1cblxuICBpZiAobGVmdFRyaW0gPT09IFwiX1wiIHx8IGxlZnRUcmltID09PSBcInNsdXJwXCIpIHtcbiAgICAvLyBjb25zb2xlLmxvZygndHJpbW1pbmcgbGVmdCcgKyBsZWZ0VHJpbSlcbiAgICAvLyBmdWxsIHNsdXJwXG5cbiAgICBzdHIgPSB0cmltTGVmdChzdHIpO1xuICB9IGVsc2UgaWYgKGxlZnRUcmltID09PSBcIi1cIiB8fCBsZWZ0VHJpbSA9PT0gXCJubFwiKSB7XG4gICAgLy8gbmwgdHJpbVxuICAgIHN0ciA9IHN0ci5yZXBsYWNlKC9eKD86XFxyXFxufFxcbnxcXHIpLywgXCJcIik7XG4gIH1cblxuICBpZiAocmlnaHRUcmltID09PSBcIl9cIiB8fCByaWdodFRyaW0gPT09IFwic2x1cnBcIikge1xuICAgIC8vIGZ1bGwgc2x1cnBcbiAgICBzdHIgPSB0cmltUmlnaHQoc3RyKTtcbiAgfSBlbHNlIGlmIChyaWdodFRyaW0gPT09IFwiLVwiIHx8IHJpZ2h0VHJpbSA9PT0gXCJubFwiKSB7XG4gICAgLy8gbmwgdHJpbVxuICAgIHN0ciA9IHN0ci5yZXBsYWNlKC8oPzpcXHJcXG58XFxufFxccikkLywgXCJcIik7IC8vIFRPRE86IG1ha2Ugc3VyZSB0aGlzIGdldHMgXFxyXFxuXG4gIH1cblxuICByZXR1cm4gc3RyO1xufVxuXG4vKipcbiAqIEEgbWFwIG9mIHNwZWNpYWwgSFRNTCBjaGFyYWN0ZXJzIHRvIHRoZWlyIFhNTC1lc2NhcGVkIGVxdWl2YWxlbnRzXG4gKi9cblxuY29uc3QgZXNjTWFwOiBFc2NhcGVNYXAgPSB7XG4gIFwiJlwiOiBcIiZhbXA7XCIsXG4gIFwiPFwiOiBcIiZsdDtcIixcbiAgXCI+XCI6IFwiJmd0O1wiLFxuICAnXCInOiBcIiZxdW90O1wiLFxuICBcIidcIjogXCImIzM5O1wiLFxufTtcblxuZnVuY3Rpb24gcmVwbGFjZUNoYXIoczogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIGVzY01hcFtzXTtcbn1cblxuLyoqXG4gKiBYTUwtZXNjYXBlcyBhbiBpbnB1dCB2YWx1ZSBhZnRlciBjb252ZXJ0aW5nIGl0IHRvIGEgc3RyaW5nXG4gKlxuICogQHBhcmFtIHN0ciAtIElucHV0IHZhbHVlICh1c3VhbGx5IGEgc3RyaW5nKVxuICogQHJldHVybnMgWE1MLWVzY2FwZWQgc3RyaW5nXG4gKi9cblxuZnVuY3Rpb24gWE1MRXNjYXBlKHN0cjogYW55KTogc3RyaW5nIHtcbiAgLy8gZXNsaW50LWRpc2FibGUtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gIC8vIFRvIGRlYWwgd2l0aCBYU1MuIEJhc2VkIG9uIEVzY2FwZSBpbXBsZW1lbnRhdGlvbnMgb2YgTXVzdGFjaGUuSlMgYW5kIE1hcmtvLCB0aGVuIGN1c3RvbWl6ZWQuXG4gIGNvbnN0IG5ld1N0ciA9IFN0cmluZyhzdHIpO1xuICBpZiAoL1smPD5cIiddLy50ZXN0KG5ld1N0cikpIHtcbiAgICByZXR1cm4gbmV3U3RyLnJlcGxhY2UoL1smPD5cIiddL2csIHJlcGxhY2VDaGFyKTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbmV3U3RyO1xuICB9XG59XG5cbmV4cG9ydCB7IHRyaW1XUywgWE1MRXNjYXBlIH07XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsd0VBQXdFO0FBQ3hFLHFEQUFxRDtBQUVyRCxTQUFTLFFBQVEsRUFBRSxTQUFTLFFBQVEsaUJBQWlCO0FBZXJELGFBQWEsR0FFYixPQUFPLFNBQVMsV0FBVyxHQUFXLEVBQUUsSUFBWTtFQUNsRCxPQUFPLE9BQU8sU0FBUyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsS0FBSztBQUNuRDtBQUVBLE9BQU8sU0FBUyxVQUFhLEtBQVEsRUFBRSxPQUFVO0VBQy9DLElBQUssTUFBTSxPQUFPLFFBQVM7SUFDekIsSUFBSSxXQUFXLFNBQThCLE1BQU07TUFDakQsS0FBSyxDQUFDLElBQUksR0FBRyxPQUFPLENBQUMsSUFBSTtJQUMzQjtFQUNGO0VBQ0EsT0FBTztBQUNUO0FBRUE7O0NBRUMsR0FFRCxTQUFTLE9BQ1AsR0FBVyxFQUNYLE1BQWlCLEVBQ2pCLE1BQXNCLEVBQ3RCLE9BQXdCO0VBRXhCLElBQUk7RUFDSixJQUFJO0VBRUosSUFBSSxNQUFNLE9BQU8sQ0FBQyxPQUFPLFFBQVEsR0FBRztJQUNsQyxrQkFBa0I7SUFDbEIsMERBQTBEO0lBQzFELFdBQVcsT0FBTyxRQUFRLENBQUMsRUFBRTtJQUM3QixZQUFZLE9BQU8sUUFBUSxDQUFDLEVBQUU7RUFDaEMsT0FBTztJQUNMLFdBQVcsWUFBWSxPQUFPLFFBQVE7RUFDeEM7RUFFQSxJQUFJLFVBQVUsV0FBVyxPQUFPO0lBQzlCLFdBQVc7RUFDYjtFQUVBLElBQUksV0FBVyxZQUFZLE9BQU87SUFDaEMsWUFBWTtFQUNkO0VBRUEsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVO0lBQzNCLE9BQU87RUFDVDtFQUVBLElBQUksYUFBYSxXQUFXLGNBQWMsU0FBUztJQUNqRCxPQUFPLElBQUksSUFBSTtFQUNqQjtFQUVBLElBQUksYUFBYSxPQUFPLGFBQWEsU0FBUztJQUM1QywwQ0FBMEM7SUFDMUMsYUFBYTtJQUViLE1BQU0sU0FBUztFQUNqQixPQUFPLElBQUksYUFBYSxPQUFPLGFBQWEsTUFBTTtJQUNoRCxVQUFVO0lBQ1YsTUFBTSxJQUFJLE9BQU8sQ0FBQyxtQkFBbUI7RUFDdkM7RUFFQSxJQUFJLGNBQWMsT0FBTyxjQUFjLFNBQVM7SUFDOUMsYUFBYTtJQUNiLE1BQU0sVUFBVTtFQUNsQixPQUFPLElBQUksY0FBYyxPQUFPLGNBQWMsTUFBTTtJQUNsRCxVQUFVO0lBQ1YsTUFBTSxJQUFJLE9BQU8sQ0FBQyxtQkFBbUIsS0FBSyxpQ0FBaUM7RUFDN0U7RUFFQSxPQUFPO0FBQ1Q7QUFFQTs7Q0FFQyxHQUVELE1BQU0sU0FBb0I7RUFDeEIsS0FBSztFQUNMLEtBQUs7RUFDTCxLQUFLO0VBQ0wsS0FBSztFQUNMLEtBQUs7QUFDUDtBQUVBLFNBQVMsWUFBWSxDQUFTO0VBQzVCLE9BQU8sTUFBTSxDQUFDLEVBQUU7QUFDbEI7QUFFQTs7Ozs7Q0FLQyxHQUVELFNBQVMsVUFBVSxHQUFRO0VBQ3pCLHlEQUF5RDtFQUN6RCwrRkFBK0Y7RUFDL0YsTUFBTSxTQUFTLE9BQU87RUFDdEIsSUFBSSxVQUFVLElBQUksQ0FBQyxTQUFTO0lBQzFCLE9BQU8sT0FBTyxPQUFPLENBQUMsWUFBWTtFQUNwQyxPQUFPO0lBQ0wsT0FBTztFQUNUO0FBQ0Y7QUFFQSxTQUFTLE1BQU0sRUFBRSxTQUFTLEdBQUcifQ==