import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import VoiceChat from './pages/VoiceChat';
import Dashboard from './pages/Dashboard';
import ElderProfile from './pages/ElderProfile';
import MemoryView from './pages/MemoryView';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<VoiceChat />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<ElderProfile />} />
          <Route path="/profile/:elderId" element={<ElderProfile />} />
          <Route path="/memory" element={<MemoryView />} />
          <Route path="/memory/:elderId" element={<MemoryView />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
