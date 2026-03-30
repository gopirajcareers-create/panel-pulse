const fs = require('fs');
const path = require('path');

const l1Path = path.join('c:/Users/DeepakVK/Documents/panel-pulse-main/panel-pulse-main/testdata/TC01_L1.csv');

// --- HELPER: generate huge text ---
const generateFiller = (words, prefix) => {
    let block = '';
    for(let i=0; i < words; i++) {
        block += `${prefix} methodology and iterative development using story points. `;
    }
    return block;
};

const generateLogs = (words) => {
    let block = '';
    for(let i=0; i < words; i++) {
        block += `EXPLAIN ANALYZE SELECT * FROM users WHERE active=true; INDEX SCAN using idx_active, cost=10.0..100.0. `;
    }
    return block;
};

const candidateFiller13 = generateFiller(650, 'Agile'); // ~5000 words
const candidateFiller14 = generateLogs(650); // ~5000 words

const l1s = [
    `JD14312,Vignesh Sharma,Security Engineer,PID1312,Karthik Raja,karthik.r@hr.tech,"Security Engineer. Core requirements: OAuth 2.0, PKCE, CSRF protection, and mobile API security.",Reject,"Karthik: Hi Vignesh. Mobile app security is critical for this role. Let's get extremely technical about OAuth2. Since Implicit Flow is deprecated and vulnerable to token interception on mobile devices, how do you implement the PKCE (Proof Key for Code Exchange) extension? Specifically, how do you generate the code_verifier, create the code_challenge using SHA-256, and pass it to the authorization endpoint so the authorization server can validate it during the token-exchange step?
Vignesh: Honestly, I have never used PKCE. We just used standard JWT tokens.
Karthik: The requirement is deep mobile security architecture. Thank you, we will stop here."`,
    `JD14313,Sita Ram,Project Manager,PID1213,Vijay Kumar,vijay.k@hr.tech,"Project Manager. Agile, Scrum, Jira, and Budget/Financial Forecasting for enterprise projects.",Reject,"Vijay: Hi Sita. Tell me about your Agile experience.
Sita: ${candidateFiller13}
Vijay: That sounds like a lot of Scrum ceremonies. How do you handle Jira tickets?
Sita: ${candidateFiller13}
Vijay: Cool, what about retrospectives?
Sita: ${candidateFiller13}
Vijay: Great, well that covers it. Thanks!"`,
    `JD14314,Srinidhi Ramesh,Database Administrator,PID1314,Deepika Padmanabhan,deepika.p@hr.tech,"Database Administrator. High Availability, PostgreSQL, Query Tuning, and Database Sharding.",Reject,"Deepika: Hi Srinidhi. I see you've done query tuning. Can you explain your optimization process?
Srinidhi: Yes, I constantly look at execution plans. ${candidateFiller14}
Deepika: Okay, so you clearly know how to read an explain plan. Let's move to a highly distributed architecture. Our single master database is currently bottlenecked on write operations processing 50,000 transactions per second. We cannot scale vertically anymore. If you were forced to design a true horizontal database sharding strategy across 10 geographical clusters, how exactly would you partition the write load, and what specific distributed consensus algorithms or application-level routing mechanisms would you use to ensure zero downtime and prevent split-brain scenarios during cross-shard distributed transactions?
Srinidhi: I would probably just add more read replicas. I don't know much about partition keys or consensus algorithms.
Deepika: Read replicas do not solve write contention. Thank you Srinidhi."`,
    `JD14315,Divya Bharati,iOS Developer,PID1215,Gautham Menon,gautham.m@hr.tech,"iOS Developer. Swift, UIKit, CoreData, and background multi-threading.",Reject,"Gautham: Hi Divya. Do you know Swift?
Divya: Yes.
Gautham: Have you built UI with UIKit?
Divya: Yes, I use storyboards mostly.
Gautham: Okay. Have you ever used CoreData?
Divya: Barely, just for one small thing offline.
Gautham: Okay nice. Let's wrap up, thanks."`,
    `JD14316,Vikram Prabhu,C++ Developer,PID1216,Surya Sivakumar,surya.s@hr.tech,"C++ Developer. Modern C++14/17, Memory Management, and Multithreading.",Reject,"Surya: Hi Vikram. Quick question: If you have a std::shared_ptr passed across 10 threads, how exactly do you prevent the reference count control block from becoming a cache line contention bottleneck?
Vikram: Uh, I don't know, I just use mutexes.
Surya: Standard mutexes don't stop the cache invalidation inside the atomic counter of the shared_ptr itself. We need someone who understands lock-free atomic contention. We're done here."`
];

let content = fs.readFileSync(l1Path, 'utf8');
// Find where JD14312 starts
const idx = content.indexOf('JD14312,');
if (idx !== -1) {
    content = content.substring(0, idx);
}
// Append the fresh correctly formatted L1s
content += l1s.join('\n') + '\n';
fs.writeFileSync(l1Path, content);
console.log("L1.csv fixed!");
