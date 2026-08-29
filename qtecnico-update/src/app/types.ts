export type Screen = "login" | "orders" | "profile";
export type OrderStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type PaymentStatus = "paid" | "pending";

export interface Client {
  id: string;
  name: string;
  document: string;
  address: string;
  phone: string;
  email: string;
}

export interface Expense {
  id: string;
  label: string;
  amount: number;
}

export interface AttendancePhoto {
  id: string;
  /** Chave do objeto no bucket privado — é o que deve ser persistido no banco. */
  key: string;
  /** URL assinada e temporária, só para exibição — nunca persistir isolada. */
  dataUrl: string;
  name: string;
}

export interface Attendance {
  id: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  description: string;
  photos: AttendancePhoto[];
}

export interface Payment {
  id: string;
  orderId: string;
  label: string;
  amount: number;
  date: string;
  status: "paid" | "pending";
}

export interface ServiceOrder {
  id: string;
  clientId: string;
  client: string;
  address: string;
  phone: string;
  type: string;
  status: OrderStatus;
  date: string;
  priority: "low" | "medium" | "high";
  description: string;
  clientValue: number;
  expenses: Expense[];
  attendances: Attendance[];
  payments: Payment[];
  paymentStatus: PaymentStatus;
  paidDate?: string;
  paidAmount?: number;
  /** URL assinada e temporária, só para exibição — nunca persistir isolada. */
  clientSignature?: string;
  /** Chave do objeto no bucket privado — é o que deve ser enviado ao salvar. */
  clientSignatureKey?: string;
}
