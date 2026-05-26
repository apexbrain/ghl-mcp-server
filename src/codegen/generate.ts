/**
 * Codegen: parses the installed @gohighlevel/api-client SDK and emits
 * src/tools.generated.ts with one MCP tool definition per public async method.
 *
 * Run with: npm run generate
 */
import { Project, ClassDeclaration, MethodDeclaration, SyntaxKind, TypeNode, TypeLiteralNode, PropertySignature, ParameterDeclaration, JSDoc } from "ts-morph";
import { readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SDK_CODE_DIR = resolve(REPO_ROOT, "node_modules", "@gohighlevel", "api-client", "lib", "code");
const SDK_HIGHLEVEL_TS = resolve(REPO_ROOT, "node_modules", "@gohighlevel", "api-client", "lib", "HighLevel.ts");
const OUT_PATH = resolve(REPO_ROOT, "src", "tools.generated.ts");

interface ToolSpec {
  name: string;             // forms_getForms
  description: string;
  serviceProperty: string;  // forms (the property on HighLevel instance)
  methodName: string;       // getForms
  hasRequestBody: boolean;
  inputSchema: object;      // JSON Schema for tool input
}

// Read the HighLevel.ts file to build a mapping: ClassName -> propertyName
// (e.g., CustomFields -> customFields, Forms -> forms)
function buildClassToPropertyMap(): Map<string, string> {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const src = project.addSourceFileAtPath(SDK_HIGHLEVEL_TS);
  const cls = src.getClasses().find(c => c.getName() === "HighLevel");
  if (!cls) throw new Error("HighLevel class not found");
  const map = new Map<string, string>();
  for (const prop of cls.getProperties()) {
    if (!prop.hasModifier(SyntaxKind.PublicKeyword)) continue;
    const typeText = prop.getTypeNode()?.getText();
    if (!typeText) continue;
    map.set(typeText, prop.getName());
  }
  return map;
}

function listServiceFiles(): string[] {
  const out: string[] = [];
  for (const dir of readdirSync(SDK_CODE_DIR)) {
    const full = join(SDK_CODE_DIR, dir);
    if (!statSync(full).isDirectory()) continue;
    // Service file is named like <dir>.ts (e.g. forms/forms.ts)
    const expected = join(full, `${dir}.ts`);
    try {
      if (statSync(expected).isFile()) out.push(expected);
    } catch {}
  }
  return out.sort();
}

function getLeadingJSDoc(method: MethodDeclaration): string {
  const jsDocs = method.getJsDocs();
  if (jsDocs.length === 0) return "";
  const doc = jsDocs[jsDocs.length - 1];
  // Combine description + @tags into a single readable string
  const desc = doc.getDescription().trim();
  const tagsText = doc.getTags()
    .map(t => `@${t.getTagName()} ${t.getCommentText() ?? ""}`.trim())
    .join("\n");
  return [desc, tagsText].filter(Boolean).join("\n\n").trim();
}

// Decode common HTML entities that appear in the SDK's JSDoc
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, ""); // strip remaining HTML tags
}

// Map a TS TypeNode (syntactic) to a JSON Schema fragment.
// Keeps things permissive: complex/unknown types fall back to {} which accepts anything.
function typeNodeToJsonSchema(node: TypeNode | undefined): any {
  if (!node) return {};
  const text = node.getText().trim();

  // Primitives
  if (text === "string") return { type: "string" };
  if (text === "number") return { type: "number" };
  if (text === "boolean") return { type: "boolean" };
  if (text === "null") return { type: "null" };
  if (text === "any" || text === "unknown" || text === "object") return {};
  if (text === "Date") return { type: "string", format: "date-time" };

  // String literal: "foo"
  const stringLiteral = text.match(/^['"](.+)['"]$/);
  if (stringLiteral) return { type: "string", const: stringLiteral[1] };

  // Number literal
  if (/^-?\d+(\.\d+)?$/.test(text)) return { type: "number", const: Number(text) };

  // Array forms: T[] or Array<T>
  if (node.getKind() === SyntaxKind.ArrayType) {
    const inner = (node as any).getElementTypeNode?.();
    return { type: "array", items: typeNodeToJsonSchema(inner) };
  }
  const arrayGenericMatch = text.match(/^Array<(.+)>$/s);
  if (arrayGenericMatch) {
    return { type: "array" };
  }

  // Union: detect via kind
  if (node.getKind() === SyntaxKind.UnionType) {
    const types = (node as any).getTypeNodes() as TypeNode[];
    const subSchemas = types.map(t => typeNodeToJsonSchema(t));
    // If all are string literals -> enum
    const allStringConsts = subSchemas.every(s => s.type === "string" && "const" in s);
    if (allStringConsts) {
      return { type: "string", enum: subSchemas.map(s => s.const) };
    }
    // If all are number literals -> number enum
    const allNumberConsts = subSchemas.every(s => s.type === "number" && "const" in s);
    if (allNumberConsts) {
      return { type: "number", enum: subSchemas.map(s => s.const) };
    }
    return { oneOf: subSchemas };
  }

  // Inline object type literal: { foo: string; bar?: number }
  if (node.getKind() === SyntaxKind.TypeLiteral) {
    return typeLiteralToJsonSchema(node as TypeLiteralNode);
  }

  // Anything else (TypeReference like Models.FooDto, generics, etc.) -> permissive
  return {};
}

function typeLiteralToJsonSchema(node: TypeLiteralNode): any {
  const properties: Record<string, any> = {};
  const required: string[] = [];
  for (const member of node.getMembers()) {
    if (member.getKind() !== SyntaxKind.PropertySignature) continue;
    const prop = member as PropertySignature;
    const name = prop.getName();
    const schema = typeNodeToJsonSchema(prop.getTypeNode());
    properties[name] = schema;
    if (!prop.hasQuestionToken()) required.push(name);
  }
  const out: any = { type: "object", properties };
  if (required.length > 0) out.required = required;
  out.additionalProperties = true; // be permissive
  return out;
}

function buildInputSchema(method: MethodDeclaration): { schema: any; hasRequestBody: boolean } {
  const params = method.getParameters();
  // Find the "params" parameter (object literal of query/path/header keys) and "requestBody" (any)
  let paramsParam: ParameterDeclaration | undefined;
  let bodyParam: ParameterDeclaration | undefined;
  for (const p of params) {
    const name = p.getName();
    if (name === "params") paramsParam = p;
    else if (name === "requestBody") bodyParam = p;
  }

  const top: any = {
    type: "object",
    properties: {},
    additionalProperties: false,
  };

  if (paramsParam) {
    const typeNode = paramsParam.getTypeNode();
    let paramsSchema: any;
    if (typeNode && typeNode.getKind() === SyntaxKind.TypeLiteral) {
      paramsSchema = typeLiteralToJsonSchema(typeNode as TypeLiteralNode);
    } else {
      paramsSchema = typeNodeToJsonSchema(typeNode);
    }
    top.properties.params = paramsSchema;
    if (paramsSchema.required && paramsSchema.required.length > 0) {
      top.required = ["params"];
    }
  }

  if (bodyParam) {
    top.properties.requestBody = {
      description: "Request body payload (any object).",
    };
    top.required = Array.from(new Set([...(top.required ?? []), "requestBody"]));
  }

  return { schema: top, hasRequestBody: !!bodyParam };
}

// Generate a stable tool name. Max 64 chars (MCP recommendation).
function toolName(serviceProperty: string, methodName: string): string {
  // Snake-case-ish: serviceProperty + "_" + methodName, lower the first char of method
  const n = `${serviceProperty}_${methodName}`;
  return n.slice(0, 64);
}

function processServiceFile(filePath: string, classToProp: Map<string, string>): ToolSpec[] {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const src = project.addSourceFileAtPath(filePath);
  const classes = src.getClasses().filter(c => c.isExported());
  const tools: ToolSpec[] = [];
  for (const cls of classes) {
    const className = cls.getName();
    if (!className) continue;
    const serviceProp = classToProp.get(className);
    if (!serviceProp) continue; // not registered on HighLevel — skip
    for (const method of cls.getMethods()) {
      if (!method.hasModifier(SyntaxKind.PublicKeyword) && method.hasModifier(SyntaxKind.PrivateKeyword)) continue;
      // Skip non-async or methods without standard (params, body?) shape
      if (!method.isAsync()) continue;
      const methodName = method.getName();
      if (methodName.startsWith("_")) continue;
      const { schema, hasRequestBody } = buildInputSchema(method);
      const rawDesc = getLeadingJSDoc(method);
      const description = decodeHtmlEntities(rawDesc).slice(0, 1024);
      tools.push({
        name: toolName(serviceProp, methodName),
        description: description || `${className}.${methodName}`,
        serviceProperty: serviceProp,
        methodName,
        hasRequestBody,
        inputSchema: schema,
      });
    }
  }
  return tools;
}

function emit(tools: ToolSpec[]): string {
  const header = `// AUTO-GENERATED by src/codegen/generate.ts — do not edit by hand.
// Re-generate with: npm run generate

export interface GeneratedTool {
  name: string;
  description: string;
  serviceProperty: string;
  methodName: string;
  hasRequestBody: boolean;
  inputSchema: object;
}

export const generatedTools: GeneratedTool[] = ${JSON.stringify(tools, null, 2)};
`;
  return header;
}

function main() {
  console.error(`[codegen] reading SDK from ${SDK_CODE_DIR}`);
  const classToProp = buildClassToPropertyMap();
  console.error(`[codegen] mapped ${classToProp.size} services from HighLevel.ts`);
  const files = listServiceFiles();
  console.error(`[codegen] found ${files.length} service files`);
  const all: ToolSpec[] = [];
  for (const f of files) {
    const tools = processServiceFile(f, classToProp);
    console.error(`[codegen]   ${f.split("/").slice(-2).join("/")} -> ${tools.length} tools`);
    all.push(...tools);
  }
  // Deduplicate by name (shouldn't happen, but be safe)
  const seen = new Set<string>();
  const unique = all.filter(t => {
    if (seen.has(t.name)) return false;
    seen.add(t.name);
    return true;
  });
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, emit(unique), "utf8");
  console.error(`[codegen] wrote ${unique.length} tools -> ${OUT_PATH}`);
}

main();
