interface ServiceCallInfo {
    domain: string;
    service: string;
    service_data?: { [key: string]: unknown };
}

interface ServiceCall extends ServiceCallInfo {
    type: "call_service";
    target: { entity_id: string };
}

interface EntityDomainInfo {
    click?: ServiceCallInfo;
    adjust?: ServiceCallInfo;
}

interface TemplateValues {
    [key: string]: unknown;
}

const defaultServiceCalls: EntityDomainInfo = {
//{ [domain: string]: ServiceCallInfo | null } = {
    click: {
        domain: "homeassistant",
        service: "toggle",
    },
};

const domainInfo = new Map<string, EntityDomainInfo>();

class TemplateKey {
    constructor(public readonly key: string) {}
}

domainInfo.set("light", {
    adjust: {
        domain: "light",
        service: "turn_on",
        service_data: {
            brightness_step_pct: new TemplateKey("delta"),
        },
    },
});

domainInfo.set("button", {
    click: {
        domain: "button",
        service: "press",
    },
});

domainInfo.set("automation", {
    click: {
        domain: "automation",
        service: "trigger",
    },
});

function renderTemplate(template: TemplateKey, values: TemplateValues): unknown;
function renderTemplate<T>(template: T, values: TemplateValues): T;
function renderTemplate(template: unknown, values: TemplateValues): unknown {
    if (template instanceof TemplateKey) {
        return values[template.key];
    }
    else if (template != null && typeof template === "object") {
        const result: { [key: string]: unknown } = {};
        for (const [key, value] of Object.entries(template))
            result[key] = renderTemplate(value, values);
        return result;
    }
    else if (template instanceof Array) {
        return template.map((item) => renderTemplate(item, values));
    }
    else {
        return template;
    }
}

export function createServiceCall(
    action: keyof EntityDomainInfo,
    entity_id: string,
    values: TemplateValues = {},
): ServiceCall | null {
    const domain = /^(\w+)\./.exec(entity_id)?.[1];
    if (!domain)
        throw new Error("Invalid entity_id");
    const perDomainValues =
        domainInfo.get(domain)?.[action] ??
        defaultServiceCalls[action];
    if (!perDomainValues)
        return null;

    return {
        type: "call_service" as const,
        ...renderTemplate(perDomainValues, values),
        target: { entity_id },
    }
}
