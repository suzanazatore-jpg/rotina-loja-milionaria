# Simulador de vendas da Central

## Comparação

Referência conferida em 24/11/2026, horário de São Paulo, no simulador autenticado do Pagar.me.

| Critério | Simulador anterior | Simulador simplificado |
| --- | --- | --- |
| Preencher a simulação | Valor, bandeira, parcelas e configuração local | Quero receber ou Quero cobrar, valor, parcelas e bandeira |
| Origem das taxas | Cadastro manual separado em cada navegador | Taxas conferidas no Pagar.me e armazenadas no banco privado da Central |
| Ver o resultado | Resultado acompanhado da tabela de 12 parcelamentos | Bruto, líquido, valor por parcela, taxas e prazo exibidos ao preencher |
| Identidade visual | Central de Vendas | Central de Vendas |

O painel aceita as cinco bandeiras e as 12 opções de parcelas da referência. A divisão por parcela é aproximada quando sobram centavos. O cálculo em centavos conserva bruto = líquido + taxas e, no modo Quero receber, busca o menor bruto que atinge o líquido desejado depois do arredondamento. Esses arredondamentos podem diferir do simulador da operadora em um centavo.

## Dados e acesso

A página existente em `/admin/checkout/simulador` consulta a configuração compartilhada via API administrativa autenticada. A tabela `sales_simulator_settings` é exclusiva da ferramenta; as taxas comerciais não fazem parte do repositório. Uma tabela local antiga pode ser usada como contingência quando o servidor ainda não possui a tabela de taxas cadastrada.

A configuração é uma fotografia das taxas e do prazo exibidos pelo simulador do Pagar.me, com a data de conferência no painel. Para atualizar, reconferir os valores na conta e atualizar o registro `pagarme` no banco administrativo. O prazo é estimado e não representa um calendário de depósitos.
