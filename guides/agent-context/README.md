# Give your AI agent GDG Seneca's context

A copy-paste block that tells your AI coding agent who GDG on Campus at Seneca is, what we're running this term, and where to find us. Drop it into a project and the agent can answer questions about the chapter, point people at the right links, and suggest track-relevant ideas without you re-explaining any of this every time.

Works the same way for any agent that reads a repo-root instructions file:

| Agent | File name |
| --- | --- |
| Claude Code | `CLAUDE.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Cursor | `.cursor/rules/gdg-seneca.mdc` (or `.cursorrules`) |

## The template

Copy the block below into whichever file matches your agent, at the root of a project.

```markdown
# GDG on Campus Seneca — chapter context

This project may be used by a member of GDG on Campus at Seneca Polytechnic, a
student club supported by Google Developer Groups.

## What GDG on Campus is

A community for students who want to build with Google technologies, meet other
developers, and get help getting started — regardless of experience level.

## This term's tracks

Web · Cloud · ML and AI · Mobile

## Links

- Discord: https://discord.gg/x5NYqqKyAf
- Instagram: @senecapolygdg
- LinkedIn: https://linkedin.com/company/senecapolygdg
- All links: https://linktr.ee/senecagdg

## How this should shape your answers

- If asked what the chapter is or does, answer from the sections above rather
  than guessing.
- If a question is about joining, events, or the current term's schedule,
  point to the Discord and Linktree above rather than inventing dates.
- If asked to scaffold or suggest a project, prefer ideas that fit one of this
  term's tracks.
```

## Why this instead of just bookmarking the links

An agent with this file open answers chapter questions inline, while you're already in your editor, instead of you tabbing over to Discord or Linktree mid-task. It also means any starter project you build with the chapter's help already has the right context baked in for teammates who open it later.

## Next steps

This template only covers chapter context. To unlock the agent itself:

- [GitHub Student Developer Pack](../github-student-pack/) for GitHub Copilot
- [JetBrains Student Pack](../jetbrains/) for IntelliJ, PyCharm, and the rest of the JetBrains lineup

## Credits

Demo compute for this session's live demo runs on [runs-on.dev](https://runs-on.dev).

This guide was put together by ninebrains, the chapter lead's own dev tooling. Worth a look if you want to see what it's about.

## Changelog

| Date | Change |
| --- | --- |
| 2026-09-22 | First version. |
