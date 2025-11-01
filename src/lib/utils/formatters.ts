import { Logger } from '$logger';
const logger = new Logger("formatters");
const { logDebug, logWarn, logFatalAndThrow } = logger;

import { outVariableNamesSubstitutionOrder, outVariableRegex, type outVariableNames } from '$cli/constants';
import type { OutVariableWeakMap } from '$cli/types';

export function formatMsToDurationDirnamePart(ms: number): string {
    let mins = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60));

    if (hours === 0 && mins === 0)
        mins = 1;

    const parts = [
        hours ? `${hours}h` : '',
        `${mins}m`,
    ].filter(val => val !== "");

    return parts.join("");
}

export function formatDateToFsSafeIsolike(date: Date): string {
    return date.toISOString().replaceAll(":", "-");
}

/**
 * Adds a unit suffix to number, eg 2500 > 2.5K.
 */
export function applyNumberUnitSuffix(num: number, maximumFractionDigits: number = 1): string {
    return Intl.NumberFormat('en-US', {
        notation: "compact",
        maximumFractionDigits: maximumFractionDigits
    }).format(num);
}

/**
 * Substitutes variables in `str` that are used in out path with their values provided in `vars`.
 * @param str String to substitute variables in.
 * @param varsMapped Mapping of variables to their substitutions.
 */
export function substituteOutVariables(str: string, varsMapped: OutVariableWeakMap): string {
    const substitutions: Array<{
        indexFrom: number,
        indexTo: number,
        with: string
    }> = [];

    const varsOrdered = Object.entries(varsMapped)
        .map(([varName, value]) => ({ varName, value }))
        .sort((a, b) => {
            const subsOrderIdxA = outVariableNamesSubstitutionOrder.indexOf(a.varName as any);
            if (subsOrderIdxA === -1)
                logFatalAndThrow(`out variable substitution failed: unknown substitution order for variable '${a.varName}'`);

            const subsOrderIdxB = outVariableNamesSubstitutionOrder.indexOf(b.varName as any);
            if (subsOrderIdxB === -1)
                logFatalAndThrow(`out variable substitution failed: unknown substitution order for variable '${b.varName}'`);

            return subsOrderIdxA - subsOrderIdxB;
        })

    let re = new RegExp(outVariableRegex, 'g');
    let match;
    while ((match = re.exec(str)) != null) {
        const varName = match[0];
        const subsWith = varsOrdered.find(e => e.varName === varName)?.value;
        if (subsWith === undefined) {
            // logDebug(`skipping variable '${varName}' with no substitution provided`);
            continue;
        }

        substitutions.push({
            indexFrom: match.index,
            indexTo: match.index + varName.length,
            with: subsWith
        });
    }

    if (substitutions.length === 0)
        return str;

    // sort backwards to allow for str mutations as we go
    substitutions.sort((a, b) => b.indexFrom - a.indexFrom);

    let res = str;
    for (const subs of substitutions) {
        res = res.substring(0, subs.indexFrom)
            + subs.with
            + res.substring(subs.indexTo);
    }

    return res;
}