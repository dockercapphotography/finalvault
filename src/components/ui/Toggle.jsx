export default function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-white' : 'bg-slate-700'}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform bg-slate-900 ${checked ? 'translate-x-4' : ''}`} />
      </div>
      {(label || description) && (
        <div>
          {label && <p className="text-sm text-white">{label}</p>}
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
      )}
    </label>
  )
}
