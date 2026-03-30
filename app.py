"""
app.py  –  Interview CSV Processor
Converts JD (.docx), L1 transcripts (.docx), and L2 feedback (.xlsx) to CSV files.
Candidate ID / Zoho ID is used as Job Interview ID in all output CSVs.
"""

import os
import io
import tempfile
import pandas as pd
import streamlit as st

from parsers.jd_parser import parse_jd_to_csv, extract_jd_data
from parsers.l1_parser import parse_l1_to_csv, parse_transcript
from parsers.l2_parser import parse_l2_to_csv

st.set_page_config(
    page_title="Interview CSV Processor",
    page_icon="📋",
    layout="wide",
)

# ── Styles ─────────────────────────────────────────────────────────────────
st.markdown("""
<style>
    .block-container { padding-top: 1.5rem; }
    .stTabs [data-baseweb="tab-list"] { gap: 8px; }
    .stTabs [data-baseweb="tab"] {
        padding: 8px 20px;
        border-radius: 6px 6px 0 0;
        font-weight: 600;
    }
    .section-title { font-size: 1.1rem; font-weight: 700; color: #1f4e79; margin-bottom: 4px; }
    .info-box {
        background: #f0f7ff;
        border-left: 4px solid #2196f3;
        padding: 10px 14px;
        border-radius: 4px;
        margin-bottom: 12px;
        font-size: 0.88rem;
    }
    .success-box {
        background: #f0fff4;
        border-left: 4px solid #22c55e;
        padding: 10px 14px;
        border-radius: 4px;
        margin-bottom: 12px;
    }
</style>
""", unsafe_allow_html=True)

st.title("📋 Interview CSV Processor")
st.caption("Convert JD (.docx), L1 Transcripts (.docx), and L2 Feedback (.xlsx) to structured CSV files.")

tab_jd, tab_l1, tab_l2, tab_about = st.tabs(["📄 JD → CSV", "🎙️ L1 Transcript → CSV", "❌ L2 Rejection → CSV", "ℹ️ About"])


# ── TAB 1: JD ───────────────────────────────────────────────────────────────
with tab_jd:
    st.markdown('<p class="section-title">Job Description Converter</p>', unsafe_allow_html=True)
    st.markdown("""
    <div class="info-box">
    Upload the JD <code>.docx</code> file. Provide the <b>Candidate / Zoho ID</b> which will be used as the <b>Job Interview ID</b> in the output CSV.
    </div>
    """, unsafe_allow_html=True)

    col1, col2 = st.columns([2, 1])
    with col1:
        jd_file = st.file_uploader("Upload JD (.docx)", type=["docx"], key="jd_upload")
    with col2:
        jd_zoho_id = st.text_input("Candidate / Zoho ID", placeholder="e.g. ZR_224121_CAND", key="jd_zoho")

    if jd_file:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp:
            tmp.write(jd_file.read())
            tmp_path = tmp.name

        try:
            row = extract_jd_data(tmp_path, job_interview_id=jd_zoho_id)
            df_jd = pd.DataFrame([row])

            st.success("✅ JD parsed successfully!")
            st.dataframe(df_jd, use_container_width=True)

            csv_buffer = io.StringIO()
            df_jd.to_csv(csv_buffer, index=False)

            st.download_button(
                label="⬇️ Download JD.csv",
                data=csv_buffer.getvalue(),
                file_name="JD.csv",
                mime="text/csv",
            )
        except Exception as e:
            st.error(f"Error parsing JD: {e}")
        finally:
            os.unlink(tmp_path)


# ── TAB 2: L1 ───────────────────────────────────────────────────────────────
with tab_l1:
    st.markdown('<p class="section-title">L1 Interview Transcript Converter</p>', unsafe_allow_html=True)
    st.markdown("""
    <div class="info-box">
    Upload one or more L1 transcript <code>.docx</code> files. Assign a <b>Zoho ID</b> to each candidate — this becomes the <b>Job Interview ID</b>.
    </div>
    """, unsafe_allow_html=True)

    l1_files = st.file_uploader(
        "Upload L1 Transcripts (.docx) — multiple allowed",
        type=["docx"],
        accept_multiple_files=True,
        key="l1_upload",
    )

    zoho_id_map = {}
    parsed_previews = []

    if l1_files:
        st.markdown("**Assign Zoho ID to each transcript:**")
        tmp_paths = []
        for i, f in enumerate(l1_files):
            col_a, col_b = st.columns([2, 1])
            with col_a:
                st.text(f"📄 {f.name}")
            with col_b:
                zid = st.text_input(f"Zoho ID", key=f"l1_zid_{i}", placeholder="ZR_XXXXXX_CAND")

            with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp:
                tmp.write(f.read())
                tmp_path = tmp.name
            tmp_paths.append(tmp_path)
            zoho_id_map[tmp_path] = zid

        if st.button("🔄 Parse & Generate L1 CSV", type="primary", key="l1_parse"):
            try:
                rows = []
                for path in tmp_paths:
                    data = parse_transcript(path)
                    rows.append({
                        "Job_Interview_ID": zoho_id_map.get(path, ""),
                        "Candidate_Name": data["candidate_name"],
                        "Interview_Date": data["interview_date"],
                        "Interview_Time": data["interview_time"],
                        "Duration": data["duration"],
                        "Interviewer": data["interviewer"],
                        "Questions_Asked": data["questions_asked"],
                        "Candidate_Responses": data["candidate_responses"],
                        "Full_Transcript_Snippet": data["full_transcript_snippet"],
                        "Source_File": os.path.basename(path),
                    })

                df_l1 = pd.DataFrame(rows)
                st.success(f"✅ Parsed {len(df_l1)} transcript(s)!")
                st.dataframe(df_l1, use_container_width=True)

                csv_buffer = io.StringIO()
                df_l1.to_csv(csv_buffer, index=False)

                st.download_button(
                    label="⬇️ Download L1.csv",
                    data=csv_buffer.getvalue(),
                    file_name="L1.csv",
                    mime="text/csv",
                )
            except Exception as e:
                st.error(f"Error parsing L1 transcripts: {e}")
            finally:
                for p in tmp_paths:
                    try:
                        os.unlink(p)
                    except Exception:
                        pass


# ── TAB 3: L2 ───────────────────────────────────────────────────────────────
with tab_l2:
    st.markdown('<p class="section-title">L2 Rejection Reason Converter</p>', unsafe_allow_html=True)
    st.markdown("""
    <div class="info-box">
    Upload the L2 feedback/rejection <code>.xlsx</code> file. The <b>Zoho ID</b> column is automatically mapped as <b>Job Interview ID</b>.
    </div>
    """, unsafe_allow_html=True)

    l2_file = st.file_uploader("Upload L2 Feedback (.xlsx)", type=["xlsx"], key="l2_upload")

    if l2_file:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
            tmp.write(l2_file.read())
            tmp_path = tmp.name

        try:
            df_l2 = parse_l2_to_csv(tmp_path, output_csv=None)

            if df_l2 is not None:
                st.success(f"✅ Parsed {len(df_l2)} record(s)!")
                st.dataframe(df_l2, use_container_width=True)

                csv_buffer = io.StringIO()
                df_l2.to_csv(csv_buffer, index=False)

                st.download_button(
                    label="⬇️ Download L2.csv",
                    data=csv_buffer.getvalue(),
                    file_name="L2.csv",
                    mime="text/csv",
                )
        except Exception as e:
            st.error(f"Error parsing L2 feedback: {e}")
        finally:
            os.unlink(tmp_path)


# ── TAB 4: About ────────────────────────────────────────────────────────────
with tab_about:
    st.markdown("""
    ## About This Tool

    This app converts interview-related documents into structured CSV files, ready for ATS/database import.

    | Tab | Input | Output | Key Field |
    |-----|-------|--------|-----------|
    | **JD → CSV** | `Account_Manager_JD_v1.docx` | `JD.csv` | Candidate/Zoho ID → `Job_Interview_ID` |
    | **L1 Transcript → CSV** | Multiple `.docx` transcripts | `L1.csv` | Candidate/Zoho ID → `Job_Interview_ID` |
    | **L2 Rejection → CSV** | `BEF_Feedback.xlsx` | `L2.csv` | Zoho ID → `Job_Interview_ID` |

    ### Output CSV Schemas

    **JD.csv**
    `Job_Interview_ID, Job_Title, Experience_Required, Location, Education_Preference, Key_Responsibilities, Required_Skills_Competencies, Source_File`

    **L1.csv**
    `Job_Interview_ID, Candidate_Name, Interview_Date, Interview_Time, Duration, Interviewer, Questions_Asked, Candidate_Responses, Full_Transcript_Snippet, Source_File`

    **L2.csv**
    `Job_Interview_ID, Candidate_Name, Rejection_Reason, Decision`

    ---
    **Built with:** Python · Streamlit · python-docx · pandas
    """)
