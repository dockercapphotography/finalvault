import pathlib

path = pathlib.Path("src/routes/Sessions.jsx")
src = path.read_text()

# 1. State + lazy-load effect
old_state = """  const [showNew, setShowNew] = useState(false)
  const [view, setView] = useState(() => window.innerWidth >= 768 ? 'kanban' : 'list')

  useEffect(() => { load() }, [])"""

assert src.count(old_state) == 1, "state anchor not found or not unique"

new_state = """  const [showNew, setShowNew] = useState(false)
  const [view, setView] = useState(() => window.innerWidth >= 768 ? 'kanban' : 'list')
  const [signupPages, setSignupPages] = useState([])
  const [loadingSignups, setLoadingSignups] = useState(false)
  const [showNewSignup, setShowNewSignup] = useState(false)
  const [openSignupPageId, setOpenSignupPageId] = useState(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (view === 'signups' && signupPages.length === 0) loadSignupPages()
  }, [view])

  async function loadSignupPages() {
    setLoadingSignups(true)
    try {
      const data = await getSignupPages()
      setSignupPages(data)
    } catch (err) { console.error(err) }
    finally { setLoadingSignups(false) }
  }"""

src = src.replace(old_state, new_state)

# 2. Third toggle segment
old_toggle = '''            <button onClick={() => setView('list')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              style={{ background: view === 'list' ? 'var(--surface-raised)' : 'transparent', color: view === 'list' ? 'var(--text)' : 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
              <LayoutList size={13} />List
            </button>
          </div>
        }
      />'''

assert src.count(old_toggle) == 1, "toggle anchor not found or not unique"

new_toggle = '''            <button onClick={() => setView('list')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              style={{ background: view === 'list' ? 'var(--surface-raised)' : 'transparent', color: view === 'list' ? 'var(--text)' : 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
              <LayoutList size={13} />List
            </button>
            <button onClick={() => setView('signups')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              style={{ background: view === 'signups' ? 'var(--surface-raised)' : 'transparent', color: view === 'signups' ? 'var(--text)' : 'var(--text-muted)', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer' }}>
              <TicketIcon size={13} />Sign-ups
            </button>
          </div>
        }
      />'''

src = src.replace(old_toggle, new_toggle)

# 3. Signups view render block + modals, right after the List view block
# and before the existing NewSessionModal render.
old_tail = """      {showNew && <NewSessionModal onClose={() => setShowNew(false)} onCreated={handleCreated} />}
    </div>
  )
}"""

assert src.count(old_tail) == 1, "render-tail anchor not found or not unique"

new_tail = """      {/* Sign-ups view */}
      {view === 'signups' && (
        <div className="max-w-4xl">
          <div className="flex justify-end mb-3">
            <Button variant="primary" size="sm" onClick={() => setShowNewSignup(true)}>
              <Plus size={13} />New signup page
            </Button>
          </div>
          <SignupPagesView
            pages={signupPages}
            loading={loadingSignups}
            onCreate={() => setShowNewSignup(true)}
            onOpen={setOpenSignupPageId}
          />
        </div>
      )}

      {showNew && <NewSessionModal onClose={() => setShowNew(false)} onCreated={handleCreated} />}
      {showNewSignup && (
        <NewSignupPageModal
          onClose={() => setShowNewSignup(false)}
          onCreated={page => { setShowNewSignup(false); setOpenSignupPageId(page.id); loadSignupPages() }}
        />
      )}
      {openSignupPageId && (
        <SignupPageDetailModal
          pageId={openSignupPageId}
          onClose={() => setOpenSignupPageId(null)}
          onChanged={loadSignupPages}
        />
      )}
    </div>
  )
}"""

src = src.replace(old_tail, new_tail)

path.write_text(src)
print("Wired the Sign-ups view, toggle, and modals into the main Sessions component")
