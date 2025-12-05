// script.js — Optimized for Shopp Wholesale
// Requirements: Firebase v8 loaded in index.html and `const db = firebase.firestore();`

// ---------------- CONFIG ----------------
const WHATSAPP_NUMBER = "919000810084";
const DELIVERY_RADIUS_TEXT = "3 km";
const DELIVERY_PROMISE_TEXT = "Within 24 hrs";
const CART_LS_KEY = "shopp_cart_v1";

let items = [];       // array of product objects
let cart = {};        // { "<id>": qty, ... }
let categories = [];  // optional categories

// small helper to display money (integer rupee)
const money = (v) => {
  // ensure number then format without decimals
  return Number(v || 0).toFixed(0);
};

// ---------------- STORAGE ----------------
function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_LS_KEY);
    if (raw) cart = JSON.parse(raw) || {};
  } catch (e) {
    cart = {};
  }
}

function saveCartToStorage() {
  try {
    localStorage.setItem(CART_LS_KEY, JSON.stringify(cart));
  } catch (e) {
    // ignore
  }
}

// ---------------- UTIL ----------------
function el(id) { return document.getElementById(id); }

function createSafeImage(src, alt) {
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = alt || '';
  img.style.opacity = '0';
  img.style.transition = 'opacity .28s';
  img.src = (src && src.trim()) ? src : 'images/placeholder.png';

  img.onload = () => { img.style.opacity = '1'; };
  img.onerror = () => {
    img.onerror = null;
    img.src = 'images/placeholder.png';
    img.style.opacity = '1';
  };
  return img;
}

// small debounce
function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ---------------- FIREBASE LOAD ----------------
async function loadItems() {
  try {
    const snap = await db.collection("items").get();

    if (snap.empty) {
      el('products').innerHTML = "<p style='padding:20px'>No items found in Firestore</p>";
      return;
    }

    items = [];
    categories = [];

    snap.forEach((doc, index) => {
      const d = doc.data() || {};
      const item = {
        id: index + 1,           // internal numeric id
        docId: doc.id,          // firestore doc id (useful later)
        name: d.name || 'Untitled',
        mrp: Number(d.mrp || 0),
        salePrice: Number(d.price || d.salePrice || 0),
        stock: Number(d.stock || 0),
        image: d.image || 'images/placeholder.png',
        category: d.category || null,
        description: d.description || ''
      };
      items.push(item);
      if (item.category && !categories.includes(item.category)) categories.push(item.category);
    });

    renderCategoryFilter(); // create category UI if categories exist
    renderItems(items);
    updateCartCount();      // refresh UI from stored cart
  } catch (e) {
    console.error("Firestore error:", e);
    el('products').innerHTML = "<p style='padding:20px'>Failed to load items</p>";
  }
}

// ---------------- RENDER / UI ----------------
function renderCategoryFilter() {
  // If no categories or HTML has no container for filters, do nothing
  if (!categories.length) return;

  // create a small select at top if not present
  if (!el('category-filter')) {
    const controls = document.querySelector('.controls') || document.body;
    const wrap = document.createElement('div');
    wrap.style.margin = '8px 20px 0 20px';
    wrap.innerHTML = `
      <select id="category-filter">
        <option value="">All categories</option>
      </select>
    `;
    controls.appendChild(wrap);
  }

  const sel = el('category-filter');
  sel.innerHTML = `<option value="">All categories</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join('');
  sel.onchange = () => {
    applyFilters();
  };
}

function renderItems(list) {
  const container = el('products');
  container.innerHTML = '';

  if (!list || list.length === 0) {
    container.innerHTML = `<p style="padding:20px">No items match your search/filters.</p>`;
    return;
  }

  list.forEach(it => {
    const card = document.createElement('div');
    card.className = 'card';

    // build card: image, name, price, stock/controls
    const imgWrap = document.createElement('div');
    imgWrap.style.minHeight = '120px';
    imgWrap.appendChild(createSafeImage(it.image, it.name));
    card.appendChild(imgWrap);

    const nameEl = document.createElement('div');
    nameEl.className = 'item-name';
    nameEl.textContent = it.name;
    card.appendChild(nameEl);

    // price row
    const priceRow = document.createElement('div');
    priceRow.className = 'price-row';

    const smallMrp = document.createElement('div');
    smallMrp.className = 'small-mrp';
    smallMrp.textContent = `MRP ₹${money(it.mrp)}`;

    const sale = document.createElement('div');
    sale.className = 'sale';
    sale.textContent = `₹${money(it.salePrice)}`;

    priceRow.appendChild(smallMrp);
    priceRow.appendChild(sale);
    card.appendChild(priceRow);

    // out of stock badge + category (if exist)
    if (it.stock <= 0) {
      const badge = document.createElement('div');
      badge.style.color = '#c00';
      badge.style.fontSize = '13px';
      badge.style.marginTop = '6px';
      badge.textContent = 'Out of stock';
      card.appendChild(badge);
    } else if (it.category) {
      const cat = document.createElement('div');
      cat.style.fontSize = '12px';
      cat.style.color = '#666';
      cat.style.marginTop = '6px';
      cat.textContent = it.category;
      card.appendChild(cat);
    }

    // controls
    const controls = document.createElement('div');
    controls.className = 'qty-controls';

    const dec = document.createElement('button');
    dec.className = 'dec';
    dec.dataset.id = it.id;
    dec.textContent = '-';

    const qtyDisplay = document.createElement('div');
    qtyDisplay.className = 'qty-display';
    qtyDisplay.id = `qty-${it.id}`;
    qtyDisplay.textContent = cart[it.id] || 0;

    const inc = document.createElement('button');
    inc.className = 'inc';
    inc.dataset.id = it.id;
    inc.textContent = '+';

    controls.appendChild(dec);
    controls.appendChild(qtyDisplay);
    controls.appendChild(inc);
    card.appendChild(controls);

    // Add-to-cart button
    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn';
    addBtn.dataset.id = it.id;
    addBtn.textContent = (it.stock <= 0) ? 'Unavailable' : 'Add to cart';
    if (it.stock <= 0) addBtn.disabled = true;

    // append
    card.appendChild(addBtn);
    container.appendChild(card);
  });

  // attach listeners (delegation could be used, but keep simple)
  document.querySelectorAll('.inc').forEach(b => {
    b.removeEventListener('click', incHandler);
    b.addEventListener('click', incHandler);
  });

  document.querySelectorAll('.dec').forEach(b => {
    b.removeEventListener('click', decHandler);
    b.addEventListener('click', decHandler);
  });

  document.querySelectorAll('.add-btn').forEach(b => {
    b.removeEventListener('click', addToCartHandler);
    b.addEventListener('click', addToCartHandler);
  });
}

// handlers
function incHandler(e) {
  const id = e.currentTarget.dataset.id;
  changeQty(id, +1);
}

function decHandler(e) {
  const id = e.currentTarget.dataset.id;
  changeQty(id, -1);
}

function addToCartHandler(e) {
  const id = e.currentTarget.dataset.id;
  changeQty(id, +1); // calling changeQty already updates UI & storage
}

// ---------------- CART ----------------
function changeQty(id, delta) {
  // ensure id is string key
  id = String(id);
  const it = items.find(x => String(x.id) === id);
  if (!it) return;

  cart[id] = cart[id] || 0;
  const newQty = Math.max(0, cart[id] + delta);

  // enforce stock
  if (newQty > it.stock) {
    // optionally show a small toast; for now clamp to stock
    cart[id] = it.stock;
  } else {
    cart[id] = newQty;
  }

  // update displayed qty if present, else re-render items to reflect value
  const qtyEl = el(`qty-${id}`);
  if (qtyEl) qtyEl.innerText = cart[id];
  else renderItems(items);

  // reflect add button disabled when out of stock
  const addBtn = document.querySelector(`.add-btn[data-id="${id}"]`);
  if (addBtn) addBtn.disabled = (it.stock <= 0);

  saveCartToStorage();
  updateCartCount();
}

function calculateTotal() {
  let total = 0;
  for (const id in cart) {
    const qty = Number(cart[id] || 0);
    if (!qty) continue;
    const it = items.find(x => String(x.id) === String(id));
    if (it) total += qty * Number(it.salePrice || 0);
  }
  return total;
}

function renderCartItems() {
  const container = el('cart-items');
  container.innerHTML = '';

  let any = false;
  for (const id in cart) {
    const qty = Number(cart[id]);
    if (!qty) continue;
    any = true;
    const it = items.find(x => String(x.id) === String(id));
    if (!it) continue;

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.padding = '6px 0';
    row.innerHTML = `<div>${it.name} x ${qty}</div><div>₹${money(qty * it.salePrice)}</div>`;
    container.appendChild(row);
  }

  if (!any) container.innerHTML = '<p>No items in cart</p>';
}

function updateCartCount() {
  const count = Object.values(cart).reduce((s, n) => s + (Number(n) || 0), 0);
  const total = calculateTotal();

  const cartCountEl = el('cart-count');
  if (cartCountEl) cartCountEl.innerText = count;

  const footerCount = el('footer-item-count');
  if (footerCount) footerCount.innerText = `${count} Items`;

  const footerTotal = el('footer-total');
  if (footerTotal) footerTotal.innerText = money(total);

  const totalItems = el('total-items');
  if (totalItems) totalItems.innerText = count;

  const totalAmount = el('total-amount');
  if (totalAmount) totalAmount.innerText = money(total);

  renderCartItems();
  saveCartToStorage();
}

// ---------------- FILTERS (search + category) ----------------
function applyFilters() {
  const query = (el('search') && el('search').value || '').trim().toLowerCase();
  const category = (el('category-filter') && el('category-filter').value) || '';

  let filtered = items.slice();

  if (category) {
    filtered = filtered.filter(it => it.category === category);
  }

  if (query) {
    filtered = filtered.filter(it =>
      it.name.toLowerCase().includes(query) ||
      (it.description || '').toLowerCase().includes(query)
    );
  }

  renderItems(filtered);
}

const debouncedApply = debounce(applyFilters, 180);

// attach search input
(function attachSearch() {
  const s = el('search');
  if (!s) return;
  s.addEventListener('input', debouncedApply);
})();

// ---------------- MODAL CONTROLS ----------------
(function attachModalControls() {
  const open1 = el('open-cart-btn');
  const open2 = el('open-cart-btn-2');
  const close = el('close-cart');

  const show = () => el('cart-modal') && el('cart-modal').classList.remove('hidden');
  const hide = () => el('cart-modal') && el('cart-modal').classList.add('hidden');

  if (open1) open1.addEventListener('click', (e) => { e.preventDefault(); show(); });
  if (open2) open2.addEventListener('click', (e) => { e.preventDefault(); show(); });
  if (close) close.addEventListener('click', (e) => { e.preventDefault(); hide(); });

  // close modal on outside click
  const modal = el('cart-modal');
  if (modal) {
    modal.addEventListener('click', (ev) => {
      if (ev.target === modal) hide();
    });
  }
})();

// ---------------- SEND WHATSAPP ----------------
function buildWhatsAppMessage() {
  let msg = `New Order — Shopp Wholesale\n\n`;

  let hasItems = false;
  items.forEach(it => {
    const qty = Number(cart[it.id] || 0);
    if (!qty) return;
    hasItems = true;
    msg += `${it.name} x ${qty} = ₹${money(qty * it.salePrice)}\n`;
  });

  msg += `\nTotal: ₹${money(calculateTotal())}`;
  msg += `\nDelivery Promise: ${DELIVERY_PROMISE_TEXT} • Radius: ${DELIVERY_RADIUS_TEXT}\n`;

  const name = (el('customer-name') && el('customer-name').value.trim()) || '---';
  const phone = (el('customer-phone') && el('customer-phone').value.trim()) || '---';
  const address = (el('customer-address') && el('customer-address').value.trim()) || '---';
  const payment = (el('payment-mode') && el('payment-mode').value) || '---';

  msg += `\nName: ${name}\nPhone: ${phone}\nAddress: ${address}\nPayment: ${payment}`;

  return { msg, hasItems };
}

(function attachWhatsApp() {
  const btn = el('send-whatsapp');
  if (!btn) return;

  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    // ensure totals and cart are up-to-date
    updateCartCount();

    const { msg, hasItems } = buildWhatsAppMessage();
    if (!hasItems) {
      alert('Cart is empty — add items before checkout');
      return;
    }

    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  });
})();

// ---------------- INIT ----------------
function init() {
  loadCartFromStorage();
  loadItems();
}

// start
init();
