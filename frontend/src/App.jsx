import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import AddClient from './pages/AddClient';
import InboxPage from './pages/InboxPage';
import LeadsDashboard from './pages/LeadsDashboard';
import ClientLogin from './pages/ClientLogin';
import ClientPortal from './pages/ClientPortal';
import './styles.css';

const AdminLogs = () => {
  const [clients, setClients] = useState([]);
  useEffect(() => {
    fetch('/admin/clients').then(r=>r.json()).then(setClients).catch(()=>{});
  }, []);
  return <div style={{padding:'40px',textAlign:'center',color:'#94a3b8'}}>Logs page — select a client from dashboard</div>;
};

export default function App() {
  const getAdminToken = () => localStorage.getItem('adminToken');
  const [adminToken, setAdminToken] = useState(getAdminToken());
  const [clientToken, setClientToken] = useState(localStorage.getItem('clientToken'));

  const handleAdminLogin = (tok) => {
    localStorage.setItem('adminToken', tok);
    setAdminToken(tok);
  };
  const handleAdminLogout = () => {
    localStorage.removeItem('adminToken');
    setAdminToken(null);
  };
  const handleClientLogin = () => {
    setClientToken(localStorage.getItem('clientToken'));
  };
  const handleClientLogout = () => {
    localStorage.removeItem('clientToken');
    localStorage.removeItem('clientName');
    setClientToken(null);
  };

  const basename = import.meta.env.PROD ? '/app' : '/';

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/client-login" element={
          <ClientLogin onLogin={handleClientLogin} />
        } />
        <Route path="/client-portal" element={
          clientToken ? <ClientPortal onLogout={handleClientLogout} /> : <Navigate to="/client-login" />
        } />
        <Route path="/add-client" element={
          adminToken ? <AddClient onBack={() => window.history.back()} /> : <Navigate to="/" />
        } />
        <Route path="/edit-client/:id" element={
          adminToken ? <AddClient onBack={() => window.history.back()} /> : <Navigate to="/" />
        } />
        <Route path="/client/:id/logs" element={
          adminToken ? <AdminLogs /> : <Navigate to="/" />
        } />
        <Route path="/leads" element={
          adminToken ? <LeadsDashboard onBack={() => window.history.back()} /> : <Navigate to="/" />
        } />
        <Route path="/client/:id/inbox" element={
          adminToken ? <InboxPage onBack={() => window.history.back()} /> : <Navigate to="/" />
        } />
        <Route path="/" element={
          adminToken ? <AdminDashboard onLogout={handleAdminLogout} /> : <Login onLogin={handleAdminLogin} />
        } />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
