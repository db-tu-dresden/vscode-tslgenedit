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

export namespace TSLEditorPreview {
    export enum TSLDataType {
        primitiveDefinition = 0,
        primitiveDeclaration = 1,
        primitiveClass = 2,
        extension = 3,
        unknown = 4
    };
    export interface RenderedString {
        content: string;
        tslType: TSLDataType;
        ctype?: string;
    }
    export function emptyRenderedString(): RenderedString {
        return {
            content: "",
            tslType: TSLDataType.unknown
        };
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
        defaults: TSLEditorTransformation.DefaultsFromSchema,
        currentDocument: vscode.TextDocument,
        documents: SerializerUtils.YamlDocument[],
        cursorPosition: vscode.Position
    ): Promise<RenderedString[]> {
        const _fileType = TSLGeneratorModel.determineDataFileType(documents);
        if (_fileType === TSLGeneratorModel.TSLDataFileContentType.unknown) {
            return [{ content: "", tslType: TSLDataType.unknown }];
        }
        const _data = SerializerUtils.Search.getCurrentFocusedYamlDocument(documents, currentDocument, cursorPosition);
        if (!_data) {
            return [{ content: "", tslType: TSLDataType.unknown }];
        }
        if (_fileType === TSLGeneratorModel.TSLDataFileContentType.extension) {
            return [{
                content: await templateManager.render(
                    tslSpecs.tslgenTemplateRootFolder,
                    `@core/extension${TSLEditorTransformation.templateFileExtension}`,
                    TypeUtils.extendObjects(_data.toJSON(), defaults.extension)),
                tslType: TSLDataType.extension
            }];
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
                return [{
                    content: await templateManager.render(
                        tslSpecs.tslgenTemplateRootFolder,
                        `@core/primitive_declaration${TSLEditorTransformation.templateFileExtension}`,
                        TypeUtils.extendObjects(_declarationJson, defaults.primitiveDeclaration)
                    ),
                    tslType: TSLDataType.primitiveDeclaration
                }];
            } else {
                const _definition = _selectedDefinitionItem as yaml.YAMLMap<unknown, unknown>;
                const _ctypes = _definition.get("ctype");
                if (!_ctypes) {
                    return [{
                        content: "Please specify a ctype.",
                        tslType: TSLDataType.unknown
                    }];
                }
                const _extensionNameItem = _definition.get("target_extension");
                if (!_extensionNameItem) {
                    return [{
                        content: "Please specify an extension.",
                        tslType: TSLDataType.unknown
                    }];
                }
                const _flags = _definition.get("lscpu_flags");
                const _flagsStr: string = (_flags) ? ((yaml.isCollection(_flags)) ? _flags.items.join(", ") : `${_flags}`) : "";
                _definition.set("lscpu_flags", _flagsStr);
                const _extensionName = `${_extensionNameItem}`;
                const _extensionData = await getTSLExtensionDocument(tslSpecs, _extensionName);

                const _extensionDataJson = ((_extensionData) && (yaml.isDocument(_extensionData))) ? _extensionData.toJSON() : {};

                const _declarationAndExtensionDataJson = TypeUtils.extendObjects(
                    TypeUtils.extendObjects(_extensionDataJson, defaults.extension),
                    TypeUtils.extendObjects(_declarationJson, defaults.primitiveDeclaration)
                );

                const _ctypeArray = (yaml.isCollection(_ctypes)) ? _ctypes.items.map((element) => `${element}`) : [`${_ctypes}`];
                const _mergedDataJson = TypeUtils.extendObjects(
                    TypeUtils.extendObjects(_definition.toJSON(), defaults.primitiveDefinition),
                    _declarationAndExtensionDataJson
                );

                const ctype_map = _ctypeArray.reduce((dict: {[key:string]: any}, ctype: string) => {
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
                    const data = {...ctype_map[ctype]};
                    data["implementation"] = _renderedImplementations[ctype];
                    try {
                        return {
                            content: await templateManager.render(
                                tslSpecs.tslgenTemplateRootFolder,
                                `@core/primitive_definition${TSLEditorTransformation.templateFileExtension}`,
                                data
                            ),
                            tslType: TSLDataType.primitiveDefinition,
                            ctype: ctype
                        };
                    } catch (err) {
                        console.error(err);
                        return { content: "", tslType: TSLDataType.primitiveDefinition, ctype: ctype };
                    }
                }));
                return _renderedDefinitions;
            }
        }
        return [{
            content: "",
            tslType: TSLDataType.extension
        }];
    }


    export class TSLGenViewProvider implements vscode.WebviewViewProvider {
        public static readonly viewType = 'tslgen-edit.generatedCodePreview';
        private _view?: vscode.WebviewView;
        private latestContent: RenderedString[] = [emptyRenderedString()];
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

        public setContent(data: RenderedString[]) {
            if (this._view !== undefined) {
                if (data.length === 0) {
                    this._view.webview.html = "No Primitive selected.";
                    this._view.show?.(true);
                }
                this.latestContent = data;
                this._view.webview.html = this._getHtmlForWebview(this._view?.webview, this.latestContent);
                this._view.show?.(true);
            }
        }

        private formatCPP(webview: vscode.Webview, jsFile: string, cppFile: string, cssFile: string, cppCodes: RenderedString[]) {
            // Powered by https://www.w3schools.com/howto/tryit.asp?filename=tryhow_js_tabs
            let buttons: string[];
            let pres: string[];



            buttons = [];
            pres = [];
            for (let idx = 0; idx < cppCodes.length; ++idx) {
                const rendered = cppCodes[idx];
                if (rendered.ctype != undefined) {
                    buttons.push(
                        `<button class="tablinks${(idx == 0 ? " active" : "")}" onclick="displayPrimitive(event, '${rendered.ctype}')">${rendered.ctype}</button>`
                    );
                    pres.push(
                        `<div id="${rendered.ctype}" class="primitive" ${(idx == 0 ? "style=\"display:block;\"" : "style=\"display:none;\"")}>
                            <pre class="sh_cpp">
                                ${this.indentCPP(rendered.content)}
                            </pre>
                        </div>`
                    );
                }
                // ${this.indentCPP(rendered.content.replaceAll("<", "&lt;").replaceAll(">", "&gt;"))}
            }

            return `<html>
                        <head>
                            <script type="text/javascript" src="${jsFile}"></script>
                            <script type="text/javascript" src="${cppFile}"></script>
                            <link type="text/css" rel="stylesheet" href="${cssFile}">
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
                            <style>
                                /* Style the tab */
                                .tab {
                                overflow: hidden;
                                border: 1px solid var(--vscode-input-foreground);
                                background-color: var(--vscode-background-color);
                                }

                                /* Style the buttons inside the tab */
                                .tab button {
                                background-color: inherit;
                                float: left;
                                border: 1px solid var(--vscode-input-foreground);
                                outline: none;
                                cursor: pointer;
                                padding: 14px 16px;
                                transition: 0.3s;
                                font-size: 17px;
                                color: var(--vscode-input-foreground);
                                }

                                /* Change background color of buttons on hover */
                                .tab button:hover {
                                background-color: var(--vscode-input-foreground);
                                color: var(--vscode-input-background);
                                }

                                /* Create an active/current tablink class */
                                .tab button.active {
                                background-color: var(--vscode-input-background);
                                color: var(--vscode-input-foreground);
                                }

                                /* Style the tab content */
                                .primitive {
                                display: none;
                                padding: 6px 12px;
                                border: 1px solid #ccc;
                                border-top: none;
                                }
                                </style>
                        </head>
                        <body onload="sh_highlightDocument();" style="backgroud: #d3d3d3;">
                            <div class="tab">
                                ${buttons.join("\n")}
                            </div>
                            ${pres.join("\n")}
                        </body>
                    </html>`;
        }

        private indentCPP(cppCode: string): string {
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

        private _getHtmlForWebview(webview: vscode.Webview, cppCode: RenderedString[]) {
            const mediaPath = (file: string, webView: vscode.Webview) => {
                let uri = vscode.Uri.file(this._extContext.asAbsolutePath(FileSystemUtils.joinPath('media', file)));
                return webView.asWebviewUri(uri).toString();
            };

            // /* maybe add background:var(--vscode-editor-background); to the body or pre_code css style to change to current IDEs theme color */
            const jsPath = mediaPath("sh_main.js", webview);
            const cppPath = mediaPath("sh_cpp.js", webview);
            const cssPath = mediaPath("sh_style.css", webview);

            // console.log( this.formatCPP(webview, jsPath, cppPath, cssPath, cppCode) );
            return this.formatCPP(webview, jsPath, cppPath, cssPath, cppCode);
        }
    }
}