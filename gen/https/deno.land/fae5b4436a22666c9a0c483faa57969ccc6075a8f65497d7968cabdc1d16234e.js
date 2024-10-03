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
// - https://github.com/nodejs/node/blob/master/src/tcp_wrap.cc
// - https://github.com/nodejs/node/blob/master/src/tcp_wrap.h
import { notImplemented } from "../_utils.ts";
import { unreachable } from "../../testing/asserts.ts";
import { ConnectionWrap } from "./connection_wrap.ts";
import { AsyncWrap, providerType } from "./async_wrap.ts";
import { LibuvStreamWrap } from "./stream_wrap.ts";
import { ownerSymbol } from "./symbols.ts";
import { codeMap } from "./uv.ts";
import { delay } from "../../async/mod.ts";
import { kStreamBaseField } from "./stream_wrap.ts";
import { isIP } from "../internal/net.ts";
var /** The type of TCP socket. */ socketType;
(function(socketType) {
  socketType[socketType["SOCKET"] = 0] = "SOCKET";
  socketType[socketType["SERVER"] = 1] = "SERVER";
})(socketType || (socketType = {}));
/** Initial backoff delay of 5ms following a temporary accept failure. */ const INITIAL_ACCEPT_BACKOFF_DELAY = 5;
/** Max backoff delay of 1s following a temporary accept failure. */ const MAX_ACCEPT_BACKOFF_DELAY = 1000;
/**
 * @param n Number to act on.
 * @return The number rounded up to the nearest power of 2.
 */ function _ceilPowOf2(n) {
  const roundPowOf2 = 1 << 31 - Math.clz32(n);
  return roundPowOf2 < n ? roundPowOf2 * 2 : roundPowOf2;
}
export class TCPConnectWrap extends AsyncWrap {
  oncomplete;
  address;
  port;
  localAddress;
  localPort;
  constructor(){
    super(providerType.TCPCONNECTWRAP);
  }
}
export var constants;
(function(constants) {
  constants[constants["SOCKET"] = socketType.SOCKET] = "SOCKET";
  constants[constants["SERVER"] = socketType.SERVER] = "SERVER";
  constants[constants["UV_TCP_IPV6ONLY"] = 0] = "UV_TCP_IPV6ONLY";
})(constants || (constants = {}));
export class TCP extends ConnectionWrap {
  [ownerSymbol] = null;
  reading = false;
  #address;
  #port;
  #remoteAddress;
  #remoteFamily;
  #remotePort;
  #backlog;
  #listener;
  #connections = 0;
  #closed = false;
  #acceptBackoffDelay;
  /**
   * Creates a new TCP class instance.
   * @param type The socket type.
   * @param conn Optional connection object to wrap.
   */ constructor(type, conn){
    let provider;
    switch(type){
      case socketType.SOCKET:
        {
          provider = providerType.TCPWRAP;
          break;
        }
      case socketType.SERVER:
        {
          provider = providerType.TCPSERVERWRAP;
          break;
        }
      default:
        {
          unreachable();
        }
    }
    super(provider, conn);
    // TODO(cmorten): the handling of new connections and construction feels
    // a little off. Suspect duplicating in some fashion.
    if (conn && provider === providerType.TCPWRAP) {
      const localAddr = conn.localAddr;
      this.#address = localAddr.hostname;
      this.#port = localAddr.port;
      const remoteAddr = conn.remoteAddr;
      this.#remoteAddress = remoteAddr.hostname;
      this.#remotePort = remoteAddr.port;
      this.#remoteFamily = isIP(remoteAddr.hostname) === 6 ? "IPv6" : "IPv4";
    }
  }
  /**
   * Opens a file descriptor.
   * @param fd The file descriptor to open.
   * @return An error status code.
   */ open(_fd) {
    // REF: https://github.com/denoland/deno/issues/6529
    notImplemented();
  }
  /**
   * Bind to an IPv4 address.
   * @param address The hostname to bind to.
   * @param port The port to bind to
   * @return An error status code.
   */ bind(address, port) {
    return this.#bind(address, port, 0);
  }
  /**
   * Bind to an IPv6 address.
   * @param address The hostname to bind to.
   * @param port The port to bind to
   * @return An error status code.
   */ bind6(address, port, flags) {
    return this.#bind(address, port, flags);
  }
  /**
   * Connect to an IPv4 address.
   * @param req A TCPConnectWrap instance.
   * @param address The hostname to connect to.
   * @param port The port to connect to.
   * @return An error status code.
   */ connect(req, address, port) {
    return this.#connect(req, address, port);
  }
  /**
   * Connect to an IPv6 address.
   * @param req A TCPConnectWrap instance.
   * @param address The hostname to connect to.
   * @param port The port to connect to.
   * @return An error status code.
   */ connect6(req, address, port) {
    return this.#connect(req, address, port);
  }
  /**
   * Listen for new connections.
   * @param backlog
   * @return An error status code.
   */ listen(backlog) {
    this.#backlog = _ceilPowOf2(backlog + 1);
    const listenOptions = {
      hostname: this.#address,
      port: this.#port,
      transport: "tcp"
    };
    let listener;
    try {
      listener = Deno.listen(listenOptions);
    } catch (e) {
      if (e instanceof Deno.errors.AddrInUse) {
        return codeMap.get("EADDRINUSE");
      } else if (e instanceof Deno.errors.AddrNotAvailable) {
        return codeMap.get("EADDRNOTAVAIL");
      }
      // TODO(cmorten): map errors to appropriate error codes.
      return codeMap.get("UNKNOWN");
    }
    const address = listener.addr;
    this.#address = address.hostname;
    this.#port = address.port;
    this.#listener = listener;
    this.#accept();
    return 0;
  }
  /**
   * Populates the provided object with local address entries.
   * @param sockname An object to add the local address entries to.
   * @return An error status code.
   */ getsockname(sockname) {
    if (typeof this.#address === "undefined" || typeof this.#port === "undefined") {
      return codeMap.get("EADDRNOTAVAIL");
    }
    sockname.address = this.#address;
    sockname.port = this.#port;
    sockname.family = isIP(this.#address) === 6 ? "IPv6" : "IPv4";
    return 0;
  }
  /**
   * Populates the provided object with remote address entries.
   * @param peername An object to add the remote address entries to.
   * @return An error status code.
   */ getpeername(peername) {
    if (typeof this.#remoteAddress === "undefined" || typeof this.#remotePort === "undefined") {
      return codeMap.get("EADDRNOTAVAIL");
    }
    peername.address = this.#remoteAddress;
    peername.port = this.#remotePort;
    peername.family = this.#remoteFamily;
    return 0;
  }
  /**
   * @param noDelay
   * @return An error status code.
   */ setNoDelay(_noDelay) {
    // TODO(bnoordhuis) https://github.com/denoland/deno/pull/13103
    return 0;
  }
  /**
   * @param enable
   * @param initialDelay
   * @return An error status code.
   */ setKeepAlive(_enable, _initialDelay) {
    // TODO(bnoordhuis) https://github.com/denoland/deno/pull/13103
    return 0;
  }
  /**
   * Windows only.
   *
   * Deprecated by Node.
   * REF: https://github.com/nodejs/node/blob/master/lib/net.js#L1731
   *
   * @param enable
   * @return An error status code.
   * @deprecated
   */ setSimultaneousAccepts(_enable) {
    // Low priority to implement owing to it being deprecated in Node.
    notImplemented();
  }
  /**
   * Bind to an IPv4 or IPv6 address.
   * @param address The hostname to bind to.
   * @param port The port to bind to
   * @param flags
   * @return An error status code.
   */ #bind(address, port, _flags) {
    // Deno doesn't currently separate bind from connect. For now we noop under
    // the assumption we will connect shortly.
    // REF: https://doc.deno.land/builtin/stable#Deno.connect
    //
    // This also means we won't be connecting from the specified local address
    // and port as providing these is not an option in Deno.
    // REF: https://doc.deno.land/builtin/stable#Deno.ConnectOptions
    this.#address = address;
    this.#port = port;
    return 0;
  }
  /**
   * Connect to an IPv4 or IPv6 address.
   * @param req A TCPConnectWrap instance.
   * @param address The hostname to connect to.
   * @param port The port to connect to.
   * @return An error status code.
   */ #connect(req, address, port) {
    this.#remoteAddress = address;
    this.#remotePort = port;
    this.#remoteFamily = isIP(address) === 6 ? "IPv6" : "IPv4";
    const connectOptions = {
      hostname: address,
      port,
      transport: "tcp"
    };
    Deno.connect(connectOptions).then((conn)=>{
      // Incorrect / backwards, but correcting the local address and port with
      // what was actually used given we can't actually specify these in Deno.
      const localAddr = conn.localAddr;
      this.#address = req.localAddress = localAddr.hostname;
      this.#port = req.localPort = localAddr.port;
      this[kStreamBaseField] = conn;
      try {
        this.afterConnect(req, 0);
      } catch  {
      // swallow callback errors.
      }
    }, ()=>{
      try {
        // TODO(cmorten): correct mapping of connection error to status code.
        this.afterConnect(req, codeMap.get("ECONNREFUSED"));
      } catch  {
      // swallow callback errors.
      }
    });
    return 0;
  }
  /** Handle backoff delays following an unsuccessful accept. */ async #acceptBackoff() {
    // Backoff after transient errors to allow time for the system to
    // recover, and avoid blocking up the event loop with a continuously
    // running loop.
    if (!this.#acceptBackoffDelay) {
      this.#acceptBackoffDelay = INITIAL_ACCEPT_BACKOFF_DELAY;
    } else {
      this.#acceptBackoffDelay *= 2;
    }
    if (this.#acceptBackoffDelay >= MAX_ACCEPT_BACKOFF_DELAY) {
      this.#acceptBackoffDelay = MAX_ACCEPT_BACKOFF_DELAY;
    }
    await delay(this.#acceptBackoffDelay);
    this.#accept();
  }
  /** Accept new connections. */ async #accept() {
    if (this.#closed) {
      return;
    }
    if (this.#connections > this.#backlog) {
      this.#acceptBackoff();
      return;
    }
    let connection;
    try {
      connection = await this.#listener.accept();
    } catch (e) {
      if (e instanceof Deno.errors.BadResource && this.#closed) {
        // Listener and server has closed.
        return;
      }
      try {
        // TODO(cmorten): map errors to appropriate error codes.
        this.onconnection(codeMap.get("UNKNOWN"), undefined);
      } catch  {
      // swallow callback errors.
      }
      this.#acceptBackoff();
      return;
    }
    // Reset the backoff delay upon successful accept.
    this.#acceptBackoffDelay = undefined;
    const connectionHandle = new TCP(socketType.SOCKET, connection);
    this.#connections++;
    try {
      this.onconnection(0, connectionHandle);
    } catch  {
    // swallow callback errors.
    }
    return this.#accept();
  }
  /** Handle server closure. */ async _onClose() {
    // TODO(cmorten): this isn't great
    this.#closed = true;
    this.reading = false;
    this.#address = undefined;
    this.#port = undefined;
    this.#remoteAddress = undefined;
    this.#remoteFamily = undefined;
    this.#remotePort = undefined;
    this.#backlog = undefined;
    this.#connections = 0;
    this.#acceptBackoffDelay = undefined;
    if (this.provider === providerType.TCPSERVERWRAP) {
      try {
        this.#listener.close();
      } catch  {
      // listener already closed
      }
    }
    return await LibuvStreamWrap.prototype._onClose.call(this);
  }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzMi4wL25vZGUvaW50ZXJuYWxfYmluZGluZy90Y3Bfd3JhcC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbi8vIFRoaXMgbW9kdWxlIHBvcnRzOlxuLy8gLSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvYmxvYi9tYXN0ZXIvc3JjL3RjcF93cmFwLmNjXG4vLyAtIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9ibG9iL21hc3Rlci9zcmMvdGNwX3dyYXAuaFxuXG5pbXBvcnQgeyBub3RJbXBsZW1lbnRlZCB9IGZyb20gXCIuLi9fdXRpbHMudHNcIjtcbmltcG9ydCB7IHVucmVhY2hhYmxlIH0gZnJvbSBcIi4uLy4uL3Rlc3RpbmcvYXNzZXJ0cy50c1wiO1xuaW1wb3J0IHsgQ29ubmVjdGlvbldyYXAgfSBmcm9tIFwiLi9jb25uZWN0aW9uX3dyYXAudHNcIjtcbmltcG9ydCB7IEFzeW5jV3JhcCwgcHJvdmlkZXJUeXBlIH0gZnJvbSBcIi4vYXN5bmNfd3JhcC50c1wiO1xuaW1wb3J0IHsgTGlidXZTdHJlYW1XcmFwIH0gZnJvbSBcIi4vc3RyZWFtX3dyYXAudHNcIjtcbmltcG9ydCB7IG93bmVyU3ltYm9sIH0gZnJvbSBcIi4vc3ltYm9scy50c1wiO1xuaW1wb3J0IHsgY29kZU1hcCB9IGZyb20gXCIuL3V2LnRzXCI7XG5pbXBvcnQgeyBkZWxheSB9IGZyb20gXCIuLi8uLi9hc3luYy9tb2QudHNcIjtcbmltcG9ydCB7IGtTdHJlYW1CYXNlRmllbGQgfSBmcm9tIFwiLi9zdHJlYW1fd3JhcC50c1wiO1xuaW1wb3J0IHsgaXNJUCB9IGZyb20gXCIuLi9pbnRlcm5hbC9uZXQudHNcIjtcblxuLyoqIFRoZSB0eXBlIG9mIFRDUCBzb2NrZXQuICovXG5lbnVtIHNvY2tldFR5cGUge1xuICBTT0NLRVQsXG4gIFNFUlZFUixcbn1cblxuaW50ZXJmYWNlIEFkZHJlc3NJbmZvIHtcbiAgYWRkcmVzczogc3RyaW5nO1xuICBmYW1pbHk/OiBzdHJpbmc7XG4gIHBvcnQ6IG51bWJlcjtcbn1cblxuLyoqIEluaXRpYWwgYmFja29mZiBkZWxheSBvZiA1bXMgZm9sbG93aW5nIGEgdGVtcG9yYXJ5IGFjY2VwdCBmYWlsdXJlLiAqL1xuY29uc3QgSU5JVElBTF9BQ0NFUFRfQkFDS09GRl9ERUxBWSA9IDU7XG5cbi8qKiBNYXggYmFja29mZiBkZWxheSBvZiAxcyBmb2xsb3dpbmcgYSB0ZW1wb3JhcnkgYWNjZXB0IGZhaWx1cmUuICovXG5jb25zdCBNQVhfQUNDRVBUX0JBQ0tPRkZfREVMQVkgPSAxMDAwO1xuXG4vKipcbiAqIEBwYXJhbSBuIE51bWJlciB0byBhY3Qgb24uXG4gKiBAcmV0dXJuIFRoZSBudW1iZXIgcm91bmRlZCB1cCB0byB0aGUgbmVhcmVzdCBwb3dlciBvZiAyLlxuICovXG5mdW5jdGlvbiBfY2VpbFBvd09mMihuOiBudW1iZXIpIHtcbiAgY29uc3Qgcm91bmRQb3dPZjIgPSAxIDw8IDMxIC0gTWF0aC5jbHozMihuKTtcblxuICByZXR1cm4gcm91bmRQb3dPZjIgPCBuID8gcm91bmRQb3dPZjIgKiAyIDogcm91bmRQb3dPZjI7XG59XG5cbmV4cG9ydCBjbGFzcyBUQ1BDb25uZWN0V3JhcCBleHRlbmRzIEFzeW5jV3JhcCB7XG4gIG9uY29tcGxldGUhOiAoXG4gICAgc3RhdHVzOiBudW1iZXIsXG4gICAgaGFuZGxlOiBDb25uZWN0aW9uV3JhcCxcbiAgICByZXE6IFRDUENvbm5lY3RXcmFwLFxuICAgIHJlYWRhYmxlOiBib29sZWFuLFxuICAgIHdyaXRlYWJsZTogYm9vbGVhbixcbiAgKSA9PiB2b2lkO1xuICBhZGRyZXNzITogc3RyaW5nO1xuICBwb3J0ITogbnVtYmVyO1xuICBsb2NhbEFkZHJlc3MhOiBzdHJpbmc7XG4gIGxvY2FsUG9ydCE6IG51bWJlcjtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihwcm92aWRlclR5cGUuVENQQ09OTkVDVFdSQVApO1xuICB9XG59XG5cbmV4cG9ydCBlbnVtIGNvbnN0YW50cyB7XG4gIFNPQ0tFVCA9IHNvY2tldFR5cGUuU09DS0VULFxuICBTRVJWRVIgPSBzb2NrZXRUeXBlLlNFUlZFUixcbiAgVVZfVENQX0lQVjZPTkxZLFxufVxuXG5leHBvcnQgY2xhc3MgVENQIGV4dGVuZHMgQ29ubmVjdGlvbldyYXAge1xuICBbb3duZXJTeW1ib2xdOiB1bmtub3duID0gbnVsbDtcbiAgb3ZlcnJpZGUgcmVhZGluZyA9IGZhbHNlO1xuXG4gICNhZGRyZXNzPzogc3RyaW5nO1xuICAjcG9ydD86IG51bWJlcjtcblxuICAjcmVtb3RlQWRkcmVzcz86IHN0cmluZztcbiAgI3JlbW90ZUZhbWlseT86IHN0cmluZztcbiAgI3JlbW90ZVBvcnQ/OiBudW1iZXI7XG5cbiAgI2JhY2tsb2c/OiBudW1iZXI7XG4gICNsaXN0ZW5lciE6IERlbm8uTGlzdGVuZXI7XG4gICNjb25uZWN0aW9ucyA9IDA7XG5cbiAgI2Nsb3NlZCA9IGZhbHNlO1xuICAjYWNjZXB0QmFja29mZkRlbGF5PzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IFRDUCBjbGFzcyBpbnN0YW5jZS5cbiAgICogQHBhcmFtIHR5cGUgVGhlIHNvY2tldCB0eXBlLlxuICAgKiBAcGFyYW0gY29ubiBPcHRpb25hbCBjb25uZWN0aW9uIG9iamVjdCB0byB3cmFwLlxuICAgKi9cbiAgY29uc3RydWN0b3IodHlwZTogbnVtYmVyLCBjb25uPzogRGVuby5Db25uKSB7XG4gICAgbGV0IHByb3ZpZGVyOiBwcm92aWRlclR5cGU7XG5cbiAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgIGNhc2Ugc29ja2V0VHlwZS5TT0NLRVQ6IHtcbiAgICAgICAgcHJvdmlkZXIgPSBwcm92aWRlclR5cGUuVENQV1JBUDtcblxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2Ugc29ja2V0VHlwZS5TRVJWRVI6IHtcbiAgICAgICAgcHJvdmlkZXIgPSBwcm92aWRlclR5cGUuVENQU0VSVkVSV1JBUDtcblxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgdW5yZWFjaGFibGUoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBzdXBlcihwcm92aWRlciwgY29ubik7XG5cbiAgICAvLyBUT0RPKGNtb3J0ZW4pOiB0aGUgaGFuZGxpbmcgb2YgbmV3IGNvbm5lY3Rpb25zIGFuZCBjb25zdHJ1Y3Rpb24gZmVlbHNcbiAgICAvLyBhIGxpdHRsZSBvZmYuIFN1c3BlY3QgZHVwbGljYXRpbmcgaW4gc29tZSBmYXNoaW9uLlxuICAgIGlmIChjb25uICYmIHByb3ZpZGVyID09PSBwcm92aWRlclR5cGUuVENQV1JBUCkge1xuICAgICAgY29uc3QgbG9jYWxBZGRyID0gY29ubi5sb2NhbEFkZHIgYXMgRGVuby5OZXRBZGRyO1xuICAgICAgdGhpcy4jYWRkcmVzcyA9IGxvY2FsQWRkci5ob3N0bmFtZTtcbiAgICAgIHRoaXMuI3BvcnQgPSBsb2NhbEFkZHIucG9ydDtcblxuICAgICAgY29uc3QgcmVtb3RlQWRkciA9IGNvbm4ucmVtb3RlQWRkciBhcyBEZW5vLk5ldEFkZHI7XG4gICAgICB0aGlzLiNyZW1vdGVBZGRyZXNzID0gcmVtb3RlQWRkci5ob3N0bmFtZTtcbiAgICAgIHRoaXMuI3JlbW90ZVBvcnQgPSByZW1vdGVBZGRyLnBvcnQ7XG4gICAgICB0aGlzLiNyZW1vdGVGYW1pbHkgPSBpc0lQKHJlbW90ZUFkZHIuaG9zdG5hbWUpID09PSA2ID8gXCJJUHY2XCIgOiBcIklQdjRcIjtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogT3BlbnMgYSBmaWxlIGRlc2NyaXB0b3IuXG4gICAqIEBwYXJhbSBmZCBUaGUgZmlsZSBkZXNjcmlwdG9yIHRvIG9wZW4uXG4gICAqIEByZXR1cm4gQW4gZXJyb3Igc3RhdHVzIGNvZGUuXG4gICAqL1xuICBvcGVuKF9mZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAvLyBSRUY6IGh0dHBzOi8vZ2l0aHViLmNvbS9kZW5vbGFuZC9kZW5vL2lzc3Vlcy82NTI5XG4gICAgbm90SW1wbGVtZW50ZWQoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBCaW5kIHRvIGFuIElQdjQgYWRkcmVzcy5cbiAgICogQHBhcmFtIGFkZHJlc3MgVGhlIGhvc3RuYW1lIHRvIGJpbmQgdG8uXG4gICAqIEBwYXJhbSBwb3J0IFRoZSBwb3J0IHRvIGJpbmQgdG9cbiAgICogQHJldHVybiBBbiBlcnJvciBzdGF0dXMgY29kZS5cbiAgICovXG4gIGJpbmQoYWRkcmVzczogc3RyaW5nLCBwb3J0OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLiNiaW5kKGFkZHJlc3MsIHBvcnQsIDApO1xuICB9XG5cbiAgLyoqXG4gICAqIEJpbmQgdG8gYW4gSVB2NiBhZGRyZXNzLlxuICAgKiBAcGFyYW0gYWRkcmVzcyBUaGUgaG9zdG5hbWUgdG8gYmluZCB0by5cbiAgICogQHBhcmFtIHBvcnQgVGhlIHBvcnQgdG8gYmluZCB0b1xuICAgKiBAcmV0dXJuIEFuIGVycm9yIHN0YXR1cyBjb2RlLlxuICAgKi9cbiAgYmluZDYoYWRkcmVzczogc3RyaW5nLCBwb3J0OiBudW1iZXIsIGZsYWdzOiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLiNiaW5kKGFkZHJlc3MsIHBvcnQsIGZsYWdzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb25uZWN0IHRvIGFuIElQdjQgYWRkcmVzcy5cbiAgICogQHBhcmFtIHJlcSBBIFRDUENvbm5lY3RXcmFwIGluc3RhbmNlLlxuICAgKiBAcGFyYW0gYWRkcmVzcyBUaGUgaG9zdG5hbWUgdG8gY29ubmVjdCB0by5cbiAgICogQHBhcmFtIHBvcnQgVGhlIHBvcnQgdG8gY29ubmVjdCB0by5cbiAgICogQHJldHVybiBBbiBlcnJvciBzdGF0dXMgY29kZS5cbiAgICovXG4gIGNvbm5lY3QocmVxOiBUQ1BDb25uZWN0V3JhcCwgYWRkcmVzczogc3RyaW5nLCBwb3J0OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLiNjb25uZWN0KHJlcSwgYWRkcmVzcywgcG9ydCk7XG4gIH1cblxuICAvKipcbiAgICogQ29ubmVjdCB0byBhbiBJUHY2IGFkZHJlc3MuXG4gICAqIEBwYXJhbSByZXEgQSBUQ1BDb25uZWN0V3JhcCBpbnN0YW5jZS5cbiAgICogQHBhcmFtIGFkZHJlc3MgVGhlIGhvc3RuYW1lIHRvIGNvbm5lY3QgdG8uXG4gICAqIEBwYXJhbSBwb3J0IFRoZSBwb3J0IHRvIGNvbm5lY3QgdG8uXG4gICAqIEByZXR1cm4gQW4gZXJyb3Igc3RhdHVzIGNvZGUuXG4gICAqL1xuICBjb25uZWN0NihyZXE6IFRDUENvbm5lY3RXcmFwLCBhZGRyZXNzOiBzdHJpbmcsIHBvcnQ6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuI2Nvbm5lY3QocmVxLCBhZGRyZXNzLCBwb3J0KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBMaXN0ZW4gZm9yIG5ldyBjb25uZWN0aW9ucy5cbiAgICogQHBhcmFtIGJhY2tsb2dcbiAgICogQHJldHVybiBBbiBlcnJvciBzdGF0dXMgY29kZS5cbiAgICovXG4gIGxpc3RlbihiYWNrbG9nOiBudW1iZXIpOiBudW1iZXIge1xuICAgIHRoaXMuI2JhY2tsb2cgPSBfY2VpbFBvd09mMihiYWNrbG9nICsgMSk7XG5cbiAgICBjb25zdCBsaXN0ZW5PcHRpb25zID0ge1xuICAgICAgaG9zdG5hbWU6IHRoaXMuI2FkZHJlc3MhLFxuICAgICAgcG9ydDogdGhpcy4jcG9ydCEsXG4gICAgICB0cmFuc3BvcnQ6IFwidGNwXCIgYXMgY29uc3QsXG4gICAgfTtcblxuICAgIGxldCBsaXN0ZW5lcjtcblxuICAgIHRyeSB7XG4gICAgICBsaXN0ZW5lciA9IERlbm8ubGlzdGVuKGxpc3Rlbk9wdGlvbnMpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChlIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuQWRkckluVXNlKSB7XG4gICAgICAgIHJldHVybiBjb2RlTWFwLmdldChcIkVBRERSSU5VU0VcIikhO1xuICAgICAgfSBlbHNlIGlmIChlIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuQWRkck5vdEF2YWlsYWJsZSkge1xuICAgICAgICByZXR1cm4gY29kZU1hcC5nZXQoXCJFQUREUk5PVEFWQUlMXCIpITtcbiAgICAgIH1cblxuICAgICAgLy8gVE9ETyhjbW9ydGVuKTogbWFwIGVycm9ycyB0byBhcHByb3ByaWF0ZSBlcnJvciBjb2Rlcy5cbiAgICAgIHJldHVybiBjb2RlTWFwLmdldChcIlVOS05PV05cIikhO1xuICAgIH1cblxuICAgIGNvbnN0IGFkZHJlc3MgPSBsaXN0ZW5lci5hZGRyIGFzIERlbm8uTmV0QWRkcjtcbiAgICB0aGlzLiNhZGRyZXNzID0gYWRkcmVzcy5ob3N0bmFtZTtcbiAgICB0aGlzLiNwb3J0ID0gYWRkcmVzcy5wb3J0O1xuXG4gICAgdGhpcy4jbGlzdGVuZXIgPSBsaXN0ZW5lcjtcbiAgICB0aGlzLiNhY2NlcHQoKTtcblxuICAgIHJldHVybiAwO1xuICB9XG5cbiAgLyoqXG4gICAqIFBvcHVsYXRlcyB0aGUgcHJvdmlkZWQgb2JqZWN0IHdpdGggbG9jYWwgYWRkcmVzcyBlbnRyaWVzLlxuICAgKiBAcGFyYW0gc29ja25hbWUgQW4gb2JqZWN0IHRvIGFkZCB0aGUgbG9jYWwgYWRkcmVzcyBlbnRyaWVzIHRvLlxuICAgKiBAcmV0dXJuIEFuIGVycm9yIHN0YXR1cyBjb2RlLlxuICAgKi9cbiAgZ2V0c29ja25hbWUoc29ja25hbWU6IFJlY29yZDxzdHJpbmcsIG5ldmVyPiB8IEFkZHJlc3NJbmZvKTogbnVtYmVyIHtcbiAgICBpZiAoXG4gICAgICB0eXBlb2YgdGhpcy4jYWRkcmVzcyA9PT0gXCJ1bmRlZmluZWRcIiB8fCB0eXBlb2YgdGhpcy4jcG9ydCA9PT0gXCJ1bmRlZmluZWRcIlxuICAgICkge1xuICAgICAgcmV0dXJuIGNvZGVNYXAuZ2V0KFwiRUFERFJOT1RBVkFJTFwiKSE7XG4gICAgfVxuXG4gICAgc29ja25hbWUuYWRkcmVzcyA9IHRoaXMuI2FkZHJlc3M7XG4gICAgc29ja25hbWUucG9ydCA9IHRoaXMuI3BvcnQ7XG4gICAgc29ja25hbWUuZmFtaWx5ID0gaXNJUCh0aGlzLiNhZGRyZXNzKSA9PT0gNiA/IFwiSVB2NlwiIDogXCJJUHY0XCI7XG5cbiAgICByZXR1cm4gMDtcbiAgfVxuXG4gIC8qKlxuICAgKiBQb3B1bGF0ZXMgdGhlIHByb3ZpZGVkIG9iamVjdCB3aXRoIHJlbW90ZSBhZGRyZXNzIGVudHJpZXMuXG4gICAqIEBwYXJhbSBwZWVybmFtZSBBbiBvYmplY3QgdG8gYWRkIHRoZSByZW1vdGUgYWRkcmVzcyBlbnRyaWVzIHRvLlxuICAgKiBAcmV0dXJuIEFuIGVycm9yIHN0YXR1cyBjb2RlLlxuICAgKi9cbiAgZ2V0cGVlcm5hbWUocGVlcm5hbWU6IFJlY29yZDxzdHJpbmcsIG5ldmVyPiB8IEFkZHJlc3NJbmZvKTogbnVtYmVyIHtcbiAgICBpZiAoXG4gICAgICB0eXBlb2YgdGhpcy4jcmVtb3RlQWRkcmVzcyA9PT0gXCJ1bmRlZmluZWRcIiB8fFxuICAgICAgdHlwZW9mIHRoaXMuI3JlbW90ZVBvcnQgPT09IFwidW5kZWZpbmVkXCJcbiAgICApIHtcbiAgICAgIHJldHVybiBjb2RlTWFwLmdldChcIkVBRERSTk9UQVZBSUxcIikhO1xuICAgIH1cblxuICAgIHBlZXJuYW1lLmFkZHJlc3MgPSB0aGlzLiNyZW1vdGVBZGRyZXNzO1xuICAgIHBlZXJuYW1lLnBvcnQgPSB0aGlzLiNyZW1vdGVQb3J0O1xuICAgIHBlZXJuYW1lLmZhbWlseSA9IHRoaXMuI3JlbW90ZUZhbWlseTtcblxuICAgIHJldHVybiAwO1xuICB9XG5cbiAgLyoqXG4gICAqIEBwYXJhbSBub0RlbGF5XG4gICAqIEByZXR1cm4gQW4gZXJyb3Igc3RhdHVzIGNvZGUuXG4gICAqL1xuICBzZXROb0RlbGF5KF9ub0RlbGF5OiBib29sZWFuKTogbnVtYmVyIHtcbiAgICAvLyBUT0RPKGJub29yZGh1aXMpIGh0dHBzOi8vZ2l0aHViLmNvbS9kZW5vbGFuZC9kZW5vL3B1bGwvMTMxMDNcbiAgICByZXR1cm4gMDtcbiAgfVxuXG4gIC8qKlxuICAgKiBAcGFyYW0gZW5hYmxlXG4gICAqIEBwYXJhbSBpbml0aWFsRGVsYXlcbiAgICogQHJldHVybiBBbiBlcnJvciBzdGF0dXMgY29kZS5cbiAgICovXG4gIHNldEtlZXBBbGl2ZShfZW5hYmxlOiBib29sZWFuLCBfaW5pdGlhbERlbGF5OiBudW1iZXIpOiBudW1iZXIge1xuICAgIC8vIFRPRE8oYm5vb3JkaHVpcykgaHR0cHM6Ly9naXRodWIuY29tL2Rlbm9sYW5kL2Rlbm8vcHVsbC8xMzEwM1xuICAgIHJldHVybiAwO1xuICB9XG5cbiAgLyoqXG4gICAqIFdpbmRvd3Mgb25seS5cbiAgICpcbiAgICogRGVwcmVjYXRlZCBieSBOb2RlLlxuICAgKiBSRUY6IGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9ibG9iL21hc3Rlci9saWIvbmV0LmpzI0wxNzMxXG4gICAqXG4gICAqIEBwYXJhbSBlbmFibGVcbiAgICogQHJldHVybiBBbiBlcnJvciBzdGF0dXMgY29kZS5cbiAgICogQGRlcHJlY2F0ZWRcbiAgICovXG4gIHNldFNpbXVsdGFuZW91c0FjY2VwdHMoX2VuYWJsZTogYm9vbGVhbikge1xuICAgIC8vIExvdyBwcmlvcml0eSB0byBpbXBsZW1lbnQgb3dpbmcgdG8gaXQgYmVpbmcgZGVwcmVjYXRlZCBpbiBOb2RlLlxuICAgIG5vdEltcGxlbWVudGVkKCk7XG4gIH1cblxuICAvKipcbiAgICogQmluZCB0byBhbiBJUHY0IG9yIElQdjYgYWRkcmVzcy5cbiAgICogQHBhcmFtIGFkZHJlc3MgVGhlIGhvc3RuYW1lIHRvIGJpbmQgdG8uXG4gICAqIEBwYXJhbSBwb3J0IFRoZSBwb3J0IHRvIGJpbmQgdG9cbiAgICogQHBhcmFtIGZsYWdzXG4gICAqIEByZXR1cm4gQW4gZXJyb3Igc3RhdHVzIGNvZGUuXG4gICAqL1xuICAjYmluZChhZGRyZXNzOiBzdHJpbmcsIHBvcnQ6IG51bWJlciwgX2ZsYWdzOiBudW1iZXIpOiBudW1iZXIge1xuICAgIC8vIERlbm8gZG9lc24ndCBjdXJyZW50bHkgc2VwYXJhdGUgYmluZCBmcm9tIGNvbm5lY3QuIEZvciBub3cgd2Ugbm9vcCB1bmRlclxuICAgIC8vIHRoZSBhc3N1bXB0aW9uIHdlIHdpbGwgY29ubmVjdCBzaG9ydGx5LlxuICAgIC8vIFJFRjogaHR0cHM6Ly9kb2MuZGVuby5sYW5kL2J1aWx0aW4vc3RhYmxlI0Rlbm8uY29ubmVjdFxuICAgIC8vXG4gICAgLy8gVGhpcyBhbHNvIG1lYW5zIHdlIHdvbid0IGJlIGNvbm5lY3RpbmcgZnJvbSB0aGUgc3BlY2lmaWVkIGxvY2FsIGFkZHJlc3NcbiAgICAvLyBhbmQgcG9ydCBhcyBwcm92aWRpbmcgdGhlc2UgaXMgbm90IGFuIG9wdGlvbiBpbiBEZW5vLlxuICAgIC8vIFJFRjogaHR0cHM6Ly9kb2MuZGVuby5sYW5kL2J1aWx0aW4vc3RhYmxlI0Rlbm8uQ29ubmVjdE9wdGlvbnNcbiAgICB0aGlzLiNhZGRyZXNzID0gYWRkcmVzcztcbiAgICB0aGlzLiNwb3J0ID0gcG9ydDtcblxuICAgIHJldHVybiAwO1xuICB9XG5cbiAgLyoqXG4gICAqIENvbm5lY3QgdG8gYW4gSVB2NCBvciBJUHY2IGFkZHJlc3MuXG4gICAqIEBwYXJhbSByZXEgQSBUQ1BDb25uZWN0V3JhcCBpbnN0YW5jZS5cbiAgICogQHBhcmFtIGFkZHJlc3MgVGhlIGhvc3RuYW1lIHRvIGNvbm5lY3QgdG8uXG4gICAqIEBwYXJhbSBwb3J0IFRoZSBwb3J0IHRvIGNvbm5lY3QgdG8uXG4gICAqIEByZXR1cm4gQW4gZXJyb3Igc3RhdHVzIGNvZGUuXG4gICAqL1xuICAjY29ubmVjdChyZXE6IFRDUENvbm5lY3RXcmFwLCBhZGRyZXNzOiBzdHJpbmcsIHBvcnQ6IG51bWJlcik6IG51bWJlciB7XG4gICAgdGhpcy4jcmVtb3RlQWRkcmVzcyA9IGFkZHJlc3M7XG4gICAgdGhpcy4jcmVtb3RlUG9ydCA9IHBvcnQ7XG4gICAgdGhpcy4jcmVtb3RlRmFtaWx5ID0gaXNJUChhZGRyZXNzKSA9PT0gNiA/IFwiSVB2NlwiIDogXCJJUHY0XCI7XG5cbiAgICBjb25zdCBjb25uZWN0T3B0aW9uczogRGVuby5Db25uZWN0T3B0aW9ucyA9IHtcbiAgICAgIGhvc3RuYW1lOiBhZGRyZXNzLFxuICAgICAgcG9ydCxcbiAgICAgIHRyYW5zcG9ydDogXCJ0Y3BcIixcbiAgICB9O1xuXG4gICAgRGVuby5jb25uZWN0KGNvbm5lY3RPcHRpb25zKS50aGVuKChjb25uOiBEZW5vLkNvbm4pID0+IHtcbiAgICAgIC8vIEluY29ycmVjdCAvIGJhY2t3YXJkcywgYnV0IGNvcnJlY3RpbmcgdGhlIGxvY2FsIGFkZHJlc3MgYW5kIHBvcnQgd2l0aFxuICAgICAgLy8gd2hhdCB3YXMgYWN0dWFsbHkgdXNlZCBnaXZlbiB3ZSBjYW4ndCBhY3R1YWxseSBzcGVjaWZ5IHRoZXNlIGluIERlbm8uXG4gICAgICBjb25zdCBsb2NhbEFkZHIgPSBjb25uLmxvY2FsQWRkciBhcyBEZW5vLk5ldEFkZHI7XG4gICAgICB0aGlzLiNhZGRyZXNzID0gcmVxLmxvY2FsQWRkcmVzcyA9IGxvY2FsQWRkci5ob3N0bmFtZTtcbiAgICAgIHRoaXMuI3BvcnQgPSByZXEubG9jYWxQb3J0ID0gbG9jYWxBZGRyLnBvcnQ7XG4gICAgICB0aGlzW2tTdHJlYW1CYXNlRmllbGRdID0gY29ubjtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgdGhpcy5hZnRlckNvbm5lY3QocmVxLCAwKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBzd2FsbG93IGNhbGxiYWNrIGVycm9ycy5cbiAgICAgIH1cbiAgICB9LCAoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICAvLyBUT0RPKGNtb3J0ZW4pOiBjb3JyZWN0IG1hcHBpbmcgb2YgY29ubmVjdGlvbiBlcnJvciB0byBzdGF0dXMgY29kZS5cbiAgICAgICAgdGhpcy5hZnRlckNvbm5lY3QocmVxLCBjb2RlTWFwLmdldChcIkVDT05OUkVGVVNFRFwiKSEpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIHN3YWxsb3cgY2FsbGJhY2sgZXJyb3JzLlxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIDA7XG4gIH1cblxuICAvKiogSGFuZGxlIGJhY2tvZmYgZGVsYXlzIGZvbGxvd2luZyBhbiB1bnN1Y2Nlc3NmdWwgYWNjZXB0LiAqL1xuICBhc3luYyAjYWNjZXB0QmFja29mZigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAvLyBCYWNrb2ZmIGFmdGVyIHRyYW5zaWVudCBlcnJvcnMgdG8gYWxsb3cgdGltZSBmb3IgdGhlIHN5c3RlbSB0b1xuICAgIC8vIHJlY292ZXIsIGFuZCBhdm9pZCBibG9ja2luZyB1cCB0aGUgZXZlbnQgbG9vcCB3aXRoIGEgY29udGludW91c2x5XG4gICAgLy8gcnVubmluZyBsb29wLlxuICAgIGlmICghdGhpcy4jYWNjZXB0QmFja29mZkRlbGF5KSB7XG4gICAgICB0aGlzLiNhY2NlcHRCYWNrb2ZmRGVsYXkgPSBJTklUSUFMX0FDQ0VQVF9CQUNLT0ZGX0RFTEFZO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLiNhY2NlcHRCYWNrb2ZmRGVsYXkgKj0gMjtcbiAgICB9XG5cbiAgICBpZiAodGhpcy4jYWNjZXB0QmFja29mZkRlbGF5ID49IE1BWF9BQ0NFUFRfQkFDS09GRl9ERUxBWSkge1xuICAgICAgdGhpcy4jYWNjZXB0QmFja29mZkRlbGF5ID0gTUFYX0FDQ0VQVF9CQUNLT0ZGX0RFTEFZO1xuICAgIH1cblxuICAgIGF3YWl0IGRlbGF5KHRoaXMuI2FjY2VwdEJhY2tvZmZEZWxheSk7XG5cbiAgICB0aGlzLiNhY2NlcHQoKTtcbiAgfVxuXG4gIC8qKiBBY2NlcHQgbmV3IGNvbm5lY3Rpb25zLiAqL1xuICBhc3luYyAjYWNjZXB0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLiNjbG9zZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodGhpcy4jY29ubmVjdGlvbnMgPiB0aGlzLiNiYWNrbG9nISkge1xuICAgICAgdGhpcy4jYWNjZXB0QmFja29mZigpO1xuXG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IGNvbm5lY3Rpb246IERlbm8uQ29ubjtcblxuICAgIHRyeSB7XG4gICAgICBjb25uZWN0aW9uID0gYXdhaXQgdGhpcy4jbGlzdGVuZXIuYWNjZXB0KCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGUgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5CYWRSZXNvdXJjZSAmJiB0aGlzLiNjbG9zZWQpIHtcbiAgICAgICAgLy8gTGlzdGVuZXIgYW5kIHNlcnZlciBoYXMgY2xvc2VkLlxuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIFRPRE8oY21vcnRlbik6IG1hcCBlcnJvcnMgdG8gYXBwcm9wcmlhdGUgZXJyb3IgY29kZXMuXG4gICAgICAgIHRoaXMub25jb25uZWN0aW9uIShjb2RlTWFwLmdldChcIlVOS05PV05cIikhLCB1bmRlZmluZWQpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIHN3YWxsb3cgY2FsbGJhY2sgZXJyb3JzLlxuICAgICAgfVxuXG4gICAgICB0aGlzLiNhY2NlcHRCYWNrb2ZmKCk7XG5cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBSZXNldCB0aGUgYmFja29mZiBkZWxheSB1cG9uIHN1Y2Nlc3NmdWwgYWNjZXB0LlxuICAgIHRoaXMuI2FjY2VwdEJhY2tvZmZEZWxheSA9IHVuZGVmaW5lZDtcblxuICAgIGNvbnN0IGNvbm5lY3Rpb25IYW5kbGUgPSBuZXcgVENQKHNvY2tldFR5cGUuU09DS0VULCBjb25uZWN0aW9uKTtcbiAgICB0aGlzLiNjb25uZWN0aW9ucysrO1xuXG4gICAgdHJ5IHtcbiAgICAgIHRoaXMub25jb25uZWN0aW9uISgwLCBjb25uZWN0aW9uSGFuZGxlKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIHN3YWxsb3cgY2FsbGJhY2sgZXJyb3JzLlxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLiNhY2NlcHQoKTtcbiAgfVxuXG4gIC8qKiBIYW5kbGUgc2VydmVyIGNsb3N1cmUuICovXG4gIG92ZXJyaWRlIGFzeW5jIF9vbkNsb3NlKCk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgLy8gVE9ETyhjbW9ydGVuKTogdGhpcyBpc24ndCBncmVhdFxuICAgIHRoaXMuI2Nsb3NlZCA9IHRydWU7XG4gICAgdGhpcy5yZWFkaW5nID0gZmFsc2U7XG5cbiAgICB0aGlzLiNhZGRyZXNzID0gdW5kZWZpbmVkO1xuICAgIHRoaXMuI3BvcnQgPSB1bmRlZmluZWQ7XG5cbiAgICB0aGlzLiNyZW1vdGVBZGRyZXNzID0gdW5kZWZpbmVkO1xuICAgIHRoaXMuI3JlbW90ZUZhbWlseSA9IHVuZGVmaW5lZDtcbiAgICB0aGlzLiNyZW1vdGVQb3J0ID0gdW5kZWZpbmVkO1xuXG4gICAgdGhpcy4jYmFja2xvZyA9IHVuZGVmaW5lZDtcbiAgICB0aGlzLiNjb25uZWN0aW9ucyA9IDA7XG4gICAgdGhpcy4jYWNjZXB0QmFja29mZkRlbGF5ID0gdW5kZWZpbmVkO1xuXG4gICAgaWYgKHRoaXMucHJvdmlkZXIgPT09IHByb3ZpZGVyVHlwZS5UQ1BTRVJWRVJXUkFQKSB7XG4gICAgICB0cnkge1xuICAgICAgICB0aGlzLiNsaXN0ZW5lci5jbG9zZSgpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIGxpc3RlbmVyIGFscmVhZHkgY2xvc2VkXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGF3YWl0IExpYnV2U3RyZWFtV3JhcC5wcm90b3R5cGUuX29uQ2xvc2UuY2FsbCh0aGlzKTtcbiAgfVxufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRSxzREFBc0Q7QUFDdEQsRUFBRTtBQUNGLDBFQUEwRTtBQUMxRSxnRUFBZ0U7QUFDaEUsc0VBQXNFO0FBQ3RFLHNFQUFzRTtBQUN0RSw0RUFBNEU7QUFDNUUscUVBQXFFO0FBQ3JFLHdCQUF3QjtBQUN4QixFQUFFO0FBQ0YsMEVBQTBFO0FBQzFFLHlEQUF5RDtBQUN6RCxFQUFFO0FBQ0YsMEVBQTBFO0FBQzFFLDZEQUE2RDtBQUM3RCw0RUFBNEU7QUFDNUUsMkVBQTJFO0FBQzNFLHdFQUF3RTtBQUN4RSw0RUFBNEU7QUFDNUUseUNBQXlDO0FBRXpDLHFCQUFxQjtBQUNyQiwrREFBK0Q7QUFDL0QsOERBQThEO0FBRTlELFNBQVMsY0FBYyxRQUFRLGVBQWU7QUFDOUMsU0FBUyxXQUFXLFFBQVEsMkJBQTJCO0FBQ3ZELFNBQVMsY0FBYyxRQUFRLHVCQUF1QjtBQUN0RCxTQUFTLFNBQVMsRUFBRSxZQUFZLFFBQVEsa0JBQWtCO0FBQzFELFNBQVMsZUFBZSxRQUFRLG1CQUFtQjtBQUNuRCxTQUFTLFdBQVcsUUFBUSxlQUFlO0FBQzNDLFNBQVMsT0FBTyxRQUFRLFVBQVU7QUFDbEMsU0FBUyxLQUFLLFFBQVEscUJBQXFCO0FBQzNDLFNBQVMsZ0JBQWdCLFFBQVEsbUJBQW1CO0FBQ3BELFNBQVMsSUFBSSxRQUFRLHFCQUFxQjtJQUUxQyw0QkFBNEIsR0FDNUI7VUFBSyxVQUFVO0VBQVYsV0FBQSxXQUNILFlBQUEsS0FBQTtFQURHLFdBQUEsV0FFSCxZQUFBLEtBQUE7R0FGRyxlQUFBO0FBV0wsdUVBQXVFLEdBQ3ZFLE1BQU0sK0JBQStCO0FBRXJDLGtFQUFrRSxHQUNsRSxNQUFNLDJCQUEy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