import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const arquivo = readFileSync(new URL('../src/lib/enviarEmailBoasVindas.js', import.meta.url), 'utf8')
const { montarEmailBoasVindas, enviarEmailBoasVindas } = await import(
  'data:text/javascript;base64,' + Buffer.from(arquivo).toString('base64')
)

test('e-mail de acesso tem botão visível e link alternativo', () => {
  const { htmlContent, textContent, linkLogin } = montarEmailBoasVindas({
    nome: 'Larissa Teste',
    email: 'TESTE@EXEMPLO.COM',
    senha: 'senha-teste',
  })
  assert.match(htmlContent, /bgcolor="#D4AF37"/)
  assert.match(htmlContent, /ACESSAR A PLATAFORMA/)
  assert.match(htmlContent, /Se o botão não aparecer/)
  assert.ok(htmlContent.includes('href="' + linkLogin + '"'))
  assert.ok(textContent.includes(linkLogin))
  assert.ok(textContent.includes('Senha: senha-teste'))
  assert.ok(linkLogin.endsWith('#email=teste%40exemplo.com'))
})

test('campos personalizados são escapados no HTML do e-mail', () => {
  const { htmlContent } = montarEmailBoasVindas({
    nome: '<script>alert(1)</script>',
    email: 'teste@exemplo.com',
    senha: 'senha&<',
  })
  assert.ok(!htmlContent.includes('<script>'))
  assert.ok(htmlContent.includes('&lt;script&gt;'))
  assert.ok(htmlContent.includes('senha&amp;&lt;'))
})

test('Brevo recebe conteúdo HTML com CTA, sem depender do template externo', async () => {
  const apiAnterior = process.env.BREVO_API_KEY
  const fetchAnterior = globalThis.fetch
  process.env.BREVO_API_KEY = 'chave-ficticia'
  let chamadas = 0
  globalThis.fetch = async (url, opcoes) => {
    chamadas += 1
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email')
    const corpo = JSON.parse(opcoes.body)
    assert.equal(corpo.to[0].email, 'aluna@exemplo.com')
    assert.equal(corpo.sender.email, 'suporte@suzanazatorre.com.br')
    assert.equal(corpo.templateId, undefined)
    assert.ok(corpo.htmlContent.includes('ACESSAR A PLATAFORMA'))
    assert.ok(corpo.textContent.includes('/login#email=aluna%40exemplo.com'))
    return Response.json({ messageId: 'mock' })
  }
  try {
    const resultado = await enviarEmailBoasVindas({
      nome: 'Aluna Teste', email: 'aluna@exemplo.com', senha: 'teste1234',
    })
    assert.equal(resultado.messageId, 'mock')
    assert.equal(chamadas, 1)
  } finally {
    globalThis.fetch = fetchAnterior
    if (apiAnterior === undefined) delete process.env.BREVO_API_KEY
    else process.env.BREVO_API_KEY = apiAnterior
  }
})
