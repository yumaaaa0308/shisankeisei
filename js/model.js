// 「自分」「パートナー」×カテゴリを合算して世帯全体の資産を計算する。
// 目標の目標日が来たら、その金額を実際に使う(引き出す)前提でシミュレーションする。
const Model = (() => {
  function latestHistoryEntry(history) {
    if (!history.length) return null;
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    return sorted[sorted.length - 1];
  }

  // who: "combined"(既定) | "self" | "partner"
  function pick(who, selfV, partnerV) {
    if (who === "self") return selfV;
    if (who === "partner") return partnerV;
    return selfV + partnerV;
  }

  // カテゴリごとの現在の元本
  function categoryPrincipals(data, who = "combined") {
    const latest = latestHistoryEntry(data.history);
    const result = {};
    Categories.LIST.forEach((c) => {
      const selfAmount = latest ? latest.self[c.key] || 0 : 0;
      const partnerAmount = latest && data.settings.partnerEnabled ? latest.partner[c.key] || 0 : 0;
      result[c.key] = pick(who, selfAmount, partnerAmount);
    });
    return result;
  }

  // カテゴリごとの毎月積立額
  function categoryMonthly(data, who = "combined") {
    const result = {};
    Categories.LIST.forEach((c) => {
      const selfV = data.people.self.contributions[c.key].monthly || 0;
      const partnerV = data.settings.partnerEnabled ? data.people.partner.contributions[c.key].monthly || 0 : 0;
      result[c.key] = pick(who, selfV, partnerV);
    });
    return result;
  }

  // カテゴリごとの年1回ボーナス積立額
  function categoryBonus(data, who = "combined") {
    const result = {};
    Categories.LIST.forEach((c) => {
      const selfV = data.people.self.contributions[c.key].bonus || 0;
      const partnerV = data.settings.partnerEnabled ? data.people.partner.contributions[c.key].bonus || 0 : 0;
      result[c.key] = pick(who, selfV, partnerV);
    });
    return result;
  }

  function currentAssets(data) {
    const principals = categoryPrincipals(data);
    return Categories.LIST.reduce((sum, c) => sum + principals[c.key], 0);
  }

  // "YYYY-MM"の目標日が今から何ヶ月後かを返す(過去/当月なら0)
  function monthsUntil(targetDate) {
    const [y, m] = String(targetDate).split("-").map(Number);
    const now = new Date();
    const nowMonths = now.getFullYear() * 12 + now.getMonth();
    const targetMonths = y * 12 + (m - 1);
    return Math.max(0, targetMonths - nowMonths);
  }

  // fundingKey: カテゴリキー、または"total"。excludeGoalId: 自分自身の目標評価時に除外するID
  function goalsAsWithdrawals(data, fundingKey, excludeGoalId) {
    return data.goals
      .filter((g) => g.id !== excludeGoalId)
      .filter((g) => (fundingKey === "total" ? (!g.fundingSource || g.fundingSource === "total") : g.fundingSource === fundingKey))
      .map((g) => ({ month: monthsUntil(g.targetDate), amount: g.targetAmount }));
  }

  function withdrawalMap(withdrawals, totalMonths) {
    const map = new Map();
    withdrawals.forEach((w) => {
      if (w.month > totalMonths) return;
      map.set(w.month, (map.get(w.month) || 0) + w.amount);
    });
    return map;
  }

  // カテゴリごとの月次残高: { nisa: [値0..totalMonths], dc: [...], ... }
  // 資金源がそのカテゴリの目標は、目標日にその金額を残高から差し引く(who==="combined"のときのみ)
  function categoryBalancesSeries(data, totalMonths, who = "combined", excludeGoalId) {
    const principals = categoryPrincipals(data, who);
    const monthly = categoryMonthly(data, who);
    const bonus = categoryBonus(data, who);
    const result = {};
    Categories.LIST.forEach((c) => {
      const rate = data.settings.categoryRates[c.key] || 0;
      const withdrawals = who === "combined" ? goalsAsWithdrawals(data, c.key, excludeGoalId) : [];
      result[c.key] = Sim.simulateMonthly(
        principals[c.key], monthly[c.key], bonus[c.key], rate, totalMonths,
        withdrawalMap(withdrawals, totalMonths)
      );
    });
    return result;
  }

  // 世帯合計の月次残高: カテゴリ合計から、資金源「全体」の目標をその目標日以降ずっと差し引く
  function totalBalancesSeries(data, totalMonths, excludeGoalId) {
    const catBalances = categoryBalancesSeries(data, totalMonths, "combined", excludeGoalId);
    const raw = new Array(totalMonths + 1).fill(0);
    Categories.LIST.forEach((c) => {
      for (let m = 0; m <= totalMonths; m++) raw[m] += catBalances[c.key][m];
    });

    const totalGoals = goalsAsWithdrawals(data, "total", excludeGoalId)
      .filter((w) => w.month <= totalMonths)
      .sort((a, b) => a.month - b.month);

    const result = new Array(totalMonths + 1);
    let cumulative = 0;
    let gi = 0;
    for (let m = 0; m <= totalMonths; m++) {
      while (gi < totalGoals.length && totalGoals[gi].month <= m) {
        cumulative += totalGoals[gi].amount;
        gi++;
      }
      result[m] = raw[m] - cumulative;
    }
    return result;
  }

  // 世帯合計資産がyearsFromNow年後にいくらになるか(excludeGoalIdの目標自身の支出は含めない)
  function futureValueAt(data, yearsFromNow, excludeGoalId) {
    const totalMonths = Math.round(yearsFromNow * 12);
    return totalBalancesSeries(data, totalMonths, excludeGoalId)[totalMonths];
  }

  // 特定カテゴリ1つだけの資産がyearsFromNow年後にいくらになるか
  function categoryFutureValueAt(data, categoryKey, yearsFromNow, excludeGoalId) {
    const totalMonths = Math.round(yearsFromNow * 12);
    return categoryBalancesSeries(data, totalMonths, "combined", excludeGoalId)[categoryKey][totalMonths];
  }

  function projectionSeries(data, maxYears) {
    const totalMonths = maxYears * 12;
    const balances = totalBalancesSeries(data, totalMonths, null);
    const points = [];
    for (let y = 0; y <= maxYears; y++) points.push({ year: y, value: balances[y * 12] });
    return points;
  }

  // カテゴリごとの予測推移: { nisa: [{year,value}], dc: [...], cash: [...], stock: [...] }
  // who: "combined"(既定) | "self" | "partner"
  function categorySeriesByKey(data, maxYears, who = "combined") {
    const totalMonths = maxYears * 12;
    const balances = categoryBalancesSeries(data, totalMonths, who, null);
    const result = {};
    Categories.LIST.forEach((c) => {
      const points = [];
      for (let y = 0; y <= maxYears; y++) points.push({ year: y, value: balances[c.key][y * 12] });
      result[c.key] = points;
    });
    return result;
  }

  function goalStatus(goal, data) {
    const totalMonths = monthsUntil(goal.targetDate);
    const yearsFromNow = totalMonths / 12;
    const isCategoryFunded = goal.fundingSource && goal.fundingSource !== "total";
    const projected = isCategoryFunded
      ? categoryFutureValueAt(data, goal.fundingSource, yearsFromNow, goal.id)
      : futureValueAt(data, yearsFromNow, goal.id);
    const diff = projected - goal.targetAmount;
    return { yearsFromNow, monthsFromNow: totalMonths, projected, diff, onTrack: diff >= 0 };
  }

  return {
    latestHistoryEntry,
    categoryPrincipals,
    categoryMonthly,
    categoryBonus,
    currentAssets,
    futureValueAt,
    categoryFutureValueAt,
    projectionSeries,
    categorySeriesByKey,
    monthsUntil,
    goalStatus
  };
})();
