# Backend do checkout próprio

Implementação na branch `checkout/painel-admin`. A main e o webhook Guru não foram modificados. Pagamentos utilizam as tabelas existentes. O cadastro global de rastreamento usa a tabela própria checkout_settings, criada pela migração checkout_global_tracking_settings.

## Rotas

- `POST /api/admin/checkout/pagamentos`: criação (`offer_id`, `customer`, `payment_method`, `installments`, `card_token`) e conciliação (`action: sync`, `order_id`). Requer sessão administrativa e header `Idempotency-Key` na criação. O navegador nunca informa o preço. Endereço de cobrança obrigatório. Não aceita dados abertos de cartão.
- `GET /api/admin/checkout/assinaturas`: listagem administrativa.
- `POST /api/admin/checkout/assinaturas`: `id` local e `action: sync|cancel`.
- `POST /api/webhook-pagarme`: recebimento de eventos. Autenticação Bearer com `PAGARME_WEBHOOK_SECRET`, ou HTTP Basic com usuário `pagarme` e a mesma senha. Confirmar o mecanismo disponível na conta antes de cadastrar o endpoint. Cada pagamento é consultado de novo no gateway, com conferência de pedido, cliente e valor.

## Configuração e homologação

`PAGARME_SECRET_KEY` (servidor), `PAGARME_BASE_URL` (padrão sandbox `https://sdx-api.pagar.me/core/v5`), `PAGARME_WEBHOOK_SECRET`. As variáveis Supabase e Brevo existentes são reaproveitadas.

A criação de pagamentos nesta etapa é administrativa, para homologação. O formulário público chama sua própria rota, limitada à homologação administrativa. Os adicionais selecionados são validados pelo vínculo em order_bumps, cobrados com o produto principal e registrados como itens separados.

Produção exige `CHECKOUT_LIVE_ENABLED=true` e chave `sk_live_` com URL de produção. Liberação de acesso exige `CHECKOUT_FULFILLMENT_ENABLED=true`; deixar desligada durante a homologação com contas reais. Não habilitar cobrança real antes de validar o ciclo completo no sandbox.

O navegador tokeniza o cartão diretamente no Pagar.me, com `PAGARME_PUBLIC_KEY` (`pk_test_...`) e domínio autorizado no painel do gateway. O servidor cria a carteira do cliente e o cartão via token + endereço, e usa o `card_id` gerado no próprio gateway. PAN/CVV não chegam ao backend. Nenhum `card_id` enviado pelo navegador é aceito.

## Checkout público e homologação administrativa

O link `/checkout/{slug}` carrega a aparência salva e as opções de pagamento da oferta ativa. `POST /api/checkout/{slug}` inicia a sessão (`action: start`) e paga (`action: pay`). `GET` consulta exclusivamente o pedido da sessão assinada, sem retornar dados pessoais ou aceitar IDs arbitrários. O estado financeiro é atualizado pelos webhooks; o navegador apenas lê esse estado a cada 10 segundos.

Para iniciar testes no formulário: `CHECKOUT_TEST_ENABLED=true`, `CHECKOUT_SESSION_SECRET` com pelo menos 32 caracteres, chave secreta sandbox e, para cartão, `PAGARME_PUBLIC_KEY`. A sessão de compra dura 30 minutos, usa cookie HttpOnly e SameSite Strict, e vincula a oferta à chave do pedido. As requisições POST verificam a origem e requerem a sessão administrativa do app durante a homologação. O modo de produção é recusado nesta rota.

Não habilitar o checkout anônimo de produção até homologar os fluxos reais e concluir proteção contra abuso/limites de tentativas. Se faltar configuração, a página exibe o visual e deixa o pagamento indisponível. O formulário preserva o mesmo payload em memória nas retentativas para evitar uma segunda cobrança. Ao recarregar, consulta o pedido existente; não reenvia automaticamente.

Os destinos por situação aparecem como botão Continuar após a resposta financeira, sem tirar o Pix copia e cola da tela. A aba Assinaturas permite listar, atualizar e cancelar com confirmação explícita na interface.

## Confirmação e acesso

Pedidos avulsos: Pix/cartão → confirmação consultada no gateway → atualização do pedido → plano do app. Assinaturas: criação de plano comercial no Pagar.me → assinatura → cobrança de ciclo → confirmação consultada no gateway → acesso. Status ativo da assinatura não comprova pagamento.

Cada cobrança de ciclo tem registro local idempotente; o vencimento do acesso é ancorado no pagamento e em `plans.period_days`. As configurações comerciais não criam uma segunda regra de prazo.

Emails usam os templates existentes. Falha de email fica em `webhook_events` e pode ser reenviada pelo painel de alunas. O mecanismo registra uma única liberação por pedido. Um evento `checkout.access` com `error=processing` após interrupção deve ser verificado e liberado manualmente para retentativa; não executar duas liberações concorrentes.

Reembolsos/chargebacks atualizam o estado financeiro. Revogação seletiva de acesso (sem afetar planos adquiridos no Guru ou em outros pedidos) ainda requer implementação. Cancelamento interrompe recorrência sem apagar o período já comprado. Trial comercial não libera acesso automaticamente nesta versão: aguarda pagamento.

Aparência e redirecionamentos salvos já são lidos pela página pública. Eventos de navegador de GTM/Pixel foram conectados, com ativação controlada e consentimento. Order bumps de produtos de pagamento único estão conectados.

## Validação

Testes automatizados locais de cálculo, bloqueio de produção, carteira de cartão, correspondência de confirmação, assinatura/expiração de cookies e redirecionamento; build Next.js e lint dos arquivos alterados. Sem credenciais Pagar.me neste ambiente: nenhuma transação foi criada e não há homologação ponta a ponta.


## Order Bump

Os adicionais ativos aparecem na ordem cadastrada, sem pré-seleção. Só são aceitas ofertas adicionais vinculadas ao checkout, com produto ativo de pagamento único e plano do app definido. Seleções duplicadas, IDs externos à oferta ou método de pagamento incompatível são recusados antes da cobrança. Assinaturas continuam sem adicionais.

O total e as parcelas incluem os adicionais selecionados. O parcelamento e os juros seguem a oferta principal; o desconto Pix segue cada item. O backend recalcula todos os valores em centavos e envia os itens ao Pagar.me em um único pedido. O navegador envia apenas IDs de ofertas; não informa preços.

A lista dos planos comprados é registrada junto do pedido para que alterações posteriores no vínculo do produto não liberem um plano diferente. Após o pagamento, cada plano usa seu period_days no app. Cursos compartilhados mantêm a maior expiração aplicável e acessos vitalícios existentes são preservados. Uma única liberação e um único email de acesso são processados por pedido.

Validação local: cálculo do carrinho, seleção e cobrança de adicionais, entrega de dois planos com períodos distintos e repetição da confirmação. O teste ponta a ponta no Pagar.me permanece reservado para o final.


## Cadastro global de rastreamento

Central de Vendas → Configurações → Rastreamento global salva GTM e Meta Pixel uma vez. Na oferta, Pixels permite usar o padrão, personalizar ou desativar. IDs anteriores por oferta são preservados como personalizados. Novas ofertas sem IDs herdam o padrão automaticamente; uma personalização com campo vazio não reintroduz o ID global.

checkout_settings aceita acesso apenas pelo servidor (service_role), com RLS habilitada e sem grants para anon/authenticated. A API administrativa valida a sessão e os formatos dos IDs. Tokens e scripts não são aceitos nesses campos. O checkout resolve os identificadores efetivos no servidor.

O cadastro e a herança estão conectados aos eventos do navegador descritos abaixo. A API de Conversões ainda será conectada. Nenhum evento real de compra foi disparado durante o desenvolvimento.


## Eventos do navegador

CHECKOUT_TRACKING_ENABLED=true ativa o componente somente com PAGARME_BASE_URL de produção e VERCEL_ENV=production. A prévia sandbox não carrega rastreadores nem envia compras de teste. A cliente pode permitir/recusar cookies e rever a escolha; scripts carregam após consentimento.

Se GTM estiver preenchido, somente ele é carregado. Meta Pixel direto é usado apenas sem GTM. No container, configurar tags para page_view, view_item, begin_checkout e purchase; desativar PageView automático se usar o evento explícito, para não duplicar visitas. A tag Meta do GTM precisa usar o ID configurado no container e event_id do dataLayer; cadastrar o Pixel junto do GTM não cria essa tag automaticamente.

A compra usa transaction_id e event_id estáveis por pedido. O payload de Purchase sai do backend somente para pedidos pagos, com data de pagamento e preços dos itens consistentes com o total. Inclui os adicionais efetivamente pagos. O navegador memoriza pedidos já enviados para evitar reenvio por polling/atualização. Falhas de tracking não bloqueiam o checkout.

Essa entrega envia eventos pelo navegador enquanto a página estiver aberta. Bloqueadores, conexão e limpeza do armazenamento podem afetar entrega/deduplicação. A API de Conversões servidor a servidor ainda não está conectada; usará o mesmo event_id. Credenciais secretas não são enviadas ao navegador.
