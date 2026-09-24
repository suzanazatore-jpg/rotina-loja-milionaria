# Protocolo Desencalhando Estoque em 7 Dias

## Ativação no aplicativo

1. Aplicar a migração `20260924183744_create_stock_protocol.sql` antes de publicar o código.
2. No ADM, criar um curso em rascunho chamado **Protocolo Desencalhando Estoque em 7 Dias**.
3. Em **Configurar Protocolo**, criar as sete aulas em rascunho. O editor traz um checklist e um texto de lembrete inicial para cada dia.
4. No editor normal do curso, gravar e cadastrar os sete vídeos, anexar o PDF de cada aula, revisar preços/margens dos exercícios e publicar as sete aulas.
5. Definir no Protocolo um link HTTPS para a oferta seguinte, ativar a experiência interativa e publicar o curso.
6. Matricular a compradora nesse curso por um plano ou acesso individual. Para que ela veja só o Protocolo, não liberar outros conteúdos do aplicativo nesse plano nem outro curso na mesma conta.
7. Conferir as chaves de push já usadas pelo aplicativo. A nova rotina envia um lembrete às 9h de Brasília, durante os sete dias, apenas se a aluna ativou notificações, mantém matrícula ativa e ainda não concluiu a missão do dia.

## Fluxo da compradora

- Informa o lote, número de peças e meta; a data de início fica registrada no fuso de São Paulo.
- Abre uma aula curta, executa e marca até seis ações, baixa o material e registra peças postadas, convites, conversas e um relato livre.
- Recebe orientação baseada no checklist e nos três números. O texto livre é salvo para leitura da Suzana; não há interpretação automática de texto nessa versão.
- Registra valor e quantidade de peças de cada venda do lote, acompanha a meta, ouve um som opcional ao confirmar e pode desfazer o último lançamento.
- Recebe a missão seguinte no dia seguinte; as futuras só são liberadas na sua data.
- Ao completar o dia 7, vê o balanço, pode informar faturamento mensal e tamanho da equipe e acessa o convite configurado para a mentoria.

## Acompanhamento no ADM

Em **Configurar Protocolo**, a Suzana vê por aluna: lote, missões concluídas, relatos, peças vendidas, valor das vendas informadas, faturamento por faixa e tamanho da equipe. Os valores são autodeclarados; o aplicativo não importa pedidos do caixa ou do comércio eletrônico.

## Limites e dependências

- A migração e o código devem entrar juntos. Antes disso, o Protocolo não é funcional na aplicação publicada.
- O produto só inicia com sete aulas publicadas e com checklist. Vídeos e PDFs são cadastrados no ADM; não foram criados aqui.
- O link da mentoria, o preço, a página de venda, o produto no checkout e sua ligação à matrícula precisam ser configurados pela Suzana.
- A taxa de conversão e o ROI da oferta dependem da campanha de aquisição e do checkout; esta implementação registra a execução da lojista, não receita da venda do low ticket.
