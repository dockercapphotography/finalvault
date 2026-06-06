import { useState, useRef, useCallback } from 'react'
import { Upload, X, AlertCircle } from 'lucide-react'
import Button from '../ui/Button.jsx'

const ACCEPTED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif',
  '.heic', '.heif'
]

const RAW_EXTENSIONS = [
  '.cr2', '.cr3', '.nef', '.nrw', '.arw', '.sr2',
  '.dng', '.raf', '.orf', '.rw2', '.pef', '.srw'
]

function UnsupportedFileModal({ files, onClose }) {
  return (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full"
        style={{ transform: 'translate(-50%, -50%)', maxWidth: 480, padding: '0 16px' }}
      >
        <div
          className="rounded-2xl shadow-xl overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start gap-3 px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'var(--danger-subtle)' }}>
              <AlertCircle size={18} style={{ color: 'var(--danger)' }} />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Unsupported file format</h2>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                RAW camera files cannot be uploaded directly. Please export your images first.
              </p>
            </div>
            <button onClick={onClose} style={{ color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>
              <X size={16} />
            </button>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                {files.length === 1 ? 'Rejected file:' : `Rejected files (${files.length}):`}
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {files.map((f, i) => (
                  <p key={i} className="text-xs font-mono px-2 py-1 rounded"
                    style={{ background: 'var(--surface-raised)', color: 'var(--text)' }}>
                    {f.name}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Supported formats */}
          <div className="px-6 py-4">
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Supported formats:</p>
            <div className="flex flex-wrap gap-1.5">
              {['JPEG', 'PNG', 'WebP', 'TIFF', 'HEIC'].map(fmt => (
                <span key={fmt} className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'var(--surface-raised)', color: 'var(--text)' }}>
                  {fmt}
                </span>
              ))}
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 pb-5 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default function ImageUploader({ onUpload, disabled = false, compact = false }) {
  const [isDragging, setIsDragging] = useState(false)
  const [rejectedFiles, setRejectedFiles] = useState([])
  const inputRef = useRef(null)

  const handleFiles = useCallback((files) => {
    const fileList = Array.from(files)
    const rawFiles = fileList.filter(f => RAW_EXTENSIONS.includes('.' + f.name.split('.').pop().toLowerCase()))
    const valid = fileList.filter(f => ACCEPTED_EXTENSIONS.includes('.' + f.name.split('.').pop().toLowerCase()))
    if (rawFiles.length > 0) setRejectedFiles(rawFiles)
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

  return (
    <>
      {rejectedFiles.length > 0 && (
        <UnsupportedFileModal files={rejectedFiles} onClose={() => setRejectedFiles([])} />
      )}

      {compact ? (
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
      ) : (
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
              JPEG, PNG, TIFF, HEIC supported
            </p>
          </div>
        </>
      )}
    </>
  )
}
