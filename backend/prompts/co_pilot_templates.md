# Co-Pilot Side Chat — Code / Edit / Debug Prompt Templates

Reference: [Architecture.md](Architecture.md) — Panel Efficiency Score, `pp_db`, `pp_jd_collection`.

Purpose
- Provide concise, enterprise-grade templates for developer-facing side-chat to: generate code, propose edits, debug tests, and create API endpoints.

Guidelines
- Always inspect repository files mentioned before proposing changes.
- Prefer modifying existing services under `backend/services/` and `backend/prompts/`.
- Return minimal diffs/patches (files + unified diff) when proposing changes.
- Include tests or commands to validate the change.
- When debugging, include failing logs, root cause, and minimal fix.

Templates

1) Implement Feature
- Instruction: "Implement <feature-name> in <filepath>. Use existing services. Return code edits only."
- Inputs: feature description, related files, desired API contract or tests.
- Expected output: patch (apply-ready), updated or new unit tests, run instructions.

2) Edit / Refactor
- Instruction: "Refactor <symbol> in <filepath> to improve <goal>. Keep behavior and tests passing."
- Inputs: symbol name (function/class), reason, tests to run.
- Expected output: refactor patch, tests updated if necessary, brief rationale.

3) Debug / Fix Tests
- Instruction: "Fix failing tests. Provide root cause, minimal code change, and updated tests."
- Inputs: full failing test output, affected files.
- Expected output: fix patch, 1-2 line explanation of cause, commands to reproduce.

4) Add Unit Tests
- Instruction: "Add unit tests for <module> covering edge cases X,Y,Z."
- Inputs: module path and functions to test.
- Expected output: test files (jest/pytest), coverage notes, run command.

5) API Contract / Endpoint
- Instruction: "Add or update endpoint `POST /api/v1/<name>`. Provide request/response schema, validation, and example cURL."
- Inputs: payload spec, auth requirements, error codes.
- Expected output: route file changes, validation middleware/schema, example cURL and tests.

Patch Format (required)
- Provide an "apply-ready" patch using unified diffs or the repository's `apply_patch` format.
- List affected files at top and include short rationale (1-2 lines).

Developer Quick Commands
- Install / build: `npm install && npm run build`
- Run tests: `npm test` or `pytest -q`
- Lint: `npm run lint`

Security & Privacy
- Do not include real PII when pasting transcripts; mask names/emails before sharing.
- Use environment variables for API keys; never hardcode credentials.

Usage Example (side-chat):
"Implement endpoint POST /api/v1/evaluate that accepts `{ job_id }` and returns the panel efficiency report. Use existing PanelDataRepository. Return only patch and tests."
