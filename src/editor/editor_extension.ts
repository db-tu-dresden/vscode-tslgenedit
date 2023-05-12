import * as vscode from 'vscode';
import { TSLGeneratorModel } from "../tslgen/model";
import { EditorUtils } from "../utils/vscode_editor";
import { FileSystemUtils } from '../utils/files';
import { TSLEditorTransformation } from './transform';
import { SerializerUtils } from '../utils/serialize';
import { TSLEditorPreview } from './preview';
import { TSLEditorFileSymbols } from './symbols';
import { TSLGeneratorSchema } from '../tslgen/schema';
import { YAMLProcessingMode } from './enums';
import { TSLEditorFileDiagnostics } from './diagnostics';
import { ThreadSafeDictionary } from '../utils/thread_structs';

enum ExtensionParsedState {
    processing = 1,
    initialized = 2
};
export class TSLEditorExtension {
    
    private static instance: TSLEditorExtension;
    private tslGeneratorsState: ThreadSafeDictionary<string, ExtensionParsedState> = new ThreadSafeDictionary<string, ExtensionParsedState>();
    private openedTSLGenerators: 
        { [key: string]: {
            specs: TSLGeneratorModel.TSLGeneratorSpecs,
            schemaData: {
                schema: TSLGeneratorSchema.Schemata,
                supplementary: TSLEditorTransformation.SchemaSupplementary
            }
            
        }} = {};
    private templateManager: TSLEditorPreview.TemplateManager = TSLEditorPreview.templateManager;
    private fsWatchers: vscode.FileSystemWatcher[] = [];
    
    private constructor() {
        this.getCurrentTSLRoot = this.getCurrentTSLRoot.bind(this);
    }
    public static getInstance(): TSLEditorExtension {
        if (!TSLEditorExtension.instance) {
            TSLEditorExtension.instance = new TSLEditorExtension();
        }
        return TSLEditorExtension.instance;
    }

    private async getCurrentTSLRoot(silent: boolean = true): Promise<vscode.Uri | undefined> {
        const _currentTSLRoot = TSLGeneratorModel.getTSLRootFolderForCurrentActiveFile();
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

    private async getTSLRoot(_currentFileUri: vscode.Uri, silent: boolean = true) {
        const _rootFolder = TSLGeneratorModel.getTSLRootFolder(_currentFileUri);
        if (!_rootFolder) {
            return undefined;
        }
        if (!(_rootFolder.fsPath in this.openedTSLGenerators)) {
            if (silent) {
                await this.update(_currentFileUri);
                if (!(_rootFolder.fsPath in this.openedTSLGenerators)) {
                    vscode.window.showErrorMessage(`${_rootFolder.fsPath} could not be parsed.`);
                    return undefined;
                }
            } else {
                const selected = await vscode.window.showErrorMessage(`${_rootFolder.fsPath} was not parsed yet.`, "Initialize", "Ignore");
                if (selected) {
                    if (selected === 'Initialize') {
                        await this.update(_currentFileUri);
                        if (!(_rootFolder.fsPath in this.openedTSLGenerators)) {
                            vscode.window.showErrorMessage(`${_rootFolder.fsPath} could not be parsed.`);
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
        return _rootFolder;
    }

    public getSchema(_currentFileUri: vscode.Uri): TSLGeneratorSchema.Schemata | undefined {
        const _rootFolder = TSLGeneratorModel.getTSLRootFolder(_currentFileUri);
        if (_rootFolder) {
            if (_rootFolder.fsPath in this.openedTSLGenerators) {
                return this.openedTSLGenerators[_rootFolder.fsPath].schemaData.schema;
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
                    return undefined;
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
                return undefined;
            }
            this.templateManager.addTemplateDirectories(_twigTemplateFolders, specs.tslgenTemplateRootFolder);

            progress.report({ message: `Performing Schema-Transformation...` });
            const _schemata = await TSLEditorTransformation.transformSchema({
                sourceFile: specs.tslgenDataSchemaFile,
                targetFolder: specs.tslgenDataFolder
            }, false);
            if (!_schemata) {
                vscode.window.showErrorMessage("Could not transform schame.");
                return undefined;
            }
            // this.schemaLocations[specs.tslgenRootFolder.fsPath] = _schemaTransformationLocation;
            return {
                schema: _schemata as TSLGeneratorSchema.Schemata,
                supplementary: await TSLEditorTransformation.getSupplementaryFromYamlSchema(_schemata)
            };
        };
        return await vscode.window.withProgress(progressOptions, progressCallback);
    }

    public async update(uri?: vscode.Uri): Promise<boolean> {
        const _currentSpecs = (uri) ? await TSLGeneratorModel.getTSLGeneratorModelForFile(uri) : await TSLGeneratorModel.getTSLGeneratorModelForCurrentActiveFile();
        if (_currentSpecs) {
            const tslProcessingState = await this.tslGeneratorsState.tryInsert(_currentSpecs.tslgenRootFolder.fsPath, ExtensionParsedState.processing);
            if (!tslProcessingState) {
                let result;
                while (( result = await this.tslGeneratorsState.get(_currentSpecs.tslgenRootFolder.fsPath))) {
                    if ( result === ExtensionParsedState.processing) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } else {
                        return true;
                    }
                } 
                //Another thread tried to initialize the same directory but failed... so consequently we don't have to try it again since nothing changed
                return false;
            } else {
                const progressOptions = { location: vscode.ProgressLocation.Notification, title: `Indexing TSLGenerator Directory ${_currentSpecs.tslgenRootFolder.fsPath}...` };
                const progressCallback = async (progress: vscode.Progress<{ message?: string; }>) => {
                    const _schemaData = await this.init(_currentSpecs);
                    if (!_schemaData) {
                        vscode.window.showErrorMessage(`Could not initialize TSLEditorExtension for ${_currentSpecs.tslgenRootFolder.fsPath}`);
                        await this.tslGeneratorsState.remove(_currentSpecs.tslgenRootFolder.fsPath);
                        return false;
                    }
                    this.openedTSLGenerators[_currentSpecs.tslgenRootFolder.fsPath] = { specs: _currentSpecs, schemaData: { schema: _schemaData.schema, supplementary: _schemaData.supplementary } };
                    
                    progress.report({ message: `Creating FileSystemWatchers for ${_currentSpecs.tslgenDataSchemaFile.fsPath}` });
                    const _schemaWatcher = vscode.workspace.createFileSystemWatcher(_currentSpecs.tslgenDataSchemaFile.fsPath);
                    _schemaWatcher.onDidCreate(async (uri) => {
                        console.log(`Transform schema: ${uri} --> ${_currentSpecs.tslgenPrimitiveDataFolder}`);
                        const transformResult = await TSLEditorTransformation.transformSchema({ sourceFile: uri, targetFolder: _currentSpecs.tslgenDataFolder }, false);
                        if (!transformResult) {
                            vscode.window.showErrorMessage(`Could not transform schema ${uri.fsPath}.`);
                        } else {
                            const _schema = transformResult as TSLGeneratorSchema.Schemata;
                            this.openedTSLGenerators[_currentSpecs.tslgenRootFolder.fsPath].schemaData = {
                                schema: _schema,
                                supplementary: await TSLEditorTransformation.getSupplementaryFromYamlSchema(_schema)
                            };
                        }
                    });
                    _schemaWatcher.onDidChange(async (uri) => {
                        console.log(`Transform schema: ${uri} --> ${_currentSpecs.tslgenPrimitiveDataFolder}`);
                        const transformResult = await TSLEditorTransformation.transformSchema({ sourceFile: uri, targetFolder: _currentSpecs.tslgenDataFolder }, false);
                        if (!transformResult) {
                            vscode.window.showErrorMessage(`Could not transform schema ${uri.fsPath}.`);
                        } else {
                            const _schema = transformResult as TSLGeneratorSchema.Schemata;
                            this.openedTSLGenerators[_currentSpecs.tslgenRootFolder.fsPath].schemaData = {
                                schema: _schema,
                                supplementary: await TSLEditorTransformation.getSupplementaryFromYamlSchema(_schema)
                            };
                        }
                    });
                    this.fsWatchers.push(_schemaWatcher);

                    for (const templateFileFolder of _currentSpecs.tslgenTemplateFilesFolders) {
                        const _templateWatcherPattern = FileSystemUtils.addPathToUri(templateFileFolder, "*", TSLGeneratorModel.tslGenTemplateFileExtension).fsPath;
                        progress.report({ message: `Creating FileSystemWatchers for ${_templateWatcherPattern}` });
                        const _templateWatcher = vscode.workspace.createFileSystemWatcher(_templateWatcherPattern);
                        _templateWatcher.onDidCreate(async (uri) => {
                            let transformationTargets: TSLEditorTransformation.TransformationTarget[];
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
                            let transformationTargets: TSLEditorTransformation.TransformationTarget[];
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
                    await this.tslGeneratorsState.set(_currentSpecs.tslgenRootFolder.fsPath, ExtensionParsedState.initialized);
                    return true;
                };
                return await vscode.window.withProgress(progressOptions, progressCallback);
            }
        } else {
            return true;
        }
    }

    public async getDocumentSymbols(): Promise<vscode.DocumentSymbol[]> {
        const _currentTSLRoot = TSLGeneratorModel.getTSLRootFolderForCurrentActiveFile();
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

    public async formatFile() {
        const _currentTSLRoot = TSLGeneratorModel.getTSLRootFolderForCurrentActiveFile();
        if (!_currentTSLRoot) {
            return;
        }
        const _editor = EditorUtils.getActiveEditor();
        if (!_editor) {
            return;
        }
        const _document = EditorUtils.getActiveDocument();
        if (!_document) {
            return;
        }
        const _documentText = _document.getText();
        if (_documentText.length === 0) {
            return;
        }
        const _parsedDocuments = SerializerUtils.parseYamlDocuments(_documentText);
        if ("empty" in _parsedDocuments) {
            return;
        }
        const _preFormattedText = await SerializerUtils.dumpYamlDocuments(_parsedDocuments);
        // const regex = new RegExp('^(?<indent>\\s*)-[^-]\\s*(?<value>.+)$', 'gm');
        // const _formattedText = _preFormattedText.replaceAll(regex, `$<indent>-\n$<indent>  $<value>`);
        await _editor.edit((editBuilder) => {
            // Replace the entire text of the document with the new content
            const document = _editor.document;
            const lastLine = document.lineAt(document.lineCount - 1);
            const range = new vscode.Range(0, 0, lastLine.range.end.line, lastLine.range.end.character);
            editBuilder.replace(range, _preFormattedText);
        });
        await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', _document.uri);
    }

    public async sortFile() {
        const _currentTSLRoot = TSLGeneratorModel.getTSLRootFolderForCurrentActiveFile();
        if (!_currentTSLRoot) {
            return;
        }
        const _editor = EditorUtils.getActiveEditor();
        if (!_editor) {
            return;
        }
        const _document = EditorUtils.getActiveDocument();
        if (!_document) {
            return;
        }
        const _documentText = _document.getText();
        if (_documentText.length === 0) {
            return;
        }
        const _parsedDocuments = SerializerUtils.parseYamlDocuments(_documentText);
        if ("empty" in _parsedDocuments) {
            return;
        }
        const _sortedDocuments = await TSLGeneratorModel.sortPrimitives(_parsedDocuments);
        const _sortedText = await SerializerUtils.dumpYamlDocuments(_sortedDocuments);
        await _editor.edit((editBuilder) => {
            // Replace the entire text of the document with the new content
            const document = _editor.document;
            const lastLine = document.lineAt(document.lineCount - 1);
            const range = new vscode.Range(0, 0, lastLine.range.end.line, lastLine.range.end.character);
            editBuilder.replace(range, _sortedText);
        });
        await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', _document.uri);
    }
    public async renderCurrentSelection(mode: YAMLProcessingMode): Promise<TSLEditorPreview.PreviewData | TSLEditorPreview.PreviewMetaData> {
        const _currentTSLRoot = await this.getCurrentTSLRoot();
        if (!_currentTSLRoot) {
            switch (mode) {
                case YAMLProcessingMode.PreviewInPanel:
                    return TSLEditorPreview.emptyPreview();
                case YAMLProcessingMode.BuildRunAndTest:
                    return TSLEditorPreview.emptyPreviewMetaData();
            }
        }
        
        const _tslGenSpecs: TSLGeneratorModel.TSLGeneratorSpecs = this.openedTSLGenerators[_currentTSLRoot.fsPath].specs;
        const _supplementary: TSLEditorTransformation.SchemaSupplementary = this.openedTSLGenerators[_currentTSLRoot.fsPath].schemaData.supplementary;
        if (!_supplementary) {
            vscode.window.showErrorMessage(`Could not parse default values from schema.`);
            switch (mode) {
                case YAMLProcessingMode.PreviewInPanel:
                    return TSLEditorPreview.emptyPreview();
                case YAMLProcessingMode.BuildRunAndTest:
                    return TSLEditorPreview.emptyPreviewMetaData();
            }
        }
        const _currentActiveEditor = EditorUtils.getActiveEditor();
        if (!_currentActiveEditor) {
            switch (mode) {
                case YAMLProcessingMode.PreviewInPanel:
                    return TSLEditorPreview.emptyPreview();
                case YAMLProcessingMode.BuildRunAndTest:
                    return TSLEditorPreview.emptyPreviewMetaData();
            }
        }
        const _currentActiveDocument = _currentActiveEditor.document;
        const _parsedDocuments = SerializerUtils.parseYamlDocuments(_currentActiveDocument.getText());
        if ("empty" in _parsedDocuments) {
            switch (mode) {
                case YAMLProcessingMode.PreviewInPanel:
                    return TSLEditorPreview.emptyPreview();
                case YAMLProcessingMode.BuildRunAndTest:
                    return TSLEditorPreview.emptyPreviewMetaData();
            }
        }
        const _currentCursorPosition = _currentActiveEditor.selection.active;
        const result = await TSLEditorPreview.renderSelection(
            _tslGenSpecs,
            _supplementary,
            _currentActiveDocument,
            _parsedDocuments,
            _currentCursorPosition,
            mode);
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
            const _fileUri = FileSystemUtils.addPathToUri(_currentSpecs.specs.tslgenExtensionDataFolder, _flynnName, _vendorName, _fileName);
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
            const _fileUri = FileSystemUtils.addPathToUri(_currentSpecs.specs.tslgenPrimitiveDataFolder, _fileName);
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
    /**
     * This function toggles the focus mode in VS Code by hiding or showing irrelevant files and
     * directories in the workspace.
     * 
     * @param init The `init` parameter is a boolean value that defaults to `false`. It is used to
     * determine whether the function is being called for the first time or not. If `init` is `true`,
     * the function will set the visibility of all irrelevant entries to `true`. Otherwise, it will
     * toggle
     */
    public async toggleFocusMode(init: boolean = false): Promise<void> {
        const _currentTSLRoot = await this.getCurrentTSLRoot(true);
        if (!_currentTSLRoot) {
            return;
        }

        const _tslToRoot = vscode.workspace.asRelativePath(_currentTSLRoot, false);
        const _pattern = (_tslToRoot === _currentTSLRoot.fsPath) ? "**" : `**${FileSystemUtils.separator}${_tslToRoot}`;

        const _currentSpecs = this.openedTSLGenerators[_currentTSLRoot.fsPath];
        const _irrelevantEntries = (await FileSystemUtils.getDirectories(_currentSpecs.specs.tslgenRootFolder, false))
            .filter((entry) => entry.fsPath !== _currentSpecs.specs.tslgenDataFolder.fsPath)
            .map((entry) => `${_pattern}${FileSystemUtils.separator}${FileSystemUtils.baseName(entry)}`)
            .concat(
                (await FileSystemUtils.getFiles(_currentSpecs.specs.tslgenRootFolder, false))
                    .map((fileEntry) => `${_pattern}${FileSystemUtils.separator}${FileSystemUtils.baseName(fileEntry)}`)
            );

        const _config = vscode.workspace.getConfiguration();
        const _filesExclude = _config.get<EditorUtils.FilesVisibility>('files.exclude') ?? {};
        const _alreadyPresentEntry = _irrelevantEntries.find((item) => _filesExclude.hasOwnProperty(item));
        const _visibility = (init) ? true : ((_alreadyPresentEntry) ? !(_filesExclude[_alreadyPresentEntry]) : true);

        for (const entry of _irrelevantEntries) {
            _filesExclude[entry] = _visibility;
        }

        _config.update("files.exclude", _filesExclude, vscode.ConfigurationTarget.Workspace);
        vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
    }

    

    public async updateDiagnostics(collection: vscode.DiagnosticCollection, document?: vscode.TextDocument): Promise<void> {
        if (!document) {
            // const _currentTSLRoot = TSLGeneratorModel.getTSLRootFolderForCurrentActiveFile();
            // if (!_currentTSLRoot) {
            //     return;
            // }
            // const _supplementary = this.schemaSupplementary[_currentTSLRoot.fsPath];
            // const _schema = this.schemata[_currentTSLRoot.fsPath];
            // if ((_currentTSLRoot.fsPath in this.openedTSLGenerators)) {
            //     (await FileSystemUtils.getFiles(this.openedTSLGenerators[_currentTSLRoot.fsPath].tslgenDataFolder, true, TSLGeneratorModel.tslGenDataFileExtension)).map(async (uri) => {
            //         collection.delete(uri);
            //         collection.set(uri, await this.getDiagnosticsForFile(uri, _supplementary, _schema));
            //     });
            // }
        } else {
            if (!(TSLGeneratorModel.isTSLGeneratorDataFile(document.uri))) {
                console.log(`[TSLGen] Skipping diagnostics update for file '${document.uri.fsPath}' because it is not a TSL Generator data file.`);
                return;
            }
            const _currentTSLRoot = await this.getTSLRoot(document.uri);
            if (!_currentTSLRoot) {
                console.log(`[TSLGen] Skipping diagnostics update for file '${document.uri.fsPath}' because it is not in a TSL Generator root folder.`);
                return;
            }
            const _schema = this.openedTSLGenerators[_currentTSLRoot.fsPath].schemaData.schema;
            if (!_schema) {
                console.log(`[TSLGen] Skipping diagnostics update for file '${document.uri.fsPath}' because the schema for the TSL Generator root folder '${_currentTSLRoot.fsPath}' is not loaded.`);
                return;
            }
            if (collection.has(document.uri)) {
                collection.delete(document.uri);
            }
            collection.set(document.uri, TSLEditorFileDiagnostics.getDiagnosticsForDocument(document, _schema));
        }
        
    }
}
export const tslEditorExtension = TSLEditorExtension.getInstance();
