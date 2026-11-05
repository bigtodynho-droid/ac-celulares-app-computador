(() => {
  const C = window.AC_CONFIG || {};
  const hasCloud = !!(C.SUPABASE_URL && C.SUPABASE_PUBLISHABLE_KEY && window.supabase);
  const sb = hasCloud ? window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null;
  const $=id=>document.getElementById(id), content=$('content');
  const state={user:null,session:null,subscription:null,page:'dashboard',online:navigator.onLine,mode:'login',data:{clients:[],loans:[],installments:[],phones:[],other_products:[],sales:[],expenses:[],phone_finances:[],phone_finance_installments:[]},queue:[]};
  const KEY='ac_v4_cloud_cache_v4', QKEY='ac_v4_sync_queue_v4';
  const TABLES=['clients','loans','installments','phones','other_products','sales','expenses','phone_finances','phone_finance_installments'];
  const labels={clients:'Clientes',loans:'Empréstimos',installments:'Parcelas',phones:'Celulares',sales:'Vendas'};
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const date=v=>v?new Date(v).toLocaleDateString('pt-BR'):'—';
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2);
  const num=v=>{if(typeof v==='number')return Number.isFinite(v)?v:0;let s=String(v??'').trim().replace(/\s/g,'').replace(/^R\$/i,'');if(!s)return 0;if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');else if(s.includes(','))s=s.replace(',','.');const n=Number(s);return Number.isFinite(n)?n:0};
  const loadCache=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'null');if(x?.data)state.data=x.data;state.queue=JSON.parse(localStorage.getItem(QKEY)||'[]')}catch{}};
  const saveCache=()=>{localStorage.setItem(KEY,JSON.stringify({data:state.data,at:new Date().toISOString()}));localStorage.setItem(QKEY,JSON.stringify(state.queue))};
  const setStatus=()=>{$('status').textContent=state.online?(state.queue.length?'Online • pendências '+state.queue.length:'Online • nuvem'):'Offline • dados locais';$('status').title=state.online?'Supabase conectado':'Sem internet'};
  const notify=(m,ok=true)=>{$('msg').textContent=m;$('msg').style.color=ok?'#18794e':'#a33'};
  const go=p=>{state.page=p;render();document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.p===p));};
  function empty(v){return v===''||v==null}
  async function currentUser(){ if(!sb)return null; const {data:{user}}=await sb.auth.getUser(); return user||null; }
  async function cloudLoad(){
    if(!sb||!state.user||!state.online)return;
    const results=await Promise.all(TABLES.map(t=>{
      const q=sb.from(t).select('*').eq('user_id',state.user.id);
      return t==='installments' ? q.order('due_date',{ascending:true}) : q.order('created_at',{ascending:false});
    }));
    for(let i=0;i<TABLES.length;i++){if(results[i].error) throw results[i].error; state.data[TABLES[i]]=results[i].data||[]}
    saveCache();
  }
  function enqueue(op,table,rowOrId){state.queue.push({id:uid(),op,table,payload:rowOrId});saveCache();}
  async function cloudUpsert(table,row){if(!sb||!state.user||!state.online){enqueue('upsert',table,row);return row} const {data,error}=await sb.from(table).upsert(row).select().single();if(error)throw error;return data||row}
  async function cloudDelete(table,id){if(!sb||!state.user||!state.online){enqueue('delete',table,{id});return} const {error}=await sb.from(table).delete().eq('id',id).eq('user_id',state.user.id);if(error)throw error}
  async function flush(){if(!sb||!state.user||!state.online||!state.queue.length)return; const pending=[...state.queue]; for(const q of pending){try{if(q.op==='upsert')await sb.from(q.table).upsert(q.payload);else await sb.from(q.table).delete().eq('id',q.payload.id).eq('user_id',state.user.id);state.queue=state.queue.filter(x=>x.id!==q.id);saveCache()}catch(e){console.warn('sync',e);break}} setStatus(); if(!state.queue.length) await cloudLoad();}
  async function mutate(table,row){
    state.data[table]=[row,...state.data[table].filter(x=>x.id!==row.id)];saveCache();setStatus();
    try{const saved=await cloudUpsert(table,row);state.data[table]=[saved,...state.data[table].filter(x=>x.id!==saved.id)];saveCache();return saved}catch(e){enqueue('upsert',table,row);return row}
  }
  async function remove(table,id){state.data[table]=state.data[table].filter(x=>x.id!==id);saveCache();try{await cloudDelete(table,id)}catch(e){enqueue('delete',table,{id})}render()}
  async function authLogin(){
    const email=$('email').value.trim(), pass=$('pass').value; if(!email||!pass)return notify('Informe e-mail e senha.',false);
    if(!sb)return demoLogin(email,pass);
    $('enter').disabled=true;notify('Entrando...');
    const {data,error}=await sb.auth.signInWithPassword({email,password:pass});$('enter').disabled=false;
    if(error)return notify(error.message,false); state.session=data.session;state.user=data.user; await enterApp();
  }
  async function authSignup(){
    const email=$('email').value.trim(),pass=$('pass').value,name=$('name').value.trim();if(!email||!pass)return notify('Informe e-mail e senha.',false);if(pass.length<6)return notify('A senha deve ter pelo menos 6 caracteres.',false);
    if(!sb)return notify('Modo demo não permite novos usuários.',false);$('signup').disabled=true;const {data,error}=await sb.auth.signUp({email,password:pass,options:{data:{full_name:name}}});$('signup').disabled=false;if(error)return notify(error.message,false);if(data.session){state.session=data.session;state.user=data.user;await enterApp()}else notify('Cadastro criado. Verifique seu e-mail para confirmar o acesso.');
  }
  async function resetPassword(){const email=$('email').value.trim();if(!email)return notify('Digite seu e-mail primeiro.',false);if(!sb)return notify('Recuperação disponível apenas no modo nuvem.',false);const redirectTo=location.origin+location.pathname+'?recovery=1';const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo});if(error)return notify('Não foi possível enviar o link: '+error.message,false);notify('Enviamos o link. Abra-o neste mesmo navegador para definir uma nova senha.');}
  function showRecoveryForm(){if(document.getElementById('acRecoveryDialog'))return;const d=document.createElement('div');d.id='acRecoveryDialog';d.style.cssText='position:fixed;inset:0;z-index:99999;background:#050b16dd;display:grid;place-items:center;padding:20px';d.innerHTML=`<div style="width:min(100%,420px);background:#fff;color:#142033;border-radius:18px;padding:24px;box-shadow:0 20px 60px #0005"><h2 style="margin:0 0 8px">Criar nova senha</h2><p>Digite sua nova senha para recuperar o acesso.</p><input id="acNewPass" type="password" autocomplete="new-password" minlength="6" placeholder="Nova senha (mínimo 6 caracteres)" style="box-sizing:border-box;width:100%;padding:12px;margin:8px 0;border:1px solid #ccd2dc;border-radius:8px"><input id="acNewPass2" type="password" autocomplete="new-password" minlength="6" placeholder="Repita a nova senha" style="box-sizing:border-box;width:100%;padding:12px;margin:8px 0;border:1px solid #ccd2dc;border-radius:8px"><small id="acRecoveryMsg" style="display:block;margin:8px 0;color:#a33"></small><button id="acSavePass" style="width:100%;padding:12px;border:0;border-radius:8px;background:#c6a45a;color:#101827;font-weight:700">Salvar nova senha</button></div>`;document.body.appendChild(d);d.querySelector('#acSavePass').onclick=async()=>{const a=d.querySelector('#acNewPass').value,b=d.querySelector('#acNewPass2').value,m=d.querySelector('#acRecoveryMsg'),btn=d.querySelector('#acSavePass');if(a.length<6){m.textContent='A senha precisa ter pelo menos 6 caracteres.';return}if(a!==b){m.textContent='As senhas não coincidem.';return}btn.disabled=true;m.style.color='#555';m.textContent='Salvando...';const {error}=await sb.auth.updateUser({password:a});btn.disabled=false;if(error){m.style.color='#a33';m.textContent='Não foi possível alterar a senha: '+error.message;return}m.style.color='#18794e';m.textContent='Senha alterada! Você já pode entrar com a nova senha.';setTimeout(()=>{d.remove();history.replaceState({},document.title,location.pathname);},1800)};}
  if(sb){sb.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'||(new URLSearchParams(location.search).has('recovery')&&session)){setTimeout(showRecoveryForm,0)}});if(new URLSearchParams(location.search).has('recovery')){sb.auth.getSession().then(({data})=>{if(data.session)showRecoveryForm()})}}
  function demoLogin(e,p){if(e==='admin@ac.local'&&p==='1234'){state.user={id:'demo',email:e};state.session={};enterApp()}else notify('Acesso demo: admin@ac.local / 1234',false)}
  async function migrateLegacyV54(){
    if(!sb||!state.user||state.user.id==='demo'||!state.online)return;
    const flag='ac_v54_legacy_migrated_'+state.user.id;if(localStorage.getItem(flag))return;
    try{
      const oldEx=JSON.parse(localStorage.getItem('ac_v5_4_expenses')||'[]');
      for(const x of oldEx){if(!x?.description)continue;const row={id:x.id&&/^[0-9a-f-]{36}$/i.test(x.id)?x.id:uid(),user_id:state.user.id,description:x.description,category:x.category||'Operacional',amount:num(x.amount),expense_date:x.expense_date||x.date||new Date().toISOString().slice(0,10),created_at:x.created_at||new Date().toISOString()};await sb.from('expenses').upsert(row)}
      const oldLimits=JSON.parse(localStorage.getItem('ac_v5_4_client_limits')||'{}');
      for(const [id,limit] of Object.entries(oldLimits)){const c=state.data.clients.find(x=>x.id===id);if(c&&num(limit)>0){const row={...c,credit_limit:num(limit),updated_at:new Date().toISOString()};const {data,error}=await sb.from('clients').upsert(row).select().single();if(!error&&data)state.data.clients=[data,...state.data.clients.filter(x=>x.id!==id)]}}
      const oldPf=JSON.parse(localStorage.getItem('ac_v5_1_phone_finance_final')||'[]');
      for(const f of oldPf){if(!f?.clientId||!f?.model)continue;const exists=state.data.phone_finances.find(x=>x.legacy_id===f.id);if(exists)continue;const fid=uid();const finance={id:fid,user_id:state.user.id,client_id:f.clientId,phone_id:f.phoneId||null,model:f.model,imei:f.imei||null,price:num(f.price),entry:num(f.entry),financed:num(f.financed),monthly_rate:num(f.rate),installments_count:num(f.n)||1,installment_amount:num(f.installment),cost:num(f.cost),status:f.status==='paid'?'paid':'active',first_due_date:f.installments?.[0]?.dueDate||new Date().toISOString().slice(0,10),created_at:f.createdAt||new Date().toISOString()};
        const {error}=await sb.from('phone_finances').insert(finance);if(error)throw error;
        for(const i of (f.installments||[])){const row={id:uid(),user_id:state.user.id,phone_finance_id:fid,number:num(i.number),due_date:i.dueDate,amount:num(i.amount),paid_amount:num(i.paidAmount),paid_at:i.paidAt||null,status:i.status==='paid'?'paid':i.status==='partial'?'partial':'pending',created_at:f.createdAt||new Date().toISOString()};await sb.from('phone_finance_installments').insert(row)}
      }
      localStorage.setItem(flag,'1');await cloudLoad();
    }catch(e){console.warn('legacy migration',e)}
  }
  async function enterApp(){loadCache();$('login').classList.add('hidden');$('app').classList.remove('hidden');setStatus();if(state.online&&sb&&state.user?.id!=='demo'){try{await cloudLoad();await migrateLegacyV54();await flush();await loadSubscription()}catch(e){console.warn(e);notify('Não foi possível sincronizar agora. Usando cache local.',false)}}render()}
  async function loadSubscription(){if(!sb||!state.user||state.user.id==='demo'||!state.online){state.subscription=null;return}const {data,error}=await sb.from('user_subscriptions').select('plan_code,status,price_brl,started_at,expires_at').eq('user_id',state.user.id).maybeSingle();if(error)throw error;state.subscription=data||{plan_code:'free',status:'free',price_brl:33,expires_at:null};}
  async function logout(){if(sb)await sb.auth.signOut();state.user=null;state.session=null;$('app').classList.add('hidden');$('login').classList.remove('hidden');}
  function render(){setStatus(); if(state.page==='dashboard')return dashboard(); if(state.page==='clients')return clients();if(state.page==='loans')return loans();if(state.page==='installments')return receivables();if(state.page==='phones')return phones();if(state.page==='products')return otherProducts();if(state.page==='sales')return sales();if(state.page==='phonefinance')return phoneFinancePage();if(state.page==='reports')return reports();if(state.page==='expenses')return expenses();return settings();}
  function phoneFinancePage(){
    const finances=state.data.phone_finances||[], ins=state.data.phone_finance_installments||[];
    shell('Financiamento de celulares','Venda parcelada com juros, vencimentos e recebimentos',`<div class="panel"><div class="panel-title"><h3>💳 Novo financiamento</h3><span>Gravação transacional • requer internet</span></div><div class="form"><select id="pfClient" required><option value="">Selecione o cliente</option>${state.data.clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><select id="pfPhone" required onchange="selectPhoneForFinanceV51()"><option value="">Selecione o celular do estoque</option>${state.data.phones.filter(p=>num(p.stock)>0).map(p=>`<option value="${p.id}">${esc((p.brand||'')+' '+(p.model||''))} • ${money(p.sale_price)} • estoque ${p.stock}${p.imei?' • IMEI '+esc(p.imei):''}</option>`).join('')}</select><input id="pfModel" placeholder="Modelo do celular" readonly><input id="pfImei" placeholder="IMEI" readonly><input id="pfPrice" type="number" step="0.01" placeholder="Valor do celular"><input id="pfEntry" type="number" step="0.01" placeholder="Entrada"><input id="pfRate" type="number" step="0.01" placeholder="Juros mensal %"><input id="pfN" type="number" min="1" placeholder="Nº de parcelas"><label>Primeiro vencimento</label><input id="pfDue" type="date" required><button onclick="createPhoneFinanceV51()">GERAR FINANCIAMENTO</button></div><div id="pfResult" class="item"></div></div><div class="panel"><div class="panel-title"><h3>📱 Financiamentos cadastrados</h3><button onclick="phoneFinancePage()">Atualizar</button></div><div id="phoneFinanceContracts"></div></div><div class="panel"><div class="panel-title"><h3>💰 Parcelas e recebimentos</h3><span>Receba parcelas e acompanhe vencidas</span></div><div id="phoneFinanceList"></div></div>`);
    const d=document.getElementById('pfDue'); if(d&&!d.value)d.value=new Date().toISOString().slice(0,10);
    const c=document.getElementById('phoneFinanceContracts'), l=document.getElementById('phoneFinanceList');
    c.innerHTML=finances.map(f=>{const fs=ins.filter(i=>i.phone_finance_id===f.id),paid=fs.reduce((a,x)=>a+num(x.paid_amount),0),total=fs.reduce((a,x)=>a+num(x.amount),0),client=state.data.clients.find(x=>x.id===f.client_id)||{};return `<div class="item"><b>📱 ${esc(f.model)}</b> — ${esc(client.name||'Cliente')}<br><small>${f.installments_count} parcelas · juros ${num(f.monthly_rate)}% a.m. · financiado ${money(f.financed)}</small><br>Total ${money(num(f.entry)+total)} · Recebido ${money(num(f.entry)+paid)} · Saldo ${money(Math.max(0,total-paid))}<br><button class="mini" type="button" onclick="AC_SHARE_PHONE_FINANCE('${f.id}')">WhatsApp · detalhes</button></div>`}).join('')||'<div class="empty">Nenhum financiamento cadastrado.</div>';
    l.innerHTML=ins.map(x=>{const f=finances.find(y=>y.id===x.phone_finance_id),client=state.data.clients.find(y=>y.id===f?.client_id)||{},saldo=Math.max(0,num(x.amount)-num(x.paid_amount)),over=x.status!=='paid'&&x.due_date<new Date().toISOString().slice(0,10);return `<div class="item"><b>${esc(client.name||'Cliente')}</b> — ${esc(f?.model||'Celular')}<br>Parcela ${x.number}/${f?.installments_count||'?'} · Vencimento ${date(x.due_date)}<br>Valor ${money(x.amount)} · Recebido ${money(x.paid_amount)} · Saldo ${money(saldo)} ${x.status==='paid'?'🟢 PAGA':over?'🔴 VENCIDA':'🟡 PENDENTE'} ${x.status!=='paid'?`<button class="mini" onclick="receivePhoneFinanceV51('${f.id}','${x.id}',${saldo})">Receber</button>`:''}</div>`}).join('')||'<div class="empty">Nenhuma parcela de celular.</div>';
  }
  function globalSearch(q){q=(q||'').trim().toLowerCase();if(!q)return;const cs=state.data.clients.filter(c=>[c.name,c.cpf,c.whatsapp].some(v=>String(v||'').toLowerCase().includes(q)));const ls=state.data.loans.filter(l=>{const c=state.data.clients.find(x=>x.id===l.client_id);return String(c?.name||'').toLowerCase().includes(q)||String(l.id).toLowerCase().includes(q)});const is=state.data.installments.filter(i=>{const l=state.data.loans.find(x=>x.id===i.loan_id),c=state.data.clients.find(x=>x.id===l?.client_id);return String(c?.name||'').toLowerCase().includes(q)});shell('Busca rápida','Clientes, contratos e parcelas encontrados',`<div class="panel table"><table><thead><tr><th>Tipo</th><th>Cliente</th><th>Detalhe</th><th>Valor</th><th>Status</th></tr></thead><tbody>${cs.map(c=>`<tr><td>Cliente</td><td>${esc(c.name)}</td><td>${esc(c.whatsapp||c.cpf||'Cadastro')}</td><td>—</td><td>Ativo</td></tr>`).join('')}${ls.map(l=>{const c=state.data.clients.find(x=>x.id===l.client_id)||{};return `<tr><td>Empréstimo</td><td>${esc(c.name)}</td><td>${l.installments_count} parcela(s)</td><td>${money(l.principal)}</td><td>${esc(l.status)}</td></tr>`}).join('')}${is.map(i=>{const l=state.data.loans.find(x=>x.id===i.loan_id)||{},c=state.data.clients.find(x=>x.id===l.client_id)||{};return `<tr><td>Parcela</td><td>${esc(c.name)}</td><td>#${i.number} • ${date(i.due_date)}</td><td>${money(Math.max(0,num(i.amount)-num(i.paid_amount)))}</td><td>${installmentStatus(i)}</td></tr>`}).join('')||'<tr><td colspan="5">Nenhum resultado.</td></tr>'}</tbody></table></div>`);state.page='search'}
  function planBanner(){if(!state.user||state.user.id==='demo')return '';const admin=state.user.id==='5ff2a45c-4941-4475-8187-20a3a1bd9ab7'||state.user.id==='be65d7d1-89de-4691-8113-24636663c403';if(admin)return `<section class="panel ac-plan-banner"><div><strong>Plano administrador</strong><p>Acesso administrativo • limites comerciais não aplicados.</p></div></section>`;const sub=state.subscription||{},paid=sub.status==='active'&&sub.expires_at&&new Date(sub.expires_at)>new Date();const loanCount=state.data.loans.filter(x=>x.status!=='cancelled').length,phoneCount=state.data.phones.length;const loanLeft=Math.max(0,3-loanCount),phoneLeft=Math.max(0,3-phoneCount);const status=paid?`Mensal ativo até ${date(sub.expires_at)}`:'Plano gratuito';return `<section class="panel ac-plan-banner" style="border:1px solid #d7b96d;background:linear-gradient(135deg,#fffdf7,#ffffff);padding:18px;border-radius:14px"><div class="ac-plan-top" style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><small>SEU PLANO</small><strong>${status}</strong></div><span class="ac-plan-price" style="font-weight:800;color:#8a6b20">${paid?'ATIVO':'R$ 33 / 30 dias'}</span></div><div class="ac-plan-usage" style="display:grid;gap:8px;margin-top:14px"><div><span>Contratos de empréstimo</span><b>${paid?loanCount+' cadastrados':loanCount+' de 3 • '+loanLeft+' restante(s)'}</b></div><div class="ac-plan-track" style="height:7px;background:#e8e8e8;border-radius:10px;overflow:hidden"><i style="display:block;height:100%;background:#c5a04d;width:${paid?100:Math.min(100,loanCount/3*100)}%"></i></div><div><span>Celulares no estoque</span><b>${paid?phoneCount+' cadastrados':phoneCount+' de 3 • '+phoneLeft+' restante(s)'}</b></div><div class="ac-plan-track" style="height:7px;background:#e8e8e8;border-radius:10px;overflow:hidden"><i style="display:block;height:100%;background:#c5a04d;width:${paid?100:Math.min(100,phoneCount/3*100)}%"></i></div></div><p class="muted">A assinatura ainda não pode ser comprada por aqui. O pagamento não está ativado.</p></section>`}
  function shell(title,sub,body){content.innerHTML=`${planBanner()}<div class="head"><h2>${title}</h2><p>${sub}</p></div>${body}`}
  const getExpenses=()=>state.data.expenses||[];
  const clientLimit=id=>num((state.data.clients.find(c=>c.id===id)||{}).credit_limit);
  const loanOpenForClient=id=>state.data.loans.filter(l=>l.client_id===id&&(l.status==='active'||l.status==='paid')).reduce((s,l)=>s+state.data.installments.filter(i=>i.loan_id===l.id&&i.status!=='paid'&&i.status!=='interest_only').reduce((a,i)=>a+Math.max(0,num(i.amount)-num(i.paid_amount)),0),0);
  const pfForClient=id=>(state.data.phone_finances||[]).filter(f=>f.client_id===id&&f.status==='active').reduce((s,f)=>s+(state.data.phone_finance_installments||[]).filter(i=>i.phone_finance_id===f.id&&i.status!=='paid').reduce((a,i)=>a+Math.max(0,num(i.amount)-num(i.paid_amount)),0),0);
  function clientCreditInfo(id){const c=state.data.clients.find(x=>x.id===id)||{},lim=clientLimit(id),used=loanOpenForClient(id)+pfForClient(id);return {lim,used,available:Math.max(0,lim-used),blocked:!!c.credit_blocked}}
  function whatsapp(phone,msg){const n=String(phone||'').replace(/\D/g,'');if(!n)return alert('Cliente sem WhatsApp cadastrado.');window.open('https://wa.me/55'+n+'?text='+encodeURIComponent(msg),'_blank')}
  function shareLoanContractV1(loanId){
    const l=state.data.loans.find(x=>String(x.id)===String(loanId));if(!l)return alert('Contrato de empréstimo não encontrado.');
    const c=state.data.clients.find(x=>x.id===l.client_id)||{},ins=state.data.installments.filter(x=>x.loan_id===l.id).sort((x,y)=>num(x.number)-num(y.number));
    const interest=l.interest_type==='fixed'?`${money(l.interest_value)} fixos (${l.interest_collection==='per_installment'?'por parcela':'sobre o total'})`:`${num(l.monthly_rate).toLocaleString('pt-BR')}% (${l.interest_collection==='per_installment'?'por parcela':'sobre o total'})`;
    const total=num(l.installment_amount)*num(l.installments_count),status=l.status==='active'?'Ativo':l.status==='paid'?'Quitado':l.status==='cancelled'?'Cancelado':'Simulação';
    const schedule=ins.length?ins.map(i=>`Parcela ${i.number}: ${money(i.amount)} — vencimento ${date(i.due_date)}${i.status==='paid'?' (paga)':` — saldo ${money(Math.max(0,num(i.amount)-num(i.paid_amount)))}`}`).join('\n'):`Primeiro vencimento previsto: ${date(l.first_due_date)}. As parcelas ainda não estão registradas.`;
    const msg=`AC EMPRÉSTIMOS & CELULARES\nDETALHES DO CONTRATO DE EMPRÉSTIMO\n\nCliente: ${c.name||'Não informado'}\nContrato: ${String(l.id).slice(0,8)}\nStatus: ${status}\nValor principal: ${money(l.principal)}\nJuros: ${interest}\nQuantidade de parcelas: ${num(l.installments_count)}\nValor por parcela: ${money(l.installment_amount)}\nTotal previsto: ${money(total)}\n\nVENCIMENTOS\n${schedule}${l.notes?`\n\nObservações: ${l.notes}`:''}\n\nMensagem com os dados registrados no sistema. Confira as condições e o contrato assinado, se houver.`;
    whatsapp(c.whatsapp,msg);
  }
  function sharePhoneFinanceContractV1(financeId){
    const f=(state.data.phone_finances||[]).find(x=>String(x.id)===String(financeId));if(!f)return alert('Financiamento de celular não encontrado.');
    const c=state.data.clients.find(x=>x.id===f.client_id)||{},ins=(state.data.phone_finance_installments||[]).filter(x=>x.phone_finance_id===f.id).sort((x,y)=>num(x.number)-num(y.number));
    const total= num(f.entry)+ins.reduce((sum,i)=>sum+num(i.amount),0),received=num(f.entry)+ins.reduce((sum,i)=>sum+num(i.paid_amount),0);
    const schedule=ins.length?ins.map(i=>`Parcela ${i.number}/${f.installments_count}: ${money(i.amount)} — vencimento ${date(i.due_date)}${i.status==='paid'?' (paga)':` — saldo ${money(Math.max(0,num(i.amount)-num(i.paid_amount)))}`}`).join('\n'):`Primeiro vencimento previsto: ${date(f.first_due_date)}.`;
    const msg=`AC EMPRÉSTIMOS & CELULARES\nDETALHES DO FINANCIAMENTO DE CELULAR\n\nCliente: ${c.name||'Não informado'}\nContrato: ${String(f.id).slice(0,8)}\nAparelho: ${f.model||'Não informado'}${f.imei?`\nIMEI: ${f.imei}`:''}\nStatus: ${f.status==='paid'?'Quitado':f.status==='active'?'Ativo':String(f.status||'Não informado')}\nValor do aparelho: ${money(f.price)}\nEntrada: ${money(f.entry)}\nSaldo financiado: ${money(f.financed)}\nJuros: ${num(f.monthly_rate).toLocaleString('pt-BR')}% ao mês\nQuantidade de parcelas: ${num(f.installments_count)}\nValor previsto por parcela: ${money(f.installment_amount)}\nTotal previsto com entrada: ${money(total)}\nTotal recebido (incluindo entrada): ${money(received)}\nSaldo das parcelas: ${money(Math.max(0,total-received))}\n\nVENCIMENTOS\n${schedule}\n\nMensagem com os dados registrados no sistema. Confira as condições e o contrato assinado, se houver.`;
    whatsapp(c.whatsapp,msg);
  }
  window.shareLoanContractV1=shareLoanContractV1;
  window.AC_SHARE_PHONE_FINANCE=sharePhoneFinanceContractV1;
  function printReceipt(title,body){const w=window.open('','_blank','width=700,height=800');if(!w)return;w.document.write('<html><head><title>'+esc(title)+'</title><style>body{font-family:Arial;padding:30px;color:#172033}h1{color:#0b1630}hr{border:0;border-top:1px solid #ddd;margin:20px 0}.box{padding:18px;border:1px solid #ddd;border-radius:12px}</style></head><body><h1>AC Empréstimos & Celulares</h1><div class="box">'+body+'</div><p>Emitido em '+new Date().toLocaleString('pt-BR')+'</p><script>window.print()<\\/script></body></html>');w.document.close()}
  function expenses(){const ex=getExpenses();const total=ex.reduce((s,x)=>s+num(x.amount),0);shell('Despesas','Controle de custos para chegar ao lucro líquido da operação',`<div class="panel"><form class="form" onsubmit="addExpense(event)"><input id="exdesc" placeholder="Descrição" required><select id="excat"><option>Operacional</option><option>Celulares</option><option>Marketing</option><option>Taxas</option><option>Transporte</option><option>Outros</option></select><input id="examount" type="number" step="0.01" min="0" placeholder="Valor" required><input id="exdate" type="date" required><button>Adicionar despesa</button></form></div><div class="cards"><div class="card"><small>Total de despesas</small><strong>${money(total)}</strong></div><div class="card"><small>Despesas com celulares</small><strong>${money(ex.filter(x=>x.category==='Celulares').reduce((s,x)=>s+num(x.amount),0))}</strong></div></div><div class="panel table"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th></th></tr></thead><tbody>${ex.map(x=>`<tr><td>${date(x.expense_date)}</td><td>${esc(x.description)}</td><td>${esc(x.category)}</td><td>${money(x.amount)}</td><td><button class="mini" onclick="deleteExpense('${x.id}')">Excluir</button></td></tr>`).join('')||'<tr><td colspan="5">Nenhuma despesa.</td></tr>'}</tbody></table></div>`)}
  async function addExpense(e){e.preventDefault();const row={id:uid(),user_id:state.user.id,description:$('exdesc').value.trim(),category:$('excat').value,amount:num($('examount').value),expense_date:$('exdate').value||new Date().toISOString().slice(0,10),created_at:new Date().toISOString()};await mutate('expenses',row);e.target.reset();render()}
  async function deleteExpense(id){await remove('expenses',id)}
  function deleteExpense(id){putExpenses(getExpenses().filter(x=>x.id!==id));render()}
  function receivables(){
    const d=state.data,today=new Date().toISOString().slice(0,10),rows=[];
    d.installments.forEach(i=>{if(i.status==='paid'||i.status==='interest_only')return;const l=d.loans.find(x=>x.id===i.loan_id)||{},c=d.clients.find(x=>x.id===l.client_id)||{};rows.push({type:'loan',date:i.due_date,name:c.name||'Cliente',phone:c.whatsapp,balance:Math.max(0,num(i.amount)-num(i.paid_amount)),i});});
    (d.phone_finance_installments||[]).forEach(i=>{if(i.status==='paid')return;const f=(d.phone_finances||[]).find(x=>x.id===i.phone_finance_id)||{},c=d.clients.find(x=>x.id===f.client_id)||{};rows.push({type:'phone',date:i.due_date,name:c.name||'Cliente',phone:c.whatsapp,balance:Math.max(0,num(i.amount)-num(i.paid_amount)),i,f});});
    rows.sort((a,b)=>a.date.localeCompare(b.date)); const dueToday=rows.filter(x=>x.date===today),overdue=rows.filter(x=>x.date<today),next=rows.filter(x=>x.date>today).slice(0,14);
    const total=a=>a.reduce((s,x)=>s+num(x.balance),0);
    const cal=next.slice(0,14).map(r=>`<div class="item"><b>${date(r.date)}</b><br>${esc(r.name)} · ${r.type==='phone'?'📱 '+esc(r.f.model):'💰 Empréstimo'}<br><strong>${money(r.balance)}</strong></div>`).join('')||'<div class="empty">Nenhum vencimento nos próximos dias.</div>';
    const rowHtml=r=>`<tr><td>${date(r.date)}</td><td>${esc(r.name)}</td><td>${r.type==='phone'?'📱 '+esc(r.f.model):'💰 Empréstimo'}</td><td>${money(r.balance)}</td><td>${r.date<today?'🔴 Atrasada':r.date===today?'🟡 Hoje':'🟢 A receber'}</td><td><button class="mini" onclick="${r.type==='phone'?`receivePhoneFinanceV51('${r.f.id}','${r.i.id}',${r.balance.toFixed(2)})`:`payInstallment('${r.i.id}')`}">Receber</button> <button class="mini" onclick="sendCollection('${esc(r.phone||'')}','${esc(r.name)}','${r.balance.toFixed(2)}','${r.date}')">WhatsApp</button></td></tr>`;
    const mobileRows=rows.map(r=>`<article class="receivable-mobile-card"><div class="receivable-mobile-top"><strong>${esc(r.name)}</strong><span>${r.date<today?'🔴 Atrasada':r.date===today?'🟡 Hoje':'🟢 A receber'}</span></div><div class="receivable-mobile-line"><span>Vencimento</span><b>${date(r.date)}</b></div><div class="receivable-mobile-line"><span>Origem</span><b>${r.type==='phone'?'📱 '+esc(r.f.model):'💰 Empréstimo'}</b></div><div class="receivable-mobile-line receivable-balance"><span>Saldo em aberto</span><b>${money(r.balance)}</b></div><div class="receivable-mobile-actions"><button class="mini" onclick="${r.type==='phone'?`receivePhoneFinanceV51('${r.f.id}','${r.i.id}',${r.balance.toFixed(2)})`:`payInstallment('${r.i.id}')`}">Registrar recebimento</button><button class="mini" onclick="sendCollection('${esc(r.phone||'')}','${esc(r.name)}','${r.balance.toFixed(2)}','${r.date}')">WhatsApp</button></div></article>`).join('')||'<div class="empty">Nenhuma conta em aberto.</div>';
    shell('Contas a receber','Lista, calendário, atrasados e cobrança em um só lugar',`<div class="cards"><div class="card"><small>Hoje</small><strong>${money(total(dueToday))}</strong><span>${dueToday.length} parcela(s)</span></div><div class="card alert"><small>Em atraso</small><strong>${money(total(overdue))}</strong><span>${overdue.length} parcela(s)</span></div><div class="card"><small>Próximos</small><strong>${money(total(next))}</strong><span>Próximos vencimentos</span></div><div class="card"><small>Total em aberto</small><strong>${money(total(rows))}</strong><span>Empréstimos + celulares</span></div></div><div class="panel"><div class="panel-title"><h3>🗓️ Calendário financeiro</h3><span>Próximos 14 dias</span></div><div class="grid2">${cal}</div></div><div class="panel table receivable-desktop-table"><table><thead><tr><th>Vencimento</th><th>Cliente</th><th>Origem</th><th>Saldo</th><th>Status</th><th>Cobrança</th></tr></thead><tbody>${rows.map(rowHtml).join('')||'<tr><td colspan="6">Nenhuma conta em aberto.</td></tr>'}</tbody></table></div><div class="receivable-mobile-list">${mobileRows}</div>`);
  }
  function sendCollection(phone,name,value,due){whatsapp(phone,`Olá, ${name}! Tudo bem? Há uma parcela de ${money(value)} com vencimento em ${date(due)}. Estou entrando em contato para alinharmos o pagamento.`)}
  function dashboard(){
    const d=state.data,hoje=new Date().toISOString().slice(0,10),pf=d.phone_finances||[],pfi=d.phone_finance_installments||[];
    const loanOps=d.loans.filter(x=>x.status==='active'||x.status==='paid'),loanCapital=loanOps.reduce((s,x)=>s+num(x.principal),0),loanScheduled=loanOps.reduce((s,x)=>s+num(x.installment_amount)*num(x.installments_count),0),loanProfit=loanScheduled-loanCapital,loanReceive=d.installments.filter(x=>x.status!=='paid'&&x.status!=='interest_only').reduce((s,x)=>s+Math.max(0,num(x.amount)-num(x.paid_amount)),0),loanReceived=d.installments.reduce((s,x)=>s+num(x.paid_amount),0),loanLate=d.installments.filter(x=>x.status!=='paid'&&x.status!=='interest_only'&&x.due_date<hoje).reduce((s,x)=>s+Math.max(0,num(x.amount)-num(x.paid_amount)),0);
    const pfTotal=pf.reduce((s,f)=>s+num(f.entry)+pfi.filter(i=>i.phone_finance_id===f.id).reduce((a,i)=>a+num(i.amount),0),0),pfReceived=pf.reduce((s,f)=>s+num(f.entry)+pfi.filter(i=>i.phone_finance_id===f.id).reduce((a,i)=>a+num(i.paid_amount),0),0),pfOpen=pfi.reduce((s,i)=>s+(i.status==='paid'?0:Math.max(0,num(i.amount)-num(i.paid_amount))),0),pfCapital=pf.filter(f=>f.status==='active').reduce((s,f)=>s+num(f.financed),0),pfCost=pf.reduce((s,f)=>s+num(f.cost),0),pfLate=pfi.filter(i=>i.status!=='paid'&&i.due_date<hoje).reduce((s,i)=>s+Math.max(0,num(i.amount)-num(i.paid_amount)),0);
    const salesRevenue=d.sales.reduce((s,x)=>s+num(x.total||num(x.unit_price)*num(x.quantity)),0),salesCost=d.sales.reduce((s,x)=>{const ph=d.phones.find(p=>p.id===x.phone_id);return s+num(x.cost_at_sale??x.cost??ph?.cost)*num(x.quantity)},0),salesProfit=salesRevenue-salesCost,phoneProfit=(pfTotal-pfCost)+salesProfit,generalProfit=loanProfit+phoneProfit,expenseTotal=getExpenses().reduce((s,x)=>s+num(x.amount),0),netProfit=generalProfit-expenseTotal,capital=loanCapital+pfCapital,receber=loanReceive+pfOpen,recebido=loanReceived+pfReceived+salesRevenue,atrasado=loanLate+pfLate,phonesCostNegotiated=salesCost+pfCost,phonesCostInStock=d.phones.reduce((s,p)=>s+num(p.cost)*num(p.stock),0);
    const hojeRows=[...d.installments.filter(i=>i.status!=='paid'&&i.status!=='interest_only'&&i.due_date===hoje).map(i=>({type:'loan',i})),...pfi.filter(i=>i.status!=='paid'&&i.due_date===hoje).map(i=>({type:'phone',i,f:pf.find(x=>x.id===i.phone_finance_id)}))];
    const pfRows=pf.slice(0,6).map(f=>{const fs=pfi.filter(i=>i.phone_finance_id===f.id),c=d.clients.find(x=>x.id===f.client_id)||{},total=num(f.entry)+fs.reduce((a,i)=>a+num(i.amount),0),rec=num(f.entry)+fs.reduce((a,i)=>a+num(i.paid_amount),0);return `<div class="list-row"><div class="person"><b>📱 ${esc(c.name||'Cliente')}</b><small>${esc(f.model||'Celular')} • ${f.installments_count} parcelas</small></div><strong>${money(Math.max(0,total-rec))}</strong><span>Saldo</span></div>`}).join('');
    const contratos=loanOps.length+pf.filter(f=>f.status==='active').length;
    // Gráfico de acompanhamento: parcelas por vencimento (projeção) e despesas pela data registrada.
    // Não representa recebimentos históricos porque o modelo atual não guarda data individual de cada pagamento.
    const monthLabels=[]; const monthKeys=[]; const monthBase=new Date(); monthBase.setDate(1);
    for(let k=5;k>=0;k--){const dt=new Date(monthBase.getFullYear(),monthBase.getMonth()-k,1);monthKeys.push(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`);monthLabels.push(dt.toLocaleDateString('pt-BR',{month:'short'}).replace('.',''));}
    const monthly=monthKeys.map((key,idx)=>{const installments=[...d.installments.filter(i=>(i.due_date||'').slice(0,7)===key),...pfi.filter(i=>(i.due_date||'').slice(0,7)===key)];const scheduled=installments.reduce((sum,i)=>sum+Math.max(0,num(i.amount)-num(i.paid_amount)),0);const expenses=getExpenses().filter(x=>(x.expense_date||x.date||'').slice(0,7)===key).reduce((sum,x)=>sum+num(x.amount),0);return {label:monthLabels[idx],scheduled,expenses};});
    const chartMax=Math.max(1,...monthly.flatMap(m=>[m.scheduled,m.expenses]));
    const compactMoney=v=>v>=1000000?`R$ ${(v/1000000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mi`:v>=1000?`R$ ${(v/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mil`:money(v);
    const chartBars=monthly.map(m=>`<div class="month-bars"><div class="bar-pair"><span class="bar bar-scheduled" style="height:${Math.max(3,m.scheduled/chartMax*100)}%" title="Parcelas em aberto por vencimento: ${money(m.scheduled)}" aria-label="Parcelas em aberto: ${money(m.scheduled)}"></span><span class="bar bar-expenses" style="height:${Math.max(3,m.expenses/chartMax*100)}%" title="Despesas registradas: ${money(m.expenses)}" aria-label="Despesas registradas: ${money(m.expenses)}"></span></div><small>${m.label}</small><span class="month-total" title="Parcelas em aberto: ${money(m.scheduled)}">${compactMoney(m.scheduled)}</span></div>`).join('');
    const monthlyRows=monthly.map(m=>`<tr><td>${m.label}</td><td>${money(m.scheduled)}</td><td>${money(m.expenses)}</td></tr>`).join('');
    const chartExpenseTotal=monthly.reduce((sum,m)=>sum+m.expenses,0),chartScheduledTotal=monthly.reduce((sum,m)=>sum+m.scheduled,0);
    shell('Início','Resumo da sua operação',`<div class="welcome"><div><small>VISÃO GERAL</small><h2>Olá, ${esc((state.user?.user_metadata?.full_name||state.user?.email||'Administrador').split(' ')[0])} 👋</h2><p>Acompanhe empréstimos, financiamentos, recebimentos, estoque e clientes em um só lugar.</p></div><button onclick="go('loans')">+ Novo empréstimo</button></div><section class="ac-promo-banner" aria-label="Atalho para loja de celulares"><div class="ac-promo-copy"><span class="ac-promo-kicker">AC CELULARES</span><h3>Seu estoque, suas vendas, seu controle.</h3><p>Acesse os aparelhos cadastrados e acompanhe o estoque antes de fechar uma venda.</p><button type="button" onclick="go('phones')">Ver estoque <span aria-hidden="true">→</span></button></div><div class="ac-promo-device" aria-hidden="true"><div class="ac-phone"><span></span><i></i></div><div class="ac-promo-orbit"></div></div></section><div class="dashboard-quick-actions" aria-label="Ações rápidas"><button type="button" onclick="go('loans')"><span class="quick-action-icon gold">▤</span><b>Novo<br>empréstimo</b></button><button type="button" onclick="go('phonefinance')"><span class="quick-action-icon blue">▯</span><b>Novo<br>financiamento</b></button><button type="button" onclick="go('sales')"><span class="quick-action-icon green">🛒</span><b>Nova<br>venda</b></button><button type="button" onclick="go('clients')"><span class="quick-action-icon blue">♙</span><b>Novo<br>cliente</b></button></div><div class="cards dashboard-cards"><div class="card"><small>Capital ativo</small><strong>${money(capital)}</strong><span>Empréstimos + financiamentos</span></div><div class="card"><small>Total a receber</small><strong>${money(receber)}</strong><span>Saldo de todos os contratos</span></div><div class="card"><small>Total recebido</small><strong>${money(recebido)}</strong><span>Empréstimos + financiamentos + vendas</span></div><div class="card alert"><small>Em atraso</small><strong>${money(atrasado)}</strong><span>Saldo vencido</span></div></div><div class="cards dashboard-cards"><div class="card"><small>💰 Lucro geral projetado</small><strong>${money(generalProfit)}</strong><span>Antes das despesas</span></div><div class="card"><small>🟢 Resultado após despesas</small><strong>${money(netProfit)}</strong><span>Lucro menos despesas</span></div><div class="card"><small>📈 Lucro com empréstimos</small><strong>${money(loanProfit)}</strong><span>Juros previstos dos contratos</span></div><div class="card"><small>📱 Lucro com celulares</small><strong>${money(phoneProfit)}</strong><span>Vendas + financiamentos</span></div><div class="card"><small>🧾 Gasto em celulares</small><strong>${money(phonesCostNegotiated)}</strong><span>Custo dos celulares vendidos/financiados</span></div></div><div class="grid2"><div class="panel"><div class="panel-title"><h3>📱 Financiamentos de celulares</h3><button onclick="go('phonefinance')">Ver todos</button></div><div class="list">${pfRows||'<div class="empty">Nenhum financiamento cadastrado.</div>'}</div><div class="item"><b>${pf.length}</b> financiamento(s) · <b>${money(pfTotal)}</b> total contratado · <b>${money(pfReceived)}</b> recebido · <b>${money(pfOpen)}</b> a receber</div></div><div class="panel"><div class="panel-title"><h3>Recebimentos de hoje</h3><button onclick="go('installments')">Ver todos</button></div><div class="list">${hojeRows.slice(0,8).map(row=>{if(row.type==='phone'){const i=row.i,f=row.f||{},c=d.clients.find(x=>x.id===f.client_id)||{};return `<div class="list-row"><div class="person"><b>📱 ${esc(c.name||'Cliente')}</b><small>${esc(f.model||'Celular')} • Parcela ${i.number} • ${date(i.due_date)}</small></div><strong>${money(Math.max(0,num(i.amount)-num(i.paid_amount)))}</strong></div>`}const i=row.i,l=d.loans.find(x=>x.id===i.loan_id)||{},c=d.clients.find(x=>x.id===l.client_id)||{};return `<div class="list-row"><div class="person"><b>${esc(c.name||'Cliente')}</b><small>Empréstimo • Parcela ${i.number} • ${date(i.due_date)}</small></div><strong>${money(Math.max(0,num(i.amount)-num(i.paid_amount)))}</strong><button class="mini" onclick="payInstallment('${i.id}')">Receber</button></div>`}).join('')||'<div class="empty">Nenhum recebimento previsto para hoje.</div>'}</div></div></div><div class="panel finance-chart-panel"><div class="panel-title"><h3>📊 Evolução financeira</h3><span>Últimos 6 meses</span></div><div class="chart-legend"><span><i class="legend-dot scheduled"></i>Parcelas por vencimento</span><span><i class="legend-dot expenses"></i>Despesas lançadas</span></div><div class="finance-chart">${chartBars}</div><details class="chart-monthly-details"><summary>Ver valores exatos por mês</summary><div class="table chart-monthly-table"><table><thead><tr><th>Mês</th><th>Parcelas em aberto</th><th>Despesas registradas</th></tr></thead><tbody>${monthlyRows}</tbody></table></div></details><div class="chart-summary"><div><small>Parcelas previstas no período</small><b>${money(chartScheduledTotal)}</b></div><div><small>Despesas registradas no período</small><b>${money(chartExpenseTotal)}</b></div></div><p class="chart-note">Parcelas agrupadas pelo vencimento e despesas pela data registrada. Este gráfico não representa histórico de caixa recebido.</p></div><div class="panel"><div class="panel-title"><h3>Resumo financeiro</h3><span>${contratos} contrato(s) ativo(s)</span></div><div class="grid2"><div class="item"><b>Empréstimos</b><br>Capital: ${money(loanCapital)}<br>A receber: ${money(loanReceive)}<br>Recebido: ${money(loanReceived)}<br>Lucro projetado: <b>${money(loanProfit)}</b></div><div class="item"><b>Celulares</b><br>Capital financiado: ${money(pfCapital)}<br>A receber: ${money(pfOpen)}<br>Recebido: ${money(pfReceived)}<br>Custo negociado: ${money(phonesCostNegotiated)}<br>Lucro projetado: <b>${money(phoneProfit)}</b><br>💼 Custo ainda em estoque: ${money(phonesCostInStock)}</div></div></div>`);
  }
  function clients(){shell('Clientes','Cadastro, limite de crédito, bloqueio e histórico operacional',`<div class="panel"><div class="client-import-row"><button type="button" class="contact-import-btn" onclick="importPhoneContact()">♙ Importar dos contatos</button><small>Selecione um contato para preencher nome e telefone.</small></div><form class="form" onsubmit="addClient(event)"><input id="cname" placeholder="Nome completo" autocomplete="name" required><input id="ccpf" placeholder="CPF"><input id="cphone" placeholder="WhatsApp" type="tel" autocomplete="tel"><input id="caddr" placeholder="Endereço" autocomplete="street-address"><input id="climit" type="number" step="0.01" min="0" placeholder="Limite de crédito"><button>Cadastrar</button></form><small id="contactImportMsg" class="contact-import-msg" role="status"></small></div><div class="panel table"><table><thead><tr><th>Nome</th><th>WhatsApp</th><th>Limite</th><th>Usado</th><th>Disponível</th><th>Status</th><th></th></tr></thead><tbody>${state.data.clients.map(c=>{const info=clientCreditInfo(c.id);return `<tr><td>${esc(c.name)}</td><td>${esc(c.whatsapp)}</td><td>${money(info.lim)}</td><td>${money(info.used)}</td><td>${money(info.available)}</td><td>${info.blocked?'🔒 Bloqueado':'🟢 Ativo'}</td><td><button class="mini" onclick="setClientLimit('${c.id}')">Limite</button> <button class="mini" onclick="toggleClientBlock('${c.id}')">${info.blocked?'Desbloquear':'Bloquear'}</button></td></tr>`}).join('')||'<tr><td colspan="7">Nenhum cliente cadastrado.</td></tr>'}</tbody></table></div>`)}
  async function setClientLimit(id){const c=state.data.clients.find(x=>x.id===id);if(!c)return;const raw=prompt('Novo limite de crédito para '+c.name,clientLimit(id).toFixed(2));if(raw===null)return;await mutate('clients',{...c,credit_limit:Math.max(0,num(raw)),updated_at:new Date().toISOString()});render()}
  async function toggleClientBlock(id){const c=state.data.clients.find(x=>x.id===id);if(!c)return;await mutate('clients',{...c,credit_blocked:!c.credit_blocked,updated_at:new Date().toISOString()});render()}

  async function importPhoneContact(){
    const msg=$('contactImportMsg');
    if(!('contacts' in navigator) || typeof navigator.contacts?.select!=='function'){
      if(msg)msg.textContent='Este navegador não oferece seleção direta de contatos. Tente abrir o AC no Chrome atualizado do Android; se continuar indisponível, preencha os campos manualmente.';
      notify('Seleção de contatos não é compatível com este navegador.',false);return;
    }
    try{
      const picked=await navigator.contacts.select(['name','tel'],{multiple:false});
      if(!picked||!picked.length)return;
      const contact=picked[0];
      const name=Array.isArray(contact.name)?contact.name[0]:contact.name;
      const tel=Array.isArray(contact.tel)?contact.tel[0]:contact.tel;
      if(name)$('cname').value=String(name).trim();
      if(tel)$('cphone').value=String(tel).trim();
      if(msg)msg.textContent='Contato preenchido. Confira os dados antes de cadastrar.';
      notify('Contato importado para o formulário. Confira antes de salvar.',true);
    }catch(err){
      if(err?.name==='AbortError')return;
      if(msg)msg.textContent='Não foi possível acessar esse contato. Você pode preencher os dados manualmente.';
      notify('Não foi possível importar o contato.',false);
    }
  }
  async function addClient(e){e.preventDefault();const row={id:uid(),user_id:state.user.id,name:$('cname').value.trim(),cpf:$('ccpf').value.trim(),whatsapp:$('cphone').value.trim(),address:$('caddr').value.trim(),credit_limit:num($('climit').value),credit_blocked:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};await mutate('clients',row);e.target.reset();render()}
  function loans(){
    const allLoans=state.data.loans;
    const activeLoans=allLoans.filter(l=>l.status==='active');
    const activeCapital=activeLoans.reduce((sum,l)=>sum+num(l.principal),0);
    const openBalance=state.data.installments.filter(i=>i.status!=='paid'&&i.status!=='interest_only').reduce((sum,i)=>sum+Math.max(0,num(i.amount)-num(i.paid_amount)),0);
    const contractRows=allLoans.map(l=>{
      const client=(state.data.clients.find(c=>c.id===l.client_id)||{}).name||'—';
      const status=l.status==='active'?'active':l.status==='paid'?'paid':l.status==='cancelled'?'cancelled':'simulation';
      const statusLabel=status==='active'?'Contratado':status==='paid'?'Quitado':status==='cancelled'?'Cancelado':'Simulação';
      const due=state.data.installments.filter(i=>i.loan_id===l.id&&i.status!=='paid'&&i.status!=='interest_only').reduce((sum,i)=>sum+Math.max(0,num(i.amount)-num(i.paid_amount)),0);
      return `<article class="contract-individual-card" data-loan-row data-search="${esc(`${client} ${statusLabel} ${l.principal} ${l.monthly_rate}`.toLowerCase())}" data-status="${status}">
        <div class="contract-individual-head"><div class="contract-client"><span class="contract-avatar">${esc(client.trim().charAt(0).toUpperCase()||'C')}</span><span><b>${esc(client)}</b><small>Contrato ${esc(String(l.id).slice(0,8))}</small></span></div><span class="contract-status status-${status}">${statusLabel}</span></div>
        <div class="contract-individual-metrics">
          <div><small>Principal</small><strong>${money(l.principal)}</strong></div>
          <div><small>Juros</small><strong class="contract-card-interest">${l.interest_type==='fixed'?money(l.interest_value):num(l.monthly_rate).toFixed(2)+'%'}</strong></div>
          <div><small>Parcelas</small><strong>${num(l.installments_count)}</strong></div>
          <div><small>Valor da parcela</small><strong>${money(l.installment_amount)}</strong></div>
        </div>
        <div class="contract-individual-total"><span>Total contratado</span><strong>${money(num(l.installment_amount)*num(l.installments_count))}</strong><small>${money(due)} em aberto</small></div>
        <div class="contract-individual-actions"><button class="mini" type="button" onclick="shareLoanContractV1('${l.id}')">WhatsApp · detalhes</button>${status==='active'?`<button class="mini contract-edit-btn" type="button" onclick="editLoanContractV55('${l.id}')">Editar contrato</button><button class="mini contract-delete-btn" type="button" onclick="deleteLoanContractV56('${l.id}')">Excluir contrato</button>`:''}${Array.isArray(l.attachments)&&l.attachments.length?`<button class="mini" type="button" onclick="openLoanAttachment('${l.id}',0)">📎 ${l.attachments.length} anexo(s)</button>`:''}</div>
      </article>`;
    }).join('');
    shell('Empréstimos','Gestão de contratos, simulações e saldo a receber',`
      <div class="contract-overview">
        <div class="contract-stat"><span class="contract-stat-icon">▣</span><small>Contratos ativos</small><strong>${activeLoans.length}</strong><span>Operações em andamento</span></div>
        <div class="contract-stat"><span class="contract-stat-icon">R$</span><small>Capital contratado ativo</small><strong>${money(activeCapital)}</strong><span>Principal dos contratos ativos</span></div>
        <div class="contract-stat"><span class="contract-stat-icon">◷</span><small>Saldo de parcelas em aberto</small><strong>${money(openBalance)}</strong><span>Empréstimos, sem parcelas quitadas</span></div>
      </div>
      <div class="panel contract-form-panel loan-create-panel"><div class="loan-create-heading"><div class="loan-heading-mark">AC</div><div><span class="eyebrow">NOVA OPERAÇÃO</span><h3>Novo contrato — Empréstimo</h3><p class="panel-hint">Preencha os dados e confira a simulação antes de salvar.</p></div></div>
        <form class="form contract-form loan-create-form" onsubmit="addLoan(event)">
          <section class="loan-step-card loan-step-client"><div class="loan-step-title"><span class="loan-step-number">01</span><div><b>Cliente</b><small>Selecione quem receberá o empréstimo</small></div></div>
            <label class="field field-wide"><span>Cliente</span><div class="loan-client-row"><select id="lclient" required><option value="">Buscar ou selecionar cliente</option>${state.data.clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><button class="loan-add-client" type="button" onclick="go('clients')" aria-label="Cadastrar novo cliente">＋</button></div></label>
            <div id="loanClientInfo" class="loan-credit-card" aria-live="polite"><span class="loan-credit-icon">♙</span><span>Selecione um cliente para consultar o limite disponível.</span></div>
          </section>
          <section class="loan-step-card"><div class="loan-step-title"><span class="loan-step-number">02</span><div><b>Dados do contrato</b><small>Valor principal, taxa e prazo</small></div></div>
            <div class="loan-fields-grid">
              <label class="field"><span>Valor do empréstimo (R$)</span><div class="loan-input-prefix"><span>R$</span><input id="lprincipal" type="number" step="0.01" min="0.01" inputmode="decimal" placeholder="800,00" required></div></label>
              <label class="field"><span>Tipo de juros</span><select id="linterestType"><option value="percentage">Percentual</option><option value="fixed">Valor fixo (R$)</option></select></label>
              <label class="field"><span id="lrateLabel">Juros mensais (%)</span><div class="loan-input-suffix"><input id="lrate" type="number" step="0.01" min="0" inputmode="decimal" placeholder="10" required><span id="lrateSuffix">%</span></div></label>
              <label class="field"><span>Quantidade de parcelas</span><div class="loan-input-suffix"><input id="lmonths" type="number" min="1" max="120" inputmode="numeric" placeholder="4" required><span>parcelas</span></div></label>
              <label class="field"><span>Data do primeiro vencimento</span><input id="ldue" type="date" required></label>
            </div>
            <label class="field field-wide"><span>Cobrança dos juros</span><select id="linterestCollection"><option value="total">Sobre o total (uma única vez)</option><option value="per_installment">Por parcela (juros repetidos)</option></select><small class="loan-field-hint">Escolha se os juros são aplicados uma vez ao contrato ou repetidos em cada parcela.</small></label>
            <div class="loan-method-note"><span>▦</span><div><b>Parcelamento configurável</b><small>As datas respeitam o intervalo e os dias não úteis selecionados.</small></div></div>
            <label class="field field-wide loan-status-field"><span>Tipo de operação</span><select id="lstatus"><option value="simulation">Simulação — não gera parcelas</option><option value="active">Contrato ativo — gerar parcelas</option></select><small class="loan-field-hint">A simulação não grava parcelas. O contrato ativo cria as parcelas no sistema.</small></label>
          </section>
          <section class="loan-step-card loan-advanced-settings"><div class="loan-step-title"><span class="loan-step-number">03</span><div><b>Regras de vencimento e atraso</b><small>Configure datas e encargos do contrato</small></div></div>
            <label class="field field-wide"><span>Intervalo entre vencimentos</span><select id="ldueInterval"><option value="monthly">Mensal (data fixa)</option><option value="weekly">Semanal</option><option value="biweekly">A cada 15 dias</option></select></label>
            <div class="loan-fields-grid"><label class="field"><span>Cobrança por atraso</span><select id="llateType"><option value="none">Não cobrar</option><option value="fixed_daily">Valor fixo por dia</option><option value="percent_daily">Percentual por dia</option></select></label><label class="field"><span id="llateValueLabel">Valor por dia (R$ / %)</span><input id="llateValue" type="number" min="0" step="0.01" value="0" inputmode="decimal"></label></div>
            <div class="loan-checks"><label><input id="lskipSat" type="checkbox" checked><span>Ignorar sábados</span></label><label><input id="lskipSun" type="checkbox" checked><span>Ignorar domingos</span></label><label><input id="lskipHoliday" type="checkbox"><span>Ignorar feriados nacionais</span></label></div>
            <label class="field field-wide"><span>Outros dias da semana para ignorar</span><select id="lextraDays" multiple size="3"><option value="1">Segunda-feira</option><option value="2">Terça-feira</option><option value="3">Quarta-feira</option><option value="4">Quinta-feira</option><option value="5">Sexta-feira</option></select><small class="loan-field-hint">No celular, mantenha pressionado para selecionar mais de um dia.</small></label>
          </section>
          <section class="loan-step-card"><div class="loan-step-title"><span class="loan-step-number">04</span><div><b>Observações e anexos</b><small>Informações complementares do contrato</small></div></div>
            <label class="field field-wide"><span>Observações (opcional)</span><textarea id="lloanNotes" rows="3" maxlength="4000" placeholder="Observações, acordos ou condições especiais..."></textarea></label>
            <label class="field field-wide"><span>Anexos do contrato (até 10 arquivos)</span><input id="lloanFiles" type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" multiple><small class="loan-field-hint">Imagens ou PDF. Arquivos serão enviados ao armazenamento privado do projeto quando houver conexão.</small></label><div id="lloanFilesList" class="loan-file-list" aria-live="polite">Nenhum anexo selecionado.</div>
          </section>
          <section class="loan-summary-card" aria-live="polite"><div class="loan-summary-title"><span>▣ Resumo do contrato</span><span class="loan-summary-tag">PRÉVIA</span></div><div class="loan-summary-line"><span>Valor principal</span><b id="loanSummaryPrincipal">R$ 0,00</b></div><div class="loan-summary-line"><span>Tipo / taxa de juros</span><b id="loanSummaryRate">0%</b></div><div class="loan-summary-line"><span>Juros totais</span><b id="loanSummaryInterest">R$ 0,00</b></div><div class="loan-summary-line"><span>Quantidade de parcelas</span><b id="loanSummaryCount">—</b></div><div class="loan-summary-line loan-summary-total"><span>Parcela estimada</span><b id="loanSummaryInstallment">R$ 0,00</b></div><div class="loan-summary-line loan-summary-grand"><span>Total estimado a receber</span><b id="loanSummaryTotal">R$ 0,00</b></div><small class="loan-summary-note">Estimativa calculada pela taxa mensal e pelo prazo informados.</small></section>
          <div class="contract-form-actions"><div id="loanResult" class="result">Preencha valor, taxa e prazo para calcular.</div><button class="primary-action" type="submit">Salvar contrato <span aria-hidden="true">→</span></button></div>
        </form>
      </div>
      <div class="panel contract-list-panel"><div class="panel-title"><div><span class="eyebrow">CARTEIRA DE CRÉDITO</span><h3>Contratos e simulações</h3><p class="panel-hint">Pesquise por cliente e filtre pelo status da operação.</p></div><span class="contract-count">${allLoans.length} registro(s)</span></div>
        <div class="contract-filters"><label class="contract-search"><span>⌕</span><input id="loanFilterText" type="search" placeholder="Buscar cliente, valor ou taxa..." oninput="filterLoanRows()"></label><select id="loanFilterStatus" aria-label="Filtrar contratos por status" onchange="filterLoanRows()"><option value="all">Todos os status</option><option value="active">Contratados</option><option value="simulation">Simulações</option><option value="paid">Quitados</option><option value="cancelled">Cancelados</option></select></div>
        <div id="loansTableBody" class="contract-individual-list">${contractRows||'<div class="empty contract-empty">Nenhum contrato cadastrado. Registre uma operação no formulário acima.</div>'}</div>
        <div class="contract-table-footer"><span>Valores em reais (BRL)</span><span>As simulações não geram parcelas a receber.</span></div>
      </div>`);
    ['lprincipal','lrate','lmonths'].forEach(id=>$(id)?.addEventListener('input',calcLoan));$('linterestType')?.addEventListener('change',()=>{const fixed=$('linterestType').value==='fixed';$('lrateLabel').textContent=fixed?'Valor fixo de juros (R$)':'Juros mensais (%)';$('lrateSuffix').textContent=fixed?'R$':'%';calcLoan()});$('linterestCollection')?.addEventListener('change',calcLoan);$('lclient')?.addEventListener('change',updateLoanClientInfo);$('llateType')?.addEventListener('change',()=>{const el=$('llateValueLabel');if(el)el.textContent=$('llateType').value==='percent_daily'?'Percentual por dia (%)':'Valor por dia (R$)'});$('lloanFiles')?.addEventListener('change',()=>{const fs=[...($('lloanFiles').files||[])],list=$('lloanFilesList');if(fs.length>10){notify('Selecione no máximo 10 anexos.',false);$('lloanFiles').value='';if(list)list.textContent='Nenhum anexo selecionado.';return}if(fs.some(f=>f.size>10*1024*1024)){notify('Cada anexo deve ter até 10 MB.',false);$('lloanFiles').value='';if(list)list.textContent='Nenhum anexo selecionado.';return}if(list)list.textContent=fs.length?fs.map(f=>`${f.name} · ${(f.size/1024/1024).toFixed(2)} MB`).join(' | '):'Nenhum anexo selecionado.'});calcLoan();setLoanDueDefault();
  }
  function filterLoanRows(){
    const query=($('loanFilterText')?.value||'').trim().toLowerCase();
    const status=$('loanFilterStatus')?.value||'all';
    document.querySelectorAll('[data-loan-row]').forEach(row=>{
      const matchesText=(row.dataset.search||'').includes(query);
      const matchesStatus=status==='all'||row.dataset.status===status;
      row.hidden=!(matchesText&&matchesStatus);
    });
  }
  function setLoanDueDefault(){const d=$('ldue');if(d&&!d.value)d.value=new Date().toISOString().slice(0,10)}
  function calcLoan(){
    const principal=num($('lprincipal')?.value),rateValue=num($('lrate')?.value),type=$('linterestType')?.value||'percentage',collection=$('linterestCollection')?.value||'total',n=parseInt($('lmonths')?.value)||0;
    const hasPrincipal=principal>0,hasTerm=n>0;let interest=0,pay=0,total=0;
    // Partial preview: calculate principal/interest/total as soon as possible.
    if(hasPrincipal){
      if(type==='fixed'){
        if(collection==='total'){interest=rateValue;total=principal+interest}
        else if(hasTerm){interest=rateValue*n;total=principal+interest}
        else {total=principal}
      } else if(collection==='total'){
        interest=principal*rateValue/100;total=principal+interest;
      } else if(hasTerm){
        const r=rateValue/100;pay=r?principal*r/(1-Math.pow(1+r,-n)):principal/n;total=pay*n;interest=total-principal;
      } else {total=principal}
      if(hasTerm&&!(type==='percentage'&&collection==='per_installment'))pay=total/n;
    }
    const set=(id,value)=>{const el=$(id);if(el)el.textContent=value};
    set('loanSummaryPrincipal',money(principal));
    set('loanSummaryRate',type==='fixed'?money(rateValue):`${rateValue.toLocaleString('pt-BR',{maximumFractionDigits:2})}%`);
    set('loanSummaryCount',hasTerm?`${n} parcela(s)`:'Informe a quantidade');
    set('loanSummaryInstallment',hasTerm?money(pay):'—');
    set('loanSummaryTotal',hasPrincipal?money(total):'—');
    const oldInterest=$('loanSummaryInterest');if(oldInterest)oldInterest.textContent=hasPrincipal?money(interest):'—';
    if($('loanResult')){
      if(!hasPrincipal)$('loanResult').textContent='Informe o valor principal para iniciar a simulação.';
      else if(!hasTerm)$('loanResult').innerHTML=`Juros estimados: <b>${money(interest)}</b><br>Total estimado: <b>${money(total)}</b><br>Informe a quantidade de parcelas para calcular o valor de cada parcela.`;
      else $('loanResult').innerHTML=`Juros totais: <b>${money(interest)}</b><br>Parcela estimada: <b>${money(pay)}</b><br>Total estimado: <b>${money(total)}</b>`;
    }
    updateLoanClientInfo();
  }
  function updateLoanClientInfo(){const id=$('lclient')?.value,el=$('loanClientInfo');if(!el)return;if(!id){el.textContent='Selecione um cliente para consultar o limite disponível.';return}const info=clientCreditInfo(id);el.textContent=info.lim>0?`Limite: ${money(info.lim)} · Utilizado: ${money(info.used)} · Disponível: ${money(info.available)}${info.blocked?' · Cliente bloqueado':''}`:(info.blocked?'Cliente bloqueado para novas operações.':'Cliente sem limite de crédito definido.')}
  function easterSunday(year){const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;return new Date(year,month-1,day)}
  function nationalHolidayKey(dateObj){const y=dateObj.getFullYear(),fixed=new Set([`${y}-01-01`,`${y}-04-21`,`${y}-05-01`,`${y}-09-07`,`${y}-10-12`,`${y}-11-02`,`${y}-11-15`,`${y}-11-20`,`${y}-12-25`]);const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;const easter=easterSunday(y);const gf=new Date(easter);gf.setDate(gf.getDate()-2);const corpus=new Date(easter);corpus.setDate(corpus.getDate()+60);return fixed.has(fmt(dateObj))||fmt(gf)===fmt(dateObj)||fmt(corpus)===fmt(dateObj)}
  function adjustDueDate(dateObj,settings){let guard=0;while(guard++<14){const wd=dateObj.getDay(),key=`${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;if((settings.skip_saturdays&&wd===6)||(settings.skip_sundays&&wd===0)||(settings.extra_due_days||[]).includes(wd)||(settings.skip_holidays&&nationalHolidayKey(dateObj))){dateObj.setDate(dateObj.getDate()+1);continue}return key}return dateObj.toISOString().slice(0,10)}
  function buildLoanDueDates(firstDue,count,settings){const result=[];const first=new Date(firstDue+'T12:00:00');for(let i=0;i<count;i++){const d=new Date(first);if(settings.due_interval==='weekly')d.setDate(d.getDate()+7*i);else if(settings.due_interval==='biweekly')d.setDate(d.getDate()+14*i);else{const day=first.getDate();d.setDate(1);d.setMonth(first.getMonth()+i);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last))}result.push(adjustDueDate(d,settings))}return result}
  async function uploadLoanAttachments(loanId,files){if(!files.length)return [];if(!sb||!state.user||!state.online)throw new Error('Para anexar documentos, conecte-se à internet e entre na conta.');const out=[];for(const file of files){const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100),path=`${state.user.id}/${loanId}/${Date.now()}_${safe}`;const {error}=await sb.storage.from('loan-contract-attachments').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(error)throw error;out.push({name:file.name,path,type:file.type,size:file.size,uploaded_at:new Date().toISOString()})}return out}
  async function addLoan(e){e.preventDefault();let contractSaved=false;const client=$('lclient').value,p=num($('lprincipal').value),r=num($('lrate').value),n=parseInt($('lmonths').value),status=$('lstatus').value,firstDue=$('ldue').value,files=[...($('lloanFiles')?.files||[])];if(!client||!p||n<1||!firstDue){notify('Selecione o cliente, informe os valores e escolha o primeiro vencimento.',false);return}if(files.length>10||files.some(f=>f.size>10*1024*1024)){notify('Limite de 10 arquivos, até 10 MB cada.',false);return}if(files.length&&(!sb||!state.online)){notify('Conecte-se à internet para anexar documentos ao contrato.',false);return}if(status==='active'){const ci=clientCreditInfo(client);if(ci.blocked){notify('Cliente bloqueado para novas operações de crédito.',false);return}if(ci.lim>0&&p>ci.available){notify(`Valor acima do limite disponível do cliente (${money(ci.available)}).`,false);return}}const interestType=$('linterestType').value,interestCollection=$('linterestCollection').value;const rate=interestType==='percentage'?r:0;let pay;if(interestType==='fixed')pay=(p+r*(interestCollection==='per_installment'?n:1))/n;else if(interestCollection==='total')pay=(p+p*r/100)/n;else{const q=r/100;pay=q?p*q/(1-Math.pow(1+q,-n)):p/n}const id=uid(),settings={due_interval:$('ldueInterval').value,late_fee_type:$('llateType').value,late_fee_value:num($('llateValue').value),skip_saturdays:$('lskipSat').checked,skip_sundays:$('lskipSun').checked,skip_holidays:$('lskipHoliday').checked,extra_due_days:[...$('lextraDays').selectedOptions].map(o=>Number(o.value))};const loan={id,user_id:state.user.id,client_id:client,principal:p,monthly_rate:rate,interest_type:interestType,interest_value:r,interest_collection:interestCollection,installments_count:n,installment_amount:Number(pay.toFixed(2)),status,first_due_date:firstDue,notes:$('lloanNotes').value.trim(),contract_settings:settings,attachments:[],created_at:new Date().toISOString()};try{const saved=await cloudUpsert('loans',loan);contractSaved=true;state.data.loans=[saved,...state.data.loans.filter(x=>x.id!==id)];saveCache();if(status==='active'){const dates=buildLoanDueDates(firstDue,n,settings);if(sb&&state.online&&state.user?.id!=='demo'){/* The database trigger creates the installment rows atomically with the loan. Do not insert them a second time: installments has a unique (loan_id, number) constraint. */const {data:generated,error:readErr}=await sb.from('installments').select('*').eq('loan_id',id).eq('user_id',state.user.id).order('number',{ascending:true});if(readErr)throw readErr;if(!generated||generated.length!==n)throw new Error(`O banco criou ${generated?.length||0} de ${n} parcelas. Verifique a função generate_loan_installments.`);for(let i=0;i<generated.length;i++){const current=generated[i],due=dates[i];if(current.due_date!==due){const {data:updated,error:updateErr}=await sb.from('installments').update({due_date:due}).eq('id',current.id).eq('user_id',state.user.id).select().single();if(updateErr)throw updateErr;generated[i]=updated}}state.data.installments=[...generated,...state.data.installments.filter(x=>x.loan_id!==id)];}else{for(let i=1;i<=n;i++){const row={id:uid(),user_id:state.user.id,loan_id:id,number:i,due_date:dates[i-1],amount:Number(pay.toFixed(2)),paid_amount:0,late_fee_paid_amount:0,paid_at:null,status:'pending',created_at:new Date().toISOString()};await cloudUpsert('installments',row);state.data.installments=[row,...state.data.installments.filter(x=>x.id!==row.id)]}}}if(files.length){const attachments=await uploadLoanAttachments(id,files);const updated={...saved,attachments};const persisted=await cloudUpsert('loans',updated);state.data.loans=[persisted,...state.data.loans.filter(x=>x.id!==id)]}saveCache();e.target.reset();setLoanDueDefault();render();notify('Contrato salvo com as regras de vencimento e anexos registrados.',true)}catch(err){console.error('addLoan',err);notify((contractSaved?'Contrato salvo, mas houve falha ao gerar parcelas ou enviar anexos. Confira a lista antes de tentar novamente. ':'Não foi possível salvar o contrato. Confira a conexão e a migração do banco antes de tentar novamente: ')+(err.message||err),false)}}

  function closeLoanEditModal(){document.getElementById('ac-loan-edit-modal')?.remove()}
  window.editLoanContractV55=async function(loanId){
    const loan=state.data.loans.find(x=>String(x.id)===String(loanId));
    if(!loan||loan.status!=='active'){notify('Somente contratos ativos podem ser editados.',false);return}
    closeLoanEditModal();
    const related=state.data.installments.filter(i=>String(i.loan_id)===String(loan.id));
    const paid=related.filter(i=>i.status==='paid'||i.status==='interest_only');
    const maxPaidNumber=Math.max(0,...paid.map(i=>Number(i.number)||0));
    const nextDue=related.filter(i=>i.status!=='paid'&&i.status!=='interest_only').sort((a,b)=>a.number-b.number)[0]?.due_date||loan.first_due_date||new Date().toISOString().slice(0,10);
    const settings=loan.contract_settings||{};
    const modal=document.createElement('div');modal.id='ac-loan-edit-modal';modal.className='ac-loan-modal-overlay';
    modal.innerHTML=`<section class="ac-loan-modal" role="dialog" aria-modal="true" aria-labelledby="ac-loan-edit-title">
      <header class="ac-loan-modal-head"><div class="ac-loan-modal-brand">AC</div><div><span class="eyebrow">GESTÃO DE CONTRATO</span><h2 id="ac-loan-edit-title">Editar contrato</h2><p>Atualize os dados sem alterar o histórico já recebido.</p></div><button type="button" class="ac-loan-modal-close" aria-label="Fechar">×</button></header>
      <form id="ac-loan-edit-form" class="ac-loan-edit-form">
        <div class="ac-loan-modal-client"><small>CLIENTE</small><strong>${esc(state.data.clients.find(c=>String(c.id)===String(loan.client_id))?.name||'Cliente')}</strong><span>Contrato ${esc(String(loan.id).slice(0,8))}</span></div>
        <div class="ac-loan-edit-grid">
          <label class="field"><span>Valor principal (R$)</span><input id="editLoanPrincipal" type="number" min="0.01" step="0.01" value="${num(loan.principal)}" required></label>
          <label class="field"><span>Tipo de juros</span><select id="editLoanInterestType"><option value="percentage" ${loan.interest_type!=='fixed'?'selected':''}>Percentual</option><option value="fixed" ${loan.interest_type==='fixed'?'selected':''}>Valor fixo (R$)</option></select></label>
          <label class="field"><span id="editLoanRateLabel">${loan.interest_type==='fixed'?'Juros fixos (R$)':'Taxa mensal (%)'}</span><input id="editLoanRate" type="number" min="0" step="0.01" value="${loan.interest_type==='fixed'?num(loan.interest_value):num(loan.monthly_rate)}" required></label>
          <label class="field"><span>Quantidade de parcelas</span><input id="editLoanCount" type="number" min="1" max="120" value="${num(loan.installments_count)}" required></label>
          <label class="field"><span>Próximo vencimento</span><input id="editLoanDue" type="date" value="${esc(nextDue)}" required></label>
          <label class="field"><span>Cobrança dos juros</span><select id="editLoanCollection"><option value="total" ${(loan.interest_collection||settings.interestCollection||'total')==='total'?'selected':''}>Sobre o total</option><option value="per_installment" ${(loan.interest_collection||settings.interestCollection)==='per_installment'?'selected':''}>Por parcela</option></select></label>
          <label class="field"><span>Intervalo entre vencimentos</span><select id="editLoanInterval"><option value="monthly" ${(settings.dueInterval||'monthly')==='monthly'?'selected':''}>Mensal</option><option value="weekly" ${settings.dueInterval==='weekly'?'selected':''}>Semanal</option><option value="biweekly" ${settings.dueInterval==='biweekly'?'selected':''}>A cada 15 dias</option></select></label>
          <label class="field"><span>Cobrança por atraso</span><select id="editLoanLateType"><option value="none" ${(settings.lateType||'none')==='none'?'selected':''}>Não cobrar</option><option value="fixed_daily" ${settings.lateType==='fixed_daily'?'selected':''}>Valor fixo por dia</option><option value="percent_daily" ${settings.lateType==='percent_daily'?'selected':''}>Percentual por dia</option></select></label>
          <label class="field"><span>Valor do encargo por dia</span><input id="editLoanLateValue" type="number" min="0" step="0.01" value="${num(settings.lateValue)}"></label>
        </div>
        <label class="field"><span>Observações</span><textarea id="editLoanNotes" rows="3">${esc(loan.notes||'')}</textarea></label>
        <div class="ac-loan-edit-summary" id="editLoanSummary"></div>
        <div class="ac-loan-modal-actions"><button type="button" class="ac-loan-cancel">Cancelar</button><button type="submit" class="ac-loan-save">Salvar alterações</button></div>
      </form></section>`;
    document.body.appendChild(modal);
    const $m=id=>modal.querySelector('#'+id), moneyFmt=v=>money(Number.isFinite(v)?v:0);
    const calc=()=>{
      const principal=Number($m('editLoanPrincipal').value)||0,rate=Number($m('editLoanRate').value)||0,count=Number.parseInt($m('editLoanCount').value,10)||0,type=$m('editLoanInterestType').value,collection=$m('editLoanCollection').value;
      const totalInterest=type==='fixed'?(rate*(collection==='per_installment'?count:1)):(collection==='total'?principal*rate/100:0);
      const total=type==='percentage'&&collection==='per_installment'&&rate>0&&count>0?principal*(rate/100)/(1-Math.pow(1+rate/100,-count))*count:principal+totalInterest;
      const interest=type==='percentage'&&collection==='per_installment'&&count>0?total-principal:totalInterest;
      $m('editLoanSummary').innerHTML=`<b>Prévia do contrato</b><div><span>Juros estimados</span><strong>${moneyFmt(interest)}</strong></div><div><span>Total estimado</span><strong>${moneyFmt(total)}</strong></div><div><span>Parcela estimada</span><strong>${count>0?moneyFmt(total/count):'—'}</strong></div>`;
      $m('editLoanRateLabel').textContent=type==='fixed'?'Juros fixos (R$)':'Taxa mensal (%)';
    };
    ['editLoanPrincipal','editLoanRate','editLoanCount','editLoanInterestType','editLoanCollection'].forEach(id=>$m(id).addEventListener('input',calc));
    $m('editLoanInterestType').addEventListener('change',calc);$m('editLoanCollection').addEventListener('change',calc);calc();
    modal.querySelector('.ac-loan-modal-close').onclick=closeLoanEditModal;modal.querySelector('.ac-loan-cancel').onclick=closeLoanEditModal;
    modal.addEventListener('click',e=>{if(e.target===modal)closeLoanEditModal()});
    $m('ac-loan-edit-form').onsubmit=async e=>{
      e.preventDefault();
      const principal=Number($m('editLoanPrincipal').value),type=$m('editLoanInterestType').value,rate=Number($m('editLoanRate').value),count=Number.parseInt($m('editLoanCount').value,10),firstDue=$m('editLoanDue').value,collection=$m('editLoanCollection').value,interval=$m('editLoanInterval').value,lateType=$m('editLoanLateType').value,lateValue=Number($m('editLoanLateValue').value)||0;
      if(!(principal>0)||!(rate>=0)||!Number.isInteger(count)||count<1||count>120||!firstDue){notify('Confira valor, juros, quantidade e vencimento.',false);return}
      if(count<maxPaidNumber){notify(`Não é possível reduzir para ${count} parcelas: já existe histórico recebido até a parcela ${maxPaidNumber}.`,false);return}
      const decimal=type==='fixed'?0:rate/100;
      let total=principal,interest=0;
      if(type==='fixed'){interest=rate*(collection==='per_installment'?count:1);total=principal+interest}
      else if(collection==='total'){interest=principal*decimal;total=principal+interest}
      else if(decimal>0){const p=principal*decimal/(1-Math.pow(1+decimal,-count));total=p*count;interest=total-principal}
      const installment=Number((total/count).toFixed(2));
      const unpaid=related.filter(i=>i.status!=='paid'&&i.status!=='interest_only');
      const extras=unpaid.filter(i=>Number(i.number)>count);
      if(!confirm(`Salvar alterações do contrato de ${state.data.clients.find(c=>String(c.id)===String(loan.client_id))?.name||'cliente'}?\n\nPrincipal: ${money(loan.principal)} → ${money(principal)}\nParcelas: ${loan.installments_count} → ${count}\nParcela estimada: ${money(loan.installment_amount)} → ${money(installment)}\n\nO histórico de parcelas pagas será preservado. ${extras.length} parcela(s) em aberto acima do novo prazo serão removidas.`))return;
      const saveBtn=modal.querySelector('.ac-loan-save');saveBtn.disabled=true;saveBtn.textContent='Salvando…';
      try{
        const updatedLoan={...loan,principal,monthly_rate:type==='fixed'?0:rate,interest_type:type,interest_value:rate,interest_collection:collection,installments_count:count,installment_amount:installment,first_due_date:firstDue,notes:$m('editLoanNotes').value,contract_settings:{...settings,dueInterval:interval,lateType,lateValue},updated_at:new Date().toISOString()};
        const saved=await cloudUpsert('loans',updatedLoan);
        state.data.loans=[saved,...state.data.loans.filter(x=>String(x.id)!==String(loan.id))];
        for(const i of extras){await cloudDelete('installments',i.id);state.data.installments=state.data.installments.filter(x=>String(x.id)!==String(i.id))}
        const allRelated=state.data.installments.filter(i=>String(i.loan_id)===String(loan.id));
        const open=allRelated.filter(i=>i.status!=='paid'&&i.status!=='interest_only').sort((a,b)=>Number(a.number)-Number(b.number));
        const makeDate=(n)=>{const d=new Date(firstDue+'T12:00:00');const offset=interval==='weekly'?7*(n-1):interval==='biweekly'?15*(n-1):0;if(interval==='monthly')d.setMonth(d.getMonth()+n-1);else d.setDate(d.getDate()+offset);return d.toISOString().slice(0,10)};
        for(let idx=0;idx<open.length;idx++){const i=open[idx],number=Number(i.number)||idx+1;const due=makeDate(number);const upd={...i,due_date:due,amount:Number((installment).toFixed(2)),status:num(i.paid_amount)>0?'partial':'pending'};const savedI=await cloudUpsert('installments',upd);state.data.installments=[savedI,...state.data.installments.filter(x=>String(x.id)!==String(i.id))]}
        const nums=new Set(state.data.installments.filter(i=>String(i.loan_id)===String(loan.id)).map(i=>Number(i.number)));
        for(let n=1;n<=count;n++)if(!nums.has(n)){const row={id:uid(),user_id:state.user.id,loan_id:loan.id,number:n,due_date:makeDate(n),amount:installment,paid_amount:0,late_fee_paid_amount:0,paid_at:null,status:'pending',created_at:new Date().toISOString()};const savedI=await cloudUpsert('installments',row);state.data.installments=[savedI,...state.data.installments.filter(x=>String(x.id)!==String(savedI.id))]}
        saveCache();closeLoanEditModal();render();notify('Contrato atualizado. Histórico de recebimentos preservado.',true);
      }catch(err){console.error('editLoanContractV55',err);saveBtn.disabled=false;saveBtn.textContent='Salvar alterações';notify('Não foi possível atualizar o contrato: '+(err.message||err),false)}
    };
  };
  window.deleteLoanContractV56=async function(loanId){
    const loan=state.data.loans.find(x=>String(x.id)===String(loanId));
    if(!loan){notify('Contrato não encontrado.',false);return}
    const related=state.data.installments.filter(i=>String(i.loan_id)===String(loan.id));
    const paid=related.filter(i=>i.status==='paid'||i.status==='interest_only'||num(i.paid_amount)>0);
    if(paid.length){notify('Este contrato possui recebimentos registrados. Para preservar o histórico financeiro, não é possível excluí-lo por completo. Edite o contrato ou peça cancelamento mantendo o histórico.',false);return}
    const client=state.data.clients.find(c=>String(c.id)===String(loan.client_id))?.name||'cliente';
    if(!confirm(`Excluir definitivamente o contrato de ${client}?\n\nSerão excluídas ${related.length} parcela(s) ainda sem recebimento. Essa ação não pode ser desfeita.`))return;
    try{
      for(const i of related){const {error}=await sb.from('installments').delete().eq('id',i.id).eq('user_id',state.user.id);if(error)throw error}
      const {error}=await sb.from('loans').delete().eq('id',loan.id).eq('user_id',state.user.id);if(error)throw error;
      state.data.installments=state.data.installments.filter(i=>String(i.loan_id)!==String(loan.id));
      state.data.loans=state.data.loans.filter(l=>String(l.id)!==String(loan.id));saveCache();render();notify('Contrato e parcelas sem recebimentos excluídos.',true);
    }catch(err){console.error('deleteLoanContractV56',err);notify('Não foi possível excluir o contrato: '+(err.message||err),false)}
  };
  function installmentStatus(i){if(i.status==='paid')return 'Pago';if(i.status==='interest_only')return 'Juros recebido';if(i.status==='partial')return 'Parcial';if(i.status==='late')return 'Em atraso';if(i.due_date && i.due_date<new Date().toISOString().slice(0,10))return 'Em atraso';return 'Aberta'}
  function installments(){const rows=state.data.installments.map(i=>{const l=state.data.loans.find(x=>x.id===i.loan_id)||{},c=state.data.clients.find(x=>x.id===l.client_id)||{};const active=i.status!=='paid'&&i.status!=='interest_only';return `<tr><td>${esc(c.name||'—')}</td><td>${i.number}</td><td>${date(i.due_date)}</td><td>${money(i.amount)}</td><td>${money(i.paid_amount)}</td><td>${installmentStatus(i)}</td><td>${active?`<button class="mini" onclick="payInstallment('${i.id}')">Receber</button> <button class="mini" onclick="receiveInterestOnly('${i.id}')">Só juros</button>`:'—'}</td></tr>`}).join('');shell('Parcelas','Receba a parcela normalmente ou, quando houver renovação, registre somente os juros e mantenha o principal para o próximo ciclo de 30 dias.',`<div class="panel table"><table><thead><tr><th>Cliente</th><th>#</th><th>Vencimento</th><th>Valor</th><th>Recebido</th><th>Status</th><th>Ação</th></tr></thead><tbody>${rows||'<tr><td colspan="7">Nenhuma parcela.</td></tr>'}</tbody></table></div>`)}
  function acPaymentDialog({title='Receber pagamento',subtitle='',principal=0,interest=0,remaining=0,mode='choose'}){
    return new Promise(resolve=>{
      document.getElementById('ac-payment-modal')?.remove();
      const overlay=document.createElement('div');overlay.id='ac-payment-modal';overlay.className='ac-payment-overlay';
      const due=new Date();due.setDate(due.getDate()+30);const dueStr=`${due.getFullYear()}-${String(due.getMonth()+1).padStart(2,'0')}-${String(due.getDate()).padStart(2,'0')}`;
      overlay.innerHTML=`<section class="ac-payment-card" role="dialog" aria-modal="true" aria-labelledby="ac-payment-title"><header class="ac-payment-head"><div class="ac-payment-logo">AC</div><div class="ac-payment-heading"><h2 id="ac-payment-title">${title}</h2><p>${subtitle||'AC Empréstimos & Celulares'}</p></div><button type="button" class="ac-payment-close" aria-label="Fechar">×</button></header><div class="ac-payment-balance"><small>SALDO PENDENTE</small><strong>${money(remaining||principal)}</strong></div><div class="ac-payment-body">${mode==='choose'?`<p class="ac-payment-label">Como deseja receber?</p><button type="button" class="ac-payment-option selected" data-mode="full"><span class="ac-payment-option-icon">✓</span><span><b>Receber valor inteiro</b><small>Quitar o saldo pendente desta parcela.</small></span><span class="ac-payment-radio"></span></button><button type="button" class="ac-payment-option" data-mode="interest"><span class="ac-payment-option-icon">↻</span><span><b>Receber somente os juros</b><small>Manter o principal em aberto e escolher a nova cobrança.</small></span><span class="ac-payment-radio"></span></button><button type="button" class="ac-payment-option" data-mode="partial"><span class="ac-payment-option-icon">R$</span><span><b>Receber valor parcial</b><small>Informar quanto o cliente pagou agora.</small></span><span class="ac-payment-radio"></span></button><div class="ac-payment-field"><label for="ac-payment-value">Valor recebido (R$)</label><input id="ac-payment-value" inputmode="decimal" value="${(remaining||0).toFixed(2).replace('.',',')}" /></div><div class="ac-payment-field ac-payment-date hidden"><label for="ac-payment-due">Nova data de cobrança</label><input id="ac-payment-due" type="date" value="${dueStr}" /></div>`:`<p class="ac-payment-label">${mode==='interest'?'Confirmar recebimento somente dos juros':'Confirmar recebimento'}</p>`}</div><footer class="ac-payment-actions"><button type="button" class="ac-payment-cancel">Cancelar</button><button type="button" class="ac-payment-confirm">Continuar</button></footer></section>`;
      document.body.appendChild(overlay);let selected=mode==='interest'?'interest':'full';
      const value=overlay.querySelector('#ac-payment-value'),dateInput=overlay.querySelector('#ac-payment-due'),dateWrap=overlay.querySelector('.ac-payment-date');
      function close(v){overlay.remove();resolve(v)}
      overlay.querySelector('.ac-payment-close').onclick=()=>close(null);overlay.querySelector('.ac-payment-cancel').onclick=()=>close(null);overlay.addEventListener('click',e=>{if(e.target===overlay)close(null)});
      overlay.querySelectorAll('[data-mode]').forEach(btn=>btn.onclick=()=>{selected=btn.dataset.mode;overlay.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b===btn));dateWrap.classList.toggle('hidden',selected!=='interest');value.value=(selected==='interest'?interest:selected==='full'?remaining:0).toFixed(2).replace('.',',');const valueLabel=overlay.querySelector('label[for="ac-payment-value"]');if(valueLabel)valueLabel.textContent=selected==='interest'?'Valor de juros recebido (R$)':selected==='partial'?'Valor parcial recebido (R$)':'Valor total recebido (R$)';overlay.querySelector('.ac-payment-confirm').textContent=selected==='interest'?'Confirmar juros':selected==='partial'?'Confirmar valor parcial':'Confirmar recebimento integral';});
      overlay.querySelector('.ac-payment-confirm').onclick=()=>{const raw=String(value?.value||'').trim();const amount=num(raw);if(!Number.isFinite(amount)||amount<=0){value?.focus();return}if(selected==='interest'&&(!dateInput.value||dateInput.value<new Date().toISOString().slice(0,10))){dateInput.focus();return}if(selected==='full'&&amount+0.009<remaining){value?.focus();return}if(selected==='partial'&&amount>=remaining){value?.focus();return}close({mode:selected==='full'?'normal':selected,amount,dueDate:selected==='interest'?dateInput.value:null})};
      if(mode==='interest'){value.value=interest.toFixed(2).replace('.',',');const valueLabel=overlay.querySelector('label[for="ac-payment-value"]');if(valueLabel)valueLabel.textContent='Valor de juros recebido (R$)';overlay.querySelector('.ac-payment-confirm').textContent='Confirmar juros';}
    });
  }
  async function receiveInterestOnly(id,providedChoice=null){
    const i=state.data.installments.find(x=>x.id===id); if(!i||i.status==='paid'||i.status==='interest_only')return;
    const loan=state.data.loans.find(x=>x.id===i.loan_id); if(!loan)return notify('Empréstimo não encontrado.',false);
    const principal=num(loan.principal), rate=num(loan.monthly_rate), interest=loan.interest_type==='fixed'?num(loan.interest_value):principal*rate/100, nextAmount=principal+interest;
    if(interest<=0)return notify('Este empréstimo não possui juros mensais cadastrados.',false);
    const choice=providedChoice||await acPaymentDialog({title:'Receber somente os juros',subtitle:'O principal continuará em aberto',principal,interest,remaining:Math.max(0,num(i.amount)-num(i.paid_amount)),mode:'interest'});
    if(!choice)return;
    const received=choice.amount;
    const now=new Date(), nextDue=new Date(choice.dueDate+'T12:00:00');
    const currentUpdated={...i,paid_amount:received,status:'interest_only',paid_at:now.toISOString()};
    const nextNumber=Math.max(0,...state.data.installments.filter(x=>x.loan_id===loan.id).map(x=>Number(x.number)||0))+1;
    const next={id:uid(),user_id:state.user.id,loan_id:loan.id,number:nextNumber,due_date:nextDue.toISOString().slice(0,10),amount:nextAmount,paid_amount:0,paid_at:null,status:'pending',created_at:now.toISOString()};
    try{
      if(sb&&state.user&&state.user.id!=='demo'&&state.online){
        // First close the old cycle, then create the next one. If the insert fails,
        // restore the old installment so the client is not left without an active due date.
        const a=await sb.from('installments').update({paid_amount:received,status:'interest_only',paid_at:currentUpdated.paid_at}).eq('id',id).eq('user_id',state.user.id).select('*').maybeSingle();
        if(a.error)throw a.error; if(!a.data)throw new Error('O banco não confirmou o recebimento dos juros. Nenhum novo vencimento foi criado.');
        const b=await sb.from('installments').insert(next).select('*').single();
        if(b.error){
          const rollback=await sb.from('installments').update({paid_amount:i.paid_amount||0,status:i.status==='partial'?'partial':'pending',paid_at:i.paid_at||null}).eq('id',id).eq('user_id',state.user.id);
          if(rollback.error)console.error('Falha ao restaurar parcela anterior após erro ao criar nova cobrança:',rollback.error);
          throw new Error('Os juros não foram concluídos porque a nova cobrança não foi salva. '+b.error.message);
        }
        state.data.installments=[b.data,a.data,...state.data.installments.filter(x=>x.id!==id&&x.id!==next.id)];
      }else{
        state.data.installments=[next,currentUpdated,...state.data.installments.filter(x=>x.id!==id)];
        enqueue('upsert','installments',currentUpdated); enqueue('upsert','installments',next);
      }
      saveCache(); setStatus(); notify(`Juros de ${money(received)} registrado. Valor recebido: ${money(received)}. Principal mantido: ${money(principal)}. Próxima cobrança: ${date(next.due_date)}, no valor de ${money(nextAmount)}.`); render();
    }catch(err){console.error('interest-only',err);notify('Não foi possível confirmar o recebimento. Confira a conexão e o vencimento antes de tentar novamente: '+(err.message||err),false);await cloudLoad().catch(()=>{});render()}
  }
  async function payInstallment(id){
    const i=state.data.installments.find(x=>x.id===id); if(!i)return;
    const baseRemaining=Math.max(0,num(i.amount)-num(i.paid_amount));
    const loanForChoice=state.data.loans.find(x=>x.id===i.loan_id)||{};
    const lateSettings=loanForChoice.contract_settings||{};const todayKey=new Date().toISOString().slice(0,10);const daysLate=i.due_date<todayKey&&i.status!=='paid'?Math.max(0,Math.floor((new Date(todayKey+'T12:00:00')-new Date(i.due_date+'T12:00:00'))/86400000)):0;const feeAlready=num(i.late_fee_paid_amount);const calculatedFee=lateSettings.late_fee_type==='fixed_daily'?num(lateSettings.late_fee_value)*daysLate:lateSettings.late_fee_type==='percent_daily'?baseRemaining*num(lateSettings.late_fee_value)/100*daysLate:0;const feeRemaining=Math.max(0,calculatedFee-feeAlready);const remaining=baseRemaining+feeRemaining;
    const interestForChoice=num(loanForChoice.principal)*num(loanForChoice.monthly_rate)/100;
    const choice=await acPaymentDialog({title:'Receber pagamento',subtitle:'Escolha como deseja registrar este recebimento',principal:num(loanForChoice.principal),interest:interestForChoice,remaining,mode:'choose'});
    if(!choice)return;
    if(choice.mode==='interest'){await receiveInterestOnly(id,choice);return;}
    const received=choice.amount;
    if(received<=0)return notify('Informe um valor maior que zero.',false);
    const newPaid=Math.min(num(i.amount),num(i.paid_amount)+received);const allocatedToFee=Math.min(feeRemaining,Math.max(0,received-baseRemaining));const newFeePaid=feeAlready+allocatedToFee;const feeCleared=newFeePaid+0.009>=calculatedFee;
    const updated={...i,paid_amount:newPaid,late_fee_paid_amount:newFeePaid,status:newPaid+0.009>=num(i.amount)&&feeCleared?'paid':'partial',paid_at:newPaid+0.009>=num(i.amount)&&feeCleared?new Date().toISOString():null};
    try{
      if(sb&&state.user&&state.user.id!=='demo'&&state.online){
        const {data,error}=await sb.from('installments').update({paid_amount:updated.paid_amount,late_fee_paid_amount:updated.late_fee_paid_amount,status:updated.status,paid_at:updated.paid_at}).eq('id',id).eq('user_id',state.user.id).select('*').maybeSingle();
        if(error)throw error;
        if(!data)throw new Error('O banco não confirmou a atualização da parcela. Verifique o usuário conectado e as permissões.');
        state.data.installments=[data,...state.data.installments.filter(x=>x.id!==id)];
        await cloudLoad();
      }else{
        state.data.installments=[updated,...state.data.installments.filter(x=>x.id!==id)];
        enqueue('upsert','installments',updated);
      }
      saveCache();
      const loanId=updated.loan_id;
      const loan=state.data.loans.find(x=>x.id===loanId);
      if(loan){
        const all=state.data.installments.filter(x=>x.loan_id===loanId);
        if(all.length && all.every(x=>x.status==='paid')){
          const loanUpdated={...loan,status:'paid'};
          if(sb&&state.user&&state.user.id!=='demo'&&state.online){
            const {data,error}=await sb.from('loans').update({status:'paid'}).eq('id',loanId).eq('user_id',state.user.id).select().single();
            if(error)throw error;
            state.data.loans=[data,...state.data.loans.filter(x=>x.id!==loanId)];
          }else{
            state.data.loans=[loanUpdated,...state.data.loans.filter(x=>x.id!==loanId)];
            enqueue('upsert','loans',loanUpdated);
          }
        }
      }
      saveCache(); setStatus(); notify('Recebimento salvo e confirmado na nuvem.'); render();
    }catch(err){
      console.error('payment update',err);
      notify('Não foi possível salvar o recebimento na nuvem: '+(err.message||err),false);
      await cloudLoad().catch(()=>{}); render();
    }
  }
  function isIPhoneBrand(brand){return /iphone|apple/i.test(String(brand||''));}
  function togglePhoneBatteryField(){
    const wrap=$('pBatteryWrap'), brand=$('pbrand');
    if(!wrap||!brand)return;
    const show=isIPhoneBrand(brand.value);
    wrap.classList.toggle('hidden',!show);
    const battery=$('pbattery');
    if(battery){battery.required=false;if(!show)battery.value='';}
  }
  function storageLabel(gb){const n=Number(gb)||0;return n>=1024&&n%1024===0?(n/1024)+' TB':n?n+' GB':'—';}
  function phoneImages(phone){
    const raw=phone?.image_data;
    if(!raw)return [];
    if(Array.isArray(raw))return raw.filter(x=>typeof x==='string'&&x.startsWith('data:image/'));
    if(typeof raw==='string'&&raw.trim().startsWith('[')){try{const parsed=JSON.parse(raw);if(Array.isArray(parsed))return parsed.filter(x=>typeof x==='string'&&x.startsWith('data:image/'));}catch{}}
    return typeof raw==='string'&&raw.startsWith('data:image/')?[raw]:[];
  }
  function phoneImageMarkup(phone, cls='phone-stock-image'){
    const images=phoneImages(phone);
    return images.length?`<div class="phone-image-gallery ${cls==='phone-stock-image'?'phone-image-gallery-stock':''}">${images.map((src,i)=>`<img class="${cls}" src="${src}" alt="${esc((phone.brand||'')+' '+(phone.model||''))} — foto ${i+1}" loading="lazy">`).join('')}</div>`:`<div class="${cls} phone-stock-no-image">📱</div>`;
  }
  function phoneShareText(phone){
    const details=[
      '📱 *AC CELULARES — Aparelho disponível*',
      '',
      `📲 *Modelo:* ${String(((phone.brand||'')+' '+(phone.model||'')).trim()||'Celular')}`,
      `💾 *Armazenamento:* ${storageLabel(phone.storage_gb)}`,
      ...(isIPhoneBrand(phone.brand)&&phone.battery_health?[`🔋 *Saúde da bateria:* ${num(phone.battery_health)}%`]:[]),
      `📦 *Estoque:* ${num(phone.stock)>0?'Disponível':'Consulte disponibilidade'}`,
      `💰 *Preço:* ${money(phone.sale_price)}`,
      '',
      '📲 Chame para mais informações!',
      '*AC CELULARES*'
    ];
    return details.join('\n');
  }
  function safePhoneFileName(phone){
    const base=(((phone.brand||'')+' '+(phone.model||'Celular')).trim()).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'celular';
    return base+'.jpg';
  }
  window.sharePhoneOnWhatsApp=async function(phoneId){
    const phone=state.data.phones.find(p=>String(p.id)===String(phoneId));
    if(!phone)return notify('Celular não encontrado.',false);
    const text=phoneShareText(phone), image=phoneImages(phone)[0];
    if(image){
      try{
        const response=await fetch(image);
        const blob=await response.blob();
        const file=new File([blob],safePhoneFileName(phone),{type:blob.type||'image/jpeg'});
        if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
          await navigator.share({title:((phone.brand||'')+' '+(phone.model||'Celular')).trim(),text,files:[file]});
          return;
        }
        const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
        window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener,noreferrer');
        notify('A foto foi baixada. Anexe-a na conversa do WhatsApp que foi aberta.');
        return;
      }catch(err){
        if(err&&err.name==='AbortError')return;
        try{window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener,noreferrer');notify('Não foi possível anexar a foto automaticamente. Envie a foto do aparelho manualmente no WhatsApp.');return;}catch{}
      }
    }
    window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener,noreferrer');
    if(!image)notify('Este celular não tem foto cadastrada. Foi preparada somente a mensagem com os dados.');
  };
  function phones(){
    shell('Celulares','Controle de estoque, armazenamento, saúde da bateria, IMEI e preços',`<div class="panel"><form class="form" onsubmit="addPhone(event)"><input id="pbrand" placeholder="Marca (ex.: Apple, Samsung)" required oninput="togglePhoneBatteryField()"><input id="pmodel" placeholder="Modelo" required><select id="pstorage" aria-label="Armazenamento"><option value="">Armazenamento (GB)</option><option value="32">32 GB</option><option value="64">64 GB</option><option value="128">128 GB</option><option value="256">256 GB</option><option value="512">512 GB</option><option value="1024">1 TB (1024 GB)</option><option value="2048">2 TB (2048 GB)</option></select><div id="pBatteryWrap" class="hidden"><input id="pbattery" type="number" min="1" max="100" step="1" placeholder="Saúde da bateria (%)"></div><input id="pimei" placeholder="IMEI"><input id="pcost" type="number" step="0.01" min="0" placeholder="Custo"><input id="psale" type="number" step="0.01" min="0" placeholder="Preço de venda"><input id="pstock" type="number" min="0" placeholder="Quantidade" value="1"><label class="op-upload">📷 Fotos do celular (até 6)<input id="pimage" type="file" accept="image/*" multiple onchange="previewPhoneImages(event,'pImagePreview')"></label><div id="pImagePreview" class="op-preview phone-multi-preview"><span>Selecione até 6 fotos</span></div><button>Cadastrar</button></form><p class="muted">A saúde da bateria aparece somente quando a marca for Apple/iPhone. Os campos novos são opcionais para não bloquear cadastros antigos.</p></div><div class="panel table phone-stock-desktop"><table><thead><tr><th>Foto</th><th>Marca</th><th>Modelo</th><th>Armazenamento</th><th>Bateria</th><th>IMEI</th><th>Custo</th><th>Venda</th><th>Estoque</th><th></th></tr></thead><tbody>${state.data.phones.map(p=>`<tr><td>${phoneImages(p).length?`<div class="phone-image-gallery phone-image-gallery-table">${phoneImages(p).slice(0,3).map((src,i)=>`<img class="phone-thumb" src="${src}" alt="${esc((p.brand||'')+' '+(p.model||''))} foto ${i+1}">`).join('')}${phoneImages(p).length>3?`<span class="phone-more-photos">+${phoneImages(p).length-3}</span>`:''}</div>`:`<span class="phone-no-thumb">Sem foto</span>`}</td><td>${esc(p.brand)}</td><td>${esc(p.model)}</td><td>${storageLabel(p.storage_gb)}</td><td>${isIPhoneBrand(p.brand)&&p.battery_health?num(p.battery_health)+'%':'—'}</td><td>${esc(p.imei)}</td><td>${money(p.cost)}</td><td>${money(p.sale_price)}</td><td>${num(p.stock)}</td><td><button class="mini" onclick="sharePhoneOnWhatsApp('${p.id}')">Enviar para WhatsApp</button> <button class="mini" onclick="editPhone('${p.id}')">Editar</button> <button class="mini" onclick="removeItem('phones','${p.id}')">Excluir</button></td></tr>`).join('')||'<tr><td colspan="10">Estoque vazio.</td></tr>'}</tbody></table></div><div class="phone-stock-mobile">${state.data.phones.map(p=>`<article class="phone-stock-card">${phoneImages(p).length?`<div class="phone-image-gallery phone-image-gallery-stock">${phoneImages(p).slice(0,4).map((src,i)=>`<img class="phone-stock-image" src="${src}" alt="${esc((p.brand||'')+' '+(p.model||''))} foto ${i+1}">`).join('')}${phoneImages(p).length>4?`<span class="phone-more-photos">+${phoneImages(p).length-4}</span>`:''}</div>`:`<div class="phone-stock-image phone-stock-no-image">📱</div>`}<div class="phone-stock-info"><div class="phone-stock-title"><strong>${esc((p.brand||'')+' '+(p.model||''))}</strong><span class="phone-stock-badge">${num(p.stock)>0?'Em estoque':'Sem estoque'}</span></div><div class="phone-stock-sub">${storageLabel(p.storage_gb)}${isIPhoneBrand(p.brand)&&p.battery_health?' · Bateria '+num(p.battery_health)+'%':''}</div><div class="phone-stock-sub">IMEI: ${esc(p.imei||'—')}</div><div class="phone-stock-prices"><span>Custo <b>${money(p.cost)}</b></span><span>Venda <b>${money(p.sale_price)}</b></span></div><div class="phone-stock-actions"><button class="mini" onclick="sharePhoneOnWhatsApp('${p.id}')">Enviar para WhatsApp</button><button class="mini" onclick="editPhone('${p.id}')">Editar</button><button class="mini" onclick="removeItem('phones','${p.id}')">Excluir</button></div></div></article>`).join('')||'<div class="empty">Estoque vazio.</div>'}</div>`);
    togglePhoneBatteryField();
  }
  async function editPhone(id){
    const p=state.data.phones.find(x=>x.id===id); if(!p)return notify('Celular não encontrado.',false);
    const old=document.getElementById('phoneEditDialog'); if(old)old.remove();
    const storageOptions=[['','Não informado'],['32','32 GB'],['64','64 GB'],['128','128 GB'],['256','256 GB'],['512','512 GB'],['1024','1 TB'],['2048','2 TB'],['4096','4 TB']];
    const batteryOptions=[['','Não informada'],...Array.from({length:100},(_,i)=>[String(i+1),`${i+1}%`])];
    const opts=(arr,current)=>arr.map(([v,l])=>`<option value="${v}" ${String(current??'')===v?'selected':''}>${l}</option>`).join('');
    const dialog=document.createElement('div'); dialog.id='phoneEditDialog'; dialog.className='ac-edit-overlay';
    dialog.innerHTML=`<section class="ac-edit-card" role="dialog" aria-modal="true" aria-labelledby="phoneEditTitle"><h3 id="phoneEditTitle">Editar celular</h3><p class="muted">Altere os dados do cadastro existente.</p><form id="phoneEditForm" class="ac-edit-form"><label>Marca<input id="editPhoneBrand" required value="${esc(p.brand||'')}"></label><label>Modelo<input id="editPhoneModel" required value="${esc(p.model||'')}"></label><label class="op-upload">📷 Fotos do celular (até 6)<input id="editPhoneImage" type="file" accept="image/*" multiple onchange="previewPhoneImages(event,'editPhoneImagePreview',true)"></label><div id="editPhoneImagePreview" class="op-preview phone-multi-preview">${phoneImages(p).length?phoneImages(p).map((src,i)=>`<img src="${src}" alt="Foto ${i+1} do celular">`).join(''):'<span>Sem foto cadastrada</span>'}</div><button type="button" class="mini" id="removePhoneImage">Remover todas as fotos</button><label>Armazenamento<select id="editPhoneStorage">${opts(storageOptions,p.storage_gb==null?'':String(p.storage_gb))}</select></label><label id="editBatteryLabel">Saúde da bateria<select id="editPhoneBattery">${opts(batteryOptions,p.battery_health==null?'':String(p.battery_health))}</select></label><label>IMEI<input id="editPhoneImei" value="${esc(p.imei||'')}"></label><label>Custo (R$)<input id="editPhoneCost" type="number" min="0" step="0.01" required value="${num(p.cost)}"></label><label>Preço de venda (R$)<input id="editPhoneSale" type="number" min="0" step="0.01" required value="${num(p.sale_price)}"></label><label>Quantidade em estoque<input id="editPhoneStock" type="number" min="0" step="1" required value="${num(p.stock)}"></label><div class="ac-edit-actions"><button type="button" class="mini" id="cancelPhoneEdit">Cancelar</button><button type="submit" class="primary" id="savePhoneEdit">Salvar alterações</button></div></form></section>`;
    document.body.appendChild(dialog);
    const batteryLabel=document.getElementById('editBatteryLabel');
    const syncBattery=()=>{batteryLabel.classList.toggle('hidden',!isIPhoneBrand(document.getElementById('editPhoneBrand').value));};
    document.getElementById('editPhoneBrand').addEventListener('input',syncBattery); syncBattery();
    const imagePreview=document.getElementById('editPhoneImagePreview'); imagePreview.dataset.images=JSON.stringify(phoneImages(p));
    document.getElementById('removePhoneImage').addEventListener('click',()=>{imagePreview.dataset.images='[]';imagePreview.innerHTML='<span>Sem foto cadastrada</span>';document.getElementById('editPhoneImage').value='';});
    const close=()=>dialog.remove();
    document.getElementById('cancelPhoneEdit').addEventListener('click',close);
    dialog.addEventListener('click',e=>{if(e.target===dialog)close()});
    document.getElementById('phoneEditForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const brand=document.getElementById('editPhoneBrand').value.trim(), model=document.getElementById('editPhoneModel').value.trim();
      const storageValue=document.getElementById('editPhoneStorage').value, storage=storageValue===''?null:Number(storageValue);
      const batteryValue=document.getElementById('editPhoneBattery').value, battery=isIPhoneBrand(brand)&&batteryValue!==''?Number(batteryValue):null;
      const cost=Number(document.getElementById('editPhoneCost').value), sale=Number(document.getElementById('editPhoneSale').value), stock=Number(document.getElementById('editPhoneStock').value);
      if(!brand||!model||!Number.isFinite(cost)||cost<0||!Number.isFinite(sale)||sale<0||!Number.isInteger(stock)||stock<0)return notify('Confira marca, modelo, custos, preço e estoque.',false);
      const updated={...p,brand,model,storage_gb:storage,battery_health:battery,imei:document.getElementById('editPhoneImei').value.trim(),cost,sale_price:sale,stock,image_data:JSON.stringify(JSON.parse(document.getElementById('editPhoneImagePreview').dataset.images||'[]'))};
      const save=document.getElementById('savePhoneEdit'); save.disabled=true; save.textContent='Salvando…';
      try{await mutate('phones',updated);close();notify('Cadastro do celular atualizado.');render();}
      catch(err){save.disabled=false;save.textContent='Salvar alterações';notify('Não foi possível atualizar o celular: '+(err.message||err),false);}
    });
  }
  async function addPhone(e){
    e.preventDefault();
    const brand=$('pbrand').value.trim();
    const rawBattery=$('pbattery')?.value;
    const battery=isIPhoneBrand(brand)&&rawBattery!==''?parseInt(rawBattery,10):null;
    if(battery!==null&&(!Number.isInteger(battery)||battery<1||battery>100)){return notify('A saúde da bateria deve ficar entre 1% e 100%.',false);}
    const row={id:uid(),user_id:state.user.id,brand,model:$('pmodel').value.trim(),storage_gb:parseInt($('pstorage').value,10)||null,battery_health:battery,imei:$('pimei').value.trim(),cost:num($('pcost').value),sale_price:num($('psale').value),stock:parseInt($('pstock').value)||0,image_data:JSON.stringify(JSON.parse($('pImagePreview')?.dataset.images||'[]')),created_at:new Date().toISOString()};
    try{await mutate('phones',row);e.target.reset();const preview=$('pImagePreview');if(preview){preview.dataset.images='[]';preview.innerHTML='<span>Selecione até 6 fotos</span>';}togglePhoneBatteryField();render();}catch(err){notify('Não foi possível cadastrar celular: '+(err.message||err),false);}
  }
  window.previewPhoneImages=async function(e,previewId,keepExisting=false){
    const input=e.target,preview=$(previewId);if(!preview)return;
    const selected=Array.from(input.files||[]);if(!selected.length)return;
    if(selected.some(f=>!f.type.startsWith('image/'))){alert('Selecione somente arquivos de imagem.');input.value='';return;}
    if(selected.some(f=>f.size>12*1024*1024)){alert('Cada foto deve ter até 12 MB.');input.value='';return;}
    const existing=keepExisting?(()=>{try{return JSON.parse(preview.dataset.images||'[]')}catch{return []}})():[];
    if(existing.length+selected.length>6){alert('É possível manter até 6 fotos por celular.');input.value='';return;}
    try{
      const converted=await Promise.all(selected.map(file=>new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{const img=new Image();img.onload=()=>{const max=1000,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',0.66));};img.onerror=reject;img.src=reader.result;};reader.readAsDataURL(file);
      })));
      const images=[...existing,...converted];preview.dataset.images=JSON.stringify(images);preview.innerHTML=images.map((src,i)=>`<div class="phone-preview-item"><img src="${src}" alt="Foto ${i+1}"><span>Foto ${i+1}</span><button type="button" class="mini" onclick="removePhonePreviewImage('${previewId}',${i})">Remover</button></div>`).join('');
      input.value='';
    }catch{alert('Não foi possível ler uma das imagens.');input.value='';}
  };
  window.previewPhoneImage=window.previewPhoneImages;
  window.removePhonePreviewImage=function(previewId,index){const preview=$(previewId);if(!preview)return;let images=[];try{images=JSON.parse(preview.dataset.images||'[]')}catch{}images.splice(index,1);preview.dataset.images=JSON.stringify(images);preview.innerHTML=images.length?images.map((src,i)=>`<div class="phone-preview-item"><img src="${src}" alt="Foto ${i+1}"><span>Foto ${i+1}</span><button type="button" class="mini" onclick="removePhonePreviewImage('${previewId}',${i})">Remover</button></div>`).join(''):'<span>Nenhuma foto selecionada</span>';};
  function otherProducts(){
    const products=state.data.other_products||[];
    shell('Outros produtos','Cadastre acessórios e produtos que não são celulares, com foto, preço e estoque',`<div class="panel"><h3>➕ Cadastrar produto</h3><form id="otherProductForm" class="form" onsubmit="addOtherProduct(event)"><input id="opName" placeholder="Nome do produto" required><select id="opCategory"><option>Acessórios</option><option>Fones de ouvido</option><option>Carregadores</option><option>Capas e películas</option><option>Smartwatch</option><option>Caixas de som</option><option>Informática</option><option>Outros</option></select><input id="opCost" type="number" min="0" step="0.01" placeholder="Custo (R$)" required><input id="opPrice" type="number" min="0" step="0.01" placeholder="Preço de venda (R$)" required><input id="opStock" type="number" min="0" step="1" value="1" placeholder="Quantidade" required><label class="op-upload">📷 Foto do produto<input id="opImage" type="file" accept="image/*" onchange="previewOtherProductImage(event)"></label><div id="opImagePreview" class="op-preview"><span>Prévia da imagem</span></div><button type="submit">Cadastrar produto</button></form><p class="muted">A foto é reduzida antes de salvar para diminuir o tamanho. A tabela separada mantém esses itens fora do estoque de celulares.</p></div><div class="panel"><div class="panel-title"><h3>📦 Produtos cadastrados</h3><span>${products.length} item(ns)</span></div><div class="op-grid">${products.map(x=>`<article class="op-card">${x.image_data?`<img src="${x.image_data}" alt="${esc(x.name)}">`:'<div class="op-no-image">Sem foto</div>'}<div class="op-card-body"><b>${esc(x.name)}</b><small>${esc(x.category||'Outros')} • Estoque: ${num(x.stock)}</small><div class="op-prices"><span>Custo ${money(x.cost)}</span><strong>${money(x.sale_price)}</strong></div><button class="mini" onclick="removeItem('other_products','${x.id}')">Excluir</button></div></article>`).join('')||'<div class="empty">Nenhum produto cadastrado ainda.</div>'}</div></div>`);
    const file=$('opImage'); if(file)file.value='';
  }
  window.previewOtherProductImage=async function(e){const file=e.target.files?.[0],preview=$('opImagePreview');if(!file||!preview)return;if(!file.type.startsWith('image/')){alert('Selecione um arquivo de imagem.');e.target.value='';return;}try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{const img=new Image();img.onload=()=>{const max=900,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',0.72));};img.onerror=reject;img.src=reader.result;};reader.readAsDataURL(file);});preview.innerHTML=`<img src="${data}" alt="Prévia do produto">`;preview.dataset.image=data;}catch{alert('Não foi possível ler essa imagem.');e.target.value='';}};
  window.addOtherProduct=async function(e){e.preventDefault();const name=$('opName').value.trim(),cost=Number($('opCost').value),sale=Number($('opPrice').value),stock=Math.max(0,parseInt($('opStock').value,10)||0),image=$('opImagePreview').dataset.image||null;if(!name||!Number.isFinite(cost)||!Number.isFinite(sale)){alert('Confira nome e preços do produto.');return;}if(!state.user||state.user.id==='demo'){alert('Entre com sua conta para salvar produtos.');return;}const row={id:uid(),user_id:state.user.id,name,category:$('opCategory').value,cost,sale_price:sale,stock,image_data:image,created_at:new Date().toISOString()};try{await mutate('other_products',row);notify('Produto cadastrado.');render();}catch(err){alert('Não foi possível salvar o produto: '+(err.message||err));}};
  function sales(){shell('Vendas','Registre a venda e baixe o estoque automaticamente',`<div class="panel"><form class="form" onsubmit="addSale(event)"><select id="sclient"><option value="">Cliente (opcional)</option>${state.data.clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><select id="sphone" required onchange="previewSalePhonePhotos()"><option value="">Celular disponível</option>${state.data.phones.filter(p=>num(p.stock)>0).map(p=>`<option value="${p.id}">${esc(p.brand)} ${esc(p.model)} • ${money(p.sale_price)} • estoque ${p.stock}</option>`).join('')}</select><div id="salePhonePhotos" class="sale-phone-photos"><span class="muted">As fotos do aparelho selecionado aparecerão aqui.</span></div><input id="sqty" type="number" min="1" value="1" placeholder="Qtd"><button>Registrar venda</button></form></div><div class="sales-individual-list">${state.data.sales.map(s=>{const c=state.data.clients.find(x=>x.id===s.client_id)||{},p=state.data.phones.find(x=>x.id===s.phone_id)||{};const total=money(s.total||num(s.unit_price)*num(s.quantity));return `<article class="sale-individual-card"><div class="sale-card-head"><div class="sale-card-icon">AC</div><div class="sale-card-heading"><strong>${esc((p.brand||'')+' '+(p.model||'Celular'))}</strong><small>Venda • ${date(s.created_at)}</small></div><span class="sale-card-tag">Registrada</span></div><div class="sale-card-details"><div><small>Cliente</small><strong>${esc(c.name||'Venda avulsa')}</strong></div><div><small>Quantidade</small><strong>${esc(String(s.quantity??1))}</strong></div></div><div class="sale-card-total"><span>Total da venda</span><strong>${total}</strong></div></article>`}).join('')||'<div class="empty sales-empty">Nenhuma venda registrada.</div>'}</div>`)}
  window.previewSalePhonePhotos=function(){const host=$('salePhonePhotos'),phone=state.data.phones.find(p=>p.id===$('sphone')?.value);if(!host)return;const images=phoneImages(phone);host.innerHTML=images.length?`<div class="sale-phone-gallery">${images.map((src,i)=>`<img src="${src}" alt="Foto ${i+1} do aparelho para venda" loading="lazy">`).join('')}</div><small>${images.length} foto(s) cadastrada(s) para este aparelho</small>`:'<span class="muted">Este aparelho não tem fotos cadastradas.</span>';};
  async function addSale(e){
    e.preventDefault();
    const phone=state.data.phones.find(p=>p.id===$('sphone').value),qty=Math.max(1,parseInt($('sqty').value,10)||1);
    if(!phone||num(phone.stock)<qty)return alert('Estoque insuficiente.');
    if(!sb||!state.user||state.user.id==='demo'||!state.online)return alert('Para registrar uma venda com baixa segura de estoque, conecte-se à internet e entre na conta da AC. Nenhum registro foi alterado.');
    const sale={id:uid(),client_id:$('sclient').value||null,phone_id:phone.id,quantity:qty,unit_price:num(phone.sale_price),created_at:new Date().toISOString()};
    const btn=e.submitter;if(btn)btn.disabled=true;
    try{
      const {data,error}=await sb.rpc('ac_register_phone_sale_atomic',{p_sale:sale});
      if(error)throw error;
      const result=Array.isArray(data)?data[0]:data;
      if(!result?.sale||!result?.phone)throw new Error('O banco não confirmou todos os dados da venda. Atualize a tela antes de tentar novamente.');
      state.data.sales=[result.sale,...state.data.sales.filter(x=>x.id!==result.sale.id)];
      state.data.phones=[result.phone,...state.data.phones.filter(x=>x.id!==result.phone.id)];saveCache();e.target.reset();render();notify('Venda registrada e estoque atualizado na nuvem.');
    }catch(err){console.error('Falha ao registrar venda atômica',err);alert('A venda não foi confirmada: '+(err.message||'erro de conexão')+'. Confira o estoque e as vendas antes de tentar novamente.');}
    finally{if(btn)btn.disabled=false;}
  }
  function reports(){
    const d=state.data, pf=state.data.phone_finances||[], pfi=state.data.phone_finance_installments||[], ex=getExpenses();
    const loanCapital=d.loans.filter(l=>l.status==='active'||l.status==='paid').reduce((s,l)=>s+num(l.principal),0);
    const loanRevenue=d.loans.filter(l=>l.status==='active'||l.status==='paid').reduce((s,l)=>s+num(l.installment_amount)*num(l.installments_count),0);
    const loanProfit=loanRevenue-loanCapital;
    const loanReceived=d.installments.reduce((s,i)=>s+num(i.paid_amount),0);
    const pfRevenue=pf.reduce((s,f)=>s+num(f.entry)+pfi.filter(i=>i.phone_finance_id===f.id).reduce((a,i)=>a+num(i.amount),0),0);
    const pfReceived=pf.reduce((s,f)=>s+num(f.entry)+pfi.filter(i=>i.phone_finance_id===f.id).reduce((a,i)=>a+num(i.paid_amount),0),0);
    const pfCost=pf.reduce((s,f)=>s+num(f.cost),0);
    const salesRevenue=d.sales.reduce((s,x)=>s+num(x.total||num(x.unit_price)*num(x.quantity)),0);
    const salesCost=d.sales.reduce((s,x)=>{const ph=d.phones.find(p=>p.id===x.phone_id);return s+num(x.cost_at_sale??x.cost??ph?.cost)*num(x.quantity)},0);
    const salesProfit=salesRevenue-salesCost;
    const phoneProfit=(pfRevenue-pfCost)+salesProfit;
    const gross=loanProfit+phoneProfit, expenseTotal=ex.reduce((s,x)=>s+num(x.amount),0), net=gross-expenseTotal;
    const stockCost=d.phones.reduce((s,p)=>s+num(p.cost)*num(p.stock),0);
    shell('Financeiro','Lucro projetado, realizado, custos, despesas e capital da operação',`<div class="cards"><div class="card"><small>💰 Lucro projetado bruto</small><strong>${money(gross)}</strong><span>Empréstimos + celulares</span></div><div class="card"><small>🧾 Despesas</small><strong>${money(expenseTotal)}</strong><span>Custos operacionais registrados</span></div><div class="card"><small>🟢 Resultado após despesas</small><strong>${money(net)}</strong><span>Indicador gerencial</span></div><div class="card"><small>📦 Capital em estoque</small><strong>${money(stockCost)}</strong><span>Custo dos celulares disponíveis</span></div></div><div class="grid2"><div class="panel"><div class="panel-title"><h3>💳 Empréstimos</h3></div><div class="item">Capital: <b>${money(loanCapital)}</b><br>Receita contratada: <b>${money(loanRevenue)}</b><br>Recebido: <b>${money(loanReceived)}</b><br>Lucro projetado: <b>${money(loanProfit)}</b></div></div><div class="panel"><div class="panel-title"><h3>📱 Celulares</h3></div><div class="item">Receita de financiamentos: <b>${money(pfRevenue)}</b><br>Recebido em financiamentos: <b>${money(pfReceived)}</b><br>Receita de vendas: <b>${money(salesRevenue)}</b><br>Custo dos celulares negociados: <b>${money(pfCost+salesCost)}</b><br>Lucro projetado: <b>${money(phoneProfit)}</b></div></div></div><div class="panel"><div class="panel-title"><h3>📊 Resultado por categoria</h3><button onclick="go('expenses')">Gerenciar despesas</button></div><div class="item">Empréstimos: <b>${money(loanProfit)}</b><br>Financiamentos: <b>${money(pfRevenue-pfCost)}</b><br>Vendas: <b>${money(salesProfit)}</b><br>Despesas: <b>-${money(expenseTotal)}</b><hr><b>Resultado gerencial: ${money(net)}</b></div></div><div class="panel"><button onclick="backup()">Exportar backup JSON</button></div>`)
  }
  function settings(){shell('Configurações','Conta e operação',`<div class="panel"><p><b>Usuário:</b> ${esc(state.user?.email||'demo')}</p><p><b>Banco:</b> ${sb?'Supabase':'Modo demo'}</p><p><b>Sincronização:</b> ${state.queue.length?state.queue.length+' pendência(s)':'Em dia'}</p><button onclick="backup()">Fazer backup local</button></div><div class="panel"><h3>Uso responsável</h3><p>O módulo de crédito diferencia simulação de operação contratada. Antes de conceder crédito ao público, valide requisitos legais, regulatórios, tributários e contratuais aplicáveis ao seu negócio.</p></div>`)}
  function backup(){const blob=new Blob([JSON.stringify({exported_at:new Date().toISOString(),data:state.data},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ac-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  window.openLoanAttachment=async function(loanId,index){try{const loan=state.data.loans.find(x=>String(x.id)===String(loanId)),file=loan?.attachments?.[index];if(!file?.path||!sb)throw new Error('Anexo não encontrado ou sessão indisponível.');const {data,error}=await sb.storage.from('loan-contract-attachments').createSignedUrl(file.path,120);if(error)throw error;if(!data?.signedUrl)throw new Error('Não foi possível gerar o link privado do anexo.');window.open(data.signedUrl,'_blank','noopener,noreferrer')}catch(err){notify('Não foi possível abrir o anexo: '+(err.message||err),false)}};window.go=go;window.globalSearch=globalSearch;window.togglePhoneBatteryField=togglePhoneBatteryField;window.addClient=addClient;window.importPhoneContact=importPhoneContact;window.addLoan=addLoan;window.addPhone=addPhone;window.editPhone=editPhone;window.addSale=addSale;window.payInstallment=payInstallment;window.receiveInterestOnly=receiveInterestOnly;window.removeItem=remove;window.backup=backup;window.calcLoan=calcLoan;window.addExpense=addExpense;window.deleteExpense=deleteExpense;window.setClientLimit=setClientLimit;window.sendCollection=sendCollection;
  document.querySelectorAll('nav button[data-p]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.p)));
  document.querySelectorAll('[data-mobile-p]').forEach(b=>b.addEventListener('click',()=>{go(b.dataset.mobileP);document.querySelectorAll('[data-mobile-p]').forEach(x=>{x.classList.toggle('active',x===b);if(x===b)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current')})}));
  const navToggle=$('navToggle'); if(navToggle){navToggle.addEventListener('click',()=>{const opened=document.body.classList.toggle('nav-open');navToggle.setAttribute('aria-expanded',String(opened));navToggle.setAttribute('aria-label',opened?'Fechar menu':'Abrir menu');});document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{if(window.matchMedia('(max-width: 760px)').matches){document.body.classList.remove('nav-open');navToggle.setAttribute('aria-expanded','false');}}));document.addEventListener('click',e=>{if(window.matchMedia('(max-width: 760px)').matches&&document.body.classList.contains('nav-open')&&!e.target.closest('nav')&&!e.target.closest('#navToggle')){document.body.classList.remove('nav-open');navToggle.setAttribute('aria-expanded','false');}})}
  $('enter').addEventListener('click',()=>state.mode==='signup'?authSignup():authLogin());$('signup').addEventListener('click',()=>{state.mode=state.mode==='signup'?'login':'signup';const signup=state.mode==='signup';$('name').classList.toggle('hidden',!signup);$('enter').textContent=signup?'Criar conta':'Entrar';$('signup').textContent=signup?'Voltar ao login':'Criar acesso';$('authMode').textContent=signup?'Crie seu acesso seguro':'Acesso seguro na nuvem';$('msg').textContent='';});$('reset').addEventListener('click',resetPassword);$('out').addEventListener('click',logout);
  $('pass').addEventListener('keydown',e=>{if(e.key==='Enter')authLogin()});
  window.addEventListener('online',async()=>{state.online=true;setStatus();if(state.user&&sb&&state.user.id!=='demo'){try{await flush()}catch(e){console.warn(e)}}render()});window.addEventListener('offline',()=>{state.online=false;setStatus();render()});
  loadCache();
  (async()=>{if(sb){const {data}=await sb.auth.getSession();if(data.session){state.session=data.session;state.user=data.session.user;await enterApp();return}}setStatus()})();
window.AC_STATE=state;window.AC_NUM=num;window.AC_UID=uid;window.AC_CLIENT_CREDIT_INFO=clientCreditInfo;window.AC_MUTATE=mutate;window.AC_RENDER=render;window.AC_ESC=esc;window.AC_RPC=async(name,args)=>{if(!sb||!state.user||state.user.id==='demo'||!state.online)throw new Error('Conexão autenticada com a nuvem necessária.');return await sb.rpc(name,args)};
})();


/* AC V5.4 Cloud — Financiamento de celulares */
(function(){
  const brl=x=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(x)||0);
  const addMonths=(date,months)=>{const d=new Date(date+'T12:00:00');d.setMonth(d.getMonth()+months);return d.toISOString().slice(0,10)};
  const payment=(principal,ratePct,n)=>{const p=Number(principal)||0,r=(Number(ratePct)||0)/100,q=Math.max(1,Number(n)||1);return r?p*r*Math.pow(1+r,q)/(Math.pow(1+r,q)-1):p/q};
  window.selectPhoneForFinanceV51=function(){const id=document.getElementById('pfPhone')?.value,p=window.AC_STATE.data.phones.find(x=>x.id===id);if(!p)return;document.getElementById('pfModel').value=((p.brand||'')+' '+(p.model||'')).trim();document.getElementById('pfImei').value=p.imei||'';document.getElementById('pfPrice').value=Number(p.sale_price||0).toFixed(2)};
  window.createPhoneFinanceV51=async function(){
    const btn=document.querySelector('#pfPhone')?.closest('.form')?.querySelector('button')||null;
    try{
      const S=window.AC_STATE,id=document.getElementById('pfPhone').value,phone=S.data.phones.find(p=>p.id===id),client=S.data.clients.find(c=>c.id===document.getElementById('pfClient').value);
      if(!window.supabase||!S.user||S.user.id==='demo'||!S.online)throw new Error('Para criar financiamento com gravação atômica e baixa segura do estoque, conecte-se à internet e entre na conta da AC. Nenhum registro foi alterado.');
      if(!phone||window.AC_NUM(phone.stock)<=0)throw new Error('Este celular não está disponível no estoque.');if(!client)throw new Error('Selecione um cliente.');
      const credit=window.AC_CLIENT_CREDIT_INFO(client.id);if(credit.blocked)throw new Error('Cliente bloqueado para novas operações de crédito.');
      const price=Number(document.getElementById('pfPrice').value)||0,entry=Number(document.getElementById('pfEntry').value)||0,rate=Number(document.getElementById('pfRate').value)||0,n=Math.max(1,Number(document.getElementById('pfN').value)||1),due=document.getElementById('pfDue').value;
      if(!due||price<=0||entry<0||entry>price||!Number.isInteger(n)||n<1||n>120||rate<0||!document.getElementById('pfModel').value.trim())throw new Error('Confira modelo, valor, entrada, taxa, quantidade de parcelas (1 a 120) e vencimento.')
      const financed=price-entry;if(credit.lim>0&&financed>credit.available)throw new Error('Valor acima do limite disponível do cliente.');
      const pmt=payment(financed,rate,n),fid=window.AC_UID(),created=new Date().toISOString(),f={id:fid,client_id:client.id,phone_id:phone.id,model:document.getElementById('pfModel').value.trim(),imei:document.getElementById('pfImei').value.trim()||null,price,entry,financed,monthly_rate:rate,installments_count:n,installment_amount:Number(pmt.toFixed(2)),cost:window.AC_NUM(phone.cost),status:'active',first_due_date:due,created_at:created};
      let acc=0;const rows=[];for(let i=1;i<=n;i++){let amount=Number(pmt.toFixed(2));if(i===n)amount=Number((financed+(rate?pmt*n-financed:0)-acc).toFixed(2));acc+=amount;rows.push({id:window.AC_UID(),phone_finance_id:fid,number:i,due_date:addMonths(due,i-1),amount,paid_amount:0,paid_at:null,status:'pending',created_at:created});}
      if(btn)btn.disabled=true;
      // A chamada usa o cliente Supabase autenticado do módulo principal.
      const rpc=window.AC_RPC;
      if(!rpc)throw new Error('A função transacional ainda não está conectada nesta versão. O contrato não foi criado.');
      const result=await rpc('ac_create_phone_finance_atomic',{p_finance:f,p_installments:rows});
      if(result.error)throw result.error;const payload=Array.isArray(result.data)?result.data[0]:result.data;
      if(!payload?.finance||!Array.isArray(payload.installments)||!payload.phone)throw new Error('O banco não confirmou contrato, parcelas e estoque. Atualize a tela antes de tentar novamente.');
      S.data.phone_finances=[payload.finance,...S.data.phone_finances.filter(x=>x.id!==payload.finance.id)];S.data.phone_finance_installments=[...payload.installments,...S.data.phone_finance_installments.filter(x=>x.phone_finance_id!==payload.finance.id)];S.data.phones=[payload.phone,...S.data.phones.filter(x=>x.id!==payload.phone.id)];localStorage.setItem('ac_v4_cloud_cache_v4',JSON.stringify({data:S.data,at:new Date().toISOString()}));
      document.getElementById('pfResult').innerHTML=`<b>Financiamento confirmado na nuvem.</b><br>Celular: ${window.AC_ESC(payload.finance.model)}<br>Saldo financiado: ${brl(financed)}<br>Parcela: ${brl(pmt)}<br>Parcelas: ${n}`;window.AC_RENDER();
    }catch(e){console.error('Falha ao criar financiamento',e);alert('Financiamento não confirmado: '+(e.message||'erro de conexão')+'. Confira a lista de financiamentos e o estoque antes de tentar novamente.');}
    finally{if(btn)btn.disabled=false;}
  }
  window.receivePhoneFinanceV51=async function(fid,pid,remaining){const raw=prompt(`Valor a receber (saldo ${brl(remaining)}):`,remaining.toFixed(2).replace('.',','));if(raw===null)return;const v=window.AC_NUM(raw);if(v<=0)return alert('Informe um valor maior que zero.');const i=window.AC_STATE.data.phone_finance_installments.find(x=>x.id===pid);if(!i)return;const paid=Math.min(window.AC_NUM(i.amount),window.AC_NUM(i.paid_amount)+v);const updated={...i,paid_amount:paid,status:paid>=window.AC_NUM(i.amount)?'paid':'partial',paid_at:paid>=window.AC_NUM(i.amount)?new Date().toISOString():null};await window.AC_MUTATE('phone_finance_installments',updated);const fs=window.AC_STATE.data.phone_finance_installments.filter(x=>x.phone_finance_id===fid);if(fs.length&&fs.every(x=>x.status==='paid')){const f=window.AC_STATE.data.phone_finances.find(x=>x.id===fid);if(f)await window.AC_MUTATE('phone_finances',{...f,status:'paid'})}window.AC_RENDER()};
})();
