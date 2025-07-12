// WebSocket shim for Cinnamon javascript environment. May also work
// in Gnome javascript. Partial implementation! Does not support all
// WebSocket functionality!

import * as log from "./log";

const byteArray = imports.byteArray;
const GLib = imports.gi.GLib;
const Soup = imports.gi.Soup;

interface WSEventOptions {
    error?: unknown;
    message?: string;
    code?: number;
    data?: string;
}

class WebSocketShim implements WebSocket {
    // something weird in type definitions forces us to have these as
    // both static and instance variables
    static readonly CONNECTING = 0 as const;
    static readonly OPEN = 1 as const;
    static readonly CLOSING = 2 as const;
    static readonly CLOSED = 3 as const;
    readonly CONNECTING = 0 as const;
    readonly OPEN = 1 as const;
    readonly CLOSING = 2 as const;
    readonly CLOSED = 3 as const;

    readonly url: string;
    readyState: number = this.CONNECTING;

    private _connection?: imports.gi.Soup.WebsocketConnection;
    private _eventListeners =
        new Map<string, Set<EventListenerOrEventListenerObject>>();

    // dummy values for unimplemented things
    readonly binaryType = "blob";
    readonly bufferedAmount = 0;
    readonly extensions = "";
    readonly protocol = "";
    readonly onclose = null;
    readonly onerror = null;
    readonly onmessage = null;
    readonly onopen = null;

    constructor(url: string | URL, _protocols?: unknown) {
        if (typeof url === "object")
            url = url.href;
        this.url = url;

        // based on
        // https://gitlab.gnome.org/GNOME/gjs/-/blob/master/examples/websocket-client.js
        const session = new Soup.Session();
        const message = new Soup.Message({
            method: 'GET',
            uri: GLib.Uri.parse(url, GLib.UriFlags.NONE),
        });

        session.websocket_connect_async(
            message,
            "",
            [],
            0,
            null,
            (_session, result) => {
                try {
                    this._connection = session.websocket_connect_finish(result);
                } catch (err) {
                    log.error("WebSocket connection error", err);
                    this.readyState = this.CLOSED;
                    this._dispatchEvent("error", {
                        error: err,
                        message: (
                            err && typeof err === "object" &&
                            (err instanceof Error || err instanceof GLib.Error)
                        ) ? err.message : "",
                    });
                    return;
                }

                const decoder = new TextDecoder();

                this._connection.connect("closing", () => {
                    this.readyState = this.CLOSING;
                });

                this._connection.connect("closed", (conn) => {
                    this.readyState = this.CLOSED;
                    this._dispatchEvent("close", {
                        code: conn.get_close_code(),
                    });
                });

                this._connection.connect("error", (_conn, error) => {
                    log.error("WebSocket error", error);
                    this._dispatchEvent("error", {
                        error,
                        message: error.message,
                    });
                });

                this._connection.connect("message", (_conn, _type, message) =>
                    this._dispatchEvent("message", {
                        data: decoder.decode(byteArray.fromGBytes(message)),
                    }));

                this.readyState = this.OPEN;
                this._dispatchEvent("open");
            });
    }

    close() {
        if (this._connection) {
            this.readyState = this.CLOSING;
            this._connection?.close(Soup.WebsocketCloseCode.NO_STATUS, "");
        }
        else {  // called before connection established?
            const maybeCloseAndCleanup = () => {
                this.readyState = this._connection ? this.CLOSING : this.CLOSED;
                if (this._connection)
                    this._connection.close(Soup.WebsocketCloseCode.NO_STATUS);
                this.removeEventListener("open", maybeCloseAndCleanup);
                this.removeEventListener("error", maybeCloseAndCleanup);
            }
            this.addEventListener("open", maybeCloseAndCleanup);
            this.addEventListener("error", maybeCloseAndCleanup);
        }
    }

    send(data: string) {
        this._connection?.send_text(data);
    }

    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
    ) {
        if (!this._eventListeners.has(type))
            this._eventListeners.set(type, new Set());
        this._eventListeners.get(type)?.add(listener);
    }

    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
    ) {
        this._eventListeners.get(type)?.delete(listener);
    }

    private _dispatchEvent(type: string, options?: WSEventOptions) {
        this.dispatchEvent({ type, ...options } as unknown as Event);
    }

    dispatchEvent(event: Event) {
        for (const listener of this._eventListeners.get(event.type) ?? []) {
            if ("handleEvent" in listener)
                listener.handleEvent(event);
            else
                listener.call(this, event);
        }
        return true;  // not canceled (canceling not supported)
    }
}

globalThis.WebSocket = WebSocketShim;
