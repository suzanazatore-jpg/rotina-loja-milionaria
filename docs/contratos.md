# Contratos e assinatura eletrônica

Fluxo: pagamento aprovado → `fulfillPaidOrder` → se a oferta exige contrato (`offers.checkout_config.contract`), cria o contrato, envia o link por e-mail (Brevo) e WhatsApp (webhook BotConversa) e **não libera o acesso**. A pessoa assina em `/assinar/{token}` sem login (CPF da compra + código de 6 dígitos + assinatura desenhada). Ao assinar: PDF com rodapé (hash SHA-256 e link de validação) e página de auditoria, cópia por e-mail/WhatsApp e chamada de `fulfillPaidOrder`, que libera o acesso e envia as boas-vindas.

- Oferta → aba **Contrato**: exige contrato, modelo (CVM, EVS ou Tráfego), acesso à plataforma (CVM), prazo em meses, nome do programa, liberar só após assinatura.
- Valor, forma de pagamento e parcelas vêm do pedido real. Renovações de assinatura não geram contrato.
- Central de Vendas → Configurações → **Contratos**: status, histórico, copiar link, reenviar, PDF, liberar acesso, cancelar e editar modelos (cada edição cria nova versão; contratos emitidos guardam o próprio texto).
- Lembretes 24h/48h/72h no cron `/api/cron/checkout-conversoes`.
- Validação pública: `/contrato/validar/{id}`.

## Variáveis

- `CONTRACTS_ENABLED=true` liga o módulo (desligado por padrão).
- `CONTRACT_TOKEN_SECRET` (mínimo 32 caracteres; não trocar depois de ligado, invalida os links).
- `CONTRACT_WHATSAPP_WEBHOOK_URL`: webhook do fluxo BotConversa. Recebe `evento` (`contrato_enviado`, `contrato_lembrete`, `contrato_codigo`, `contrato_assinado`), `phone`, `name`, `message`, `link`, `code`.
- `CONTRACTS_APP_URL` (padrão `https://rotina.suzanazatorre.com.br`).
- Reaproveita `BREVO_API_KEY` e as variáveis do Supabase.

## Antes de ligar

1. Aplicar a migração `20261027120000_contracts_signature.sql`.
2. Revisar os três modelos (fonte em `docs/contratos-modelos/`, já carregados pela migração).
3. Criar o fluxo no BotConversa e cadastrar a URL.
4. Marcar as ofertas com contrato.
5. Testar uma compra sandbox ponta a ponta.
