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

    private readonly _entityDomain: string;
    private _collection: Collection<State>;

    constructor(
        private _conn: Connection,
        public readonly entity_id: string,
    ) {
        const domain = /^(\w+)\./.exec(this.entity_id)?.[1];
        if (!domain)
            throw new Error("Invalid entity ID");
        this._entityDomain = domain;

        this._collection = getCollection(
            _conn,
            "_entityState",
            async (conn) => {
                const states = await conn.sendMessagePromise({
                    type: "get_states",
                    // TODO: is entity_id allowed?
                });
                // log.log("states " + JSON.stringify(states));
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
                    log.log("event: " + JSON.stringify(event));
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
            log.log(JSON.stringify(state))
            this.onUpdate?.(state);
        });
    }

    close() {
        this._conn.close();
    }

    clickAction() {
        const msg = createServiceCall("click", this.entity_id);
        if (msg) {
            log.log("Sending message: " + JSON.stringify(msg));
            this._conn.sendMessage(msg);
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
