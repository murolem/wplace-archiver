export function shallowCompareObjects(obj1: object, obj2: object): boolean {
  return Object.keys(obj1).length === Object.keys(obj2).length &&
    // @ts-ignore
    Object.keys(obj1).every(key => obj1[key] === obj2[key]);
}