/**
 * 注文履歴システム
 * 
 * 機能:
 * - 注文履歴の表示・検索・フィルタリング
 * - 注文詳細の表示（注文内容、合計金額、注文日時）
 * 
 * @version 1.0.0
 * @author 
 */

(function(){

  const normalizeSeatId = (input) => {
    if (!input) return null;
    const s = String(input).trim().toUpperCase();
    const m = s.match(/^([A-Z])[-\s]?(\d{1,2})$/);
    return m ? `${m[1]}-${String(parseInt(m[2],10)).padStart(2,'0')}` : null;
  };

  const qs = (id) => document.getElementById(id);

  // DOM 要素キャッシュ
  let elSeatLabel, elDelivered, elPending, elOrdersList, elToast;

  const fmtTs = (ts) => {
    try {
      const d = new Date(Number(ts));
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    } catch(e){ return ''; }
  };

  const escapeHtml = (text) => {
    if (text == null) return '';
    return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  };

  const getCurrentSeatId = () => {
    const candidates = [
      typeof AppState !== 'undefined' ? AppState.seatId : null,
      localStorage.getItem('seatId'),
      'C-01'
    ];

    for (const candidate of candidates) {
      const normalized = normalizeSeatId(candidate);
      if (normalized) return normalized;
    }

    return null;
  };

  const sameSeat = (a, b) => normalizeSeatId(a) === normalizeSeatId(b);

  // ----- 状態 -----
  let seatId = getCurrentSeatId();
  let orders = [];
  let currentFilter = 'all'; // all | pending | delivered
  // メニュー参照用マップ（get_menu.php から構築）
  let menuMap = {};
  let menuFetched = false;

  // 履歴取得エンドポイント候補（相対パスを優先）
  const ORDER_HISTORY_ENDPOINTS = [
    'fetch_order_history.php',
    '/mos-main/MOS/Customer/fetch_order_history.php'
  ];

  // ローカル保存のキー
  const ordersKey = () => `orders_${seatId || 'unknown'}`;

  // ローカル保存（永続化）
  function saveOrders(){
    try {
      localStorage.setItem(ordersKey(), JSON.stringify(orders));
    } catch(e){ console.warn('saveOrders failed', e); }
  }

  function loadOrders(){
    try {
      const raw = localStorage.getItem(ordersKey());
      orders = raw ? JSON.parse(raw) : [];
    } catch(e){ orders = []; }
  }

  /**
   * 初期化
   * - seat/orders の読み込み、イベントバインド
   * - DB(get_menu.php) から menuMap を先に取得して表示に反映
   * - サーバー（insert_order.php）から注文履歴を取得して表示
   */
  async function init(){
    seatId = getCurrentSeatId();
    // DOM 要素をキャッシュ（スクリプトは body 終了時に読み込まれる想定）
    elSeatLabel = qs('seatLabel');
    elDelivered = qs('deliveredCount');
    elPending = qs('pendingCount');
    elOrdersList = qs('ordersList');
    elToast = qs('toast');

    updateSeatLabel();
    // クライアントローカルのキャッシュに依存せず、サーバーから取得する（insert_order.php が単一の履歴ソース）
    bindEvents();

    // セレクタを作成（削除）
    // createOrderSourceControl();

    if (window.fetch) {
      try {
        await fetchMenuMap(); // メニューを先に取得
      } catch (e) {
        console.warn('fetchMenuMap failed', e);
      }
    }

    // サーバーから履歴を取得して表示
    if (window.fetch) {
      try {
        await fetchOrdersFromServer();
      } catch (e) {
        console.warn('fetchOrdersFromServer failed', e);
      }
    }

    render();

    if (typeof startClock === 'function') {
      try { startClock(); } catch(e){ /* ignore */ }
    }
  }

  /**
   * fetchOrdersFromServer
   * - サーバーの insert_order.php を唯一の注文履歴ソースとして取得し内部 orders を更新する
   */
  async function fetchOrdersFromServer(){
    try {
      seatId = getCurrentSeatId();
      if (!seatId) return;
      const seat = seatId || '';

      // ローカルキャッシュを先に読み込む
      loadOrders();

      // サーバーからの新しい履歴を取得（候補順に試す）
      let data = null;
      let lastErr = null;
      for (const url of ORDER_HISTORY_ENDPOINTS) {
        try {
          const res = await fetch(`${url}?seat_no=${encodeURIComponent(seat)}&t=${Date.now()}`);
          if (!res.ok) throw new Error('fetch failed: ' + res.status + ' for ' + url);
          data = await res.json();
          break;
        } catch (e) {
          lastErr = e;
        }
      }

      if (!data) {
        // サーバー未取得時はローカルキャッシュをそのまま使う
        console.warn('fetchOrdersFromServer: no data from server, using local cache', lastErr);
        render();
        return;
      }

      if (!Array.isArray(data) || data.length === 0) {
        orders = [];
        saveOrders();
        render();
        return;
      }

      // サーバーの配列を正規化して内部配列へセット
      const normalized = data.map(normalizeServerOrder);
      orders = normalized.filter(o => o.seat === seat);
      saveOrders();
      render();
    } catch(e){
      console.warn('fetchOrdersFromServer error', e);
      throw e;
    }
  }

  /**
   * normalizeServerOrder
   * - サーバーからの生データを内部で扱いやすい形に正規化して返す
   */
  function normalizeServerOrder(raw){
    const o = {};
    // 生データの識別子／時刻／金額等を抽出
    o.id = raw.id || raw.ID || null;
    o.ts = raw.ts || raw.timestamp || raw.日時 || raw.time || null;
    o.timestamp = o.ts;

    // 席番を取り出し正規化しておく（クライアント側での一致判定に使用）
    const rawSeat = raw['席番'] ?? raw.seat_no ?? raw.seat ?? raw.name ?? null;
    o.seatRaw = rawSeat;
    o.seat = normalizeSeatId(rawSeat);

    o.items = (raw.items && typeof raw.items === 'object') ? raw.items : null;
    o.contentString = raw.注文内容 || raw.order_content || raw.data || null;
    if (!o.contentString && raw.items && typeof raw.items === 'string') {
      o.contentString = raw.items;
      o.items = null;
    }
    if (!o.contentString && raw.name && typeof raw.name === 'string') {
      o.name = raw.name;
    }
    o.total = raw.total || raw.金額 || raw.price || 0;
    o.qty = raw.個数 || raw.数量 || raw.qty || 1;
    o.delivered = Boolean(raw.配膳フラグ || raw.delivered);
    o.delivered = o.delivered === true || o.delivered === 1 || o.delivered === '1' || o.delivered === 'true';
    return o;
  }

  /**
   * updateSeatLabel
   * - DOM 上の席表示を更新する
   */
  function updateSeatLabel(){
    if (elSeatLabel) elSeatLabel.textContent = `席：${seatId || '未設定'}`;
  }

  /**
   * bindEvents
   * - UI のボタンイベントをバインドする
   */
  function bindEvents(){
    document.querySelectorAll('.filter-btn').forEach(btn=>{
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter || 'all';
        render();
      });
    });

    const clearBtn = qs('clearHistory');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      if (!confirm('注文履歴を本当に削除しますか？')) return;
      orders = [];
      saveOrders();
      render();
      if (typeof showToast === 'function') showToast('履歴を削除しました');
    });
  }

  /**
   * render / renderCounts / renderList
   * - 表示関連の責務を分離して読みやすく実装
   */
  function render(){ renderCounts(); renderList(); }

  function renderCounts(){
    const summary = orders.reduce((s,o)=>{
      if (o.delivered) s.delivered += o.qty || 0;
      else s.pending += o.qty || 0;
      return s;
    }, {delivered:0,pending:0});
    if (elDelivered) elDelivered.textContent = String(summary.delivered);
    if (elPending) elPending.textContent = String(summary.pending);
  }

  function renderList(){
    if (!elOrdersList) return;
    elOrdersList.innerHTML = '';
    const list = filteredOrders();

    if (list.length === 0){
      elOrdersList.innerHTML = '<div class="no-results">注文履歴がありません</div>';
      return;
    }

    list.forEach((order, idx) => {
      const card = document.createElement('div');
      card.className = 'order-card';

      // header
      const header = document.createElement('div');
      header.className = 'order-header';
      header.style.cssText = 'border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 8px;';

      const timestamp = document.createElement('div');
      timestamp.className = 'order-ts';
      timestamp.style.cssText = 'font-size: 12px; color: #999; margin-bottom: 4px;';
      timestamp.textContent = order.timestamp ? new Date(order.timestamp).toLocaleString('ja-JP') : '時刻不明';

      const totalInfo = document.createElement('div');
      totalInfo.style.cssText = 'font-weight: 600; color: #ff7f32;';
      totalInfo.textContent = `合計：¥${(order.total || 0).toLocaleString()}`;

      header.appendChild(timestamp);
      header.appendChild(totalInfo);
      card.appendChild(header);

      // items
      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'order-items';
      itemsContainer.style.cssText = 'margin-bottom: 12px;';

      if (order.items && typeof order.items === 'object') {
        Object.entries(order.items).forEach(([itemId, qty]) => {
          let itemName = itemId;
          let itemPrice = 0;

          // 飲み放題判定（未使用だが互換性維持）
          const isNomihodai = localStorage.getItem('selectedPlan') === 'nomihodai';

          if (menuMap[itemId]) {
            itemName = menuMap[itemId].name;
            itemPrice = menuMap[itemId].price;
          }

          const itemRow = document.createElement('div');
          itemRow.style.cssText = 'display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px;';
          const subtotal = (itemPrice || 0) * (qty || 0);
          let rightText = '';
          if (subtotal > 0) rightText = `×${qty} = ¥${subtotal.toLocaleString()}`;
          else if ((qty || 0) > 1) rightText = `×${qty}`;

          itemRow.innerHTML = `\n            <span>${escapeHtml(itemName)}</span>\n            <span style="text-align: right;">${escapeHtml(rightText)}</span>\n          `;
          itemsContainer.appendChild(itemRow);
        });
      } else if (order.contentString) {
        const lines = String(order.contentString).split(/\r?\n/).filter(Boolean);
        if (lines.length === 0) {
          const emptyRow = document.createElement('div');
          emptyRow.className = 'no-results';
          emptyRow.textContent = '（注文内容なし）';
          itemsContainer.appendChild(emptyRow);
        } else {
          lines.forEach(line => {
            const itemRow = document.createElement('div');
            itemRow.style.cssText = 'display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px;';
            const qtyText = Number(order.qty || 0) > 1 ? ` ×${order.qty}` : (Number(order.qty || 0) === 1 ? ' ×1' : '');
            itemRow.innerHTML = `\n              <span>${escapeHtml(line)}</span>\n              <span style="text-align: right;">${escapeHtml(qtyText)}</span>\n            `;
            itemsContainer.appendChild(itemRow);
          });
        }
      } else if (order.name) {
        const itemRow = document.createElement('div');
        itemRow.style.cssText = 'display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px;';
        const oldQty = order.qty || 0;
        const oldSubtotal = (order.price || 0) * oldQty;
        let oldRight = '';
        if (oldSubtotal > 0) oldRight = `×${oldQty} = ¥${oldSubtotal.toLocaleString()}`;
        else if (oldQty > 1) oldRight = `×${oldQty}`;
        itemRow.innerHTML = `\n          <span>${escapeHtml(order.name)}</span>\n          <span style="text-align: right;">${escapeHtml(oldRight)}</span>\n        `;
        itemsContainer.appendChild(itemRow);
      }

      card.appendChild(itemsContainer);

      // actions
      const actions = document.createElement('div');
      actions.className = 'order-actions';
      actions.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';

      const tag = document.createElement('div');
      tag.className = 'tag ' + (order.delivered ? 'delivered' : 'pending');
      tag.style.cssText = 'padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;';
      tag.textContent = order.delivered ? '配膳済み' : '未配膳';
      actions.appendChild(tag);

      card.appendChild(actions);
      elOrdersList.appendChild(card);
    });
  }

  /**
   * filteredOrders
   * - 現在のフィルタ状態に基づき表示用の配列を返す（新しい順）
   */
  function filteredOrders(){
    if (currentFilter === 'all') return orders.slice().reverse();
    if (currentFilter === 'pending') return orders.filter(o => !o.delivered).slice().reverse();
    return orders.filter(o => o.delivered).slice().reverse();
  }

  /**
   * toggleDelivered / removeOrderByIndex
   * - 注文の配膳状態トグル／削除（内部状態を更新しローカルに保存）
   */
  function toggleDelivered(idxReversed, id){
    const filtered = filteredOrders();
    const item = filtered[idxReversed];
    if (!item) return;
    const realIdx = orders.findIndex(o => (o.ts == item.ts) && (o.id == item.id));
    if (realIdx === -1) return;
    orders[realIdx] = { ...orders[realIdx], delivered: !orders[realIdx].delivered };
    saveOrders();
    render();
    if (typeof showToast === 'function') showToast(orders[realIdx].delivered ? '配膳済みにしました' : '未配膳に戻しました');
  }

  function removeOrderByIndex(idxReversed){
    const filtered = filteredOrders();
    const item = filtered[idxReversed];
    if (!item) return;
    const realIdx = orders.findIndex(o => (o.ts == item.ts) && (o.id == item.id));
    if (realIdx === -1) return;
    orders.splice(realIdx,1);
    saveOrders();
    render();
    if (typeof showToast === 'function') showToast('注文を削除しました');
  }

  /**
   * fetchMenuMap
   * - get_menu.php からメニュー配列を取得し、id をキーにした map を構築する
   * - 取得失敗時は空 map を使用してフォールバック
   */
  async function fetchMenuMap(){
    try {
      const res = await fetch('get_menu.php');
      if (!res.ok) throw new Error('menu fetch failed: ' + res.status);
      const data = await res.json();
      if (Array.isArray(data)){
        menuMap = data.reduce((m,it)=>{
          const id = it.id || it.itemId || it.code || it.key;
          if (!id) return m;
          m[id] = {
            name: it.name || it.title || it.label || id,
            price: typeof it.price === 'number' ? it.price : (Number(it.price) || 0)
          };
          return m;
        }, {});
      } else if (data && typeof data === 'object') {
        menuMap = data;
      } else {
        menuMap = {};
      }
      menuFetched = true;
      render();
    } catch(e){
      console.warn('fetchMenuMap error', e);
    }
  }

  // デバッグ用グローバル
  window.__ordersHistory = orders;
  window.refreshOrderHistory = function(){ loadOrders(); render(); };

  // 起動
  document.addEventListener('DOMContentLoaded', init);

})();
