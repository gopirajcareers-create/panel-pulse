import { apiClient } from './client';

export type SearchMode = 'hybrid' | 'bm25' | 'vector';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: ChatSource[];
  isLoading?: boolean;
}

export interface ChatSource {
  job_interview_id: string | null;
  candidate_name: string | null;
  panel_member_name: string | null;
  score: number | null;
  confidence: string | null;
  evaluated_at: string | null;
}

export interface ChatResponse {
  success: boolean;
  reply: string;
  sources: ChatSource[];
  searchQuery: string;
  searchMode: SearchMode;
  resultCount: number;
  timestamp: string;
}

export interface ChatHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatSearchSettings {
  searchMode: SearchMode;
  bm25Weight: number;    // 0–1
  vectorWeight: number;  // 0–1
}

export const chatApi = {
  async sendMessage(
    message: string,
    history: ChatHistoryEntry[] = [],
    searchSettings: ChatSearchSettings = { searchMode: 'hybrid', bm25Weight: 0.4, vectorWeight: 0.6 }
  ): Promise<ChatResponse> {
    const response = await apiClient.post<ChatResponse>('/api/v1/chat', {
      message,
      history,
      searchMode: searchSettings.searchMode,
      bm25Weight: searchSettings.bm25Weight,
      vectorWeight: searchSettings.vectorWeight,
    });
    return response.data;
  },
};

export default chatApi;
