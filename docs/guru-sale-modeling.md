# Modelagem da tela de venda

Referência analisada em 05/11/2026: Guru, transação ch_gWK9nMxFwnhkJjVq, abas detalhe/comprador/extras/comentários/auditoria. Destino autorizado: detalhe de vendas do checkout, branch checkout/painel-admin, ambiente de prévia Vercel existente.

## Decisões e contratos

- Manter Next.js/React/Supabase existentes e o shell da Central de Vendas. Isolar o módulo da venda para não alterar clientes/assinaturas.
- Mesmas cinco abas e hierarquia de cards; estilo por CSS module, Inter/Urbanist já instaladas, tema claro/escuro preservado.
- GET /api/admin/checkout/venda?id=:uuid agrega o registro existente, ações administrativas e auditoria real. Consulta opcional payment=1 ao Pagar.me retorna apenas detalhes necessários da cobrança validada, sem números completos de cartão.
- POST no mesmo endpoint exige administrador, origem mesma, JSON limitado e chave de idempotência UUID. Ações: sync, buyer, invoice, resend, refund, chargeback. Validação no servidor; nenhum envio executado durante a implementação.
- Reutilizar webhook_events como histórico de notas fiscais, alteração fiscal do comprador e ações. Sem tabelas novas e sem migração. Editar somente esta venda por padrão; Atualizar Contato também grava o cadastro compartilhado se escolhido.
- Reenvio por canal: área de membros retoma a liberação existente sem estender o prazo; contratos reutilizam fila de convites/cópias; email envia confirmação com link da compra sem alterar senha; webhooks clonam os envios do status atual para fila existente. Autoresponders/ecommerce/faturamento/SMS indisponíveis por não haver adaptadores no projeto. Não simular envio.
- Reembolso integral validado contra cobrança Pagar.me e processado pela API oficial; chargeback é marcação administrativa local explícita, com revisão/reversão de acesso pelos serviços existentes.
- Link da venda /compra/:token usa HMAC com domínio separado, mostra apenas status/valores/produto e PIX pendente válido; sem dados pessoais, noindex e no-referrer. URL de pagamento usa alias persistido quando existir.
- Auditoria com filtros por dias de São Paulo e modal JSON/tempos/usuário/infraestrutura condicionais. Segredos e caminhos privados de webhooks são suprimidos.

## Limites de fidelidade

Não importar dados nem marca Guru. Shell e navegação global preservados. Dados ausentes no projeto aparecem como travessão, incluindo taxa líquida/adquirente/geolocalização quando ainda não capturados. Sem percentuais de fidelidade arbitrários. Reembolsos, chargebacks, envios e edição de dados reais não serão executados apenas para validar aparência.

## Validação

Testes existentes de histórico, webhooks, acesso e contrato: 25 aprovados. Novos testes de link assinado, redação de segredos, dados fiscais/comprador e autorização da API: 5 aprovados. Build inicial compilou mas parou em módulo antigo que exige variáveis de ambiente; build completo com placeholders de compilação passou, sem modificar as variáveis do deployment. A versão final e a inspeção no ambiente publicado serão registradas após deploy.
