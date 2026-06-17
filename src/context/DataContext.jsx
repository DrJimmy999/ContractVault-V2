// src/context/DataContext.jsx
// Holds contracts and users in memory so switching tabs doesn't reload data
// or lose in-progress form state.

import { createContext, useContext, useState, useCallback } from 'react'
import { supabase } from '../supabase'

const DataContext = createContext(null)
export const useData = () => useContext(DataContext)

export function DataProvider({ children }) {
  const [contracts, setContracts] = useState(null) // null = not loaded yet
  const [users, setUsers]         = useState(null)
  const [loadingContracts, setLoadingContracts] = useState(false)
  const [loadingUsers, setLoadingUsers]         = useState(false)

  const loadContracts = useCallback(async (force = false) => {
    if (contracts !== null && !force) return contracts
    setLoadingContracts(true)
    const { data } = await supabase.from('contracts').select('*').order('created_at', { ascending: false })
    setContracts(data || [])
    setLoadingContracts(false)
    return data || []
  }, [contracts])

  const loadUsers = useCallback(async (force = false) => {
    if (users !== null && !force) return users
    setLoadingUsers(true)
    const { data } = await supabase.from('cv_users').select('*').order('created_at')
    setUsers(data || [])
    setLoadingUsers(false)
    return data || []
  }, [users])

  const updateContract = useCallback((updatedContract) => {
    setContracts(prev => prev
      ? prev.map(c => c.id === updatedContract.id ? updatedContract : c)
      : [updatedContract]
    )
  }, [])

  const addContract = useCallback((newContract) => {
    setContracts(prev => prev ? [newContract, ...prev] : [newContract])
  }, [])

  const removeContract = useCallback((id) => {
    setContracts(prev => prev ? prev.filter(c => c.id !== id) : [])
  }, [])

  const refreshUsers = useCallback(() => loadUsers(true), [loadUsers])
  const refreshContracts = useCallback(() => loadContracts(true), [loadContracts])

  return (
    <DataContext.Provider value={{
      contracts, users,
      loadingContracts, loadingUsers,
      loadContracts, loadUsers,
      updateContract, addContract, removeContract,
      refreshUsers, refreshContracts
    }}>
      {children}
    </DataContext.Provider>
  )
}
