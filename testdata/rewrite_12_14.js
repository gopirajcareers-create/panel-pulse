const fs = require('fs');
const path = require('path');

const jdPath = path.join('c:/Users/DeepakVK/Documents/panel-pulse-main/panel-pulse-main/testdata/TC01_JD.csv');
const l2Path = path.join('c:/Users/DeepakVK/Documents/panel-pulse-main/panel-pulse-main/testdata/TC01_L2.csv');
const l1Path = path.join('c:/Users/DeepakVK/Documents/panel-pulse-main/panel-pulse-main/testdata/TC01_L1.csv');

// --- HELPER: generate huge logs ---
const generateLogs = (words) => {
    let block = '';
    for(let i=0; i < words; i++) {
        block += `EXPLAIN ANALYZE SELECT * FROM users WHERE active=true; INDEX SCAN using idx_active, cost=10.0..100.0. `;
    }
    return block;
};

// Data replacements
const repl_jds = {
    'JD14312': `JD14312,"Security Engineer. Core requirements: OAuth 2.0, PKCE, CSRF protection, and mobile API security."`,
    'JD14314': `JD14314,"Database Administrator. High Availability, PostgreSQL, Query Tuning, and Database Sharding."`
};

const repl_l2s = {
    'JD14312': `JD14312,Vignesh Sharma,Security Engineer,PID1312,Karthik Raja,karthik.r@hr.tech,"Security Engineer. Core requirements: OAuth 2.0, PKCE, CSRF protection, and mobile API security.",Reject,Lacks understanding of OAuth 2.0 PKCE flow for mobile applications.`,
    'JD14314': `JD14314,Srinidhi Ramesh,Database Administrator,PID1314,Deepika Padmanabhan,deepika.p@hr.tech,"Database Administrator. High Availability, PostgreSQL, Query Tuning, and Database Sharding.",Reject,Failed to articulate effective database sharding strategies for write-heavy workloads.`
};

const t12 = `"Karthik: Hi Vignesh. Mobile app security is critical for this role. Let's get extremely technical about OAuth2. Since Implicit Flow is deprecated and vulnerable to token interception on mobile devices, how do you implement the PKCE (Proof Key for Code Exchange) extension? Specifically, how do you generate the code_verifier, create the code_challenge using SHA-256, and pass it to the authorization endpoint so the authorization server can validate it during the token-exchange step?
Vignesh: Honestly, I have never used PKCE. We just used standard JWT tokens.
Karthik: The requirement is deep mobile security architecture. Thank you, we will stop here."`;

const t14 = `"Deepika: Hi Srinidhi. I see you've done query tuning. Can you explain your optimization process?
Srinidhi: Yes, I constantly look at execution plans. ${generateLogs(650)}
Deepika: Okay, so you clearly know how to read an explain plan. Let's move to a highly distributed architecture. Our single master database is currently bottlenecked on write operations processing 50,000 transactions per second. We cannot scale vertically anymore. If you were forced to design a true horizontal database sharding strategy across 10 geographical clusters, how exactly would you partition the write load, and what specific distributed consensus algorithms or application-level routing mechanisms would you use to ensure zero downtime and prevent split-brain scenarios during cross-shard distributed transactions?
Srinidhi: I would probably just add more read replicas. I don't know much about partition keys or consensus algorithms.
Deepika: Read replicas do not solve write contention. Thank you Srinidhi."`;

const repl_l1s = {
    'JD14312': `JD14312,Vignesh Sharma,Security Engineer,PID1312,Karthik Raja,karthik.r@hr.tech,"Security Engineer. Core requirements: OAuth 2.0, PKCE, CSRF protection, and mobile API security.",Reject,${t12}`,
    'JD14314': `JD14314,Srinidhi Ramesh,Database Administrator,PID1314,Deepika Padmanabhan,deepika.p@hr.tech,"Database Administrator. High Availability, PostgreSQL, Query Tuning, and Database Sharding.",Reject,${t14}`
};

function processFile(filepath, replacements) {
    let content = fs.readFileSync(filepath, 'utf8');
    let lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('JD14312,')) {
            lines[i] = replacements['JD14312'];
        }
        if (lines[i].startsWith('JD14314,')) {
            lines[i] = replacements['JD14314'];
        }
    }
    fs.writeFileSync(filepath, lines.join('\n'));
}

try {
    processFile(jdPath, repl_jds);
    processFile(l2Path, repl_l2s);
    processFile(l1Path, repl_l1s);
    console.log("Successfully rewrote TC12 and TC14!");
} catch(e) {
    console.error("Error:", e);
}
