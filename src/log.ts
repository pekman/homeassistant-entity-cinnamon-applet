import { uuid } from "../assets/metadata.json";

const PREFIX = `[${uuid}]: `;

export const log = (msg: string) => global.log(PREFIX + msg);
export const warn = (msg: string) => global.logWarning(PREFIX + msg);

// logError has wrong type declaration in @ci-types/cjs
type FixedLogErrorType = (arg1: unknown, ...args: unknown[]) => void
const _logError = global.logError as FixedLogErrorType;

export const error = (msg: string, error?: unknown) =>
    error == null
    ? _logError(PREFIX + msg) :
    typeof error === "object" && error instanceof imports.gi.GLib.Error
    ? _logError(error, PREFIX + msg) :
    typeof error === "object" && "message" in error
    ? _logError(`${PREFIX}${msg}: ${error.message}`)
    : _logError(`${PREFIX}${msg}: ${error}`);
