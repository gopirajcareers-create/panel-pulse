const fs = require('fs');
const path = require('path');

const jdPath = 'TC01_JD.csv';
const l1Path = 'TC01_L1.csv';
const l2Path = 'TC01_L2.csv';

function esc(str) {
    if (!str) return '""';
    let clean = str.replace(/\"/g, '""');
    return `"${clean}"`;
}

// --- COMPONENT HELPERS ---

const sLeadership = (p, c) => `${p}: How do you approach mentoring junior engineers on your team?\n${c}: I pair program with them and conduct thorough code reviews focused on explaining the 'why' behind best practices. I also set up weekly knowledge-sharing sessions.`;

const sBehavioral = (p, c) => `${p}: Tell me about a time you had a conflict with a stakeholder.\n${c}: I once disagreed on a deadline. I presented a data-driven risk assessment of the shortcut they wanted, and we eventually agreed on a phased rollout to meet the core business need securely.`;

const sScenario = (p, c, scenario) => `${p}: Scenario: ${scenario}. How would you handle this?\n${c}: I would first isolate the root cause, then implement a short-term patch while developing a long-term architectural fix to prevent recurrence.`;

// --- TRANSCRIPT GENERATORS ---

const genHighTechnical = (p, c, roleFocus, technicalDeepDive) => {
    return `${p}: Welcome ${c}. Let's discuss your expertise in ${roleFocus}.\n` +
           `${technicalDeepDive}\n` +
           `${p}: That's very detailed. How do you handle hands-on debugging in production?\n${c}: I use distributed tracing and log silos. For example, in a recent memory leak, I used heap dumps and MAT to identify the leaking object within the singleton scope.\n` +
           `${sScenario(p, c, "A critical database deadlock occurs during peak traffic")}\n` +
           `${sLeadership(p, c)}\n` +
           `${sBehavioral(p, c)}\n` +
           `${p}: Final technical check: What's the internal working of the most critical framework you use?\n${c}: I understand the underlying thread model and how it manages memory using a generational GC approach. I've optimized it by tuning the nursery size.`;
};

const genModerateTechnical = (p, c, roleFocus, technicalMidDive) => {
    return `${p}: Hi ${c}. Tell me about ${roleFocus}.\n` +
           `${technicalMidDive}\n` +
           `${p}: Okay. Do you do mentoring?\n${c}: Yes, I help some juniors occasionally with their bugs.\n` +
           `${p}: Have you had conflicts?\n${c}: Not really, I usually just do what is assigned to me.\n` +
           `${p}: Scenario: Peak traffic causes high CPU.\n${c}: I would check the logs and maybe restart the server.`;
};

// --- DATASET DEFINITION ---

const data = [
    { id: 'JD14301', cand: 'Karthik Natarajan', role: 'Senior Backend Engineer', pid: 'PID1102', pan: 'Anitha Krishnan', email: 'anitha.k@hr.tech', jd: 'Senior Backend Engineer (Java 17, Spring Boot 3, Microservices)', dec: 'Select', 
      trans: genHighTechnical('Anitha', 'Karthik', 'Java Backend', "Anitha: Explain Spring Boot 3 internal filter chain.\nKarthik: It follows a chain-of-responsibility pattern where each filter can intercept or pass the request based on security tokens.") },
    
    { id: 'JD14302', cand: 'Vignesh Kumar', role: 'Frontend Developer', pid: 'PID1103', pan: 'Suresh Raman', email: 'suresh.r@hr.tech', jd: 'Frontend Developer (React.js, Redux, Tailwind)', dec: 'Select', 
      trans: genHighTechnical('Suresh', 'Vignesh', 'Frontend', "Suresh: How does React Reconciliation work?\nVignesh: It uses a virtual DOM diffing algorithm with O(n) complexity by comparing component types and keys.") },
    
    { id: 'JD14303', cand: 'Ravindra Selvam', role: 'Data Engineer', pid: 'PID1104', pan: 'Murali Raghavan', email: 'murali.r@hr.tech', jd: 'Data Engineer (Python, Airflow, Snowflake)', dec: 'Select', 
      trans: genHighTechnical('Murali', 'Ravindra', 'Data Engineering', "Murali: Explain Snowflake micro-partitions.\nRavindra: They are immutable, column-oriented storage units that allow for extremely efficient metadata pruning.") },
    
    { id: 'JD14304', cand: 'Kavya Reddy', role: 'Angular Developer', pid: 'PID1105', pan: 'Gopinath Iyer', email: 'gopinath.i@hr.tech', jd: 'Angular Developer (Angular 15+, TypeScript, RxJS)', dec: 'Select', 
      trans: genHighTechnical('Gopinath', 'Kavya', 'Angular', "Gopinath: Difference between Hot and Cold Observables?\nKavya: Cold observables start logic on subscription, while hot observables emit regardless of subscribers.") },
    
    { id: 'JD14305', cand: 'Jasprit Bumrah', role: 'Cloud Architect', pid: 'PID2005', pan: 'Hardik Pandya', email: 'hardik.p@hr.tech', jd: 'Cloud Architect (Target: High). AWS, Terraform, Serverless.', dec: 'Select', 
      trans: genHighTechnical('Hardik', 'Jasprit', 'Cloud Architecture', "Hardik: Explain AWS Provisioned Concurrency.\nJasprit: It keeps Lambda environments warm. I also use Terraform with S3 remote state and DynamoDB locking.") },
    
    { id: 'JD14306', cand: 'Arjun Menon', role: 'Cloud Support Engineer', pid: 'PID1107', pan: 'Pradeep Kumar', email: 'pradeep.k@hr.tech', jd: 'Cloud Support Engineer (AWS Console, IAM, EC2)', dec: 'Select', 
      trans: genHighTechnical('Pradeep', 'Arjun', 'Cloud Support', "Pradeep: How do you troubleshoot SSH errors?\nArjun: I check security groups, then NACLs, and finally verify the IGW routing for the public subnet.") },
    
    { id: 'JD14307', cand: 'KL Rahul', role: 'SDET', pid: 'PID2007', pan: 'Shreyas Iyer', email: 'shreyas.i@hr.tech', jd: 'SDET (Target: Moderate). Pytest, Appium, CI/CD.', dec: 'Select', 
      trans: genModerateTechnical('Shreyas', 'KL', 'SDET', "Shreyas: How do you use Pytest fixtures?\nKL: I use them in conftest.py for basic setup.") },
    
    { id: 'JD14308', cand: 'Ajay Verma', role: 'Junior UI Engineer', pid: 'PID1109', pan: 'Swathi Ravichandran', email: 'swathi.r@hr.tech', jd: 'Junior UI Engineer (HTML5, CSS3, JS)', dec: 'Select', 
      trans: genHighTechnical('Swathi', 'Ajay', 'UI Engineering', "Swathi: Explain CSS specificity.\nAjay: It's a weight system where ID > Class > Element. !important overrides the normal cascade.") },
    
    { id: 'JD14309', cand: 'Manoj Prabhakar', role: 'Cloud Engineer', pid: 'PID1209', pan: 'Nithya Subramanian', email: 'nithya.s@hr.tech', jd: 'Cloud Engineer (AWS, EC2, S3, VPC)', dec: 'Select', 
      trans: genHighTechnical('Nithya', 'Manoj', 'Cloud Engineering', "Nithya: How do you secure an S3 bucket?\nManoj: I use Bucket Policies, Block Public Access, and KMS encryption for objects.") },
    
    { id: 'JD14310', cand: 'Hariharan Sundar', role: 'Data Scientist', pid: 'PID1210', pan: 'Vinoth Kumar', email: 'vinoth.k@hr.tech', jd: 'Data Scientist (ML, Python, scikit-learn)', dec: 'Select', 
      trans: genHighTechnical('Vinoth', 'Hariharan', 'Data Science', "Vinoth: Explain Bias-Variance tradeoff.\nHariharan: It's the balance between underfitting and overfitting. We use cross-validation to find the sweet spot.") },
    
    { id: 'JD14311', cand: 'Nithya Ram', role: 'DevOps Engineer', pid: 'PID1112', pan: 'Karthikeyan Velu', email: 'karthikeyan.v@hr.tech', jd: 'DevOps Engineer (Jenkins, CI/CD, Docker)', dec: 'Select', 
      trans: genHighTechnical('Karthikeyan', 'Nithya', 'DevOps', "Karthikeyan: Explain Docker layers.\nNithya: Each instruction in a Dockerfile creates a read-only layer. I minimize layers to keep images small.") },
    
    { id: 'JD14312', cand: 'Mohammad Shami', role: 'Security Engineer', pid: 'PID2012', pan: 'R Ashwin', email: 'r.ashwin@hr.tech', jd: 'Security Engineer (Target: High). OAuth2, PKCE, Mobile.', dec: 'Select', 
      trans: genHighTechnical('Ashwin', 'Shami', 'Security', "Ashwin: Why PKCE over Implicit Flow?\nShami: PKCE avoids exposing tokens in URLs by using a code_verifier secret locally.") },
    
    { id: 'JD14313', cand: 'Cheteshwar Pujara', role: 'Project Manager', pid: 'PID2013', pan: 'Ajinkya Rahane', email: 'ajinkya.r@hr.tech', jd: 'Project Manager (Target: Low). Agile, Jira, Financials.', dec: 'Reject', 
      trans: "Ajinkya: Welcome Pujara. Rapid fire: Jira?\nPujara: Standard tool.\nAjinkya: Agile?\nPujara: Iterative.\n" + ("Pujara: Iterative standard process. ".repeat(400)) + "\nAjinkya: Financial forecasting?\nPujara: Never done it." },
    
    { id: 'JD14314', cand: 'Sanju Samson', role: 'Database Administrator', pid: 'PID2014', pan: 'Yuzvendra Chahal', email: 'y.chahal@hr.tech', jd: 'DB Admin (Target: Moderate). Sharding, PostgreSQL.', dec: 'Select', 
      trans: genModerateTechnical('Yuzvendra', 'Sanju', 'DBA', "Yuzvendra: Explain Sharding.\nSanju: It's horizontal partitioning.") + "\n" + ("Sanju: I use EXPLAIN ANALYZE for tuning. ".repeat(380)) },
    
    { id: 'JD14315', cand: 'Divya Bharati', role: 'iOS Developer', pid: 'PID1215', pan: 'Gautham Menon', email: 'gautham.m@hr.tech', jd: 'iOS Developer (Swift, UIKit, CoreData)', dec: 'Reject', 
      trans: "Gautham: Do you know Swift?\nDivya: Yes.\nGautham: Mentoring?\nDivya: No.\nGautham: Conflict?\nDivya: No." },
    
    { id: 'JD14316', cand: 'Ishan Kishan', role: 'C++ Developer', pid: 'PID2016', pan: 'Shardul Thakur', email: 'shardul.t@hr.tech', jd: 'C++ Developer (Target: High). Concurrency, Low-Latency.', dec: 'Select', 
      trans: genHighTechnical('Shardul', 'Ishan', 'Low Latency C++', "Shardul: Explain ABA problem.\nIshan: It's solved using hazard pointers or tagged pointers (versioning) to prevent CAS from false positives.") }
];

// --- FILE WRITING ---

const jdContent = 'Job Interview ID,JD\n' + data.map(d => `${d.id},${esc(d.jd)}`).join('\n');
fs.writeFileSync(jdPath, jdContent);

const l1Header = 'Job Interview ID,Candidate Name,role,panel_member_id,Panel Name,panel_member_email,JD,L1_decision,L1 Transcript\n';
const l1Content = l1Header + data.map(d => `${d.id},${d.cand},${d.role},${d.pid},${d.pan},${d.email},${esc(d.jd)},${d.dec},${esc(d.trans)}`).join('\n');
fs.writeFileSync(l1Path, l1Content);

const l2Header = 'Job Interview ID,candidate_name,role,panel_member_id,panel_member_name,panel_member_email,JD,l2_decision,L2 Rejected Reason\n';
const l2Content = l2Header + data.map(d => {
    let l2Reason = 'N/A';
    if (d.id === 'JD14313') l2Reason = 'Very repetitive and shallow answers regarding Agile. Failed financial forecasting.';
    if (d.id === 'JD14315') l2Reason = 'No practical knowledge of CoreData concurrency.';
    return `${d.id},${d.cand},${d.role},${d.pid},${d.pan},${d.email},${esc(d.jd)},${d.dec},${esc(l2Reason)}`;
}).join('\n');
fs.writeFileSync(l2Path, l2Content);

console.log('Successfully rebuilt all 3 CSV files with 16 HIGH-QUALITY test cases.');
