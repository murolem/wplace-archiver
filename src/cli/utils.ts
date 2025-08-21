import type { OutVariableName } from '$cli/constants';

/**
 * Wraps string with `\n` if it exceeds `maxLength`, splitting it at points `wrapChars`, as many times as needed for each line to fit within `maxLength`.
 * 
 * If a string is below or equal to the limit, it will not be wrapped. 
 * If a segment does not contain any of `wrapChars`, it will not be wrapped and may exceed `maxLength`.
 * @param str String to wrap.
 * @param maxLength Max length of a line.
 * @param wrapChars Characters at which wrapping is allowed. A wrapping character will be left on the same line.
 * @param appendWrapChar A character to append on each line that got split.
 */
export function wrapStringToLength(str: string, maxLength: number, wrapChars: string[], appendWrapChar?: string): string {
    if (maxLength <= 0)
        throw new Error("failed to wrap string: max length is less than or equal to 0");
    else if (wrapChars.length === 0)
        throw new Error("failed to wrap string: wrap chars array is empty");

    if (str.length <= maxLength)
        return str;

    let wrapped: string[] = [];
    let leftToWrap = str;
    while (true) {
        if (leftToWrap === '')
            break;
        else if (leftToWrap.length <= maxLength) {
            wrapped.push(leftToWrap)
            break;
        }

        let segment = leftToWrap.substring(0, maxLength);
        const bestWrappingCharRes = wrapChars.reduce((accum, ch) => {
            const lastIndex = segment.lastIndexOf(ch);
            if (lastIndex !== -1 && lastIndex > accum.index) {
                accum.ch = ch;
                accum.index = lastIndex;
            }

            return accum;
        }, { ch: '', index: -1 } as { ch: string, index: number });

        if (bestWrappingCharRes.index === -1) {
            // no wrapping char found in a segment.
            // search for first wrapping char in left to wrap instead and use that.

            const firstMatchingWrappingCharRes = wrapChars.reduce((accum, ch) => {
                const index = leftToWrap.indexOf(ch);
                if (index !== -1 && index < accum.index) {
                    accum.ch = ch;
                    accum.index = index;
                }

                return accum;
            }, { ch: '', index: Infinity } as { ch: string, index: number });

            if (firstMatchingWrappingCharRes.index === Infinity) {
                wrapped.push(leftToWrap);
                break;
            } else {
                wrapped.push(leftToWrap.substring(0, firstMatchingWrappingCharRes.index + 1));
                leftToWrap = leftToWrap.substring(firstMatchingWrappingCharRes.index + 1);
                continue;
            }
        }

        segment = segment.substring(0, bestWrappingCharRes.index + 1);
        wrapped.push(segment);
        leftToWrap = leftToWrap.substring(segment.length);
    }

    if (appendWrapChar)
        return wrapped.join(appendWrapChar + "\n");
    else
        return wrapped.join("\n");
}

/** Type-check function for variable names. */
export function variableName(varName: OutVariableName): OutVariableName {
    return varName;
}