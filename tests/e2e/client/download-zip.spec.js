import { test } from '@playwright/test'

test.skip('downloads full gallery as ZIP', async () => tests/e2e/client/download-zip.spec.js)
test.skip('requires PIN when configured', async () => tests/e2e/client/download-zip.spec.js)
test.skip('rejects wrong PIN', async () => tests/e2e/client/download-zip.spec.js)
