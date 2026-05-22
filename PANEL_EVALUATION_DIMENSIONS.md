# Panel Evaluation Dimensions - Scoring Guide

## Overview

This document provides clear, actionable markers and evaluation criteria for calculating scores across 8 dimensions of panel interview efficiency. The system evaluates **how well the interviewer/panel probed the candidate**, not the candidate's performance.

**Maximum Total Score:** 10.0 points

---

## The 8 Dimensions

### 1. Mandatory Skill Coverage (Weight: 20% | Max: 2.0 points)

**What It Measures:**
How thoroughly the panel probed whether the candidate possesses all mandatory skills from the job description.

**Evaluation Criteria:**

| Score Range | Markers | Evidence Required |
|-------------|---------|-------------------|
| **1.8 - 2.0** | ✅ Panel systematically probed EVERY mandatory skill from JD<br>✅ Asked follow-up questions for each skill<br>✅ Validated depth beyond surface claims<br>✅ Connected skills to real projects | Panel asked specific questions about each mandatory technology/tool listed in JD |
| **1.4 - 1.7** | ✅ Panel covered most mandatory skills (75%+)<br>⚠️ Missed 1-2 critical skills<br>✅ Some follow-up questions | Panel asked about majority of mandatory skills but skipped some |
| **0.8 - 1.3** | ⚠️ Panel covered only 50-75% of mandatory skills<br>⚠️ Surface-level questions only<br>❌ No follow-ups on critical skills | Panel asked generic questions; missed key mandatory requirements |
| **0.3 - 0.7** | ❌ Panel covered <50% of mandatory skills<br>❌ No systematic coverage<br>❌ Accepted vague answers | Panel asked 1-2 questions about mandatory skills; no depth |
| **0.0 - 0.2** | ❌ Panel failed to probe mandatory skills<br>❌ No evidence of checking JD requirements | No questions about mandatory skills from JD |

**Scoring Prompt Section:**
```
For "Mandatory Skill Coverage":
- Identify ALL mandatory skills explicitly listed in the Job Description
- Score 2.0 if the panel systematically asked about EVERY mandatory skill with follow-ups
- Score 1.6-1.9 if the panel covered 80%+ of mandatory skills with some depth
- Score 1.0-1.5 if the panel covered 50-80% of mandatory skills
- Score 0.3-0.9 if the panel covered <50% of mandatory skills
- Score 0.0-0.2 if the panel failed to probe mandatory skills

Evidence MUST include specific interviewer questions targeting mandatory skills.
```

---

### 2. Technical Depth (Weight: 20% | Max: 2.0 points)

**What It Measures:**
How deeply the panel probed the candidate's technical knowledge beyond surface-level understanding.

**Evaluation Criteria:**

| Score Range | Markers | Evidence Required |
|-------------|---------|-------------------|
| **1.8 - 2.0** | ✅ Panel asked "how" and "why" questions consistently<br>✅ Probed edge cases and failure scenarios<br>✅ Challenged candidate's design decisions<br>✅ Explored trade-offs and alternatives | Panel asked deep technical questions about architecture, performance, scalability, trade-offs |
| **1.4 - 1.7** | ✅ Panel asked several depth questions<br>⚠️ Missed some opportunities to probe deeper<br>✅ Some challenge to candidate answers | Panel asked follow-ups on 2-3 technical topics; some depth |
| **0.8 - 1.3** | ⚠️ Panel asked mostly "what" questions<br>⚠️ Accepted surface answers<br>❌ Limited technical challenge | Panel asked basic technical questions; accepted surface answers |
| **0.3 - 0.7** | ❌ Panel asked only high-level questions<br>❌ No probing of technical details<br>❌ No follow-ups | Panel asked 1-2 technical questions; no depth |
| **0.0 - 0.2** | ❌ Panel failed to probe technical depth<br>❌ No technical questions | No evidence of technical probing |

**Scoring Prompt Section:**
```
For "Technical Depth":
- Score 2.0 if the panel consistently asked "how", "why", edge cases, trade-offs, and challenged design decisions
- Score 1.6-1.9 if the panel asked several depth questions with good follow-ups
- Score 1.0-1.5 if the panel asked some technical questions but accepted surface answers
- Score 0.3-0.9 if the panel asked only high-level technical questions with no depth
- Score 0.0-0.2 if the panel failed to probe technical depth

Evidence MUST include interviewer questions about architecture, performance, trade-offs, or technical details.
```

---

### 3. Rejection Validation Alignment (Weight: 20% | Max: 2.0 points)

**What It Measures:**
How well the L1 panel's probing aligned with the L2 rejection reasons. Did the L1 panel probe deeply enough to surface the concerns that later caused L2 to reject the candidate?

**Evaluation Criteria (When L2 Rejection Reasons Exist):**

| Score Range | Probing Verdict | Markers | Evidence Required |
|-------------|----------------|---------|-------------------|
| **1.8 - 2.0** | DEEP_PROBING | ✅ Panel explicitly probed EVERY L2 rejection area<br>✅ Asked multiple follow-up questions per rejection reason<br>✅ Validated candidate claims thoroughly<br>✅ Should have caught L2 concerns | Panel asked 3+ questions directly targeting each L2 rejection reason |
| **1.4 - 1.7** | DEEP_PROBING | ✅ Panel probed most L2 rejection areas<br>⚠️ Missed 1 rejection area or lacked depth on one<br>✅ Good follow-ups | Panel asked 2+ questions per rejection reason |
| **0.8 - 1.3** | SURFACE_PROBING | ⚠️ Panel touched on L2 rejection areas superficially<br>⚠️ Accepted vague answers<br>❌ No deep validation | Panel asked 1 question per rejection reason; no follow-ups |
| **0.5 - 0.7** | SURFACE_PROBING | ⚠️ Panel barely mentioned L2 rejection areas<br>❌ No meaningful probing | Panel's questions tangentially related to rejection reasons |
| **0.0 - 0.4** | NO_PROBING | ❌ Panel completely missed L2 rejection areas<br>❌ No evidence of probing these specific concerns | No questions related to L2 rejection reasons |

**Evaluation Criteria (When Candidate Was Selected - No L2 Rejection):**

| Score Range | Markers | Evidence Required |
|-------------|---------|-------------------|
| **1.8 - 2.0** | ✅ Panel thoroughly validated candidate's key strengths<br>✅ Confirmed mandatory skills with evidence<br>✅ Verified claims through detailed probing<br>✅ High confidence in selection | Panel systematically validated top 3-5 strengths |
| **1.4 - 1.7** | ✅ Panel validated most key strengths<br>⚠️ Some claims accepted without verification | Panel validated majority of key strengths |
| **0.8 - 1.3** | ⚠️ Panel validated only some strengths<br>⚠️ Many claims accepted at face value | Panel asked basic validation questions |
| **0.3 - 0.7** | ❌ Panel did minimal validation<br>❌ Mostly accepted candidate claims | Panel asked 1-2 validation questions |
| **0.0 - 0.2** | ❌ Panel failed to validate candidate strengths<br>❌ No evidence-based probing | No validation questions |

**Scoring Prompt Section:**
```
For "Rejection Validation Alignment":

IF L2 REJECTION REASONS ARE PROVIDED:
1. First, determine the Probing Depth verdict (NO_PROBING / SURFACE_PROBING / DEEP_PROBING)
   - DEEP_PROBING: Panel explicitly asked multiple questions targeting EACH rejection reason
   - SURFACE_PROBING: Panel touched on rejection areas but didn't probe deeply
   - NO_PROBING: Panel completely missed the rejection areas

2. Then score based on verdict:
   - DEEP_PROBING: Score 1.8-2.0 for exhaustive probing, 1.4-1.7 for strong but incomplete
   - SURFACE_PROBING: Score 0.5-1.3 based on how much they touched on the issues
   - NO_PROBING: Score 0.0-0.4 based on whether they even mentioned related topics

IF NO REJECTION (CANDIDATE WAS SELECTED):
- Score 2.0 if panel exhaustively validated candidate's key strengths and mandatory skills
- Score 1.6-1.9 if panel validated most key strengths with evidence
- Score 1.0-1.5 if panel did basic validation
- Score 0.3-0.9 if panel did minimal validation
- Score 0.0-0.2 if panel failed to validate strengths

Evidence MUST include specific interviewer questions targeting the L2 rejection reasons OR validating candidate strengths.
```

---

### 4. Scenario/Risk Evaluation (Weight: 10% | Max: 1.0 point)

**What It Measures:**
How well the panel probed the candidate's ability to handle real-world scenarios, risks, and problem-solving.

**Evaluation Criteria:**

| Score Range | Markers | Evidence Required |
|-------------|---------|-------------------|
| **0.9 - 1.0** | ✅ Panel presented 2+ real-world scenarios<br>✅ Asked about risk mitigation approaches<br>✅ Probed failure handling and recovery<br>✅ Explored trade-offs in solutions | Panel asked scenario-based questions about production issues, failures, scaling, or architecture decisions |
| **0.6 - 0.8** | ✅ Panel asked 1 scenario question<br>⚠️ Limited follow-up on risks<br>✅ Some problem-solving probing | Panel asked 1 scenario question with some depth |
| **0.3 - 0.5** | ⚠️ Panel asked generic "tell me about a problem" question<br>❌ No risk or mitigation probing | Panel asked vague problem-solving question |
| **0.0 - 0.2** | ❌ Panel failed to probe scenarios or risks<br>❌ No problem-solving questions | No scenario-based questions |

**Scoring Prompt Section:**
```
For "Scenario / Risk Evaluation":
- Score 1.0 if panel asked 2+ real-world scenario questions with deep probing on risks and mitigation
- Score 0.7-0.9 if panel asked 1+ scenario questions with some depth
- Score 0.4-0.6 if panel asked generic problem-solving questions
- Score 0.1-0.3 if panel asked vague situational questions
- Score 0.0 if panel failed to probe scenarios or risks

Evidence MUST include interviewer questions about real-world scenarios, failures, risks, or trade-offs.
```

---

### 5. Framework Knowledge (Weight: 10% | Max: 1.0 point)

**What It Measures:**
How thoroughly the panel probed the candidate's expertise with specific frameworks mentioned in the JD.

**Evaluation Criteria:**

| Score Range | Markers | Evidence Required |
|-------------|---------|-------------------|
| **0.9 - 1.0** | ✅ Panel probed ALL frameworks from JD<br>✅ Asked about framework-specific features<br>✅ Explored best practices and patterns<br>✅ Validated production experience | Panel asked specific questions about each framework listed in JD (e.g., React hooks, Spring Boot configs, Angular modules) |
| **0.6 - 0.8** | ✅ Panel probed 50%+ of frameworks<br>⚠️ Some surface-level questions<br>✅ Basic validation | Panel asked about some frameworks; basic depth |
| **0.3 - 0.5** | ⚠️ Panel asked generic framework questions<br>❌ No specific feature probing | Panel asked "what frameworks do you use?" |
| **0.0 - 0.2** | ❌ Panel failed to probe framework knowledge<br>❌ No framework-specific questions | No framework questions |

**Scoring Prompt Section:**
```
For "Framework Knowledge":
- Score 1.0 if panel probed ALL frameworks from JD with specific feature/pattern questions
- Score 0.7-0.9 if panel probed 50%+ of frameworks with some depth
- Score 0.4-0.6 if panel asked generic framework questions
- Score 0.1-0.3 if panel barely mentioned frameworks
- Score 0.0 if panel failed to probe framework knowledge

Evidence MUST include interviewer questions about specific frameworks, their features, or best practices.
```

---

### 6. Hands-on Validation (Weight: 10% | Max: 1.0 point)

**What It Measures:**
How well the panel validated the candidate's practical implementation experience versus theoretical knowledge.

**Evaluation Criteria:**

| Score Range | Markers | Evidence Required |
|-------------|---------|-------------------|
| **0.9 - 1.0** | ✅ Panel asked for specific project examples<br>✅ Probed implementation details (code, tools, process)<br>✅ Asked about challenges faced and solutions<br>✅ Verified actual coding vs. architecture-only | Panel asked "walk me through your implementation", "what code did you write", "what tools did you use", "what challenges did you face" |
| **0.6 - 0.8** | ✅ Panel asked for project examples<br>⚠️ Limited probing of implementation details<br>✅ Some validation of hands-on work | Panel asked about projects; basic follow-ups |
| **0.3 - 0.5** | ⚠️ Panel asked generic "tell me about your work"<br>❌ No deep validation of hands-on experience | Panel accepted project descriptions at face value |
| **0.0 - 0.2** | ❌ Panel failed to validate hands-on experience<br>❌ No project or implementation questions | No questions about actual implementation work |

**Scoring Prompt Section:**
```
For "Hands-on Validation":
- Score 1.0 if panel deeply probed specific implementations, code written, tools used, and challenges
- Score 0.7-0.9 if panel asked for project examples with some implementation details
- Score 0.4-0.6 if panel asked generic project questions
- Score 0.1-0.3 if panel barely validated hands-on work
- Score 0.0 if panel failed to validate hands-on experience

Evidence MUST include interviewer questions about specific implementations, code, tools, or hands-on challenges.
```

---

### 7. Leadership Evaluation (Weight: 5% | Max: 0.5 points)

**What It Measures:**
How well the panel probed the candidate's leadership, mentoring, and team collaboration skills.

**Evaluation Criteria:**

| Score Range | Markers | Evidence Required |
|-------------|---------|-------------------|
| **0.45 - 0.5** | ✅ Panel asked about team leadership experience<br>✅ Probed mentoring and coaching examples<br>✅ Explored team size and scope of ownership<br>✅ Asked about conflict resolution or strategic direction | Panel asked "have you mentored others", "what was your team size", "how did you guide/influence the team", "describe your leadership role" |
| **0.30 - 0.44** | ✅ Panel asked 1-2 leadership questions<br>⚠️ Limited depth | Panel asked about team experience; basic depth |
| **0.15 - 0.29** | ⚠️ Panel asked vague team questions<br>❌ No clear leadership probing | Panel asked "did you work in a team?" |
| **0.0 - 0.14** | ❌ Panel failed to probe leadership<br>❌ No mentoring or team leadership questions | No leadership questions |

**Scoring Prompt Section:**
```
For "Leadership Evaluation":
- Score 0.5 if panel probed team leadership, mentoring, team size, ownership, and strategic direction
- Score 0.35-0.49 if panel asked 1-2 leadership questions with some depth
- Score 0.15-0.34 if panel asked vague team collaboration questions
- Score 0.0-0.14 if panel failed to probe leadership

Evidence MUST include interviewer questions about mentoring, team leadership, ownership, or guiding others.
IMPORTANT: Do NOT score generic architecture questions here; this is only for people leadership.
```

---

### 8. Behavioral Assessment (Weight: 5% | Max: 0.5 points)

**What It Measures:**
How well the panel probed soft skills: communication, collaboration, adaptability, growth mindset, and cultural fit.

**Evaluation Criteria:**

| Score Range | Markers | Evidence Required |
|-------------|---------|-------------------|
| **0.45 - 0.5** | ✅ Panel asked about conflict resolution<br>✅ Probed adaptation to change or failure<br>✅ Explored learning mindset<br>✅ Asked about collaboration challenges | Panel asked "tell me about a conflict", "how do you handle disagreement", "describe a failure and how you learned", "how do you adapt to change" |
| **0.30 - 0.44** | ✅ Panel asked 1-2 behavioral questions<br>⚠️ Limited depth | Panel asked about teamwork or learning; basic depth |
| **0.15 - 0.29** | ⚠️ Panel asked generic "why do you want this role"<br>❌ No real behavioral probing | Panel asked generic motivation questions |
| **0.0 - 0.14** | ❌ Panel failed to probe behavioral aspects<br>❌ No soft skills questions | No behavioral questions |

**Scoring Prompt Section:**
```
For "Behavioral Assessment":
- Score 0.5 if panel probed conflict resolution, adaptation, learning mindset, and collaboration challenges
- Score 0.35-0.49 if panel asked 1-2 behavioral questions with some depth
- Score 0.15-0.34 if panel asked generic motivation questions
- Score 0.0-0.14 if panel failed to probe behavioral aspects

Evidence MUST include interviewer questions about conflict, teamwork, learning, adaptability, or cultural fit.
IMPORTANT: Do NOT score technical architecture questions here; this is only for soft skills and cultural fit.
```

---

## Complete Scoring Prompt Template

```
You are evaluating PANEL EFFICIENCY — how well the INTERVIEWER/PANEL probed the candidate.
Focus on the INTERVIEWER's questions and probing depth, NOT the candidate's answers.

Job ID: {job_id}

Job Description:
{jd}

{transcripts}

{l2_rejection_reasons_if_any}

Score each dimension based on how thoroughly the PANEL covered it through their questions.

CRITICAL SCORING MANDATE: 
- You MUST award MAXIMUM points (e.g., 2.0/2.0, 1.0/1.0, 0.5/0.5) if the panelist exhaustively satisfies the requirement
- Do NOT artificially lower scores if the panelist did a perfect or highly professional job
- Use the full scoring range; don't cluster scores

NOISE ROBUSTNESS RULE: 
- Ignore conversational noise, small talk, technical difficulties, interruptions
- Evaluate ONLY the depth and quality of TECHNICAL PROBING
- Do NOT penalize time management if technical questions were excellent

BEHAVIORAL/LEADERSHIP RULE: 
- Do NOT score generic architecture questions under Behavioral Assessment
- Behavioral = conflict, teamwork, cultural fit ONLY
- Leadership = mentoring, team size, strategic direction ONLY
- Technical architecture questions go under Technical Depth or Scenario Evaluation

For "Rejection Validation Alignment":
{alignment_scoring_instructions_based_on_whether_l2_rejection_exists}

Return ONLY a valid JSON object (no extra text):
{
  "job_id": "{job_id}",
  "score": <sum of all category scores>,
  "confidence": <0-1>,
  "categories": {
    "Mandatory Skill Coverage": <0 to 2.0>,
    "Technical Depth": <0 to 2.0>,
    "Rejection Validation Alignment": <0 to 2.0>,
    "Scenario / Risk Evaluation": <0 to 1.0>,
    "Framework Knowledge": <0 to 1.0>,
    "Hands-on Validation": <0 to 1.0>,
    "Leadership Evaluation": <0 to 0.5>,
    "Behavioral Assessment": <0 to 0.5>
  },
  "evidence": {
    "Mandatory Skill Coverage": ["Interviewer question or probing statement"],
    "Technical Depth": ["Interviewer question or probing statement"],
    "Rejection Validation Alignment": ["Interviewer question targeting rejection reasons"],
    "Scenario / Risk Evaluation": ["Interviewer question or probing statement"],
    "Framework Knowledge": ["Interviewer question or probing statement"],
    "Hands-on Validation": ["Interviewer question or probing statement"],
    "Leadership Evaluation": ["Interviewer question or probing statement"],
    "Behavioral Assessment": ["Interviewer question or probing statement"]
  },
  "probing_verdict": "NO_PROBING|SURFACE_PROBING|DEEP_PROBING",
  "l2_validation": {
    "matches_evidence": true,
    "notes": "brief notes"
  }
}

IMPORTANT:
- Evidence must only quote the INTERVIEWER/PANEL lines
- If a dimension was NOT covered, set score to 0 and evidence to []
- The top-level "score" MUST equal the exact sum of all category scores
```

---

## Scoring Examples

### Example 1: Excellent Panel (Score: 9.2/10)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Mandatory Skill Coverage | 1.9/2.0 | Panel probed 8/9 mandatory skills thoroughly; missed one minor tool |
| Technical Depth | 2.0/2.0 | Panel consistently asked "why", explored trade-offs, probed edge cases |
| Rejection Validation Alignment | 1.8/2.0 | Panel deeply probed L2 rejection areas; could have pressed harder on one |
| Scenario/Risk Evaluation | 1.0/1.0 | Panel presented 2 production scenarios with risk analysis |
| Framework Knowledge | 0.9/1.0 | Panel probed 3/4 frameworks from JD with specific features |
| Hands-on Validation | 0.9/1.0 | Panel asked for implementation details, code, and challenges |
| Leadership Evaluation | 0.4/0.5 | Panel asked about mentoring and team size |
| Behavioral Assessment | 0.3/0.5 | Panel asked 1 conflict resolution question; could probe more |

**Verdict:** DEEP_PROBING - Panel demonstrated excellent technical rigor

---

### Example 2: Moderate Panel (Score: 5.8/10)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Mandatory Skill Coverage | 1.2/2.0 | Panel probed 5/9 mandatory skills; accepted surface answers |
| Technical Depth | 1.3/2.0 | Panel asked basic technical questions; few follow-ups |
| Rejection Validation Alignment | 0.8/2.0 | Panel touched on L2 rejection areas but didn't probe deeply |
| Scenario/Risk Evaluation | 0.6/1.0 | Panel asked 1 generic problem-solving question |
| Framework Knowledge | 0.7/1.0 | Panel asked about 2/4 frameworks; basic depth |
| Hands-on Validation | 0.6/1.0 | Panel asked for project examples; no implementation details |
| Leadership Evaluation | 0.3/0.5 | Panel asked "did you lead a team?" - vague |
| Behavioral Assessment | 0.3/0.5 | Panel asked "why this role?" - generic |

**Verdict:** SURFACE_PROBING - Panel covered basics but lacked depth

---

### Example 3: Poor Panel (Score: 2.3/10)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Mandatory Skill Coverage | 0.4/2.0 | Panel asked about 2/9 mandatory skills; no follow-ups |
| Technical Depth | 0.5/2.0 | Panel asked high-level "what technologies do you use?" |
| Rejection Validation Alignment | 0.1/2.0 | Panel completely missed L2 rejection areas |
| Scenario/Risk Evaluation | 0.2/1.0 | Panel asked no scenario questions |
| Framework Knowledge | 0.3/1.0 | Panel asked "familiar with React?" - yes/no question |
| Hands-on Validation | 0.4/1.0 | Panel asked "tell me about your experience" - vague |
| Leadership Evaluation | 0.2/0.5 | Panel asked no leadership questions |
| Behavioral Assessment | 0.2/0.5 | Panel asked no behavioral questions |

**Verdict:** NO_PROBING - Panel failed to systematically validate candidate

---

## Quick Reference: Dimension Weights

| Dimension | Max Score | Weight | % of Total |
|-----------|-----------|--------|------------|
| Mandatory Skill Coverage | 2.0 | High | 20% |
| Technical Depth | 2.0 | High | 20% |
| Rejection Validation Alignment | 2.0 | High | 20% |
| Scenario/Risk Evaluation | 1.0 | Medium | 10% |
| Framework Knowledge | 1.0 | Medium | 10% |
| Hands-on Validation | 1.0 | Medium | 10% |
| Leadership Evaluation | 0.5 | Low | 5% |
| Behavioral Assessment | 0.5 | Low | 5% |
| **TOTAL** | **10.0** | | **100%** |

---

## Scoring Philosophy

1. **Focus on the Interviewer, Not the Candidate**: Evaluate the quality and depth of the panel's questions, not how well the candidate answered.

2. **Award Maximum Scores When Earned**: If a panel exhaustively covers a dimension with professional rigor, award the maximum (e.g., 2.0/2.0). Don't artificially cap scores.

3. **Use the Full Scoring Range**: Don't cluster all scores around 1.5/2.0 or 0.7/1.0. Use 0.0-0.2 for failures, 0.3-0.7 for weak, 0.8-1.4 for moderate, 1.5-1.9 for good, 2.0 for excellent.

4. **Ignore Noise**: Don't penalize for small talk, audio issues, or conversational flow. Focus on technical probing quality.

5. **Evidence-Based**: Every score must be supported by actual interviewer questions from the transcript.

---

## Implementation Notes

- **Scoring Engine**: LLM-based using LLM API (qwen3:latest model via Ollama)
- **Temperature**: 0.2 (deterministic)
- **Max Tokens**: 1500
- **Retry Logic**: 3 attempts with exponential backoff
- **Validation**: JSON schema validation against panel_evaluation_schema.json
- **Storage**: MongoDB collection `panel_evaluations`

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-18  
**Maintained By:** Panel Pulse AI Team
