// FINAL script.js — Shopp Wholesale (Option A: atomic stock reduce on checkout)
// Prereq: Firebase v8 loaded in index.html and `const db = firebase.firestore();`

/* ---------------- CONFIG ---------------- */
const WHATSAPP_NUMBER = "919000810084";
const DELIVERY_RADIUS_TEXT = "3 km";
const DELIVERY_PROMISE_TEXT = "Within 24 hrs";
const CART_LS_KEY = "shopp_cart_v1";
const CUST_LS_KEY = "shopp_customer_v1";

/* ---------------- STATE ---------------- */
let items = [];       // loaded items
let cart = {};        // { "<id>": qty }
let categories = [];  // discovered categories

/* ---------------- HELPERS ---------------- */
const money = v => Number(v || 0).toFixed(0);
const el = id => document.getElementById(id);

/* Safe image element with fade-in and fallback */
function createSafeImage(src, alt) {
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = alt || '';
  img.style.opacity = '0';
  img.style.transition = 'opacity .28s';
  img.src = (src && src.trim()) ? src : 'images/placeholder.png';
  img.onload = () => img.style.opacity = '1';
  img.onerror = () => { img.onerror = null; img.src = 'images/placeholder.png'; img.style.opacity = '1'; };
  return img;
}

/* Debounce */
function debounce(fn, ms = 180) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------------- localStorage ---------------- */
function loadCartFromStorage() {
  try { const raw = localStorage.getItem(CART_LS_KEY); if (raw) cart = JSON.parse(raw) || {}; } catch(e){ cart = {}; }
}
function saveCartToStorage(){ try{ localStorage.setItem(CART_LS_KEY, JSON.stringify(cart)); }catch(e){} }

function saveCustomerToStorage(obj) {
  try { localStorage.setItem(CUST_LS_KEY, JSON.stringify(obj)); } catch(e) {}
}
function loadCustomerFromStorage() {
  try {
    const raw = localStorage.getItem(CUST_LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch(e) { return {}; }
}

/* ---------------- FIRESTORE: load items ---------------- */
async function loadItems() {
  try {
    const snap = await db.collection("items").get();
    if (snap.empty) { el('products').innerHTML = "<p style='padding:20px'>No items found in Firestore</p>"; return; }
    items = []; categories = [];
    snap.forEach((doc, index) => {
      const d = doc.data() || {};
      const item = {
        id: index + 1,               // local numeric id used in UI
        docId: doc.id,              // firestore doc id (unique)
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
    renderCategoryFilter();
    renderItems(items);
    updateCartCount();
  } catch (err) {
    console.error("Failed to load items:", err);
    el('products').innerHTML = "<p style='padding:20px'>Failed to load items</p>";
  }
}

/* ---------------- UI: category filter ---------------- */
function renderCategoryFilter(){
  if (!categories.length) return;
  if (!el('category-filter')) {
    const controls = document.querySelector('.controls') || document.body;
    const wrap = document.createElement('div');
    wrap.style.margin = '8px 20px 0 20px';
    wrap.innerHTML = `<select id="category-filter"><option value="">All categories</option></select>`;
    controls.appendChild(wrap);
  }
  const sel = el('category-filter');
  sel.innerHTML = `<option value="">All categories</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join('');
  sel.onchange = () => applyFilters();
}

/* ---------------- UI: render items ---------------- */
function renderItems(list) {
  const container = el('products');
  container.innerHTML = '';
  if (!list || list.length === 0) { container.innerHTML = `<p style='padding:20px'>No items match your search/filters.</p>`; return; }

  list.forEach(it => {
    const card = document.createElement('div');
    card.className = 'card';

    const imgWrap = document.createElement('div');
    imgWrap.style.minHeight = '120px';
    imgWrap.appendChild(createSafeImage(it.image, it.name));
    card.appendChild(imgWrap);

    const nameEl = document.createElement('div'); nameEl.className = 'item-name'; nameEl.textContent = it.name; card.appendChild(nameEl);

    const priceRow = document.createElement('div'); priceRow.className = 'price-row';
    const smallMrp = document.createElement('div'); smallMrp.className = 'small-mrp'; smallMrp.textContent = `MRP ₹${money(it.mrp)}`;
    const sale = document.createElement('div'); sale.className = 'sale'; sale.textContent = `₹${money(it.salePrice)}`;
    priceRow.appendChild(smallMrp); priceRow.appendChild(sale); card.appendChild(priceRow);

    if (it.stock <= 0) {
      const badge = document.createElement('div'); badge.style.color = '#c00'; badge.style.fontSize = '13px'; badge.style.marginTop = '6px'; badge.textContent = 'Out of stock'; card.appendChild(badge);
    } else if (it.category) {
      const cat = document.createElement('div'); cat.style.fontSize = '12px'; cat.style.color = '#666'; cat.style.marginTop = '6px'; cat.textContent = it.category; card.appendChild(cat);
    }

    const controls = document.createElement('div'); controls.className = 'qty-controls';
    const dec = document.createElement('button'); dec.className = 'dec'; dec.dataset.id = it.id; dec.textContent = '-';
    const qtyDisplay = document.createElement('div'); qtyDisplay.className = 'qty-display'; qtyDisplay.id = `qty-${it.id}`; qtyDisplay.textContent = cart[it.id] || 0;
    const inc = document.createElement('button'); inc.className = 'inc'; inc.dataset.id = it.id; inc.textContent = '+';
    controls.appendChild(dec); controls.appendChild(qtyDisplay); controls.appendChild(inc); card.appendChild(controls);

    const addBtn = document.createElement('button'); addBtn.className = 'add-btn'; addBtn.dataset.id = it.id; addBtn.textContent = (it.stock <= 0) ? 'Unavailable' : 'Add to cart';
    if (it.stock <= 0) addBtn.disabled = true;

    card.appendChild(addBtn);
    container.appendChild(card);
  });

  // attach handlers
  document.querySelectorAll('.inc').forEach(b => { b.removeEventListener('click', incHandler); b.addEventListener('click', incHandler); });
  document.querySelectorAll('.dec').forEach(b => { b.removeEventListener('click', decHandler); b.addEventListener('click', decHandler); });
  document.querySelectorAll('.add-btn').forEach(b => { b.removeEventListener('click', addToCartHandler); b.addEventListener('click', addToCartHandler); });
}

/* handlers */
function incHandler(e){ changeQty(e.currentTarget.dataset.id, +1); }
function decHandler(e){ changeQty(e.currentTarget.dataset.id, -1); }
function addToCartHandler(e){ changeQty(e.currentTarget.dataset.id, +1); }

/* ---------------- CART LOGIC ---------------- */
function changeQty(id, delta){
  id = String(id);
  const it = items.find(x => String(x.id) === id);
  if (!it) return;
  cart[id] = cart[id] || 0;
  const newQty = Math.max(0, cart[id] + delta);

  if (newQty > it.stock) {
    cart[id] = it.stock; // clamp
    alert(`${it.name} — only ${it.stock} left in stock`);
  } else {
    cart[id] = newQty;
  }

  const qtyEl = el(`qty-${id}`);
  if (qtyEl) qtyEl.innerText = cart[id];
  else renderItems(items);

  const addBtn = document.querySelector(`.add-btn[data-id="${id}"]`);
  if (addBtn) addBtn.disabled = (it.stock <= 0);

  saveCartToStorage();
  updateCartCount();
}

function calculateTotal(){
  let total = 0;
  for (const id in cart) {
    const qty = Number(cart[id] || 0);
    if (!qty) continue;
    const it = items.find(x => String(x.id) === String(id));
    if (it) total += qty * Number(it.salePrice || 0);
  }
  return total;
}

function renderCartItems(){
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
    row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.padding = '6px 0';
    row.innerHTML = `<div>${it.name} x ${qty}</div><div>₹${money(qty * it.salePrice)}</div>`;
    container.appendChild(row);
  }
  if (!any) container.innerHTML = '<p>No items in cart</p>';
}

function updateCartCount(){
  const count = Object.values(cart).reduce((s, n) => s + (Number(n) || 0), 0);
  const total = calculateTotal();
  if (el('cart-count')) el('cart-count').innerText = count;
  if (el('footer-item-count')) el('footer-item-count').innerText = `${count} Items`;
  if (el('footer-total')) el('footer-total').innerText = money(total);
  if (el('total-items')) el('total-items').innerText = count;
  if (el('total-amount')) el('total-amount').innerText = money(total);
  renderCartItems();
  saveCartToStorage();
}

/* ---------------- FILTERS ---------------- */
function applyFilters(){
  const q = (el('search') && el('search').value || '').trim().toLowerCase();
  const cat = (el('category-filter') && el('category-filter').value) || '';
  let filtered = items.slice();
  if (cat) filtered = filtered.filter(it => it.category === cat);
  if (q) filtered = filtered.filter(it => it.name.toLowerCase().includes(q) || (it.description||'').toLowerCase().includes(q));
  renderItems(filtered);
}
const debouncedApply = debounce(applyFilters, 180);
(function attachSearch(){ const s = el('search'); if (s) s.addEventListener('input', debouncedApply); })();

/* ---------------- MODAL CONTROLS ---------------- */
(function attachModalControls(){
  const open1 = el('open-cart-btn'), open2 = el('open-cart-btn-2'), close = el('close-cart');
  const show = () => el('cart-modal') && el('cart-modal').classList.remove('hidden');
  const hide = () => el('cart-modal') && el('cart-modal').classList.add('hidden');
  if (open1) open1.addEventListener('click', (e)=>{ e.preventDefault(); show(); });
  if (open2) open2.addEventListener('click', (e)=>{ e.preventDefault(); show(); });
  if (close) close.addEventListener('click', (e)=>{ e.preventDefault(); hide(); });
  const modal = el('cart-modal');
  if (modal) modal.addEventListener('click', (ev)=>{ if (ev.target === modal) hide(); });
})();

/* ---------------- CUSTOMER STORAGE ---------------- */
function saveCustomerDetailsToLS(){
  const obj = {
    name: (el('customer-name') && el('customer-name').value) || '',
    phone: (el('customer-phone') && el('customer-phone').value) || '',
    address: (el('customer-address') && el('customer-address').value) || '',
    payment: (el('payment-mode') && el('payment-mode').value) || ''
  };
  saveCustomerToStorage(obj);
}
function loadCustomerDetailsFromLS(){
  const obj = loadCustomerFromStorage();
  if (!obj) return;
  if (el('customer-name')) el('customer-name').value = obj.name || '';
  if (el('customer-phone')) el('customer-phone').value = obj.phone || '';
  if (el('customer-address')) el('customer-address').value = obj.address || '';
  if (el('payment-mode')) el('payment-mode').value = obj.payment || 'Cash';
}

/* ---------------- FIRESTORE TRANSACTION (atomic stock reduce + order create) ---------------- */
async function createOrderAndReduceStock(orderItems, customer) {
  // orderItems: [{ docId, name, qty, price }]
  // customer: { name, phone, address, payment }
  try {
    await db.runTransaction(async (tx) => {
      // check and update stock
      for (const o of orderItems) {
        const ref = db.collection('items').doc(o.docId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error(`${o.name} — item not found`);
        const data = snap.data();
        const current = Number(data.stock || 0);
        if (o.qty > current) throw new Error(`${o.name} — only ${current} left`);
        tx.update(ref, { stock: current - o.qty });
      }
      // create order
      const orderRef = db.collection('orders').doc();
      const orderData = {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        customerName: customer.name || '---',
        customerPhone: customer.phone || '---',
        customerAddress: customer.address || '---',
        paymentMode: customer.payment || '---',
        items: orderItems.map(o => ({ docId: o.docId, name: o.name, qty: o.qty, price: o.price })),
        total: orderItems.reduce((s,o) => s + o.qty * o.price, 0),
        status: 'pending'
      };
      tx.set(orderRef, orderData);
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err && err.message) ? err.message : String(err) };
  }
}

/* ---------------- WHATSAPP BUILD + CHECKOUT ---------------- */
function buildWhatsAppMessage(orderItems, customer) {
  let msg = `New Order — Shopp Wholesale\n\n`;
  orderItems.forEach((o, i) => {
    msg += `${i+1}. ${o.name} x ${o.qty} = ₹${money(o.qty * o.price)}\n`;
  });
  msg += `\nTotal: ₹${money(orderItems.reduce((s,o)=>s+o.qty*o.price,0))}`;
  msg += `\nDelivery Promise: ${DELIVERY_PROMISE_TEXT} • Radius: ${DELIVERY_RADIUS_TEXT}`;
  msg += `\nOrder Time: ${new Date().toLocaleString('en-IN')}`;
  msg += `\n\nName: ${customer.name || '---'}`;
  msg += `\nPhone: ${customer.phone || '---'}`;
  msg += `\nAddress: ${customer.address || '---'}`;
  msg += `\nPayment: ${customer.payment || '---'}`;
  return msg;
}

(async function attachWhatsAppCheckout(){
  const btn = el('send-whatsapp');
  if (!btn) return;

  btn.addEventListener('click', async (ev) => {
    ev.preventDefault(); ev.stopPropagation();

    // ensure latest totals and load customer
    updateCartCount();
    loadCustomerDetailsFromLS();

    // build order items from cart
    const orderItems = [];
    for (const id in cart) {
      const qty = Number(cart[id] || 0);
      if (!qty) continue;
      const it = items.find(x => String(x.id) === String(id));
      if (!it) continue;
      orderItems.push({ docId: it.docId, name: it.name, qty, price: Number(it.salePrice || 0) });
    }

    if (!orderItems.length) { alert('Cart is empty — add items before checkout'); return; }

    // build customer object & save locally
    const customer = {
      name: (el('customer-name') && el('customer-name').value.trim()) || '---',
      phone: (el('customer-phone') && el('customer-phone').value.trim()) || '---',
      address: (el('customer-address') && el('customer-address').value.trim()) || '---',
      payment: (el('payment-mode') && el('payment-mode').value) || '---'
    };
    saveCustomerToStorage(customer);

    // disable button while processing
    btn.disabled = true;
    const oldLabel = btn.innerText;
    btn.innerText = 'Processing...';

    // Transaction: reduce stock atomically and create order
    const res = await createOrderAndReduceStock(orderItems, customer);
    if (!res.ok) {
      alert('Order failed: ' + res.error);
      btn.disabled = false; btn.innerText = oldLabel;
      // reload items to show correct stock if needed
      await loadItems();
      return;
    }

    // If transaction ok: update local items stock, clear cart, refresh UI
    orderItems.forEach(o => {
      const it = items.find(x => x.docId === o.docId);
      if (it) it.stock = Math.max(0, it.stock - o.qty);
    });
    // clear cart local
    cart = {};
    saveCartToStorage();
    updateCartCount();

    // build WA message and open
    const waMsg = buildWhatsAppMessage(orderItems, customer);
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waMsg)}`, '_blank');

    // restore button
    btn.disabled = false;
    btn.innerText = oldLabel;
  });
})();

/* ---------------- INIT ---------------- */
function init(){
  loadCartFromStorage();
  loadCustomerDetailsFromLS();
  loadItems();
}
init();
