import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { TSLGeneratorModel } from "../tslgen/model";
import { EditorUtils } from "../utils/vscode_editor";
import { FileSystemUtils } from '../utils/files';
import { TSLEditorTransformation } from './transform';
import { SerializerUtils } from '../utils/serialize';
import { TSLEditorPreview } from './preview';
import { TSLEditorFileSymbols } from './symbols';
import { TSLGeneratorSchema } from '../tslgen/schema';



export class TSLEditorExtension {

    private static instance: TSLEditorExtension;
    private openedTSLGenerators: { [key: string]: TSLGeneratorModel.TSLGeneratorSpecs } = {};
    private templateManager: TSLEditorPreview.TemplateManager = TSLEditorPreview.templateManager;
    private fsWatchers: vscode.FileSystemWatcher[] = [];
    private schemaLocations: { [key: string]: TSLGeneratorSchema.SchemaFileLocations } = {};
    private schemata: { [key: string]: TSLGeneratorSchema.Schemata } = {};
    private constructor() { }
    public static getInstance(): TSLEditorExtension {
        if (!TSLEditorExtension.instance) {
            TSLEditorExtension.instance = new TSLEditorExtension();
        }
        return TSLEditorExtension.instance;
    }
    public getSchema(_currentFileUri: vscode.Uri): TSLGeneratorSchema.Schemata | undefined{
        const _rootFolder = TSLGeneratorModel.getTSLRootFolder(_currentFileUri);
        if (_rootFolder) {
            if (_rootFolder.fsPath in this.schemata) {
                return this.schemata[_rootFolder.fsPath];
            }
        } 
        return undefined;
    }
    private getTemplateTargetFolder(jinja2File: vscode.Uri) {
        return FileSystemUtils.addPathToUri(FileSystemUtils.truncateFile(jinja2File), this.templateManager.twingDirectoryName);
    }
    private async init(specs: TSLGeneratorModel.TSLGeneratorSpecs) {
        const progressOptions = { location: vscode.ProgressLocation.Notification, title: `Initializing directory...` };
        const progressCallback = async (progress: vscode.Progress<{ message?: string; }>) => {
            const _twigTemplateFolders = specs.tslgenTemplateFilesFolders.map((folder) => FileSystemUtils.addPathToUri(folder, this.templateManager.twingDirectoryName));

            for (const templateFolder of _twigTemplateFolders) {
                progress.report({ message: `Creating directory ${templateFolder.fsPath}` });
                const createSuccess = await FileSystemUtils.createDir(templateFolder);
                if (!createSuccess) {
                    vscode.window.showErrorMessage(`Could not create Directory ${templateFolder.fsPath}.`);
                    return false;
                }
            }
            const templateTransformationTargets: TSLEditorTransformation.TransformationTarget[] = specs.tslgenTemplateFiles.map((templateFile) => {
                return {
                    sourceFile: templateFile.uri,
                    targetFolder: this.getTemplateTargetFolder(templateFile.uri)
                };
            });
            progress.report({ message: `Performing Template-Transformation...` });
            const templateTransformationSuccess = await TSLEditorTransformation.transformTemplates(templateTransformationTargets);
            if (!templateTransformationSuccess) {
                vscode.window.showErrorMessage("Could not transform templates.");
                return false;
            }
            this.templateManager.addTemplateDirectories(_twigTemplateFolders, specs.tslgenTemplateRootFolder);

            progress.report({ message: `Performing Schema-Transformation...` });
            const _schemata = await TSLEditorTransformation.transformSchema({
                sourceFile: specs.tslgenDataSchemaFile,
                targetFolder: specs.tslgenDataFolder
            }, false);
            if (!_schemata) {
                vscode.window.showErrorMessage("Could not transform schame.");
                return false;
            }
    
            this.schemata[specs.tslgenRootFolder.fsPath] = _schemata as TSLGeneratorSchema.Schemata;
            // this.schemaLocations[specs.tslgenRootFolder.fsPath] = _schemaTransformationLocation;
            return true;
        };
        return await vscode.window.withProgress(progressOptions, progressCallback);
    }

    public async update(): Promise<boolean> {
        const _currentSpecs = await TSLGeneratorModel.getTSLGeneratorModelForCurrentActiveFile();
        if (_currentSpecs) {
            if (!(_currentSpecs.tslgenRootFolder.fsPath in this.openedTSLGenerators)) {
                const progressOptions = { location: vscode.ProgressLocation.Notification, title: `Indexing TSLGenerator Directory ${_currentSpecs.tslgenRootFolder.fsPath}...` };
                const progressCallback = async (progress: vscode.Progress<{ message?: string; }>) => {
                    this.openedTSLGenerators[_currentSpecs.tslgenRootFolder.fsPath] = _currentSpecs;
                    const initSuccess = await this.init(_currentSpecs);
                    if (!initSuccess) {
                        vscode.window.showErrorMessage(`Could not initialize TSLEditorExtension for ${_currentSpecs.tslgenRootFolder.fsPath}`);
                        return false;
                    }
                    progress.report({ message: `Creating FileSystemWatchers for ${_currentSpecs.tslgenDataSchemaFile.fsPath}` });
                    const _schemaWatcher = vscode.workspace.createFileSystemWatcher(_currentSpecs.tslgenDataSchemaFile.fsPath);
                    _schemaWatcher.onDidCreate(async (uri) => {
                        console.log(`Transform schema: ${uri} --> ${_currentSpecs.tslgenPrimitiveDataFolder}`);
                        const transformResult = await TSLEditorTransformation.transformSchema({ sourceFile: uri, targetFolder: _currentSpecs.tslgenDataFolder });
                        if (!transformResult) {
                            vscode.window.showErrorMessage(`Could not transform schema ${uri.fsPath}.`);
                        } else {
                            this.schemata[_currentSpecs.tslgenRootFolder.fsPath] = transformResult as TSLGeneratorSchema.Schemata;
                        }
                    });
                    _schemaWatcher.onDidChange(async (uri) => {
                        console.log(`Transform schema: ${uri} --> ${_currentSpecs.tslgenPrimitiveDataFolder}`);
                        const transformResult = await TSLEditorTransformation.transformSchema({ sourceFile: uri, targetFolder: _currentSpecs.tslgenDataFolder });
                        if (!transformResult) {
                            vscode.window.showErrorMessage(`Could not transform schema ${uri.fsPath}.`);
                        } else {
                            this.schemata[_currentSpecs.tslgenRootFolder.fsPath] = transformResult as TSLGeneratorSchema.Schemata;
                        }
                    });
                    this.fsWatchers.push(_schemaWatcher);

                    for (const templateFileFolder of _currentSpecs.tslgenTemplateFilesFolders) {
                        const _templateWatcherPattern = FileSystemUtils.addPathToUri(templateFileFolder, "*", TSLGeneratorModel.tslGenTemplateFileExtension).fsPath;
                        progress.report({ message: `Creating FileSystemWatchers for ${_templateWatcherPattern}` });
                        const _templateWatcher = vscode.workspace.createFileSystemWatcher(_templateWatcherPattern);
                        _templateWatcher.onDidCreate(async (uri) => {
                            let transformationTargets : TSLEditorTransformation.TransformationTarget[];
                            if (await FileSystemUtils.isDirectory(uri)) {
                                transformationTargets = (await FileSystemUtils.iterFiles(uri, TSLGeneratorModel.tslGenTemplateFileExtension)).map((templateFile) => {
                                    return {
                                        sourceFile: templateFile.uri,
                                        targetFolder: this.getTemplateTargetFolder(templateFile.uri)
                                    };
                                });
                            } else {
                                transformationTargets = [{ sourceFile: uri, targetFolder: this.getTemplateTargetFolder(uri) }];
                            }
                            console.log(`Transform templates: ${uri} --> ${this.getTemplateTargetFolder(uri)}`);
                            const transformSuccess = await TSLEditorTransformation.transformTemplates(transformationTargets);
                            if (!transformSuccess) {
                                vscode.window.showErrorMessage(`Could not transform template ${uri.fsPath}.`);
                            }
                        });
                        _templateWatcher.onDidChange(async (uri) => {
                            let transformationTargets : TSLEditorTransformation.TransformationTarget[];
                            if (await FileSystemUtils.isDirectory(uri)) {
                                transformationTargets = (await FileSystemUtils.iterFiles(uri, TSLGeneratorModel.tslGenTemplateFileExtension)).map((templateFile) => {
                                    return {
                                        sourceFile: templateFile.uri,
                                        targetFolder: this.getTemplateTargetFolder(templateFile.uri)
                                    };
                                });
                            } else {
                                transformationTargets = [{ sourceFile: uri, targetFolder: this.getTemplateTargetFolder(uri) }];
                            }
                            console.log(`Transform templates: ${uri} --> ${this.getTemplateTargetFolder(uri)}`);
                            const transformSuccess = await TSLEditorTransformation.transformTemplates(transformationTargets);
                            if (!transformSuccess) {
                                vscode.window.showErrorMessage(`Could not transform template ${uri.fsPath}.`);
                            }

                        });
                        this.fsWatchers.push(_templateWatcher);
                    }
                    return true;
                };
                return await vscode.window.withProgress(progressOptions, progressCallback);
            } else {
                return true;
            }
        } else {
            return true;
        }
    }

    public async getDocumentSymbols(): Promise<vscode.DocumentSymbol[]> {
        const _currentTSLRoot = await TSLGeneratorModel.getTSLRootFolderForCurrentActiveFile();
        if (!_currentTSLRoot) {
            return [];
        }
        const _document = EditorUtils.getActiveDocument();
        if (!_document) {
            return [];
        }
        const _documentText = _document.getText();
        if (_documentText.length === 0) {
            return [];
        }
        const _parsedDocuments = SerializerUtils.parseYamlDocuments(_documentText);
        if ("empty" in _parsedDocuments) {
            return [];
        }
        const _fileType = TSLGeneratorModel.determineDataFileType(_parsedDocuments);
        if (_fileType === TSLGeneratorModel.TSLDataFileContentType.unknown) {
            return [];
        }
        if (_fileType === TSLGeneratorModel.TSLDataFileContentType.extension) {
            return TSLEditorFileSymbols.getTSLExtensionDocumentSymbols(_document, _parsedDocuments);
        } else if (_fileType === TSLGeneratorModel.TSLDataFileContentType.primitive) {
            return TSLEditorFileSymbols.getTSLPrimitiveDocumentSymbols(_document, _parsedDocuments);
        } else {
            return [];
        }
    }

    public async renderCurrentSelection(): Promise<TSLEditorPreview.RenderedString[]> {
        const _currentTSLRoot = await TSLGeneratorModel.getTSLRootFolderForCurrentActiveFile();
        if (!_currentTSLRoot) {
            return [TSLEditorPreview.emptyRenderedString()];
        }
        if (!(_currentTSLRoot.fsPath in this.openedTSLGenerators)) {
            const selected = await vscode.window.showErrorMessage(`${_currentTSLRoot.fsPath} was not parsed yet.`, "Initialize", "Ignore");
            if (selected) {
                if (selected === 'Initialize') {
                    await this.update();
                    if (!(_currentTSLRoot.fsPath in this.openedTSLGenerators)) {
                        vscode.window.showErrorMessage(`${_currentTSLRoot.fsPath} could not be parsed.`);
                        return [TSLEditorPreview.emptyRenderedString()];
                    }
                } else {
                    return [TSLEditorPreview.emptyRenderedString()];
                }
            } else {            
                return [TSLEditorPreview.emptyRenderedString()];
            }
        }
        const _tslGenSpecs: TSLGeneratorModel.TSLGeneratorSpecs = this.openedTSLGenerators[_currentTSLRoot.fsPath];
        const _defaults = await TSLEditorTransformation.getDefaultsFromYamlSchema(_tslGenSpecs.tslgenDataSchemaFile);
        if (!_defaults) {
            vscode.window.showErrorMessage(`Could not parse default values from schema.`);
            return [TSLEditorPreview.emptyRenderedString()];
        }
        const _currentActiveEditor = EditorUtils.getActiveEditor();
        if (!_currentActiveEditor) {
            return [TSLEditorPreview.emptyRenderedString()];
        }
        const _currentActiveDocument = _currentActiveEditor.document;
        const _parsedDocuments = SerializerUtils.parseYamlDocuments(_currentActiveDocument.getText());
        if ("empty" in _parsedDocuments) {
            return [TSLEditorPreview.emptyRenderedString()];
        }
        const _currentCursorPosition = _currentActiveEditor.selection.active;
        const result = await TSLEditorPreview.renderSelection(
            _tslGenSpecs, 
            _defaults,
            _currentActiveDocument, 
            _parsedDocuments, 
            _currentCursorPosition);
        console.error(result[0].content);
        console.log("end");
        return result;
    }
}
export const tslEditorExtension = TSLEditorExtension.getInstance();