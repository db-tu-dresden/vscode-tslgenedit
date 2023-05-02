export namespace TVLGeneratorTemplate {
    export namespace Jinja2ToTwing {
        namespace details {
            interface CompiledTemplate {
                render: (context?: object) => string;
            }
            interface NameSpaceVar {
                namespace: string;
                variable: string;
                value: string;
            }
            interface NameSpaceRange {
                start: number;
                end: number;
            }
            interface MacroEntry {
                name: string;
                definition: string;
            }
            
            const jinjaStartBlockLogic: string = "{%[-+]*\\s+";
            const jinjaEndBlockLogic = "\\s+[-+]*%}";
            const jinjaStartBlockVar = "{{\\s*";
            const jinjaEndBlockVar = "\\s*}}";
            const matcherNamespace: RegExp = new RegExp(`${jinjaStartBlockLogic}set\\s*([^\\s]+)\\s*=\\s*namespace\\(((.*?)\\)${jinjaEndBlockLogic})`, 'gms');
            const matcherVariables: RegExp = new RegExp("\\s*([^=\\s]+)\\s*=\\s*([^,$]+)", 'gms');
            const matcherMacro: RegExp = new RegExp(`(${jinjaStartBlockLogic}macro\\s+([^\\(]+)(.*?)endmacro${jinjaEndBlockLogic})`, 'gms');
            const matcherTernary1: RegExp = new RegExp(`${jinjaStartBlockVar}(?<ifpart>.*?)\\s+if\\s*(?<condition>.*?)\\s+else\\s+((?<elsepart>(.*?))${jinjaEndBlockVar})`, 'g');
            const matcherTernary2: RegExp = new RegExp(`${jinjaStartBlockLogic}set\\s*(?<varName>[^\\s]+)\\s*=\\s+(?<ifpart>.*?)\\s+if\\s*(?<condition>.*?)\\s+else\\s+((?<elsepart>(.*?))${jinjaEndBlockLogic})`, 'g');
            const substituteTernary1: string = "{{ (\$<condition>) ? \$<ifpart> : \$<elsepart> }}";
            const substituteTernary2: string = "{% set \$<varName> = (\$<condition>) ? \$<ifpart> : \$<elsepart> %}";
            const matcherFilterIndent: RegExp = new RegExp(`${jinjaStartBlockLogic}filter\\s*indent(.*)${jinjaEndBlockLogic}(\n)?(?<innerBlock>.*?)(\\s)?${jinjaStartBlockLogic}endfilter${jinjaEndBlockLogic}`, 'gms');
            const substituteFilterIndent: string = "\$<innerBlock>";
            export function transformNamespace(input: string): string {
                const matchesNamespace = Array.from(input.matchAll(matcherNamespace));
                if (matchesNamespace.length === 0) {
                    return input;
                }
                const namespaces: NameSpaceRange[] = [];
                const namespaceVariablesSubstitutionRegex: { orig: string, new: string }[] = [];
                let output = "";
                for (const matchNs of matchesNamespace) {
                    if (matchNs.index !== undefined ) {
                        namespaces.push({ start: matchNs.index, end: matchNs.index + matchNs[0].length });
                        const currentNameSpace = matchNs[1];
                        const currentVariables = matchNs[3];
                        const matchesVariables = Array.from(currentVariables.matchAll(matcherVariables));
                        namespaceVariablesSubstitutionRegex.push(
                            {
                                orig: `${currentNameSpace}\\.(?<varName>${matchesVariables.map(([_, variableName]) => variableName).join("\|")})`,
                                new: `${currentNameSpace}_\$<varName>`
                            }
                        );
                        output += matchesVariables.map(([_, variableName, value]) => `{% set ${currentNameSpace}_${variableName} = ${value} %}`).join("\n");
                        output += "\n";
                    }
                }
                let lastPos = 0;
                for (const namespace of namespaces) {
                    output += input.substring(lastPos, namespace.start);
                    lastPos = namespace.end;
                }
                output += input.substring(lastPos);
                for (const variables of namespaceVariablesSubstitutionRegex) {
                    output = output.replaceAll(new RegExp(variables.orig, 'gms'), variables.new);
                }

                return output;
            }

            export function transformMacros(input: string): string {
                const matchesMacro = Array.from(input.matchAll(matcherMacro));
                const macros: MacroEntry[] = matchesMacro.map((matchMacro) => {
                    return { name: matchMacro[2], definition: matchMacro[1] };
                });
                let tmpOutput = input;
                for (const macroEntry of macros) {
                    tmpOutput = tmpOutput.replace(macroEntry.definition, "");
                    try {
                        tmpOutput = tmpOutput.replaceAll(new RegExp(`{{\\s*${macroEntry.name}\\(`, 'gm'), "{% include '_self' %}\n{{ _self." + macroEntry.name + "(");
                    } catch (e) {

                    }
                }
                let output = macros.map((macroEntry) => macroEntry.definition).join('') + "\n" + tmpOutput;
                return output;
            }

            export function transformIfThenElse(input: string): string {
                return input.replace("elif", "elseif");
            }

            export function transformBool(input: string): string {
                return input.replace(/True|False/g, (match) => match === "True" ? "true" : "false");
            }

            export function transformTernary(input: string): string {
                const output = input.replaceAll(matcherTernary1, substituteTernary1);
                return output.replaceAll(matcherTernary2, substituteTernary2);
            }

            export function transformFilterIndent(input: string): string {
                return input.replace(matcherFilterIndent, substituteFilterIndent);
            }
        }
        export function transform(input: string): string {
            try {
                let output = details.transformNamespace(input);
                output = details.transformMacros(output);
                output = details.transformIfThenElse(output);
                output = details.transformBool(output);
                output = details.transformTernary(output);
                output = details.transformFilterIndent(output);
                return output;
            } catch (e) {
                console.error(e);
                return "";
            }
        }
    }

}