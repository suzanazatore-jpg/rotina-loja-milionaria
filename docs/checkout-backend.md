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

Reembolsos/chargebacks atualizam o estado financeiro. Revogação seletiva está disponível para compras com origem registrada no ledger, mediante `CHECKOUT_ACCESS_LEDGER_ENABLED=true`; compras antigas sem origem identificável exigem revisão, preservando os acessos. Cancelamento interrompe recorrência sem apagar o período já comprado. Trial comercial não libera acesso automaticamente nesta versão: aguarda pagamento.

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

### Meta Conversions API — Purchase

A compra confirmada pode ser enviada pelo servidor após pagamento imediato, webhook Pagar.me ou sincronização administrativa. O envio exige consentimento de marketing registrado no início da cobrança; usa o Pixel efetivo da oferta e os itens/valores salvos. Email normalizado é enviado com SHA-256; cartão e documento nunca entram no evento. O `event_id` é `purchase:<order_id>`, igual ao navegador. Tags de Purchase no GTM devem encaminhar esse mesmo ID à Meta para deduplicação.

Configuração exclusivamente no servidor: `META_CAPI_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, opcional `META_GRAPH_API_VERSION` (padrão suportado `v25.0`). O Pixel da compra precisa corresponder ao configurado. Em produção, exige `CHECKOUT_CAPI_ENABLED=true`, `VERCEL_ENV=production` e gateway de produção. Em preview, somente testes com `CHECKOUT_CAPI_TEST_ENABLED=true`, gateway sandbox e `META_CAPI_TEST_EVENT_CODE`; nenhum envio fica ligado por padrão. A origem sandbox/produção é salva na compra para impedir envio de uma compra sandbox como conversão real depois.

`webhook_events`, marcador `capi:<order_id>`, registra tentativa, confirmação e falhas sem token nem resposta externa. A disputa por registro impede envios concorrentes. Falhas retornam a `retry`; sincronizar novamente o pedido no endpoint administrativo de pagamentos tenta reenviar com o mesmo event ID. Há 48 horários diários de reenvio, separados por 30 minutos (minutos 15 e 45), protegido por `CRON_SECRET`. Ele consulta até 100 registros pendentes e processa até quatro conversões por execução. No plano Hobby, cada expressão roda uma vez por dia e pode atrasar até 59 minutos; portanto, os reenvios não têm precisão de 30 minutos. São 97 agendamentos no total, dentro do limite de 100, incluindo os existentes. A Vercel só agenda cron no deploy de produção; preview não executa automaticamente. O worker continua sujeito às flags e às credenciais da CAPI. Registros presos em `processing` exigem revisão manual (o processo pode ter encerrado após o envio). Eventos com mais de sete dias são ignorados. Compras antigas sem consentimento e renovações sem snapshot de consentimento não são enviadas. O consentimento é o registrado na cobrança, não um cadastro global de preferências. Falhas de analytics não interrompem pagamentos nem acesso.

Validação local usa fetch simulado; configuração na Meta, teste de recebimento/deduplicação e teste integral do checkout permanecem para a etapa final.

Reenvios usam intervalos de 5, 10, 20, 40, 80, 160 e 320 minutos; após a oitava tentativa sem confirmação, o registro exige revisão. O timestamp de recebimento do marcador CAPI é atualizado em falhas para alternar a fila; a hora de pagamento e o event ID permanecem iguais. A próxima data é a partir da qual o cron poderá tentar novamente. Pedido sem pagamento elegível ou com mais de sete dias sai da fila. Nos detalhes da venda, o painel mostra estado, ambiente, tentativas e próximo reenvio, sem expor tokens. Compras cuja tentativa inicial não chegou a criar marcador CAPI ainda precisam de sincronização administrativa; o worker cobre falhas registradas.

### Confirmação quando o webhook chega antes da resposta da cobrança

O webhook de pedido consulta o recurso na API Pagar.me e encontra o pedido local pelo ID do gateway ou, se esse vínculo ainda não foi salvo, pelo `code` que o servidor enviou na criação (UUID local). Antes de vincular/confimar, exige pedido originado no checkout, mesmo código, mesmo total e mesmo email. O corpo do webhook não comprova pagamento. O vínculo inicial usa atualização condicional: não substitui outro pedido Pagar.me associado simultaneamente. A resposta inicial da criação também só grava se esse vínculo continuar vazio; caso o webhook já tenha conciliado, consulta novamente o pagamento.

Pedido/assinatura ainda ausente, conflito ou falha de consulta mantém `processed_at` vazio, registra `reconciliation_pending` e responde HTTP 503, permitindo reenvio pela Pagar.me. Reenvios dependem da configuração do webhook na conta do gateway; não existe worker local de reprocessamento financeiro nesta etapa. Evento já concluído não libera acesso novamente. O mesmo ID de webhook com outro tipo/recurso é recusado. JSON inválido retorna 400 e corpo acima de 256 KiB retorna 413. Eventos fora das famílias order/charge/subscription continuam apenas registrados, sem alteração financeira. Webhook Guru permanece separado.

Testes simulam aviso antecipado, ausência do registro local, dados divergentes, disputa pelo vínculo, cobranças de assinatura, repetição de evento, falha seguida de reenvio e resposta inicial atrasada. O teste integrado com Pagar.me e emails reais continua reservado para o final.


### Pós-venda por compra e ciclo

Ativar `CHECKOUT_ACCESS_LEDGER_ENABLED=true` junto da liberação de acesso somente na homologação final. Por padrão, a nova rotina permanece desativada. As migrações adicionam `checkout_access_accounts` (estado anterior e estado esperado dos acessos) e `checkout_access_grants` (origem por pedido, planos, cursos e datas). As tabelas têm RLS e privilégios exclusivos de `service_role`. A RPC `checkout_apply_access` usa `SECURITY INVOKER`, execução restrita ao servidor, transação, trava por perfil e atualização dos registros sob lock; não cria novos usuários nem envia emails.

O primeiro acesso rastreado salva os acessos anteriores como base. Cada pedido ou ciclo registra separadamente os planos e os cursos então vinculados, com expiração calculada usando `plans.period_days` e o pagamento confirmado. Renovações recuperam o plano do snapshot da compra original, mesmo que o produto seja remapeado depois. Repetir a mesma compra não soma dias. Cancelar a assinatura somente altera a cobrança na Pagar.me e o registro de assinatura; não revoga os direitos já pagos.

Reembolso total ou contestação confirmada pela API Pagar.me chama a RPC para retirar a contribuição daquele pedido e recalcular o restante. Curso compartilhado mantém o maior prazo das demais compras e os acessos anteriores, incluindo os vitalícios. Links de planos são mantidos quando há outra compra válida ou um vínculo anterior. A conta global não é bloqueada se existe acesso anterior válido ou outra compra ativa. O webhook Guru não foi modificado.

Eventos `chargeback.received` usam o ID de cobrança informado para consultar a Pagar.me e exigem status `chargedback` na consulta autenticada antes de agir. Cobranças avulsas também precisam constar no pedido consultado, com o valor total correspondente. Reembolso parcial não possui política de retirada automática por item nesta etapa; a rotina atua no estado integral `refunded` informado pelo gateway. O formato real do novo evento e os casos de reembolso parcial precisam ser conferidos na homologação.

A expiração por plano roda nos mesmos horários do worker `/api/cron/checkout-conversoes`, antes e independentemente da configuração da Meta, em lotes de quatro compras. Cursos respeitam o próprio `expires_at` na leitura. A retirada de links de planos e a atualização global dependem dessa execução, sujeita ao atraso do agendamento Hobby. A fila usa a próxima expiração individual, não somente o prazo máximo do carrinho.

A RPC compara os acessos atuais com o último estado que gravou. Se houve mudança externa (Guru, edição manual ou outro fluxo), preserva os registros e devolve `review_required`. Esse caso, assim como uma compra antiga sem proveniência, aparece nos detalhes da venda; não tenta adivinhar a origem nem apagar acessos compartilhados. A revisão exige conciliação administrativa dos vínculos/baseline antes de nova tentativa. Não há botão para ignorar essa proteção. Registros vencidos que exigem revisão saem da fila automática para não travar o restante.

`tests/checkout-access.sql` testa a transação com fixtures revertidas por `ROLLBACK`, inclusive sob `service_role`: acesso compartilhado, compras independentes, reembolso, contestação, plano vitalício anterior, renovação, repetição, alteração externa e vencimentos parciais/totais. Testes JavaScript simulam cancelamento, webhook, RPC e worker. Nenhuma cobrança ou email real é executado nessa validação; o teste completo de compra continua pendente.
