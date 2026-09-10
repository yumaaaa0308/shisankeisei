(function () {
  let data = Storage.load();
  let currentView = "home";
  let categoryChartMode = "combined"; // "combined" | "self" | "partner"
  let hiddenCategories = new Set(); // カテゴリ別グラフで非表示にしているカテゴリキー
  const root = document.getElementById("view-root");
  const tabBar = document.getElementById("tab-bar");

  function persist() {
    return Storage.save(data);
  }

  function persistAndToast(successMsg) {
    const ok = persist();
    render();
    showToast(ok ? successMsg : "保存に失敗しました(端末の空き容量やプライベートブラウズ設定をご確認ください)");
  }

  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function setActiveTab(view) {
    tabBar.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
  }

  function render() {
    setActiveTab(currentView);
    switch (currentView) {
      case "home":
        root.innerHTML = Views.renderHome(data, categoryChartMode, hiddenCategories);
        Views.drawHomeChart(data);
        Views.drawCategoryChart(data, categoryChartMode, hiddenCategories);
        break;
      case "goals":
        root.innerHTML = Views.renderGoals(data);
        break;
      case "history":
        root.innerHTML = Views.renderHistory(data);
        Views.drawHistoryChart(data);
        break;
      case "settings":
        root.innerHTML = Views.renderSettings(data);
        break;
    }
    root.scrollTop = 0;
  }

  function goto(view) {
    currentView = view;
    render();
  }

  function closeModal() {
    const modal = document.querySelector(".modal-backdrop");
    if (modal) modal.remove();
  }

  function openModal(html) {
    closeModal();
    document.body.insertAdjacentHTML("beforeend", html);
  }

  // ---- タブ切り替え ----
  tabBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    goto(btn.dataset.view);
  });

  // ---- クリック委譲(ボタン操作) ----
  document.addEventListener("click", (e) => {
    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    switch (action) {
      case "goto":
        goto(actionEl.dataset.view);
        break;
      case "close-modal":
        closeModal();
        break;
      case "add-goal":
        openModal(Views.goalFormModal(null));
        break;
      case "edit-goal": {
        const goal = data.goals.find((g) => g.id === actionEl.dataset.id);
        openModal(Views.goalFormModal(goal));
        break;
      }
      case "delete-goal": {
        if (confirm("この目標を削除しますか？")) {
          data.goals = data.goals.filter((g) => g.id !== actionEl.dataset.id);
          persistAndToast("目標を削除しました");
        }
        break;
      }
      case "add-history":
        openModal(Views.historyFormModal(null, data));
        break;
      case "edit-history": {
        const entry = data.history.find((h) => h.id === actionEl.dataset.id);
        openModal(Views.historyFormModal(entry, data));
        break;
      }
      case "set-category-mode": {
        categoryChartMode = actionEl.dataset.mode;
        const container = actionEl.closest(".segmented");
        if (container) {
          container.querySelectorAll(".seg-btn").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.mode === categoryChartMode);
          });
        }
        Views.drawCategoryChart(data, categoryChartMode, hiddenCategories);
        break;
      }
      case "toggle-category-line": {
        const key = actionEl.dataset.category;
        if (hiddenCategories.has(key)) hiddenCategories.delete(key);
        else hiddenCategories.add(key);
        actionEl.classList.toggle("legend-off", hiddenCategories.has(key));
        Views.drawCategoryChart(data, categoryChartMode, hiddenCategories);
        break;
      }
      case "toggle-partner-fields": {
        const fields = document.getElementById("partner-fields");
        if (fields) fields.classList.toggle("hidden", !actionEl.checked);
        break;
      }
      case "delete-history": {
        if (confirm("この記録を削除しますか？")) {
          data.history = data.history.filter((h) => h.id !== actionEl.dataset.id);
          persistAndToast("記録を削除しました");
        }
        break;
      }
      case "reset-data": {
        if (confirm("すべてのデータを削除します。よろしいですか？この操作は取り消せません。")) {
          data = Storage.defaultData();
          persistAndToast("データを削除しました");
        }
        break;
      }
      case "export-data": {
        const filename = `asset-plan-backup-${Fmt.todayIso()}.json`;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("バックアップを書き出しました");
        break;
      }
      case "import-data": {
        const input = document.getElementById("import-file-input");
        if (input) input.click();
        break;
      }
      case "import-mf-csv": {
        const input = document.getElementById("import-mf-file-input");
        if (input) input.click();
        break;
      }
    }
  });

  // ---- マネーフォワードの資産推移CSVをパースする ----
  // 対応列: 日付, 預金・現金（円）, 株式(現物)（円）, 投資信託（円）, 年金（円）
  // 株式(現物)は持株会と個別株が混在しうるが、簡便のためすべて持株会として取り込む
  function parseMfCsvLine(line) {
    return line.split(",").map((f) => f.trim().replace(/^"|"$/g, ""));
  }
  function parseMfCsv(text) {
    const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
    if (!lines.length) return null;
    const header = parseMfCsvLine(lines[0]);
    const dateIdx = header.indexOf("日付");
    const cashIdx = header.indexOf("預金・現金（円）");
    const stockIdx = header.indexOf("株式(現物)（円）");
    const fundIdx = header.indexOf("投資信託（円）");
    const pensionIdx = header.indexOf("年金（円）");
    if (dateIdx === -1) return null;

    const num = (cols, i) => (i >= 0 && cols[i] !== undefined ? Math.round(parseFloat(cols[i]) || 0) : null);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseMfCsvLine(lines[i]);
      const rawDate = cols[dateIdx];
      if (!rawDate) continue;
      const parts = rawDate.split("/");
      if (parts.length !== 3) continue;
      const date = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
      rows.push({
        date,
        cash: num(cols, cashIdx),
        stock: num(cols, stockIdx),
        nisa: num(cols, fundIdx),
        dc: num(cols, pensionIdx)
      });
    }
    return rows;
  }

  // ---- マネーフォワードCSVの読み込み ----
  document.addEventListener("change", (e) => {
    if (e.target.id !== "import-mf-file-input") return;
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseMfCsv(reader.result);
      if (!rows) {
        alert("マネーフォワードの資産推移CSVとして読み込めませんでした。列の形式をご確認ください。");
        return;
      }
      if (!rows.length) {
        alert("取り込めるデータがありませんでした。");
        return;
      }
      if (!confirm(`${rows.length}件の資産推移データ(現金・持株会・NISA・DC)を取り込みます。同じ日付の記録があれば上書きします。よろしいですか？`)) return;

      rows.forEach((row) => {
        const existing = data.history.find((h) => h.date === row.date);
        if (existing) {
          if (row.cash !== null) existing.self.cash = row.cash;
          if (row.stock !== null) existing.self.stock = row.stock;
          if (row.nisa !== null) existing.self.nisa = row.nisa;
          if (row.dc !== null) existing.self.dc = row.dc;
        } else {
          const self = Categories.emptyBreakdown();
          if (row.cash !== null) self.cash = row.cash;
          if (row.stock !== null) self.stock = row.stock;
          if (row.nisa !== null) self.nisa = row.nisa;
          if (row.dc !== null) self.dc = row.dc;
          data.history.push({ id: Storage.uid(), date: row.date, self, partner: Categories.emptyBreakdown() });
        }
      });
      persistAndToast(`${rows.length}件のデータを取り込みました`);
    };
    reader.onerror = () => alert("ファイルの読み込みに失敗しました。");
    reader.readAsText(file, "shift-jis");
  });

  // ---- 金額入力欄を桁区切り表示にする(フォーカスが外れたタイミングで整形) ----
  document.addEventListener("focusout", (e) => {
    if (!e.target.classList || !e.target.classList.contains("comma-input")) return;
    const num = Fmt.parseCommaNum(e.target.value);
    e.target.value = e.target.value.trim() === "" ? "" : Fmt.manInputValue(num * 10000);
  });

  // ---- バックアップファイルの読み込み ----
  document.addEventListener("change", (e) => {
    if (e.target.id !== "import-file-input") return;
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (err) {
        alert("ファイルの形式が正しくありません(JSONとして読み込めませんでした)。");
        return;
      }
      if (!parsed || typeof parsed !== "object" || !parsed.settings || !parsed.people) {
        alert("このアプリのバックアップファイルではないようです。");
        return;
      }
      if (!confirm("現在のデータを、選択したファイルの内容で置き換えます。よろしいですか？")) return;
      localStorage.setItem("assetPlanApp:v1", JSON.stringify(parsed));
      data = Storage.load();
      persistAndToast("データを読み込みました");
    };
    reader.onerror = () => alert("ファイルの読み込みに失敗しました。");
    reader.readAsText(file);
  });

  // ---- フォーム送信委譲 ----
  document.addEventListener("submit", (e) => {
    const targetId = e.target.getAttribute && e.target.getAttribute("id");
    if (targetId === "goal-form") {
      e.preventDefault();
      const fd = new FormData(e.target);
      const id = fd.get("recordId") || Storage.uid();
      const goal = {
        id,
        name: String(fd.get("name") || "").trim(),
        targetAmount: Math.round(Fmt.parseCommaNum(fd.get("targetAmountMan")) * 10000),
        targetDate: String(fd.get("targetDate") || ""),
        fundingSource: String(fd.get("fundingSource") || "total"),
        note: String(fd.get("note") || "").trim()
      };
      if (!goal.name || isNaN(goal.targetAmount) || !goal.targetDate) return;
      const idx = data.goals.findIndex((g) => g.id === id);
      if (idx >= 0) data.goals[idx] = goal;
      else data.goals.push(goal);
      closeModal();
      persistAndToast("目標を保存しました");
    }

    if (targetId === "history-form") {
      e.preventDefault();
      const fd = new FormData(e.target);
      const id = fd.get("recordId") || Storage.uid();
      const readBreakdown = (prefix) => {
        const b = {};
        Categories.LIST.forEach((c) => {
          b[c.key] = Math.round(Fmt.parseCommaNum(fd.get(`${prefix}_${c.key}`)) * 10000);
        });
        return b;
      };
      const entry = {
        id,
        date: String(fd.get("date")),
        self: readBreakdown("self"),
        partner: data.settings.partnerEnabled ? readBreakdown("partner") : Categories.emptyBreakdown()
      };
      if (!entry.date) return;
      const idx = data.history.findIndex((h) => h.id === id);
      if (idx >= 0) data.history[idx] = entry;
      else data.history.push(entry);
      closeModal();
      persistAndToast("資産を記録しました");
    }

    if (targetId === "settings-form") {
      e.preventDefault();
      const fd = new FormData(e.target);
      const readContributions = (prefix) => {
        const c = {};
        Categories.LIST.forEach((cat) => {
          c[cat.key] = {
            monthly: Math.round(Fmt.parseCommaNum(fd.get(`${prefix}_${cat.key}_monthly`)) * 10000),
            bonus: Math.round(Fmt.parseCommaNum(fd.get(`${prefix}_${cat.key}_bonus`)) * 10000)
          };
        });
        return c;
      };
      const categoryRates = {};
      Categories.LIST.forEach((cat) => {
        const raw = parseFloat(fd.get(`rate_${cat.key}`));
        categoryRates[cat.key] = isNaN(raw) ? 0 : raw;
      });

      data.settings.categoryRates = categoryRates;
      data.settings.simulationYears = Math.round(parseFloat(fd.get("simulationYears")) || 30);
      data.settings.partnerEnabled = fd.get("partnerEnabled") === "on";
      data.people.self.name = String(fd.get("self_name") || "").trim() || "自分";
      data.people.self.contributions = readContributions("self");
      data.people.partner.name = String(fd.get("partner_name") || "").trim() || "パートナー";
      data.people.partner.contributions = readContributions("partner");

      persistAndToast("設定を保存しました");
    }
  });

  // 画面回転・リサイズでチャート再描画
  window.addEventListener("resize", () => {
    if (currentView === "home") {
      Views.drawHomeChart(data);
      Views.drawCategoryChart(data, categoryChartMode, hiddenCategories);
    }
    if (currentView === "history") Views.drawHistoryChart(data);
  });

  // Service Worker登録(オフライン対応)
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  render();
})();
