import React, { useState, useEffect, useRef, useCallback } from 'react';
import { clientApi } from '../api.js';
import ConversationLog from '../components/ConversationLog.jsx';
import '../styles.css';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'abhi';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
function fmtPhone(p) {
  if (!p) return '—';
  const n = String(p).replace(/\D/g, '');
  if (n.length === 12 && n.startsWith('91')) return `+91 ${n.slice(2,7)} ${n.slice(7)}`;
  if (n.length === 10) return `+91 ${n.slice(0,5)} ${n.slice(5)}`;
  return p;
}
function getInit(p) { const n = String(p||'').replace(/\D/g,''); return n ? n.slice(-2,-1)||'?' : '?'; }

export default function ClientPortal({ onLogout }) {
  const [me, setMe] = useState(null);
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [reportPreview, setReportPreview] = useState('');
  const [prompt, setPrompt] = useState('');
  const [activeTab, setActiveTab] = useState('home');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [botStatus, setBotStatus] = useState(null);
  const [reportSending, setReportSending] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [metaConfig, setMetaConfig] = useState({ metaPhoneNumberId: '', metaVerifyToken: '', hasAccessToken: false, webhookUrl: '' });
  const [metaForm, setMetaForm] = useState({ metaPhoneNumberId: '', metaAccessToken: '', metaVerifyToken: '' });
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaTesting, setMetaTesting] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  // WA Baileys connect state
  const [waStatus, setWaStatus] = useState('close');
  const [waQr, setWaQr] = useState('');
  const [waPairingCode, setWaPairingCode] = useState('');
  const [waPhone, setWaPhone] = useState('');
  const [waConnecting, setWaConnecting] = useState(false);
  const [waError, setWaError] = useState('');
  const waPollRef = useRef(null);
  // Inbox state
  const [inboxConvs, setInboxConvs] = useState([]);
  const [inboxSel, setInboxSel] = useState(null);
  const [inboxTab, setInboxTab] = useState('All');
  const [inboxSearch, setInboxSearch] = useState('');
  const [inboxText, setInboxText] = useState('');
  const [inboxSending, setInboxSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newText, setNewText] = useState('');
  const [newSending, setNewSending] = useState(false);
  const [togglingBot, setTogglingBot] = useState(false);
  const chatEndRef = useRef(null);
  const inboxPollRef = useRef(null);

  useEffect(() => { fetchMe(); }, []);

  const fetchMe = async () => {
    try {
      const res = await clientApi.me();
      setMe(res.data);
      setBotStatus(res.data.status);
    } catch (err) {
      if (err.response?.status === 401) onLogout();
    } finally { setLoading(false); }
  };

  const fetchStats = async () => {
    try { const r = await clientApi.stats(); setStats(r.data); } catch {}
  };

  const fetchLogs = async () => {
    try { const r = await clientApi.logs(); setLogs(r.data.logs || []); } catch {}
  };

  const fetchReportPreview = async () => {
    try { const r = await clientApi.reportPreview(); setReportPreview(r.data.report || ''); } catch {}
  };

  const fetchPrompt = async () => {
    try { const r = await clientApi.getPrompt(); setPrompt(r.data.systemPrompt || ''); } catch {}
  };

  const loadInbox = useCallback(async () => {
    try {
      const r = await clientApi.getClientInbox();
      const sorted = (r.data.logs || []).sort((a,b) => new Date(b.lastUpdated)-new Date(a.lastUpdated));
      setInboxConvs(sorted);
      setInboxSel(prev => prev ? (sorted.find(c => c.id === prev.id) || prev) : prev);
    } catch {}
  }, []);

  const handleTab = (tab) => {
    setActiveTab(tab);
    setMsg('');
    if (tab === 'stats' && !stats) fetchStats();
    if (tab === 'logs' && logs.length === 0) fetchLogs();
    if (tab === 'report') fetchReportPreview();
    if (tab === 'prompt') fetchPrompt();
    if (tab === 'meta') { fetchMetaConfig(); fetchWAStatus(); }
    if (tab === 'inbox') {
      loadInbox();
      if (!inboxPollRef.current) inboxPollRef.current = setInterval(loadInbox, 5000);
    } else {
      if (inboxPollRef.current) { clearInterval(inboxPollRef.current); inboxPollRef.current = null; }
    }
  };

  useEffect(() => () => {
    if (inboxPollRef.current) clearInterval(inboxPollRef.current);
    if (waPollRef.current) clearInterval(waPollRef.current);
  }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [inboxSel?.messages?.length]);

  const handleToggle = async () => {
    try {
      const r = await clientApi.toggle();
      setBotStatus(r.data.status);
      setMsg(r.data.status === 'active' ? 'Bot ON ho gaya!' : 'Bot OFF ho gaya!');
    } catch (err) { setMsg('Error: ' + (err.response?.data?.error || err.message)); }
  };

  const handleSendReport = async () => {
    setReportSending(true); setMsg('');
    try {
      await clientApi.sendReport();
      setMsg('Report WhatsApp pe bhej di gayi!');
    } catch (err) { setMsg('Error: ' + (err.response?.data?.error || err.message)); }
    finally { setReportSending(false); }
  };

  const fetchMetaConfig = async () => {
    try {
      const r = await clientApi.getMetaConfig();
      setMetaConfig(r.data);
      setMetaForm(f => ({ ...f, metaPhoneNumberId: r.data.metaPhoneNumberId, metaVerifyToken: r.data.metaVerifyToken }));
    } catch {}
  };

  const [waBotPhone, setWaBotPhone] = useState('');

  const fetchWAStatus = useCallback(async () => {
    try {
      const r = await clientApi.getWAStatus();
      setWaStatus(r.data.status);
      if (r.data.botPhone) { setWaBotPhone(r.data.botPhone); setWaPhone(r.data.botPhone); }
      if (r.data.qr) setWaQr(r.data.qr);
      if (r.data.pairingCode) setWaPairingCode(r.data.pairingCode);
      if (r.data.status === 'open') {
        setWaQr(''); setWaPairingCode('');
        if (waPollRef.current) { clearInterval(waPollRef.current); waPollRef.current = null; }
      }
    } catch {}
  }, []);

  const startWAPoll = useCallback(() => {
    if (waPollRef.current) clearInterval(waPollRef.current);
    waPollRef.current = setInterval(fetchWAStatus, 3000);
    setTimeout(() => { if (waPollRef.current) { clearInterval(waPollRef.current); waPollRef.current = null; } }, 90000);
  }, [fetchWAStatus]);

  const handleWAConnect = async () => {
    setWaConnecting(true); setWaError(''); setWaQr(''); setWaPairingCode('');
    try {
      await clientApi.connectWA(waPhone.trim() || null);
      startWAPoll();
    } catch(e) { setWaError('Connection start nahi hua'); }
    setWaConnecting(false);
  };

  const handleWAGetQR = async () => {
    setWaConnecting(true); setWaError(''); setWaQr(''); setWaPairingCode('');
    try {
      await clientApi.connectWA(null);
      startWAPoll();
    } catch(e) { setWaError('QR generate nahi hua'); }
    setWaConnecting(false);
  };

  const handleWADisconnect = async () => {
    setWaConnecting(true);
    try {
      await clientApi.disconnectWA();
      setWaStatus('close'); setWaQr(''); setWaPairingCode('');
      if (waPollRef.current) { clearInterval(waPollRef.current); waPollRef.current = null; }
    } catch(e) { setWaError('Disconnect failed'); }
    setWaConnecting(false);
  };

  const handleSaveMeta = async () => {
    setMetaSaving(true); setMsg('');
    try {
      await clientApi.saveMetaConfig(metaForm);
      await fetchMetaConfig();
      setMetaForm(f => ({ ...f, metaAccessToken: '' }));
      setMsg('Meta credentials save ho gaye!');
    } catch (err) { setMsg('Error: ' + (err.response?.data?.error || err.message)); }
    finally { setMetaSaving(false); }
  };

  const handleTestMeta = async () => {
    setMetaTesting(true); setMsg('');
    try {
      await clientApi.testMeta(testPhone);
      setMsg('Test message bhej diya! WhatsApp check karo.');
    } catch (err) { setMsg('Error: ' + (err.response?.data?.error || err.message)); }
    finally { setMetaTesting(false); }
  };

  const handleSavePrompt = async () => {
    setPromptSaving(true); setMsg('');
    try {
      await clientApi.updatePrompt(prompt);
      setMsg('System prompt save ho gaya!');
    } catch (err) { setMsg('Error: ' + (err.response?.data?.error || err.message)); }
    finally { setPromptSaving(false); }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 16 }}>
      Loading...
    </div>
  );

  const p = me?.permissions || {};
  const inp = { width: '100%', background: '#0f172a', border: '1.5px solid #334155', borderRadius: 9, padding: '11px 13px', fontSize: 14, color: '#e2e8f0', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 };

  const TABS = [
    { key: 'home',   label: 'Home',           show: true },
    { key: 'inbox',  label: '💬 Inbox',       show: true },
    { key: 'stats',  label: 'Stats',          show: !!p.viewStats },
    { key: 'logs',   label: 'Chats',          show: !!p.viewLogs },
    { key: 'report', label: 'Report',         show: !!p.viewReportPreview || !!p.sendReport },
    { key: 'prompt', label: 'Prompt',         show: !!p.editPrompt },
    { key: 'meta',   label: 'WA Setup',       show: true },
  ].filter(t => t.show);

  // Inbox helpers
  const INBOX_TABS = ['All','Bot','Manual','Resolved'];
  const inboxFiltered = inboxConvs.filter(c => {
    if (inboxSearch) { const q=inboxSearch.toLowerCase(); if (!(c.userPhone||'').includes(q) && !(c.messages?.slice(-1)[0]?.content||'').toLowerCase().includes(q)) return false; }
    if (inboxTab==='Bot') return c.botEnabled!==false && c.status!=='resolved';
    if (inboxTab==='Manual') return c.botEnabled===false && c.status!=='resolved';
    if (inboxTab==='Resolved') return c.status==='resolved';
    return true;
  });
  const inboxCounts = { All: inboxConvs.length, Bot: inboxConvs.filter(c=>c.botEnabled!==false&&c.status!=='resolved').length, Manual: inboxConvs.filter(c=>c.botEnabled===false&&c.status!=='resolved').length, Resolved: inboxConvs.filter(c=>c.status==='resolved').length };

  const handleInboxSend = async () => {
    if (!inboxSel || !inboxText.trim()) return;
    setInboxSending(true);
    try { await clientApi.sendClientMsg(inboxSel.userPhone, inboxText.trim()); setInboxText(''); await loadInbox(); }
    catch (e) { setMsg('Error: ' + (e.response?.data?.error || e.message)); }
    finally { setInboxSending(false); }
  };
  const handleNewChat = async () => {
    if (!newPhone.trim() || !newText.trim()) return;
    setNewSending(true);
    try { await clientApi.sendClientMsg(newPhone.replace(/\D/g,''), newText.trim()); setShowNewChat(false); setNewPhone(''); setNewText(''); await loadInbox(); }
    catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setNewSending(false); }
  };
  const handleBotToggle = async () => {
    if (!inboxSel || togglingBot) return;
    setTogglingBot(true);
    try { const r = await clientApi.clientBotToggle(inboxSel.id); setInboxSel(prev=>({...prev,botEnabled:r.data.botEnabled})); await loadInbox(); }
    catch (e) { alert(e.message); }
    finally { setTogglingBot(false); }
  };
  const handleResolve = async () => {
    if (!inboxSel) return;
    try { const r = await clientApi.clientResolve(inboxSel.id); setInboxSel(prev=>({...prev,status:r.data.status})); await loadInbox(); }
    catch (e) { alert(e.message); }
  };
  const botOn = inboxSel?.botEnabled !== false;
  const isResolved = inboxSel?.status === 'resolved';

  const filteredLogs = logs.filter(l => !search || l.userPhone?.includes(search) || l.contactName?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a' }}>
      {/* Nav */}
      <nav style={{ background: '#1e293b', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🤖</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>{me?.name}</div>
            <div style={{ fontSize: 11, color: me?.waStatus === 'open' ? '#25d366' : '#f87171' }}>
              WhatsApp: {me?.waStatus === 'open' ? 'Connected' : 'Disconnected'}
            </div>
          </div>
        </div>
        <button onClick={onLogout} style={{ background: '#334155', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit' }}>Logout</button>
      </nav>

      {/* Tab bar */}
      <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => handleTab(t.key)} style={{ padding: '12px 20px', fontSize: 13, fontWeight: activeTab === t.key ? 700 : 500, color: activeTab === t.key ? '#25d366' : '#64748b', background: 'none', border: 'none', borderBottom: activeTab === t.key ? '2px solid #25d366' : '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px' }}>

        {msg && (
          <div style={{ background: msg.startsWith('Error') ? '#450a0a' : '#0f2d1f', border: `1px solid ${msg.startsWith('Error') ? '#7f1d1d' : '#166534'}`, borderRadius: 10, padding: '12px 16px', fontSize: 13, color: msg.startsWith('Error') ? '#f87171' : '#25d366', marginBottom: 20 }}>
            {msg}
          </div>
        )}

        {/* HOME */}
        {activeTab === 'home' && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0', marginBottom: 20 }}>Welcome, {me?.name}!</div>

            {/* Bot status card */}
            <div style={{ background: '#1e293b', borderRadius: 14, padding: 24, border: '1px solid #334155', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>Bot Status</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: botStatus === 'active' ? '#25d366' : '#f87171' }}>
                    {botStatus === 'active' ? 'ACTIVE' : 'INACTIVE'}
                  </div>
                </div>
                {p.toggleBot && (
                  <button onClick={handleToggle} style={{ background: botStatus === 'active' ? '#7f1d1d' : '#1a4731', border: `1.5px solid ${botStatus === 'active' ? '#ef4444' : '#25d366'}`, borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700, color: botStatus === 'active' ? '#f87171' : '#25d366', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {botStatus === 'active' ? 'Bot OFF karo' : 'Bot ON karo'}
                  </button>
                )}
              </div>
            </div>

            {/* Info cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#1e293b', borderRadius: 12, padding: 18, border: '1px solid #334155' }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Plan</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', textTransform: 'capitalize' }}>{me?.plan}</div>
              </div>
              <div style={{ background: '#1e293b', borderRadius: 12, padding: 18, border: '1px solid #334155' }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>AI Provider</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', textTransform: 'capitalize' }}>{me?.aiProvider}</div>
              </div>
            </div>

            {/* Send report shortcut */}
            {p.sendReport && (
              <div style={{ background: '#1e293b', borderRadius: 14, padding: 20, border: '1px solid #334155' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>Report bhejo</div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>Aaj tak ki sari conversations ka report WhatsApp pe bhejega</div>
                <button onClick={handleSendReport} disabled={reportSending} style={{ background: reportSending ? '#1a4731' : '#25d366', border: 'none', borderRadius: 9, padding: '10px 20px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: reportSending ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {reportSending ? 'Bhej raha...' : 'Report Send Karo'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* STATS */}
        {activeTab === 'stats' && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0', marginBottom: 20 }}>Stats</div>
            {!stats ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Loading...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                {[
                  { label: 'Total Conversations', value: stats.totalConversations, icon: '💬' },
                  { label: 'Aaj ki Conversations', value: stats.todayConversations, icon: '📅' },
                  { label: 'Total Messages', value: stats.totalMessages, icon: '📨' },
                  { label: 'WhatsApp', value: stats.waStatus === 'open' ? 'Connected' : 'Disconnected', icon: '📱' },
                ].map(s => (
                  <div key={s.label} style={{ background: '#1e293b', borderRadius: 14, padding: 22, border: '1px solid #334155', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#e2e8f0', marginBottom: 4 }}>{s.value}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LOGS */}
        {activeTab === 'logs' && (
          <div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by phone / name..." style={{ ...inp, marginBottom: 18 }} />
            {filteredLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Koi conversation nahi</div>
            ) : (
              filteredLogs.map(log => <ConversationLog key={log.id} log={log} />)
            )}
          </div>
        )}

        {/* REPORT */}
        {activeTab === 'report' && (
          <div>
            {p.sendReport && (
              <div style={{ marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
                <button onClick={handleSendReport} disabled={reportSending} style={{ background: reportSending ? '#1a4731' : '#25d366', border: 'none', borderRadius: 9, padding: '10px 20px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: reportSending ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {reportSending ? 'Bhej raha...' : 'WhatsApp pe Report Bhejo'}
                </button>
                <button onClick={fetchReportPreview} style={{ background: '#334155', border: 'none', borderRadius: 9, padding: '10px 16px', fontSize: 13, fontWeight: 700, color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Refresh
                </button>
              </div>
            )}
            {reportPreview ? (
              <pre style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 14, padding: 24, fontSize: 13, color: '#e2e8f0', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.7 }}>{reportPreview}</pre>
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Koi data nahi</div>
            )}
          </div>
        )}

        {/* PROMPT */}
        {activeTab === 'prompt' && (
          <div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>Bot ka system prompt edit karo — ye bot ki personality define karta hai</div>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={16}
              style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }}
              placeholder="Bot ki personality yahan likhein..."
            />
            <button onClick={handleSavePrompt} disabled={promptSaving} style={{ marginTop: 14, background: promptSaving ? '#1a4731' : '#25d366', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: promptSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {promptSaving ? 'Saving...' : 'Save Prompt'}
            </button>
          </div>
        )}

        {/* INBOX */}
        {activeTab === 'inbox' && (
          <div style={{ margin: '-24px -20px', height: 'calc(100vh - 108px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Inbox top bar */}
            <div style={{ padding: '10px 16px', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <input value={inboxSearch} onChange={e=>setInboxSearch(e.target.value)} placeholder="🔍 Search..." style={{ flex:1, background:'#0f172a', border:'1px solid #334155', borderRadius:8, padding:'7px 12px', fontSize:13, color:'#e2e8f0', outline:'none' }} />
              <button onClick={()=>setShowNewChat(true)} style={{ background:'#25d366', border:'none', borderRadius:8, padding:'8px 14px', fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer', whiteSpace:'nowrap' }}>✏️ New Chat</button>
            </div>

            <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
              {/* Left list */}
              <div style={{ width:280, flexShrink:0, borderRight:'1px solid #1e293b', display:'flex', flexDirection:'column', background:'#0a1220' }}>
                <div style={{ display:'flex', borderBottom:'1px solid #1e293b', flexShrink:0 }}>
                  {INBOX_TABS.map(t=>(
                    <button key={t} onClick={()=>setInboxTab(t)} style={{ flex:1, padding:'8px 2px', border:'none', background:'none', cursor:'pointer', fontSize:10, fontWeight:700, color:inboxTab===t?'#25d366':'#475569', borderBottom:inboxTab===t?'2px solid #25d366':'2px solid transparent' }}>
                      {t} <span style={{ fontSize:9, background:inboxTab===t?'#0a2a1a':'#1e293b', color:inboxTab===t?'#25d366':'#475569', borderRadius:99, padding:'1px 4px' }}>{inboxCounts[t]}</span>
                    </button>
                  ))}
                </div>
                <div style={{ flex:1, overflowY:'auto' }}>
                  {inboxFiltered.length===0 && <div style={{ padding:24, color:'#334155', fontSize:13, textAlign:'center' }}>Koi conversation nahi</div>}
                  {inboxFiltered.map(conv=>{
                    const last=conv.messages?.slice(-1)[0];
                    const active=inboxSel?.id===conv.id;
                    const isBotOff=conv.botEnabled===false;
                    const resolved=conv.status==='resolved';
                    return (
                      <div key={conv.id} onClick={()=>setInboxSel(conv)}
                        style={{ padding:'10px 12px', cursor:'pointer', borderBottom:'1px solid #0f172a', background:active?'#1e3a5f':'transparent', borderLeft:`3px solid ${active?'#25d366':'transparent'}` }}
                        onMouseEnter={e=>{if(!active)e.currentTarget.style.background='#1a2535';}} onMouseLeave={e=>{if(!active)e.currentTarget.style.background='transparent';}}>
                        <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                          <div style={{ width:34, height:34, borderRadius:'50%', background:isBotOff?'#451a03':resolved?'#1e293b':'#0a2a1a', border:`2px solid ${isBotOff?'#78350f':resolved?'#334155':'#166534'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:isBotOff?'#fbbf24':resolved?'#475569':'#25d366', fontWeight:800, flexShrink:0 }}>{getInit(conv.userPhone)}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                              <div style={{ fontSize:12, fontWeight:700, color:'#e2e8f0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:130 }}>{fmtPhone(conv.userPhone)}</div>
                              <div style={{ fontSize:10, color:'#475569' }}>{timeAgo(conv.lastUpdated)}</div>
                            </div>
                            <div style={{ fontSize:11, color:'#64748b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{last?.role==='assistant'?'🤖 ':'👤 '}{last?.content?.slice(0,40)||'—'}</div>
                            <div style={{ marginTop:4, display:'flex', gap:3 }}>
                              {isBotOff&&<span style={{ fontSize:8, fontWeight:700, background:'#451a03', color:'#fbbf24', border:'1px solid #78350f', borderRadius:99, padding:'1px 5px' }}>MANUAL</span>}
                              {!isBotOff&&!resolved&&<span style={{ fontSize:8, fontWeight:700, background:'#0a2a1a', color:'#25d366', border:'1px solid #166534', borderRadius:99, padding:'1px 5px' }}>BOT</span>}
                              {resolved&&<span style={{ fontSize:8, fontWeight:700, background:'#1e293b', color:'#475569', border:'1px solid #334155', borderRadius:99, padding:'1px 5px' }}>DONE</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right chat */}
              <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
                {!inboxSel ? (
                  <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#334155', gap:10 }}>
                    <div style={{ fontSize:40 }}>💬</div>
                    <div style={{ fontSize:14, fontWeight:700, color:'#475569' }}>Conversation select karo</div>
                    <div style={{ fontSize:12, color:'#334155' }}>Ya New Chat se naya message bhejo</div>
                  </div>
                ) : (
                  <>
                    {/* Chat header */}
                    <div style={{ padding:'10px 16px', borderBottom:'1px solid #1e293b', background:'#1e293b', flexShrink:0, display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:botOn?'#0a2a1a':'#451a03', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, color:botOn?'#25d366':'#fbbf24', border:`2px solid ${botOn?'#166534':'#78350f'}` }}>{getInit(inboxSel.userPhone)}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#e2e8f0' }}>{fmtPhone(inboxSel.userPhone)}</div>
                        <div style={{ fontSize:10, color:'#475569' }}>{inboxSel.messages?.length||0} msgs · {timeAgo(inboxSel.lastUpdated)}</div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:11, fontWeight:700, color:botOn?'#25d366':'#fbbf24' }}>🤖</span>
                        <div onClick={handleBotToggle} style={{ width:32, height:18, borderRadius:9, background:botOn?'#25d366':'#334155', cursor:'pointer', position:'relative', transition:'background 0.2s' }}>
                          <div style={{ position:'absolute', top:2, left:botOn?17:2, width:14, height:14, borderRadius:7, background:'#fff', transition:'left 0.2s' }} />
                        </div>
                        <button onClick={handleResolve} style={{ background:isResolved?'#334155':'#0c1a2e', color:isResolved?'#94a3b8':'#60a5fa', border:`1px solid ${isResolved?'#475569':'#1d4ed8'}`, borderRadius:7, padding:'5px 10px', fontSize:11, fontWeight:700, cursor:'pointer' }}>{isResolved?'↩ Re-open':'✅ Done'}</button>
                      </div>
                    </div>
                    {!botOn && <div style={{ background:'#451a03', borderBottom:'1px solid #78350f', padding:'5px 16px', fontSize:11, color:'#fbbf24', fontWeight:600, flexShrink:0 }}>⚠️ Bot band — aap manually reply karo</div>}
                    {isResolved && <div style={{ background:'#1e293b', borderBottom:'1px solid #334155', padding:'5px 16px', fontSize:11, color:'#475569', fontWeight:600, flexShrink:0 }}>✅ Resolved</div>}
                    {/* Messages */}
                    <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:5, background:'#0b1220' }}>
                      {(inboxSel.messages||[]).map((msg,i)=>{
                        const isBot=msg.role==='assistant';
                        return (
                          <div key={i} style={{ display:'flex', justifyContent:isBot?'flex-end':'flex-start' }}>
                            {!isBot && <div style={{ width:24, height:24, borderRadius:'50%', background:'#1e293b', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, marginRight:6, flexShrink:0, alignSelf:'flex-end', color:'#64748b' }}>👤</div>}
                            <div style={{ maxWidth:'68%' }}>
                              <div style={{ padding:'8px 12px', borderRadius:isBot?'14px 14px 2px 14px':'14px 14px 14px 2px', background:isBot?(msg.manual?'#0c3460':'#25d366'):'#1e293b', color:isBot?'#fff':'#e2e8f0', fontSize:12, lineHeight:1.55, border:isBot?'none':'1px solid #334155', boxShadow:'0 1px 2px rgba(0,0,0,0.3)' }}>
                                <div style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{msg.content}</div>
                              </div>
                              <div style={{ fontSize:9, color:'#334155', marginTop:2, textAlign:isBot?'right':'left' }}>
                                {msg.manual?'✏️ Manual':isBot?'🤖 Bot':'👤'} · {msg.timestamp?new Date(msg.timestamp).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):''}
                              </div>
                            </div>
                            {isBot && <div style={{ width:24, height:24, borderRadius:'50%', background:msg.manual?'#0c1a4a':'#0a2a1a', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, marginLeft:6, flexShrink:0, alignSelf:'flex-end' }}>{msg.manual?'✏️':'🤖'}</div>}
                          </div>
                        );
                      })}
                      {(inboxSel.messages||[]).length===0 && <div style={{ textAlign:'center', color:'#334155', fontSize:12, marginTop:30 }}>Koi message nahi</div>}
                      <div ref={chatEndRef} />
                    </div>
                    {/* Send */}
                    <div style={{ padding:'10px 12px', borderTop:'1px solid #1e293b', background:'#1e293b', flexShrink:0 }}>
                      <div style={{ display:'flex', gap:6, alignItems:'flex-end' }}>
                        <textarea value={inboxText} onChange={e=>setInboxText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleInboxSend();}}} placeholder={isResolved?'Re-open karo phir reply karo':'Message likho... (Enter = send)'} disabled={isResolved} rows={2}
                          style={{ flex:1, background:'#0f172a', border:`1.5px solid ${isResolved?'#1e293b':'#334155'}`, borderRadius:9, padding:'8px 10px', fontSize:12, color:isResolved?'#334155':'#e2e8f0', outline:'none', resize:'none', lineHeight:1.5 }} />
                        <button onClick={handleInboxSend} disabled={inboxSending||!inboxText.trim()||isResolved}
                          style={{ background:inboxSending||!inboxText.trim()||isResolved?'#1e293b':'#25d366', border:'none', borderRadius:9, padding:'10px 14px', fontSize:16, cursor:'pointer', color:inboxSending||!inboxText.trim()||isResolved?'#334155':'#fff', flexShrink:0 }}>
                          {inboxSending?'⏳':'➤'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* New Chat Modal */}
            {showNewChat && (
              <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
                <div style={{ background:'#1e293b', borderRadius:16, padding:24, border:'1px solid #334155', width:'100%', maxWidth:400 }}>
                  <div style={{ fontSize:15, fontWeight:800, color:'#e2e8f0', marginBottom:16 }}>✏️ New Chat</div>
                  <div style={{ marginBottom:12 }}>
                    <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', marginBottom:5 }}>WhatsApp Number</label>
                    <input value={newPhone} onChange={e=>setNewPhone(e.target.value)} placeholder="919876543210" style={{ width:'100%', background:'#0f172a', border:'1.5px solid #334155', borderRadius:8, padding:'10px 12px', fontSize:13, color:'#e2e8f0', outline:'none', boxSizing:'border-box' }} />
                  </div>
                  <div style={{ marginBottom:16 }}>
                    <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', marginBottom:5 }}>Message</label>
                    <textarea value={newText} onChange={e=>setNewText(e.target.value)} rows={3} placeholder="Message likho..." style={{ width:'100%', background:'#0f172a', border:'1.5px solid #334155', borderRadius:8, padding:'10px 12px', fontSize:13, color:'#e2e8f0', outline:'none', resize:'vertical', boxSizing:'border-box' }} />
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={handleNewChat} disabled={newSending||!newPhone.trim()||!newText.trim()} style={{ flex:1, background:newSending||!newPhone.trim()||!newText.trim()?'#1a4731':'#25d366', border:'none', borderRadius:8, padding:12, fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer' }}>{newSending?'Bhej raha...':'Send Karo'}</button>
                    <button onClick={()=>{setShowNewChat(false);setNewPhone('');setNewText('');}} style={{ background:'#334155', border:'none', borderRadius:8, padding:'12px 16px', fontSize:13, fontWeight:700, color:'#94a3b8', cursor:'pointer' }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* WHATSAPP SETUP */}
        {activeTab === 'meta' && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0', marginBottom: 4 }}>WhatsApp Setup</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20 }}>Apna WhatsApp number connect karo</div>

            {/* Baileys QR Connect */}
            <div style={{ background: '#1e293b', borderRadius: 14, padding: 20, border: '1px solid #334155', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: waStatus === 'open' ? '#25d366' : '#f87171', boxShadow: waStatus === 'open' ? '0 0 8px #25d366' : 'none' }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
                  WhatsApp: {waStatus === 'open' ? 'Connected ✅' : 'Disconnected'}
                </div>
              </div>

              {waStatus === 'open' ? (
                <button onClick={handleWADisconnect} disabled={waConnecting}
                  style={{ background: '#7f1d1d', border: '1.5px solid #ef4444', borderRadius: 9, padding: '10px 20px', fontSize: 13, fontWeight: 700, color: '#f87171', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {waConnecting ? 'Disconnecting...' : 'Disconnect WhatsApp'}
                </button>
              ) : (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ ...lbl }}>
                      Bot WhatsApp Number
                      {waBotPhone && <span style={{ color: '#f59e0b', marginLeft: 6, fontSize: 10 }}>🔒 Admin locked</span>}
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        style={{ ...inp, flex: 1, opacity: waBotPhone ? 0.7 : 1, cursor: waBotPhone ? 'not-allowed' : 'text' }}
                        placeholder="919876543210 (country code ke saath)"
                        value={waPhone}
                        onChange={e => { if (!waBotPhone) setWaPhone(e.target.value); }}
                        readOnly={!!waBotPhone}
                      />
                      <button onClick={handleWAConnect} disabled={waConnecting || !waPhone.trim()}
                        style={{ background: waConnecting || !waPhone.trim() ? '#334155' : '#25d366', border: 'none', borderRadius: 9, padding: '10px 16px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: waConnecting || !waPhone.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                        {waConnecting ? '...' : 'Get Code'}
                      </button>
                    </div>
                    {waBotPhone && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Sirf yahi number connect ho sakta hai</div>}
                  </div>

                  {waPairingCode && (
                    <div style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.25)', borderRadius: 10, padding: 16, textAlign: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>Pairing Code — WhatsApp → Linked Devices mein daalo</div>
                      <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '0.3em', color: '#25d366', fontFamily: 'monospace' }}>{waPairingCode}</div>
                    </div>
                  )}

                  {waQr && (
                    <div style={{ textAlign: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>Ya QR scan karo</div>
                      <img src={waQr} alt="QR" style={{ width: 180, height: 180, borderRadius: 10, background: 'white', padding: 8 }} />
                    </div>
                  )}

                  {!waQr && !waPairingCode && !waConnecting && (
                    <button onClick={handleWAGetQR}
                      style={{ background: '#0f2d1f', border: '1.5px solid #25d366', borderRadius: 9, padding: '10px 20px', fontSize: 13, fontWeight: 700, color: '#25d366', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Generate QR Code
                    </button>
                  )}

                  {waConnecting && <div style={{ color: '#64748b', fontSize: 13, padding: '10px 0' }}>Loading...</div>}
                </>
              )}

              {waError && <div style={{ marginTop: 10, color: '#f87171', fontSize: 12 }}>⚠️ {waError}</div>}
            </div>

            {/* Webhook URL */}
            <div style={{ background: '#1e293b', borderRadius: 14, padding: 20, border: '1px solid #334155', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>Webhook URL</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Ye URL Meta Dashboard → WhatsApp → Configuration → Webhook mein daalo</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{ flex: 1, background: '#0f172a', padding: '10px 12px', borderRadius: 8, fontSize: 12, color: '#60a5fa', border: '1px solid #334155', wordBreak: 'break-all' }}>
                  {metaConfig.webhookUrl || 'https://shivangi-saas-bot.onrender.com/meta/webhook'}
                </code>
                <button onClick={() => { navigator.clipboard.writeText(metaConfig.webhookUrl || 'https://shivangi-saas-bot.onrender.com/meta/webhook'); setMsg('Webhook URL copy ho gaya!'); }}
                  style={{ background: '#334155', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  Copy
                </button>
              </div>
            </div>

            {/* Credentials */}
            <div style={{ background: '#1e293b', borderRadius: 14, padding: 20, border: '1px solid #334155', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>Meta Credentials</div>

              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Phone Number ID</label>
                <input style={inp} value={metaForm.metaPhoneNumberId} onChange={e => setMetaForm(f => ({ ...f, metaPhoneNumberId: e.target.value }))} placeholder="123456789012345" />
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Meta App → WhatsApp → Getting Started pe milega</div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Access Token</label>
                <input style={inp} type="password" value={metaForm.metaAccessToken} onChange={e => setMetaForm(f => ({ ...f, metaAccessToken: e.target.value }))} placeholder={metaConfig.hasAccessToken ? '(already set — change karna ho to naya daalo)' : 'EAAxxxxxxx...'} />
                {metaConfig.hasAccessToken && <div style={{ fontSize: 11, color: '#25d366', marginTop: 4 }}>✅ Token set hai</div>}
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={lbl}>Webhook Verify Token</label>
                <input style={inp} value={metaForm.metaVerifyToken} onChange={e => setMetaForm(f => ({ ...f, metaVerifyToken: e.target.value }))} placeholder="koi bhi secret string, e.g. mybot_verify_123" />
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Meta webhook setup mein yahi daalna hoga</div>
              </div>

              <button onClick={handleSaveMeta} disabled={metaSaving} style={{ background: metaSaving ? '#1a4731' : '#25d366', border: 'none', borderRadius: 10, padding: '11px 24px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: metaSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {metaSaving ? 'Saving...' : 'Save Credentials'}
              </button>
            </div>

            {/* Test Message */}
            <div style={{ background: '#1e293b', borderRadius: 14, padding: 20, border: '1px solid #334155' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>Test Message Bhejo</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Credentials save karne ke baad yahan se test karo</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...inp, flex: 1 }} value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="919876543210 (country code ke saath, no +)" />
                <button onClick={handleTestMeta} disabled={metaTesting} style={{ background: metaTesting ? '#0f172a' : '#0f2d1f', border: '1.5px solid #25d366', borderRadius: 10, padding: '11px 18px', fontSize: 13, fontWeight: 700, color: '#25d366', cursor: metaTesting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  {metaTesting ? 'Bhej raha...' : 'Test Bhejo'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
