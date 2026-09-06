import { createContext, useContext, type ReactNode } from 'react'
import { useLocationConfig } from '../hooks/useLocationConfig'
import { usePlatsklassRules } from '../hooks/usePlatsklassRules'
import { usePrefixRules } from '../hooks/usePrefixRules'
import { useLocations } from '../hooks/useLocations'
import { useItemPlacements } from '../hooks/useItemPlacements'
import { useStationTypes } from '../hooks/useStationTypes'

interface AppDataContextValue {
  configData: ReturnType<typeof useLocationConfig>
  rulesData: ReturnType<typeof usePlatsklassRules>
  prefixRulesData: ReturnType<typeof usePrefixRules>
  locationsData: ReturnType<typeof useLocations>
  placementsData: ReturnType<typeof useItemPlacements>
  stationTypesData: ReturnType<typeof useStationTypes>
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

/**
 * Config, rules, and locations are needed by both Platskarta and Resultat.
 * Fetching them once here — instead of each view calling its own hook
 * instance — means switching views doesn't re-fetch, and a change made in
 * one view (e.g. tagging a location manually) is immediately visible in
 * the other, since they share the same state instead of two independent
 * copies that only happened to resync when a remount forced a re-fetch.
 */
export function AppDataProvider({ children }: { children: ReactNode }) {
  const configData = useLocationConfig()
  const rulesData = usePlatsklassRules()
  const prefixRulesData = usePrefixRules()
  const locationsData = useLocations()
  const placementsData = useItemPlacements()
  const stationTypesData = useStationTypes()

  return (
    <AppDataContext.Provider value={{ configData, rulesData, prefixRulesData, locationsData, placementsData, stationTypesData }}>
      {children}
    </AppDataContext.Provider>
  )
}

export function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}
