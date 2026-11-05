import { contractWhatsappConfiguration } from './contractWhatsapp.js'
import { gatewayConfiguration } from './pagarme.js'

// Presence is not a health check: do not label an untested credential as connected.
export function integrationStatus(env = process.env, tracking = {}) {
  const state = (configured, detail) => ({ configured:Boolean(configured), label:configured?'Configuração encontrada':'Pendente de configuração', detail })
  let whatsapp = {provider:'disabled',ready:false}
  try { whatsapp = contractWhatsappConfiguration(env) } catch { /* invalid configuration remains pending */ }
  let gateway = null
  try { gateway = gatewayConfiguration(env) } catch { /* preserve gateway's existing activation rules */ }
  const contractEnabled = env.CONTRACTS_ENABLED === 'true'
  return {
    meta:{...state(env.META_ADS_ACCESS_TOKEN || tracking.meta_pixel_id,'Consulte os eventos, o token do servidor e as confirmações de recebimento pela Meta.'),label:tracking.meta_pixel_id && !env.META_CAPI_ACCESS_TOKEN?'Pixel cadastrado · token pendente':tracking.meta_pixel_id?'Pixel cadastrado':'Pixel pendente'},
    'google-tag-manager':state(tracking.gtm_id, tracking.gtm_id?'Contêiner global cadastrado. O disparo depende do consentimento e das regras do checkout.':'Cadastre o contêiner global ou personalize o rastreamento por oferta.'),
    members:{...state(true,'A entrega usa os planos vinculados aos produtos.'),label:env.CHECKOUT_FULFILLMENT_ENABLED==='true'?'Liberação habilitada':'Liberação automática pausada'},
    pabbly:state(env.PABBLY_CAMPANHA_WEBHOOK_URL,'O endereço da automação é configurado no servidor. Acompanhe os resultados no histórico das campanhas.'),
    brevo:state(env.BREVO_API_KEY,'A presença da credencial não confirma entrega. Consulte o histórico de campanhas e contratos.'),
    botconversa:{...state(whatsapp.ready && whatsapp.provider==='botconversa','O destino deve receber os eventos e acionar o fluxo de WhatsApp. Confira os recebimentos no provedor.'), ...(whatsapp.ready && whatsapp.provider==='botconversa' && !contractEnabled?{label:'Configurado · contratos pausados'}:{})},
    'papo-reto':{...state(whatsapp.ready && whatsapp.provider==='papo_reto','O adaptador permite trocar o provedor de WhatsApp. A conexão depende do receptor e da autenticação configurados no servidor.'), ...(whatsapp.ready && whatsapp.provider==='papo_reto' && !contractEnabled?{label:'Configurado · contratos pausados'}:{})},
    pagarme:{...state(gateway,'Acompanhe a confirmação dos pagamentos e os recebimentos pelo painel de webhooks.'), ...(gateway?{label:gateway.mode === 'test'?'Configurado · teste':'Configurado · produção'}:{})},
    contracts:{...state(contractEnabled && env.CONTRACT_TOKEN_SECRET,'Os modelos e o acompanhamento estão disponíveis. A exigência de assinatura depende da ativação dos contratos e da configuração da oferta.'),label:contractEnabled?(env.CONTRACT_TOKEN_SECRET?'Contratos habilitados':'Configuração incompleta'):'Contratos pausados'},
    webhooks:{...state(true,'A disponibilidade do módulo não indica destinos ativos. Consulte os cadastros, eventos e entregas.'),label:'Gerenciador disponível'},
  }
}
