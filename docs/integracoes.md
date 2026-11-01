# Configurações e integrações

Referência observada em 01/11/2026: Guru, Configurações → Integrações → Anunciantes. A listagem separa ativos/disponíveis; Meta possui Contas de Usuário, Contas de Anúncio, Pixels, Anúncios e Auditoria. A página de configurações agrupa cartões em Personalização, Organização, Técnicas e Segurança. Evidência: navegação autenticada e imagens fornecidas pela usuária. Nenhuma conexão do Guru foi removida, alterada ou copiada.

## Adaptação implementada

- Configurações → Técnicas → Integrações abre o catálogo próprio, preservando os temas claro/preto.
- Categorias: Anunciantes, Área de membros, Automações, Email e WhatsApp, Checkout, Contratos e Webhooks. Pesquisa por nome ou descrição, filtro de categoria, detalhe e retorno à lista.
- Reutiliza os módulos existentes de tráfego, Pixel/GTM, planos, comunicação, contratos, vendas e webhooks.
- O editor global de rastreamento tem endereço próprio sob Integrações e mantém a persistência existente. O atalho em Configurações continua disponível.
- API somente de leitura, restrita ao administrador; não devolve chaves, tokens, URLs de webhook, dados pessoais ou conteúdo de contratos. Nenhuma flag é modificada.

## Semântica dos estados

“Configuração encontrada” indica presença da configuração local, nunca validade de credencial ou confirmação de entrega. Os adaptadores de WhatsApp e gateway reutilizam suas validações existentes. Contratos pausados e liberação automática pausada são apresentados explicitamente. Erro de consulta deixa o estado “Não verificado” e permite nova tentativa.

Google Ads direto é planejado. Não existem nesta entrega OAuth de contas de usuário, importação Google Ads, cadastro de novos provedores, gestão de credenciais pelo navegador ou sincronização com a conta Guru. As telas de Meta e os demais atalhos usam os módulos realmente disponíveis no destino; não simulam dados da referência.

## Critérios de aceite

1. Abrir Integrações a partir da seção Técnicas, filtrar e pesquisar ferramentas, abrir detalhe e voltar.
2. Atalhos abrem módulos existentes; salvar GTM/Pixel usa o editor e API já existentes.
3. Estados são consultados no ambiente atual, sem ativar pagamentos, envios ou contratos.
4. Requisição não autorizada não consulta configurações. Respostas autorizadas não incluem segredos.
5. Categorias, cartões e ações permanecem utilizáveis em telas pequenas e nos dois temas.

Próxima etapa funcional, separada desta organização: projetar conexão própria de contas, permissões OAuth, sincronização, revogação e auditoria por anunciante com documentação oficial e credenciais do projeto. O fato de o Guru exibir uma conta conectada não prova uma conexão no nosso aplicativo.
