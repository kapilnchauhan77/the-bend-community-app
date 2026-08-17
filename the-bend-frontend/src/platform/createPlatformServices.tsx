/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type PropsWithChildren } from 'react'
import type { PlatformServices, RuntimeConfig } from './contracts'
import { createNativePlatformServices } from './native/NativePlatformServices'
import { createWebPlatformServices } from './web/WebPlatformServices'

export function createPlatformServices(config: RuntimeConfig): PlatformServices {
  return config.kind === 'ios' || config.kind === 'android' ? createNativePlatformServices() : createWebPlatformServices()
}

const PlatformServicesContext = createContext<PlatformServices | null>(null)

export function PlatformServicesProvider({ config, children }: PropsWithChildren<{ config: RuntimeConfig }>) {
  const services = useMemo(() => createPlatformServices(config), [config])
  return <PlatformServicesContext.Provider value={services}>{children}</PlatformServicesContext.Provider>
}

export function usePlatformServices(): PlatformServices {
  const services = useContext(PlatformServicesContext)
  if (!services) throw new Error('usePlatformServices must be used inside PlatformServicesProvider')
  return services
}
