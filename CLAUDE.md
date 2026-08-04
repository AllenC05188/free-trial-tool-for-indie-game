# CLAUDE.md

## Agent skills

This repo develops using the [mattpocock/skills](https://github.com/mattpocock/skills) engineering flow (installed as the `mattpocock-skills` Claude Code plugin). See `/ask-matt` for the full map of skills, or start with `/grill-with-docs` for new feature ideas and `/diagnosing-bugs` for bugs.

### Issue tracker

Issues and specs are tracked as local markdown files under `.scratch/<feature>/` (no GitHub/GitLab remote — solo, local project). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
