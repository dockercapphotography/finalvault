// Shared helpers for the disposable storage tiers tests use to switch the
// Playwright account's premium access on or off.
//
// Why this exists: four test files each had their own copy of the same
// "snapshot tier -> create disposable tier -> run -> restore -> delete"
// logic, and none of them checked whether the restore or the delete
// succeeded. When cleanup failed (or a run was stopped mid-test), the
// account silently stayed on a leftover `pw-premium-*` tier -- for two
// weeks in Oct 2026 -- which made the "without premium" tests skip
// themselves instead of running. This module:
//   - keeps the logic in one place,
//   - throws when cleanup fails, so a leak shows up as a red test,
//   - never "restores" the account onto another leftover test tier, and
//   - sweeps leftovers at the start of every run (see tiers.setup.js).

// Every disposable tier name starts with one of these. Real tiers
// (Free, Hobbyist, Pro, Studio, Backup Tier, and the admin tests' own
// "PW Test Tier ..." rows) never do.
const TEST_TIER_PREFIXES = ['pw-premium-', 'pw-no-premium-']

export function isTestTierName(name) {
  return typeof name === 'string' && TEST_TIER_PREFIXES.some(prefix => name.startsWith(prefix))
}

export async function getTestPhotographerId(sb) {
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(`Could not list auth users: ${error.message}`)
  const user = data.users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error('Test photographer user not found in Supabase')
  return user.id
}

// The tier new signups get (Free). This is the Playwright account's
// intended baseline: no premium features.
async function getDefaultTierId(sb) {
  const { data, error } = await sb.from('storage_tiers').select('id').eq('is_default', true)
  if (error) throw new Error(`Could not read the default storage tier: ${error.message}`)
  if (data.length !== 1) throw new Error(`Expected exactly one default storage tier, found ${data.length}`)
  return data[0].id
}

async function getTierName(sb, tierId) {
  const { data, error } = await sb.from('storage_tiers').select('name').eq('id', tierId).maybeSingle()
  if (error) throw new Error(`Could not read storage tier ${tierId}: ${error.message}`)
  return data?.name ?? null
}

// Moves the photographer onto a brand-new disposable tier with premium
// features on or off, runs fn(tierId), then puts them back and deletes
// the disposable tier -- whether fn passed or failed.
export async function withTemporaryTier(sb, photographerId, { premium }, fn) {
  const { data: storageRow, error: storageErr } = await sb
    .from('photographer_storage')
    .select('tier_id')
    .eq('photographer_id', photographerId)
    .maybeSingle()
  if (storageErr) throw new Error(`Could not read photographer_storage: ${storageErr.message}`)

  let restoreTierId = storageRow?.tier_id ?? null
  // If an earlier run leaked and left the account on a test tier,
  // "restoring" to it would keep the leak alive forever. Restore to the
  // default tier instead.
  if (restoreTierId && isTestTierName(await getTierName(sb, restoreTierId))) {
    restoreTierId = await getDefaultTierId(sb)
  }

  const prefix = premium ? 'pw-premium-' : 'pw-no-premium-'
  const { data: tier, error: tierErr } = await sb
    .from('storage_tiers')
    .insert({
      name: `${prefix}${crypto.randomUUID().slice(0, 8)}`,
      storage_gb: premium ? 50 : 5,
      price_monthly: 0,
      allow_premium_features: premium,
    })
    .select()
    .single()
  if (tierErr) throw new Error(`Could not create disposable tier: ${tierErr.message}`)

  const { error: assignErr } = await sb
    .from('photographer_storage')
    .upsert({ photographer_id: photographerId, tier_id: tier.id }, { onConflict: 'photographer_id' })
  if (assignErr) {
    await sb.from('storage_tiers').delete().eq('id', tier.id)
    throw new Error(`Could not assign disposable tier: ${assignErr.message}`)
  }

  try {
    return await fn(tier.id)
  } finally {
    const problems = []

    const { error: restoreErr } = restoreTierId
      ? await sb.from('photographer_storage').update({ tier_id: restoreTierId }).eq('photographer_id', photographerId)
      : await sb.from('photographer_storage').delete().eq('photographer_id', photographerId)
    if (restoreErr) problems.push(`restoring the original tier failed: ${restoreErr.message}`)

    // Deleting the tier only works once nothing points at it, so this
    // also fails loudly if the restore above silently didn't happen.
    const { error: deleteErr } = await sb.from('storage_tiers').delete().eq('id', tier.id)
    if (deleteErr) problems.push(`deleting ${tier.name} failed: ${deleteErr.message}`)

    if (problems.length) {
      throw new Error(
        `Disposable tier cleanup failed (${problems.join('; ')}). ` +
        `The test account may still be on ${tier.name}; the tier sweep at the start of the next run will repair it.`
      )
    }
  }
}

// Repairs anything a previous interrupted or failed run left behind:
// moves the Playwright account off any leftover test tier onto the
// default tier, then deletes every test tier nobody is on. Leaves a test
// tier alone (and says so) if anyone other than the test account is on it.
export async function sweepLeftoverTestTiers(sb) {
  const photographerId = await getTestPhotographerId(sb)

  const { data: candidates, error: listErr } = await sb.from('storage_tiers').select('id, name').like('name', 'pw-%')
  if (listErr) throw new Error(`Could not list storage tiers: ${listErr.message}`)
  const leftovers = candidates.filter(t => isTestTierName(t.name))
  if (!leftovers.length) return { removed: 0, movedTestAccount: false, keptInUse: [] }
  const leftoverIds = leftovers.map(t => t.id)

  const { data: assigned, error: assignedErr } = await sb
    .from('photographer_storage')
    .select('photographer_id, tier_id')
    .in('tier_id', leftoverIds)
  if (assignedErr) throw new Error(`Could not read tier assignments: ${assignedErr.message}`)

  let movedTestAccount = false
  if (assigned.some(row => row.photographer_id === photographerId)) {
    const { error: moveErr } = await sb
      .from('photographer_storage')
      .update({ tier_id: await getDefaultTierId(sb) })
      .eq('photographer_id', photographerId)
    if (moveErr) throw new Error(`Could not move the test account off a leftover test tier: ${moveErr.message}`)
    movedTestAccount = true
  }

  const keptInUse = [...new Set(
    assigned.filter(row => row.photographer_id !== photographerId).map(row => row.tier_id)
  )]
  const deletable = leftoverIds.filter(id => !keptInUse.includes(id))
  if (deletable.length) {
    const { error: deleteErr } = await sb.from('storage_tiers').delete().in('id', deletable)
    if (deleteErr) throw new Error(`Could not delete leftover test tiers: ${deleteErr.message}`)
  }

  return {
    removed: deletable.length,
    movedTestAccount,
    keptInUse: leftovers.filter(t => keptInUse.includes(t.id)).map(t => t.name),
  }
}
