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
