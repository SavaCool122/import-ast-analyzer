import fs from "fs";
import path from "node:path";
import * as VueParser from "@vue/compiler-dom";
import { parse as parseJs } from "acorn";

const ROOT = "../../../";
const PROJECTS_PATH = {
  FOO: ROOT + "/bar-frontend",
};

const byType = (type) => (e) => e.type === type;

const KIT_ALIAS_MAP = {};

const isKitImport = (e) => {
  const importPath = e.source.value;
  return Object.keys(KIT_ALIAS_MAP).some((key) => importPath.includes(key));
};

const findRelevantFiles = (projectPath) => {
  const vueFiles = new Set();
  const jsFiles = new Set();
  const pendingPath = [path.resolve(projectPath, "src")];

  while (pendingPath.length > 0) {
    const currentPath = pendingPath.shift();
    fs.readdirSync(currentPath, { withFileTypes: true }).forEach((entry) => {
      if (entry.isFile() && entry.name.endsWith(".vue")) {
        vueFiles.add(path.resolve(currentPath, entry.name));
      }
      if (entry.isFile() && entry.name.endsWith(".js")) {
        jsFiles.add(path.resolve(currentPath, entry.name));
      } else if (entry.isDirectory()) {
        pendingPath.push(path.resolve(currentPath, entry.name));
      }
    });
  }

  return [Array.from(vueFiles), Array.from(jsFiles)];
};

const getDynamicImportsFromObject = (ast) => {
  const exportedObject = ast.body.find(byType("ExportDefaultDeclaration"));
  if (!exportedObject || exportedObject.declaration.type !== "ObjectExpression")
    return [];
  const propertyComponents = exportedObject.declaration.properties.find(
    (p) => p.key.name === "components"
  );
  if (!propertyComponents) return [];

  return propertyComponents.value.properties
    .filter((p) => p.value.type === "ArrowFunctionExpression")
    .flatMap((p) => p.value.body)
    .filter(isKitImport)
    .map((i) => i.source.value.split("/").at(-1));
};

const parseVueFiles = (files) => {
  return Array.from(
    new Set(
      files.flatMap((file) => {
        const scriptContent = VueParser.parse(
          fs.readFileSync(file, { encoding: "utf-8" })
        ).children.find(({ tag }) => tag === "script")?.children[0].content;
        const ast = parseJs(scriptContent, {
          sourceType: "module",
          ecmaVersion: 2020,
        });

        const specifiersFromDynamicImports = getDynamicImportsFromObject(ast);
        const specifiersFromClassicImports = ast.body
          .filter(byType("ImportDeclaration"))
          .filter(byType("ImportDeclaration"))
          .filter(isKitImport)
          .flatMap((decl) => decl.specifiers.map((s) => s.local.name));

        return [
          ...specifiersFromDynamicImports,
          ...specifiersFromClassicImports,
        ];
      })
    )
  );
};

const parseJSFiles = (files) => {
  return Array.from(
    new Set(
      files.flatMap((file) => {
        const ast = parseJs(fs.readFileSync(file, { encoding: "utf-8" }), {
          sourceType: "module",
          ecmaVersion: 2020,
        });

        const specifiersFromDynamicImportsFromObject =
          getDynamicImportsFromObject(ast);
        const specifiersFromClassicImports = ast.body
          .filter(byType("ImportDeclaration"))
          .filter(isKitImport)
          .flatMap((decl) => decl.specifiers.map((s) => s.local.name));

        return [
          ...specifiersFromClassicImports,
          ...specifiersFromDynamicImportsFromObject,
        ];
      })
    )
  );
};

const showData = (data) => {
  for (const project in PROJECTS_PATH) {
    console.log(`${project} kit-${data[project].kitFiles.length}`);
    console.log(
      `js-${data[project].jsFilesCount} vue-${data[project].vueFilesCount}`
    );
    console.log(data[project].kitFiles);
  }
};

export const calculateAllKitUses = () => {
  const data = {};

  Object.keys(PROJECTS_PATH).forEach((key) => {
    const [vueFiles, jsFiles] = findRelevantFiles(PROJECTS_PATH[key]);
    const kitInVueFiles = parseVueFiles(vueFiles);
    const kitInJSFiles = parseJSFiles(jsFiles);
    const kitFiles = [...kitInVueFiles, ...kitInJSFiles];
    data[key] = {
      kitFiles: kitFiles,
      vueFilesCount: vueFiles.length,
      jsFilesCount: jsFiles.length,
    };
  });

  showData(data);
};

calculateAllKitUses();
