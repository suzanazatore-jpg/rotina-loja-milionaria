# Purchase após pagamento aprovado

Decisão da operação em 12/11/2026: uma compra aprovada deve enviar Purchase
independentemente da preferência de cookies opcionais e da entrega do acesso.

## Comportamento

- Novos snapshots usam `payment_approved_v2`. A preferência real continua salva;
  `granted`, ausência de escolha e `denied` não impedem o Purchase do servidor.
- A recusa continua excluindo identificadores de cookies opcionais. O navegador
  mantém seu comportamento atual. Não são fabricados fbc, fbp, consentimento ou clique.
- O evento exige pagamento confirmado, preço e itens consistentes, pixel do ambiente
  e identidade válida. Usa `purchase:<order_id>` em toda tentativa.
- Checkout, webhook Pagar.me e conciliação administrativa iniciam acesso e conversão
  independentemente. Falha de acesso no webhook mantém HTTP 503 para retry do gateway;
  a confirmação da conversão não é desfeita nem reenviada depois de processada.
- Ausência temporária do token deixa uma fila persistida quando o restante da
  configuração está habilitado. Segredos não entram no recibo.
- O worker recupera `processing` sem conclusão após dez minutos, com atualização
  condicional e limite de oito tentativas. Conclusão usa a mesma concessão de execução.
- A conciliação consulta até cem compras pagas das últimas 24 horas; enfileira até
  quatro novas compras v2 sem marcador, sem fazer chamadas externas nessa etapa.
  O worker seguinte envia até quatro eventos devidos. Este limite deve ser revisto
  se o volume superar cem compras por dia ou houver indisponibilidade prolongada.
- Não reinterpreta registros históricos com recusa, snapshots ausentes ou v1.
  A resolução desses casos exige análise dos registros, sem replay em massa.

## Validação e limites

Testes locais cobrem os três estados de cookies, pagamento não aprovado,
concorrência, repetição, falha de rede, token indisponível, trava interrompida,
limite de tentativas e falha de acesso no webhook sem bloquear Purchase.

Não foram executadas compras ou comunicações reais como parte desses testes.
O recebimento de um evento pela Meta e sua atribuição à campanha são verificações
distintas. A compra real posterior à publicação continua necessária para validar
a operação completa. Outras pendências da auditoria (catálogo, UTM, contratos,
Pabbly e entrega final) não são consideradas resolvidas por esta mudança.

## Publicação e reversão

Não requer migração nem nova variável. Publicar na versão de produção existente;
conferir o estado da implantação e carregamento público. Em caso de regressão,
restaurar a implantação anterior. Não apagar recibos ou recriar pedidos.
O rollback preserva os dados; compras v2 ainda sem envio precisam de conciliação
orientada pelos registros, pois o código anterior não reconhece essa política.
