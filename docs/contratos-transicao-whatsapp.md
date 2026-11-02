# Contratos: preparação BotConversa → Papo_reto

Atualização em 02/11/2026: o pacote inicial foi publicado pelo PR #27. Os ajustes desta revisão estão em preparação, sem publicar o aplicativo, alterar variáveis remotas, ativar ofertas, enviar mensagens reais ou realizar compra. A base atual é a main `002d9c3`. O deploy automático da branch `prep/contracts-connection-review` está desabilitado no próprio `vercel.json`; essa regra não muda as demais branches.

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
| R06: orientar cliente e operação | Checkout oferece assinatura; página assinada distingue PDF/acesso; venda mostra contrato e canais | Testes dos estados e build; inspeção visual autenticada da versão nova ainda pendente |

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
