(function(){
  // ユーティリティ
  function normalizeSeatId(input) {
    if (!input) return null;
    const s = String(input).trim().toUpperCase();
    const m = s.match(/^([A-Z])[-\s]?(\d{1,2})$/);
    return m ? `${m[1]}-${String(parseInt(m[2],10)).padStart(2,'0')}` : null;
  }
  function qs(id){ return document.getElementById(id); }
  function fmtTs(ts){
    try {
      const d = new Date(Number(ts));
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    } catch(e){ return ''; }
  }
  function escapeHtml(text){
    if (text == null) return '';
    return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function getCurrentSeatId(){
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
  }

  function sameSeat(a, b){
    return normalizeSeatId(a) === normalizeSeatId(b);
  }

  // 状態
  let seatId = getCurrentSeatId();
  let orders = [];
  let currentFilter = 'all'; // all | pending | delivered
  const ordersKey = () => `orders_${seatId || 'unknown'}`;

  // メニューマップ（gwt_menu.php から取得）
  let menuMap = {};
  let menuFetched = false;

  // DOM
  const elSeatLabel = qs('seatLabel');
  const elDelivered = qs('deliveredCount');
  const elPending = qs('pendingCount');
  const elOrdersList = qs('ordersList');
  const elToast = qs('toast');

  // 初期化
  function init(){
    seatId = getCurrentSeatId();
    updateSeatLabel();
    loadOrders();
    bindEvents();
    render();
    
    // メニュー情報をロード（注文表示時に使用）
    if (typeof API !== 'undefined' && API.getMenuItems) {
      API.getMenuItems().then(items => {
        if (typeof AppState !== 'undefined') {
          AppState.menuItems = items || [];
        }
        // 再描画してアイテム情報を反映
        render();
      }).catch(e => {
        console.warn('Menu load failed:', e);
      });
    }

    // gwt_menu.php からメニューを取得して menuMap を構築
    if (window.fetch) {
      fetchMenuMap().catch(e => console.warn('fetchMenuMap failed', e));
    }
    
    if (typeof startClock === 'function') {
      try { startClock(); } catch(e){ /* ignore */ }
    }
    // サーバーから最新の注文を取得して置き換える（存在する場合）
    if (window.fetch) {
      fetchOrdersFromServer().catch(e=>{
        // フェールしたらローカルキャッシュを使い続ける
        console.warn('fetchOrdersFromServer failed', e);
      });
    }
  }

  async function fetchOrdersFromServer(){
    try {
      seatId = getCurrentSeatId();
      if (!seatId) return;
      const seat = seatId || '';
      const res = await fetch(`fetch_order_history.php?seat_no=${encodeURIComponent(seat)}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return;
      // 正規化して内部 orders 配列へセット
      orders = data
        .filter(raw => sameSeat(raw.席番 || raw.seat_no || raw.seat || raw.name, seat))
        .map(normalizeServerOrder);
      // キャッシュして表示
      saveOrders();
      render();
    } catch(e){
      throw e;
    }
  }

  function normalizeServerOrder(raw){
    const o = {};
    o.id = raw.id || raw.ID || null;
    o.ts = raw.ts || raw.timestamp || raw.日時 || raw.time || null;
    o.timestamp = o.ts;
    // items は配列/オブジェクト形式を期待
    o.items = (raw.items && typeof raw.items === 'object') ? raw.items : null;
    // サーバーからの自由形式注文文字列（insert_order.php の order_content 等）
    o.contentString = raw.注文内容 || raw.order_content || raw.data || null;
    // 互換: raw.items が文字列の場合はそれを contentString として扱う
    if (!o.contentString && raw.items && typeof raw.items === 'string') {
      o.contentString = raw.items;
      o.items = null;
    }
    // 古い単一名フィールドを保持
    if (!o.contentString && raw.name && typeof raw.name === 'string') {
      o.name = raw.name;
    }
    o.total = raw.total || raw.金額 || raw.price || 0;
    o.qty = raw.個数 || raw.数量 || raw.qty || 1;
    o.delivered = Boolean(raw.配膳フラグ || raw.delivered);
    o.delivered = o.delivered === true || o.delivered === 1 || o.delivered === '1' || o.delivered === 'true';
    return o;
  }

  function updateSeatLabel(){
    if (elSeatLabel) elSeatLabel.textContent = `席：${seatId || '未設定'}`;
  }

  function loadOrders(){
    try {
      seatId = getCurrentSeatId();
      if (!seatId) {
        orders = [];
        return;
      }
      const raw = localStorage.getItem(ordersKey());
      orders = raw ? JSON.parse(raw) : [];
    } catch(e){
      console.error('orders load err', e);
      orders = [];
    }
  }

  function saveOrders(){
    try {
      localStorage.setItem(ordersKey(), JSON.stringify(orders));
    } catch(e){
      console.error('orders save err', e);
    }
  }

  function bindEvents(){
    // filter buttons
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

  function render(){
    renderCounts();
    renderList();
  }

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

    // NOTE: menuMap は fetchMenuMap() により構築されます。取得失敗時は空のままにして
    // itemId をそのまま表示するフォールバックになります。

    if (list.length === 0){
      elOrdersList.innerHTML = '<div class="no-results">注文履歴がありません</div>';
      return;
    }

    list.forEach((order, idx) => {
      const card = document.createElement('div');
      card.className = 'order-card';

      // 注文ヘッダー
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

      // 注文内容（メニューごとに展開）
      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'order-items';
      itemsContainer.style.cssText = 'margin-bottom: 12px;';
      
      // API.getMenuItems() で動的にメニュー情報を取得（AppState依存を削除）
      if (order.items && typeof order.items === 'object') {
        // 非同期処理が必要だが、ここでは同期的に処理するため、
        // itemIdをそのまま表示（メニュー情報がない場合）
        Object.entries(order.items).forEach(([itemId, qty]) => {
          // メニュー情報はlocal apiから同期的に取得（キャッシュ）
          let itemName = itemId;
          let itemPrice = 0;
          
          // 飲み放題の判定
          const isNomihodai = localStorage.getItem('selectedPlan') === 'nomihodai';
          // item名の簡易マッピング（order_history.jsでAPI呼び出しせず、predefのマッピングデータを使用）
          // const menuMap = {
          //   'm01': { name: 'ねぎま', price: 280 },
          //   'm02': { name: 'つくね', price: 280 },
          //   'm03': { name: 'ぼんじり', price: 320 },
          //   'm04': { name: '唐揚げ', price: 590 },
          //   'm05': { name: 'チーズ唐揚げ', price: 650 },
          //   'm06': { name: 'ただの唐揚げ', price: 520 },
          //   'm07': { name: '枝豆', price: 390 },
          //   'm08': { name: 'ポテトサラダ', price: 420 },
          //   'm09': { name: 'イカ塩辛', price: 480 },
          //   'm10': { name: '牛タン塩焼き', price: 880 },
          //   'm11': { name: '焼鳥盛合わせ', price: 720 },
          //   'm12': { name: 'お絞り', price: 0 },
          //   'm13': { name: '取り皿', price: 0 },
          //   'm14': { name: 'プレミアム・モルツ', price: isNomihodai ? 0 : 550 },
          //   'm15': { name: 'ハイボール', price: isNomihodai ? 0 : 450 },
          //   'm16': { name: 'レモンサワー', price: isNomihodai ? 0 : 450 },
          //   'm17': { name: '梅酒', price: isNomihodai ? 0 : 480 },
          //   'm18': { name: '焼酎(麦)', price: isNomihodai ? 0 : 450 },
          //   'm19': { name: '日本酒', price: isNomihodai ? 0 : 500 },
          //   'm20': { name: 'コーラ', price: isNomihodai ? 0 : 300 },
          //   'm21': { name: 'ジンジャーエール', price: isNomihodai ? 0 : 300 },
          //   'm22': { name: 'カルピス', price: isNomihodai ? 0 : 300 },
          //   'm23': { name: 'オレンジジュース', price: isNomihodai ? 0 : 300 },
          //   'm24': { name: 'リンゴジュース', price: isNomihodai ? 0 : 300 }
          // };
          
          if (menuMap[itemId]) {
            itemName = menuMap[itemId].name;
            itemPrice = menuMap[itemId].price;
          }
          
          const itemRow = document.createElement('div');
          itemRow.style.cssText = 'display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px;';
          const subtotal = (itemPrice || 0) * (qty || 0);
          let rightText = '';
          if (subtotal > 0) {
            rightText = `×${qty} = ¥${subtotal.toLocaleString()}`;
          } else if ((qty || 0) > 1) {
            rightText = `×${qty}`;
          } else {
            rightText = '';
          }
          itemRow.innerHTML = `
            <span>${itemName}</span>
            <span style="text-align: right;">${rightText}</span>
          `;
          itemsContainer.appendChild(itemRow);
        });
      } else if (order.contentString) {
        // サーバーから受け取った改行区切りの注文文字列を行ごとに表示
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
            itemRow.innerHTML = `
              <span>${escapeHtml(line)}</span>
              <span style="text-align: right;">${escapeHtml(qtyText)}</span>
            `;
            itemsContainer.appendChild(itemRow);
          });
        }
      } else if (order.name) {
        // 古い形式の場合（互換性）
        const itemRow = document.createElement('div');
        itemRow.style.cssText = 'display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px;';
        const oldQty = order.qty || 0;
        const oldSubtotal = (order.price || 0) * oldQty;
        let oldRight = '';
        if (oldSubtotal > 0) {
          oldRight = `×${oldQty} = ¥${oldSubtotal.toLocaleString()}`;
        } else if (oldQty > 1) {
          oldRight = `×${oldQty}`;
        } else {
          oldRight = '';
        }
        itemRow.innerHTML = `
          <span>${escapeHtml(order.name)}</span>
          <span style="text-align: right;">${oldRight}</span>
        `;
        itemsContainer.appendChild(itemRow);
      }
      card.appendChild(itemsContainer);

      // アクション
      const actions = document.createElement('div');
      actions.className = 'order-actions';
      actions.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';

      const tag = document.createElement('div');
      tag.className = 'tag ' + (order.delivered ? 'delivered' : 'pending');
      tag.style.cssText = 'padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;';
      tag.textContent = order.delivered ? '配膳済み' : '未配膳';
      actions.appendChild(tag);

      // const toggleBtn = document.createElement('button');
      // toggleBtn.className = 'primary';
      // toggleBtn.style.cssText = 'padding: 6px 12px; font-size: 12px;';
      // toggleBtn.textContent = order.delivered ? '未配膳に戻す' : '配膳済みにする';
      // toggleBtn.addEventListener('click', () => {
      //   toggleDelivered(idx, order.id);
      // });
      // actions.appendChild(toggleBtn);

      // const removeBtn = document.createElement('button');
      // removeBtn.className = 'secondary';
      // removeBtn.style.cssText = 'padding: 6px 12px; font-size: 12px;';
      // removeBtn.textContent = '削除';
      // removeBtn.addEventListener('click', () => {
      //   if (!confirm('この注文を削除しますか？')) return;
      //   removeOrderByIndex(idx);
      // });
      // actions.appendChild(removeBtn);

      card.appendChild(actions);
      elOrdersList.appendChild(card);
    });
  }

  function filteredOrders(){
    if (currentFilter === 'all') return orders.slice().reverse(); // 新しい順
    if (currentFilter === 'pending') return orders.filter(o => !o.delivered).slice().reverse();
    return orders.filter(o => o.delivered).slice().reverse();
  }

  function toggleDelivered(idxReversed, id){
    // idxReversed corresponds to reversed list index; map to original index
    // Simpler: find by id and timestamp if provided; otherwise use index mapping from filtered list
    const filtered = filteredOrders();
    const item = filtered[idxReversed];
    if (!item) return;
    // find actual index in orders array by matching unique ts+id
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

  // サーバーから gwt_menu.php を呼んで menuMap を構築する
  async function fetchMenuMap(){
    try {
      const res = await fetch('get_menu.php');
      if (!res.ok) throw new Error('menu fetch failed: ' + res.status);
      const data = await res.json();
      // data が配列なら id をキーにしたマップへ変換
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
        // 既に {id: {name,price}} の形で返ってくる場合
        menuMap = data;
      } else {
        menuMap = {};
      }
      menuFetched = true;
      // メニュー取得後に再描画して名称/価格を反映
      render();
    } catch(e){
      console.warn('fetchMenuMap error', e);
      // フォールバックはレンダリング時に行う
    }
  }

  // 外部デバッグ用
  window.__ordersHistory = orders;
  window.refreshOrderHistory = function(){
    loadOrders();
    render();
  };

  // 起動
  document.addEventListener('DOMContentLoaded', init);
})();
