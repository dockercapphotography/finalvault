// Client-facing API — viewers, favorites, comments
import { supabase } from '../supabaseClient.js'
export async function getGalleryByToken(token) { /* TODO */ }
export async function createViewer(galleryId, name) { /* TODO */ }
export async function toggleFavorite(imageId, viewerId) { /* TODO */ }
export async function addComment(galleryId, imageId, viewerId, body) { /* TODO */ }
