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
// - https://github.com/nodejs/node/blob/master/src/async_wrap-inl.h
// - https://github.com/nodejs/node/blob/master/src/async_wrap.cc
// - https://github.com/nodejs/node/blob/master/src/async_wrap.h
export function registerDestroyHook(// deno-lint-ignore no-explicit-any
_target, _asyncId, _prop) {
// TODO(kt3k): implement actual procedures
}
export var constants;
(function(constants) {
  constants[constants["kInit"] = 0] = "kInit";
  constants[constants["kBefore"] = 1] = "kBefore";
  constants[constants["kAfter"] = 2] = "kAfter";
  constants[constants["kDestroy"] = 3] = "kDestroy";
  constants[constants["kPromiseResolve"] = 4] = "kPromiseResolve";
  constants[constants["kTotals"] = 5] = "kTotals";
  constants[constants["kCheck"] = 6] = "kCheck";
  constants[constants["kExecutionAsyncId"] = 7] = "kExecutionAsyncId";
  constants[constants["kTriggerAsyncId"] = 8] = "kTriggerAsyncId";
  constants[constants["kAsyncIdCounter"] = 9] = "kAsyncIdCounter";
  constants[constants["kDefaultTriggerAsyncId"] = 10] = "kDefaultTriggerAsyncId";
  constants[constants["kUsesExecutionAsyncResource"] = 11] = "kUsesExecutionAsyncResource";
  constants[constants["kStackLength"] = 12] = "kStackLength";
})(constants || (constants = {}));
const asyncHookFields = new Uint32Array(Object.keys(constants).length);
export { asyncHookFields as async_hook_fields };
// Increment the internal id counter and return the value.
export function newAsyncId() {
  return ++asyncIdFields[constants.kAsyncIdCounter];
}
export var UidFields;
(function(UidFields) {
  UidFields[UidFields["kExecutionAsyncId"] = 0] = "kExecutionAsyncId";
  UidFields[UidFields["kTriggerAsyncId"] = 1] = "kTriggerAsyncId";
  UidFields[UidFields["kAsyncIdCounter"] = 2] = "kAsyncIdCounter";
  UidFields[UidFields["kDefaultTriggerAsyncId"] = 3] = "kDefaultTriggerAsyncId";
  UidFields[UidFields["kUidFieldsCount"] = 4] = "kUidFieldsCount";
})(UidFields || (UidFields = {}));
const asyncIdFields = new Float64Array(Object.keys(UidFields).length);
// `kAsyncIdCounter` should start at `1` because that'll be the id the execution
// context during bootstrap.
asyncIdFields[UidFields.kAsyncIdCounter] = 1;
// `kDefaultTriggerAsyncId` should be `-1`, this indicates that there is no
// specified default value and it should fallback to the executionAsyncId.
// 0 is not used as the magic value, because that indicates a missing
// context which is different from a default context.
asyncIdFields[UidFields.kDefaultTriggerAsyncId] = -1;
export { asyncIdFields };
export var providerType;
(function(providerType) {
  providerType[providerType["NONE"] = 0] = "NONE";
  providerType[providerType["GETADDRINFOREQWRAP"] = 1] = "GETADDRINFOREQWRAP";
  providerType[providerType["PIPECONNECTWRAP"] = 2] = "PIPECONNECTWRAP";
  providerType[providerType["PIPESERVERWRAP"] = 3] = "PIPESERVERWRAP";
  providerType[providerType["PIPEWRAP"] = 4] = "PIPEWRAP";
  providerType[providerType["SHUTDOWNWRAP"] = 5] = "SHUTDOWNWRAP";
  providerType[providerType["TCPCONNECTWRAP"] = 6] = "TCPCONNECTWRAP";
  providerType[providerType["TCPSERVERWRAP"] = 7] = "TCPSERVERWRAP";
  providerType[providerType["TCPWRAP"] = 8] = "TCPWRAP";
  providerType[providerType["WRITEWRAP"] = 9] = "WRITEWRAP";
})(providerType || (providerType = {}));
const kInvalidAsyncId = -1;
export class AsyncWrap {
  provider = providerType.NONE;
  asyncId = kInvalidAsyncId;
  constructor(provider){
    this.provider = provider;
    this.getAsyncId();
  }
  getAsyncId() {
    this.asyncId = this.asyncId === kInvalidAsyncId ? newAsyncId() : this.asyncId;
    return this.asyncId;
  }
  getProviderType() {
    return this.provider;
  }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL25vZGUvaW50ZXJuYWxfYmluZGluZy9hc3luY193cmFwLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjIgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG4vLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuLy8gVGhpcyBtb2R1bGUgcG9ydHM6XG4vLyAtIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9ibG9iL21hc3Rlci9zcmMvYXN5bmNfd3JhcC1pbmwuaFxuLy8gLSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvYmxvYi9tYXN0ZXIvc3JjL2FzeW5jX3dyYXAuY2Ncbi8vIC0gaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2Jsb2IvbWFzdGVyL3NyYy9hc3luY193cmFwLmhcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyRGVzdHJveUhvb2soXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIF90YXJnZXQ6IGFueSxcbiAgX2FzeW5jSWQ6IG51bWJlcixcbiAgX3Byb3A6IHsgZGVzdHJveWVkOiBib29sZWFuIH0sXG4pIHtcbiAgLy8gVE9ETyhrdDNrKTogaW1wbGVtZW50IGFjdHVhbCBwcm9jZWR1cmVzXG59XG5cbmV4cG9ydCBlbnVtIGNvbnN0YW50cyB7XG4gIGtJbml0LFxuICBrQmVmb3JlLFxuICBrQWZ0ZXIsXG4gIGtEZXN0cm95LFxuICBrUHJvbWlzZVJlc29sdmUsXG4gIGtUb3RhbHMsXG4gIGtDaGVjayxcbiAga0V4ZWN1dGlvbkFzeW5jSWQsXG4gIGtUcmlnZ2VyQXN5bmNJZCxcbiAga0FzeW5jSWRDb3VudGVyLFxuICBrRGVmYXVsdFRyaWdnZXJBc3luY0lkLFxuICBrVXNlc0V4ZWN1dGlvbkFzeW5jUmVzb3VyY2UsXG4gIGtTdGFja0xlbmd0aCxcbn1cblxuY29uc3QgYXN5bmNIb29rRmllbGRzID0gbmV3IFVpbnQzMkFycmF5KE9iamVjdC5rZXlzKGNvbnN0YW50cykubGVuZ3RoKTtcblxuZXhwb3J0IHsgYXN5bmNIb29rRmllbGRzIGFzIGFzeW5jX2hvb2tfZmllbGRzIH07XG5cbi8vIEluY3JlbWVudCB0aGUgaW50ZXJuYWwgaWQgY291bnRlciBhbmQgcmV0dXJuIHRoZSB2YWx1ZS5cbmV4cG9ydCBmdW5jdGlvbiBuZXdBc3luY0lkKCkge1xuICByZXR1cm4gKythc3luY0lkRmllbGRzW2NvbnN0YW50cy5rQXN5bmNJZENvdW50ZXJdO1xufVxuXG5leHBvcnQgZW51bSBVaWRGaWVsZHMge1xuICBrRXhlY3V0aW9uQXN5bmNJZCxcbiAga1RyaWdnZXJBc3luY0lkLFxuICBrQXN5bmNJZENvdW50ZXIsXG4gIGtEZWZhdWx0VHJpZ2dlckFzeW5jSWQsXG4gIGtVaWRGaWVsZHNDb3VudCxcbn1cblxuY29uc3QgYXN5bmNJZEZpZWxkcyA9IG5ldyBGbG9hdDY0QXJyYXkoT2JqZWN0LmtleXMoVWlkRmllbGRzKS5sZW5ndGgpO1xuXG4vLyBga0FzeW5jSWRDb3VudGVyYCBzaG91bGQgc3RhcnQgYXQgYDFgIGJlY2F1c2UgdGhhdCdsbCBiZSB0aGUgaWQgdGhlIGV4ZWN1dGlvblxuLy8gY29udGV4dCBkdXJpbmcgYm9vdHN0cmFwLlxuYXN5bmNJZEZpZWxkc1tVaWRGaWVsZHMua0FzeW5jSWRDb3VudGVyXSA9IDE7XG5cbi8vIGBrRGVmYXVsdFRyaWdnZXJBc3luY0lkYCBzaG91bGQgYmUgYC0xYCwgdGhpcyBpbmRpY2F0ZXMgdGhhdCB0aGVyZSBpcyBub1xuLy8gc3BlY2lmaWVkIGRlZmF1bHQgdmFsdWUgYW5kIGl0IHNob3VsZCBmYWxsYmFjayB0byB0aGUgZXhlY3V0aW9uQXN5bmNJZC5cbi8vIDAgaXMgbm90IHVzZWQgYXMgdGhlIG1hZ2ljIHZhbHVlLCBiZWNhdXNlIHRoYXQgaW5kaWNhdGVzIGEgbWlzc2luZ1xuLy8gY29udGV4dCB3aGljaCBpcyBkaWZmZXJlbnQgZnJvbSBhIGRlZmF1bHQgY29udGV4dC5cbmFzeW5jSWRGaWVsZHNbVWlkRmllbGRzLmtEZWZhdWx0VHJpZ2dlckFzeW5jSWRdID0gLTE7XG5cbmV4cG9ydCB7IGFzeW5jSWRGaWVsZHMgfTtcblxuZXhwb3J0IGVudW0gcHJvdmlkZXJUeXBlIHtcbiAgTk9ORSxcbiAgR0VUQUREUklORk9SRVFXUkFQLFxuICBQSVBFQ09OTkVDVFdSQVAsXG4gIFBJUEVTRVJWRVJXUkFQLFxuICBQSVBFV1JBUCxcbiAgU0hVVERPV05XUkFQLFxuICBUQ1BDT05ORUNUV1JBUCxcbiAgVENQU0VSVkVSV1JBUCxcbiAgVENQV1JBUCxcbiAgV1JJVEVXUkFQLFxufVxuXG5jb25zdCBrSW52YWxpZEFzeW5jSWQgPSAtMTtcblxuZXhwb3J0IGNsYXNzIEFzeW5jV3JhcCB7XG4gIHByb3ZpZGVyOiBwcm92aWRlclR5cGUgPSBwcm92aWRlclR5cGUuTk9ORTtcbiAgYXN5bmNJZCA9IGtJbnZhbGlkQXN5bmNJZDtcblxuICBjb25zdHJ1Y3Rvcihwcm92aWRlcjogcHJvdmlkZXJUeXBlKSB7XG4gICAgdGhpcy5wcm92aWRlciA9IHByb3ZpZGVyO1xuICAgIHRoaXMuZ2V0QXN5bmNJZCgpO1xuICB9XG5cbiAgZ2V0QXN5bmNJZCgpOiBudW1iZXIge1xuICAgIHRoaXMuYXN5bmNJZCA9IHRoaXMuYXN5bmNJZCA9PT0ga0ludmFsaWRBc3luY0lkXG4gICAgICA/IG5ld0FzeW5jSWQoKVxuICAgICAgOiB0aGlzLmFzeW5jSWQ7XG5cbiAgICByZXR1cm4gdGhpcy5hc3luY0lkO1xuICB9XG5cbiAgZ2V0UHJvdmlkZXJUeXBlKCkge1xuICAgIHJldHVybiB0aGlzLnByb3ZpZGVyO1xuICB9XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBQzFFLHNEQUFzRDtBQUN0RCxFQUFFO0FBQ0YsMEVBQTBFO0FBQzFFLGdFQUFnRTtBQUNoRSxzRUFBc0U7QUFDdEUsc0VBQXNFO0FBQ3RFLDRFQUE0RTtBQUM1RSxxRUFBcUU7QUFDckUsd0JBQXdCO0FBQ3hCLEVBQUU7QUFDRiwwRUFBMEU7QUFDMUUseURBQXlEO0FBQ3pELEVBQUU7QUFDRiwwRUFBMEU7QUFDMUUsNkRBQTZEO0FBQzdELDRFQUE0RTtBQUM1RSwyRUFBMkU7QUFDM0Usd0VBQXdFO0FBQ3hFLDRFQUE0RTtBQUM1RSx5Q0FBeUM7QUFFekMscUJBQXFCO0FBQ3JCLG9FQUFvRTtBQUNwRSxpRUFBaUU7QUFDakUsZ0VBQWdFO0FBRWhFLE9BQU8sU0FBUyxvQkFDZCxtQ0FBbUM7QUFDbkMsT0FBWSxFQUNaLFFBQWdCLEVBQ2hCLEtBQTZCO0FBRTdCLDBDQUEwQztBQUM1QztXQUVPO1VBQUssU0FBUztFQUFULFVBQUEsVUFDVixXQUFBLEtBQUE7RUFEVSxVQUFBLFVBRVYsYUFBQSxLQUFBO0VBRlUsVUFBQSxVQUdWLFlBQUEsS0FBQTtFQUhVLFVBQUEsVUFJVixjQUFBLEtBQUE7RUFKVSxVQUFBLFVBS1YscUJBQUEsS0FBQTtFQUxVLFVBQUEsVUFNVixhQUFBLEtBQUE7RUFOVSxVQUFBLFVBT1YsWUFBQSxLQUFBO0VBUFUsVUFBQSxVQVFWLHVCQUFBLEtBQUE7RUFSVSxVQUFBLFVBU1YscUJBQUEsS0FBQTtFQVRVLFVBQUEsVUFVVixxQkFBQSxLQUFBO0VBVlUsVUFBQSxVQVdWLDRCQUFBLE1BQUE7RUFYVSxVQUFBLFVBWVYsaUNBQUEsTUFBQTtFQVpVLFVBQUEsVUFhVixrQkFBQSxNQUFBO0dBYlUsY0FBQTtBQWdCWixNQUFNLGtCQUFrQixJQUFJLFlBQVksT0FBTyxJQUFJLENBQUMsV0FBVyxNQUFNO0FBRXJFLFNBQVMsbUJBQW1CLGlCQUFpQixHQUFHO0FBRWhELDBEQUEwRDtBQUMxRCxPQUFPLFNBQVM7RUFDZCxPQUFPLEVBQUUsYUFBYSxDQUFDLFVBQVUsZUFBZSxDQUFDO0FBQ25EO1dBRU87VUFBSyxTQUFTO0VBQVQsVUFBQSxVQUNWLHVCQUFBLEtBQUE7RUFEVSxVQUFBLFVBRVYscUJBQUEsS0FBQTtFQUZVLFVBQUEsVUFHVixxQkFBQSxLQUFBO0VBSFUsVUFBQSxVQUlWLDRCQUFBLEtBQUE7RUFKVSxVQUFBLFVBS1YscUJBQUEsS0FBQTtHQUxVLGNBQUE7QUFRWixNQUFNLGdCQUFnQixJQUFJLGFBQWEsT0FBTyxJQUFJLENBQUMsV0FBVyxNQUFNO0FBRXBFLGdGQUFnRjtBQUNoRiw0QkFBNEI7QUFDNUIsYUFBYSxDQUFDLFVBQVUsZUFBZSxDQUFDLEdBQUc7QUFFM0MsMkVBQTJFO0FBQzNFLDBFQUEwRTtBQUMxRSxxRUFBcUU7QUFDckUscURBQXFEO0FBQ3JELGFBQWEsQ0FBQyxVQUFVLHNCQUFzQixDQUFDLEdBQUcsQ0FBQztBQUVuRCxTQUFTLGFBQWEsR0FBRztXQUVsQjtVQUFLLFlBQVk7RUFBWixhQUFBLGFBQ1YsVUFBQSxLQUFBO0VBRFUsYUFBQSxhQUVWLHdCQUFBLEtBQUE7RUFGVSxhQUFBLGFBR1YscUJBQUEsS0FBQTtFQUhVLGFBQUEsYUFJVixvQkFBQSxLQUFBO0VBSlUsYUFBQSxhQUtWLGNBQUEsS0FBQTtFQUxVLGFBQUEsYUFNVixrQkFBQSxLQUFBO0VBTlUsYUFBQSxhQU9WLG9CQUFBLEtBQUE7RUFQVSxhQUFBLGFBUVYsbUJBQUEsS0FBQTtFQVJVLGFBQUEsYUFTVixhQUFBLEtBQUE7RUFUVSxhQUFBLGFBVVYsZUFBQSxLQUFBO0dBVlUsaUJBQUE7QUFhWixNQUFNLGtCQUFrQixDQUFDO0FBRXpCLE9BQU8sTUFBTTtFQUNYLFdBQXlCLGFBQWEsSUFBSSxDQUFDO0VBQzNDLFVBQVUsZ0JBQWdCO0VBRTFCLFlBQVksUUFBc0IsQ0FBRTtJQUNsQyxJQUFJLENBQUMsUUFBUSxHQUFHO0lBQ2hCLElBQUksQ0FBQyxVQUFVO0VBQ2pCO0VBRUEsYUFBcUI7SUFDbkIsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxLQUFLLGtCQUM1QixlQUNBLElBQUksQ0FBQyxPQUFPO0lBRWhCLE9BQU8sSUFBSSxDQUFDLE9BQU87RUFDckI7RUFFQSxrQkFBa0I7SUFDaEIsT0FBTyxJQUFJLENBQUMsUUFBUTtFQUN0QjtBQUNGIn0=