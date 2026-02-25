(() => {
  const STORAGE_KEY = 'yp_shortlist_v1';
  const MAX_ITEMS = 12;

  function normalizeProduct(raw) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const id = String(raw.id || '').trim();
    const name = String(raw.name || '').trim();
    const slug = String(raw.slug || '').trim();
    const categoryName = String(raw.categoryName || '').trim();

    if (!id || !name || !slug) {
      return null;
    }

    return { id, name, slug, categoryName };
  }

  function dedupe(items) {
    const seen = new Set();
    const out = [];

    for (const rawItem of items) {
      const item = normalizeProduct(rawItem);
      if (!item || seen.has(item.id)) {
        continue;
      }
      seen.add(item.id);
      out.push(item);
    }

    return out.slice(0, MAX_ITEMS);
  }

  function readItems() {
    try {
      const payload = localStorage.getItem(STORAGE_KEY);
      if (!payload) {
        return [];
      }
      const parsed = JSON.parse(payload);
      return Array.isArray(parsed) ? dedupe(parsed) : [];
    } catch (error) {
      console.warn('Could not read shortlist from localStorage:', error);
      return [];
    }
  }

  function emitChange(items) {
    window.dispatchEvent(
      new CustomEvent('yp:shortlist-changed', {
        detail: {
          items: [...items],
          count: items.length,
          max: MAX_ITEMS,
        },
      })
    );
  }

  function writeItems(items) {
    const safeItems = dedupe(items);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeItems));
    emitChange(safeItems);
    return safeItems;
  }

  function getItems() {
    return readItems();
  }

  function count() {
    return readItems().length;
  }

  function isSelected(productId) {
    const id = String(productId || '').trim();
    if (!id) {
      return false;
    }
    return readItems().some((item) => item.id === id);
  }

  function add(product) {
    const item = normalizeProduct(product);
    if (!item) {
      return { ok: false, error: 'invalid_product', items: readItems() };
    }

    const items = readItems();
    if (items.some((existingItem) => existingItem.id === item.id)) {
      return { ok: true, added: false, items };
    }

    if (items.length >= MAX_ITEMS) {
      return { ok: false, error: 'max_reached', items };
    }

    const nextItems = writeItems([...items, item]);
    return { ok: true, added: true, items: nextItems };
  }

  function remove(productId) {
    const id = String(productId || '').trim();
    if (!id) {
      return { ok: false, error: 'invalid_product', items: readItems() };
    }

    const items = readItems();
    const nextItems = items.filter((item) => item.id !== id);
    if (nextItems.length === items.length) {
      return { ok: true, removed: false, items };
    }

    return { ok: true, removed: true, items: writeItems(nextItems) };
  }

  function toggle(product) {
    const item = normalizeProduct(product);
    if (!item) {
      return { ok: false, error: 'invalid_product', items: readItems() };
    }
    if (isSelected(item.id)) {
      const removeResult = remove(item.id);
      return { ...removeResult, action: 'removed' };
    }
    const addResult = add(item);
    return { ...addResult, action: addResult.added ? 'added' : 'unchanged' };
  }

  function clear() {
    return writeItems([]);
  }

  function openLeadModal(detail = {}) {
    window.dispatchEvent(
      new CustomEvent('yp:lead-modal-open', {
        detail: {
          ...detail,
          selectedProducts: getItems(),
        },
      })
    );
  }

  window.YouProtectShortlist = {
    MAX_ITEMS,
    getItems,
    count,
    isSelected,
    add,
    remove,
    toggle,
    clear,
    openLeadModal,
  };

  emitChange(getItems());
})();
