// Valores usados somente na reconciliação do catálogo na inicialização e no banco em memória.
// As decisões de acesso em execução consultam saas_plans por meio de plans.ts.
export const INITIAL_PLAN_CATALOG = [
  ['essential','Essencial','Para profissionais e pequenas operações.',49.90,['orders','clients','agenda','offline','photos','signature','pdf','orderCosts','orderPayments'],{includedUsers:2,maxUsers:2,ordersPerMonth:50,additionalUserPrice:null}],
  ['pro','Pro','Para equipes que precisam controlar a operação e acompanhar resultados.',99.90,['orders','clients','agenda','offline','photos','signature','pdf','orderCosts','orderPayments','consolidatedFinance','financialIndicators','technicianPerformance','reports'],{includedUsers:5,maxUsers:10,ordersPerMonth:250,additionalUserPrice:12.90}],
  ['business','Business','Para operações estruturadas que precisam de controle e escala.',199.90,['orders','clients','agenda','offline','photos','signature','pdf','orderCosts','orderPayments','consolidatedFinance','financialIndicators','technicianPerformance','reports','advancedReports','customPermissions','auditLog','integrations','automations','prioritySupport'],{includedUsers:10,maxUsers:30,ordersPerMonth:1000,additionalUserPrice:9.90}],
] as const;
