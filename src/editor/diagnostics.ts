import { SerializerUtils } from "../utils/serialize";
import { TSLGeneratorSchema } from "../tslgen/schema";
import { TSLGeneratorModel } from "../tslgen/model";
import { TypeUtils } from "../utils/types";
import * as vscode from 'vscode';
import { YAMLWarning } from "yaml";
import { FileSystemUtils } from "../utils/files";

export namespace TSLEditorFileDiagnostics {

    // export function async getDiagnosticsForFile(
    //     document: vscode.Uri,
    //     supplementary: TSLEditorTransformation.SchemaSupplementary,
    //     schema: TSLGeneratorSchema.Schemata 
    // ): Promise<vscode.Diagnostic[]> {
    //     const _parsedDocuments = SerializerUtils.parseYamlDocuments(await FileSystemUtils.readFile(document));
    //     if ("empty" in _parsedDocuments) {
    //         return [];
    //     }
    //     let diagnostics: vscode.Diagnostic[] = [];
    //     for (const document of _parsedDocuments) {
    //         document.errors.forEach((error) => {
    //             if (error.linePos) {
    //                 let range: vscode.Range;
    //                 if (error.linePos.length === 1) {
    //                     range = new vscode.Range(error.linePos[0].line-1, error.linePos[0].col, error.linePos[0].line-1, error.linePos[0].col);
    //                 } else {
    //                     range = new vscode.Range(error.linePos[0].line-1, error.linePos[0].col, error.linePos[1].line-1, error.linePos[1].col);
    //                 }
    //                 const msg = TypeUtils.truncateFromString(error.message, /at line \d/);
    //                 let diagnostic = 
    //                     new vscode.Diagnostic(
    //                         range,
    //                         `${error.name}: ${msg}`,
    //                         vscode.DiagnosticSeverity.Error,
    //                     );
    //                 diagnostic.source = 'yaml';
    //                 diagnostic.code = error.code;
    //                 diagnostics.push(diagnostic);
    //             }
    //          });
    //          document.warnings.forEach((warning) => {
    //             if (warning.linePos) {
    //                 let range: vscode.Range;
    //                 if (warning.linePos.length === 1) {
    //                     range = new vscode.Range(warning.linePos[0].line-1, warning.linePos[0].col, warning.linePos[0].line-1, warning.linePos[0].col);
    //                 } else {
    //                     range = new vscode.Range(warning.linePos[0].line-1, warning.linePos[0].col, warning.linePos[1].line-1, warning.linePos[1].col);
    //                 }
    //                 const msg = TypeUtils.truncateFromString(warning.message, /at line \d/);
    //                 let diagnostic = 
    //                     new vscode.Diagnostic(
    //                         range,
    //                         `${warning.name}: ${msg}`,
    //                         vscode.DiagnosticSeverity.Warning,
    //                     );
    //                 diagnostic.source = 'yaml';
    //                 diagnostic.code = warning.code;
    //                 diagnostics.push(diagnostic);
    //             }
    //          });

            
    //     }
    //     return diagnostics;
    // }

    function createYamlParserDiagnostic(
        diagnosticType: SerializerUtils.YamlDiagnosticType,
        severity: vscode.DiagnosticSeverity,
        documentOfOrigin: FileSystemUtils.FileHandle
    ) {
        const range = documentOfOrigin.getRange(diagnosticType.pos[0], diagnosticType.pos[1]);
        let diagnostic = new vscode.Diagnostic(
            range,
            `${diagnosticType.name}: ${TypeUtils.truncateFromString(diagnosticType.message, /at line \d/)}`,
            severity
        );
        diagnostic.source = 'yaml';
        diagnostic.code = diagnosticType.code;
        return diagnostic;
    }
    function createCustomYamlParserDiagnostic(
        diagnosticType: SerializerUtils.YamlDiagnostic,
        documentOfOrigin: FileSystemUtils.FileHandle
    ) {
        const severity = (diagnosticType.type === SerializerUtils.YamlDiagnosticCustomType.error) ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Information;
        const range = documentOfOrigin.getRange(diagnosticType.node.range[0], diagnosticType.node.range[0] + 1);
        let diagnostic = new vscode.Diagnostic(
            range,
            `${diagnosticType.type.valueOf()}: ${diagnosticType.message}`,
            severity
        );
        diagnostic.source = 'yaml';
        diagnostic.code = diagnosticType.code;
        return diagnostic;
    }

    function getDiagnosticsForYamlDocuments(
        yamlDocuments: SerializerUtils.YamlDocument[],
        schema: TSLGeneratorSchema.Schemata,
        documentOfOrigin: FileSystemUtils.FileHandle
    ) {
        const _uri = documentOfOrigin.getUri();
        const _documentType = TSLGeneratorModel.determineFileTypeByLocation(_uri);
        const _schema = (_documentType === TSLGeneratorModel.TSLDataFileContentType.unknown) ? undefined :
            (_documentType === TSLGeneratorModel.TSLDataFileContentType.extension) ? schema.extension : schema.primitive;
        if (!_schema) {
            return [];
        }
        let diagnostics: vscode.Diagnostic[] = [];
        let idx = 0;
        for (const yamlDoc of yamlDocuments) {
            yamlDoc.errors.forEach((error) => {
                diagnostics.push(createYamlParserDiagnostic(error, vscode.DiagnosticSeverity.Error, documentOfOrigin));
            });
            yamlDoc.warnings.forEach((warning) => {
                diagnostics.push(createYamlParserDiagnostic(warning, vscode.DiagnosticSeverity.Warning, documentOfOrigin));
            });
            if (yamlDoc.contents) {
                if (_documentType === TSLGeneratorModel.TSLDataFileContentType.extension) {
                    for (const yamlDiagnostic of SerializerUtils.validateYamlDocument(yamlDoc.contents, _schema)) {
                        diagnostics.push(createCustomYamlParserDiagnostic(yamlDiagnostic, documentOfOrigin));
                    }
                } else {
                    if (idx === 0) {
                        idx++;
                        for (const yamlDiagnostic of SerializerUtils.validateYamlDocument(yamlDoc.contents, schema.primitiveClass)) {
                            diagnostics.push(createCustomYamlParserDiagnostic(yamlDiagnostic, documentOfOrigin));
                        }
                    } else {
                        for (const yamlDiagnostic of SerializerUtils.validateYamlDocument(yamlDoc.contents, _schema)) {
                            diagnostics.push(createCustomYamlParserDiagnostic(yamlDiagnostic, documentOfOrigin));
                        }
                    }
                }
            }
        }
        return diagnostics;
    }

    export function getDiagnosticsForTextDocument(
        document: vscode.TextDocument,
        schema: TSLGeneratorSchema.Schemata
    ): vscode.Diagnostic[] {
        const _parsedDocuments = SerializerUtils.parseYamlDocuments(document.getText());
        if ("empty" in _parsedDocuments) {
            return [];
        }
        const fileHandle = new FileSystemUtils.FileHandle();
        fileHandle.setDocument(document);
        return getDiagnosticsForYamlDocuments(_parsedDocuments, schema, fileHandle);
    }

    export async function getDiagnosticsForFile(
        fileUri: vscode.Uri,
        schema: TSLGeneratorSchema.Schemata
    ): Promise<vscode.Diagnostic[]> {
        const _text = await FileSystemUtils.readFile(fileUri);
        const _parsedDocuments = SerializerUtils.parseYamlDocuments(_text);
        if ("empty" in _parsedDocuments) {
            return [];
        }
        const fileHandle = new FileSystemUtils.FileHandle();
        fileHandle.setContent(fileUri, _text);
        return getDiagnosticsForYamlDocuments(_parsedDocuments, schema, fileHandle);
    }

}