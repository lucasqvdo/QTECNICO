import type { ServiceOrder, AttendancePhoto, Client } from './types';
import type { UserProfile } from './api';

const DB_NAME = 'qtecnico-offline';
const DB_VERSION = 4;
const ORDERS = 'orders';
const CLIENTS = 'clients';
const META = 'meta';
const QUEUE = 'sync_queue';

type ScopedRecord = { id:string; accountId:number; legacyUserId?:number; value:any };
type QueueItem = {
  id:string; type:'order_create'|'order_update'|'attendance_photo'|'signature_upload'|'legacy_upload'|'invalid'; orderId:string;
  accountId:number; legacyUserId?:number; attendanceId?:string; order:ServiceOrder; createdAt:number; updatedAt:number;
  attempts:number; manualRecovery?:boolean; file?:Blob; fileName?:string; photoId?:string; lastError?:string; uploadedKey?:string; uploadedUrl?:string;
};
export type OfflineSnapshot={orders:ServiceOrder[];clients:Client[];user:UserProfile|null};

function openDb():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined')return reject(new Error('IndexedDB não disponível neste dispositivo.'));
  const request=indexedDB.open(DB_NAME,DB_VERSION);
  request.onupgradeneeded=()=>{
    const db=request.result;
    if(!db.objectStoreNames.contains(ORDERS))db.createObjectStore(ORDERS,{keyPath:'id'});
    if(!db.objectStoreNames.contains(CLIENTS))db.createObjectStore(CLIENTS,{keyPath:'id'});
    if(!db.objectStoreNames.contains(META))db.createObjectStore(META,{keyPath:'key'});
    if(!db.objectStoreNames.contains(QUEUE))db.createObjectStore(QUEUE,{keyPath:'id'});
    if(request.transaction && db.version===4){
      const tx=request.transaction, meta=tx.objectStore(META);
      const legacyUserReq=meta.get('user');
      legacyUserReq.onsuccess=()=>{
        const legacyUser=legacyUserReq.result?.value;
        if(!legacyUser?.id)return;
        const legacyUserId=Number(legacyUser.id);
        for(const name of [ORDERS,CLIENTS,QUEUE]){
          const s=tx.objectStore(name), req=s.getAll();
          req.onsuccess=()=>{for(const item of req.result||[]){
            if(item.accountId==null)s.put({...item,legacyUserId});
          }};
        }
      };
    }
  };
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
  request.onerror=()=>reject(request.error||new Error('Não foi possível abrir o armazenamento local.'));
});}

function txDone(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('Falha no armazenamento local.'));tx.onabort=()=>reject(tx.error||new Error('Operação local cancelada.'));});}

async function activeAccountId():Promise<number>{
  const db=await openDb();
  return new Promise((resolve,reject)=>{const tx=db.transaction(META,'readonly');const req=tx.objectStore(META).get('user');tx.oncomplete=()=>{const id=req.result?.value?.accountId;if(Number.isInteger(id))resolve(Number(id));else reject(new Error('Conta offline não identificada. Faça login online uma vez neste dispositivo.'));};tx.onerror=()=>reject(tx.error||new Error('Não foi possível identificar a conta offline.'));});
}

async function migrateLegacyForUser(db:IDBDatabase,user:UserProfile):Promise<void>{
  if(!Number.isInteger(user.accountId))return;
  const tx=db.transaction([ORDERS,CLIENTS,QUEUE,META],'readwrite'), accountId=Number(user.accountId), userId=Number(user.id);
  for(const name of [ORDERS,CLIENTS,QUEUE]){
    const store=tx.objectStore(name), req=store.getAll();
    req.onsuccess=()=>{for(const item of req.result||[])if(item.accountId==null&&Number(item.legacyUserId)===userId)store.put({...item,accountId,legacyUserId:undefined});};
  }
  tx.objectStore(META).put({key:'user',value:user});
  await txDone(tx);
}

export async function getOfflineSnapshot():Promise<OfflineSnapshot>{
  const db=await openDb();
  return new Promise((resolve,reject)=>{const tx=db.transaction([ORDERS,CLIENTS,META],'readonly');
    const o=tx.objectStore(ORDERS).getAll(), c=tx.objectStore(CLIENTS).getAll(), u=tx.objectStore(META).get('user');
    tx.oncomplete=()=>{const accountId=u.result?.value?.accountId;const scoped=(rows:any[])=>Number.isInteger(accountId)?rows.filter(x=>Number(x.accountId)===Number(accountId)):[];resolve({orders:scoped(o.result||[]).map(x=>x.value||x),clients:scoped(c.result||[]).map(x=>x.value||x),user:u.result?.value||null});};
    tx.onerror=()=>reject(tx.error||new Error('Não foi possível ler o cache offline.'));
  });
}

export async function cacheUser(user:UserProfile|null):Promise<void>{if(!user)return;const db=await openDb();await migrateLegacyForUser(db,user);}
export async function cacheSnapshot(orders:ServiceOrder[],user:UserProfile|null,clients?:Client[]):Promise<void>{
  if(!user?.accountId)throw new Error('Conta offline não identificada.');
  const db=await openDb();
  const accountId=Number(user.accountId);
  const tx=db.transaction([ORDERS,CLIENTS,META,QUEUE],'readwrite');
  const os=tx.objectStore(ORDERS);
  const qs=tx.objectStore(QUEUE);
  const pendingReq=qs.getAll();
  const existingOrdersReq=os.getAll();

  pendingReq.onsuccess=()=>{
    const pending=(pendingReq.result||[]).filter((x:any)=>Number(x.accountId)===accountId) as QueueItem[];
    existingOrdersReq.onsuccess=()=>{
      for(const existing of existingOrdersReq.result||[]){
        if(Number(existing.accountId)===accountId)os.delete(existing.id);
      }
      for(const order of orders){
        os.put({id:accountId+':'+order.id,accountId,value:order});
      }

      const pendingOrders=new Map<string,ServiceOrder>();
      for(const item of pending)pendingOrders.set(item.orderId,item.order);
      for(const order of pendingOrders.values()){
        os.put({id:accountId+':'+order.id,accountId,value:order});
      }

      if(clients){
        const cs=tx.objectStore(CLIENTS);
        const existingClientsReq=cs.getAll();
        existingClientsReq.onsuccess=()=>{
          for(const existing of existingClientsReq.result||[]){
            if(Number(existing.accountId)===accountId)cs.delete(existing.id);
          }
          for(const client of clients){
            cs.put({id:accountId+':'+client.id,accountId,value:client});
          }
        };
      }

      tx.objectStore(META).put({key:'user',value:user});
      tx.objectStore(META).put({key:'last_server_sync:'+accountId,value:Date.now()});
    };
  };

  await txDone(tx);
}async function putOrder(order:ServiceOrder){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(ORDERS,'readwrite');tx.objectStore(ORDERS).put({id:`${accountId}:${order.id}`,accountId,value:order});await txDone(tx);}
export async function cacheOrders(orders:ServiceOrder[]){for(const order of orders)await putOrder(order);}
export async function cacheClients(clients:Client[]){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(CLIENTS,'readwrite'),s=tx.objectStore(CLIENTS),existingReq=s.getAll();existingReq.onsuccess=()=>{for(const existing of existingReq.result||[])if(Number(existing.accountId)===accountId)s.delete(existing.id);for(const c of clients)s.put({id:`${accountId}:${c.id}`,accountId,value:c});};await txDone(tx);}
async function enqueue(item:Omit<QueueItem,'accountId'>,order:ServiceOrder){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction([QUEUE,ORDERS],'readwrite');const scopedId=`${accountId}:${item.id}`;tx.objectStore(QUEUE).put({...item,id:scopedId,accountId});tx.objectStore(ORDERS).put({id:`${accountId}:${order.id}`,accountId,value:order});await txDone(tx);}
export async function queueOrderCreate(order:ServiceOrder){const now=Date.now();await enqueue({id:`create:${order.id}`,type:'order_create',orderId:order.id,order,createdAt:now,updatedAt:now,attempts:0},order);}
export async function queueOrderUpdate(order:ServiceOrder){const now=Date.now();await enqueue({id:`order:${order.id}`,type:'order_update',orderId:order.id,order,createdAt:now,updatedAt:now,attempts:0},order);}
export async function queueAttendancePhoto(order:ServiceOrder,attendanceId:string,photoId:string,file:Blob,fileName:string){const now=Date.now();await enqueue({id:`photo:${order.id}:${photoId}`,type:'attendance_photo',orderId:order.id,attendanceId,photoId,order,file,fileName,createdAt:now,updatedAt:now,attempts:0},order);}
export async function queueSignatureUpload(order:ServiceOrder,file:Blob,fileName:string){const now=Date.now();await enqueue({id:`signature:${order.id}`,type:'signature_upload',orderId:order.id,order,file,fileName,createdAt:now,updatedAt:now,attempts:0},order);}
function normalizeQueueItem(raw:any):QueueItem{
  const rawId=String(raw?.id??'');
  const scopedPrefix=raw.accountId!=null?String(raw.accountId)+':':'';
  const localId=scopedPrefix&&rawId.startsWith(scopedPrefix)?rawId.slice(scopedPrefix.length):rawId;
  const rawType=raw?.type;
  const inferredType:QueueItem['type']=
    rawType==='order_create'||rawType==='order_update'||rawType==='attendance_photo'||rawType==='signature_upload'
      ?rawType
      :localId.startsWith('create:')?'order_create'
      :localId.startsWith('order:')?'order_update'
      :localId.startsWith('photo:')?'attendance_photo'
      :localId.startsWith('signature:')?'signature_upload'
      :localId.startsWith('update:order:')?'order_update'
      :localId.startsWith('attendance-photo:')?'attendance_photo'
      :localId.startsWith('upload:offline/')?'legacy_upload'
      :'invalid';
  let inferredOrderId=String(raw?.orderId??raw?.order?.id??'');
  if(!inferredOrderId&&localId.startsWith('update:order:')){const parts=localId.split(':');if(parts[2])inferredOrderId=parts[2];}
  if(!inferredOrderId){
    const parts=localId.split(':');
    if((parts[0]==='create'||parts[0]==='order'||parts[0]==='signature')&&parts[1])inferredOrderId=parts[1];
    if(parts[0]==='photo'&&parts[1])inferredOrderId=parts[1];
    if(parts[0]==='attendance-photo'&&parts[1]){/* photo id only; order may be recovered from the cached order */}
  }
  const created=Number(raw?.createdAt),updated=Number(raw?.updatedAt);
  const createdAt=Number.isFinite(created)&&created>0?created:Number.isFinite(updated)&&updated>0?updated:0;
  const updatedAt=Number.isFinite(updated)&&updated>0?updated:createdAt;
  const attempts=Number(raw?.attempts);
  return {...raw,id:rawId,type:inferredType,orderId:inferredOrderId,accountId:Number(raw?.accountId),createdAt,updatedAt,attempts:Number.isFinite(attempts)&&attempts>=0?attempts:0} as QueueItem;
}
export async function getQueue():Promise<QueueItem[]>{
  const accountId=await activeAccountId(),db=await openDb();
  const rawRows=await new Promise<any[]>((resolve,reject)=>{
    const tx=db.transaction([QUEUE,ORDERS],'readonly');
    const queueReq=tx.objectStore(QUEUE).getAll();
    const orderReq=tx.objectStore(ORDERS).getAll();
    tx.oncomplete=()=>resolve([queueReq.result||[],orderReq.result||[]] as any);
    tx.onerror=()=>reject(tx.error||new Error('Não foi possível ler a fila offline.'));
    tx.onabort=()=>reject(tx.error||new Error('Leitura da fila offline foi cancelada.'));
  });
  const rows=(rawRows[0]||[]).filter((x:any)=>Number(x.accountId)===accountId);
  const orders=(rawRows[1]||[]).filter((x:any)=>Number(x.accountId)===accountId).map((x:any)=>x.value||x) as ServiceOrder[];
  const normalizedRows=rows.map((raw:any)=>{
    const normalized=normalizeQueueItem(raw);
    if(normalized.type==='attendance_photo'&&!normalized.orderId){
      const photoId=normalized.photoId||String(normalized.id).split(':')[1]||'';
      if(photoId){
        for(const order of orders){
          const attendance=order.attendances?.find(a=>(a.photos||[]).some(p=>p.id===photoId));
          if(attendance){
            normalized.orderId=order.id;
            normalized.attendanceId=normalized.attendanceId||attendance.id;
            normalized.order=order;
            normalized.photoId=normalized.photoId||photoId;
            break;
          }
        }
      }
    }
    return normalized;
  });
  const changedRows=rows.map((raw:any,i:number)=>{
    const normalized=normalizedRows[i];
    return raw.type!==normalized.type||raw.orderId!==normalized.orderId||raw.attendanceId!==normalized.attendanceId||raw.createdAt!==normalized.createdAt||raw.updatedAt!==normalized.updatedAt||raw.attempts!==normalized.attempts;
  });
  if(changedRows.some(Boolean)){
    const tx=db.transaction(QUEUE,'readwrite');
    const store=tx.objectStore(QUEUE);
    for(let i=0;i<rows.length;i++)if(changedRows[i])store.put(normalizedRows[i]);
    await txDone(tx);
  }
  return normalizedRows;
}
export async function updateQueueUpload(id:string,uploadedKey:string,uploadedUrl:string){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(QUEUE,'readwrite'),s=tx.objectStore(QUEUE),req=s.get(id);req.onsuccess=()=>{const item=req.result as QueueItem|undefined;if(item&&Number(item.accountId)===accountId)s.put({...item,uploadedKey,uploadedUrl,updatedAt:Date.now()});};await txDone(tx);}
export async function markQueueManualRecovery(id:string,error:string){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(QUEUE,'readwrite'),s=tx.objectStore(QUEUE),req=s.get(id);req.onsuccess=()=>{const item=req.result as QueueItem|undefined;if(item&&Number(item.accountId)===accountId)s.put({...item,manualRecovery:true,lastError:error,updatedAt:Date.now()});};await txDone(tx);}
export async function markQueueAttempt(id:string){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(QUEUE,'readwrite'),s=tx.objectStore(QUEUE),req=s.get(id);req.onsuccess=()=>{const item=req.result as QueueItem|undefined;if(item&&Number(item.accountId)===accountId)s.put({...item,attempts:item.attempts+1,lastError:undefined,updatedAt:Date.now()});};await txDone(tx);}
export async function updateQueueFailure(id:string,error:string){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(QUEUE,'readwrite'),s=tx.objectStore(QUEUE),req=s.get(id);req.onsuccess=()=>{const item=req.result as QueueItem|undefined;if(item&&Number(item.accountId)===accountId)s.put({...item,attempts:item.attempts+1,lastError:error,updatedAt:Date.now()});};await txDone(tx);}
export async function clearLegacyRecoveryItems(){
  const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(QUEUE,'readwrite'),s=tx.objectStore(QUEUE),req=s.getAll();
  req.onsuccess=()=>{
    for(const item of (req.result||[]) as QueueItem[]){
      if(Number(item.accountId)!==accountId)continue;
      const rawId=String(item.id||'');
      const localId=rawId.startsWith(String(accountId)+':')?rawId.slice(String(accountId).length+1):rawId;
      const stale=localId==='attendance-photo:photo-1789664640520-nq756x'||localId.startsWith('upload:offline/attendances/1789664640256-44kocpd3-')||localId.startsWith('upload:offline/signatures/1789665097641-q2rp0e27-');
      if(stale)s.delete(item.id);
    }
  };
  await txDone(tx);
}
export async function removeQueueItem(id:string){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(QUEUE,'readwrite'),s=tx.objectStore(QUEUE),req=s.get(id);req.onsuccess=()=>{const item=req.result as QueueItem|undefined;if(item&&Number(item.accountId)===accountId)s.delete(id);};await txDone(tx);}
export async function getLastServerSync():Promise<number|null>{const accountId=await activeAccountId(),db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(META,'readonly'),req=tx.objectStore(META).get(`last_server_sync:${accountId}`);tx.oncomplete=()=>resolve(typeof req.result?.value==='number'?req.result.value:null);tx.onerror=()=>reject(tx.error||new Error('Não foi possível ler o estado offline.'));});}
export async function markServerSync(){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(META,'readwrite');tx.objectStore(META).put({key:`last_server_sync:${accountId}`,value:Date.now()});await txDone(tx);}
export type {QueueItem}; export type {AttendancePhoto};
