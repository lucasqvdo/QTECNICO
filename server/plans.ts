export type PlanKey = 'essential' | 'pro' | 'business';

export interface PlanLimits {
  /** null = ilimitado */
  maxOrdersPerMonth: number | null;
  maxPhotosPerAttendance: number | null;
  maxUsers: number;
}
export interface PlanFeatures {
  financialReports: boolean;
  pdfExport: boolean;
  clientNotifications: boolean;
  multiUser: boolean;
  api: boolean;
  whiteLabel: boolean;
}
export interface Plan { key:PlanKey; name:string; priceCents:number; limits:PlanLimits; features:PlanFeatures; }

export const PLANS:Record<PlanKey,Plan>={
  essential:{key:'essential',name:'Essencial',priceCents:4990,limits:{maxOrdersPerMonth:50,maxPhotosPerAttendance:null,maxUsers:2},features:{financialReports:false,pdfExport:true,clientNotifications:false,multiUser:true,api:false,whiteLabel:false}},
  pro:{key:'pro',name:'Pro',priceCents:9990,limits:{maxOrdersPerMonth:250,maxPhotosPerAttendance:null,maxUsers:10},features:{financialReports:true,pdfExport:true,clientNotifications:true,multiUser:true,api:false,whiteLabel:false}},
  business:{key:'business',name:'Business',priceCents:19990,limits:{maxOrdersPerMonth:1000,maxPhotosPerAttendance:null,maxUsers:30},features:{financialReports:true,pdfExport:true,clientNotifications:true,multiUser:true,api:true,whiteLabel:false}},
};
export function getPlan(key:string|null|undefined):Plan{return PLANS[(key as PlanKey) in PLANS?(key as PlanKey):'essential'];}
