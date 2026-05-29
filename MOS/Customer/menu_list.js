/**
 * メニュー一覧システム
 * 
 * 機能:
 * - メニュー表示・検索・フィルタリング
 * - カート管理システム
 * - 注文管理・配膳状態追跡
 * 
 * @version 2.0.0  
 * @author POS Development Team
 */

const isStaffPage = window.location.pathname.toLowerCase().includes('/staff/');

/* ===== 設定定数 ===== */
const MENU_CONFIG = {
  STORE_ID: "001",
  DUMMY_MENU_COUNT: 12,
  QUANTITY_MAX: 10,  // 1商品あたりの最大注文数量
  API: {
    MENU_ENDPOINT: '/api/menu',
    TIMEOUT_MS: 5000
  },
  ORDER: {
    ENDPOINT: isStaffPage ? '../Customer/insert_order.php' : 'insert_order.php',
    PHP_REQUIRED_PORT: '5500'
  },
  STORAGE: {
    SEAT_KEY: 'seatId',
    CART_PREFIX: 'cart_',
    ORDERS_PREFIX: 'orders_'
  },
  UI: {
    BUTTON_MIN_SIZE: '44px',
    GRID_COLUMNS: 2
  }
};

/* ===== 状態管理 ===== */
const menuState = {
  items: [],
  cart: {},
  orders: [],
  currentSeat: null,
  isLoading: false,
  currentSortBy: 'none'  // 'none' | 'price' | 'popular'
};

/* ===== ユーティリティ関数 ===== */
const utils = {
  normalizeSeatId(input) {
    if (!input) return null;
    const normalized = String(input).trim().toUpperCase();
    return normalized;
  },

  generateStorageKey(prefix, seatId) {
    if (!seatId) return null;
    return `${prefix}${seatId}`;
  },

  safeParseJSON(jsonString, fallback = null) {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error("JSON parsing error:", error);
      return fallback;
    }
  },

  createElement(tag, className = '', content = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content) element.textContent = content;
    return element;
  },

  // XSS対策のためのエスケープ関数を追加
  escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  },

  // ローディング状態管理
  setLoadingState(isLoading) {
    menuState.isLoading = isLoading;
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = isLoading ? 'block' : 'none';
  },

  // エラー表示
  showError(message, container = null) {
    const errorContainer = container || document.body;
    const errorElement = this.createElement('div', 'error-message', message);
    errorContainer.appendChild(errorElement);
    setTimeout(() => errorElement.remove(), 5000);
  }
};

/* ===== データ管理 ===== */
const dataManager = {
  loadSeatData() {
    const seatId = localStorage.getItem(MENU_CONFIG.STORAGE.SEAT_KEY) || "C-01";
    menuState.currentSeat = utils.normalizeSeatId(seatId);
  },

  loadCart() {
    const cartKey = utils.generateStorageKey(
      MENU_CONFIG.STORAGE.CART_PREFIX, 
      menuState.currentSeat
    );
    const cartData = localStorage.getItem(cartKey);
    menuState.cart = utils.safeParseJSON(cartData, {});
    // AppState.cart と同期
    AppState.cart = { ...menuState.cart };
  },

  saveCart() {
    const cartKey = utils.generateStorageKey(
      MENU_CONFIG.STORAGE.CART_PREFIX,
      menuState.currentSeat
    );
    localStorage.setItem(cartKey, JSON.stringify(menuState.cart));
    // AppState.cart と同期
    AppState.cart = { ...menuState.cart };
  },

  loadOrders() {
    const ordersKey = utils.generateStorageKey(
      MENU_CONFIG.STORAGE.ORDERS_PREFIX,
      menuState.currentSeat  
    );
    const ordersData = localStorage.getItem(ordersKey);
    menuState.orders = utils.safeParseJSON(ordersData, []);
  },

  saveOrders() {
    const ordersKey = utils.generateStorageKey(
      MENU_CONFIG.STORAGE.ORDERS_PREFIX,
      menuState.currentSeat
    );
    localStorage.setItem(ordersKey, JSON.stringify(menuState.orders));
  }
};

/* ===== メニュー管理 ===== */
const menuManager = {
  async loadMenu() {
    menuState.isLoading = true;
    utils.setLoadingState(true);
    
    try {
      // 新しいAPI経由でメニューを取得
      let menuItems = await API.getMenuItems();
      if (!menuItems || !Array.isArray(menuItems)) {
        throw new Error('Invalid menu data returned');
      }

      // 管理画面で設定した価格や品切れ情報を反映
      const savedMenu = localStorage.getItem('customMenuItems');
      if (savedMenu) {
        const parsedMenu = utils.safeParseJSON(savedMenu, []);
        if (Array.isArray(parsedMenu)) {
          menuItems = menuItems.map(item => {
            const customItem = parsedMenu.find(c => c.id === item.id);
            return customItem ? { ...item, ...customItem } : item;
          });
        }
      }

      menuState.items = menuItems;
      
      // AppState にもメニューアイテムを保存
      AppState.menuItems = menuState.items;
      console.log('Menu loaded:', menuState.items.length, 'items');
    } catch (error) {
      console.error('Menu API error:', error);
      utils.showError('メニュー読み込みエラー: ' + error.message);
      menuState.items = [];
    } finally {
      menuState.isLoading = false;
      utils.setLoadingState(false);
    }

    // UI更新順序：1) メニュー, 2) カテゴリ, 3) ソートボタン
    try {
      uiManager.renderMenu();
      uiManager.populateCategories();
      console.log('Menu UI rendered');
    } catch (e) {
      console.error('UI render error:', e);
    }
    // ソートボタンはbindEventHandlers後に生成（イベントリスナー自体の初期化のため）
  },

  async fetchMenuFromAPI() {
    // AppState の API から取得（互換性のため保持）
    return await API.getMenuItems();
  },

  generateDummyMenu() {
    // 不要になったが、互換性のため保持
    return [];
  },

  getCategoryByIndex(index) {
    const categories = ['串もの', '揚げ物', '冷菜', '焼き物', '0円'];
    return categories[index % categories.length];
  },

  filterItems(keyword, category, sortBy = 'none') {
    let filtered = menuState.items.filter(item => {
      const matchesCategory = !category || item.category === category;
      const matchesKeyword = !keyword || 
        item.name.toLowerCase().includes(keyword.toLowerCase());
      return matchesCategory && matchesKeyword;
    });

    // ソート処理
    if (sortBy === 'price') {
      filtered = filtered.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'popular') {
      filtered = filtered.sort((a, b) => (b.popular ? 1 : 0) - (a.popular ? 1 : 0));
    }
    
    return filtered;
  }
};

/* ===== カート管理 ===== */
const cartManager = {
  addItem(itemId) {
    this.increaseQuantity(itemId); // increaseQuantityに統合
  },

  removeItem(itemId, skipConfirm = false) {
    const item = menuState.items.find(i => i.id === itemId) || AppState.menuItems?.find(i => i.id === itemId) || { name: itemId };
    if (!skipConfirm) {
      const confirmed = window.confirm(`${item.name} をカートから削除しますか？`);
      if (!confirmed) return;
    }

    delete AppState.cart[itemId];
    menuState.cart = { ...AppState.cart };
    this.saveAndRender();
  },

  increaseQuantity(itemId) {
    const currentQty = AppState.cart[itemId] || 0;
    if (currentQty < MENU_CONFIG.QUANTITY_MAX) {
      AppState.cart[itemId] = currentQty + 1;
      menuState.cart = { ...AppState.cart };
      this.saveAndRender();
    } else {
      alert(`1つの商品は最大${MENU_CONFIG.QUANTITY_MAX}個まで注文できます。`);
    }
  },

  // ★新規追加: 指定した数量をカートに追加する
  addItemWithQuantity(itemId, quantity) {
    const currentQty = AppState.cart[itemId] || 0;
    const newQty = currentQty + quantity;
    if (newQty > MENU_CONFIG.QUANTITY_MAX) {
      alert(`1つの商品は最大${MENU_CONFIG.QUANTITY_MAX}個まで注文できます。現在の数量: ${currentQty}個`);
    } else {
      AppState.cart[itemId] = newQty;
      menuState.cart = { ...AppState.cart };
      this.saveAndRender();
    }
  },

  decreaseQuantity(itemId) {
    const currentQty = AppState.cart[itemId] || 0;
    if (currentQty <= 1) {
      const item = menuState.items.find(i => i.id === itemId) || AppState.menuItems?.find(i => i.id === itemId) || { name: itemId };
      const confirmed = window.confirm(`${item.name} の数量が0になると削除されます。よろしいですか？`);
      if (!confirmed) return;
      this.removeItem(itemId, true);
    } else {
      AppState.cart[itemId] = currentQty - 1;
      menuState.cart = { ...AppState.cart };
      this.saveAndRender();
    }
  },

  getTotalItems() {
    return Object.values(AppState.cart).reduce((sum, qty) => sum + (qty || 0), 0);
  },

  getTotalPrice() {
    return Object.entries(AppState.cart).reduce((total, [itemId, qty]) => {
      const item = menuState.items.find(i => i.id === itemId) || AppState.menuItems?.find(i => i.id === itemId);
      return total + ((item?.price || 0) * qty);
    }, 0);
  },

  isEmpty() {
    return Object.keys(AppState.cart).length === 0;
  },

  clear() {
    AppState.cart = {};
    menuState.cart = {};
    this.saveAndRender();
  },

  saveAndRender() {
    dataManager.saveCart();
    uiManager.renderCart();
    // ★追加: カート操作時にメニュー一覧の個数表示も同期する
    if (typeof uiManager.updateMenuQuantities === 'function') {
      uiManager.updateMenuQuantities();
    }
  }
};

/* ===== 注文管理 ===== */
const orderManager = {
  confirmOrder() {
    if (Object.keys(AppState.cart).length === 0) {
      this.showMessage('カートが空です');
      return;
    }

    if (!AppState.canOrder) {
      this.showMessage('会計中のため注文できません');
      return;
    }

    // 注文オブジェクトを作成
    const order = {
      id: `order_${Date.now()}`,
      timestamp: new Date().toISOString(),
      items: { ...AppState.cart },
      total: AppState.getCartTotal(),
      status: 'pending',
      delivered: false
    };

    if (window.location.port === MENU_CONFIG.ORDER.PHP_REQUIRED_PORT) {
      this.showMessage('Live ServerではPHPを実行できません。Apache/XAMPPなどPHPが動く環境で開いてください。');
      return;
    }

    const orderItems = Object.entries(AppState.cart).map(([itemId, quantity]) => {
      const item = menuState.items.find(i => i.id === itemId) || AppState.menuItems?.find(i => i.id === itemId);
      // 1行あたり: 商品名×数量@単価  の形式で送信（サーバー側で qty と price を解析して金額を算出）
      const unitPrice = item?.price || 0;
      return `${item?.name || itemId}×${quantity}@${unitPrice}`;
    });

    // 結果を確認
    console.log(orderItems);

    const now = new Date();
    const pad2 = n => String(n).padStart(2, '0');
    const formattedDatetime = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    // 配列ではなく単一文字列で送信（各行で改行: 例: "ねぎま×2\n枝豆×1"）
    let orderContent = orderItems.join('\n');

    // ガード: もし他コードで配列が残っている場合は強制的に文字列化する
    // if (Array.isArray(orderContent)) {
    //   orderContent = orderContent.join('、');
    // } else if (typeof orderContent !== 'string') {
    //   orderContent = String(orderContent || '');
    // }
    console.log('orderContent (payload):', orderContent);

    fetch(MENU_CONFIG.ORDER.ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        id: order.id,
        seat_no: AppState.seatId || 'unknown',
        order_content: orderContent,
        amount: String(order.total),
        served_flag: '0',
        deleted_flag: '0',
        datetime: formattedDatetime,

        // 既存互換キー
        name: AppState.seatId || 'unknown',
        data: orderContent,
      }),
    })
      .then(async response => {
        const responseText = await response.text();
        let data = null;

        try {
          data = responseText ? JSON.parse(responseText) : null;
        } catch (parseError) {
          throw new Error(`PHPからの応答がJSONではありません: ${responseText || response.statusText}`);
        }

        if (!response.ok || !data?.success) {
          throw new Error(data?.error || `HTTP ${response.status}`);
        }

        return data;
      })
      .then(() => {
        // AppState に注文を追加
        AppState.orders.push(order);
        AppState.saveOrders();

        // カートをクリア
        AppState.clearCart();

        // UIの更新
        uiManager.renderCart();
        uiManager.renderOrderStatus();
        uiManager.hideCartDetails();
        this.showMessage('注文が確定されました');
      })
      .catch(error => {
        console.error('通信エラー:', error);
        this.showMessage(`注文の送信に失敗しました: ${error.message}`);
      });
  },

  getDeliveryStatus() {
    return menuState.orders.reduce(
      (status, order) => {
        if (order.delivered) {
          status.delivered += order.qty || 0;
        } else {
          status.pending += order.qty || 0;
        }
        return status;
      },
      { delivered: 0, pending: 0 }
    );
  },

  markAsDelivered(itemId) {
    menuState.orders = menuState.orders.map(order => 
      order.id === itemId ? { ...order, delivered: true } : order
    );
    dataManager.saveOrders();
    uiManager.renderOrderStatus();
  },

  showMessage(message) {
    if (typeof showToast === 'function') {
      showToast(message);
    } else {
      console.log('[Order]', message);
    }
  }
};

/* ===== UI管理 ===== */
const uiManager = {
  renderMenu() {
    const container = document.getElementById('menuContainer');
    if (!container) return;

    try {
      if (!menuState.items || menuState.items.length === 0) {
        container.innerHTML = '<div class="no-results">メニューを読み込んでいます...</div>';
        return;
      }

      const keyword = this.getInputValue('searchInput');
      const category = this.getActiveCategory();
      const sortBy = menuState.currentSortBy;

      // フィルタとソートを適用
      const items = menuManager.filterItems(keyword, category, sortBy);

      container.innerHTML = '';
      
      if (items.length === 0) {
        container.innerHTML = '<div class="no-results">該当するメニューが見つかりません</div>';
        return;
      }

      items.forEach(item => this.renderMenuItem(container, item));
    } catch (error) {
      console.error('Menu render error:', error);
      utils.showError('メニューの表示中にエラーが発生しました', container);
    }
  },

  renderMenuItem(container, item) {
    // AppState の soldOutItems をチェック
    const isSoldOut = AppState.soldOutItems.includes(item.id) || item.soldOut;
    
    const card = document.createElement('div');
    card.className = 'menuItem' + (isSoldOut ? ' soldOut' : '');
    card.dataset.itemId = item.id; // ★追加: 更新用にIDを保持
    
    const imgHtml = item.image ? 
      `<div style="font-size:32px;text-align:center">${item.image}</div>` : '';
    
    const priceDisplay = item.price === 0 ? '¥0（無料）' : `¥${item.price}`;
    const isOrderDisabled = !AppState.canOrder || isSoldOut;
    
    card.innerHTML = `
      ${imgHtml}
      <div class="name">${utils.escapeHtml(item.name)}</div>
      <div class="price">${priceDisplay}</div>
      
      <div class="item-actions" style="margin-top: 8px; min-height: ${MENU_CONFIG.UI.BUTTON_MIN_SIZE}"></div>
    `;
    
    container.appendChild(card);

    // ★追加: ボタンエリアの描画を実行
    this.updateItemActionUI(card, item.id, isOrderDisabled);
  },

  updateItemActionUI(card, itemId, isOrderDisabled) {
    const actionContainer = card.querySelector('.item-actions');
    if (!actionContainer) return;

    // 会計中や売り切れの場合
    if (isOrderDisabled) {
      const isSoldOut = card.classList.contains('soldOut');
      actionContainer.innerHTML = `<button disabled style="width:100%;">${isSoldOut ? '売切' : '操作不可'}</button>`;
      return;
    }

    const quantity = AppState.cart[itemId] || 0;

    if (quantity === 0) {
      const addBtn = document.createElement('button');
      addBtn.textContent = '追加';
      addBtn.style.width = '100%';
      addBtn.addEventListener('click', () => this.openItemAddModal(itemId));
      
      actionContainer.innerHTML = '';
      actionContainer.appendChild(addBtn);
    } else {
      actionContainer.innerHTML = `
        <div class="added-status" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
          <span class="qty-count" style="font-size: 16px; font-weight: bold;">${quantity} 点</span>
          <button disabled style="flex: 1; padding: 8px 0; font-size: 14px;">追加済み</button>
        </div>
      `;
    }
  },

  updateMenuQuantities() {
    const cards = document.querySelectorAll('.menuItem');
    cards.forEach(card => {
      const itemId = card.dataset.itemId;
      const isSoldOut = card.classList.contains('soldOut');
      const isOrderDisabled = !AppState.canOrder || isSoldOut;
      
      if (itemId) {
        this.updateItemActionUI(card, itemId, isOrderDisabled);
      }
    });
  },

  openItemAddModal(itemId) {
    const item = menuState.items.find(i => i.id === itemId) || AppState.menuItems?.find(i => i.id === itemId);
    if (!item) return;

    this.activeAddItemId = itemId;
    this.activeAddTriggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.currentAddQuantity = 1;
    this.activeAddUnitPrice = Number(item.price || 0);

    const nameEl = document.getElementById('itemAddModalName');
    const priceEl = document.getElementById('itemAddModalPrice');
    const qtyEl = document.getElementById('itemAddModalQty');
    const modal = document.getElementById('itemAddModal');

    if (nameEl) nameEl.textContent = item.name;
    if (qtyEl) qtyEl.textContent = String(this.currentAddQuantity);
    this.updateItemAddModalPrice();

    if (modal) {
      modal.hidden = false;
      modal.removeAttribute('aria-hidden');
      modal.removeAttribute('inert');
    }
    document.body.style.overflow = 'hidden';
  },

  closeItemAddModal() {
    const modal = document.getElementById('itemAddModal');

    if (modal && modal.contains(document.activeElement)) {
      const focusTarget = this.activeAddTriggerEl instanceof HTMLElement && document.contains(this.activeAddTriggerEl)
        ? this.activeAddTriggerEl
        : document.getElementById('miniCartToggle');

      if (focusTarget instanceof HTMLElement) {
        focusTarget.focus({ preventScroll: true });
      } else if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }

    if (modal) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      modal.setAttribute('inert', '');
    }
    document.body.style.overflow = '';
    this.activeAddItemId = null;
    this.currentAddQuantity = 1;
    this.activeAddUnitPrice = 0;
    this.activeAddTriggerEl = null;
  },

  updateItemAddModalPrice() {
    const priceEl = document.getElementById('itemAddModalPrice');
    if (!priceEl) return;

    const unitPrice = Number(this.activeAddUnitPrice || 0);
    const quantity = Number(this.currentAddQuantity || 1);
    const subtotal = unitPrice * quantity;

    if (unitPrice === 0) {
      priceEl.textContent = '¥0（無料）';
      return;
    }

    if (quantity <= 1) {
      priceEl.textContent = `¥${unitPrice.toLocaleString()}`;
      return;
    }

    priceEl.textContent = `¥${subtotal.toLocaleString()}（¥${unitPrice.toLocaleString()} × ${quantity}）`;
  },

  adjustItemAddModalQuantity(delta) {
    if (typeof this.currentAddQuantity !== 'number') {
      this.currentAddQuantity = 1;
    }
    this.currentAddQuantity = Math.max(1, Math.min(MENU_CONFIG.QUANTITY_MAX, this.currentAddQuantity + delta));

    const qtyEl = document.getElementById('itemAddModalQty');
    if (qtyEl) qtyEl.textContent = String(this.currentAddQuantity);
    this.updateItemAddModalPrice();
  },

  confirmItemAddModal() {
    if (!this.activeAddItemId) return;
    cartManager.addItemWithQuantity(this.activeAddItemId, this.currentAddQuantity || 1);
    this.closeItemAddModal();
  },

  getInputValue(id) {
    const element = document.getElementById(id);
    return element ? String(element.value).trim() : '';
  },

  getActiveCategory() {
    const activeTab = document.querySelector('.category-tab.active');
    return activeTab ? activeTab.dataset.category : '';
  },

  // populateCategories関数をタブ生成に変更
  populateCategories() {
    const tabContainer = document.getElementById('categoryTabs');
    if (!tabContainer) return;
    
    try {
      // 既存タブをクリア
      tabContainer.innerHTML = '';
      
      // 「すべて」タブを追加
      const allTab = document.createElement('button');
      allTab.className = 'category-tab active';
      allTab.textContent = 'すべて';
      allTab.dataset.category = '';
      allTab.addEventListener('click', () => this.selectCategory(allTab));
      tabContainer.appendChild(allTab);
      
      // カテゴリタブを生成
      const categories = Array.from(new Set(menuState.items.map(item => item.category))).filter(Boolean);
      
      categories.forEach(category => {
        const tab = document.createElement('button');
        tab.className = 'category-tab';
        tab.textContent = category;
        tab.dataset.category = category;
        tab.addEventListener('click', () => this.selectCategory(tab));
        tabContainer.appendChild(tab);
      });
    } catch (error) {
      console.error('カテゴリタブ生成エラー:', error);
    }
  },

  selectCategory(selectedTab) {
    // 全タブから active クラスを削除
    document.querySelectorAll('.category-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    
    // 選択されたタブに active クラスを追加
    selectedTab.classList.add('active');
    
    // メニューを再描画
    this.renderMenu();
  },

  renderCart() {
    try {
      this.updateCartSummary();
      this.updateCartDetails();
    } catch (error) {
      console.error('カート表示エラー:', error);
    }
  },

  updateCartSummary() {
    const summaryCount = document.getElementById('cartCount');
    if (summaryCount) {
      const totalItems = Object.values(AppState.cart).reduce((sum, qty) => sum + (qty || 0), 0);
      summaryCount.textContent = String(totalItems);
    }
  },

  updateCartDetails() {
    const listEl = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');
    if (!listEl || !totalEl) return;

    listEl.innerHTML = '';

    if (Object.keys(AppState.cart).length === 0) {
      listEl.innerHTML = '<li class="empty-cart">カートは空です</li>';
      totalEl.textContent = '合計: ¥0';
      return;
    }

    let totalPrice = 0;
    Object.entries(AppState.cart).forEach(([itemId, quantity]) => {
      const item = menuState.items.find(i => i.id === itemId) || AppState.menuItems?.find(i => i.id === itemId) || 
        { id: itemId, name: itemId, price: 0 };
      
      totalPrice += (item.price || 0) * quantity;
      const li = this.createCartItem(item, quantity);
      listEl.appendChild(li);
    });

    totalEl.textContent = `合計: ¥${totalPrice.toLocaleString()}`;
  },

  createCartItem(item, quantity) {
    const li = document.createElement('li');
    li.className = 'cart-item';
    
    // 商品情報
    const itemInfo = document.createElement('div');
    itemInfo.className = 'cart-item__info';
    itemInfo.innerHTML = `
      <span class="cart-item__name">${utils.escapeHtml(item.name)}</span>
      <strong class="cart-item__quantity">x${quantity}</strong>
    `;
    
    // 操作ボタン
    const controls = document.createElement('div');
    controls.className = 'cart-item__controls';
    
    const decreaseBtn = this.createCartButton('−', `減らす ${item.name}`, () => 
      cartManager.decreaseQuantity(item.id)
    );
    const increaseBtn = this.createCartButton('+', `増やす ${item.name}`, () => 
      cartManager.increaseQuantity(item.id)
    );
    const removeBtn = this.createCartButton('削除', `${item.name} を削除`, () => 
      cartManager.removeItem(item.id)
    );
    removeBtn.className = 'secondary cart-button';
    
    controls.appendChild(decreaseBtn);
    controls.appendChild(increaseBtn);
    controls.appendChild(removeBtn);
    
    li.appendChild(itemInfo);
    li.appendChild(controls);
    
    return li;
  },

  createCartButton(text, ariaLabel, onClick) {
    const button = document.createElement('button');
    button.className = 'primary cart-button';
    button.type = 'button';
    button.textContent = text;
    button.setAttribute('aria-label', ariaLabel);
    button.addEventListener('click', (e) => {
      e.preventDefault();
      onClick();
    });
    return button;
  },

  renderOrderStatus() {
    try {
      const status = orderManager.getDeliveryStatus();
      const deliveredEl = document.getElementById('deliveredCount');
      const pendingEl = document.getElementById('pendingCount');
      
      if (deliveredEl) deliveredEl.textContent = String(status.delivered);
      if (pendingEl) pendingEl.textContent = String(status.pending);
    } catch (error) {
      console.error('注文ステータス表示エラー:', error);
    }
  },

  bindEventHandlers() {
    try {
      this.bindSearchHandlers();
      this.bindCartHandlers();
      this.bindOrderHandlers();
      this.bindItemAddModalHandlers();
      
      // 「お会計」ボタン
      const checkoutBtn = document.getElementById('btnCheckout');
      if (checkoutBtn) {
        checkoutBtn.addEventListener('click', (e) => {
          e.preventDefault();
          // 会計準備中モーダルを表示
          const modal = document.getElementById('paymentPreparingModal');
          if (modal) {
            modal.removeAttribute('hidden');
            modal.removeAttribute('aria-hidden');
            // 背景スクロール禁止
            document.body.style.overflow = 'hidden';
          }
          // 会計状態を更新
          if (AppState && typeof AppState.startPaymentProcess === 'function') {
            AppState.startPaymentProcess();
          }
        });
        // 会計中は disabled
        checkoutBtn.disabled = !AppState.canOrder;
      }
      
      // ソートボタンを生成
      this.createSortButtons();
    } catch (error) {
      console.error('イベントハンドラー設定エラー:', error);
    }
  },

  bindSearchHandlers() {
    const searchInput = document.getElementById('searchInput');
    
    if (searchInput) {
      searchInput.addEventListener('input', this.debounce(() => this.renderMenu(), 300));
    }
  },

  createSortButtons() {
    const searchBar = document.querySelector('.search-bar');
    if (!searchBar) return;

    // 既存のソートボタン領域を削除
    const existingSortArea = searchBar.querySelector('.sort-buttons');
    if (existingSortArea) existingSortArea.remove();

    // ソートボタン領域を作成
    const sortArea = document.createElement('div');
    sortArea.className = 'sort-buttons';
    sortArea.style.cssText = 'display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;';
    
    const buttons = [
      { label: '標準', value: 'none' },
      { label: '安い順', value: 'price' },
      { label: '人気順', value: 'popular' }
    ];

    buttons.forEach(btn => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = btn.label;
      button.className = 'sort-btn secondary';
      button.style.cssText = `
        padding: 6px 12px;
        font-size: 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        background: #fff;
        cursor: pointer;
        transition: all 0.2s;
      `;
      
      // アクティブ状態のスタイル
      if (menuState.currentSortBy === btn.value) {
        button.style.background = '#ff7f32';
        button.style.color = '#fff';
        button.style.borderColor = '#ff7f32';
      }

      button.addEventListener('click', () => {
        menuState.currentSortBy = btn.value;
        this.renderMenu();
        this.createSortButtons();  // ボタンの見た目を更新
      });

      sortArea.appendChild(button);
    });

    searchBar.appendChild(sortArea);
  },

  bindCartHandlers() {
    const toggleBtn = document.getElementById('miniCartToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleCartDetails());
    }
  },

  bindOrderHandlers() {
    const confirmBtn = document.getElementById('confirmOrder');
    
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => orderManager.confirmOrder());
    }
  },

  bindItemAddModalHandlers() {
    const plusBtn = document.getElementById('itemAddModalPlus');
    const minusBtn = document.getElementById('itemAddModalMinus');
    const confirmBtn = document.getElementById('confirmItemAdd');
    const cancelBtn = document.getElementById('cancelItemAdd');
    const backdrop = document.getElementById('itemAddModalBackdrop');
    const modal = document.getElementById('itemAddModal');

    if (plusBtn) {
      plusBtn.addEventListener('click', () => this.adjustItemAddModalQuantity(1));
    }
    if (minusBtn) {
      minusBtn.addEventListener('click', () => this.adjustItemAddModalQuantity(-1));
    }
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.confirmItemAddModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeItemAddModal());
    }
    if (backdrop) {
      backdrop.addEventListener('click', () => this.closeItemAddModal());
    }
    if (modal) {
      modal.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          this.closeItemAddModal();
        }
      });
    }
  },

  toggleCartDetails() {
    const details = document.getElementById('miniCartDetails');
    const toggle = document.getElementById('miniCartToggle');
    if (!details || !toggle) return;

    const isHidden = details.hidden;
    if (isHidden) {
      details.hidden = false;
      details.removeAttribute('aria-hidden');
      details.removeAttribute('inert');
      toggle.textContent = '閉じる';
      this.renderCart();
      return;
    }

    // フォーカスが中に残ったまま aria-hidden を付けないよう、先に外へ逃がす
    if (details.contains(document.activeElement)) {
      toggle.focus({ preventScroll: true });
    }

    details.hidden = true;
    details.setAttribute('aria-hidden', 'true');
    details.setAttribute('inert', '');
    toggle.textContent = '表示';
  },

  hideCartDetails() {
    const details = document.getElementById('miniCartDetails');
    const toggle = document.getElementById('miniCartToggle');
    if (details && toggle) {
      if (details.contains(document.activeElement)) {
        toggle.focus({ preventScroll: true });
      }
      details.hidden = true;
      details.setAttribute('aria-hidden', 'true');
      details.setAttribute('inert', '');
      toggle.textContent = '表示';
    }
  },

  // デバウンス関数（検索入力の最適化）
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
};

/* ===== 初期化 ===== */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // メニューロード＆初期化
    await menuManager.loadMenu();
    
    // 売切アイテムを AppState に設定
    const apiSoldOut = await API.getSoldOutItems();
    const localSoldOut = utils.safeParseJSON(localStorage.getItem('soldOutItems'), null);
    AppState.soldOutItems = localSoldOut || apiSoldOut || [];
    
    uiManager.bindEventHandlers();
    uiManager.renderCart();
    uiManager.renderOrderStatus();
    
    // 外部依存の初期化
    if (typeof startClock === 'function') {
      startClock();
    }
  } catch (error) {
    console.error('Menu app initialization failed:', error);
  }
});

/* ===== 外部API ===== */
window.markDelivered = orderManager.markAsDelivered.bind(orderManager);
