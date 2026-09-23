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

export interface Expense { id: string; label: string; amount: number; }
export interface AttendancePhoto { id: string; key: string; dataUrl: string; name: string; }
export interface Attendance { id: string; startTime: string; endTime: string; durationSeconds: number; description: string; photos: AttendancePhoto[]; }
export interface Payment { id: string; orderId: string; label: string; amount: number; date: string; status: "paid" | "pending"; }

export interface AssignedTechnician {
  id: number;
  name: string;
}

export interface ServiceOrder {
  syncVersion?: number;
  id: string;
  clientId: string;
  client: string;
  address: string;
  phone: string;
  type: string;
  serviceCategory?: "CFTV" | "Alarme" | "Controle de acesso" | "Rede" | "Incêndio" | "Fechadura eletrônica" | "Interfonia" | "Automação" | "Infraestrutura/Cabeamento" | "Outro";
  materialSupply?: "none" | "partial" | "full";
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
  clientSignature?: string;
  clientSignatureKey?: string;
  assignedTechnicianId?: number | null;
  assignedTechnicianName?: string | null;
  assignedTechnicians?: AssignedTechnician[];
  assignedTechnicianIds?: number[];
}
