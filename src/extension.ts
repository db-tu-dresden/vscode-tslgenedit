import * as vscode from 'vscode';
import { TSLGeneratorModel } from './tslgen/model';
import { TSLEditorPreview } from './editor/preview';
import { tslEditorExtension } from './editor/editor_extension';
import { TSLEditorAutoComplete } from './editor/autocomplete';
import { YAMLProcessingMode } from './editor/enums';
import * as fs from 'fs';
import { FileSystemUtils } from './utils/files';

// let tslPreviewPanel: vscode.WebviewPanel | undefined;

let tslTerminal: vscode.Terminal | undefined;
let tslgenDiagnosticCollection : vscode.DiagnosticCollection;

export async function activate(context: vscode.ExtensionContext) {
    tslEditorExtension.update();
    tslgenDiagnosticCollection = vscode.languages.createDiagnosticCollection('TSLGen');

    const provider = new TSLEditorPreview.TSLGenViewProvider(context.extensionUri, context);

    context.subscriptions.push(vscode.window.registerWebviewViewProvider(TSLEditorPreview.TSLGenViewProvider.viewType, provider));

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'yaml' },
            new TSLEditorAutoComplete.YAMLCompletionProvider(),
            // '\w'
            ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
        )
    );

    context.subscriptions.push(vscode.commands.registerCommand('tslgen-edit.preview', async () => {
        await vscode.commands.executeCommand(`${TSLEditorPreview.TSLGenViewProvider.viewType}.focus`);
        const _data = await tslEditorExtension.renderCurrentSelection(YAMLProcessingMode.PreviewInPanel) as TSLEditorPreview.PreviewData;
        provider.setContent(_data);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('tslgen-edit.addFile', async () => {
        await tslEditorExtension.createFile();
    }));

    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        tslEditorExtension.update();
    }));


    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(
        { language: 'yaml' },
        { provideDocumentSymbols: tslEditorExtension.getDocumentSymbols },
        { label: "TSLGenerator" }
    ));

    context.subscriptions.push(vscode.commands.registerCommand('tslgen-edit.toggleFocusMode', async () => {
        await tslEditorExtension.toggleFocusMode();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('tslgen-edit.format', async () => {
        await tslEditorExtension.formatFile();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('tslgen-edit.sort', async () => {
        await tslEditorExtension.sortFile();
    }));

    const TSL_TERMINAL_IDENT = "TSL Terminal";
    context.subscriptions.push(vscode.commands.registerCommand('tslgen-edit.buildAndTest', async () => {
        const _data = await tslEditorExtension.renderCurrentSelection(YAMLProcessingMode.BuildRunAndTest) as TSLEditorPreview.PreviewMetaData;
        if (_data.buildable) {
            const tslPwd = TSLGeneratorModel.getTSLRootFolderForCurrentActiveFile();
            const tslTempBuildDir = `tslgenEdit-build`;
            const tslTempDir = `${tslPwd?.fsPath}/${tslTempBuildDir}`;
            if (!tslTerminal) {
                tslTerminal = vscode.window.createTerminal(`TSL Terminal`);
            }
            /* Cleanse the temp build dir. even Cmake clean should not be aware of everything the generator did. */
            if (fs.existsSync(tslTempDir)) {
                fs.rmdirSync(tslTempDir, { recursive: true });
            }
            fs.mkdirSync(tslTempDir);

            tslTerminal.show();
            tslTerminal.sendText(`cd ${tslPwd?.fsPath}`);
            tslTerminal.sendText(`cmake -S . -B ${tslTempDir} -UTSL_LSCPU_FLAGS -DTSL_FILTER_FOR_PRIMITIVES="${_data.primitive_name}"`);
            tslTerminal.sendText(`make -C ${tslTempDir}`);
            tslTerminal.sendText(`${tslTempDir}/${tslTempBuildDir}/generator_output/src/test/tsl_test \"[${_data.extension_name}][${_data.primitive_name}]\"`);
        } else {
            vscode.window.showErrorMessage(`No buildable primitive selected.`);
        }
    }));

    vscode.window.onDidCloseTerminal((terminal) => {
        if (terminal.name === TSL_TERMINAL_IDENT) {
            tslTerminal?.dispose();
            tslTerminal = undefined;
        }
    });

    vscode.workspace.onDidChangeTextDocument(async (event) => {
        console.log(`[TSLGen] Updating diagnostics in onDidChangeTextDocument for ${event.document.uri.fsPath}`);
        await tslEditorExtension.updateDiagnostics(tslgenDiagnosticCollection, event.document);
    });

    vscode.workspace.onDidOpenTextDocument(async (event) => {
        console.log(`[TSLGen] Updating diagnostics in onDidOpenTextDocument for ${event.uri.fsPath}`);
        await tslEditorExtension.updateDiagnostics(tslgenDiagnosticCollection, event);
    });
    
    // vscode.window.onDidChangeActiveTextEditor(async (event) => {
    //     if(event) {
    //         if (tslgenDiagnosticCollection.has(event.document.uri)) {
    //             tslgenDiagnosticCollection.delete(event.document.uri);
    //         }
    //     }
    // });
    // vscode.window.tabGroups.all.forEach(async (tabGroup) => {
    //     tabGroup.tabs.forEach(async (tab) => {  
    //         if (tab instanceof vscode.TabInputText) {
    //             tab.input
    //         }
    //     });
    // };
    // vscode.window.visibleTextEditors.forEach(async (editor) => {
        // console.log(`[TSLGen] Updating diagnostics in loop for ${editor.document.uri.fsPath}`);
        // await tslEditorExtension.updateDiagnostics(tslgenDiagnosticCollection, editor.document);
    // });
    
    
    for (const document of vscode.workspace.textDocuments) {
        console.log(`[TSLGen] Updating diagnostics in loop for ${document.uri.fsPath}`);
        await tslEditorExtension.updateDiagnostics(tslgenDiagnosticCollection, document);
    }
    new vscode.Position

    // context.subscriptions.push(vscode.languages.registerContextMenuProvider)
    // vscode.commands.executeCommand('workbench.view.explorer');
}

export function deactivate() {
    if (tslTerminal) {
        tslTerminal.dispose();
    }
}
