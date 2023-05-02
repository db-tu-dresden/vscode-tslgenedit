import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { TVLGeneratorModel } from "../tvlgen/model";
import { EditorUtils } from "../utils/vscode_editor";
import { FileSystemUtils } from '../utils/files';
import { TVLEditorTransformation } from './transform';
import { SerializerUtils } from '../utils/serialize';
import { TVLEditorPreview } from './preview';
import { TVLEditorFileSymbols } from './symbols';
import { TVLGeneratorSchema } from '../tvlgen/schema';



export class TVLEditorExtension {

    private static instance: TVLEditorExtension;
    private openedTVLGenerators: { [key: string]: TVLGeneratorModel.TVLGeneratorSpecs } = {};
    private templateManager: TVLEditorPreview.TemplateManager = TVLEditorPreview.templateManager;
    private fsWatchers: vscode.FileSystemWatcher[] = [];
    private schemaLocations: { [key: string]: TVLGeneratorSchema.SchemaFileLocations } = {};
    private schemata: { [key: string]: TVLGeneratorSchema.Schemata } = {};
    private constructor() { }
    public static getInstance(): TVLEditorExtension {
        if (!TVLEditorExtension.instance) {
            TVLEditorExtension.instance = new TVLEditorExtension();
        }
        return TVLEditorExtension.instance;
    }
    public getSchema(_currentFileUri: vscode.Uri): TVLGeneratorSchema.Schemata | undefined{
        const _rootFolder = TVLGeneratorModel.getTVLRootFolder(_currentFileUri);
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
    private async init(specs: TVLGeneratorModel.TVLGeneratorSpecs) {
        const progressOptions = { location: vscode.ProgressLocation.Notification, title: `Initializing directory...` };
        const progressCallback = async (progress: vscode.Progress<{ message?: string; }>) => {
            const _twigTemplateFolders = specs.tvlgenTemplateFilesFolders.map((folder) => FileSystemUtils.addPathToUri(folder, this.templateManager.twingDirectoryName));

            for (const templateFolder of _twigTemplateFolders) {
                progress.report({ message: `Creating directory ${templateFolder.fsPath}` });
                const createSuccess = await FileSystemUtils.createDir(templateFolder);
                if (!createSuccess) {
                    vscode.window.showErrorMessage(`Could not create Directory ${templateFolder.fsPath}.`);
                    return false;
                }
            }
            const templateTransformationTargets: TVLEditorTransformation.TransformationTarget[] = specs.tvlgenTemplateFiles.map((templateFile) => {
                return {
                    sourceFile: templateFile.uri,
                    targetFolder: this.getTemplateTargetFolder(templateFile.uri)
                };
            });
            progress.report({ message: `Performing Template-Transformation...` });
            const templateTransformationSuccess = await TVLEditorTransformation.transformTemplates(templateTransformationTargets);
            if (!templateTransformationSuccess) {
                vscode.window.showErrorMessage("Could not transform templates.");
                return false;
            }
            this.templateManager.addTemplateDirectories(_twigTemplateFolders, specs.tvlgenTemplateRootFolder);

            progress.report({ message: `Performing Schema-Transformation...` });
            const _schemata = await TVLEditorTransformation.transformSchema({
                sourceFile: specs.tvlgenDataSchemaFile,
                targetFolder: specs.tvlgenDataFolder
            }, false);
            if (!_schemata) {
                vscode.window.showErrorMessage("Could not transform schame.");
                return false;
            }
    
            this.schemata[specs.tvlgenRootFolder.fsPath] = _schemata as TVLGeneratorSchema.Schemata;
            // this.schemaLocations[specs.tvlgenRootFolder.fsPath] = _schemaTransformationLocation;
            return true;
        };
        return await vscode.window.withProgress(progressOptions, progressCallback);
    }

    public async update(): Promise<boolean> {
        const _currentSpecs = await TVLGeneratorModel.getTVLGeneratorModelForCurrentActiveFile();
        if (_currentSpecs) {
            if (!(_currentSpecs.tvlgenRootFolder.fsPath in this.openedTVLGenerators)) {
                const progressOptions = { location: vscode.ProgressLocation.Notification, title: `Indexing TVLGenerator Directory ${_currentSpecs.tvlgenRootFolder.fsPath}...` };
                const progressCallback = async (progress: vscode.Progress<{ message?: string; }>) => {
                    this.openedTVLGenerators[_currentSpecs.tvlgenRootFolder.fsPath] = _currentSpecs;
                    const initSuccess = await this.init(_currentSpecs);
                    if (!initSuccess) {
                        vscode.window.showErrorMessage(`Could not initialize TVLEditorExtension for ${_currentSpecs.tvlgenRootFolder.fsPath}`);
                        return false;
                    }
                    progress.report({ message: `Creating FileSystemWatchers for ${_currentSpecs.tvlgenDataSchemaFile.fsPath}` });
                    const _schemaWatcher = vscode.workspace.createFileSystemWatcher(_currentSpecs.tvlgenDataSchemaFile.fsPath);
                    _schemaWatcher.onDidCreate(async (uri) => {
                        console.log(`Transform schema: ${uri} --> ${_currentSpecs.tvlgenPrimitiveDataFolder}`);
                        const transformResult = await TVLEditorTransformation.transformSchema({ sourceFile: uri, targetFolder: _currentSpecs.tvlgenDataFolder });
                        if (!transformResult) {
                            vscode.window.showErrorMessage(`Could not transform schema ${uri.fsPath}.`);
                        } else {
                            this.schemata[_currentSpecs.tvlgenRootFolder.fsPath] = transformResult as TVLGeneratorSchema.Schemata;
                        }
                    });
                    _schemaWatcher.onDidChange(async (uri) => {
                        console.log(`Transform schema: ${uri} --> ${_currentSpecs.tvlgenPrimitiveDataFolder}`);
                        const transformResult = await TVLEditorTransformation.transformSchema({ sourceFile: uri, targetFolder: _currentSpecs.tvlgenDataFolder });
                        if (!transformResult) {
                            vscode.window.showErrorMessage(`Could not transform schema ${uri.fsPath}.`);
                        } else {
                            this.schemata[_currentSpecs.tvlgenRootFolder.fsPath] = transformResult as TVLGeneratorSchema.Schemata;
                        }
                    });
                    this.fsWatchers.push(_schemaWatcher);

                    for (const templateFileFolder of _currentSpecs.tvlgenTemplateFilesFolders) {
                        const _templateWatcherPattern = FileSystemUtils.addPathToUri(templateFileFolder, "*", TVLGeneratorModel.tvlGenTemplateFileExtension).fsPath;
                        progress.report({ message: `Creating FileSystemWatchers for ${_templateWatcherPattern}` });
                        const _templateWatcher = vscode.workspace.createFileSystemWatcher(_templateWatcherPattern);
                        _templateWatcher.onDidCreate(async (uri) => {
                            let transformationTargets : TVLEditorTransformation.TransformationTarget[];
                            if (await FileSystemUtils.isDirectory(uri)) {
                                transformationTargets = (await FileSystemUtils.iterFiles(uri, TVLGeneratorModel.tvlGenTemplateFileExtension)).map((templateFile) => {
                                    return {
                                        sourceFile: templateFile.uri,
                                        targetFolder: this.getTemplateTargetFolder(templateFile.uri)
                                    };
                                });
                            } else {
                                transformationTargets = [{ sourceFile: uri, targetFolder: this.getTemplateTargetFolder(uri) }];
                            }
                            console.log(`Transform templates: ${uri} --> ${this.getTemplateTargetFolder(uri)}`);
                            const transformSuccess = await TVLEditorTransformation.transformTemplates(transformationTargets);
                            if (!transformSuccess) {
                                vscode.window.showErrorMessage(`Could not transform template ${uri.fsPath}.`);
                            }
                        });
                        _templateWatcher.onDidChange(async (uri) => {
                            let transformationTargets : TVLEditorTransformation.TransformationTarget[];
                            if (await FileSystemUtils.isDirectory(uri)) {
                                transformationTargets = (await FileSystemUtils.iterFiles(uri, TVLGeneratorModel.tvlGenTemplateFileExtension)).map((templateFile) => {
                                    return {
                                        sourceFile: templateFile.uri,
                                        targetFolder: this.getTemplateTargetFolder(templateFile.uri)
                                    };
                                });
                            } else {
                                transformationTargets = [{ sourceFile: uri, targetFolder: this.getTemplateTargetFolder(uri) }];
                            }
                            console.log(`Transform templates: ${uri} --> ${this.getTemplateTargetFolder(uri)}`);
                            const transformSuccess = await TVLEditorTransformation.transformTemplates(transformationTargets);
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
        const _currentTVLRoot = await TVLGeneratorModel.getTVLRootFolderForCurrentActiveFile();
        if (!_currentTVLRoot) {
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
        const _fileType = TVLGeneratorModel.determineDataFileType(_parsedDocuments);
        if (_fileType === TVLGeneratorModel.TVLDataFileContentType.unknown) {
            return [];
        }
        if (_fileType === TVLGeneratorModel.TVLDataFileContentType.extension) {
            return TVLEditorFileSymbols.getTVLExtensionDocumentSymbols(_document, _parsedDocuments);
        } else if (_fileType === TVLGeneratorModel.TVLDataFileContentType.primitive) {
            return TVLEditorFileSymbols.getTVLPrimitiveDocumentSymbols(_document, _parsedDocuments);
        } else {
            return [];
        }
    }

    public async renderCurrentSelection(): Promise<TVLEditorPreview.RenderedString[]> {
        const _currentTVLRoot = await TVLGeneratorModel.getTVLRootFolderForCurrentActiveFile();
        if (!_currentTVLRoot) {
            return [TVLEditorPreview.emptyRenderedString()];
        }
        if (!(_currentTVLRoot.fsPath in this.openedTVLGenerators)) {
            const selected = await vscode.window.showErrorMessage(`${_currentTVLRoot.fsPath} was not parsed yet.`, "Initialize", "Ignore");
            if (selected) {
                if (selected === 'Initialize') {
                    await this.update();
                    if (!(_currentTVLRoot.fsPath in this.openedTVLGenerators)) {
                        vscode.window.showErrorMessage(`${_currentTVLRoot.fsPath} could not be parsed.`);
                        return [TVLEditorPreview.emptyRenderedString()];
                    }
                } else {
                    return [TVLEditorPreview.emptyRenderedString()];
                }
            } else {            
                return [TVLEditorPreview.emptyRenderedString()];
            }
        }
        const _tvlGenSpecs: TVLGeneratorModel.TVLGeneratorSpecs = this.openedTVLGenerators[_currentTVLRoot.fsPath];
        const _defaults = await TVLEditorTransformation.getDefaultsFromYamlSchema(_tvlGenSpecs.tvlgenDataSchemaFile);
        if (!_defaults) {
            vscode.window.showErrorMessage(`Could not parse default values from schema.`);
            return [TVLEditorPreview.emptyRenderedString()];
        }
        const _currentActiveEditor = EditorUtils.getActiveEditor();
        if (!_currentActiveEditor) {
            return [TVLEditorPreview.emptyRenderedString()];
        }
        const _currentActiveDocument = _currentActiveEditor.document;
        const _parsedDocuments = SerializerUtils.parseYamlDocuments(_currentActiveDocument.getText());
        if ("empty" in _parsedDocuments) {
            return [TVLEditorPreview.emptyRenderedString()];
        }
        const _currentCursorPosition = _currentActiveEditor.selection.active;
        const result = await TVLEditorPreview.renderSelection(
            _tvlGenSpecs, 
            _defaults,
            _currentActiveDocument, 
            _parsedDocuments, 
            _currentCursorPosition);
        console.error(result[0].content);
        console.log("end");
        return result;
    }
}
export const tvlEditorExtension = TVLEditorExtension.getInstance();