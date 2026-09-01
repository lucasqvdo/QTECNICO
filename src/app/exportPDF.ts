import type { ServiceOrder, Client } from "./types";
import { STATUS_CONFIG, fmt, fmtDuration, fmtDateTime } from "./config";

export function exportPDF(order: ServiceOrder, client?: Client, techName = "Técnico") {
  const totalExpenses = order.expenses.reduce((s, e) => s + e.amount, 0);
  const margem = order.clientValue - totalExpenses;
  const status = STATUS_CONFIG[order.status];

  const attendanceRows = order.attendances.map((att) => {
    const photoImgs = att.photos.map(p =>
      `<img src="${p.dataUrl}" style="width:180px;height:120px;object-fit:cover;border-radius:6px;margin:4px;" alt="${p.name}" />`
    ).join("");
    return `
      <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:12px;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="font-weight:600;color:#1A2B4A;">Atendimento — ${fmtDateTime(att.startTime)}</span>
          <span style="background:#DBEAFE;color:#1D4ED8;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;">
            Duração: ${fmtDuration(att.durationSeconds)}
          </span>
        </div>
        <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 10px;">${att.description || "Sem descrição."}</p>
        ${att.photos.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:6px;">${photoImgs}</div>` : ""}
      </div>`;
  }).join("");

  const expenseRows = order.expenses.map(e =>
    `<tr><td style="padding:6px 0;color:#374151;">${e.label}</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fmt(e.amount)}</td></tr>`
  ).join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>OS ${order.id} — QTecnico</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:Arial,sans-serif;color:#0D1B2E;padding:32px;font-size:14px;}
    h1{color:#1A2B4A;font-size:22px;margin-bottom:4px;}
    h2{color:#1A2B4A;font-size:15px;margin:20px 0 10px;}
    .badge{display:inline-block;padding:3px 12px;border-radius:999px;font-size:12px;font-weight:700;}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
    .card{border:1px solid #e2e8f0;border-radius:8px;padding:14px;}
    .label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748B;font-weight:600;margin-bottom:4px;}
    table{width:100%;border-collapse:collapse;}
    td{vertical-align:top;}
    .total-row td{font-weight:700;border-top:2px solid #e2e8f0;padding-top:8px;margin-top:4px;}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1A2B4A;padding-bottom:16px;margin-bottom:20px;}
    .logo-text{font-size:24px;font-weight:900;color:#1A2B4A;}
    .logo-text span{color:#29C5E8;}
    @media print{body{padding:20px;}}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo-text">Q<span>Tecnico</span></div>
      <div style="color:#64748B;font-size:12px;margin-top:2px;">Gestão de Ordens de Serviço</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:18px;font-weight:700;color:#1A2B4A;">${order.id}</div>
      <div style="color:#64748B;font-size:12px;">${new Date(order.date + "T12:00:00").toLocaleDateString("pt-BR")}</div>
      <span class="badge" style="background:${STATUS_CONFIG[order.status].bg};color:${STATUS_CONFIG[order.status].color};margin-top:4px;">
        ${status.label}
      </span>
    </div>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="label">Cliente</div>
      <div style="font-weight:700;font-size:15px;margin-bottom:6px;">${order.client}</div>
      ${client ? `<div style="color:#64748B;font-size:13px;">${client.document}</div>` : ""}
      <div style="color:#64748B;font-size:13px;margin-top:4px;">${order.address}</div>
      <div style="color:#64748B;font-size:13px;">${order.phone}</div>
    </div>
    <div class="card">
      <div class="label">Serviço</div>
      <div style="font-weight:700;font-size:15px;margin-bottom:6px;">${order.type}</div>
      <div style="color:#374151;font-size:13px;line-height:1.5;">${order.description}</div>
      <div style="margin-top:8px;font-size:12px;color:#64748B;">Técnico: <strong>${techName}</strong></div>
    </div>
  </div>

  <h2>Controle Financeiro</h2>
  <div class="card">
    <table>
      ${expenseRows}
      <tr class="total-row">
        <td>Total de custos</td>
        <td style="text-align:right;">${fmt(totalExpenses)}</td>
      </tr>
      <tr>
        <td style="padding-top:8px;">Valor do cliente</td>
        <td style="text-align:right;padding-top:8px;color:#1A2B4A;font-weight:700;">${fmt(order.clientValue)}</td>
      </tr>
      <tr>
        <td style="padding-top:4px;font-weight:700;">Margem</td>
        <td style="text-align:right;padding-top:4px;font-weight:700;color:${margem >= 0 ? "#15803D" : "#B91C1C"};">${fmt(margem)}</td>
      </tr>
    </table>
  </div>

  <h2>Registros de Atendimento (${order.attendances.length})</h2>
  ${order.attendances.length === 0
    ? `<p style="color:#64748B;font-style:italic;">Nenhum atendimento registrado.</p>`
    : attendanceRows}

  <div style="margin-top:32px;border-top:1px solid #e2e8f0;padding-top:12px;font-size:11px;color:#94A3B8;text-align:center;">
    Documento gerado pelo QTecnico em ${new Date().toLocaleString("pt-BR")}
  </div>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }
}
