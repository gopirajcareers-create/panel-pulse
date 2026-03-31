import React from 'react';
import { BookOpen, AlertCircle, CheckCircle, Star } from 'lucide-react';

interface RefinedJd {
  key_skills: string[];
  mandatory_skills: string[];
  good_to_have_skills: string[];
  raw?: string;
}

interface Props {
  refinedJd: RefinedJd | null;
}

interface SkillSectionProps {
  title: string;
  skills: string[];
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}

function SkillSection({ title, skills, icon, color, bgColor, borderColor }: SkillSectionProps) {
  if (!skills || skills.length === 0) return null;

  // Noise phrases that appear in AI reasoning but never in real skill names
  const SKILL_NOISE = [
    'wait,', 'hmm,', 'i need', 'the user', 'so that', 'maybe', 'perhaps',
    'actually', 'however', 'but the', 'deep understanding', 'experience with',
    'the mention', 'this is', 'might struggle', 'another key', 'for the role',
    'the candidate', 'the jd', 'the role', 'specific database', 'it is',
    "it's", 'which', 'that is', 'let me', 'need to check', 'the rules',
    'the example', 'inference', 'thinking about', "i'm", 'i think',
    'so maybe', 'the panel', 'too.', 'that\'s a', 'but wait',
  ];

  // Clean common AI noise/looping if it leaks into the data
  const cleanedSkills = skills
    .map(s => s.trim())
    .filter(s => {
      if (!s || s.length <= 1) return false;
      // Skill names are short — but let's be more permissive (up to 80 chars)
      if (s.length > 80) return false;
      const l = s.toLowerCase();
      // Reject lines containing any known AI-reasoning phrase
      if (SKILL_NOISE.some(p => l.includes(p))) return false;
      // Reject lines that look like a whole paragraph (end with period + many words)
      if (s.endsWith('.') && s.trim().split(' ').length > 10) return false;
      return true;
    })
    .map(s => s.replace(/[.,;:]+$/, '').trim()) // Strip trailing punctuation
    .filter(s => s.length > 1);

  if (cleanedSkills.length === 0) return null;

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={color}>{icon}</span>
        <h4 className={`text-xs font-semibold uppercase tracking-widest ${color}`}>{title}</h4>
      </div>
      <ul className="space-y-1.5">
        {cleanedSkills.map((skill, i) => (
          <li key={i} className="text-sm text-text-primary leading-snug flex gap-2">
            <span className={`mt-0.5 shrink-0 ${color} opacity-60`}>•</span>
            <span>{skill}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}


export function JdSkillsCard({ refinedJd }: Props) {
  if (!refinedJd) return null;

  const hasAny =
    (refinedJd.key_skills?.length ?? 0) > 0 ||
    (refinedJd.mandatory_skills?.length ?? 0) > 0 ||
    (refinedJd.good_to_have_skills?.length ?? 0) > 0;

  if (!hasAny && !refinedJd.raw) return null;

  return (
    <div className="bg-bg-card rounded-xl border border-white/[0.06] p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-indigo-400" />
        <h3 className="text-base font-semibold text-text-primary">JD Skills Analysis</h3>
        <span className="ml-auto text-[10px] font-medium uppercase tracking-widest text-text-muted bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-full">
          AI Refined
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {hasAny ? (
          <>
            <SkillSection
              title="Key Skills"
              skills={refinedJd.key_skills}
              icon={<Star className="w-3.5 h-3.5" />}
              color="text-indigo-400"
              bgColor="bg-indigo-500/5"
              borderColor="border-indigo-500/20"
            />
            <SkillSection
              title="Mandatory Skills"
              skills={refinedJd.mandatory_skills}
              icon={<AlertCircle className="w-3.5 h-3.5" />}
              color="text-red-400"
              bgColor="bg-red-500/5"
              borderColor="border-red-500/20"
            />
            <SkillSection
              title="Good to Have"
              skills={refinedJd.good_to_have_skills}
              icon={<CheckCircle className="w-3.5 h-3.5" />}
              color="text-emerald-400"
              bgColor="bg-emerald-500/5"
              borderColor="border-emerald-500/20"
            />
          </>
        ) : refinedJd.raw ? (
          <div className="text-sm text-text-muted italic p-4 text-center border-2 border-dashed border-white/5 rounded-lg">
            Skills could not be categorized for this JD. Please re-evaluate to refresh.
          </div>
        ) : (
          <div className="text-sm text-text-muted italic p-4 text-center border-2 border-dashed border-white/5 rounded-lg">
            No specific skills extracted from JD
          </div>
        )}
      </div>
    </div>
  );
}
