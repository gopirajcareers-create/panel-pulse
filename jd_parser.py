"""
parsers/jd_parser.py
Parse Account Manager JD .docx -> JD CSV
Job Interview ID = Zoho ID / Candidate ID
"""

import re
import pandas as pd
from docx import Document


def extract_jd_data(docx_path: str, job_interview_id: str = "") -> dict:
    doc = Document(docx_path)
    full_text = "\n".join(p.text.strip() for p in doc.paragraphs if p.text.strip())

    # Section extraction helpers
    def get_section(text, start_keywords, end_keywords=None):
        lines = text.split("\n")
        collecting = False
        section_lines = []
        for line in lines:
            if any(kw.lower() in line.lower() for kw in start_keywords):
                collecting = True
                continue
            if collecting:
                if end_keywords and any(kw.lower() in line.lower() for kw in end_keywords):
                    break
                if line.strip():
                    section_lines.append(line.strip("- ").strip())
        return " | ".join(section_lines)

    responsibilities = get_section(
        full_text,
        ["Key Responsibilities"],
        ["Required Skills", "Competencies"]
    )
    skills = get_section(
        full_text,
        ["Required Skills", "Competencies"],
        []
    )

    # Extract specific fields
    exp_match = re.search(r"Experience Level\s*[:\-]?\s*([\d\-]+\s*years?)", full_text, re.IGNORECASE)
    location_match = re.search(r"Location\s*[:\-]?\s*(.+)", full_text, re.IGNORECASE)
    edu_match = re.search(r"(MBA\s*preferred|MBA\s*required)", full_text, re.IGNORECASE)

    row = {
        "Job_Interview_ID": job_interview_id,
        "Job_Title": "Account Manager",
        "Experience_Required": exp_match.group(1).strip() if exp_match else "",
        "Location": location_match.group(1).strip() if location_match else "",
        "Education_Preference": edu_match.group(1).strip() if edu_match else "",
        "Key_Responsibilities": responsibilities,
        "Required_Skills_Competencies": skills,
        "Source_File": docx_path,
    }
    return row


def parse_jd_to_csv(docx_path: str, output_csv: str, job_interview_id: str = ""):
    row = extract_jd_data(docx_path, job_interview_id)
    df = pd.DataFrame([row])
    df.to_csv(output_csv, index=False)
    return df
