import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'abhi';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  return Math.floor(diff / 86400) + 'd';
}

function fmtPhone(p) {
  if (!p) return '';
  const s = p.replace(/[^0-9]/g, '');
  if (s.length === 12) return '+' + s.slice(0, 2) + ' ' + s.slice(2, 7) + ' ' + s.slice(7);
  return p;
}

export default function InboxPage({ onBack }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [convs, setConvs] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [replyText, setReplyText] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);

  const fetchData = async () => {
    try {
      const clients = await api.getClients();
      const c = clients.find(x => x.id === id);
      if (c) setClient(c);
      const convsData = await api.getConversations(id);
      setConvs(convsData || []);
    } catch (e) {}
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv]);

  const filteredConvs = convs.filter(c => {
    const phone = c.phone || c.user || '';
    const lastMsg = c.lastMessage || c.messages?.[c.messages.length - 1]?.text || '';
    const matchesFilter = filter === 'all' || c.status === filter ||
      (filter === 'bot' && c.mode === 'bot') ||
      (filter === 'manual' && c.mode === 'manual') ||
      (filter === 'resolved' && c.resolved);
    const matchesSearch = phone.includes(search) || lastMsg.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleSend = async () => {
    if (!replyText.trim() || !activeConv) return;
    setSending(true);
    try {
      await api.sendMessage(id, activeConv.phone || activeConv.user, replyText);
      setReplyText('');
      setTimeout(fetchData, 500);
    } catch (e) {}
    setSending(false);
  };

  const handleToggleBot = async (phone) => {
    try { await api.toggleBot(id, phone); fetchData(); } catch (e) {}
  };

  const handleResolve = async (phone) => {
    try { await api.resolveConversation(id, phone); fetchData(); } catch (e) {}
  };

  const handleNewChat = async () => {
    if (!newPhone.trim() || !newMsg.trim()) return;
    setSending(true);
    try {
      await api.sendMessage(id, newPhone.trim(), newMsg);
      setShowNewChat(false);
      setNewPhone('');
      setNewMsg('');
      setTimeout(fetchData, 500);
    } catch (e) {}
    setSending(false);
  };

  const msgCount = (f) => {
    if (f === 'all') return convs.length;
    return convs.filter(c => {
      if (f === 'bot') return c.mode === 'bot';
      if (f === 'manual') return c.mode === 'manual';
      if (f === 'resolved') return c.resolved;
      return c.status === f;
    }).length;
  };

  return (
    <div className="page">
      <div className="page__header">
        <button className="btn btn-secondary" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div>
          <h1 className="page__title">{client?.name || 'Inbox'}</h1>
          <p className="page__subtitle">Customer conversations</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNewChat(true)}>+ New Chat</button>
      </div>

      <div className="chat-container">
        <div className="chat-sidebar">
          <div style={{ padding: '16px' }}>
            <input className="input" placeholder="Search conversations..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="chat-filters">
            {['all', 'bot', 'manual', 'resolved'].map(f => (
              <button key={f} className={filter === f ? 'badge badge--primary' : 'badge badge--ghost'} onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)} ({msgCount(f)})
              </button>
            ))}
          </div>
          <div className="chat-list">
            {filteredConvs.map(c => (
              <div key={c.phone || c.user} className={'chat-list-item' + (activeConv?.phone === (c.phone || c.user) ? ' active' : '')} onClick={() => setActiveConv(c)}>
                <div className="chat-list-item__header">
                  <span className="chat-list-item__name">{fmtPhone(c.phone || c.user)}</span>
                  <span className="chat-list-item__time">{timeAgo(c.lastMessageAt || c.updatedAt)}</span>
                </div>
                <div className="chat-list-item__preview">{(c.lastMessage || c.messages?.[c.messages.length - 1]?.text || '').substring(0, 60)}</div>
                <div className="chat-list-item__badges">
                  {(c.mode === 'bot' || c.status === 'bot') && <span className="badge badge--info">BOT</span>}
                  {(c.mode === 'manual' || c.status === 'manual') && <span className="badge badge--warning">MANUAL</span>}
                  {c.resolved && <span className="badge badge--success">Resolved</span>}
                </div>
              </div>
            ))}
            {filteredConvs.length === 0 && <div className="chat-list-empty">No conversations</div>}
          </div>
        </div>

        <div className="chat-window">
          {activeConv ? (
            <div className="chat-window__content">
              <div className="chat-window__header">
                <div>
                  <h3>{fmtPhone(activeConv.phone || activeConv.user)}</h3>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Mode: {activeConv.mode || 'auto'}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => handleToggleBot(activeConv.phone || activeConv.user)}>
                    {activeConv.mode === 'manual' ? 'Bot Auto' : 'Manual'}
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => handleResolve(activeConv.phone || activeConv.user)}>
                    Resolve
                  </button>
                </div>
              </div>
              <div className="chat-messages">
                {(activeConv.messages || []).map((msg, i) => {
                  const isUser = msg.direction === 'in' || msg.from === 'user';
                  return (
                    <div key={i} className={'chat-msg ' + (isUser ? 'chat-msg--in' : 'chat-msg--out')}>
                      <div className="chat-msg__text">{msg.text || msg.body || ''}</div>
                      <div className="chat-msg__time">{msg.timestamp ? timeAgo(msg.timestamp) : ''}</div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
              <div className="chat-input">
                <input className="input" placeholder="Type your reply..." value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}} />
                <button className="btn btn-primary" onClick={handleSend} disabled={sending || !replyText.trim()}>{sending ? '...' : 'Send'}</button>
              </div>
            </div>
          ) : (
            <div className="chat-window__empty">
              <div className="chat-window__empty-icon">Chat</div>
              <h3>Select a conversation</h3>
              <p>Choose a conversation from the sidebar to start chatting</p>
            </div>
          )}
        </div>
      </div>

      {showNewChat && (
        <div className="modal-overlay" onClick={() => setShowNewChat(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal__title">New Conversation</h3>
            <input className="input" placeholder="Phone number" value={newPhone} onChange={e => setNewPhone(e.target.value)} style={{ marginBottom: '12px' }} />
            <textarea className="input" placeholder="First message" value={newMsg} onChange={e => setNewMsg(e.target.value)} rows="3" style={{ marginBottom: '16px', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowNewChat(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleNewChat} disabled={sending}>{sending ? 'Sending...' : 'Send'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
