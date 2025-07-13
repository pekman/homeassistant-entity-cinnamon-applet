import { uuid } from "../assets/metadata.json";
import { connectToHass, EntityWatcher } from "./connection";
import * as log from "./log";

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

    override on_applet_added_to_panel() {
        this._reload();
    }

    override on_applet_removed_from_panel() {
        this._closeConnection();
    }

    override on_applet_clicked(): boolean {
        return true;
    }
}

const main = (
    _metadata: unknown,
    ...args: ConstructorParameters<typeof HAEntityApplet>
) => new HAEntityApplet(...args);

export default main;
