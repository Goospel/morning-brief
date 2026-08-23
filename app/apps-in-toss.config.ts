import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'morning-brief',
  brand: {
    primaryColor: '#3E7BD1', // 로고의 대표색 (파랑)
  },
  permissions: [],
  navigationBar: {
    withBackButton: true,   // 화면 안에 back 을 두지 않는다 — 네이티브 back 에 의존하므로 명시한다
    withTitle: false,       // 각 화면이 자체 Top 타이틀을 그린다 — 중복 방지
    // theme 은 일부러 두지 않는다: 명시하면 시스템 다크모드 추종을 잃을 수 있다(미검증, 실기기 확인 대상)
  },
  webBundleDir: 'dist',
});
