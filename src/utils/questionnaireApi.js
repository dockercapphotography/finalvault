import { supabase } from '../supabaseClient.js'

// ── Templates ─────────────────────────────────────────────────────────────────

export async function getQuestionnaireTemplates() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('questionnaire_templates')
    .select('*')
    .eq('photographer_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getQuestionnaireTemplate(id) {
  const { data, error } = await supabase
    .from('questionnaire_templates')
    .select('*, questionnaire_questions(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  // Sort questions by sort_order
  if (data?.questionnaire_questions) {
    data.questionnaire_questions.sort((a, b) => a.sort_order - b.sort_order)
  }
  return data
}

export async function createQuestionnaireTemplate({ name, headerText, requireAgreement, agreementLabel, confirmationMessage, collectEmail, collectName }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('questionnaire_templates')
    .insert({
      photographer_id: user.id,
      name,
      header_text: headerText || null,
      require_agreement: requireAgreement || false,
      agreement_label: agreementLabel || 'I have read and agree to the terms above.',
      confirmation_message: confirmationMessage || null,
      collect_email: collectEmail || false,
      collect_name: collectName || false,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateQuestionnaireTemplate(id, { name, headerText, requireAgreement, agreementLabel, confirmationMessage, collectEmail, collectName }) {
  const { data, error } = await supabase
    .from('questionnaire_templates')
    .update({
      name,
      header_text: headerText || null,
      require_agreement: requireAgreement || false,
      agreement_label: agreementLabel || 'I have read and agree to the terms above.',
      confirmation_message: confirmationMessage || null,
      collect_email: collectEmail || false,
      collect_name: collectName || false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteQuestionnaireTemplate(id) {
  const { error } = await supabase
    .from('questionnaire_templates')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function duplicateQuestionnaireTemplate(template) {
  const { data: { user } } = await supabase.auth.getUser()

  // Create new template
  const { data: newTemplate, error: tErr } = await supabase
    .from('questionnaire_templates')
    .insert({
      photographer_id: user.id,
      name: `${template.name} (copy)`,
      header_text: template.header_text,
      require_agreement: template.require_agreement,
      agreement_label: template.agreement_label,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (tErr) throw tErr

  // Fetch and copy questions
  const { data: questions } = await supabase
    .from('questionnaire_questions')
    .select('*')
    .eq('template_id', template.id)
    .order('sort_order')

  if (questions?.length) {
    const { error: qErr } = await supabase
      .from('questionnaire_questions')
      .insert(questions.map(q => ({
        template_id: newTemplate.id,
        type: q.type,
        label: q.label,
        options: q.options,
        required: q.required,
        sort_order: q.sort_order,
      })))
    if (qErr) throw qErr
  }

  return newTemplate
}

// ── Questions ─────────────────────────────────────────────────────────────────

export async function createQuestion(templateId, { type, label, options, required, sortOrder }) {
  const { data, error } = await supabase
    .from('questionnaire_questions')
    .insert({
      template_id: templateId,
      type,
      label,
      options: options || null,
      required: required || false,
      sort_order: sortOrder ?? 0,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateQuestion(id, { type, label, options, required }) {
  const { data, error } = await supabase
    .from('questionnaire_questions')
    .update({ type, label, options: options || null, required: required || false })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteQuestion(id) {
  const { error } = await supabase
    .from('questionnaire_questions')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function reorderQuestions(questions) {
  // questions: array of { id, sort_order }
  const updates = questions.map(q =>
    supabase
      .from('questionnaire_questions')
      .update({ sort_order: q.sort_order })
      .eq('id', q.id)
  )
  await Promise.all(updates)
}
