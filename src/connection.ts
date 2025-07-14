import {
    createConnection,
    createLongLivedTokenAuth,
    getCollection,
    type Collection,
    type Connection,
} from "home-assistant-js-websocket";
import * as log from "./log";
import "./websocket-shim";
import { createServiceCall } from "./entity-types";

export interface State {
    entity_id: string;
    state: string;
    attributes: { [attr: string]: unknown };
}

interface HassEvent {
    variables?: {
        trigger?: {
            to_state?: State;
        };
    };
}

export class EntityWatcher {
    onUpdate?: (state: State) => void;

    get state() {
        return this._collection.state;
    }

    private _collection: Collection<State>;

    constructor(
        private _conn: Connection,
        public readonly entity_id: string,
    ) {
        this._collection = getCollection(
            _conn,
            "_entityState",
            async (conn) => {
                const states = await conn.sendMessagePromise({
                    type: "get_states",
                    // TODO: is entity_id allowed?
                });
                if (!states || !(states instanceof Array))
                    throw new Error("Invalid response from Home Assistant");
                for (const state of states) {
                    if (state && typeof state === "object" &&
                        state.entity_id === entity_id
                    ) {
                        return state;
                    }
                }
                return null;
            },
            (conn, store) => conn.subscribeMessage(
                store.action((_state: unknown, event: HassEvent | null) => {
                    if (event == null) {
                        return null;  // no change
                    }
                    const trigger = event.variables?.trigger;
                    if (typeof trigger !== "object" || !trigger ||
                        !("entity_id" in trigger) ||
                        trigger.entity_id !== entity_id ||
                        !("to_state" in trigger) ||
                        typeof trigger.to_state !== "object"
                    ) {
                        return null;
                    }
                    return trigger.to_state;
                }),
                {
                    type: "subscribe_trigger",
                    trigger: {
                        platform: "state",
                        entity_id,
                    },
                }),
        );

        this._collection.subscribe((state) => {
            this.onUpdate?.(state);
        });
    }

    close() {
        this._conn.close();
    }

    clickAction() {
        this._callServiceMaybe("click");
    }

    scrollAction(delta: number) {
        this._callServiceMaybe("adjust", { delta });
    }

    private async _callServiceMaybe(
        action: Parameters<typeof createServiceCall>[0],
        values?: Parameters<typeof createServiceCall>[2],
    ) {
        const msg = createServiceCall(action, this.entity_id, values);
        if (msg) {
            // log.log("Sending message: " + JSON.stringify(msg));
            this._conn.sendMessage(msg);
            // try {
            //     const response = await this._conn.sendMessagePromise(msg);
            //     log.log("Service call response:" + JSON.stringify(response));
            // } catch (err) {
            //     log.error("Service call returned error: " + JSON.stringify(err));
            // }
        }
    }
}

export async function connectToHass(
    hassUrl: string,
    accessToken: string,
    entityId: string,
) {
    if (hassUrl.endsWith("/"))
        hassUrl = hassUrl.slice(0, -1);
    const auth = createLongLivedTokenAuth(hassUrl, accessToken);
    log.log(`Connecting to ${hassUrl}`);
    const conn = await createConnection({ auth });
    log.log(`Connected to ${hassUrl}`);
    return new EntityWatcher(conn, entityId);
}
