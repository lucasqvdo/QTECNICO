import type { ServiceOrder, Client } from "./types";
import { STATUS_CONFIG, fmt, fmtDuration, fmtDateTime } from "./config";
import { api, type CompanyProfileData } from "./api";

const esc = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const safeUrl = (value: unknown) => {
  const url = String(value ?? "").trim();
  if (!url) return "";
  if (url.startsWith("data:image/") || url.startsWith("https://") || url.startsWith("http://")) return url;
  return "";
};

const companyAddress = (company?: CompanyProfileData | null) =>
  [company?.address, company?.number, company?.complement, company?.neighborhood]
    .filter(Boolean).join(", ") +
  ([company?.city, company?.state, company?.postalCode].filter(Boolean).length
    ? ` — ${[company?.city, company?.state].filter(Boolean).join("/")}${company?.postalCode ? ` · CEP ${company.postalCode}` : ""}`
    : "");

export type PdfMode = "client" | "admin";

export async function exportPDF(order: ServiceOrder, client?: Client, techName = "Técnico", mode: PdfMode = "client") {
  const win = window.open("", "_blank");
  if (!win) {
    window.alert("O navegador bloqueou a janela do PDF. Permita pop-ups para este site e tente novamente.");
    return;
  }

  let company: CompanyProfileData | null = null;
  try { company = await api.getDocumentCompanyProfile(); } catch { /* PDF continua com cabeçalho padrão/offline. */ }

  const totalExpenses = order.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const margem = Number(order.clientValue || 0) - totalExpenses;
  const status = STATUS_CONFIG[order.status];
  const payments = order.payments || [];
  const paid = payments.length
    ? payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    : (order.paymentStatus === "paid" ? Number(order.paidAmount ?? order.clientValue ?? 0) : 0);
  const pending = payments.length
    ? payments.filter((payment) => payment.status === "pending").reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    : Math.max(0, Number(order.clientValue || 0) - paid);
  const isAdminPdf = mode === "admin";
  const clientValue = Number(order.clientValue || 0);
  const expenseCount = order.expenses.length;
  const paidDate = order.paidDate ? new Date(order.paidDate).toLocaleDateString("pt-BR") : "";
  const totalAttendanceSeconds = order.attendances.reduce((sum, att) => sum + Number(att.durationSeconds || 0), 0);
  const marginPct = clientValue > 0 ? (margem / clientValue) * 100 : 0;
  const costPct = clientValue > 0 ? (totalExpenses / clientValue) * 100 : 0;
  const hasFinancialData = isAdminPdf && (totalExpenses > 0 || clientValue > 0 || payments.length > 0 || order.paymentStatus);

  const logoUrl = safeUrl(company?.logoUrl || company?.logoKey);
  const companyName = company?.tradeName || company?.legalName || "QTECNICO";
  const documentLabel = isAdminPdf ? "Documento administrativo · Uso interno" : "Relatório de serviço · Cliente";
  const companyDocument = company?.document ? `CNPJ/CPF: ${esc(company.document)}` : "";
  const contactParts = [company?.phone, company?.whatsapp ? `WhatsApp: ${company.whatsapp}` : "", company?.email].filter(Boolean);
  const address = companyAddress(company);

  const attendanceRows = order.attendances.map((att) => {
    const photoImgs = att.photos.map((photo) => {
      const src = safeUrl(photo.dataUrl);
      return src ? `<img class="photo" src="${src}" alt="${esc(photo.name || "Foto do atendimento")}" />` : "";
    }).join("");
    return `
      <section class="attendance">
        <div class="attendance-head">
          <strong>Atendimento — ${esc(fmtDateTime(att.startTime))}</strong>
          <span class="duration">Duração: ${esc(fmtDuration(att.durationSeconds))}</span>
        </div>
        <p class="description">${esc(att.description || "Sem descrição.")}</p>
        ${att.endTime ? `<div class="muted">Encerrado em ${esc(fmtDateTime(att.endTime))}</div>` : ""}
        ${photoImgs ? `<div class="photos">${photoImgs}</div>` : ""}
      </section>`;
  }).join("");

  const expenseRows = order.expenses.map((expense) =>
    `<tr><td>${esc(expense.label)}</td><td class="money">${fmt(Number(expense.amount || 0))}</td></tr>`
  ).join("");

  const paymentRows = payments.map((payment) =>
    `<tr><td>${esc(payment.label || "Pagamento")}</td><td>${esc(payment.date || "")}</td><td>${esc(payment.status === "paid" ? "Pago" : "Pendente")}</td><td class="money">${fmt(Number(payment.amount || 0))}</td></tr>`
  ).join("");

  const signatureUrl = safeUrl(order.clientSignature);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>OS ${esc(order.id)} — ${esc(companyName)}</title>
<style>
*{box-sizing:border-box}
@page{size:A4;margin:14mm 13mm 16mm}
body{font-family:Arial,Helvetica,sans-serif;color:#0D1B2E;font-size:12px;line-height:1.45;margin:0}
h2{color:#1A2B4A;font-size:14px;margin:20px 0 9px;border-bottom:1px solid #dbe3ec;padding-bottom:5px}
.header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:3px solid #29C5E8;padding-bottom:12px;margin-bottom:16px}
.brand{display:flex;gap:12px;align-items:flex-start;min-width:0}
.logo{width:82px;height:48px;object-fit:contain;border-radius:4px}
.brand-name{font-size:20px;font-weight:800;color:#1A2B4A}
.brand-name span{color:#29C5E8}
.meta{color:#64748B;font-size:10px;margin-top:3px}
.os{text-align:right;min-width:130px}
.os-id{font-size:18px;font-weight:800;color:#1A2B4A}
.date{color:#64748B;font-size:10px;margin-top:2px}
.badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:10px;font-weight:700;margin-top:5px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.card{border:1px solid #dbe3ec;border-radius:7px;padding:11px;break-inside:avoid}
.label{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#64748B;font-weight:700;margin-bottom:3px}
.value{font-size:12px}
.muted{color:#64748B;font-size:10px}
.description{color:#374151;margin:7px 0 0;white-space:pre-wrap}
table{width:100%;border-collapse:collapse}
th{text-align:left;background:#f1f5f9;color:#475569;font-size:9px;text-transform:uppercase;padding:6px}
td{vertical-align:top;padding:6px;border-bottom:1px solid #edf1f5}
.money{text-align:right;font-weight:700}
.total td{border-top:2px solid #cbd5e1;font-weight:800}
.admin-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
.admin-kpi{border:1px solid #dbe3ec;border-radius:7px;padding:9px;background:#f8fafc}
.admin-kpi .kpi-label{font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:#64748B;font-weight:700}
.admin-kpi .kpi-value{font-size:15px;font-weight:800;color:#1A2B4A;margin-top:3px}
.admin-kpi .kpi-note{font-size:8px;color:#64748B;margin-top:2px}
.admin-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.attendance{border:1px solid #dbe3ec;border-radius:7px;padding:11px;margin-bottom:9px;break-inside:avoid}
.attendance-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:6px;color:#1A2B4A}
.duration{background:#DBEAFE;color:#1D4ED8;padding:3px 8px;border-radius:999px;font-size:9px;font-weight:700}
.photos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:8px;align-items:start}
.photo{width:100%;height:auto;max-height:240px;object-fit:contain;display:block;border-radius:5px;border:1px solid #e2e8f0;background:#f8fafc}
.signature{margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:24px;break-inside:avoid}
.signature-box{min-height:105px;border-bottom:1px solid #475569;position:relative;padding-top:8px}
.signature-img{max-width:100%;height:75px;object-fit:contain;display:block;margin:0 auto}
.footer{margin-top:24px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:9px;color:#94A3B8;text-align:center}
@media print{.no-print{display:none!important}.attendance,.card,.signature{break-inside:avoid}.photo{break-inside:avoid}}
@media(max-width:700px){body{padding:12px}.grid2{grid-template-columns:1fr}.photos{grid-template-columns:1fr}.photo{max-height:none}.header{flex-direction:column}.os{text-align:left}}
</style>
</head>
<body>
<header class="header">
  <div class="brand">
    ${logoUrl ? `<img class="logo" src="${logoUrl}" alt="Logo"/>` : ""}
    <div>
      <div class="brand-name">${esc(companyName)}</div>
      <div class="meta">${esc(documentLabel)}</div>
      ${companyDocument ? `<div class="meta">${companyDocument}</div>` : ""}
      ${contactParts.length ? `<div class="meta">${esc(contactParts.join(" · "))}</div>` : ""}
      ${address ? `<div class="meta">${esc(address)}</div>` : ""}
    </div>
  </div>
  <div class="os">
    <div class="os-id">${esc(order.id)}</div>
    <div class="date">${esc(new Date(order.date + "T12:00:00").toLocaleDateString("pt-BR"))}</div>
    <span class="badge" style="background:${status.bg};color:${status.color}">${esc(status.label)}</span>
  </div>
</header>

<div class="grid2">
  <div class="card">
    <div class="label">Cliente</div>
    <div class="value"><strong>${esc(order.client)}</strong></div>
    ${client?.document ? `<div class="muted">${esc(client.document)}</div>` : ""}
    <div class="muted">${esc(order.address)}</div>
    <div class="muted">${esc(order.phone)}</div>
  </div>
  <div class="card">
    <div class="label">Serviço</div>
    <div class="value"><strong>${esc(order.type)}</strong></div>
    <div class="description">${esc(order.description)}</div>
    <div class="muted" style="margin-top:6px">Técnico: <strong>${esc(techName)}</strong></div>
  </div>
</div>

${hasFinancialData ? `
<h2>Resumo Financeiro e Administrativo</h2>
<div class="admin-summary">
<div class="admin-kpi"><div class="kpi-label">Valor da OS</div><div class="kpi-value">${fmt(clientValue)}</div><div class="kpi-note">Valor cobrado do cliente</div></div>
<div class="admin-kpi"><div class="kpi-label">Custos / despesas</div><div class="kpi-value">${fmt(totalExpenses)}</div><div class="kpi-note">${expenseCount} lançamento(s) · ${costPct.toFixed(1)}% do valor</div></div>
<div class="admin-kpi"><div class="kpi-label">Margem bruta</div><div class="kpi-value" style="color:${margem >= 0 ? "#15803D" : "#B91C1C"}">${fmt(margem)}</div><div class="kpi-note">${marginPct.toFixed(1)}% do valor da OS</div></div>
<div class="admin-kpi"><div class="kpi-label">Saldo a receber</div><div class="kpi-value">${fmt(pending)}</div><div class="kpi-note">Recebido: ${fmt(paid)}</div></div>
</div>
<div class="admin-meta">
<div class="card"><div class="label">Status financeiro</div><div class="value"><strong>${esc(order.paymentStatus === "paid" ? "Pago" : "Pendente")}</strong>${paidDate ? `<div class="muted">Último pagamento: ${esc(paidDate)}</div>` : ""}</div></div>
<div class="card"><div class="label">Operação</div><div class="value"><strong>${esc(order.priority === "high" ? "Alta" : order.priority === "medium" ? "Média" : "Baixa")}</strong><div class="muted">Prioridade da OS · ${order.attendances.length} atendimento(s)</div></div></div>
<div class="card"><div class="label">Equipe responsável</div><div class="value"><strong>${esc(order.assignedTechnicians?.map(t => t.name).join(", ") || order.assignedTechnicianName || techName)}</strong><div class="muted">${esc(totalAttendanceSeconds ? `Tempo total: ${fmtDuration(totalAttendanceSeconds)}` : "Tempo de atendimento não registrado")}</div></div></div>
</div>
<div class="card" style="margin-top:8px"><table><thead><tr><th>Despesa / custo</th><th style="text-align:right">Valor</th></tr></thead><tbody>
${expenseRows || '<tr><td colspan="2" class="muted">Nenhuma despesa lançada.</td></tr>'}
<tr class="total"><td>Total de custos</td><td class="money">${fmt(totalExpenses)}</td></tr>
<tr><td>Valor do cliente</td><td class="money">${fmt(clientValue)}</td></tr>
<tr><td>Margem após custos</td><td class="money" style="color:${margem >= 0 ? "#15803D" : "#B91C1C"}">${fmt(margem)}</td></tr>
</tbody></table></div>
${paymentRows ? `<h2>Parcelas e recebimentos</h2><table><thead><tr><th>Pagamento</th><th>Data</th><th>Status</th><th style="text-align:right">Valor</th></tr></thead><tbody>${paymentRows}</tbody></table>` : `<div class="muted" style="margin-top:8px">Nenhum lançamento de pagamento detalhado. Status atual: ${esc(order.paymentStatus === "paid" ? "Pago" : "Pendente")}.</div>`}
` : ""}


<h2>Registros de Atendimento (${order.attendances.length})</h2>
${order.attendances.length ? attendanceRows : '<p class="muted">Nenhum atendimento registrado.</p>'}

${signatureUrl ? `
<h2>Confirmação do cliente</h2>
<div class="signature">
  <div class="signature-box"><img class="signature-img" src="${signatureUrl}" alt="Assinatura do cliente"/><div class="muted">Assinatura do cliente</div></div>
  <div class="signature-box"><div><strong>${esc(order.client)}</strong></div><div class="muted">Documento: ${esc(client?.document || "Não informado")}</div><div class="muted">Data: ${esc(new Date().toLocaleDateString("pt-BR"))}</div></div>
</div>
` : ""}

<footer class="footer">Documento gerado pelo QTECNICO em ${esc(new Date().toLocaleString("pt-BR"))} · ${esc(companyName)}</footer>
<script>
window.addEventListener("load", async () => {
  try { await Promise.all(Array.from(document.images).map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.addEventListener("load", resolve, {once:true}); img.addEventListener("error", resolve, {once:true}); }))); } catch {}
  setTimeout(() => window.print(), 150);
});
</script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function exportClientPDF(order: ServiceOrder, client?: Client, techName = "Técnico") {
  return exportPDF(order, client, techName, "client");
}

export function exportAdminPDF(order: ServiceOrder, client?: Client, techName = "Técnico") {
  return exportPDF(order, client, techName, "admin");
}
