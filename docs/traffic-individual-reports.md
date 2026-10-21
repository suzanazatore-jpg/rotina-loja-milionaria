# Relatórios individuais de tráfego

O relatório administrativo está em `/admin/trafego`; a cliente usa `/trafego`. A API valida sessão, plano ativo e vínculos autorizados, e retorna apenas contas liberadas e relatórios publicados. A aba Clientes mostra apenas clientes elegíveis vinculadas. Vários vínculos são gravados em transação com detecção de concorrência.

Criativos são comparados dentro da mesma campanha e evento. Resultados desconhecidos continuam desconhecidos. Alcance e frequência utilizam o total deduplicado do período. Snapshots são preservados por conta e intervalo exato, permitindo comparar mês e semanas sem misturar números.

## Avisos

Segunda às 8h de Brasília: preparação dos relatórios, sem enviar mensagens. Segunda às 10h: avisos automáticos, caso não sejam pausados e haja sete dias completos. Rascunhos existentes são preservados. Canais: histórico no aplicativo, Web Push, Brevo e Pabbly/BotConversa. Entregas têm identificadores idempotentes; aceite do provedor não é confirmação de recebimento.

O teste permite selecionar um cadastro aprovado e carrega nome, e-mail e telefone do banco. Não aceita endereço/telefone livre. O teste real para a cliente escolhida foi confirmado pela usuária em 21/10/2026, incluindo push.

O WhatsApp usa variável privada exclusiva do servidor, workflow dedicado no Pabbly e modelo de utilidade aprovado na companhia oficial 193579. O webhook legado do BotConversa com identificador 179901 pertence a essa companhia e foi verificado antes da reutilização. O antigo agendamento semanal Pabbly está desligado. O e-mail possui saudação com nome cadastrado, aviso genérico, link fixo `/trafego` e observação para acessar com login e senha.

## Coleta

Ver [procedimento de coleta](traffic-collection-runbook.md). A conexão usada para a recorrência é Meta Ads MCP → tarefa ChatGPT → Supabase, sem credenciais Meta no código da aplicação. Os dados e imagens devem ser validados antes da gravação. Existem contas ainda não habilitadas no MCP; elas permanecem pendentes sem dados inventados. O histórico de `traffic_collection_runs` registra cada execução e seus resultados.

Migrações aplicadas: entregas/configurações semanais, links de notificação, testes individuais, função transacional de múltiplos vínculos e histórico de snapshots por período. As políticas restritivas adicionais do patch original não devem ser consideradas aplicadas por esta documentação; o isolamento da API permanece obrigatório.
