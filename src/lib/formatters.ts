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
