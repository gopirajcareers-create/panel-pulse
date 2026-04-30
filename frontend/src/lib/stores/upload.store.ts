import { create } from 'zustand';
import type { FileData } from '@/types/upload.types';

interface UploadState {
  files: Map<string, FileData>;
  uploadProgress: number;
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error';
  uploadMessage: string;
  l1Transcript: string | null;
  addFile: (type: 'jd' | 'l1' | 'l2', file: FileData) => void;
  removeFile: (type: string) => void;
  setProgress: (progress: number) => void;
  setStatus: (status: 'idle' | 'uploading' | 'success' | 'error') => void;
  setMessage: (message: string) => void;
  setL1Transcript: (transcript: string) => void;
  clear: () => void;
  getFile: (type: string) => FileData | undefined;
}

export const useUploadStore = create<UploadState>((set, get) => ({
  files: new Map(),
  uploadProgress: 0,
  uploadStatus: 'idle',
  uploadMessage: '',
  l1Transcript: null,
  addFile: (type, file) => {
    set((state) => {
      const newFiles = new Map(state.files);
      newFiles.set(type, file);
      return { files: newFiles };
    });
  },
  removeFile: (type) => {
    set((state) => {
      const newFiles = new Map(state.files);
      newFiles.delete(type);
      return { files: newFiles };
    });
  },
  setProgress: (progress) => set({ uploadProgress: progress }),
  setStatus: (status) => set({ uploadStatus: status }),
  setMessage: (message) => set({ uploadMessage: message }),
  setL1Transcript: (transcript) => set({ l1Transcript: transcript }),
  clear: () =>
    set({
      files: new Map(),
      uploadProgress: 0,
      uploadStatus: 'idle',
      uploadMessage: '',
      l1Transcript: null,
    }),
  getFile: (type) => get().files.get(type),
}));
