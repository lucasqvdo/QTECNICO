import { Client } from "./types";

export const INITIAL_CLIENTS: Client[] = [
  { id: "c1", name: "Construtora Alpina Ltda",      document: "12.345.678/0001-90", address: "Av. Paulista, 1374 — São Paulo, SP",        phone: "(11) 99832-4411", email: "contato@alpina.com.br" },
  { id: "c2", name: "Residencial Parque Verde",      document: "98.765.432/0001-11", address: "Rua das Flores, 88 — Campinas, SP",          phone: "(19) 98741-3300", email: "admin@parqueverde.com.br" },
  { id: "c3", name: "Mercado Bom Preço",             document: "45.678.901/0001-23", address: "Rua XV de Novembro, 220 — Santos, SP",       phone: "(13) 97654-8800", email: "gerencia@bompreco.com.br" },
  { id: "c4", name: "Clínica São Lucas",             document: "78.901.234/0001-56", address: "Av. Dom Pedro I, 450 — Ribeirão Preto, SP",  phone: "(16) 99123-5566", email: "recepcao@saolucas.com.br" },
  { id: "c5", name: "Escola Estadual Tiradentes",    document: "11.222.333/0001-44", address: "Rua Independência, 300 — Sorocaba, SP",      phone: "(15) 98900-1122", email: "diretoria@eetiradentes.edu.br" },
];
