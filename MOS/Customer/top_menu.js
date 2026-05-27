/**
 * トップメニューシステム
 * 
 * 機能:
 * - 店舗情報・時刻表示
 * - 座席管理システム  
 * - スタッフ呼び出し機能
 * - ラストオーダー時間管理
 * 
 * @version 2.0.0
 * @author POS Development Team
 */

/* ===== 設定定数 ===== */
const CONFIG = {
  STORE: {
    NAME: 'みどり亭 ○○店',
    CLOSE_HOUR: 24,
    CLOSE_MINUTE: 0,
    LO_MINUS_MINUTES: 30
  },
  TOAST: {
    MODE: 'overwrite', // 'overwrite' | 'queue'  
    DURATION_MS: 3000
  },
  CALL: {
    COOLDOWN_MS: 30000,
    MAX_RETRIES: 3
  },
  API: {
    LO_ENDPOINT: '/api/lo',
    CALL_ENDPOINT: '/api/call',
    POLLING_INTERVAL_MS: 15000,
    TIMEOUT_MS: 10000
  },
  SEAT: {
    REGEX: /^[A-Z]-\d{2}$/,
    TYPES: {
      COUNTER: { prefix: 'C', count: 10, label: 'カウンター席' },
      FLOOR_1F: { prefix: 'A', count: 5, label: '1階テーブル' },
      FLOOR_2F: { prefix: 'B', count: 15, label: '2階テーブル' }
    }
  }
};

/* ===== 状態管理 ===== */
const state = {
  seatId: null,
  notifiedLO: false,
  lastCallTs: 0,
  callInProgress: false,
  lastFocusedElement: null,
  timers: {
    clock: null,
    loUpdate: null
  }
};

/* ===== 初期化 ===== */
document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
  try {
    setupStoreInfo();
    loadSeatData();
    bindEventHandlers();
    startTimers();
    setupCallResultModal();
  } catch (error) {
    console.error('App initialization failed:', error);
    showToast('システムの初期化に失敗しました');
  }
}

function setupStoreInfo() {
  const storeElement = document.getElementById('storeName');
  if (storeElement) {
    storeElement.textContent = CONFIG.STORE.NAME;
  }
}

function loadSeatData() {
  // AppState から座席情報を取得（shared-state.js で初期化済み）
  state.seatId = AppState.seatId || localStorage.getItem('seatId') || null;
  updateSeatDisplay();
}

function bindEventHandlers() {
  const handlers = [
    { id: 'btnCall', handler: handleCallStaff },
    { id: 'btnCheckout', handler: handleCheckout },
    { id: 'confirmCall', handler: confirmCall },
    { id: 'cancelCall', handler: closeCallModal },
    { id: 'closeCallResult', handler: closeCallResult },
    { id: 'retryCall', handler: retryCall }
  ];

  handlers.forEach(({ id, handler }) => {
    const element = document.getElementById(id);
    if (element) element.addEventListener('click', handler);
  });

  // Backdrop handlers
  bindBackdropHandlers();
  populateSeatOptions();
}

function bindBackdropHandlers() {
  const backdrops = [
    { selector: '#callModal .modal__backdrop', handler: closeCallModal },
    { selector: '#seatModal .modal__backdrop', handler: closeSeatModal },
    { selector: '#callResultModal .modal__backdrop', handler: closeCallResult }
  ];

  backdrops.forEach(({ selector, handler }) => {
    const backdrop = document.querySelector(selector);
    if (backdrop) backdrop.addEventListener('click', handler);
  });
}

/* ===== 時刻・LO管理 ===== */
function startTimers() {
  try {
    startClock();
    startLoTimer();
  } catch (error) {
    console.error('タイマー初期化エラー:', error);
  }
}

function startClock() {
  const clockElement = document.getElementById('currentTime');
  if (!clockElement) return;

  const updateClock = () => {
    try {
      const now = new Date();
      const timeString = [
        now.getHours(),
        now.getMinutes(), 
        now.getSeconds()
      ].map(n => String(n).padStart(2, '0')).join(':');
      
      clockElement.textContent = timeString;
      clockElement.setAttribute('datetime', now.toISOString());
    } catch (error) {
      console.error('時刻更新エラー:', error);
      clockElement.textContent = '時刻エラー';
    }
  };

  updateClock();
  state.timers.clock = setInterval(updateClock, 1000);
}

function startLoTimer() {
  const shouldUseServer = () => {
    return window.location.protocol === 'http:' || window.location.protocol === 'https:';
  };

  const updateLO = async () => {
    if (!shouldUseServer()) {
      updateLOFromLocal();
      return;
    }

    try {
      await updateLOFromServer();
    } catch (serverError) {
      console.warn('サーバーからのLO取得失敗:', serverError);
      try {
        updateLOFromLocal();
      } catch (localError) {
        console.error('ローカルLO計算エラー:', localError);
        const label = document.getElementById('loLabel');
        if (label) label.textContent = 'LO計算エラー';
      }
    }
  };

  updateLO();
  state.timers.loUpdate = setInterval(updateLO, CONFIG.API.POLLING_INTERVAL_MS);
}

async function updateLOFromServer() {
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') {
    throw new Error('HTTP/HTTPS 以外のプロトコルでは LO API を呼び出せません');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.API.TIMEOUT_MS);

  try {
    const response = await fetch(CONFIG.API.LO_ENDPOINT, { 
      cache: 'no-store',
      signal: controller.signal
    });
    
    if (!response.ok) {
      throw new Error(`Server response: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (typeof data.remainingMinutes !== 'number') {
      throw new Error('Invalid server response format');
    }

    updateLODisplay(data.remainingMinutes, 'サーバー基準');
    
    if (data.notify && !state.notifiedLO) {
      state.notifiedLO = true;
      showToast('ラストオーダー（サーバー基準）です');
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

function updateLOFromLocal() {
  const now = new Date();
  const closeTime = new Date(now);
  closeTime.setHours(CONFIG.STORE.CLOSE_HOUR % 24, CONFIG.STORE.CLOSE_MINUTE, 0, 0);
  
  if (CONFIG.STORE.CLOSE_HOUR === 24) {
    closeTime.setDate(closeTime.getDate() + 1);
  }
  
  const loTime = new Date(closeTime.getTime() - CONFIG.STORE.LO_MINUS_MINUTES * 60 * 1000);
  const remainingMs = loTime.getTime() - now.getTime();
  const remainingMinutes = Math.max(0, Math.floor(remainingMs / 60000));
  
  updateLODisplay(remainingMinutes, 'ローカル基準');
}

function updateLODisplay(minutes, source) {
  const label = document.getElementById('loLabel');
  if (!label) return;

  if (minutes <= 0) {
    label.textContent = 'ラストオーダーまで：0分（LO到達）';
    return;
  }

  const hours = Math.floor(minutes / 60);
  const mins = String(minutes % 60).padStart(2, '0');
  label.textContent = `ラストオーダー（${source}）まで：${hours}時間${mins}分`;
}

/* ===== 座席管理 ===== */
function updateSeatDisplay() {
  try {
    const seatLabel = document.getElementById('seatLabel');
    if (seatLabel) {
      const seatText = `座席：${state.seatId || '未設定'}`;
      seatLabel.textContent = seatText;
      seatLabel.setAttribute('aria-label', `現在の${seatText}`);
    }
  } catch (error) {
    console.error('座席表示更新エラー:', error);
  }
}

function populateSeatOptions() {
  try {
    const select = document.getElementById('seatSelect');
    if (!select) return;

    // 既存選択肢をクリア
    select.innerHTML = '';
    
    // デフォルトオプション
    const defaultOption = new Option('選択してください', '');
    defaultOption.disabled = true;
    select.appendChild(defaultOption);

    // 座席オプション生成
    Object.values(CONFIG.SEAT.TYPES).forEach(({ prefix, count, label }) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = label;
      
      for (let i = 1; i <= count; i++) {
        const value = `${prefix}-${String(i).padStart(2, '0')}`;
        const option = new Option(`${label}：${value}`, value);
        optgroup.appendChild(option);
      }
      
      select.appendChild(optgroup);
    });
  } catch (error) {
    console.error('座席オプション生成エラー:', error);
  }
}

function openSeatModal() {
  showModal('seatModal');
  const select = document.getElementById('seatSelect');
  if (select && state.seatId) {
    select.value = state.seatId;
  }
}

function closeSeatModal() {
  hideModal('seatModal');
}

function confirmSeatSelection() {
  try {
    const select = document.getElementById('seatSelect');
    if (!select) return;

    const selectedSeat = select.value;
    if (!selectedSeat) {
      showToast('座席を選択してください');
      return;
    }

    if (!validateSeatId(selectedSeat)) {
      showToast('座席IDの形式が正しくありません');
      return;
    }

    const normalizedSeat = selectedSeat.toUpperCase();
    state.seatId = normalizedSeat;
    
    try {
      localStorage.setItem('seatId', state.seatId);
    } catch (storageError) {
      console.error('座席ID保存エラー:', storageError);
      showToast('座席情報の保存に失敗しました');
    }
    
    updateSeatDisplay();
    closeSeatModal();
    showToast(`座席を設定しました：${state.seatId}`);
    
  } catch (error) {
    console.error('座席設定エラー:', error);
    showToast('座席設定中にエラーが発生しました');
  }
}

function validateSeatId(seatId) {
  return CONFIG.SEAT.REGEX.test(String(seatId).toUpperCase());
}

/* ===== スタッフ呼び出し ===== */
function handleCallStaff() {
  if (!state.seatId) {
    showToast('席IDを設定してください');
    return;
  }

  if (isInCooldown()) {
    const remainingSeconds = getRemainingCooldownSeconds();
    showToast(`呼び出しはあと ${remainingSeconds} 秒で再度可能です`);
    return;
  }

  showModal('callModal');
}

function isInCooldown() {
  const elapsed = Date.now() - state.lastCallTs;
  return elapsed < CONFIG.CALL.COOLDOWN_MS;
}

function getRemainingCooldownSeconds() {
  const elapsed = Date.now() - state.lastCallTs;
  const remaining = CONFIG.CALL.COOLDOWN_MS - elapsed;
  return Math.ceil(remaining / 1000);
}

async function confirmCall() {
  const seatId = state.seatId || (window.AppState && AppState.seatId) || localStorage.getItem('seatId');
  if (!seatId) {
    showToast('席IDを取得できませんでした');
    return;
  }

  const call = {
    id: `staff-call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    seatId,
    type: 'staff_request',
    status: 'pending',
    createdAt: new Date().toISOString(),
    delivered: false
  };

  try {
    await saveStaffCallToDb(call);
    saveStaffCall(call);
    broadcastStaffCall(call);
    state.lastCallTs = Date.now();
    closeCallModal();
    showCallResult(`座席${seatId}のスタッフを呼び出しました`, false);
    showToast('スタッフを呼び出しました');

    if (typeof recordStaffCall === 'function') {
      recordStaffCall();
    }
  } catch (error) {
    console.error('呼び出し失敗:', error);
    alert('スタッフの呼び出しに失敗しました。');
  }
}

function getStaffCallQueue() {
  const raw = localStorage.getItem('staffCallQueue');
  if (!raw) return [];

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error('staffCallQueueの解析に失敗しました:', error);
    return [];
  }
}

function saveStaffCallQueue(queue) {
  localStorage.setItem('staffCallQueue', JSON.stringify(queue));
}

function saveStaffCall(call) {
  const queue = getStaffCallQueue();
  queue.push(call);
  saveStaffCallQueue(queue);
}

async function saveStaffCallToDb(call) {
  const endpoint = '/mos-main/MOS/Customer/insert_staffcall.php';
  const payload = new URLSearchParams({
      id: call.id,
      seat_no: call.seatId,
      datetime: call.createdAt,
      complete_flag: '0',
    });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload,
      credentials: 'same-origin',
      cache: 'no-store',
    });

    const responseText = await response.text();
    let data = null;

    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch (parseError) {
      throw new Error(responseText || `HTTP ${response.status}`);
    }

    if (!response.ok || !data || !data.success) {
      throw new Error(data?.error || responseText || `HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    if (navigator.sendBeacon) {
      const beaconSent = navigator.sendBeacon(endpoint, payload);
      if (beaconSent) {
        return { success: true, message: 'スタッフ呼び出しを送信しました' };
      }
    }

    throw error;
  }
}

function broadcastStaffCall(call) {
  if ('BroadcastChannel' in window) {
    try {
      const channel = new BroadcastChannel('staff-call-channel');
      channel.postMessage(call);
      channel.close();
    } catch (error) {
      console.warn('BroadcastChannel送信エラー:', error);
    }
  }
}

// デモ用の遅延シミュレーション
async function simulateCallDelay() {
  return new Promise(resolve => setTimeout(resolve, 1000));
}

// 実際のAPI呼び出し関数（実装時に使用）
async function callStaffAPI(seatId) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.API.TIMEOUT_MS);

  try {
    const response = await fetch(CONFIG.API.CALL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        seat: seatId,
        timestamp: new Date().toISOString()
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Call API failed: ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ===== 会計処理 ===== */
function handleCheckout() {
  if (!state.seatId) {
    showToast('席IDを設定してください');
    return;
  }

  // 会計準備中モーダルを表示
  const modal = document.getElementById('paymentPreparingModal');
  if (modal) {
    modal.removeAttribute('hidden');
    modal.removeAttribute('aria-hidden');
  }

  // 会計状態を更新
  startPaymentProcess();
}

/**
 * 支払い処理を開始（AppState経由）
 * @function
 */
function startPaymentProcess() {
  try {
    if (AppState && typeof AppState.startPaymentProcess === 'function') {
      AppState.startPaymentProcess();
    } else {
      console.warn('AppState.startPaymentProcess not available');
      // フォールバック
      AppState.paymentStatus = 'preparing';
      AppState.canOrder = false;
    }
  } catch (error) {
    console.error('Error starting payment process:', error);
  }
}

/* ===== モーダル管理 ===== */
function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  state.lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if ('inert' in modal) {
    modal.inert = false;
  }

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  
  // 背景スクロール禁止
  document.body.style.overflow = 'hidden';
  
  // フォーカス管理
  const focusTarget = modal.querySelector('button, input, select');
  if (focusTarget) focusTarget.focus();
}

function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  const fallbackTarget = state.lastFocusedElement
    && document.contains(state.lastFocusedElement)
    && !modal.contains(state.lastFocusedElement)
    ? state.lastFocusedElement
    : document.querySelector('main') || document.body;

  if (fallbackTarget && typeof fallbackTarget.focus === 'function') {
    const prevTabIndex = fallbackTarget.getAttribute ? fallbackTarget.getAttribute('tabindex') : null;
    if (fallbackTarget === document.body && prevTabIndex === null) {
      fallbackTarget.setAttribute('tabindex', '-1');
    }
    fallbackTarget.focus({ preventScroll: true });
    if (fallbackTarget === document.body && prevTabIndex === null) {
      fallbackTarget.removeAttribute('tabindex');
    }
  }

  if ('inert' in modal) {
    modal.inert = true;
  }
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  state.lastFocusedElement = null;
  
  // 背景スクロール復帰
  document.body.style.overflow = '';
}

function closeCallModal() {
  hideModal('callModal');
}

function setupCallResultModal() {
  // 初期化処理は既にbindEventHandlersで実行済み
}

function showCallResult(message, showRetry) {
  const modal = document.getElementById('callResultModal');
  const messageElement = document.getElementById('callResultMessage');
  const retryButton = document.getElementById('retryCall');

  if (!modal) return;

  if (messageElement) messageElement.textContent = message;
  if (retryButton) {
    retryButton.hidden = !showRetry;
    retryButton.disabled = false;
  }

  showModal('callResultModal');
}

function closeCallResult() {
  const retryButton = document.getElementById('retryCall');
  if (retryButton) {
    retryButton.hidden = true;
    retryButton.disabled = false;
  }
  hideModal('callResultModal');
}

function retryCall() {
  if (!state.callInProgress) {
    confirmCall();
  }
}

/* ===== トースト表示システム ===== */
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  initializeToastState(toast);
  
  if (CONFIG.TOAST.MODE === 'overwrite') {
    displayToast(toast, message);
  } else {
    queueToast(toast, message);
  }
}

function initializeToastState(toast) {
  if (!toast._state) {
    toast._state = {
      visible: false,
      timeoutId: null,
      pending: null
    };
  }
}

function displayToast(toast, message) {
  const state = toast._state;
  
  toast.textContent = message;
  toast.classList.add('show');
  state.visible = true;

  if (state.timeoutId) {
    clearTimeout(state.timeoutId);
  }

  state.timeoutId = setTimeout(() => {
    toast.classList.remove('show');
    state.visible = false;
    state.timeoutId = null;

    if (CONFIG.TOAST.MODE === 'queue' && state.pending) {
      const nextMessage = state.pending;
      state.pending = null;
      setTimeout(() => displayToast(toast, nextMessage), 120);
    }
  }, CONFIG.TOAST.DURATION_MS);
}

function queueToast(toast, message) {
  const state = toast._state;
  
  if (!state.visible) {
    displayToast(toast, message);
  } else {
    state.pending = message;
  }
}

/* ===== クリーンアップ ===== */
window.addEventListener('beforeunload', () => {
  if (state.timers.clock) clearInterval(state.timers.clock);
  if (state.timers.loUpdate) clearInterval(state.timers.loUpdate);
});

/* ===== 外部API（グローバル関数として公開） ===== */
window.startClock = startClock;
window.showToast = showToast;
