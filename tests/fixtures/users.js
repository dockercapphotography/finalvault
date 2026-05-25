// Test user credentials and setup helpers
export const TEST_PHOTOGRAPHER = {
  email: process.env.TEST_PHOTOGRAPHER_EMAIL || 'test-photographer@finalvault.test',
  password: process.env.TEST_PHOTOGRAPHER_PASSWORD || 'test-password-123'
}

export const TEST_CLIENT = {
  name: 'Test Client',
  galleryToken: process.env.TEST_GALLERY_TOKEN || 'test-share-token'
}
