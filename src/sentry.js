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
})
