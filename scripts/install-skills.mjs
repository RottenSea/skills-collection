#!/usr/bin/env node
// Copies skills from this repository's submodules into a project's .agents/skills/ directory.
// Run `node scripts/install-skills.mjs --help` for the options.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEST = join(".agents", "skills");
const GITIGNORE_ENTRY = "/.agents/skills/";
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const HELP = `Usage: node scripts/install-skills.mjs [target] [options]

Copies skills into <target>/.agents/skills/. The target defaults to the current
directory. The directory is emptied first, then filled with the selected skills.
"/.agents/skills/" is added to the target's .gitignore.

Options:
  -g, --group <name>   Install every skill in a group. Repeatable. Default: common
  -s, --skill <name>   Install one skill. Repeatable. Combines with --group.
  -a, --all            Install every skill.
  -l, --list           List the skills and their groups, then exit.
  -h, --help           Show this help.`;

export function loadManifest(root = ROOT) {
  const manifest = JSON.parse(readFileSync(join(root, "skills.json"), "utf8"));
  for (const [name, skill] of Object.entries(manifest.skills)) {
    if (!NAME_PATTERN.test(name)) throw new Error(`Skill name "${name}" is not lowercase words joined by hyphens.`);
    if (!(skill.group in manifest.groups)) throw new Error(`Skill "${name}" is in unknown group "${skill.group}".`);
    for (const dep of skill.requires ?? []) {
      if (!(dep in manifest.skills)) throw new Error(`Skill "${name}" requires unknown skill "${dep}".`);
    }
  }
  return manifest;
}

/** Returns the names to install, in manifest order, with required skills added. */
export function selectSkills(manifest, { all = false, groups = [], skills = [] } = {}) {
  for (const group of groups) {
    if (!(group in manifest.groups)) throw new Error(`Unknown group "${group}". Groups: ${Object.keys(manifest.groups).join(", ")}.`);
  }
  for (const name of skills) {
    if (!(name in manifest.skills)) throw new Error(`Unknown skill "${name}". Run with --list to see the skills.`);
  }
  const wantedGroups = all || groups.length > 0 || skills.length > 0 ? groups : ["common"];
  const selected = new Set();
  const add = (name) => {
    if (selected.has(name)) return;
    selected.add(name);
    for (const dep of manifest.skills[name].requires ?? []) add(dep);
  };
  for (const [name, skill] of Object.entries(manifest.skills)) {
    if (all || wantedGroups.includes(skill.group)) add(name);
  }
  for (const name of skills) add(name);
  return Object.keys(manifest.skills).filter((name) => selected.has(name));
}

/** Returns the .gitignore text with the skills directory ignored, or null when it already is. */
export function withGitignoreEntry(text) {
  const covered = new Set([".agents", ".agents/", "/.agents", "/.agents/"]);
  for (const entry of [".agents/skills", "/.agents/skills"]) covered.add(entry).add(`${entry}/`);
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  if (lines.some((line) => covered.has(line))) return null;
  const prefix = text === "" || text.endsWith("\n") ? text : `${text}\n`;
  return `${prefix}${GITIGNORE_ENTRY}\n`;
}

function skillName(skillMd) {
  const frontMatter = readFileSync(skillMd, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return frontMatter?.[1].match(/^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m)?.[1];
}

function ensureSubmodule(root, source) {
  const dir = join(root, source);
  if (existsSync(dir) && readdirSync(dir).length > 0) return;
  console.log(`Fetching ${source}...`);
  execFileSync("git", ["-C", root, "submodule", "update", "--init", "--depth", "1", "--", source], { stdio: "inherit" });
}

/** Copies the named skills into <target>/.agents/skills/ and ignores that directory in git. */
export function install({ root = ROOT, manifest = loadManifest(root), target, names }) {
  const targetDir = resolve(target);
  if (!existsSync(targetDir)) throw new Error(`Target ${targetDir} does not exist.`);

  // Check every source before touching the target, so a failure leaves it as it was.
  const plan = names.map((name) => {
    const skill = manifest.skills[name];
    ensureSubmodule(root, skill.source);
    const from = join(root, skill.source, skill.path ?? ".");
    const skillMd = join(from, "SKILL.md");
    if (!existsSync(skillMd)) throw new Error(`No SKILL.md in ${relative(root, from)}.`);
    const declared = skillName(skillMd);
    if (declared !== name) throw new Error(`${relative(root, skillMd)} is named "${declared}", but skills.json calls it "${name}".`);
    return { name, from, sourceDir: join(root, skill.source), exclude: skill.exclude ?? [] };
  });

  const dest = join(targetDir, DEST);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  for (const { name, from, sourceDir, exclude } of plan) {
    const to = join(dest, name);
    cpSync(from, to, {
      recursive: true,
      filter: (path) => {
        const rel = relative(from, path).split(sep).join("/");
        if (rel === "") return true;
        if (rel.split("/").includes(".git")) return false;
        return !exclude.some((entry) => rel === entry || rel.startsWith(`${entry}/`));
      },
    });
    // Skills in a subdirectory often rely on the repository's license; copy it in next to them.
    if (!readdirSync(to).some((file) => /^licen[cs]e/i.test(file))) {
      const license = readdirSync(sourceDir).find((file) => /^licen[cs]e/i.test(file));
      if (license) cpSync(join(sourceDir, license), join(to, license));
    }
  }

  const gitignore = join(targetDir, ".gitignore");
  const updated = withGitignoreEntry(existsSync(gitignore) ? readFileSync(gitignore, "utf8") : "");
  if (updated !== null) writeFileSync(gitignore, updated);

  return { dest, gitignoreUpdated: updated !== null };
}

function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      group: { type: "string", short: "g", multiple: true, default: [] },
      skill: { type: "string", short: "s", multiple: true, default: [] },
      all: { type: "boolean", short: "a", default: false },
      list: { type: "boolean", short: "l", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) return console.log(HELP);

  const manifest = loadManifest();
  if (values.list) {
    for (const [group, description] of Object.entries(manifest.groups)) {
      const names = Object.keys(manifest.skills).filter((name) => manifest.skills[name].group === group);
      console.log(`${group}: ${description}\n  ${names.join(", ") || "(none)"}`);
    }
    return;
  }
  if (positionals.length > 1) throw new Error("Pass at most one target directory.");

  const names = selectSkills(manifest, { all: values.all, groups: values.group, skills: values.skill });
  const { dest, gitignoreUpdated } = install({ manifest, target: positionals[0] ?? process.cwd(), names });
  console.log(`Installed ${names.length} ${names.length === 1 ? "skill" : "skills"} into ${dest}:\n  ${names.join(", ")}`);
  if (gitignoreUpdated) console.log(`Added ${GITIGNORE_ENTRY} to .gitignore.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
