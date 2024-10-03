// Copyright 2018-2024 the Deno authors. All rights reserved. MIT license.
import { delay } from "../async/delay.ts";
/** Thrown by Server after it has been closed. */ const ERROR_SERVER_CLOSED = "Server closed";
/** Default port for serving HTTP. */ const HTTP_PORT = 80;
/** Default port for serving HTTPS. */ const HTTPS_PORT = 443;
/** Initial backoff delay of 5ms following a temporary accept failure. */ const INITIAL_ACCEPT_BACKOFF_DELAY = 5;
/** Max backoff delay of 1s following a temporary accept failure. */ const MAX_ACCEPT_BACKOFF_DELAY = 1000;
/**
 * Used to construct an HTTP server.
 *
 * @deprecated (will be removed after 1.0.0) Use {@linkcode Deno.serve} instead.
 */ export class Server {
  #port;
  #host;
  #handler;
  #closed = false;
  #listeners = new Set();
  #acceptBackoffDelayAbortController = new AbortController();
  #httpConnections = new Set();
  #onError;
  /**
   * Constructs a new HTTP Server instance.
   *
   * ```ts
   * import { Server } from "https://deno.land/std@$STD_VERSION/http/server.ts";
   *
   * const port = 4505;
   * const handler = (request: Request) => {
   *   const body = `Your user-agent is:\n\n${request.headers.get(
   *    "user-agent",
   *   ) ?? "Unknown"}`;
   *
   *   return new Response(body, { status: 200 });
   * };
   *
   * const server = new Server({ port, handler });
   * ```
   *
   * @param serverInit Options for running an HTTP server.
   */ constructor(serverInit){
    this.#port = serverInit.port;
    this.#host = serverInit.hostname;
    this.#handler = serverInit.handler;
    this.#onError = serverInit.onError ?? function(error) {
      console.error(error);
      return new Response("Internal Server Error", {
        status: 500
      });
    };
  }
  /**
   * Accept incoming connections on the given listener, and handle requests on
   * these connections with the given handler.
   *
   * HTTP/2 support is only enabled if the provided Deno.Listener returns TLS
   * connections and was configured with "h2" in the ALPN protocols.
   *
   * Throws a server closed error if called after the server has been closed.
   *
   * Will always close the created listener.
   *
   * ```ts
   * import { Server } from "https://deno.land/std@$STD_VERSION/http/server.ts";
   *
   * const handler = (request: Request) => {
   *   const body = `Your user-agent is:\n\n${request.headers.get(
   *    "user-agent",
   *   ) ?? "Unknown"}`;
   *
   *   return new Response(body, { status: 200 });
   * };
   *
   * const server = new Server({ handler });
   * const listener = Deno.listen({ port: 4505 });
   *
   * console.log("server listening on http://localhost:4505");
   *
   * await server.serve(listener);
   * ```
   *
   * @param listener The listener to accept connections from.
   */ async serve(listener) {
    if (this.#closed) {
      throw new Deno.errors.Http(ERROR_SERVER_CLOSED);
    }
    this.#trackListener(listener);
    try {
      return await this.#accept(listener);
    } finally{
      this.#untrackListener(listener);
      try {
        listener.close();
      } catch  {
      // Listener has already been closed.
      }
    }
  }
  /**
   * Create a listener on the server, accept incoming connections, and handle
   * requests on these connections with the given handler.
   *
   * If the server was constructed without a specified port, 80 is used.
   *
   * If the server was constructed with the hostname omitted from the options, the
   * non-routable meta-address `0.0.0.0` is used.
   *
   * Throws a server closed error if the server has been closed.
   *
   * ```ts
   * import { Server } from "https://deno.land/std@$STD_VERSION/http/server.ts";
   *
   * const port = 4505;
   * const handler = (request: Request) => {
   *   const body = `Your user-agent is:\n\n${request.headers.get(
   *    "user-agent",
   *   ) ?? "Unknown"}`;
   *
   *   return new Response(body, { status: 200 });
   * };
   *
   * const server = new Server({ port, handler });
   *
   * console.log("server listening on http://localhost:4505");
   *
   * await server.listenAndServe();
   * ```
   */ async listenAndServe() {
    if (this.#closed) {
      throw new Deno.errors.Http(ERROR_SERVER_CLOSED);
    }
    const listener = Deno.listen({
      port: this.#port ?? HTTP_PORT,
      hostname: this.#host ?? "0.0.0.0",
      transport: "tcp"
    });
    return await this.serve(listener);
  }
  /**
   * Create a listener on the server, accept incoming connections, upgrade them
   * to TLS, and handle requests on these connections with the given handler.
   *
   * If the server was constructed without a specified port, 443 is used.
   *
   * If the server was constructed with the hostname omitted from the options, the
   * non-routable meta-address `0.0.0.0` is used.
   *
   * Throws a server closed error if the server has been closed.
   *
   * ```ts
   * import { Server } from "https://deno.land/std@$STD_VERSION/http/server.ts";
   *
   * const port = 4505;
   * const handler = (request: Request) => {
   *   const body = `Your user-agent is:\n\n${request.headers.get(
   *    "user-agent",
   *   ) ?? "Unknown"}`;
   *
   *   return new Response(body, { status: 200 });
   * };
   *
   * const server = new Server({ port, handler });
   *
   * const certFile = "/path/to/certFile.crt";
   * const keyFile = "/path/to/keyFile.key";
   *
   * console.log("server listening on https://localhost:4505");
   *
   * await server.listenAndServeTls(certFile, keyFile);
   * ```
   *
   * @param certFile The path to the file containing the TLS certificate.
   * @param keyFile The path to the file containing the TLS private key.
   */ async listenAndServeTls(certFile, keyFile) {
    if (this.#closed) {
      throw new Deno.errors.Http(ERROR_SERVER_CLOSED);
    }
    const listener = Deno.listenTls({
      port: this.#port ?? HTTPS_PORT,
      hostname: this.#host ?? "0.0.0.0",
      cert: Deno.readTextFileSync(certFile),
      key: Deno.readTextFileSync(keyFile),
      transport: "tcp"
    });
    return await this.serve(listener);
  }
  /**
   * Immediately close the server listeners and associated HTTP connections.
   *
   * Throws a server closed error if called after the server has been closed.
   */ close() {
    if (this.#closed) {
      throw new Deno.errors.Http(ERROR_SERVER_CLOSED);
    }
    this.#closed = true;
    for (const listener of this.#listeners){
      try {
        listener.close();
      } catch  {
      // Listener has already been closed.
      }
    }
    this.#listeners.clear();
    this.#acceptBackoffDelayAbortController.abort();
    for (const httpConn of this.#httpConnections){
      this.#closeHttpConn(httpConn);
    }
    this.#httpConnections.clear();
  }
  /** Get whether the server is closed. */ get closed() {
    return this.#closed;
  }
  /** Get the list of network addresses the server is listening on. */ get addrs() {
    return Array.from(this.#listeners).map((listener)=>listener.addr);
  }
  /**
   * Responds to an HTTP request.
   *
   * @param requestEvent The HTTP request to respond to.
   * @param connInfo Information about the underlying connection.
   */ async #respond(requestEvent, connInfo) {
    let response;
    try {
      // Handle the request event, generating a response.
      response = await this.#handler(requestEvent.request, connInfo);
      if (response.bodyUsed && response.body !== null) {
        throw new TypeError("Response body already consumed.");
      }
    } catch (error) {
      // Invoke onError handler when request handler throws.
      response = await this.#onError(error);
    }
    try {
      // Send the response.
      await requestEvent.respondWith(response);
    } catch  {
    // `respondWith()` can throw for various reasons, including downstream and
    // upstream connection errors, as well as errors thrown during streaming
    // of the response content.  In order to avoid false negatives, we ignore
    // the error here and let `serveHttp` close the connection on the
    // following iteration if it is in fact a downstream connection error.
    }
  }
  /**
   * Serves all HTTP requests on a single connection.
   *
   * @param httpConn The HTTP connection to yield requests from.
   * @param connInfo Information about the underlying connection.
   */ async #serveHttp(httpConn, connInfo) {
    while(!this.#closed){
      let requestEvent;
      try {
        // Yield the new HTTP request on the connection.
        requestEvent = await httpConn.nextRequest();
      } catch  {
        break;
      }
      if (requestEvent === null) {
        break;
      }
      // Respond to the request. Note we do not await this async method to
      // allow the connection to handle multiple requests in the case of h2.
      this.#respond(requestEvent, connInfo);
    }
    this.#closeHttpConn(httpConn);
  }
  /**
   * Accepts all connections on a single network listener.
   *
   * @param listener The listener to accept connections from.
   */ async #accept(listener) {
    let acceptBackoffDelay;
    while(!this.#closed){
      let conn;
      try {
        // Wait for a new connection.
        conn = await listener.accept();
      } catch (error) {
        if (// The listener is closed.
        error instanceof Deno.errors.BadResource || // TLS handshake errors.
        error instanceof Deno.errors.InvalidData || error instanceof Deno.errors.UnexpectedEof || error instanceof Deno.errors.ConnectionReset || error instanceof Deno.errors.NotConnected) {
          // Backoff after transient errors to allow time for the system to
          // recover, and avoid blocking up the event loop with a continuously
          // running loop.
          if (!acceptBackoffDelay) {
            acceptBackoffDelay = INITIAL_ACCEPT_BACKOFF_DELAY;
          } else {
            acceptBackoffDelay *= 2;
          }
          if (acceptBackoffDelay >= MAX_ACCEPT_BACKOFF_DELAY) {
            acceptBackoffDelay = MAX_ACCEPT_BACKOFF_DELAY;
          }
          try {
            await delay(acceptBackoffDelay, {
              signal: this.#acceptBackoffDelayAbortController.signal
            });
          } catch (err) {
            // The backoff delay timer is aborted when closing the server.
            if (!(err instanceof DOMException && err.name === "AbortError")) {
              throw err;
            }
          }
          continue;
        }
        throw error;
      }
      acceptBackoffDelay = undefined;
      // "Upgrade" the network connection into an HTTP connection.
      let httpConn;
      try {
        // deno-lint-ignore no-deprecated-deno-api
        httpConn = Deno.serveHttp(conn);
      } catch  {
        continue;
      }
      // Closing the underlying listener will not close HTTP connections, so we
      // track for closure upon server close.
      this.#trackHttpConnection(httpConn);
      const connInfo = {
        localAddr: conn.localAddr,
        remoteAddr: conn.remoteAddr
      };
      // Serve the requests that arrive on the just-accepted connection. Note
      // we do not await this async method to allow the server to accept new
      // connections.
      this.#serveHttp(httpConn, connInfo);
    }
  }
  /**
   * Untracks and closes an HTTP connection.
   *
   * @param httpConn The HTTP connection to close.
   */ #closeHttpConn(httpConn) {
    this.#untrackHttpConnection(httpConn);
    try {
      httpConn.close();
    } catch  {
    // Connection has already been closed.
    }
  }
  /**
   * Adds the listener to the internal tracking list.
   *
   * @param listener Listener to track.
   */ #trackListener(listener) {
    this.#listeners.add(listener);
  }
  /**
   * Removes the listener from the internal tracking list.
   *
   * @param listener Listener to untrack.
   */ #untrackListener(listener) {
    this.#listeners.delete(listener);
  }
  /**
   * Adds the HTTP connection to the internal tracking list.
   *
   * @param httpConn HTTP connection to track.
   */ #trackHttpConnection(httpConn) {
    this.#httpConnections.add(httpConn);
  }
  /**
   * Removes the HTTP connection from the internal tracking list.
   *
   * @param httpConn HTTP connection to untrack.
   */ #untrackHttpConnection(httpConn) {
    this.#httpConnections.delete(httpConn);
  }
}
/**
 * Constructs a server, accepts incoming connections on the given listener, and
 * handles requests on these connections with the given handler.
 *
 * ```ts
 * import { serveListener } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 *
 * const listener = Deno.listen({ port: 4505 });
 *
 * console.log("server listening on http://localhost:4505");
 *
 * await serveListener(listener, (request) => {
 *   const body = `Your user-agent is:\n\n${request.headers.get(
 *     "user-agent",
 *   ) ?? "Unknown"}`;
 *
 *   return new Response(body, { status: 200 });
 * });
 * ```
 *
 * @param listener The listener to accept connections from.
 * @param handler The handler for individual HTTP requests.
 * @param options Optional serve options.
 *
 * @deprecated (will be removed after 1.0.0) Use {@linkcode Deno.serve} instead.
 */ export async function serveListener(listener, handler, options) {
  const server = new Server({
    handler,
    onError: options?.onError
  });
  options?.signal?.addEventListener("abort", ()=>server.close(), {
    once: true
  });
  return await server.serve(listener);
}
function hostnameForDisplay(hostname) {
  // If the hostname is "0.0.0.0", we display "localhost" in console
  // because browsers in Windows don't resolve "0.0.0.0".
  // See the discussion in https://github.com/denoland/deno_std/issues/1165
  return hostname === "0.0.0.0" ? "localhost" : hostname;
}
/**
 * Serves HTTP requests with the given handler.
 *
 * You can specify an object with a port and hostname option, which is the
 * address to listen on. The default is port 8000 on hostname "0.0.0.0".
 *
 * The below example serves with the port 8000.
 *
 * ```ts
 * import { serve } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * serve((_req) => new Response("Hello, world"));
 * ```
 *
 * You can change the listening address by the `hostname` and `port` options.
 * The below example serves with the port 3000.
 *
 * ```ts
 * import { serve } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * serve((_req) => new Response("Hello, world"), { port: 3000 });
 * ```
 *
 * `serve` function prints the message `Listening on http://<hostname>:<port>/`
 * on start-up by default. If you like to change this message, you can specify
 * `onListen` option to override it.
 *
 * ```ts
 * import { serve } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * serve((_req) => new Response("Hello, world"), {
 *   onListen({ port, hostname }) {
 *     console.log(`Server started at http://${hostname}:${port}`);
 *     // ... more info specific to your server ..
 *   },
 * });
 * ```
 *
 * You can also specify `undefined` or `null` to stop the logging behavior.
 *
 * ```ts
 * import { serve } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * serve((_req) => new Response("Hello, world"), { onListen: undefined });
 * ```
 *
 * @param handler The handler for individual HTTP requests.
 * @param options The options. See `ServeInit` documentation for details.
 *
 * @deprecated (will be removed after 1.0.0) Use {@linkcode Deno.serve} instead.
 */ export async function serve(handler, options = {}) {
  let port = options.port ?? 8000;
  if (typeof port !== "number") {
    port = Number(port);
  }
  const hostname = options.hostname ?? "0.0.0.0";
  const server = new Server({
    port,
    hostname,
    handler,
    onError: options.onError
  });
  options?.signal?.addEventListener("abort", ()=>server.close(), {
    once: true
  });
  const listener = Deno.listen({
    port,
    hostname,
    transport: "tcp"
  });
  const s = server.serve(listener);
  port = server.addrs[0].port;
  if ("onListen" in options) {
    options.onListen?.({
      port,
      hostname
    });
  } else {
    console.log(`Listening on http://${hostnameForDisplay(hostname)}:${port}/`);
  }
  return await s;
}
/**
 * Serves HTTPS requests with the given handler.
 *
 * You must specify `key` or `keyFile` and `cert` or `certFile` options.
 *
 * You can specify an object with a port and hostname option, which is the
 * address to listen on. The default is port 8443 on hostname "0.0.0.0".
 *
 * The below example serves with the default port 8443.
 *
 * ```ts
 * import { serveTls } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 *
 * const cert = "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n";
 * const key = "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n";
 * serveTls((_req) => new Response("Hello, world"), { cert, key });
 *
 * // Or
 *
 * const certFile = "/path/to/certFile.crt";
 * const keyFile = "/path/to/keyFile.key";
 * serveTls((_req) => new Response("Hello, world"), { certFile, keyFile });
 * ```
 *
 * `serveTls` function prints the message `Listening on https://<hostname>:<port>/`
 * on start-up by default. If you like to change this message, you can specify
 * `onListen` option to override it.
 *
 * ```ts
 * import { serveTls } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * const certFile = "/path/to/certFile.crt";
 * const keyFile = "/path/to/keyFile.key";
 * serveTls((_req) => new Response("Hello, world"), {
 *   certFile,
 *   keyFile,
 *   onListen({ port, hostname }) {
 *     console.log(`Server started at https://${hostname}:${port}`);
 *     // ... more info specific to your server ..
 *   },
 * });
 * ```
 *
 * You can also specify `undefined` or `null` to stop the logging behavior.
 *
 * ```ts
 * import { serveTls } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * const certFile = "/path/to/certFile.crt";
 * const keyFile = "/path/to/keyFile.key";
 * serveTls((_req) => new Response("Hello, world"), {
 *   certFile,
 *   keyFile,
 *   onListen: undefined,
 * });
 * ```
 *
 * @param handler The handler for individual HTTPS requests.
 * @param options The options. See `ServeTlsInit` documentation for details.
 * @returns
 *
 * @deprecated (will be removed after 1.0.0) Use {@linkcode Deno.serve} instead.
 */ export async function serveTls(handler, options) {
  if (!options.key && !options.keyFile) {
    throw new Error("TLS config is given, but 'key' is missing.");
  }
  if (!options.cert && !options.certFile) {
    throw new Error("TLS config is given, but 'cert' is missing.");
  }
  let port = options.port ?? 8443;
  if (typeof port !== "number") {
    port = Number(port);
  }
  const hostname = options.hostname ?? "0.0.0.0";
  const server = new Server({
    port,
    hostname,
    handler,
    onError: options.onError
  });
  options?.signal?.addEventListener("abort", ()=>server.close(), {
    once: true
  });
  // deno-lint-ignore no-sync-fn-in-async-fn
  const key = options.key || Deno.readTextFileSync(options.keyFile);
  // deno-lint-ignore no-sync-fn-in-async-fn
  const cert = options.cert || Deno.readTextFileSync(options.certFile);
  const listener = Deno.listenTls({
    port,
    hostname,
    cert,
    key,
    transport: "tcp"
  });
  const s = server.serve(listener);
  port = server.addrs[0].port;
  if ("onListen" in options) {
    options.onListen?.({
      port,
      hostname
    });
  } else {
    console.log(`Listening on https://${hostnameForDisplay(hostname)}:${port}/`);
  }
  return await s;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjIyMi4xL2h0dHAvc2VydmVyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjQgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5pbXBvcnQgeyBkZWxheSB9IGZyb20gXCIuLi9hc3luYy9kZWxheS50c1wiO1xuXG4vKiogVGhyb3duIGJ5IFNlcnZlciBhZnRlciBpdCBoYXMgYmVlbiBjbG9zZWQuICovXG5jb25zdCBFUlJPUl9TRVJWRVJfQ0xPU0VEID0gXCJTZXJ2ZXIgY2xvc2VkXCI7XG5cbi8qKiBEZWZhdWx0IHBvcnQgZm9yIHNlcnZpbmcgSFRUUC4gKi9cbmNvbnN0IEhUVFBfUE9SVCA9IDgwO1xuXG4vKiogRGVmYXVsdCBwb3J0IGZvciBzZXJ2aW5nIEhUVFBTLiAqL1xuY29uc3QgSFRUUFNfUE9SVCA9IDQ0MztcblxuLyoqIEluaXRpYWwgYmFja29mZiBkZWxheSBvZiA1bXMgZm9sbG93aW5nIGEgdGVtcG9yYXJ5IGFjY2VwdCBmYWlsdXJlLiAqL1xuY29uc3QgSU5JVElBTF9BQ0NFUFRfQkFDS09GRl9ERUxBWSA9IDU7XG5cbi8qKiBNYXggYmFja29mZiBkZWxheSBvZiAxcyBmb2xsb3dpbmcgYSB0ZW1wb3JhcnkgYWNjZXB0IGZhaWx1cmUuICovXG5jb25zdCBNQVhfQUNDRVBUX0JBQ0tPRkZfREVMQVkgPSAxMDAwO1xuXG4vKipcbiAqIEluZm9ybWF0aW9uIGFib3V0IHRoZSBjb25uZWN0aW9uIGEgcmVxdWVzdCBhcnJpdmVkIG9uLlxuICpcbiAqIEBkZXByZWNhdGVkICh3aWxsIGJlIHJlbW92ZWQgYWZ0ZXIgMS4wLjApIFVzZSB7QGxpbmtjb2RlIERlbm8uU2VydmVIYW5kbGVySW5mb30gaW5zdGVhZC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBDb25uSW5mbyB7XG4gIC8qKiBUaGUgbG9jYWwgYWRkcmVzcyBvZiB0aGUgY29ubmVjdGlvbi4gKi9cbiAgcmVhZG9ubHkgbG9jYWxBZGRyOiBEZW5vLkFkZHI7XG4gIC8qKiBUaGUgcmVtb3RlIGFkZHJlc3Mgb2YgdGhlIGNvbm5lY3Rpb24uICovXG4gIHJlYWRvbmx5IHJlbW90ZUFkZHI6IERlbm8uQWRkcjtcbn1cblxuLyoqXG4gKiBBIGhhbmRsZXIgZm9yIEhUVFAgcmVxdWVzdHMuIENvbnN1bWVzIGEgcmVxdWVzdCBhbmQgY29ubmVjdGlvbiBpbmZvcm1hdGlvblxuICogYW5kIHJldHVybnMgYSByZXNwb25zZS5cbiAqXG4gKiBJZiBhIGhhbmRsZXIgdGhyb3dzLCB0aGUgc2VydmVyIGNhbGxpbmcgdGhlIGhhbmRsZXIgd2lsbCBhc3N1bWUgdGhlIGltcGFjdFxuICogb2YgdGhlIGVycm9yIGlzIGlzb2xhdGVkIHRvIHRoZSBpbmRpdmlkdWFsIHJlcXVlc3QuIEl0IHdpbGwgY2F0Y2ggdGhlIGVycm9yXG4gKiBhbmQgY2xvc2UgdGhlIHVuZGVybHlpbmcgY29ubmVjdGlvbi5cbiAqXG4gKiBAZGVwcmVjYXRlZCAod2lsbCBiZSByZW1vdmVkIGFmdGVyIDEuMC4wKSBVc2Uge0BsaW5rY29kZSBEZW5vLlNlcnZlSGFuZGxlcn0gaW5zdGVhZC5cbiAqL1xuZXhwb3J0IHR5cGUgSGFuZGxlciA9IChcbiAgcmVxdWVzdDogUmVxdWVzdCxcbiAgY29ubkluZm86IENvbm5JbmZvLFxuKSA9PiBSZXNwb25zZSB8IFByb21pc2U8UmVzcG9uc2U+O1xuXG4vKipcbiAqIE9wdGlvbnMgZm9yIHJ1bm5pbmcgYW4gSFRUUCBzZXJ2ZXIuXG4gKlxuICogQGRlcHJlY2F0ZWQgKHdpbGwgYmUgcmVtb3ZlZCBhZnRlciAxLjAuMCkgVXNlIHtAbGlua2NvZGUgRGVuby5TZXJ2ZUluaXR9IGluc3RlYWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmVySW5pdCBleHRlbmRzIFBhcnRpYWw8RGVuby5MaXN0ZW5PcHRpb25zPiB7XG4gIC8qKiBUaGUgaGFuZGxlciB0byBpbnZva2UgZm9yIGluZGl2aWR1YWwgSFRUUCByZXF1ZXN0cy4gKi9cbiAgaGFuZGxlcjogSGFuZGxlcjtcblxuICAvKipcbiAgICogVGhlIGhhbmRsZXIgdG8gaW52b2tlIHdoZW4gcm91dGUgaGFuZGxlcnMgdGhyb3cgYW4gZXJyb3IuXG4gICAqXG4gICAqIFRoZSBkZWZhdWx0IGVycm9yIGhhbmRsZXIgbG9ncyBhbmQgcmV0dXJucyB0aGUgZXJyb3IgaW4gSlNPTiBmb3JtYXQuXG4gICAqL1xuICBvbkVycm9yPzogKGVycm9yOiB1bmtub3duKSA9PiBSZXNwb25zZSB8IFByb21pc2U8UmVzcG9uc2U+O1xufVxuXG4vKipcbiAqIFVzZWQgdG8gY29uc3RydWN0IGFuIEhUVFAgc2VydmVyLlxuICpcbiAqIEBkZXByZWNhdGVkICh3aWxsIGJlIHJlbW92ZWQgYWZ0ZXIgMS4wLjApIFVzZSB7QGxpbmtjb2RlIERlbm8uc2VydmV9IGluc3RlYWQuXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXJ2ZXIge1xuICAjcG9ydD86IG51bWJlcjtcbiAgI2hvc3Q/OiBzdHJpbmc7XG4gICNoYW5kbGVyOiBIYW5kbGVyO1xuICAjY2xvc2VkID0gZmFsc2U7XG4gICNsaXN0ZW5lcnM6IFNldDxEZW5vLkxpc3RlbmVyPiA9IG5ldyBTZXQoKTtcbiAgI2FjY2VwdEJhY2tvZmZEZWxheUFib3J0Q29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgI2h0dHBDb25uZWN0aW9uczogU2V0PERlbm8uSHR0cENvbm4+ID0gbmV3IFNldCgpO1xuICAjb25FcnJvcjogKGVycm9yOiB1bmtub3duKSA9PiBSZXNwb25zZSB8IFByb21pc2U8UmVzcG9uc2U+O1xuXG4gIC8qKlxuICAgKiBDb25zdHJ1Y3RzIGEgbmV3IEhUVFAgU2VydmVyIGluc3RhbmNlLlxuICAgKlxuICAgKiBgYGB0c1xuICAgKiBpbXBvcnQgeyBTZXJ2ZXIgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL3NlcnZlci50c1wiO1xuICAgKlxuICAgKiBjb25zdCBwb3J0ID0gNDUwNTtcbiAgICogY29uc3QgaGFuZGxlciA9IChyZXF1ZXN0OiBSZXF1ZXN0KSA9PiB7XG4gICAqICAgY29uc3QgYm9keSA9IGBZb3VyIHVzZXItYWdlbnQgaXM6XFxuXFxuJHtyZXF1ZXN0LmhlYWRlcnMuZ2V0KFxuICAgKiAgICBcInVzZXItYWdlbnRcIixcbiAgICogICApID8/IFwiVW5rbm93blwifWA7XG4gICAqXG4gICAqICAgcmV0dXJuIG5ldyBSZXNwb25zZShib2R5LCB7IHN0YXR1czogMjAwIH0pO1xuICAgKiB9O1xuICAgKlxuICAgKiBjb25zdCBzZXJ2ZXIgPSBuZXcgU2VydmVyKHsgcG9ydCwgaGFuZGxlciB9KTtcbiAgICogYGBgXG4gICAqXG4gICAqIEBwYXJhbSBzZXJ2ZXJJbml0IE9wdGlvbnMgZm9yIHJ1bm5pbmcgYW4gSFRUUCBzZXJ2ZXIuXG4gICAqL1xuICBjb25zdHJ1Y3RvcihzZXJ2ZXJJbml0OiBTZXJ2ZXJJbml0KSB7XG4gICAgdGhpcy4jcG9ydCA9IHNlcnZlckluaXQucG9ydDtcbiAgICB0aGlzLiNob3N0ID0gc2VydmVySW5pdC5ob3N0bmFtZTtcbiAgICB0aGlzLiNoYW5kbGVyID0gc2VydmVySW5pdC5oYW5kbGVyO1xuICAgIHRoaXMuI29uRXJyb3IgPSBzZXJ2ZXJJbml0Lm9uRXJyb3IgPz9cbiAgICAgIGZ1bmN0aW9uIChlcnJvcjogdW5rbm93bikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShcIkludGVybmFsIFNlcnZlciBFcnJvclwiLCB7IHN0YXR1czogNTAwIH0pO1xuICAgICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBY2NlcHQgaW5jb21pbmcgY29ubmVjdGlvbnMgb24gdGhlIGdpdmVuIGxpc3RlbmVyLCBhbmQgaGFuZGxlIHJlcXVlc3RzIG9uXG4gICAqIHRoZXNlIGNvbm5lY3Rpb25zIHdpdGggdGhlIGdpdmVuIGhhbmRsZXIuXG4gICAqXG4gICAqIEhUVFAvMiBzdXBwb3J0IGlzIG9ubHkgZW5hYmxlZCBpZiB0aGUgcHJvdmlkZWQgRGVuby5MaXN0ZW5lciByZXR1cm5zIFRMU1xuICAgKiBjb25uZWN0aW9ucyBhbmQgd2FzIGNvbmZpZ3VyZWQgd2l0aCBcImgyXCIgaW4gdGhlIEFMUE4gcHJvdG9jb2xzLlxuICAgKlxuICAgKiBUaHJvd3MgYSBzZXJ2ZXIgY2xvc2VkIGVycm9yIGlmIGNhbGxlZCBhZnRlciB0aGUgc2VydmVyIGhhcyBiZWVuIGNsb3NlZC5cbiAgICpcbiAgICogV2lsbCBhbHdheXMgY2xvc2UgdGhlIGNyZWF0ZWQgbGlzdGVuZXIuXG4gICAqXG4gICAqIGBgYHRzXG4gICAqIGltcG9ydCB7IFNlcnZlciB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvc2VydmVyLnRzXCI7XG4gICAqXG4gICAqIGNvbnN0IGhhbmRsZXIgPSAocmVxdWVzdDogUmVxdWVzdCkgPT4ge1xuICAgKiAgIGNvbnN0IGJvZHkgPSBgWW91ciB1c2VyLWFnZW50IGlzOlxcblxcbiR7cmVxdWVzdC5oZWFkZXJzLmdldChcbiAgICogICAgXCJ1c2VyLWFnZW50XCIsXG4gICAqICAgKSA/PyBcIlVua25vd25cIn1gO1xuICAgKlxuICAgKiAgIHJldHVybiBuZXcgUmVzcG9uc2UoYm9keSwgeyBzdGF0dXM6IDIwMCB9KTtcbiAgICogfTtcbiAgICpcbiAgICogY29uc3Qgc2VydmVyID0gbmV3IFNlcnZlcih7IGhhbmRsZXIgfSk7XG4gICAqIGNvbnN0IGxpc3RlbmVyID0gRGVuby5saXN0ZW4oeyBwb3J0OiA0NTA1IH0pO1xuICAgKlxuICAgKiBjb25zb2xlLmxvZyhcInNlcnZlciBsaXN0ZW5pbmcgb24gaHR0cDovL2xvY2FsaG9zdDo0NTA1XCIpO1xuICAgKlxuICAgKiBhd2FpdCBzZXJ2ZXIuc2VydmUobGlzdGVuZXIpO1xuICAgKiBgYGBcbiAgICpcbiAgICogQHBhcmFtIGxpc3RlbmVyIFRoZSBsaXN0ZW5lciB0byBhY2NlcHQgY29ubmVjdGlvbnMgZnJvbS5cbiAgICovXG4gIGFzeW5jIHNlcnZlKGxpc3RlbmVyOiBEZW5vLkxpc3RlbmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuI2Nsb3NlZCkge1xuICAgICAgdGhyb3cgbmV3IERlbm8uZXJyb3JzLkh0dHAoRVJST1JfU0VSVkVSX0NMT1NFRCk7XG4gICAgfVxuXG4gICAgdGhpcy4jdHJhY2tMaXN0ZW5lcihsaXN0ZW5lcik7XG5cbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuI2FjY2VwdChsaXN0ZW5lcik7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMuI3VudHJhY2tMaXN0ZW5lcihsaXN0ZW5lcik7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGxpc3RlbmVyLmNsb3NlKCk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gTGlzdGVuZXIgaGFzIGFscmVhZHkgYmVlbiBjbG9zZWQuXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIGxpc3RlbmVyIG9uIHRoZSBzZXJ2ZXIsIGFjY2VwdCBpbmNvbWluZyBjb25uZWN0aW9ucywgYW5kIGhhbmRsZVxuICAgKiByZXF1ZXN0cyBvbiB0aGVzZSBjb25uZWN0aW9ucyB3aXRoIHRoZSBnaXZlbiBoYW5kbGVyLlxuICAgKlxuICAgKiBJZiB0aGUgc2VydmVyIHdhcyBjb25zdHJ1Y3RlZCB3aXRob3V0IGEgc3BlY2lmaWVkIHBvcnQsIDgwIGlzIHVzZWQuXG4gICAqXG4gICAqIElmIHRoZSBzZXJ2ZXIgd2FzIGNvbnN0cnVjdGVkIHdpdGggdGhlIGhvc3RuYW1lIG9taXR0ZWQgZnJvbSB0aGUgb3B0aW9ucywgdGhlXG4gICAqIG5vbi1yb3V0YWJsZSBtZXRhLWFkZHJlc3MgYDAuMC4wLjBgIGlzIHVzZWQuXG4gICAqXG4gICAqIFRocm93cyBhIHNlcnZlciBjbG9zZWQgZXJyb3IgaWYgdGhlIHNlcnZlciBoYXMgYmVlbiBjbG9zZWQuXG4gICAqXG4gICAqIGBgYHRzXG4gICAqIGltcG9ydCB7IFNlcnZlciB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvc2VydmVyLnRzXCI7XG4gICAqXG4gICAqIGNvbnN0IHBvcnQgPSA0NTA1O1xuICAgKiBjb25zdCBoYW5kbGVyID0gKHJlcXVlc3Q6IFJlcXVlc3QpID0+IHtcbiAgICogICBjb25zdCBib2R5ID0gYFlvdXIgdXNlci1hZ2VudCBpczpcXG5cXG4ke3JlcXVlc3QuaGVhZGVycy5nZXQoXG4gICAqICAgIFwidXNlci1hZ2VudFwiLFxuICAgKiAgICkgPz8gXCJVbmtub3duXCJ9YDtcbiAgICpcbiAgICogICByZXR1cm4gbmV3IFJlc3BvbnNlKGJvZHksIHsgc3RhdHVzOiAyMDAgfSk7XG4gICAqIH07XG4gICAqXG4gICAqIGNvbnN0IHNlcnZlciA9IG5ldyBTZXJ2ZXIoeyBwb3J0LCBoYW5kbGVyIH0pO1xuICAgKlxuICAgKiBjb25zb2xlLmxvZyhcInNlcnZlciBsaXN0ZW5pbmcgb24gaHR0cDovL2xvY2FsaG9zdDo0NTA1XCIpO1xuICAgKlxuICAgKiBhd2FpdCBzZXJ2ZXIubGlzdGVuQW5kU2VydmUoKTtcbiAgICogYGBgXG4gICAqL1xuICBhc3luYyBsaXN0ZW5BbmRTZXJ2ZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy4jY2xvc2VkKSB7XG4gICAgICB0aHJvdyBuZXcgRGVuby5lcnJvcnMuSHR0cChFUlJPUl9TRVJWRVJfQ0xPU0VEKTtcbiAgICB9XG5cbiAgICBjb25zdCBsaXN0ZW5lciA9IERlbm8ubGlzdGVuKHtcbiAgICAgIHBvcnQ6IHRoaXMuI3BvcnQgPz8gSFRUUF9QT1JULFxuICAgICAgaG9zdG5hbWU6IHRoaXMuI2hvc3QgPz8gXCIwLjAuMC4wXCIsXG4gICAgICB0cmFuc3BvcnQ6IFwidGNwXCIsXG4gICAgfSk7XG5cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXJ2ZShsaXN0ZW5lcik7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgbGlzdGVuZXIgb24gdGhlIHNlcnZlciwgYWNjZXB0IGluY29taW5nIGNvbm5lY3Rpb25zLCB1cGdyYWRlIHRoZW1cbiAgICogdG8gVExTLCBhbmQgaGFuZGxlIHJlcXVlc3RzIG9uIHRoZXNlIGNvbm5lY3Rpb25zIHdpdGggdGhlIGdpdmVuIGhhbmRsZXIuXG4gICAqXG4gICAqIElmIHRoZSBzZXJ2ZXIgd2FzIGNvbnN0cnVjdGVkIHdpdGhvdXQgYSBzcGVjaWZpZWQgcG9ydCwgNDQzIGlzIHVzZWQuXG4gICAqXG4gICAqIElmIHRoZSBzZXJ2ZXIgd2FzIGNvbnN0cnVjdGVkIHdpdGggdGhlIGhvc3RuYW1lIG9taXR0ZWQgZnJvbSB0aGUgb3B0aW9ucywgdGhlXG4gICAqIG5vbi1yb3V0YWJsZSBtZXRhLWFkZHJlc3MgYDAuMC4wLjBgIGlzIHVzZWQuXG4gICAqXG4gICAqIFRocm93cyBhIHNlcnZlciBjbG9zZWQgZXJyb3IgaWYgdGhlIHNlcnZlciBoYXMgYmVlbiBjbG9zZWQuXG4gICAqXG4gICAqIGBgYHRzXG4gICAqIGltcG9ydCB7IFNlcnZlciB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvc2VydmVyLnRzXCI7XG4gICAqXG4gICAqIGNvbnN0IHBvcnQgPSA0NTA1O1xuICAgKiBjb25zdCBoYW5kbGVyID0gKHJlcXVlc3Q6IFJlcXVlc3QpID0+IHtcbiAgICogICBjb25zdCBib2R5ID0gYFlvdXIgdXNlci1hZ2VudCBpczpcXG5cXG4ke3JlcXVlc3QuaGVhZGVycy5nZXQoXG4gICAqICAgIFwidXNlci1hZ2VudFwiLFxuICAgKiAgICkgPz8gXCJVbmtub3duXCJ9YDtcbiAgICpcbiAgICogICByZXR1cm4gbmV3IFJlc3BvbnNlKGJvZHksIHsgc3RhdHVzOiAyMDAgfSk7XG4gICAqIH07XG4gICAqXG4gICAqIGNvbnN0IHNlcnZlciA9IG5ldyBTZXJ2ZXIoeyBwb3J0LCBoYW5kbGVyIH0pO1xuICAgKlxuICAgKiBjb25zdCBjZXJ0RmlsZSA9IFwiL3BhdGgvdG8vY2VydEZpbGUuY3J0XCI7XG4gICAqIGNvbnN0IGtleUZpbGUgPSBcIi9wYXRoL3RvL2tleUZpbGUua2V5XCI7XG4gICAqXG4gICAqIGNvbnNvbGUubG9nKFwic2VydmVyIGxpc3RlbmluZyBvbiBodHRwczovL2xvY2FsaG9zdDo0NTA1XCIpO1xuICAgKlxuICAgKiBhd2FpdCBzZXJ2ZXIubGlzdGVuQW5kU2VydmVUbHMoY2VydEZpbGUsIGtleUZpbGUpO1xuICAgKiBgYGBcbiAgICpcbiAgICogQHBhcmFtIGNlcnRGaWxlIFRoZSBwYXRoIHRvIHRoZSBmaWxlIGNvbnRhaW5pbmcgdGhlIFRMUyBjZXJ0aWZpY2F0ZS5cbiAgICogQHBhcmFtIGtleUZpbGUgVGhlIHBhdGggdG8gdGhlIGZpbGUgY29udGFpbmluZyB0aGUgVExTIHByaXZhdGUga2V5LlxuICAgKi9cbiAgYXN5bmMgbGlzdGVuQW5kU2VydmVUbHMoY2VydEZpbGU6IHN0cmluZywga2V5RmlsZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuI2Nsb3NlZCkge1xuICAgICAgdGhyb3cgbmV3IERlbm8uZXJyb3JzLkh0dHAoRVJST1JfU0VSVkVSX0NMT1NFRCk7XG4gICAgfVxuXG4gICAgY29uc3QgbGlzdGVuZXIgPSBEZW5vLmxpc3RlblRscyh7XG4gICAgICBwb3J0OiB0aGlzLiNwb3J0ID8/IEhUVFBTX1BPUlQsXG4gICAgICBob3N0bmFtZTogdGhpcy4jaG9zdCA/PyBcIjAuMC4wLjBcIixcbiAgICAgIGNlcnQ6IERlbm8ucmVhZFRleHRGaWxlU3luYyhjZXJ0RmlsZSksXG4gICAgICBrZXk6IERlbm8ucmVhZFRleHRGaWxlU3luYyhrZXlGaWxlKSxcbiAgICAgIHRyYW5zcG9ydDogXCJ0Y3BcIixcbiAgICAgIC8vIEFMUE4gcHJvdG9jb2wgc3VwcG9ydCBub3QgeWV0IHN0YWJsZS5cbiAgICAgIC8vIGFscG5Qcm90b2NvbHM6IFtcImgyXCIsIFwiaHR0cC8xLjFcIl0sXG4gICAgfSk7XG5cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXJ2ZShsaXN0ZW5lcik7XG4gIH1cblxuICAvKipcbiAgICogSW1tZWRpYXRlbHkgY2xvc2UgdGhlIHNlcnZlciBsaXN0ZW5lcnMgYW5kIGFzc29jaWF0ZWQgSFRUUCBjb25uZWN0aW9ucy5cbiAgICpcbiAgICogVGhyb3dzIGEgc2VydmVyIGNsb3NlZCBlcnJvciBpZiBjYWxsZWQgYWZ0ZXIgdGhlIHNlcnZlciBoYXMgYmVlbiBjbG9zZWQuXG4gICAqL1xuICBjbG9zZSgpIHtcbiAgICBpZiAodGhpcy4jY2xvc2VkKSB7XG4gICAgICB0aHJvdyBuZXcgRGVuby5lcnJvcnMuSHR0cChFUlJPUl9TRVJWRVJfQ0xPU0VEKTtcbiAgICB9XG5cbiAgICB0aGlzLiNjbG9zZWQgPSB0cnVlO1xuXG4gICAgZm9yIChjb25zdCBsaXN0ZW5lciBvZiB0aGlzLiNsaXN0ZW5lcnMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGxpc3RlbmVyLmNsb3NlKCk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gTGlzdGVuZXIgaGFzIGFscmVhZHkgYmVlbiBjbG9zZWQuXG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy4jbGlzdGVuZXJzLmNsZWFyKCk7XG5cbiAgICB0aGlzLiNhY2NlcHRCYWNrb2ZmRGVsYXlBYm9ydENvbnRyb2xsZXIuYWJvcnQoKTtcblxuICAgIGZvciAoY29uc3QgaHR0cENvbm4gb2YgdGhpcy4jaHR0cENvbm5lY3Rpb25zKSB7XG4gICAgICB0aGlzLiNjbG9zZUh0dHBDb25uKGh0dHBDb25uKTtcbiAgICB9XG5cbiAgICB0aGlzLiNodHRwQ29ubmVjdGlvbnMuY2xlYXIoKTtcbiAgfVxuXG4gIC8qKiBHZXQgd2hldGhlciB0aGUgc2VydmVyIGlzIGNsb3NlZC4gKi9cbiAgZ2V0IGNsb3NlZCgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy4jY2xvc2VkO1xuICB9XG5cbiAgLyoqIEdldCB0aGUgbGlzdCBvZiBuZXR3b3JrIGFkZHJlc3NlcyB0aGUgc2VydmVyIGlzIGxpc3RlbmluZyBvbi4gKi9cbiAgZ2V0IGFkZHJzKCk6IERlbm8uQWRkcltdIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLiNsaXN0ZW5lcnMpLm1hcCgobGlzdGVuZXIpID0+IGxpc3RlbmVyLmFkZHIpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlc3BvbmRzIHRvIGFuIEhUVFAgcmVxdWVzdC5cbiAgICpcbiAgICogQHBhcmFtIHJlcXVlc3RFdmVudCBUaGUgSFRUUCByZXF1ZXN0IHRvIHJlc3BvbmQgdG8uXG4gICAqIEBwYXJhbSBjb25uSW5mbyBJbmZvcm1hdGlvbiBhYm91dCB0aGUgdW5kZXJseWluZyBjb25uZWN0aW9uLlxuICAgKi9cbiAgYXN5bmMgI3Jlc3BvbmQoXG4gICAgcmVxdWVzdEV2ZW50OiBEZW5vLlJlcXVlc3RFdmVudCxcbiAgICBjb25uSW5mbzogQ29ubkluZm8sXG4gICkge1xuICAgIGxldCByZXNwb25zZTogUmVzcG9uc2U7XG4gICAgdHJ5IHtcbiAgICAgIC8vIEhhbmRsZSB0aGUgcmVxdWVzdCBldmVudCwgZ2VuZXJhdGluZyBhIHJlc3BvbnNlLlxuICAgICAgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLiNoYW5kbGVyKHJlcXVlc3RFdmVudC5yZXF1ZXN0LCBjb25uSW5mbyk7XG5cbiAgICAgIGlmIChyZXNwb25zZS5ib2R5VXNlZCAmJiByZXNwb25zZS5ib2R5ICE9PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJSZXNwb25zZSBib2R5IGFscmVhZHkgY29uc3VtZWQuXCIpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yOiB1bmtub3duKSB7XG4gICAgICAvLyBJbnZva2Ugb25FcnJvciBoYW5kbGVyIHdoZW4gcmVxdWVzdCBoYW5kbGVyIHRocm93cy5cbiAgICAgIHJlc3BvbnNlID0gYXdhaXQgdGhpcy4jb25FcnJvcihlcnJvcik7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIC8vIFNlbmQgdGhlIHJlc3BvbnNlLlxuICAgICAgYXdhaXQgcmVxdWVzdEV2ZW50LnJlc3BvbmRXaXRoKHJlc3BvbnNlKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIGByZXNwb25kV2l0aCgpYCBjYW4gdGhyb3cgZm9yIHZhcmlvdXMgcmVhc29ucywgaW5jbHVkaW5nIGRvd25zdHJlYW0gYW5kXG4gICAgICAvLyB1cHN0cmVhbSBjb25uZWN0aW9uIGVycm9ycywgYXMgd2VsbCBhcyBlcnJvcnMgdGhyb3duIGR1cmluZyBzdHJlYW1pbmdcbiAgICAgIC8vIG9mIHRoZSByZXNwb25zZSBjb250ZW50LiAgSW4gb3JkZXIgdG8gYXZvaWQgZmFsc2UgbmVnYXRpdmVzLCB3ZSBpZ25vcmVcbiAgICAgIC8vIHRoZSBlcnJvciBoZXJlIGFuZCBsZXQgYHNlcnZlSHR0cGAgY2xvc2UgdGhlIGNvbm5lY3Rpb24gb24gdGhlXG4gICAgICAvLyBmb2xsb3dpbmcgaXRlcmF0aW9uIGlmIGl0IGlzIGluIGZhY3QgYSBkb3duc3RyZWFtIGNvbm5lY3Rpb24gZXJyb3IuXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFNlcnZlcyBhbGwgSFRUUCByZXF1ZXN0cyBvbiBhIHNpbmdsZSBjb25uZWN0aW9uLlxuICAgKlxuICAgKiBAcGFyYW0gaHR0cENvbm4gVGhlIEhUVFAgY29ubmVjdGlvbiB0byB5aWVsZCByZXF1ZXN0cyBmcm9tLlxuICAgKiBAcGFyYW0gY29ubkluZm8gSW5mb3JtYXRpb24gYWJvdXQgdGhlIHVuZGVybHlpbmcgY29ubmVjdGlvbi5cbiAgICovXG4gIGFzeW5jICNzZXJ2ZUh0dHAoaHR0cENvbm46IERlbm8uSHR0cENvbm4sIGNvbm5JbmZvOiBDb25uSW5mbykge1xuICAgIHdoaWxlICghdGhpcy4jY2xvc2VkKSB7XG4gICAgICBsZXQgcmVxdWVzdEV2ZW50OiBEZW5vLlJlcXVlc3RFdmVudCB8IG51bGw7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIFlpZWxkIHRoZSBuZXcgSFRUUCByZXF1ZXN0IG9uIHRoZSBjb25uZWN0aW9uLlxuICAgICAgICByZXF1ZXN0RXZlbnQgPSBhd2FpdCBodHRwQ29ubi5uZXh0UmVxdWVzdCgpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIENvbm5lY3Rpb24gaGFzIGJlZW4gY2xvc2VkLlxuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgaWYgKHJlcXVlc3RFdmVudCA9PT0gbnVsbCkge1xuICAgICAgICAvLyBDb25uZWN0aW9uIGhhcyBiZWVuIGNsb3NlZC5cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIC8vIFJlc3BvbmQgdG8gdGhlIHJlcXVlc3QuIE5vdGUgd2UgZG8gbm90IGF3YWl0IHRoaXMgYXN5bmMgbWV0aG9kIHRvXG4gICAgICAvLyBhbGxvdyB0aGUgY29ubmVjdGlvbiB0byBoYW5kbGUgbXVsdGlwbGUgcmVxdWVzdHMgaW4gdGhlIGNhc2Ugb2YgaDIuXG4gICAgICB0aGlzLiNyZXNwb25kKHJlcXVlc3RFdmVudCwgY29ubkluZm8pO1xuICAgIH1cblxuICAgIHRoaXMuI2Nsb3NlSHR0cENvbm4oaHR0cENvbm4pO1xuICB9XG5cbiAgLyoqXG4gICAqIEFjY2VwdHMgYWxsIGNvbm5lY3Rpb25zIG9uIGEgc2luZ2xlIG5ldHdvcmsgbGlzdGVuZXIuXG4gICAqXG4gICAqIEBwYXJhbSBsaXN0ZW5lciBUaGUgbGlzdGVuZXIgdG8gYWNjZXB0IGNvbm5lY3Rpb25zIGZyb20uXG4gICAqL1xuICBhc3luYyAjYWNjZXB0KGxpc3RlbmVyOiBEZW5vLkxpc3RlbmVyKSB7XG4gICAgbGV0IGFjY2VwdEJhY2tvZmZEZWxheTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG4gICAgd2hpbGUgKCF0aGlzLiNjbG9zZWQpIHtcbiAgICAgIGxldCBjb25uOiBEZW5vLkNvbm47XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIFdhaXQgZm9yIGEgbmV3IGNvbm5lY3Rpb24uXG4gICAgICAgIGNvbm4gPSBhd2FpdCBsaXN0ZW5lci5hY2NlcHQoKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAvLyBUaGUgbGlzdGVuZXIgaXMgY2xvc2VkLlxuICAgICAgICAgIGVycm9yIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuQmFkUmVzb3VyY2UgfHxcbiAgICAgICAgICAvLyBUTFMgaGFuZHNoYWtlIGVycm9ycy5cbiAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIERlbm8uZXJyb3JzLkludmFsaWREYXRhIHx8XG4gICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5VbmV4cGVjdGVkRW9mIHx8XG4gICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5Db25uZWN0aW9uUmVzZXQgfHxcbiAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIERlbm8uZXJyb3JzLk5vdENvbm5lY3RlZFxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBCYWNrb2ZmIGFmdGVyIHRyYW5zaWVudCBlcnJvcnMgdG8gYWxsb3cgdGltZSBmb3IgdGhlIHN5c3RlbSB0b1xuICAgICAgICAgIC8vIHJlY292ZXIsIGFuZCBhdm9pZCBibG9ja2luZyB1cCB0aGUgZXZlbnQgbG9vcCB3aXRoIGEgY29udGludW91c2x5XG4gICAgICAgICAgLy8gcnVubmluZyBsb29wLlxuICAgICAgICAgIGlmICghYWNjZXB0QmFja29mZkRlbGF5KSB7XG4gICAgICAgICAgICBhY2NlcHRCYWNrb2ZmRGVsYXkgPSBJTklUSUFMX0FDQ0VQVF9CQUNLT0ZGX0RFTEFZO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhY2NlcHRCYWNrb2ZmRGVsYXkgKj0gMjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoYWNjZXB0QmFja29mZkRlbGF5ID49IE1BWF9BQ0NFUFRfQkFDS09GRl9ERUxBWSkge1xuICAgICAgICAgICAgYWNjZXB0QmFja29mZkRlbGF5ID0gTUFYX0FDQ0VQVF9CQUNLT0ZGX0RFTEFZO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCBkZWxheShhY2NlcHRCYWNrb2ZmRGVsYXksIHtcbiAgICAgICAgICAgICAgc2lnbmFsOiB0aGlzLiNhY2NlcHRCYWNrb2ZmRGVsYXlBYm9ydENvbnRyb2xsZXIuc2lnbmFsLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyOiB1bmtub3duKSB7XG4gICAgICAgICAgICAvLyBUaGUgYmFja29mZiBkZWxheSB0aW1lciBpcyBhYm9ydGVkIHdoZW4gY2xvc2luZyB0aGUgc2VydmVyLlxuICAgICAgICAgICAgaWYgKCEoZXJyIGluc3RhbmNlb2YgRE9NRXhjZXB0aW9uICYmIGVyci5uYW1lID09PSBcIkFib3J0RXJyb3JcIikpIHtcbiAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG5cbiAgICAgIGFjY2VwdEJhY2tvZmZEZWxheSA9IHVuZGVmaW5lZDtcblxuICAgICAgLy8gXCJVcGdyYWRlXCIgdGhlIG5ldHdvcmsgY29ubmVjdGlvbiBpbnRvIGFuIEhUVFAgY29ubmVjdGlvbi5cbiAgICAgIGxldCBodHRwQ29ubjogRGVuby5IdHRwQ29ubjtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1kZXByZWNhdGVkLWRlbm8tYXBpXG4gICAgICAgIGh0dHBDb25uID0gRGVuby5zZXJ2ZUh0dHAoY29ubik7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gQ29ubmVjdGlvbiBoYXMgYmVlbiBjbG9zZWQuXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBDbG9zaW5nIHRoZSB1bmRlcmx5aW5nIGxpc3RlbmVyIHdpbGwgbm90IGNsb3NlIEhUVFAgY29ubmVjdGlvbnMsIHNvIHdlXG4gICAgICAvLyB0cmFjayBmb3IgY2xvc3VyZSB1cG9uIHNlcnZlciBjbG9zZS5cbiAgICAgIHRoaXMuI3RyYWNrSHR0cENvbm5lY3Rpb24oaHR0cENvbm4pO1xuXG4gICAgICBjb25zdCBjb25uSW5mbzogQ29ubkluZm8gPSB7XG4gICAgICAgIGxvY2FsQWRkcjogY29ubi5sb2NhbEFkZHIsXG4gICAgICAgIHJlbW90ZUFkZHI6IGNvbm4ucmVtb3RlQWRkcixcbiAgICAgIH07XG5cbiAgICAgIC8vIFNlcnZlIHRoZSByZXF1ZXN0cyB0aGF0IGFycml2ZSBvbiB0aGUganVzdC1hY2NlcHRlZCBjb25uZWN0aW9uLiBOb3RlXG4gICAgICAvLyB3ZSBkbyBub3QgYXdhaXQgdGhpcyBhc3luYyBtZXRob2QgdG8gYWxsb3cgdGhlIHNlcnZlciB0byBhY2NlcHQgbmV3XG4gICAgICAvLyBjb25uZWN0aW9ucy5cbiAgICAgIHRoaXMuI3NlcnZlSHR0cChodHRwQ29ubiwgY29ubkluZm8pO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBVbnRyYWNrcyBhbmQgY2xvc2VzIGFuIEhUVFAgY29ubmVjdGlvbi5cbiAgICpcbiAgICogQHBhcmFtIGh0dHBDb25uIFRoZSBIVFRQIGNvbm5lY3Rpb24gdG8gY2xvc2UuXG4gICAqL1xuICAjY2xvc2VIdHRwQ29ubihodHRwQ29ubjogRGVuby5IdHRwQ29ubikge1xuICAgIHRoaXMuI3VudHJhY2tIdHRwQ29ubmVjdGlvbihodHRwQ29ubik7XG5cbiAgICB0cnkge1xuICAgICAgaHR0cENvbm4uY2xvc2UoKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIENvbm5lY3Rpb24gaGFzIGFscmVhZHkgYmVlbiBjbG9zZWQuXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEFkZHMgdGhlIGxpc3RlbmVyIHRvIHRoZSBpbnRlcm5hbCB0cmFja2luZyBsaXN0LlxuICAgKlxuICAgKiBAcGFyYW0gbGlzdGVuZXIgTGlzdGVuZXIgdG8gdHJhY2suXG4gICAqL1xuICAjdHJhY2tMaXN0ZW5lcihsaXN0ZW5lcjogRGVuby5MaXN0ZW5lcikge1xuICAgIHRoaXMuI2xpc3RlbmVycy5hZGQobGlzdGVuZXIpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgdGhlIGxpc3RlbmVyIGZyb20gdGhlIGludGVybmFsIHRyYWNraW5nIGxpc3QuXG4gICAqXG4gICAqIEBwYXJhbSBsaXN0ZW5lciBMaXN0ZW5lciB0byB1bnRyYWNrLlxuICAgKi9cbiAgI3VudHJhY2tMaXN0ZW5lcihsaXN0ZW5lcjogRGVuby5MaXN0ZW5lcikge1xuICAgIHRoaXMuI2xpc3RlbmVycy5kZWxldGUobGlzdGVuZXIpO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZHMgdGhlIEhUVFAgY29ubmVjdGlvbiB0byB0aGUgaW50ZXJuYWwgdHJhY2tpbmcgbGlzdC5cbiAgICpcbiAgICogQHBhcmFtIGh0dHBDb25uIEhUVFAgY29ubmVjdGlvbiB0byB0cmFjay5cbiAgICovXG4gICN0cmFja0h0dHBDb25uZWN0aW9uKGh0dHBDb25uOiBEZW5vLkh0dHBDb25uKSB7XG4gICAgdGhpcy4jaHR0cENvbm5lY3Rpb25zLmFkZChodHRwQ29ubik7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlcyB0aGUgSFRUUCBjb25uZWN0aW9uIGZyb20gdGhlIGludGVybmFsIHRyYWNraW5nIGxpc3QuXG4gICAqXG4gICAqIEBwYXJhbSBodHRwQ29ubiBIVFRQIGNvbm5lY3Rpb24gdG8gdW50cmFjay5cbiAgICovXG4gICN1bnRyYWNrSHR0cENvbm5lY3Rpb24oaHR0cENvbm46IERlbm8uSHR0cENvbm4pIHtcbiAgICB0aGlzLiNodHRwQ29ubmVjdGlvbnMuZGVsZXRlKGh0dHBDb25uKTtcbiAgfVxufVxuXG4vKipcbiAqIEFkZGl0aW9uYWwgc2VydmUgb3B0aW9ucy5cbiAqXG4gKiBAZGVwcmVjYXRlZCAod2lsbCBiZSByZW1vdmVkIGFmdGVyIDEuMC4wKSBVc2Uge0BsaW5rY29kZSBEZW5vLlNlcnZlSW5pdH0gaW5zdGVhZC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZXJ2ZUluaXQgZXh0ZW5kcyBQYXJ0aWFsPERlbm8uTGlzdGVuT3B0aW9ucz4ge1xuICAvKiogQW4gQWJvcnRTaWduYWwgdG8gY2xvc2UgdGhlIHNlcnZlciBhbmQgYWxsIGNvbm5lY3Rpb25zLiAqL1xuICBzaWduYWw/OiBBYm9ydFNpZ25hbDtcblxuICAvKiogVGhlIGhhbmRsZXIgdG8gaW52b2tlIHdoZW4gcm91dGUgaGFuZGxlcnMgdGhyb3cgYW4gZXJyb3IuICovXG4gIG9uRXJyb3I/OiAoZXJyb3I6IHVua25vd24pID0+IFJlc3BvbnNlIHwgUHJvbWlzZTxSZXNwb25zZT47XG5cbiAgLyoqIFRoZSBjYWxsYmFjayB3aGljaCBpcyBjYWxsZWQgd2hlbiB0aGUgc2VydmVyIHN0YXJ0ZWQgbGlzdGVuaW5nICovXG4gIG9uTGlzdGVuPzogKHBhcmFtczogeyBob3N0bmFtZTogc3RyaW5nOyBwb3J0OiBudW1iZXIgfSkgPT4gdm9pZDtcbn1cblxuLyoqXG4gKiBBZGRpdGlvbmFsIHNlcnZlIGxpc3RlbmVyIG9wdGlvbnMuXG4gKlxuICogQGRlcHJlY2F0ZWQgKHdpbGwgYmUgcmVtb3ZlZCBhZnRlciAxLjAuMCkgVXNlIHtAbGlua2NvZGUgRGVuby5TZXJ2ZU9wdGlvbnN9IGluc3RlYWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmVMaXN0ZW5lck9wdGlvbnMge1xuICAvKiogQW4gQWJvcnRTaWduYWwgdG8gY2xvc2UgdGhlIHNlcnZlciBhbmQgYWxsIGNvbm5lY3Rpb25zLiAqL1xuICBzaWduYWw/OiBBYm9ydFNpZ25hbDtcblxuICAvKiogVGhlIGhhbmRsZXIgdG8gaW52b2tlIHdoZW4gcm91dGUgaGFuZGxlcnMgdGhyb3cgYW4gZXJyb3IuICovXG4gIG9uRXJyb3I/OiAoZXJyb3I6IHVua25vd24pID0+IFJlc3BvbnNlIHwgUHJvbWlzZTxSZXNwb25zZT47XG5cbiAgLyoqIFRoZSBjYWxsYmFjayB3aGljaCBpcyBjYWxsZWQgd2hlbiB0aGUgc2VydmVyIHN0YXJ0ZWQgbGlzdGVuaW5nICovXG4gIG9uTGlzdGVuPzogKHBhcmFtczogeyBob3N0bmFtZTogc3RyaW5nOyBwb3J0OiBudW1iZXIgfSkgPT4gdm9pZDtcbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3RzIGEgc2VydmVyLCBhY2NlcHRzIGluY29taW5nIGNvbm5lY3Rpb25zIG9uIHRoZSBnaXZlbiBsaXN0ZW5lciwgYW5kXG4gKiBoYW5kbGVzIHJlcXVlc3RzIG9uIHRoZXNlIGNvbm5lY3Rpb25zIHdpdGggdGhlIGdpdmVuIGhhbmRsZXIuXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IHNlcnZlTGlzdGVuZXIgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL3NlcnZlci50c1wiO1xuICpcbiAqIGNvbnN0IGxpc3RlbmVyID0gRGVuby5saXN0ZW4oeyBwb3J0OiA0NTA1IH0pO1xuICpcbiAqIGNvbnNvbGUubG9nKFwic2VydmVyIGxpc3RlbmluZyBvbiBodHRwOi8vbG9jYWxob3N0OjQ1MDVcIik7XG4gKlxuICogYXdhaXQgc2VydmVMaXN0ZW5lcihsaXN0ZW5lciwgKHJlcXVlc3QpID0+IHtcbiAqICAgY29uc3QgYm9keSA9IGBZb3VyIHVzZXItYWdlbnQgaXM6XFxuXFxuJHtyZXF1ZXN0LmhlYWRlcnMuZ2V0KFxuICogICAgIFwidXNlci1hZ2VudFwiLFxuICogICApID8/IFwiVW5rbm93blwifWA7XG4gKlxuICogICByZXR1cm4gbmV3IFJlc3BvbnNlKGJvZHksIHsgc3RhdHVzOiAyMDAgfSk7XG4gKiB9KTtcbiAqIGBgYFxuICpcbiAqIEBwYXJhbSBsaXN0ZW5lciBUaGUgbGlzdGVuZXIgdG8gYWNjZXB0IGNvbm5lY3Rpb25zIGZyb20uXG4gKiBAcGFyYW0gaGFuZGxlciBUaGUgaGFuZGxlciBmb3IgaW5kaXZpZHVhbCBIVFRQIHJlcXVlc3RzLlxuICogQHBhcmFtIG9wdGlvbnMgT3B0aW9uYWwgc2VydmUgb3B0aW9ucy5cbiAqXG4gKiBAZGVwcmVjYXRlZCAod2lsbCBiZSByZW1vdmVkIGFmdGVyIDEuMC4wKSBVc2Uge0BsaW5rY29kZSBEZW5vLnNlcnZlfSBpbnN0ZWFkLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2VydmVMaXN0ZW5lcihcbiAgbGlzdGVuZXI6IERlbm8uTGlzdGVuZXIsXG4gIGhhbmRsZXI6IEhhbmRsZXIsXG4gIG9wdGlvbnM/OiBTZXJ2ZUxpc3RlbmVyT3B0aW9ucyxcbik6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBzZXJ2ZXIgPSBuZXcgU2VydmVyKHsgaGFuZGxlciwgb25FcnJvcjogb3B0aW9ucz8ub25FcnJvciB9KTtcblxuICBvcHRpb25zPy5zaWduYWw/LmFkZEV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCAoKSA9PiBzZXJ2ZXIuY2xvc2UoKSwge1xuICAgIG9uY2U6IHRydWUsXG4gIH0pO1xuXG4gIHJldHVybiBhd2FpdCBzZXJ2ZXIuc2VydmUobGlzdGVuZXIpO1xufVxuXG5mdW5jdGlvbiBob3N0bmFtZUZvckRpc3BsYXkoaG9zdG5hbWU6IHN0cmluZykge1xuICAvLyBJZiB0aGUgaG9zdG5hbWUgaXMgXCIwLjAuMC4wXCIsIHdlIGRpc3BsYXkgXCJsb2NhbGhvc3RcIiBpbiBjb25zb2xlXG4gIC8vIGJlY2F1c2UgYnJvd3NlcnMgaW4gV2luZG93cyBkb24ndCByZXNvbHZlIFwiMC4wLjAuMFwiLlxuICAvLyBTZWUgdGhlIGRpc2N1c3Npb24gaW4gaHR0cHM6Ly9naXRodWIuY29tL2Rlbm9sYW5kL2Rlbm9fc3RkL2lzc3Vlcy8xMTY1XG4gIHJldHVybiBob3N0bmFtZSA9PT0gXCIwLjAuMC4wXCIgPyBcImxvY2FsaG9zdFwiIDogaG9zdG5hbWU7XG59XG5cbi8qKlxuICogU2VydmVzIEhUVFAgcmVxdWVzdHMgd2l0aCB0aGUgZ2l2ZW4gaGFuZGxlci5cbiAqXG4gKiBZb3UgY2FuIHNwZWNpZnkgYW4gb2JqZWN0IHdpdGggYSBwb3J0IGFuZCBob3N0bmFtZSBvcHRpb24sIHdoaWNoIGlzIHRoZVxuICogYWRkcmVzcyB0byBsaXN0ZW4gb24uIFRoZSBkZWZhdWx0IGlzIHBvcnQgODAwMCBvbiBob3N0bmFtZSBcIjAuMC4wLjBcIi5cbiAqXG4gKiBUaGUgYmVsb3cgZXhhbXBsZSBzZXJ2ZXMgd2l0aCB0aGUgcG9ydCA4MDAwLlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBzZXJ2ZSB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvc2VydmVyLnRzXCI7XG4gKiBzZXJ2ZSgoX3JlcSkgPT4gbmV3IFJlc3BvbnNlKFwiSGVsbG8sIHdvcmxkXCIpKTtcbiAqIGBgYFxuICpcbiAqIFlvdSBjYW4gY2hhbmdlIHRoZSBsaXN0ZW5pbmcgYWRkcmVzcyBieSB0aGUgYGhvc3RuYW1lYCBhbmQgYHBvcnRgIG9wdGlvbnMuXG4gKiBUaGUgYmVsb3cgZXhhbXBsZSBzZXJ2ZXMgd2l0aCB0aGUgcG9ydCAzMDAwLlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBzZXJ2ZSB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvc2VydmVyLnRzXCI7XG4gKiBzZXJ2ZSgoX3JlcSkgPT4gbmV3IFJlc3BvbnNlKFwiSGVsbG8sIHdvcmxkXCIpLCB7IHBvcnQ6IDMwMDAgfSk7XG4gKiBgYGBcbiAqXG4gKiBgc2VydmVgIGZ1bmN0aW9uIHByaW50cyB0aGUgbWVzc2FnZSBgTGlzdGVuaW5nIG9uIGh0dHA6Ly88aG9zdG5hbWU+Ojxwb3J0Pi9gXG4gKiBvbiBzdGFydC11cCBieSBkZWZhdWx0LiBJZiB5b3UgbGlrZSB0byBjaGFuZ2UgdGhpcyBtZXNzYWdlLCB5b3UgY2FuIHNwZWNpZnlcbiAqIGBvbkxpc3RlbmAgb3B0aW9uIHRvIG92ZXJyaWRlIGl0LlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBzZXJ2ZSB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvc2VydmVyLnRzXCI7XG4gKiBzZXJ2ZSgoX3JlcSkgPT4gbmV3IFJlc3BvbnNlKFwiSGVsbG8sIHdvcmxkXCIpLCB7XG4gKiAgIG9uTGlzdGVuKHsgcG9ydCwgaG9zdG5hbWUgfSkge1xuICogICAgIGNvbnNvbGUubG9nKGBTZXJ2ZXIgc3RhcnRlZCBhdCBodHRwOi8vJHtob3N0bmFtZX06JHtwb3J0fWApO1xuICogICAgIC8vIC4uLiBtb3JlIGluZm8gc3BlY2lmaWMgdG8geW91ciBzZXJ2ZXIgLi5cbiAqICAgfSxcbiAqIH0pO1xuICogYGBgXG4gKlxuICogWW91IGNhbiBhbHNvIHNwZWNpZnkgYHVuZGVmaW5lZGAgb3IgYG51bGxgIHRvIHN0b3AgdGhlIGxvZ2dpbmcgYmVoYXZpb3IuXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IHNlcnZlIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAkU1REX1ZFUlNJT04vaHR0cC9zZXJ2ZXIudHNcIjtcbiAqIHNlcnZlKChfcmVxKSA9PiBuZXcgUmVzcG9uc2UoXCJIZWxsbywgd29ybGRcIiksIHsgb25MaXN0ZW46IHVuZGVmaW5lZCB9KTtcbiAqIGBgYFxuICpcbiAqIEBwYXJhbSBoYW5kbGVyIFRoZSBoYW5kbGVyIGZvciBpbmRpdmlkdWFsIEhUVFAgcmVxdWVzdHMuXG4gKiBAcGFyYW0gb3B0aW9ucyBUaGUgb3B0aW9ucy4gU2VlIGBTZXJ2ZUluaXRgIGRvY3VtZW50YXRpb24gZm9yIGRldGFpbHMuXG4gKlxuICogQGRlcHJlY2F0ZWQgKHdpbGwgYmUgcmVtb3ZlZCBhZnRlciAxLjAuMCkgVXNlIHtAbGlua2NvZGUgRGVuby5zZXJ2ZX0gaW5zdGVhZC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNlcnZlKFxuICBoYW5kbGVyOiBIYW5kbGVyLFxuICBvcHRpb25zOiBTZXJ2ZUluaXQgPSB7fSxcbik6IFByb21pc2U8dm9pZD4ge1xuICBsZXQgcG9ydCA9IG9wdGlvbnMucG9ydCA/PyA4MDAwO1xuICBpZiAodHlwZW9mIHBvcnQgIT09IFwibnVtYmVyXCIpIHtcbiAgICBwb3J0ID0gTnVtYmVyKHBvcnQpO1xuICB9XG5cbiAgY29uc3QgaG9zdG5hbWUgPSBvcHRpb25zLmhvc3RuYW1lID8/IFwiMC4wLjAuMFwiO1xuICBjb25zdCBzZXJ2ZXIgPSBuZXcgU2VydmVyKHtcbiAgICBwb3J0LFxuICAgIGhvc3RuYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgb25FcnJvcjogb3B0aW9ucy5vbkVycm9yLFxuICB9KTtcblxuICBvcHRpb25zPy5zaWduYWw/LmFkZEV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCAoKSA9PiBzZXJ2ZXIuY2xvc2UoKSwge1xuICAgIG9uY2U6IHRydWUsXG4gIH0pO1xuXG4gIGNvbnN0IGxpc3RlbmVyID0gRGVuby5saXN0ZW4oe1xuICAgIHBvcnQsXG4gICAgaG9zdG5hbWUsXG4gICAgdHJhbnNwb3J0OiBcInRjcFwiLFxuICB9KTtcblxuICBjb25zdCBzID0gc2VydmVyLnNlcnZlKGxpc3RlbmVyKTtcblxuICBwb3J0ID0gKHNlcnZlci5hZGRyc1swXSBhcyBEZW5vLk5ldEFkZHIpLnBvcnQ7XG5cbiAgaWYgKFwib25MaXN0ZW5cIiBpbiBvcHRpb25zKSB7XG4gICAgb3B0aW9ucy5vbkxpc3Rlbj8uKHsgcG9ydCwgaG9zdG5hbWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS5sb2coYExpc3RlbmluZyBvbiBodHRwOi8vJHtob3N0bmFtZUZvckRpc3BsYXkoaG9zdG5hbWUpfToke3BvcnR9L2ApO1xuICB9XG5cbiAgcmV0dXJuIGF3YWl0IHM7XG59XG5cbi8qKlxuICogSW5pdGlhbGl6YXRpb24gcGFyYW1ldGVycyBmb3Ige0BsaW5rY29kZSBzZXJ2ZVRsc30uXG4gKlxuICogQGRlcHJlY2F0ZWQgKHdpbGwgYmUgcmVtb3ZlZCBhZnRlciAxLjAuMCkgVXNlIHtAbGlua2NvZGUgRGVuby5TZXJ2ZVRsc09wdGlvbnN9IGluc3RlYWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmVUbHNJbml0IGV4dGVuZHMgU2VydmVJbml0IHtcbiAgLyoqIFNlcnZlciBwcml2YXRlIGtleSBpbiBQRU0gZm9ybWF0ICovXG4gIGtleT86IHN0cmluZztcblxuICAvKiogQ2VydCBjaGFpbiBpbiBQRU0gZm9ybWF0ICovXG4gIGNlcnQ/OiBzdHJpbmc7XG5cbiAgLyoqIFRoZSBwYXRoIHRvIHRoZSBmaWxlIGNvbnRhaW5pbmcgdGhlIFRMUyBwcml2YXRlIGtleS4gKi9cbiAga2V5RmlsZT86IHN0cmluZztcblxuICAvKiogVGhlIHBhdGggdG8gdGhlIGZpbGUgY29udGFpbmluZyB0aGUgVExTIGNlcnRpZmljYXRlICovXG4gIGNlcnRGaWxlPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFNlcnZlcyBIVFRQUyByZXF1ZXN0cyB3aXRoIHRoZSBnaXZlbiBoYW5kbGVyLlxuICpcbiAqIFlvdSBtdXN0IHNwZWNpZnkgYGtleWAgb3IgYGtleUZpbGVgIGFuZCBgY2VydGAgb3IgYGNlcnRGaWxlYCBvcHRpb25zLlxuICpcbiAqIFlvdSBjYW4gc3BlY2lmeSBhbiBvYmplY3Qgd2l0aCBhIHBvcnQgYW5kIGhvc3RuYW1lIG9wdGlvbiwgd2hpY2ggaXMgdGhlXG4gKiBhZGRyZXNzIHRvIGxpc3RlbiBvbi4gVGhlIGRlZmF1bHQgaXMgcG9ydCA4NDQzIG9uIGhvc3RuYW1lIFwiMC4wLjAuMFwiLlxuICpcbiAqIFRoZSBiZWxvdyBleGFtcGxlIHNlcnZlcyB3aXRoIHRoZSBkZWZhdWx0IHBvcnQgODQ0My5cbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgc2VydmVUbHMgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL3NlcnZlci50c1wiO1xuICpcbiAqIGNvbnN0IGNlcnQgPSBcIi0tLS0tQkVHSU4gQ0VSVElGSUNBVEUtLS0tLVxcbi4uLlxcbi0tLS0tRU5EIENFUlRJRklDQVRFLS0tLS1cXG5cIjtcbiAqIGNvbnN0IGtleSA9IFwiLS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tXFxuLi4uXFxuLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLVxcblwiO1xuICogc2VydmVUbHMoKF9yZXEpID0+IG5ldyBSZXNwb25zZShcIkhlbGxvLCB3b3JsZFwiKSwgeyBjZXJ0LCBrZXkgfSk7XG4gKlxuICogLy8gT3JcbiAqXG4gKiBjb25zdCBjZXJ0RmlsZSA9IFwiL3BhdGgvdG8vY2VydEZpbGUuY3J0XCI7XG4gKiBjb25zdCBrZXlGaWxlID0gXCIvcGF0aC90by9rZXlGaWxlLmtleVwiO1xuICogc2VydmVUbHMoKF9yZXEpID0+IG5ldyBSZXNwb25zZShcIkhlbGxvLCB3b3JsZFwiKSwgeyBjZXJ0RmlsZSwga2V5RmlsZSB9KTtcbiAqIGBgYFxuICpcbiAqIGBzZXJ2ZVRsc2AgZnVuY3Rpb24gcHJpbnRzIHRoZSBtZXNzYWdlIGBMaXN0ZW5pbmcgb24gaHR0cHM6Ly88aG9zdG5hbWU+Ojxwb3J0Pi9gXG4gKiBvbiBzdGFydC11cCBieSBkZWZhdWx0LiBJZiB5b3UgbGlrZSB0byBjaGFuZ2UgdGhpcyBtZXNzYWdlLCB5b3UgY2FuIHNwZWNpZnlcbiAqIGBvbkxpc3RlbmAgb3B0aW9uIHRvIG92ZXJyaWRlIGl0LlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBzZXJ2ZVRscyB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvc2VydmVyLnRzXCI7XG4gKiBjb25zdCBjZXJ0RmlsZSA9IFwiL3BhdGgvdG8vY2VydEZpbGUuY3J0XCI7XG4gKiBjb25zdCBrZXlGaWxlID0gXCIvcGF0aC90by9rZXlGaWxlLmtleVwiO1xuICogc2VydmVUbHMoKF9yZXEpID0+IG5ldyBSZXNwb25zZShcIkhlbGxvLCB3b3JsZFwiKSwge1xuICogICBjZXJ0RmlsZSxcbiAqICAga2V5RmlsZSxcbiAqICAgb25MaXN0ZW4oeyBwb3J0LCBob3N0bmFtZSB9KSB7XG4gKiAgICAgY29uc29sZS5sb2coYFNlcnZlciBzdGFydGVkIGF0IGh0dHBzOi8vJHtob3N0bmFtZX06JHtwb3J0fWApO1xuICogICAgIC8vIC4uLiBtb3JlIGluZm8gc3BlY2lmaWMgdG8geW91ciBzZXJ2ZXIgLi5cbiAqICAgfSxcbiAqIH0pO1xuICogYGBgXG4gKlxuICogWW91IGNhbiBhbHNvIHNwZWNpZnkgYHVuZGVmaW5lZGAgb3IgYG51bGxgIHRvIHN0b3AgdGhlIGxvZ2dpbmcgYmVoYXZpb3IuXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IHNlcnZlVGxzIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAkU1REX1ZFUlNJT04vaHR0cC9zZXJ2ZXIudHNcIjtcbiAqIGNvbnN0IGNlcnRGaWxlID0gXCIvcGF0aC90by9jZXJ0RmlsZS5jcnRcIjtcbiAqIGNvbnN0IGtleUZpbGUgPSBcIi9wYXRoL3RvL2tleUZpbGUua2V5XCI7XG4gKiBzZXJ2ZVRscygoX3JlcSkgPT4gbmV3IFJlc3BvbnNlKFwiSGVsbG8sIHdvcmxkXCIpLCB7XG4gKiAgIGNlcnRGaWxlLFxuICogICBrZXlGaWxlLFxuICogICBvbkxpc3RlbjogdW5kZWZpbmVkLFxuICogfSk7XG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0gaGFuZGxlciBUaGUgaGFuZGxlciBmb3IgaW5kaXZpZHVhbCBIVFRQUyByZXF1ZXN0cy5cbiAqIEBwYXJhbSBvcHRpb25zIFRoZSBvcHRpb25zLiBTZWUgYFNlcnZlVGxzSW5pdGAgZG9jdW1lbnRhdGlvbiBmb3IgZGV0YWlscy5cbiAqIEByZXR1cm5zXG4gKlxuICogQGRlcHJlY2F0ZWQgKHdpbGwgYmUgcmVtb3ZlZCBhZnRlciAxLjAuMCkgVXNlIHtAbGlua2NvZGUgRGVuby5zZXJ2ZX0gaW5zdGVhZC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNlcnZlVGxzKFxuICBoYW5kbGVyOiBIYW5kbGVyLFxuICBvcHRpb25zOiBTZXJ2ZVRsc0luaXQsXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgaWYgKCFvcHRpb25zLmtleSAmJiAhb3B0aW9ucy5rZXlGaWxlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiVExTIGNvbmZpZyBpcyBnaXZlbiwgYnV0ICdrZXknIGlzIG1pc3NpbmcuXCIpO1xuICB9XG5cbiAgaWYgKCFvcHRpb25zLmNlcnQgJiYgIW9wdGlvbnMuY2VydEZpbGUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJUTFMgY29uZmlnIGlzIGdpdmVuLCBidXQgJ2NlcnQnIGlzIG1pc3NpbmcuXCIpO1xuICB9XG5cbiAgbGV0IHBvcnQgPSBvcHRpb25zLnBvcnQgPz8gODQ0MztcbiAgaWYgKHR5cGVvZiBwb3J0ICE9PSBcIm51bWJlclwiKSB7XG4gICAgcG9ydCA9IE51bWJlcihwb3J0KTtcbiAgfVxuXG4gIGNvbnN0IGhvc3RuYW1lID0gb3B0aW9ucy5ob3N0bmFtZSA/PyBcIjAuMC4wLjBcIjtcbiAgY29uc3Qgc2VydmVyID0gbmV3IFNlcnZlcih7XG4gICAgcG9ydCxcbiAgICBob3N0bmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIG9uRXJyb3I6IG9wdGlvbnMub25FcnJvcixcbiAgfSk7XG5cbiAgb3B0aW9ucz8uc2lnbmFsPy5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgKCkgPT4gc2VydmVyLmNsb3NlKCksIHtcbiAgICBvbmNlOiB0cnVlLFxuICB9KTtcblxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLXN5bmMtZm4taW4tYXN5bmMtZm5cbiAgY29uc3Qga2V5ID0gb3B0aW9ucy5rZXkgfHwgRGVuby5yZWFkVGV4dEZpbGVTeW5jKG9wdGlvbnMua2V5RmlsZSEpO1xuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLXN5bmMtZm4taW4tYXN5bmMtZm5cbiAgY29uc3QgY2VydCA9IG9wdGlvbnMuY2VydCB8fCBEZW5vLnJlYWRUZXh0RmlsZVN5bmMob3B0aW9ucy5jZXJ0RmlsZSEpO1xuXG4gIGNvbnN0IGxpc3RlbmVyID0gRGVuby5saXN0ZW5UbHMoe1xuICAgIHBvcnQsXG4gICAgaG9zdG5hbWUsXG4gICAgY2VydCxcbiAgICBrZXksXG4gICAgdHJhbnNwb3J0OiBcInRjcFwiLFxuICAgIC8vIEFMUE4gcHJvdG9jb2wgc3VwcG9ydCBub3QgeWV0IHN0YWJsZS5cbiAgICAvLyBhbHBuUHJvdG9jb2xzOiBbXCJoMlwiLCBcImh0dHAvMS4xXCJdLFxuICB9KTtcblxuICBjb25zdCBzID0gc2VydmVyLnNlcnZlKGxpc3RlbmVyKTtcblxuICBwb3J0ID0gKHNlcnZlci5hZGRyc1swXSBhcyBEZW5vLk5ldEFkZHIpLnBvcnQ7XG5cbiAgaWYgKFwib25MaXN0ZW5cIiBpbiBvcHRpb25zKSB7XG4gICAgb3B0aW9ucy5vbkxpc3Rlbj8uKHsgcG9ydCwgaG9zdG5hbWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS5sb2coXG4gICAgICBgTGlzdGVuaW5nIG9uIGh0dHBzOi8vJHtob3N0bmFtZUZvckRpc3BsYXkoaG9zdG5hbWUpfToke3BvcnR9L2AsXG4gICAgKTtcbiAgfVxuXG4gIHJldHVybiBhd2FpdCBzO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRSxTQUFTLEtBQUssUUFBUSxvQkFBb0I7QUFFMUMsK0NBQStDLEdBQy9DLE1BQU0sc0JBQXNCO0FBRTVCLG1DQUFtQyxHQUNuQyxNQUFNLFlBQVk7QUFFbEIsb0NBQW9DLEdBQ3BDLE1BQU0sYUFBYTtBQUVuQix1RUFBdUUsR0FDdkUsTUFBTSwrQkFBK0I7QUFFckMsa0VBQWtFLEdBQ2xFLE1BQU0sMkJBQTJCO0FBOENqQzs7OztDQUlDLEdBQ0QsT0FBTyxNQUFNO0VBQ1gsQ0FBQyxJQUFJLENBQVU7RUFDZixDQUFDLElBQUksQ0FBVTtFQUNmLENBQUMsT0FBTyxDQUFVO0VBQ2xCLENBQUMsTUFBTSxHQUFHLE1BQU07RUFDaEIsQ0FBQyxTQUFTLEdBQXVCLElBQUksTUFBTTtFQUMzQyxDQUFDLGlDQUFpQyxHQUFHLElBQUksa0JBQWtCO0VBQzNELENBQUMsZUFBZSxHQUF1QixJQUFJLE1BQU07RUFDakQsQ0FBQyxPQUFPLENBQW1EO0VBRTNEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBbUJDLEdBQ0QsWUFBWSxVQUFzQixDQUFFO0lBQ2xDLElBQUksQ0FBQyxDQUFDLElBQUksR0FBRyxXQUFXLElB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