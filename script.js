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

  img.className = "product-img"; 
  img.src = (src && src.trim()) ? src : 'images/placeholder.png';

  img.style.opacity = '0';
  img.style.transition = 'opacity .28s';

  img.onload = () => img.style.opacity = '1';
  img.onerror = () => {
    img.onerror = null;
    img.src = 'images/placeholder.png';
    img.style.opacity = '1';
  };

  return img;
}

function debounce(fn, ms = 180) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------------- localStorage ---------------- */
function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_LS_KEY);
    if (!raw) { cart = {}; return; }
    const parsed = JSON.parse(raw);

    const keys = Object.keys(parsed || {});
    if (!keys.length) { cart = {}; return; }

    const legacyNumeric = keys.every(k => /^[0-9]+$/.test(k) && (typeof parsed[k] === 'number' || typeof parsed[k] === 'string'));
    const legacyWithMeta = keys.every(k => /^[0-9]+$/.test(k) && typeof parsed[k] === 'object');
    const newFormat = keys.every(k => !/^[0-9]+$/.test(k) && typeof parsed[k] === 'object');

    if (newFormat) { cart = parsed; return; }

    if (legacyNumeric) {
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
      cart = parsed;
      return;
    }

    cart = parsed || {};
  } catch (e) {
    console.warn('Cart load failed:', e);
    cart = {};
  }
}

function saveCartToStorage() {
  try {
    localStorage.setItem(CART_LS_KEY, JSON.stringify(cart));
  } catch (e) {}
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
        id: idx++,
        docId: doc.id,
        name: d.name || 'Untitled',
        mrp: Number(d.mrp || 0),
        salePrice: Number(d.price || d.salePrice || 0),
        stock: Number(d.stock || 0),
        image: d.image || 'images/placeholder.png',
        category: d.category || null,
        description: d.description || ''
      });
    });

    migrateCartIfNeeded();
    renderItems(items);
    updateCartCount();

  } catch (e) {
    console.error('Failed to load items:', e);
    el('products').innerHTML = "<p style='padding:20px'>Failed to load items</p>";
  }
}

/* ---------------- CART MIGRATION ---------------- */
function migrateCartIfNeeded() {
  const keys = Object.keys(cart || {});
  if (!keys.length) return;

  const hasNumericKey = keys.some(k => /^[0-9]+$/.test(k));
  if (!hasNumericKey) {
    for (const key of Object.keys(cart)) {
      const entry = cart[key];
      if (!entry || typeof entry !== 'object') continue;

      if (entry.name && entry.price != null && entry.mrp != null) continue;

      const item = items.find(i => i.docId === key);
      if (item) {
        cart[key] = {
          qty: Number(entry.qty || 0),
          name: item.name,
          price: item.salePrice,
          mrp: item.mrp
        };
      }
    }
    saveCartToStorage();
    return;
  }

  const byNumeric = {};
  const byTriple = {};

  for (const it of items) {
    byNumeric[String(it.id)] = it.docId;
    const t = `${(it.name||'').trim().toLowerCase()}||${Number(it.salePrice||0)}||${Number(it.mrp||0)}`;
    byTriple[t] = it.docId;
  }

  const newCart = {};
  const orphan = {};

  for (const key of keys) {
    const value = cart[key];

    if (/^[0-9]+$/.test(key)) {
      let qty = 0, metaName = null, metaPrice = null, metaMrp = null;

      if (typeof value === 'number' || typeof value === 'string') {
        qty = Number(value || 0);
      } else if (typeof value === 'object') {
        qty = Number(value.qty || 0);
        metaName = value.name || null;
        metaPrice = value.price != null ? Number(value.price) : null;
        metaMrp = value.mrp != null ? Number(value.mrp) : null;
      }

      if (!qty) continue;

      let mappedDocId = null;

      if (metaName && metaPrice != null && metaMrp != null) {
        const triple = `${metaName.trim().toLowerCase()}||${metaPrice}||${metaMrp}`;
        mappedDocId = byTriple[triple] || null;
      }

      if (!mappedDocId) {
        mappedDocId = byNumeric[key] || null;
      }

      if (!mappedDocId && metaName) {
        const lower = metaName.trim().toLowerCase();
        const found = items.find(i =>
          i.name.trim().toLowerCase() === lower &&
          Number(i.salePrice) === Number(metaPrice || i.salePrice)
        );
        mappedDocId = found ? found.docId : null;
      }

      if (mappedDocId) {
        const item = items.find(i => i.docId === mappedDocId);
        newCart[mappedDocId] = {
          qty,
          name: item ? item.name : metaName,
          price: item ? item.salePrice : metaPrice,
          mrp: item ? item.mrp : metaMrp
        };
      } else {
        orphan[key] = value;
      }

    } else {
      if (typeof value === 'object') {
        newCart[key] = {
          qty: Number(value.qty || 0),
          name: value.name,
          price: value.price,
          mrp: value.mrp
        };
      } else {
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

  cart = { ...newCart };

  if (Object.keys(orphan).length) {
    cart.__legacy_orphan__ = orphan;
  }

  saveCartToStorage();
}
/* ---------------- RENDER / UI ---------------- */
function renderItems(list) {
  const container = el('products');
  container.innerHTML = '';

  if (!list || list.length === 0) {
    container.innerHTML = `<p style="padding:20px">No items match your search.</p>`;
    return;
  }

  list.forEach(it => {
    const card = document.createElement('div');
    card.className = 'card';

    /* -------- IMAGE (full width) -------- */
    const imgEl = createSafeImage(it.image, it.name);
    imgEl.style.width = "100%";
    imgEl.style.height = "150px";
    imgEl.style.objectFit = "cover";
    imgEl.style.borderRadius = "10px";

    card.appendChild(imgEl);

    /* -------- NAME -------- */
    const nameEl = document.createElement('div');
    nameEl.className = 'item-name';
    nameEl.textContent = it.name;
    card.appendChild(nameEl);

    /* -------- PRICE ROW -------- */
    const priceRow = document.createElement('div');
    priceRow.className = 'price-row';
    priceRow.innerHTML = `
      <div class="small-mrp">MRP ₹${money(it.mrp)}</div>
      <div class="sale">₹${money(it.salePrice)}</div>
    `;
    card.appendChild(priceRow);

    /* -------- CATEGORY / STOCK -------- */
    if (it.stock <= 0) {
      const badge = document.createElement('div');
      badge.textContent = 'Out of stock';
      badge.style.color = '#c00';
      badge.style.fontSize = '13px';
      badge.style.marginTop = '6px';
      card.appendChild(badge);
    } else if (it.category) {
      const cat = document.createElement('div');
      cat.textContent = it.category;
      cat.style.fontSize = '12px';
      cat.style.color = '#666';
      cat.style.marginTop = '6px';
      card.appendChild(cat);
    }

    /* -------- QTY CONTROLS -------- */
    const docId = it.docId;
    const currentQty = cart[docId]?.qty || 0;

    const controls = document.createElement('div');
    controls.className = 'qty-controls';
    controls.innerHTML = `
      <button class="dec" data-docid="${docId}">-</button>
      <div class="qty-display" id="qty-${docId}">${currentQty}</div>
      <button class="inc" data-docid="${docId}">+</button>
    `;
    card.appendChild(controls);

    /* -------- ADD BUTTON -------- */
    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn';
    addBtn.dataset.docid = docId;
    addBtn.textContent = (it.stock <= 0) ? "Unavailable" : "Add to cart";
    addBtn.disabled = (it.stock <= 0);

    card.appendChild(addBtn);
    container.appendChild(card);
  });

  /* ----- EVENT ATTACH ----- */
  container.querySelectorAll('.inc').forEach(btn =>
    btn.onclick = () => changeQtyByDocId(btn.dataset.docid, +1)
  );

  container.querySelectorAll('.dec').forEach(btn =>
    btn.onclick = () => changeQtyByDocId(btn.dataset.docid, -1)
  );

  container.querySelectorAll('.add-btn').forEach(btn =>
    btn.onclick = () => changeQtyByDocId(btn.dataset.docid, +1)
  );
}

/* ---------------- CART FUNCTIONS ---------------- */
function changeQtyByDocId(docId, delta) {
  const it = items.find(x => x.docId === docId);
  if (!it) return;

  const current = cart[docId]?.qty || 0;
  let next = Math.max(0, current + delta);

  if (next > it.stock) next = it.stock;

  if (next <= 0) {
    delete cart[docId];
  } else {
    cart[docId] = {
      qty: next,
      name: it.name,
      price: it.salePrice,
      mrp: it.mrp
    };
  }

  const qtyEl = el(`qty-${docId}`);
  if (qtyEl) qtyEl.innerText = cart[docId]?.qty || 0;

  saveCartToStorage();
  updateCartCount();
}

function calculateTotal() {
  let total = 0;
  for (const id of Object.keys(cart)) {
    if (id === "__legacy_orphan__") continue;
    const e = cart[id];
    total += (e.qty || 0) * (e.price || 0);
  }
  return total;
}

function renderCartItems() {
  const container = el("cart-items");
  container.innerHTML = "";

  const keys = Object.keys(cart).filter(k => k !== "__legacy_orphan__");
  if (!keys.length) {
    container.innerHTML = "<p>No items in cart</p>";
    return;
  }

  keys.forEach(id => {
    const e = cart[id];
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.padding = "6px 0";

    row.innerHTML = `
      <div>${e.name} x ${e.qty}</div>
      <div>₹${money(e.qty * e.price)}</div>
    `;

    container.appendChild(row);
  });
}

function updateCartCount() {
  let count = 0;
  for (const k of Object.keys(cart)) {
    if (k === "__legacy_orphan__") continue;
    count += Number(cart[k].qty || 0);
  }
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
  const q = (el('search').value || '').trim().toLowerCase();
  const cat = el('category-filter')?.value || '';

  let out = items.slice();

  if (cat) out = out.filter(i => i.category === cat);
  if (q) out = out.filter(i =>
    i.name.toLowerCase().includes(q) ||
    (i.description || '').toLowerCase().includes(q)
  );

  renderItems(out);
}

const debouncedApply = debounce(applyFilters, 180);
el('search').addEventListener("input", debouncedApply);

/* ---------------- MODALS ---------------- */
(function setupModal() {
  const modal = el("cart-modal");
  const open1 = el("open-cart-btn");
  const open2 = el("open-cart-btn-2");
  const close = el("close-cart");

  const show = () => modal.classList.remove("hidden");
  const hide = () => modal.classList.add("hidden");

  open1.onclick = show;
  open2.onclick = show;
  close.onclick = hide;

  modal.addEventListener("click", e => {
    if (e.target === modal) hide();
  });
})();

/* ---------------- STOCK TRANSACTION ---------------- */
async function createOrderAndReduceStock(orderItems, customer) {
  try {
    await db.runTransaction(async tx => {
      const refs = [];

      // Read Phase
      for (const o of orderItems) {
        const ref = db.collection("items").doc(o.docId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error(o.name + " not found");

        refs.push({
          ref,
          name: o.name,
          qty: o.qty,
          stock: snap.data().stock || 0
        });
      }

      // Validate Phase
      for (const r of refs) {
        if (r.qty > r.stock) {
          throw new Error(`${r.name} — only ${r.stock} available`);
        }
      }

      // Write Stock
      for (const r of refs) {
        tx.update(r.ref, { stock: r.stock - r.qty });
      }

      // Create Order
      const orderRef = db.collection("orders").doc();
      tx.set(orderRef, {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        customerName: customer.name,
        customerPhone: customer.phone,
        customerAddress: customer.address,
        paymentMode: customer.payment,
        items: orderItems,
        total: orderItems.reduce((s, o) => s + o.qty * o.price, 0),
        status: "pending"
      });
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/* ---------------- WHATSAPP CHECKOUT ---------------- */
function buildWhatsAppMessage(orderItems, customer) {
  let msg = `New Order — Shopp Wholesale\n\n`;

  orderItems.forEach((o, i) => {
    msg += `${i + 1}. ${o.name} x ${o.qty} = ₹${money(o.qty * o.price)}\n`;
  });

  msg += `\nTotal: ₹${money(orderItems.reduce((s, o) => s + o.qty * o.price, 0))}`;
  msg += `\nDelivery: ${DELIVERY_PROMISE_TEXT} • ${DELIVERY_RADIUS_TEXT}`;
  msg += `\nTime: ${new Date().toLocaleString('en-IN')}`;

  msg += `\n\nName: ${customer.name}`;
  msg += `\nPhone: ${customer.phone}`;
  msg += `\nAddress: ${customer.address}`;
  msg += `\nPayment: ${customer.payment}`;

  return msg;
}

el('send-whatsapp').onclick = async () => {
  updateCartCount();

  const orderItems = [];
  for (const id of Object.keys(cart)) {
    if (id === "__legacy_orphan__") continue;

    const e = cart[id];
    orderItems.push({
      docId: id,
      name: e.name,
      qty: e.qty,
      price: e.price
    });
  }

  if (!orderItems.length) {
    alert("Cart is empty.");
    return;
  }

  const customer = {
    name: el("customer-name").value.trim(),
    phone: el("customer-phone").value.trim(),
    address: el("customer-address").value.trim(),
    payment: el("payment-mode").value
  };

  const res = await createOrderAndReduceStock(orderItems, customer);
  if (!res.ok) {
    alert("Order failed: " + res.error);
    await loadItems();
    return;
  }

  cart = {};
  saveCartToStorage();
  updateCartCount();

  const msg = encodeURIComponent(buildWhatsAppMessage(orderItems, customer));
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, "_blank");

  el("cart-modal").classList.add("hidden");
  alert("Order placed successfully!");
};

/* ---------------- INIT ---------------- */
loadCartFromStorage();
loadItems();
updateCartCount();
