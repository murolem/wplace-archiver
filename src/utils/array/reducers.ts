/** Runs addition on all elements of an array. */
export function numArrayReduceAddition(arr: number[]): number {
    return arr.reduce((acc, v) => acc + v);
}