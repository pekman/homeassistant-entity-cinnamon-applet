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
        public timeout_ms: number,
        public minCallInterval_ms: number = 0,
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
            // call with timeout
            try {
                await Promise.race([
                    this.f.apply(this.thisArg, nextCallArgs),
                    new Promise((_resolve, reject) => setTimeout(
                        () => reject(new Timeout()),
                        this.timeout_ms,
                    )),
                ]);
            } catch (err) {
                this.onerror?.(err, nextCallArgs);
            }

            // delay between calls
            if (this.minCallInterval_ms > 0) {
                await new Promise((resolve) => setTimeout(
                    resolve,
                    this.minCallInterval_ms,
                ));
            }

            nextCallArgs = this._enqueuedCallArgs;
            this._enqueuedCallArgs = undefined;
        } while (nextCallArgs);

        this._busy = false;
    }
}
