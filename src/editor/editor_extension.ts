import * as vscode from 'vscode';
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
    private constructor() { 
        this.getCurrentTSLRoot = this.getCurrentTSLRoot.bind(this);
    }
    public static getInstance(): TSLEditorExtension {
        if (!TSLEditorExtension.instance) {
            TSLEditorExtension.instance = new TSLEditorExtension();
        }
        return TSLEditorExtension.instance;
    }

    private async getCurrentTSLRoot(silent: boolean = false): Promise<vscode.Uri | undefined> {
        const _currentTSLRoot = await TSLGeneratorModel.getTSLRootFolderForCurrentActiveFile();
        if (!_currentTSLRoot) {
            return undefined;
        }
        if (!(_currentTSLRoot.fsPath in this.openedTSLGenerators)) {
            if (silent) {
                await this.update();
                if (!(_currentTSLRoot.fsPath in this.openedTSLGenerators)) {
                    vscode.window.showErrorMessage(`${_currentTSLRoot.fsPath} could not be parsed.`);
                    return undefined;
                }
            } else {
                const selected = await vscode.window.showErrorMessage(`${_currentTSLRoot.fsPath} was not parsed yet.`, "Initialize", "Ignore");
                if (selected) {
                    if (selected === 'Initialize') {
                        await this.update();
                        if (!(_currentTSLRoot.fsPath in this.openedTSLGenerators)) {
                            vscode.window.showErrorMessage(`${_currentTSLRoot.fsPath} could not be parsed.`);
                            return undefined;
                        }
                    } else {
                        return undefined;
                    }
                } else {            
                    return undefined;
                }
            }
        }
        return _currentTSLRoot;
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
        const _currentTSLRoot = await this.getCurrentTSLRoot();
        if (!_currentTSLRoot) {
            return [TSLEditorPreview.emptyRenderedString()];
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
        return result;
    }

    private async getStringInput(title: string, description: string): Promise<string> {
        const _result = await vscode.window.showInputBox(
            {
                title: title,
                prompt: description
            }
        );
        return _result ?? '';
    }
    private async getQuickPickInput(values: string[], title: string, description: string): Promise<string> {
        const _result = await vscode.window.showQuickPick(
            values, 
            { 
                title: title,
                placeHolder: description
            });
        return _result ?? '';
    }
    public async createFile(): Promise<void> {
        const _currentTSLRoot = await this.getCurrentTSLRoot();
        if (!_currentTSLRoot) {
            return;
        }
        const _currentSpecs = this.openedTSLGenerators[_currentTSLRoot.fsPath];
        const _fileTypeString = await this.getQuickPickInput(["Primitive Class", "Extension"], "New File", "Choose a file type.");
        if (_fileTypeString.trim().length === 0) {
            return;
        }
        if (_fileTypeString === "Extension") {
            const _descriptionFileName = `Insert a concise and explicit name of the new extension. 
            The extension should only consist of alphanumeric characters and '_'. 
            You don't need to add file extension. If a file extension is provied, it will be substituted with *.yaml.`;
            const _desriptionFlynnName = `Choose the type of extension. 
            Is it Single-Instruction-Multiple-Data (SIMD) or Single-Instruction-Multiple-Threads (SIMT).`;
            const _descriptionVendorName = `Insert the vendor name, e.g., arm, intel.
            The input must only consist of characters.`;
            const _fileNameInput = await this.getStringInput("New Extension File (1/3): Extension Name", _descriptionFileName);
            if (_fileNameInput.trim().length === 0) {
                return;
            }
            const _fileNameNormalized = FileSystemUtils.filename(_fileNameInput, false).replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
            if (_fileNameNormalized.trim().length === 0) {
                return;
            }
            const _fileName = FileSystemUtils.filenameWithExtension(_fileNameNormalized, '.yaml');
            const _flynnNameInput = await this.getQuickPickInput(["SIMD", "SIMT"], "New Extension File (2/3): Flynns Class", _desriptionFlynnName);
            if (_flynnNameInput.trim().length === 0) {
                return;
            }
            const _flynnName = _flynnNameInput.toLowerCase();
            const _vendorNameInput = await this.getStringInput("New Extension File (3/3): Vendor Name", _descriptionVendorName);
            if (_vendorNameInput.trim().length === 0) {
                return;
            }
            const _vendorName = _vendorNameInput.replace(/[^a-zA-Z]/, '').toLowerCase();
            if (_vendorName.trim().length === 0) {
                return;
            }
            const _fileValue = `---\ndescription: "Definition of the ${_flynnNameInput} TargetExtension ${_fileNameNormalized}."\nvendor: "${_vendorName}"\nextension_name: "${_fileNameNormalized}"\n...`;
            const _fileUri = FileSystemUtils.addPathToUri(_currentSpecs.tslgenExtensionDataFolder, _flynnName, _vendorName, _fileName);
            if (! await FileSystemUtils.createDir(FileSystemUtils.truncateFile(_fileUri))) {
                return;
            }
            if (! 
                await FileSystemUtils.writeFile(
                    _fileUri, 
                    _fileValue)) {
                return;
            }
            const doc = await vscode.workspace.openTextDocument(_fileUri);
            await vscode.window.showTextDocument(doc);
            return;            
        } else if (_fileTypeString === "Primitive Class") {
            const _primitiveClassName = `Insert a concise and explicit name of the new primitive class.
            The primitive class should only consist of characters, e.g., 'ls', 'calc'.`;
            const _fileNameInput = await this.getStringInput("New Primitive Class File (1/2): Class Name", _primitiveClassName);
            if (_fileNameInput.trim().length === 0) {
                return;
            }
            const _fileNameNormalized = FileSystemUtils.filename(_fileNameInput, false).replace(/[^a-zA-Z]/, '').toLowerCase();
            if (_fileNameNormalized.trim().length === 0) {
                return;
            }
            const _fileName = FileSystemUtils.filenameWithExtension(_fileNameNormalized, '.yaml');
            const _description = `Insert a brief description of the class.`;
            const _primitiveClassDescriptionInput = await this.getStringInput("New Primitive Class File (2/2): Description", _description);
            const _primitivieClassDescription = _primitiveClassDescriptionInput.trim();
            const _fileValue = `---\n#Preamble\nname: "${_fileNameNormalized}"\ndescription: "${_primitivieClassDescription}"\n...`;
            const _fileUri = FileSystemUtils.addPathToUri(_currentSpecs.tslgenPrimitiveDataFolder, _fileName);
            if (! 
                await FileSystemUtils.writeFile(
                    _fileUri, 
                    _fileValue)) {
                return;
            }
            const doc = await vscode.workspace.openTextDocument(_fileUri);
            await vscode.window.showTextDocument(doc);
            return;            
        }
    }
    public async toggleFocusMode(init: boolean = false): Promise<void> {
        const _currentTSLRoot = await this.getCurrentTSLRoot(true);
        if (!_currentTSLRoot) {
            return;
        }
        const _currentSpecs = this.openedTSLGenerators[_currentTSLRoot.fsPath];
        const _irrelevantEntries = 
            (await FileSystemUtils.getDirectories(_currentSpecs.tslgenRootFolder, false))
            .filter((entry) => entry.fsPath !== _currentSpecs.tslgenDataFolder.fsPath)
            .map((entry) => `**${FileSystemUtils.separator}${FileSystemUtils.baseName(entry)}`)
            .concat(
                (await FileSystemUtils.getFiles(_currentSpecs.tslgenRootFolder, false))
                .map((fileEntry) => `**${FileSystemUtils.separator}${FileSystemUtils.baseName(fileEntry)}`)
            );
        const _config = vscode.workspace.getConfiguration();
        const _filesExclude = _config.get<EditorUtils.FilesVisibility>('files.exclude') ?? {};
        const _alreadyPresentEntry = _irrelevantEntries.find((item) => _filesExclude.hasOwnProperty(item));
        const _visibility = (init) ? true : ((_alreadyPresentEntry)? !(_filesExclude[_alreadyPresentEntry]) : true);
        for (const entry of _irrelevantEntries) {
            _filesExclude[entry] = _visibility;
        }
        _config.update("files.exclude", _filesExclude, vscode.ConfigurationTarget.Workspace);
        vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");

    }
}
export const tslEditorExtension = TSLEditorExtension.getInstance();