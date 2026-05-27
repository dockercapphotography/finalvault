import { useState, useRef, useCallback } from 'react'
import { Upload } from 'lucide-react'
import Button from '../ui/Button.jsx'

const ACCEPTED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif',
  '.heic', '.heif', '.cr2', '.cr3', '.nef', '.arw',
  '.dng', '.raf', '.orf', '.rw2', '.pef', '.srw'
]

export default function ImageUploader({ onUpload, disabled = false, compact = false }) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef(null)

  const handleFiles = useCallback((files) => {
    const valid = Array.from(files).filter(f => {
      const ext = '.' + f.name.split('.').pop().toLowerCase()
      return ACCEPTED_EXTENSIONS.includes(ext)
    })
    if (valid.length > 0) onUpload(valid)
  }, [onUpload])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }
  const handleDragLeave = (e) => { e.stopPropagation(); setIsDragging(false) }

  // Compact mode — icon only on mobile, full label on desktop
  if (compact) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
          disabled={disabled}
        />
        <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={disabled}>
          <Upload size={14} />
          <span className="hidden sm:inline">Upload Images</span>
        </Button>
      </>
    )
  }

  // Full drop zone mode — shown when gallery is empty
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(',')}
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
        disabled={disabled}
      />
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && inputRef.current?.click()}
        className="flex flex-col items-center justify-center py-16 rounded-xl cursor-pointer transition-all"
        style={{
          border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
          background: isDragging ? 'var(--surface-raised)' : 'var(--bg-subtle)',
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
          style={{ background: 'var(--surface-raised)' }}>
          <Upload size={22} style={{ color: 'var(--text-muted)' }} />
        </div>
        <p className="font-medium text-sm mb-1" style={{ color: 'var(--text)' }}>
          Drop images here or click to browse
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          JPEG, PNG, TIFF, HEIC, RAW supported
        </p>
      </div>
    </>
  )
}
