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

  // 目標の資金源カテゴリ配列。空配列は「全体(合計)」を意味する
  function goalSources(goal) {
    return Array.isArray(goal.fundingSources) ? goal.fundingSources : [];
  }

  function isTotalGoal(goal) {
    return goalSources(goal).length === 0;
  }

  // excludeGoalId: 自分自身の目標評価時に除外するID
  function goalsAsWithdrawals(data, excludeGoalId) {
    return data.goals
      .filter((g) => g.id !== excludeGoalId)
      .map((g) => ({ month: monthsUntil(g.targetDate), amount: g.targetAmount, sources: goalSources(g) }));
  }

  // 目標の個人負担額。負担額を設定していない目標、パートナー管理OFFのときはnull
  function goalShares(goal, data) {
    if (!goal.shares || !data.settings.partnerEnabled) return null;
    return { self: goal.shares.self || 0, partner: goal.shares.partner || 0 };
  }

  // 個人の資産から差し引く、他の目標の個人負担分(資金源が「全体」の目標は全カテゴリから按分)
  function personWithdrawals(data, who, excludeGoalId) {
    const allKeys = Categories.LIST.map((c) => c.key);
    return data.goals
      .filter((g) => g.id !== excludeGoalId && goalShares(g, data))
      .map((g) => ({
        month: monthsUntil(g.targetDate),
        amount: goalShares(g, data)[who],
        sources: isTotalGoal(g) ? allKeys : goalSources(g)
      }));
  }

  // カテゴリごとの月次残高: { nisa: [値0..totalMonths], dc: [...], ... }
  // カテゴリを資金源に指定した目標は、目標日にその金額を指定カテゴリの合算プールから
  // 残高比で按分して差し引く(who==="combined"のときのみ)
  // 個人(self/partner)の月次残高では、withShares=trueのとき、負担額を設定した他の目標の
  // 個人負担分をその人の資産から差し引く(目標ごとの個人別の達成判定用)
  function categoryBalancesSeries(data, totalMonths, who = "combined", excludeGoalId, withShares = false) {
    const principals = categoryPrincipals(data, who);
    const monthly = categoryMonthly(data, who);
    const bonus = categoryBonus(data, who);
    const categories = Categories.LIST.map((c) => ({
      key: c.key,
      principal: principals[c.key],
      monthly: monthly[c.key],
      bonus: bonus[c.key],
      ratePercent: data.settings.categoryRates[c.key] || 0
    }));
    let withdrawals = [];
    if (who === "combined") withdrawals = goalsAsWithdrawals(data, excludeGoalId);
    else if (withShares) withdrawals = personWithdrawals(data, who, excludeGoalId);
    return Sim.simulateJoint(categories, totalMonths, withdrawals);
  }

  // 世帯合計の月次残高: カテゴリ合計から、資金源「全体」の目標をその目標日以降ずっと差し引く
  function totalBalancesSeries(data, totalMonths, excludeGoalId) {
    const catBalances = categoryBalancesSeries(data, totalMonths, "combined", excludeGoalId);
    const raw = new Array(totalMonths + 1).fill(0);
    Categories.LIST.forEach((c) => {
      for (let m = 0; m <= totalMonths; m++) raw[m] += catBalances[c.key][m];
    });

    const totalGoals = goalsAsWithdrawals(data, excludeGoalId)
      .filter((w) => w.sources.length === 0 && w.month <= totalMonths)
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

  // 指定カテゴリ(複数可)の合算資産がyearsFromNow年後にいくらになるか
  function sourcesFutureValueAt(data, sources, yearsFromNow, excludeGoalId) {
    const totalMonths = Math.round(yearsFromNow * 12);
    const balances = categoryBalancesSeries(data, totalMonths, "combined", excludeGoalId);
    return sources.reduce((sum, key) => sum + balances[key][totalMonths], 0);
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

  // 指定した月(今からの経過月数)時点のカテゴリごとの残高。その月の目標の支出は反映済み
  function categoryValuesAtMonth(data, months, who = "combined") {
    const balances = categoryBalancesSeries(data, months, who, null);
    const result = {};
    Categories.LIST.forEach((c) => (result[c.key] = balances[c.key][months]));
    return result;
  }

  function goalStatus(goal, data) {
    const totalMonths = monthsUntil(goal.targetDate);
    const yearsFromNow = totalMonths / 12;
    const projected = isTotalGoal(goal)
      ? futureValueAt(data, yearsFromNow, goal.id)
      : sourcesFutureValueAt(data, goalSources(goal), yearsFromNow, goal.id);
    const diff = projected - goal.targetAmount;
    return { yearsFromNow, monthsFromNow: totalMonths, projected, diff, onTrack: diff >= 0 };
  }

  // 個人ごとの達成見込み。負担額が未設定ならnull。
  // 予測=その人の資金源カテゴリの資産(他の目標の個人負担分は差し引き済み)が目標日にいくらになるか
  function goalPersonStatus(goal, data) {
    const shares = goalShares(goal, data);
    if (!shares) return null;
    const totalMonths = monthsUntil(goal.targetDate);
    const keys = isTotalGoal(goal) ? Categories.LIST.map((c) => c.key) : goalSources(goal);
    const result = {};
    ["self", "partner"].forEach((who) => {
      const balances = categoryBalancesSeries(data, totalMonths, who, goal.id, true);
      const projected = keys.reduce((sum, k) => sum + balances[k][totalMonths], 0);
      const share = shares[who];
      result[who] = { share, projected, diff: projected - share, onTrack: projected - share >= 0 };
    });
    result.sharesTotal = shares.self + shares.partner;
    return result;
  }

  return {
    categoryValuesAtMonth,
    goalShares,
    goalPersonStatus,
    latestHistoryEntry,
    categoryPrincipals,
    categoryMonthly,
    categoryBonus,
    currentAssets,
    futureValueAt,
    sourcesFutureValueAt,
    goalSources,
    isTotalGoal,
    projectionSeries,
    categorySeriesByKey,
    monthsUntil,
    goalStatus
  };
})();
