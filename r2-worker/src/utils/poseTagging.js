/**
 * The prompt and reply clean-up for AI pose-tag suggestions, as tested in the
 * Nov 2026 blind comparison (Gemma 4 won 13 of 18; see the project doc
 * claude/ai-vision-exploration.md). Kept free of worker APIs so it can be
 * tested in Node.
 */

export const POSE_TAG_MODEL = '@cf/google/gemma-4-26b-a4b-it'

// groups: [{ name, single_choice, tags: [{ tag, definition }] }] -- manual-only
// tags already removed by the caller.
export function buildPosePrompt(groups) {
  const list = groups
    .filter(g => g.tags.length)
    .map(g => `- ${g.name}${g.single_choice ? ' (pick at most ONE)' : ''}: ${g.tags.map(t => t.tag).join(', ')}`)
    .join('\n')
  const defs = groups.flatMap(g => g.tags).filter(t => t.definition)
    .map(t => `- "${t.tag}": ${t.definition}`).join('\n')
  return `You tag pose reference images (photos or illustrations) for a portrait and cosplay photographer.
Look at the image and choose every tag that clearly applies, using ONLY tags from this vocabulary (copy them exactly).
The words before each colon are group names, not tags: never include them. Skip any group where nothing applies (do not write "none").
${list}
${defs ? `\nWhat some tags mean:\n${defs}\n` : ''}
Only tag what is clearly visible. If the description you write contradicts a tag, drop the tag.
List each tag once.
Then ALWAYS suggest 1 to 3 new tags that are NOT in the vocabulary but would help a photographer find this exact pose later (pose details, body emphasis, props, setting, mood). Use plain, professional terms, including anatomical ones where relevant for boudoir work (e.g. "buttocks focus", "breast focus", "legs focus"); avoid slang. Return an empty list only if the vocabulary truly covers everything.
The description must be ONE sentence of at most 25 words.
Reply with JSON only, no other text:
{"tags": [<tags from the vocabulary>], "new_tags": [<1 to 3 new tags>], "description": "<one sentence, max 25 words, describing the pose>"}
Your whole reply must be that JSON object.`
}

// Workers AI may hand back the model's JSON already parsed, as a string
// (sometimes wrapped in prose or code fences), or under choices[0].
export function extractReply(result) {
  if (result == null) return null
  const candidate = result.response ?? result.choices?.[0]?.message?.content ?? result
  if (candidate && typeof candidate === 'object') {
    return Array.isArray(candidate.tags) ? candidate : null
  }
  const m = String(candidate).match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const o = JSON.parse(m[0])
    return Array.isArray(o.tags) ? o : null
  } catch {
    return null
  }
}

const norm = (t) => String(t).toLowerCase().trim().replace(/^[^:]+:\s*/, '').replace(/\s+/g, ' ')

// Keep only vocabulary tags (once each, at most one per single-choice group),
// drop tags the image already has, and tidy the new-tag suggestions.
export function cleanSuggestions(reply, groups, existingTags = []) {
  const groupOf = new Map()
  for (const g of groups) for (const t of g.tags) groupOf.set(t.tag, g)
  const have = new Set(existingTags.map(norm))

  const tags = []
  const usedSingle = new Set()
  for (const raw of reply?.tags ?? []) {
    const t = norm(raw)
    const g = groupOf.get(t)
    if (!g || tags.includes(t) || have.has(t)) continue
    if (g.single_choice) {
      if (usedSingle.has(g.name)) continue
      usedSingle.add(g.name)
    }
    tags.push(t)
  }

  const newTags = []
  for (const raw of reply?.new_tags ?? []) {
    const t = norm(raw)
    if (!t || t.length > 60 || groupOf.has(t) || have.has(t) || newTags.includes(t)) continue
    newTags.push(t)
    if (newTags.length === 3) break
  }

  const description = typeof reply?.description === 'string'
    ? reply.description.trim().slice(0, 300)
    : ''

  return { tags, newTags, description }
}
