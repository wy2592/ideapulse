import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([".git", "node_modules", "dist", "logs", ".vite", "coverage"]);
const ignoredFiles = new Set(["package-lock.json"]);
const patterns = [
  { name: "OpenAI-style API key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "Bearer token", regex: /Bearer\s+[A-Za-z0-9._-]{20,}/g },
  { name: "private key block", regex: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g }
];

const findings = [];

await walk(root);

if (findings.length > 0) {
  console.error("Potential secrets found:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.name}`);
  }
  process.exit(1);
}

console.log("No obvious secrets found.");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) await walk(path.join(dir, entry.name));
      continue;
    }

    if (!entry.isFile() || ignoredFiles.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (path.basename(file) === ".env") continue;
    await scanFile(file);
  }
}

async function scanFile(file) {
  const relative = path.relative(root, file);
  let content;
  try {
    content = await readFile(file, "utf8");
  } catch {
    return;
  }

  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(line) && !isAllowedExample(line)) {
        findings.push({ file: relative, line: index + 1, name: pattern.name });
      }
    }
  }
}

function isAllowedExample(line) {
  return line.includes("sk-...") || line.includes("Bearer ${apiKey}");
}
