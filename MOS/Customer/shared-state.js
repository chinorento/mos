/**
 * グローバル状態管理システム
 * 
 * アプリケーション全体で使用される共有状態を管理
 * localStorage と メモリ内状態の連携
 * 
 * @version 2.1.0
 */

/* ===== グローバル状態オブジェクト ===== */
const AppState = {
  // 座席管理
  seatId: null,
  qrScanned: false,

  // メニュー・注文
  menuItems: [],
  cart: {},
  orders: [],
  paymentStatus: 'idle', // idle | preparing | completed

  // 制御フラグ
  canOrder: true,
  soldOutItems: [],

  // UI状態
  lastCallTime: null,
  callInProgress: false,

  // メソッド
  setSeatId: function(seatId) {
    return setSeatId(seatId);
  },
  saveCart: function() {
    return saveCart();
  },
  saveOrders: function() {
    return saveOrders();
  },
  clearCart: function() {
    return clearCart();
  },
  getCartTotal: function() {
    return getCartTotal();
  },
  startPaymentProcess: function() {
    return startPaymentProcess();
  },
  completePayment: function() {
    return completePayment();
  }
};

/* ===== 初期化 ===== */
function initializeAppState() {
  // localStorage から座席IDを復元
  const savedSeatId = localStorage.getItem('seatId');
  if (savedSeatId) {
    AppState.seatId = normalizeSeatId(savedSeatId) || savedSeatId;
    AppState.qrScanned = true;
  } else {
    // デフォルト座席を初期設定（デモ用）
    const defaultSeat = 'C-05';
    setSeatId(defaultSeat);
  }

  // localStorage からカート・注文を復元
  loadCartAndOrders();

  // 支払いステータスを復元
  const savedPaymentStatus = localStorage.getItem(`paymentStatus_${AppState.seatId}`);
  if (savedPaymentStatus) {
    AppState.paymentStatus = savedPaymentStatus;
    updateOrderingCapability();
  }
}

/* ===== 座席管理 ===== */
function setSeatId(seatId) {
  const normalized = normalizeSeatId(seatId);
  if (!normalized) {
    console.error('Invalid seat ID:', seatId);
    return false;
  }

  AppState.seatId = normalized;
  AppState.qrScanned = true;
  try { localStorage.setItem('seatId', normalized); } catch(e){ console.warn('localStorage setItem failed', e); }

  // 座席変更時はカート・注文を再ロード
  loadCartAndOrders();

  return true;
}

function getCurrentSeatId() {
  return AppState.seatId || 'C-05';
}

function normalizeSeatId(input) {
  if (!input) return null;
  const normalized = String(input).trim().toUpperCase();
  const match = normalized.match(/^([A-Z])[-\s]?(\d{1,2})$/);
  if (!match) return null;
  return `${match[1]}-${String(parseInt(match[2], 10)).padStart(2, '0')}`;
}

/* ===== カート・注文管理 ===== */
function loadCartAndOrders() {
  const seatId = AppState.seatId || 'C-05';

  // カート読み込み
  const cartKey = `cart_${seatId}`;
  try { AppState.cart = JSON.parse(localStorage.getItem(cartKey) || '{}'); } catch(e){ AppState.cart = {}; }

  // 注文履歴読み込み
  const ordersKey = `orders_${seatId}`;
  try { AppState.orders = JSON.parse(localStorage.getItem(ordersKey) || '[]'); } catch(e){ AppState.orders = []; }
}

function saveCart() {
  const seatId = AppState.seatId || 'C-05';
  const cartKey = `cart_${seatId}`;
  try { localStorage.setItem(cartKey, JSON.stringify(AppState.cart)); } catch(e){ console.warn('saveCart failed', e); }
}

function saveOrders() {
  const seatId = AppState.seatId || 'C-05';
  const ordersKey = `orders_${seatId}`;
  try { localStorage.setItem(ordersKey, JSON.stringify(AppState.orders)); } catch(e){ console.warn('saveOrders failed', e); }
}

function addToCart(itemId, quantity = 1) {
  if (!AppState.canOrder) {
    console.warn('Cannot add to cart during checkout');
    return false;
  }

  if (!AppState.cart[itemId]) {
    AppState.cart[itemId] = 0;
  }
  AppState.cart[itemId] += quantity;
  saveCart();
  return true;
}

function removeFromCart(itemId) {
  delete AppState.cart[itemId];
  saveCart();
}

function clearCart() {
  AppState.cart = {};
  saveCart();
}

function getCartTotal() {
  const items = AppState.menuItems || [];
  return Object.entries(AppState.cart).reduce((total, [itemId, quantity]) => {
    const item = items.find(m => m.id === itemId);
    return total + (item ? item.price * quantity : 0);
  }, 0);
}

/* ===== 支払い管理 ===== */
function startPaymentProcess() {
  AppState.paymentStatus = 'preparing';
  AppState.canOrder = false;
  updatePaymentStatusStorage();
}

function completePayment() {
  AppState.paymentStatus = 'completed';
  AppState.canOrder = false;
  updatePaymentStatusStorage();
}

function updatePaymentStatusStorage() {
  const seatId = AppState.seatId || 'C-05';
  const paymentStatusKey = `paymentStatus_${seatId}`;
  localStorage.setItem(paymentStatusKey, AppState.paymentStatus);
}

function isPaymentInProgress() {
  return AppState.paymentStatus === 'preparing' || AppState.paymentStatus === 'completed';
}

function updateOrderingCapability() {
  AppState.canOrder = AppState.paymentStatus === 'idle';
}

/* ===== 売切管理 ===== */
function markAsSoldOut(itemId) {
  if (!AppState.soldOutItems.includes(itemId)) {
    AppState.soldOutItems.push(itemId);
  }
  localStorage.setItem('soldOutItems', JSON.stringify(AppState.soldOutItems));
}

function loadSoldOutItems() {
  const saved = localStorage.getItem('soldOutItems');
  AppState.soldOutItems = saved ? JSON.parse(saved) : [];
}

/* ===== スタッフ呼び出し ===== */
function recordStaffCall() {
  AppState.lastCallTime = new Date().toISOString();
  AppState.callInProgress = false;

  // 呼び出し履歴の記録（デモ用）
  const seatId = AppState.seatId || 'C-05';
  const callLogKey = `callLog_${seatId}`;
  const callLog = JSON.parse(localStorage.getItem(callLogKey) || '[]');
  callLog.push({
    timestamp: AppState.lastCallTime,
    seat: seatId
  });
  localStorage.setItem(callLogKey, JSON.stringify(callLog));
}

/* ===== 初期化実行 ===== */
document.addEventListener('DOMContentLoaded', () => {
  if (!window.AppStateInitialized) {
    initializeAppState();
    loadSoldOutItems();
    window.AppStateInitialized = true;
  }
});

// 即座初期化（スクリプト読込タイミングの対応）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (!window.AppStateInitialized) {
      initializeAppState();
      loadSoldOutItems();
      window.AppStateInitialized = true;
    }
  });
} else {
  if (!window.AppStateInitialized) {
    initializeAppState();
    loadSoldOutItems();
    window.AppStateInitialized = true;
  }
}
