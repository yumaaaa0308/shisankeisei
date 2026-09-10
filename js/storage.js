// データ保存(localStorageのみ・サーバー送信なし)
const Storage = (() => {
  const KEY = "assetPlanApp:v1";

  function defaultData() {
    return {
      settings: {
        monthlyContribution: 30000, // 円/月
        annualReturnRate: 3, // %
        simulationYears: 30
      },
      history: [], // { id, date: 'YYYY-MM-DD', amount(円) }
      goals: [] // { id, name, targetAmount(円), targetYear(西暦), note }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      const base = defaultData();
      return {
        settings: { ...base.settings, ...(parsed.settings || {}) },
        history: Array.isArray(parsed.history) ? parsed.history : [],
        goals: Array.isArray(parsed.goals) ? parsed.goals : []
      };
    } catch (e) {
      console.error("Failed to load data, resetting.", e);
      return defaultData();
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return { load, save, uid, defaultData };
})();

const Fmt = (() => {
  function yen(n) {
    const v = Math.round(n || 0);
    return "¥" + v.toLocaleString("ja-JP");
  }
  function man(n) {
    // 万円表示(小数第1位まで)
    const v = (n || 0) / 10000;
    const rounded = Math.round(v * 10) / 10;
    return rounded.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + "万円";
  }
  function dateJp(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }
  function todayIso() {
    const d = new Date();
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return { yen, man, dateJp, todayIso };
})();
