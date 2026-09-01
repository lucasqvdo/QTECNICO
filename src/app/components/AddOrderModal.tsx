import { useState } from "react";
import { Search, X } from "lucide-react";
import { PRIORITY_CONFIG, fmt } from "../config";
import { Field } from "./ui/SharedComponents";
import type { Client, ServiceOrder } from "../types";

export function AddOrderModal({ clients, orders, onAdd, onClose }: {
  clients: Client[]; orders: ServiceOrder[]; onAdd: (o: ServiceOrder) => void; onClose: () => void;
}) {
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [type, setType] = useState("");
  const [priority, setPriority] = useState<ServiceOrder["priority"]>("medium");
  const [description, setDescription] = useState("");
  const [clientValue, setClientValue] = useState("");

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) || c.document.includes(clientSearch)
  );

  const handleAdd = () => {
    if (!selectedClient || !type.trim()) return;
    const now = new Date();
    const ym = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    const id = `OS-${ym}-${rand}`;
    onAdd({
      id, clientId: selectedClient.id, client: selectedClient.name,
      address: selectedClient.address, phone: selectedClient.phone,
      type, status: "pending", date: new Date().toISOString().split("T")[0],
      priority, description,
      clientValue: parseFloat(clientValue.replace(",", ".")) || 0,
      expenses: [], attendances: [],
      paymentStatus: "pending",
    });
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="bg-background rounded-t-3xl p-6 pb-10 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground">Nova Ordem de Serviço</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={18} className="text-muted-foreground" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Cliente *</label>
            {selectedClient ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary border-2 border-primary/20">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{selectedClient.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{selectedClient.document}</p>
                </div>
                <button onClick={() => setSelectedClient(null)} className="p-1 rounded-lg hover:bg-red-50 transition-colors">
                  <X size={14} className="text-muted-foreground" />
                </button>
              </div>
            ) : (
              <button onClick={() => setShowPicker(!showPicker)}
                className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-secondary text-sm text-muted-foreground text-left hover:bg-muted transition-colors">
                <Search size={15} /> Selecionar cliente...
              </button>
            )}
            {showPicker && !selectedClient && (
              <div className="mt-2 border border-border rounded-xl overflow-hidden bg-card shadow-lg">
                <div className="p-2 border-b border-border">
                  <input value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Buscar..."
                    className="w-full px-3 py-2 rounded-lg bg-secondary text-sm text-foreground outline-none" autoFocus />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filtered.length === 0
                    ? <p className="text-xs text-muted-foreground text-center py-4">Nenhum cliente encontrado.</p>
                    : filtered.map(c => (
                      <button key={c.id} onClick={() => { setSelectedClient(c); setShowPicker(false); setClientSearch(""); }}
                        className="w-full text-left px-4 py-3 hover:bg-secondary transition-colors border-b border-border last:border-0">
                        <p className="font-semibold text-sm text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{c.document}</p>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          <Field label="Tipo de serviço *" value={type} onChange={setType} placeholder="ex: Instalação Elétrica" />

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Valor do cliente (R$)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
              <input type="number" value={clientValue} onChange={e => setClientValue(e.target.value)} placeholder="0,00"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>

          <Field label="Descrição" value={description} onChange={setDescription} placeholder="Detalhes do serviço..." textarea />

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Prioridade</label>
            <div className="flex gap-2">
              {(["low", "medium", "high"] as const).map(p => (
                <button key={p} onClick={() => setPriority(p)}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={priority === p ? { background: PRIORITY_CONFIG[p].color, color: "white" } : { background: "var(--secondary)", color: "var(--muted-foreground)" }}>
                  {PRIORITY_CONFIG[p].label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleAdd} disabled={!selectedClient || !type.trim()}
            className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-40"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            Criar Ordem de Serviço
          </button>
        </div>
      </div>
    </div>
  );
}
