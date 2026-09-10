// 「自分」「パートナー」×カテゴリを合算して世帯全体の資産を計算する
const Model = (() => {
  function latestHistoryEntry(history) {
    if (!history.length) return null;
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    return sorted[sorted.length - 1];
  }

  // カテゴリごとの現在の元本(自分+パートナー合算)
  function categoryPrincipals(data) {
    const latest = latestHistoryEntry(data.history);
    const result = {};
    Categories.LIST.forEach((c) => {
      const selfAmount = latest ? latest.self[c.key] || 0 : 0;
      const partnerAmount = latest && data.settings.partnerEnabled ? latest.partner[c.key] || 0 : 0;
      result[c.key] = selfAmount + partnerAmount;
    });
    return result;
  }

  // カテゴリごとの毎月積立額(自分+パートナー合算)
  function categoryMonthly(data) {
    const result = {};
    Categories.LIST.forEach((c) => {
      const selfV = data.people.self.contributions[c.key].monthly || 0;
      const partnerV = data.settings.partnerEnabled ? data.people.partner.contributions[c.key].monthly || 0 : 0;
      result[c.key] = selfV + partnerV;
    });
    return result;
  }

  // カテゴリごとの年1回ボーナス積立額(自分+パートナー合算)
  function categoryBonus(data) {
    const result = {};
    Categories.LIST.forEach((c) => {
      const selfV = data.people.self.contributions[c.key].bonus || 0;
      const partnerV = data.settings.partnerEnabled ? data.people.partner.contributions[c.key].bonus || 0 : 0;
      result[c.key] = selfV + partnerV;
    });
    return result;
  }

  function currentAssets(data) {
    const principals = categoryPrincipals(data);
    return Categories.LIST.reduce((sum, c) => sum + principals[c.key], 0);
  }

  // 世帯合計資産がyearsFromNow年後にいくらになるか
  function futureValueAt(data, yearsFromNow) {
    const principals = categoryPrincipals(data);
    const monthly = categoryMonthly(data);
    const bonus = categoryBonus(data);
    return Categories.LIST.reduce((sum, c) => {
      const rate = data.settings.categoryRates[c.key] || 0;
      return sum + Sim.futureValue(principals[c.key], monthly[c.key], bonus[c.key], rate, yearsFromNow);
    }, 0);
  }

  function projectionSeries(data, maxYears) {
    const points = [];
    for (let y = 0; y <= maxYears; y++) {
      points.push({ year: y, value: futureValueAt(data, y) });
    }
    return points;
  }

  function goalStatus(goal, data) {
    const nowYear = Sim.currentYear();
    const yearsFromNow = Math.max(0, goal.targetYear - nowYear);
    const projected = futureValueAt(data, yearsFromNow);
    const diff = projected - goal.targetAmount;
    return { yearsFromNow, projected, diff, onTrack: diff >= 0 };
  }

  return {
    latestHistoryEntry,
    categoryPrincipals,
    categoryMonthly,
    categoryBonus,
    currentAssets,
    futureValueAt,
    projectionSeries,
    goalStatus
  };
})();
