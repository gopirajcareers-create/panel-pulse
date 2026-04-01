/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  PanelPulse Chat AI — Automated Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 *  • Sends predefined questions to POST /api/v1/chat
 *  • Captures actual LLM responses
 *  • Evaluates 8 quality metrics per test case
 *  • Generates a styled HTML report
 *
 *  Usage:  node backend/tests/chat-ai-test.js
 *  Requires: backend running on http://localhost:3000
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');

// Load environment variables from backend/.env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ── Config ───────────────────────────────────────────────────────────────────
const API_BASE = process.env.API_BASE || `http://localhost:${process.env.PORT || 3000}`;
const CHAT_ENDPOINT = '/api/v1/chat';
const TEST_CASES_PATH = path.join(__dirname, 'chat-test-cases.json');
const REPORT_PATH = path.join(__dirname, 'chat-test-report.html');
const LOGO_PATH = path.join(__dirname, '..', '..', 'frontend', 'public', 'INDIUM LOGO.png');

// ── Auth — generate a valid JWT for the test runner ─────────────────────────
// Uses the same secret the backend reads from .env
const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-in-production';
const TEST_TOKEN = jwt.sign({ email: 'test-runner@indium.tech' }, JWT_SECRET, { expiresIn: '1h' });

// ── HTTP helper (no external deps) ──────────────────────────────────────────

function httpPost(urlStr, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const data = JSON.stringify(body);
    const startTime = Date.now();

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Cookie': `pp_token=${TEST_TOKEN}`,
      },
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        const elapsed = Date.now() - startTime;
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(responseData),
            responseTimeMs: elapsed,
          });
        } catch {
          resolve({
            status: res.statusCode,
            data: { raw: responseData },
            responseTimeMs: elapsed,
          });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Request timed out (60s)'));
    });

    req.write(data);
    req.end();
  });
}

// ── Metric calculators ──────────────────────────────────────────────────────

/**
 * 1. Structure Compliance (25%)
 * Checks if the LLM response contains the required markdown sections.
 */
function calcStructureCompliance(reply, expectedSections) {
  if (!expectedSections || expectedSections.length === 0) return { score: 1.0, details: 'No sections expected — pass' };
  let found = 0;
  const results = [];
  for (const section of expectedSections) {
    const regex = new RegExp(`##\\s*${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    const present = regex.test(reply);
    if (present) found++;
    results.push(`${present ? '✅' : '❌'} ## ${section}`);
  }
  return { score: found / expectedSections.length, details: results.join(', ') };
}

/**
 * 2. Keyword Recall (25%)
 * Checks if expected keywords are present in the response.
 */
function calcKeywordRecall(reply, expectedKeywords) {
  if (!expectedKeywords || expectedKeywords.length === 0) return { score: 1.0, details: 'No keywords expected — pass' };
  let found = 0;
  const results = [];
  for (const kw of expectedKeywords) {
    const present = reply.toLowerCase().includes(kw.toLowerCase());
    if (present) found++;
    results.push(`${present ? '✅' : '❌'} "${kw}"`);
  }
  return { score: found / expectedKeywords.length, details: results.join(', ') };
}

/**
 * 3. Factual Accuracy (15%)
 * Checks that cited scores are in valid range and mentions actual data references.
 */
function calcFactualAccuracy(reply, shouldContainScores) {
  if (!shouldContainScores) return { score: 1.0, details: 'No score validation needed' };
  const scorePattern = /(\d+\.?\d*)\s*\/\s*10/g;
  const matches = [...reply.matchAll(scorePattern)];
  if (matches.length === 0) return { score: 0.0, details: 'No X/10 scores found in response' };

  let valid = 0;
  const issues = [];
  for (const m of matches) {
    const val = parseFloat(m[1]);
    if (val >= 0 && val <= 10) {
      valid++;
    } else {
      issues.push(`Out of range: ${m[0]}`);
    }
  }
  const score = valid / matches.length;
  return {
    score,
    details: `${valid}/${matches.length} scores in valid 0-10 range${issues.length ? '; ' + issues.join(', ') : ''}`,
  };
}

/**
 * 4. Response Time (10%)
 * ≤5s = 100%, ≤10s = 70%, ≤20s = 40%, >20s = 0%
 */
function calcResponseTime(responseTimeMs) {
  const sec = responseTimeMs / 1000;
  let score = 0;
  if (sec <= 5) score = 1.0;
  else if (sec <= 10) score = 0.7;
  else if (sec <= 20) score = 0.4;
  else score = 0.0;
  return { score, details: `${sec.toFixed(1)}s` };
}

/**
 * 5. Safety (5%)
 * No HTML/script injection; no hallucinated executable content.
 */
function calcSafety(reply) {
  const issues = [];
  if (/<script/i.test(reply)) issues.push('Contains <script> tag');
  if (/on\w+\s*=/i.test(reply)) issues.push('Contains on*= event handler');
  if (/<iframe/i.test(reply)) issues.push('Contains <iframe>');
  if (/<object/i.test(reply)) issues.push('Contains <object>');
  const score = issues.length === 0 ? 1.0 : 0.0;
  return { score, details: issues.length ? issues.join(', ') : 'Clean — no injection detected' };
}

/**
 * 6. Relevance (10%)
 * Checks if the response is relevant to the question asked.
 */
function calcRelevance(reply, tc) {
  if (tc.isErrorCase) return { score: 1.0, details: 'Error case — relevance N/A' };

  // Out-of-domain: should acknowledge it can't help with non-panel queries
  if (tc.expectOutOfDomain) {
    const oodIndicators = ['panel evaluation', 'interview', 'i can only', 'my scope', 'don\'t have', 'cannot', 'not related', 'outside', 'unable to', 'specifically designed'];
    const found = oodIndicators.filter(kw => reply.toLowerCase().includes(kw));
    const score = found.length >= 1 ? 1.0 : 0.3;
    return { score, details: found.length >= 1 ? 'Correctly identified out-of-domain query' : 'May not have flagged out-of-domain query' };
  }

  // For data queries: check if reply references panel/evaluation data
  const relevanceKeywords = ['panel', 'score', 'candidate', 'evaluation', 'interview', 'dimension', 'technical'];
  const found = relevanceKeywords.filter(kw => reply.toLowerCase().includes(kw));
  const score = Math.min(1.0, found.length / 3);
  return { score, details: `${found.length}/${relevanceKeywords.length} domain keywords found` };
}

/**
 * 7. Consistency (5%)
 * Checks internal consistency: same scores aren't contradicted within the response.
 */
function calcConsistency(reply) {
  const issues = [];

  // Check if "POOR" and ">= 8" appear together (contradictory)
  if (/poor/i.test(reply) && /\b([89]|10)(\.0?)?\s*\/\s*10\b/.test(reply)) {
    // Only flag if "poor" is describing the same entity that has 8+/10
    const poorMatch = reply.match(/poor.*?(\d+\.?\d*)\s*\/\s*10/i);
    if (poorMatch && parseFloat(poorMatch[1]) >= 8) {
      issues.push('Contradicts: labels score as POOR but score >= 8');
    }
  }

  // Check if "GOOD" / "excellent" and "< 5" appear together
  if (/good|excellent/i.test(reply) && /\b([0-4])(\.?\d?)?\s*\/\s*10\b/.test(reply)) {
    const goodMatch = reply.match(/(good|excellent).*?(\d+\.?\d*)\s*\/\s*10/i);
    if (goodMatch && parseFloat(goodMatch[2]) < 5) {
      issues.push('Contradicts: labels score as GOOD/excellent but score < 5');
    }
  }

  // Check for "no data" + then providing specific data
  const noDataPatterns = /no (matching |relevant )?data|no records? found|no evaluations? found/i;
  const dataPresent = /\d+\.?\d*\s*\/\s*10/;
  if (noDataPatterns.test(reply) && dataPresent.test(reply)) {
    // Only flag if it says "no data" but then gives specific scores
    const noDataIdx = reply.search(noDataPatterns);
    const dataIdx = reply.search(dataPresent);
    if (dataIdx > noDataIdx) {
      // This could be "Related Alternatives" which is valid — be lenient
      if (!/related|alternative|however|but|instead|similar/i.test(reply.substring(noDataIdx, dataIdx))) {
        issues.push('Says "no data" then provides specific scores without transition');
      }
    }
  }

  const score = issues.length === 0 ? 1.0 : Math.max(0, 1 - issues.length * 0.5);
  return { score, details: issues.length ? issues.join('; ') : 'No contradictions detected' };
}

/**
 * 8. Hallucination Rate (5%)
 * Lower is better. Checks for fabricated data patterns.
 */
function calcHallucinationRate(reply, sources, tc) {
  if (tc.isErrorCase) return { score: 1.0, details: 'Error case — N/A' };

  const issues = [];

  // Check if response mentions specific Job IDs not present in sources
  const jobIdPattern = /JD\d{3,5}|TC\d{2,3}|ID[:\s]+\d+/gi;
  const mentionedIds = [...reply.matchAll(jobIdPattern)].map(m => m[0]);
  if (sources && sources.length > 0 && mentionedIds.length > 0) {
    const sourceIds = sources
      .map(s => s.job_interview_id)
      .filter(Boolean)
      .map(id => id.toLowerCase());
    
    let fabricated = 0;
    for (const id of mentionedIds) {
      const found = sourceIds.some(sid => sid.toLowerCase().includes(id.toLowerCase()) || id.toLowerCase().includes(sid.toLowerCase()));
      if (!found) fabricated++;
    }
    if (fabricated > 0) {
      issues.push(`${fabricated} Job ID(s) mentioned but not in sources`);
    }
  }

  // Check for impossible scores (> 10 or negative)
  const allScores = [...reply.matchAll(/(\d+\.?\d*)\s*\/\s*10/g)];
  for (const m of allScores) {
    const val = parseFloat(m[1]);
    if (val > 10 || val < 0) {
      issues.push(`Impossible score: ${m[0]}`);
    }
  }

  // Check for fabricated percentage claims
  const percentages = [...reply.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
  for (const m of percentages) {
    const val = parseFloat(m[1]);
    if (val > 100) {
      issues.push(`Impossible percentage: ${m[0]}`);
    }
  }

  const score = issues.length === 0 ? 1.0 : Math.max(0, 1 - issues.length * 0.3);
  return { score, details: issues.length ? issues.join('; ') : 'No hallucinations detected' };
}

// ── Overall weighted score ──────────────────────────────────────────────────

function calcOverallScore(metrics) {
  const weights = {
    structureCompliance: 0.25,
    keywordRecall:       0.25,
    factualAccuracy:     0.15,
    responseTime:        0.10,
    safety:              0.05,
    relevance:           0.10,
    consistency:         0.05,
    hallucinationRate:   0.05,
  };

  let total = 0;
  for (const [key, weight] of Object.entries(weights)) {
    total += (metrics[key]?.score ?? 0) * weight;
  }
  return Math.round(total * 100);
}

// ── Run all test cases ──────────────────────────────────────────────────────

async function runTests() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   PanelPulse Chat AI — Automated Test Suite     ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const testCases = JSON.parse(fs.readFileSync(TEST_CASES_PATH, 'utf-8'));
  const results = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`[${i + 1}/${testCases.length}] Running ${tc.id}: "${tc.question.substring(0, 50)}${tc.question.length > 50 ? '...' : ''}"`);

    let response, reply, sources, responseTimeMs, httpStatus, passed;

    try {
      const res = await httpPost(`${API_BASE}${CHAT_ENDPOINT}`, {
        message: tc.question,
        history: [],
        searchMode: 'hybrid',
      });

      httpStatus = res.status;
      responseTimeMs = res.responseTimeMs;
      reply = res.data?.reply || res.data?.details || res.data?.error || JSON.stringify(res.data);
      sources = res.data?.sources || [];
      response = res.data;

      // Determine pass/fail
      if (tc.isErrorCase) {
        passed = httpStatus === (tc.expectedHttpStatus || 400);
      } else {
        passed = httpStatus === 200 && typeof reply === 'string' && reply.length > 10;
      }

    } catch (err) {
      httpStatus = 0;
      responseTimeMs = 0;
      reply = `ERROR: ${err.message}`;
      sources = [];
      response = null;
      passed = false;
    }

    // Calculate all 8 metrics
    const metrics = {
      structureCompliance: calcStructureCompliance(reply, tc.expectedSections),
      keywordRecall:       calcKeywordRecall(reply, tc.expectedKeywords),
      factualAccuracy:     calcFactualAccuracy(reply, tc.shouldContainScores),
      responseTime:        calcResponseTime(responseTimeMs),
      safety:              calcSafety(reply),
      relevance:           calcRelevance(reply, tc),
      consistency:         calcConsistency(reply),
      hallucinationRate:   calcHallucinationRate(reply, sources, tc),
    };

    const overallScore = calcOverallScore(metrics);

    const result = {
      ...tc,
      httpStatus,
      responseTimeMs,
      reply: typeof reply === 'string' ? reply : JSON.stringify(reply),
      sources,
      sourceCount: sources.length,
      passed,
      metrics,
      overallScore,
    };

    results.push(result);

    const statusIcon = passed ? '✅' : '❌';
    console.log(`   ${statusIcon} Status: ${httpStatus} | Time: ${(responseTimeMs / 1000).toFixed(1)}s | Score: ${overallScore}%\n`);
  }

  // ── Generate report ─────────────────────────────────────────────────────
  const report = generateHTMLReport(results);
  fs.writeFileSync(REPORT_PATH, report, 'utf-8');
  console.log(`\n📄 Report generated: ${REPORT_PATH}`);

  // ── Print summary ───────────────────────────────────────────────────────
  const passCount = results.filter(r => r.passed).length;
  const avgScore = Math.round(results.reduce((sum, r) => sum + r.overallScore, 0) / results.length);
  const avgTime = (results.reduce((sum, r) => sum + r.responseTimeMs, 0) / results.length / 1000).toFixed(1);

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log(`║  Pass: ${passCount}/${results.length}  |  Avg Score: ${avgScore}%  |  Avg Time: ${avgTime}s  ║`);
  console.log('╚══════════════════════════════════════════════════╝\n');
}

// ── HTML Report Generator ───────────────────────────────────────────────────

function generateHTMLReport(results) {
  const passCount = results.filter(r => r.passed).length;
  const failCount = results.length - passCount;
  const avgScore = Math.round(results.reduce((sum, r) => sum + r.overallScore, 0) / results.length);
  const avgTime = (results.reduce((sum, r) => sum + r.responseTimeMs, 0) / results.length / 1000).toFixed(1);
  const timestamp = new Date().toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'medium' });
  const LOGO_FILENAME = 'logo.png';
  const LOGO_FULL_PATH = path.join(__dirname, '..', '..', 'frontend', 'public', LOGO_FILENAME);

  // Try to read logo as base64
  let logoBase64 = '';
  try {
    const logoBuffer = fs.readFileSync(LOGO_FULL_PATH);
    logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
  } catch {
    logoBase64 = '';
  }

  // Metric labels and descriptions
  const METRIC_META = {
    structureCompliance: { label: 'Structure Compliance', weight: '25%', desc: 'Required markdown sections present' },
    keywordRecall:       { label: 'Keyword Recall',       weight: '25%', desc: 'Expected keywords found in response' },
    factualAccuracy:     { label: 'Factual Accuracy',     weight: '15%', desc: 'Score citations in valid 0-10 range' },
    responseTime:        { label: 'Response Time',        weight: '10%', desc: '≤5s=100%, ≤10s=70%, ≤20s=40%' },
    safety:              { label: 'Safety',               weight: '5%',  desc: 'No injection/XSS in response' },
    relevance:           { label: 'Relevance',            weight: '10%', desc: 'Response addresses the question domain' },
    consistency:         { label: 'Consistency',          weight: '5%',  desc: 'No internal contradictions' },
    hallucinationRate:   { label: 'Hallucination Rate',   weight: '5%',  desc: 'No fabricated data or impossible values' },
  };

  function scoreColor(pct) {
    if (pct >= 80) return '#22c55e';
    if (pct >= 60) return '#f97316';
    return '#ef4444';
  }

  function scoreLabel(pct) {
    if (pct >= 80) return 'GOOD';
    if (pct >= 60) return 'MODERATE';
    return 'POOR';
  }

  function metricBar(score) {
    const pct = Math.round(score * 100);
    const color = scoreColor(pct);
    return `<div style="display:flex;align-items:center;gap:8px;">
      <div style="flex:1;height:8px;background:#2a2a2a;border-radius:4px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;transition:width 0.3s;"></div>
      </div>
      <span style="color:${color};font-weight:600;font-size:12px;min-width:40px;text-align:right;">${pct}%</span>
    </div>`;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Build test case cards
  const testCards = results.map((r, idx) => {
    const borderColor = r.passed ? '#22c55e' : '#ef4444';
    const statusBadge = r.passed
      ? '<span style="background:#22c55e22;color:#22c55e;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">✅ PASS</span>'
      : '<span style="background:#ef444422;color:#ef4444;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">❌ FAIL</span>';

    const metricsRows = Object.entries(r.metrics).map(([key, val]) => {
      const meta = METRIC_META[key];
      return `<tr>
        <td style="padding:6px 10px;color:#ccc;font-size:12px;">${meta.label}</td>
        <td style="padding:6px 10px;color:#888;font-size:11px;">${meta.weight}</td>
        <td style="padding:6px 10px;width:200px;">${metricBar(val.score)}</td>
        <td style="padding:6px 10px;color:#999;font-size:11px;max-width:300px;word-break:break-word;">${escapeHtml(val.details)}</td>
      </tr>`;
    }).join('');

    const truncatedReply = r.reply.length > 2000
      ? escapeHtml(r.reply.substring(0, 2000)) + '<span style="color:#f97316;">... (truncated)</span>'
      : escapeHtml(r.reply);

    return `
    <details style="background:#111;border:1px solid #222;border-left:4px solid ${borderColor};border-radius:12px;margin-bottom:12px;overflow:hidden;cursor:pointer;" id="tc-${r.id}">
      <summary style="padding:16px 20px;display:flex;align-items:center;justify-content:space-between;list-style:none;outline:none;">
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="background:#f97316;color:#000;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:800;">${r.id}</span>
          <span style="color:#888;font-size:12px;background:#1a1a1a;padding:3px 8px;border-radius:6px;">${escapeHtml(r.category)}</span>
          ${statusBadge}
          <span style="color:#fff;font-size:14px;font-weight:600;margin-left:12px;">${escapeHtml(r.question.substring(0, 60))}${r.question.length > 60 ? '...' : ''}</span>
        </div>
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="text-align:right;margin-right:12px;">
             <div style="color:#888;font-size:10px;text-transform:uppercase;">Score</div>
             <div style="color:${scoreColor(r.overallScore)};font-weight:800;font-size:16px;">${r.overallScore}%</div>
          </div>
          <svg style="width:16px;height:16px;fill:#666;" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
        </div>
      </summary>

      <div style="padding:0 20px 20px 20px;cursor:default;">
        <!-- Question + Expected -->
        <div style="padding:16px 0;border-top:1px solid #1a1a1a;display:grid;grid-template-columns:1fr 1fr;gap:24px;">
          <div>
            <span style="color:#f97316;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Full Question</span>
            <p style="color:#fff;font-size:14px;margin:4px 0 0 0;">${escapeHtml(r.question) || '<i style="color:#666;">(empty string)</i>'}</p>
          </div>
          <div>
            <span style="color:#f97316;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Expected Behavior</span>
            <p style="color:#aaa;font-size:13px;margin:4px 0 0 0;">${escapeHtml(r.expectedBehavior)}</p>
          </div>
        </div>

        <!-- Actual Response -->
        <div style="padding:16px 0;border-top:1px solid #1a1a1a;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="color:#f97316;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Actual Response</span>
            <span style="color:#666;font-size:11px;">⏱ ${(r.responseTimeMs / 1000).toFixed(1)}s | HTTP ${r.httpStatus}</span>
          </div>
          <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;padding:12px;max-height:400px;overflow-y:auto;">
            <pre style="color:#ddd;font-size:12px;white-space:pre-wrap;word-break:break-word;margin:0;font-family:'Cascadia Code','Fira Code',monospace;">${truncatedReply}</pre>
          </div>
        </div>

        <!-- Metrics Breakdown -->
        <div style="padding:16px 0;border-top:1px solid #1a1a1a;">
          <span style="color:#f97316;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Detailed Metrics Analysis</span>
          <table style="width:100%;border-collapse:collapse;margin-top:12px;">
            <thead>
              <tr style="border-bottom:1px solid #222;">
                <th style="text-align:left;padding:6px 10px;color:#666;font-size:11px;font-weight:600;">Metric</th>
                <th style="text-align:left;padding:6px 10px;color:#666;font-size:11px;font-weight:600;">Weight</th>
                <th style="text-align:left;padding:6px 10px;color:#666;font-size:11px;font-weight:600;">Score</th>
                <th style="text-align:left;padding:6px 10px;color:#666;font-size:11px;font-weight:600;">Details</th>
              </tr>
            </thead>
            <tbody>${metricsRows}</tbody>
          </table>
        </div>
      </div>
    </details>`;
  }).join('');

  // Aggregate metric averages
  const metricKeys = Object.keys(METRIC_META);
  const aggregateMetrics = metricKeys.map(key => {
    const avg = results.reduce((sum, r) => sum + (r.metrics[key]?.score ?? 0), 0) / results.length;
    const meta = METRIC_META[key];
    return `<div style="background:#111;border:1px solid #222;border-radius:10px;padding:14px 16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="color:#ccc;font-size:12px;font-weight:600;">${meta.label}</span>
        <span style="color:${scoreColor(Math.round(avg * 100))};font-size:13px;font-weight:700;">${Math.round(avg * 100)}%</span>
      </div>
      ${metricBar(avg)}
      <p style="color:#666;font-size:10px;margin:4px 0 0 0;">${meta.desc}</p>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PanelPulse Chat AI — Test Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #000;
      color: #fff;
      line-height: 1.5;
    }
    a { color: #f97316; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: #111; }
    ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
    
    details summary::-webkit-details-marker { display:none; }
    details[open] summary svg { transform: rotate(180deg); }
    summary svg { transition: transform 0.2s; }
    details { transition: all 0.3s; }
    details:hover { border-color: #333 !important; }
  </style>
</head>
<body>
  <!-- Header -->
  <header style="background:linear-gradient(135deg, #111 0%, #1a0f00 100%);border-bottom:2px solid #f97316;padding:24px 40px;">
    <div style="max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:16px;">
        ${logoBase64 ? `<img src="${logoBase64}" alt="Indium Logo" style="height:40px;object-fit:contain;" />` : '<span style="color:#f97316;font-weight:800;font-size:18px;">INDIUM</span>'}
        <div>
          <h1 style="font-size:20px;font-weight:800;color:#fff;">Chat AI Test Report</h1>
          <p style="color:#888;font-size:12px;">PanelPulse Automated Quality Assessment</p>
        </div>
      </div>
      <div style="text-align:right;">
        <p style="color:#888;font-size:11px;">${timestamp}</p>
        <p style="color:#666;font-size:10px;">${results.length} test cases executed</p>
      </div>
    </div>
  </header>

  <main style="max-width:1200px;margin:0 auto;padding:30px 40px;">

    <!-- Summary Cards -->
    <section style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:30px;">
      <div style="background:#111;border:1px solid #222;border-radius:12px;padding:20px;text-align:center;">
        <p style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Overall Score</p>
        <p style="font-size:36px;font-weight:800;color:${scoreColor(avgScore)};">${avgScore}%</p>
        <p style="color:${scoreColor(avgScore)};font-size:12px;font-weight:600;">${scoreLabel(avgScore)}</p>
      </div>
      <div style="background:#111;border:1px solid #222;border-radius:12px;padding:20px;text-align:center;">
        <p style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Pass Rate</p>
        <p style="font-size:36px;font-weight:800;color:${scoreColor(passCount / results.length * 100)};">${passCount}/${results.length}</p>
        <p style="font-size:12px;color:#888;">${Math.round(passCount / results.length * 100)}% passed</p>
      </div>
      <div style="background:#111;border:1px solid #222;border-radius:12px;padding:20px;text-align:center;">
        <p style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Avg Response Time</p>
        <p style="font-size:36px;font-weight:800;color:#f97316;">${avgTime}s</p>
        <p style="font-size:12px;color:#888;">per query</p>
      </div>
      <div style="background:#111;border:1px solid #222;border-radius:12px;padding:20px;text-align:center;">
        <p style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Failures</p>
        <p style="font-size:36px;font-weight:800;color:${failCount > 0 ? '#ef4444' : '#22c55e'};">${failCount}</p>
        <p style="font-size:12px;color:#888;">${failCount === 0 ? 'All tests passed' : `${failCount} test(s) failed`}</p>
      </div>
    </section>

    <!-- Aggregate Metrics -->
    <section style="margin-bottom:30px;">
      <h2 style="color:#f97316;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px;">📊 Overall Aggregate Metrics</h2>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
        ${aggregateMetrics}
      </div>
    </section>

    <!-- Test Case Details -->
    <section>
      <h2 style="color:#f97316;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px;">🧪 Test Case Results</h2>
      ${testCards}
    </section>

    <!-- Footer -->
    <footer style="text-align:center;padding:30px 0;border-top:1px solid #222;margin-top:20px;">
      <p style="color:#333;font-size:11px;">PanelPulse Chat AI Test Suite — Generated automatically</p>
      <p style="color:#222;font-size:10px;">© Indium Software 2026</p>
    </footer>

  </main>
</body>
</html>`;
}

// ── Entry point ─────────────────────────────────────────────────────────────
runTests().catch(err => {
  console.error('❌ Test suite failed:', err.message);
  process.exit(1);
});
