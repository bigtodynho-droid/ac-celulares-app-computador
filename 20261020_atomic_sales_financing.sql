-- AC Empréstimos & Celulares — operações atômicas de venda e financiamento
-- Aplicar somente após revisão e backup. Este arquivo NÃO foi executado no Supabase.
-- Requer sessão autenticada; respeita RLS e limita operações ao auth.uid().

create or replace function public.ac_register_phone_sale_atomic(p_sale jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_phone public.phones%rowtype;
  v_sale public.sales%rowtype;
  v_phone_id uuid := (p_sale->>'phone_id')::uuid;
  v_client_id uuid := nullif(p_sale->>'client_id','')::uuid;
  v_qty integer := (p_sale->>'quantity')::integer;
  v_unit_price numeric := (p_sale->>'unit_price')::numeric;
  v_sale_id uuid := coalesce(nullif(p_sale->>'id','')::uuid, gen_random_uuid());
begin
  if v_user is null then raise exception 'É necessário entrar na conta.' using errcode='42501'; end if;
  if v_qty is null or v_qty < 1 or v_unit_price is null or v_unit_price < 0 then
    raise exception 'Quantidade ou preço inválido.' using errcode='22023';
  end if;
  if v_client_id is not null and not exists (
    select 1 from public.clients c where c.id=v_client_id and c.user_id=v_user
  ) then raise exception 'Cliente não encontrado para esta conta.' using errcode='42501'; end if;

  update public.phones p
     set stock = p.stock - v_qty
   where p.id=v_phone_id and p.user_id=v_user and p.stock >= v_qty
   returning p.* into v_phone;
  if not found then raise exception 'Estoque insuficiente ou aparelho não encontrado.' using errcode='P0001'; end if;

  insert into public.sales(id,user_id,client_id,phone_id,quantity,unit_price,total,created_at)
  values(v_sale_id,v_user,v_client_id,v_phone_id,v_qty,v_unit_price,v_qty*v_unit_price,coalesce(nullif(p_sale->>'created_at','')::timestamptz,now()))
  returning * into v_sale;

  return jsonb_build_object('sale',to_jsonb(v_sale),'phone',to_jsonb(v_phone));
end;
$$;

create or replace function public.ac_create_phone_finance_atomic(p_finance jsonb, p_installments jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_phone public.phones%rowtype;
  v_finance public.phone_finances%rowtype;
  v_phone_id uuid := (p_finance->>'phone_id')::uuid;
  v_client_id uuid := (p_finance->>'client_id')::uuid;
  v_finance_id uuid := coalesce(nullif(p_finance->>'id','')::uuid, gen_random_uuid());
  v_rows jsonb;
  v_count integer;
begin
  if v_user is null then raise exception 'É necessário entrar na conta.' using errcode='42501'; end if;
  if jsonb_typeof(p_installments) <> 'array' or jsonb_array_length(p_installments) < 1 or jsonb_array_length(p_installments) > 120 then
    raise exception 'Lista de parcelas inválida.' using errcode='22023';
  end if;
  if coalesce((p_finance->>'price')::numeric,0) <= 0
     or coalesce((p_finance->>'entry')::numeric,-1) < 0
     or coalesce((p_finance->>'entry')::numeric,-1) > (p_finance->>'price')::numeric
     or coalesce((p_finance->>'financed')::numeric,-1) <> ((p_finance->>'price')::numeric-(p_finance->>'entry')::numeric)
     or coalesce((p_finance->>'installments_count')::integer,0) <> jsonb_array_length(p_installments)
     or coalesce((p_finance->>'installments_count')::integer,0) < 1
     or nullif(trim(p_finance->>'model'),'') is null then
    raise exception 'Dados do financiamento inválidos.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_installments) x where coalesce((x->>'number')::integer,0) < 1 or coalesce((x->>'amount')::numeric,0) < 0 or nullif(x->>'due_date','') is null) then
    raise exception 'Uma ou mais parcelas são inválidas.' using errcode='22023';
  end if;
  if not exists(select 1 from public.clients c where c.id=v_client_id and c.user_id=v_user) then
    raise exception 'Cliente não encontrado para esta conta.' using errcode='42501';
  end if;

  update public.phones p set stock=p.stock-1
   where p.id=v_phone_id and p.user_id=v_user and p.stock > 0
   returning p.* into v_phone;
  if not found then raise exception 'Estoque insuficiente ou aparelho não encontrado.' using errcode='P0001'; end if;

  insert into public.phone_finances(
    id,user_id,client_id,phone_id,model,imei,price,entry,financed,monthly_rate,
    installments_count,installment_amount,cost,status,first_due_date,created_at
  ) values (
    v_finance_id,v_user,v_client_id,v_phone_id,trim(p_finance->>'model'),nullif(p_finance->>'imei',''),
    (p_finance->>'price')::numeric,(p_finance->>'entry')::numeric,(p_finance->>'financed')::numeric,
    (p_finance->>'monthly_rate')::numeric,(p_finance->>'installments_count')::integer,
    (p_finance->>'installment_amount')::numeric,(p_finance->>'cost')::numeric,'active',
    (p_finance->>'first_due_date')::date,coalesce(nullif(p_finance->>'created_at','')::timestamptz,now())
  ) returning * into v_finance;

  insert into public.phone_finance_installments(
    id,user_id,phone_finance_id,number,due_date,amount,paid_amount,paid_at,status,created_at
  )
  select coalesce(nullif(x->>'id','')::uuid,gen_random_uuid()),v_user,v_finance_id,
         (x->>'number')::integer,(x->>'due_date')::date,(x->>'amount')::numeric,0,null,'pending',
         coalesce(nullif(x->>'created_at','')::timestamptz,now())
    from jsonb_array_elements(p_installments) x;
  get diagnostics v_count = row_count;
  if v_count <> (jsonb_array_length(p_installments)) then
    raise exception 'Nem todas as parcelas foram criadas.' using errcode='P0001';
  end if;

  select coalesce(jsonb_agg(to_jsonb(i) order by i.number),'[]'::jsonb) into v_rows
    from public.phone_finance_installments i where i.phone_finance_id=v_finance_id and i.user_id=v_user;
  return jsonb_build_object('finance',to_jsonb(v_finance),'installments',v_rows,'phone',to_jsonb(v_phone));
end;
$$;

revoke all on function public.ac_register_phone_sale_atomic(jsonb) from public, anon;
revoke all on function public.ac_create_phone_finance_atomic(jsonb,jsonb) from public, anon;
grant execute on function public.ac_register_phone_sale_atomic(jsonb) to authenticated;
grant execute on function public.ac_create_phone_finance_atomic(jsonb,jsonb) to authenticated;
