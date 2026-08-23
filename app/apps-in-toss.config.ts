import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'morning-brief',
  brand: {
    primaryColor: '#3E7BD1', // 로고의 대표색 (파랑)
  },
  permissions: [],
  webBundleDir: 'dist',
});
