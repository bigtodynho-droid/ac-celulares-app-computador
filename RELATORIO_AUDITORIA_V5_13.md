# AC Empréstimos & Celulares — V5.13 Auditoria de operações atômicas

## Escopo desta entrega
Preparação de código e migração SQL para evitar que venda/financiamento e baixa de estoque sejam gravados em chamadas independentes. Esta versão NÃO foi publicada e a migração NÃO foi aplicada ao Supabase.

## Mudanças preparadas
- Venda de celular passa a chamar `ac_register_phone_sale_atomic`, que baixa o estoque e grava a venda na mesma transação do Postgres.
- Criação de financiamento passa a chamar `ac_create_phone_finance_atomic`, que grava contrato e parcelas e baixa uma unidade do estoque na mesma transação.
- Os fluxos críticos exigem sessão autenticada e conexão; não enfileiram uma operação financeira crítica offline.
- O sucesso só é mostrado após a resposta da RPC incluir a venda/aparelho ou contrato/parcelas/aparelho.
- Se a RPC falhar, a interface informa que a operação não foi confirmada e recomenda conferir os registros antes de tentar novamente.
- As funções verificam `auth.uid()`, propriedade do cliente/aparelho e estoque disponível. São `SECURITY INVOKER`, respeitando RLS; execução concedida somente a `authenticated`.

## Validações realizadas
- `node --check app.js`: passou.
- `unzip -t`: passou.
- Inspeção read-only do esquema Supabase: confirmou os campos usados e as políticas RLS `authenticated`/`user_id` para `phones`, `sales`, `phone_finances`, `phone_finance_installments` e `clients`.
- Revisão estática da migração: as duas operações são funções PostgreSQL com transação implícita por chamada; erros devem reverter as alterações da mesma chamada.

## Ainda não validado
- A migração SQL não foi executada nem compilada pelo PostgreSQL.
- Não foi feito teste ponta a ponta autenticado no navegador, nem gravação real de venda/financiamento.
- O recebimento de parcelas, pagamento somente de juros e sincronização offline continuam precisando de tratamento transacional/recuperação próprios.
- A tela usa `AC_RPC`; o fluxo exige que a migração seja aplicada antes da publicação do front-end. Sem a função no banco, a operação falha de forma explícita.

## Proteção dos dados
Nenhum dado real foi criado, alterado ou excluído nesta entrega. Nenhuma migração ou publicação foi executada.

## Próxima etapa segura
Revisar a migração, fazer backup e aplicar em ambiente de teste/projeto separado; testar uma venda e um financiamento com dados fictícios; confirmar rollback em falha; somente então planejar publicação.
