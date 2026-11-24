// Namuna (demo) rejim: ruxsati yo'q odam panelni ochsa, haqiqiy mijozlar o'rniga shu soxta ma'lumotlar ko'rsatiladi.
// Hech narsa saqlanmaydi, haqiqiy ma'lumotlar ko'rinmaydi.
const ymd = (d) => d.toISOString().slice(0, 10);
const shift = (months, days = 0) => { const d = new Date(); d.setMonth(d.getMonth() + months); d.setDate(d.getDate() + days); return d; };

function debtor(i, name, product, total, down, months, startMonthsAgo, paidCount, currency = "USD", buyPrice = null) {
  const sale = shift(-startMonthsAgo);
  const first = shift(-startMonthsAgo + 1);
  const rest = total - down;
  const monthly = Math.round((rest / months) * 100) / 100;
  const lastAmt = Math.round((rest - monthly * (months - 1)) * 100) / 100;
  const payments = [];
  if (down > 0) payments.push({ id: `d${i}0`, amount: down, date: `${ymd(sale)}T09:00:00.000Z`, by: "system", note: "Oldindan to'lov" });
  for (let k = 0; k < paidCount; k++) {
    const pd = new Date(first); pd.setMonth(pd.getMonth() + k);
    payments.push({ id: `d${i}${k + 1}`, amount: k === months - 1 ? lastAmt : monthly, date: `${ymd(pd)}T12:00:00.000Z`, by: "demo", note: "" });
  }
  return {
    id: `demo${i}`, inv: `demo${i}`, name, phone: "+998 90 000 00 0" + i, product, qty: 1, code: "", note: "Namuna mijoz",
    currency, buyPrice, total, down, months, monthly, lastAmt, saleDate: ymd(sale), firstDue: ymd(first), dueDay: first.getDate(),
    chatId: null, tgId: null, username: null, lastReminded: null, payments, excuses: [], messages: [],
  };
}

export const demoDebtors = () => [
  debtor(1, "Aziz Karimov", "Samsung Galaxy A55", 600, 100, 6, 3, 3, "USD", 480),
  debtor(2, "Dilnoza Rahimova", "Muzlatkich Artel", 900, 200, 10, 5, 3, "USD", 720),
  debtor(3, "Bekzod Tursunov", "Noutbuk HP", 1200, 0, 12, 4, 4, "USD", 950),
  debtor(4, "Malika Yusupova", "Kir yuvish mashinasi", 7500000, 1500000, 6, 6, 6, "UZS", 6000000),
  debtor(5, "Jasur Aliyev", "iPhone 15", 1100, 300, 8, 2, 0, "USD", 900),
];
