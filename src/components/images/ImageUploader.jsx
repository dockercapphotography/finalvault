import { useState, useRef, useCallback } from 'react'
import { Upload, X, CheckCircle, AlertCircle, Image } from 'lucide-react'
import Button from '../ui/Button.jsx'

const ACCEPTED_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/tiff', 'image/heic', 'image/heif',
]
const ACCEPTED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif',
  '.heic', '.heif', '.cr2', '.cr3', '.nef', '.arw',
  '.dng', '.raf', '.orf', '.rw2', '.pef', '.srw'
]

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export default function ImageUploader({ onUpload, disabled = false }) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef(null)

  const handleFiles = useCallback((files) => {
    const valid = Array.from(files).filter(f => {
      const ext = '.' + f.name.split('.').pop().toLowerCase()
      return ACCEPTED_TYPES.includes(f.type) || ACCEPTED_EXTENSIONS.includes(ext)
    })
    if (valid.length > 0) onUpload(valid)
  }, [onUpload])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => !disabled && inputRef.current?.click()}
      className="flex flex-col items-center justify-center py-12 rounded-xl cursor-pointer transition-all"
      style={{
        border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
        background: isDragging ? 'var(--surface-raised)' : 'var(--bg-subtle)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(',')}
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
        disabled={disabled}
      />
      <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
        style={{ background: 'var(--surface-raised)' }}>
        <Upload size={22} style={{ color: 'var(--text-muted)' }} />
      </div>
      <p className="font-medium text-sm mb-1" style={{ color: 'var(--text)' }}>
        Drop images here or click to browse
      </p>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        JPEG, PNG, TIFF, HEIC, RAW — no size limit
      </p>
    </div>
  )
}
