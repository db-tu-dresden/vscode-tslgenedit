import { SerializerUtils } from "../utils/serialize";
import { TSLGeneratorSchema } from "../tslgen/schema";
import { TSLGeneratorModel } from "../tslgen/model";
import { TypeUtils } from "../utils/types";
import * as vscode from 'vscode';

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
    export function getDiagnosticsForDocument(
      document: vscode.TextDocument, 
      schema: TSLGeneratorSchema.Schemata 
  ): vscode.Diagnostic[] {
      const _parsedDocuments = SerializerUtils.parseYamlDocuments(document.getText());
      if ("empty" in _parsedDocuments) {
          return [];
      }
      const _documentType = TSLGeneratorModel.determineFileTypeByLocation(document.uri);
      const _schema = (_documentType === TSLGeneratorModel.TSLDataFileContentType.unknown) ? undefined : 
          (_documentType === TSLGeneratorModel.TSLDataFileContentType.extension) ? schema.extension : schema.primitive;
      let diagnostics: vscode.Diagnostic[] = [];
      let idx = 0;
      for (const yamlDoc of _parsedDocuments) {
          yamlDoc.errors.forEach((error) => {
              const msg = TypeUtils.truncateFromString(error.message, /at line \d/);
              let diagnostic = 
                  new vscode.Diagnostic(
                      new vscode.Range(document.positionAt(error.pos[0]), document.positionAt(error.pos[1])),
                      `${error.name}: ${msg}`,
                      vscode.DiagnosticSeverity.Error
                  );
              diagnostic.source = 'yaml';
              diagnostic.code = error.code;
              diagnostics.push(diagnostic);
          });
          yamlDoc.warnings.forEach((warning) => {
              const msg = TypeUtils.truncateFromString(warning.message, /at line \d/);
              let diagnostic = 
                  new vscode.Diagnostic(
                      new vscode.Range(document.positionAt(warning.pos[0]), document.positionAt(warning.pos[1])),
                      `${warning.name}: ${msg}`,
                      vscode.DiagnosticSeverity.Warning
                  );
              diagnostic.source = 'yaml';
              diagnostic.code = warning.code;
              diagnostics.push(diagnostic);
          });
          if (_schema) {
              if (idx === 0) {
                  idx++;
                  if (yamlDoc.contents) {
                      for (const yamlDiagnostic of SerializerUtils.validateYamlDocument(yamlDoc.contents, schema.primitiveClass)) {
                          const severity = (yamlDiagnostic.type === SerializerUtils.YamlDiagnosticType.error) ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Information;
                          const errorName = (yamlDiagnostic.type === SerializerUtils.YamlDiagnosticType.error) ? "YAMLSchemaError" : "YAMLSchemaHint";
                          let diagnostic = 
                              new vscode.Diagnostic(
                                  new vscode.Range(document.positionAt(yamlDiagnostic.node.range[0]), document.positionAt(yamlDiagnostic.node.range[0]+1)),
                                  `${errorName}: ${yamlDiagnostic.message}`,
                                  severity
                              );
                          diagnostic.source = 'yaml';
                          diagnostic.code = yamlDiagnostic.code;
                          diagnostics.push(diagnostic);
                      }
                  }
              } else {
                  if (yamlDoc.contents) {
                      for (const yamlDiagnostic of SerializerUtils.validateYamlDocument(yamlDoc.contents, _schema)) {
                          const severity = (yamlDiagnostic.type === SerializerUtils.YamlDiagnosticType.error) ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Information;
                          const errorName = (yamlDiagnostic.type === SerializerUtils.YamlDiagnosticType.error) ? "YAMLSchemaError" : "YAMLSchemaHint";
                          let diagnostic = 
                              new vscode.Diagnostic(
                                  new vscode.Range(document.positionAt(yamlDiagnostic.node.range[0]), document.positionAt(yamlDiagnostic.node.range[0]+1)),
                                  `${errorName}: ${yamlDiagnostic.message}`,
                                  severity
                              );
                          diagnostic.source = 'yaml';
                          diagnostic.code = yamlDiagnostic.code;
                          diagnostics.push(diagnostic);
                      }
                  }
              }
              
          }
      }   
      return diagnostics;
  }

}