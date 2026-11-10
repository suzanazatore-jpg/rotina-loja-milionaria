# Configuração do checkout por produto — 10/11/2026

Referência: Guru, produto a2d35c7a-6825-4b7a-9568-855fe80f934f. Destino: produto c35a5d1c-bf01-4d98-805f-b86f05e345f1, branch checkout/painel-admin.

## Escopo e evidência
Inspecionadas as oito abas: Aparência (cores, tipografia, mobile, banners e switches), Formulário, Vendedor, Order Bump, Emails, Pixels, Redirecionamento e Auditoria. Guru apresenta URL aprovada com origem=lp-01. No destino, a oferta principal está ativa, R$27, cartão/Pix, perfil compacto; seus cinco campos de redirecionamento estão vazios. Nenhum valor da referência foi aplicado ao destino.

## Implementado
- Entrada Checkout no produto e nas configurações adicionais; seletor explícito de oferta.
- Abas na ordem da referência, reutilizando controles reais da aplicação. Order Bump encaminha ao cadastro já existente; Auditoria consulta os registros existentes.
- Redirecionamentos em tabela, inclusão/edição por modal, remoção no rascunho, parâmetro de URL, validação no cliente e servidor.
- PATCH administrativo separado: grava somente as chaves alteradas de checkout_config; sincroniza thank_you_url exclusivamente na edição de redirecionamentos. Não toca preço, pagamentos, parcelamento, contratos, acesso, automações nem adicionais.
- Conflito de edição detectado na leitura e na atualização condicional. Mantém chaves antigas/desconhecidas; nenhuma normalização em massa de ofertas.
- Banco: esquema existente offers.checkout_config e offers.thank_you_url; sem migração e sem gravação de produção durante a implementação. Auditoria existente por trigger.

## Limites de fidelidade
Esta entrega não é uma réplica integral do Guru. Mantém os controles implementados no checkout próprio. Não acrescenta os meios de pagamento estrangeiros, boleto, cor por subelemento, posições mobile, campos extras, cupons ou emails transacionais que o motor atual não suporta. Replicar tais controles de forma funcional exigiria ampliar o funcionamento; isso foi excluído pela instrução de preservar vendas ativas. Não foram inseridos botões que aparentem executar essas funções.

## Verificação
Build Next 16.2.9 aprovado com valores fictícios de ambiente. ESLint dos novos arquivos sem erros; editor preexistente tem aviso de imagem img. 26 testes: preservação das configurações e do destino legado; URLs e parâmetros; campos proibidos; autorização; conflitos; escopo da gravação; configuração, sessão e comportamento de redirects existentes. Testes da rota usam banco simulado. Persistência real não validada por gravação em produção.

## Recuperação
Reverter o commit desta entrega na branch checkout/painel-admin e deixar a integração Git publicar a revisão. Não há migração para desfazer. Valores de ofertas continuam inalterados por esta entrega; futuras edições voluntárias na interface devem ser recuperadas individualmente pela auditoria.
