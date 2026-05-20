/**
 * QR読込画面ロジック
 * 
 * 入店時の座席確定フロー
 * デモモード：デフォルト座席 C-05 で即座に進行
 * 
 * @version 2.1.0
 */

const QRState = {
  isProcessing: false,
  defaultSeat: 'C-05'  // デモ用デフォルト座席
};

/* ===== 初期化 ===== */
document.addEventListener('DOMContentLoaded', () => {
  initializeQREntry();
});

function initializeQREntry() {
  // 既にQR済みの場合はトップメニューへリダイレクト
  if (AppState.qrScanned && AppState.seatId) {
    setTimeout(() => {
      window.location.href = 'top_menu.html';
    }, 500);
    return;
  }

  bindEventHandlers();
}

/* ===== イベント バインディング ===== */
function bindEventHandlers() {
  const qrInput = document.getElementById('qrInput');
  const scanButton = document.getElementById('scanButton');
  const demoButton = document.getElementById('demoButton');

  if (qrInput) {
    qrInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleQRSubmit();
      }
    });
    // 自動フォーカス
    qrInput.focus();
  }

  if (scanButton) {
    scanButton.addEventListener('click', handleQRSubmit);
  }

  if (demoButton) {
    demoButton.addEventListener('click', handleDemoMode);
  }
}

/* ===== QRコード処理 ===== */
async function handleQRSubmit() {
  if (QRState.isProcessing) return;

  const qrInput = document.getElementById('qrInput');
  const qrData = qrInput?.value?.trim();

  if (!qrData) {
    showError('QRコードを入力してください');
    return;
  }

  QRState.isProcessing = true;
  showToast('読み込み中...');

  try {
    // QRコード検証（API）
    const result = await API.validateQRCode(qrData);

    if (!result.valid) {
      showError('無効なQRコードです');
      QRState.isProcessing = false;
      return;
    }

    // 座席ID取得
    const normalizedSeat = normalizeSeatId(result.seatId);
    if (!normalizedSeat) {
      showError('座席IDが無効です');
      QRState.isProcessing = false;
      return;
    }

    // 状態保存
    AppState.setSeatId(normalizedSeat);
    showSuccess(`座席 ${normalizedSeat} に設定しました`);

    // トップメニューへ遷移
    setTimeout(() => {
      window.location.href = 'top_menu.html';
    }, 1500);

  } catch (error) {
    console.error('QR validation error:', error);
    showError('QRコード読込エラーが発生しました');
    QRState.isProcessing = false;
  }
}

/* ===== デモモード（デフォルト座席で進行） ===== */
function handleDemoMode() {
  if (QRState.isProcessing) return;

  QRState.isProcessing = true;
  showToast('デモモードで進行中...');

  try {
    // デフォルト座席を設定（QR検証スキップ）
    const normalizedSeat = normalizeSeatId(QRState.defaultSeat);
    if (!normalizedSeat) {
      showError('座席設定エラーが発生しました');
      QRState.isProcessing = false;
      return;
    }

    // 状態保存
    AppState.setSeatId(normalizedSeat);
    showSuccess(`デモモード：座席 ${normalizedSeat} で進行します`);

    // トップメニューへ遷移
    setTimeout(() => {
      window.location.href = 'top_menu.html';
    }, 1500);

  } catch (error) {
    console.error('Demo mode error:', error);
    showError('デモモード開始エラーが発生しました');
    QRState.isProcessing = false;
  }
}

/* ===== 通知UI ===== */
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function showSuccess(message) {
  const result = document.getElementById('qrResult');
  if (!result) return;

  result.textContent = '✓ ' + message;
  result.className = 'qr-result success';

  showToast(message);
}

function showError(message) {
  const result = document.getElementById('qrResult');
  if (!result) return;

  result.textContent = '✗ ' + message;
  result.className = 'qr-result error';

  showToast(message);
}

/* ===== 座席ID正規化（shared-state.js と同じロジック） ===== */
function normalizeSeatId(input) {
  if (!input) return null;
  const normalized = String(input).trim().toUpperCase();
  const match = normalized.match(/^([A-Z])[-\s]?(\d{1,2})$/);
  if (!match) return null;
  return `${match[1]}-${String(parseInt(match[2], 10)).padStart(2, '0')}`;
}
