// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
import * as DenoUnstable from "../../_deno_unstable.ts";
import { makeCallback } from "./_fs_common.ts";
import { fs, os } from "../internal_binding/constants.ts";
import { getValidatedPath, getValidMode } from "../internal/fs/utils.mjs";
export function access(path, mode, callback) {
  if (typeof mode === "function") {
    callback = mode;
    mode = fs.F_OK;
  }
  path = getValidatedPath(path).toString();
  mode = getValidMode(mode, "access");
  const cb = makeCallback(callback);
  Deno.lstat(path).then((info)=>{
    const m = +mode || 0;
    let fileMode = +info.mode || 0;
    if (Deno.build.os !== "windows" && info.uid === DenoUnstable.getUid()) {
      // If the user is the owner of the file, then use the owner bits of
      // the file permission
      fileMode >>= 6;
    }
    // TODO(kt3k): Also check the case when the user belong to the group
    // of the file
    if ((m & fileMode) === m) {
      // all required flags exist
      cb(null);
    } else {
      // some required flags don't
      // deno-lint-ignore no-explicit-any
      const e = new Error(`EACCES: permission denied, access '${path}'`);
      e.path = path;
      e.syscall = "access";
      e.errno = os.errno.EACCES;
      e.code = "EACCES";
      cb(e);
    }
  }, (err)=>{
    if (err instanceof Deno.errors.NotFound) {
      // deno-lint-ignore no-explicit-any
      const e = new Error(`ENOENT: no such file or directory, access '${path}'`);
      e.path = path;
      e.syscall = "access";
      e.errno = os.errno.ENOENT;
      e.code = "ENOENT";
      cb(e);
    } else {
      cb(err);
    }
  });
}
export function accessSync(path, mode) {
  path = getValidatedPath(path).toString();
  mode = getValidMode(mode, "access");
  try {
    const info = Deno.lstatSync(path.toString());
    const m = +mode || 0;
    const fileMode = +info.mode || 0;
    // FIXME(kt3k): use the last digit of file mode as its mode for now
    // This is not correct if the user is the owner of the file
    // or is a member of the owner group
    if ((m & fileMode) === m) {
    // all required flags exist
    } else {
      // some required flags don't
      // deno-lint-ignore no-explicit-any
      const e = new Error(`EACCES: permission denied, access '${path}'`);
      e.path = path;
      e.syscall = "access";
      e.errno = os.errno.EACCES;
      e.code = "EACCES";
      throw e;
    }
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      // deno-lint-ignore no-explicit-any
      const e = new Error(`ENOENT: no such file or directory, access '${path}'`);
      e.path = path;
      e.syscall = "access";
      e.errno = os.errno.ENOENT;
      e.code = "ENOENT";
      throw e;
    } else {
      throw err;
    }
  }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL25vZGUvX2ZzL19mc19hY2Nlc3MudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMiB0aGUgRGVubyBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cbmltcG9ydCAqIGFzIERlbm9VbnN0YWJsZSBmcm9tIFwiLi4vLi4vX2Rlbm9fdW5zdGFibGUudHNcIjtcbmltcG9ydCB7IHR5cGUgQ2FsbGJhY2tXaXRoRXJyb3IsIG1ha2VDYWxsYmFjayB9IGZyb20gXCIuL19mc19jb21tb24udHNcIjtcbmltcG9ydCB7IGZzLCBvcyB9IGZyb20gXCIuLi9pbnRlcm5hbF9iaW5kaW5nL2NvbnN0YW50cy50c1wiO1xuaW1wb3J0IHsgZ2V0VmFsaWRhdGVkUGF0aCwgZ2V0VmFsaWRNb2RlIH0gZnJvbSBcIi4uL2ludGVybmFsL2ZzL3V0aWxzLm1qc1wiO1xuaW1wb3J0IHR5cGUgeyBCdWZmZXIgfSBmcm9tIFwiLi4vYnVmZmVyLnRzXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBhY2Nlc3MoXG4gIHBhdGg6IHN0cmluZyB8IEJ1ZmZlciB8IFVSTCxcbiAgbW9kZTogbnVtYmVyIHwgQ2FsbGJhY2tXaXRoRXJyb3IsXG4gIGNhbGxiYWNrPzogQ2FsbGJhY2tXaXRoRXJyb3IsXG4pOiB2b2lkIHtcbiAgaWYgKHR5cGVvZiBtb2RlID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICBjYWxsYmFjayA9IG1vZGU7XG4gICAgbW9kZSA9IGZzLkZfT0s7XG4gIH1cblxuICBwYXRoID0gZ2V0VmFsaWRhdGVkUGF0aChwYXRoKS50b1N0cmluZygpO1xuICBtb2RlID0gZ2V0VmFsaWRNb2RlKG1vZGUsIFwiYWNjZXNzXCIpO1xuICBjb25zdCBjYiA9IG1ha2VDYWxsYmFjayhjYWxsYmFjayk7XG5cbiAgRGVuby5sc3RhdChwYXRoKS50aGVuKChpbmZvKSA9PiB7XG4gICAgY29uc3QgbSA9ICttb2RlIHx8IDA7XG4gICAgbGV0IGZpbGVNb2RlID0gK2luZm8ubW9kZSEgfHwgMDtcbiAgICBpZiAoRGVuby5idWlsZC5vcyAhPT0gXCJ3aW5kb3dzXCIgJiYgaW5mby51aWQgPT09IERlbm9VbnN0YWJsZS5nZXRVaWQoKSkge1xuICAgICAgLy8gSWYgdGhlIHVzZXIgaXMgdGhlIG93bmVyIG9mIHRoZSBmaWxlLCB0aGVuIHVzZSB0aGUgb3duZXIgYml0cyBvZlxuICAgICAgLy8gdGhlIGZpbGUgcGVybWlzc2lvblxuICAgICAgZmlsZU1vZGUgPj49IDY7XG4gICAgfVxuICAgIC8vIFRPRE8oa3Qzayk6IEFsc28gY2hlY2sgdGhlIGNhc2Ugd2hlbiB0aGUgdXNlciBiZWxvbmcgdG8gdGhlIGdyb3VwXG4gICAgLy8gb2YgdGhlIGZpbGVcbiAgICBpZiAoKG0gJiBmaWxlTW9kZSkgPT09IG0pIHtcbiAgICAgIC8vIGFsbCByZXF1aXJlZCBmbGFncyBleGlzdFxuICAgICAgY2IobnVsbCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIHNvbWUgcmVxdWlyZWQgZmxhZ3MgZG9uJ3RcbiAgICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgICBjb25zdCBlOiBhbnkgPSBuZXcgRXJyb3IoYEVBQ0NFUzogcGVybWlzc2lvbiBkZW5pZWQsIGFjY2VzcyAnJHtwYXRofSdgKTtcbiAgICAgIGUucGF0aCA9IHBhdGg7XG4gICAgICBlLnN5c2NhbGwgPSBcImFjY2Vzc1wiO1xuICAgICAgZS5lcnJubyA9IG9zLmVycm5vLkVBQ0NFUztcbiAgICAgIGUuY29kZSA9IFwiRUFDQ0VTXCI7XG4gICAgICBjYihlKTtcbiAgICB9XG4gIH0sIChlcnIpID0+IHtcbiAgICBpZiAoZXJyIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuTm90Rm91bmQpIHtcbiAgICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgICBjb25zdCBlOiBhbnkgPSBuZXcgRXJyb3IoXG4gICAgICAgIGBFTk9FTlQ6IG5vIHN1Y2ggZmlsZSBvciBkaXJlY3RvcnksIGFjY2VzcyAnJHtwYXRofSdgLFxuICAgICAgKTtcbiAgICAgIGUucGF0aCA9IHBhdGg7XG4gICAgICBlLnN5c2NhbGwgPSBcImFjY2Vzc1wiO1xuICAgICAgZS5lcnJubyA9IG9zLmVycm5vLkVOT0VOVDtcbiAgICAgIGUuY29kZSA9IFwiRU5PRU5UXCI7XG4gICAgICBjYihlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY2IoZXJyKTtcbiAgICB9XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWNjZXNzU3luYyhwYXRoOiBzdHJpbmcgfCBCdWZmZXIgfCBVUkwsIG1vZGU/OiBudW1iZXIpOiB2b2lkIHtcbiAgcGF0aCA9IGdldFZhbGlkYXRlZFBhdGgocGF0aCkudG9TdHJpbmcoKTtcbiAgbW9kZSA9IGdldFZhbGlkTW9kZShtb2RlLCBcImFjY2Vzc1wiKTtcbiAgdHJ5IHtcbiAgICBjb25zdCBpbmZvID0gRGVuby5sc3RhdFN5bmMocGF0aC50b1N0cmluZygpKTtcbiAgICBjb25zdCBtID0gK21vZGUhIHx8IDA7XG4gICAgY29uc3QgZmlsZU1vZGUgPSAraW5mby5tb2RlISB8fCAwO1xuICAgIC8vIEZJWE1FKGt0M2spOiB1c2UgdGhlIGxhc3QgZGlnaXQgb2YgZmlsZSBtb2RlIGFzIGl0cyBtb2RlIGZvciBub3dcbiAgICAvLyBUaGlzIGlzIG5vdCBjb3JyZWN0IGlmIHRoZSB1c2VyIGlzIHRoZSBvd25lciBvZiB0aGUgZmlsZVxuICAgIC8vIG9yIGlzIGEgbWVtYmVyIG9mIHRoZSBvd25lciBncm91cFxuICAgIGlmICgobSAmIGZpbGVNb2RlKSA9PT0gbSkge1xuICAgICAgLy8gYWxsIHJlcXVpcmVkIGZsYWdzIGV4aXN0XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIHNvbWUgcmVxdWlyZWQgZmxhZ3MgZG9uJ3RcbiAgICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgICBjb25zdCBlOiBhbnkgPSBuZXcgRXJyb3IoYEVBQ0NFUzogcGVybWlzc2lvbiBkZW5pZWQsIGFjY2VzcyAnJHtwYXRofSdgKTtcbiAgICAgIGUucGF0aCA9IHBhdGg7XG4gICAgICBlLnN5c2NhbGwgPSBcImFjY2Vzc1wiO1xuICAgICAgZS5lcnJubyA9IG9zLmVycm5vLkVBQ0NFUztcbiAgICAgIGUuY29kZSA9IFwiRUFDQ0VTXCI7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgaWYgKGVyciBpbnN0YW5jZW9mIERlbm8uZXJyb3JzLk5vdEZvdW5kKSB7XG4gICAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgICAgY29uc3QgZTogYW55ID0gbmV3IEVycm9yKFxuICAgICAgICBgRU5PRU5UOiBubyBzdWNoIGZpbGUgb3IgZGlyZWN0b3J5LCBhY2Nlc3MgJyR7cGF0aH0nYCxcbiAgICAgICk7XG4gICAgICBlLnBhdGggPSBwYXRoO1xuICAgICAgZS5zeXNjYWxsID0gXCJhY2Nlc3NcIjtcbiAgICAgIGUuZXJybm8gPSBvcy5lcnJuby5FTk9FTlQ7XG4gICAgICBlLmNvZGUgPSBcIkVOT0VOVFwiO1xuICAgICAgdGhyb3cgZTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgZXJyO1xuICAgIH1cbiAgfVxufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRSxZQUFZLGtCQUFrQiwwQkFBMEI7QUFDeEQsU0FBaUMsWUFBWSxRQUFRLGtCQUFrQjtBQUN2RSxTQUFTLEVBQUUsRUFBRSxFQUFFLFFBQVEsbUNBQW1DO0FBQzFELFNBQVMsZ0JBQWdCLEVBQUUsWUFBWSxRQUFRLDJCQUEyQjtBQUcxRSxPQUFPLFNBQVMsT0FDZCxJQUEyQixFQUMzQixJQUFnQyxFQUNoQyxRQUE0QjtFQUU1QixJQUFJLE9BQU8sU0FBUyxZQUFZO0lBQzlCLFdBQVc7SUFDWCxPQUFPLEdBQUcsSUFBSTtFQUNoQjtFQUVBLE9BQU8saUJBQWlC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