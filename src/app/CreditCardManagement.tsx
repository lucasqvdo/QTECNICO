import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CreditCard as CardIcon, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api, type CreditCard, type CreditCardInput, type CardInvoice, type CardInvoiceDetail, type CardInvoiceItem, type CardInvoiceItemInput } from './api';
import { expenseCategoryGroups } from './expenseCategories';

const money = (value:number) => value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const dateLabel = (value:string) => value.split('-').reverse().join('/');
const inputClass = 'mt-1 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
const secondaryClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold disabled:opacity-50';
const errorMessage = (error:unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
const blankCard:CreditCardInput = {name:'',lastFour:'',closingDay:20,dueDay:27};

function Dialog({title,onClose,busy=false,children}:{title:string;onClose:()=>void;busy?:boolean;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ const dialog=ref.current!;dialog.showModal();return()=>dialog.close(); },[]);
  return <dialog ref={ref} aria-label={title} onCancel={e=>{e.preventDefault();if(!busy)onClose();}} className="m-auto max-h-[94dvh] w-[calc(100%_-_1rem)] max-w-3xl overflow-y-auto rounded-2xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40">
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white p-4 sm:p-5"><h2 className="font-bold">{title}</h2><button disabled={busy} onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-50"><X size={20}/></button></div>
    <div className="space-y-4 p-4 sm:p-5">{children}</div>
  </dialog>;
}
function ErrorNotice({message}:{message:string}) { return message ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p> : null; }
function CardForm({card,onClose,onSaved}:{card:CreditCard|null;onClose:()=>void;onSaved:(card:CreditCard)=>void}) {
  const [form,setForm]=useState<CreditCardInput>(card||blankCard);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const save=async(e:React.FormEvent)=>{
    e.preventDefault();if(busy)return;setBusy(true);setError('');
    try { const saved=card?await api.updateCreditCard(card.id,form):await api.createCreditCard(form);onSaved(saved); }
    catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  };
  return <Dialog title={card?'Editar cartão':'Novo cartão'} onClose={onClose} busy={busy}>
    <ErrorNotice message={error}/><form onSubmit={save} className="grid gap-4 sm:grid-cols-2"><fieldset disabled={busy} className="contents">
      <label className="text-sm font-medium sm:col-span-2">Nome / apelido<input autoFocus required maxLength={100} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className={inputClass} placeholder="Ex.: Inter da empresa"/></label>
      <label className="text-sm font-medium sm:col-span-2">Últimos 4 dígitos<input required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={form.lastFour} onChange={e=>setForm({...form,lastFour:e.target.value.replace(/\D/g,'')})} className={inputClass} placeholder="1234"/></label>
      <label className="text-sm font-medium">Dia de fechamento<input required type="number" min={1} max={31} value={form.closingDay||''} onChange={e=>setForm({...form,closingDay:Number(e.target.value)})} className={inputClass}/></label>
      <label className="text-sm font-medium">Dia de vencimento<input required type="number" min={1} max={31} value={form.dueDay||''} onChange={e=>setForm({...form,dueDay:Number(e.target.value)})} className={inputClass}/></label>
      <p className="text-xs text-slate-500 sm:col-span-2">Dias 29 a 31 se ajustam ao último dia do mês. Alterações valem para novas faturas; as datas das faturas existentes são preservadas.</p>
      <button type="submit" className={`${buttonClass} sm:col-span-2`}>{busy?'Salvando...':'Salvar cartão'}</button>
    </fieldset></form>
  </Dialog>;
}

export function CreditCardManagement({onOpenInvoice,onChanged}:{onOpenInvoice:(id:number)=>void;onChanged:()=>void}) {
  const [cards,setCards]=useState<CreditCard[]>([]),[selectedId,setSelectedId]=useState<number|null>(null);
  const [invoices,setInvoices]=useState<CardInvoice[]>([]),[loading,setLoading]=useState(true),[loadingInvoices,setLoadingInvoices]=useState(false);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState<CreditCard|null|undefined>();
  const [competence,setCompetence]=useState(today().slice(0,7));
  // Refresh invoice summaries after a saved item or payment change.
  const [revision,setRevision]=useState(0);
  useEffect(()=>{let ignore=false;api.getCreditCards().then(data=>{if(!ignore){setCards(data);setSelectedId(data[0]?.id??null);}}).catch(e=>{if(!ignore)setError(errorMessage(e));}).finally(()=>{if(!ignore)setLoading(false);});return()=>{ignore=true;};},[]);
  useEffect(()=>{
    if(selectedId===null)return;
    let ignore=false;setLoadingInvoices(true);setError('');
    api.getCardInvoices(selectedId).then(data=>{if(!ignore)setInvoices(data);}).catch(e=>{if(!ignore)setError(errorMessage(e));}).finally(()=>{if(!ignore)setLoadingInvoices(false);});
    return()=>{ignore=true;};
  },[selectedId,revision]);
  useEffect(()=>{const refresh=()=>setRevision(r=>r+1);window.addEventListener('qtecnico-invoice-updated',refresh);return()=>window.removeEventListener('qtecnico-invoice-updated',refresh);},[]);
  const createInvoice=async(e:React.FormEvent)=>{
    e.preventDefault();if(selectedId===null||busy)return;setBusy(true);setError('');
    try {const invoice=await api.createCardInvoice(selectedId,competence);setRevision(r=>r+1);onChanged();onOpenInvoice(invoice.id);}
    catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  };
  const selected=cards.find(c=>c.id===selectedId);
  return <section className="mt-4 space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 font-bold"><CardIcon size={20}/> Cartões de crédito</h2><p className="mt-1 text-sm text-slate-500">Cada fatura gera uma única conta a pagar. As compras ficam no detalhamento.</p></div><button onClick={()=>setEditing(null)} className={buttonClass}><Plus size={16}/> Novo cartão</button></div>
    <ErrorNotice message={error}/>
    {loading?<p role="status" className="text-sm text-slate-500">Carregando cartões...</p>:cards.length===0?<p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Cadastre seu primeiro cartão para organizar as faturas mensais.</p>:<>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(card=><div key={card.id} className={`flex min-w-0 items-center gap-2 rounded-xl border p-3 ${selectedId===card.id?'border-cyan-600 bg-cyan-50':'border-slate-200'}`}><button disabled={busy} aria-pressed={selectedId===card.id} onClick={()=>{if(selectedId!==card.id){setInvoices([]);setSelectedId(card.id);}}} className="min-w-0 flex-1 text-left"><p className="break-words font-semibold">{card.name} <span className="whitespace-nowrap text-sm text-slate-500">•••• {card.lastFour}</span></p><p className="mt-1 text-xs text-slate-500">Fecha dia {card.closingDay} · Vence dia {card.dueDay}</p></button><button disabled={busy} onClick={()=>setEditing(card)} aria-label={`Editar cartão ${card.name}`} className="rounded-lg p-2 hover:bg-white"><Pencil size={16}/></button></div>)}</div>
      {selected&&<><form onSubmit={createInvoice} className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 text-sm font-medium">Competência (mês do vencimento)<input required type="month" min="1900-01" max="9998-12" value={competence} onChange={e=>setCompetence(e.target.value)} className={inputClass}/></label><button disabled={busy} className={buttonClass}>{busy?'Abrindo...':'Criar / abrir fatura'}</button></form>
      <div><h3 className="mb-3 font-semibold">Faturas de {selected.name}</h3>{loadingInvoices?<p role="status" className="text-sm text-slate-500">Carregando faturas...</p>:<div className="space-y-2">{invoices.map(invoice=><button key={invoice.id} onClick={()=>onOpenInvoice(invoice.id)} className="flex w-full flex-col gap-2 rounded-xl border p-4 text-left hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{dateLabel(invoice.competence)} · {invoice.status==='paid'?'Paga':'Pendente'}</p><p className="text-xs text-slate-500">Fechamento {dateLabel(invoice.closingDate)} · Vencimento {dateLabel(invoice.dueDate)}</p></div><span className="font-bold text-cyan-700">{money(invoice.amount)} →</span></button>)}{!invoices.length&&<p className="text-sm text-slate-500">Nenhuma fatura. Escolha a competência para iniciar.</p>}</div>}</div></>}
    </>}
    {editing!==undefined&&<CardForm card={editing} onClose={()=>setEditing(undefined)} onSaved={card=>{setCards(list=>list.some(c=>c.id===card.id)?list.map(c=>c.id===card.id?card:c):[...list,card]);setSelectedId(card.id);setRevision(r=>r+1);setEditing(undefined);}}/>}
  </section>;
}

export function CardInvoiceDialog({invoiceId,onClose,onChanged}:{invoiceId:number;onClose:()=>void;onChanged:()=>void}) {
  const [invoice,setInvoice]=useState<CardInvoiceDetail|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [editing,setEditing]=useState<CardInvoiceItem|null>(null),[showItem,setShowItem]=useState(false);
  const [form,setForm]=useState({description:'',category:'Outros',purchaseDate:today(),amount:''});
  const [paidAt,setPaidAt]=useState(today());
  const [retry,setRetry]=useState(0);
  useEffect(()=>{let ignore=false;setLoading(true);setError('');api.getCardInvoice(invoiceId).then(data=>{if(!ignore)setInvoice(data);}).catch(e=>{if(!ignore)setError(errorMessage(e));}).finally(()=>{if(!ignore)setLoading(false);});return()=>{ignore=true;};},[invoiceId,retry]);
  const updated=(next:CardInvoiceDetail)=>{setInvoice(next);onChanged();window.dispatchEvent(new Event('qtecnico-invoice-updated'));};
  const mutate=async(action:()=>Promise<CardInvoiceDetail>,onSuccess?:()=>void)=>{
    if(busy)return;setBusy(true);setError('');try{updated(await action());onSuccess?.();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  };
  const openItem=(item?:CardInvoiceItem)=>{setEditing(item||null);setForm(item?{description:item.description,category:item.category,purchaseDate:item.purchaseDate,amount:String(item.amount)}:{description:'',category:'Outros',purchaseDate:today(),amount:''});setShowItem(true);setError('');};
  const saveItem=(e:React.FormEvent)=>{e.preventDefault();const data:CardInvoiceItemInput={...form,amount:Number(form.amount)};void mutate(()=>editing?api.updateCardInvoiceItem(invoiceId,editing.id,data):api.createCardInvoiceItem(invoiceId,data),()=>setShowItem(false));};
  return <Dialog title="Detalhes da fatura" onClose={onClose} busy={busy}>
    <ErrorNotice message={error}/>
    {loading?<p role="status">Carregando fatura...</p>:!invoice?<button onClick={()=>setRetry(r=>r+1)} className={secondaryClass}>Tentar novamente</button>:<>
      <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:justify-between"><div><h3 className="break-words font-bold">{invoice.cardName} •••• {invoice.lastFour}</h3><p className="text-sm">Competência {dateLabel(invoice.competence)}</p><p className="mt-2 text-xs text-slate-500">Fecha em {dateLabel(invoice.closingDate)} · Vence em {dateLabel(invoice.dueDate)}</p></div><div><p className="text-xs text-slate-500">Total da fatura</p><p className="text-2xl font-bold text-cyan-700">{money(invoice.amount)}</p><p className="text-sm">{invoice.status==='paid'?`Paga em ${dateLabel(invoice.paidAt!)}`:'Pendente'}</p></div></div>
      <p className="text-sm text-slate-500">O total é calculado pelos itens abaixo e aparece uma única vez em Contas a pagar.</p>
      {invoice.status==='pending'?<div className="flex flex-col gap-3 sm:flex-row sm:items-end"><button disabled={busy} onClick={()=>openItem()} className={buttonClass}><Plus size={16}/> Adicionar item</button><form onSubmit={e=>{e.preventDefault();void mutate(()=>api.setCardInvoicePayment(invoiceId,'paid',paidAt),()=>setShowItem(false));}} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 text-xs font-medium">Data do pagamento<input required type="date" value={paidAt} onChange={e=>setPaidAt(e.target.value)} className={inputClass}/></label><button disabled={busy||invoice.amount<=0} className={secondaryClass}>Marcar como paga</button></form></div>:<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="mb-2 text-sm">Fatura paga. Para corrigir os itens, reabra a fatura.</p><button disabled={busy} onClick={()=>{if(confirm('Reabrir esta fatura e voltar a deixá-la pendente?'))void mutate(()=>api.setCardInvoicePayment(invoiceId,'pending',null));}} className={secondaryClass}>Reabrir fatura</button></div>}
      {showItem&&invoice.status==='pending'&&<form onSubmit={saveItem} className="grid gap-3 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4 sm:grid-cols-2"><h3 className="font-semibold sm:col-span-2">{editing?'Editar item':'Novo item'}</h3><fieldset disabled={busy} className="contents"><label className="text-sm font-medium sm:col-span-2">Descrição<input autoFocus required maxLength={250} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className={inputClass}/></label><label className="text-sm font-medium">Data da compra<input required type="date" min="1900-01-01" max="9998-12-31" value={form.purchaseDate} onChange={e=>setForm({...form,purchaseDate:e.target.value})} className={inputClass}/></label><label className="text-sm font-medium">Valor<input required type="number" min="0.01" max="999999999999.99" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} className={inputClass}/></label><label className="text-sm font-medium sm:col-span-2">Categoria<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className={inputClass}>{!expenseCategoryGroups.some(g=>g.items.some(i=>i===form.category))&&<option value={form.category}>{form.category}</option>}{expenseCategoryGroups.map(g=><optgroup key={g.group} label={g.group}>{g.items.map(item=><option key={item}>{item}</option>)}</optgroup>)}</select></label><div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end"><button type="button" onClick={()=>setShowItem(false)} className={secondaryClass}>Cancelar</button><button className={buttonClass}>{busy?'Salvando...':'Salvar item'}</button></div></fieldset></form>}
      <div className="space-y-2">{invoice.items.map(item=><div key={item.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="break-words font-medium">{item.description}</p><p className="text-xs text-slate-500">{dateLabel(item.purchaseDate)} · {item.category}</p></div><div className="flex items-center justify-between gap-3"><span className="font-semibold">{money(item.amount)}</span>{invoice.status==='pending'&&<div className="flex gap-1"><button disabled={busy} onClick={()=>openItem(item)} aria-label={`Editar item ${item.description}`} className="rounded-lg p-2 hover:bg-slate-100"><Pencil size={16}/></button><button disabled={busy} onClick={()=>{if(confirm('Remover este item da fatura?'))void mutate(()=>api.deleteCardInvoiceItem(invoiceId,item.id),()=>{if(editing?.id===item.id)setShowItem(false);});}} aria-label={`Remover item ${item.description}`} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={16}/></button></div>}</div></div>)}{!invoice.items.length&&<p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Nenhum item nesta fatura. Adicione as compras para calcular o total.</p>}</div>
    </>}
  </Dialog>;
}
