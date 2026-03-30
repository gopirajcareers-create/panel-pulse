# Prompts Directory — Usage & Integration

This folder contains co-pilot side-chat templates, LLM prompt templates, and JSON schemas for the Panel Pulse evaluation pipeline.

Files
- `co_pilot_templates.md` — Side-chat templates and developer guidance for generating edits, debugging, and tests.
- `llm_prompts.md` — Production-ready LLM prompt templates for Panel Efficiency Scoring and L2 validation.
- `schemas/panel_evaluation_schema.json` — JSON Schema to validate LLM outputs before persisting to `pp_db`.

How to use
1. Use `co_pilot_templates.md` when asking co-pilot side-chat to produce code patches or debugging steps.
2. Use `llm_prompts.md` as the source of truth for the LLM prompt format when calling the LLM service.
3. Validate every LLM response against `schemas/panel_evaluation_schema.json` before saving to MongoDB.

Validation snippet (node.js, suggestion):
```js
// pseudo-code
const Ajv = require('ajv');
const schema = require('./schemas/panel_evaluation_schema.json');
const ajv = new Ajv();
const validate = ajv.compile(schema);
if (!validate(response)) throw new Error('LLM output failed schema validation');
```

Notes
- Keep temperature low for deterministic outputs.
- Mask PII in transcripts before sending to LLM.
- Store both raw LLM output and validated JSON for auditing.
