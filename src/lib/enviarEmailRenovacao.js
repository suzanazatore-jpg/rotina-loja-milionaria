// src/lib/enviarEmailRenovacao.js
//
// Função utilitária que dispara o e-mail de confirmação de renovação via Brevo (template ID 3).
// Usada dentro de /api/webhook-guru quando uma aluna JÁ EXISTENTE tem sua assinatura renovada
// (não envia senha, pois a senha não muda na renovação).
//
// Requer no .env.local:
//   BREVO_API_KEY=xxxxx
//   NEXT_PUBLIC_LOGIN_URL=https://SEU-DOMINIO-AQUI.com/login

const BREVO_TEMPLATE_ID = 3; // ID do template "Renovação confirmada - Assinatura (suporte@)" no Brevo

export async function enviarEmailRenovacao({ nome, email, valor, proximaCobranca }) {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new Error("BREVO_API_KEY não configurada no .env.local");
  }

  const linkLogin = process.env.NEXT_PUBLIC_LOGIN_URL || "https://exemplo.com/login";

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      to: [{ email, name: nome }],
      templateId: BREVO_TEMPLATE_ID,
      params: {
        NOME: nome,
        VALOR: valor,
        PROXIMA_COBRANCA: proximaCobranca,
        LINK_LOGIN: linkLogin,
      },
    }),
  });

  if (!response.ok) {
    const erro = await response.text();
    console.error("Erro ao enviar e-mail via Brevo:", erro);
    throw new Error(`Falha ao enviar e-mail de renovação: ${erro}`);
  }

  const data = await response.json();
  return data;
}