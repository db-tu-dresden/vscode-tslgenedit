import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export namespace FileSystemUtils {
    export const separator = path.sep;
    export function toUri(uri: vscode.Uri | string): vscode.Uri {
        return (typeof uri === "string") ? vscode.Uri.parse(uri) : uri;
    }
    interface FileStat {
        file: string;
        stat: fs.Stats;
    }
    export interface MutableFile {
        uri: vscode.Uri;
        stat: fs.Stats;
    }

    export function addPathToUri(basePath: vscode.Uri | string, ...toAddPath: (vscode.Uri | string)[]): vscode.Uri {
        const _basePath: vscode.Uri = toUri(basePath);
        return _basePath.with({ path: _basePath.fsPath + separator + [...toAddPath].filter(str => str !?? '').join(separator) });
    }
    export function baseNameEqual(uri: vscode.Uri | string, folderName: string): boolean {
        const xxx = path.basename(toUri(uri).fsPath);
        return (folderName === path.basename(toUri(uri).fsPath));
    }
    export function containsAny(uri: vscode.Uri | string, ...folderNames: string[]): boolean {
        const _parts = split(uri);
        for (const _folderName of folderNames) {
            if (_parts.includes(_folderName)) {
                return true;
            }
        }
        return false;
    }
    export function containsAll(uri: vscode.Uri | string, ...folderNames: string[]): boolean {
        const _parts = split(uri);
        for (const _folderName of folderNames) {
            if (!(_parts.includes(_folderName))) {
                return false;
            }
        }
        return true;
    }
    export function truncateFile(uri: vscode.Uri | string): vscode.Uri {
        const _uri = toUri(uri);
        return vscode.Uri.parse(path.dirname(_uri.path));
    }
    export function moveUp(uri: vscode.Uri | string, number: number): vscode.Uri {
        const _uri = toUri(uri);
        const pathSegments: string[] = _uri.path.split(separator);
        pathSegments.splice(-number);
        return vscode.Uri.parse(pathSegments.join(separator));
    }
    export function moveUpTo(uri: vscode.Uri | string, ...folderNameAlternatives: string[]): vscode.Uri | undefined {
        const _uri = toUri(uri);
        const pathSegments: string[] = _uri.path.split(separator);
        const _alternatives = [...folderNameAlternatives];
        const length = pathSegments.length;
        for (let i = 0; i < length; i++) {
            if (_alternatives.includes(pathSegments[length-i-1])) {
                if (i === 0) {
                    return _uri;
                }
                pathSegments.splice(-i);
                return vscode.Uri.parse(pathSegments.join(separator));
            }
        }
        return undefined;
    }
    export function split(uri: vscode.Uri | string): string[] {
        const _uri = toUri(uri);
        return _uri.path.split(separator);
    }
    export async function fileExists(uri: vscode.Uri | string): Promise<boolean> {
        const _uri = toUri(uri);
        try {
            await fs.promises.access(_uri.fsPath);
            return true;
        } catch (err) {
            return false;
        }
    }
    export function filename(uri: vscode.Uri | string, withExtension: boolean = true): string {
        const _uri = toUri(uri);
        if (withExtension) {
            return path.basename(_uri.fsPath);
        }
        return path.basename(_uri.fsPath, path.extname(_uri.path));
    }
    export function fileWithExtension(uri: vscode.Uri | string, extension: string): vscode.Uri {
        const _uri = toUri(uri);
        const _extension = (extension.startsWith('.')) ? extension : `.${extension}`;
        const _fname = `${filename(_uri, false)}${_extension}`;
        return addPathToUri(toUri(path.dirname(_uri.fsPath)), _fname);
    }
    export function filenameWithExtension(uri: vscode.Uri | string, extension: string): string {
        const _uri = toUri(uri);
        const _extension = (extension.startsWith('.')) ? extension : `.${extension}`;
        return `${filename(_uri, false)}${_extension}`;
    }
    export async function isDirectory(uri: vscode.Uri | string): Promise<boolean> {
        const _uri = toUri(uri);
        const path = _uri.fsPath;
        try {
            const stat = await fs.promises.stat(path);
            return stat.isDirectory();
        } catch (error) {
            return false;
        }
    }
    export async function createDir(uri: vscode.Uri | string): Promise<boolean> {
        const _uri = toUri(uri);
        const dirPath = _uri.fsPath;
        const result = await isDirectory(_uri);
        if (result) {
            return true;
        } else {
            try {
                await fs.promises.mkdir(dirPath, { recursive: true });
                return true;
            } catch (err) {
                return false;
            }
        }
    }
    export async function iterFiles(startUri: vscode.Uri | string, fileExtension: string | undefined = undefined): Promise<MutableFile[]> {

        async function getAllFiles(uri: vscode.Uri): Promise<MutableFile[]> {
            const directoryPath: string = uri.fsPath;
            const fileNames = await fs.promises.readdir(directoryPath);
            const filePaths = fileNames.map((fileName) => path.join(directoryPath, fileName));
            const statsAndFilePaths: FileStat[] = await Promise.all(filePaths.map(async (filePath) => ({
                file: filePath,
                stat: await fs.promises.stat(filePath)
            })));
            let files: MutableFile[] = [];
            for (const s of statsAndFilePaths) {
                const fileUri = vscode.Uri.parse(s.file);
                if (!(s.stat.isDirectory())) {
                    files.push({ uri: fileUri, stat: s.stat });
                } else {
                    files = files.concat(await getAllFiles(fileUri));
                }
            }
            return files;
        }

        const _uri = toUri(startUri);
        const allFiles: MutableFile[] = await getAllFiles(_uri);

        if (!(fileExtension)) {
            return allFiles;
        } else {
            let _fileExtension: string = fileExtension;
            if (fileExtension.length > 0) {
                if (!(fileExtension.startsWith("."))) {
                    _fileExtension = `.${fileExtension}`;
                }
            }
            return allFiles.filter(function (mutableFile: MutableFile): boolean {
                return (path.extname(mutableFile.uri.fsPath) === _fileExtension);
            });
        }
    }
    export async function subdirectories(startUri: vscode.Uri | string, fileExtensionOfInterest: string): Promise<vscode.Uri[]> {
        const _uri = toUri(startUri);
        const result: Set<string> = new Set();
        async function containsRelevantFiles(uri: vscode.Uri): Promise<boolean> {
            const directoryPath: string = uri.fsPath;
            const fileNames = await fs.promises.readdir(directoryPath);
            const filePaths = fileNames.map((fileName) => path.join(directoryPath, fileName));
            const statsAndFilePaths: FileStat[] = await Promise.all(filePaths.map(async (filePath) => ({
                file: filePath,
                stat: await fs.promises.stat(filePath)
            })));
            const files: vscode.Uri[] = [];
            for (const s of statsAndFilePaths) {
                const fileUri = vscode.Uri.parse(s.file);
                if (s.stat.isDirectory()) {
                    if (await containsRelevantFiles(fileUri)) {
                        result.add(s.file);
                    }
                } else {
                    files.push(fileUri);
                }
            }
            for (const f of files) {
                if (path.extname(f.fsPath) === fileExtensionOfInterest) {
                    result.add(directoryPath);
                    return true;
                }
            }
            return false;
        }
        if (await containsRelevantFiles(_uri)) {
            result.add(_uri.fsPath);
        }
        return Array.from(result, x => vscode.Uri.parse(x));
    }
    export async function readFile(uri: vscode.Uri | string): Promise<string> {
        const _uri = toUri(uri);
        try {
            const buffer = await fs.promises.readFile(toUri(_uri).fsPath, 'utf-8');
            return buffer.toString();
        } catch (err) {
            console.error(`Failed to read file: ${_uri.fsPath}`, err);
            return '';
        }
    }

    export async function writeFile(uri: vscode.Uri | string, content: string): Promise<boolean> {
        const _uri = toUri(uri);
        try {
            await fs.promises.writeFile(_uri.fsPath, content, { encoding: "utf-8", flag: 'w' });
            return true;
        } catch (err) {
            console.error(`Failed to write file: ${_uri.fsPath}`, err);
            return false;
        }
    }

    export function relative(baseFolder: vscode.Uri | string, targetFolder: vscode.Uri | string): string {
        return path.relative(toUri(baseFolder).fsPath, toUri(targetFolder).fsPath);
    }

    export function joinPath(...files: string[]): string {
        return path.join(...files);
    }
    

}