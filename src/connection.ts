import {
    createConnection,
    createLongLivedTokenAuth,
    getCollection,
    type Collection,
    type Connection,
} from "home-assistant-js-websocket";
import * as log from "./log";
import "./websocket-shim";
import { EntityDomainInfo, getServiceCallInfo } from "./entity-domains";
import { RateLimiter } from "./rate-limiter";

const CALL_TIMEOUT_ms = 250;

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
    private readonly _expectedAttrValues = new Map<string, number>();

    private _callRateLimiter = new RateLimiter(
        this._conn,
        this._conn.sendMessagePromise,
        CALL_TIMEOUT_ms,
    );

    constructor(
        private readonly _conn: Connection,
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
            for (const [attr, val] of [...this._expectedAttrValues]) {
                if (state.attributes[attr] === val)
                    this._expectedAttrValues.delete(attr);
            }
            this.onUpdate?.(state);
        });
    }

    close() {
        this._conn.close();
    }

    clickAction() {
        this._action("click");
    }

    scrollAction(delta: number) {
        this._action("adjust", delta);
    }

    get formattedStateValue() {
        return this._getFormattedAttributeValue("adjust");
    }

    private _getFormattedAttributeValue(action: keyof EntityDomainInfo) {
        const actionInfo = getServiceCallInfo(this._entityDomain)?.[action];
        if (!actionInfo ||
            !("attribute" in actionInfo) ||
            !("formatValue" in actionInfo)
        ) {
            return undefined;
        }
        const val = this.state.attributes?.[actionInfo.attribute];
        return actionInfo.formatValue(val);
    }

    private _adjustAttributeValue(
        attrName: string,
        delta: number,
        lowerLimit: number,
        upperLimit: number,
        defaultIfUnset: number,
    ): number {
        const attrs = this.state.attributes;
        const curVal = attrs && typeof attrs[attrName] === "number"
            ? this._expectedAttrValues.get(attrName) ?? attrs[attrName]
            : defaultIfUnset;
        const newVal = curVal + delta;
        const clamped = Math.min(upperLimit, Math.max(lowerLimit, newVal));
        this._expectedAttrValues.set(attrName, clamped);
        return clamped;
    }

    private _action(action: keyof EntityDomainInfo, delta?: number) {
        const actionInfo = getServiceCallInfo(this._entityDomain)?.[action];
        if (!actionInfo)
            return;

        let msg;
        if ("attribute" in actionInfo) {
            const newVal = this._adjustAttributeValue(
                actionInfo.attribute,
                delta ?? 0,
                actionInfo.min ?? -Infinity,
                actionInfo.max ?? Infinity,
                actionInfo.defaultIfUnset);

            msg = actionInfo.createServiceCall(this.entity_id, newVal);
        }
        else {
            msg = actionInfo.createServiceCall(this.entity_id);
        }

        this._callRateLimiter.call(msg);
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
