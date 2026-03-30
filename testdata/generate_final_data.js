const fs = require('fs');
const path = require('path');

const jdFile = 'JD DATA.csv';
const l1File = 'L1 DATA.csv';
const l2File = 'L2 DATA.csv';

function esc(str) {
    if (!str) return '""';
    let clean = str.replace(/\"/g, '""');
    return `"${clean}"`;
}

// --- TRANSCRIPT COMPONENTS ---

const sLeadership = (p, c) => `${p}: How do you approach mentoring junior engineers on your team?\n${c}: Oh, I usually just answer their questions if they come to me. I don't have a formal schedule.\n${p}: If a junior engineer consistently checks in buggy code, how would you handle the performance gap?\n${c}: Uh, I'd probably just fix it myself or tell them to be more careful. I haven't really managed performance formally.`;

const sBehavioral = (p, c) => `${p}: Tell me about a time you had a conflict with a stakeholder over a technical deadline.\n${c}: Once someone wanted a feature fast, and I said it was hard. Eventually we just did it anyway.\n${p}: How did you manage the technical debt from that rush?\n${c}: I didn't really track it, we just moved to the next task.`;

const sScenario = (p, c, scenarioDescription) => `${p}: Scenario: ${scenarioDescription}. How do you triage this?\n${c}: I would check the logs and maybe restart the service. I'm not sure about the internal tools.\n${p}: If restarting doesn't work, what specifically would you look for in a heap dump or flame graph?\n${c}: I have heard of those tools, but I don't know how to read them.`;

const sNeutrality = (p, c) => `${p}: Before we dive deep, where are you from originally?\n${c}: I'm from Chennai.\n${p}: Nice. Let's focus on the technical requirements for this role.`;

const sNoise = (p, c) => `${p}: Actually, I was just reading about the new traffic regulations in city. Have you seen them?\n${c}: Oh yes, it's quite a mess during peak hours. I usually take the metro.\n${p}: Good idea. Anyway, coming back to the technical discussion...`;

// --- DATA DEFINITION ---

const cases = [
    { 
        id: 'JD2001', cand: 'Arjun', role: 'Senior Backend Engineer', pid: 'P201', pan: 'Priya', email: 'priya.p@panel.ai', level: 'high',
        jd: 'Strong experience in Java 11+ and Spring Boot; Microservices architecture and distributed systems; Experience with Relational Databases and query optimization.', 
        reason: 'Failed to explain Java concurrency models (Volatile vs Atomic); Blank on Microservices circuit breaker patterns; No experience with production profiling (MAT/VisualVM).',
        tech: [
            {q: "How does the JVM handle memory management and GC roots?", a: "It uses markers to see what is alive, but I don't know the exact root types."},
            {q: "Explain the difference between \"volatile\" and \"AtomicInteger\" in a multi-threaded context.", a: "I think they are the same for thread safety. I'm not clear on the internal happens-before relationship."},
            {q: "How would you implement a Circuit Breaker pattern in a Spring Boot microservice?", a: "I have heard of Resilience4j, but I don't know how to configure it for a fallback."},
            {q: "Explain B-Tree vs LSM-Tree for database indexing.", a: "I use standard B-Tree indexing. I don't know much about LSM."}
        ],
        scenario: "A production memory leak is causing OOM every 4 hours."
    },
    { 
        id: 'JD2002', cand: 'Rahul', role: 'Frontend Developer', pid: 'P202', pan: 'Kavya', email: 'kavya.k@panel.ai', level: 'moderate',
        jd: 'Expertise in React.js and State Management (Redux/Context API); Proficiency in Tailwind CSS and responsive design; Experience with performance optimization and Web Vitals.', 
        reason: 'Lack of understanding in React reconciliation and web performance vitals.',
        tech: [
            {q: "How does React Reconciliation work?", a: "It updates the UI when state changes, but I don't know the algorithm name."},
            {q: "Explain Cumulative Layout Shift (CLS).", a: "I have seen it in reports, but I don't know how to fix it."},
            {q: "Difference between Redux Thunk and Saga?", a: "I have only used standard Redux, not middleware."}
        ],
        scenario: "An SPA is freezing on initial load for mobile users."
    },
    { 
        id: 'JD2003', cand: 'Karthik', role: 'Data Engineer', pid: 'P203', pan: 'Anjali', email: 'anjali.a@panel.ai', level: 'low',
        jd: 'Building scalable data pipelines using Python and Apache Spark; Experience with Airflow for orchestration; Knowledge of Snowflake or similar cloud data warehouses.', 
        reason: 'Poor Spark optimization skills and inability to handle data skew.',
        tech: [
            {q: "What is a Spark broadcast join?", a: "I think it is something related to networking, I haven't used it for optimization."},
            {q: "How do you handle data skew in Spark?", a: "I just wait for the job to complete or restart it with more executors."},
            {q: "Explain Airflow XComs.", a: "I have heard the term but I don't use it in my DAGs."}
        ],
        scenario: "Daily ETL job is failing intermittently due to partition timeout."
    },
    { 
        id: 'JD2004', cand: 'Vikram', role: 'Angular Developer', pid: 'P204', pan: 'Sneha', email: 'sneha.s@panel.ai', level: 'moderate',
        jd: 'Advanced Angular (15+) and TypeScript; Deep understanding of RxJS and reactive programming; Experience with modular architecture and Unit Testing.', 
        reason: 'Basic RxJS knowledge; failed to explain Observables vs Promises.',
        tech: [
            {q: "Difference between SwitchMap and MergeMap?", a: "MergeMap handles all concurrently, SwitchMap cancels the previous one. I use them for API calls."},
            {q: "How do you handle memory leaks in Angular?", a: "I use manual unsubscribe, but I don't know about the takeUntil pattern."},
            {q: "Explain Observables vs Promises.", a: "Promises are eager and single-valued; Observables are lazy and emit multiple values. I haven't worked with complex operators."},
            {q: "What is the role of Zone.js in Angular Change Detection?", a: "It's part of the framework, but I don't know how it patches browser APIs."},
            {q: "How do you implement custom directives for performance?", a: "I just use standard directives, I haven 't made custom ones for optimization."}
        ],
        scenario: "Angular dashboard is sluggish when rendering 500+ dynamic items."
    },
    { 
        id: 'JD2005', cand: 'Suresh', role: 'Cloud Architect', pid: 'P205', pan: 'Divya', email: 'divya.d@panel.ai', level: 'high',
        jd: 'AWS Solutions Architecture Professional; Advanced Infrastructure as Code using Terraform; Portfolio in high-availability and serverless computing.', 
        reason: 'Unable to design a high-availability architecture; lacks depth in Terraform state management.',
        tech: [
            {q: "How do you handle Terraform state locking?", a: "I use a remote backend like S3, but I'm not sure about the DynamoDB locking internals."},
            {q: "Explain AWS VPC Peering vs Transit Gateway for a 100-VPC setup.", a: "VPC Peering is complex to manage at scale. I'd use Transit Gateway but I don't know the hub-and-spoke details."},
            {q: "Design a system for 5 9s availability across multiple AWS regions.", a: "I would use Route 53 with health checks, but I'm not clear on cross-region data replication latency."},
            {q: "How do you manage Terraform state in a multi-account AWS environment securely?", a: "I use separate state files per account, but I don't know about cross-account IAM roles for state access."}
        ],
        scenario: "A primary AWS region goes down, we need to failover with <10 min RPO."
    },
    { 
        id: 'JD2006', cand: 'Pradeep', role: 'Cloud Support Engineer', pid: 'P206', pan: 'Meena', email: 'meena.m@panel.ai', level: 'low',
        jd: 'Proficient in AWS Console and CLI troubleshooting; Managing IAM roles and policies; Diagnosing EC2 connectivity and performance issues.', 
        reason: 'Poor troubleshooting skills for EC2 networking and IAM policy conflicts.',
        tech: [
            {q: "How do you troubleshoot an \"Instance Reachability Check\" failure?", a: "I would check the console for any errors, but I don't know the specific steps to resolve it."},
            {q: "Explain IAM Policy Evaluation logic.", a: "It checks if the user has permission, but I don't know the order of Deny and Allow."},
            {q: "Difference between Security Groups and NACLs?", a: "Security groups are for instances and NACLs are for subnets. I'm not sure about stateful vs stateless."}
        ],
        scenario: "Suppose your system performance decreases drastically. How would you debug?"
    },
    { 
        id: 'JD2007', cand: 'Naveen', role: 'SDET', pid: 'P207', pan: 'Lakshmi', email: 'lakshmi.l@panel.ai', level: 'moderate', noise: true,
        jd: 'Automation testing with Pytest and Selenium/Appium; Integrating tests into CI/CD pipelines; Mobile application and API testing expertise.', 
        reason: 'Lack of proficiency in Pytest fixtures and CI/CD integration.',
        tech: [
            {q: "Explain Pytest fixtures with session scope.", a: "I use them for setup and teardown at the session level, but I'm not sure how they behave with parallel execution order."},
            {q: "Can you provide a specific example of where you used session scope fixtures in a real project?", a: "I used it once for DB connection, but I don't remember the exact implementation details."},
            {q: "How do you handle flickering tests?", a: "I usually just rerun them or add a sleep. I know about Explicit Waits but haven't implemented a custom wait factory."},
            {q: "Scenario: Your automated test suite takes 4 hours for 100 tests. How do you triage and fix this?", a: "I'd check if tests are blocking each other. I haven't used advanced profiling tools like cProfile for test execution."},
            {q: "How do you manage test data for API testing in a CI pipeline?", a: "I use static JSON files. I have not implemented dynamic data generation from live databases."},
            {q: "Hands-on: Write a script to capture network logs during a Selenium test.", a: "I haven't done that before, I usually just check the browser logs manually if there is an error."}
        ],
        scenario: "Suppose your system performance decreases drastically. How would you debug?"
    },
    { 
        id: 'JD2008', cand: 'Rohan', role: 'Junior UI Engineer', pid: 'P208', pan: 'Pooja', email: 'pooja.p@panel.ai', level: 'low', noise: true,
        jd: 'Solid foundation in HTML5, semantic CSS3, and JavaScript ES6; Experience with CSS preprocessors like SASS/LESS; Eye for UI/UX detail.', 
        reason: 'Poor CSS specificity knowledge and basic JS mistakes.',
        tech: [
            {q: "Explain CSS Specificity hierarchy.", a: "It's just the order of CSS rules in the file. Last one wins."},
            {q: "What is a Closure in JavaScript?", a: "It's a function inside a function, but I don't know why we use it."},
            {q: "Difference between Flexbox and Grid?", a: "Flexbox is for one dimension and Grid is for two dimensions. I haven't used Grid much."}
        ],
        scenario: "Suppose your system performance decreases drastically. How would you debug?"
    },
    { 
        id: 'JD2009', cand: 'Aarav', role: 'DevOps Engineer', pid: 'P209', pan: 'Aditi', email: 'aditi.a@panel.ai', level: 'high',
        jd: 'Kubernetes orchestration and containerization; Jenkins/GitLab CI/CD proficiency; Infrastructure as Code with Terraform or CloudFormation.',
        reason: 'Inability to explain Kubernetes CNI or handle pod scheduling constraints.',
        tech: [
            {q: "How does a Pod communicate with another Pod across nodes?", a: "I use services and ClusterIP, but I don't know how the overlay network actually works at the VPC level."},
            {q: "Explain Taints and Tolerations.", a: "They are used for scheduling pods on specific nodes, but I don't know how they differ from Node Affinity in priority evaluation."}
        ],
        scenario: "A Kubernetes cluster is experience random Node NotReady status."
    },
    { 
        id: 'JD2010', cand: 'Vivaan', role: 'Python Developer', pid: 'P210', pan: 'Ananya', email: 'ananya.a@panel.ai', level: 'moderate',
        jd: 'Backend development using Django or Flask; Experience with PostgreSQL and Redis; Strong understanding of asynchronous programming.',
        reason: 'Confusion between Multiprocessing and Multithreading in Python; basic GIL issues.',
        tech: [
            {q: "What is the Global Interpreter Lock (GIL)?", a: "It stops multiple threads from running at once, but I don't know how to bypass it for CPU-bound tasks."},
            {q: "Asynchronous vs Synchronous calls in Django?", a: "I use standard synchronous calls, I haven't worked with Django Channels or async views."}
        ],
        scenario: "A Python API is hanging when handling 100+ concurrent requests."
    },
    { 
        id: 'JD2011', cand: 'Aditya', role: 'Security Engineer', pid: 'P211', pan: 'Kavitha', email: 'kavitha.k@panel.ai', level: 'high',
        jd: 'Penetration testing and vulnerability assessment; Knowledge of OWASP Top 10; Experience with AWS Security Hub and GuardDuty.',
        reason: 'Poor understanding of SQL injection mitigations beyond simple escaping; lacks depth in OAuth2 flows.',
        tech: [
            {q: "How do you prevent SQL Injection correctly?", a: "I use prepared statements, but I don't know how they handle binary data or complex joins safely."},
            {q: "Explain OAuth2 Authorization Code flow vs Implicit flow.", a: "Authorization Code is for servers, Implicit is for browsers. I'm not clear on the security risk of Implicit flow."}
        ],
        scenario: "An unauthorized entity is attempting to access private S3 buckets."
    },
    { 
        id: 'JD2012', cand: 'Kiran', role: 'Mobile Developer (Flutter)', pid: 'P212', pan: 'Nisha', email: 'nisha.n@panel.ai', level: 'moderate',
        jd: 'Developing cross-platform apps with Flutter and Dart; State management using Provider or Bloc; Experience with native integrations.',
        reason: 'Basic Bloc pattern knowledge; unable to optimize widget rebuilds.',
        tech: [
            {q: "How do you optimize Widget build performance?", a: "I use const constructors, but I don't know how to profile rebuilds using the DevTools."},
            {q: "Provider vs Bloc?", a: "I use Provider for small apps and Bloc for large ones. I haven't worked with complex streams."}
        ],
        scenario: "A Flutter app is dropping frames during list scrolling."
    },
    { 
        id: 'JD2013', cand: 'Rohit', role: 'QA Lead', pid: 'P213', pan: 'Riya', email: 'riya.r@panel.ai', level: 'high',
        jd: 'Leading QA teams and defining test strategies; Automated and manual testing expertise; Experience with JIRA and test management tools.',
        reason: 'Weak strategy for regression testing in a fast-paced CI/CD environment.',
        tech: [
            {q: "How do you define a test strategy for a microservices architecture?", a: "I focus on end-to-end testing. I haven't implemented contract testing or consumer-driven tests."},
            {q: "How do you manage bug prioritization with stakeholders?", a: "I use a simple priority matrix, but I struggle when everything is marked as high priority."}
        ],
        scenario: "A critical bug reached production despite 100% test coverage."
    },
    { 
        id: 'JD2014', cand: 'Nikhil', role: 'System Administrator', pid: 'P214', pan: 'Shruthi', email: 'shruthi.s@panel.ai', level: 'low',
        jd: 'Linux server administration (Ubuntu/CentOS); Shell scripting for automation; Managing network services (DNS, DHCP, SMTP).',
        reason: 'Inability to troubleshoot DNS lookup failures or manage SSH permissions properly.',
        tech: [
            {q: "How do you check for open ports on a remote server?", a: "I use telnet or netstat, but I don't know the specific flags for advanced cases."},
            {q: "How do you fix a \"Permission Denied (publickey)\" error in SSH?", a: "I check the .ssh folder, but I don't know how to set the correct folder permissions."}
        ],
        scenario: "A production server is unresponsive via SSH."
    },
    { 
        id: 'JD2017', cand: 'Sanjay', role: 'Product Manager', pid: 'P217', pan: 'Meera', email: 'meera.m@panel.ai', level: 'moderate',
        jd: 'Product Management lifecycle; Agile methodologies; Stakeholder communication and roadmap planning.', 
        reason: 'Basic understanding of Product lifecycle; lacks depth in data-driven prioritization.',
        tech: [
            {q: "How do you prioritize features in a product roadmap?", a: "I use a mix of stakeholder feedback and user needs."},
            {q: "Can you follow up on that—what specific framework like RICE or MoSCoW do you prefer?", a: "I have heard of RICE, but I usually just use a simple High/Medium/Low priority list."},
            {q: "How do you handle a situation where a key feature is delayed?", a: "I communicate with the stakeholders and try to adjust the timeline."},
            {q: "What specifically would you include in that stakeholder communication to manage expectations?", a: "I would tell them the new date and briefly explain the technical blocker."}
        ],
        scenario: "Suppose your primary user segment is pivoting; how do you adjust the roadmap?"
    },
    { 
        id: 'JD2018', cand: 'Deepak', role: 'Full Stack Engineer', pid: 'P218', pan: 'Revathi', email: 'revathi.r@panel.ai', level: 'high',
        jd: 'Full Stack Development with React, Node.js, and MongoDB; Deep understanding of system design and scalability; Experience with CI/CD and cloud deployments.', 
        reason: 'Exceptional depth shown in React-Node.js integration and distributed systems scaling; answered all in-depth follow-ups with precision.',
        tech: [
            {q: "How do you handle state management across a globally distributed React application?", a: "I use a combination of Redux and server-side state sync, but I prefer a centralized event-driven architecture for high consistency."},
            {q: "In-depth Follow-up: For that event-driven architecture, how do you manage eventual consistency specifically between the Node.js backend and the distributed database?", a: "I implement an outbox pattern for reliable message delivery and use idempotent consumers to ensure we don't process duplicate events during sync."},
            {q: "Deep Probe: What happens if the outbox table itself grows too large? How do you scale the message relay without losing order?", a: "I'd use partitioned outbox tables based on entity ID and implement a sharded polling consumer to maintain ordering within specific partitions."},
            {q: "Scenario: Your MongoDB cluster is hitting 90% CPU during write spikes. How do you triage this in real-time?", a: "I check the profiling logs for long-running queries first. If indexing is fine, I check the shard key distribution to see if one shard is being \"hot-spotted\"."},
            {q: "Follow-up: If hotspotting is confirmed, what's your strategy for re-sharding without significant downtime?", a: "I would analyze the current key distribution and select a more diverse compound shard key, then use the live resharding feature while monitoring catch-up lag closely."}
        ],
        scenario: "A primary region failure requires a multi-master DB failover with zero data loss."
    }
];

// --- GENERATION (ALL CASES) ---
const allActiveIds = cases.map(c => c.id);

// JD DATA
const jdLines = ['Job Interview ID,JD'];
cases.forEach(c => jdLines.push(`${c.id},${esc(c.jd)}`));
fs.writeFileSync(jdFile, jdLines.join('\n'));

// L1 DATA
const l1Lines = ['Job Interview ID,Candidate Name,role,panel_member_id,Panel Name,panel_member_email,JD,L1_decision,L1 Transcript'];
cases.forEach(c => {
    // START WITH NEUTRALITY
    let t = sNeutrality(c.pan, c.cand) + "\n";
    
    // ADD NOISE IF APPLICABLE
    if (c.noise) t += sNoise(c.pan, c.cand) + "\n";

    // ADD TECH PROBING
    c.tech.forEach((q, idx) => {
        t += `${c.pan}: ${q.q}\n${c.cand}: ${q.a}\n`;
        // INTERJECT MID-NOISE
        if (c.noise && idx === 1) t += sNoise(c.pan, c.cand) + "\n";

        if (c.level === 'high') {
            t += `${c.pan}: Can you elaborate on the internal low-level implementation for that specific approach?\n${c.cand}: I'm not very clear on those internal low-level details right now.\n`;
        }
    });

    if (c.level === 'high') {
        t += sScenario(c.pan, c.cand, c.scenario) + "\n";
        t += sLeadership(c.pan, c.cand) + "\n";
        t += sBehavioral(c.pan, c.cand) + "\n";
        t += `${c.pan}: Final check on your framework knowledge—what's the most critical bottleneck you've solved recently?\n${c.cand}: I just followed the existing pattern and it worked. I haven't solved bottlenecks.\n`;
    }

    t += `${c.pan}: Thank you for your time.`;

    l1Lines.push(`${c.id},${c.cand},${c.role},${c.pid},${c.pan},${c.email},${esc(c.jd)},Select,${esc(t)}`);
});
fs.writeFileSync(l1File, l1Lines.join('\n'));

// L2 DATA
const l2Lines = ['Job Interview ID,candidate_name,role,panel_member_id,panel_member_name,panel_member_email,JD,l2_decision,L2 Rejected Reason'];
cases.forEach(c => {
    l2Lines.push(`${c.id},${c.cand},${c.role},${c.pid},${c.pan},${c.email},${esc(c.jd)},Reject,${esc(c.reason)}`);
});
fs.writeFileSync(l2File, l2Lines.join('\n'));

console.log(`✓ Generated: ${jdFile} (${allActiveIds.join(', ')})`);
console.log(`✓ Generated: ${l1File} (${allActiveIds.join(', ')})`);
console.log(`✓ Generated: ${l2File} (${allActiveIds.join(', ')})`);
console.log(`SUCCESS: All 14 test cases (DATA series) generated with specified levels and identities.`);
