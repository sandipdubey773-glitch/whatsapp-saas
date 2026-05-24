import React, { useState } from 'react';

export default function PromptEditor({ value, onChange }) {
  const [preview, setPreview] = useState(false);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
          System Prompt (Bot Training) *
        </label>
        <button
          onClick={() => setPreview(!preview)}
          style={{ background: 'none', border: '1px solid #334155', borderRadius: 6, padding: '4px 11px', fontSize: 11, color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {preview ? '✏️ Edit' : '👁️ Preview'}
        </button>
      </div>

      {preview ? (
        <div style={{ background: '#0f172a', borderRadius: 9, padding: '14px 16px', fontSize: 13, color: '#94a3b8', lineHeight: 1.7, whiteSpace: 'pre-wrap', minHeight: 180, border: '1.5px solid #334155', maxHeight: 320, overflowY: 'auto' }}>
          {value || <span style={{ color: '#475569', fontStyle: 'italic' }}>Koi prompt nahi...</span>}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="You are a helpful assistant for [Business Name]. You help customers with bookings, queries, and support..."
          style={{ width: '100%', background: '#0f172a', border: '1.5px solid #334155', borderRadius: 9, padding: '13px 14px', fontSize: 13, color: '#e2e8f0', outline: 'none', fontFamily: 'monospace', lineHeight: 1.65, resize: 'vertical', minHeight: 200 }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 11, color: '#475569' }}>
        <span>{value.length} characters</span>
        <span>{value.split('\n').length} lines</span>
      </div>
    </div>
  );
}
