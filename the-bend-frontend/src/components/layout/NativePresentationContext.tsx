/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react'

const NativePresentationContext = createContext(false)

export function NativePresentationProvider({ children }: React.PropsWithChildren): React.ReactElement {
  return <NativePresentationContext.Provider value>{children}</NativePresentationContext.Provider>
}

export function useNativePresentation(): boolean {
  return useContext(NativePresentationContext)
}
