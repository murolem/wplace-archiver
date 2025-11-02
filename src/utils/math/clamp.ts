/**
 * Constrains a number between two other numbers.
 * @param value
 * @param min 
 * @param max 
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(Math.min(value, max), min);
}