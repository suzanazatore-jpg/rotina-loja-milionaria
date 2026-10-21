import { handleScheduledPush } from '@/lib/scheduledPushNotifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request) {
  return handleScheduledPush(request, 'motivacional')
}
