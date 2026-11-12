// E-mail de boas-vindas enviado pelo Brevo, com botão próprio e link de reserva.
// Usa HTML inline e tabelas para compatibilidade com Outlook, Gmail e modo escuro.
// Mantém a mesma interface utilizada nos fluxos de criação e reenvio de acesso.

const LOGIN_PADRAO = 'https://rotina.suzanazatorre.com.br/login'
const REMETENTE = { name: 'Rotina da Loja Milionária', email: 'suporte@suzanazatorre.com.br' }

function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, caractere => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[caractere])
}

export function montarEmailBoasVindas({ nome, email, senha }) {
  const emailNormalizado = String(email || '').trim().toLowerCase()
  const loginUrl = new URL(process.env.NEXT_PUBLIC_LOGIN_URL || LOGIN_PADRAO)
  loginUrl.hash = new URLSearchParams({ email: emailNormalizado }).toString()
  const linkLogin = loginUrl.toString()
  const linkVisivel = loginUrl.origin + loginUrl.pathname
  const nomeSeguro = escaparHtml(nome || 'aluna')
  const emailSeguro = escaparHtml(emailNormalizado)
  const senhaSegura = escaparHtml(senha)
  const linkSeguro = escaparHtml(linkLogin)

  // O botão usa bgcolor no <td>, além de cor inline. Assim não depende
  // das regras de estilo do template do Brevo, que podem sumir no Outlook.
  const htmlContent = [
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">',
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">',
    '</head><body style="margin:0;padding:0;background-color:#f2f2f2;">',
    '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f2f2f2">',
    '<tr><td align="center" style="padding:24px 12px;">',
    '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#171717" style="max-width:540px;background-color:#171717;border-radius:14px;">',
    '<tr><td align="center" style="padding:32px 28px 10px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;color:#D4AF37;">',
    '👑 ROTINA DA LOJA MILIONÁRIA</td></tr>',
    '<tr><td style="padding:18px 28px 10px;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">',
    '<p style="margin:0 0 16px;font-size:20px;line-height:1.4;font-weight:700;color:#ffffff;">Bem-vinda, ' + nomeSeguro + '! 🎉</p>',
    '<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#ffffff;">Seu acesso à <strong style="color:#F5D76E;">Rotina da Loja Milionária</strong> já está liberado. Use os dados abaixo para entrar:</p>',
    '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#262626" style="background-color:#262626;border:1px solid #D4AF37;border-radius:10px;">',
    '<tr><td style="padding:18px 20px;font-size:14px;line-height:1.8;color:#ffffff;">',
    '<span style="color:#F5D76E;font-weight:700;">SEUS DADOS DE ACESSO</span>',
    '<div style="color:#ffffff;">E-mail: <strong>' + emailSeguro + '</strong></div>',
    '<div style="color:#ffffff;">Senha: <strong>' + senhaSegura + '</strong></div>',
    '</td></tr></table>',
    '</td></tr>',
    '<tr><td align="center" style="padding:18px 28px 8px;">',
    '<table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>',
    '<td align="center" bgcolor="#D4AF37" style="background-color:#D4AF37;border-radius:9px;">',
    '<a href="' + linkSeguro + '" target="_blank" style="display:inline-block;padding:16px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;background-color:#D4AF37;color:#101010;border-radius:9px;">ACESSAR A PLATAFORMA</a>',
    '</td></tr></table></td></tr>',
    '<tr><td align="center" style="padding:12px 28px 26px;font-family:Arial,Helvetica,sans-serif;">',
    '<p style="font-size:13px;line-height:1.6;color:#ffffff;margin:0 0 9px;">Se o botão não aparecer, acesse diretamente pelo link:</p>',
    '<a href="' + linkSeguro + '" target="_blank" style="color:#F5D76E;font-size:14px;text-decoration:underline;overflow-wrap:anywhere;">' + escaparHtml(linkVisivel) + '</a>',
    '</td></tr></table></td></tr></table></body></html>',
  ].join('')

  const textContent = [
    'Bem-vinda, ' + String(nome || 'aluna') + '!',
    'Seu acesso à Rotina da Loja Milionária já está liberado.',
    '',
    'SEUS DADOS DE ACESSO',
    'E-mail: ' + emailNormalizado,
    'Senha: ' + String(senha ?? ''),
    '',
    'ACESSAR A PLATAFORMA:',
    linkLogin,
  ].join('\n')

  return { htmlContent, textContent, linkLogin }
}

export async function enviarEmailBoasVindas({ nome, email, senha }) {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) throw new Error('BREVO_API_KEY não configurada')

  const { htmlContent, textContent } = montarEmailBoasVindas({ nome, email, senha })
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: REMETENTE,
      to: [{ email, name: nome }],
      subject: '👑 Bem-vinda à Rotina da Loja Milionária — seus dados de acesso',
      htmlContent,
      textContent,
    }),
  })

  if (!response.ok) {
    const erro = await response.text()
    console.error('Erro ao enviar e-mail via Brevo:', erro)
    throw new Error('Falha ao enviar e-mail de boas-vindas via Brevo')
  }

  return response.json()
}
