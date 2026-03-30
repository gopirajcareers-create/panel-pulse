const fs = require('fs');
const path = require('path');

const jdPath = 'TC01_JD.csv';
const l1Path = 'TC01_L1.csv';
const l2Path = 'TC01_L2.csv';

// --- Helper to escape CSV fields ---
function esc(str) {
    if (!str) return '""';
    let escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
}

// --- Transcript Generators ---

function generateHighCloudTranscript(panel, candidate) {
    return `${panel}: Hello ${candidate}. Let's dive deep into AWS Cloud Architecture. How do you handle 'Cold Starts' and provisioned concurrency in high-load production environments?
${candidate}: We use Provisioned Concurrency to keep execution environments warm for critical paths. For IaC, we use Terraform with a modular structure. We ensure state locking using DynamoDB. In my previous project, I reduced latency by 40% by optimizing ZIP packages and using asynchronous SQS triggers.
${panel}: Tell me about Terraform state security.
${candidate}: We store state in private S3 buckets and use KMS for encryption. We also maintain strict IAM policies so only CI/CD pipelines can modify the state.
${panel}: Excellent. What is the difference between a NACL and a Security Group in this architecture?
${candidate}: NACLs are stateless and operate at the subnet level. Security Groups are stateful and operate at the instance level. We use both for defense-in-depth.
${panel}: Perfect. No further questions.`;
}

function generateModerateSDETTranscript(panel, candidate) {
    return `${panel}: Hi ${candidate}. How do you use Pytest fixtures?
${candidate}: I use them for setup and teardown of tests in conftest.py.
${panel}: How do you handle Appium for iOS?
${candidate}: I've used bundleId but mainly worked on Android. I know about XCUITest but haven't implemented it for a real device project yet.
${panel}: Can you explain the Page Object Model?
${candidate}: Yes, it's where we separate the UI locators from the test logic to make scripts more maintainable.
${panel}: Okay, that's good. What about concurrent test execution?
${candidate}: I know about xdist but usually run tests sequentially to avoid data flakes.
${panel}: Fair enough.`;
}

function generateHighSecurityTranscript(panel, candidate) {
    return `${panel}: ${candidate}, let's talk move to PKCE. Why is it preferred over Implicit Flow?
${candidate}: Implicit Flow exposes tokens in URLs. PKCE uses a code_verifier and code_challenge, making it secure for public clients like mobile apps. The authorization code can't be exchanged without the verifier secret.
${panel}: How do you generate the code_challenge?
${candidate}: It's a Base64-URL encoded SHA-256 hash of the code_verifier.
${panel}: Correct. How do you mitigate CSRF in a modern React SPA using JWT?
${candidate}: We use custom headers like 'X-Requested-With' and SameSite=Strict cookies if using cookie storage. If using local storage, we ensure proper CORS and Origin validation.
${panel}: Very solid understanding.`;
}

function generateLargeLowTranscript(panel, candidate) {
    let base = `${panel}: Welcome ${candidate}. Tell me about Agile and story points.
${candidate}: Agile is an iterative process. We use story points for estimation.
${panel}: How do you handle Jira tickets during a sprint?
${candidate}: We move them from 'To Do' to 'Done'. It's a standard process.`;
    
    // Add moderate filler to hit word count goals (~5000 words) but keep it manageable for parsers
    let filler = "\n";
    let chunk = "Agile methodology and iterative development using story points is what we follow. ";
    for(let i=0; i<400; i++) {
        filler += `${panel}: Can you elaborate on the ${i}th step of your process?
${candidate}: ${chunk.repeat(10)}\n`;
    }
    return base + filler + `${panel}: Okay, but can you explain financial forecasting specifically?
${candidate}: I haven't done much of that, mainly just focused on the Jira board.`;
}

function generateLargeModerateTranscript(panel, candidate) {
    let base = `${panel}: ${candidate}, explain Database Sharding in PostgreSQL.
${candidate}: It's horizontal partitioning across nodes based on a shard key.
${panel}: How do you handle query performance on a sharded cluster?
${candidate}: I use EXPLAIN ANALYZE to identify sequential scans. If found, I check if the index includes the shard key to avoid broadcasting the query to all shards.
${panel}: What's a distributed consensus algorithm?
${candidate}: Something like Raft or Paxos, used for leader election in high availability setups. I have a theoretical understanding but mostly used managed AWS RDS high-availability features.`;
    
    let filler = "\n";
    let chunk = "I look at the EXPLAIN ANALYZE output for query tuning. ";
    for(let i=0; i<350; i++) {
        filler += `${panel}: What about the ${i}th optimization?
${candidate}: ${chunk.repeat(8)}\n`;
    }
    return base + filler + `${panel}: Good, you have hands-on experience, though we needed more depth on manual consensus implementation.`;
}

function generateHighCPlusTranscript(panel, candidate) {
    return `${panel}: ${candidate}, explain lock-free atomics in C++17.
${candidate}: We use std::atomic with memory_order_acquire/release to ensure visibility without heavy mutexes. It avoids kernel-level context switching.
${panel}: What is ABA problem?
${candidate}: It's where a value changes from A to B and back to A, confusing a CAS operation. We solve it using versioning or hazard pointers.
${panel}: Excellent. How do you optimize for cache locality in low-latency systems?
${candidate}: We use data-oriented design, avoiding pointers where possible and ensuring objects are stored contiguously in memory to maximize L1/L2 cache hits.
${panel}: Very impressive depth.`;
}

// --- Main execution ---

console.log("Starting dataset refinement for iteration v3...");

// Update JD
let jdLines = fs.readFileSync(jdPath, 'utf8').split('\n');
for (let i = 0; i < jdLines.length; i++) {
    if (jdLines[i].startsWith('JD14305,')) jdLines[i] = 'JD14305,"Cloud Architect (Target: High). Focus on AWS, Terraform, Serverless."';
    if (jdLines[i].startsWith('JD14307,')) jdLines[i] = 'JD14307,"SDET (Target: Moderate). Focus on Pytest, Appium, CI/CD."';
    if (jdLines[i].startsWith('JD14312,')) jdLines[i] = 'JD14312,"Security Engineer (Target: High). Focus on OAuth2, PKCE, mobile security."';
    if (jdLines[i].startsWith('JD14313,')) jdLines[i] = 'JD14313,"Project Manager (Target: Low). Focus on Agile, Jira, Financials."';
    if (jdLines[i].startsWith('JD14314,')) jdLines[i] = 'JD14314,"DB Admin (Target: Moderate). Focus on Sharding, PostgreSQL."';
    if (jdLines[i].startsWith('JD14316,')) jdLines[i] = 'JD14316,"C++ Developer (Target: High). Focus on Concurrency, Low-Latency."';
}
fs.writeFileSync(jdPath, jdLines.join('\n'));

// Update L2 (Target Decisions)
let l2Lines = fs.readFileSync(l2Path, 'utf8').split('\n');
const l2Updates = {
    'JD14305': 'JD14305,Jasprit Bumrah,Cloud Architect,PID2005,Hardik Pandya,hardik.p@hr.tech,"Cloud Architect. AWS, Terraform, Serverless.",Select,Deep probing on Provisioned Concurrency and state locking.',
    'JD14307': 'JD14307,KL Rahul,SDET,PID2007,Shreyas Iyer,shreyas.i@hr.tech,"SDET. Pytest, Appium.",Select,Moderate probing. Missed some depth on iOS and parallelism.',
    'JD14312': 'JD14312,Mohammad Shami,Security Engineer,PID2012,R Ashwin,r.ashwin@hr.tech,"Security Engineer. OAuth2, PKCE, mobile security.",Select,Deep expertise in PKCE flow and CSRF mitigation.',
    'JD14313': 'JD14313,Cheteshwar Pujara,Project Manager,PID2013,Ajinkya Rahane,ajinkya.r@hr.tech,"Project Manager. Agile, Jira.",Reject,Very repetitive and shallow answers regarding Agile.',
    'JD14314': 'JD14314,Sanju Samson,Database Administrator,PID2014,Yuzvendra Chahal,y.chahal@hr.tech,"Database Administrator. Sharding, PostgreSQL.",Select,Good knowledge of replication and EXPLAIN ANALYZE tuning.',
    'JD14316': 'JD14316,Ishan Kishan,C++ Developer,PID2016,Shardul Thakur,shardul.t@hr.tech,"C++ Developer. Concurrency, Low-latency.",Select,Exceptional depth in lock-free atomics and cache locality.'
};

for (let i = 0; i < l2Lines.length; i++) {
    let key = l2Lines[i].split(',')[0];
    if (l2Updates[key]) {
        l2Lines[i] = l2Updates[key];
    }
}
fs.writeFileSync(l2Path, l2Lines.join('\n'));

// Update L1 (The Transcript)
let l1Rows = [
    { id: 'JD14305', cand: 'Jasprit Bumrah', role: 'Cloud Architect', pid: 'PID2005', pan: 'Hardik Pandya', email: 'hardik.p@hr.tech', jd: 'Principal Cloud Architect', dec: 'Select', trans: generateHighCloudTranscript('Hardik', 'Jasprit') },
    { id: 'JD14307', cand: 'KL Rahul', role: 'SDET', pid: 'PID2007', pan: 'Shreyas Iyer', email: 'shreyas.i@hr.tech', jd: 'SDET', dec: 'Select', trans: generateModerateSDETTranscript('Shreyas', 'KL') },
    { id: 'JD14312', cand: 'Mohammad Shami', role: 'Security Engineer', pid: 'PID2012', pan: 'R Ashwin', email: 'r.ashwin@hr.tech', jd: 'Security Engineer', dec: 'Select', trans: generateHighSecurityTranscript('Ashwin', 'Shami') },
    { id: 'JD14313', cand: 'Cheteshwar Pujara', role: 'Project Manager', pid: 'PID2013', pan: 'Ajinkya Rahane', email: 'ajinkya.r@hr.tech', jd: 'Project Manager', dec: 'Reject', trans: generateLargeLowTranscript('Ajinkya', 'Pujara') },
    { id: 'JD14314', cand: 'Sanju Samson', role: 'Database Administrator', pid: 'PID2014', pan: 'Yuzvendra Chahal', email: 'y.chahal@hr.tech', jd: 'Database Administrator', dec: 'Select', trans: generateLargeModerateTranscript('Yuzvendra', 'Sanju') },
    { id: 'JD14316', cand: 'Ishan Kishan', role: 'C++ Developer', pid: 'PID2016', pan: 'Shardul Thakur', email: 'shardul.t@hr.tech', jd: 'C++ Developer', dec: 'Select', trans: generateHighCPlusTranscript('Shardul', 'Ishan') }
];

let existingL1Rows = fs.readFileSync(l1Path, 'utf8').split('\n');
let newL1Content = [existingL1Rows[0]]; // Keep header

// Create a map for quick lookup
let l1UpdatesMap = {};
l1Rows.forEach(row => {
    l1UpdatesMap[row.id] = `${row.id},${row.cand},${row.role},${row.pid},${row.pan},${row.email},${esc(row.jd)},${row.dec},${esc(row.trans)}`;
});

// Process existing L1 rows, skipping or replacing our targets
let processedIds = new Set();
for (let i = 1; i < existingL1Rows.length; i++) {
    let line = existingL1Rows[i].trim();
    if (!line) continue;
    let id = line.split(',')[0];
    
    if (l1UpdatesMap[id]) {
        if (!processedIds.has(id)) {
            newL1Content.push(l1UpdatesMap[id]);
            processedIds.add(id);
        }
    } else {
        // Only keep rows that aren't multiline remnants of IDs we are replacing
        // If the row doesn't start with JD143xx, it might be a remnant (though esc should handle it, 
        // older corrupt files might have raw newlines)
        if (line.startsWith('JD143')) {
            newL1Content.push(line);
        }
    }
}

// Add any missing rows that weren't in the original file
l1Rows.forEach(row => {
    if (!processedIds.has(row.id)) {
        newL1Content.push(l1UpdatesMap[row.id]);
    }
});

fs.writeFileSync(l1Path, newL1Content.join('\n'));

console.log("Dataset refinement complete for all requested cases.");
