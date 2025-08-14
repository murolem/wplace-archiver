import readline from 'readline';
import { Logger } from '$logger';
import { DeferredPromise } from '$utils/DeferredPromise';
import { shallowCompareObjects } from '$utils/compareObjects';
import chalk from 'chalk';
const logger = new Logger("sigint-confirm");

let instance: SigintConfirm | null = null;

export class SigintConfirm {
    get sigintPromise() { return this._sigintPromise; }
    private _sigintPromise: DeferredPromise<void> = new DeferredPromise();

    get inSigintMode() { return this._inSigintMode; }
    private _inSigintMode: boolean = false;

    constructor() {
        if (instance)
            return instance;
        else
            instance = this;

        let logLevelBeforeSigint = Logger.getLogLevel();
        this._sigintPromise = new DeferredPromise<void>();
        const replaceSigintPromiseCb = () => {
            this._sigintPromise = new DeferredPromise();
            this._sigintPromise.then(replaceSigintPromiseCb);
        };
        this._sigintPromise.then(replaceSigintPromiseCb);

        readline.emitKeypressEvents(process.stdin);
        // if (process.stdin.isTTY)
        //     process.stdin.setRawMode(true);

        let lastStdinKeypress: {
            sequence: string,
            name: string,
            ctrl: boolean,
            meta: boolean,
            shift: boolean,
        } | null = null;
        process.stdin.on('keypress', (_, keypress) => {
            lastStdinKeypress = keypress ?? null;

            if (this._inSigintMode && keypress) {
                if (keypress.name == 'enter') {
                    this._inSigintMode = false;
                    logger.log('SIGINT', `Resuming.`);
                    Logger.setLogLevel(logLevelBeforeSigint);
                    this._sigintPromise.resolve();
                } else if (lastStdinKeypress !== null && shallowCompareObjects(keypress, lastStdinKeypress)) {
                    process.exit();
                }
            }
        });

        process.on('SIGINT', () => {
            if (!this._inSigintMode) {
                this._inSigintMode = true;
                logLevelBeforeSigint = Logger.getLogLevel();
                Logger.setLogLevel('SIGINT');
                logger.log('SIGINT', `${chalk.bold('Press again')} to exit or press ${chalk.bold("Enter")} to resume.`);

                this._sigintPromise = new DeferredPromise();
                return;
            }

            process.exit();
        });
    }


}