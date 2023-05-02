// import * as yaml from 'vscode-yaml';
import * as yaml from 'yaml';
import { CompletionItem, CompletionItemKind, CompletionItemProvider, TextDocument, Position, CancellationToken, SnippetString, MarkdownString, TextEdit } from 'vscode';
import { TVLGeneratorModel } from '../tvlgen/model';
import { SerializerUtils } from '../utils/serialize';
import { tvlEditorExtension } from './editor_extension';
import { resolve } from 'path';
import { rejects } from 'assert';

export namespace TVLEditorAutoComplete {

    // export class 

    export class YAMLCompletionProvider implements CompletionItemProvider {
        private readonly indent: string = '  ';

        private objectToIndentedString(obj: any, currentIndent: string) {
            let _result: string[] = [];
            for (const key in obj) {
                if (obj[key]["minValue"] === 1) {
                    let _current = `${currentIndent}${key}: `;
                    const _type = obj[key]["type"];
                    if (_type === 'string') {
                        _current += "''";
                    } else if(_type === 'array') {
                        _current += "[]";
                    } else if(_type === 'dict') {
                        _current += "{}";
                    }
                    _result.push(_current);
                }
            }
            return _result.join("\n");
        }
        public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): Promise<CompletionItem[]> {
            const _schema = tvlEditorExtension.getSchema(document.uri);

            if(!_schema) {
                return new Promise((resolve, reject) => { return []; });
            }
            let _currentSchema: any;

            
            const _documentType = TVLGeneratorModel.determineFileTypeByLocation(document.uri);
            
            if (_documentType === TVLGeneratorModel.TVLDataFileContentType.unknown) {
                return new Promise((resolve, reject) => { return []; });
            }
            if (_documentType === TVLGeneratorModel.TVLDataFileContentType.extension) {
                _currentSchema = _schema.extension;
            } else if (_documentType === TVLGeneratorModel.TVLDataFileContentType.primitive) {
                _currentSchema = _schema.primitive;
            }
            const _schemaPropertyKeys = 
                SerializerUtils.Search.searchYamlStructureKeys(
                    document, position, 
                    SerializerUtils.Search.Direction.backward, SerializerUtils.Search.SearchStrategy.parentLevelGreedy);
            const _sameLevelKeysBackward =
                SerializerUtils.Search.searchYamlStructureKeys(
                document, position, 
                SerializerUtils.Search.Direction.backward, SerializerUtils.Search.SearchStrategy.sameLevelRelaxed);
            const _sameLevelKeysForward =
                SerializerUtils.Search.searchYamlStructureKeys(
                document, position, 
                SerializerUtils.Search.Direction.forward, SerializerUtils.Search.SearchStrategy.sameLevelRelaxed);
            let _sameLevelKeys: string[];
            if (_sameLevelKeysBackward) {
                if (_sameLevelKeysForward) {
                    _sameLevelKeys = [..._sameLevelKeysBackward, ..._sameLevelKeysForward];
                } else {
                    _sameLevelKeys = _sameLevelKeysBackward;
                }
            } else {
                if (_sameLevelKeysForward) {
                    _sameLevelKeys = _sameLevelKeysForward;
                } else {
                    console.error("This must not happen.");
                    return new Promise((resolve, reject) => { return []; });
                }
            }

            const _indentation = SerializerUtils.getIndentation(document.lineAt(position.line).text);
            if (_schemaPropertyKeys) {
                if ((_schemaPropertyKeys.length === 0) && (_sameLevelKeys.length === 0)) {
                    //new document
                    const _backwardTokenPresent = 
                        SerializerUtils.Search.searchFirstToken(
                            document, position, 
                            SerializerUtils.Search.Direction.backward, "---", "...");
                    const _forwardTokenPresent = 
                        SerializerUtils.Search.searchFirstToken(
                            document, position, 
                            SerializerUtils.Search.Direction.forward, "---", "...");
                    const _docStartToken = ((!_backwardTokenPresent) || (_backwardTokenPresent === "...")) ? "---" : '';
                    const _docEndToken   = ((!_forwardTokenPresent) || (_forwardTokenPresent === "---")) ? "..." : '';
                    const completionItem = new CompletionItem(`New ${_documentType.valueOf()}:`, CompletionItemKind.Class);
                    completionItem.keepWhitespace = false;
                    const _snippet = this.objectToIndentedString(_currentSchema, '');
                    completionItem.insertText = new SnippetString(`${_docStartToken}\n${_snippet}\n${_docEndToken}`);
                    completionItem.additionalTextEdits = [TextEdit.delete(document.lineAt(position.line).range)];
                
                    const suggestions: CompletionItem[] = [completionItem];
                    return new Promise((resolve, rejects) => {resolve(suggestions);});
                }
                let pos = _schemaPropertyKeys.length - 1;
                for (let i = 0; i < _schemaPropertyKeys.length; i++) {
                    const key = _schemaPropertyKeys[pos];
                    _currentSchema = _currentSchema[key];
                    pos--;
                }
                const _schemaKeys = Object.keys(_currentSchema);
                if (_schemaKeys.includes('items')) {
                    const key = _schemaPropertyKeys[_schemaPropertyKeys.length-1];
                    const completionItem = new CompletionItem(`New Element of ${key}:`, CompletionItemKind.Class);
                    const _items = _currentSchema["items"];
                    const _snippet = this.objectToIndentedString(_items, this.indent);
                    completionItem.insertText = new SnippetString(`-\n${_snippet}`);
                    const suggestions: CompletionItem[] = [completionItem];
                    return new Promise((resolve, rejects) => {resolve(suggestions);});
                }
                const _missingKeys = _schemaKeys.filter(item => !_sameLevelKeys.includes(item));
                const suggestions: CompletionItem[] = [];
                for (const key of _missingKeys) {
                    const completionItem = new CompletionItem(`${key}:`, CompletionItemKind.Field);
                    completionItem.documentation = new MarkdownString(_currentSchema[key]["comment"]);
                    if (_currentSchema[key]["type"] === 'array') {
                        if (typeof _currentSchema[key]["items"] === 'string') {
                            completionItem.insertText = new SnippetString(`${key}: []`);
                        } else {
                            const _currentIndent = `${this.indent}${_indentation}`;
                            const _nextLevelIndent = `${_currentIndent}${this.indent}`;
                            completionItem.insertText = new SnippetString(`${key}:\n${_currentIndent}-\n${this.objectToIndentedString(_currentSchema[key]["items"], _nextLevelIndent)}`);
                        }
                    } else if (_currentSchema[key]["type"] === 'dict') {
                        completionItem.insertText = new SnippetString(`${key}:\n${this.objectToIndentedString(_currentSchema[key]["items"], this.indent)}`);
                    } else {
                        completionItem.insertText = new SnippetString(`${key}: `);
                    }
                    suggestions.push(completionItem);
                }
                return new Promise((resolve, reject) => { resolve(suggestions); });
            }
            return new Promise((resolve, reject) => { return []; });
        }
    }
}