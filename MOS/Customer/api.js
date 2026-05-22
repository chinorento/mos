/**
 * API連携ユーティリティ
 * 
 * バックエンドAPIとの通信、またはデモ用ダミーデータ提供
 * testtest
 * @version 2.0.0
 * @author POS Development Team
 */

const API_CONFIG = {
  BASE_URL: '/api',
  TIMEOUT_MS: 5000,
  USE_MOCK: true  // true: ダミーデータ使用、false: 実APIコール
};

/* ===== メニューAPI ===== */
async function getMenuItems(storeId = '001') {
  if (API_CONFIG.USE_MOCK) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(generateDummyMenuItems());
      }, 500);
    });
  }
  
  try {
    const response = await fetchWithTimeout(
      `${API_CONFIG.BASE_URL}/menu?storeId=${storeId}`,
      API_CONFIG.TIMEOUT_MS
    );
    return await response.json();
  } catch (error) {
    console.error('Menu API error:', error);
    return generateDummyMenuItems();
  }
}

function generateDummyMenuItems() {
  return [
    // 串もの
    { id: 'm01', name: 'ねぎま', category: '串もの', price: 280, image: '🍢', popular: true, soldOut: true },
    { id: 'm02', name: 'つくね', category: '串もの', price: 280, image: '🍢', popular: true },
    { id: 'm03', name: 'ぼんじり', category: '串もの', price: 320, image: '🍢', popular: false },
    
    // 揚げ物
    { id: 'm04', name: '唐揚げ', category: '揚げ物', price: 590, image: '🍗', popular: true, soldOut: true },
    { id: 'm05', name: 'チーズ唐揚げ', category: '揚げ物', price: 650, image: '🍗', popular: true },
    { id: 'm06', name: 'ただの唐揚げ', category: '揚げ物', price: 520, image: '🍗', popular: false },
    
    // 冷菜
    { id: 'm07', name: '枝豆', category: '冷菜', price: 390, image: '🥬', popular: false, soldOut: true },
    { id: 'm08', name: 'ポテトサラダ', category: '冷菜', price: 420, image: '🥔', popular: false },
    { id: 'm09', name: 'イカ塩辛', category: '冷菜', price: 480, image: '🦑', popular: false },
    
    // 焼き物
    { id: 'm10', name: '牛タン塩焼き', category: '焼き物', price: 880, image: '🥩', popular: true },
    { id: 'm11', name: '焼鳥盛合わせ', category: '焼き物', price: 720, image: '🔥', popular: false },
    
    // 0円メニュー
    { id: 'm12', name: 'お絞り', category: '0円', price: 0, image: '🧻', popular: false },
    { id: 'm13', name: '取り皿', category: '0円', price: 0, image: '🍽️', popular: false }
  ];
}

/* ===== ラストオーダー（LO）API ===== */
async function getLastOrderTime(storeId = '001') {
  if (API_CONFIG.USE_MOCK) {
    return new Promise(resolve => {
      setTimeout(() => {
        const now = new Date();
        const closeHour = 24;  // 23:50 に LO（30分前）
        const loTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 20);
        const remainingMs = loTime - now;
        const remainingMinutes = Math.max(0, Math.floor(remainingMs / 1000 / 60));
        
        resolve({
          remainingMinutes: remainingMinutes,
          loTime: loTime.toISOString(),
          serverTime: now.toISOString(),
          notify: remainingMinutes <= 15
        });
      }, 200);
    });
  }
  
  try {
    const response = await fetchWithTimeout(
      `${API_CONFIG.BASE_URL}/lo?storeId=${storeId}`,
      API_CONFIG.TIMEOUT_MS
    );
    return await response.json();
  } catch (error) {
    console.error('LO API error:', error);
    return { remainingMinutes: 120, serverTime: new Date().toISOString() };
  }
}

/* ===== スタッフ呼び出しAPI ===== */
async function callStaff(seatId) {
  if (API_CONFIG.USE_MOCK) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() > 0.1) {  // 90% 成功
          resolve({ success: true, message: 'スタッフに通知しました', seatId });
        } else {
          reject(new Error('Staff call failed'));
        }
      }, 1000);
    });
  }
  
  try {
    const response = await fetchWithTimeout(
      `${API_CONFIG.BASE_URL}/call`,
      API_CONFIG.TIMEOUT_MS,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seatId })
      }
    );
    return await response.json();
  } catch (error) {
    console.error('Call staff API error:', error);
    throw error;
  }
}

/* ===== 注文送信API ===== */
async function submitOrder(seatId, cartItems) {
  if (API_CONFIG.USE_MOCK) {
    return new Promise(resolve => {
      setTimeout(() => {
        const orderId = 'ORD-' + Date.now();
        resolve({
          orderId,
          seatId,
          items: cartItems,
          status: 'confirmed',
          timestamp: new Date().toISOString()
        });
      }, 500);
    });
  }
  
  try {
    const response = await fetchWithTimeout(
      `${API_CONFIG.BASE_URL}/order`,
      API_CONFIG.TIMEOUT_MS,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seatId, items: cartItems })
      }
    );
    return await response.json();
  } catch (error) {
    console.error('Submit order API error:', error);
    throw error;
  }
}

/* ===== 会計API ===== */
async function initializePayment(seatId) {
  if (API_CONFIG.USE_MOCK) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          paymentId: 'PAY-' + Date.now(),
          seatId,
          status: 'preparing',
          message: '会計を準備しています...'
        });
      }, 300);
    });
  }
  
  try {
    const response = await fetchWithTimeout(
      `${API_CONFIG.BASE_URL}/payment/start`,
      API_CONFIG.TIMEOUT_MS,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seatId })
      }
    );
    return await response.json();
  } catch (error) {
    console.error('Payment initialization error:', error);
    throw error;
  }
}

async function completePayment(paymentId, amount) {
  if (API_CONFIG.USE_MOCK) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          paymentId,
          status: 'completed',
          amount,
          timestamp: new Date().toISOString()
        });
      }, 800);
    });
  }
  
  try {
    const response = await fetchWithTimeout(
      `${API_CONFIG.BASE_URL}/payment/complete`,
      API_CONFIG.TIMEOUT_MS,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, amount })
      }
    );
    return await response.json();
  } catch (error) {
    console.error('Payment completion error:', error);
    throw error;
  }
}

/* ===== QR認証API ===== */
async function validateQRCode(qrData) {
  // QRデータから座席IDを抽出（例: "SEAT:C-05"）
  const match = qrData.match(/SEAT:([A-Z]-\d{2})/);
  if (!match) {
    throw new Error('Invalid QR code format');
  }
  
  const seatId = match[1];
  
  if (API_CONFIG.USE_MOCK) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          valid: true,
          seatId,
          storeName: 'みどり亭 ○○店',
          timestamp: new Date().toISOString()
        });
      }, 300);
    });
  }
  
  try {
    const response = await fetchWithTimeout(
      `${API_CONFIG.BASE_URL}/qr/validate`,
      API_CONFIG.TIMEOUT_MS,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrData })
      }
    );
    return await response.json();
  } catch (error) {
    console.error('QR validation error:', error);
    throw error;
  }
}

/* ===== ユーティリティ ===== */
function fetchWithTimeout(url, timeoutMs, options = {}) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
    )
  ]);
}

/**
 * 売切アイテムを取得
 */
async function getSoldOutItems() {
  if (API_CONFIG.USE_MOCK) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve([]);  // デモでは売切なし
      }, 200);
    });
  }
  
  try {
    const response = await fetchWithTimeout(
      `${API_CONFIG.BASE_URL}/sold-out`,
      API_CONFIG.TIMEOUT_MS
    );
    return await response.json();
  } catch (error) {
    console.error('Sold out items API error:', error);
    return [];
  }
}

/* ===== グローバル公開 ===== */
window.API = {
  getMenuItems,
  getLastOrderTime,
  callStaff,
  submitOrder,
  initializePayment,
  completePayment,
  validateQRCode,
  getSoldOutItems
};
