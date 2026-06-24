# Codex Cloud Full-Repository Safety Review Request

This branch exists only to request a hosted Codex/GitHub review before any local clone/install/run.

Upstream candidate: `RapierCraft/Perplexity-Comet-MCP`
Fork: `SirBot-gh/Perplexity-Comet-MCP`

Scope: evaluate this MCP / Perplexity / Comet bridge candidate for possible use as a subscription-backed Perplexity Comet Deep Research bridge for Hermes Research Agent.

Hard constraints:
- Do not make code changes yet.
- Do not suggest running code locally yet.
- Do not suggest `npx`, package scripts, dependency install, MCP startup, browser launch, or Comet launch as first steps.
- Perplexity API billing is unacceptable; acceptable paths must use Ben's logged-in Comet/Perplexity subscription session if used at all.
- Treat browser/CDP/Playwright/Patchright/private-web-interface control as high-trust automation with access to a logged-in browser/session.

Please inspect the full repository for:
- install scripts, postinstall hooks, build scripts, CI scripts, and dependency risks
- secrets, credential handling, auth/session bugs
- unsafe filesystem, shell, network, or subprocess behavior
- suspicious obfuscation or generated/minified code
- risky GitHub Actions workflows
- commands that would be dangerous to run locally
- CDP/debug port exposure, browser profile/session exposure, screenshots/DOM/JS execution, tab close/switch, upload/download, process kill/restart behavior, and logging of cookies/session/localStorage/account data

Return:
1. executive risk summary
2. files and line references for findings
3. whether it is safe to clone locally
4. what commands, if any, are safe to run next
5. what commands should not be run without review
6. whether this repo is a reasonable base for a hardened internal fork for Hermes Research Agent / Comet Deep Research
