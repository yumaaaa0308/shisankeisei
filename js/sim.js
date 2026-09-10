// 積立シミュレーション計算(カテゴリごとに月次で複利計算し、目標の支出も反映する)
const Sim = (() => {
  // 元本+毎月積立+年1回ボーナス積立を月次で複利計算する。
  // withdrawalsByMonth: Map<経過月数, 円> その月の終わりに残高から差し引く額(目標の支出を表す)
  // 戻り値: values[m] = m ヶ月後の残高(values[0]は元本)
  function simulateMonthly(principal, monthlyContribution, annualBonus, annualRatePercent, totalMonths, withdrawalsByMonth) {
    const rMonthly = (annualRatePercent || 0) / 100 / 12;
    const values = new Array(totalMonths + 1);
    values[0] = principal;
    let balance = principal;
    for (let m = 1; m <= totalMonths; m++) {
      balance = balance * (1 + rMonthly) + monthlyContribution;
      if (m % 12 === 0) balance += annualBonus;
      if (withdrawalsByMonth && withdrawalsByMonth.has(m)) {
        balance -= withdrawalsByMonth.get(m);
      }
      values[m] = balance;
    }
    return values;
  }

  function currentYear() {
    return new Date().getFullYear();
  }

  return { simulateMonthly, currentYear };
})();
