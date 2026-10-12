#!/usr/bin/env node
/**
 * rea-mcp-shim — stdio MCP proxy that makes the `rea-agents` tool catalog
 * acceptable to strict JSON-Schema validators.
 *
 * Why: `rea-agents` (>= 6.4) advertises its tool inputs with
 * `libraryOptions: { reused: "ref" }`, so a repeated sub-schema becomes
 * `{ "$ref": "#/$defs/__schemaN" }` plus a root `$defs` block. The DeepSeek
 * Messages endpoint resolves `$ref` against the *tool document* rather than the
 * schema root (or drops `$defs` outright), which fails the whole request with:
 *
 *   API Error: 400 Invalid schema for function 'mcp__rea__address_name':
 *   Pointer '/$defs/__schema2' does not exist
 *
 * What it does: rewrites every `tools/list` input schema so that all local
 * references are inlined and `$defs` disappears. Reference siblings are kept as
 * `allOf` members because in draft 2020-12 they constrain independently.
 * Everything else — tool results, notifications, initialize, and every client
 * request — is forwarded byte-for-byte.
 *
 * Usage: node rea-mcp-shim.mjs [path-to-rea.mjs]
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { isDeepStrictEqual } from "node:util";

const REA = process.argv[2] ?? "/opt/homebrew/lib/node_modules/rea-agents/scripts/rea.mjs";
const REA_ARGS = ["mcp"];
const DEFINITION_KEYS = new Set(["$defs", "definitions"]);
/** Keys whose values are literal data, never nested schemas to rewrite. */
const DATA_KEYS = new Set(["const", "enum", "examples", "default"]);
const SCHEMA_MAPS = new Set([
  "$defs",
  "definitions",
  "properties",
  "patternProperties",
  "dependentSchemas",
  "dependencies",
]);
const SCHEMA_ARRAYS = new Set(["allOf", "anyOf", "oneOf", "prefixItems"]);
const SCHEMA_CHILDREN = new Set([
  "items",
  "additionalItems",
  "contains",
  "additionalProperties",
  "unevaluatedProperties",
  "unevaluatedItems",
  "propertyNames",
  "not",
  "if",
  "then",
  "else",
]);
/** Keywords that only make sense at a document root; a bad pointer host. */
const ROOT_ONLY_KEYS = new Set(["$id", "$schema", "$anchor", "$dynamicAnchor"]);

const isSchemaObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function resolveLocalReference(root, reference) {
  if (reference === "#") return root;
  if (typeof reference !== "string" || !reference.startsWith("#/")) return undefined;
  let value = root;
  for (const token of reference.slice(2).split("/")) {
    const key = token.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isSchemaObject(value) || !Object.hasOwn(value, key)) return undefined;
    value = value[key];
  }
  return value;
}

/** Rewrite one schema-valued position, inlining local refs and dropping `$defs`. */
function rewrite(node, root, active) {
  if (Array.isArray(node)) return node.map((child) => rewrite(child, root, active));
  if (!isSchemaObject(node)) return node;
  if (typeof node.$ref === "string") {
    const target = resolveLocalReference(root, node.$ref);
    const { $ref, ...siblings } = node;
    // A cycle cannot be inlined; keep the reference and the `$defs` block.
    if (target === undefined || active.has($ref)) return node;
    const next = new Set([...active, $ref]);
    const resolved = rewrite(target, root, next);
    if (Object.keys(siblings).length === 0) return resolved;
    const kept = rewrite(siblings, root, next);
    if (!isSchemaObject(resolved) || !isSchemaObject(kept)) return resolved;
    const collapsed = collapseRedundantBranches([resolved, kept]);
    // A reference carrying siblings is only equivalent as an intersection.
    return Array.isArray(collapsed) ? { allOf: collapsed } : resolved;
  }
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (DEFINITION_KEYS.has(key)) continue;
    if (active.size === 0 && ROOT_ONLY_KEYS.has(key)) continue;
    if (DATA_KEYS.has(key)) {
      out[key] = value;
      continue;
    }
    if (SCHEMA_MAPS.has(key) && isSchemaObject(value)) {
      out[key] = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, rewrite(child, root, active)]),
      );
      continue;
    }
    if (SCHEMA_ARRAYS.has(key) && Array.isArray(value)) {
      const branches = value.map((child) => rewrite(child, root, active));
      if (key !== "allOf") {
        out[key] = branches;
        continue;
      }
      const collapsed = collapseRedundantBranches(branches);
      // `allOf` must stay an array in the emitted schema.
      out[key] = Array.isArray(collapsed) ? collapsed : [collapsed];
      continue;
    }
    if (SCHEMA_CHILDREN.has(key)) {
      out[key] = Array.isArray(value)
        ? value.map((child) => rewrite(child, root, active))
        : rewrite(value, root, active);
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Drop `allOf` branches that another branch already subsumes.
 *
 * Inlining a reference copies the target's annotation-only chain beside the
 * referencing property, so the same `description` shows up in two branches.
 * Nested `allOf` members are hoisted first — `allOf: [a, allOf: [b]]` and
 * `allOf: [a, b]` accept exactly the same instances. Then a branch is redundant
 * when its keys are a subset of another branch's and every shared key is
 * deep-equal, because the superset branch applies at least the same constraints.
 */
function collapseRedundantBranches(branches) {
  const flat = [];
  for (const branch of branches) {
    if (isSchemaObject(branch) && Object.keys(branch).length === 1 && Array.isArray(branch.allOf)) {
      flat.push(...branch.allOf);
    } else {
      flat.push(branch);
    }
  }
  const kept = flat.filter(
    (branch, index) =>
      !flat.some((other, otherIndex) => otherIndex !== index && subsumes(other, branch)),
  );
  // Distinct branches may still be exact duplicates after inlining.
  const unique = [];
  for (const branch of kept) {
    if (!unique.some((seen) => isDeepStrictEqual(seen, branch))) unique.push(branch);
  }
  if (unique.length === 1) return unique[0];
  return unique;
}

function subsumes(candidate, branch) {
  if (!isSchemaObject(candidate) || !isSchemaObject(branch)) return false;
  const candidateKeys = Object.keys(candidate);
  const branchKeys = Object.keys(branch);
  if (branchKeys.length > candidateKeys.length) return false;
  return branchKeys.every(
    (key) => Object.hasOwn(candidate, key) && isDeepStrictEqual(candidate[key], branch[key]),
  );
}

/** Collect every `$ref` still present after a rewrite (cycles we had to keep). */
function collectReferences(node, found = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectReferences(child, found);
    return found;
  }
  if (!isSchemaObject(node)) return found;
  for (const [key, value] of Object.entries(node)) {
    if (key === "$ref" && typeof value === "string") found.push(value);
    else collectReferences(value, found);
  }
  return found;
}

/** True when the rewritten schema still needs a `$defs` block for its refs. */
function needsDefinitions(schema) {
  return collectReferences(schema).some((ref) => ref.startsWith("#/"));
}

function rewriteTool(tool) {
  const input = tool?.inputSchema;
  if (!isSchemaObject(input) || !isSchemaObject(input.$defs)) return tool;
  const rewritten = rewrite(input, input, new Set());
  if (!isSchemaObject(rewritten) || needsDefinitions(rewritten)) return tool;
  return { ...tool, inputSchema: rewritten };
}

function handleMessage(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return line;
  }
  const result = message?.result;
  if (!Array.isArray(result?.tools)) return line;
  let rewritten = 0;
  const tools = result.tools.map((tool) => {
    const next = rewriteTool(tool);
    if (next !== tool) rewritten += 1;
    return next;
  });
  if (rewritten === 0) return line;
  process.stderr.write(`[rea-mcp-shim] inlined $defs for ${rewritten}/${tools.length} tools\n`);
  return JSON.stringify({ ...message, result: { ...result, tools } });
}

/** Flush buffered stdout, then leave with the child's status. */
function exitLikeChild(code, signal) {
  process.exitCode = signal === null ? code ?? 0 : 1;
  process.stdin.pause();
  // Stdout is asynchronous on a pipe; flush before the process can end.
  if (process.stdout.writableLength === 0) process.exit(process.exitCode);
  else process.stdout.end(() => process.exit(process.exitCode));
}

const child = spawn(process.execPath, [REA, ...REA_ARGS], {
  stdio: ["pipe", "pipe", "inherit"],
  env: process.env,
});
child.on("error", (error) => {
  process.stderr.write(`[rea-mcp-shim] failed to start rea: ${String(error)}\n`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.stderr.write(`[rea-mcp-shim] rea exited (code ${code}, signal ${signal})\n`);
  exitLikeChild(code, signal);
});

createInterface({ input: child.stdout }).on("line", (line) => {
  process.stdout.write(handleMessage(line) + "\n");
});

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!child.stdin.destroyed) child.stdin.write(line + "\n");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
// The client owns this process's lifetime: a closed stdin ends rea too.
process.stdin.on("close", () => child.stdin.end());
process.stdin.on("end", () => child.stdin.end());
