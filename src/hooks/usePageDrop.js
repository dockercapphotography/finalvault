import { useEffect, useRef, useState } from 'react'

/**
 * Full-page drag-and-drop hook.
 * Only active when enabled=true — prevents conflict with inline drop zones.
 */
export function usePageDrop(onDrop, enabled = true) {
  const [isDragOver, setIsDragOver] = useState(false)
  const counter = useRef(0)

  useEffect(() => {
    if (!enabled) {
      setIsDragOver(false)
      counter.current = 0
      return
    }

    const onDragEnter = (e) => {
      e.preventDefault()
      if (!e.dataTransfer.types.includes('Files')) return
      counter.current++
      setIsDragOver(true)
    }

    const onDragLeave = (e) => {
      e.preventDefault()
      counter.current--
      if (counter.current <= 0) {
        counter.current = 0
        setIsDragOver(false)
      }
    }

    const onDragOver = (e) => e.preventDefault()

    const onDropHandler = (e) => {
      e.preventDefault()
      counter.current = 0
      setIsDragOver(false)
      if (e.dataTransfer.files?.length > 0) onDrop(Array.from(e.dataTransfer.files))
    }

    const onWindowDragLeave = (e) => {
      if (!e.relatedTarget) {
        counter.current = 0
        setIsDragOver(false)
      }
    }

    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('drop', onDropHandler)
    window.addEventListener('dragleave', onWindowDragLeave)

    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('drop', onDropHandler)
      window.removeEventListener('dragleave', onWindowDragLeave)
    }
  }, [onDrop, enabled])

  return isDragOver
}
