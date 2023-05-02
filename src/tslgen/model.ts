import * as vscode from 'vscode';
import * as yaml from 'yaml';

import { FileSystemUtils } from '../utils/files';
import { EditorUtils } from '../utils/vscode_editor';

export namespace TSLGeneratorModel {
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
        return false;
    }

    export async function getTSLGeneratorModelForCurrentActiveFile(): Promise<TSLGeneratorSpecs | undefined> {
        if (EditorUtils.isActiveEditor()) {
            const _currentFile: vscode.Uri = EditorUtils.getUriOfActiveEditor() as vscode.Uri;
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

}