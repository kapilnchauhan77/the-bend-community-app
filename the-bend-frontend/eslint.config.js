import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // These stable shadcn/context modules intentionally export both their
  // component and its public helper API. Fast Refresh's convention rule is
  // not applicable to that established API shape.
  {
    files: [
      'src/components/ui/badge.tsx',
      'src/components/ui/button.tsx',
      'src/components/ui/form.tsx',
      'src/context/TenantContext.tsx',
    ],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  // These modules deliberately use refs for media/socket lifetimes.
  {
    files: [
      'src/pages/LandingPage.tsx',
      'src/components/shared/VoiceNoteRecorder.tsx',
      'src/hooks/useWebSocket.ts',
    ],
    rules: { 'react-hooks/refs': 'off' },
  },
  // These legacy pages start external API synchronization from effects. Keep
  // the rule enabled for all other files.
  {
    files: [
      'src/pages/AdvertisePage.tsx',
      'src/pages/DirectoryPage.tsx',
      'src/pages/NotificationsPage.tsx',
      'src/pages/admin/ReportsPage.tsx',
      'src/components/shared/CameraCapture.tsx',
    ],
    rules: { 'react-hooks/set-state-in-effect': 'off' },
  },
])
