# Backend do checkout próprio

Implementação na branch `checkout/painel-admin`. A main e o webhook Guru não foram modificados. Utiliza as tabelas existentes; nenhuma migração necessária.

## Rotas

- `POST /api/admin/checkout/pagamentos`: criação (`offer_id`, `customer`, `payment_method`, `installments`, `card_token`) e conciliação (`action: sync`, `order_id`). Requer sessão administrativa e header `Idempotency-Key` na criação. O navegador nunca informa o preço. Endereço de cobrança obrigatório. Não aceita dados abertos de cartão.
- `GET /api/admin/checkout/assinaturas`: listagem administrativa.
- `POST /api/admin/checkout/assinaturas`: `id` local e `action: sync|cancel`.
- `POST /api/webhook-pagarme`: recebimento de eventos. Autenticação Bearer com `PAGARME_WEBHOOK_SECRET`, ou HTTP Basic com usuário `pagarme` e a mesma senha. Confirmar o mecanismo disponível na conta antes de cadastrar o endpoint. Cada pagamento é consultado de novo no gateway, com conferência de pedido, cliente e valor.

## Configuração e homologação

`PAGARME_SECRET_KEY` (servidor), `PAGARME_BASE_URL` (padrão sandbox `https://sdx-api.pagar.me/core/v5`), `PAGARME_WEBHOOK_SECRET`. As variáveis Supabase e Brevo existentes são reaproveitadas.

A criação de pagamentos nesta etapa é administrativa, para homologação. O formulário público ainda não chama essas rotas. Adicionais não são cobrados nesta entrega; pedidos com bumps são recusados explicitamente.

Produção exige `CHECKOUT_LIVE_ENABLED=true` e chave `sk_live_` com URL de produção. Liberação de acesso exige `CHECKOUT_FULFILLMENT_ENABLED=true`; deixar desligada durante a homologação com contas reais. Não habilitar cobrança real antes de validar o ciclo completo no sandbox.

Confirmar se a conta aceita `card_token` para pedidos transparentes: o Pagar.me restringe seu uso em pedidos a clientes Gateway. Se a conta for PSP, integrar a carteira de cartões e `card_id` validado no servidor antes de ligar o formulário público.

## Confirmação e acesso

Pedidos avulsos: Pix/cartão → confirmação consultada no gateway → atualização do pedido → plano do app. Assinaturas: criação de plano comercial no Pagar.me → assinatura → cobrança de ciclo → confirmação consultada no gateway → acesso. Status ativo da assinatura não comprova pagamento.

Cada cobrança de ciclo tem registro local idempotente; o vencimento do acesso é ancorado no pagamento e em `plans.period_days`. As configurações comerciais não criam uma segunda regra de prazo.

Emails usam os templates existentes. Falha de email fica em `webhook_events` e pode ser reenviada pelo painel de alunas. O mecanismo registra uma única liberação por pedido. Um evento `checkout.access` com `error=processing` após interrupção deve ser verificado e liberado manualmente para retentativa; não executar duas liberações concorrentes.

Reembolsos/chargebacks atualizam o estado financeiro. Revogação seletiva de acesso (sem afetar planos adquiridos no Guru ou em outros pedidos) ainda requer implementação. Cancelamento interrompe recorrência sem apagar o período já comprado. Trial comercial não libera acesso automaticamente nesta versão: aguarda pagamento.

Redirecionamentos e aparência continuam salvos na oferta; o frontend público será conectado a esses dados em etapa própria. Não há alteração visual nesta entrega.

## Validação

Testes automatizados locais de cálculo, bloqueio de produção, tokenização e correspondência de confirmação; build Next.js e lint dos arquivos alterados. Sem credenciais Pagar.me neste ambiente: nenhuma transação foi criada e não há homologação ponta a ponta.
