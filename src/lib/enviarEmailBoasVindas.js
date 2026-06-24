// src/lib/enviarEmailBoasVindas.js
//
// Função utilitária que dispara o e-mail de boas-vindas via Brevo (template ID 2).
// Usada tanto no fluxo automático (dentro de /api/criar-aluna)
// quanto no fluxo manual (dentro de /api/reenviar-boas-vindas).
//
// Requer no .env.local:
//   BREVO_API_KEY=xxxxx
//   NEXT_PUBLIC_LOGIN_URL=https://SEU-DOMINIO-AQUI.com/login

const BREVO_TEMPLATE_ID = 2; // ID do template "Boas-vindas - Cadastro de Aluna (suporte@)" no Brevo

export async function enviarEmailBoasVindas({ nome, email, senha }) {
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
        EMAIL: email,
        SENHA: senha,
        LINK_LOGIN: linkLogin,
      },
    }),
  });

  if (!response.ok) {
    const erro = await response.text();
    console.error("Erro ao enviar e-mail via Brevo:", erro);
    throw new Error(`Falha ao enviar e-mail de boas-vindas: ${erro}`);
  }

  const data = await response.json();
  return data;
}