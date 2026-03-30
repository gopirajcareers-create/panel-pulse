export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

export interface ApiError {
  status: number;
  message: string;
  details?: any;
}
