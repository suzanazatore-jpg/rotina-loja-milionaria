// Only configuration summaries cross the admin API. Credentials never enter this catalog.
export const INTEGRATION_CATEGORIES = [
  ['all', 'Todas'], ['publishers', 'Anunciantes'], ['members', 'Área de membros'],
  ['automation', 'Automações'], ['messages', 'Email e WhatsApp'],
  ['checkout', 'Checkout'], ['contracts', 'Contratos'], ['webhooks', 'Webhooks'],
]
const root = '/admin/checkout/configuracoes'
const tracking = `${root}/integracoes/rastreamento`
export const INTEGRATIONS = [
  { id:'meta', name:'Meta Ads', category:'publishers', icon:'goals', description:'Contas, anúncios e relatórios de tráfego. Pixel e conversões do checkout.', actions:[['Contas e anúncios','/admin/trafego'],['Configurar Pixel',tracking],['Pixel, eventos e auditoria',root+'/integracoes/meta']] },
  { id:'google-tag-manager', name:'Google Tag Manager', category:'publishers', icon:'goals', description:'Gerencie as tags do checkout pelo contêiner global ou por oferta.', actions:[['Configurar contêiner',tracking],['Produtos e ofertas','/admin/checkout']] },
  { id:'google-ads', name:'Google Ads', category:'publishers', icon:'campaigns', description:'Importação de contas, anúncios e custos do Google Ads.', planned:true, pending:'A conexão direta com Google Ads ainda precisa ser implementada. Tags podem ser gerenciadas pelo Google Tag Manager.', actions:[['Configurar Tag Manager',tracking]] },
  { id:'members', name:'Área de membros do app', category:'members', icon:'courses', description:'Vincule produtos a planos, cursos e prazos de acesso.', actions:[['Planos e acessos','/admin/planos'],['Vincular produtos','/admin/checkout']] },
  { id:'pabbly', name:'Pabbly', category:'automation', icon:'routine', description:'Encaminhe campanhas de WhatsApp aos fluxos de automação.', actions:[['Campanhas e histórico','/admin/comunicacao'],['Webhooks de vendas','/admin/checkout/webhooks']] },
  { id:'brevo', name:'Brevo', category:'messages', icon:'broadcast', description:'Emails de acesso, campanhas e comunicações dos contratos.', actions:[['Campanhas e histórico','/admin/comunicacao'],['Contratos',`${root}/contratos`]] },
  { id:'botconversa', name:'BotConversa', category:'messages', icon:'comments', description:'Receba os eventos dos contratos para enviar mensagens pelo WhatsApp.', actions:[['Contratos e atividades',`${root}/contratos`]] },
  { id:'papo-reto', name:'Papo_reto', category:'messages', icon:'comments', description:'Provedor alternativo de WhatsApp para os contratos.', actions:[['Contratos e atividades',`${root}/contratos`]] },
  { id:'pagarme', name:'Pagar.me', category:'checkout', icon:'plans', description:'Pagamentos, cobranças recorrentes e confirmação das vendas.', actions:[['Vendas','/admin/checkout/vendas'],['Assinaturas','/admin/checkout/assinaturas'],['Recebimentos e eventos','/admin/checkout/webhooks']] },
  { id:'contracts', name:'Assinatura de contratos', category:'contracts', icon:'content', description:'Modelos, assinatura, comprovantes e liberação de acesso vinculada ao contrato.', actions:[['Modelos, assinaturas e histórico',`${root}/contratos`]] },
  { id:'webhooks', name:'Webhooks de vendas e assinaturas', category:'webhooks', icon:'settings', description:'Cadastre destinos, escolha os eventos e acompanhe tentativas de entrega.', actions:[['Gerenciar webhooks','/admin/checkout/webhooks']] },
]
