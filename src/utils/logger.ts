import chalk from 'chalk';

export const logLevels = {
    "DEBUG": 0,
    "INFO": 1,
    "WARN": 2,
    "ERROR": 3,
    "FATAL": 4,
    "SIGINT": 5
}

const logLevelToDisplay: Record<LogLevel, string> = {
    DEBUG: "debug",
    INFO: " info",
    WARN: " warn",
    ERROR: "error",
    FATAL: "fatal",
    SIGINT: "sigint",
}

const logLevelToColorFn: Record<LogLevel, (msg: Message) => Message> = {
    DEBUG: msg => chalk.gray(msg),
    INFO: msg => msg,
    WARN: msg => chalk.yellow(msg),
    ERROR: msg => chalk.red(msg),
    FATAL: msg => chalk.bgRed(msg),
    SIGINT: msg => chalk.bgMagenta(msg),
}

export type LogLevel = keyof typeof logLevels;

let logLevel: LogLevel = 'INFO';
let logLevelNum = logLevels[logLevel];

export type Message = string;

export type MessageParams = {
    msg: Message,

    /** Whether to generate an standard error after a log message. */
    throw?: boolean,

    /** Extra data to log after a log message. */
    data?: unknown,

    /**
     * Whether to stringify extra data. Has no effect if data is undefined.
     * 
     * Uses `JSON.stringify(data, null, 4)`.
     */
    stringifyData?: boolean
}

const defaultMsgParams: MessageParams = {
    msg: ''
}

/** Type for the message argument. */
export type MessageOrParams = Message | MessageParams;

export class Logger {
    get logPrefix() { return this._logPrefix; }
    set logPrefix(value) {
        this._logPrefix = value;
    }
    private _logPrefix: string;

    constructor(logPrefix: string) {
        this._logPrefix = logPrefix;
    }

    /** Set global log level. */
    static setLogLevel(level: LogLevel): void {
        logLevel = level;
        logLevelNum = logLevels[logLevel];
    }

    /** Get current log level. */
    static getLogLevel(): LogLevel {
        return logLevel;
    }

    /** Set instance log prefix. */
    setLogPrefix = (prefix: string): this => {
        this.logPrefix = prefix;
        return this;
    }

    log = (level: LogLevel, messageOrParams: MessageOrParams, ...extraMessages: unknown[]): void => {
        if (logLevels[level] < logLevelNum) {
            return;
        }

        const isParams = typeof messageOrParams === 'object';

        const mainMessage: string = isParams
            ? messageOrParams.msg
            : messageOrParams;

        const params: MessageParams = isParams
            ? messageOrParams
            : defaultMsgParams

        let logMethod: (...data: unknown[]) => void;
        if (level === 'DEBUG' || level === 'INFO') {
            logMethod = console.log;
        } else if (level === 'WARN') {
            logMethod = console.warn;
        } else if (level === 'ERROR' || level === 'FATAL') {
            logMethod = console.error;
        } else {
            logMethod = console.log;
        }

        const colorFn = logLevelToColorFn[level];

        const mainMessageRows = mainMessage.split("\n");
        for (let i = 0; i < mainMessageRows.length; i++) {
            logMethod(colorFn(`${chalk.bold(logLevelToDisplay[level])}: [${this.logPrefix}] ${mainMessageRows[i]}`));
        }

        if (extraMessages.length > 0) {
            logMethod(...extraMessages);
        }

        if (params.data !== undefined) {
            if (params.stringifyData) {
                logMethod(JSON.stringify(params.data, null, 4));
            } else {
                logMethod(params.data);
            }
        }

        if (params.throw) {
            throw new Error("see previous message");
        }
    }

    logDebug = (messageOrParams: MessageOrParams, ...extraMessages: unknown[]): void => {
        this.log('DEBUG', messageOrParams, ...extraMessages);
    }

    logInfo = (messageOrParams: MessageOrParams, ...extraMessages: unknown[]): void => {
        this.log('INFO', messageOrParams, ...extraMessages);
    }

    logWarn = (messageOrParams: MessageOrParams, ...extraMessages: unknown[]): void => {
        this.log('WARN', messageOrParams, ...extraMessages);
    }

    logError = (messageOrParams: MessageOrParams, ...extraMessages: unknown[]): void => {
        this.log('ERROR', messageOrParams, ...extraMessages);
    }

    logFatal = (messageOrParams: MessageOrParams, ...extraMessages: unknown[]): void => {
        this.log('FATAL', messageOrParams, ...extraMessages);
    }

    logFatalAndThrow = (messageOrParams: Message | Omit<MessageParams, 'throw'>, ...extraMessages: unknown[]): never => {
        if (typeof messageOrParams === 'string') {
            this.log('FATAL', {
                msg: messageOrParams,
                throw: true
            }, ...extraMessages);
        } else {
            this.log('FATAL', {
                ...messageOrParams,
                throw: true
            }, ...extraMessages);
        }

        // should not happen unless logger logic gets fucked up
        throw new Error("failed to log fatal and throw: should have thrown, not expected to reach this point");
    }
}