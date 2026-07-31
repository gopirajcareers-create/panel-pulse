/**
 * Transcript normalizer — restore turn boundaries in raw meeting exports.
 *
 * Teams/Zoom transcripts pasted as plain text often arrive with NO line break
 * between speaker turns, so a speaker label lands mid-sentence:
 *
 *   "Alright, so... Vottikonda Swaroopa 6:28Do you have exposure to Dynatrace?"
 *
 * The scoring prompt requires evidence to quote the INTERVIEWER only, and never
 * the candidate. When turn boundaries are invisible the model cannot reliably tell
 * who spoke, so it under-attributes: on a real 15k-char L1 transcript it credited
 * the panel with 3 of ~16 substantive questions and scored the interview "shallow".
 *
 * This module inserts the missing boundaries. It is deliberately conservative —
 * only "Name H:MM" / "Name HH:MM:SS" patterns are treated as speaker labels, so
 * ordinary sentences containing digits are left alone.
 */

'use strict';

// "Firstname Lastname 6:28" / "Firstname 10:05:12" — 1-3 capitalised name words
// followed by a timestamp. The name must start at a word boundary.
//
// The trailing (?!:) makes normalization idempotent: a label this module already
// rewrote ends in "6:28: ", and without the guard a second pass would match it
// again and append another separator. Re-scoring a stored transcript is routine,
// so drift across passes is not acceptable.
const SPEAKER_LABEL = /\b([A-Z][a-zA-Z'’.-]+(?:\s+[A-Z][a-zA-Z'’.-]+){0,2})\s+(\d{1,2}:\d{2}(?::\d{2})?)(?!:)/g;

/**
 * Insert a newline before every speaker label that is not already at line start,
 * and a newline after the timestamp so the utterance begins cleanly.
 *
 * @param {string} raw
 * @returns {{text:string, insertedBreaks:number, speakers:string[], alreadyStructured:boolean}}
 */
function normalizeTranscript(raw) {
  const input = String(raw || '');
  if (!input.trim()) {
    return { text: input, insertedBreaks: 0, speakers: [], alreadyStructured: true };
  }

  const speakers = new Set();
  let insertedBreaks = 0;

  const text = input.replace(SPEAKER_LABEL, (match, name, time, offset, whole) => {
    speakers.add(name.trim());

    // Already at the start of a line (or of the transcript)? Leave the break alone,
    // but still split label from utterance so "6:28Do you" becomes readable.
    const preceding = whole.slice(Math.max(0, offset - 2), offset);
    const atLineStart = offset === 0 || /\n\s*$/.test(preceding);

    if (!atLineStart) insertedBreaks++;
    return `${atLineStart ? '' : '\n'}${name.trim()} ${time}: `;
  });

  return {
    text: text.replace(/\n{3,}/g, '\n\n').trim(),
    insertedBreaks,
    speakers: [...speakers],
    // Nothing to fix when every label already began its own line.
    alreadyStructured: insertedBreaks === 0,
  };
}

// A normalized turn: "Name H:MM: utterance" at the start of a line.
const TURN_LINE = /^([A-Z][a-zA-Z'’.-]+(?:\s+[A-Z][a-zA-Z'’.-]+){0,2})\s+\d{1,2}:\d{2}(?::\d{2})?:\s*(.*)$/;

/**
 * Count question-marked utterances per speaker. Used to report what the panel
 * actually asked, so a low score can be sanity-checked against the transcript
 * without re-reading it by hand.
 *
 * @param {string} normalizedText — output of normalizeTranscript().text
 * @returns {Record<string, number>}
 */
function questionCountsBySpeaker(normalizedText) {
  const counts = {};
  for (const line of String(normalizedText || '').split('\n')) {
    const m = line.match(TURN_LINE);
    if (!m) continue;
    if (!m[2].includes('?')) continue;
    counts[m[1]] = (counts[m[1]] || 0) + 1;
  }
  return counts;
}

/**
 * Does this text actually carry "Name H:MM:" turn labels?
 *
 * Some transcripts arrive in other shapes ("Interviewer:", "Q:", or bare prose).
 * Telling the model to attribute questions by line prefix when no line has one
 * invites it to invent a speaker, so the prompt only makes that claim when true.
 *
 * @param {string} text
 * @returns {boolean}
 */
function hasTurnLabels(text) {
  return String(text || '').split('\n').some(line => TURN_LINE.test(line));
}

module.exports = { normalizeTranscript, questionCountsBySpeaker, hasTurnLabels };
