import React from 'react';
import { BookOpen, AlertCircle, CheckCircle, Lightbulb, AlertTriangle } from 'lucide-react';

interface RefinedJd {
  key_skills?: string[];
  mandatory_skills?: string[];
  good_to_have_skills?: string[];
  raw?: string;
}

interface Props {
  refinedJd: RefinedJd | null;
}

const SKILL_NOISE = [
  'wait,', 'hmm,', 'i need', 'the user', 'so that', 'maybe', 'perhaps',
  'actually', 'however', 'but the', 'deep understanding', 'experience with',
  'the mention', 'this is', 'might struggle', 'another key', 'for the role',
  'the candidate', 'the jd', 'the role', 'specific database', 'it is',
  "it's", 'which', 'that is', 'let me', 'need to check', 'the rules',
  'the example', 'inference', 'thinking about', "i'm", 'i think',
  'so maybe', 'the panel', 'too.', "that's a", 'but wait',
  'mandatory', 'also', 'required by', 'mentioned earlier', 'so those',
  'go into', 'skills go', 'key_skills', 'all other', 'core skills',
  'mandatory_skills', 'good_to_have_skills'
];

function cleanSkills(skills: string[] | undefined): string[] {
  if (!skills || skills.length === 0) return [];
  return skills
    .map(s => s.trim())
    .filter(s => {
      if (!s || s.length <= 1 || s.length > 80) return false;
      const l = s.toLowerCase();
      if (SKILL_NOISE.some(p => l.includes(p))) return false;
      if (s.endsWith('.') && s.trim().split(' ').length > 10) return false;
      return true;
    })
    .map(s => s.replace(/[.,;:]+$/, '').trim())
    .filter(s => s.length > 1);
}

export function JdSkillsCard({ refinedJd }: Props) {
  if (!refinedJd) return null;

  const mandatorySkills = cleanSkills(refinedJd.mandatory_skills);
  const goodToHaveSkills = cleanSkills(refinedJd.good_to_have_skills);
  const aiSuggestions = cleanSkills(refinedJd.key_skills).slice(0, 5);

  const hasAny = mandatorySkills.length > 0 || goodToHaveSkills.length > 0 || aiSuggestions.length > 0;
  if (!hasAny && !refinedJd.raw) return null;

  return (
    <div className="bg-bg-card rounded-xl border border-white/[0.06] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-indigo-400" />
        <h3 className="text-base font-semibold text-text-primary">JD Skills Analysis</h3>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {/* Mandatory Skills */}
        {mandatorySkills.length > 0 ? (
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              <h4 className="text-xs font-semibold uppercase tracking-widest text-red-400">Mandatory Skills</h4>
            </div>
            <ul className="space-y-1.5">
              {mandatorySkills.map((skill, i) => (
                <li key={i} className="text-sm text-text-primary leading-snug flex gap-2">
                  <span className="mt-0.5 shrink-0 text-red-400 opacity-60">•</span>
                  <span>{skill}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              <h4 className="text-xs font-semibold uppercase tracking-widest text-red-400">Mandatory Skills</h4>
            </div>
            <div className="flex items-start gap-2 text-sm text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>No mandatory skill is mentioned in the JD — Please check with recruitment team.</span>
            </div>
            {aiSuggestions.length > 0 && (
              <div className="mt-2 pt-3 border-t border-white/[0.06]">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Top {aiSuggestions.length} Mandatory Skills Suggestions from AI</span>
                </div>
                <ol className="space-y-1.5">
                  {aiSuggestions.map((skill, i) => (
                    <li key={i} className="text-sm text-text-primary leading-snug flex gap-2">
                      <span className="shrink-0 text-indigo-400 opacity-70">{i + 1}.</span>
                      <span>{skill}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Good to Have Skills */}
        {goodToHaveSkills.length > 0 ? (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <h4 className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Good to Have</h4>
            </div>
            <ul className="space-y-1.5">
              {goodToHaveSkills.map((skill, i) => (
                <li key={i} className="text-sm text-text-primary leading-snug flex gap-2">
                  <span className="mt-0.5 shrink-0 text-emerald-400 opacity-60">•</span>
                  <span>{skill}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <h4 className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Good to Have</h4>
            </div>
            <div className="flex items-start gap-2 text-sm text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>No skill is mentioned as Good to have skills for this job role — Please check with recruitment team.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
