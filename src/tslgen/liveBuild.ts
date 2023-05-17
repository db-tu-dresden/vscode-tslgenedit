import { spawn } from 'node:child_process';
import { ChildProcess, exec, execSync } from 'child_process';
import { FileSystemUtils } from '../utils/files';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { TSLEditorPreview } from '../editor/preview';
import { TSLGeneratorModel } from '../tslgen/model';

export namespace TSLGenDaemon {
    const local_lscpu_flags = getLocalLscpuFlags().split(" ").filter((item) => item.trim().length > 0).map((item) => `"${item}"`).join(",");
    const tslTempBuildDir = `.tslgenEdit-temp`;
    const TSL_TERMINAL_IDENT = "TSL Terminal";
    let generator_daemon: ChildProcess | undefined;
    let generator_idle: boolean;
    let tslTerminal: vscode.Terminal | undefined;

    export async function startTslGenDaemon() {
        if (!generator_daemon) {
            const tslPwd = TSLGeneratorModel.getTSLRootFolderForCurrentActiveFile()?.fsPath;
            if (tslPwd) {
                const progressOptions = { location: vscode.ProgressLocation.Notification, title: `Starting TSLGen as daemon...` };
                const progressCallback = async (progress: vscode.Progress<{ message?: string; }>) => {
                    let pyPath = FileSystemUtils.joinPath(tslPwd, "main.py");
                    generator_daemon = spawn(`python3`, [`${pyPath}`, "-o", `${tslPwd}/${tslTempBuildDir}`, "-d", "-s"]);
                    generator_daemon.stdout?.on('data', (data) => {
                        // console.log(`stdout: ${data}`);
                        if (data.includes("Ready") || data.includes("Done")) {
                            // console.log("Generator is ready again");
                            generator_idle = true;
                        }
                    });

                    generator_daemon.stderr?.on('data', (data) => {
                        // console.error(`stderr: ${data}`);
                        generator_idle = true;
                    });

                    generator_daemon.on('close', (code) => {
                        // console.log(`TSLGen daemon exited with code ${code}`);
                    });
                };
                return await vscode.window.withProgress(progressOptions, progressCallback);
            }
        }
    }

    export async function generateWithDaemon(_data: TSLEditorPreview.PreviewMetaData) {
        if (!generator_daemon) {
            startTslGenDaemon();
        }
        
        if (generator_idle) {
            const tslPwd = TSLGeneratorModel.getTSLRootFolderForCurrentActiveFile();
            const tslTempDir = `${tslPwd?.fsPath}/${tslTempBuildDir}`;
            if (!tslTerminal) {
                tslTerminal = vscode.window.createTerminal(`TSL Terminal`);
            }
            if (!fs.existsSync(tslTempDir)) {
                fs.mkdirSync(tslTempDir);
            }
            const progressOptions = { location: vscode.ProgressLocation.Notification, title: `TSLGen daemon: Generating...` };
            const progressCallback = async (progress: vscode.Progress<{ message?: string; }>) => {
                generator_idle = false;
                generator_daemon?.stdin?.write(`{"lscpu_flags":[${local_lscpu_flags}], "primitives": [\"${_data.primitive_name}\"]}\n`);
                while (!generator_idle) {
                    await new Promise(f => setTimeout(f, 10));
                }
            };
            await vscode.window.withProgress(progressOptions, progressCallback);
            tslTerminal.show();
            tslTerminal.sendText(`cd ${tslTempDir}`);
            tslTerminal.sendText(`cmake -S ${tslTempDir} -B ${tslTempDir}/build`);
            tslTerminal.sendText(`make -j -C ${tslTempDir}/build`);
            tslTerminal.sendText(`${tslTempDir}/build/src/test/tsl_test \"[${_data.extension_name}][${_data.primitive_name}]\"`);
        } else {
            vscode.window.showInformationMessage("Build already active, please wait for it to finish.");
        }
    }

    function getLocalLscpuFlags(): string {
        const command = `LANG=en;lscpu|grep -i flags | tr ' ' '\n' | egrep -v '^Flags:|^$' | sort -d | tr '\n' ' '`;
        const flags = execSync(command);
        return flags.toString();
    }

    export function checkTerminalState( terminal: vscode.Terminal ) {
        if (terminal.name === TSL_TERMINAL_IDENT) {
            // console.log("Disposing TSL Terminal");
            tslTerminal?.dispose();
            tslTerminal = undefined;
        }
    }

    export function killDaemon() {
        // console.log("Closing child process...");
        generator_daemon?.kill("SIGINT");
        generator_daemon = undefined;
    }

    export function tearDown() {
        // console.log("TSLGenDaemon: Teardown...");
        if (tslTerminal) {
            tslTerminal.dispose();
        }
        if (generator_daemon) {
            // console.log("Terminating TSLGen daemon.");
            generator_daemon?.kill("SIGINT");
            generator_daemon = undefined;
        }
    }
}