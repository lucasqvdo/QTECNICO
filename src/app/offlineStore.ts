import type { ServiceOrder, AttendancePhoto, Client } from './types';
import type { UserProfile, TeamMember } from './api';

const DB_NAME = 'qtecnico-offline';
const DB_VERSION = 4;
const ORDERS = 'orders';
const CLIENTS = 'clients';
const META = 'meta';
const QUEUE = 'sync_queue';

type ScopedRecord = { id:string; accountId:number; legacyUserId?:number; value:any };
export type QueueItem = {
  id:string;
  type:'order_create'|'order_update'|'order_delete'|'attendance_photo'|'signature_upload'|'client_create'|'client_update'|'client_delete'|'legacy_upload'|'invalid';
  orderId:string;
  accountId:number;
  legacyUserId?:number;
  attendanceId?:string;
  order?:ServiceOrder;
  client?:Client;
  clientId?:string;
  createdAt:number;
  updatedAt:number;
  attempts:number;
  baseVersion?:number;
  manualRecovery?:boolean;
  file?:Blob;
  fileName?:string;
  photoId?:string;
  lastError?:string;
  uploadedKey?:string;
  uploadedUrl?:string;
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
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(META,'readonly');
    const req=tx.objectStore(META).get('user');
    tx.oncomplete=()=>{
      const raw=req.result?.value?.accountId;
      const id=raw!=null?Number(raw):NaN;
      if(Number.isInteger(id)&&id>0)resolve(id);
      else reject(new Error('Conta offline não identificada. Faça login novamente para inicializar o armazenamento local.'));
    };
    tx.onerror=()=>reject(tx.error||new Error('Não foi possível identificar a conta offline.'));
  });
}

async function migrateLegacyForUser(db:IDBDatabase,user:UserProfile):Promise<void>{
  const rawAcc=user?.accountId;
  const accountId=rawAcc!=null?Number(rawAcc):NaN;
  const userId=Number(user?.id);
  if(!Number.isInteger(accountId)||accountId<=0||!Number.isInteger(userId)||userId<=0){
    throw new Error('Conta offline inválida.');
  }
  const tx=db.transaction([ORDERS,CLIENTS,QUEUE,META],'readwrite');
  for(const name of [ORDERS,CLIENTS,QUEUE]){
    const store=tx.objectStore(name), req=store.getAll();
    req.onsuccess=()=>{for(const item of req.result||[]){
      // Only migrate legacy rows whose previous user identity is known and matches.
      // Unattributed legacy rows stay quarantined instead of being assigned to a new account.
      if(item.accountId==null&&item.legacyUserId!=null&&Number(item.legacyUserId)===userId){
        store.put({...item,accountId,legacyUserId:undefined});
      }
    }};
  }
  tx.objectStore(META).put({key:'user',value:user});
  await txDone(tx);
}

export async function getOfflineSnapshot():Promise<OfflineSnapshot>{
  const db=await openDb();
  return new Promise((resolve,reject)=>{const tx=db.transaction([ORDERS,CLIENTS,META],'readonly');
    const o=tx.objectStore(ORDERS).getAll(), c=tx.objectStore(CLIENTS).getAll(), u=tx.objectStore(META).get('user');
    tx.oncomplete=()=>{
      const rawAccountId=u.result?.value?.accountId;
      const accountId=rawAccountId!=null?Number(rawAccountId):null;
      const scoped=(rows:any[])=>{
        if(Number.isInteger(accountId)&&(accountId as number)>0){
          return rows.filter(x=>Number(x.accountId)===Number(accountId));
        }
        return [];
      };
      resolve({orders:scoped(o.result||[]).map(x=>x.value||x),clients:scoped(c.result||[]).map(x=>x.value||x),user:u.result?.value||null});
    };
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
  const cs=clients?tx.objectStore(CLIENTS):null;
  const pendingReq=qs.getAll();
  const existingOrdersReq=os.getAll();
  const existingClientsReq=cs?cs.getAll():null;

  let pendingResult:any[]|null=null;
  let existingOrdersResult:any[]|null=null;
  let existingClientsResult:any[]|null=cs?null:[];

  const tryProcess=()=>{
    if(pendingResult===null||existingOrdersResult===null||existingClientsResult===null)return;
    const pending=pendingResult.filter((x:any)=>Number(x.accountId)===accountId) as QueueItem[];
    const pendingOrders=new Map<string,ServiceOrder>();
    const pendingDeletes=new Set<string>();
    const pendingClientDeletes=new Set<string>();
    const pendingClientUpdates=new Map<string,Client>();
    const pendingClientCreates:Client[]=[];

    for(const item of pending){
      const orderId=String(item.orderId||(item.order?.id)||'');
      if(item.type==='order_delete'&&orderId)pendingDeletes.add(orderId);
      else if(orderId&&item.order)pendingOrders.set(orderId,item.order);

      const clientId=String(item.clientId||(item.client?.id)||'');
      if(item.type==='client_delete'&&clientId)pendingClientDeletes.add(clientId);
      else if(item.type==='client_update'&&clientId&&item.client)pendingClientUpdates.set(clientId,item.client);
      else if(item.type==='client_create'&&item.client)pendingClientCreates.push(item.client);
    }

    for(const existing of existingOrdersResult){
      if(Number(existing.accountId)===accountId)os.delete(existing.id);
    }
    for(const order of orders){
      const oid=String(order.id);
      if(!pendingDeletes.has(oid)&&!pendingOrders.has(oid)){
        os.put({id:accountId+':'+order.id,accountId,value:order});
      }
    }
    for(const [orderId,order] of pendingOrders.entries()){
      if(!pendingDeletes.has(orderId)){
        os.put({id:accountId+':'+order.id,accountId,value:order});
      }
    }

    if(clients&&cs&&existingClientsResult){
      for(const existing of existingClientsResult){
        if(Number(existing.accountId)===accountId)cs.delete(existing.id);
      }
      for(const client of clients){
        const cid=String(client.id);
        if(!pendingClientDeletes.has(cid)&&!pendingClientUpdates.has(cid)){
          cs.put({id:accountId+':'+client.id,accountId,value:client});
        }
      }
      for(const [cid,client] of pendingClientUpdates.entries()){
        if(!pendingClientDeletes.has(cid)){
          cs.put({id:accountId+':'+client.id,accountId,value:client});
        }
      }
      for(const client of pendingClientCreates){
        const cid=String(client.id);
        if(!pendingClientDeletes.has(cid)){
          cs.put({id:accountId+':'+client.id,accountId,value:client});
        }
      }
    }

    tx.objectStore(META).put({key:'user',value:user});
    tx.objectStore(META).put({key:'last_server_sync:'+accountId,value:Date.now()});
  };

  pendingReq.onsuccess=()=>{pendingResult=pendingReq.result||[];tryProcess();};
  existingOrdersReq.onsuccess=()=>{existingOrdersResult=existingOrdersReq.result||[];tryProcess();};
  if(existingClientsReq){
    existingClientsReq.onsuccess=()=>{existingClientsResult=existingClientsReq.result||[];tryProcess();};
  }

  await txDone(tx);
}async function putOrder(order:ServiceOrder){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(ORDERS,'readwrite');tx.objectStore(ORDERS).put({id:`${accountId}:${order.id}`,accountId,value:order});await txDone(tx);}
export async function cacheOrders(orders:ServiceOrder[]){const queue=await getQueue();const deleted=new Set(queue.filter(q=>q.type==='order_delete').map(q=>String(q.orderId)));for(const order of orders)if(!deleted.has(String(order.id)))await putOrder(order);}
export async function cacheClients(clients:Client[]){const accountId=await activeAccountId(),queue=await getQueue(),deleted=new Set(queue.filter(q=>q.type==='client_delete').map(q=>String(q.clientId))),db=await openDb(),tx=db.transaction(CLIENTS,'readwrite'),s=tx.objectStore(CLIENTS),existingReq=s.getAll();existingReq.onsuccess=()=>{for(const existing of existingReq.result||[])if(Number(existing.accountId)===accountId)s.delete(existing.id);for(const c of clients)if(!deleted.has(String(c.id)))s.put({id:`${accountId}:${c.id}`,accountId,value:c});};await txDone(tx);}
export async function putClient(client:Client){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(CLIENTS,'readwrite');tx.objectStore(CLIENTS).put({id:`${accountId}:${client.id}`,accountId,value:client});await txDone(tx);}
export async function removeCachedClient(id:string){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(CLIENTS,'readwrite');tx.objectStore(CLIENTS).delete(`${accountId}:${id}`);await txDone(tx);}
export async function queueClientCreate(client:Client){const accountId=await activeAccountId(),now=Date.now(),db=await openDb(),tx=db.transaction([QUEUE,CLIENTS],'readwrite');const scopedId=`${accountId}:client_create:${client.id}`;tx.objectStore(QUEUE).put({id:scopedId,type:'client_create',orderId:'',clientId:client.id,client,accountId,createdAt:now,updatedAt:now,attempts:0});tx.objectStore(CLIENTS).put({id:`${accountId}:${client.id}`,accountId,value:client});await txDone(tx);}
export async function queueClientUpdate(client:Client){const accountId=await activeAccountId(),now=Date.now(),db=await openDb(),tx=db.transaction([QUEUE,CLIENTS],'readwrite');const scopedId=`${accountId}:client_update:${client.id}`;tx.objectStore(QUEUE).put({id:scopedId,type:'client_update',orderId:'',clientId:client.id,client,accountId,createdAt:now,updatedAt:now,attempts:0});tx.objectStore(CLIENTS).put({id:`${accountId}:${client.id}`,accountId,value:client});await txDone(tx);}
export async function queueClientDelete(clientId:string){const accountId=await activeAccountId(),now=Date.now(),db=await openDb(),tx=db.transaction([QUEUE,CLIENTS],'readwrite');const scopedId=`${accountId}:client_delete:${clientId}`;tx.objectStore(QUEUE).put({id:scopedId,type:'client_delete',orderId:'',clientId,accountId,createdAt:now,updatedAt:now,attempts:0});tx.objectStore(CLIENTS).delete(`${accountId}:${clientId}`);await txDone(tx);}
export async function cacheTeam(team:TeamMember[]){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(META,'readwrite');tx.objectStore(META).put({key:`team:${accountId}`,value:team});await txDone(tx);}
export async function getCachedTeam():Promise<TeamMember[]>{try{const accountId=await activeAccountId(),db=await openDb();return new Promise((resolve)=>{const tx=db.transaction(META,'readonly'),req=tx.objectStore(META).get(`team:${accountId}`);tx.oncomplete=()=>resolve(Array.isArray(req.result?.value)?req.result.value:[]);tx.onerror=()=>resolve([]);});}catch{return[];}}
export async function updateCachedPhoto(orderId:string,attendanceId:string,photoId:string,uploadedKey:string,uploadedUrl:string){try{const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(ORDERS,'readwrite'),s=tx.objectStore(ORDERS),req=s.get(`${accountId}:${orderId}`);req.onsuccess=()=>{const row=req.result;if(row&&row.value){const o=row.value as ServiceOrder;const nextAtts=(o.attendances||[]).map(a=>{if(a.id!==attendanceId)return a;return{...a,photos:(a.photos||[]).map(p=>p.id===photoId?{...p,key:uploadedKey,dataUrl:uploadedUrl}:p)};});s.put({...row,value:{...o,attendances:nextAtts}});}};await txDone(tx);}catch(e){console.warn('Não foi possível atualizar foto no cache offline:',e);}}
async function enqueue(item:Omit<QueueItem,'accountId'>,order:ServiceOrder){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction([QUEUE,ORDERS],'readwrite');const scopedId=`${accountId}:${item.id}`;tx.objectStore(QUEUE).put({...item,id:scopedId,accountId});tx.objectStore(ORDERS).put({id:`${accountId}:${order.id}`,accountId,value:order});await txDone(tx);}
export async function queueOrderCreate(order:ServiceOrder){const now=Date.now();await enqueue({id:`create:${order.id}`,type:'order_create',orderId:order.id,order,createdAt:now,updatedAt:now,attempts:0},order);}
export async function queueOrderUpdate(order:ServiceOrder){const accountId=await activeAccountId(),now=Date.now(),db=await openDb(),tx=db.transaction(QUEUE,'readwrite'),s=tx.objectStore(QUEUE),scopedId=`${accountId}:order:${order.id}`,existingReq=s.get(scopedId);existingReq.onsuccess=()=>{const existing=existingReq.result as QueueItem|undefined;const baseVersion=Number.isFinite(existing?.baseVersion)?existing?.baseVersion:Number.isFinite(order.syncVersion)?order.syncVersion:undefined;s.put({id:scopedId,type:'order_update',orderId:order.id,order,accountId,baseVersion,createdAt:existing?.createdAt??now,updatedAt:now,attempts:existing?.attempts??0});};await txDone(tx);}
export async function queueOrderDelete(orderId:string,fallbackOrder?:ServiceOrder){
  const accountId=await activeAccountId(),now=Date.now(),db=await openDb(),tx=db.transaction([QUEUE,ORDERS],'readwrite');
  const queueStore=tx.objectStore(QUEUE),ordersStore=tx.objectStore(ORDERS);
  const scopedId=`${accountId}:delete:${orderId}`;
  ordersStore.delete(`${accountId}:${orderId}`);
  ordersStore.delete(orderId);
  const queueReq=queueStore.getAll();
  queueReq.onsuccess=()=>{
    const items=(queueReq.result||[]) as QueueItem[];
    let wasCreatedLocally=false;
    for(const item of items){
      if(Number(item.accountId)!==accountId)continue;
      const itemOrderId=item.orderId||item.order?.id;
      if(String(itemOrderId)===String(orderId)){
        if(item.type==='order_create')wasCreatedLocally=true;
        queueStore.delete(item.id);
      }
    }
    if(!wasCreatedLocally){
      queueStore.put({
        id:scopedId,
        type:'order_delete',
        orderId,
        order:fallbackOrder||({id:orderId,client:'',address:'',phone:'',type:'',date:'',priority:'medium',description:'',status:'pending',clientValue:0,expenses:[],attendances:[],payments:[],paymentStatus:'pending',assignedTechnicians:[],assignedTechnicianIds:[]} as ServiceOrder),
        accountId,
        createdAt:now,
        updatedAt:now,
        attempts:0
      });
    }
  };
  await txDone(tx);
}
export async function removeCachedOrder(id:string){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(ORDERS,'readwrite');tx.objectStore(ORDERS).delete(`${accountId}:${id}`);tx.objectStore(ORDERS).delete(id);await txDone(tx);}
export async function queueAttendancePhoto(order:ServiceOrder,attendanceId:string,photoId:string,file:Blob,fileName:string){const now=Date.now();await enqueue({id:`photo:${order.id}:${photoId}`,type:'attendance_photo',orderId:order.id,attendanceId,photoId,order,file,fileName,createdAt:now,updatedAt:now,attempts:0},order);}
export async function queueSignatureUpload(order:ServiceOrder,file:Blob,fileName:string){const now=Date.now();await enqueue({id:`signature:${order.id}`,type:'signature_upload',orderId:order.id,order,file,fileName,createdAt:now,updatedAt:now,attempts:0},order);}
function normalizeQueueItem(raw:any):QueueItem{
  const rawId=String(raw?.id??'');
  const scopedPrefix=raw.accountId!=null?String(raw.accountId)+':':'';
  const localId=scopedPrefix&&rawId.startsWith(scopedPrefix)?rawId.slice(scopedPrefix.length):rawId;
  const rawType=raw?.type;
  const inferredType:QueueItem['type']=
    rawType==='order_create'||rawType==='order_update'||rawType==='order_delete'||rawType==='attendance_photo'||rawType==='signature_upload'||rawType==='client_create'||rawType==='client_update'||rawType==='client_delete'
      ?rawType
      :localId.startsWith('create:')?'order_create'
      :localId.startsWith('order:')?'order_update'
      :localId.startsWith('delete:')?'order_delete'
      :localId.startsWith('client_create:')?'client_create'
      :localId.startsWith('client_update:')?'client_update'
      :localId.startsWith('client_delete:')?'client_delete'
      :localId.startsWith('photo:')?'attendance_photo'
      :localId.startsWith('signature:')?'signature_upload'
      :localId.startsWith('update:order:')?'order_update'
      :localId.startsWith('attendance-photo:')?'attendance_photo'
      :localId.startsWith('upload:offline/')?'legacy_upload'
      :'invalid';
  let inferredOrderId=String(raw?.orderId??raw?.order?.id??'');
  let inferredClientId=String(raw?.clientId??raw?.client?.id??'');
  if(!inferredOrderId&&localId.startsWith('update:order:')){const parts=localId.split(':');if(parts[2])inferredOrderId=parts[2];}
  if(!inferredOrderId){
    const parts=localId.split(':');
    if((parts[0]==='create'||parts[0]==='order'||parts[0]==='delete'||parts[0]==='signature')&&parts[1])inferredOrderId=parts[1];
    if(parts[0]==='photo'&&parts[1])inferredOrderId=parts[1];
    if(parts[0]==='attendance-photo'&&parts[1]){/* photo id only; order may be recovered from the cached order */}
  }
  if(!inferredClientId){
    const parts=localId.split(':');
    if((parts[0]==='client_create'||parts[0]==='client_update'||parts[0]==='client_delete')&&parts[1])inferredClientId=parts[1];
  }
  const created=Number(raw?.createdAt),updated=Number(raw?.updatedAt);
  const createdAt=Number.isFinite(created)&&created>0?created:Number.isFinite(updated)&&updated>0?updated:0;
  const updatedAt=Number.isFinite(updated)&&updated>0?updated:createdAt;
  const attempts=Number(raw?.attempts);
  return {...raw,id:rawId,type:inferredType,orderId:inferredOrderId,clientId:inferredClientId,accountId:Number(raw?.accountId),createdAt,updatedAt,attempts:Number.isFinite(attempts)&&attempts>=0?attempts:0} as QueueItem;
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
export type {AttendancePhoto};
