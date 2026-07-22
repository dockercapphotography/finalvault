import pathlib

path = pathlib.Path("src/utils/signupApi.js")
src = path.read_text()

old_block = '''export async function getSignupPages() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('signup_pages')
    .select(`
      id, title, token, venue_address, venue_lat, venue_lng, timezone, is_active, created_at,
      signup_shoot_types ( id ),
      signup_slots ( id, claimed_at )
    `)
    .eq('photographer_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(p => ({
    ...p,
    shoot_type_count: p.signup_shoot_types?.length ?? 0,
    slot_total: p.signup_slots?.length ?? 0,
    slot_claimed: p.signup_slots?.filter(s => s.claimed_at).length ?? 0,
  }))
}'''

assert src.count(old_block) == 1, "getSignupPages anchor not found or not unique"

new_block = '''export async function getSignupPages() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('signup_pages')
    .select(`
      id, title, token, venue_address, venue_lat, venue_lng, timezone, is_active, created_at,
      signup_shoot_types ( id ),
      signup_slots ( id, claimed_at, start_time )
    `)
    .eq('photographer_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(p => {
    const days = new Set((p.signup_slots ?? []).map(s => new Date(s.start_time).toLocaleDateString('en-CA', { timeZone: p.timezone })))
    return {
      ...p,
      shoot_type_count: p.signup_shoot_types?.length ?? 0,
      slot_total: p.signup_slots?.length ?? 0,
      slot_claimed: p.signup_slots?.filter(s => s.claimed_at).length ?? 0,
      day_count: days.size,
    }
  })
}'''

src = src.replace(old_block, new_block)
path.write_text(src)
print("Added day_count to getSignupPages")
