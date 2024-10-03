// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible.
// TODO(ry) It'd be better to make Deferred a class that inherits from
// Promise, rather than an interface. This is possible in ES2016, however
// typescript produces broken code when targeting ES5 code.
// See https://github.com/Microsoft/TypeScript/issues/15202
// At the time of writing, the github issue is closed but the problem remains.
/** Creates a Promise with the `reject` and `resolve` functions
 * placed as methods on the promise object itself. It allows you to do:
 *
 * ```ts
 *     import { deferred } from "./deferred.ts";
 *
 *     const p = deferred<number>();
 *     // ...
 *     p.resolve(42);
 * ```
 */ export function deferred() {
  let methods;
  let state = "pending";
  const promise = new Promise((resolve, reject)=>{
    methods = {
      async resolve (value) {
        await value;
        state = "fulfilled";
        resolve(value);
      },
      // deno-lint-ignore no-explicit-any
      reject (reason) {
        state = "rejected";
        reject(reason);
      }
    };
  });
  Object.defineProperty(promise, "state", {
    get: ()=>state
  });
  return Object.assign(promise, methods);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL2FzeW5jL2RlZmVycmVkLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjIgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG4vLyBUaGlzIG1vZHVsZSBpcyBicm93c2VyIGNvbXBhdGlibGUuXG5cbi8vIFRPRE8ocnkpIEl0J2QgYmUgYmV0dGVyIHRvIG1ha2UgRGVmZXJyZWQgYSBjbGFzcyB0aGF0IGluaGVyaXRzIGZyb21cbi8vIFByb21pc2UsIHJhdGhlciB0aGFuIGFuIGludGVyZmFjZS4gVGhpcyBpcyBwb3NzaWJsZSBpbiBFUzIwMTYsIGhvd2V2ZXJcbi8vIHR5cGVzY3JpcHQgcHJvZHVjZXMgYnJva2VuIGNvZGUgd2hlbiB0YXJnZXRpbmcgRVM1IGNvZGUuXG4vLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL01pY3Jvc29mdC9UeXBlU2NyaXB0L2lzc3Vlcy8xNTIwMlxuLy8gQXQgdGhlIHRpbWUgb2Ygd3JpdGluZywgdGhlIGdpdGh1YiBpc3N1ZSBpcyBjbG9zZWQgYnV0IHRoZSBwcm9ibGVtIHJlbWFpbnMuXG5leHBvcnQgaW50ZXJmYWNlIERlZmVycmVkPFQ+IGV4dGVuZHMgUHJvbWlzZTxUPiB7XG4gIHJlYWRvbmx5IHN0YXRlOiBcInBlbmRpbmdcIiB8IFwiZnVsZmlsbGVkXCIgfCBcInJlamVjdGVkXCI7XG4gIHJlc29sdmUodmFsdWU/OiBUIHwgUHJvbWlzZUxpa2U8VD4pOiB2b2lkO1xuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICByZWplY3QocmVhc29uPzogYW55KTogdm9pZDtcbn1cblxuLyoqIENyZWF0ZXMgYSBQcm9taXNlIHdpdGggdGhlIGByZWplY3RgIGFuZCBgcmVzb2x2ZWAgZnVuY3Rpb25zXG4gKiBwbGFjZWQgYXMgbWV0aG9kcyBvbiB0aGUgcHJvbWlzZSBvYmplY3QgaXRzZWxmLiBJdCBhbGxvd3MgeW91IHRvIGRvOlxuICpcbiAqIGBgYHRzXG4gKiAgICAgaW1wb3J0IHsgZGVmZXJyZWQgfSBmcm9tIFwiLi9kZWZlcnJlZC50c1wiO1xuICpcbiAqICAgICBjb25zdCBwID0gZGVmZXJyZWQ8bnVtYmVyPigpO1xuICogICAgIC8vIC4uLlxuICogICAgIHAucmVzb2x2ZSg0Mik7XG4gKiBgYGBcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlZmVycmVkPFQ+KCk6IERlZmVycmVkPFQ+IHtcbiAgbGV0IG1ldGhvZHM7XG4gIGxldCBzdGF0ZSA9IFwicGVuZGluZ1wiO1xuICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2U8VD4oKHJlc29sdmUsIHJlamVjdCk6IHZvaWQgPT4ge1xuICAgIG1ldGhvZHMgPSB7XG4gICAgICBhc3luYyByZXNvbHZlKHZhbHVlOiBUIHwgUHJvbWlzZUxpa2U8VD4pIHtcbiAgICAgICAgYXdhaXQgdmFsdWU7XG4gICAgICAgIHN0YXRlID0gXCJmdWxmaWxsZWRcIjtcbiAgICAgICAgcmVzb2x2ZSh2YWx1ZSk7XG4gICAgICB9LFxuICAgICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICAgIHJlamVjdChyZWFzb24/OiBhbnkpIHtcbiAgICAgICAgc3RhdGUgPSBcInJlamVjdGVkXCI7XG4gICAgICAgIHJlamVjdChyZWFzb24pO1xuICAgICAgfSxcbiAgICB9O1xuICB9KTtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHByb21pc2UsIFwic3RhdGVcIiwgeyBnZXQ6ICgpID0+IHN0YXRlIH0pO1xuICByZXR1cm4gT2JqZWN0LmFzc2lnbihwcm9taXNlLCBtZXRob2RzKSBhcyBEZWZlcnJlZDxUPjtcbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwwRUFBMEU7QUFDMUUscUNBQXFDO0FBRXJDLHNFQUFzRTtBQUN0RSx5RUFBeUU7QUFDekUsMkRBQTJEO0FBQzNELDJEQUEyRDtBQUMzRCw4RUFBOEU7QUFROUU7Ozs7Ozs7Ozs7Q0FVQyxHQUNELE9BQU8sU0FBUztFQUNkLElBQUk7RUFDSixJQUFJLFFBQVE7RUFDWixNQUFNLFVBQVUsSUFBSSxRQUFXLENBQUMsU0FBUztJQUN2QyxVQUFVO01BQ1IsTUFBTSxTQUFRLEtBQXlCO1FBQ3JDLE1BQU07UUFDTixRQUFRO1FBQ1IsUUFBUTtNQUNWO01BQ0EsbUNBQW1DO01BQ25DLFFBQU8sTUFBWTtRQUNqQixRQUFRO1FBQ1IsT0FBTztNQUNUO0lBQ0Y7RUFDRjtFQUNBLE9BQU8sY0FBYyxDQUFDLFNBQVMsU0FBUztJQUFFLEtBQUssSUFBTTtFQUFNO0VBQzNELE9BQU8sT0FBTyxNQUFNLENBQUMsU0FBUztBQUNoQyJ9