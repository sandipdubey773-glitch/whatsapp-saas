import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const PLAN_COLORS = {
  starter: { bg: 'rgba(99,102,241,0.12)', text: '#818cf8', label: 'Starter' },
  growth: { bg: 'rgba(6,182,212,0.12)', text: '#22d3ee', label: 'Growth' },
  pro: { bg: 'rgba(245,158,11,0.12)', text: '#fbbf24', label: 'Pro' }
};
const AI_LABELS = {
  gemini: 'Gemini',
  openai: 'GPT-4o',
  claude: 'Claude',
  openrouter: 'OpenRouter',
};

export default function ClientCard({ client, onToggle, onDelete, onEdit, onLogs }) {
  const navigate = useNavigate();
  const [showPortal, setShowPortal] = useState(false);
  const [showWA, setShowWA] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [bcNumbers, setBcNumbers] = useState('');
  const [bcMessage, setBcMessage] = useState('');
  const [bcSending, setBcSending] = useState(false);
  const [bcResult, setBcResult] = useState(null);
  const [waPhone, setWaPhone] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [waStatus, setWaStatus] = useState(client.waStatus || 'close');
  const [waLoading, setWaLoading] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [waError, setWaError] = useState('');

  const planInfo = PLAN_COLORS[client.plan] || PLAN_COLORS.starter;
  const isActive = client.status === 'active' || client.active === true;
  const initials = (client.name || '??').substring(0, 2).toUpperCase();

  // Regenerate QR
  const handleGetQR = async () => {
    setWaLoading(true);
    setWaError('');
    setQrCode('');
    setPairingCode('');
    try {
      const data = await api.getQR(client.id);
      if (data.qr) setQrCode(data.qr);
      if (data.pairingCode) setPairingCode(data.pairingCode);
    } catch (e) { setWaError('QR generate nahi hua'); }
    setWaLoading(false);
  };

  // Connect via pairing code
  const handleConnectWA = async () => {
    if (!waPhone.trim()) return;
    setWaLoading(true);
    setWaError('');
    try {
      const data = await api.connectWA(client.id, waPhone.trim());
      if (data.pairingCode) setPairingCode(data.pairingCode);
      if (data.qr) setQrCode(data.qr);
      startWAPoll();
    } catch (e) { setWaError('Connection failed'); }
    setWaLoading(false);
  };

  // Disconnect
  const handleDisconnect = async () => {
    setWaLoading(true);
    try {
      await api.disconnectWA(client.id);
      setWaStatus('close');
      setQrCode('');
      setPairingCode('');
      setShowWA(false);
    } catch (e) { setWaError('Disconnect failed'); }
    setWaLoading(false);
  };

  // Poll WA status
  const startWAPoll = useCallback(() => {
    const interval = setInterval(async () => {
      try {
        const clients = await api.getClients();
        const updated = clients.find(c => c.id === client.id);
        if (updated) {
          setWaStatus(updated.waStatus || 'close');
          if (updated.waStatus === 'open') clearInterval(interval);
        }
      } catch (e) {}
    }, 3000);
    setTimeout(() => clearInterval(interval), 60000);
  }, [client.id]);

  useEffect(() => {
    if (showWA) handleGetQR();
  }, [showWA]);

  const handleSendReport = async () => {
    setReporting(true);
    try { await api.sendReport(client.id); } catch (e) {}
    setReporting(false);
  };

  const portalUrl = `${window.location.origin}/app/client-login`;

  return (
    <>
      <div className="glass-card" style={{
        padding: '24px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Top accent line */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: isActive
            ? 'linear-gradient(90deg, #22c55e, #6366f1)'
            : 'linear-gradient(90deg, #64748b, #1e293b)'
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
          {/* Avatar */}
          <div style={{
            width: '52px', height: '52px',
            borderRadius: '14px',
            background: isActive
              ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
              : 'linear-gradient(135deg, #334155, #475569)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            fontWeight: '800',
            color: 'white',
            flexShrink: 0,
            boxShadow: isActive ? '0 4px 12px rgba(99,102,241,0.3)' : 'none'
          }}>
            {initials}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#f1f5f9', margin: 0 }}>
                {client.name || 'Unnamed'}
              </h3>
              <span className="badge" style={{
                background: planInfo.bg,
                color: planInfo.text
              }}>{planInfo.label}</span>
              {client.aiProvider && (
                <span className="badge" style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399' }}>
                  🤖 {AI_LABELS[client.aiProvider] || client.aiProvider}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
              {/* Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className={`status-dot ${isActive ? 'active' : 'inactive'}`} />
                <span style={{ fontSize: '0.8rem', color: isActive ? '#22c55e' : '#64748b' }}>
                  {isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              {/* WA Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className={`status-dot ${waStatus === 'open' ? 'connected' : 'inactive'}`} />
                <span style={{ fontSize: '0.8rem', color: waStatus === 'open' ? '#06b6d4' : '#64748b' }}>
                  WA: {waStatus === 'open' ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>

          {/* Toggle Switch */}
          <button
            onClick={() => onToggle(client.id)}
            style={{
              width: '44px', height: '24px',
              borderRadius: '12px', border: 'none', cursor: 'pointer',
              position: 'relative', flexShrink: 0,
              background: isActive ? 'linear-gradient(135deg, #22c55e, #16a34a)' : '#334155',
              transition: 'all 0.3s ease',
              boxShadow: isActive ? '0 0 12px rgba(34,197,94,0.3)' : 'none'
            }}
          >
            <div style={{
              width: '18px', height: '18px', borderRadius: '50%',
              background: 'white', position: 'absolute',
              top: '3px', left: isActive ? '23px' : '3px',
              transition: 'all 0.3s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
            }} />
          </button>
        </div>  


        {/* Info Row */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/edit-client/' + client.id)}>
            Edit
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowPortal(true)}>
            Portal
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/client/' + client.id + '/inbox')}>
            Inbox
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => onLogs(client.id)}>
            Logs
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowWA(true)}
            style={{ color: waStatus === 'open' ? '#22d3ee' : '#f59e0b' }}>
            {waStatus === 'open' ? '📱 WA' : '🔌 WA'}
          </button>
          {client.reportPhone && (
            <button className="btn btn-secondary btn-sm" onClick={handleSendReport} disabled={reporting}>
              {reporting ? 'Sending...' : 'Report'}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => { setShowBroadcast(true); setBcResult(null); }}
            style={{ color: '#f59e0b' }}>
            📢 Broadcast
          </button>
          <button className="btn btn-danger btn-sm" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      {/* WhatsApp Connect Modal */}
      {showWA && (
        <div className="modal-overlay" onClick={() => { setShowWA(false); setWaPhone(''); setQrCode(''); setPairingCode(''); setWaError(''); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal__title">WhatsApp — {client.name}</h3>

            {waStatus === 'open' ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>✅</div>
                <p style={{ color: '#22c55e', fontWeight: '600', marginBottom: '20px' }}>Connected</p>
                <button className="btn btn-danger" onClick={handleDisconnect} disabled={waLoading}>
                  {waLoading ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                    Phone Number (with country code)
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      className="input"
                      placeholder="919876543210"
                      value={waPhone}
                      onChange={e => setWaPhone(e.target.value)}
                    />
                    <button className="btn btn-primary" onClick={handleConnectWA} disabled={waLoading || !waPhone.trim()}>
                      {waLoading ? '...' : 'Get Code'}
                    </button>
                  </div>
                </div>

                {pairingCode && (
                  <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '10px', padding: '16px', textAlign: 'center', marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '6px' }}>Pairing Code</div>
                    <div style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '0.3em', color: '#818cf8' }}>{pairingCode}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>Enter this in WhatsApp → Linked Devices</div>
                  </div>
                )}

                {qrCode && (
                  <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '8px' }}>Or scan QR Code</div>
                    <img src={qrCode} alt="QR" style={{ width: '200px', height: '200px', borderRadius: '10px', background: 'white', padding: '8px' }} />
                  </div>
                )}

                {!qrCode && !pairingCode && !waLoading && (
                  <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleGetQR}>
                    Generate QR Code
                  </button>
                )}

                {waLoading && <div style={{ textAlign: 'center', color: '#64748b', padding: '16px' }}>Loading...</div>}
              </>
            )}

            {waError && <div style={{ marginTop: '12px', color: '#ef4444', fontSize: '0.8rem' }}>⚠️ {waError}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setShowWA(false); setWaPhone(''); setQrCode(''); setPairingCode(''); setWaError(''); }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Modal */}
      {showBroadcast && (
        <div className="modal-overlay" onClick={() => setShowBroadcast(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3 className="modal__title">📢 Broadcast — {client.name}</h3>

            {!bcResult ? (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                    Phone Numbers <span style={{ color: '#64748b' }}>(ek line mein ek number, country code ke saath)</span>
                  </label>
                  <textarea
                    className="input"
                    rows={6}
                    value={bcNumbers}
                    onChange={e => setBcNumbers(e.target.value)}
                    placeholder={"919876543210\n918765432109\n917654321098"}
                    style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
                  />
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    {bcNumbers.split('\n').filter(n => n.trim().replace(/\D/g,'').length >= 10).length} valid numbers
                  </div>
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 6 }}>Message</label>
                  <textarea
                    className="input"
                    rows={4}
                    value={bcMessage}
                    onChange={e => setBcMessage(e.target.value)}
                    placeholder="Yahan apna message likho..."
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#f59e0b', marginBottom: 16 }}>
                  ⚠️ Meta API use hoga — sirf un numbers pe kaam karega jinse 24 ghante mein baat hui ho, ya approved template ho.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1, background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                    disabled={bcSending || !bcMessage.trim() || !bcNumbers.trim()}
                    onClick={async () => {
                      const nums = bcNumbers.split('\n').map(n => n.trim().replace(/\D/g,'')).filter(n => n.length >= 10);
                      if (!nums.length) return;
                      setBcSending(true);
                      try {
                        const r = await api.bulkSend(client.id, nums, bcMessage.trim());
                        setBcResult(r);
                      } catch(e) { setBcResult({ error: e.message }); }
                      setBcSending(false);
                    }}>
                    {bcSending ? 'Bhej raha...' : `📢 ${bcNumbers.split('\n').filter(n=>n.trim().replace(/\D/g,'').length>=10).length} numbers ko bhejo`}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setShowBroadcast(false)}>Cancel</button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                {bcResult.error ? (
                  <div style={{ color: '#ef4444' }}>❌ Error: {bcResult.error}</div>
                ) : (
                  <>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>Broadcast Complete!</div>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
                      <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: '10px 20px' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>{bcResult.sent}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Sent</div>
                      </div>
                      <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 20px' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>{bcResult.failed}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Failed</div>
                      </div>
                    </div>
                  </>
                )}
                <button className="btn btn-secondary" onClick={() => { setBcResult(null); setBcNumbers(''); setBcMessage(''); }}>
                  Naya Broadcast
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Portal URL Modal */}
      {showPortal && (
        <div className="modal-overlay" onClick={() => setShowPortal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal__title">Client Portal — {client.name}</h3>

            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>Login URL</div>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '10px 16px', fontFamily: 'monospace', fontSize: '0.8rem', color: '#818cf8', wordBreak: 'break-all', marginBottom: '12px' }}>
              {portalUrl}
            </div>

            {client.clientUsername && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Username</div>
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 12px', fontFamily: 'monospace', fontSize: '0.85rem', color: '#f1f5f9' }}>
                    {client.clientUsername}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Password</div>
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 12px', fontFamily: 'monospace', fontSize: '0.85rem', color: '#f1f5f9' }}>
                    {client.clientPassword}
                  </div>
                </div>
              </div>
            )}

            <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', padding: '10px 14px', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '16px' }}>
              Yeh details client ko bhejo — woh apne phone/PC pe login karke demo le sakte hain.
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-sm" onClick={() => {
                const text = `WhatsApp Bot Portal\nURL: ${portalUrl}\nUsername: ${client.clientUsername || ''}\nPassword: ${client.clientPassword || ''}`;
                navigator.clipboard?.writeText(text);
              }}>
                Copy All
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowPortal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
