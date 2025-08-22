import readline from 'readline';
import { Logger } from '$logger';
import { DeferredPromise } from '$utils/DeferredPromise';
import { shallowCompareObjects } from '$utils/compareObjects';
import chalk from 'chalk';
const logger = new Logger("confirm");

let instance: SigintConfirm | null = null;

export class SigintConfirm {
    get sigintCancelPromise() { return this._sigintCancelPromise; }
    private _sigintCancelPromise: DeferredPromise<void> = new DeferredPromise();

    get inSigintMode() { return this._inSigintMode; }
    private _inSigintMode: boolean = false;

    constructor() {
        if (instance)
            return instance;
        else
            instance = this;

        let logLevelBeforeSigint = Logger.getLogLevel();
        const replaceSigintPromiseCb = () => {
            this._sigintCancelPromise = new DeferredPromise();
            this._sigintCancelPromise.then(replaceSigintPromiseCb);
        };
        replaceSigintPromiseCb();

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
                    this._sigintCancelPromise.resolve();
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

                return;
            }

            process.exit();
        });
    }


}