# Contratos: preparação BotConversa → Papo_reto

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
