import Link from 'next/link'

export default function CentralVendas() {
  return <main className="central-home">
    <div className="central-home-heading"><div><span className="central-eyebrow">SEU NEGÓCIO EM UM SÓ LUGAR</span><h1>Central de Vendas</h1><p>Organize seus produtos, ofertas e pedidos com espaço para acompanhar cada detalhe.</p></div><Link className="central-primary" href="/admin/checkout">Gerenciar produtos →</Link></div>
    <section className="central-home-section"><div className="central-section-heading"><h2>Sua operação</h2><span>Disponível agora</span></div><div className="central-home-grid">
      <Link className="central-feature" href="/admin/checkout"><span className="central-feature-icon">01</span><h3>01 — Produtos e Ofertas</h3><p>Produtos, preços, parcelamento, Pix e ofertas adicionais. Tudo conectado ao que sua aluna recebe.</p><strong>Abrir catálogo →</strong></Link>
      <Link className="central-feature" href="/admin/checkout/vendas"><span className="central-feature-icon">02</span><h3>02 — Vendas</h3><p>Acompanhe pagamentos, filtre pedidos e consulte os detalhes de cada venda.</p><strong>Consultar vendas →</strong></Link>
    </div></section>
    <section className="central-home-section"><div className="central-section-heading"><h2>Próximos módulos</h2><span>Em desenvolvimento</span></div><div className="central-upcoming-grid">{[['03 — Assinaturas', 'Gestão das cobranças recorrentes.'], ['04 — Checkouts', 'Personalização das páginas de pagamento.'], ['05 — Integrações', 'Conexões e acompanhamento dos envios.'], ['06 — Configurações', 'Preferências e padrões da central.']].map(([title, text]) => <article className="central-upcoming" key={title}><span className="central-badge">Em breve</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
  </main>
}
