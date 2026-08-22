import { useState } from 'react';
import { login } from '../api';

export function Intro({ onDone }: { onDone: (onboarded: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const { onboarded } = await login();
      onDone(onboarded);
    } catch {
      // 사용자가 로그인 창을 닫은 경우도 여기로 온다 — 크게 알리지 않는다
      setError('로그인하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: '24px' }}>
      <h1>나만의정보</h1>
      <p>매일 아침, 당신에게 맞는 소식만 골라 배달해요.</p>
      <ul>
        <li>나이·직업·관심사에 맞춘 기사 5~6건</li>
        <li>해외 매체도 한국어 요약으로</li>
        <li>다 보면 끝나는 하루치 묶음</li>
      </ul>
      {error && <p role="alert">{error}</p>}
      <button onClick={start} disabled={busy}>
        {busy ? '잠시만요…' : '시작하기'}
      </button>
    </main>
  );
}
