import { test } from '@playwright/test'

test.skip('downloads a single image', async () => tests/e2e/client/download-single.spec.js)
test.skip('respects download_watermarked flag', async () => tests/e2e/client/download-single.spec.js)
