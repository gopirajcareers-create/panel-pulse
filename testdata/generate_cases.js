const fs = require('fs');
const path = require('path');

const jdPath = path.join('c:/Users/DeepakVK/Documents/panel-pulse-main/panel-pulse-main/testdata/TC01_JD.csv');
const l2Path = path.join('c:/Users/DeepakVK/Documents/panel-pulse-main/panel-pulse-main/testdata/TC01_L2.csv');
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

// --- DATA ---
const jds = [
    `JD14312,"Security Engineer. Core requirements: OAuth 2.0, PKCE, CSRF protection, and mobile API security."`,
    `JD14313,"Project Manager. Agile, Scrum, Jira, and Budget/Financial Forecasting for enterprise projects."`,
    `JD14314,"Database Administrator. High Availability, PostgreSQL, Query Tuning, and Database Sharding."`,
    `JD14315,"iOS Developer. Swift, UIKit, CoreData, and background multi-threading."`,
    `JD14316,"C++ Developer. Modern C++14/17, Memory Management, and Multithreading."`
];

const l2s = [
    `JD14312,Ravi Teja,Security Engineer,PID1212,Prakash Raj,prakash.r@hr.tech,"Security Engineer. Core requirements: OAuth 2.0, PKCE, CSRF protection, and mobile API security.",Reject,Lacks understanding of OAuth 2.0 PKCE flow for mobile applications.`,
    `JD14313,Sita Ram,Project Manager,PID1213,Vijay Kumar,vijay.k@hr.tech,"Project Manager. Agile, Scrum, Jira, and Budget/Financial Forecasting for enterprise projects.",Reject,Candidate lacks experience managing budgets and financial forecasting for large projects.`,
    `JD14314,Arun Vijay,Database Administrator,PID1214,Ajith Siva,ajith.s@hr.tech,"Database Administrator. High Availability, PostgreSQL, Query Tuning, and Database Sharding.",Reject,Failed to articulate effective database sharding strategies for write-heavy workloads.`,
    `JD14315,Divya Bharati,iOS Developer,PID1215,Gautham Menon,gautham.m@hr.tech,"iOS Developer. Swift, UIKit, CoreData, and background multi-threading.",Reject,No practical knowledge of CoreData concurrency and thread-safe Managed Object Contexts.`,
    `JD14316,Vikram Prabhu,C++ Developer,PID1216,Surya Sivakumar,surya.s@hr.tech,"C++ Developer. Modern C++14/17, Memory Management, and Multithreading.",Reject,Poor understanding of memory concurrency and cache line contention with smart pointers.`
];

// Transcripts
const t12 = `"Prakash: Can you explain how you secure a mobile app using OAuth2?
Ravi: We just use the standard implicit flow with a webview.
Prakash: Implicit flow is deprecated for mobile. Have you heard of the PKCE extension?
Ravi: No, what is that?
Prakash: It prevents authorization code interception attacks. Thanks, we are done."`;

// TC13: Huge transcript with NO probing on budgets (rejection reason)
const candidateFiller13 = generateFiller(650, 'Agile'); // ~5000 words
const t13 = `"Vijay: Hi Sita. Tell me about your Agile experience.
Sita: ${candidateFiller13}
Vijay: That sounds like a lot of Scrum ceremonies. How do you handle Jira tickets?
Sita: ${candidateFiller13}
Vijay: Cool, what about retrospectives?
Sita: ${candidateFiller13}
Vijay: Great, well that covers it. Thanks!"`;

// TC14: Huge transcript WITH DEEP probing on Sharding (rejection reason)
const candidateFiller14 = generateLogs(650); // ~5000 words
const t14 = `"Ajith: Hi Arun. I see you've done query tuning. Can you explain your optimization process?
Arun: Yes, I constantly look at execution plans. ${candidateFiller14}
Ajith: Okay, so you clearly know how to read an explain plan. Let's move to a distributed architecture. If we have a single master database that is becoming the bottleneck for write operations, and vertical scaling is no longer an option, how would you design a database sharding strategy?
Arun: I would probably just add more read replicas.
Ajith: Read replicas only help with read contention. I specifically asked about write-heavy workloads. How do you partition the write load across multiple shard nodes without breaking cross-shard joins or foreign keys?
Arun: I haven't actually implemented sharding before, we mostly just upgraded our server RAM.
Ajith: I see. That won't work for our scale. Thank you Arun."`;

// TC15: Limited content on rejection (Low score)
const t15 = `"Gautham: Hi Divya. Do you know Swift?
Divya: Yes.
Gautham: Have you built UI with UIKit?
Divya: Yes, I use storyboards mostly.
Gautham: Okay. Have you ever used CoreData?
Divya: Barely, just for one small thing offline.
Gautham: Okay nice. Let's wrap up, thanks."`;

// TC16: Single content on rejection containing deep probe (High score)
const t16 = `"Surya: Hi Vikram. Quick question: If you have a std::shared_ptr passed across 10 threads, how exactly do you prevent the reference count control block from becoming a cache line contention bottleneck?
Vikram: Uh, I don't know, I just use mutexes.
Surya: Standard mutexes don't stop the cache invalidation inside the atomic counter of the shared_ptr itself. We need someone who understands lock-free atomic contention. We're done here."`;

const l1s = [
    `JD14312,Ravi Teja,Security Engineer,PID1212,Prakash Raj,prakash.r@hr.tech,"Security Engineer. Core requirements: OAuth 2.0, PKCE, CSRF protection, and mobile API security.",Reject,${t12}`,
    `JD14313,Sita Ram,Project Manager,PID1213,Vijay Kumar,vijay.k@hr.tech,"Project Manager. Agile, Scrum, Jira, and Budget/Financial Forecasting for enterprise projects.",Reject,${t13}`,
    `JD14314,Arun Vijay,Database Administrator,PID1214,Ajith Siva,ajith.s@hr.tech,"Database Administrator. High Availability, PostgreSQL, Query Tuning, and Database Sharding.",Reject,${t14}`,
    `JD14315,Divya Bharati,iOS Developer,PID1215,Gautham Menon,gautham.m@hr.tech,"iOS Developer. Swift, UIKit, CoreData, and background multi-threading.",Reject,${t15}`,
    `JD14316,Vikram Prabhu,C++ Developer,PID1216,Surya Sivakumar,surya.s@hr.tech,"C++ Developer. Modern C++14/17, Memory Management, and Multithreading.",Reject,${t16}`
];

try {
    fs.appendFileSync(jdPath, jds.join('\\n') + '\\n');
    fs.appendFileSync(l2Path, l2s.join('\\n') + '\\n');
    fs.appendFileSync(l1Path, l1s.join('\\n') + '\\n');
    console.log("Successfully appended TC12-TC16 data.");
} catch(e) {
    console.error("Error writing files:", e);
}
