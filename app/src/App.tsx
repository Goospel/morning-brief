import { useEffect, useState } from 'react';
import { Intro } from './screens/Intro';
import { Onboarding } from './screens/Onboarding';
import { Briefing } from './screens/Briefing';
import { Settings } from './screens/Settings';
import { getBriefing, hasSession } from './api';

type Screen = 'loading' | 'intro' | 'onboarding' | 'briefing' | 'settings';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');

  // 앱 시작 분기 (설계 4절)
  useEffect(() => {
    void (async () => {
      if (!(await hasSession())) { setScreen('intro'); return; }
      try {
        const b = await getBriefing();          // 401 이면 api.ts 가 조용히 재로그인한다
        setScreen(b.onboarded ? 'briefing' : 'onboarding');
      } catch {
        setScreen('intro');
      }
    })();
  }, []);

  // 내비게이션 바 뒤로가기가 history 와 연동되면 그대로 동작한다
  useEffect(() => {
    const onPop = () => setScreen('briefing');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (screen === 'loading') return <main style={{ padding: '24px' }}><p>불러오는 중…</p></main>;

  if (screen === 'intro') {
    return <Intro onDone={(onboarded) => setScreen(onboarded ? 'briefing' : 'onboarding')} />;
  }
  if (screen === 'onboarding') {
    // 뒤로가기로 온보딩에 돌아올 수 없어야 한다
    return <Onboarding onDone={() => { history.replaceState(null, '', '/'); setScreen('briefing'); }} />;
  }
  if (screen === 'settings') {
    return <Settings onBack={() => history.back()} />;
  }
  return <Briefing onSettings={() => { history.pushState(null, '', '/settings'); setScreen('settings'); }} />;
}
