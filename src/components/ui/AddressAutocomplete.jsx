import { useState, useEffect, useRef } from 'react'

export default function AddressAutocomplete({ value, onChange, onSelect, style, onFocus, onBlur }) {
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
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components'],
    })
    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current.getPlace()
      if (!place.address_components) return
      let street_number = '', route = '', city = '', state = '', zip = ''
      for (const c of place.address_components) {
        if (c.types.includes('street_number')) street_number = c.long_name
        if (c.types.includes('route')) route = c.long_name
        if (c.types.includes('locality')) city = c.long_name
        if (c.types.includes('administrative_area_level_1')) state = c.short_name
        if (c.types.includes('postal_code')) zip = c.long_name
      }
      onSelect({ address: `${street_number} ${route}`.trim(), city, state, zip })
    })
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="Start typing an address..."
      style={style}
      onFocus={onFocus}
      onBlur={onBlur}
      autoComplete="off"
    />
  )
}
