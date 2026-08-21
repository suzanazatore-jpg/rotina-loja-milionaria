'use client'
import { useRouter } from 'next/navigation'

const ouro = '#D4AF37'

export default function AdminCursosShell({ children, busca = '', setBusca, tituloBusca = 'Pesquisar cursos e aulas...' }) {
  const router = useRouter()
  return (
    <div className="adm-cursos-shell">
      <style>{css}</style>
      <aside className="adm-cursos-side">
        <div className="adm-cursos-brand"><span>SZ</span><small>ROTINA DA LOJA<br />MILIONÁRIA</small></div>
        <div className="adm-cursos-avatar">👤</div>
        <strong>Suzana Zatorre</strong><small className="adm-cursos-role">Administradora</small>
        <nav>
          <button onClick={() => router.push('/painel')}>⌂ <span>Início</span></button>
          <button onClick={() => router.push('/painel')}>♙ <span>Minha Conta</span></button>
          <button className="ativo" onClick={() => router.push('/admin')}>⚙ <span>Administrador</span></button>
        </nav>
        <footer><span>Pesquisar</span><span>Suporte para Alunas</span><span>Termos de Uso</span><span>Políticas de Privacidade</span></footer>
      </aside>
      <div className="adm-cursos-main">
        <header className="adm-cursos-top">
          {setBusca ? <label className="adm-cursos-search">⌕<input value={busca} onChange={e => setBusca(e.target.value)} placeholder={tituloBusca} /></label> : <button className="adm-cursos-mobile-back" onClick={() => router.push('/admin/cursos')}>← Cursos</button>}
          <button className="adm-cursos-area" onClick={() => router.push('/painel')}>⌂ Área de alunas</button>
          <span className="adm-cursos-user">Suzana ▾</span>
        </header>
        <div className="adm-cursos-content">{children}</div>
      </div>
    </div>
  )
}

const css = `
*{box-sizing:border-box}.adm-cursos-shell{min-height:100vh;background:#080808;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex}
.adm-cursos-side{width:212px;position:fixed;inset:0 auto 0 0;background:#0d0b0c;border-right:1px solid #2a2725;padding:15px 14px;display:flex;flex-direction:column;align-items:center;z-index:20}
.adm-cursos-brand{align-self:flex-start;display:flex;align-items:center;gap:6px;color:#fff;font-size:7px;font-weight:800}.adm-cursos-brand span{font-family:serif;font-size:15px;color:#e4c24d}.adm-cursos-brand small{font-size:6px;line-height:1.1}
.adm-cursos-avatar{width:58px;height:58px;border:1px solid #333;border-radius:50%;display:grid;place-items:center;margin:28px 0 8px;color:#888;font-size:22px}.adm-cursos-side>strong{font-size:14px}.adm-cursos-role{color:#777;font-size:10px;margin:5px 0 17px}
.adm-cursos-side nav{width:100%;border-top:3px solid ${ouro};padding-top:15px}.adm-cursos-side nav button{width:100%;border:0;background:none;color:#eee;padding:10px 7px;display:flex;align-items:center;gap:12px;font-weight:700;cursor:pointer;text-align:left}.adm-cursos-side nav button.ativo{color:${ouro}}
.adm-cursos-side footer{margin-top:auto;width:100%;display:flex;flex-direction:column;gap:7px;color:#696969;font-size:10px}
.adm-cursos-main{margin-left:212px;min-width:0;width:calc(100% - 212px)}.adm-cursos-top{height:52px;border-bottom:1px solid #292624;background:#0b0a0a;display:flex;align-items:center;gap:16px;padding:0 24px;position:sticky;top:0;z-index:15}
.adm-cursos-search{height:34px;width:380px;border:1px solid #302c2a;background:#161313;border-radius:8px;display:flex;align-items:center;gap:8px;padding:0 11px;color:#777}.adm-cursos-search input{width:100%;background:none;border:0;outline:0;color:#fff;font-size:12px}.adm-cursos-area{margin-left:auto;background:rgba(212,175,55,.08);border:1px solid #6a581d;color:${ouro};border-radius:8px;padding:8px 13px;font-size:12px;font-weight:800;cursor:pointer}.adm-cursos-user{font-size:12px;font-weight:800}.adm-cursos-content{padding:20px 28px 60px}.adm-cursos-mobile-back{background:none;border:1px solid #333;color:${ouro};border-radius:8px;padding:7px 10px;cursor:pointer}
@media(max-width:760px){.adm-cursos-side{display:none}.adm-cursos-main{margin-left:0;width:100%}.adm-cursos-top{padding:0 12px}.adm-cursos-search{width:auto;flex:1}.adm-cursos-user{display:none}.adm-cursos-content{padding:18px 14px 50px}.adm-cursos-area{padding:7px 9px;font-size:10px}}
`
