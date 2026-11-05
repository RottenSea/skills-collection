# skills-collection

A collection of reusable skills for AI agents.

The skills here are ones I use often or now and then. Each comes from an upstream repository, added as a git submodule under `vendor/` and pinned to a commit. A script copies the skills into a project's `.agents/skills/` directory.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Skills](#skills)
- [Updating the skills](#updating-the-skills)
- [Contributing](#contributing)
- [License](#license)

## Install

You need Git and Node.js 22 or later. The script has no other dependencies.

```bash
git clone --recurse-submodules https://github.com/RottenSea/skills-collection.git
```

The submodules are shallow, so only their pinned commits are fetched. If you clone without `--recurse-submodules`, the script fetches the submodules it needs the first time it runs.

## Usage

Run the script from the project you want the skills in:

```bash
node path/to/skills-collection/scripts/install-skills.mjs
```

This copies every skill in the `common` group into `.agents/skills/` and adds `/.agents/skills/` to the project's `.gitignore`. Each machine generates its own copy, and nothing from the skills is committed to the project.

The script empties `.agents/skills/` before copying, so a skill you installed by hand in that directory is removed. Run the script again after you update the submodules here.

### CLI

```text
node scripts/install-skills.mjs [target] [options]

  target               Project directory. Default: the current directory.
  -g, --group <name>   Install every skill in a group. Repeatable. Default: common
  -s, --skill <name>   Install one skill. Repeatable. Combines with --group.
  -a, --all            Install every skill.
  -l, --list           List the skills and their groups, then exit.
  -h, --help           Show the help.
```

For example, to add only `eli5` and `grill-me` to `../my-app`:

```bash
node scripts/install-skills.mjs ../my-app --skill eli5 --skill grill-me
```

A skill listed under `requires` in `skills.json` is installed along with the skill that needs it, so `grill-me` brings `grilling`.

## Skills

`skills.json` lists every skill, its group, the submodule it comes from and the directory inside that submodule. To add a skill, add its upstream with `git submodule add` under `vendor/`, then add an entry to `skills.json`. The entry's name must match the `name` in the skill's `SKILL.md`.

| Skill | Group | Upstream | What it does |
| --- | --- | --- | --- |
| `humanizer` | common | [blader/humanizer](https://github.com/blader/humanizer) | Rewrites AI-sounding prose so it reads like the writer. |
| `docx`, `pdf`, `pptx`, `xlsx` | common | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills) | Read, create and edit Word, PDF, PowerPoint and Excel files. |
| `eli5` | common | [DreambigOu/ELI5](https://github.com/DreambigOu/ELI5) | Explains a topic at the level of a given audience. |
| `stop-that-shit` | common | [lennney/stop-that-shit](https://github.com/lennney/stop-that-shit) | Keeps the agent from speculative hardening and scope creep. |
| `grilling` | common | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling) | Interviews you about a plan until every decision is settled. |
| `grill-me` | common | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me) | Starts `grilling` when you type `/grill-me`. |

## Updating the skills

```bash
git submodule update --remote
```

This moves every submodule to the latest commit on the branch set in `.gitmodules`. Review what changed, run `npm test`, then commit the new pointers.

## Contributing

This is a personal collection, so I don't take requests for new skills. Bug reports about the script are welcome in the issues. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).

## License

The script and the files at the top level of this repository are under the [MIT License](LICENSE).

The skills are not part of this repository. Each directory under `vendor/` is a submodule that records only the upstream URL and a commit, and its files come from the upstream when you fetch it. Each skill keeps its upstream's license: `humanizer`, `eli5`, `stop-that-shit`, `grilling` and `grill-me` are under the MIT License. `docx`, `pdf`, `pptx` and `xlsx` belong to Anthropic, and their use is governed by the `LICENSE.txt` in each skill's directory and Anthropic's terms of service. The script copies each skill's license file with it.
