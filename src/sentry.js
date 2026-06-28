import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: 'https://c736cfc1a3330813b9ff0621d727c51e@o4511492370333696.ingest.us.sentry.io/4511492371513345',
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  tracesSampleRate: 0.2,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  // 2026-06-28: service worker registration occasionally rejects with a
  // bare "Rejected" error, no further detail -- seen ~16x over 20 days,
  // exclusively on Chrome Mobile/Android in production, never reported by
  // a real client, and already handled gracefully (registration is
  // wrapped in .catch(), the app works fine either way -- only PWA
  // installability silently degrades for that one visit). Consistent
  // with Android Chrome's own battery-saver/data-saver service worker
  // throttling, which is outside the app's control. Not actionable, so
  // filtered here rather than left as recurring noise in the issue list.
  //
  // Deliberately NOT using a plain ignoreErrors: ['Rejected'] string
  // match -- "Rejected" is generic enough that some unrelated future
  // error could legitimately share that exact message. beforeSend lets
  // us confirm the stack actually involves serviceWorker.register before
  // dropping the event, so we only filter the specific known case.
  beforeSend(event, hint) {
    const error = hint?.originalException
    if (
      error?.message === 'Rejected' &&
      JSON.stringify(event.exception?.values?.[0]?.stacktrace?.frames || [])
        .includes('serviceWorker')
    ) {
      return null
    }
    return event
  },
})
