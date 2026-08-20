import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'community.bend.westmoreland',
  appName: 'The Bend: Westmoreland',
  webDir: 'dist',
  bundledWebRuntime: false,
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: '#f7f3ea',
      style: 'LIGHT',
    },
  },
}

export default config
