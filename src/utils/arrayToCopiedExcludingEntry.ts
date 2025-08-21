/**
 * Copies an array, removing specific entry from the copy and returning the copy array.
 */
export function arrayToCopiedExcludingEntry<T extends unknown>(arr: T[], entry: T): T[] {
    const copy = [...arr];
    const i = copy.indexOf(entry);
    if (i !== -1)
        copy.splice(i, 1);

    return copy;
}