export function getObjPropOrCreate<
    T extends object,
    K extends keyof T
>(
    obj: T,
    prop: K,
    createValueFn: () => T[K]
): T[K] {
    let value = obj[prop];
    if (!value) {
        value = createValueFn();
        obj[prop] = value
    }

    return value;
}

export async function getObjPropOrCreateAsync<
    T extends object,
    K extends keyof T
>(
    obj: T,
    prop: K,
    createValueFn: () => Promise<T[K]>
): Promise<T[K]> {
    let value = obj[prop];
    if (!value) {
        value = await createValueFn();
        obj[prop] = value
    }

    return value;
}