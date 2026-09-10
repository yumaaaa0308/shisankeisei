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

  // カテゴリごとの予測推移: { nisa: [{year,value}], dc: [...], cash: [...], stock: [...] }
  function categorySeriesByKey(data, maxYears) {
    const principals = categoryPrincipals(data);
    const monthly = categoryMonthly(data);
    const bonus = categoryBonus(data);
    const result = {};
    Categories.LIST.forEach((c) => {
      const rate = data.settings.categoryRates[c.key] || 0;
      const points = [];
      for (let y = 0; y <= maxYears; y++) {
        points.push({
          year: y,
          value: Sim.futureValue(principals[c.key], monthly[c.key], bonus[c.key], rate, y)
        });
      }
      result[c.key] = points;
    });
    return result;
  }

  // 特定カテゴリ1つだけの資産がyearsFromNow年後にいくらになるか
  function categoryFutureValueAt(data, categoryKey, yearsFromNow) {
    const principals = categoryPrincipals(data);
    const monthly = categoryMonthly(data);
    const bonus = categoryBonus(data);
    const rate = data.settings.categoryRates[categoryKey] || 0;
    return Sim.futureValue(principals[categoryKey], monthly[categoryKey], bonus[categoryKey], rate, yearsFromNow);
  }

  function goalStatus(goal, data) {
    const nowYear = Sim.currentYear();
    const yearsFromNow = Math.max(0, goal.targetYear - nowYear);
    const isCategoryFunded = goal.fundingSource && goal.fundingSource !== "total";
    const projected = isCategoryFunded
      ? categoryFutureValueAt(data, goal.fundingSource, yearsFromNow)
      : futureValueAt(data, yearsFromNow);
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
    categoryFutureValueAt,
    projectionSeries,
    categorySeriesByKey,
    goalStatus
  };
})();
