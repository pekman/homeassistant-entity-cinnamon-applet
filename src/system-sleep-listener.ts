import * as log from "./log";

const Gio = imports.gi.Gio;


export class SystemSleepListener {
    private _systemBus?: imports.gi.Gio.DBusConnection;
    private readonly _eventListeners = {
        sleep: new Set<() => void>(),
        wakeup: new Set<() => void>(),
    };

    constructor() {
        // based on https://bbs.archlinux.org/viewtopic.php?id=238749
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
    }

    addEventListener(
        type: keyof SystemSleepListener["_eventListeners"],
        listener: () => void,
    ) {
        this._eventListeners[type]?.add(listener);
    }

    removeEventListener(
        type: keyof SystemSleepListener["_eventListeners"],
        listener: () => void,
    ) {
        this._eventListeners[type]?.delete(listener);
    }
}
