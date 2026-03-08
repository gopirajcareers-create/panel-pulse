require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const healthRoutes = require('./routes/health');
const embeddingsRoutes = require('./routes/embeddings');
const searchRoutes = require('./routes/search');
const jdRoutes = require('./routes/jd');
const panelRoutes = require('./routes/panel');
const { connectToMongo } = require('./services/mongoClient');

const app = express();
app.use(morgan('tiny'));
app.use(express.json());

// Environment variables with defaults for development
const PORT = process.env.API_PORT || process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const NODE_ENV = process.env.NODE_ENV || 'development';

// CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://panel-pulse.vercel.app',  // Production frontend
    FRONTEND_URL,                        // From env variable
    process.env.ALLOWED_ORIGIN,
    'http://localhost:5173',
    'http://localhost:3000'
  ].filter(Boolean);

  // Allow matching origins, *.vercel.app previews, or no-origin requests (curl etc.)
  const isVercelPreview = origin && origin.endsWith('.vercel.app');
  if (!origin || allowedOrigins.includes(origin) || isVercelPreview) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  const requestedHeaders = req.header('access-control-request-headers');
  res.setHeader('Access-Control-Allow-Headers', requestedHeaders || 'Content-Type, Authorization, X-Request-ID, X-Requested-With');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/embeddings', embeddingsRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/jd', jdRoutes);
app.use('/api/v1/panel', panelRoutes);

const port = PORT;

async function start() {
  try {
    await connectToMongo();
    app.listen(port, () => {
      console.log(`\n✅ Server running on http://localhost:${port}`);
      console.log(`📍 Environment: ${NODE_ENV}`);
      console.log(`🔗 Frontend URL: ${FRONTEND_URL}`);
      console.log(`📊 API Base: http://localhost:${port}/api/v1`);
      console.log(`🤖 GROQ configured: ${!!process.env.GROQ_API_KEY}`);
      console.log(`🗄️  MongoDB URI set: ${!!process.env.MONGODB_URI}\n`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();
