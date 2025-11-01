// converters from https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Common_programming_languages

export function lon2tile(lon: number, zoom: number): number { return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom))); }
export function lat2tile(lat: number, zoom: number): number { return (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom))); }

export function tile2long(x: number, z: number): number {
    return (x / Math.pow(2, z) * 360 - 180);
}
export function tile2lat(y: number, z: number): number {
    var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
}