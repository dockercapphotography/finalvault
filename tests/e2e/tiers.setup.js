import { test as setup } from '../fixtures/fixtures.js'
import { sweepLeftoverTestTiers } from '../fixtures/tiers.js'

// Runs before every test run (it's in the "setup" project, same as
// auth.setup.js). If an earlier run was interrupted or its tier cleanup
// failed, the Playwright account could be left on a disposable premium
// tier -- which silently turns off the "without premium" tests. This puts
// the account back on the default tier and deletes the leftovers first.
setup('clean up leftover disposable storage tiers', async ({ sb }) => {
  const { removed, movedTestAccount, keptInUse } = await sweepLeftoverTestTiers(sb)

  if (movedTestAccount) {
    console.warn('Tier sweep: the test account was on a leftover test tier; moved it back to the default tier.')
  }
  if (removed) {
    console.warn(`Tier sweep: removed ${removed} leftover test tier(s) from an earlier run.`)
  }
  if (keptInUse.length) {
    console.warn(`Tier sweep: kept ${keptInUse.join(', ')} -- someone other than the test account is on it. Check this by hand.`)
  }
})
