// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// Copyright 2017 crypto-browserify. All rights reserved. MIT license.
import { Buffer } from "../../buffer.ts";
import { createHash } from "../hash.ts";
export function EVP_BytesToKey(password, salt, keyBits, ivLen) {
  if (!Buffer.isBuffer(password)) password = Buffer.from(password, "binary");
  if (salt) {
    if (!Buffer.isBuffer(salt)) salt = Buffer.from(salt, "binary");
    if (salt.length !== 8) {
      throw new RangeError("salt should be Buffer with 8 byte length");
    }
  }
  let keyLen = keyBits / 8;
  const key = Buffer.alloc(keyLen);
  const iv = Buffer.alloc(ivLen || 0);
  let tmp = Buffer.alloc(0);
  while(keyLen > 0 || ivLen > 0){
    const hash = createHash("md5");
    hash.update(tmp);
    hash.update(password);
    if (salt) hash.update(salt);
    tmp = hash.digest();
    let used = 0;
    if (keyLen > 0) {
      const keyStart = key.length - keyLen;
      used = Math.min(keyLen, tmp.length);
      tmp.copy(key, keyStart, 0, used);
      keyLen -= used;
    }
    if (used < tmp.length && ivLen > 0) {
      const ivStart = iv.length - ivLen;
      const length = Math.min(ivLen, tmp.length - used);
      tmp.copy(iv, ivStart, used, used + length);
      ivLen -= length;
    }
  }
  tmp.fill(0);
  return {
    key,
    iv
  };
}
export default EVP_BytesToKey;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL25vZGUvX2NyeXB0by9jcnlwdG9fYnJvd3NlcmlmeS9ldnBfYnl0ZXNfdG9fa2V5LnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjIgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG4vLyBDb3B5cmlnaHQgMjAxNyBjcnlwdG8tYnJvd3NlcmlmeS4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5cbmltcG9ydCB7IEJ1ZmZlciB9IGZyb20gXCIuLi8uLi9idWZmZXIudHNcIjtcbmltcG9ydCB7IGNyZWF0ZUhhc2ggfSBmcm9tIFwiLi4vaGFzaC50c1wiO1xuXG5leHBvcnQgZnVuY3Rpb24gRVZQX0J5dGVzVG9LZXkoXG4gIHBhc3N3b3JkOiBzdHJpbmcgfCBCdWZmZXIsXG4gIHNhbHQ6IHN0cmluZyB8IEJ1ZmZlcixcbiAga2V5Qml0czogbnVtYmVyLFxuICBpdkxlbjogbnVtYmVyLFxuKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKHBhc3N3b3JkKSkgcGFzc3dvcmQgPSBCdWZmZXIuZnJvbShwYXNzd29yZCwgXCJiaW5hcnlcIik7XG4gIGlmIChzYWx0KSB7XG4gICAgaWYgKCFCdWZmZXIuaXNCdWZmZXIoc2FsdCkpIHNhbHQgPSBCdWZmZXIuZnJvbShzYWx0LCBcImJpbmFyeVwiKTtcbiAgICBpZiAoc2FsdC5sZW5ndGggIT09IDgpIHtcbiAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKFwic2FsdCBzaG91bGQgYmUgQnVmZmVyIHdpdGggOCBieXRlIGxlbmd0aFwiKTtcbiAgICB9XG4gIH1cblxuICBsZXQga2V5TGVuID0ga2V5Qml0cyAvIDg7XG4gIGNvbnN0IGtleSA9IEJ1ZmZlci5hbGxvYyhrZXlMZW4pO1xuICBjb25zdCBpdiA9IEJ1ZmZlci5hbGxvYyhpdkxlbiB8fCAwKTtcbiAgbGV0IHRtcCA9IEJ1ZmZlci5hbGxvYygwKTtcblxuICB3aGlsZSAoa2V5TGVuID4gMCB8fCBpdkxlbiA+IDApIHtcbiAgICBjb25zdCBoYXNoID0gY3JlYXRlSGFzaChcIm1kNVwiKTtcbiAgICBoYXNoLnVwZGF0ZSh0bXApO1xuICAgIGhhc2gudXBkYXRlKHBhc3N3b3JkKTtcbiAgICBpZiAoc2FsdCkgaGFzaC51cGRhdGUoc2FsdCk7XG4gICAgdG1wID0gaGFzaC5kaWdlc3QoKSBhcyBCdWZmZXI7XG5cbiAgICBsZXQgdXNlZCA9IDA7XG5cbiAgICBpZiAoa2V5TGVuID4gMCkge1xuICAgICAgY29uc3Qga2V5U3RhcnQgPSBrZXkubGVuZ3RoIC0ga2V5TGVuO1xuICAgICAgdXNlZCA9IE1hdGgubWluKGtleUxlbiwgdG1wLmxlbmd0aCk7XG4gICAgICB0bXAuY29weShrZXksIGtleVN0YXJ0LCAwLCB1c2VkKTtcbiAgICAgIGtleUxlbiAtPSB1c2VkO1xuICAgIH1cblxuICAgIGlmICh1c2VkIDwgdG1wLmxlbmd0aCAmJiBpdkxlbiA+IDApIHtcbiAgICAgIGNvbnN0IGl2U3RhcnQgPSBpdi5sZW5ndGggLSBpdkxlbjtcbiAgICAgIGNvbnN0IGxlbmd0aCA9IE1hdGgubWluKGl2TGVuLCB0bXAubGVuZ3RoIC0gdXNlZCk7XG4gICAgICB0bXAuY29weShpdiwgaXZTdGFydCwgdXNlZCwgdXNlZCArIGxlbmd0aCk7XG4gICAgICBpdkxlbiAtPSBsZW5ndGg7XG4gICAgfVxuICB9XG5cbiAgdG1wLmZpbGwoMCk7XG4gIHJldHVybiB7IGtleSwgaXYgfTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgRVZQX0J5dGVzVG9LZXk7XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBQzFFLHNFQUFzRTtBQUV0RSxTQUFTLE1BQU0sUUFBUSxrQkFBa0I7QUFDekMsU0FBUyxVQUFVLFFBQVEsYUFBYTtBQUV4QyxPQUFPLFNBQVMsZUFDZCxRQUF5QixFQUN6QixJQUFxQixFQUNyQixPQUFlLEVBQ2YsS0FBYTtFQUViLElBQUksQ0FBQyxPQUFPLFFBQVEsQ0FBQyxXQUFXLFdBQVcsT0FBTyxJQUFJLENBQUMsVUFBVTtFQUNqRSxJQUFJLE1BQU07SUFDUixJQUFJLENBQUMsT0FBTyxRQUFRLENBQUMsT0FBTyxPQUFPLE9BQU8sSUFBSSxDQUFDLE1BQU07SUFDckQsSUFBSSxLQUFLLE1BQU0sS0FBSyxHQUFHO01BQ3JCLE1BQU0sSUFBSSxXQUFXO0lBQ3ZCO0VBQ0Y7RUFFQSxJQUFJLFNBQVMsVUFBVTtFQUN2QixNQUFNLE1BQU0sT0FBTyxLQUFLLENBQUM7RUFDekIsTUFBTSxLQUFLLE9BQU8sS0FBSyxDQUFDLFNBQVM7RUFDakMsSUFBSSxNQUFNLE9BQU8sS0FBSyxDQUFDO0VBRXZCLE1BQU8sU0FBUyxLQUFLLFFBQVEsRUFBRztJQUM5QixNQUFNLE9BQU8sV0FBVztJQUN4QixLQUFLLE1BQU0sQ0FBQztJQUNaLEtBQUssTUFBTSxDQUFDO0lBQ1osSUFBSSxNQUFNLEtBQUssTUFBTSxDQUFDO0lBQ3RCLE1BQU0sS0FBSyxNQUFNO0lBRWpCLElBQUksT0FBTztJQUVYLElBQUksU0FBUyxHQUFHO01BQ2QsTUFBTSxXQUFXLElBQUksTUFBTSxHQUFHO01BQzlCLE9BQU8sS0FBSyxHQUFHLENBQUMsUUFBUSxJQUFJLE1BQU07TUFDbEMsSUFBSSxJQUFJLENBQUMsS0FBSyxVQUFVLEdBQUc7TUFDM0IsVUFBVTtJQUNaO0lBRUEsSUFBSSxPQUFPLElBQUksTUFBTSxJQUFJLFFBQVEsR0FBRztNQUNsQyxNQUFNLFVBQVUsR0FBRyxNQUFNLEdBQUc7TUFDNUIsTUFBTSxTQUFTLEtBQUssR0FBRyxDQUFDLE9BQU8sSUFBSSxNQUFNLEdBQUc7TUFDNUMsSUFBSSxJQUFJLENBQUMsSUFBSSxTQUFTLE1BQU0sT0FBTztNQUNuQyxTQUFTO0lBQ1g7RUFDRjtFQUVBLElBQUksSUFBSSxDQUFDO0VBQ1QsT0FBTztJQUFFO0lBQUs7RUFBRztBQUNuQjtBQUVBLGVBQWUsZUFBZSJ9