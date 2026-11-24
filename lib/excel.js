import ExcelJS from "exceljs";
import { calc, fmtDate, ymd } from "./core.js";

const STATUS = { paid: "To'landi", late: "Kechikdi", partial: "Qisman", pending: "Kutilmoqda" };

function sheet(wb, name, columns) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns;
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
  return ws;
}

// Excel (.xlsx) fayl: Mijozlar, To'lovlar, Jadval
export async function buildWorkbook(debtors) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Variant to'lov bot";

  const cl = sheet(wb, "Mijozlar", [
    { header: "Mijoz", key: "name", width: 24 }, { header: "Telefon", key: "phone", width: 17 },
    { header: "Mahsulot", key: "product", width: 22 }, { header: "Soni", key: "qty", width: 7 },
    { header: "Sotilgan sana", key: "saleDate", width: 13 }, { header: "Valyuta", key: "cur", width: 8 },
    { header: "Xarid narxi", key: "buy", width: 12 }, { header: "Sotuv narxi", key: "total", width: 12 },
    { header: "Foyda", key: "profit", width: 11 }, { header: "Oldindan to'lov", key: "down", width: 14 },
    { header: "Oylar", key: "months", width: 7 }, { header: "Oylik to'lov", key: "monthly", width: 12 },
    { header: "1-to'lov sanasi", key: "first", width: 14 }, { header: "To'langan", key: "paid", width: 12 },
    { header: "Qolgan qarz", key: "rem", width: 12 }, { header: "To'langan oylar", key: "pm", width: 14 },
    { header: "Kechikkan", key: "over", width: 11 }, { header: "Holat", key: "state", width: 12 },
  ]);
  const pl = sheet(wb, "To'lovlar", [
    { header: "Sana", key: "date", width: 12 }, { header: "Mijoz", key: "name", width: 24 },
    { header: "Mahsulot", key: "product", width: 22 }, { header: "Summa", key: "amount", width: 12 },
    { header: "Valyuta", key: "cur", width: 8 }, { header: "Izoh", key: "note", width: 30 },
  ]);
  const sc = sheet(wb, "Jadval", [
    { header: "Mijoz", key: "name", width: 24 }, { header: "#", key: "n", width: 5 },
    { header: "Sana", key: "due", width: 12 }, { header: "Summa", key: "amount", width: 12 },
    { header: "Holat", key: "status", width: 12 }, { header: "To'langan sana", key: "paidOn", width: 14 },
  ]);

  const payRows = [];
  for (const d of debtors) {
    const c = calc(d);
    cl.addRow({
      name: d.name, phone: d.phone, product: d.product, qty: d.qty, saleDate: fmtDate(d.saleDate), cur: d.currency,
      buy: d.buyPrice ?? "", total: d.total, profit: d.buyPrice != null ? d.total - d.buyPrice : "",
      down: d.down, months: d.months, monthly: d.monthly, first: fmtDate(d.firstDue), paid: c.paid,
      rem: c.remaining, pm: `${c.paidMonths}/${d.months}`, over: c.overdue,
      state: c.done ? "Tugagan" : c.overdue > 0 ? "Kechikkan" : "Faol",
    });
    for (const p of d.payments)
      payRows.push({ iso: p.date, date: fmtDate(ymd(p.date)), name: d.name, product: d.product, amount: p.amount, cur: d.currency, note: p.note });
    for (const r of c.rows)
      sc.addRow({ name: d.name, n: r.n === 0 ? "Oldindan" : r.n, due: fmtDate(r.due), amount: r.amount, status: STATUS[r.status], paidOn: fmtDate(r.paidOn) });
  }
  payRows.sort((a, b) => a.iso.localeCompare(b.iso)).forEach((r) => pl.addRow(r));

  // Jami qatorlar (Excel formulalari)
  const n = debtors.length;
  if (n) {
    const t = cl.addRow({ name: "JAMI" });
    for (const col of ["H", "I", "N", "O", "Q"]) t.getCell(col).value = { formula: `SUM(${col}2:${col}${n + 1})` };
    t.font = { bold: true };
  }
  return wb.xlsx.writeBuffer();
}
