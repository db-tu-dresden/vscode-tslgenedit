import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { SerializerUtils } from '../utils/serialize';

export namespace TVLEditorFileSymbols {
    export function getTVLExtensionDocumentSymbols(
        currentDocument: vscode.TextDocument, documents: SerializerUtils.YamlDocument[]
    ): vscode.DocumentSymbol[] {
        const _symbols: vscode.DocumentSymbol[] = [];
        for (const _doc of documents) {
            const _extensionNameItem = _doc.get("extension_name");
            if (_extensionNameItem) {
                const _extensionName = `${_extensionNameItem}`;
                const _startPosition: vscode.Position = currentDocument.positionAt(_doc.range[0]);
                const _endPosition: vscode.Position = currentDocument.positionAt(_doc.range[1]);
                const _nameSymbol = new vscode.DocumentSymbol(
                    _extensionName,
                    '',
                    vscode.SymbolKind.Class,
                    new vscode.Range(_startPosition, _endPosition),
                    new vscode.Range(_startPosition, _endPosition),
                );
                _symbols.push(_nameSymbol);
            }
        }
        return _symbols;
    }

    export function getTVLPrimitiveDocumentSymbols(
        currentDocument: vscode.TextDocument, documents: SerializerUtils.YamlDocument[]
    ): vscode.DocumentSymbol[] {
        const _symbols: vscode.DocumentSymbol[] = [];
        for (const doc of documents) {
            const _primitiveNameItem = doc.get("primitive_name");
            const _functorNameItem = doc.get("functor_name");
            if (_primitiveNameItem) {
                let _nameAppendix = (_functorNameItem) ? ` (overload ${_functorNameItem})` : "";
                const _primitiveName = `${_primitiveNameItem}${_nameAppendix}`;
                const _startPosition: vscode.Position = currentDocument.positionAt(doc.range[0]);
                const _endPosition: vscode.Position = currentDocument.positionAt(doc.range[2]);
                const _nameSymbol = new vscode.DocumentSymbol(
                    _primitiveName,
                    '',
                    vscode.SymbolKind.Class,
                    new vscode.Range(_startPosition, _endPosition),
                    new vscode.Range(_startPosition, _endPosition)
                );
                const _definitionsItem = doc.get("definitions");
                if (_definitionsItem) {
                    if (yaml.isCollection(_definitionsItem)) {
                        const _definitions: vscode.DocumentSymbol[] = [];
                        for (const _entry of _definitionsItem.items) {
                            const _definition = _entry as yaml.YAMLMap<unknown, unknown>;
                            const _extensionItem = _definition.get("target_extension");
                            const _extensionFlagsItem = _definition.get("lscpu_flags");
                            const _extensionFlags = (yaml.isCollection(_extensionFlagsItem)) ? _extensionFlagsItem.items.sort().join(", ") : `${_extensionFlagsItem}`;
                            if ((_extensionItem) && (_extensionFlags)) {
                                const _concreteDefinition = `${_extensionItem} (${_extensionFlags})`;
                                if (_definition.range) {
                                    _definitions.push(
                                        new vscode.DocumentSymbol(
                                            _concreteDefinition,
                                            '',
                                            vscode.SymbolKind.Field,
                                            new vscode.Range(currentDocument.positionAt(_definition.range[0]), currentDocument.positionAt(_definition.range[2])),
                                            new vscode.Range(currentDocument.positionAt(_definition.range[0]), currentDocument.positionAt(_definition.range[2]))
                                        )
                                    );
                                }
                            }
                        }
                        if (_definitions.length > 0) {
                            _nameSymbol.children = _definitions;
                        }
                    }
                }
                _symbols.push(_nameSymbol);
            }
        }
        return _symbols;
    }
}