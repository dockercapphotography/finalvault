import { test, expect } from '../../fixtures/fixtures.js'

/**
 * Session status: Inquiry -> Booked confirmation email trigger
 *
 * Goes through the real UI status pills, not a direct RPC call --
 * update_session_status checks auth.uid() = sessions.photographer_id
 * server-side, which the service-role admin client used for test
 * setup/teardown has no real value for.
 *
 * The test session is created with no linked client, so no email send
 * is attempted at all (client_id IS NOT NULL is one of the RPC's own
 * guards) -- keeps this test from depending on Resend or leaving real
 * mail in an inbox. This verifies the status transition and the RPC's
 * own success response, not email delivery/content itself -- that was
 * verified manually earlier this session (including the slot-claimed
 * skip, the domain/subject fixes, and the timezone handling), none of
 * which is practical to re-verify deterministically here.
 */

async function getPhotographerId(sb) {
  const { data: { users } } = await sb.auth.admin.listUsers()
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error('Test photographer not found')
  return user.id
}

const test2 = test.extend({
  testInquirySession: async ({ sb }, use) => {
    const photographerId = await getPhotographerId(sb)
    const { data: session, error } = await sb.from('sessions').insert({
      photographer_id: photographerId,
      name: `Playwright Status Test ${crypto.randomUUID().slice(0, 8)}`,
      type: 'Portrait',
      mode: 'private',
      status: 'inquiry',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single()
    if (error) throw new Error(`Could not create test session: ${error.message}`)

    await use(session)

    await sb.from('sessions').delete().eq('id', session.id)
  },
})

test2.describe('Session status: Inquiry to Booked', () => {
  test2('moving status from Inquiry to Booked persists and the RPC reports success', async ({ page, sb, testInquirySession }) => {
    await page.goto(`/sessions/${testInquirySession.id}`)
    await expect(page.getByRole('button', { name: 'Booked' })).toBeVisible({ timeout: 10000 })

    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/rpc/update_session_status') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Booked' }).click(),
    ])

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.email_warning).toBeFalsy()

    await expect
      .poll(async () => {
        const { data } = await sb.from('sessions').select('status').eq('id', testInquirySession.id).maybeSingle()
        return data?.status
      }, { timeout: 10000 })
      .toBe('booked')
  })
})
