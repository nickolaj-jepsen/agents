/**
 * Reads a kit's exports with TypeScript's API: nothing is retyped by hand, the doc comments in the
 * kit are the reference.
 *
 * A type is shown as written in the source, so one from a package that is not installed still
 * reads right.
 *
 * The API is `typescript/sync`, which drives a `tsgo` process, so it needs TypeScript 7.1 or later:
 * 7.0 has no JavaScript API. The calls are synchronous. Each `extractKit` starts a process of its
 * own and closes it before returning.
 */
import * as ts from "typescript/ast";
import {
  API,
  type Checker,
  JsxEmit,
  ModuleKind,
  ModuleResolutionKind,
  type Symbol as TsSymbol,
  SymbolFlags,
} from "typescript/sync";

export type Row = { name: string; type: string; optional: boolean; default?: string; doc: string };

export type ExportApi = {
  name: string;
  kind: "function" | "class" | "const" | "type";
  signature: string;
  doc: string;
  /** A function's parameters, or a class constructor's. */
  params: Row[];
  /** A class's public members. */
  members: Row[];
};

export type TypeApi = {
  name: string;
  /** The declaration as written, without its body. */
  signature: string;
  doc: string;
  /** Empty when the type is not an object (a union of strings, say). */
  rows: Row[];
};

export type KitApi = {
  file: string;
  exports: ExportApi[];
  types: TypeApi[];
};

const flat = (s: string) => s.replace(/\s+/g, " ").trim();

const options = {
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ModuleKind.NodeNext,
  moduleResolution: ModuleResolutionKind.NodeNext,
  allowImportingTsExtensions: true,
  skipLibCheck: true,
  jsx: JsxEmit.ReactJSX,
  types: [],
};

/** The `@param` tag of a parameter: by name, or by position for a destructured one. */
const paramTagOf = (p: ts.ParameterDeclaration): ts.JSDocParameterTag | undefined => {
  const tags = ts.getJSDocTags(p.parent).filter(ts.isJSDocParameterTag);
  if (ts.isIdentifier(p.name)) {
    const name = p.name.text;
    return tags.find((t) => ts.isIdentifier(t.name) && t.name.text === name);
  }
  return tags[(p.parent as ts.FunctionLikeBase).parameters.indexOf(p)];
};

/** `name?: T`. The new AST keeps `?` and `!` in one `postfixToken`. */
const isOptional = (m: ts.NamedMemberBase) => m.postfixToken?.kind === ts.SyntaxKind.QuestionToken;

export function extractKit(file: string): KitApi {
  const api = new API();
  try {
    return extractWith(api, file);
  } finally {
    api.close();
  }
}

function extractWith(api: API, file: string): KitApi {
  const program = api.createProgram([file], options);
  const checker = program.getProject().checker;
  const source = program.getSourceFile(file);
  if (!source) throw new Error(`catalog: cannot read ${file}`);
  const moduleSymbol = checker.getSymbolOfSourceFile(file);
  if (!moduleSymbol) return { file, exports: [], types: [] };

  const docOf = (symbol: TsSymbol | undefined) =>
    symbol ? flat(symbol.getDocumentationComment(checker)) : "";
  const tagText = (node: ts.Node, ...names: string[]) => {
    const tag = ts.getJSDocTags(node).find((t) => names.includes(t.tagName.text));
    return tag ? flat(ts.getTextOfJSDocComment(tag.comment) ?? "") || undefined : undefined;
  };

  const typeText = (decl: ts.Node, symbol?: TsSymbol) => {
    const annotated = (decl as { type?: ts.TypeNode }).type;
    if (annotated) return flat(annotated.getText());
    return symbol ? checker.typeToString(checker.getTypeOfSymbolAtLocation(symbol, decl)) : "";
  };

  const paramRows = (fn: ts.FunctionLikeBase): Row[] =>
    fn.parameters.map((p) => {
      const name = ts.isIdentifier(p.name) ? p.name.text : "props";
      const tag = paramTagOf(p);
      return {
        name,
        type: p.type ? flat(p.type.getText()) : "",
        optional: !!p.questionToken || !!p.initializer,
        default: p.initializer ? flat(p.initializer.getText()) : undefined,
        doc: tag ? flat(ts.getTextOfJSDocComment(tag.comment) ?? "") : "",
      };
    });

  const head = (fn: ts.FunctionLikeBase, name: string) => {
    const params = fn.parameters.map((p) => flat(p.getText())).join(", ");
    const generics = fn.typeParameters
      ? `<${fn.typeParameters.map((t) => t.getText()).join(", ")}>`
      : "";
    let ret = fn.type ? flat(fn.type.getText()) : "";
    if (!ret) {
      const sig = checker.getSignatureFromDeclaration(fn);
      ret = sig ? checker.typeToString(sig.getReturnType()) : "";
    }
    return `${name}${generics}(${params})${ret ? `: ${ret}` : ""}`;
  };

  const memberRows = (cls: ts.ClassDeclaration): Row[] => {
    const rows: Row[] = [];
    for (const m of cls.members) {
      if (
        !(
          ts.isMethodDeclaration(m) ||
          ts.isGetAccessorDeclaration(m) ||
          ts.isPropertyDeclaration(m)
        )
      )
        continue;
      const isPrivate =
        (m.modifierFlags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) !== 0;
      if (isPrivate || ts.isPrivateIdentifier(m.name)) continue;
      const symbol = checker.getSymbolAtLocation(m.name);
      const name = m.name.getText();
      const doc = docOf(symbol);
      if (ts.isMethodDeclaration(m)) {
        const params = m.parameters.map((p) => flat(p.getText())).join(", ");
        rows.push({ name: `${name}()`, type: `(${params})`, optional: false, doc });
      } else if (ts.isGetAccessorDeclaration(m)) {
        rows.push({ name, type: typeText(m, symbol) || "", optional: false, doc });
      } else {
        rows.push({
          name,
          type: typeText(m, symbol),
          optional: isOptional(m),
          default: m.initializer ? flat(m.initializer.getText()) : undefined,
          doc,
        });
      }
    }
    return rows;
  };

  // A key union (`keyof typeof tokens.role`) is a string, whose properties are String's own.
  const propRows = (declared: ReturnType<Checker["getDeclaredTypeOfSymbol"]>): Row[] =>
    declared.getProperties().flatMap((p) => {
      const decl = p.declarations[0]?.resolve();
      if (
        !decl ||
        !(ts.isPropertySignatureDeclaration(decl) || ts.isMethodSignatureDeclaration(decl))
      )
        return [];
      if (program.isSourceFileDefaultLibrary(decl.getSourceFile())) return [];
      return [
        {
          name: p.name,
          type: ts.isMethodSignatureDeclaration(decl)
            ? `(${decl.parameters.map((q) => flat(q.getText())).join(", ")})${decl.type ? `: ${flat(decl.type.getText())}` : ""}`
            : typeText(decl, p),
          optional: isOptional(decl),
          default: tagText(decl, "default", "defaultValue"),
          doc: docOf(p),
        },
      ];
    });

  const exports: ExportApi[] = [];
  const types: TypeApi[] = [];
  // Functions first, then the rest in source order, as the docs and the site have always listed
  // them. `tsgo` lists a module in source order alone.
  const isFunction = (e: TsSymbol) => e.declarations[0]?.kind === ts.SyntaxKind.FunctionDeclaration;
  const all = checker.getExportsOfModule(moduleSymbol);
  for (const exported of [...all.filter(isFunction), ...all.filter((e) => !isFunction(e))]) {
    const symbol =
      exported.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const decl = symbol.declarations[0]?.resolve();
    if (!decl) continue;
    const name = exported.name;
    const doc = docOf(symbol);
    if (ts.isFunctionDeclaration(decl)) {
      exports.push({
        name,
        kind: "function",
        signature: head(decl, name),
        doc,
        params: paramRows(decl),
        members: [],
      });
    } else if (ts.isVariableDeclaration(decl)) {
      const fn =
        decl.initializer &&
        (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
          ? decl.initializer
          : undefined;
      // A JSDoc on `export const f = (x) =>` hangs on the statement, not the arrow.
      const stmt = decl.parent.parent;
      const paramDoc = (rows: Row[]) =>
        rows.map((r, i) => {
          const tag = paramTagOf(fn!.parameters[i]!);
          if (tag || r.doc) return r;
          const own = ts
            .getJSDocTags(stmt)
            .find((t) => ts.isJSDocParameterTag(t) && t.name.getText() === r.name);
          return { ...r, doc: own ? flat(ts.getTextOfJSDocComment(own.comment) ?? "") : "" };
        });
      exports.push({
        name,
        kind: fn ? "function" : "const",
        signature: fn ? head(fn, name) : `const ${name}`,
        doc,
        params: fn ? paramDoc(paramRows(fn)) : [],
        members: [],
      });
    } else if (ts.isClassDeclaration(decl)) {
      const ctor = decl.members.find(ts.isConstructorDeclaration);
      exports.push({
        name,
        kind: "class",
        signature: `class ${name}${decl.typeParameters ? `<${decl.typeParameters.map((t) => t.getText()).join(", ")}>` : ""}${ctor ? ` { ${head(ctor, "constructor")} }` : ""}`,
        doc,
        params: ctor ? paramRows(ctor) : [],
        members: memberRows(decl),
      });
    } else if (ts.isTypeAliasDeclaration(decl) || ts.isInterfaceDeclaration(decl)) {
      const declared = checker.getDeclaredTypeOfSymbol(symbol);
      const generics = decl.typeParameters
        ? `<${decl.typeParameters.map((t) => t.getText()).join(", ")}>`
        : "";
      types.push({
        name,
        signature: ts.isTypeAliasDeclaration(decl)
          ? ts.isTypeLiteralNode(decl.type)
            ? `type ${name}${generics}`
            : `type ${name}${generics} = ${flat(decl.type.getText())}`
          : `interface ${name}${generics}`,
        doc,
        rows: propRows(declared),
      });
    }
  }
  return { file, exports, types };
}

/** Types whose names appear in the texts, closed over the types' own rows, in first-seen order. */
export function referencedTypes(api: KitApi, picked: ExportApi[]): TypeApi[] {
  const byName = new Map(api.types.map((t) => [t.name, t]));
  const seen: TypeApi[] = [];
  const scan = (text: string) => {
    for (const word of text.match(/[A-Za-z_]\w*/g) ?? []) {
      const t = byName.get(word);
      if (t && !seen.includes(t)) {
        seen.push(t);
        scan(t.signature);
        t.rows.forEach((r) => scan(r.type));
      }
    }
  };
  for (const e of picked) {
    scan(e.signature);
    e.params.forEach((p) => scan(p.type));
    e.members.forEach((m) => scan(m.type));
  }
  return seen;
}
