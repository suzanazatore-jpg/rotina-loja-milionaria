# Central de Vendas — visual Guru e correção Meta

Referência: telas fornecidas pela usuária (Dashboard, Vendas, Assinaturas, Produtos, Configurações e Contatos), além da inspeção da integração Meta no Guru. Destino: Central de Vendas existente. Escopo: aparência administrativa e correção da navegação Meta; manter dados e regras comerciais.

## Implementado localmente
- Layout isolado em branch `feat/guru-visual-central`, partindo do commit `1ba1307` da main, sem editar os checkouts públicos.
- Menu estreito roxo com ícones, fontes Urbanist/Inter, roxo #3C2191, títulos 22/18 px, dados 14 px, ações compactas e cartões arredondados.
- Ritmo uniforme para tabelas de vendas, assinaturas, produtos e contatos. Cartões horizontais compactos em Configurações.
- Dashboard com barras verdes para quantidade de vendas aprovadas e linha roxa para faturamento. Não são exibidos valores líquidos fictícios: o resumo atual não fornece os dados financeiros equivalentes aos do Guru.
- Novo destino `/admin/checkout/configuracoes/integracoes/meta`, com Contas de Usuário, Contas de Anúncio, Pixels, Anúncios e Auditoria.
- Removido o link incorreto para `/admin/trafego`. Conta de usuário é a identidade obtida por `/me` com a credencial existente, e não a lista de clientes do módulo de tráfego.
- API administrativa autenticada, sem retornar access tokens. Pixels mostram somente o ID e um indicador de configuração protegido.

## Limitações explícitas
- Contas de anúncio ainda não possuem um mecanismo de vínculo exclusivo com a Central; listar todas as contas administradas repetiria o problema informado. Nenhuma é declarada vinculada automaticamente.
- Anúncios e auditoria exibem a dependência real; conexão OAuth, seleção persistente de contas e histórico de conexões não foram implementados nesta mudança visual.
- Sem ações falsas de adicionar/remover conexão. O Pixel usa o editor já existente.
- Marca Suzana Zatorre mantida. Faixa de assinatura/teste e controles exclusivos do Guru não foram copiados.
- Tema escuro preservado. Fidelidade visual não declarada como 100% sem conferência em navegador e comparação de capturas.

## Verificação
- ESLint nos arquivos JS modificados: aprovado.
- `node --test tests/central-meta-integration.test.mjs tests/integrations.test.mjs tests/central-records.test.mjs`: 16 testes aprovados.
- Build Next 16.2.9 com webpack: aprovado usando URL/chaves fictícias apenas no processo de build local; não houve consulta a dados reais nesse build.
- Turbopack local não aceita o symlink compartilhado de dependências; verificação realizada com webpack.
- Consulta real da nova integração e validação visual em desktop/mobile: não executadas. O navegador conectado não alcança localhost deste ambiente.

## Publicação
Commit local preparado. O envio da branch ao GitHub foi bloqueado pela revisão automática por falta de autorização específica para publicar código no repositório externo. Não foi usado outro mecanismo para contornar o bloqueio. Nenhuma publicação ou alteração em produção foi confirmada. Solicitar autorização para enviar a branch a `suzanazatore-jpg/rotina-loja-milionaria` e gerar uma prévia; depois conferir telas e corrigir divergências antes da liberação final.
