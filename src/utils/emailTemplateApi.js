import { supabase } from '../supabaseClient.js'

// Email Templates previously had no dedicated API file -- EmailTemplatesTab
// called supabase.from('email_templates') directly, inline, and had no
// duplicate() at all. This brings it in line with contract/gallery/
// questionnaire templates, which all have a real API module with a full
// create/update/delete/duplicate set. Shape and conventions here match
// crmApi.js's contract-template functions and galleryTemplateApi.js as
// closely as possible -- same duplicate suffix, same no-collision-handling
// behavior, same "reassign to current user" pattern on duplicate.
//
// Note: unlike contract_templates and gallery_templates, the original
// inline email_templates code never touched an updated_at column on
// create/update -- preserved as-is here rather than assumed.

export async function getEmailTemplates() {
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createEmailTemplate({ name, subject, body }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('email_templates')
    .insert({
      photographer_id: user.id,
      name: name.trim(),
      subject: subject.trim(),
      body: body.trim(),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateEmailTemplate(id, { name, subject, body }) {
  const updates = {}
  if (name !== undefined) updates.name = name.trim()
  if (subject !== undefined) updates.subject = subject.trim()
  if (body !== undefined) updates.body = body.trim()

  const { data, error } = await supabase
    .from('email_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteEmailTemplate(id) {
  const { error } = await supabase.from('email_templates').delete().eq('id', id)
  if (error) throw error
}

// Matches duplicateContractTemplate/duplicateGalleryTemplate's convention
// exactly: reassign to the current user, suffix the name, no collision
// check, no attempt to dedupe repeated "(Copy)" suffixes.
export async function duplicateEmailTemplate(template) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('email_templates')
    .insert({
      photographer_id: user.id,
      name: `${template.name} (Copy)`,
      subject: template.subject,
      body: template.body,
    })
    .select()
    .single()
  if (error) throw error
  return data
}
