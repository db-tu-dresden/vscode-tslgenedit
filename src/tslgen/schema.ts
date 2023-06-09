import * as vscode from 'vscode';
import { SerializerUtils } from '../utils/serialize';
export namespace TSLGeneratorSchema {
    export interface SchemaFileLocations {
        extension: vscode.Uri;
        primitive: vscode.Uri;
        primitiveClass: vscode.Uri;
    };

    export interface RecommendedEntry {
        keyChain: string[];
        value: any;
    };
    export interface Schemata {
        extension: any,
        primitive: any,
        primitiveClass: any
    };
    export const tslGeneratorTopLevelEntryNames: { [key: string]: string } = {
        extension: "extension",
        primitive: "primitive",
        primitiveClass: "primitive_class"
    };

    export namespace SchemaTransform {

        const keyRenameMap: { [key: string]: string } = {
            example: 'examples',
            entry_type: 'items',
            brief: 'comment',
        };

        const valueRenameMap: { [key: string]: string } = {
            bool: 'boolean',
            list: 'array',
            int: 'integer',
            str: 'string',
            dict: 'object',
        };
        namespace details {
            export function renameKeys(currentNode: SerializerUtils.JSONNode): SerializerUtils.JSONNode {
                for (const [k, v] of Object.entries(keyRenameMap)) {
                    if (k in currentNode) {
                        currentNode[v] = currentNode[k];
                        delete currentNode[k];
                    }
                }
                return currentNode;
            }
            export function isComplexField(currentNode: SerializerUtils.JSONNode): boolean {
                if (!(currentNode instanceof Object)) {
                    return false;
                } else if ('required' in currentNode || 'optional' in currentNode) {
                    return true;
                } else {
                    return false;
                }
            }
        }
        export function transform(currentNode: SerializerUtils.JSONNode, requirement: string = ''): SerializerUtils.JSONNode {
            if (!(currentNode instanceof Object)) {
                if (Array.isArray(currentNode as any)) {
                    if ((currentNode as any).length === 0) {
                        return [];
                    }
                    return (currentNode as any[]).flatMap((entry: unknown) =>
                        transform(entry as SerializerUtils.JSONNode)
                    );
                } else {
                    return currentNode;
                }
            } else {
                if (details.isComplexField(currentNode)) {
                    return  Object.fromEntries(
                        Object.entries(currentNode).flatMap(([requirementString, value]) =>
                            Object.entries(value).map(([key, value]) => [
                                key,
                                transform(value as SerializerUtils.JSONNode, requirementString),
                            ])
                        )
                    );
                } else {
                    if (requirement === 'required') {
                        currentNode.minValue = 1;
                        currentNode.maxValue = 1;
                    } else if (requirement === 'optional') {
                        currentNode.minValue = 0;
                        currentNode.maxValue = 1;
                    }
                    if (currentNode?.hasOwnProperty('type')) {
                        currentNode.type = valueRenameMap[currentNode.type];
                        if (currentNode?.hasOwnProperty('default')) {
                            if (currentNode.type === 'object') {
                                currentNode.default = {};
                            } else if (currentNode.type === 'array') {
                                currentNode.default = [];
                            }
                        }
                    } else {
                        if (JSON.stringify(currentNode) === "[]") { //this is a hack... but [] is interpreted as object
                            return [];
                        }
                    }
                    
                    currentNode = details.renameKeys(currentNode);
                    return Object.fromEntries(
                        Object.entries(currentNode).map(([k, v]) => [k, transform(v, '')])
                    );                    
                }
            }
        }

        function flatten(cNode: SerializerUtils.JSONNode): SerializerUtils.JSONNode {
            if (Array.isArray(cNode as any)) {
                if ((cNode as any).length === 0) {
                    return [];
                }
                return (cNode as any[]).flatMap((entry: unknown) =>
                    flatten(entry as SerializerUtils.JSONNode)
                );
            } else if (!(cNode instanceof Object)) {
                return cNode;
            } else {
                if (details.isComplexField(cNode)) {
                    return Object.fromEntries(
                        Object.entries(cNode).flatMap(([_, value]) =>
                            Object.entries(value).map(([key, value]) => [
                                key,
                                flatten(value as SerializerUtils.JSONNode),
                            ])
                        )
                    );
                } else {
                    return Object.fromEntries(
                        Object.entries(cNode).map(([k, v]) => [k, flatten(v)])
                    );
                    
                }
            }
        }

        export function filterKeysConjunct(currentNode: SerializerUtils.JSONNode, ...keys: string[]): SerializerUtils.JSONNode {
            const _keys = [...keys];
            function filterByKey(obj: SerializerUtils.JSONNode): SerializerUtils.JSONNode {
                const filteredObj: { [key: string]: any } = {};
                for (const key in obj) {
                  const value = obj[key];
                  if (value && typeof value === "object") {
                    const nestedObj = filterByKey(value);
                    if (_keys.every((key) => value.hasOwnProperty(key)) || Object.keys(nestedObj).length > 0) {
                      filteredObj[key] = value;
                      if (Object.keys(nestedObj).length > 0) {
                        filteredObj[key] = Object.assign(filteredObj[key], nestedObj);
                      }
                    }
                  }
                }
                return filteredObj;
              }
            const _flattenedNode = flatten(currentNode);
            const result = filterByKey(_flattenedNode);
            return result;
        }

        export function createDefaultEntryFromSchema(schema: SerializerUtils.JSONNode): SerializerUtils.JSONNode {
            const result: SerializerUtils.JSONNode = {};
            for (const key in schema) {
                const value = schema[key];
                if (value && typeof value === "object") {
                    if ("default" in schema[key]) {
                        result[key] = schema[key]["default"];
                    } else {
                        result[key] = createDefaultEntryFromSchema(schema[key]);
                    }
                }
            }
            return result;
        }

        export function getRecommendedEntryFromSchema(schema: SerializerUtils.JSONNode, keyChain: string[] = []): RecommendedEntry[] {
            
            function impl(currentSchema: SerializerUtils.JSONNode, keyChain: string[] = []): RecommendedEntry[] {
                const result: RecommendedEntry[] = [];
                for (const key in currentSchema) {
                    const value = currentSchema[key];
                    if (value && typeof value === "object") {
                        if (("recommended" in currentSchema[key]) && ("default" in currentSchema[key])) {
                            result.push({ keyChain: keyChain.concat([key]), value: currentSchema[key]["default"]});
                        }
                        const subResult = impl(currentSchema[key], keyChain);
                        for (const entry of subResult) {
                            entry.keyChain.unshift(key);
                        }
                        result.push(...subResult);
                        
                    }
                }
                return result;
            }
            return impl(schema, keyChain);
        }
    }
}



