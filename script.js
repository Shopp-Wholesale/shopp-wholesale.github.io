// script.js — FINAL (Safe cart migration + docId-based cart + stable UI)
// Prereq: Firebase v8 loaded in index.html and `const db = firebase.firestore();`

/* ---------------- CONFIG ---------------- */
const WHATSAPP_NUMBER = "919000810084";
const DELIVERY_RADIUS_TEXT = "3 km";
const DELIVERY_PROMISE_TEXT = "Within 24 hrs";
const CART_LS_KEY = "shopp_cart_v1";      // localStorage key

/* ---------------- STATE ---------------- */
let items = [];    // items loaded from Firestore. Each item: { id, docId, name, mrp, salePrice, stock, ... }
let cart = {};     // NEW format: { "<docId>": { qty: 2, name, price, mrp } }

/* ---------------- HELPERS ---------------- */
const money = v => Number(v || 0).toFixed(0);
const el = id => document.getElementById(id);

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

function debounce(fn, ms = 180) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------------- localStorage ----------------
   Cart stored as object. We support legacy formats:
   - OLD: { "1": 2, "2": 1 }  // numeric id -> qty
   - INTERIM: { "1": { qty:2, name:'X', price:118, mrp:140 } }
   - NEW: { "<docId>": { qty:2, name:'X', price:118, mrp:140 } }
*/
function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_LS_KEY);
    if (!raw) { cart = {}; return; }
    const parsed = JSON.parse(raw);

    // If already in new format (docId keys with object values) accept
    const keys = Object.keys(parsed || {});
    if (!keys.length) { cart = {}; return; }

    // Heuristics: legacy numeric-only map (values are numbers)
    const legacyNumeric = keys.every(k => /^[0-9]+$/.test(k) && (typeof parsed[k] === 'number' || typeof parsed[k] === 'string'));

    // interim: keys numeric but values objects with meta
    const legacyWithMeta = keys.every(k => /^[0-9]+$/.test(k) && typeof parsed[k] === 'object');

    // new format: keys look like Firestore doc ids (non-numeric) and values are objects
    const newFormat = keys.every(k => !/^[0-9]+$/.test(k) && typeof parsed[k] === 'object');

    if (newFormat) {
      cart = parsed;
      return;
    }

    if (legacyNumeric) {
      // convert to interim mapping objects (we don't have metadata so set placeholders)
      const conv = {};
      for (const k of keys) {
        const qty = Number(parsed[k] || 0);
        if (!qty) continue;
        conv[k] = { qty, name: null, price: null, mrp: null };
      }
      cart = conv;
      return;
    }

    if (legacyWithMeta) {
      // values already include meta but keys numeric. keep as-is for migration step.
      cart = parsed;
      return;
    }

    // fallback: accept parsed
    cart = parsed || {};
  } catch (e) {
    console.warn('Cart load failed:', e);
    cart = {};
  }
}

function saveCartToStorage() {
  try {
    localStorage.setItem(CART_LS_KEY, JSON.stringify(cart));
  } catch (e) { /* ignore */ }
}

/* ---------------- FIRESTORE: load items ---------------- */
async function loadItems() {
  try {
    const snap = await db.collection("items").get();
    if (snap.empty) {
      el('products').innerHTML = "<p style='padding:20px'>No items found in Firestore</p>";
      return;
    }

    items = [];
    let idx = 1;
    snap.forEach(doc => {
      const d = doc.data() || {};
      items.push({
        id: idx++,                 // local numeric id (legacy)
        docId: doc.id,            // Firestore doc id (stable)
        name: d.name || 'Untitled',
        mrp: Number(d.mrp || 0),
        salePrice: Number(d.price || d.salePrice || 0),
        stock: Number(d.stock || 0),
        image: d.image || 'images/placeholder.png',
        category: d.category || null,
        description: d.description || ''
      });
    });

    // After items loaded, migrate old cart keys (if any)
    migrateCartIfNeeded();

    renderItems(items);
    updateCartCount();
  } catch (e) {
    console.error('Failed to load items:', e);
    el('products').innerHTML = "<p style='padding:20px'>Failed to load items</p>";
  }
}

/* ---------------- CART MIGRATION ----------------
   Convert legacy numeric keys → Firestore docIds.
   Strategy:
   1. If cart key is numeric (legacy), try to find an item using:
      a) exact name + price + mrp stored in value (if present)
      b) fallback to items.find(x => x.id === Number(key)) (best-effort)
   2. If value was a number (qty), enrich new entry with name/price/mrp from matched item
   3. If no match is found, keep legacy entry as-is (to not accidentally drop) but mark for removal later
*/
function migrateCartIfNeeded() {
  // No migration needed if cart already uses docIds (non-numeric keys)
  const keys = Object.keys(cart || {});
  if (!keys.length) return;

  const hasNumericKey = keys.some(k => /^[0-9]+$/.test(k));
  if (!hasNumericKey) {
    // cart already using docIds — but we should ensure each value has meta
    // add meta for each docId from items array if missing
    for (const key of Object.keys(cart)) {
      const entry = cart[key];
      if (!entry || typeof entry !== 'object') continue;
      if (entry.name && entry.price != null && entry.mrp != null) continue;
      const item = items.find(i => i.docId === key);
      if (item) {
        cart[key] = { qty: Number(entry.qty || 0), name: item.name, price: item.salePrice, mrp: item.mrp };
      }
    }
    saveCartToStorage();
    return;
  }

  // Build fallback maps: by numeric id, and by stable triple (name+price+mrp)
  const byNumeric = {};
  const byTriple = {}; // key = `${name}||${price}||${mrp}` -> docId
  for (const it of items) {
    byNumeric[String(it.id)] = it.docId;
    const t = `${(it.name||'').trim().toLowerCase()}||${Number(it.salePrice||0)}||${Number(it.mrp||0)}`;
    byTriple[t] = it.docId;
  }

  const newCart = {};
  const orphan = {}; // keep unmatched legacy keys here (won't block user's flow)

  for (const key of Object.keys(cart)) {
    const value = cart[key];

    if (/^[0-9]+$/.test(key)) {
      // legacy numeric key
      let qty = 0;
      let metaName = null, metaPrice = null, metaMrp = null;

      if (typeof value === 'number' || typeof value === 'string') {
        qty = Number(value || 0);
      } else if (typeof value === 'object') {
        qty = Number(value.qty || 0);
        metaName = value.name || null;
        metaPrice = value.price != null ? Number(value.price) : null;
        metaMrp = value.mrp != null ? Number(value.mrp) : null;
      }

      if (!qty) {
        // nothing to migrate
        continue;
      }

      // Prefer exact triple match when metadata exists
      let mappedDocId = null;
      if (metaName && metaPrice != null && metaMrp != null) {
        const triple = `${(metaName||'').trim().toLowerCase()}||${Number(metaPrice)}||${Number(metaMrp)}`;
        mappedDocId = byTriple[triple] || null;
      }

      // fallback to numeric positional mapping
      if (!mappedDocId) {
        mappedDocId = byNumeric[key] || null;
      }

      if (!mappedDocId) {
        // no match found — try fuzzy by name if meta available
        if (metaName) {
          const lower = (metaName||'').trim().toLowerCase();
          const found = items.find(i => i.name.trim().toLowerCase() === lower && Number(i.salePrice) === Number(metaPrice || i.salePrice));
          mappedDocId = found ? found.docId : null;
        }
      }

      if (mappedDocId) {
        const item = items.find(i => i.docId === mappedDocId);
        newCart[mappedDocId] = {
          qty,
          name: item ? item.name : (metaName || 'Unknown'),
          price: item ? item.salePrice : (metaPrice || 0),
          mrp: item ? item.mrp : (metaMrp || 0)
        };
      } else {
        // keep orphan (legacy) so user doesn't lose it — we'll show a warning later if needed
        orphan[key] = value;
      }

    } else {
      // key is non-numeric: probably already docId format
      if (typeof value === 'object') {
        newCart[key] = {
          qty: Number(value.qty || 0),
          name: value.name || null,
          price: value.price != null ? Number(value.price) : null,
          mrp: value.mrp != null ? Number(value.mrp) : null
        };
      } else {
        // value is primitive (qty) — enrich meta if possible from items list
        const it = items.find(x => x.docId === key);
        newCart[key] = {
          qty: Number(value || 0),
          name: it ? it.name : null,
          price: it ? it.salePrice : null,
          mrp: it ? it.mrp : null
        };
      }
    }
  }

  // Merge newCart with any pre-existing docId entries from parsed cart (avoid duplicates)
  cart = { ...newCart };

  // If there were orphan numeric entries, append them under a special "legacy-orphan" key so user can recover if needed
  const orphanKeys = Object.keys(orphan);
  if (orphanKeys.length) {
    // store as metadata under a single key (won't break everything)
    cart.__legacy_orphan__ = orphan;
  }

  saveCartToStorage();
}

/* ---------------- RENDER / UI ---------------- */
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

    // image
    const imgWrap = document.createElement('div');
    imgWrap.style.minHeight = '120px';
    imgWrap.appendChild(createSafeImage(it.image, it.name));
    card.appendChild(imgWrap);

    // name
    const nameEl = document.createElement('div');
    nameEl.className = 'item-name';
    nameEl.textContent = it.name;
    card.appendChild(nameEl);

    // price row
    const priceRow = document.createElement('div');
    priceRow.className = 'price-row';
    priceRow.innerHTML = `<div class="small-mrp">MRP ₹${money(it.mrp)}</div><div class="sale">₹${money(it.salePrice)}</div>`;
    card.appendChild(priceRow);

    // stock / category
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

    // controls: use data-docid for stable referencing
    const controls = document.createElement('div');
    controls.className = 'qty-controls';
    const docId = it.docId;
    const qtyNow = (cart[docId] && cart[docId].qty) ? Number(cart[docId].qty) : 0;

    controls.innerHTML = `
      <button class="dec" data-docid="${docId}">-</button>
      <div class="qty-display" id="qty-${docId}">${qtyNow}</div>
      <button class="inc" data-docid="${docId}">+</button>
    `;
    card.appendChild(controls);

    // add button
    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn';
    addBtn.dataset.docid = docId;
    addBtn.textContent = (it.stock <= 0) ? 'Unavailable' : 'Add to cart';
    addBtn.disabled = (it.stock <= 0);
    card.appendChild(addBtn);

    container.appendChild(card);
  });

  // Attach event handlers (use dataset.docid)
  container.querySelectorAll('.inc').forEach(b => {
    b.onclick = () => changeQtyByDocId(b.dataset.docid, +1);
  });
  container.querySelectorAll('.dec').forEach(b => {
    b.onclick = () => changeQtyByDocId(b.dataset.docid, -1);
  });
  container.querySelectorAll('.add-btn').forEach(b => {
    b.onclick = () => changeQtyByDocId(b.dataset.docid, +1);
  });
}

/* ---------------- CART FUNCTIONS (docId-based) ---------------- */
function changeQtyByDocId(docId, delta) {
  if (!docId) return;
  const it = items.find(x => x.docId === docId);
  if (!it) return;

  const cur = cart[docId] ? Number(cart[docId].qty || 0) : 0;
  let next = Math.max(0, cur + delta);
  // clamp to stock
  if (next > it.stock) next = it.stock;

  if (next <= 0) {
    // remove entry
    delete cart[docId];
  } else {
    cart[docId] = {
      qty: next,
      name: it.name,
      price: it.salePrice,
      mrp: it.mrp
    };
  }

  // update DOM qty display
  const qtyEl = el(`qty-${docId}`);
  if (qtyEl) qtyEl.innerText = cart[docId] ? cart[docId].qty : 0;

  saveCartToStorage();
  updateCartCount();
}

function calculateTotal() {
  let total = 0;
  for (const key of Object.keys(cart)) {
    if (key === '__legacy_orphan__') continue;
    const e = cart[key];
    total += Number(e.qty || 0) * Number(e.price || 0);
  }
  return total;
}

function renderCartItems() {
  const container = el('cart-items');
  container.innerHTML = '';

  let any = false;
  for (const key of Object.keys(cart)) {
    if (key === '__legacy_orphan__') continue;
    const e = cart[key];
    if (!e || Number(e.qty || 0) <= 0) continue;
    any = true;
    const it = items.find(x => x.docId === key);
    const name = e.name || (it ? it.name : 'Unknown item');
    const price = Number(e.price || (it ? it.salePrice : 0));
    const qty = Number(e.qty || 0);

    const row = document.createElement('div');
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.padding = "6px 0";
    row.innerHTML = `<div>${name} x ${qty}</div><div>₹${money(qty * price)}</div>`;
    container.appendChild(row);
  }

  if (!any) container.innerHTML = '<p>No items in cart</p>';
}

function updateCartCount() {
  const count = Object.values(cart).reduce((s, v) => {
    if (!v || typeof v !== 'object') return s;
    return s + (Number(v.qty || 0));
  }, 0);
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
function applyFilters() {
  const q = (el('search') && el('search').value || '').trim().toLowerCase();
  const cat = (el('category-filter') && el('category-filter').value) || '';

  let filtered = items.slice();
  if (cat) filtered = filtered.filter(it => it.category === cat);
  if (q) filtered = filtered.filter(it => it.name.toLowerCase().includes(q) || (it.description || '').toLowerCase().includes(q));

  renderItems(filtered);
}
const debouncedApply = debounce(applyFilters, 180);
(function attachSearch() {
  const s = el('search');
  if (!s) return;
  s.addEventListener('input', debouncedApply);
})();

/* ---------------- MODAL CONTROLS ---------------- */
(function attachModalControls() {
  const open1 = el('open-cart-btn'), open2 = el('open-cart-btn-2'), close = el('close-cart');
  const show = () => el('cart-modal') && el('cart-modal').classList.remove('hidden');
  const hide = () => el('cart-modal') && el('cart-modal').classList.add('hidden');
  if (open1) open1.addEventListener('click', (e) => { e.preventDefault(); show(); });
  if (open2) open2.addEventListener('click', (e) => { e.preventDefault(); show(); });
  if (close) close.addEventListener('click', (e) => { e.preventDefault(); hide(); });
  const modal = el('cart-modal');
  if (modal) modal.addEventListener('click', (ev) => { if (ev.target === modal) hide(); });
})();

/* ---------------- FIRESTORE TRANSACTION (atomic stock reduce + order create) ---------------- */
async function createOrderAndReduceStock(orderItems, customer) {
  try {
    await db.runTransaction(async (tx) => {
      for (const o of orderItems) {
        const ref = db.collection('items').doc(o.docId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error(`${o.name} — item not found`);
        const data = snap.data();
        const current = Number(data.stock || 0);
        if (o.qty > current) throw new Error(`${o.name} — only ${current} left`);
        tx.update(ref, { stock: current - o.qty });
      }

      const orderRef = db.collection('orders').doc();
      const orderData = {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        customerName: customer.name || '---',
        customerPhone: customer.phone || '---',
        customerAddress: customer.address || '---',
        paymentMode: customer.payment || '---',
        items: orderItems.map(o => ({ docId: o.docId, name: o.name, qty: o.qty, price: o.price })),
        total: orderItems.reduce((s, o) => s + o.qty * o.price, 0),
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
    msg += `${i + 1}. ${o.name} x ${o.qty} = ₹${money(o.qty * o.price)}\n`;
  });
  msg += `\nTotal: ₹${money(orderItems.reduce((s, o) => s + o.qty * o.price, 0))}`;
  msg += `\nDelivery Promise: ${DELIVERY_PROMISE_TEXT} • Radius: ${DELIVERY_RADIUS_TEXT}`;
  msg += `\nOrder Time: ${new Date().toLocaleString('en-IN')}`;
  msg += `\n\nName: ${customer.name || '---'}`;
  msg += `\nPhone: ${customer.phone || '---'}`;
  msg += `\nAddress: ${customer.address || '---'}`;
  msg += `\nPayment: ${customer.payment || '---'}`;
  return msg;
}

(async function attachWhatsAppCheckout() {
  const btn = el('send-whatsapp');
  if (!btn) return;

  btn.addEventListener('click', async (ev) => {
    ev.preventDefault(); ev.stopPropagation();

    updateCartCount();

    // build orderItems from cart (ignore legacy orphan)
    const orderItems = [];
    for (const key of Object.keys(cart)) {
      if (key === '__legacy_orphan__') continue;
      const e = cart[key];
      if (!e || Number(e.qty || 0) <= 0) continue;
      orderItems.push({ docId: key, name: e.name || 'Unknown', qty: Number(e.qty), price: Number(e.price || 0) });
    }

    if (!orderItems.length) {
      alert('Cart is empty — add items before checkout');
      return;
    }

    // read customer
    const customer = {
      name: (el('customer-name') && el('customer-name').value.trim()) || '---',
      phone: (el('customer-phone') && el('customer-phone').value.trim()) || '---',
      address: (el('customer-address') && el('customer-address').value.trim()) || '---',
      payment: (el('payment-mode') && el('payment-mode').value) || '---'
    };

    // disable while processing
    btn.disabled = true;
    const oldLabel = btn.innerText;
    btn.innerText = 'Processing...';

    // Transaction: reduce stock atomically and create order
    const res = await createOrderAndReduceStock(orderItems, customer);
    if (!res.ok) {
      alert('Order failed: ' + res.error);
      btn.disabled = false; btn.innerText = oldLabel;
      await loadItems(); // refresh stock
      return;
    }

    // update local items stock and clear cart
    orderItems.forEach(o => {
      const it = items.find(x => x.docId === o.docId);
      if (it) it.stock = Math.max(0, it.stock - o.qty);
    });

    cart = {};
    saveCartToStorage();
    updateCartCount();

    const waMsg = buildWhatsAppMessage(orderItems, customer);
    const encoded = encodeURIComponent(waMsg);

    // open WhatsApp
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`, "_blank");

    btn.disabled = false;
    btn.innerText = oldLabel;

    alert("Order placed successfully!");

    // close modal if open
    const modal = el('cart-modal');
    if (modal) modal.classList.add('hidden');
  });
})();
 
/* ---------------- INIT ---------------- */
loadCartFromStorage();
loadItems();
updateCartCount();
