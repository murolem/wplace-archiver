/** Un-narrows a string literal type, allowing for arbitrary strings. */
export type StringOr<T extends string> = string & {} | T;