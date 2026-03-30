const fs = require('fs');
const path = require('path');

const jdPath = path.join(__dirname, 'TC01_JD.csv');
const l2Path = path.join(__dirname, 'TC01_L2.csv');
const l1Path = path.join(__dirname, 'TC01_L1.csv');

// --- HELPER: generate huge text ---
const generateLogs = (words) => {
    let block = '';
    for(let i=0; i < words; i++) {
        block += `EXPLAIN ANALYZE SELECT * FROM users WHERE active=true; INDEX SCAN using idx_active, cost=10.0..100.0. `;
    }
    return block;
};
const candidateFiller14 = generateLogs(650);

const processFile = (filePath, updates) => {
    let content = fs.readFileSync(filePath, 'utf8');
    let lines = content.split('\n');
    let newLines = [];
    
    // We handle multiline CSV (L1) by finding the prefix
    let i = 0;
    while(i < lines.length) {
        let matched = false;
        for (const [id, newText] of Object.entries(updates)) {
            if (lines[i].startsWith(id + ',')) {
                newLines.push(newText);
                matched = true;
                // If L1, skip until the next JD start or end of file
                if (filePath.includes('L1')) {
                    i++;
                    while(i < lines.length && !lines[i].match(/^JD\d{5},/)) {
                        i++;
                    }
                    i--; // so we don't skip the next JD
                }
                break;
            }
        }
        if (!matched && lines[i].trim() !== '') {
            newLines.push(lines[i]);
        }
        i++;
    }
    
    fs.writeFileSync(filePath, newLines.join('\n') + '\n');
};

const jdUpdates = {
    'JD14312': 'JD14312,Rahul Dravid,Security Engineer,PID1412,Sachin Tendulkar,sachin.t@hr.tech',
    'JD14314': 'JD14314,Anil Kumble,Database Administrator,PID1414,VVS Laxman,vvs.l@hr.tech',
    'JD14316': 'JD14316,MS Dhoni,C++ Developer,PID1416,Virat Kohli,virat.k@hr.tech'
};

const l2Updates = {
    'JD14312': 'JD14312,Rahul Dravid,Sachin Tendulkar,Security Engineer,PID1412,Failed to articulate deep mobile API security architecture,Reject',
    'JD14314': 'JD14314,Anil Kumble,VVS Laxman,Database Administrator,PID1414,Failed to articulate effective database sharding strategies for write-heavy workloads,Reject',
    'JD14316': 'JD14316,MS Dhoni,Virat Kohli,C++ Developer,PID1416,Lacked deep understanding of lock-free atomic contention in modern C++,Reject'
};

const l1Updates = {
    'JD14312': `JD14312,Sachin Tendulkar,Security Engineer,PID1412,Rahul Dravid,rahul.d@hr.tech,"Security Engineer. Core requirements: OAuth 2.0, PKCE, CSRF protection, and mobile API security.",Reject,"Rahul: Hi Sachin. Mobile app security is critical for this role. Let's start with API security. How do you implement robust CSRF protection in a stateless REST API consumed by a mobile app?
Sachin: We use anti-forgery tokens passed in headers.
Rahul: Good. What about the OAuth 2.0 flow for mobile? Implicit Flow is deprecated. How do you implement the PKCE (Proof Key for Code Exchange) extension? specifically, how do you generate the code_verifier, create the code_challenge using SHA-256, and pass it to the authorization endpoint so the authorization server can validate it during the token-exchange step?
Sachin: I'm not entirely sure about the SHA-256 challenge part.
Rahul: Have you written custom JWT validation logic or custom authorization filters for this flow?
Sachin: No, we just use libraries.
Rahul: What if the mobile device is compromised, how do you handle token revocation?
Sachin: We use short lived tokens.
Rahul: Could you lead a team to implement this PKCE architecture? How do you mentor juniors on security?
Sachin: Not really led a team.
Rahul: The requirement is deep mobile security architecture leadership. Thank you, we will stop here."`,
    
    'JD14314': `JD14314,VVS Laxman,Database Administrator,PID1414,Anil Kumble,anil.k@hr.tech,"Database Administrator. High Availability, PostgreSQL, Query Tuning, and Database Sharding.",Reject,"Anil: Hi VVS. Let's talk about PostgreSQL framework internals. How does MVCC handle stale rows?
VVS: I'm not sure. ${candidateFiller14}
Anil: Can you explain your query optimization process for PostgreSQL?
VVS: I constantly look at execution plans. ${candidateFiller14}
Anil: How do you handle conflicts within your DBA team when deciding on index strategies?
VVS: We just ask the team lead.
Anil: Okay, so you clearly know how to read an explain plan. Let's move to a highly distributed architecture. Our single master database is currently bottlenecked on write operations processing 50,000 transactions per second. We cannot scale vertically anymore. If you were forced to design a true horizontal database sharding strategy across 10 geographical clusters, how exactly would you partition the write load, and what specific distributed consensus algorithms or application-level routing mechanisms would you use to ensure zero downtime and prevent split-brain scenarios during cross-shard distributed transactions?
VVS: I would probably just add more read replicas. I don't know much about partition keys or consensus algorithms.
Anil: Read replicas do not solve write contention. Thank you VVS."`,
    
    'JD14316': `JD14316,Virat Kohli,C++ Developer,PID1416,MS Dhoni,ms.d@hr.tech,"C++ Developer. Modern C++14/17, Memory Management, and Multithreading.",Reject,"Dhoni: Hi Virat. Let's dive deep into Modern C++17. Can you explain how you use std::optional or std::variant in a real-world scenario?
Virat: We use it for return types that might be null.
Dhoni: Could you explain the memory layout differences when using std::variant versus a union? Have you implemented custom memory allocators for high-performance systems before?
Virat: Not custom allocators, no.
Dhoni: Okay. Let's look at a multithreading scenario. You have a std::shared_ptr passed across 10 active threads. How exactly do you prevent the reference count control block from becoming a cache line contention bottleneck?
Virat: Uh, I don't know, I just use mutexes.
Dhoni: Standard mutexes don't stop the cache invalidation inside the atomic counter of the shared_ptr itself. We need someone who understands lock-free atomic contention. Can you demonstrate your leadership by explaining how you've guided junior developers in adopting modern C++ thread-safe practices?
Virat: I mostly work alone.
Dhoni: How do you manage technical disagreements with stakeholders on architectural choices in C++?
Virat: I just let the manager decide.
Dhoni: Understood. We need a strong technical leader for this position. We're done here."`
};

processFile(jdPath, jdUpdates);
processFile(l2Path, l2Updates);
processFile(l1Path, l1Updates);

console.log("Updated 12, 14, 16 successfully!");
