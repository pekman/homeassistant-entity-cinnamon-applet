interface ServiceCallInfo {
    domain: string;
    service: string;
    service_data?: { [key: string]: unknown };
}

interface ServiceCall extends ServiceCallInfo {
    type: "call_service";
    target: { entity_id: string };
}

interface SimpleAction {
    createServiceCall(entity_id: string): ServiceCall;
}

interface AttributeAction {
    readonly attribute: string;
    readonly min?: number;
    readonly max?: number;
    readonly defaultIfUnset: number;

    createServiceCall(entity_id: string, value: number): ServiceCall;
    formatValue?(value: unknown): string | undefined;
}

type Action = SimpleAction | AttributeAction;

export interface EntityDomainInfo {
    readonly click?: Action;
    readonly adjust?: Action;
}

function createServiceCallBase(entity_id: string) {
    return {
        type: "call_service" as const,
        target: { entity_id },
    }
}

const defaultClickAction: EntityDomainInfo = {
    // Click action suitable for many entity domains. Even when not
    // supported, should simply do nothing and return an error.
    click: {
        createServiceCall: (entity_id: string) => ({
            ...createServiceCallBase(entity_id),
            domain: "homeassistant",
            service: "toggle",
        }),
    },
}

function tryFormatPercentage(this: AttributeAction, value: unknown) {
    if (typeof value === "number" &&
        this.max && (this.min === 0 || this.min === -this.max)
    ) {
        const formatter = new Intl.NumberFormat(
            undefined,  // use default locale
            { maximumFractionDigits: 0 });
        return formatter.format(100 * value / this.max) + "%";
    }
    return undefined;
}

const domainInfo = new Map<string, EntityDomainInfo>();

domainInfo.set("light", {
    ...defaultClickAction,

    adjust: {
        attribute: "brightness",
        min: 0,
        max: 255,
        defaultIfUnset: 0,  // null means light is off

        createServiceCall: (entity_id: string, brightness: number) => ({
            ...createServiceCallBase(entity_id),
            domain: "light",
            service: brightness > 0 ? "turn_on" : "turn_off",
            service_data: brightness > 0 ? { brightness } : {},
        }),

        formatValue: tryFormatPercentage,
    },
});

export const getServiceCallInfo = (entityDomain: string) =>
    domainInfo.get(entityDomain) ?? defaultClickAction;
