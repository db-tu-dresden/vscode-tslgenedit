import * as vscode from 'vscode';
import { TSLGeneratorModel } from './tslgen/model';
import { TSLEditorPreview } from './editor/preview';
import { tslEditorExtension } from './editor/editor_extension';
import { TSLEditorAutoComplete } from './editor/autocomplete';
import { YAMLProcessingMode } from './editor/enums';
import * as fs from 'fs';
import { spawn } from 'node:child_process';
import { ChildProcess } from 'child_process';
import { FileSystemUtils } from './utils/files';

// let tslPreviewPanel: vscode.WebviewPanel | undefined;

let tslTerminal: vscode.Terminal | undefined;

let generator_child: ChildProcess | undefined;

export async function activate(context: vscode.ExtensionContext) {
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

    const TSL_TERMINAL_IDENT = "TSL Terminal";
    context.subscriptions.push(vscode.commands.registerCommand('tslgen-edit.buildAndTest', async () => {
        const _data = await tslEditorExtension.renderCurrentSelection(YAMLProcessingMode.BuildRunAndTest) as TSLEditorPreview.PreviewMetaData;
        if (_data.buildable) {
            const tslPwd = TSLGeneratorModel.getTSLRootFolderForCurrentActiveFile();
            const tslTempBuildDir = `.tslgenEdit-build`;
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


    let idx = 0;
    let generator_ready = false;
    context.subscriptions.push(vscode.commands.registerCommand('tslgen-edit.send_text_to_dummy', async () => {
        console.log("Triggered child process");
        if (generator_ready) {
            console.log("Gen is ready.");
        }
        if (!generator_child) {
            const tslPwd = TSLGeneratorModel.getTSLRootFolderForCurrentActiveFile()?.fsPath;
            if (tslPwd) {
                let pyPath = FileSystemUtils.joinPath(tslPwd, "main.py");

                console.log(`Spawning for: ${pyPath}, outDir is: ${tslPwd}/.tslgenEdit-build`);
                generator_child = spawn(`python3`, [`${pyPath}`, "-o", `${tslPwd}/.tslgenEdit-build`,"-d","-s"]);
                console.log(`Spawn command: python3 ${[`${pyPath}`, "-o", `${tslPwd}/.tslgenEdit-build`,"-d","-s"].join(" ")}`)
                generator_child.stdout?.on('data', (data) => {
                    console.log(`stdout: ${data}`);
                    if ( data.includes( "Ready" ) || data.includes( "Done" ) ) {
                        console.log("Generator is ready again");
                        generator_ready = true;
                    }
                });

                generator_child.stderr?.on('data', (data) => {
                    console.error(`stderr: ${data}`);
                });

                generator_child.on('close', (code) => {
                    console.log(`child process exited with code ${code}`);
                });

            }
        } else {
            if ( generator_ready ) {
                console.log(`Writing to stdin of generator: {"lscpu_flags":["sse","sse2","sse3","sse4_1","sse4_2","avx","avx2"], "primitives": ["load"]}`);
                generator_ready = false;
                generator_child.stdin?.write(`{"lscpu_flags":["sse","sse2","sse3","sse4_1","sse4_2","avx","avx2"], "primitives": ["load"]}\n`);
            }
        }
        idx += 1
    }));

    context.subscriptions.push(vscode.commands.registerCommand('tslgen-edit.close_dummy', async () => {
        console.log("Closing child process...");
        generator_child?.kill("SIGINT");
        generator_child = undefined;
    }));


    vscode.window.onDidCloseTerminal((terminal) => {
        if (terminal.name === TSL_TERMINAL_IDENT) {
            tslTerminal?.dispose();
            tslTerminal = undefined;
        }
    });
    // context.subscriptions.push(vscode.languages.registerContextMenuProvider)
    // vscode.commands.executeCommand('workbench.view.explorer');
}

export function deactivate() {
    if (tslTerminal) {
        tslTerminal.dispose();
    }
}
