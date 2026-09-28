import { useEffect, useRef } from 'react'

// Migrated off the legacy google.maps.places.Autocomplete widget (v1.5.15)
// -- that widget appends an unstyled, unscoped .pac-container straight to
// document.body with no supported styling API, which is what was silently
// breaking (missing icons/text) on at least one real device, and what
// forced the scroll-hide workaround this same version briefly added and
// has now removed again since it no longer applies. PlaceAutocompleteElement
// renders inside its own shadow DOM instead, so nothing on the page can
// collide with its internals, and Google documents a real ::part()/CSS
// styling API for it (below) instead of the old hacky unofficial classes.
//
// Restriction note: the old widget's `types: ['establishment', 'geocode']`
// doesn't have a like-for-like equivalent in the new Places API's type
// taxonomy, so this intentionally leaves result types unrestricted (any
// place) rather than guessing a mapping -- only the US region restriction
// carries over, now via `includedRegionCodes` instead of
// `componentRestrictions`.
//
// Free-typed (non-selected) address behavior: the old widget updated
// onChange on every keystroke via a plain <input>. This element owns its
// own internal input inside its shadow DOM with no documented per-keystroke
// event, so typed-but-not-selected text is instead captured on blur --
// picking a suggestion still calls onChange immediately via 'gmp-select'
// either way. Worth a real test: if that blur-based capture feels
// different in practice, flag it and it can be revisited.

const STYLE_ID = 'gmp-place-autocomplete-style'

function ensureStyleInjected() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    gmp-place-autocomplete {
      width: 100%;
      background-color: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      color: var(--text);
    }
    gmp-place-autocomplete:focus-within {
      border-color: var(--border-strong);
    }
    gmp-place-autocomplete::part(input) {
      padding: 9px 12px;
      font-size: 14px;
      font-family: inherit;
      color: var(--text);
    }
    gmp-place-autocomplete::part(prediction-list) {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      overflow: hidden;
      margin-top: 4px;
    }
    gmp-place-autocomplete::part(prediction-item) {
      padding: 9px 12px;
      font-size: 13px;
      color: var(--text);
    }
    gmp-place-autocomplete::part(prediction-item):hover {
      background: var(--surface-raised);
    }
    gmp-place-autocomplete::part(prediction-item-selected) {
      background: rgba(99,102,241,0.06);
    }
    gmp-place-autocomplete::part(prediction-item-main-text) {
      font-weight: 600;
      color: var(--text);
    }
    gmp-place-autocomplete::part(prediction-item-icon) {
      color: #6366f1;
    }
  `
  document.head.appendChild(style)
}

export default function PlaceAutocomplete({ value, onChange, placeholder = 'Search for a venue or address...' }) {
  const containerRef = useRef(null)
  const elementRef = useRef(null)
  const initStartedRef = useRef(false)
  const justSelectedRef = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    // Guards against React re-running this effect (dev-mode double-invoke,
    // or any other reason) before the first async initialization has
    // finished -- without this, two concurrent init() calls can both pass
    // every check before either one has actually created an element,
    // producing two separate <gmp-place-autocomplete> widgets both
    // appended to the page (the duplicate-box bug). Set synchronously,
    // not inside the async function, so a second invocation sees it
    // immediately rather than racing to the same checks.
    if (elementRef.current || initStartedRef.current) return
    initStartedRef.current = true

    let cancelled = false

    async function init() {
      const key = import.meta.env.VITE_GOOGLE_PLACES_KEY
      if (!key || !containerRef.current) return

      if (!document.querySelector('script[src*="maps.googleapis.com"]')) {
        const script = document.createElement('script')
        script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async`
        script.async = true
        document.head.appendChild(script)
        await new Promise((resolve, reject) => {
          script.addEventListener('load', resolve)
          script.addEventListener('error', reject)
        })
      } else if (!window.google?.maps?.importLibrary) {
        // Script tag exists but hasn't finished loading yet (e.g. a second
        // PlaceAutocomplete instance mounting first) -- poll briefly rather
        // than attaching a second load listener to a tag we didn't create.
        await new Promise(resolve => {
          const check = () => {
            if (window.google?.maps?.importLibrary) resolve()
            else setTimeout(check, 50)
          }
          check()
        })
      }

      if (cancelled || !containerRef.current) return

      const { PlaceAutocompleteElement } = await window.google.maps.importLibrary('places')

      // Re-check after every await, including this last one -- importLibrary
      // can resolve near-instantly once Google's script has already loaded
      // a library once, which is exactly the gap that let two elements
      // through before.
      if (cancelled || !containerRef.current || elementRef.current) return

      ensureStyleInjected()

      const el = new PlaceAutocompleteElement({
        includedRegionCodes: ['us'],
      })
      el.placeholder = placeholder
      if (value) el.value = value

      el.addEventListener('gmp-select', async ({ placePrediction }) => {
        // Selecting a suggestion fires 'blur' on this same element almost
        // immediately (focus moves away as the dropdown closes), well
        // before fetchFields' network round trip resolves -- this guard
        // stops that blur from re-saving the widget's still-short
        // displayed text over the full address once it lands.
        justSelectedRef.current = true
        try {
          const place = placePrediction.toPlace()
          await place.fetchFields({ fields: ['displayName', 'formattedAddress'] })
          // Build a single readable string: "Venue Name, 123 Main St, Columbus, OH".
          // formattedAddress is always kept when present -- it's the
          // authoritative full address. displayName is only prepended when
          // it adds real information (a business/venue name), not for a
          // bare street address, where displayName is just the leading
          // portion of formattedAddress and would otherwise read as
          // "6927 Duke Dr, 6927 Duke Dr, Canal Winchester, OH...".
          const addr = place.formattedAddress
          const name = place.displayName
          const parts = []
          if (name && !(addr && addr.includes(name))) parts.push(name)
          if (addr) parts.push(addr)
          onChangeRef.current(parts.join(', ') || name || '')
        } catch (err) {
          // Surfaced rather than swallowed -- silently keeping whatever was
          // typed made a real fetchFields failure indistinguishable from
          // normal free-typed text, which made this exact bug harder to
          // diagnose from the console alone.
          console.error('PlaceAutocomplete: fetchFields failed', err)
        } finally {
          // Released once fetchFields actually settles (not on a fixed
          // timer), so a slow network doesn't reopen the stomping window
          // -- and blur is what's guarded, not fetchFields' own onChange
          // call, so the final saved value is always whichever of the two
          // genuinely happened last.
          justSelectedRef.current = false
        }
      })

      el.addEventListener('blur', () => {
        if (justSelectedRef.current) return
        if (typeof el.value === 'string') onChangeRef.current(el.value)
      })

      // Defensive: clear anything already in the container before
      // appending, in case a prior render cycle left something behind.
      containerRef.current.replaceChildren(el)
      elementRef.current = el
    }

    init()

    return () => {
      cancelled = true
      initStartedRef.current = false
      if (elementRef.current) {
        elementRef.current.remove()
        elementRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the element's displayed value in sync if the value prop changes
  // from outside (e.g. session data finishing an async load after this
  // component already mounted with an empty initial value).
  useEffect(() => {
    if (elementRef.current && elementRef.current.value !== value) {
      elementRef.current.value = value || ''
    }
  }, [value])

  return <div ref={containerRef} style={{ width: '100%' }} />
}
