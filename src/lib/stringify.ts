export function stringify(data: unknown): string {
    return JSON.stringify(data, null, 4);
}

export function stringifyError(err: object): string {
    return JSON.stringify(err, Object.getOwnPropertyNames(err), 4);
}
