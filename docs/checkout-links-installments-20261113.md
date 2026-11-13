# Correção de links e apresentação do parcelamento — 13/11/2026

Escopo autorizado: domínio pay.suzanazatorre.com.br, atualização da URL amigável e exibição das parcelas em todos os layouts. Preservar eventos Meta, aviso de cookies, cálculo financeiro e processamento de pagamentos.

## Evidências
- Oferta Implementação EVS - 2M no painel: link rotina.suzanazatorre.com.br/p/implementacao-evs-2m.
- Checkout público: total financiado e texto “Com juros. Total da compra”.
- main e checkout/painel-admin têm implementações diferentes. main priorizava alias antigo e slug antes de payment_path; edição usava o baseline salvo.
- Domínio pay já responde e serve o checkout.

## Implementação
- Usar payment_path reservado como endereço principal; manter aliases e códigos antigos disponíveis.
- Mostrar alteração no link enquanto se edita; compartilhar somente após salvar e usar o endereço retornado pelo servidor (inclusive sufixos de colisão).
- Preservar slug interno em edição, identidade da oferta e APIs de pagamento/eventos.
- Mostrar quantidade e valor das parcelas em TOTAL, sem soma financiada ou texto “com juros”; taxa percentual discreta abaixo de comprar.
- Sem migração de banco. Trigger existente reserva nomes e conserva endereços anteriores.

## Verificação
Testes de links, configuração pública e rastreamento; lint dos arquivos modificados; build de cada versão. Verificação publicada e persistência na UI dependem do deploy. Recuperação: reverter somente os commits desta tarefa.

Observação: em main o teste existente do cron de conversões não resolve uma importação de checkoutAccessPabblyServer em seu harness; arquivo cron e rastreamento não foram alterados.
