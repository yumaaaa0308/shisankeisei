(function () {
  let data = Storage.load();
  let currentView = "home";
  const root = document.getElementById("view-root");
  const tabBar = document.getElementById("tab-bar");

  function persist() {
    Storage.save(data);
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
        root.innerHTML = Views.renderHome(data);
        Views.drawHomeChart(data);
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
          persist();
          render();
          showToast("目標を削除しました");
        }
        break;
      }
      case "add-history":
        openModal(Views.historyFormModal(null));
        break;
      case "edit-history": {
        const entry = data.history.find((h) => h.id === actionEl.dataset.id);
        openModal(Views.historyFormModal(entry));
        break;
      }
      case "delete-history": {
        if (confirm("この記録を削除しますか？")) {
          data.history = data.history.filter((h) => h.id !== actionEl.dataset.id);
          persist();
          render();
          showToast("記録を削除しました");
        }
        break;
      }
      case "reset-data": {
        if (confirm("すべてのデータを削除します。よろしいですか？この操作は取り消せません。")) {
          data = Storage.defaultData();
          persist();
          render();
          showToast("データを削除しました");
        }
        break;
      }
    }
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
        targetAmount: Math.round(parseFloat(fd.get("targetAmountMan")) * 10000),
        targetYear: parseInt(fd.get("targetYear"), 10),
        note: String(fd.get("note") || "").trim()
      };
      if (!goal.name || isNaN(goal.targetAmount) || isNaN(goal.targetYear)) return;
      const idx = data.goals.findIndex((g) => g.id === id);
      if (idx >= 0) data.goals[idx] = goal;
      else data.goals.push(goal);
      persist();
      closeModal();
      render();
      showToast("目標を保存しました");
    }

    if (targetId === "history-form") {
      e.preventDefault();
      const fd = new FormData(e.target);
      const id = fd.get("recordId") || Storage.uid();
      const entry = {
        id,
        date: String(fd.get("date")),
        amount: Math.round(parseFloat(fd.get("amountMan")) * 10000)
      };
      if (!entry.date || isNaN(entry.amount)) return;
      const idx = data.history.findIndex((h) => h.id === id);
      if (idx >= 0) data.history[idx] = entry;
      else data.history.push(entry);
      persist();
      closeModal();
      render();
      showToast("資産を記録しました");
    }

    if (targetId === "settings-form") {
      e.preventDefault();
      const fd = new FormData(e.target);
      data.settings = {
        monthlyContribution: Math.round(parseFloat(fd.get("monthlyContribution")) || 0),
        annualReturnRate: parseFloat(fd.get("annualReturnRate")) || 0,
        simulationYears: Math.round(parseFloat(fd.get("simulationYears")) || 30)
      };
      persist();
      render();
      showToast("設定を保存しました");
    }
  });

  // 画面回転・リサイズでチャート再描画
  window.addEventListener("resize", () => {
    if (currentView === "home") Views.drawHomeChart(data);
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
