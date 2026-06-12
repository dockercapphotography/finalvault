import { useEffect, useRef } from 'react'

export default function PlaceAutocomplete({ value, onChange, placeholder = 'Search for a venue or address...' }) {
  const inputRef = useRef(null)
  const autocompleteRef = useRef(null)

  useEffect(() => {
    if (!window.google || !inputRef.current) return
    if (autocompleteRef.current) return
    initAutocomplete()
  }, [])

  useEffect(() => {
    const key = import.meta.env.VITE_GOOGLE_PLACES_KEY
    if (!key || window.google) return
    if (document.querySelector('script[src*="maps.googleapis.com"]')) return
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
    script.async = true
    script.onload = () => initAutocomplete()
    document.head.appendChild(script)
  }, [])

  function initAutocomplete() {
    if (!inputRef.current || autocompleteRef.current) return
    autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['establishment', 'geocode'],
      componentRestrictions: { country: 'us' },
      fields: ['name', 'formatted_address', 'geometry'],
    })
    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current.getPlace()
      if (!place) return
      // Build a single readable string: "Venue Name, 123 Main St, Columbus, OH"
      const parts = []
      if (place.name) parts.push(place.name)
      if (place.formatted_address) {
        // Avoid duplicating the name if it's already in the formatted address
        const addr = place.formatted_address
        const nameInAddr = place.name && addr.startsWith(place.name)
        if (!nameInAddr) parts.push(addr)
      }
      onChange(parts.join(', '))
    })
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      style={{
        width: '100%',
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        color: 'var(--text)',
        borderRadius: 8,
        padding: '9px 12px',
        fontSize: 14,
        outline: 'none',
        boxSizing: 'border-box',
      }}
      onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
      onBlur={e => e.target.style.borderColor = 'var(--border)'}
    />
  )
}
