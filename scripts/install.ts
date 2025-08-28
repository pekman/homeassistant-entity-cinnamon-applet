import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import util from "node:util";

import metadataJson from "../assets/metadata.json" with { type: "json" };


const { values: {
    help, symlink, "dry-run": dryRun,
}} = util.parseArgs({ options: {
    help: {
        type: "boolean",
        short: "h",
    },
    symlink: {
        type: "boolean",
        short: "s",
    },
    "dry-run": {
        type: "boolean",
        short: "n",
    },
}});
if (help) {
    console.log(
        "usage: npm run install [ -- [ --symlink | -s ] [ --dry-run | -n ] ]");
    process.exit();
}


// eslint-disable-next-line  @typescript-eslint/no-explicit-any
function doOrDryRun<T extends (...args: any[]) => void>(
    f: T,
    ...args: Parameters<T>
) {
    if (dryRun) {
        console.log(
            "%s(%s)",
            f.name.replace(/Sync$/, ""),
            util.inspect(args, { colors: true }).replace(/^\[(.*)\]\s*$/s, "$1"),
        )
    }
    else {
        f(...args);
    }
}

const xdg_data_home = process.env.XDG_DATA_HOME ??
    path.join(os.homedir(), ".local/share");
const appletDir = path.join(
    xdg_data_home, "cinnamon/applets", metadataJson.uuid);

let stat = null;
try {
    stat = fs.lstatSync(appletDir);
} catch (err) {
    if (typeof err !== "object" || err == null ||
        !("code" in err) || err.code !== "ENOENT"
    ) {
        throw err;
    }
}
if (stat) {  // appletDir exists
    console.info("Deleting old applet directory");
    doOrDryRun(fs.rmSync, appletDir, { recursive: !stat.isSymbolicLink() });
}

if (symlink) {
    const target = path.resolve(import.meta.dirname, "../dist");
    console.info("Creating symlink to %o", target);
    console.warn("Note: This is meant for development only!");
    doOrDryRun(fs.symlinkSync, target, appletDir);
}
else {
    console.info("Installing…");
    doOrDryRun(fs.mkdirSync, appletDir);
    doOrDryRun(
        fs.cpSync,
        path.resolve(import.meta.dirname, "../dist"),
        appletDir,
        { recursive: true });
}
console.info("Done. Cinnamon needs restart.");
