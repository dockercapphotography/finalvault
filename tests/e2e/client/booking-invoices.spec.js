import { test, expect } from '../../fixtures/base.js'
import { sb, getPhotographerId } from '../../fixtures/invoices.js'

/**
 * v1.6.0 step 11 (sql/120 + 121): a public booking creates a DRAFT invoice
 * for the new session -- from the shoot type's price and retainer, or from
 * its linked invoice template. Booked through the real page, so the RPC
 * runs as anon (121 fixed the commit-time check that made this fail).
 */

test.use({ contextOptions: { storageState: undefined } })

async function waitForReady(page) {
  await expect(page.locator('.animate-spin')).not.toBeAttached({ timeout: 15000 })
}

async function createSignupPage() {
  const { data, error } = await sb().from('signup_pages').insert({
    photographer_id: await getPhotographerId(),
    title: 'PW Booking Invoice Page',
    token: `booking-invoice-${crypto.randomUUID().slice(0, 8)}`,
    venue_address: '123 Test St, Columbus, OH',
    timezone: 'America/New_York',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function createShootType(pageId, overrides = {}) {
  const { data, error } = await sb().from('signup_shoot_types').insert({
    signup_page_id: pageId, name: 'PW Priced Shoot', duration_minutes: 15, session_type: 'Portrait', sort_order: 0, ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

function nyUtcOffsetMinutes(approxDate) {
  const raw = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' })
    .formatToParts(approxDate).find(p => p.type === 'timeZoneName').value
  const m = raw.match(/GMT([+-])(\d{2}):(\d{2})/)
  return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10))
}

// 3:00 PM New York time, N days out (same approach as signup-booking.spec.js).
function futureThreePmSlot(daysFromNow) {
  const base = new Date()
  base.setUTCDate(base.getUTCDate() + daysFromNow)
  const wall = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 15, 0, 0)
  const first = new Date(wall - nyUtcOffsetMinutes(base) * 60000)
  const start = new Date(wall - nyUtcOffsetMinutes(first) * 60000)
  return { start: start.toISOString(), end: new Date(start.getTime() + 15 * 60000).toISOString(), date: new Date(wall).toISOString().slice(0, 10) }
}

async function book(page, signupPage, email) {
  await page.goto(`/book/${signupPage.token}`)
  await waitForReady(page)
  await page.getByText('3:00 PM').click()
  await page.getByPlaceholder('First name').fill('Inv')
  await page.getByPlaceholder('Last name').fill('Booker')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByRole('button', { name: 'Confirm booking' }).click()
  await expect(page.getByText("You're booked!")).toBeVisible({ timeout: 15000 })
}

async function invoiceForEmail(email) {
  const { data: client } = await sb().from('clients').select('id').eq('email', email).single()
  const { data: inv } = await sb().from('invoices')
    .select('id, status, session_id, invoice_line_items(title, unit_price), invoice_payment_schedule(sequence, amount, due_date)')
    .eq('client_id', client.id).single()
  return { clientId: client.id, inv }
}

async function cleanup(pageId, email) {
  await sb().from('signup_pages').delete().eq('id', pageId)
  const { data: clients } = await sb().from('clients').select('id').eq('email', email)
  for (const c of clients ?? []) {
    await sb().from('invoices').delete().eq('client_id', c.id)
    await sb().from('sessions').delete().eq('client_id', c.id)
    await sb().from('clients').delete().eq('id', c.id)
  }
}

test('booking a priced shoot type creates a draft with retainer and balance', async ({ page }) => {
  const signupPage = await createSignupPage()
  const type = await createShootType(signupPage.id, { price: 300, retainer_amount: 100 })
  const slot = futureThreePmSlot(9)
  await sb().from('signup_slots').insert({ signup_page_id: signupPage.id, shoot_type_id: type.id, start_time: slot.start, end_time: slot.end })
  const email = `booking-invoice-${crypto.randomUUID().slice(0, 8)}@example.com`
  try {
    await book(page, signupPage, email)
    const { inv } = await invoiceForEmail(email)
    expect(inv.status).toBe('draft')
    expect(inv.invoice_line_items).toEqual([{ title: 'PW Priced Shoot', unit_price: 300 }])
    const schedule = [...inv.invoice_payment_schedule].sort((a, b) => a.sequence - b.sequence)
    expect(schedule.map(r => Number(r.amount))).toEqual([100, 200])
    expect(schedule[1].due_date).toBe(slot.date)
  } finally {
    await cleanup(signupPage.id, email)
  }
})

test('a shoot type linked to an invoice template uses the template', async ({ page }) => {
  const photographerId = await getPhotographerId()
  const { data: template } = await sb().from('invoice_templates')
    .insert({ photographer_id: photographerId, name: `PW Booking Template ${crypto.randomUUID().slice(0, 6)}` }).select().single()
  await sb().from('invoice_template_items').insert([
    { template_id: template.id, title: 'PW Package', unit_price: 400, quantity: 1, sort_order: 0, taxable: false },
    { template_id: template.id, title: 'PW Album', unit_price: 100, quantity: 1, sort_order: 1, taxable: false },
  ])
  const signupPage = await createSignupPage()
  const type = await createShootType(signupPage.id, { price: 999, invoice_template_id: template.id })
  const slot = futureThreePmSlot(10)
  await sb().from('signup_slots').insert({ signup_page_id: signupPage.id, shoot_type_id: type.id, start_time: slot.start, end_time: slot.end })
  const email = `booking-template-${crypto.randomUUID().slice(0, 8)}@example.com`
  try {
    await book(page, signupPage, email)
    const { inv } = await invoiceForEmail(email)
    expect(inv.status).toBe('draft')
    expect(inv.invoice_line_items.map(l => l.title).sort()).toEqual(['PW Album', 'PW Package'])
    expect(inv.invoice_payment_schedule).toHaveLength(0)
  } finally {
    await cleanup(signupPage.id, email)
    await sb().from('invoice_templates').delete().eq('id', template.id)
  }
})
