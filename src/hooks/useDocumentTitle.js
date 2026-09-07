import { useEffect } from 'react'

// Sets document.title while this component is mounted, restoring the
// previous title on unmount -- important for client-facing routes in
// particular, since without cleanup a title set on a gallery page would
// leak into whatever the visitor navigates to next (e.g. a bare "/g" 404
// or back to the app shell) if that next page never sets its own title.
//
// Pass null/undefined/empty string to skip updating the title entirely --
// useful while data is still loading and there's nothing meaningful to
// show yet (better to leave the previous/default title in place than
// flash a title and immediately change it again once data arrives).
export function useDocumentTitle(title, { suffix = true } = {}) {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = suffix ? `${title} · FinalVault` : title
    return () => { document.title = previous }
  }, [title, suffix])
}
