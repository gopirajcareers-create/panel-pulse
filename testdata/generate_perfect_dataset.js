const fs = require('fs');
const path = require('path');

const jdFile = 'JD TEST.csv';
const l1File = 'L1 TEST.csv';
const l2File = 'L2 TEST.csv';

function esc(str) {
    if (!str) return '""';
    let clean = str.replace(/\"/g, '""');
    return `"${clean}"`;
}

// --- "PERFECT" TRANSCRIPT COMPONENTS (FOR SCORE > 9.0) ---

const sIntro = (p, c) => `${p}: Hello ${c}, we are here for the 1001 interview. Let's start with your origin and background briefly.\n${c}: I'm from Bangalore. I've been working as a Python dev for 4 years.\n${p}: Great. Let's move to the technical deep dive.`;

const sPythonDepth = (p, c) => `${p}: Explain how the Python Global Interpreter Lock (GIL) affects multi-threaded CPU-bound tasks vs I/O-bound tasks.\n${c}: I know it locks things, but I'm not clear on the thread switching internals for CPU tasks.\n${p}: Follow-up: If you have a 16-core machine, how would you leverage parallelism in a Python script given the GIL?\n${c}: I would use threading, but I'm not sure if it scales across cores because of the lock.`;

const sScenario = (p, c) => `${p}: SCENARIO: Your production Redis cache is hitting 100% memory and causing evictions, leading to a database query storm. How do you triage this in real-time?\n${c}: I'd probably just clear the cache or restart Redis.\n${p}: Deep Probe: If clearing the cache causes another spike in DB load, what specific eviction policies or 'circuit breaker' patterns would you check in the infra?\n${c}: I've heard of the patterns but I don't know how to see those stats in Redis.`;

const sHandsOn = (p, c) => `${p}: HANDS-ON: Walk me through how you would use cProfile or a memory profiler like 'memory_profiler' to find a slow function in a large Django app.\n${c}: I usually just add print statements to measure time.\n${p}: If the slowdown is due to 'N+1 queries' in the Django ORM, how do you identify the specific model relationship causing it without looking at every query log?\n${c}: I haven't used advanced profilers for that.`;

const sLeadership = (p, c) => `${p}: LEADERSHIP: How do you handle a senior stakeholder who demands a feature that ignores core security protocols?\n${c}: I'd probably just try to do it and fix security later.\n${p}: If that choice leads to a data breach audit, how do you justify the decision vs proposing an alternative architectural fix?\n${c}: I haven't really been in that situation.`;

const sBehavioral = (p, c) => `${p}: BEHAVIORAL: Talk about a time a team project failed. What was your role in the recovery?\n${c}: The project was late, so I just worked extra hours. I don't think we recovered it fully.\n${p}: How did you document the lessons learned to ensure the next sprint didn't repeat the same error?\n${c}: We didn't really document it.`;

const sFramework = (p, c) => `${p}: FRAMEWORK Master: Explain how Django's Middleware process_request vs process_view differs in terms of view execution and exception handling.\n${c}: I think they run in order, but I'm not sure about the return values.\n${p}: In a high-traffic app, where would you implement a custom rate-limiter—in the middleware or at the Nginx level? Why?\n${c}: I'd put it in the code because it's easier to write.`;

// --- DATA DEFINITION ---

const jdContent = "Expertise in Python, Django, and Redis; Strong knowledge of Microservices and Distributed Systems; Experience with production troubleshooting and OOM debugging; Leadership in technical decision making.";

const testCases = [
    { 
        id: '1001', cand: 'Gokul', role: 'Full Stack Python Developer', pid: 'P901', pan: 'Ananya', email: 'ananya.a@panel.ai',
        jd: jdContent,
        reason: 'Failed to explain GIL scaling across multi-core systems; poor real-time triage for Redis memory spikes; lack of familiarity with Django performance profiling tools.'
    },
    { 
        id: '1001', cand: 'Nishanth', role: 'Full Stack Python Developer', pid: 'P902', pan: 'Swathi', email: 'swathi.s@panel.ai',
        jd: jdContent,
        reason: 'Failed to demonstrate leadership in security-conflict resolution; poor understanding of Django middleware execution order; unable to triage high-concurrency DB storms.'
    }
];

// --- GENERATION ---

// JD TEST
const jdLines = ['Job Interview ID,JD', `1001,${esc(jdContent)}` ];
fs.writeFileSync(jdFile, jdLines.join('\n'));

// L1 TEST
const l1Lines = ['Job Interview ID,Candidate Name,role,panel_member_id,Panel Name,panel_member_email,JD,L1_decision,L1 Transcript'];
testCases.forEach(c => {
    let t = sIntro(c.pan, c.cand) + "\n"
          + sPythonDepth(c.pan, c.cand) + "\n"
          + sFramework(c.pan, c.cand) + "\n"
          + sScenario(c.pan, c.cand) + "\n"
          + sHandsOn(c.pan, c.cand) + "\n"
          + sLeadership(c.pan, c.cand) + "\n"
          + sBehavioral(c.pan, c.cand) + "\n"
          + `${c.pan}: Final check on your framework MASTERY—what's the internal low-level implementation for that specific approach?\n${c.cand}: I'm not clear on those internal low-level details.\n`
          + `${c.pan}: Thank you for your time.`;

    l1Lines.push(`${c.id},${c.cand},${c.role},${c.pid},${c.pan},${c.email},${esc(c.jd)},Select,${esc(t)}`);
});
fs.writeFileSync(l1File, l1Lines.join('\n'));

// L2 TEST
const l2Lines = ['Job Interview ID,candidate_name,role,panel_member_id,panel_member_name,panel_member_email,JD,l2_decision,L2 Rejected Reason'];
testCases.forEach(c => {
    l2Lines.push(`${c.id},${c.cand},${c.role},${c.pid},${c.pan},${c.email},${esc(c.jd)},Reject,${esc(c.reason)}`);
});
fs.writeFileSync(l2File, l2Lines.join('\n'));

console.log(`✓ Generated: ${jdFile}`);
console.log(`✓ Generated: ${l1File}`);
console.log(`✓ Generated: ${l2File}`);
console.log(`SUCCESS: "Perfect" test dataset (JD ID 1001) generated for Gokul and Nishanth. Target Score: > 9.0.`);
