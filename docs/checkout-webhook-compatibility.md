# Compatibilidade dos webhooks importados

Os 31 destinos copiados do Guru usam `payload_format=guru`. O formato nativo continua disponível para novas integrações. Os envios e os cadastros permanecem pausados até o teste acompanhado.

- Transações: `contact`, `product`, `offer`, `items`, `payment`, `dates`, `status`, `webhook_type=transaction`.
- Assinaturas: os mesmos dados, mais `subscriber`, `last_status`, `current_invoice` (valor em centavos) e próxima cobrança. `subscription.active` exige assinatura ativa **e cobrança paga**. Criação sem pagamento não gera esse aviso.
- Produto e oferta preservam os códigos de produto e os IDs de oferta importados. O produto principal de cada destino respeita seu filtro, inclusive quando é um order bump; a lista contém o carrinho completo.
- Valores de transação em reais; total integral da venda, sem subtrair comissões. Líquido/comissão não conhecidos ficam nulos, sem inventar valores.
- `marketplace_name=pagarme2` é mantido somente no contrato de compatibilidade com os fluxos anteriores. A origem real é identificada por `source_system=central_vendas`.
- O endereço estruturado é coletado em novas compras. Compras antigas sem número/bairro não devem ter esses campos inventados.
- A autenticação anterior utiliza `GURU_ACCOUNT_TOKEN` do servidor, acrescentado apenas no instante da entrega. Nunca copiar tokens para código, fila, auditoria ou resposta do painel. Não são enviados dados de cartão.
- O identificador do pedido permanece estável entre status, e `event_id` identifica a entrega; tentativas repetidas usam os mesmos identificadores. O destino também precisa respeitar idempotência.
- O próprio `/api/webhook-guru` deste aplicativo é bloqueado como destino de saída: a liberação local já é feita pelo fluxo nativo. Webhooks de entrada do Guru continuam funcionando.

## Validação antes de ativar

Testar BotConversa, Pabbly (incluindo NF) e a área de membros com dados de teste autorizados. Confirmar filtros e campos realmente utilizados por cada fluxo, autenticação da área de membros, criação/renovação/revogação de acesso, reembolso, order bump e repetição da mesma entrega. Nenhum sucesso interno substitui a confirmação do recebimento no destino. Alguns produtos ainda precisam de vínculo com plano antes de vender; este trabalho não atribui planos arbitrários.

Testes locais cobrem o adaptador, proteção de destino, valores e worker. Verificação transacional no banco comprova que assinatura sem pagamento não gera aviso ativo, pagamento gera um único aviso e atualização repetida não duplica; todas as fixtures são revertidas, sem HTTP ou cobranças.
