import * as vscode from 'vscode';
import { TSLEditorPreview } from './editor/preview';
import { tslEditorExtension } from './editor/editor_extension';
import { TSLEditorAutoComplete } from './editor/autocomplete';
import { YAMLProcessingMode } from './editor/enums';
import { TSLGenDaemon } from './tslgen/liveBuild';

export async function activate(context: vscode.ExtensionContext) {
    TSLGenDaemon.startTslGenDaemon();

    tslEditorExtension.update();

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
   
    context.subscriptions.push(vscode.commands.registerCommand('tslgen-edit.buildAndTest', async () => {
        const _data = await tslEditorExtension.renderCurrentSelection(YAMLProcessingMode.BuildRunAndTest) as TSLEditorPreview.PreviewMetaData;
        if (_data.buildable) {
            await TSLGenDaemon.generateWithDaemon( _data );
        } else {
            vscode.window.showErrorMessage(`No buildable primitive selected.`);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('tslgen-edit.start-tsl-daemon', async () => {
        TSLGenDaemon.startTslGenDaemon();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('tslgen-edit.close_daemon', async () => {
        TSLGenDaemon.killDaemon();
    }));


    vscode.window.onDidCloseTerminal((terminal) => {
        TSLGenDaemon.checkTerminalState( terminal );
    });
    // context.subscriptions.push(vscode.languages.registerContextMenuProvider)
    // vscode.commands.executeCommand('workbench.view.explorer');
}

export function deactivate() {
    TSLGenDaemon.tearDown();
}
