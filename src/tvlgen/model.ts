import * as vscode from 'vscode';
import * as yaml from 'yaml';

import { FileSystemUtils } from '../utils/files';
import { EditorUtils } from '../utils/vscode_editor';

export namespace TVLGeneratorModel {
    const primitiveDataFolderName: string = "primitives";
    const extensionDataFolderName: string = "extensions";
    const tvlGenDataFolderName: string = "primitive_data";
    const schemaFileFolder: string = "generator/config/generator";
    const schemaFileName: string = "tvl_generator_schema.yaml";
    const templateFilesFolder: string = "generator/config/generator/tvl_templates/";
    export const tvlGenTemplateFileExtension: string = ".template";
    export const tvlGenDataFileExtension: string = ".yaml";
    export const tvlGenSchemaFileExtension: string = ".yaml";
    export enum TVLDataFileContentType {
        primitive = "primitive",
        extension = "extension",
        unknown = 2
    }

    export function determineDataFileType(documents: yaml.Document.Parsed<yaml.ParsedNode>[]) {
        for (const doc of documents) {
            if (doc.has("primitive_name")) {
                return TVLDataFileContentType.primitive;
            } else if (doc.has("extension_name")) {
                return TVLDataFileContentType.extension;
            }
        }
        return TVLDataFileContentType.unknown;
    }
    export function determineFileTypeByLocation(uri: vscode.Uri | string): TVLDataFileContentType {
        const _uri: vscode.Uri = FileSystemUtils.toUri(uri);
        const _currentFolder: vscode.Uri = FileSystemUtils.truncateFile(_uri);
        if (FileSystemUtils.containsAny(_currentFolder, primitiveDataFolderName, extensionDataFolderName)) {
            const _currentDataFolder = FileSystemUtils.moveUpTo(_currentFolder, primitiveDataFolderName, extensionDataFolderName);
            if (_currentDataFolder) {
                if (FileSystemUtils.baseNameEqual(_currentDataFolder, primitiveDataFolderName)) {
                    return TVLDataFileContentType.primitive;
                } else if (FileSystemUtils.baseNameEqual(_currentDataFolder, extensionDataFolderName)) {
                    return TVLDataFileContentType.extension;
                }
            }
        }
        return TVLDataFileContentType.unknown;
    }

    export interface TVLGeneratorSpecs {
        tvlgenRootFolder: vscode.Uri;
        tvlgenDataFolder: vscode.Uri;
        tvlgenPrimitiveDataFolder: vscode.Uri;
        tvlgenExtensionDataFolder: vscode.Uri;
        tvlgenDataSchemaFile: vscode.Uri;
        tvlgenTemplateRootFolder: vscode.Uri;
        tvlgenTemplateFilesFolders: vscode.Uri[];
        tvlgenTemplateFiles: FileSystemUtils.MutableFile[];
    }

    export function isTVLGeneratorDataFile(currentFile: vscode.Uri | string): boolean {
        const _currentFile: vscode.Uri = FileSystemUtils.toUri(currentFile);
        const _currentFolder: vscode.Uri = FileSystemUtils.truncateFile(_currentFile);
        if (FileSystemUtils.containsAny(_currentFolder, primitiveDataFolderName, extensionDataFolderName)) {
            const _currentDataFolder = FileSystemUtils.moveUpTo(_currentFolder, primitiveDataFolderName, extensionDataFolderName);
            if (_currentDataFolder) {
                const _tvlGenDataFolder = FileSystemUtils.moveUp(_currentDataFolder, 1);
                if (_tvlGenDataFolder) {
                    if (FileSystemUtils.baseNameEqual(_tvlGenDataFolder, tvlGenDataFolderName)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    export async function getTVLGeneratorModelForCurrentActiveFile(): Promise<TVLGeneratorSpecs | undefined> {
        if (EditorUtils.isActiveEditor()) {
            const _currentFile: vscode.Uri = EditorUtils.getUriOfActiveEditor() as vscode.Uri;
            const _currentFolder: vscode.Uri = FileSystemUtils.truncateFile(_currentFile);
            if (FileSystemUtils.containsAny(_currentFolder, primitiveDataFolderName, extensionDataFolderName)) {
                const _currentDataFolder = FileSystemUtils.moveUpTo(_currentFolder, primitiveDataFolderName, extensionDataFolderName);
                if (_currentDataFolder) {
                    const _tvlGenDataFolder = FileSystemUtils.moveUp(_currentDataFolder, 1);
                    if (_tvlGenDataFolder) {
                        if (FileSystemUtils.baseNameEqual(_tvlGenDataFolder, tvlGenDataFolderName)) {
                            const _tvlGenFolder = FileSystemUtils.moveUp(_tvlGenDataFolder, 1);
                            const _tvlSchemaFile = FileSystemUtils.addPathToUri(_tvlGenFolder, ...FileSystemUtils.split(schemaFileFolder), schemaFileName);
                            if (await FileSystemUtils.fileExists(_tvlSchemaFile)) {
                                const _tvlTemplateFolder = FileSystemUtils.addPathToUri(_tvlGenFolder, ...FileSystemUtils.split(templateFilesFolder));
                                if (await FileSystemUtils.isDirectory(_tvlTemplateFolder)) {
                                    return {
                                        tvlgenRootFolder: _tvlGenFolder,
                                        tvlgenDataFolder: _tvlGenDataFolder,
                                        tvlgenPrimitiveDataFolder: FileSystemUtils.addPathToUri(_tvlGenDataFolder, primitiveDataFolderName),
                                        tvlgenExtensionDataFolder: FileSystemUtils.addPathToUri(_tvlGenDataFolder, extensionDataFolderName),
                                        tvlgenDataSchemaFile: _tvlSchemaFile,
                                        tvlgenTemplateRootFolder: _tvlTemplateFolder,
                                        tvlgenTemplateFilesFolders: await FileSystemUtils.subdirectories(_tvlTemplateFolder, tvlGenTemplateFileExtension),
                                        tvlgenTemplateFiles: await FileSystemUtils.iterFiles(_tvlTemplateFolder, tvlGenTemplateFileExtension)
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

    export function getTVLRootFolderForCurrentActiveFile(): vscode.Uri | undefined {
        if (EditorUtils.isActiveEditor()) {
            const _currentFile: vscode.Uri = EditorUtils.getUriOfActiveEditor() as vscode.Uri;
            const _currentFolder: vscode.Uri = FileSystemUtils.truncateFile(_currentFile);
            if (FileSystemUtils.containsAny(_currentFolder, primitiveDataFolderName, extensionDataFolderName)) {
                const _currentDataFolder = FileSystemUtils.moveUpTo(_currentFolder, primitiveDataFolderName, extensionDataFolderName);
                if (_currentDataFolder) {
                    const _tvlGenDataFolder = FileSystemUtils.moveUp(_currentDataFolder, 1);
                    if (FileSystemUtils.baseNameEqual(_tvlGenDataFolder, tvlGenDataFolderName)) {
                        return FileSystemUtils.moveUp(_tvlGenDataFolder, 1);
                    }
                }
            }
        }
        return undefined;
    }

    export function getTVLRootFolder(dataFileUri: vscode.Uri | string): vscode.Uri | undefined {
        const _currentFile: vscode.Uri = FileSystemUtils.toUri(dataFileUri);
        const _currentFolder: vscode.Uri = FileSystemUtils.truncateFile(_currentFile);
        if (FileSystemUtils.containsAny(_currentFolder, primitiveDataFolderName, extensionDataFolderName)) {
            const _currentDataFolder = FileSystemUtils.moveUpTo(_currentFolder, primitiveDataFolderName, extensionDataFolderName);
            if (_currentDataFolder) {
                const _tvlGenDataFolder = FileSystemUtils.moveUp(_currentDataFolder, 1);
                if (FileSystemUtils.baseNameEqual(_tvlGenDataFolder, tvlGenDataFolderName)) {
                    return FileSystemUtils.moveUp(_tvlGenDataFolder, 1);
                }
            }
        }
        return undefined;
    }

}