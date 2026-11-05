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

Testes existentes de histórico, webhooks, acesso e contrato: 25 aprovados. Novos testes de link assinado, redação de segredos, dados fiscais/comprador, autorização, origem e validação da cobrança: 6 aprovados. Build inicial compilou mas parou em módulo antigo que exige variáveis de ambiente; build completo com placeholders de compilação passou, sem modificar as variáveis do deployment. A versão final e a inspeção no ambiente publicado serão registradas após deploy.

## Primeira inspeção publicada

Commit 69be172, prévia READY: cinco abas carregaram; reenvio e edição do comprador abriram; formulário inline de comentários abriu sem criar nota; auditoria exibiu eventos reais. Disponibilidade observada nesta prévia: email habilitado; área de membros/contratos/webhooks indisponíveis. Corrigidos após inspeção: título de seção sobrescrito pelo CSS global, rótulos técnicos da auditoria e período inicial de seis meses. Adquirente é consultado somente em leitura ao abrir Extras ou detalhes do pagamento.

## Correção de auditoria e ambientes — 05/11/2026

Aplicação compartilhada em todas as rotas /admin/checkout/vendas/[id], não limitada a uma cliente. Auditoria passa a apresentar origem, destino, URL da integração, resultado, HTTP e tentativas; fila não é apresentada como entrega. Para histórico antigo sem snapshot do endereço, o modal declara que a URL exibida é a configuração atual da integração. Segredos continuam suprimidos no JSON.

Confirmado por consulta de metadados: a venda de referência foi criada na API real; a prévia usa sandbox e tem liberação/envios pausados. O módulo reconhece ambiente pelo snapshot original e bloqueia ações externas cruzadas antes de registrar/disparar operações. A interface orienta abrir a venda no domínio real em vez de consultar o sandbox com um código real. Nenhuma credencial foi copiada de produção para a prévia; nenhum flag de envio foi ativado.

Build completo aprovado. 14 testes de histórico e detalhes aprovados, incluindo distinção fila/entrega/falha, origem/destino e ambientes. Sem envios ou operações financeiras durante a validação.

## Simplificação do reenvio na mesma tela

Substitui a exigência de navegação ao domínio real para reenviar Webhooks: o servidor da tela utiliza os handlers administrativos autenticados do mesmo aplicativo no domínio fixo de produção. Somente dados da venda solicitada e destinos elegíveis vinculados a ela são usados; a confirmação permanece no botão Enviar da própria janela. A chave de produção não é copiada para a prévia, os workers locais permanecem pausados e nenhum envio é disparado no carregamento. Consultas de adquirente também podem usar a operação somente leitura existente. Não há alterações no cadastro ou layout do cliente.

Na janela nativa de produção, todos os destinos elegíveis já iniciam selecionados. A escolha individual passa a ficar recolhida em “Escolher destinos (opcional)”, sem mudar o cadastro da integração ou as escolhas dos próximos reenvios.

15 testes de histórico, validação, destino e delegação autenticada aprovados; build da prévia aprovado. Nenhum envio real executado para QA.

## Ações de pagamento na mesma tela

Corrigida a inconsistência que mantinha Atualizar Status, Reembolsar e Chargeback desabilitados para vendas reais na tela de prévia. As ações de vendas reais usam os handlers administrativos nativos do mesmo aplicativo, mantendo autenticação e o identificador da venda. Reembolso e chargeback exigem motivo e confirmação expressa na janela; o serviço nativo valida a cobrança e, para chargeback, a confirmação do Pagar.me. Nenhuma operação financeira foi executada durante QA. Testes com adaptador de rede falso verificam bloqueio sem confirmação e payloads limitados à venda atual; 25 testes pertinentes aprovados.
