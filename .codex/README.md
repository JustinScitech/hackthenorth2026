# .codex

Project-scoped configuration for the [Codex CLI](https://github.com/openai/codex).

- `config.toml`: model, sandbox, approval, MCP, and profiles for this repo. Run `codex --profile review` for a read-only review session or `codex --profile triage` when working on the Federato flow.
- `prompts/`: custom slash commands (`/prompts:review-diff`, `/prompts:add-sponsor-integration`, `/prompts:triage-run`).
- `skills/`: repo-specific skills Codex loads on demand for the Temporal workflow and Federato triage areas.

Repo-wide instructions live in `AGENTS.md` at the root, which Codex reads automatically.
