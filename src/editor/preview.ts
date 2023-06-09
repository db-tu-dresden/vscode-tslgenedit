import * as vscode from 'vscode';
import { TwingEnvironment, TwingLoaderFilesystem, TwingCacheFilesystem, TwingSource, TwingLoaderArray } from 'twing';
import * as yaml from 'yaml';
import * as crypto from 'crypto';

import { TSLGeneratorModel } from "../tslgen/model";
import { SerializerUtils } from '../utils/serialize';
import { FileSystemUtils } from '../utils/files';
import { TSLEditorTransformation } from './transform';
import { TypeUtils } from '../utils/types';
import { EditorUtils } from '../utils/vscode_editor';
import { YAMLProcessingMode } from './enums';

export namespace TSLEditorPreview {
    export enum TSLDataType {
        primitiveDefinition = "Definition(s)",
        primitiveDeclaration = "Primitive Declaration",
        primitiveClass = "Primitive Class",
        extension = "Extension",
        unknown = ""
    };
    function getKey(dataType: TSLDataType): string {
        switch (dataType) {
            case TSLDataType.primitiveDefinition:
                return "primitiveDefinition";
            case TSLDataType.primitiveDeclaration:
                return "primitiveDeclaration";
            case TSLDataType.primitiveClass:
                return "primitiveClass";
            case TSLDataType.extension:
                return "extension";
            default:
                return "unknown";
        }
    }
    export interface RenderedString {
        content: string;
        ctype?: string;
    }
    export interface PreviewData {
        staticContent: string;
        tslType: TSLDataType;
        variableContent?: RenderedString[];
    }
    export interface PreviewMetaData {
        extension_name: string;
        primitive_name: string;
        buildable: boolean;
    }
    function emptyRenderedString(): RenderedString {
        return {
            content: ""
        };
    }
    export function emptyPreview(): PreviewData {
        return {
            staticContent: "",
            tslType: TSLDataType.unknown
        };
    }
    export function emptyPreviewMetaData(): PreviewMetaData {
        return {
            extension_name: "",
            primitive_name: "",
            buildable: false
        };
    }
    function isPreviewEmpty(data: PreviewData): boolean {
        return (data.staticContent === "");
    }

    export class TemplateManager {
        private static instance: TemplateManager;
        private loaderPaths: { [key: string]: string[] } = {};
        private environments: { [key: string]: TwingEnvironment } = {};
        private knownTemplateNames: string[] = [];
        public readonly twingDirectoryName: string = ".twing";
        private constructor() {
        }

        public static getInstance(): TemplateManager {
            if (!TemplateManager.instance) {
                TemplateManager.instance = new TemplateManager();
            }
            return TemplateManager.instance;
        }

        private getNamespace(baseFolder: vscode.Uri, loaderPath: vscode.Uri): string {
            const _relativePathString: string = FileSystemUtils.relative(baseFolder, loaderPath);
            const _firstPart: string = _relativePathString.split(`${FileSystemUtils.separator}${this.twingDirectoryName}`)[0];
            return _firstPart.replace(FileSystemUtils.separator, "_");
        }

        public async addTemplateDirectories(templateDirectories: vscode.Uri[], baseFolder: vscode.Uri) {
            if (baseFolder.fsPath in this.loaderPaths) {
                return;
            }
            let _loader = new TwingLoaderFilesystem([]);
            for (const _templateDirectory of templateDirectories) {
                _loader.addPath(_templateDirectory.fsPath, this.getNamespace(baseFolder, _templateDirectory));
            }
            this.environments[baseFolder.fsPath] = new TwingEnvironment(
                _loader,
                {
                    debug: false,
                    strict_variables: false,
                    autoescape: 'html',
                    cache: false
                }
            );
        }
        public async render(baseFolder: vscode.Uri, templateName: string, data: any) {
            if (baseFolder.fsPath in this.environments) {
                const env = this.environments[baseFolder.fsPath];
                try {
                    const result = await env.render(templateName, data);
                    return result;
                } catch (e) {
                    console.error(`Error while rendering preview: ${e}`);
                    vscode.window.showErrorMessage(`Error while rendering preview: ${e}`);
                    return "";
                }
            } else {
                vscode.window.showErrorMessage(`No known templates in ${baseFolder.fsPath}.`);
                return "";
            }
        }
        public async renderStrings(templateStr: string, data: { [key: string]: any }) {
            const twing = new TwingEnvironment(
                new TwingLoaderArray({
                    'ad_hoc.twig': templateStr
                }),
                {
                    debug: false,
                    strict_variables: false,
                    autoescape: 'html',
                    cache: false
                }
            );
            const promises = Object.entries(data).map(async ([key, value]) => {
                try {
                    const resultString = await twing.render('ad_hoc.twig', value);
                    return [key, resultString];
                } catch (error) {
                    vscode.window.showErrorMessage(`Could not render template for type ${key}: ${error}`);
                    return [key, ""];
                }
            });
            const results = await Promise.all(promises);
            return Object.fromEntries(results);
        }

        public async renderString(templateStr: string, data: any) {
            // const hash = crypto.createHash('sha512');
            // hash.update(templateStr);
            // const templateName = `ad_hoc${hash.digest('hex')}_${identifier}.twig`;
            const twing = new TwingEnvironment(new TwingLoaderArray({
                'ad_hoc.twig': templateStr
            }),
                {
                    debug: false,
                    strict_variables: false,
                    autoescape: 'html',
                    cache: false
                });
            try {
                const result = await twing.render('ad_hoc.twig', data);
                return result;
            } catch (e) {
                console.error(`Error while rendering preview: ${e}`);
                vscode.window.showErrorMessage(`Error while rendering preview: ${e}`);
                return "";
            }
            // const env = new TwingEnvironment(new TwingLoaderArray({}));
            // try {
            //     const template = await env.createTemplate(templateStr);
            //     const result = await template.render(data);
            //     return result;
            // } catch (e) {
            //     console.error(`Error while rendering preview: ${e}`);
            //     vscode.window.showErrorMessage(`Error while rendering preview: ${e}`);
            //     return "";
            // }


        }

    }
    export const templateManager = TemplateManager.getInstance();





    async function getTSLExtensionDocument(tslSpecs: TSLGeneratorModel.TSLGeneratorSpecs, extensionName: string): Promise<undefined | SerializerUtils.YamlDocument> {
        for (const _extensionFile of await FileSystemUtils.iterFiles(tslSpecs.tslgenExtensionDataFolder, TSLGeneratorModel.tslGenDataFileExtension)) {
            const _extensionFileText = await FileSystemUtils.readFile(_extensionFile.uri);
            if (_extensionFileText.length === 0) {
                continue;
            }
            const _parsedDocuments = SerializerUtils.parseYamlDocuments(_extensionFileText);
            if ("empty" in _parsedDocuments) {
                continue;
            }
            for (const _extensionDocument of _parsedDocuments) {
                const _extensionNameItem = _extensionDocument.get("extension_name");
                if (_extensionNameItem) {
                    if (extensionName === `${_extensionNameItem}`) {
                        return _extensionDocument;
                    }
                }
            }
        }
        vscode.window.showErrorMessage(`Could not find an extension ${extensionName}.`);
        return undefined;
    }

    export async function renderSelection(
        tslSpecs: TSLGeneratorModel.TSLGeneratorSpecs,
        supplementaryData: TSLEditorTransformation.SchemaSupplementary,
        currentDocument: vscode.TextDocument,
        documents: SerializerUtils.YamlDocument[],
        cursorPosition: vscode.Position,
        mode: YAMLProcessingMode
    ): Promise<PreviewData | PreviewMetaData> {
        const _fileType = TSLGeneratorModel.determineDataFileType(documents);
        if (_fileType === TSLGeneratorModel.TSLDataFileContentType.unknown) {
            switch (mode) {
                case YAMLProcessingMode.PreviewInPanel:
                    return TSLEditorPreview.emptyPreview();
                case YAMLProcessingMode.BuildRunAndTest:
                    return TSLEditorPreview.emptyPreviewMetaData();
            }
        }
        const _data = SerializerUtils.Search.getCurrentFocusedYamlDocument(documents, currentDocument, cursorPosition);
        if (!_data) {
            switch (mode) {
                case YAMLProcessingMode.PreviewInPanel:
                    return TSLEditorPreview.emptyPreview();
                case YAMLProcessingMode.BuildRunAndTest:
                    return TSLEditorPreview.emptyPreviewMetaData();
            }
        }
        if (_fileType === TSLGeneratorModel.TSLDataFileContentType.extension) {
            switch (mode) {
                case YAMLProcessingMode.PreviewInPanel:
                    return {
                        staticContent: await templateManager.render(
                            tslSpecs.tslgenTemplateRootFolder,
                            `@core/extension${TSLEditorTransformation.templateFileExtension}`,
                            TypeUtils.extendObjects(_data.toJSON(), supplementaryData.extension.defaults)),
                        tslType: TSLDataType.extension
                    };
                case YAMLProcessingMode.BuildRunAndTest:
                    return TSLEditorPreview.emptyPreviewMetaData();
            }
        }

        if (_fileType === TSLGeneratorModel.TSLDataFileContentType.primitive) {
            const _functorName = _data.get("functor_name");
            if (!_functorName) {
                _data.set("functor_name", `${_data.get("primitive_name")}`);
            }
            const _declarationDoc = _data.clone();
            _declarationDoc.delete("definitions");
            const _declarationJson = _declarationDoc.toJSON();

            const _definitionsItem = _data.get("definitions");

            let _selectedDefinitionItem: any;
            if (_definitionsItem && yaml.isCollection(_definitionsItem)) {
                const filteredItems = _definitionsItem.items.filter((item) => {
                    const definition = item as yaml.YAMLMap<unknown, unknown>;
                    if (definition.range) {
                        const itemStart = currentDocument.positionAt(definition.range[0]);
                        const itemEnd = currentDocument.positionAt(definition.range[2]);
                        return (
                            cursorPosition.isAfterOrEqual(itemStart) &&
                            cursorPosition.isBeforeOrEqual(itemEnd)
                        );
                    }
                });
                if (filteredItems.length === 0) {
                    _selectedDefinitionItem = undefined;
                } else {
                    _selectedDefinitionItem = filteredItems[0];
                }
            }
            if (!_selectedDefinitionItem) {
                switch (mode) {
                    case YAMLProcessingMode.PreviewInPanel:
                        return {
                            staticContent: await templateManager.render(
                                tslSpecs.tslgenTemplateRootFolder,
                                `@core/primitive_declaration${TSLEditorTransformation.templateFileExtension}`,
                                TypeUtils.extendObjects(_declarationJson, supplementaryData.primitive.declarationDefaults)
                            ),
                            tslType: TSLDataType.primitiveDeclaration
                        };
                    case YAMLProcessingMode.BuildRunAndTest:
                        return TSLEditorPreview.emptyPreviewMetaData();
                }
            } else {
                const _definition = _selectedDefinitionItem as yaml.YAMLMap<unknown, unknown>;
                const _ctypes = _definition.get("ctype");
                if (!_ctypes) {
                    vscode.window.showErrorMessage(`Please specify a ctype.`);
                    switch (mode) {
                        case YAMLProcessingMode.PreviewInPanel:
                            return TSLEditorPreview.emptyPreview();
                        case YAMLProcessingMode.BuildRunAndTest:
                            return TSLEditorPreview.emptyPreviewMetaData();
                    }
                }
                const _extensionNameItem = _definition.get("target_extension");
                if (!_extensionNameItem) {
                    vscode.window.showErrorMessage(`Please specify an extension.`);
                    switch (mode) {
                        case YAMLProcessingMode.PreviewInPanel:
                            return TSLEditorPreview.emptyPreview();
                        case YAMLProcessingMode.BuildRunAndTest:
                            return TSLEditorPreview.emptyPreviewMetaData();
                    }
                }
                const _flags = _definition.get("lscpu_flags");
                const _flagsStr: string = (_flags) ? ((yaml.isCollection(_flags)) ? _flags.items.join(", ") : `${_flags}`) : "";
                _definition.set("lscpu_flags", _flagsStr);
                const _extensionName = `${_extensionNameItem}`;
                const _extensionData = await getTSLExtensionDocument(tslSpecs, _extensionName);

                if ( mode === YAMLProcessingMode.BuildRunAndTest ) {
                    return { extension_name: `${_extensionName}`, primitive_name: _data.get("functor_name") as string, buildable: true };
                }

                const _extensionDataJson = ((_extensionData) && (yaml.isDocument(_extensionData))) ? _extensionData.toJSON() : {};

                const _declarationAndExtensionDataJson = TypeUtils.extendObjects(
                    TypeUtils.extendObjects(_extensionDataJson, supplementaryData.extension.defaults),
                    TypeUtils.extendObjects(_declarationJson, supplementaryData.primitive.declarationDefaults)
                );

                const _ctypeArray = (yaml.isCollection(_ctypes)) ? _ctypes.items.map((element) => `${element}`) : [`${_ctypes}`];
                const _mergedDataJson = TypeUtils.extendObjects(
                    TypeUtils.extendObjects(_definition.toJSON(), supplementaryData.primitive.definitionDefaults),
                    _declarationAndExtensionDataJson
                );

                const ctype_map = _ctypeArray.reduce((dict: { [key: string]: any }, ctype: string) => {
                    let currentDataJson = { ..._mergedDataJson };
                    currentDataJson["ctype"] = ctype;
                    dict[ctype] = currentDataJson;
                    return dict;
                }, {});
                const _renderedImplementations =
                    await templateManager.renderStrings(
                        _mergedDataJson["implementation"],
                        ctype_map
                    );

                const _renderedDefinitions = await Promise.all(_ctypeArray.map(async (ctype) => {
                    const data = { ...ctype_map[ctype] };
                    data["implementation"] = _renderedImplementations[ctype];
                    try {
                        return {
                            content: await templateManager.render(
                                tslSpecs.tslgenTemplateRootFolder,
                                `@core/primitive_definition${TSLEditorTransformation.templateFileExtension}`,
                                data
                            ),
                            ctype: ctype
                        };
                    } catch (err) {
                        console.error(err);
                        return { content: "Could not render definition", ctype: ctype };
                    }
                }));
                return {
                    staticContent: await templateManager.render(
                        tslSpecs.tslgenTemplateRootFolder,
                        `@core/primitive_declaration${TSLEditorTransformation.templateFileExtension}`,
                        _declarationAndExtensionDataJson
                    ),
                    tslType: TSLDataType.primitiveDeclaration,
                    variableContent: _renderedDefinitions
                };
            }
        }
        return emptyPreview();
    }

    export class TSLGenViewProvider implements vscode.WebviewViewProvider {
        public static readonly viewType = 'tslgen-edit.generatedCodePreview';
        private _view?: vscode.WebviewView;
        private latestContent: PreviewData = emptyPreview();
        constructor(
            private readonly _extensionUri: vscode.Uri,
            private readonly _extContext: vscode.ExtensionContext
        ) { }
        public resolveWebviewView(
            webviewView: vscode.WebviewView,
            context: vscode.WebviewViewResolveContext,
            _token: vscode.CancellationToken,
        ) {
            this._view = webviewView;
            webviewView.webview.options = {
                enableScripts: true,
                localResourceRoots: [
                    FileSystemUtils.addPathToUri(this._extContext.extensionPath, 'media')
                ]
            };
            this.setContent(this.latestContent);
        }

        public setContent(data: PreviewData) {
            if (this._view !== undefined) {
                if (isPreviewEmpty(data)) {
                    this._view.webview.html = "Nothing to show (yet).";
                    this._view.show?.(true);
                }
                this.latestContent = data;
                this._view.webview.html = this._getHtmlForWebview(this._view?.webview, this.latestContent);
                this._view.show?.(true);
            }
        }

        private formatCPP(webview: vscode.Webview, jsFile: string, cppFile: string, cssFile: string, tabCssFile: string, previewData: PreviewData) {
            // Powered by https://www.w3schools.com/howto/tryit.asp?filename=tryhow_js_tabs
            let buttons: string[];
            let pres: string[];

            /**
             * static content prepared here, can we add a title with cppCodes.tslType.valueOf()?
             */
            let staticHtml: string = "";

            if (previewData.staticContent.length > 0) {
                staticHtml =
                    `<h3>${previewData.tslType.valueOf()}</h3><div id="${getKey(previewData.tslType)}" class="staticContent")}>
                    <pre class="sh_cpp">
                        ${this.indentCPP(previewData.staticContent)}
                    </pre>
                </div>`;
            }

            let dynamicContent: string = "";
            if ((previewData.variableContent) && (previewData.variableContent.length > 0)) {
                buttons = [];
                pres = [];
                const cppCodes = previewData.variableContent;
                for (let idx = 0; idx < cppCodes.length; ++idx) {
                    const rendered = cppCodes[idx];
                    if (rendered.ctype !== undefined) {
                        buttons.push(
                            `<button class="tablinks${(idx === 0 ? " active" : "")}" onclick="displayPrimitive(event, '${rendered.ctype}')">${rendered.ctype}</button>`
                        );
                        pres.push(
                            `<div id="${rendered.ctype}" class="primitive" ${(idx === 0 ? "style=\"display:block;\"" : "style=\"display:none;\"")}>
                                <pre class="sh_cpp">
                                    ${this.indentCPP(rendered.content)}
                                </pre>
                            </div>`
                        );
                    }
                }
                dynamicContent =
                    `<h3>Definition(s)</h3><div class="tab">
                    ${buttons.join("\n")}
                </div>
                ${pres.join("\n")}`;
            }
            return `<html>
                        <head>
                            <script type="text/javascript" src="${jsFile}"></script>
                            <script type="text/javascript" src="${cppFile}"></script>
                            <link type="text/css" rel="stylesheet" href="${cssFile}">
                            <link type="text/css" rel="stylesheet" href="${tabCssFile}">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <script>
                            function displayPrimitive(evt, primitiveId) {
                              var i, tabcontent, tablinks;
                              tabcontent = document.getElementsByClassName("primitive");
                              for (i = 0; i < tabcontent.length; i++) {
                                tabcontent[i].style.display = "none";
                              }
                              tablinks = document.getElementsByClassName("tablinks");
                              for (i = 0; i < tablinks.length; i++) {
                                tablinks[i].className = tablinks[i].className.replace(" active", "");
                              }
                              document.getElementById(primitiveId).style.display = "block";
                              evt.currentTarget.className += " active";
                            }
                            </script>
                        </head>
                        <body onload="sh_highlightDocument();" style="backgroud: #d3d3d3;" topmargin=5>
                            ${staticHtml}
                            ${dynamicContent}
                        </body>
                    </html>`;
        }

        private indentCPP(cppCode: string): string {
            cppCode = cppCode.replace(/</g, "&lt;").replace(/>/g, "&gt;"); // escape < and > before indenting
            const minIndent = "  ";
            const lines = cppCode.split("\n");
            let formatted: string;
            formatted = "";
            let level = 0;
            const indentChar = "   ";
            for (const line of lines) {
                let trimmed = line.trim();
                const inline_brace_pair: Boolean = trimmed.includes("{") && trimmed.includes("}");
                if (!inline_brace_pair && (trimmed.startsWith("}") || trimmed.endsWith("}") || trimmed.endsWith("};"))) {
                    level--;
                }
                formatted += minIndent + indentChar.repeat(level) + trimmed + "\n";
                if (trimmed.endsWith("{")) {
                    level++;
                }
            }
            return formatted;
        }

        private _getHtmlForWebview(webview: vscode.Webview, cppCode: PreviewData) {
            const mediaPath = (file: string, webView: vscode.Webview) => {
                let uri = vscode.Uri.file(this._extContext.asAbsolutePath(FileSystemUtils.joinPath('media', file)));
                return webView.asWebviewUri(uri).toString();
            };

            // /* maybe add background:var(--vscode-editor-background); to the body or pre_code css style to change to current IDEs theme color */
            const jsPath = mediaPath("sh_main.js", webview);
            const cppPath = mediaPath("sh_cpp.js", webview);
            const cssPath = mediaPath("sh_style.css", webview);
            const tabCssPath = mediaPath("tab_style.css", webview);

            return this.formatCPP(webview, jsPath, cppPath, cssPath, tabCssPath, cppCode);
        }
    }
}