import path from 'path';

/**
 * Given a number of paths, finds a common directory path between all of them.
 * 
 * Always returns with a trailing slash, unless there's no slash in resulting common path.
 * 
 * @example
 * archives/regions/region-X0-Y0-W10-H20/2025-08-22T08-41-45.216Z+%duration/1/0.png
 * archives/regions/region-X0-Y0-W10-H20/2025-08-22T08-41-45.216Z+%duration/8/1.png
 * 
 * // v results
 * archives/regions/region-X0-Y0-W10-H20/2025-08-22T08-41-45.216Z+%duration/
 * 
 * @example
 * archives/regions/region-X0-Y0-W10-H20/2025-10-22T08-41-45.216Z+%duration/1/0.png
 * archives/regions/region-X0-Y0-W10-H20/2025-08-21T04-00-50.109Z+2m/8/1.png
 * 
 * // v results
 * archives/regions/region-X0-Y0-W10-H20/
 * 
 * @param paths Paths to converge.
 */
export function convergePaths(...paths: string[]): string {
    if (paths.length === 0)
        throw new Error("no paths provided");
    else if (paths.length === 1)
        return paths[0];

    paths.sort((a, b) => a.length - b.length);

    let walkI = 0;
    done: for (; walkI < paths[0].length; walkI++) {
        const commonChar = paths[0][walkI];
        for (let i = 1; i < paths.length; i++) {
            if (paths[i][walkI] !== commonChar)
                break done;
        }
    }

    // get the common segment
    let segment = paths[0].substring(0, walkI);
    // normalize
    segment = path.normalize(segment);
    // find last slash to get a valid path
    const lastSlashIdx = segment.lastIndexOf(path.sep);
    // discard anything after the segment
    if (lastSlashIdx !== -1 && lastSlashIdx < segment.length - 1)
        segment = segment.substring(0, lastSlashIdx + 1);

    return segment;
}

/**
 * Similar to {@link convergePaths}, but saves results of convergences in {@link PathConverger.convergedPath}.
 */
export class PathConverger {
    private _firstPath: string | null = null;

    get convergedPath() { return this._convergedPath; }
    private _convergedPath: string | null = null;

    add(pathStr: string) {
        if (!this._firstPath)
            this._firstPath = pathStr;

        if (!this._convergedPath)
            this._convergedPath = pathStr;
        else
            this._convergedPath = convergePaths(this._convergedPath, pathStr);
    }
}