# Contratos: preparação BotConversa → Papo_reto

Atualização em 02/11/2026: o pacote inicial foi publicado pelo PR #27. Após autorização de Suzana, esta revisão foi publicada **somente em homologação**, no commit `83af1a8`, com envios desligados. Produção permanece na main `002d9c3`; nenhuma variável remota, oferta, mensagem real, compra ou dado do banco foi alterado. O deploy automático da branch `prep/contracts-connection-review` continua desabilitado no próprio `vercel.json`; a homologação foi criada manualmente no projeto existente.

Os ajustes anteriores que ficaram somente na pasta temporária não estavam disponíveis nesta sessão. Foram refeitos sobre a main atual: campo `program`, chave separada de OTP e revisão de mensagens. Os commits locais antigos não foram tratados como código recuperado nem como publicado.

Status em 01/11/2026: pacote autorizado por Suzana para publicação com envios pausados. Sem alteração do banco remoto, ativação de ofertas ou envio real. Preparado a partir da main `094bf37` e incorporado à main `0070ea0`, preservando as atualizações de produtos, rotinas em PDF e relatórios de tráfego.

## Escopo e decisões

O Guru_Fake conserva as regras de pagamento, documento, assinatura e acesso. WhatsApp usa um adaptador substituível. E-mails continuam no Brevo. O Papo_reto terá de implementar/validar o receptor descrito abaixo; não foi presumido um endpoint existente nem declarada integração real.

| Requisito | Preparado | Validação |
| --- | --- | --- |
| R01: destino único por envio | Provedores `botconversa`, `papo_reto`, `disabled`, configurados no servidor | Testes de troca, pausa, URL ausente, segredo ausente e ausência de fallback |
| R02: compra preserva exigência contratual | Snapshot na `checkout.request`; contrato emitido prevalece sobre edição posterior | Alterar oferta antes/depois da emissão; renovar com original pendente/assinado/reembolsado |
| R03: documento completo | Modelo validado ao salvar e antes de emitir | Variáveis desconhecidas, vazias e propriedades herdadas bloqueadas |
| R04: tentativas independentes | Fila persistente em `webhook_events`, uma tarefa por canal/ocorrência | Falha parcial, duplicata, concorrência, timeout, pausa, troca de ambiente e limite |
| R05: retomar após assinatura | Tarefa de conclusão e recuperação de assinaturas interrompidas | Falhar PDF/acesso separadamente, retomar sem repetir a etapa concluída |
| R06: orientar cliente e operação | Checkout oferece assinatura; página assinada distingue PDF/acesso; venda mostra contrato e canais | Testes dos estados e build; painel autenticado de contratos conferido, jornada com compra/assinatura ainda pendente |

Nenhuma funcionalidade de pagamento real foi ativada. A passagem do checkout público de homologação para vendas reais permanece como tarefa separada. A otimização geral da listagem de assinaturas também permanece fora deste pacote de contratos.

## Configuração preparada, sem valores secretos

| Variável | Uso |
| --- | --- |
| `CONTRACTS_ENABLED` | Chave existente do módulo; permanece desativada no exemplo |
| `CONTRACT_DELIVERY_QUEUE_ENABLED` | Habilita a nova fila/conclusão; padrão desligado |
| `CONTRACT_WHATSAPP_PROVIDER` | `disabled`, `botconversa` ou `papo_reto` |
| `CONTRACT_WHATSAPP_OTP_ENABLED` | Libera código por WhatsApp somente após homologação do modelo; padrão `false` |
| `CONTRACT_WHATSAPP_DISPATCH_GUARD_ENABLED` | Reserva cada envio antes da chamada externa; padrão `false`, a homologar com a fila habilitada |
| `CONTRACT_BOTCONVERSA_WEBHOOK_URL` | Webhook real do fluxo BotConversa, a cadastrar depois |
| `CONTRACT_WHATSAPP_WEBHOOK_URL` | Compatibilidade com a URL legada, somente para BotConversa |
| `CONTRACT_BOTCONVERSA_WEBHOOK_TOKEN` | Bearer opcional, somente se suportado pelo receptor escolhido |
| `CONTRACT_PAPO_RETO_WEBHOOK_URL` | URL real futura, a validar no Papo_reto |
| `CONTRACT_PAPO_RETO_WEBHOOK_TOKEN` | Segredo do receptor futuro; obrigatório para esse adaptador |
| `CONTRACT_TOKEN_SECRET` | Segredo dos links; não trocar após a emissão de contratos |
| `BREVO_API_KEY` | Chave já utilizada pelos e-mails, sem exposição ao cliente |

Não foram alteradas variáveis de produção ou prévia. `.env.example` contém apenas nomes, valores públicos e chaves de pausa. Habilitar a fila e o módulo em homologação será uma ação posterior, com dados/destinos controlados.

## Protocolo do receptor WhatsApp v1

POST JSON para a URL configurada. Os campos atuais são preservados:

| Campo | Significado |
| --- | --- |
| `schema_version` | Inteiro `1` |
| `delivery_id` | Identificação estável da tarefa; também no cabeçalho `X-Delivery-Id` |
| `contract_id` | Identificação do contrato |
| `evento` | `contrato_enviado`, `contrato_lembrete`, `contrato_codigo` ou `contrato_assinado` |
| `name`, `phone` | Nome e telefone brasileiro normalizado com DDI 55 |
| `program` | Nome do programa/oferta, para o campo `contrato_programa` no BotConversa |
| `message` | Mensagem pronta para enviar |
| `link` | Link de assinatura ou cópia, quando houver |
| `code` | Código OTP somente no evento de código; nunca entra na fila persistente |

No BotConversa, mapear os campos do webhook para o contato e os campos do fluxo, escolhendo o envio pelo evento. Para Papo_reto, o contrato proposto usa `Authorization: Bearer ...`; o receptor precisa validar esse segredo, persistir `delivery_id` de forma única, não repetir mensagens já aceitas e retornar 2xx somente após registrar a solicitação. O adaptador poderá ser ajustado à autenticação real do Papo_reto durante sua homologação.

Não há chamada para dois provedores nem fallback automático. Falta/erro de configuração não provoca envio pelo outro serviço. URLs precisam usar HTTPS, sem credenciais embutidas; redirecionamentos são recusados.

## Fila e recuperação

- Reutiliza a tabela existente `webhook_events`, pela identidade única `pagarme_event_id`, com `type=contract.task`. Não exige nova tabela ou migração nesta preparação.
- Persiste somente contrato, tipo da tarefa, canal, ocorrência, ambiente, provedor, tentativas e horários. Tokens, OTP, contatos, corpo de mensagem, PDF e URL de destino são carregados apenas na execução.
- Aceite HTTP é registrado como `accepted`, distinto de entrega/leitura ao destinatário. Confirmações finais de entrega dependem do provedor e ainda não estão conectadas.
- Cada canal aceito deixa de participar das retentativas. Erros usam espera crescente, com oito tentativas no máximo. Após esgotar, a operação revisa e usa reenvio manual, criando uma nova ocorrência.
- O claim condicional impede dois executores de processarem a mesma reserva. Uma execução interrompida pode ser retomada depois de três minutos. Uma resposta perdida após aceite externo pode repetir a chamada: o receptor deve deduplicar pelo mesmo `delivery_id`. Não se promete exatamente uma entrega externa.
- Lembretes de 24/48/72 horas persistem suas tarefas antes de avançar a ocorrência. Uma falha de canal não elimina a tarefa pendente. Assinatura ou cancelamento interrompe os lembretes ainda não enviados.
- A regra de ambiente separa produção de testes. Tarefas antigas mantêm o provedor original e não são transferidas automaticamente na virada.
- A assinatura grava seu estado antes da conclusão. A conclusão recupera PDF/acesso separadamente, preserva um PDF já salvo e só registra acesso liberado quando o resultado é `completed`.
- O cron existente `/api/cron/checkout-conversoes` processa um lote limitado. Sua agenda atual é de 30 em 30 minutos; os envios iniciais tentam executar também na requisição. Latência, volume de fila e tempo total do cron precisam de medição no ambiente antes da ativação. A cópia assinada pode aguardar o próximo ciclo.
- Registros antigos com erro na criação de usuário ou acesso em revisão continuam exigindo análise operacional; a recuperação não concede acesso ignorando esses bloqueios.

Para pausar apenas WhatsApp durante a operação, usar o provedor `disabled`; para pausar o processamento, usar a chave da fila. A chave global do módulo define a emissão/trava e não deve ser usada como substituta da pausa de mensagens depois de haver contratos emitidos.

## Troca pelo Papo_reto

1. Implementar e testar o receptor real com o mesmo protocolo e deduplicação.
2. Conferir os quatro eventos, incluindo OTP, com destinos autorizados de teste.
3. Revisar tarefas antigas do BotConversa: concluir por lá ou cancelar/reemitir a ocorrência de forma controlada.
4. Configurar URL/segredo do Papo_reto e escolher o novo provedor.
5. Conferir uma compra controlada ponta a ponta e os registros de aceite/entrega disponíveis.

Nenhum redirecionamento silencioso de tarefas antigas acontece ao mudar a configuração.

## Checklist para Suzana analisar

- [x] Preparação local dos adaptadores e compatibilidade com o webhook atual.
- [x] Snapshot da regra de contrato e bloqueio de renovação com original pendente.
- [x] Validação de campos dos modelos.
- [x] Fila por canal, retentativas e recuperação após assinatura.
- [x] Estado do PDF/acesso na assinatura e resumo na venda.
- [x] Botões para retomar conclusão e solicitar nova cópia no painel.
- [x] Publicação do pacote autorizada por Suzana, mantendo os envios pausados.
- [ ] Criar/configurar o fluxo receptor BotConversa e validar entrega real.
- [ ] Validar os e-mails de contrato no Brevo, remetente e recebimento.
- [ ] Confirmar a segurança/acesso das tabelas existentes e a operação da fila no Supabase de homologação.
- [ ] Conferir visualmente desktop/celular na versão nova com sessão autorizada.
- [ ] Escolher ofertas e revisar comercialmente seus contratos.
- [ ] Decidir a contagem do período de acesso: o código existente continua ancorado no pagamento.
- [ ] Medir o cron e validar compra → mensagem → assinatura → PDF → acesso.
- [ ] Publicar e ativar somente o que for aprovado.

## Verificações executadas

- Base original: 234 testes aprovados antes das mudanças.
- Pacote inicial: 258 testes aprovados. Após incorporar a main mais recente: `node --test tests/*.test.mjs`, 269 testes aprovados, nenhum erro ou teste ignorado.
- ESLint dos arquivos JavaScript alterados e novos: aprovado.
- `npm run build`: compilação Next.js 16.2.9 concluída, com configuração fictícia de Supabase e as chaves de envio desativadas.
- `git diff --check`: aprovado.
- Chamadas externas dos testes são simuladas. Não foram usadas credenciais reais para homologar mensagens, banco ou pagamentos.
- A autorização posterior de publicação não inclui ativação dos envios, contratos por oferta ou pagamentos reais.

## Fontes técnicas consultadas

- [BotConversa: webhook de entrada e mapeamento](https://ajuda.botconversa.com.br/curso/primeiros-passos-botconversa/configurando-webhooks).
- [Brevo: envio transacional](https://developers.brevo.com/reference/send-transac-email).
- [Supabase: upsert e resolução de conflitos](https://supabase.com/docs/reference/javascript/upsert).
- Documentação de Route Handlers instalada com Next.js 16.2.9 (`node_modules/next/dist/docs/`).

Não foram criadas automações agendadas no ChatGPT; o processamento preparado pertence ao próprio aplicativo.

## Conexões preparadas em 01/11, conferidas pausadas em 02/11

[Abrir o fluxo de preparação no Pabbly](https://connect.pabbly.com/v2/app/workflow/mapping/IjU3NjcwNTZiMDYzNDA0MzQ1MjZjNTUzMTUxM2Ii_pc).

| Evento | Pabbly → BotConversa | Situação |
| --- | --- | --- |
| `contrato_enviado` | Filtro exato → API POST → receptor de link | Configurado; aceite HTTP 200 com dados fictícios na etapa anterior |
| `contrato_lembrete` | Filtro exato → API POST → mesmo receptor de link | Mapeado; falta testar uma ocorrência específica de lembrete |
| `contrato_codigo` | Rota desabilitada, sem ação externa | Modelo `contrato_codigo_assinatura` rejeitado; motivo não confirmado |
| `contrato_assinado` | Filtro exato → API POST → receptor da cópia | Configurado; HTTP 200 conferido isoladamente com amostra fictícia, sem PDF real |

Payload das três APIs: `phone`, `name`, `program`, `link`, `message`, `evento`, `contract_id`, `delivery_id`, `schema_version`. URLs privadas dos receptores ficam somente na configuração do Pabbly. Não foram cadastradas na configuração do aplicativo nesta preparação.

Ambos os receptores do BotConversa continuam em **Modo Teste**. O receptor de link atualiza `contrato_programa` e `contrato_link` e chama o fluxo de link; o da cópia atualiza `contrato_programa` e `contrato_pdf` e chama o fluxo assinado. O aceite técnico do webhook não comprova execução do fluxo, PDF, envio, entrega ou leitura no WhatsApp.

Os modelos aprovados de link/cópia ainda contêm promessas de acesso automático/imediato que precisam ser revisadas antes da ativação. Sugestões abaixo ainda não foram submetidas à Meta:

- Link: “Olá, {primeiro-nome}! O contrato do {contrato_programa} está disponível para leitura e assinatura: {contrato_link}. Você pode acompanhar o andamento na página do contrato. Se precisar de ajuda, responda esta mensagem.”
- Cópia: “Olá, {primeiro-nome}! Seu contrato do {contrato_programa} foi assinado. Baixe sua cópia: {contrato_pdf}. Acompanhe a situação do acesso na página de assinatura. Se precisar de ajuda, responda esta mensagem.”

O OTP por WhatsApp tem chave própria. Desligado, não é oferecido na assinatura nem altera o código/contadores ao receber uma solicitação recusada. O e-mail continua disponível conforme sua configuração. O campo `program` é enviado no convite, lembrete, código habilitado e cópia. Mensagens do aplicativo respeitam a regra de assinatura da compra e não prometem liberação instantânea.

## Proteção contra repetições no aplicativo — preparada em 02/11

`contractWhatsappDispatch.js` reutiliza `webhook_events`, com `type=contract.whatsapp.dispatch` e chave única por ambiente/`delivery_id`. Não há nova tabela nem migração. Quando a chave de proteção estiver habilitada:

1. O aplicativo registra e reserva o envio de forma condicional **antes** de chamar o receptor. Sem banco ou reserva confirmada, não faz HTTP.
2. Chamadas repetidas ou concorrentes com o mesmo identificador não repetem a chamada externa. Contrato, evento e provedor não podem mudar nessa identidade. Cada ambiente tem sua própria reserva.
3. HTTP 2xx fica como `accepted`: comprova somente o aceite do receptor, inclusive quando este é o Pabbly. Reexecutar a tarefa após uma falha ao gravar o resultado da fila não repete esse HTTP.
4. Timeout, falha HTTP ou interrupção depois da reserva ficam como `review`/`dispatching`. A tarefa incerta deixa de participar de retentativas automáticas. Não se presume que a mensagem falhou nem que chegou.
5. O painel indica ausência de confirmação e orienta conferir Pabbly/BotConversa antes de reenviar. Reenvio manual cria uma nova ocorrência e pode duplicar uma mensagem já aceita; a interface avisa quando há uma reserva incerta.

Persistem somente identificadores, evento, provedor, ambiente, estado e horário; não entram nome, telefone, mensagem, código, link, PDF, token ou erro bruto do provedor. OTP habilitado tem uma identidade nova por solicitação e continua fora da fila de notificações. Convites/lembretes/cópias protegidos exigem `delivery_id` estável: usar com a fila habilitada.

**Limite:** esta proteção impede repetição da chamada pelo aplicativo. Ela não deduplica repetições internas do Pabbly/BotConversa. Essa parte ainda precisa de um bloqueio no receptor e de confirmação de falhas após o aceite do Pabbly. O Papo_reto deverá receber o mesmo `delivery_id` e implementar deduplicação persistente. Não há garantia de exatamente uma mensagem externa.

Para recuperar um envio incerto, conferir pelo identificador e horário se o Pabbly executou a rota e se o BotConversa aceitou a ação. Somente após determinar o resultado, solicitar uma nova ocorrência, se necessária. Não apagar/reabrir a reserva para forçar repetição automática. Os e-mails mantêm sua fila e suas retentativas independentes.

### Pendências para homologação e ativação

- Modelo OTP aprovado e modelos de link/cópia revisados.
- Bloqueio de duplicações e observação de falhas dentro do receptor Pabbly/BotConversa.
- Validar a reserva condicional e as permissões de `webhook_events` no Supabase de homologação. Os testes desta revisão simulam o banco e o HTTP; nenhuma operação remota foi feita.
- Testar POST JSON gerado pelo aplicativo em cada evento; validar lembrete específico, cópia de PDF real e códigos.
- Homologar Brevo e WhatsApp com destinatários de teste autorizados, conferindo recebimento e falhas.
- Revisar ofertas/contratos, validar pagamento sem assinatura bloqueado, assinatura inválida/cancelamento, PDF, plano correto, boas-vindas e recuperação.
- Somente depois concluir a compra de teste ponta a ponta e solicitar a ativação do que estiver aprovado.

As três novas chaves da preparação permanecem desligadas no exemplo: fila, OTP WhatsApp e proteção de despacho. O módulo e o provedor também permanecem pausados. Nenhum valor remoto foi alterado.

### Validação desta revisão

- Suíte completa: 285 testes aprovados, sem falhas ou testes ignorados. Inclui concorrência, timeout, resposta HTTP negativa, falha ao salvar recibo, retomada da fila sem novo HTTP, isolamento de ambiente/provedor, dados sensíveis fora da reserva e OTP pausado com e-mail preservado.
- Após incluir o contador de tarefas para revisão no cron, os 16 testes de fila/despacho passaram novamente.
- ESLint dos arquivos JavaScript/MJS alterados, `git diff --check` e build Next.js 16.2.9 concluídos.
- Build e testes usam configurações fictícias e chamadas externas simuladas; não comprovam entrega real ou a reserva no Supabase remoto.
- Chrome: fluxo do Pabbly pausado; os dois receptores de contrato no BotConversa em Modo Teste. Nenhuma mensagem real nem compra de teste realizada.

## Envio protegido após o Pabbly — próxima revisão de 02/11

**Implementado e publicado somente em homologação, ainda não conectado nas ações do Pabbly.** A proteção anterior continua na origem. A nova etapa cobre também a reexecução isolada da ação no Pabbly, que poderia pular uma trava colocada em uma etapa anterior.

O caminho preparado passa a ser: aplicativo → Pabbly → receptor protegido do aplicativo → BotConversa. Cada ação de envio do Pabbly deverá chamar `/api/contratos/whatsapp-relay`, em vez de chamar diretamente o webhook privado do BotConversa. Não há uma etapa separada de “consultar se já foi enviado”: a reserva e o HTTP ao BotConversa pertencem à mesma operação no servidor. Assim, repetir somente a ação também passa pela proteção.

### Configuração preparada

| Variável | Uso e estado |
| --- | --- |
| `CONTRACT_BOTCONVERSA_RELAY_ENABLED` | Chave do receptor protegido; `false` no exemplo |
| `CONTRACT_WHATSAPP_RELAY_SECRET` | Segredo exclusivo, pelo menos 32 caracteres; vazio no exemplo, não criado remotamente |
| `CONTRACT_BOTCONVERSA_LINK_RECEIVER_URL` | URL privada do receptor de convite/lembrete, somente no servidor; não cadastrada |
| `CONTRACT_BOTCONVERSA_COPY_RECEIVER_URL` | URL privada do receptor de cópia, somente no servidor; não cadastrada |
| `CONTRACTS_APP_URL` | URL exata do ambiente que hospedará o receptor; usar a versão de homologação nos testes |

O receptor exige módulo ativo, provedor BotConversa, proteção da origem ativa, chave do receptor ativa e configuração válida. Desligado, responde 503 sem criar cliente de banco. Trocar o provedor para Papo_reto não envia nada pelo relay BotConversa. O adaptador do Papo_reto permanece independente e continua recebendo `delivery_id`.

Antes do POST ao Pabbly, o aplicativo registra `type=contract.whatsapp.relay` na tabela já existente `webhook_events`. A identidade é única por ambiente e `delivery_id`. O registro contém somente identificadores, evento, estado, horários e uma impressão HMAC do conteúdo; não guarda mensagem, telefone, nome, link, programa, segredo ou token. Não há migração ou novo acesso ao banco nesta revisão.

O aplicativo acrescenta `relay_url` e `relay_token` ao payload enviado ao Pabbly. O token autentica o conteúdo completo, o ambiente e a validade de 24 horas. Alterar telefone, nome, programa, mensagem, contrato, evento ou link invalida a autorização. O segredo fica exclusivamente no servidor. O token é transitório e pode ficar no histórico do Pabbly: não copiar esses históricos para relatórios públicos e limitar seu acesso operacional.

### Mapeamento para as três ações do Pabbly, após publicar homologação

| Configuração da ação API | Valor |
| --- | --- |
| Método | `POST` |
| URL | URL fixa do host de homologação aprovado, terminando em `/api/contratos/whatsapp-relay`; conferir contra `relay_url`, sem aceitar destino arbitrário do webhook |
| Corpo | Os mesmos nove campos existentes, mapeados da etapa 1: `phone`, `name`, `program`, `link`, `message`, `evento`, `contract_id`, `delivery_id`, `schema_version` |
| Cabeçalho `Authorization` | `Bearer ` seguido do campo dinâmico `relay_token` da etapa 1 |
| Cabeçalho `Content-Type` | `application/json` |
| Reexecuções | A mesma ocorrência conserva `delivery_id`, conteúdo e token; não criar identificador novo para uma repetição automática |
| Ações que chamam diretamente BotConversa | Substituir as três; não deixar um segundo caminho direto ou uma etapa extra de envio após o relay |

As três ações atuais do Pabbly **agora apontam ao relay da homologação** e o fluxo permanece pausado. Após autorização de Suzana, o cabeçalho de acesso à Vercel foi cadastrado nas três ações e cada uma recebeu a resposta esperada “Receptor pausado”. A amostra do gatilho ainda não contém `relay_token`; a autorização HMAC do aplicativo continua pendente de configuração e captura. Não usar um token fixo fictício como se fosse uma integração funcional.

O OTP continua sem caminho neste relay. O modelo está rejeitado e essa entrega não deve aguardar 24 horas numa automação. Se tentarem habilitar código por WhatsApp junto ao relay, o adaptador bloqueia o envio. Sua homologação posterior exige um fluxo próprio com validade curta e proteção da geração atual do código. Os códigos por e-mail continuam independentes.

### Resultado e recuperação

| Estado do receptor | Significado e comportamento |
| --- | --- |
| `waiting` | Preparado na origem, ainda sem execução protegida; após 15 minutos ou expiração, o painel passa a indicar revisão |
| `dispatching` | Reserva adquirida antes do HTTP; concorrentes e reexecuções não fazem nova chamada; após 1 minuto sem resultado, o painel indica revisão |
| `accepted` | BotConversa aceitou HTTP 2xx; a repetição retorna o aceite salvo sem chamar novamente. Não comprova execução, entrega ou leitura, inclusive em Modo Teste |
| `review` | Timeout, falha HTTP ou resultado incerto; não há reabertura automática da reserva |
| `canceled` | Contrato inelegível no momento da execução; nenhum HTTP de mensagem é feito |

O receptor relê o contrato antes de chamar o BotConversa: convite/lembrete só para `pending/viewed`; cópia só para `signed` com PDF existente. Essa conferência reduz envios atrasados após assinatura/cancelamento, mas não torna uma mudança simultânea de contrato e uma operação externa uma transação única. O receptor não altera contrato, pagamento, PDF ou acesso.

Respostas HTTP do relay: 200 para aceite/cancelamento conhecido, 202 com `status=review` para resultado incerto, 401/403 para autorização ausente/inválida/vencida, 400/413 para corpo inválido/grande e 503 para pausa/configuração/banco indisponível. Não interpretar 202 como mensagem enviada. Se o aceite externo ocorrer e a gravação falhar, a reserva permanece fechada e uma repetição não chama o BotConversa novamente.

Uma falha após o aceite do Pabbly aparece no painel a partir do registro separado do relay. Se o Pabbly nunca executar a ação, a ausência também fica visível pelo prazo de espera. A revisão continua manual: conferir os históricos, determinar se houve aceite e somente então criar nova ocorrência, se necessária. Não apagar reservas para forçar reexecução.

### Evidências e limites desta etapa

- 297 testes aprovados na suíte completa, incluindo 12 testes novos de relay: concorrência, reexecução isolada, timeout, HTTP negativo, recibo perdido, adulteração do conteúdo/ambiente, token vencido, ausência de reserva, pausa, contratos inelegíveis e isolamento de destinos.
- ESLint dos arquivos alterados, `git diff --check` e build Next.js 16.2.9 aprovados. A rota foi exercitada por HTTP local e respondeu 503, “Receptor pausado”, com todas as chaves desligadas.
- Os testes positivos de envio/banco usam simulações. Não houve operação de mensagem nem reserva no Supabase remoto; a publicação de homologação foi concluída e os testes reais de integração continuam pendentes.
- Fluxo do Pabbly continua pausado. Não foi acionada recaptura nem executada uma mensagem real. A conexão do relay no Pabbly permanece pendente de configuração e teste autorizado.
- Fonte oficial consultada: [Pabbly — reexecução de etapas e ações API](https://forum.pabbly.com/threads/how-to-track-node-level-logs-enable-retries-and-use-rest-api-integrations-in-pabbly-connect.214474).

## Publicação de homologação — 02/11/2026

- Autorizada por Suzana para publicar somente a prévia, mantendo envios desligados e produção inalterada.
- Projeto existente: `Mariano12 / rotina-loja-milionaria`; ambiente **Preview**. Sem novo projeto, domínio ou serviço.
- Commit implantado: `83af1a8d0ade848726f377bc824c8923d829362f`; branch `prep/contracts-connection-review`.
- [Painel da implantação](https://vercel.com/mariano12/rotina-loja-milionaria/9jrnHeD2mKhG6fqZGRBDPmbK79KH): **Ready**, build de **52 segundos**.
- [Abrir contratos na homologação](https://rotina-loja-milionaria-git-prep-contracts-conn-f11bec-mariano12.vercel.app/admin/checkout/configuracoes/contratos).
- URL exata da implantação: `https://rotina-loja-milionaria-574q9s7bh-mariano12.vercel.app`.
- Após Suzana entrar, o painel autenticado foi conferido em 02/11: carregou sem erro, sem contratos emitidos e com módulo/fila/OTP/proteções de envio pausados. Não foram extraídas nem transferidas credenciais/sessões de outros hosts.
- POST externo vazio ao relay encontrou **HTTP 401 da proteção da Vercel**, antes do aplicativo. Portanto a resposta 503 de pausa foi comprovada localmente, não no receptor remoto. Não foi criado link compartilhável, segredo de bypass ou exceção de proteção. Pabbly também precisará de um caminho autorizado para acessar essa prévia nos testes.
- Pesquisa das variáveis do projeto não encontrou chaves `CONTRACT`; o código usa os padrões desligados para módulo, fila, OTP e relay. Nenhuma variável foi criada/alterada nem segredo gerado nesta publicação.
- Produção conferida antes/depois: `002d9c38eaccb0414de4bf64e471747cf0f9ca6e`, implantação `GgA6aCk6uPpZWifo2YhiUQPGAowR`, domínio `rotina.suzanazatorre.com.br`. Sem promoção, merge na main, alteração de alias de produção ou migração.
- Recuperação: a prévia é independente da produção e não alterou dados. Para comparar, usar as prévias anteriores do projeto; não há mudança de banco para desfazer. Novos commits nesta branch continuam sem deploy automático.

## Conferência autenticada e acesso de teste — 02/11/2026

- Painel: módulo desativado; fila pausada; código WhatsApp pausado; proteções da origem e do intermediário pausadas; BotConversa com configuração pendente; Brevo com chave cadastrada. A presença da chave não comprova entrega de e-mails.
- Lista: nenhum contrato emitido. Os três modelos (CVM, EVS e Gestão de Tráfego) carregam como versão 1. A conferência técnica das variáveis visíveis nos textos não encontrou campos fora da lista aceita pela interface. Não é uma validação jurídica ou comercial; nenhum texto foi salvo ou alterado.
- A autenticação de Suzana libera seu navegador, mas não autentica requisições vindas do Pabbly. O bloqueio inicial HTTP 401 da Vercel foi resolvido para as ações autorizadas de teste, conforme o registro abaixo.
- A configuração da Vercel contém um segredo de automação existente, identificado como **Pagar.me — webhook sandbox checkout/painel-admin** e designado como variável de sistema. Seu valor não foi revelado, reutilizado, transferido ou revogado.

### Acesso exclusivo do Pabbly autorizado e testado

Suzana autorizou expressamente criar a chave e cadastrá-la no Pabbly. Foi criado um segredo de automação **separado**, identificado como “Pabbly — contratos homologação — revogar ao encerrar testes”, sem substituir o segredo/variável de sistema do Pagar.me. O novo valor foi usado somente no cabeçalho `x-vercel-protection-bypass` das três ações API do fluxo de contratos no Pabbly. Não foi copiado ao repositório, documentação, link público, mensagem de entrega ou arquivo local.

Esse mecanismo da Vercel tem alcance em **todas as implantações protegidas do projeto**, embora sua utilização planejada seja somente no endereço da homologação de contratos. Ele não remove o login do aplicativo nem a validação HMAC do relay. Não configurar exceção pública de domínio nem desligar a proteção global. Ao encerrar os testes, revogar exclusivamente a nova chave; preservar a chave existente do Pagar.me.

| Campo a configurar nas ações API do Pabbly | Valor previsto, sem credenciais |
| --- | --- |
| URL fixa | `https://rotina-loja-milionaria-574q9s7bh-mariano12.vercel.app/api/contratos/whatsapp-relay` |
| `Content-Type` | `application/json` |
| `x-vercel-protection-bypass` | Nova chave exclusiva de automação, cadastrada nas três ações; valor omitido |
| `Authorization` | Ainda a mapear: `Bearer ` + `relay_token` dinâmico do aplicativo; é independente da chave da Vercel |
| Corpo | Os nove campos já mapeados, assinados pelo aplicativo |

As ações 4 (link), 6 (lembrete) e 9 (cópia) foram exercitadas **isoladamente** pelo botão de teste da ação, com a amostra fictícia já capturada: nome fictício, UUID zerado, telefone não discável com DDD 00, link `example.invalid` e evento `contrato_enviado`. Em todas, o Pabbly exibiu `error: Receptor pausado.` — resposta esperada do aplicativo antes de banco, HMAC ou envio ao BotConversa. Isso comprova acesso ao receptor; não comprova assinatura HMAC, execução das rotas/filtros por evento, cópia de PDF, fila, entrega ou leitura de mensagem. O Pabbly pode destacar essas respostas como erro porque o receptor deliberadamente permanece desligado.

As três configurações foram conferidas após recarregar: URL fixa do relay, nome do cabeçalho, correspondência da nova chave (sem expor o valor) e os nove campos dinâmicos preservados. Não restou chamada direta ao BotConversa nessas ações. O fluxo geral foi conferido desativado. A rota de código continua desabilitada e sem ação externa.

O novo segredo permanece ativo enquanto a homologação está em andamento, com utilização prevista somente neste fluxo. Não possui expiração automática configurada; revogar exclusivamente essa chave ao encerrar a homologação. A chave do Pagar.me continua marcada como variável de sistema. Não foram alterados proteção global, domínios públicos, variáveis do aplicativo, módulo, fila, ofertas, pagamentos ou banco. Não houve mensagem real nem compra.

Configuração do relay no servidor, captura de amostra assinada e testes positivos do banco/BotConversa/Brevo continuam como etapas posteriores de homologação. Os próximos campos do aplicativo são `CONTRACT_WHATSAPP_RELAY_SECRET`, os dois receptores privados do BotConversa e a URL do ambiente; manter as chaves de execução desligadas até preparar a validação controlada. Só depois mapear `relay_token` nas três ações, conferir eventos e testar os canais com os destinos autorizados. Nenhuma dessas verificações é substituída pelo teste de acesso desta etapa.

A confirmação explícita foi obtida antes de criar e transmitir a nova chave, pois ela concede acesso automatizado adicional ao projeto. A autorização de publicação da prévia não foi tratada como autorização implícita dessa concessão de acesso.

Fonte oficial: [Vercel — Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

## Configuração restrita à homologação — continuação de 02/11/2026

Após Suzana autorizar a preparação da conexão, foram salvas **12 variáveis exclusivamente em Preview, na branch `prep/contracts-connection-review`**, pelo painel do projeto existente da Vercel. A busca inicial por `CONTRACT` não encontrou variáveis anteriores. Nenhuma variável de produção ou de outra branch foi substituída.

| Variável | Configuração salva |
| --- | --- |
| `CONTRACT_WHATSAPP_RELAY_SECRET` | Secret exclusivo, gerado com aleatoriedade criptográfica, 64 caracteres; valor omitido |
| `CONTRACT_TOKEN_SECRET` | Outro Secret exclusivo de 64 caracteres, para links/OTP de homologação; preservar depois de emitir contratos de teste |
| `CONTRACT_BOTCONVERSA_LINK_RECEIVER_URL` | Secret: receptor privado de convite/lembrete, conferido no BotConversa |
| `CONTRACT_BOTCONVERSA_COPY_RECEIVER_URL` | Secret: receptor privado da cópia, distinto do anterior |
| `CONTRACT_BOTCONVERSA_WEBHOOK_URL` | Secret: entrada do fluxo de preparação do Pabbly; não é um envio direto ao BotConversa |
| `CONTRACTS_APP_URL` | URL da branch de homologação, salva como Secret: `https://rotina-loja-milionaria-git-prep-contracts-conn-f11bec-mariano12.vercel.app` |
| `CONTRACTS_ENABLED` | Config: `false` |
| `CONTRACT_DELIVERY_QUEUE_ENABLED` | Config: `false` |
| `CONTRACT_WHATSAPP_OTP_ENABLED` | Config: `false` |
| `CONTRACT_WHATSAPP_DISPATCH_GUARD_ENABLED` | Config: `false` |
| `CONTRACT_BOTCONVERSA_RELAY_ENABLED` | Config: `false` |
| `CONTRACT_WHATSAPP_PROVIDER` | Config: `disabled` |

Os dois receptores do BotConversa foram novamente observados em Modo Teste. Os segredos foram preenchidos somente nos campos autorizados da Vercel, sem arquivo de credenciais, repositório, documentação ou mensagem de entrega contendo os valores. Os valores secretos não foram revelados após salvar.

As ações 4, 6 e 9 do Pabbly foram alinhadas ao endereço **fixo da branch**, terminando em `/api/contratos/whatsapp-relay`, para coincidir com `CONTRACTS_APP_URL` e permitir reaplicar a mesma prévia. Após recarregar o fluxo, foram conferidos nas três ações o endereço, o cabeçalho `x-vercel-protection-bypass` e os nove campos dinâmicos preservados. `Authorization: Bearer` + `relay_token` **continua pendente**; não há token fixo configurado.

Tentou-se preparar uma nova amostra somente para mapeamento, com dados fictícios e marcador de token explicitamente inválido. O Pabbly exigiu ativar o fluxo para recapturar; essa ação foi **cancelada**. A tentativa de POST da amostra retornou erro HTTP, sem comprovar captura. A amostra anterior não foi substituída nem o campo novo mapeado. O fluxo foi conferido desligado após recarregar; não foi habilitado para contornar esse requisito. Nenhuma mensagem real, reserva no banco ou compra foi executada.

### Aplicação das variáveis ainda bloqueada pela reautenticação

A Vercel confirmou o salvamento das variáveis e informou que é necessária nova implantação para aplicá-las. Foi preparada a opção **Redeploy da implantação Preview `9jrnHeD2mKhG6fqZGRBDPmbK79KH`, commit `83af1a8`**, com o mesmo código e o alias da branch. Antes de iniciar a nova implantação, a Vercel abriu **Reauthenticate**, exigindo verificação por e-mail da titular. Não foi inserido código, iniciado deploy de produção, promovida prévia ou alterado o código da aplicação. Não se declara a configuração já carregada no runtime: a reaplicação depende da verificação feita pela usuária diretamente na Vercel.

O remetente previsto no código do Brevo é `Suzana Zatorre <suporte@suzanazatorre.com.br>`. Convite e lembrete explicam a dependência da assinatura quando aplicável; a cópia orienta acompanhar o acesso e inclui PDF em anexo. Essa conferência do código não comprova aprovação do remetente, entrega, recebimento, lembretes ou registro de falhas no Brevo. Os modelos WhatsApp revisados continuam como proposta; não houve submissão à Meta.

Próximas etapas: concluir reautenticação e reaplicar somente Preview; conferir o painel com a configuração carregada e as pausas mantidas; planejar a captura de uma amostra realmente assinada e a autorização temporária do fluxo de teste; mapear o token; homologar banco, BotConversa e Brevo com destinatário de teste autorizado; somente então realizar a compra completa. A chave exclusiva de acesso do Pabbly à Vercel continua sujeita à revogação ao encerrar a homologação. Esta etapa não alterou código nem executou novamente a suíte automatizada; as últimas evidências de 297 testes continuam separadas dos testes reais pendentes.

Fontes oficiais conferidas nesta etapa: [variáveis de ambiente](https://vercel.com/docs/environment-variables) e [Config/Secret](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

## Reautenticação concluída e configuração aplicada à prévia — 02/11/2026

Suzana concluiu a verificação por e-mail diretamente na Vercel. A reaplicação foi concluída em **Preview**, com o mesmo código `83af1a8d0ade848726f377bc824c8923d829362f`, na implantação [`DEuV8bYsBhyFKdSm5MftPPegUBoB`](https://vercel.com/mariano12/rotina-loja-milionaria/DEuV8bYsBhyFKdSm5MftPPegUBoB), estado **Ready**. A URL imutável dessa implantação é `https://rotina-loja-milionaria-cbmlgxctg-mariano12.vercel.app`; o alias fixo da branch foi preservado. O painel de detalhes indicou duração de 1m03s, enquanto o bloco de logs indicou 2m18s; não se tratam como a mesma medida.

Após recarregar o painel autenticado no alias da branch, foram observados: módulo desativado, fila pausada, provedor WhatsApp pausado (`disabled`), OTP pausado e ambas as proteções pausadas. A mudança de BotConversa sem configuração para WhatsApp pausado confirma a configuração de pausa carregada no runtime. Brevo continua mostrando chave cadastrada, sem comprovação de entrega. A lista permanece sem contratos. Não foram reveladas chaves, gravados contratos, modificadas ofertas ou concedidos acessos.

A ação 4 do Pabbly foi novamente exercitada isoladamente, com a amostra fictícia anterior e destino no alias fixo da homologação. O aplicativo retornou **`error: Receptor pausado.`**, como esperado antes da autenticação HMAC, banco ou envio. O fluxo geral foi conferido desligado após fechar a ação. O teste confirma acesso pela Vercel à prévia reaplicada e a pausa do receptor, sem validar tokens ou envio ao BotConversa. As ações 6 e 9 conservam o mesmo destino já conferido; não se repetiram testes que alegassem lembrete específico ou PDF assinado.

Não houve promoção para produção, merge na main, alteração de código ou migração nesta etapa. O deploy automático da branch permanece desabilitado. O commit de documentação é posterior ao código implantado e não foi usado para iniciar outra publicação. Próximo bloqueio funcional: capturar envelope realmente assinado e mapear `relay_token` nas três ações, com janela de homologação controlada. Para testes reais de BotConversa/Brevo, ainda falta definir WhatsApp e e-mail de teste autorizados; a compra completa permanece posterior à preparação e validação das conexões. A chave exclusiva de bypass do Pabbly continua ativa durante a homologação e deverá ser revogada ao encerrá-la.
