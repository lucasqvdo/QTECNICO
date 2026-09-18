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
  id:string; type:'order_create'|'order_update'|'attendance_photo'|'signature_upload'; orderId:string;
  accountId:number; legacyUserId?:number; attendanceId?:string; order:ServiceOrder; createdAt:number; updatedAt:number;
  attempts:number; file?:Blob; fileName?:string; photoId?:string; lastError?:string; uploadedKey?:string; uploadedUrl?:string;
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
  const db=await openDb(),accountId=Number(user.accountId),tx=db.transaction([ORDERS,CLIENTS,META,QUEUE],'readwrite');
  const os=tx.objectStore(ORDERS),qs=tx.objectStore(QUEUE),pendingReq=qs.getAll();
  pendingReq.onsuccess=()=>{const pending=(pendingReq.result||[]).filter((x:any)=>Number(x.accountId)===accountId) as QueueItem[];os.clear();for(const order of orders)os.put({id:`${accountId}:${order.id}`,accountId,value:order});const pendingOrders=new Map<string,ServiceOrder>();for(const item of pending)pendingOrders.set(item.orderId,item.order);for(const order of pendingOrders.values())os.put({id:`${accountId}:${order.id}`,accountId,value:order});if(clients){const cs=tx.objectStore(CLIENTS);cs.clear();for(const client of clients)cs.put({id:`${accountId}:${client.id}`,accountId,value:client});}tx.objectStore(META).put({key:'user',value:user});tx.objectStore(META).put({key:'last_server_sync',value:Date.now()});};
  await txDone(tx);
}
async function putOrder(order:ServiceOrder){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(ORDERS,'readwrite');tx.objectStore(ORDERS).put({id:`${accountId}:${order.id}`,accountId,value:order});await txDone(tx);}
export async function cacheOrders(orders:ServiceOrder[]){for(const order of orders)await putOrder(order);}
export async function cacheClients(clients:Client[]){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(CLIENTS,'readwrite'),s=tx.objectStore(CLIENTS);s.clear();for(const c of clients)s.put({id:`${accountId}:${c.id}`,accountId,value:c});await txDone(tx);}
async function enqueue(item:Omit<QueueItem,'accountId'>,order:ServiceOrder){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction([QUEUE,ORDERS],'readwrite');tx.objectStore(QUEUE).put({...item,accountId});tx.objectStore(ORDERS).put({id:`${accountId}:${order.id}`,accountId,value:order});await txDone(tx);}
export async function queueOrderCreate(order:ServiceOrder){const now=Date.now();await enqueue({id:`create:${order.id}`,type:'order_create',orderId:order.id,order,createdAt:now,updatedAt:now,attempts:0},order);}
export async function queueOrderUpdate(order:ServiceOrder){const now=Date.now();await enqueue({id:`order:${order.id}`,type:'order_update',orderId:order.id,order,createdAt:now,updatedAt:now,attempts:0},order);}
export async function queueAttendancePhoto(order:ServiceOrder,attendanceId:string,photoId:string,file:Blob,fileName:string){const now=Date.now();await enqueue({id:`photo:${order.id}:${photoId}`,type:'attendance_photo',orderId:order.id,attendanceId,photoId,order,file,fileName,createdAt:now,updatedAt:now,attempts:0},order);}
export async function queueSignatureUpload(order:ServiceOrder,file:Blob,fileName:string){const now=Date.now();await enqueue({id:`signature:${order.id}`,type:'signature_upload',orderId:order.id,order,file,fileName,createdAt:now,updatedAt:now,attempts:0},order);}
export async function getQueue():Promise<QueueItem[]>{const accountId=await activeAccountId(),db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(QUEUE,'readonly'),req=tx.objectStore(QUEUE).getAll();tx.oncomplete=()=>resolve((req.result||[]).filter((x:any)=>Number(x.accountId)===accountId) as QueueItem[]);tx.onerror=()=>reject(tx.error||new Error('Não foi possível ler a fila offline.'));});}
export async function updateQueueUpload(id:string,uploadedKey:string,uploadedUrl:string){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(QUEUE,'readwrite'),s=tx.objectStore(QUEUE),req=s.get(id);req.onsuccess=()=>{const item=req.result as QueueItem|undefined;if(item&&Number(item.accountId)===accountId)s.put({...item,uploadedKey,uploadedUrl,updatedAt:Date.now()});};await txDone(tx);}
export async function updateQueueFailure(id:string,error:string){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(QUEUE,'readwrite'),s=tx.objectStore(QUEUE),req=s.get(id);req.onsuccess=()=>{const item=req.result as QueueItem|undefined;if(item&&Number(item.accountId)===accountId)s.put({...item,attempts:item.attempts+1,lastError:error,updatedAt:Date.now()});};await txDone(tx);}
export async function removeQueueItem(id:string){const accountId=await activeAccountId(),db=await openDb(),tx=db.transaction(QUEUE,'readwrite'),s=tx.objectStore(QUEUE),req=s.get(id);req.onsuccess=()=>{const item=req.result as QueueItem|undefined;if(item&&Number(item.accountId)===accountId)s.delete(id);};await txDone(tx);}
export async function getLastServerSync():Promise<number|null>{const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(META,'readonly'),req=tx.objectStore(META).get('last_server_sync');tx.oncomplete=()=>resolve(typeof req.result?.value==='number'?req.result.value:null);tx.onerror=()=>reject(tx.error||new Error('Não foi possível ler o estado offline.'));});}
export async function markServerSync(){const db=await openDb(),tx=db.transaction(META,'readwrite');tx.objectStore(META).put({key:'last_server_sync',value:Date.now()});await txDone(tx);}
export type {QueueItem}; export type {AttendancePhoto};
