# Simulador de vendas da Central

Referência: simulador autenticado do Pagar.me, estudado nos dois modos, cinco bandeiras e opções de 1 a 12 parcelas em 13/11/2026 (horário de São Paulo). Taxas comerciais reais não são incluídas no repositório público.

## Entrega
- Rota `/admin/checkout/simulador`, protegida pelo layout administrativo já existente.
- Atalhos no Dashboard e em Configurações → Organização.
- Modos Quero receber e Quero cobrar; valor, bandeira e número de parcelas.
- Resultado bruto, líquido, taxa efetiva, total de taxas, prazo cadastrado e comparação dos 12 parcelamentos.
- Tabela de taxas por bandeira editável e salva somente no navegador. Origem e data de conferência explícitas. Não há sincronização automática nem gravação no servidor.
- Custo fixo adicional opcional, separado para evitar misturar uma taxa contratual com a taxa efetiva observada no simulador.
- Cálculo em centavos com arredondamento de taxas e distribuição do resto das parcelas. O modo inverso encontra o menor valor bruto cujo líquido alcança o objetivo.
- Nenhuma cobrança é criada. Checkout e preços das ofertas não são alterados.

## Verificações
- Cinco testes cobrem cálculo direto, inverso, minimalidade, soma das parcelas, limites, configurações ausentes e taxa fixa.
- Comparação privada com 12 resultados líquidos observados e dois resultados inversos: aprovados.
- A referência apresenta algumas diferenças de um centavo na exibição isolada de taxas; nossa implementação conserva bruto = líquido + taxas.
- Build Next com webpack e valores locais de teste: aprovado.
- Conferência autenticada em navegador deve ser registrada após implantação da prévia.

## Limites
- Taxas e prazo dependem das condições conferidas e cadastradas pelo administrador.
- O prazo do simulador de referência não foi tratado como prova de antecipação habilitada. A tela de contrato e o simulador mostraram condições diferentes.
- O detalhamento líquido por parcela é contábil, sem prometer um calendário de depósitos.
- A tabela salva é específica do navegador e do endereço do app. Outro navegador/endereço exige novo cadastro.
