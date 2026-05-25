export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-0.5 p-1 rounded-xl w-fit"
      style={{ background: 'var(--surface-raised)' }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
          style={{
            cursor: 'pointer',
            background: active === tab.id ? 'var(--surface)' : 'transparent',
            color: active === tab.id ? 'var(--text)' : 'var(--text-muted)',
            boxShadow: active === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
