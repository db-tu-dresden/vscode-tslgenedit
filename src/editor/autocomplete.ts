// import * as yaml from 'vscode-yaml';
import * as yaml from 'yaml';
import { CompletionItem, CompletionItemKind, CompletionItemProvider, TextDocument, Position, CancellationToken, SnippetString, MarkdownString, TextEdit } from 'vscode';
import { TSLGeneratorModel } from '../tslgen/model';
import { SerializerUtils } from '../utils/serialize';
import { tslEditorExtension } from './editor_extension';
import { resolve } from 'path';
import { rejects } from 'assert';

export namespace TSLEditorAutoComplete {

    // export class 

    export class YAMLCompletionProvider implements CompletionItemProvider {
        private readonly indent: string = '  ';

        private objectToIndentedString(obj: any, currentIndent: string, keepFirstIndent: boolean = true) {
            let _result: string[] = [];
            for (const key in obj) {
                if (obj[key]["minValue"] === 1) {
                    let _current = `${key}: `;
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
            if (keepFirstIndent) {
                _result[0] = `${currentIndent}${_result[0]}`;
            }
            for (let i = 1; i < _result.length; i++) {
                _result[i] = `${currentIndent}${_result[i]}`;
            }
            return _result.join("\n");
        }

        private createSnippet(snippetString: string, alreadyPresentText: string): SnippetString {
            if (snippetString.startsWith(alreadyPresentText)) {
                return new SnippetString(snippetString.substring(alreadyPresentText.length));
            } else {
                return new SnippetString(snippetString);    
            }
            // return new SnippetString(`${_docStartToken}\n${_snippet}\n${_docEndToken}`);
        }

        public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): Promise<CompletionItem[]> {
            const _schema = tslEditorExtension.getSchema(document.uri);

            if(!_schema) {
                return new Promise((resolve, reject) => { return []; });
            }
            let _currentSchema: any;

            
            const _documentType = TSLGeneratorModel.determineFileTypeByLocation(document.uri);
            
            if (_documentType === TSLGeneratorModel.TSLDataFileContentType.unknown) {
                return new Promise((resolve, reject) => { return []; });
            }
            if (_documentType === TSLGeneratorModel.TSLDataFileContentType.extension) {
                _currentSchema = _schema.extension;
            } else if (_documentType === TSLGeneratorModel.TSLDataFileContentType.primitive) {
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
            
            const _line = document.lineAt(position.line).text;
            const _indentation = SerializerUtils.getIndentation(_line);
            const _alreadyPresentText = SerializerUtils.getTextBeforePosition(_line.substring(0, position.character));
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
                    completionItem.insertText = this.createSnippet(`${_docStartToken}\n${_snippet}\n${_docEndToken}`, _alreadyPresentText);
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
                    const _snippet = this.objectToIndentedString(_items, this.indent, false);
                    completionItem.insertText = this.createSnippet(`- ${_snippet}`, _alreadyPresentText);
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
                            completionItem.insertText = this.createSnippet(`${key}: []`, '');
                        } else {
                            const _currentIndent = `${this.indent}${_indentation}`;
                            const _nextLevelIndent = `${_currentIndent}${this.indent}`;
                            completionItem.insertText = this.createSnippet(`${key}:\n${_currentIndent}- ${this.objectToIndentedString(_currentSchema[key]["items"], _nextLevelIndent, false)}`, _alreadyPresentText);
                        }
                    } else if (_currentSchema[key]["type"] === 'dict') {
                        completionItem.insertText = this.createSnippet(`${key}:\n${this.objectToIndentedString(_currentSchema[key]["items"], this.indent)}`, '');
                    } else {
                        completionItem.insertText = this.createSnippet(`${key}: `, '');
                    }
                    suggestions.push(completionItem);
                }
                return new Promise((resolve, reject) => { resolve(suggestions); });
            }
            return new Promise((resolve, reject) => { return []; });
        }
    }
}