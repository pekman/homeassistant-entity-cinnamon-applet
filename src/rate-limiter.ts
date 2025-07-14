export class Timeout extends Error {
    constructor() {
        super("Timeout");
    }
}

/**
 * Prevent multiple simultaneous async calls.
 *
 * If a call is made when another is still pending, it is scheduled
 * for execution. Only the latest scheduled call is executed; others
 * are ignored. Suitable for calls that set a value.
 */
export class RateLimiter<ArgsT extends unknown[]> {
    private _busy = false;
    private _enqueuedCallArgs?: ArgsT | undefined;

    constructor(
        public readonly thisArg: unknown,
        public readonly f: (...args: ArgsT) => Promise<void>,
        public timeoutMilliseconds: number,
        public onerror?: (error: unknown, callArgs: ArgsT) => void,
    ) {}

    async call(...args: ArgsT): Promise<void> {
        if (this._busy) {
            this._enqueuedCallArgs = args;
            return;
        }

        this._busy = true;

        let nextCallArgs: ArgsT | undefined = args;
        do {
            try {
                await Promise.race([
                    this.f.apply(this.thisArg, nextCallArgs),
                    new Promise((_resolve, reject) => setTimeout(
                        () => reject(new Timeout()),
                        this.timeoutMilliseconds,
                    )),
                ]);
            } catch (err) {
                this.onerror?.(err, nextCallArgs);
            }

            nextCallArgs = this._enqueuedCallArgs;
            this._enqueuedCallArgs = undefined;
        } while (nextCallArgs);

        this._busy = false;
    }
}
