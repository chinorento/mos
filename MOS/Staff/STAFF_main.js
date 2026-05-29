const BROADCAST_CHANNEL_NAME = "staff-call-channel";

setInterval(checkStaffCalls, 5000);
checkStaffCalls();

async function checkStaffCalls() {
  try {
    const calls = await api.getActiveCalls();
    if (calls && calls.length > 0) {
      handleIncomingCalls(calls);
    }
  } catch (error) {
    console.error("Error checking staff calls:", error);
  }
}

function handleIncomingCalls(calls) {
  calls.forEach((call) => {
    const callData = {
      id:
        call.id ||
        `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      seatId: call.seatId,
      status: call.status || "pending",
      createdAt: call.createdAt || call.timestamp || new Date().toISOString(),
      reason: call.type || "スタッフ呼び出し",
    };

    const exists = StaffCallNotificationComponent.getState().calls.some(
      (existing) => existing.id === callData.id,
    );
    if (!exists) {
      StaffCallNotificationComponent.addCall(callData);
    }
  });
}

function getStaffCallQueue() {
  const raw = localStorage.getItem("staffCallQueue");
  if (!raw) return [];

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("staffCallQueue parse error:", error);
    return [];
  }
}

function saveStaffCallQueue(queue) {
  localStorage.setItem("staffCallQueue", JSON.stringify(queue));
}

const api = {
  getActiveCalls: async () => {
    try {
      const response = await fetch("../Customer/fetch_staff_calls.php", {
        cache: "no-store",
      });

      if (response.ok) {
        const calls = await response.json();
        if (Array.isArray(calls)) {
          return calls;
        }
      }
    } catch (error) {
      console.warn("DB staff calls fetch failed, falling back to localStorage:", error);
    }

    const queue = getStaffCallQueue();
    return queue.filter((call) => call.status === "pending" && !call.delivered);
  },
};

if ("BroadcastChannel" in window) {
  const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  channel.addEventListener("message", (event) => {
    if (event.data) {
      handleIncomingCalls([event.data]);
    }
  });
}

window.addEventListener("storage", (event) => {
  if (event.key !== "staffCallQueue") return;

  const queue = getStaffCallQueue();
  const pendingCalls = queue.filter(
    (call) => call.status === "pending" && !call.delivered,
  );
  if (pendingCalls.length > 0) {
    pendingCalls.forEach((call) => {
      handleIncomingCalls([call]);
    });

    const updatedQueue = queue.map((call) => ({
      ...call,
      delivered:
        call.status === "pending" && !call.delivered ? true : call.delivered,
    }));
    saveStaffCallQueue(updatedQueue);
  }
});

// ===== スタッフ呼び出し通知コンポーネント =====
const StaffCallNotificationComponent = {
  state: {
    calls: [],
    currentFilter: "all",
  },

  init() {
    this.bindEvents();
    this.updateStats();
    this.updateFilterTabs();
    this.renderCalls();
  },

  getState() {
    return this.state;
  },

  addCall(callData) {
    // 重複チェック
    const exists = this.state.calls.some(
      (existing) => existing.id === callData.id,
    );
    if (exists) return;

    this.state.calls.push({
      ...callData,
      status: callData.status || "pending",
    });

    this.updateStats();
    this.updateFilterTabs();
    this.renderCalls();

    // 通知音を鳴らす（オプション）
    this.playNotificationSound();
  },

  updateCallStatus(callId, newStatus) {
    const call = this.state.calls.find((c) => c.id === callId);
    if (call) {
      call.status = newStatus;
      if (newStatus === "completed") {
        this.syncCallCompletion(call).catch((error) => {
          console.error("Failed to update staff call completion:", error);
        });
      }
      this.updateStats();
      this.updateFilterTabs();
      this.renderCalls();
    }
  },

  async syncCallCompletion(call) {
    const response = await fetch("../Customer/update_staffcall.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        id: call.id,
        complete_flag: "1",
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data || !data.success) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }

    return data;
  },

  removeCall(callId) {
    this.state.calls = this.state.calls.filter((c) => c.id !== callId);
    this.updateStats();
    this.updateFilterTabs();
    this.renderCalls();
  },

  updateStats() {
    const stats = {
      pending: this.state.calls.filter((c) => c.status === "pending").length,
      "in-progress": this.state.calls.filter((c) => c.status === "in-progress")
        .length,
      completed: this.state.calls.filter((c) => c.status === "completed")
        .length,
    };

    document.getElementById("pendingCount").textContent = stats.pending;
    document.getElementById("inProgressCount").textContent =
      stats["in-progress"];
    document.getElementById("completedCount").textContent = stats.completed;
  },

  updateFilterTabs() {
    const counts = {
      all: this.state.calls.length,
      pending: this.state.calls.filter((c) => c.status === "pending").length,
      "in-progress": this.state.calls.filter((c) => c.status === "in-progress")
        .length,
    };

    document.getElementById("countAll").textContent = counts.all;
    document.getElementById("countPending").textContent = counts.pending;
    document.getElementById("countInProgress").textContent =
      counts["in-progress"];
  },

  renderCalls() {
    const container = document.getElementById("callItemsContainer");
    const emptyState = document.getElementById("emptyState");

    if (!container) return;

    // フィルタ適用
    let filteredCalls = this.state.calls;
    if (this.state.currentFilter !== "all") {
      filteredCalls = this.state.calls.filter(
        (c) => c.status === this.state.currentFilter,
      );
    }

    // 空状態表示
    if (filteredCalls.length === 0) {
      container.innerHTML = "";
      emptyState.hidden = false;
      return;
    }

    emptyState.hidden = true;

    // 呼び出しアイテム生成
    container.innerHTML = "";
    filteredCalls.forEach((call) => {
      const callElement = this.createCallElement(call);
      container.appendChild(callElement);
    });
  },

  createCallElement(call) {
    const template = document.getElementById("callItemTemplate");
    if (!template) return null;

    const clone = template.content.cloneNode(true);
    const callItem = clone.querySelector(".call-item");

    callItem.setAttribute("data-call-id", call.id);

    // 座席ID
    const seatIdElement = callItem.querySelector(".call-item__seat-id");
    if (seatIdElement) {
      seatIdElement.textContent = call.seatId;
    }

    // ステータスバッジ
    const statusBadge = callItem.querySelector(".call-item__status-badge");
    if (statusBadge) {
      statusBadge.textContent = this.getStatusText(call.status);
      statusBadge.className = `call-item__status-badge status-${call.status}`;
    }

    // 作成時刻
    const timeElement = callItem.querySelector(".call-item__time-absolute");
    if (timeElement) {
      timeElement.textContent = this.formatTime(call.createdAt);
      timeElement.setAttribute("datetime", call.createdAt);
    }

    // 経過時間
    const elapsedElement = callItem.querySelector(".call-item__time-elapsed");
    if (elapsedElement) {
      elapsedElement.textContent = this.getElapsedTime(call.createdAt);
    }

    // 理由
    const reasonElement = callItem.querySelector(".call-item__reason");
    if (reasonElement) {
      reasonElement.textContent = call.reason || "スタッフ呼び出し";
    }

    // アクションボタン
    const acknowledgeBtn = callItem.querySelector(
      ".call-item__acknowledge-btn",
    );
    const completeBtn = callItem.querySelector(".call-item__complete-btn");
    const dismissBtn = callItem.querySelector(".call-item__dismiss-btn");

    if (call.status === "pending") {
      if (acknowledgeBtn) {
        acknowledgeBtn.hidden = false;
        acknowledgeBtn.addEventListener("click", () =>
          this.updateCallStatus(call.id, "in-progress"),
        );
      }
      if (completeBtn) completeBtn.hidden = true;
      if (dismissBtn) dismissBtn.hidden = true;
    } else if (call.status === "in-progress") {
      if (acknowledgeBtn) acknowledgeBtn.hidden = true;
      if (completeBtn) {
        completeBtn.hidden = false;
        completeBtn.addEventListener("click", () => this.updateCallStatus(call.id, "completed"));
      }
      if (dismissBtn) dismissBtn.hidden = true;
    } else if (call.status === "completed") {
      if (acknowledgeBtn) acknowledgeBtn.hidden = true;
      if (completeBtn) completeBtn.hidden = true;
      if (dismissBtn) {
        dismissBtn.hidden = false;
        dismissBtn.addEventListener("click", () => this.removeCall(call.id));
      }
    }

    return callItem;
  },

  getStatusText(status) {
    const statusMap = {
      pending: "未対応",
      "in-progress": "対応中",
      completed: "完了",
    };
    return statusMap[status] || status;
  },

  formatTime(isoString) {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (error) {
      return "不明";
    }
  },

  getElapsedTime(isoString) {
    try {
      const created = new Date(isoString);
      const now = new Date();
      const elapsedMs = now - created;
      const elapsedMinutes = Math.floor(elapsedMs / 60000);
      const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000);

      if (elapsedMinutes > 0) {
        return `${elapsedMinutes}分${elapsedSeconds}秒経過`;
      } else {
        return `${elapsedSeconds}秒経過`;
      }
    } catch (error) {
      return "";
    }
  },

  bindEvents() {
    // フィルタタブ
    const filterTabs = document.querySelectorAll(".filter-tab");
    filterTabs.forEach((tab) => {
      tab.addEventListener("click", (e) => {
        const filter = e.target.getAttribute("data-filter");
        this.setFilter(filter);
      });
    });
  },

  setFilter(filter) {
    this.state.currentFilter = filter;

    // タブのアクティブ状態更新
    const filterTabs = document.querySelectorAll(".filter-tab");
    filterTabs.forEach((tab) => {
      const tabFilter = tab.getAttribute("data-filter");
      if (tabFilter === filter) {
        tab.classList.add("filter-tab--active");
        tab.setAttribute("aria-selected", "true");
      } else {
        tab.classList.remove("filter-tab--active");
        tab.setAttribute("aria-selected", "false");
      }
    });

    this.renderCalls();
  },

  playNotificationSound() {
    // 通知音（オプション）
    try {
      // Web Audio API や Audio 要素で音を鳴らす
      // 例: new Audio('/sounds/notification.mp3').play();
    } catch (error) {
      console.log("通知音の再生に失敗しました");
    }
  },
};

// 初期化
document.addEventListener("DOMContentLoaded", () => {
  StaffCallNotificationComponent.init();
});
