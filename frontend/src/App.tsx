import { Toaster } from 'react-hot-toast';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import EvaluatePage from './pages/EvaluatePage';
import ResultsPage from './pages/ResultsPage';
import ChatPage from './pages/ChatPage';
import PanelInsightsPage from './pages/PanelInsightsPage';
import PanelProfilePage from './pages/PanelProfilePage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#1e1e28',
              color: '#f1f1f5',
              border: '1px solid rgba(255, 255, 255, 0.07)',
            },
          }}
        />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/evaluate" element={<ProtectedRoute><EvaluatePage /></ProtectedRoute>} />
          <Route path="/results" element={<ProtectedRoute><ResultsPage /></ProtectedRoute>} />
          <Route path="/results/:evaluationId" element={<ProtectedRoute><ResultsPage /></ProtectedRoute>} />
          <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
          <Route path="/panels" element={<ProtectedRoute><PanelInsightsPage /></ProtectedRoute>} />
          <Route path="/panels/:panelName" element={<ProtectedRoute><PanelProfilePage /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
