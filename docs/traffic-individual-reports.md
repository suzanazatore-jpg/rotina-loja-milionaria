# Relatórios individuais de tráfego

Implementação no aplicativo Rotina, repositório `rotina-loja-milionaria`.

- `/admin/trafego`: relatório com todos os dados administrativos; aba Clientes lista somente cadastros elegíveis e vinculados.
- `/trafego`: a mesma apresentação recebe exclusivamente as contas ativas vinculadas à sessão. Links `?report=` selecionam o relatório autorizado e a conta correta.
- `/api/trafego`: valida sessão no servidor, plano ativo e vínculo; pagina todas as consultas e retorna somente relatórios publicados, nunca rascunhos ou publicações futuras.
- Cadastro administrativo permite aprovar várias contas em uma transação com detecção de alterações concorrentes.
- Cards comparáveis, períodos, tabelas e prévias reais de criativos. Alcance e frequência utilizam totais deduplicados do intervalo. Tabelas agregadas não são exibidas como se pertencessem a outro período.
- O endpoint administrativo de importação JSON aceita `meta_account_id`, `period_start`, `period_end`, `payload` com `totals`, `daily`, `campaigns`, `adsets`, `ads`. Prévia de criativo usa `image_url`/`thumbnail_url` HTTPS; `results` e `result_label` são os da campanha. Campos arbitrários e credenciais não são persistidos.

## Avisos semanais

Cron `/api/cron/trafego`, segunda-feira 11h UTC / 8h Brasília. Por padrão permanece desativado até a validação dos canais. O endpoint administrativo de configurações permite ativar/pausar. Um relatório só é publicado automaticamente se houver sete dias completos da semana encerrada; rascunhos existentes são preservados. Usuários são requalificados antes de cada lote.

Canais:

- Histórico dentro do app e Web Push nas inscrições ativas existentes.
- Brevo: reutiliza `BREVO_API_KEY` do servidor e remetente `suporte@suzanazatorre.com.br`.
- WhatsApp: exige **novo webhook específico** `TRAFFIC_REPORT_WHATSAPP_WEBHOOK_URL`. Não reutiliza o fluxo de mensagens em massa sem validar seu mapeamento. O payload contém `evento: campanha_em_massa`, `tipo: relatorio_trafego_pronto`, `campanha_id` (chave idempotente), `titulo`, `mensagem` e um único item em `destinatarios`, com `id`, `nome`, `primeiro_nome`, `email`, `telefone`.
- Uma linha de entrega por relatório/usuário/canal impede duplicação concorrente. Aceite de Brevo/Pabbly é registrado como `accepted`, não como entrega comprovada. Timeouts e erros ambíguos são `unknown` e exigem conferência antes de reenviar.

## Estado da integração e liberação

Código validado por testes e build local usando variáveis substitutas (sem credenciais de produção).

**Migração ainda NÃO aplicada**: `supabase/patches/traffic_individual_reports.sql`. O conector retornou `Invalid or expired requestState` em tentativas de escrita; leitura confirmou ausência das tabelas/função novas. É necessário aplicar este SQL, testar políticas e transação no banco e executar os testes reais de isolamento antes de ativar a versão completa. O dashboard pode ser publicado com o vínculo individual anterior preservado por compatibilidade; múltiplas contas e avisos permanecem pendentes.

Em 21/10/2026, foram coletados e gravados 127 anúncios reais com URLs de imagens em 13 contas, para 01/10 a 20/10. Uma conta habilitada não retornou anúncios com investimento e três contas seguem sem acesso Meta habilitado. Os snapshots preservaram totais, diário e campanhas. A coleta recorrente precisa continuar incluindo anúncios e atualizando URLs de mídia da Meta, que podem expirar. Conjuntos ainda não foram coletados.

A aba Integrações foi removida a pedido da usuária e sua rota redireciona ao relatório. Campanhas em destaque permanece no mesmo lugar. A seção de criativos compara menor/maior custo do mesmo evento dentro de cada campanha, mostra imagem, investimento e volume, permite filtrar a campanha e abrir todos os criativos. Empates ou apenas um anúncio não geram um pior artificial; valores desconhecidos não viram zero. Alcance usa custo por mil contas alcançadas.

No Pabbly já existe `[ Envio Relatório Semanal WhatsApp ]`, às segundas às 9h America/Fortaleza, usando Google Sheets, filtro e BotConversa. Não foi alterado nem duplicado. Antes de ativar o novo aviso, definir se esse fluxo será migrado ou mantido para outro público.

Pendências: aplicar SQL; validar destinatários e webhook específico; validar Brevo e Web Push; manter a coleta recorrente de anúncios e imagens; coletar conjuntos; testar os fluxos semanais completos. Dashboard e criativos publicados no projeto Vercel existente e conferidos em navegador autenticado. A automação diária do ChatGPT foi criada separadamente na conversa.
