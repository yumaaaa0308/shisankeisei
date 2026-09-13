// 月単位の確定収支(家賃・サブスクなどの確定支出、給与などの収入)を計算する
const Cashflow = (() => {
  function daysInMonth(year, month) {
    // month: 1-12
    return new Date(year, month, 0).getDate();
  }

  // そのitemが指定の年月に発生する場合、日付(1-31)を返す。発生しなければnull
  function dayForItem(item, year, month) {
    if (item.recurrence === "monthly") {
      const dim = daysInMonth(year, month);
      return Math.min(item.day || 1, dim);
    }
    if (item.recurrence === "once" && item.date) {
      const [y, m, d] = item.date.split("-").map(Number);
      if (y === year && m === month) return d;
      return null;
    }
    return null;
  }

  // { 1: [item,...], 2: [...], ... } の形で、その月の日ごとの発生項目を返す
  function itemsByDay(items, year, month) {
    const dim = daysInMonth(year, month);
    const result = {};
    for (let d = 1; d <= dim; d++) result[d] = [];
    items.forEach((item) => {
      const d = dayForItem(item, year, month);
      if (d) result[d].push(item);
    });
    return result;
  }

  function monthTotals(items, year, month) {
    const byDay = itemsByDay(items, year, month);
    let income = 0;
    let expense = 0;
    Object.values(byDay).forEach((list) => {
      list.forEach((item) => {
        if (item.type === "income") income += item.amount;
        else expense += item.amount;
      });
    });
    return { income, expense, net: income - expense };
  }

  return { daysInMonth, dayForItem, itemsByDay, monthTotals };
})();
