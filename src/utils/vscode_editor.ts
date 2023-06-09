
import * as vscode from 'vscode';

export namespace EditorUtils {
    export interface FilesVisibility {
        [pattern: string]: boolean;
    }
    export function isActiveEditor(): boolean {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return false;
        }
        return true;
    }
    export function getActiveEditor(): vscode.TextEditor | undefined {
        return vscode.window.activeTextEditor;
    }
    export function getActiveDocument(): vscode.TextDocument | undefined {
        const _activeEditor = vscode.window.activeTextEditor;
        if (!_activeEditor) {
            return undefined;
        }
        return _activeEditor.document;
    }
    export function getUriOfActiveEditor(): vscode.Uri | undefined {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return undefined;
        }
        const doc = editor.document;
        return doc.uri;        
    }
    export function getActiveEditorText(): string {
        const _activeEditor = vscode.window.activeTextEditor;
        if (!_activeEditor) {
            return "";
        }
        return _activeEditor.document.getText();
    }
    export function getActiveWorkspaceFolder(): vscode.Uri | undefined {
        const _activeDocument = getActiveDocument();
        if (!_activeDocument) {
            return undefined;
        }
        const _workspaceFolder = vscode.workspace.getWorkspaceFolder(_activeDocument.uri);
        if (!_workspaceFolder) {
            return undefined;
        }
        return _workspaceFolder.uri;
    }

    
    

    // function getParentContext(
    //     currentDocument: vscode.TextDocument, 
    //     document: SerializerUtils.YamlDocument, 
    //     cursorPosition: vscode.Position
    // ): string | undefined {
    //     const rootNode = document.contents;
    //     rootNode.
    //     const node = findNodeAtPosition(rootNode, cursorPosition);
    //     if (!node?.parent?.toJSON) {
    //       return undefined;
    //     }
    //     const parent = node.parent.toJSON();
    //     if (parent.type === 'MAP' && parent.value && parent.value[node.toJSON()?.range?.start?.column]) {
    //       return parent.value[node.toJSON()?.range?.start?.column].toString();
    //     }
    //     return undefined;
    //   }
}
