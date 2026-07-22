import pathlib

path = pathlib.Path("src/components/ui/AddressAutocomplete.jsx")
src = path.read_text()

old_init = """    autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
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
    })"""

assert src.count(old_init) == 1, "autocomplete init anchor not found or not unique"

# Existing callers (ClientDetail.jsx, Clients.jsx) destructure only the
# fields they use from onSelect's payload, so adding lat/lng is purely
# additive -- nothing existing breaks. `geometry` is requested alongside
# the fields already being fetched.
new_init = """    autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'geometry'],
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
      const lat = place.geometry?.location?.lat?.()
      const lng = place.geometry?.location?.lng?.()
      onSelect({ address: `${street_number} ${route}`.trim(), city, state, zip, lat, lng })
    })"""

src = src.replace(old_init, new_init)
path.write_text(src)
print("Extended AddressAutocomplete.jsx to also return lat/lng via geometry")
