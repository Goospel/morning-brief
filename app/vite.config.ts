import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

import aitDevtools from '@apps-in-toss/devtools/unplugin';

const shared = fileURLToPath(new URL('../supabase/functions/_shared', import.meta.url));

export default defineConfig({
  plugins: [aitDevtools.vite(), react()],
  resolve: {
    alias: { '@shared': shared },
  },
  server: {
    // 레포 루트 밖(= app/ 밖)의 _shared 를 읽으려면 명시적으로 열어야 한다
    fs: { allow: ['..'] },
  },
});
