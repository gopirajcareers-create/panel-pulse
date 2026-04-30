const fs = require('fs');

// JD file
let jdFile = fs.readFileSync('TC01_JD.csv', 'utf8').split('\n');
for(let i=0; i<jdFile.length; i++) {
    if(jdFile[i].startsWith('JD14312,')) jdFile[i] = 'JD14312,"Security Engineer. OAuth2, PKCE, mobile API security."';
    if(jdFile[i].startsWith('JD14313,')) jdFile[i] = 'JD14313,"Project Manager. Agile, Scrum, Jira, and Budget/Financial Forecasting for enterprise projects."';
    if(jdFile[i].startsWith('JD14314,')) jdFile[i] = 'JD14314,"Database Administrator. High Availability, PostgreSQL, Query Tuning, and Database Sharding."';
    if(jdFile[i].startsWith('JD14316,')) jdFile[i] = 'JD14316,"C++ Developer. Multithreading, memory management, C++17, and backend services."';
}
fs.writeFileSync('TC01_JD.csv', jdFile.join('\n'));

// L2 file
let l2File = fs.readFileSync('TC01_L2.csv', 'utf8').split('\n');
for (let i = 0; i < l2File.length; i++) {
    if (l2File[i].startsWith('JD14312,')) {
        l2File[i] = 'JD14312,Sachin Tendulkar,Security Engineer,PID1412,Rahul Dravid,rahul.d@hr.tech,"Security Engineer. OAuth2, PKCE, mobile API security.",Reject,Failed to articulate deep mobile API security architecture.';
    }
    if (l2File[i].startsWith('JD14313,')) {
        l2File[i] = 'JD14313,Shubman Gill,Project Manager,PID1213,Rohit Sharma,rohit.s@hr.tech,"Project Manager. Agile, Scrum, Jira, and Budget/Financial Forecasting for enterprise projects.",Reject,Candidate lacks experience managing budgets and financial forecasting for large projects.';
    }
    if (l2File[i].startsWith('JD14314,')) {
        l2File[i] = 'JD14314,Rishabh Pant,Database Administrator,PID1414,Ravindra Jadeja,ravindra.j@hr.tech,"Database Administrator. High Availability, PostgreSQL, Query Tuning, and Database Sharding.",Reject,Failed to articulate effective database sharding strategies for write-heavy workloads.';
    }
    if (l2File[i].startsWith('JD14316,')) {
        l2File[i] = 'JD14316,Virat Kohli,C++ Developer,PID1416,MS Dhoni,ms.d@hr.tech,"C++ Developer. Multithreading, memory management, C++17, and backend services.",Reject,Lacked deep understanding of lock-free atomic contention in modern C++.';
    }
}
fs.writeFileSync('TC01_L2.csv', l2File.join('\n'));

// L1 file
let l1Text = fs.readFileSync('TC01_L1.csv', 'utf8');

// Candidate/Panel replacement for 13
l1Text = l1Text.replace(/Sita Ram/g, 'Shubman Gill');
l1Text = l1Text.replace(/Sita/g, 'Shubman');
l1Text = l1Text.replace(/Vijay Kumar/g, 'Rohit Sharma');
l1Text = l1Text.replace(/Vijay/g, 'Rohit');
l1Text = l1Text.replace(/vijay\.k@hr\.tech/g, 'rohit.s@hr.tech');

// Candidate/Panel replacement for 14
l1Text = l1Text.replace(/Srinidhi Ramesh/g, 'Rishabh Pant');
l1Text = l1Text.replace(/Srinidhi/g, 'Rishabh');
l1Text = l1Text.replace(/Anil Kumble/g, 'Rishabh Pant'); 
l1Text = l1Text.replace(/Deepika Padmanabhan/g, 'Ravindra Jadeja');
l1Text = l1Text.replace(/Deepika/g, 'Ravindra');
l1Text = l1Text.replace(/deepika\.p@hr\.tech/g, 'ravindra.j@hr.tech');
l1Text = l1Text.replace(/VVS Laxman/g, 'Ravindra Jadeja');
l1Text = l1Text.replace(/vvs\.l@hr\.tech/g, 'ravindra.j@hr.tech');

fs.writeFileSync('TC01_L1.csv', l1Text);
console.log("All datasets including 13 and 14 fully fixed.");
