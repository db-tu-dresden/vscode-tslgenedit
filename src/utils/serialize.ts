import * as yaml from 'yaml';
import { TextDocument, Position } from 'vscode';

export namespace SerializerUtils {
    export type YamlDocument = yaml.Document.Parsed<yaml.ParsedNode>;
    export interface JSONNode {
        [key: string]: any;
    }

    export function parseYamlDocuments(yamlString: string): yaml.EmptyStream | yaml.Document.Parsed<yaml.ParsedNode>[] {
        return yaml.parseAllDocuments(yamlString, {
            merge: true,
            lineCounter: new yaml.LineCounter()
        });
    }
    export function dumpYamlDocuments(docs: yaml.Document.Parsed<yaml.ParsedNode>[]): string {
        let result = docs.map((doc) => {
            const result = doc.toString({directives: true}).trim();
            if (result.endsWith('...')) {
                return result.slice(0, -3).trim();
            }
            return result;
        });
        return result.join('\n...\n') + "\n...\n";
    }
    export function parseYamlDocumentsAsJson(yamlString: string): any[] {
        const _yamlDocuments = parseYamlDocuments(yamlString);
        if ("empty" in _yamlDocuments) {
            return [];
        }
        return _yamlDocuments.map(document => document.toJSON());
    }

    export function getIndentCount(line: string): number {
        return (line.match(/^\s*/)?.[0] ?? '').length;
    }
    export function getIndentation(line: string): string {
        return line.match(/^\s*/)?.[0] ?? '';
    }
    function relevantLine(line: string): boolean {
        const m = line.match(/^\s*#/);
        if (m) {
            return false;
        }
        return line.trim() !== "";
    }
    function extractKeyName(line: string): string[] {
        const regex = /^\s*(-\s*)?([^:]+)?/;
        const match = regex.exec(line);
        const _result: string[] = [];
        if (match) {
            if (match[1] && match[1].length > 0) {
                _result.push("items");
            }
            if (match[2] && match[2].length > 0) {
                _result.push(match[2]);
            }
        }
        return _result;
    }

    export namespace Search {
        export enum Direction {
            backward = 0,
            forward = 1
        };
        export enum SearchStrategy {
            sameLevelRelaxed = 0,
            parentLevelGreedy = 1
        }
        export interface SearchKeys {
            levelKeys: string[];
            parentKeys: string[];
        }
        export interface NodeLocation {
            keyChain: (string | number)[];
            nodeChain: (yaml.YAMLMap | yaml.YAMLSeq | yaml.Scalar)[];
        }


        export function getCurrentFocusedYamlDocument(
            documents: SerializerUtils.YamlDocument[],
            currentDocument: TextDocument,
            cursorPosition: Position
        ): SerializerUtils.YamlDocument | undefined {
            return documents.find((document) =>
                ((cursorPosition.isAfterOrEqual(currentDocument.positionAt(document.range[0]))) && (cursorPosition.isBeforeOrEqual(currentDocument.positionAt(document.range[2]))))
            );
        }
        export function findNodeForPosition(currentNode: yaml.ParsedNode, currentDocument: TextDocument, cursorPosition: Position): NodeLocation | undefined {
            if (currentNode instanceof yaml.YAMLMap) {
                const cNode = currentNode as yaml.YAMLMap;
                if (cNode.range) {
                    if (
                        (cursorPosition.isAfterOrEqual(currentDocument.positionAt(cNode.range[0])))
                        && (cursorPosition.isBeforeOrEqual(currentDocument.positionAt(cNode.range[2])))
                    ) {
                        for (const pair of cNode.items) {
                            const location = findNodeForPosition(pair.value as yaml.ParsedNode, currentDocument, cursorPosition);
                            if (location !== undefined) {
                                if (pair.key instanceof yaml.Scalar) {
                                    location.keyChain.push((pair.key as yaml.Scalar).value as string);
                                } else {
                                    console.error("Key was not of type yaml.Scalar");
                                    location.keyChain.push(pair.key as string);
                                }
                                location.nodeChain.push(cNode);
                                return location;
                            }
                        }
                        return { keyChain: [-1], nodeChain: [cNode] };
                    }
                }
                return undefined;
            } else if (currentNode instanceof yaml.YAMLSeq) {
                const cNode = currentNode as yaml.YAMLSeq;
                if (cNode.range) {
                    if (
                        (cursorPosition.isAfterOrEqual(currentDocument.positionAt(cNode.range[0])))
                        && (cursorPosition.isBeforeOrEqual(currentDocument.positionAt(cNode.range[2])))
                    ) {
                        let i = 0;
                        const l = cNode.items.length;
                        for (; i < cNode.items.length; i++) {
                            const location = findNodeForPosition(cNode.items[i] as yaml.ParsedNode, currentDocument, cursorPosition);
                            if (location !== undefined) {
                                location.keyChain.push(i);
                                location.nodeChain.push(cNode);
                                return location;
                            }
                        }
                        //if we didnt find the position we assume that the cursor is somewhere at the last 
                        return { keyChain: [-1], nodeChain: [cNode] };
                    }
                }
                return undefined;
            } else if (currentNode instanceof yaml.Scalar) {
                const cNode = currentNode as yaml.Scalar;
                if (cNode.range) {
                    if (
                        (cursorPosition.isAfterOrEqual(currentDocument.positionAt(cNode.range[0])))
                        && (cursorPosition.isBeforeOrEqual(currentDocument.positionAt(cNode.range[2])))
                    ) {
                        return { keyChain: [-1], nodeChain: [cNode] };
                    }
                }
                return undefined;
            } else {
                return undefined;
            }
        }
        function lineStartsWith(line: string, ...tokens: string[]): boolean {
            const _tokens = [...tokens];
            return _tokens.some(token => line.trim().startsWith(token));
        }
        export function* traverseDocument(document: TextDocument, cursorPosition: Position, direction: Direction, ...stopTokens: string[]) {
            if (direction === Direction.backward) {
                let _currentLine = cursorPosition.line;
                for (let i = 0; i < cursorPosition.line; i++) {
                    const line = document.lineAt(_currentLine).text;
                    if (lineStartsWith(line, ...stopTokens)) {
                        break;
                    }
                    if (relevantLine(line)) {
                        yield document.lineAt(_currentLine).text;
                    }
                    _currentLine--;
                }
            } else if (direction === Direction.forward) {
                for (let i = cursorPosition.line; i < document.lineCount; i++) {
                    const line = document.lineAt(i).text;
                    if (lineStartsWith(line, ...stopTokens)) {
                        break;
                    }
                    if (relevantLine(line)) {
                        yield document.lineAt(i).text;
                    }
                }
            }
        }
        export function searchYamlStructureKeys(document: TextDocument, cursorPosition: Position, direction: Direction, strategy: SearchStrategy): string[] | null {
            const it = traverseDocument(document, cursorPosition, direction, "...", "---");
            const _firstLine = document.lineAt(cursorPosition.line).text;
            const _originalIndentCount = getIndentCount(_firstLine);
            let _currentIndentCount = _originalIndentCount;
            const _result: string[] = [];

            if (strategy === SearchStrategy.parentLevelGreedy) {
                for (let line of it) {
                    const _lineIndentCount = getIndentCount(line);
                    if (_lineIndentCount < _currentIndentCount) {
                        const _key = extractKeyName(line);
                        _result.push(_key[0]);
                        _currentIndentCount = _lineIndentCount;
                    }
                }
            } else if (strategy === SearchStrategy.sameLevelRelaxed) {
                for (let line of it) {
                    const _lineIndentCount = getIndentCount(line);
                    if (_lineIndentCount === _currentIndentCount) {
                        const _key = extractKeyName(line);
                        _result.push(_key[0]);
                    } else if (_lineIndentCount < _currentIndentCount) {
                        const _key = extractKeyName(line);
                        if ((_key.length === 2) && (direction === Direction.backward)){
                            _result.push(_key[1]);
                        }
                        break;
                    }
                }
            }
            return _result;
        }
        export function searchFirstToken(document: TextDocument, cursorPosition: Position, direction: Direction, ...tokens: string[]): string | undefined {
            const it = traverseDocument(document, cursorPosition, direction);
            for (let line of it) {
                if (lineStartsWith(line, ...tokens)) {
                    return line;
                }
            }
            return undefined;
        }
    }





}
