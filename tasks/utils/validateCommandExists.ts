import { Logger } from '$logger';
import commandExists from 'command-exists';
const logger = new Logger("validateCommandExists");

/**
 * Checks if given command exists in PATH.
 * @param command Command to check.
 * @param message Error message to print if command doesn't exist.
 * @throws {Error} if command doesn't exist.
 */
export function validateCommandExistsSync(command: string, message?: string): void {
    if (!commandExists.sync(command))
        logger.logFatalAndThrow(message ?? `command '${command}' is not defined`);
}