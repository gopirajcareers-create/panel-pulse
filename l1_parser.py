"""
parsers/l1_parser.py
Parse L1 interview transcript .docx -> L1 CSV
Job Interview ID = Zoho ID / Candidate ID
"""

import re
import pandas as pd
from docx import Document


INTERVIEWER_NAMES = {"Bharath Waj", "Swagat Senapati", "Preethi T", "Bharath", "Swagat"}


def parse_transcript(docx_path: str) -> dict:
    doc = Document(docx_path)
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    full_text = "\n".join(paragraphs)

    # Meta
    date_match = re.search(r"(\w+ \d+, \d{4})", full_text)
    time_match = re.search(r"(\d+:\d+\s*[AP]M)", full_text)
    duration_match = re.search(r"(\d+m \d+s)", full_text)

    # Each paragraph may look like: "Speaker Name   HH:MM\ntext\nmore text"
    # Parse speaker blocks from paragraphs
    qa_pairs = []
    interviewers_found = set()
    candidate_name = ""

    for para in paragraphs:
        # Match "Speaker Name   MM:SS" or "Speaker Name  H:MM:SS" at start
        m = re.match(r"^(.+?)\s{2,}(\d+:\d+(?::\d+)?)\n?(.*)", para, re.DOTALL)
        if m:
            speaker = m.group(1).strip()
            text = m.group(3).replace("\n", " ").strip()
            if not text:
                continue
            qa_pairs.append({"speaker": speaker, "text": text})
            if speaker in INTERVIEWER_NAMES:
                interviewers_found.add(speaker)
            elif speaker not in {"", "Transcript"} and not re.match(r"\d", speaker):
                if not candidate_name:
                    candidate_name = speaker

    # If candidate_name still not found, pick first non-interviewer speaker
    if not candidate_name:
        for qa in qa_pairs:
            if qa["speaker"] not in INTERVIEWER_NAMES and qa["speaker"] not in {"", "Transcript"}:
                candidate_name = qa["speaker"]
                break

    questions = [
        qa["text"] for qa in qa_pairs
        if qa["speaker"] in interviewers_found and len(qa["text"]) > 15
    ]
    answers = [
        qa["text"] for qa in qa_pairs
        if qa["speaker"] not in INTERVIEWER_NAMES and qa["speaker"] == candidate_name and len(qa["text"]) > 10
    ]

    return {
        "interview_date": date_match.group(1) if date_match else "",
        "interview_time": time_match.group(1) if time_match else "",
        "duration": duration_match.group(1) if duration_match else "",
        "candidate_name": candidate_name,
        "interviewer": " | ".join(sorted(interviewers_found)),
        "questions_asked": " || ".join(questions[:10]),
        "candidate_responses": " || ".join(answers[:10]),
        "full_transcript_snippet": full_text[:600],
        "source_file": docx_path,
    }


def parse_l1_to_csv(docx_paths: list, output_csv: str = None, zoho_id_map: dict = None) -> pd.DataFrame:
    rows = []
    for path in docx_paths:
        data = parse_transcript(path)
        job_interview_id = ""
        if zoho_id_map:
            job_interview_id = zoho_id_map.get(path, zoho_id_map.get(data["candidate_name"], ""))
        rows.append({
            "Job_Interview_ID": job_interview_id,
            "Candidate_Name": data["candidate_name"],
            "Interview_Date": data["interview_date"],
            "Interview_Time": data["interview_time"],
            "Duration": data["duration"],
            "Interviewer": data["interviewer"],
            "Questions_Asked": data["questions_asked"],
            "Candidate_Responses": data["candidate_responses"],
            "Full_Transcript_Snippet": data["full_transcript_snippet"],
            "Source_File": path,
        })

    df = pd.DataFrame(rows)
    if output_csv:
        df.to_csv(output_csv, index=False)
    return df
