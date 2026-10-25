import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './data/store';
import './styles/tokens.css';
import './styles/app.css';

function Boot({ state, retry }: { state: { status: 'loading' } | { status: 'failed'; message: string } | { status: 'ready' }; retry: () => void }) {
  if (state.status === 'failed') {
    return (
      <div className="boot">
        <p className="boot-title">データを読み込めませんでした</p>
        <p className="boot-text">{state.message}</p>
        <p className="boot-text">プライベートブラウズでは保存が使えない場合があります。通常のタブで開いてください。</p>
        <button type="button" className="btn btn-primary" onClick={retry}>
          もう一度試す
        </button>
      </div>
    );
  }
  return (
    <div className="boot" aria-busy="true">
      <p className="boot-mark">LIFE ENGINE</p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider fallback={(s, retry) => <Boot state={s} retry={retry} />}>
      <App />
    </StoreProvider>
  </StrictMode>,
);

// オフラインでも使えるように Service Worker を登録する（本番ビルドのみ）
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* 登録できなくてもアプリは使える */
    });
  });
}
