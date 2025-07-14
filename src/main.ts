import { uuid } from "../assets/metadata.json";
import { connectToHass, EntityWatcher, type State } from "./connection";
import * as log from "./log";

const { EVENT_PROPAGATE, EVENT_STOP, ScrollDirection } = imports.gi.Clutter;
const { IconApplet } = imports.ui.applet;
const { AppletSettings } = imports.ui.settings;


class HAEntityApplet extends IconApplet {
    private _settings: imports.ui.settings.AppletSettings;
    private _entityWatcher?: EntityWatcher | null;

    constructor(
        orientation: imports.gi.St.Side,
        panel_height: number,
        instanceId: number,
    ) {
        super(orientation, panel_height, instanceId);

        this.actor.connect("scroll-event", this._on_applet_scrolled.bind(this));

        this.set_applet_icon_name("image-loading");

        this._settings = new AppletSettings(this, uuid, instanceId);
        this._settings.connect("settings-changed", () => this._reload());
    }

    private async _reload() {
        this.set_applet_tooltip(this._("Connecting…"));
        this._closeConnection();

        const hassUrl = this._settings.getValue("hassUrl");
        const accessToken = this._settings.getValue("hassAccessToken");
        const entity = this._settings.getValue("entity");

        if (typeof hassUrl !== "string" ||
            typeof accessToken !== "string" ||
            typeof entity !== "string"
        ) {
            log.error("Invalid configuration");
            return;
        }
        if (accessToken === "" ||
            entity === "" ||
            hassUrl === "" ||
            hassUrl === this._settings.getDefaultValue("hassUrl")
        ) {
            log.error("Not configured");
            return;
        }

        let entityWatcher;
        try {
            entityWatcher = await connectToHass(
                hassUrl,
                accessToken,
                entity,
            );
        } catch (err) {
            log.error("Error connecting to Home Assistant", err);
            return;
        }

        if (this._entityWatcher) {
            // If we had multiple connection attempts executing
            // simultaneously, and one of them has already connected,
            // throw away this connection. (This can easily happen
            // when configuration is being changed.)
            entityWatcher.close();
            return;
        }

        entityWatcher.onUpdate = this._onEntityUpdate.bind(this);
        this._entityWatcher = entityWatcher;

        this.set_applet_tooltip(this._("Connected"));
    }

    private _closeConnection() {
        if (this._entityWatcher) {
            log.log("Closing Home Assistant connection");
            this._entityWatcher.close();
            this._entityWatcher = null;
        }
    }

    private _onEntityUpdate(state: State) {
        const msg =
            state.state === "on" ? this._("On") :
            state.state === "off" ? this._("Off") :
            state.state === "unavailable" ? this._("Unavailable")
            : state.state;
        this.set_applet_tooltip(msg);
    }

    override on_applet_added_to_panel() {
        this._reload();
    }

    override on_applet_removed_from_panel() {
        this._closeConnection();
    }

    override on_applet_clicked(): boolean {
        this._entityWatcher?.clickAction();
        return true;
    }

    private _on_applet_scrolled(
        _actor: imports.gi.St.Widget,
        event: imports.gi.Clutter.Event,
    ) {
        let delta: number;
        switch (event.get_scroll_direction()) {
            case ScrollDirection.UP:
                delta = 1;
                break;
            case ScrollDirection.DOWN:
                delta = -1;
                break;
            default:
                return EVENT_PROPAGATE;
        }

        let multiplier = this._settings.getValue("scrollMultiplier");
        if (typeof multiplier === "number")
            delta *= multiplier;
        this._entityWatcher?.scrollAction(delta);
        return EVENT_STOP;
    }
}

const main = (
    _metadata: unknown,
    ...args: ConstructorParameters<typeof HAEntityApplet>
) => new HAEntityApplet(...args);

export default main;
