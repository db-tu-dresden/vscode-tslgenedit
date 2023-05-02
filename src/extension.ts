import * as vscode from 'vscode';
import { TVLEditorPreview } from './editor/preview';
import { tvlEditorExtension } from './editor/editor_extension';
import { TVLEditorAutoComplete } from './editor/autocomplete';

// let tvlPreviewPanel: vscode.WebviewPanel | undefined;



export async function activate(context: vscode.ExtensionContext) {

    const provider = new TVLEditorPreview.TVLGenViewProvider(context.extensionUri, context);

    context.subscriptions.push(vscode.window.registerWebviewViewProvider(TVLEditorPreview.TVLGenViewProvider.viewType, provider));

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'yaml' },
            new TVLEditorAutoComplete.YAMLCompletionProvider(),
            // '\w'
            // '*'
            ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
        )
    );

    context.subscriptions.push(vscode.commands.registerCommand('extension.preview', async () => {
        const _data = await tvlEditorExtension.renderCurrentSelection();

        provider.setContent(_data);
    }));

    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        tvlEditorExtension.update();
    }));
    tvlEditorExtension.update();

    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(
        { language: 'yaml' },
        { provideDocumentSymbols: tvlEditorExtension.getDocumentSymbols },
        { label: "TVLGenerator" }
    ));

    // vscode.commands.executeCommand('workbench.view.explorer');
}


// async function hideNonTVLGenEditFiles(): Promise<void> {
//     const currentFolder = utils.getFocusedFolder();
//     if (!currentFolder) {
//         return;
//     }
//     const newExcludes: { [key: string]: boolean } = extension_utils.getTVLGeneratorSpecificExcludes(currentFolder);
//     const config = vscode.workspace.getConfiguration();
//     const origFilesExclude = config.get<file_utils.FilesExclude>('files.exclude') ?? {};
//     for (const k in origFilesExclude) {
//         newExcludes[k] = true;
//     }
//     config.update("files.exclude", newExcludes, vscode.ConfigurationTarget.Workspace);
//     vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
// }
// async function showNonTVLGenEditFiles(): Promise<void> {
//     const currentFolder = utils.getFocusedFolder();
//     if (!currentFolder) {
//         return;
//     }
//     const newExcludes: { [key: string]: boolean } = {};
//     const tvlGenExlcudes: { [key: string]: boolean } = extension_utils.getTVLGeneratorSpecificExcludes(currentFolder);
//     const config = vscode.workspace.getConfiguration();
//     const origFilesExclude = config.get<file_utils.FilesExclude>('files.exclude') ?? {};
//     for (const k in origFilesExclude) {
//         if (!(k in tvlGenExlcudes)) {
//             newExcludes[k] = origFilesExclude[k];
//         }
//     }
//     config.update("files.exclude", newExcludes, vscode.ConfigurationTarget.Workspace);
//     vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
// }



// function addNewTVLGeneratorFile() {
//     if (!(extension_utils.isCurrentFolderATVLGeneratorFolder())) {
//         return;
//     }
//     const tvlGeneratorRootFolder = extension_utils.getTVLGeneratorRootFolder();
//     if (!tvlGeneratorRootFolder) {
//         return;
//     }
//     vscode.window.showQuickPick(["New Extension", "New PrimitiveClass"]).then(async (selectedItem) => {
//         if (selectedItem) {
//             let basePath: vscode.Uri;
//             let value: string;
//             let placeHolder: string;
//             log.outputDisplay.appendLine(selectedItem);
//             switch (selectedItem) {
//                 case "New TVL-Extension File":
//                     basePath = file_utils.addStringToUri(tvlGeneratorRootFolder, "extension");
//                     value = "new-extension";
//                     placeHolder = "Name of a new extension file (.yaml may be added)";
//                     break;
//                 default:
//                     basePath = file_utils.addStringToUri(tvlGeneratorRootFolder, "primitives");
//                     value = "new-primitive-class";
//                     placeHolder = "Name of a new primitive class file (.yaml may be added)";
//                     break;

//             }
//             const options: vscode.InputBoxOptions = {
//                 value: value,
//                 prompt: "Insert the file name.",
//                 placeHolder: placeHolder,
//                 ignoreFocusOut: true
//             };
//             vscode.window.showInputBox(options).then((fName) => {
//                 if (fName) {
//                     const fileName = file_utils.addStringsToUri(basePath, file_utils.addExtensionIfMissing(fName, "yaml"));
//                     if (file_utils.createFile(fileName)) {

//                     }
//                 }
//             });


//             // const uri = await vscode.window.showSaveDialog({
//             //     defaultUri: file_utils.getCurrentUri(type + ".yaml")
//             // });
//             // if (uri) {
//             //     log.outputDisplay.appendLine(uri);
//             //     const filePath = uri.fsPath;
//             //     fs.writeFileSync(
//             //         filePath,
//             //         new TextEncoder().encode('Hello, world!')
//             //     );

//             //     const document = await vscode.workspace.openTextDocument(uri);
//             //     context.globalState.update(uri.fsPath, type);
//             //     await vscode.window.showTextDocument(document);

//             // }
//         }
//     });
// }

export function deactivate() {
}
