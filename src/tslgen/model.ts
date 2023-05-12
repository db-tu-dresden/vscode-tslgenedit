import * as vscode from 'vscode';
import * as yaml from 'yaml';

import { FileSystemUtils } from '../utils/files';
import { EditorUtils } from '../utils/vscode_editor';
import { SerializerUtils } from '../utils/serialize';
import { TSLGeneratorSchema } from './schema';
import { TSLEditorTransformation } from '../editor/transform';

export namespace TSLGeneratorModel {
    export const tslNamespace: string = "tsl";
    const primitiveDataFolderName: string = "primitives";
    const extensionDataFolderName: string = "extensions";
    const tslGenDataFolderName: string = "primitive_data";
    const schemaFileFolder: string = "generator/config/generator";
    const schemaFileName: string = "tsl_generator_schema.yaml";
    const templateFilesFolder: string = "generator/config/generator/tsl_templates/";
    export const tslGenTemplateFileExtension: string = ".template";
    export const tslGenDataFileExtension: string = ".yaml";
    export const tslGenSchemaFileExtension: string = ".yaml";
    export enum TSLDataFileContentType {
        primitive = "primitive",
        extension = "extension",
        unknown = 2
    }

    export function determineDataFileType(documents: yaml.Document.Parsed<yaml.ParsedNode>[]) {
        for (const doc of documents) {
            if (doc.has("primitive_name")) {
                return TSLDataFileContentType.primitive;
            } else if (doc.has("extension_name")) {
                return TSLDataFileContentType.extension;
            }
        }
        return TSLDataFileContentType.unknown;
    }
    export function determineFileTypeByLocation(uri: vscode.Uri | string): TSLDataFileContentType {
        const _uri: vscode.Uri = FileSystemUtils.toUri(uri);
        const _currentFolder: vscode.Uri = FileSystemUtils.truncateFile(_uri);
        if (FileSystemUtils.containsAny(_currentFolder, primitiveDataFolderName, extensionDataFolderName)) {
            const _currentDataFolder = FileSystemUtils.moveUpTo(_currentFolder, primitiveDataFolderName, extensionDataFolderName);
            if (_currentDataFolder) {
                if (FileSystemUtils.baseNameEqual(_currentDataFolder, primitiveDataFolderName)) {
                    return TSLDataFileContentType.primitive;
                } else if (FileSystemUtils.baseNameEqual(_currentDataFolder, extensionDataFolderName)) {
                    return TSLDataFileContentType.extension;
                }
            }
        }
        return TSLDataFileContentType.unknown;
    }

    export interface TSLGeneratorSpecs {
        tslgenRootFolder: vscode.Uri;
        tslgenDataFolder: vscode.Uri;
        tslgenPrimitiveDataFolder: vscode.Uri;
        tslgenExtensionDataFolder: vscode.Uri;
        tslgenDataSchemaFile: vscode.Uri;
        tslgenTemplateRootFolder: vscode.Uri;
        tslgenTemplateFilesFolders: vscode.Uri[];
        tslgenTemplateFiles: FileSystemUtils.MutableFile[];
    }

    export function isTSLGeneratorDataFile(currentFile: vscode.Uri | string): boolean {
        if (FileSystemUtils.getFileExtension(currentFile) === tslGenDataFileExtension) {
            const _currentFile: vscode.Uri = FileSystemUtils.toUri(currentFile);
            const _currentFolder: vscode.Uri = FileSystemUtils.truncateFile(_currentFile);
            if (FileSystemUtils.containsAny(_currentFolder, primitiveDataFolderName, extensionDataFolderName)) {
                const _currentDataFolder = FileSystemUtils.moveUpTo(_currentFolder, primitiveDataFolderName, extensionDataFolderName);
                if (_currentDataFolder) {
                    const _tslGenDataFolder = FileSystemUtils.moveUp(_currentDataFolder, 1);
                    if (_tslGenDataFolder) {
                        if (FileSystemUtils.baseNameEqual(_tslGenDataFolder, tslGenDataFolderName)) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    export async function getTSLGeneratorModelForFile(_currentFile: vscode.Uri): Promise<TSLGeneratorSpecs | undefined> {
        const _currentFolder: vscode.Uri = FileSystemUtils.truncateFile(_currentFile);
        if (FileSystemUtils.containsAny(_currentFolder, primitiveDataFolderName, extensionDataFolderName)) {
            const _currentDataFolder = FileSystemUtils.moveUpTo(_currentFolder, primitiveDataFolderName, extensionDataFolderName);
            if (_currentDataFolder) {
                const _tslGenDataFolder = FileSystemUtils.moveUp(_currentDataFolder, 1);
                if (_tslGenDataFolder) {
                    if (FileSystemUtils.baseNameEqual(_tslGenDataFolder, tslGenDataFolderName)) {
                        const _tslGenFolder = FileSystemUtils.moveUp(_tslGenDataFolder, 1);
                        const _tslSchemaFile = FileSystemUtils.addPathToUri(_tslGenFolder, ...FileSystemUtils.split(schemaFileFolder), schemaFileName);
                        if (await FileSystemUtils.fileExists(_tslSchemaFile)) {
                            const _tslTemplateFolder = FileSystemUtils.addPathToUri(_tslGenFolder, ...FileSystemUtils.split(templateFilesFolder));
                            if (await FileSystemUtils.isDirectory(_tslTemplateFolder)) {
                                return {
                                    tslgenRootFolder: _tslGenFolder,
                                    tslgenDataFolder: _tslGenDataFolder,
                                    tslgenPrimitiveDataFolder: FileSystemUtils.addPathToUri(_tslGenDataFolder, primitiveDataFolderName),
                                    tslgenExtensionDataFolder: FileSystemUtils.addPathToUri(_tslGenDataFolder, extensionDataFolderName),
                                    tslgenDataSchemaFile: _tslSchemaFile,
                                    tslgenTemplateRootFolder: _tslTemplateFolder,
                                    tslgenTemplateFilesFolders: await FileSystemUtils.subdirectories(_tslTemplateFolder, tslGenTemplateFileExtension),
                                    tslgenTemplateFiles: await FileSystemUtils.iterFiles(_tslTemplateFolder, tslGenTemplateFileExtension)
                                };
                            }
                        }
                    }
                }
            }                
        }
    }

    export async function getTSLGeneratorModelForCurrentActiveFile(): Promise<TSLGeneratorSpecs | undefined> {
        if (EditorUtils.isActiveEditor()) {
            const _currentFile: vscode.Uri = EditorUtils.getUriOfActiveEditor() as vscode.Uri;
            return await getTSLGeneratorModelForFile(_currentFile);
        }
        return undefined;
    }

    export function getTSLRootFolderForCurrentActiveFile(): vscode.Uri | undefined {
        if (EditorUtils.isActiveEditor()) {
            const _currentFile: vscode.Uri = EditorUtils.getUriOfActiveEditor() as vscode.Uri;
            const _currentFolder: vscode.Uri = FileSystemUtils.truncateFile(_currentFile);
            if (FileSystemUtils.containsAny(_currentFolder, primitiveDataFolderName, extensionDataFolderName)) {
                const _currentDataFolder = FileSystemUtils.moveUpTo(_currentFolder, primitiveDataFolderName, extensionDataFolderName);
                if (_currentDataFolder) {
                    const _tslGenDataFolder = FileSystemUtils.moveUp(_currentDataFolder, 1);
                    if (FileSystemUtils.baseNameEqual(_tslGenDataFolder, tslGenDataFolderName)) {
                        return FileSystemUtils.moveUp(_tslGenDataFolder, 1);
                    }
                }
            }
        }
        return undefined;
    }

    export function getTSLRootFolder(dataFileUri: vscode.Uri | string): vscode.Uri | undefined {
        const _currentFile: vscode.Uri = FileSystemUtils.toUri(dataFileUri);
        const _currentFolder: vscode.Uri = FileSystemUtils.truncateFile(_currentFile);
        if (FileSystemUtils.containsAny(_currentFolder, primitiveDataFolderName, extensionDataFolderName)) {
            const _currentDataFolder = FileSystemUtils.moveUpTo(_currentFolder, primitiveDataFolderName, extensionDataFolderName);
            if (_currentDataFolder) {
                const _tslGenDataFolder = FileSystemUtils.moveUp(_currentDataFolder, 1);
                if (FileSystemUtils.baseNameEqual(_tslGenDataFolder, tslGenDataFolderName)) {
                    return FileSystemUtils.moveUp(_tslGenDataFolder, 1);
                }
            }
        }
        return undefined;
    }

    export async function sortPrimitives(docs: SerializerUtils.YamlDocument[]): Promise<SerializerUtils.YamlDocument[]> {
        // 
        // const _sortedDocs = 
        //     docs.slice(1).sort((left,right) => {
        //         const _leftFunctorName = left.get("functor_name") ?? left.get("primitive_name") ?? '';
        //         const _rightFunctorName = right.get("functor_name") ?? right.get("primitive_name") ?? '';
        //         if (_leftFunctorName > _rightFunctorName) {
        //             return -1;
        //         } else if (_leftFunctorName < _rightFunctorName) {
        //             return 1;
        //         }
        //         return 0;
        //     });
        const _promises = docs.slice(1).map(async (doc) => {
            const combinedName = `${doc.get("primitive_name") ?? ''}::${doc.get("functor_name") ?? ''}`;
            // const functorName = doc.get("functor_name") ?? doc.get("primitive_name") ?? '';
            return { doc, combinedName };
        });
        
        const _sortedDocs = await Promise.all(_promises)
            .then((values) => {
                return values.sort((left, right) => {
                    if (left.combinedName > right.combinedName) {
                        return 1;
                    } else if (left.combinedName < right.combinedName) {
                        return -1;
                    }
                    return 0;
                }).map((value) => {
                    return value.doc;
                });
            });
        const _allSortedPromises = 
            _sortedDocs.map(async (entry) => {
                const _definitionsItem = entry.get("definitions");
                if (_definitionsItem && yaml.isCollection(_definitionsItem)) {
                    const _sortedDefinitions = _definitionsItem.items.sort((left, right) => {
                        const _leftDefinition = left as yaml.YAMLMap<unknown, unknown>;
                        const _rightDefinition = right as yaml.YAMLMap<unknown, unknown>;
                        const _leftExtensionName = _leftDefinition.get("target_extension") ?? '';
                        const _rightExtensionName = _rightDefinition.get("target_extension") ?? '';
                        if (_leftExtensionName > _rightExtensionName) {
                            return 1;
                        } else if (_leftExtensionName < _rightExtensionName) {
                            return -1;
                        } else {
                            const _leftFlagsItem = _leftDefinition.get("lscpu_flags");
                            const _leftFlags: string = (_leftFlagsItem) ? ((yaml.isCollection(_leftFlagsItem)) ? _leftFlagsItem.items.join(", ") : `${_leftFlagsItem}`) : "";
                            const _rightFlagsItem = _rightDefinition.get("lscpu_flags");
                            const _rightFlags: string = (_rightFlagsItem) ? ((yaml.isCollection(_rightFlagsItem)) ? _rightFlagsItem.items.join(", ") : `${_rightFlagsItem}`) : "";
                            if (_leftFlags > _rightFlags) {
                                return 1;
                            } else if (_leftFlags < _rightFlags) {
                                return -1;
                            }
                            return 0;
                        }
                    });
                    entry.set("definitions", _sortedDefinitions);
                }
                return entry;
            });
        const _allSorted = await Promise.all(_allSortedPromises);
        return [docs[0]].concat(_allSorted);
    }

}