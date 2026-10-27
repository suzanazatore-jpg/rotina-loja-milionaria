-- Módulo próprio de contratos e assinatura eletrônica.
-- Acesso exclusivo pelo servidor (service_role). A página pública usa token aleatório validado no backend.

create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  body text not null,
  version integer not null default 1,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  customer_id uuid not null references public.customers(id),
  offer_id uuid not null references public.offers(id),
  template_id uuid not null references public.contract_templates(id),
  template_version integer not null,
  status text not null default 'pending' check (status in ('pending','viewed','signed','canceled')),
  token_hash text not null unique,
  fields jsonb not null default '{}'::jsonb,
  body text not null,
  original_sha256 text not null,
  signed_pdf_path text,
  signed_pdf_sha256 text,
  signer_name text,
  signer_document text,
  signature_png text,
  signed_at timestamptz,
  signed_ip text,
  signed_user_agent text,
  signed_channel text,
  otp_hash text,
  otp_channel text,
  otp_expires_at timestamptz,
  otp_attempts integer not null default 0,
  otp_sent_count integer not null default 0,
  reminders_sent integer not null default 0,
  next_reminder_at timestamptz,
  fulfillment_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contracts_status_idx on public.contracts (status, next_reminder_at);
create index contracts_customer_idx on public.contracts (customer_id);

create table public.contract_events (
  id bigint generated always as identity primary key,
  contract_id uuid not null references public.contracts(id),
  type text not null,
  channel text,
  ip text,
  user_agent text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index contract_events_contract_idx on public.contract_events (contract_id, created_at);

alter table public.contract_templates enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_events enable row level security;
revoke all on public.contract_templates, public.contracts, public.contract_events from anon, authenticated;
grant all on public.contract_templates, public.contracts, public.contract_events to service_role;
grant usage on sequence public.contract_events_id_seq to service_role;

-- O histórico é prova: o servidor só acrescenta eventos.
create or replace function public.contract_events_append_only() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'contract_events é somente inclusão'; end $$;
create trigger contract_events_no_update before update or delete on public.contract_events
  for each row execute function public.contract_events_append_only();

insert into storage.buckets (id, name, public) values ('contracts', 'contracts', false)
  on conflict (id) do nothing;

-- Modelos iniciais (fonte: docs/contratos-modelos/*.md). Edições posteriores são feitas no painel e geram nova versão.
insert into public.contract_templates (slug, name, body) values
('evs', 'Contrato EVS — Treinamento e Acompanhamento de Equipe de Vendas', $tpl$# CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE TREINAMENTO E ACOMPANHAMENTO DE EQUIPE DE VENDAS
Pelo presente instrumento particular, de um lado:
CONTRATADA: Suzana Zatorre Educacional, pessoa jurídica de direito privado, inscrita no CNPJ nº 51.557.598/0001-55, com sede na Rua Aristides Gomes, nº 670, Bairro Gilberto Pinheiro, na cidade de Currais Novos/RN, neste ato representada por sua representante legal, Suzana Andrade de Oliveira, brasileira, solteira, nascida em 08/01/1977, inscrita no CPF nº 024.547.994-56, portadora da identidade nº 1.501.718, órgão expedidor SSP/RN, residente e domiciliada na Rua das Algarobas, nº 343, Condomínio Itatiaia, Torre Amarela, Apto. 808, Nova Parnamirim/RN, CEP 59151-907.
E, de outro lado:
CONTRATANTE: {nome}, {qualificacao}, residente e domiciliado(a) em {endereco}, endereço eletrônico {email}, telefone {telefone}.
As partes acima identificadas resolvem celebrar o presente Contrato de Prestação de Serviços de Treinamento e Acompanhamento de Equipe de Vendas, mediante as cláusulas e condições seguintes:

## CLÁUSULA 1 – DO OBJETO
1.1. O presente contrato tem por objeto a prestação de serviços profissionais de treinamento, orientação e acompanhamento comercial da equipe de vendas da CONTRATANTE, com foco em atendimento, abordagem, condução da venda, postura comercial, relacionamento com o cliente e melhoria da rotina de vendas.
1.2. O serviço contratado não inclui gestão de tráfego pago, criação ou gerenciamento de anúncios, administração de contas de anúncios, impulsionamento de publicações, investimento em mídia ou qualquer atividade relacionada a plataformas como Meta Ads, Google Ads ou similares.

## CLÁUSULA 2 – DAS ENTREGAS CONTRATADAS
2.1. A CONTRATADA prestará os seguintes serviços à CONTRATANTE:
a) 01 reunião de diagnóstico com a proprietária, gestora ou responsável pela loja, com o objetivo de compreender a realidade comercial do negócio, principais dificuldades da equipe, rotina de atendimento, pontos de melhoria e necessidades específicas da empresa;
b) elaboração do direcionamento do treinamento com base nas informações levantadas na reunião de diagnóstico;
c) 03 reuniões de treinamento com a equipe de vendas, com foco em atendimento comercial, abordagem ao cliente, sondagem, apresentação de produtos, condução da venda, contorno de objeções, fechamento e postura profissional;
d) orientações práticas para aplicação do treinamento na rotina da loja;
e) recomendações comerciais relacionadas à melhoria do atendimento e da performance da equipe.
2.2. As reuniões serão realizadas de forma online, por meio de plataforma a ser combinada previamente entre as partes.
2.3. Cada reunião terá duração aproximada de 01 (uma) hora.
2.4. As datas e horários das reuniões serão definidos em comum acordo entre CONTRATADA e CONTRATANTE, respeitando a disponibilidade de agenda de ambas as partes.

## CLÁUSULA 3 – DO PRAZO DE EXECUÇÃO
3.1. O presente contrato terá vigência de {prazo}, contados a partir da data de assinatura.
3.2. As entregas previstas neste contrato deverão ser realizadas dentro do prazo acordado entre as partes, respeitando a disponibilidade de agenda da CONTRATADA e da CONTRATANTE.
3.3. O não comparecimento da CONTRATANTE ou de sua equipe às reuniões previamente agendadas não gera obrigação de devolução de valores.
3.4. O reagendamento de reuniões deverá ser solicitado com antecedência mínima de 48 (quarenta e oito) horas.
3.5. Caso a CONTRATANTE solicite reagendamento fora do prazo previsto na cláusula anterior, a CONTRATADA poderá considerar a reunião como realizada, salvo em situações excepcionais previamente justificadas e aceitas pela CONTRATADA.

## CLÁUSULA 4 – DOS VALORES E CONDIÇÕES DE PAGAMENTO
4.1. Pela prestação dos serviços descritos neste contrato, a CONTRATANTE pagará à CONTRATADA o valor total de {valor_total} ({valor_extenso}).
4.2. O pagamento foi realizado pela CONTRATANTE em {data_pagamento}, por meio de {forma_pagamento}, {parcelas}, conforme as condições da operadora do cartão ou da plataforma de pagamento utilizada.
4.3. O início da execução dos serviços fica condicionado à confirmação do pagamento da primeira parcela ou do valor integral, conforme condição comercial acordada entre as partes.
4.4. Em caso de atraso, inadimplência, cancelamento do pagamento ou não aprovação da transação, poderá haver suspensão das reuniões, treinamentos ou entregas até a regularização do valor devido.

## CLÁUSULA 5 – DAS RESPONSABILIDADES DA CONTRATADA
5.1. Compete à CONTRATADA:
a) conduzir a reunião de diagnóstico com a CONTRATANTE;
b) elaborar o direcionamento do treinamento conforme as necessidades identificadas;
c) realizar as 03 reuniões de treinamento com a equipe de vendas;
d) orientar a CONTRATANTE e sua equipe com base em boas práticas comerciais;
e) cumprir os horários e datas previamente acordados;
f) manter sigilo sobre informações estratégicas e comerciais da CONTRATANTE.
5.2. A CONTRATADA atuará com zelo, técnica, boa-fé e responsabilidade profissional na execução dos serviços contratados.

## CLÁUSULA 6 – DAS RESPONSABILIDADES DA CONTRATANTE
6.1. Compete à CONTRATANTE:
a) fornecer informações verdadeiras, completas e atualizadas sobre a realidade da loja;
b) disponibilizar a equipe de vendas para participação nos treinamentos;
c) garantir que a equipe esteja presente, disponível e orientada sobre a importância do treinamento;
d) comparecer às reuniões agendadas ou comunicar necessidade de reagendamento dentro do prazo previsto;
e) aplicar, acompanhar e reforçar internamente as orientações recebidas;
f) realizar os pagamentos conforme acordado neste contrato.
6.2. A CONTRATANTE declara estar ciente de que o resultado do treinamento depende também da participação da equipe, da liderança interna, da aplicação prática das orientações, da rotina comercial da loja e do acompanhamento diário realizado pela própria empresa.

## CLÁUSULA 7 – DA AUSÊNCIA DE GARANTIA DE RESULTADOS
7.1. O presente contrato caracteriza-se como obrigação de meio, não havendo garantia de aumento específico de vendas, faturamento, lucratividade, ticket médio, conversão, produtividade da equipe ou qualquer outro resultado financeiro ou comercial determinado.
7.2. A CONTRATADA compromete-se a entregar orientação, método, treinamento e direcionamento comercial, mas a execução prática, cobrança interna, acompanhamento diário e aplicação das orientações cabem à CONTRATANTE.
7.3. A CONTRATADA não se responsabiliza por falta de adesão da equipe, resistência dos colaboradores, ausência de aplicação prática, problemas internos de gestão, falta de produtos, preços, estoque, atendimento, localização, concorrência, sazonalidade ou outros fatores externos à prestação dos serviços.

## CLÁUSULA 8 – CANCELAMENTO, DESISTÊNCIA E RESCISÃO
8.1. Em caso de desistência por parte da CONTRATANTE após o início da execução dos serviços, os valores pagos não serão devolvidos, considerando a reserva de agenda, preparação do acompanhamento, reunião de diagnóstico, planejamento dos treinamentos e disponibilidade profissional da CONTRATADA.
8.2. Caso a CONTRATANTE desista da contratação antes da realização da primeira reunião, será retido pela CONTRATADA o percentual de 70% (setenta por cento) do valor total contratado, a título de retenção compensatória pela reserva de agenda, análise prévia, preparação do acompanhamento, desenvolvimento do direcionamento do treinamento e disponibilidade profissional da CONTRATADA.
8.3. Na hipótese prevista na cláusula anterior, será devolvido à CONTRATANTE apenas o percentual de 30% (trinta por cento) do valor total efetivamente pago, descontadas eventuais taxas de cartão, juros, tarifas de plataforma de pagamento, tarifas bancárias ou encargos cobrados por terceiros.
8.4. Caso a desistência ocorra após a realização da primeira reunião, seja ela reunião de diagnóstico, alinhamento ou treinamento, não haverá devolução de valores, considerando que os serviços já terão sido iniciados e a agenda profissional da CONTRATADA já terá sido comprometida.
8.5. A CONTRATADA poderá rescindir o contrato em caso de inadimplência, falta de colaboração da CONTRATANTE, conduta desrespeitosa, omissão de informações relevantes ou impossibilidade de execução dos serviços por culpa da CONTRATANTE.

## CLÁUSULA 9 – CONFIDENCIALIDADE
9.1. As partes comprometem-se a manter sigilo sobre todas as informações comerciais, estratégicas, financeiras, operacionais e internas compartilhadas em razão deste contrato.
9.2. A obrigação de confidencialidade permanecerá válida mesmo após o término do presente contrato.

## CLÁUSULA 10 – USO DE IMAGEM, MARCA E RESULTADOS
10.1. A CONTRATADA poderá utilizar o nome, marca, depoimentos, registros do treinamento, imagens, vídeos ou resultados públicos da CONTRATANTE para fins de portfólio, divulgação institucional, estudo de caso e apresentação comercial, desde que não exponha informações confidenciais da empresa.
10.2. Caso a CONTRATANTE não autorize o uso de imagem, marca ou registros do treinamento, deverá manifestar sua oposição por escrito antes do início da execução dos serviços.

## CLÁUSULA 11 – PROTEÇÃO DE DADOS E LGPD
11.1. As partes comprometem-se a observar a Lei nº 13.709/2018 – Lei Geral de Proteção de Dados Pessoais, quando houver tratamento de dados pessoais em razão da execução deste contrato.
11.2. Os dados eventualmente compartilhados serão utilizados exclusivamente para fins de execução dos serviços contratados.

## CLÁUSULA 12 – TÍTULO EXECUTIVO
12.1. O presente contrato constitui título executivo extrajudicial, nos termos do art. 784, III e § 4º, do Código de Processo Civil, sendo assinado eletronicamente pelas partes, com dispensa de testemunhas.

## CLÁUSULA 13 – DO FORO
13.1. Fica eleito o Foro da Comarca de Currais Novos/RN para dirimir quaisquer dúvidas ou controvérsias decorrentes deste contrato, renunciando as partes a qualquer outro, por mais privilegiado que seja.

## DECLARAÇÃO EXPRESSA DE ACEITE
A CONTRATANTE declara que:
a) leu integralmente o presente contrato;
b) compreendeu todas as cláusulas e condições;
c) está ciente de que o serviço contratado não inclui gestão de tráfego pago;
d) está ciente de que o treinamento não garante resultado financeiro específico;
e) concorda com todas as condições estabelecidas neste instrumento.
E, por estarem assim justas e contratadas, as partes assinam o presente instrumento.
Currais Novos/RN, {cidade_data}.

CONTRATADA: Suzana Zatorre Educacional — CNPJ nº 51.557.598/0001-55
CONTRATANTE: {nome} — {documento_rotulo} nº {documento}
Assinaturas eletrônicas registradas na página de assinaturas e auditoria ao final deste documento.$tpl$),
('cvm', 'Contrato CVM — Mentoria (3M ou 6M)', $tpl$# CONTRATO DE PRESTAÇÃO DE SERVIÇOS – {programa_maiusculo}
Pelo presente instrumento particular, de um lado:
CONTRATANTE: {nome}, {qualificacao}, residente e domiciliado(a) em {endereco}, endereço eletrônico {email}, telefone {telefone}.
E, de outro lado:
CONTRATADA: Suzana Zatorre Educacional, pessoa jurídica de direito privado, inscrita no CNPJ nº 51.557.598/0001-55, com sede na Rua Aristides Gomes, nº 670, Bairro Gilberto Pinheiro, na cidade de Currais Novos/RN, neste ato representada por sua representante legal, Suzana Andrade de Oliveira, brasileira, solteira, nascida em 08/01/1977, inscrita no CPF nº 024.547.994-56, portadora da identidade nº 1.501.718, órgão expedidor SSP/RN, residente e domiciliada na Rua das Algarobas, nº 343, Condomínio Itatiaia, Torre Amarela, Apto. 808, Nova Parnamirim/RN, CEP 59151-907.
As partes acima identificadas resolvem celebrar o presente Contrato de Prestação de Serviços de {programa}, mediante as cláusulas e condições seguintes:

## 1. DO OBJETO
1.1. O presente contrato tem por objeto a prestação de serviços de mentoria educacional e estratégica, na modalidade online, por meio da {programa}, com foco em orientação, desenvolvimento comercial, vendas, campanhas, gestão da rotina, melhoria dos processos da loja e acompanhamento estratégico da CONTRATANTE.
1.2. A {programa} inclui:
a) 01 (uma) mentoria individual de diagnóstico inicial, destinada à análise da loja da CONTRATANTE, definição de prioridades, metas, atividades e direcionamento estratégico para o período contratado;
b) {mentorias_grupo} mentorias em grupo, realizadas 02 (duas) vezes ao mês, durante o período de {prazo};
c) tira-dúvidas semanal realizado às quintas-feiras, conforme calendário, horário e formato definidos pela CONTRATADA;
d) acesso à plataforma digital da CONTRATADA, contendo cursos, aulas e materiais complementares disponibilizados, pelo prazo previsto neste contrato;
e) orientações práticas relacionadas a vendas, campanhas de venda, atendimento, gestão comercial, rotina da loja e desenvolvimento do negócio da CONTRATANTE.
1.3. A {programa} caracteriza-se como obrigação de meio, não havendo garantia de resultados financeiros específicos, volume mínimo de vendas, faturamento, lucro, crescimento, retorno financeiro ou qualquer outro resultado comercial determinado.

## 2. DO PREÇO, PAGAMENTO E PRAZO
2.1. O valor total da {programa} é de {valor_total} ({valor_extenso}).
2.2. O pagamento foi realizado pela CONTRATANTE por meio de {forma_pagamento}, em {data_pagamento}, {parcelas}, considerando-se quitado o valor contratado perante a CONTRATADA, desde que não haja posterior cancelamento, estorno, chargeback, contestação da compra ou bloqueio do pagamento.
2.3. A CONTRATANTE declara estar ciente de que o valor total da {programa} é de {valor_total} ({valor_extenso}), e que o valor final pago no parcelamento poderá ser superior em razão de juros, taxas administrativas, tarifas da operadora do cartão ou encargos da plataforma de pagamento.
2.4. A {programa} terá duração total de {prazo} para as entregas ao vivo, incluindo mentoria individual, mentorias em grupo, tira-dúvidas e demais acompanhamentos previstos neste contrato.
2.5. O acesso à plataforma digital, cursos, aulas gravadas e materiais complementares será disponibilizado pelo prazo de {prazo_plataforma}, contados a partir da liberação do acesso pela CONTRATADA.
2.6. Caso ocorra cancelamento, estorno, chargeback, contestação da compra, bloqueio do pagamento ou qualquer situação que impeça a CONTRATADA de receber ou manter o valor contratado, a CONTRATANTE permanecerá responsável pelo pagamento integral do valor de {valor_total} ({valor_extenso}), devendo regularizar o débito no prazo de até 07 (sete) dias corridos, por meio de PIX ou outro meio indicado pela CONTRATADA.
2.7. A ausência de regularização do pagamento no prazo previsto poderá acarretar a suspensão imediata do acesso da CONTRATANTE à plataforma, mentorias, encontros, tira-dúvidas, materiais e demais entregas contratadas, sem prejuízo da cobrança administrativa ou judicial dos valores devidos.
2.8. Em caso de atraso no pagamento de qualquer valor devido, poderá ser aplicada multa moratória de 2% (dois por cento) sobre o valor em atraso, acrescida de juros de mora de 1% (um por cento) ao mês e correção monetária pelo IPCA, calculados a partir do dia seguinte ao vencimento.
2.9. Eventual cancelamento, estorno, chargeback, contestação da compra ou bloqueio do pagamento não cancela automaticamente o presente contrato nem afasta a obrigação da CONTRATANTE de pagar pelos serviços contratados.

## 3. DO ESCOPO DA PRESTAÇÃO DOS SERVIÇOS
3.1. A {programa} conterá os seguintes entregáveis:
a) onboarding personalizado;
b) roteiro de implementação;
c) 01 (uma) mentoria individual de diagnóstico inicial, a ser agendada em até 10 (dez) dias após a assinatura do contrato ou confirmação do pagamento, com duração aproximada de 01 (uma) hora;
d) {mentorias_grupo} mentorias em grupo, realizadas 02 (duas) vezes ao mês, durante o período de {prazo};
e) acesso à área de membros com aulas online, cursos e materiais complementares, hospedada na plataforma Astro Members ou em outra plataforma indicada pela CONTRATADA, pelo prazo de {prazo_plataforma};
f) canal de tira-dúvidas em grupo via WhatsApp, com encontros ou orientações semanais, 01 (uma) vez por semana, durante o período de {prazo};
g) plano de ação personalizado para o negócio da CONTRATANTE, elaborado a partir da mentoria individual de diagnóstico.
3.2. Os serviços prestados referem-se à análise, orientação, direcionamento estratégico, mentoria educacional, acesso à área de membros e participação em ambiente de networking entre mentoradas.
3.3. Não estão inclusos neste contrato serviços operacionais, tais como gestão de tráfego pago, criação de design, social media, execução de campanhas, atendimento ao cliente, implantação técnica de ferramentas, criação de páginas, automações, edição de vídeos ou quaisquer outros serviços de execução prática, ficando a CONTRATADA isenta de responsabilidade por tais atividades.
3.4. Os encontros em grupo serão comunicados à CONTRATANTE com antecedência, preferencialmente no início de cada mês, conforme calendário definido pela CONTRATADA. As datas poderão sofrer alterações por motivos de saúde, caso fortuito, força maior, agenda da CONTRATADA ou necessidade operacional, sem prejuízo da quantidade de encontros prevista neste contrato.
3.5. Considerando que a {programa} é realizada em formato online, a CONTRATANTE compromete-se a providenciar, às suas expensas, todos os meios necessários para sua participação e execução das atividades propostas, incluindo aparelho adequado, conexão com a internet, acesso ao WhatsApp, e-mail, plataforma digital e eventuais profissionais, ferramentas ou serviços externos que deseje contratar para implementação das estratégias, tais como designer, gestor de tráfego, social media ou equipe interna.
3.6. O canal principal de comunicação será o WhatsApp nº 55 98123-6393, utilizado para envio de informações sobre mentorias, encontros, avisos, orientações, materiais e demais comunicações relacionadas ao programa.
3.7. Caso a CONTRATANTE não possa comparecer à mentoria em grupo, poderá ter acesso à gravação, quando disponibilizada pela CONTRATADA. A mentoria individual poderá ser reagendada uma única vez, desde que a CONTRATANTE comunique sua impossibilidade com antecedência mínima de 24 (vinte e quatro) horas.

## 4. DAS OBRIGAÇÕES DA CONTRATANTE
4.1. A CONTRATANTE compromete-se a fornecer à CONTRATADA todas as informações necessárias para a adequada condução da mentoria, incluindo dados sobre sua loja, equipe, vendas, produtos, campanhas, dificuldades, metas, desafios e demais informações relevantes para a elaboração dos direcionamentos estratégicos.
4.2. A CONTRATANTE compromete-se a participar ativamente da {programa}, comparecendo às mentorias, encontros em grupo, tira-dúvidas e demais atividades propostas, reconhecendo que sua evolução dependerá também de sua presença, comprometimento, execução prática e aplicação das orientações recebidas.
4.3. A CONTRATANTE deverá cumprir, dentro de sua realidade operacional e financeira, os prazos, atividades, tarefas, direcionamentos e planos de ação propostos durante a mentoria.
4.4. A CONTRATANTE compromete-se a manter seus pagamentos em dia, quando houver parcelamento, sob pena de suspensão do acesso aos encontros, tira-dúvidas, plataforma, materiais e demais entregas contratadas até a regularização dos valores devidos.
4.5. A CONTRATANTE deverá providenciar, às suas próprias custas, todos os meios necessários para sua participação na mentoria online, incluindo aparelho adequado, conexão com a internet, acesso ao WhatsApp, e-mail, plataforma digital e demais ferramentas necessárias.
4.6. A CONTRATANTE compromete-se a comunicar à CONTRATADA qualquer alteração relevante em seu negócio que possa impactar o andamento da mentoria, tais como mudança de equipe, alteração de segmento, fechamento temporário da loja, dificuldades financeiras, problemas operacionais, mudança de metas ou impossibilidade de execução das atividades propostas.
4.7. A CONTRATANTE deverá utilizar de forma ética, responsável e exclusiva os conteúdos, aulas, gravações, PDFs, planilhas, roteiros, métodos, ferramentas, materiais, estratégias e demais recursos disponibilizados pela CONTRATADA, exclusivamente para seu próprio aprendizado e aplicação em seu negócio.
4.8. A CONTRATANTE compromete-se a não copiar, reproduzir, compartilhar, vender, distribuir, publicar, adaptar, repassar, gravar ou utilizar os conteúdos da mentoria para criação de cursos, mentorias, consultorias, treinamentos, infoprodutos, e-books, PDFs, grupos pagos, materiais digitais ou qualquer outro produto ou serviço semelhante ou concorrente ao método da CONTRATADA.
4.9. A CONTRATANTE compromete-se a manter sigilo sobre informações estratégicas, comerciais, metodológicas e confidenciais compartilhadas pela CONTRATADA ou por outras participantes da mentoria, não podendo divulgar tais informações a terceiros sem autorização prévia e por escrito.
4.10. A CONTRATANTE garante a veracidade, exatidão e autenticidade dos dados pessoais, comerciais e cadastrais informados à CONTRATADA, responsabilizando-se por eventuais prejuízos decorrentes de informações falsas, incompletas ou desatualizadas.
4.11. A CONTRATANTE compromete-se a agir com respeito, ética e boa-fé nos encontros, grupos, canais de comunicação, plataforma e demais ambientes da mentoria, não praticando condutas ofensivas, desrespeitosas, abusivas ou que prejudiquem a imagem da CONTRATADA, da mentoria ou de outras participantes.
4.12. A CONTRATANTE reconhece que a CONTRATADA não será responsável por falhas de execução, ausência de aplicação das estratégias, falta de comparecimento aos encontros, não cumprimento das atividades propostas, problemas internos da loja, dificuldades de equipe, atendimento, estoque, preço, oferta, mercado, concorrência ou qualquer outro fator que esteja fora da atuação direta da CONTRATADA.

## 5. DAS OBRIGAÇÕES DA CONTRATADA
5.1. Por força do presente instrumento, são obrigações da CONTRATADA:
a) prestar os serviços de mentoria educacional e estratégica com zelo, boa-fé, organização, competência e orientação técnica, conforme o escopo contratado;
b) realizar 01 (uma) mentoria individual de diagnóstico inicial, destinada à análise da loja da CONTRATANTE, levantamento de prioridades, definição de metas, direcionamento estratégico e plano de ação para o período da mentoria;
c) realizar {mentorias_grupo} mentorias em grupo, sendo 02 (duas) por mês, durante o período de {prazo}, conforme calendário, datas e horários definidos pela CONTRATADA;
d) disponibilizar canal de tira-dúvidas em grupo, 01 (uma) vez por semana, durante o período de {prazo}, conforme formato e horário definidos pela CONTRATADA;
e) disponibilizar acesso à plataforma digital da CONTRATADA, com cursos, aulas e materiais complementares relacionados à mentoria, pelo prazo previsto neste contrato;
f) orientar a CONTRATANTE nas atividades relacionadas à mentoria, fornecendo direcionamentos, ferramentas, materiais e estratégias voltadas ao desenvolvimento comercial, campanhas de venda, gestão da rotina, atendimento, posicionamento e melhoria dos processos da loja;
g) apresentar à CONTRATANTE, quando necessário ou solicitado dentro do escopo contratado, informações pertinentes ao andamento da mentoria, atividades propostas e direcionamentos estratégicos;
h) comunicar à CONTRATANTE eventuais ausências de informações, atrasos no envio de dados, falta de participação, ausência de execução das atividades ou quaisquer fatores que possam prejudicar o bom andamento da mentoria;
i) informar à CONTRATANTE sobre datas, horários, links de acesso, alterações de calendário e demais informações necessárias para participação nas mentorias, encontros e atividades do programa;
j) manter sigilo sobre informações estratégicas, comerciais, financeiras e operacionais compartilhadas pela CONTRATANTE no decorrer da mentoria;
k) disponibilizar gravações dos encontros em grupo, quando houver gravação disponível, no canal ou plataforma indicado pela CONTRATADA;
l) conduzir a mentoria como obrigação de meio, sem garantia de resultado financeiro específico, faturamento, lucro, crescimento, número de vendas, recuperação do valor investido ou qualquer outro resultado comercial determinado.
5.2. Dentro do escopo de responsabilidades da CONTRATADA, não estão incluídas atividades operacionais, tais como gestão de tráfego pago, criação de artes, social media, atendimento ao cliente, contratação ou treinamento direto de equipe, implantação técnica de ferramentas, edição de vídeos, criação de páginas, automações ou quaisquer outros serviços não previstos expressamente neste contrato.
5.3. A CONTRATADA não garante retorno financeiro, sucesso comercial, aumento de faturamento, lucro, recuperação do valor investido ou alcance de metas específicas, uma vez que os resultados dependem da execução, comprometimento, estrutura, mercado, equipe, oferta, atendimento e demais fatores internos e externos relacionados ao negócio da CONTRATANTE.
5.4. A mentoria tem finalidade educacional e estratégica, visando fornecer diretrizes, apoio, orientação, método, análise e direcionamento para que a CONTRATANTE desenvolva habilidades, implemente práticas e melhore seus processos comerciais.
5.5. Qualquer resultado, depoimento, estudo de caso, exemplo ou referência apresentada em reuniões, aulas, materiais, comunicações internas ou divulgações da CONTRATADA serve apenas como referência educacional e não deve ser interpretado como promessa ou garantia de resultado individual para a CONTRATANTE.

## 6. DA CONFIDENCIALIDADE, USO DE INFORMAÇÕES E DEPOIMENTOS
6.1. Toda informação estratégica, comercial, financeira, operacional, técnica, metodológica ou administrativa compartilhada entre as partes durante a {programa} será considerada confidencial, devendo ser utilizada exclusivamente para os fins deste contrato.
6.2. As partes comprometem-se a não divulgar, compartilhar, reproduzir, repassar ou utilizar informações confidenciais recebidas da outra parte para finalidade diversa da execução da mentoria, salvo mediante autorização prévia e por escrito.
6.3. A obrigação de confidencialidade também se aplica às informações, experiências, dados, dúvidas, estratégias e relatos compartilhados por outras participantes em encontros, grupos de WhatsApp, aulas, mentorias, tira-dúvidas ou demais ambientes da mentoria.
6.4. A CONTRATANTE compromete-se a não copiar, gravar, reproduzir, distribuir, vender, publicar ou compartilhar aulas, gravações, materiais, PDFs, planilhas, roteiros, métodos, ferramentas, estratégias ou quaisquer conteúdos disponibilizados pela CONTRATADA, salvo para uso próprio e exclusivo em seu negócio.
6.5. A obrigação de confidencialidade permanecerá válida durante a vigência do contrato e pelo prazo de 03 (três) anos após seu término ou rescisão, independentemente do motivo.
6.6. Não serão consideradas confidenciais as informações que:
a) já sejam públicas no momento da divulgação;
b) tornem-se públicas sem violação deste contrato;
c) sejam obtidas legalmente por meio de terceiros, sem obrigação de sigilo;
d) já sejam de conhecimento da parte receptora antes de seu compartilhamento;
e) precisem ser apresentadas por determinação legal, judicial, administrativa ou por solicitação de autoridade competente.
6.7. Em caso de término ou rescisão do contrato, as partes deverão manter sigilo sobre as informações recebidas e, quando aplicável, deixar de utilizar documentos, materiais ou dados confidenciais da outra parte para qualquer finalidade não autorizada.
6.8. A CONTRATADA poderá utilizar depoimentos, mensagens, prints de resultados, relatos de evolução, imagens ou manifestações enviadas pela CONTRATANTE para fins de portfólio, divulgação institucional, redes sociais, apresentações comerciais e estudos de caso, desde que respeitados os limites da boa-fé, da confidencialidade e da proteção de dados sensíveis.
6.9. Informações estratégicas, dados financeiros, relatórios internos, faturamento, números de vendas ou qualquer dado sensível da CONTRATANTE somente poderão ser divulgados de forma identificável mediante autorização da CONTRATANTE ou de forma anonimizada, quando não permitir sua identificação direta.

## 7. DA PROPRIEDADE INTELECTUAL, USO AUTORIZADO E NÃO REPRODUÇÃO DO MÉTODO
7.1. Todos os conteúdos, aulas, gravações, materiais, PDFs, planilhas, roteiros, métodos, estratégias, ferramentas, modelos, técnicas, cursos, imagens, vídeos, marcas, nomes comerciais, identidade visual, playbooks, scripts e demais materiais disponibilizados pela CONTRATADA durante a {programa} são de propriedade intelectual exclusiva da CONTRATADA.
7.2. O presente contrato não implica cessão, transferência, venda, licença comercial, autorização de reprodução, exploração econômica ou qualquer forma de transferência de direitos de propriedade intelectual da CONTRATADA à CONTRATANTE.
7.3. A CONTRATANTE poderá utilizar os conteúdos, métodos, playbooks, scripts, aulas gravadas, materiais, ferramentas, estratégias e orientações fornecidos pela CONTRATADA exclusivamente para seu próprio aprendizado e aplicação prática em sua loja ou negócio.
7.4. É vedada a comercialização, cessão, transferência, sublicenciamento, compartilhamento, reprodução, gravação, publicação, adaptação, distribuição ou qualquer forma de redistribuição dos materiais da CONTRATADA a terceiros, seja de forma gratuita ou onerosa.
7.5. A CONTRATANTE não poderá utilizar os conteúdos, métodos, aulas, roteiros, estratégias, materiais ou ferramentas da CONTRATADA para criar, ministrar, vender ou divulgar cursos, mentorias, consultorias, treinamentos, infoprodutos, e-books, PDFs, grupos pagos, programas, palestras, workshops ou qualquer outro produto ou serviço semelhante ou concorrente.
7.6. A presente cláusula não impede a CONTRATANTE de desenvolver seu próprio negócio, criar seus próprios produtos, participar de projetos, vender seus produtos ou serviços, produzir seus próprios conteúdos ou atuar em sua área profissional, desde que não copie, reproduza, ensine, comercialize ou explore indevidamente o método, os materiais e os conteúdos da CONTRATADA.
7.7. Nenhum direito de propriedade intelectual, industrial, comercial, marca, produto, conteúdo ou material pertencente à CONTRATANTE será transferido à CONTRATADA em razão deste contrato, salvo autorizações específicas previstas neste instrumento, especialmente quanto ao uso de depoimentos, prints, relatos ou resultados para fins de portfólio, divulgação institucional e apresentação comercial, respeitados os limites de confidencialidade e proteção de dados.
7.8. O descumprimento das obrigações previstas nesta cláusula poderá acarretar a suspensão imediata da CONTRATANTE da mentoria, sem direito à devolução de valores, além da cobrança de multa contratual equivalente a 10 (dez) vezes o valor total deste contrato, sem prejuízo de eventual indenização complementar por perdas e danos.

## 8. DA VIGÊNCIA DO CONTRATO
8.1. O presente contrato entrará em vigor na data da confirmação do pagamento ou da assinatura pelas partes, o que ocorrer primeiro.
8.2. A {programa} terá duração de {prazo} para as entregas ao vivo, incluindo mentoria individual, mentorias em grupo, tira-dúvidas e demais acompanhamentos previstos neste contrato.
8.3. O acesso à plataforma digital, cursos, aulas gravadas e materiais complementares será disponibilizado pelo prazo de {prazo_plataforma}, contados a partir da liberação do acesso pela CONTRATADA.
8.4. Findo o prazo de {prazo} das entregas ao vivo, a CONTRATADA não terá obrigação de realizar novos encontros, mentorias, tira-dúvidas ou acompanhamentos, salvo em caso de renovação ou novo acordo entre as partes.
8.5. Eventual renovação da mentoria, prorrogação de prazo, inclusão de novas entregas ou continuidade do acompanhamento dependerá de novo acordo entre as partes, com definição de valores, prazos e condições aplicáveis.
8.6. Ao término da vigência do contrato, seja por encerramento do prazo, rescisão antecipada ou qualquer outro motivo, a CONTRATANTE deverá cessar qualquer uso não autorizado dos materiais, métodos, conteúdos e informações da CONTRATADA, permanecendo válidas as obrigações de confidencialidade, propriedade intelectual, não reprodução dos materiais e proteção dos dados compartilhados.

## 9. DA RESCISÃO, CANCELAMENTO E REEMBOLSO
9.1. A CONTRATANTE poderá solicitar o cancelamento da contratação no prazo de até 07 (sete) dias corridos, contados da assinatura deste contrato, da confirmação do pagamento ou da liberação de acesso à mentoria, o que ocorrer primeiro, desde que a solicitação seja formalizada por escrito à CONTRATADA.
9.2. Caso a solicitação de cancelamento seja realizada dentro do prazo previsto na cláusula 9.1, a CONTRATANTE terá direito ao reembolso dos valores efetivamente pagos, sem acréscimos, bônus, correções ou indenizações adicionais, respeitados os prazos e procedimentos da instituição financeira, operadora de cartão ou plataforma de pagamento utilizada.
9.3. A CONTRATADA terá o prazo de até 07 (sete) dias corridos, contados do recebimento da solicitação formal de cancelamento, para solicitar o estorno ou iniciar o procedimento de reembolso junto à instituição financeira, operadora de cartão ou plataforma de pagamento, não se responsabilizando por eventuais prazos internos dessas instituições para efetivação do crédito à CONTRATANTE.
9.4. Após o prazo de 07 (sete) dias previsto na cláusula 9.1, não haverá reembolso dos valores pagos em caso de desistência, cancelamento ou rescisão antecipada por iniciativa da CONTRATANTE, especialmente quando já tiverem sido disponibilizados acesso à plataforma, aulas, materiais, grupo de WhatsApp, encontros, mentoria individual, diagnóstico, plano de ação ou quaisquer entregas previstas neste contrato.
9.5. A ausência de participação da CONTRATANTE nas mentorias, encontros em grupo, tira-dúvidas, atividades, aulas, plataforma ou demais entregas não gera direito a cancelamento, abatimento, crédito, compensação ou reembolso, considerando que as entregas são disponibilizadas pela CONTRATADA conforme o cronograma e as condições previstas neste contrato.
9.6. Caso a contratação tenha sido realizada por cartão de crédito parcelado, a CONTRATANTE declara estar ciente de que eventual cancelamento, estorno ou reembolso dependerá dos procedimentos e prazos da operadora do cartão, instituição financeira ou plataforma de pagamento, não podendo a CONTRATADA garantir o cancelamento imediato de parcelas futuras diretamente na fatura da CONTRATANTE.
9.7. A solicitação de cancelamento ou rescisão deverá ser feita por escrito, por meio de canal que permita comprovação da comunicação, como e-mail, WhatsApp ou outro canal oficial indicado pela CONTRATADA.
9.8. A CONTRATADA poderá rescindir ou suspender o presente contrato, sem obrigação de reembolso dos valores pagos, nas seguintes hipóteses:
a) descumprimento das obrigações assumidas pela CONTRATANTE neste contrato;
b) inadimplência, cancelamento, estorno, chargeback, contestação da compra ou bloqueio do pagamento;
c) ausência de colaboração, falta de envio de informações necessárias, não participação reiterada nas atividades ou impossibilidade de continuidade por responsabilidade da CONTRATANTE;
d) conduta ofensiva, desrespeitosa, abusiva, agressiva ou inadequada da CONTRATANTE em relação à CONTRATADA, sua equipe ou demais participantes da mentoria;
e) reprodução, compartilhamento, comercialização, cópia, gravação, distribuição ou uso indevido dos materiais, aulas, métodos, conteúdos ou propriedade intelectual da CONTRATADA;
f) uso indevido dos grupos, plataforma, encontros, materiais ou canais de comunicação da mentoria;
g) prática de atos que prejudiquem a imagem, reputação, funcionamento ou segurança da CONTRATADA, da mentoria ou de outras participantes.
9.9. Em caso de rescisão, cancelamento ou encerramento da participação da CONTRATANTE, esta deverá cessar imediatamente o uso não autorizado dos materiais, conteúdos, métodos, aulas, gravações, PDFs, planilhas, roteiros, estratégias e demais recursos disponibilizados pela CONTRATADA, permanecendo válidas as obrigações de confidencialidade, propriedade intelectual, proteção de dados e não reprodução do método.
9.10. A CONTRATANTE compromete-se a não realizar publicações, comentários, acusações falsas, manifestações ofensivas, difamatórias, caluniosas, injuriosas ou vexatórias contra a CONTRATADA, sua equipe, marca, mentoria ou demais participantes, seja em redes sociais, grupos, plataformas digitais, meios de comunicação ou qualquer ambiente público ou privado.
9.11. O disposto na cláusula anterior não impede a CONTRATANTE de exercer direitos legais ou apresentar reclamações legítimas pelos meios adequados, desde que o faça de forma verdadeira, respeitosa e sem exposição indevida, ofensa, ameaça, difamação ou divulgação de informações confidenciais.
9.12. O descumprimento das obrigações previstas nesta cláusula poderá acarretar a cobrança de multa contratual equivalente a 30% (trinta por cento) do valor total do contrato, sem prejuízo de eventual indenização complementar por perdas e danos, quando cabível.

## 10. DAS PENALIDADES
10.1. Em caso de descumprimento de qualquer obrigação prevista neste contrato, quando não houver multa específica prevista para a conduta, a parte infratora poderá ser responsabilizada pelo pagamento de multa compensatória equivalente a 10% (dez por cento) do valor total deste contrato, por infração comprovada, sem prejuízo da apuração de eventuais danos diretos comprovadamente causados à parte prejudicada.
10.2. A aplicação da multa prevista nesta cláusula não impede a parte prejudicada de buscar a reparação de danos diretos comprovados, quando houver prejuízo superior ao valor da multa, desde que demonstrado o nexo entre a conduta da parte infratora e o dano alegado.
10.3. Não serão considerados indenizáveis, para fins deste contrato, prejuízos relacionados à expectativa de lucro, perda de faturamento, perda de oportunidade, ausência de crescimento, não atingimento de metas comerciais, retorno financeiro esperado ou quaisquer resultados que dependam da execução, mercado, equipe, oferta, atendimento ou fatores externos ao controle da CONTRATADA.
10.4. O descumprimento grave de obrigações contratuais poderá ensejar a rescisão imediata do contrato, sem prejuízo da aplicação das penalidades previstas neste instrumento e da cobrança de valores eventualmente devidos.
10.5. Consideram-se descumprimentos graves, entre outros: inadimplência, cancelamento indevido de pagamento, chargeback, violação de confidencialidade, uso indevido de materiais, reprodução não autorizada de conteúdos, cópia do método, conduta ofensiva ou desrespeitosa, compartilhamento indevido de acesso à plataforma ou prática de atos que prejudiquem a imagem, marca, materiais, equipe ou demais participantes da mentoria.
10.6. A parte infratora responderá, quando cabível, pelas despesas necessárias à cobrança administrativa ou judicial, incluindo custas, despesas processuais, despesas extrajudiciais e honorários advocatícios, quando efetivamente incorridos.

## 11. DA PROTEÇÃO DE DADOS PESSOAIS
11.1. As partes comprometem-se a cumprir a legislação vigente sobre proteção de dados pessoais, especialmente a Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais, no que for aplicável à execução deste contrato.
11.2. A CONTRATANTE declara estar ciente de que seus dados pessoais, tais como nome, CPF, endereço, e-mail, telefone, dados de pagamento e demais informações fornecidas, poderão ser tratados pela CONTRATADA exclusivamente para fins de execução deste contrato, comunicação, liberação de acesso à plataforma, participação nos grupos, emissão de cobranças, suporte, organização da mentoria e cumprimento de obrigações legais.
11.3. A CONTRATADA compromete-se a utilizar os dados pessoais da CONTRATANTE apenas para as finalidades relacionadas à prestação dos serviços contratados, adotando medidas razoáveis de segurança para proteção contra acesso não autorizado, uso indevido, perda, alteração ou divulgação indevida.
11.4. A CONTRATADA poderá compartilhar dados estritamente necessários com plataformas de pagamento, plataformas digitais, ferramentas de comunicação, sistemas de gestão, prestadores de serviço ou autoridades competentes, sempre que necessário para a execução do contrato, cumprimento de obrigação legal ou exercício regular de direitos.
11.5. A CONTRATANTE declara ser responsável pela veracidade, exatidão e atualização dos dados pessoais informados à CONTRATADA, responsabilizando-se por eventuais prejuízos decorrentes de dados incorretos, incompletos ou desatualizados.
11.6. A CONTRATADA não comercializará, venderá ou utilizará os dados pessoais da CONTRATANTE para finalidade diversa da execução deste contrato, salvo mediante autorização expressa ou obrigação legal.
11.7. O tratamento de dados pessoais poderá permanecer pelo tempo necessário ao cumprimento deste contrato, obrigações legais, fiscais, regulatórias, exercício regular de direitos ou defesa em processos administrativos, judiciais ou extrajudiciais.

## 12. DAS DISPOSIÇÕES GERAIS
12.1. Este contrato constitui o instrumento que regula os direitos e obrigações das partes em relação à {programa}, podendo ser firmado de forma física ou eletrônica, inclusive por meio de assinatura digital, aceite eletrônico, confirmação por e-mail, WhatsApp, plataforma de pagamento ou outro meio que permita comprovar a concordância da CONTRATANTE com seus termos.
12.2. O pagamento da primeira parcela, o pagamento integral, a confirmação da compra, o aceite eletrônico ou o acesso à plataforma da mentoria poderão ser considerados como ciência e concordância da CONTRATANTE quanto às condições previstas neste contrato, sem prejuízo das regras de cancelamento e reembolso previstas neste instrumento.
12.3. Este contrato obriga as partes e seus sucessores, somente podendo ser alterado por escrito, mediante aditivo contratual, nova proposta aceita pelas partes ou comunicação formal expressamente validada pela CONTRATADA.
12.4. A CONTRATANTE deverá comunicar à CONTRATADA, por escrito, por e-mail, WhatsApp ou outro canal oficial, eventual falha, dificuldade de acesso, dúvida sobre entregas ou problema relacionado à prestação dos serviços, fornecendo as informações necessárias para análise e eventual correção, sempre que possível.
12.5. Nenhuma das partes será responsabilizada por atraso ou impossibilidade de cumprimento de suas obrigações quando decorrente de caso fortuito, força maior, instabilidade de plataformas, problemas técnicos de terceiros, indisponibilidade de internet, problemas de saúde, falhas de sistemas externos ou outros eventos fora do controle razoável das partes.
12.6. O presente contrato constitui o inteiro entendimento entre as partes em relação ao objeto contratado, substituindo propostas, mensagens, negociações, conversas, acordos ou entendimentos anteriores, verbais ou escritos, que tratem do mesmo objeto.
12.7. A tolerância de qualquer das partes quanto ao descumprimento ou cumprimento parcial de obrigações previstas neste contrato será considerada mera liberalidade, não configurando renúncia, perdão, novação ou alteração contratual.
12.8. Em caso de omissão, dúvida ou situação não prevista neste contrato, as partes buscarão solução de comum acordo, com boa-fé, equilíbrio e observância da legislação aplicável.
12.9. Qualquer alteração, exceção, desconto, prorrogação, condição especial ou ajuste não previsto neste contrato somente terá validade se formalizado por escrito ou por meio que permita comprovar a concordância das partes.
12.10. Caso qualquer cláusula ou disposição deste contrato seja considerada inválida, ilegal ou inexequível por autoridade competente, as demais cláusulas permanecerão válidas e eficazes, salvo se a invalidade comprometer de forma essencial o objeto do contrato.
12.11. Em caso de cobrança extrajudicial, judicial ou litígio decorrente deste contrato, a parte inadimplente ou infratora poderá responder pelas despesas necessárias à cobrança, incluindo custas, despesas processuais, despesas extrajudiciais e honorários advocatícios, quando efetivamente incorridos.
12.12. Cada parte será responsável por seus próprios negócios, atividades, obrigações civis, comerciais, trabalhistas, fiscais, previdenciárias, operacionais e financeiras, não havendo entre as partes vínculo societário, empregatício, trabalhista, representação comercial, sociedade, franquia ou responsabilidade recíproca por resultados.
12.13. A CONTRATADA não autoriza a execução, exigência ou cobrança de entregas, serviços, atividades ou responsabilidades que não estejam expressamente previstas neste contrato.

## 13. DA PROVA CONTRATUAL E DO ACEITE
13.1. O presente contrato constitui prova da relação comercial firmada entre as partes, bem como das condições, obrigações, valores, prazos e entregas contratadas.
13.2. As partes reconhecem como válidas as assinaturas físicas ou eletrônicas apostas neste instrumento, bem como o aceite realizado por meio digital, e-mail, mensagem de WhatsApp, plataforma de pagamento ou qualquer outro meio que permita comprovar a contratação e a concordância com as condições aqui previstas.
13.3. A CONTRATANTE declara que leu integralmente o presente contrato, compreendeu suas cláusulas, está ciente de que a prestação dos serviços não garante resultados financeiros específicos e concorda com todas as condições estabelecidas neste instrumento.

## 14. DO FORO E DA ASSINATURA ELETRÔNICA
14.1. Fica eleito o Foro da Comarca de Currais Novos/RN para dirimir quaisquer dúvidas ou controvérsias oriundas da interpretação, execução ou aplicação deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.
14.2. As partes reconhecem e concordam que este contrato, seus aditivos e anexos poderão ser assinados de forma física, eletrônica ou digital, inclusive por meio de computador, smartphone, plataforma de assinatura eletrônica, e-mail, WhatsApp, aceite eletrônico ou plataforma de pagamento, sendo considerados válidos e eficazes para comprovar a concordância das partes com os termos aqui previstos.
14.3. As partes declaram que tiveram prévio conhecimento de todas as cláusulas e condições deste contrato, concordando expressamente com seus termos.
14.4. E, por estarem justas e contratadas, as partes firmam o presente instrumento de forma física ou eletrônica, para que produza seus efeitos jurídicos e legais.
Currais Novos/RN, {cidade_data}.

CONTRATADA: Suzana Zatorre Educacional — CNPJ nº 51.557.598/0001-55
CONTRATANTE: {nome} — {documento_rotulo} nº {documento}
Assinaturas eletrônicas registradas na página de assinaturas e auditoria ao final deste documento.$tpl$),
('trafego', 'Contrato de Gestão de Tráfego Pago — Meta Ads', $tpl$# CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE GESTÃO DE TRÁFEGO PAGO – META ADS
Pelo presente instrumento particular, de um lado:
CONTRATADA: Suzana Zatorre Educacional, pessoa jurídica de direito privado, inscrita no CNPJ nº 51.557.598/0001-55, com sede na Rua Aristides Gomes, nº 670, Bairro Gilberto Pinheiro, na cidade de Currais Novos/RN, neste ato representada por sua representante legal, Suzana Andrade de Oliveira, brasileira, solteira, nascida em 08/01/1977, inscrita no CPF nº 024.547.994-56, portadora da identidade nº 1.501.718, órgão expedidor SSP/RN, residente e domiciliada na Rua das Algarobas, nº 343, Condomínio Itatiaia, Torre Amarela, Apto. 808, Nova Parnamirim/RN, CEP 59151-907.
E, de outro lado:
CONTRATANTE: {nome}, {qualificacao}, residente e domiciliado(a) em {endereco}, endereço eletrônico {email}, telefone {telefone}.
As partes acima identificadas resolvem celebrar o presente Contrato de Prestação de Serviços de Gestão de Tráfego Pago – Meta Ads, mediante as cláusulas e condições seguintes:

## CLÁUSULA 1 – DO OBJETO
1.1. O presente contrato tem por objeto a prestação de serviços profissionais de gestão estratégica de tráfego pago na plataforma Meta Ads, incluindo Facebook e Instagram, compreendendo:
a) planejamento estratégico de campanhas;
b) estruturação e organização da conta de anúncios;
c) criação de campanhas na plataforma Meta;
d) configuração de eventos, públicos, criativos e conversões, quando aplicável;
e) monitoramento e otimização contínua das campanhas;
f) relatórios simplificados de desempenho;
g) {reunioes} com a estrategista em vendas Suzana Zatorre;
h) calendário mensal de campanhas e conteúdos.
1.2. O presente contrato caracteriza-se como obrigação de meio, não havendo garantia de resultados financeiros específicos, volume mínimo de leads, mensagens, vendas, faturamento, retorno sobre investimento ou qualquer outro resultado comercial determinado.

## CLÁUSULA 2 – DOS VALORES E CONDIÇÕES DE PAGAMENTO
2.1. Pela prestação dos serviços de gestão estratégica de tráfego pago pelo período de {prazo}, será devido pela CONTRATANTE à CONTRATADA o valor {valor_periodo} de {valor_total} ({valor_extenso}).
2.2. A CONTRATANTE realizou o pagamento do valor de {valor_pago} ({valor_pago_extenso}), por meio de {forma_pagamento}, {parcelas}, em {data_pagamento}, dando-se plena quitação do valor contratado, desde que não haja posterior cancelamento, estorno, chargeback, contestação da compra ou bloqueio do pagamento.
2.3. Caso ocorra cancelamento, estorno, chargeback, contestação da compra, bloqueio do pagamento ou qualquer situação que impeça a CONTRATADA de receber ou manter o valor contratado, a CONTRATANTE permanecerá responsável pelo pagamento integral do valor de {valor_total} ({valor_extenso}), devendo regularizar o débito no prazo de até 05 (cinco) dias corridos, por meio de PIX ou outro meio indicado pela CONTRATADA.
2.4. A ausência de regularização do pagamento no prazo previsto poderá acarretar a suspensão imediata dos serviços contratados até a regularização do valor devido, sem prejuízo da cobrança administrativa ou judicial dos valores pendentes.
2.5. O valor destinado ao investimento em mídia paga não está incluso neste contrato e deverá ser pago diretamente pela CONTRATANTE à plataforma Meta.
2.6. Eventuais custos adicionais com ferramentas, sistemas, integrações, plataformas, criação de peças, páginas, automações ou serviços de terceiros somente serão de responsabilidade da CONTRATADA se previamente acordados por escrito entre as partes.

## CLÁUSULA 3 – DO PRAZO, RENOVAÇÃO E RESCISÃO
3.1. O presente contrato terá vigência inicial de {prazo}, contados a partir da data de assinatura ou da data de início da prestação dos serviços.
3.2. {clausula_renovacao}
3.3. A contratação é realizada pelo período integral de {prazo}, não podendo a CONTRATANTE cancelar unilateralmente o contrato antes do término da vigência sem a quitação integral dos valores contratados.
3.4. Em caso de desistência, cancelamento ou rescisão antecipada por iniciativa da CONTRATANTE antes do término do prazo de {prazo}, os valores já pagos não serão devolvidos, considerando a reserva de agenda, o planejamento estratégico, a estruturação das campanhas, as reuniões estratégicas e a execução técnica dos serviços.
3.5. A inadimplência superior a 05 (cinco) dias poderá ensejar a suspensão dos serviços até a regularização do pagamento, sem prejuízo da cobrança dos valores devidos.
3.6. A CONTRATADA poderá rescindir ou suspender o contrato em caso de inadimplência, falta de colaboração da CONTRATANTE, ausência de acessos, omissão de informações relevantes, conduta desrespeitosa ou impossibilidade de execução dos serviços por responsabilidade da CONTRATANTE.

## CLÁUSULA 4 – DA CONTA DE ANÚNCIOS
4.1. A conta de anúncios da Meta será mantida sob titularidade da CONTRATANTE.
4.2. A CONTRATANTE deverá conceder à CONTRATADA os acessos necessários para a execução dos serviços contratados, incluindo acesso ao Gerenciador de Negócios, conta de anúncios, página do Facebook, perfil do Instagram e demais ativos necessários.
4.3. A CONTRATADA não se responsabiliza por:
a) suspensões, restrições ou bloqueios de conta;
b) alterações nas políticas da plataforma Meta;
c) problemas com meios de pagamento;
d) instabilidades técnicas da plataforma;
e) reprovação de anúncios;
f) limitações impostas pela Meta ou por terceiros;
g) indisponibilidade de acesso causada pela CONTRATANTE;
h) problemas decorrentes do histórico anterior da conta de anúncios.
4.4. Eventual bloqueio, suspensão, instabilidade ou restrição da conta de anúncios não suspende automaticamente o presente contrato, cabendo às partes avaliar as medidas possíveis para continuidade ou adequação da prestação dos serviços.

## CLÁUSULA 5 – DAS RESPONSABILIDADES DA CONTRATANTE
5.1. Compete à CONTRATANTE:
a) fornecer informações verdadeiras, completas e atualizadas sobre seu negócio, produtos, serviços, ofertas, preços e condições comerciais;
b) disponibilizar os acessos necessários para execução dos serviços;
c) manter meios de pagamento ativos junto à plataforma Meta;
d) realizar o pagamento do investimento em mídia diretamente à plataforma;
e) aprovar materiais, campanhas, textos ou direcionamentos quando solicitado;
f) responder em tempo hábil às solicitações da CONTRATADA;
g) cumprir as políticas comerciais, publicitárias e legais aplicáveis ao seu segmento de atuação;
h) realizar o atendimento dos leads, mensagens ou contatos gerados pelas campanhas.
5.2. A CONTRATANTE declara estar ciente de que o desempenho das campanhas pode ser influenciado por fatores externos à atuação da CONTRATADA, incluindo preço, oferta, atendimento, concorrência, reputação da marca, sazonalidade, estoque, verba disponível, mercado, comportamento do consumidor, qualidade dos criativos, página de destino e tempo de resposta ao cliente.

## CLÁUSULA 6 – DAS RESPONSABILIDADES DA CONTRATADA
6.1. Compete à CONTRATADA:
a) prestar os serviços com zelo, técnica e boa-fé;
b) realizar a gestão estratégica das campanhas contratadas;
c) acompanhar os principais indicadores de desempenho;
d) propor ajustes e otimizações quando necessário;
e) apresentar relatórios simplificados;
f) realizar as reuniões estratégicas previstas neste contrato;
g) manter sigilo sobre informações estratégicas da CONTRATANTE.
6.2. A CONTRATADA não se responsabiliza por falhas de atendimento, ausência de estoque, demora no retorno ao cliente, má execução comercial, alterações de preço, qualidade do produto ou serviço, entrega, logística, reputação da empresa, problemas internos de equipe ou qualquer outro fator que não esteja diretamente relacionado à gestão das campanhas.

## CLÁUSULA 7 – LIMITAÇÃO DE RESPONSABILIDADE
7.1. A CONTRATADA não garante:
a) volume mínimo de leads;
b) quantidade mínima de mensagens;
c) quantidade mínima de vendas;
d) faturamento específico;
e) retorno sobre investimento;
f) crescimento financeiro determinado;
g) aprovação irrestrita de anúncios pela plataforma.
7.2. A responsabilidade da CONTRATADA limita-se ao valor efetivamente pago pela CONTRATANTE neste contrato, excluindo-se lucros cessantes, danos indiretos, perdas comerciais, perda de oportunidade, expectativa de ganho ou qualquer prejuízo decorrente de fatores externos à prestação dos serviços.

## CLÁUSULA 8 – CONFIDENCIALIDADE
8.1. As partes comprometem-se a manter sigilo sobre todas as informações estratégicas, comerciais, financeiras, operacionais, técnicas e mercadológicas compartilhadas em razão deste contrato.
8.2. A obrigação de confidencialidade permanecerá válida mesmo após o término do presente contrato.

## CLÁUSULA 9 – NÃO ALICIAMENTO
9.1. A CONTRATANTE compromete-se a não contratar, aliciar ou tentar contratar colaboradores, prestadores de serviço, parceiros ou membros da equipe da CONTRATADA durante a vigência deste contrato e pelo prazo de 12 (doze) meses após o seu término.
9.2. Em caso de descumprimento desta cláusula, a CONTRATANTE ficará sujeita ao pagamento de multa equivalente a R$ 3.000,00 (três mil reais).

## CLÁUSULA 10 – PROTEÇÃO DE DADOS E LGPD
10.1. As partes comprometem-se a cumprir a Lei nº 13.709/2018 – Lei Geral de Proteção de Dados Pessoais.
10.2. Para fins deste contrato, a CONTRATANTE será considerada controladora dos dados pessoais eventualmente tratados no âmbito das campanhas.
10.3. A CONTRATADA atuará como operadora dos dados, tratando-os exclusivamente para a execução dos serviços contratados.
10.4. A CONTRATADA não utilizará dados da CONTRATANTE para finalidade diversa da execução deste contrato, salvo autorização expressa ou obrigação legal.

## CLÁUSULA 11 – REAJUSTE
11.1. Em caso de renovação do contrato por período superior a 12 (doze) meses, os valores poderão ser reajustados anualmente com base no IPCA acumulado no período ou outro índice que venha a substituí-lo.

## CLÁUSULA 12 – USO DE MARCA
12.1. A CONTRATADA poderá utilizar o nome, marca e resultados públicos da CONTRATANTE para fins de portfólio, apresentação comercial, estudo de caso e divulgação institucional, salvo manifestação expressa em contrário da CONTRATANTE, por escrito.
12.2. Informações estratégicas, dados sensíveis, faturamento, relatórios internos ou dados confidenciais somente poderão ser divulgados mediante autorização expressa da CONTRATANTE.

## CLÁUSULA 13 – DA PROVA CONTRATUAL
13.1. O presente contrato constitui prova da relação comercial firmada entre as partes, bem como das condições, obrigações, valores, prazos e entregas contratadas.
13.2. As partes reconhecem como válidas as assinaturas físicas ou eletrônicas apostas neste instrumento, bem como o aceite realizado por meio digital, e-mail, mensagem de WhatsApp, plataforma de pagamento ou qualquer outro meio que permita comprovar a contratação e a concordância com as condições aqui previstas.

## CLÁUSULA 14 – DO FORO
14.1. Fica eleito o Foro da Comarca de Currais Novos/RN para dirimir quaisquer dúvidas ou controvérsias decorrentes deste contrato, renunciando as partes a qualquer outro, por mais privilegiado que seja.

## DECLARAÇÃO EXPRESSA DE ACEITE
A CONTRATANTE declara que:
a) leu integralmente o presente contrato;
b) compreendeu todas as cláusulas e condições;
c) está ciente de que a prestação de serviços não garante resultados financeiros específicos;
d) está ciente de que o investimento em mídia paga não está incluso no valor deste contrato;
e) concorda com todas as condições estabelecidas neste instrumento.
E, por estarem assim justas e contratadas, as partes assinam o presente instrumento.
Currais Novos/RN, {cidade_data}.

CONTRATADA: Suzana Zatorre Educacional — CNPJ nº 51.557.598/0001-55
CONTRATANTE: {nome} — {documento_rotulo} nº {documento}
Assinaturas eletrônicas registradas na página de assinaturas e auditoria ao final deste documento.$tpl$);
