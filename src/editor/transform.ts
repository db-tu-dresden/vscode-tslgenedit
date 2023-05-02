import * as vscode from 'vscode';
import { FileSystemUtils } from '../utils/files';
import { TVLGeneratorTemplate } from '../tvlgen/template_transform';
import { TVLGeneratorSchema } from '../tvlgen/schema';
import { SerializerUtils } from '../utils/serialize';
import { TypeUtils } from '../utils/types';

export namespace TVLEditorTransformation {
    export interface TransformationTarget {
        sourceFile: vscode.Uri;
        targetFolder: vscode.Uri;
    }
    export const templateFileExtension = ".twig";
    export const schemaFileExtension = ".json";

    export interface DefaultsFromSchema {
        extension: SerializerUtils.JSONNode,
        primitiveDeclaration: SerializerUtils.JSONNode,
        primitiveDefinition: SerializerUtils.JSONNode
    }

    export async function transformTemplates(transformationTargets: TransformationTarget[]): Promise<boolean> {
        const progressOptions = { location: vscode.ProgressLocation.Notification, title: `Transforming Templates...` };
        const progressCallback = async (progress: vscode.Progress<{ message?: string; }>) => {
            const allTransformed: boolean[] = await Promise.all(transformationTargets.map(async (entry) => {
                progress.report({ message: `Reading ${entry.sourceFile.fsPath}...` });
                const _origTemplateStr: string = await FileSystemUtils.readFile(entry.sourceFile);
                if (_origTemplateStr.length === 0) {
                    return true;
                }
                progress.report({ message: `Transforming ${entry.sourceFile.fsPath}...` });
                if (FileSystemUtils.filename(entry.sourceFile).startsWith("primitive_declaration")) {
                    // console.log("NOW");
                }
                const _updatedTemplateStr: string = TVLGeneratorTemplate.Jinja2ToTwing.transform(_origTemplateStr);
                if (_updatedTemplateStr.length === 0) {
                    return false;
                }
                const _targetFile: vscode.Uri = FileSystemUtils.addPathToUri(entry.targetFolder, FileSystemUtils.filenameWithExtension(entry.sourceFile, templateFileExtension));
                progress.report({ message: `Writing ${_targetFile.fsPath}...` });
                const _writeSuccess = await FileSystemUtils.writeFile(_targetFile, _updatedTemplateStr);
                return _writeSuccess;
            }));
            return allTransformed.reduce((acc, val) => acc && val, true);
        };
        return await vscode.window.withProgress(progressOptions, progressCallback);
    }

    export async function transformSchema(transformationTarget: TransformationTarget, persist: boolean = true): Promise<TVLGeneratorSchema.SchemaFileLocations|TVLGeneratorSchema.Schemata|undefined> {
        const progressOptions = { location: vscode.ProgressLocation.Notification, title: `Transforming Schema...` };
        const progressCallback = async (progress: vscode.Progress<{ message?: string; }>) => {
            progress.report({ message: `Reading ${transformationTarget.sourceFile.fsPath}...` });
            const _origSchema: string = await FileSystemUtils.readFile(transformationTarget.sourceFile);
            progress.report({ message: `Transforming ${transformationTarget.sourceFile.fsPath}...` });
            const _jsonDocuments: any[] = SerializerUtils.parseYamlDocumentsAsJson(_origSchema);
            if (_jsonDocuments.length === 0) {
                console.error(`No valid data found in ${transformationTarget.sourceFile.fsPath}`);
                return undefined;
            }
            if (_jsonDocuments.length !== 1) {
                console.error(`Expected 1 yaml document in ${transformationTarget.sourceFile.fsPath} but found ${_jsonDocuments.length}.`);
                return undefined;
            }
            const _jsonDocument = _jsonDocuments[0];
            if (!Object.values(TVLGeneratorSchema.tvlGeneratorTopLevelEntryNames).every(key => _jsonDocument.hasOwnProperty(key))) {
                console.error("Required keys were not present in schema.");
                return undefined;
            }
            const _extensionSchema = _jsonDocument[TVLGeneratorSchema.tvlGeneratorTopLevelEntryNames["extension"]];
            progress.report({ message: `Transforming extension schema...` });
            const _transformedExtensionSchema = TVLGeneratorSchema.SchemaTransform.transform(_extensionSchema);
            

            const _primitiveSchema = _jsonDocument[TVLGeneratorSchema.tvlGeneratorTopLevelEntryNames["primitive"]];
            const _primitiveClassSchema = _jsonDocument[TVLGeneratorSchema.tvlGeneratorTopLevelEntryNames["primitiveClass"]];
            progress.report({ message: `Transforming primitive schema...` });
            const _transformedPrimitiveSchema = TVLGeneratorSchema.SchemaTransform.transform(_primitiveSchema);
            progress.report({ message: `Transforming primitive-class schema...` });
            const _transformedPrimitiveClassSchema = TVLGeneratorSchema.SchemaTransform.transform(_primitiveClassSchema);
            progress.report({ message: `Combining primitive and primitive-class schema...` });
            const _finalPrimitiveSchema = TypeUtils.extendObjects(_transformedPrimitiveSchema, _transformedPrimitiveClassSchema);
            
            if (persist) {
                const _targetExtensionFile: vscode.Uri = FileSystemUtils.addPathToUri(
                    transformationTarget.targetFolder, FileSystemUtils.filenameWithExtension("extensionSchema", schemaFileExtension));
                progress.report({ message: `Writing extension schema to ${_targetExtensionFile.fsPath}...` });
                if (! await FileSystemUtils.writeFile(_targetExtensionFile, JSON.stringify(_transformedExtensionSchema))) {
                    return undefined;
                }
                const _targetPrimitiveFile: vscode.Uri = FileSystemUtils.addPathToUri(
                    transformationTarget.targetFolder, FileSystemUtils.filenameWithExtension("primitiveSchema", schemaFileExtension));
                progress.report({ message: `Writing primitive schema to ${_targetPrimitiveFile.fsPath}...` });
                if (! await FileSystemUtils.writeFile(_targetPrimitiveFile, JSON.stringify(_finalPrimitiveSchema))) {
                    return undefined;
                }
                return {
                    extension: _targetExtensionFile,
                    primitive: _targetPrimitiveFile,
                    primitiveClass: _targetPrimitiveFile
                };
            } else {
                return {
                    extension: _transformedExtensionSchema,
                    primitive: _transformedPrimitiveSchema,
                    primitiveClass: _transformedPrimitiveClassSchema
                };
            }
            
        };
        return await vscode.window.withProgress(progressOptions, progressCallback);
    }

    export async function getDefaultsFromYamlSchema(schemaYaml: vscode.Uri) : Promise<DefaultsFromSchema | undefined>{
        const _origSchema: string = await FileSystemUtils.readFile(schemaYaml);
        const _jsonDocuments: any[] = SerializerUtils.parseYamlDocumentsAsJson(_origSchema);
        if (_jsonDocuments.length === 0) {
            console.error(`No valid data found in ${schemaYaml.fsPath}`);
            return undefined;
        }
        if (_jsonDocuments.length !== 1) {
            console.error(`Expected 1 yaml document in ${schemaYaml.fsPath} but found ${_jsonDocuments.length}.`);
            return undefined;
        }
        const _jsonDocument = _jsonDocuments[0];
        if (!Object.values(TVLGeneratorSchema.tvlGeneratorTopLevelEntryNames).every(key => _jsonDocument.hasOwnProperty(key))) {
            console.error("Required keys were not present in schema.");
            return undefined;
        }
        const _extensionSchema = TVLGeneratorSchema.SchemaTransform.filterDefaults(_jsonDocument[TVLGeneratorSchema.tvlGeneratorTopLevelEntryNames["extension"]]);
        const _extensionDefaults = TVLGeneratorSchema.SchemaTransform.createDefaultEntryFromSchema(_extensionSchema);
        const _primitiveSchema = _jsonDocument[TVLGeneratorSchema.tvlGeneratorTopLevelEntryNames["primitive"]];
        const _primitiveDefinition = {..._primitiveSchema['optional']['definitions']['entry_type']};
        delete _primitiveSchema['definitions'];
        const _primitiveDeclaration = _primitiveSchema;
        const _primitiveDefinitionFiltered = TVLGeneratorSchema.SchemaTransform.filterDefaults(_primitiveDefinition);
        const _primitiveDeclarationFiltered = TVLGeneratorSchema.SchemaTransform.filterDefaults(_primitiveDeclaration);

        const _primitiveDeclarationDefaults = TVLGeneratorSchema.SchemaTransform.createDefaultEntryFromSchema(_primitiveDeclarationFiltered);
        const _primitiveDefinitionDefaults = TVLGeneratorSchema.SchemaTransform.createDefaultEntryFromSchema(_primitiveDefinitionFiltered);
        return {
            extension: _extensionDefaults,
            primitiveDeclaration: _primitiveDeclarationDefaults,
            primitiveDefinition: _primitiveDefinitionDefaults
        };
    }


}