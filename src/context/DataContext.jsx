// src/context/DataContext.jsx
import { createContext, useContext, useState, useCallback } from 'react'
import { supabase } from '../supabase'

const DataContext = createContext(null)
export const useData = () => useContext(DataContext)

export function DataProvider({ children }) {
  const [contracts, setContracts]           = useState([])
  const [users, setUsers]                   = useState([])
  const [contractsLoaded, setContractsLoaded] = useState(false)
  const [usersLoaded, setUsersLoaded]         = useState(false)
  const [loadingContracts, setLoadingContracts] = useState(false)
  const [loadingUsers, setLoadingUsers]         = useState(false)

  const loadContracts = useCallback(async (force = false) => {
    if (contractsLoaded && !force) return
    setLoadingContracts(true)
    const { data } = await supabase
      .from('contracts')
      .select('*')
      .order('created_at', { ascending: false })
    setContracts(data || [])
    setContractsLoaded(true)
    setLoadingContracts(false)
  }, [contractsLoaded])

  const loadUsers = useCallback(async (force = false) => {
    if (usersLoaded && !force) return
    setLoadingUsers(true)
    const { data } = await supabase
      .from('cv_users')
      .select('*')
      .order('created_at')
    setUsers(data || [])
    setUsersLoaded(true)
    setLoadingUsers(false)
  }, [usersLoaded])

  const updateContract = useCallback((updated) => {
    setContracts(prev => prev.map(c => c.id === updated.id ? updated : c))
  }, [])

  const addContract = useCallback((newContract) => {
    setContracts(prev => [newContract, ...prev])
  }, [])

  const removeContract = useCallback((id) => {
    setContracts(prev => prev.filter(c => c.id !== id))
  }, [])

  const refreshUsers     = useCallback(() => loadUsers(true), [loadUsers])
  const refreshContracts = useCallback(() => loadContracts(true), [loadContracts])

  return (
    <DataContext.Provider value={{
      contracts,
      users,
      loadingContracts,
      loadingUsers,
      contractsLoaded,
      usersLoaded,
      loadContracts,
      loadUsers,
      updateContract,
      addContract,
      removeContract,
      refreshUsers,
      refreshContracts
    }}>
      {children}
    </DataContext.Provider>
  )
}

