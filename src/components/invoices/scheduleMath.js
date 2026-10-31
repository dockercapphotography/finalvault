// Payment schedule rebalancing (v1.6.0), in integer cents.
//
// A row: { key, id?, amountCents, due_date, allocatedCents }
//   allocatedCents: what payments have already covered (from the database);
//   a row is locked once allocatedCents >= amountCents.
//
// Rules (scope: "change one row and the other unpaid rows rebalance"):
//   * Locked rows never change.
//   * Editing a row keeps that row; the unlocked rows after it share what's
//     left evenly (the last takes the odd cents). Editing the last row
//     spreads the difference over the unlocked rows before it.
//   * When the invoice total changes, unlocked rows keep their proportions.
//   * New rows go at the end, split from the last unlocked row.

export function isLocked(row) {
  return row.allocatedCents > 0 && row.allocatedCents >= row.amountCents
}

function evenSplit(amount, n) {
  if (n <= 0) return []
  const base = Math.floor(amount / n)
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? amount - base * (n - 1) : base))
}

function lockedSum(rows) {
  return rows.reduce((s, r) => s + (isLocked(r) ? r.amountCents : 0), 0)
}

// Row at `index` was set to `amountCents` by the user.
export function rebalanceAfterEdit(rows, index, amountCents, totalCents) {
  const next = rows.map(r => ({ ...r }))
  next[index].amountCents = amountCents
  // The unpaid rows after the edited one absorb the change, so amounts you
  // set earlier in the list stay put; editing the last row adjusts the
  // ones before it instead.
  const open = next.map((r, i) => i).filter(i => i !== index && !isLocked(next[i]))
  const after = open.filter(i => i > index)
  const others = after.length ? after : open
  if (others.length === 0) return next
  const fixed = next.reduce((s, r, i) => s + (i === index || others.includes(i) ? 0 : r.amountCents), 0)
  const remaining = totalCents - fixed - amountCents
  if (remaining < others.length) return next  // can't give every other row at least 1 cent; leave it to validation
  evenSplit(remaining, others.length).forEach((amt, k) => { next[others[k]].amountCents = amt })
  return next
}

// Invoice total changed: unlocked rows keep their share of what's unlocked.
export function rescaleToTotal(rows, totalCents) {
  const next = rows.map(r => ({ ...r }))
  const open = next.map((r, i) => i).filter(i => !isLocked(next[i]))
  if (open.length === 0) return next
  const remaining = totalCents - lockedSum(next)
  if (remaining < open.length) return next
  const currentSum = open.reduce((s, i) => s + next[i].amountCents, 0)
  if (currentSum <= 0) {
    evenSplit(remaining, open.length).forEach((amt, k) => { next[open[k]].amountCents = amt })
    return next
  }
  let assigned = 0
  open.forEach((i, k) => {
    if (k === open.length - 1) {
      next[i].amountCents = remaining - assigned
    } else {
      const amt = Math.max(1, Math.round(next[i].amountCents * remaining / currentSum))
      next[i].amountCents = amt
      assigned += amt
    }
  })
  return next
}

let keySeq = 0
export function newRowKey() {
  keySeq += 1
  return `new-${Date.now()}-${keySeq}`
}

export function startSchedule(totalCents, dueDate) {
  const [a, b] = evenSplit(totalCents, 2)
  return [
    { key: newRowKey(), amountCents: a, due_date: '', allocatedCents: 0 },
    { key: newRowKey(), amountCents: b, due_date: dueDate || '', allocatedCents: 0 },
  ]
}

// Adds a row at the end, split from the last unlocked row.
export function addRow(rows) {
  const next = rows.map(r => ({ ...r }))
  const lastOpen = [...next.keys()].reverse().find(i => !isLocked(next[i]) && next[i].amountCents - next[i].allocatedCents >= 2)
  if (lastOpen === undefined) return next
  const free = next[lastOpen].amountCents - next[lastOpen].allocatedCents
  const moved = Math.floor(free / 2)
  next[lastOpen].amountCents -= moved
  next.push({ key: newRowKey(), amountCents: moved, due_date: '', allocatedCents: 0 })
  return next
}

// Removes an unpaid row; its amount is shared back by proportion.
export function removeRow(rows, index, totalCents) {
  if (rows[index].allocatedCents > 0) return rows
  return rescaleToTotal(rows.filter((_, i) => i !== index), totalCents)
}

// Problems that block saving, in plain words. Empty = fine.
export function scheduleProblems(rows, totalCents) {
  if (rows.length === 0) return []
  const problems = []
  const sum = rows.reduce((s, r) => s + r.amountCents, 0)
  if (rows.some(r => !(r.amountCents > 0))) problems.push('Every installment needs an amount.')
  rows.forEach((r, i) => {
    if (r.allocatedCents > r.amountCents) problems.push(`Installment ${i + 1} already has $${(r.allocatedCents / 100).toFixed(2)} paid toward it.`)
  })
  if (sum !== totalCents) problems.push(`Installments add up to $${(sum / 100).toFixed(2)} but the total is $${(totalCents / 100).toFixed(2)}.`)
  return problems
}
