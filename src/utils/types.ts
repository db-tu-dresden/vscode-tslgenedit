
export namespace TypeUtils {
    export function hasOwnProperty<T extends {}, K extends keyof T>(obj: T, key: K): obj is T & Record<K, unknown> {
        return obj.hasOwnProperty(key);
    }
    export function extendObjects(baseObject: { [key: string]: any }, extenderObject: { [key: string]: any }): { [key: string]: any } {
        for (const [key, value] of Object.entries(extenderObject)) {
            if (!baseObject.hasOwnProperty(key)) {
                baseObject[key] = value;
            } 
            // else {
            //     if (value !== null && typeof value === 'object') {
            //         baseObject[key] = mergeObjects(baseObject[key], value);
            //     }
            // }
        }
        return baseObject;
    }
    export function deletePropertyWithoutKey(obj: any, key: string) {
      for (let property in obj) {
        if (typeof obj[property] === 'object' && obj[property] !== null) {
          deletePropertyWithoutKey(obj[property], key);
        } else {
          if (!obj.hasOwnProperty(key)) {
            delete obj[property];
          }
        }
      }
    }
    export function filterJson(obj: any, key: string): any {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }
    
      const result: any = Array.isArray(obj) ? [] : {};
    
      for (const prop in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, prop)) {
          const value = obj[prop];
    
          if (typeof value === 'object' && value !== null) {
            result[prop] = filterJson(value, key);
          } else if (prop === key) {
            result[prop] = value;
          }
        }
      }    
      return result;
    }

    export function truncateFromString(str: string, pattern: RegExp): string {
      const match = pattern.exec(str);
      if(match) {
        return str.substring(0, match.index);
      }
      return str;
    }   

    export function naturalSort(a: string, b:string): number {
      const numRegex = /\d+/g;
      const extractNumber = (str: string) => {
        const matches = str.match(numRegex);
        if (matches) {
          return parseInt(matches[0], 10);
        }
        return NaN;
      };
      const aNum = extractNumber(a);
      const bNum = extractNumber(b);
      if (isNaN(aNum) && isNaN(bNum)) {
        // console.log("\t" + a.localeCompare(b));
        return a.localeCompare(b);
      } else if (isNaN(aNum)) {
        // console.log("\t1");
        return 1;
      } else if (isNaN(bNum)) {
        // console.log("\t-1");
        return -1;
      } else {
        if (aNum < bNum) {
          // console.log("\t-1");
          return -1;
        } else if (aNum > bNum) {
          // console.log("\t1");
          return 1;
        } else {
          // console.log("\t" + a.localeCompare(b));
          return a.localeCompare(b);
        }
      }
    }
}