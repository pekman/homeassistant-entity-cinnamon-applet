import * as log from "./log";

const Gio = imports.gi.Gio;


/**
 * Listen to network-connectivity-related system events.
 *
 * Events:
 * - sleep: before system sleep
 * - wakeup: after system woke up from sleep
 * - networkConnectivityChanged: network connectivity state changed
 */
export class NetworkConnectivityListener {
    private readonly _eventListeners = {
        sleep: new Set<() => void>(),
        wakeup: new Set<() => void>(),
        networkConnectivityChanged: new Set<() => void>(),
    } as const;
    private _systemBus?: imports.gi.Gio.DBusConnection;

    constructor() {
        // Monitor system sleep/wakeup
        // (based on https://bbs.archlinux.org/viewtopic.php?id=238749 )
        Gio.bus_get(Gio.BusType.SYSTEM, null, (_, result) => {
            try {
                this._systemBus = Gio.bus_get_finish(result);
            } catch (err) {
                log.error("DBus connection error", err);
                log.warn("Unable to track system suspend/resume");
                return;
            }
            // see https://www.freedesktop.org/software/systemd/man/latest/org.freedesktop.login1.html
            this._systemBus.signal_subscribe(
                "org.freedesktop.login1",  // sender
                "org.freedesktop.login1.Manager",  // interface_name
                "PrepareForSleep",  // member
                "/org/freedesktop/login1",  // object_path
                null,  // arg0
                Gio.DBusSignalFlags.NONE,  // flags
                (_conn, _sender, _objpath, _intf, _sig, parameters) => {
                    const isBeforeSleep =
                        parameters.get_child_value(0).get_boolean();
                    log.log(`System ${
                            isBeforeSleep ? "going to" : "woke up from"
                        } sleep`);
                    const eventType = isBeforeSleep ? "sleep" : "wakeup";
                    for (const listener of this._eventListeners[eventType])
                        listener();
                });
        });

        // Monitor network connectivity
        const netmon = Gio.NetworkMonitor.get_default();
        netmon.connect("notify::connectivity", () => {
            const [asStr] = Object.entries(Gio.NetworkConnectivity).find(
                ([, val]) => val === netmon.connectivity
            ) ?? ["unknown"];
            log.log(`Network connectivity changed to ${asStr}`);

            for (const listener of
                 this._eventListeners.networkConnectivityChanged)
            {
                listener();
            }
        });
    }

    addEventListener(
        type: keyof NetworkConnectivityListener["_eventListeners"],
        listener: () => void,
    ) {
        this._eventListeners[type]?.add(listener);
    }

    removeEventListener(
        type: keyof NetworkConnectivityListener["_eventListeners"],
        listener: () => void,
    ) {
        this._eventListeners[type]?.delete(listener);
    }
}
