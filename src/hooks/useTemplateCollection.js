import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Shared list-fetch/create/update/duplicate/delete-confirm state for a
 * template collection (Email, Contract, Gallery -- the flat-form types).
 * Extracted from EmailTemplatesTab/ContractTemplatesTab/GalleryTemplatesTab
 * in Account.jsx, which each reimplemented this exact same state shape
 * with only the API calls differing. Field values themselves stay owned
 * by whatever form renders inside TemplateEditorModal -- this hook only
 * knows about the collection as a whole and which item (if any) is open
 * for editing.
 *
 * api: { get, create, update, remove, duplicate? }
 *   - get()             -> Promise<template[]>
 *   - create(fields)     -> Promise<template>
 *   - update(id, fields) -> Promise<template>
 *   - remove(id)         -> Promise<void>
 *   - duplicate(template) -> Promise<template>  (optional -- when omitted,
 *     handleDuplicate is a no-op and callers should not render a
 *     duplicate affordance for this collection)
 *
 * onSaveState: (state: 'saved' | 'error') => void -- same SaveIndicator
 * callback pattern every Account.jsx tab already uses.
 */
export function useTemplateCollection(api, onSaveState) {
  const [templates, setTemplates] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(null) // null = closed, {} = new, {...} = editing existing
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [saving, setSaving] = useState(false)

  // api is a fresh object literal at every call site on every render
  // (e.g. { get: getEmailTemplates, ... } inline in each *TemplatesTab),
  // so it's never referentially stable -- using it directly as a
  // useCallback dependency meant `load` got a new identity every render,
  // the effect below saw that as a change and re-fired, which set state,
  // which re-rendered, which recreated `api` again... an unbounded fetch
  // loop that was hammering Supabase continuously. A ref sidesteps this:
  // apiRef.current always has the latest functions, but reading it
  // doesn't participate in dependency comparison, so `load` stays truly
  // stable and the effect only ever runs once per mount.
  const apiRef = useRef(api)
  apiRef.current = api

  const load = useCallback(() => {
    apiRef.current.get()
      .then(data => { setTemplates(data); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  useEffect(() => { load() }, [load])

  function startNew() { setEditing({}) }
  function startEdit(t) { setEditing(t) }
  function cancelEdit() { setEditing(null) }

  async function save(fields) {
    setSaving(true)
    try {
      if (editing?.id) {
        const updated = await api.update(editing.id, fields)
        setTemplates(prev => prev.map(t => t.id === editing.id ? updated : t))
      } else {
        const created = await api.create(fields)
        setTemplates(prev => [...prev, created])
      }
      setEditing(null)
      onSaveState?.('saved')
    } catch {
      onSaveState?.('error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDuplicate(t) {
    if (!api.duplicate) return
    try {
      const copy = await api.duplicate(t)
      setTemplates(prev => [...prev, copy])
      onSaveState?.('saved')
    } catch { onSaveState?.('error') }
  }

  async function handleDelete(id) {
    try {
      await api.remove(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
      setConfirmDeleteId(null)
      onSaveState?.('saved')
    } catch { onSaveState?.('error') }
  }

  return {
    templates, loaded, editing, confirmDeleteId, saving,
    startNew, startEdit, cancelEdit, save,
    handleDuplicate, handleDelete, setConfirmDeleteId,
  }
}
