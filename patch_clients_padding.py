path = '/Users/nickporterfield/code/finalvault/src/routes/Clients.jsx'

with open(path, 'r') as f:
    src = f.read()

# Remove px-5 py-4 from the form content div — Modal provides its own on desktop,
# BottomSheet's scrollable wrapper has no padding so we need it there.
# Solution: move padding into the BottomSheet branch only, and strip it from the shared child.
# Simplest approach: remove padding from the shared div and add px-5 py-4 inside BottomSheet wrapper.

old = '''        {children}
      </BottomSheet>
    )
  }
  return (
    <Modal onClose={onClose} title="New Client">
      {children}
    </Modal>
  )
}'''
new = '''        <div className="px-5 py-4">{children}</div>
      </BottomSheet>
    )
  }
  return (
    <Modal onClose={onClose} title="New Client">
      {children}
    </Modal>
  )
}'''
assert src.count(old) == 1, f"FAIL 1: {src.count(old)} matches"
src = src.replace(old, new)

# Strip padding from the shared content div
old = '          <div className="px-5 py-4 space-y-4">'
new = '          <div className="space-y-4">'
assert src.count(old) == 1, f"FAIL 2: {src.count(old)} matches"
src = src.replace(old, new)

# Strip padding from the footer div too — Modal has its own bottom area
# On mobile the footer needs its own px-5 py-4, on desktop Modal provides the frame
# Keep footer padding in both since Modal doesn't add footer padding
# (Modal only pads the content wrapper, not a footer)
# So footer px-5 py-4 stays — no change needed there.

assert src.count('export default function Clients') == 1, "FAIL: Clients export missing"

with open(path, 'w') as f:
    f.write(src)

print("✅ Patched: padding moved into BottomSheet branch only")
print("   - Desktop (Modal): Modal's own px-6 py-5 wraps content, no double padding")
print("   - Mobile (BottomSheet): px-5 py-4 wrapper inside sheet")
