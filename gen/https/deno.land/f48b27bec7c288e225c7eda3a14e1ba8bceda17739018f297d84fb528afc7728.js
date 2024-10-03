function setPrototypeOf(obj, proto) {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  if (Object.setPrototypeOf) {
    Object.setPrototypeOf(obj, proto);
  } else {
    obj.__proto__ = proto;
  }
}
// This is pretty much the only way to get nice, extended Errors
// without using ES6
/**
 * This returns a new Error with a custom prototype. Note that it's _not_ a constructor
 *
 * @param message Error message
 *
 * **Example**
 *
 * ```js
 * throw EtaErr("template not found")
 * ```
 */ export default function EtaErr(message) {
  const err = new Error(message);
  setPrototypeOf(err, EtaErr.prototype);
  return err;
}
EtaErr.prototype = Object.create(Error.prototype, {
  name: {
    value: "Eta Error",
    enumerable: false
  }
});
/**
 * Throws an EtaErr with a nicely formatted error and message showing where in the template the error occurred.
 */ export function ParseErr(message, str, indx) {
  const whitespace = str.slice(0, indx).split(/\n/);
  const lineNo = whitespace.length;
  const colNo = whitespace[lineNo - 1].length + 1;
  message += " at line " + lineNo + " col " + colNo + ":\n\n" + "  " + str.split(/\n/)[lineNo - 1] + "\n" + "  " + Array(colNo).join(" ") + "^";
  throw EtaErr(message);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvZXRhQHYyLjIuMC9lcnIudHMiXSwic291cmNlc0NvbnRlbnQiOlsiZnVuY3Rpb24gc2V0UHJvdG90eXBlT2Yob2JqOiBhbnksIHByb3RvOiBhbnkpIHtcbiAgLy8gZXNsaW50LWRpc2FibGUtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gIGlmIChPYmplY3Quc2V0UHJvdG90eXBlT2YpIHtcbiAgICBPYmplY3Quc2V0UHJvdG90eXBlT2Yob2JqLCBwcm90byk7XG4gIH0gZWxzZSB7XG4gICAgb2JqLl9fcHJvdG9fXyA9IHByb3RvO1xuICB9XG59XG5cbi8vIFRoaXMgaXMgcHJldHR5IG11Y2ggdGhlIG9ubHkgd2F5IHRvIGdldCBuaWNlLCBleHRlbmRlZCBFcnJvcnNcbi8vIHdpdGhvdXQgdXNpbmcgRVM2XG5cbi8qKlxuICogVGhpcyByZXR1cm5zIGEgbmV3IEVycm9yIHdpdGggYSBjdXN0b20gcHJvdG90eXBlLiBOb3RlIHRoYXQgaXQncyBfbm90XyBhIGNvbnN0cnVjdG9yXG4gKlxuICogQHBhcmFtIG1lc3NhZ2UgRXJyb3IgbWVzc2FnZVxuICpcbiAqICoqRXhhbXBsZSoqXG4gKlxuICogYGBganNcbiAqIHRocm93IEV0YUVycihcInRlbXBsYXRlIG5vdCBmb3VuZFwiKVxuICogYGBgXG4gKi9cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gRXRhRXJyKG1lc3NhZ2U6IHN0cmluZyk6IEVycm9yIHtcbiAgY29uc3QgZXJyID0gbmV3IEVycm9yKG1lc3NhZ2UpO1xuICBzZXRQcm90b3R5cGVPZihlcnIsIEV0YUVyci5wcm90b3R5cGUpO1xuICByZXR1cm4gZXJyIGFzIEVycm9yO1xufVxuXG5FdGFFcnIucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShFcnJvci5wcm90b3R5cGUsIHtcbiAgbmFtZTogeyB2YWx1ZTogXCJFdGEgRXJyb3JcIiwgZW51bWVyYWJsZTogZmFsc2UgfSxcbn0pO1xuXG4vKipcbiAqIFRocm93cyBhbiBFdGFFcnIgd2l0aCBhIG5pY2VseSBmb3JtYXR0ZWQgZXJyb3IgYW5kIG1lc3NhZ2Ugc2hvd2luZyB3aGVyZSBpbiB0aGUgdGVtcGxhdGUgdGhlIGVycm9yIG9jY3VycmVkLlxuICovXG5cbmV4cG9ydCBmdW5jdGlvbiBQYXJzZUVycihtZXNzYWdlOiBzdHJpbmcsIHN0cjogc3RyaW5nLCBpbmR4OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3Qgd2hpdGVzcGFjZSA9IHN0ci5zbGljZSgwLCBpbmR4KS5zcGxpdCgvXFxuLyk7XG5cbiAgY29uc3QgbGluZU5vID0gd2hpdGVzcGFjZS5sZW5ndGg7XG4gIGNvbnN0IGNvbE5vID0gd2hpdGVzcGFjZVtsaW5lTm8gLSAxXS5sZW5ndGggKyAxO1xuICBtZXNzYWdlICs9IFwiIGF0IGxpbmUgXCIgK1xuICAgIGxpbmVObyArXG4gICAgXCIgY29sIFwiICtcbiAgICBjb2xObyArXG4gICAgXCI6XFxuXFxuXCIgK1xuICAgIFwiICBcIiArXG4gICAgc3RyLnNwbGl0KC9cXG4vKVtsaW5lTm8gLSAxXSArXG4gICAgXCJcXG5cIiArXG4gICAgXCIgIFwiICtcbiAgICBBcnJheShjb2xObykuam9pbihcIiBcIikgK1xuICAgIFwiXlwiO1xuICB0aHJvdyBFdGFFcnIobWVzc2FnZSk7XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsU0FBUyxlQUFlLEdBQVEsRUFBRSxLQUFVO0VBQzFDLHlEQUF5RDtFQUN6RCxJQUFJLE9BQU8sY0FBYyxFQUFFO0lBQ3pCLE9BQU8sY0FBYyxDQUFDLEtBQUs7RUFDN0IsT0FBTztJQUNMLElBQUksU0FBUyxHQUFHO0VBQ2xCO0FBQ0Y7QUFFQSxnRUFBZ0U7QUFDaEUsb0JBQW9CO0FBRXBCOzs7Ozs7Ozs7O0NBVUMsR0FFRCxlQUFlLFNBQVMsT0FBTyxPQUFlO0VBQzVDLE1BQU0sTUFBTSxJQUFJLE1BQU07RUFDdEIsZUFBZSxLQUFLLE9BQU8sU0FBUztFQUNwQyxPQUFPO0FBQ1Q7QUFFQSxPQUFPLFNBQVMsR0FBRyxPQUFPLE1BQU0sQ0FBQyxNQUFNLFNBQVMsRUFBRTtFQUNoRCxNQUFNO0lBQUUsT0FBTztJQUFhLFlBQVk7RUFBTTtBQUNoRDtBQUVBOztDQUVDLEdBRUQsT0FBTyxTQUFTLFNBQVMsT0FBZSxFQUFFLEdBQVcsRUFBRSxJQUFZO0VBQ2pFLE1BQU0sYUFBYSxJQUFJLEtBQUssQ0FBQyxHQUFHLE1BQU0sS0FBSyxDQUFDO0VBRTVDLE1BQU0sU0FBUyxXQUFXLE1BQU07RUFDaEMsTUFBTSxRQUFRLFVBQVUsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxNQUFNLEdBQUc7RUFDOUMsV0FBVyxjQUNULFNBQ0EsVUFDQSxRQUNBLFVBQ0EsT0FDQSxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLEdBQzNCLE9BQ0EsT0FDQSxNQUFNLE9BQU8sSUFBSSxDQUFDLE9BQ2xCO0VBQ0YsTUFBTSxPQUFPO0FBQ2YifQ==