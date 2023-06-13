import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { SerializerUtils } from '../utils/serialize';
import { TypeUtils } from '../utils/types';
export namespace TSLEditorFileSymbols {
    export async function getTSLExtensionDocumentSymbols(
        currentDocument: vscode.TextDocument, documents: SerializerUtils.YamlDocument[]
    ): Promise<vscode.DocumentSymbol[]> {
        const _symbolPromises = documents.map(async (document) => {
            const _extensionNameItem = document.get("extension_name");
            if (_extensionNameItem) {
                const _extensionName = `${_extensionNameItem}`;
                const _startPosition: vscode.Position = currentDocument.positionAt(document.range[0]);
                const _endPosition: vscode.Position = currentDocument.positionAt(document.range[1]);
                const _nameSymbol = new vscode.DocumentSymbol(
                    _extensionName,
                    '',
                    vscode.SymbolKind.Class,
                    new vscode.Range(_startPosition, _endPosition),
                    new vscode.Range(_startPosition, _endPosition),
                );
                return _nameSymbol;
            }
        });
        return (await Promise.all(_symbolPromises)).filter((symbol): symbol is vscode.DocumentSymbol => symbol !== undefined);
    }

    function prettifyTypes(types: unknown[] | yaml.Pair<unknown, unknown>[]) : string{
        const stringTypes: string[] = types.filter((type) => !yaml.isPair(type)).map((type) => `${type}`);
        const unsigneds: string[] = stringTypes.filter((type) => type.startsWith("uint")).sort(TypeUtils.naturalSort);
        const signeds: string[] = stringTypes.filter((type) => type.startsWith("int")).sort(TypeUtils.naturalSort);
        const floats: string[] = stringTypes.filter((type) => type.startsWith("float")).sort(TypeUtils.naturalSort);
        const doubles: string[] = stringTypes.filter((type) => type.startsWith("double")).sort(TypeUtils.naturalSort);
        const toRemoveInts: string[] = [];
        const numRegex = /\d+/g;

        let integerSizesBoth: string[] = [];
        for (const unsignedT of unsigneds) {
            //get rid of first character
            const correspondingSignedT = unsignedT.substring(1);
            if (signeds.includes(correspondingSignedT)) {
                const sizeMatch = correspondingSignedT.match(numRegex);
                if (sizeMatch) {
                    integerSizesBoth.push(sizeMatch[0]);
                }
                toRemoveInts.push(unsignedT);
                toRemoveInts.push(correspondingSignedT);
            }
        }
        const result: string[] = [];
        if (integerSizesBoth.length > 0) {
            result.push(`(u)int[${integerSizesBoth.join(", ")}]`);
        }
        result.push(
            ...signeds.filter((signedT) => !toRemoveInts.includes(signedT)), 
            ...unsigneds.filter((unsignedT) => !toRemoveInts.includes(unsignedT)),
            ...floats,
            ...doubles
        );
            
        return result.join(", ");
        // const longest_common_substring: string = TypeUtils.longestCommonSubstring(result);
        // console.log(longest_common_substring);
        // return result.sort().join(", ");
    }

    export async function getTSLPrimitiveDocumentSymbols(
        currentDocument: vscode.TextDocument, documents: SerializerUtils.YamlDocument[]
    ): Promise<vscode.DocumentSymbol[]> {
        const _symbolPromises = documents.map(async (document) => {
            const _primitiveNameItem = document.get("primitive_name");
            const _functorNameItem = document.get("functor_name");
            if (_primitiveNameItem) {
                let _nameAppendix = (_functorNameItem) ? ` (overload ${_functorNameItem})` : "";
                const _primitiveName = `${_primitiveNameItem}${_nameAppendix}`;
                const _startPosition: vscode.Position = currentDocument.positionAt(document.range[0]);
                const _endPosition: vscode.Position = currentDocument.positionAt(document.range[2]);
                const _nameSymbol = new vscode.DocumentSymbol(
                    _primitiveName,
                    '',
                    vscode.SymbolKind.Class,
                    new vscode.Range(_startPosition, _endPosition),
                    new vscode.Range(_startPosition, _endPosition)
                );
                const _definitionsItem = document.get("definitions");
                if (_definitionsItem) {
                    if (yaml.isCollection(_definitionsItem)) {
                        const _definitionPromises = _definitionsItem.items.map(async (_entry) => {
                            const _definition = _entry as yaml.YAMLMap<unknown, unknown>;
                            const _extensionItem = _definition.get("target_extension");
                            const _extensionFlagsItem = _definition.get("lscpu_flags");
                            const _types = _definition.get("ctype") ?? [];
                            const _type = (yaml.isCollection(_types)) ? prettifyTypes(_types.items) : `${_types}`;

                            let _extensionFlags = (yaml.isCollection(_extensionFlagsItem)) ? _extensionFlagsItem.items.sort().join(", ") : `${_extensionFlagsItem}`;
                            if (!_extensionFlags) {
                                _extensionFlags = "default";
                            }
                            if ((_extensionItem) && (_extensionFlags)) {
                                
                                if (_definition.range) {
                                    const range = _definition.range;
                                    if (yaml.isCollection(_extensionItem)) {
                                        return _extensionItem.items.map((extensionItem) => {
                                            const _concreteDefinition = `${extensionItem}: <<${_extensionFlags}>> (${_type})`;
                                            return new vscode.DocumentSymbol(
                                                _concreteDefinition,
                                                '',
                                                vscode.SymbolKind.Field,
                                                new vscode.Range(currentDocument.positionAt(range[0]), currentDocument.positionAt(range[2])),
                                                new vscode.Range(currentDocument.positionAt(range[0]), currentDocument.positionAt(range[2]))
                                            );
                                        });
                                    } else {
                                        const _concreteDefinition = `${_extensionItem}: <<${_extensionFlags}>> (${_type})`;
                                        return [new vscode.DocumentSymbol(
                                            _concreteDefinition,
                                            '',
                                            vscode.SymbolKind.Field,
                                            new vscode.Range(currentDocument.positionAt(range[0]), currentDocument.positionAt(range[2])),
                                            new vscode.Range(currentDocument.positionAt(range[0]), currentDocument.positionAt(range[2]))
                                        )];
                                    }
                                    
                                }
                            }
                        });
                        const _definitions: vscode.DocumentSymbol[] = (await Promise.all(_definitionPromises)).filter((symbol): symbol is [vscode.DocumentSymbol] => symbol !== undefined).flat();
                        if (_definitions.length > 0) {
                            _nameSymbol.children = _definitions;
                        }
                    }
                }
                return _nameSymbol;
            }
        });
        return (await Promise.all(_symbolPromises)).filter((symbol): symbol is vscode.DocumentSymbol => symbol !== undefined);
    }
    
}