# LLM Prompt Templates — Panel Evaluation & L2 Validation

Reference: [Architecture.md](Architecture.md) — use the defined scoring dimensions and `pp_db` collection.

Purpose
- Structured prompts for LLM evaluation pipeline. Designed for deterministic, schema-bound outputs suitable for downstream storage and auditing.

General instructions for prompts
- Always supply the Job Description (JD), L1 transcripts (array), and L2 rejection reasons (array).
- Ask the model to return strict JSON only; validate against the JSON schema before storing.
- For evidence, request exact transcript excerpts and a source identifier (e.g., `transcript_1:23-25`).
- Include a `confidence` field for soft validation.

Template: Panel Efficiency Scoring
System: You are a scoring LLM that maps interview inputs to a numeric score (0-10) and a per-dimension breakdown.

User Prompt (template):
Provide the following JSON as input when calling the LLM:
{
  "job_id": "<JOB_ID>",
  "JD": "<full job description>",
  "L1_transcripts": ["<transcript1>", "<transcript2>"],
  "L2_rejection_reasons": ["<reason1>"]
}

Instructions to LLM:
- Produce a single JSON object matching the schema defined in `schemas/panel_evaluation_schema.json`.
- Use the dimension maximum weights from Architecture.md exactly.
- For each dimension, include a numeric value and a short justification (1-2 sentences).
- Provide `evidence` entries with exact quotes and source ids.

Template: L2 Rejection Validation
User Prompt (template):
Input: `{ "job_id": "<JOB_ID>", "L2_reason": "<reason>", "L1_transcripts": [ ... ] }`

Instructions to LLM:
- Classify probing depth: one of `NO_PROBING`, `SURFACE_PROBING`, `DEEP_PROBING`.
- Provide 1-3 evidence quotes (exact) and a short verdict sentence.
- Provide `confidence` (0.0-1.0).

Operational Notes
- Sanitize PII before sending transcripts.
- Set temperature low (0.0–0.3) for deterministic outputs.
- Validate LLM JSON using the schema before saving to `pp_db`.

Example Minimal Prompt (send to LLM):
"System: You are an evaluator. User: <the JSON input above>. Return only JSON per the schema."
