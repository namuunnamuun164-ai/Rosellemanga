import { useState } from 'react';

// ШИНЭ: нууц үг оруулах талбар — нvд дарж харуулах/нуух товчтой
export const PasswordField = ({ value, onChange, placeholder, onKeyDown }) => {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input type={show ? 'text' : 'password'} value={value} onChange={onChange} onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 44px 10px 14px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
      <span onClick={() => setShow(s => !s)} title={show ? 'Нууц үг нуух' : 'Нууц үг харуулах'}
        style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#888', fontSize: 15, userSelect: 'none' }}>
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        )}
      </span>
    </div>
  );
};
