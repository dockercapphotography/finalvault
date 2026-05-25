// R2 upload/fetch/delete helpers — calls finalvault-worker
export async function uploadToR2(file, key, token) { /* TODO */ }
export async function deleteFromR2(key, token) { /* TODO */ }
export function getPreviewUrl(key) { return `${import.meta.env.VITE_R2_WORKER_URL}/preview/${key}` }
export function getOriginalUrl(key) { return `${import.meta.env.VITE_R2_WORKER_URL}/original/${key}` }
