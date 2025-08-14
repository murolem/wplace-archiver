export function formatMsToDurationDirnamePart(ms: number): string {
    let mins = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60));

    if (hours === 0 && mins === 0)
        mins = 1;

    const parts = [
        hours ? `${hours}h` : '',
        `${mins}m`,
    ].filter(val => val !== "");

    return parts.join(" ");
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