import webpush from 'web-push'

let configured = false

export function getVapidPublicKey() {
  return process.env.PUSH_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || ''
}

function configureWebPush() {
  if (configured) return

  const publicKey = getVapidPublicKey()
  const privateKey = process.env.PUSH_VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:suporte@suzanazatorre.com.br'

  if (!publicKey || !privateKey) {
    throw new Error('As chaves de notificação ainda não foram configuradas.')
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

export async function sendPushNotification(subscription, payload) {
  configureWebPush()

  return webpush.sendNotification(
    subscription,
    JSON.stringify(payload),
    {
      TTL: 60 * 60 * 6,
      urgency: 'normal',
    },
  )
}
