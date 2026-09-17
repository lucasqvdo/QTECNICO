import { api } from './api';
import { cacheOrders, getQueue, getLastServerSync, removeQueueItem, updateQueueFailure, markServerSync, type QueueItem } from './offlineStore';

let running = false;
let listenersBound = false;
export type SyncState = 'idle' | 'syncing' | 'error';
let state: SyncState = 'idle';
function emit(){window.dispatchEvent(new CustomEvent('qtecnico-sync-state',{detail:{state}}));}
function asFile(item:QueueItem):File{if(!item.file)throw new Error('Arquivo offline não encontrado.');return new File([item.file],item.fileName||'arquivo-offline', {type:item.file.type||'application/octet-stream'});}

async function syncItem(item:QueueItem){
  if(item.type==='order_update'){
    const saved=await api.updateOrder(item.orderId,item.order);
    await cacheOrders([saved]);
    return;
  }
  if(item.type==='attendance_photo'){
    if(!item.attendanceId)throw new Error('Atendimento da foto não identificado.');
    const file=asFile(item);
    const uploaded=await api.uploadPhoto(file,'attendances');
    await api.addAttendancePhoto(item.orderId,item.attendanceId,file);
    // O endpoint acima faz novo upload; por isso, nesta etapa usamos a URL já criada
    // diretamente para registrar a foto sem duplicar o arquivo no storage.
    await api.registerAttendancePhoto(item.orderId,item.attendanceId,{key:uploaded.key,url:uploaded.url,name:item.fileName||file.name});
    return;
  }
  if(item.type==='signature_upload'){
    const file=asFile(item);
    const uploaded=await api.uploadPhoto(file,'signatures');
    const saved=await api.updateOrder(item.orderId,{clientSignature:uploaded.url,clientSignatureKey:uploaded.key,status:'completed'});
    await cacheOrders([saved]);
    return;
  }
  throw new Error('Operação offline desconhecida.');
}

export async function syncOfflineQueue():Promise<void>{
  if(running||!navigator.onLine)return;
  running=true;state='syncing';emit();
  try{
    const queue=(await getQueue()).sort((a,b)=>a.createdAt-b.createdAt);
    for(const item of queue){
      if(!navigator.onLine)break;
      try{await syncItem(item);await removeQueueItem(item.id);}catch(error){await updateQueueFailure(item.id,error instanceof Error?error.message:'Falha na sincronização');state='error';emit();break;}
    }
    if(state!=='error'){await markServerSync();state='idle';}
    emit();
  }finally{running=false;}
}
export async function getSyncInfo(){const queue=await getQueue();return{pending:queue.length,lastServerSync:await getLastServerSync(),state};}
export function startOfflineSync(){if(listenersBound)return;listenersBound=true;window.addEventListener('online',()=>{void syncOfflineQueue();});window.setInterval(()=>{void syncOfflineQueue();},30000);if(navigator.onLine)void syncOfflineQueue();}
