/**
 * スタッフ用注文管理システム（staff_orders.js）
 * 
 * 機能:
 * - 全座席の注文一覧表示
 * - 商品単位での配膳状態管理
 * - Immutable な状態更新
 * - 座席別グルーピング表示
 * 
 * @version 2.0.0
 * @author POS Development Team
 */

/* ===== IIFE パターンでグローバル汚染を回避 ===== */
const StaffOrdersModule = (() => {
  /* ===== 設定定数 ===== */
  const CONFIG = {
    STORE_ID: "001",
    POLLING_INTERVAL_MS: 5000,
    STORAGE_PREFIX: 'staff_orders_',
    ANIMATION_DURATION_MS: 200,
    BULK_SELECTION_THRESHOLD: 3,
    
    // 配膳状態の定義
    DELIVERY_STATUS: {
      PENDING: 'pending',           // 未配膳
      IN_PROGRESS: 'in-progress',   // 配膳中
      DELIVERED: 'delivered'        // 配膳済み
    },
    
    // 優先度レベルの定義（未配膳商品数で自動判定）
    PRIORITY_LEVELS: {
      CRITICAL: { min: 5, emoji: '🔴', label: '緊急', color: '#ef4444' },      // 5件以上
      HIGH: { min: 3, emoji: '🟠', label: '高', color: '#f59e0b' },            // 3～4件
      MEDIUM: { min: 1, emoji: '🟡', label: '中', color: '#fbbf24' },          // 1～2件
      LOW: { min: 0, emoji: '🟢', label: '低', color: '#10b981' }              // 完了
    },
    
    // 色定義（顧客画面と統一）
    COLORS: {
      PRIMARY: '#ff7f32',
      SUCCESS: '#10b981',
      WARNING: '#f59e0b',
      ALERT: '#ef4444',
      INFO: '#3b82f6',
      BACKGROUND: '#fff8f0'
    }
  };

  /* ===== 内部状態管理 ===== */
  const state = {
    // マスターデータ
    allOrders: [],              // サーバから取得した全注文
    ordersByStatus: {
      pending: [],
      'in-progress': [],
      delivered: []
    },
    
    // UI状態
    currentFilter: 'all',           // all | pending | in-progress | delivered
    currentSort: 'priority-desc',   // ★ デフォルト：未配膳商品数が多い順
    viewMode: 'compact',            // compact | detailed
    selectedItems: new Set(),       // 選択中の商品IDs
    isPolling: false,
    lastPolledAt: null,
    
    // エラーハンドリング
    lastError: null,
    retryCount: 0,
    maxRetries: 3
  };

  /* ===== ユーティリティ関数 ===== */
  const utils = {
    /**
     * 座席IDを正規化
     * @param {string} input - 入力座席ID
     * @returns {string|null} 正規化された座席ID
     */
    normalizeSeatId(input) {
      if (!input) return null;
      const normalized = String(input).trim().toUpperCase();
      const match = normalized.match(/^([A-Z])[-\s]?(\d{1,2})$/);
      return match ? `${match[1]}-${String(parseInt(match[2], 10)).padStart(2, '0')}` : null;
    },

    /**
     * 座席の未配膳商品数を計算（純粋関数）
     * @param {Array} orders - 注文配列
     * @param {string} seatId - 座席ID
     * @returns {number} 未配膳商品数
     */
    calculateUndeliveredCount(orders, seatId) {
      return orders
        .filter(order => order.seatId === seatId)
        .reduce((sum, order) => sum + order.items.filter(item => !item.delivered).length, 0);
    },

    /**
     * 座席の優先度レベルを判定（純粋関数）
     * @param {number} undeliveredCount - 未配膳商品数
     * @returns {Object} 優先度レベルオブジェクト
     */
    getPriorityLevel(undeliveredCount) {
      if (undeliveredCount >= CONFIG.PRIORITY_LEVELS.CRITICAL.min) {
        return CONFIG.PRIORITY_LEVELS.CRITICAL;
      } else if (undeliveredCount >= CONFIG.PRIORITY_LEVELS.HIGH.min) {
        return CONFIG.PRIORITY_LEVELS.HIGH;
      } else if (undeliveredCount >= CONFIG.PRIORITY_LEVELS.MEDIUM.min) {
        return CONFIG.PRIORITY_LEVELS.MEDIUM;
      } else {
        return CONFIG.PRIORITY_LEVELS.LOW;
      }
    },

    /**
     * 注文IDを生成
     * @param {string} seatId - 座席ID
     * @param {number} index - インデックス
     * @returns {string} 注文ID
     */
    generateOrderId(seatId, index) {
      return `order_${seatId}_${index}_${Date.now()}`;
    },

    /**
     * 商品IDを生成
     * @param {string} orderId - 注文ID
     * @param {number} index - インデックス
     * @returns {string} 商品ID
     */
    generateProductId(orderId, index) {
      return `${orderId}_product_${index}`;
    },

    /**
     * 時刻フォーマット
     * @param {string} isoString - ISO 8601形式の文字列
     * @returns {string} HH:MM形式
     */
    formatTime(isoString) {
      const date = new Date(isoString);
      return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    },

    /**
     * 経過時間を計算
     * @param {string} isoString - ISO 8601形式の文字列
     * @returns {string} "5分前"形式
     */
    formatElapsedTime(isoString) {
      const date = new Date(isoString);
      const now = new Date();
      const elapsedSeconds = Math.floor((now - date) / 1000);
      
      if (elapsedSeconds < 60) return `${elapsedSeconds}秒前`;
      const minutes = Math.floor(elapsedSeconds / 60);
      if (minutes < 60) return `${minutes}分前`;
      const hours = Math.floor(minutes / 60);
      return `${hours}時間前`;
    },

    /**
     * XSS対策：HTMLをエスケープ
     * @param {string} text - エスケープ対象テキスト
     * @returns {string} エスケープ済みテキスト
     */
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },

    /**
     * 座席IDでグループ化（純粋関数）
     * @param {Array} orders - 注文配列
     * @returns {Object} 座席別グループ
     */
    groupBySeat(orders) {
      return orders.reduce((acc, order) => {
        const seatId = order.seatId;
        if (!acc[seatId]) {
          acc[seatId] = [];
        }
        acc[seatId].push(order);
        return acc;
      }, {});
    },

    /**
     * 配膳状態でグループ化（純粋関数）
     * @param {Array} orders - 注文配列
     * @returns {Object} ステータス別グループ
     */
    groupByStatus(orders) {
      return orders.reduce((acc, order) => {
        // 注文内の全商品の配膳状態を確認
        const itemStatuses = order.items.map(item => item.delivered);
        
        let orderStatus;
        if (itemStatuses.every(d => d)) {
          orderStatus = CONFIG.DELIVERY_STATUS.DELIVERED;
        } else if (itemStatuses.some(d => d)) {
          orderStatus = CONFIG.DELIVERY_STATUS.IN_PROGRESS;
        } else {
          orderStatus = CONFIG.DELIVERY_STATUS.PENDING;
        }

        if (!acc[orderStatus]) {
          acc[orderStatus] = [];
        }
        acc[orderStatus].push(order);
        return acc;
      }, {});
    },

    /**
     * 注文をソート（純粋関数）
     * ★ 新規：未配膳商品数優先度順を追加
     * @param {Array} orders - 注文配列
     * @param {string} sortOrder - ソート順序
     * @returns {Array} ソート済み配列
     */
    sortOrders(orders, sortOrder) {
      const sorted = [...orders];
      
      switch (sortOrder) {
        case 'priority-desc':
          // ★ 新規：未配膳商品数が多い順（デフォルト）
          return sorted.sort((a, b) => {
            const aUndelivered = a.items.filter(item => !item.delivered).length;
            const bUndelivered = b.items.filter(item => !item.delivered).length;
            // 多い順 → 小さい順
            return bUndelivered - aUndelivered;
          });
        case 'priority-asc':
          // ★ 新規：未配膳商品数が少ない順
          return sorted.sort((a, b) => {
            const aUndelivered = a.items.filter(item => !item.delivered).length;
            const bUndelivered = b.items.filter(item => !item.delivered).length;
            return aUndelivered - bUndelivered;
          });
        case 'seat-asc':
          return sorted.sort((a, b) => a.seatId.localeCompare(b.seatId));
        case 'seat-desc':
          return sorted.sort((a, b) => b.seatId.localeCompare(a.seatId));
        case 'time-newest':
          return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        case 'time-oldest':
          return sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        default:
          return sorted;
      }
    },

    /**
     * フィルタリング（純粋関数）
     * @param {Array} orders - 注文配列
     * @param {string} filter - フィルタ条件
     * @returns {Array} フィルタ済み配列
     */
    filterOrders(orders, filter) {
      if (filter === 'all') return orders;
      
      return orders.filter(order => {
        const itemStatuses = order.items.map(item => item.delivered);
        
        switch (filter) {
          case 'pending':
            return itemStatuses.every(d => !d);
          case 'in-progress':
            return itemStatuses.some(d => d) && !itemStatuses.every(d => d);
          case 'delivered':
            return itemStatuses.every(d => d);
          default:
            return true;
        }
      });
    }
  };

  /* ===== データ管理 ===== */
  const dataManager = {
    /**
     * ダミーデータを生成（API未実装時用）
     * @returns {Array} ダミー注文配列
     */
    generateDummyOrders() {
      const seats = ['A-01', 'B-02', 'C-05', 'C-06', 'D-03'];
      const products = [
        { name: 'ねぎま', quantity: 2, price: 280 },
        { name: '唐揚げ', quantity: 1, price: 590 },
        { name: 'つくね', quantity: 3, price: 280 },
        { name: '枝豆', quantity: 1, price: 390 },
        { name: 'ポテトサラダ', quantity: 1, price: 420 }
      ];

      const orders = [];
      let orderIndex = 1;

      seats.forEach(seatId => {
        const numOrders = Math.floor(Math.random() * 3) + 1;
        
        for (let i = 0; i < numOrders; i++) {
          const itemCount = Math.floor(Math.random() * 3) + 1;
          const items = [];
          
          for (let j = 0; j < itemCount; j++) {
            const product = products[Math.floor(Math.random() * products.length)];
            items.push({
              id: `product_${orderIndex}_${j}`,
              name: product.name,
              quantity: product.quantity,
              price: product.price,
              delivered: Math.random() > 0.6  // 40%の確度で配膳済み
            });
          }

          const createdAt = new Date(Date.now() - Math.random() * 3600000).toISOString();
          orders.push({
            orderId: `order_${orderIndex}`,
            seatId,
            items,
            createdAt,
            total: items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
          });

          orderIndex++;
        }
      });

      return orders;
    },

    /**
     * 注文データをローカルに保存（キャッシュ）
     * @param {Array} orders - 注文配列
     */
    cacheOrders(orders) {
      try {
        const cacheKey = `${CONFIG.STORAGE_PREFIX}cached_orders`;
        localStorage.setItem(cacheKey, JSON.stringify({
          orders,
          cachedAt: new Date().toISOString()
        }));
      } catch (error) {
        console.warn('Failed to cache orders:', error);
      }
    },

    /**
     * キャッシュから注文データを読み込み
     * @returns {Array|null} キャッシュされた注文配列
     */
    loadCachedOrders() {
      try {
        const cacheKey = `${CONFIG.STORAGE_PREFIX}cached_orders`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const { orders } = JSON.parse(cached);
          return orders;
        }
      } catch (error) {
        console.warn('Failed to load cached orders:', error);
      }
      return null;
    }
  };

  /* ===== 状態更新（Immutable パターン） ===== */
  const stateManager = {
    /**
     * 注文データを設定（マスターデータ）
     * @param {Array} orders - 新しい注文配列
     */
    setAllOrders(orders) {
      state.allOrders = [...orders];  // Immutable copy
      state.ordersByStatus = utils.groupByStatus(orders);
    },

    /**
     * 商品の配膳状態を更新（Immutable）
     * @param {string} orderId - 注文ID
     * @param {string} productId - 商品ID
     * @param {boolean} delivered - 配膳済みフラグ
     * @returns {Array} 更新後の注文配列
     */
    updateProductDeliveryStatus(orderId, productId, delivered) {
      // 新しい配列を生成（元の配列は変更しない）
      const updatedOrders = state.allOrders.map(order => {
        if (order.orderId === orderId) {
          return {
            ...order,  // 浅いコピー
            items: order.items.map(item => {
              if (item.id === productId) {
                return { ...item, delivered };  // 商品を更新
              }
              return item;
            })
          };
        }
        return order;
      });

      state.allOrders = updatedOrders;
      state.ordersByStatus = utils.groupByStatus(updatedOrders);
      
      return updatedOrders;
    },

    /**
     * 複数商品の配膳状態を一括更新（Immutable）
     * @param {Array} productIds - 商品IDの配列
     * @param {boolean} delivered - 配膳済みフラグ
     * @returns {Array} 更新後の注文配列
     */
    bulkUpdateDeliveryStatus(productIds, delivered) {
      const productIdSet = new Set(productIds);

      const updatedOrders = state.allOrders.map(order => {
        const hasProductToUpdate = order.items.some(item => productIdSet.has(item.id));
        
        if (hasProductToUpdate) {
          return {
            ...order,
            items: order.items.map(item => {
              if (productIdSet.has(item.id)) {
                return { ...item, delivered };
              }
              return item;
            })
          };
        }
        return order;
      });

      state.allOrders = updatedOrders;
      state.ordersByStatus = utils.groupByStatus(updatedOrders);
      
      return updatedOrders;
    },

    /**
     * フィルタとソートを適用した注文を取得
     * @returns {Array} 処理済み注文配列
     */
    getFilteredAndSortedOrders() {
      const filtered = utils.filterOrders(state.allOrders, state.currentFilter);
      return utils.sortOrders(filtered, state.currentSort);
    },

    /**
     * フィルタを変更
     * @param {string} filter - フィルタ条件
     */
    setFilter(filter) {
      state.currentFilter = filter;
    },

    /**
     * ソート順序を変更
     * @param {string} sort - ソート順序
     */
    setSort(sort) {
      state.currentSort = sort;
    },

    /**
     * ビューモードを変更
     * @param {string} mode - ビューモード
     */
    setViewMode(mode) {
      state.viewMode = mode;
    },

    /**
     * 選択状態を切り替え
     * @param {string} productId - 商品ID
     */
    toggleSelection(productId) {
      if (state.selectedItems.has(productId)) {
        state.selectedItems.delete(productId);
      } else {
        state.selectedItems.add(productId);
      }
    },

    /**
     * すべての選択をクリア
     */
    clearSelection() {
      state.selectedItems.clear();
    },

    /**
     * 選択中の商品数を取得
     * @returns {number} 選択中の商品数
     */
    getSelectedCount() {
      return state.selectedItems.size;
    },

    /**
     * ポーリング状態を更新
     */
    setPollingState(isPolling) {
      state.isPolling = isPolling;
      state.lastPolledAt = new Date().toISOString();
    }
  };

  /* ===== UI レンダリング ===== */
  const uiRenderer = {
    /**
     * 注文一覧を再描画
     */
    renderOrders() {
      const container = document.getElementById('ordersContainer');
      if (!container) return;

      // ★ 座席ごとにグルーピング
      const groupedBySeat = utils.groupBySeat(state.allOrders);
      
      // ★ 座席別の未配膳商品数で並べ替え
      const sortedSeats = Object.entries(groupedBySeat)
        .sort(([seatIdA, ordersA], [seatIdB, ordersB]) => {
          const undeliveredA = ordersA.reduce((sum, order) => 
            sum + order.items.filter(item => !item.delivered).length, 0
          );
          const undeliveredB = ordersB.reduce((sum, order) => 
            sum + order.items.filter(item => !item.delivered).length, 0
          );
          return undeliveredB - undeliveredA;  // 多い順
        });

      // フィルタを適用
      const filtered = utils.filterOrders(state.allOrders, state.currentFilter);
      
      if (filtered.length === 0) {
        this.showEmptyState();
        return;
      }

      const html = sortedSeats
        .map(([seatId, seatOrders]) => {
          // この座席のフィルタ後の注文のみを使用
          const filteredSeatOrders = seatOrders.filter(order => 
            filtered.some(f => f.orderId === order.orderId)
          );
          
          if (filteredSeatOrders.length === 0) return '';
          
          return this.renderSeatGroup(seatId, filteredSeatOrders);
        })
        .filter(html => html !== '')  // 空文字列を除外
        .join('');

      container.querySelector('#seatGroupsContainer').innerHTML = html;
      this.attachEventListeners();
    },

    /**
     * 座席グループをレンダリング
     * ★ 修正：優先度インジケータと進捗度バーを追加
     * @param {string} seatId - 座席ID
     * @param {Array} orders - 座席の注文配列
     * @returns {string} HTML文字列
     */
    renderSeatGroup(seatId, orders) {
      const totalItems = orders.reduce((sum, order) => sum + order.items.length, 0);
      const deliveredItems = orders.reduce((sum, order) => 
        sum + order.items.filter(item => item.delivered).length, 0
      );
      const undeliveredItems = totalItems - deliveredItems;

      // ★ その座席全体の優先度を計算
      const priorityLevel = utils.getPriorityLevel(undeliveredItems);
      const progressPercent = totalItems > 0 ? Math.round((deliveredItems / totalItems) * 100) : 100;

      const statusBadge = this.getStatusBadge(deliveredItems, totalItems);

      // ヘッダー
      let html = `
        <section class="seat-group" data-seat-id="${utils.escapeHtml(seatId)}" data-priority="${priorityLevel.label}">
          <div class="seat-group__header">
            <!-- ★ 優先度インジケータ -->
            <div class="seat-group__priority-indicator" title="優先度: ${priorityLevel.label}" style="color: ${priorityLevel.color}">
              <span class="priority-emoji">${priorityLevel.emoji}</span>
              <span class="priority-label">${priorityLevel.label}</span>
            </div>

            <h2 class="seat-group__title">
              <span class="seat-id">${utils.escapeHtml(seatId)}</span>
              <span class="order-count" title="${totalItems}件の商品">${totalItems}件</span>
            </h2>
            <div class="seat-group__status">
              ${statusBadge}
              <span class="delivery-progress">
                ${deliveredItems}/${totalItems}
                ${undeliveredItems > 0 ? ` <span class="undelivered-badge">${undeliveredItems}件未配膳</span>` : ''}
              </span>
            </div>
          </div>

          <!-- ★ 進捗度バー -->
          <div class="seat-group__progress-bar" role="progressbar" aria-valuenow="${progressPercent}" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-bar__filled" style="width: ${progressPercent}%; background-color: ${priorityLevel.color};"></div>
            <span class="progress-bar__text">${progressPercent}%</span>
          </div>

          <div class="seat-group__orders">
      `;

      // 各注文をレンダリング
      orders.forEach(order => {
        html += this.renderOrderItem(order);
      });

      html += `
          </div>
        </section>
      `;

      return html;
    },

    /**
     * 注文アイテムをレンダリング
     * @param {Object} order - 注文オブジェクト
     * @returns {string} HTML文字列
     */
    renderOrderItem(order) {
      const { orderId, createdAt, items } = order;
      const formattedTime = utils.formatTime(createdAt);
      const elapsedTime = utils.formatElapsedTime(createdAt);

      let html = `
        <article class="order-item" data-order-id="${utils.escapeHtml(orderId)}">
          <div class="order-item__header">
            <span class="order-number">注文 #${orderId.split('_').pop().substring(0, 3)}</span>
            <span class="order-time" title="${utils.escapeHtml(formattedTime)}">
              ${utils.escapeHtml(elapsedTime)}
            </span>
          </div>
          <ul class="order-item__products">
      `;

      items.forEach((item, index) => {
        html += this.renderProductItem(orderId, item, index);
      });

      html += `
          </ul>
        </article>
      `;

      return html;
    },

    /**
     * 商品行をレンダリング
     * @param {string} orderId - 注文ID
     * @param {Object} item - 商品オブジェクト
     * @param {number} index - インデックス
     * @returns {string} HTML文字列
     */
    renderProductItem(orderId, item, index) {
      const productId = item.id;
      const isSelected = state.selectedItems.has(productId);
      const checkboxClass = isSelected ? 'checked' : '';
      const rowClass = item.delivered ? 'delivered' : 'pending';
      const statusLabel = item.delivered ? '配膳済み' : '未配膳';

      return `
        <li class="product-item ${rowClass}" data-product-id="${utils.escapeHtml(productId)}">
          <label class="product-checkbox">
            <input type="checkbox" 
                   data-product-id="${utils.escapeHtml(productId)}"
                   data-order-id="${utils.escapeHtml(orderId)}"
                   ${isSelected ? 'checked' : ''}
                   aria-label="${utils.escapeHtml(item.name)} の配膳状態を切り替え">
            <span class="product-checkmark"></span>
          </label>
          
          <div class="product-info">
            <span class="product-name">${utils.escapeHtml(item.name)}</span>
            <span class="product-quantity">× ${item.quantity}</span>
          </div>

          <div class="product-status">
            <span class="status-badge ${item.delivered ? 'success' : 'warning'}">
              ${statusLabel}
            </span>
          </div>

          <div class="product-actions">
            <button class="status-toggle" 
                    data-product-id="${utils.escapeHtml(productId)}"
                    data-order-id="${utils.escapeHtml(orderId)}"
                    data-delivered="${item.delivered}"
                    type="button"
                    aria-label="${utils.escapeHtml(item.name)}の配膳完了切り替え">
              ${item.delivered ? '戻す' : '完了'}
            </button>
          </div>
        </li>
      `;
    },

    /**
     * ステータスバッジを生成
     * @param {number} delivered - 配膳済み数
     * @param {number} total - 合計数
     * @returns {string} HTML文字列
     */
    getStatusBadge(delivered, total) {
      if (delivered === total) {
        return '<span class="badge badge--success">配膳済み</span>';
      } else if (delivered > 0) {
        return '<span class="badge badge--warning">配膳中</span>';
      } else {
        return '<span class="badge badge--pending">未配膳</span>';
      }
    },

    /**
     * 空状態を表示
     */
    showEmptyState() {
      const container = document.getElementById('ordersContainer');
      if (!container) return;

      const emptyState = container.querySelector('#emptyState');
      if (emptyState) {
        emptyState.removeAttribute('hidden');
        emptyState.removeAttribute('aria-hidden');
      }

      container.querySelector('#seatGroupsContainer').innerHTML = '';
    },

    /**
     * ローディング状態を表示
     */
    showLoadingState() {
      const container = document.getElementById('ordersContainer');
      if (!container) return;

      const loadingState = container.querySelector('#loadingState');
      if (loadingState) {
        loadingState.removeAttribute('hidden');
        loadingState.removeAttribute('aria-hidden');
      }
    },

    /**
     * ローディング状態を非表示
     */
    hideLoadingState() {
      const container = document.getElementById('ordersContainer');
      if (!container) return;

      const loadingState = container.querySelector('#loadingState');
      if (loadingState) {
        loadingState.setAttribute('hidden', '');
        loadingState.setAttribute('aria-hidden', 'true');
      }
    },

    /**
     * エラー状態を表示
     * @param {string} message - エラーメッセージ
     */
    showErrorState(message) {
      const container = document.getElementById('ordersContainer');
      if (!container) return;

      const errorState = container.querySelector('#errorState');
      const errorMessage = container.querySelector('#errorMessage');
      
      if (errorState && errorMessage) {
        errorMessage.textContent = message;
        errorState.removeAttribute('hidden');
        errorState.removeAttribute('aria-hidden');
      }
    },

    /**
     * 批量操作パネルを更新
     */
    updateBulkActionsPanel() {
      const panel = document.getElementById('bulkActionsPanel');
      const selectedCount = stateManager.getSelectedCount();

      if (selectedCount === 0) {
        panel.setAttribute('hidden', '');
        panel.setAttribute('aria-hidden', 'true');
      } else {
        panel.removeAttribute('hidden');
        panel.removeAttribute('aria-hidden');
        const countSpan = panel.querySelector('#selectedCount');
        if (countSpan) {
          countSpan.textContent = `${selectedCount}件 選択中`;
        }
      }
    },

    /**
     * 同期ステータスを更新
     */
    updateSyncStatus() {
      const syncStatus = document.getElementById('syncStatus');
      if (!syncStatus) return;

      const now = new Date();
      const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      const indicator = syncStatus.querySelector('.sync-indicator');

      if (state.isPolling) {
        indicator?.classList.add('polling');
      } else {
        indicator?.classList.remove('polling');
      }

      syncStatus.textContent = `最終更新: ${timeStr}`;
    },

    /**
     * イベントリスナーを設定
     */
    attachEventListeners() {
      const container = document.getElementById('ordersContainer');
      if (!container) return;

      // 商品チェックボックス
      container.querySelectorAll('.product-checkbox input').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
          const productId = e.target.dataset.productId;
          stateManager.toggleSelection(productId);
          this.updateBulkActionsPanel();
          // チェックボックス視覚的フィードバック
          e.target.closest('.product-item')?.classList.toggle('selected');
        });
      });

      // ステータス切り替えボタン
      container.querySelectorAll('.status-toggle').forEach(button => {
        button.addEventListener('click', (e) => {
          const productId = e.currentTarget.dataset.productId;
          const orderId = e.currentTarget.dataset.orderId;
          const currentDelivered = e.currentTarget.dataset.delivered === 'true';
          
          stateManager.updateProductDeliveryStatus(orderId, productId, !currentDelivered);
          uiRenderer.renderOrders();
          
          // 最終更新時刻を更新
          stateManager.setPollingState(false);
          uiRenderer.updateSyncStatus();
        });
      });
    }
  };

  /* ===== 初期化と公開API ===== */
  return {
    /**
     * モジュール初期化
     */
    init() {
      console.log('[StaffOrdersModule] Initializing...');
      
      // ダミーデータを読み込み
      const dummyOrders = dataManager.generateDummyOrders();
      stateManager.setAllOrders(dummyOrders);
      dataManager.cacheOrders(dummyOrders);

      // UI を初期描画
      uiRenderer.renderOrders();
      uiRenderer.updateSyncStatus();

      // イベントリスナー設定
      this.setupEventListeners();

      console.log('[StaffOrdersModule] Initialized with', dummyOrders.length, 'orders');
    },

    /**
     * グローバルイベントリスナー設定
     */
    setupEventListeners() {
      // 更新ボタン
      const refreshBtn = document.getElementById('refreshBtn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => this.refreshOrders());
      }

      // フィルタ
      const statusFilter = document.getElementById('statusFilter');
      if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
          stateManager.setFilter(e.target.value);
          uiRenderer.renderOrders();
        });
      }

      // ソート
      const sortOrder = document.getElementById('sortOrder');
      if (sortOrder) {
        sortOrder.addEventListener('change', (e) => {
          stateManager.setSort(e.target.value);
          uiRenderer.renderOrders();
        });
      }

      // ビューモード切り替え
      const viewModeToggle = document.getElementById('viewModeToggle');
      if (viewModeToggle) {
        viewModeToggle.addEventListener('click', () => {
          const newMode = state.viewMode === 'compact' ? 'detailed' : 'compact';
          stateManager.setViewMode(newMode);
          viewModeToggle.textContent = newMode === 'compact' ? '📋 コンパクト' : '📄 詳細';
          viewModeToggle.dataset.mode = newMode;
          // CSS クラスは将来的に追加
        });
      }

      // 批量操作ボタン
      const markDeliveredBtn = document.getElementById('markDeliveredBtn');
      if (markDeliveredBtn) {
        markDeliveredBtn.addEventListener('click', () => {
          const selectedIds = Array.from(state.selectedItems);
          stateManager.bulkUpdateDeliveryStatus(selectedIds, true);
          stateManager.clearSelection();
          uiRenderer.renderOrders();
          uiRenderer.updateBulkActionsPanel();
        });
      }

      const markPendingBtn = document.getElementById('markPendingBtn');
      if (markPendingBtn) {
        markPendingBtn.addEventListener('click', () => {
          const selectedIds = Array.from(state.selectedItems);
          stateManager.bulkUpdateDeliveryStatus(selectedIds, false);
          stateManager.clearSelection();
          uiRenderer.renderOrders();
          uiRenderer.updateBulkActionsPanel();
        });
      }

      const clearSelectionBtn = document.getElementById('clearSelectionBtn');
      if (clearSelectionBtn) {
        clearSelectionBtn.addEventListener('click', () => {
          stateManager.clearSelection();
          uiRenderer.renderOrders();
          uiRenderer.updateBulkActionsPanel();
        });
      }

      // ホットキー（将来実装）
      this.setupHotkeys();
    },

    /**
     * ホットキー設定（将来実装）
     */
    setupHotkeys() {
      document.addEventListener('keydown', (e) => {
        // Ctrl+R / Cmd+R で更新
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
          e.preventDefault();
          this.refreshOrders();
        }
        // Escape で選択クリア
        if (e.key === 'Escape') {
          stateManager.clearSelection();
          uiRenderer.updateBulkActionsPanel();
        }
      });
    },

    /**
     * 注文データを更新（API または キャッシュから）
     */
    async refreshOrders() {
      try {
        uiRenderer.showLoadingState();
        stateManager.setPollingState(true);

        // 将来的には API から取得
        // const orders = await fetchOrdersFromAPI();
        // ここではダミーデータから再生成
        await new Promise(resolve => setTimeout(resolve, 500));  // 模擬遅延
        
        const orders = dataManager.generateDummyOrders();
        stateManager.setAllOrders(orders);
        dataManager.cacheOrders(orders);

        uiRenderer.hideLoadingState();
        uiRenderer.renderOrders();
        uiRenderer.updateSyncStatus();

        state.retryCount = 0;
      } catch (error) {
        console.error('[StaffOrdersModule] Error refreshing orders:', error);
        
        state.retryCount++;
        if (state.retryCount <= state.maxRetries) {
          uiRenderer.showErrorState(`エラーが発生しました（再試行 ${state.retryCount}/${state.maxRetries}）`);
        } else {
          uiRenderer.showErrorState('注文データの取得に失敗しました。キャッシュを表示しています。');
          // キャッシュから復元
          const cached = dataManager.loadCachedOrders();
          if (cached) {
            stateManager.setAllOrders(cached);
            uiRenderer.renderOrders();
          }
        }
      } finally {
        stateManager.setPollingState(false);
      }
    },

    /**
     * 注文データを外部から設定（API統合用）
     * @param {Array} orders - 注文配列
     */
    setOrders(orders) {
      stateManager.setAllOrders(orders);
      dataManager.cacheOrders(orders);
      uiRenderer.renderOrders();
    },

    /**
     * 現在の状態を取得（デバッグ用）
     */
    getState() {
      return {
        allOrders: state.allOrders,
        currentFilter: state.currentFilter,
        currentSort: state.currentSort,
        selectedItems: Array.from(state.selectedItems),
        isPolling: state.isPolling
      };
    }
  };
})();

/* ===== DOMContentLoaded で初期化 ===== */
document.addEventListener('DOMContentLoaded', () => {
  StaffOrdersModule.init();
});
