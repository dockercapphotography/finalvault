// Date, file size, and misc formatters
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
export function formatDate(dateString) {
  // Append time to date-only strings to prevent UTC-to-local timezone shift
  const normalized = dateString?.length === 10 ? dateString + 'T00:00:00' : dateString
  return new Date(normalized).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function compactRange(startTime, startPeriod, endTime, endPeriod) {
  const start = startTime.replace(':00', '')
  const end = endTime.replace(':00', '')
  if (startPeriod === endPeriod) return `${start} – ${end} ${endPeriod}`
  return `${start} ${startPeriod} – ${end} ${endPeriod}`
}

// For ISO timestamps (signup_slots.start_time/end_time and similar) --
// needs a timezone since these are stored in UTC.
export function formatTimeRange(startIso, endIso, timezone) {
  const split = iso => {
    const str = new Date(iso).toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true })
    const [time, period] = str.split(' ')
    return [time, period]
  }
  const [startTime, startPeriod] = split(startIso)
  const [endTime, endPeriod] = split(endIso)
  return compactRange(startTime, startPeriod, endTime, endPeriod)
}

// For plain "HH:MM:SS" local-time strings with no date/timezone info
// (sessions.start_time/end_time) -- used by formatSessionDate.
export function formatPlainTimeRange(startHHMM, endHHMM) {
  const split = t => {
    const [h, m] = t.split(':')
    const hour = parseInt(h)
    const period = hour >= 12 ? 'PM' : 'AM'
    return [`${hour % 12 || 12}:${m}`, period]
  }
  const [startTime, startPeriod] = split(startHHMM)
  const [endTime, endPeriod] = split(endHHMM)
  return compactRange(startTime, startPeriod, endTime, endPeriod)
}

export function formatPhone(raw) {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return raw
}
