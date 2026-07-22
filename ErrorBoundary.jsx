import React from 'react';

// ЗАСВАР #227 (код шинжилгээ): App.jsx нэг том компонент (5800+ мөр, 148
// useState) тул render vеийн ГАНЦ ч гэсэн throw (жишээ нь DB-с гэнэтийн
// null/буруу утга ирэх — #92 засварт яг ийм crash нэг удаа тохиолдож байсан)
// бvх сайтыг цагаан дэлгэц болгодог, refresh хийхээс өөр гарц vлдэхгvй.
export class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('App crash:', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, color: '#fff', padding: 24, background: '#0a0a0a' }}>
        <img src="/logo.png" alt="" style={{ height: 56 }} />
        <div style={{ fontWeight: 800 }}>Уучлаарай, алдаа гарлаа</div>
        <div style={{ color: '#888', fontSize: 13, textAlign: 'center' }}>
          Хуудсыг дахин ачаалж vзнэ vv.
        </div>
        <button onClick={() => window.location.reload()}
          style={{ background: '#8B0000', color: '#fff', border: 'none',
            padding: '10px 24px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
          ДАХИН АЧААЛАХ
        </button>
      </div>
    );
  }
}
