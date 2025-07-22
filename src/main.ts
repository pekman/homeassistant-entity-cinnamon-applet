import { uuid } from "../assets/metadata.json";
import { hassUrl as hassUrlSetting } from "../assets/settings-schema.json";
import {
    connectToHass,
    type EntityController,
    type State,
} from "./entity-controller";
import * as log from "./log";

const { EVENT_PROPAGATE, EVENT_STOP, ScrollDirection } = imports.gi.Clutter;
const { CURRENT_TIME } = imports.gi.Gdk;
const { PathBuf } = imports.gi.GLib;
const { IconTheme, show_uri_on_window } = imports.gi.Gtk;
const { IconApplet, MenuItem } = imports.ui.applet;
const { AppletSettings } = imports.ui.settings;


const ICON_DIR = "mdi-icons";

const UNCONFIGURED_ICON = "system-run";
const ERROR_ICON = "dialog-error";
const OPEN_URL_MENU_ICON = "web-browser";


const isValidHassUrl = (url: unknown) =>
    typeof url === "string" &&
    /^https?:\/\//.test(url) &&
    url !== hassUrlSetting.default;


class HAEntityApplet extends IconApplet {
    private _settings: imports.ui.settings.AppletSettings;
    private _entityController?: EntityController | null;
    private _hasValidSettings = false;

    constructor(
        orientation: imports.gi.St.Side,
        panel_height: number,
        instanceId: number,
    ) {
        super(orientation, panel_height, instanceId);

        this.actor.connect("scroll-event", this._on_applet_scrolled.bind(this));

        this._settings = new AppletSettings(this, uuid, instanceId);
        this._settings.connect("settings-changed", () => this._reload());

        const openHassMenuItem = new MenuItem(
            this._("Open Home Assistant in web browser"),
            OPEN_URL_MENU_ICON,
            () => {
                const url = this._settings.getValue("hassUrl");
                if (isValidHassUrl(url)) {
                    try {
                        show_uri_on_window(null, url, CURRENT_TIME);
                    } catch (err) {
                        log.error(`Error opening URL: ${url}`, err);
                    }
                }
                else {
                    log.warn(`Cannot open invalid URL: ${url}`);
                }
            },
        );
        this._applet_context_menu.addMenuItem(openHassMenuItem);
    }

    private get _onIcon(): string {
        return this._settings.getValue("onIcon");
    }
    private get _offIcon(): string {
        return this._settings.getValue("differentOffIcon")
            ? this._settings.getValue("offIcon")
            : this._onIcon;
    }
    private get _unavailableIcon(): string {
        return this._settings.getValue("differentUnavailableIcon")
            ? this._settings.getValue("unavailableIcon")
            : this._offIcon;
    }

    private _setIcon(iconNameOrPath: string) {
        if (iconNameOrPath.includes("/"))
            this.set_applet_icon_symbolic_path(iconNameOrPath);
        else
            this.set_applet_icon_symbolic_name(iconNameOrPath);
    }

    private async _reload() {
        this._closeConnection();

        const hassUrl = this._settings.getValue("hassUrl");
        const accessToken = this._settings.getValue("hassAccessToken");
        const entity = this._settings.getValue("entity");

        if (typeof hassUrl !== "string" ||
            typeof accessToken !== "string" ||
            typeof entity !== "string"
        ) {  // this shouldn't be possible if configured in config UI
            log.error("Invalid configuration");
            this.set_applet_tooltip(this._("Invalid configuration"));
            this._setIcon(ERROR_ICON);
            this._hasValidSettings = false;
            return;
        }
        if (accessToken === "" || entity === "" || !isValidHassUrl(hassUrl)) {
            this.set_applet_tooltip(this._(
                "Not configured or invalid configuration. Click to configure."
            ));
            this._setIcon(UNCONFIGURED_ICON);
            this._hasValidSettings = false;
            return;
        }

        this._hasValidSettings = true;

        this.set_applet_tooltip(this._("Connecting…"));
        this._setIcon(this._unavailableIcon);

        let entityController;
        try {
            entityController = await connectToHass(
                hassUrl,
                accessToken,
                entity,
            );
        } catch (err) {
            log.error("Error connecting to Home Assistant", err);
            return;
        }

        if (this._entityController) {
            // If we had multiple connection attempts executing
            // simultaneously, and one of them has already connected,
            // throw away this connection. (This can easily happen
            // when configuration is being changed.)
            entityController.close();
            return;
        }

        entityController.onUpdate = this._onEntityUpdate.bind(this);
        this._entityController = entityController;

        this.set_applet_tooltip(this._("Connected"));
    }

    private _closeConnection() {
        if (this._entityController) {
            log.log("Closing Home Assistant connection");
            this._entityController.close();
            this._entityController = null;
        }
    }

    private _onEntityUpdate(state: State) {
        let tooltip: string;
        let icon: string;
        switch (state.state) {
            case "on":
                tooltip = this._entityController?.formattedStateValue ??
                    this._("On");
                icon = this._onIcon;
                break;
            case "off":
                tooltip = this._("Off");
                icon = this._offIcon;
                break;
            case "unavailable":
                tooltip = this._("Unavailable");
                icon = this._unavailableIcon;
                break;
            default:
                tooltip = state.state;
                icon = this._onIcon;  // some other state; treat it as "on"
                break;
        }

        const name: string = this._settings.getValue("name");
        if (name !== "")
            tooltip = `${name} · ${tooltip}`;

        this.set_applet_tooltip(tooltip);
        this._setIcon(icon);
    }

    override on_applet_added_to_panel() {
        this._reload();
    }

    override on_applet_removed_from_panel() {
        this._closeConnection();
    }

    override on_applet_clicked(): boolean {
        if (this._hasValidSettings)
            this._entityController?.clickAction();
        else
            this.configureApplet();
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

        const multiplier = this._settings.getValue("scrollMultiplier");
        if (typeof multiplier === "number")
            delta *= multiplier;
        this._entityController?.scrollAction(delta);
        return EVENT_STOP;
    }
}

function main(
    metadata: imports.ui.applet.AppletMetadata,
    ...args: ConstructorParameters<typeof HAEntityApplet>
) {
    // add Home Assistant icons to icon path
    const path = new PathBuf();
    path.push(metadata.path);
    path.push(ICON_DIR);
    const iconPath = path.to_path();
    const iconTheme = IconTheme.get_default();
    if (iconPath && !(iconTheme.get_search_path() ?? []).includes(iconPath)) {
        // Using a "legacy feature" of the search path. This allows us
        // to simply have the icons directly in the directory. The
        // proper way would be to create an `index.theme` file and
        // some kind of directory structure.
        iconTheme.append_search_path(iconPath);
    }

    return new HAEntityApplet(...args);
};

export default main;
