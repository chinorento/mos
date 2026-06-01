/**
 * API連携ユーティリティ
 * - フェッチラッパーを中心に各エンドポイントを短く明確に実装
 * - モック切替を維持
 * @version 2.0.1
 */

const API_CONFIG = {
  BASE_URL: '/mos-main/MOS/Customer',
  TIMEOUT_MS: 5000,
  USE_MOCK: false
};

// 共通フェッチ（タイムアウト + JSONパース）
async function fetchWithTimeout(url, timeoutMs = API_CONFIG.TIMEOUT_MS, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, ...options });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// 汎用リクエスト（JSON送受信）
async function requestJson(method, path, body = null, opts = {}) {
  const url = path.startsWith('http') ? path : `${API_CONFIG.BASE_URL}/${path.replace(/^\//, '')}`;
  const options = { method, headers: {}, ...opts };
  if (body != null) {
    if (options.headers['Content-Type'] === 'application/x-www-form-urlencoded') {
      options.body = new URLSearchParams(body);
    } else {
      options.headers['Content-Type'] = 'application/json';
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
  }
  const res = await fetchWithTimeout(url, options.timeoutMs || API_CONFIG.TIMEOUT_MS, options);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

/* ===== メニュー ===== */
async function getMenuItems(storeId = '001') {
  if (API_CONFIG.USE_MOCK) return generateDummyMenuItems();
  try {
    const data = await requestJson('GET', `get_menu.php?storeId=${encodeURIComponent(storeId)}`);
    const items = Array.isArray(data) ? data : [];
    const isNomihodai = localStorage.getItem('selectedPlan') === 'nomihodai';
    if (!isNomihodai) return items;
    return items.map(it => ({ ...it, price: ['アルコール', 'ソフトドリンク'].includes(it.category) ? 0 : it.price }));
  } catch (err) {
    console.error('getMenuItems failed', err);
    return generateDummyMenuItems();
  }
}

function generateDummyMenuItems() {
  return [
    { id: 'm01', name: 'ねぎま', category: '串もの', price: 280, image: '🍢', popular: true, soldOut: true },
    { id: 'm02', name: 'つくね', category: '串もの', price: 280, image: '🍢', popular: true },
    { id: 'm03', name: 'ぼんじり', category: '串もの', price: 320, image: '🍢' },
    { id: 'm04', name: '唐揚げ', category: '揚げ物', price: 590, image: '🍗', popular: true, soldOut: true },
    { id: 'm05', name: 'チーズ唐揚げ', category: '揚げ物', price: 650, image: '🍗' },
    { id: 'm07', name: '枝豆', category: '冷菜', price: 390, image: '🥬' },
    { id: 'm10', name: '牛タン塩焼き', category: '焼き物', price: 880, image: '🥩' },
    { id: 'm12', name: 'お絞り', category: '0円', price: 0, image: '🧻' },
    { id: 'm14', name: 'プレミアム・モルツ', category: 'アルコール', price: 550, image: '🍺', popular: true },
    { id: 'm20', name: 'コーラ', category: 'ソフトドリンク', price: 300, image: '🥤' }
  ];
}

/* ===== ラストオーダー（LO） ===== */
async function getLastOrderTime(storeId = '001') {
  if (API_CONFIG.USE_MOCK) {
    const now = new Date();
    const loTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 20);
    const remainingMinutes = Math.max(0, Math.floor((loTime - now) / 60000));
    return { remainingMinutes, loTime: loTime.toISOString(), serverTime: now.toISOString(), notify: remainingMinutes <= 15 };
  }
  try {
    return await requestJson('GET', `lo?storeId=${encodeURIComponent(storeId)}`);
  } catch (err) {
    console.error('getLastOrderTime failed', err);
    return { remainingMinutes: 120, serverTime: new Date().toISOString() };
  }
}

/* ===== スタッフ呼び出し ===== */
async function callStaff(seatId) {
  if (API_CONFIG.USE_MOCK) {
    await new Promise(r => setTimeout(r, 700));
    if (Math.random() < 0.1) throw new Error('Staff call failed (mock)');
    return { success: true, message: 'スタッフに通知しました', seatId };
  }
  try {
    return await requestJson('POST', 'insert_staffcall.php', { seat_no: seatId, datetime: new Date().toISOString(), complete_flag: 0 }, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  } catch (err) {
    console.error('callStaff failed', err);
    throw err;
  }
}

/* ===== 注文送信 ===== */
async function submitOrder(seatId, cartItems) {
  if (API_CONFIG.USE_MOCK) {
    await new Promise(r => setTimeout(r, 400));
    return { orderId: 'ORD-' + Date.now(), seatId, items: cartItems, status: 'confirmed', timestamp: new Date().toISOString() };
  }
  try {
    // 既存のサーバー側エンドポイント（insert_order.php）に連携する想定
    const payload = { seat_no: seatId, items_json: JSON.stringify(cartItems), amount: computeCartAmount(cartItems) };
    return await requestJson('POST', 'insert_order.php', payload, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  } catch (err) {
    console.error('submitOrder failed', err);
    throw err;
  }
}

function computeCartAmount(items) {
  if (!items) return 0;
  try {
    return Object.values(items).reduce((sum, it) => {
      if (typeof it === 'number') return sum + it; // fallback
      const price = Number(it.price || 0);
      const qty = Number(it.qty || it.quantity || 1);
      return sum + price * qty;
    }, 0);
  } catch (_) { return 0; }
}

/* ===== 会計 ===== */
async function initializePayment(seatId) {
  if (API_CONFIG.USE_MOCK) return { paymentId: 'PAY-' + Date.now(), seatId, status: 'preparing', message: '会計を準備しています...' };
  try {
    return await requestJson('POST', 'payment/start', { seatId });
  } catch (err) {
    console.error('initializePayment failed', err);
    throw err;
  }
}

async function completePayment(paymentId, amount) {
  if (API_CONFIG.USE_MOCK) return { paymentId, status: 'completed', amount, timestamp: new Date().toISOString() };
  try {
    return await requestJson('POST', 'payment/complete', { paymentId, amount });
  } catch (err) {
    console.error('completePayment failed', err);
    throw err;
  }
}

/* ===== QR検証 ===== */
async function validateQRCode(qrData) {
  const match = String(qrData || '').match(/SEAT:([A-Z]-\d{2})/);
  if (!match) throw new Error('Invalid QR code format');
  const seatId = match[1];
  if (API_CONFIG.USE_MOCK) return { valid: true, seatId, storeName: 'みどり亭 ○○店', timestamp: new Date().toISOString() };
  try {
    return await requestJson('POST', 'qr/validate', { qrData });
  } catch (err) {
    console.error('validateQRCode failed', err);
    throw err;
  }
}

/* ===== 売切アイテム取得 ===== */
async function getSoldOutItems() {
  if (API_CONFIG.USE_MOCK) return [];
  try {
    return await requestJson('GET', 'get_sold_out.php');
  } catch (err) {
    console.error('getSoldOutItems failed', err);
    return [];
  }
}

/* ===== エクスポート ===== */
window.API = {
  getMenuItems,
  getLastOrderTime,
  callStaff,
  submitOrder,
  initializePayment,
  completePayment,
  validateQRCode,
  getSoldOutItems,
  // テスト用/内部ユーティリティを公開
  _cfg: API_CONFIG,
  _fetchWithTimeout: fetchWithTimeout
};
