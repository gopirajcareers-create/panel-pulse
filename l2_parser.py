"""
parsers/l2_parser.py
Parse L2 rejection reasons from BEF_Feedback.xlsx -> L2 CSV
Job Interview ID = Zoho ID / Candidate ID
"""

import pandas as pd


def parse_l2_to_csv(xlsx_path: str, output_csv: str = None) -> pd.DataFrame:
    df = pd.read_excel(xlsx_path)
    df.columns = [c.strip() for c in df.columns]

    rename_map = {}
    for col in df.columns:
        lower = col.lower()
        if "zoho" in lower or "candidate id" in lower:
            rename_map[col] = "Job_Interview_ID"
        elif "candidate name" in lower or "name" in lower:
            rename_map[col] = "Candidate_Name"
        elif "feedback" in lower or "reason" in lower or "rejection" in lower:
            rename_map[col] = "Rejection_Reason"

    df = df.rename(columns=rename_map)

    for col in ["Job_Interview_ID", "Candidate_Name", "Rejection_Reason"]:
        if col not in df.columns:
            df[col] = ""

    def classify(reason):
        reason_str = str(reason).lower()
        if "reject" in reason_str:
            return "Rejected"
        return "Selected / On Hold"

    df["Decision"] = df["Rejection_Reason"].apply(classify)

    output_cols = ["Job_Interview_ID", "Candidate_Name", "Rejection_Reason", "Decision"]
    df = df[output_cols]

    if output_csv:
        df.to_csv(output_csv, index=False)

    return df
