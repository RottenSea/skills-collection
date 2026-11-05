import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { install, loadManifest, ROOT, selectSkills, withGitignoreEntry } from "../scripts/install-skills.mjs";

const temp = mkdtempSync(join(tmpdir(), "install-skills-"));
after(() => rmSync(temp, { recursive: true, force: true }));

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

const skillMd = (name) => `---\nname: ${name}\ndescription: Test skill.\n---\n\nBody.\n`;

const manifest = {
  groups: { common: "", occasional: "" },
  skills: {
    root: { group: "common", source: "vendor/a", path: ".", exclude: ["README.md", "scripts"] },
    nested: { group: "occasional", source: "vendor/b", path: "skills/nested" },
    wrapper: { group: "occasional", source: "vendor/b", path: "skills/wrapper", requires: ["nested"] },
  },
};

describe("selectSkills", () => {
  test("installs the common group by default", () => {
    assert.deepEqual(selectSkills(manifest), ["root"]);
  });

  test("adds required skills and keeps manifest order", () => {
    assert.deepEqual(selectSkills(manifest, { skills: ["wrapper"] }), ["nested", "wrapper"]);
  });

  test("combines groups and single skills", () => {
    assert.deepEqual(selectSkills(manifest, { groups: ["common"], skills: ["nested"] }), ["root", "nested"]);
  });

  test("installs everything with all", () => {
    assert.deepEqual(selectSkills(manifest, { all: true }), ["root", "nested", "wrapper"]);
  });

  test("rejects unknown names", () => {
    assert.throws(() => selectSkills(manifest, { skills: ["missing"] }), /Unknown skill/);
    assert.throws(() => selectSkills(manifest, { groups: ["missing"] }), /Unknown group/);
  });
});

describe("withGitignoreEntry", () => {
  test("appends the entry on a new line", () => {
    assert.equal(withGitignoreEntry(""), "/.agents/skills/\n");
    assert.equal(withGitignoreEntry("dist/"), "dist/\n/.agents/skills/\n");
    assert.equal(withGitignoreEntry("dist/\n"), "dist/\n/.agents/skills/\n");
  });

  test("leaves a file that already ignores the directory", () => {
    assert.equal(withGitignoreEntry("node_modules/\r\n.agents/skills\r\n"), null);
    assert.equal(withGitignoreEntry("/.agents/\n"), null);
  });
});

describe("install", () => {
  const root = join(temp, "collection");
  write(join(root, "vendor/a/SKILL.md"), skillMd("root"));
  write(join(root, "vendor/a/LICENSE"), "MIT");
  write(join(root, "vendor/a/README.md"), "readme");
  write(join(root, "vendor/a/scripts/dev.py"), "");
  write(join(root, "vendor/a/references/notes.md"), "notes");
  write(join(root, "vendor/a/.git"), "gitdir: elsewhere");
  write(join(root, "vendor/b/LICENSE.md"), "MIT");
  write(join(root, "vendor/b/skills/nested/SKILL.md"), skillMd("nested"));
  write(join(root, "vendor/b/skills/wrapper/SKILL.md"), skillMd("wrapper"));
  write(join(root, "vendor/b/skills/wrong/SKILL.md"), skillMd("other-name"));

  test("copies skills, applies excludes and adds the license", () => {
    const target = join(temp, "project");
    write(join(target, ".gitignore"), "dist/\n");
    install({ root, manifest, target, names: ["root", "nested"] });
    const dest = join(target, ".agents/skills");
    assert.ok(existsSync(join(dest, "root/SKILL.md")));
    assert.ok(existsSync(join(dest, "root/references/notes.md")));
    assert.ok(existsSync(join(dest, "root/LICENSE")));
    assert.ok(!existsSync(join(dest, "root/README.md")));
    assert.ok(!existsSync(join(dest, "root/scripts")));
    assert.ok(!existsSync(join(dest, "root/.git")));
    assert.equal(readFileSync(join(dest, "nested/LICENSE.md"), "utf8"), "MIT");
    assert.equal(readFileSync(join(target, ".gitignore"), "utf8"), "dist/\n/.agents/skills/\n");
  });

  test("empties the directory before installing", () => {
    const target = join(temp, "rerun");
    write(join(target, ".agents/skills/stale/SKILL.md"), skillMd("stale"));
    write(join(target, ".agents/other.txt"), "kept");
    install({ root, manifest, target, names: ["nested"] });
    assert.ok(!existsSync(join(target, ".agents/skills/stale")));
    assert.ok(existsSync(join(target, ".agents/skills/nested/SKILL.md")));
    assert.ok(existsSync(join(target, ".agents/other.txt")));
  });

  test("leaves the target alone when a skill's name does not match", () => {
    const target = join(temp, "mismatch");
    write(join(target, ".agents/skills/existing/SKILL.md"), skillMd("existing"));
    const bad = { ...manifest, skills: { ...manifest.skills, wrong: { group: "common", source: "vendor/b", path: "skills/wrong" } } };
    assert.throws(() => install({ root, manifest: bad, target, names: ["nested", "wrong"] }), /named "other-name"/);
    assert.ok(existsSync(join(target, ".agents/skills/existing/SKILL.md")));
  });

  test("installs into the collection itself", () => {
    install({ root, manifest, target: root, names: ["nested"] });
    assert.ok(existsSync(join(root, ".agents/skills/nested/SKILL.md")));
  });
});

test("skills.json is valid", () => {
  const real = loadManifest(ROOT);
  assert.ok(selectSkills(real).length > 0);
});
