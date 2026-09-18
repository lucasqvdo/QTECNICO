import { api } from './api';
import { cacheOrders, getQueue, getLastServerSync, removeQueueItem, updateQueueFailure, markQueueAttempt, markQueueManualRecovery, updateQueueUpload, markServerSync, type QueueItem } from './offlineStore';

let running=false;
let listenersBound=false;
let state:'idle'|'syncing'|'error'='idle';
function emit(){window.dispatchEvent(new CustomEvent('qtecnico-sync-state',{detail:{state}}));}
function asFile(item:QueueItem):File{if(!item.file)throw new Error('Arquivo offline não encontrado.');return new File([item.file],item.fileName||'arquivo-offline',{type:item.file.type||'application/octet-stream'});}
async function syncCreate(item:QueueItem){const saved=await api.createOrder(item.order);await cacheOrders([saved]);}
async function syncOrder(item:QueueItem){const saved=await api.updateOrder(item.orderId,item.order);await cacheOrders([saved]);}
async function syncPhoto(item:QueueItem){if(!item.attendanceId)throw new Error('Atendimento da foto não identificado.');const file=asFile(item);let uploaded={key:item.uploadedKey||'',url:item.uploadedUrl||''};if(!uploaded.key||!uploaded.url){uploaded=await api.uploadPhoto(file,'attendances');await updateQueueUpload(item.id,uploaded.key,uploaded.url);}await api.registerAttendancePhoto(item.orderId,item.attendanceId,{id:item.photoId,key:uploaded.key,url:uploaded.url,name:item.fileName||file.name});}
async function syncSignature(item:QueueItem){const file=asFile(item);let uploaded={key:item.uploadedKey||'',url:item.uploadedUrl||''};if(!uploaded.key||!uploaded.url){uploaded=await api.uploadPhoto(file,'signatures');await updateQueueUpload(item.id,uploaded.key,uploaded.url);}const saved=await api.updateOrder(item.orderId,{clientSignature:uploaded.url,clientSignatureKey:uploaded.key,status:'completed'});await cacheOrders([saved]);}
export async function syncOfflineQueue():Promise<void>{
  if(running||!navigator.onLine)return;
  running=true;state='syncing';emit();
  try{
    let didSync=false;
    await clearLegacyRecoveryItems();
    const queue=(await getQueue()).sort((a,b)=>a.createdAt-b.createdAt);
    const recoverableQueue=queue.filter(i=>!i.manualRecovery);
    const createItems=recoverableQueue.filter(i=>i.type==='order_create');
    const orderItems=recoverableQueue.filter(i=>i.type==='order_update');
    const photoItems=recoverableQueue.filter(i=>i.type==='attendance_photo');
    const signatureItems=recoverableQueue.filter(i=>i.type==='signature_upload');
    const legacyUploadItems=queue.filter(i=>i.type==='legacy_upload');
    const invalidItems=recoverableQueue.filter(i=>i.type==='invalid');
    for(const item of invalidItems){
      await updateQueueFailure(item.id,'Operação offline inválida: tipo e/ou identificador da fila não puderam ser recuperados.');
    }
    if(invalidItems.length){state='error';emit();return;}
    for(const item of createItems){
      if(!navigator.onLine)break;
      try{await markQueueAttempt(item.id);await syncCreate(item);await removeQueueItem(item.id);didSync=true;}
      catch(error){await updateQueueFailure(item.id,error instanceof Error?error.message:'Falha ao criar OS offline no servidor');state='error';emit();return;}
    }
    const latestByOrder=new Map<string,QueueItem>();
    for(const item of orderItems)latestByOrder.set(item.orderId,item);
    for(const item of latestByOrder.values()){
      if(!navigator.onLine)break;
      try{await markQueueAttempt(item.id);await syncOrder(item);await removeQueueItem(item.id);didSync=true;}
      catch(error){await updateQueueFailure(item.id,error instanceof Error?error.message:'Falha ao sincronizar OS');state='error';emit();return;}
    }
    for(const item of orderItems){if(latestByOrder.get(item.orderId)?.id===item.id)continue;await removeQueueItem(item.id);}
    for(const item of photoItems){
      if(!item.orderId||!item.attendanceId){
        await markQueueManualRecovery(item.id,'Recuperação manual necessária: OS/atendimento da foto não identificado com segurança.');
        continue;
      }
      if(!navigator.onLine)break;
      try{await markQueueAttempt(item.id);await syncPhoto(item);await removeQueueItem(item.id);didSync=true;}
      catch(error){await updateQueueFailure(item.id,error instanceof Error?error.message:'Falha ao sincronizar foto');state='error';emit();return;}
    }
    for(const item of signatureItems){
      if(!navigator.onLine)break;
      try{await markQueueAttempt(item.id);await syncSignature(item);await removeQueueItem(item.id);didSync=true;}
      catch(error){await updateQueueFailure(item.id,error instanceof Error?error.message:'Falha ao sincronizar assinatura');state='error';emit();return;}
    }
    if(legacyUploadItems.length){
      for(const item of legacyUploadItems){
        const message='Recuperação manual necessária: mídia legada sem vínculo seguro com OS/atendimento. Preservada no dispositivo e não será reenviada automaticamente.';
        await markQueueManualRecovery(item.id,message);
      }
      state='error';emit();return;
    }
    const remaining=(await getQueue()).filter(i=>!i.manualRecovery);
    if(state!=='error' && navigator.onLine && remaining.length===0){if(didSync)await markServerSync();state='idle';}
    else if(state!=='error'){state='idle';}
    emit();
  }finally{running=false;}
}
export async function getSyncInfo(){
  const queue=await getQueue();
  const pendingQueue=queue.filter(item=>!item.manualRecovery);
  const recovery=queue.filter(item=>Boolean(item.manualRecovery));
  const failed=pendingQueue.filter(item=>Boolean(item.lastError));
  return{
    pending:pendingQueue.length,
    recovery:recovery.length,
    lastServerSync:await getLastServerSync(),
    state,
    lastError:failed.sort((a,b)=>b.updatedAt-a.updatedAt)[0]?.lastError||''
  };
}
export function startOfflineSync(){
  if(listenersBound)return;
  listenersBound=true;
  const kick=()=>{if(navigator.onLine&&!running)void syncOfflineQueue();};
  window.addEventListener('online',kick);
  window.addEventListener('focus',kick);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')kick();});
  window.setInterval(kick,5000);
  kick();
}
