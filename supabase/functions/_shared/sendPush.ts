// Shared by every Edge Function that sends a push notification --
// send-claim-push, send-questionnaire-push, and sign-contract (inline).
// Pulled out once there were 3 call sites, per the original push
// architecture doc's own suggestion for when this becomes worth doing.
//
// Looks up a photographer's subscriptions, sends to all of them, cleans up
// any that come back 404/410 (permanently invalidated by the push
// service), and requests high-urgency delivery so Android's Doze/battery
// management doesn't defer time-sensitive notifications like these.
import webpush from 'npm:web-push@3.6.7'

export async function sendPushToPhotographer(
  supabase: any,
  photographerId: string,
  payload: { title: string; body: string; url: string }
): Promise<{ sent: number; cleaned: number }> {
  const { data: subscriptions, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('photographer_id', photographerId)

  if (subsError) throw subsError
  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0, cleaned: 0 }
  }

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT')!,
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )

  const body = JSON.stringify(payload)
  let sent = 0
  const staleIds: string[] = []

  await Promise.all(subscriptions.map(async (sub: any) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { urgency: 'high' }
      )
      sent++
    } catch (err: any) {
      // 404/410 means the push service has permanently invalidated this
      // subscription (permission revoked, PWA uninstalled, etc.) -- clean
      // it up so push_subscriptions doesn't accumulate dead rows.
      const statusCode = err?.statusCode
      if (statusCode === 404 || statusCode === 410) {
        staleIds.push(sub.id)
      } else {
        console.error('Push send failed:', sub.id, err)
      }
    }
  }))

  if (staleIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds)
  }

  return { sent, cleaned: staleIds.length }
}
