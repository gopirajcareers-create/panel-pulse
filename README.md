# Interview CSV Processor

A Streamlit app that converts interview documents into structured CSV files, using **Candidate ID / Zoho ID** as the **Job Interview ID** across all outputs.

## Supported Conversions

| Tab | Input Format | Output CSV |
|-----|-------------|------------|
| JD → CSV | `JD.docx` | `JD.csv` |
| L1 Transcript → CSV | `Transcript.docx` (multiple) | `L1.csv` |
| L2 Rejection → CSV | `BEF_Feedback.xlsx` | `L2.csv` |

## Setup & Run

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Output Schemas

### JD.csv
| Field | Description |
|-------|-------------|
| Job_Interview_ID | Candidate / Zoho ID |
| Job_Title | Title from JD |
| Experience_Required | Years of experience |
| Location | Job location |
| Education_Preference | e.g. MBA preferred |
| Key_Responsibilities | Pipe-separated responsibilities |
| Required_Skills_Competencies | Pipe-separated skills |
| Source_File | Original file name |

### L1.csv
| Field | Description |
|-------|-------------|
| Job_Interview_ID | Candidate / Zoho ID |
| Candidate_Name | Auto-detected from transcript |
| Interview_Date | Date of interview |
| Interview_Time | Time of interview |
| Duration | Duration of session |
| Interviewer | Interviewer name(s) |
| Questions_Asked | Key questions (double-pipe separated) |
| Candidate_Responses | Key responses (double-pipe separated) |
| Full_Transcript_Snippet | First 500 chars of transcript |
| Source_File | Original file name |

### L2.csv
| Field | Description |
|-------|-------------|
| Job_Interview_ID | Zoho ID from feedback sheet |
| Candidate_Name | Candidate name |
| Rejection_Reason | Full feedback text |
| Decision | Rejected / Selected / On Hold |

## File Structure

```
interview_processor/
├── app.py               # Streamlit UI
├── requirements.txt
├── README.md
└── parsers/
    ├── __init__.py
    ├── jd_parser.py     # JD .docx → CSV
    ├── l1_parser.py     # Transcript .docx → CSV
    └── l2_parser.py     # BEF Feedback .xlsx → CSV
```
