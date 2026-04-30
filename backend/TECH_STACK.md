Tech Stack

Languages & Runtimes: Node.js (>=18) — backend; TypeScript + React (frontend)
Frontend: React 19.2.0, Vite 7.3.1, TailwindCSS 4.2.1, Zustand 5.0.11
UI & UX: shadcn/ui primitives, Lucide React 0.577.0, Framer Motion 12.35.0, react-hot-toast 2.6.0
Forms & Validation: react-hook-form 7.71.2, zod 4.3.6
Data Viz & Uploads: Recharts 3.7.0, react-dropzone 15.0.0
HTTP & APIs: Axios 1.13.6
Testing: Vitest 1.5.4, @testing-library/react 14.x
Build Tools: Vite (dev + build), npm scripts
Backend: Express 4.18.2, mongodb driver 4.10.0, dotenv 16.x, morgan 1.10.0
LLM / AI: GROQ API (llama-3.3-70b-versatile via env GROQ_API_KEY)
Search / Retrieval: MongoDB Atlas Search (BM25) + stored vector embeddings (semantic search); hybrid search supported
Deployment: Frontend → Vercel, Backend → Railway
Important env vars: GROQ_API_KEY, GROQ_MODEL_NAME, VITE_API_BASE_URL