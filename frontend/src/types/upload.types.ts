export interface FileData {
  name: string;
  type: 'jd' | 'l1' | 'l2';
  content: string;
  size: number;
}

export interface UploadRequest {
  jobId: string;
  panelName: string;
  candidateName: string;
  jd: string;
  l1Transcript: string;
  l2RejectionReason: string;
  panel_member_id?: string;
  panel_member_email?: string;
}
