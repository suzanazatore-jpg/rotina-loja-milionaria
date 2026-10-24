'use client'
import { useState, useEffect, useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppIcon from '@/app/components/AppIcon'
import styles from './Office.module.css'

const THEME_KEY = 'sz-meu-escritorio-tema'
let fallbackTheme = 'escuro'
function subscribeTheme(callback) {
  window.addEventListener('storage', callback)
  window.addEventListener('sz-office-theme', callback)
  return () => { window.removeEventListener('storage', callback); window.removeEventListener('sz-office-theme', callback) }
}
function readTheme() {
  try { const value = window.localStorage.getItem(THEME_KEY); return ['claro', 'escuro'].includes(value) ? value : fallbackTheme } catch { return fallbackTheme }
}
const serverTheme = () => 'escuro'

// ════════ E-MAIL DO ADMIN ════════
const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

export default function Admin() {
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const router = useRouter()

  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme)
  function changeTheme(value) {
    fallbackTheme = value
    try { window.localStorage.setItem(THEME_KEY, value) } catch {}
    window.dispatchEvent(new Event('sz-office-theme'))
  }

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) {
        setAutorizado(false); setCarregando(false); return
      }
      setAutorizado(true)
      setCarregando(false)
    }
    init()
  }, [router])

  const grupos = [
    {
      titulo: 'Gerenciamento de Conteúdo e Usuários',
      descricao: 'Gerencie o conteúdo e as alunas da sua área de membros.',
      cards: [
        { icone: 'users', titulo: 'Alunas e Acessos', sub: 'Cadastre alunas, libere cursos e gerencie acessos.', rota: '/admin/alunas' },
        { icone: 'courses', titulo: 'Cursos e Aulas', sub: 'Crie cursos, módulos e aulas com vídeo e materiais.', rota: '/admin/cursos' },
        { icone: 'plans', titulo: 'Planos e Ofertas', sub: 'Defina planos, validade, cursos e conteúdos vinculados.', rota: '/admin/planos' },
        { icone: 'quickCourses', titulo: 'Aulas da Mentoria', sub: 'Organize as gravações das mentorias EVS e CVM.', rota: '/admin/aulas' },
        { icone: '📝', titulo: 'Termos de Uso', sub: 'Texto que a aluna aceita no primeiro acesso.', rota: '/admin/termos' },
        { icone: '🏅', titulo: 'Certificados', sub: 'Certificados de conclusão para as alunas.', status: 'Depois' },
      ],
    },
    {
      titulo: 'Conteúdo do Aplicativo',
      descricao: 'Configure o que a aluna encontra no painel principal.',
      cards: [
        { icone: 'calendar', titulo: 'Calendário', sub: 'Organize e publique o conteúdo mensal.', rota: '/admin/calendario' },
        { icone: 'campaigns', titulo: 'Campanhas', sub: 'Disponibilize campanhas e ações de vendas.', rota: '/admin/campanhas' },
        { icone: 'routine', titulo: 'Rotina', sub: 'Publique a rotina semanal das lojistas.', rota: '/admin/rotina' },
        { icone: 'goals', titulo: 'Calculadora de Metas', sub: 'Metas, ranking e histórico das vendedoras.', rota: '/admin/metas' },
        { icone: '🎬', titulo: 'Vídeos Explicativos', sub: 'Cadastre as aulas rápidas das ferramentas do aplicativo.', rota: '/admin/videos' },
        { icone: 'quickAssistant', titulo: 'Base da Assistente', sub: 'Ensine a Assistente com PDFs, Word e orientações da Suzana.', rota: '/admin/assistente' },
      ],
    },
    {
      titulo: 'Marketing e Comunicação',
      descricao: 'Ações para comunicar e acompanhar suas alunas.',
      cards: [
        { icone: 'goals', titulo: 'Leads do Raio-X', sub: 'Acompanhe diagnósticos, gargalos e contatos captados.', rota: '/admin/raio-x' },
        { icone: 'banners', titulo: 'Banners do Painel', sub: 'Insira banners e novidades no topo do aplicativo.', rota: '/admin/banners' },
        { icone: 'carousel', titulo: 'Carrosséis de Cursos', sub: 'Organize cursos em seções na área de membros.', rota: '/admin/carrosseis' },
        { icone: 'comments', titulo: 'Comentários', sub: 'Veja, responda e modere comentários feitos nas aulas.', rota: '/admin/comentarios' },
        { icone: 'support', titulo: 'Suporte', sub: 'Centralize e responda as solicitações das alunas.', rota: '/admin/suporte' },
        { icone: 'notifications', titulo: 'Notificações', sub: 'Edite os avisos das 8h e 9h e envie testes.', rota: '/admin/notificacoes' },
        { icone: 'broadcast', titulo: 'Campanhas em Massa', sub: 'Envie mensagens por e-mail e WhatsApp.', rota: '/admin/comunicacao' },
      ],
    },
    {
      titulo: 'Central de Vendas',
      descricao: 'Sua operação comercial em um só lugar.',
      cards: [
        { icone: 'plans', titulo: 'Central de Vendas', sub: 'Gerencie produtos, ofertas, checkouts e acompanhe suas vendas.', rota: '/admin/central-vendas' },
      ],
    },
    {
      titulo: 'Gestão de Tráfego Pago',
      descricao: 'Acompanhe os clientes de anúncios e os relatórios semanais e mensais.',
      cards: [
        { icone: 'goals', titulo: 'Meu Tráfego Pago', sub: 'Central das 17 contas, indicadores e relatórios dos clientes.', rota: '/admin/trafego' },
      ],
    },
    {
      titulo: 'Configurações',
      descricao: 'Preferências, segurança e administração do aplicativo.',
      cards: [
        { icone: '🎨', titulo: 'Preferências e Cores', sub: 'Ajuste a identidade visual do aplicativo.', status: 'Em breve' },
        { icone: '🔐', titulo: 'Autenticação e Segurança', sub: 'Regras de login e proteção de acesso.', status: 'Depois' },
        { icone: '👤', titulo: 'Administradores', sub: 'Defina outras pessoas com acesso administrativo.', status: 'Depois' },
      ],
    },
  ]

  if (carregando) return <div className={styles.office} data-theme={theme}><main className={styles.access}><p role="status">Carregando...</p></main></div>
  if (!autorizado) return <div className={styles.office} data-theme={theme}><main className={styles.access}><h1>Acesso restrito</h1><p>Esta área é exclusiva do administrador.</p><button className={styles.back} onClick={() => router.push('/painel')}>Voltar ao painel</button></main></div>

  return (
    <div className={styles.office} data-theme={theme}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <button className={styles.back} onClick={() => router.push('/painel')}>← Painel</button>
          <div><p className={styles.eyebrow}>Administração</p><h1>Meu Escritório</h1></div>
        </div>
        <div className={styles.theme} role="group" aria-label="Tema do Meu Escritório">
          <button type="button" aria-pressed={theme === 'claro'} onClick={() => changeTheme('claro')}>☀ Claro</button>
          <button type="button" aria-pressed={theme === 'escuro'} onClick={() => changeTheme('escuro')}>◐ Escuro</button>
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.groups}>
          {grupos.map((grupo, index) => (
            <section key={grupo.titulo} aria-labelledby={`office-group-${index}`} className={`${styles.group} ${grupo.cards.length === 1 ? styles.single : ''} ${grupo.titulo === 'Configurações' ? styles.settings : ''}`}>
              <h2 id={`office-group-${index}`}>{grupo.titulo}</h2>
              <p className={styles.description}>{grupo.descricao}</p>
              <div className={styles.cards}>
                {grupo.cards.map(card => <button key={card.titulo} type="button" className={styles.card} disabled={!card.rota} onClick={() => card.rota && router.push(card.rota)}>
                  <span className={styles.icon} aria-hidden="true"><AppIcon name={card.icone} size={18} /></span>
                  <span className={styles.copy}><span className={styles.title}>{card.titulo}{card.status && <small className={styles.badge}>{card.status}</small>}</span><span className={styles.subtitle}>{card.sub}</span></span>
                </button>)}
              </div>
            </section>
          ))}
        </div>
        <footer className={styles.legend}><span><b>● Ativo</b> — pronto para usar</span><span><b>● Em breve</b> — entra nas próximas etapas</span></footer>
      </main>
    </div>
  )
}
