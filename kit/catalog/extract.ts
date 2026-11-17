/**
 * Reads a kit's exports with the TypeScript compiler API: nothing is retyped by hand, the doc
 * comments in the kit are the reference.
 *
 * A type is shown as written in the source, so one from a package that is not installed still
 * reads right.
 */
import ts from "typescript";

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

const options: ts.CompilerOptions = {
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  allowImportingTsExtensions: true,
  skipLibCheck: true,
  jsx: ts.JsxEmit.ReactJSX,
  types: [],
};

export function extractKit(file: string): KitApi {
  const program = ts.createProgram([file], options);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  if (!source) throw new Error(`catalog: cannot read ${file}`);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) return { file, exports: [], types: [] };

  const docOf = (symbol: ts.Symbol | undefined) =>
    symbol ? flat(ts.displayPartsToString(symbol.getDocumentationComment(checker))) : "";
  const tagText = (node: ts.Node, ...names: string[]) => {
    const tag = ts.getJSDocTags(node).find((t) => names.includes(t.tagName.text));
    return tag ? flat(ts.getTextOfJSDocComment(tag.comment) ?? "") || undefined : undefined;
  };

  const typeText = (decl: ts.Node, symbol?: ts.Symbol) => {
    const annotated = (decl as { type?: ts.TypeNode }).type;
    if (annotated) return flat(annotated.getText());
    return symbol ? checker.typeToString(checker.getTypeOfSymbolAtLocation(symbol, decl)) : "";
  };

  const paramRows = (fn: ts.SignatureDeclarationBase): Row[] =>
    fn.parameters.map((p) => {
      const name = ts.isIdentifier(p.name) ? p.name.text : "props";
      const tag = ts.getJSDocParameterTags(p)[0];
      return {
        name,
        type: p.type ? flat(p.type.getText()) : "",
        optional: !!p.questionToken || !!p.initializer,
        default: p.initializer ? flat(p.initializer.getText()) : undefined,
        doc: tag ? flat(ts.getTextOfJSDocComment(tag.comment) ?? "") : "",
      };
    });

  const head = (fn: ts.SignatureDeclaration, name: string) => {
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
      const isPrivate =
        ts.canHaveModifiers(m) &&
        ts
          .getModifiers(m)
          ?.some(
            (k) =>
              k.kind === ts.SyntaxKind.PrivateKeyword || k.kind === ts.SyntaxKind.ProtectedKeyword,
          );
      if (isPrivate || !m.name || ts.isPrivateIdentifier(m.name)) continue;
      const symbol = checker.getSymbolAtLocation(m.name);
      const name = m.name.getText();
      const doc = docOf(symbol);
      if (ts.isMethodDeclaration(m)) {
        const params = m.parameters.map((p) => flat(p.getText())).join(", ");
        rows.push({ name: `${name}()`, type: `(${params})`, optional: false, doc });
      } else if (ts.isGetAccessor(m)) {
        rows.push({ name, type: typeText(m, symbol) || "", optional: false, doc });
      } else if (ts.isPropertyDeclaration(m)) {
        rows.push({
          name,
          type: typeText(m, symbol),
          optional: !!m.questionToken,
          default: m.initializer ? flat(m.initializer.getText()) : undefined,
          doc,
        });
      }
    }
    return rows;
  };

  // A key union (`keyof typeof tokens.role`) is a string, whose properties are String's own.
  const propRows = (declared: ts.Type): Row[] =>
    declared.getProperties().flatMap((p) => {
      const decl = p.declarations?.[0];
      if (!decl || !(ts.isPropertySignature(decl) || ts.isMethodSignature(decl))) return [];
      if (program.isSourceFileDefaultLibrary(decl.getSourceFile())) return [];
      return [
        {
          name: p.name,
          type: ts.isMethodSignature(decl)
            ? `(${decl.parameters.map((q) => flat(q.getText())).join(", ")})${decl.type ? `: ${flat(decl.type.getText())}` : ""}`
            : typeText(decl, p),
          optional: !!decl.questionToken,
          default: tagText(decl, "default", "defaultValue"),
          doc: docOf(p),
        },
      ];
    });

  const exports: ExportApi[] = [];
  const types: TypeApi[] = [];
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const decl = symbol.declarations?.[0];
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
          const tag = ts.getJSDocParameterTags(fn!.parameters[i]!)[0];
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
