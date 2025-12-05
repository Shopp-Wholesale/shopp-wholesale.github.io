// script.js — FINAL with Admin Panel, Orders list & Categories
// Requires: Firebase v8 loaded in index.html and const db = firebase.firestore()

/* ---------------- CONFIG ---------------- */
const WHATSAPP_NUMBER = "919000810084";
const DELIVERY_RADIUS_TEXT = "3 km";
const DELIVERY_PROMISE_TEXT = "Within 24 hrs";
const CART_LS_KEY = "shopp_cart_v1";
const CUST_LS_KEY = "shopp_customer_v1";

// SIMPLE admin passcode (client-side). Replace before sharing publicly.
// For production, use Firebase Auth + role-based checks.
const ADMIN_PASSCODE = "shoppadmin2025"; // <<< change this

/* ---------------- STATE ---------------- */
let items = [];       // loaded items (with docId)
let cart = {};        // { "<id>": qty }
let categories = [];  // discovered categories
let isAdmin = false;

/* ---------------- HELPERS ---------------- */
const money = v => Number(v || 0).toFixed(0);
const el = id => document.getElementById(id);

/* Safe image with fade + fallback */
function createSafeImage(src, alt) {
  const img = document.createElement("img");
  img.loading = "lazy";
  img.alt = alt || "";
  img.style.opacity = "0";
  img.style.transition = "opacity .3s";
  img.src = src && src.trim() !== "" ? src : "images/placeholder.png";
  img.onload = () => (img.style.opacity = "1");
  img.onerror = () => { img.onerror = null; img.src = "images/placeholder.png"; img.style.opacity = "1"; };
  return img;
}

/* Debounce */
function debounce(fn, ms = 180) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---------------- storage ---------------- */
function loadCartFromStorage() {
  try { const raw = localStorage.getItem(CART_LS_KEY); cart = raw ? JSON.parse(raw) : {}; } catch(e){ cart = {}; }
}
function saveCartToStorage() { localStorage.setItem(CART_LS_KEY, JSON.stringify(cart)); }

function loadCustomerFromStorage() {
  try { const raw = localStorage.getItem(CUST_LS_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function saveCustomerToStorage(obj) { localStorage.setItem(CUST_LS_KEY, JSON.stringify(obj)); }

/* ---------------- FIRESTORE: load items ---------------- */
async function loadItems() {
  try {
    const snap = await db.collection("items").get();
    if (snap.empty) {
      el("products").innerHTML = "<p style='padding:20px'>No items found.</p>";
      return;
    }

    items = []; categories = [];
    snap.forEach((doc, index) => {
      const d = doc.data() || {};
      const item = {
        id: index + 1,
        docId: doc.id,
        name: d.name || "Untitled",
        mrp: Number(d.mrp || 0),
        salePrice: Number(d.price || d.salePrice || 0),
        stock: Number(d.stock || 0),
        image: d.image || "images/placeholder.png",
        category: d.category || null,
        description: d.description || ""
      };
      items.push(item);
      if (item.category && !categories.includes(item.category)) categories.push(item.category);
    });

    renderCategoryFilter();
    renderItems(items);
    updateCartCount();
  } catch (e) {
    console.error("loadItems error", e);
    el("products").innerHTML = "<p style='padding:20px'>Failed to load items.</p>";
  }
}

/* ---------------- CATEGORY FILTER UI ---------------- */
function renderCategoryFilter() {
  const sel = el("category-filter");
  if (!sel) return;
  if (categories.length <= 1) { sel.style.display = "none"; return; }
  sel.style.display = "block";
  sel.innerHTML = `<option value="">All categories</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join('');
  sel.onchange = () => applyFilters();
}

/* ---------------- ITEMS UI ---------------- */
function renderItems(list) {
  const container = el("products");
  container.innerHTML = "";

  if (!list || !list.length) {
    container.innerHTML = "<p style='padding:20px'>No items found.</p>";
    return;
  }

  list.forEach(it => {
    const card = document.createElement("div");
    card.className = "card";

    const imgWrap = document.createElement("div");
    imgWrap.style.minHeight = "120px";
    imgWrap.appendChild(createSafeImage(it.image, it.name));
    card.appendChild(imgWrap);

    const nm = document.createElement("div");
    nm.className = "item-name";
    nm.textContent = it.name;
    card.appendChild(nm);

    const priceRow = document.createElement("div");
    priceRow.className = "price-row";
    priceRow.innerHTML = `
      <div class="small-mrp">MRP ₹${money(it.mrp)}</div>
      <div class="sale">₹${money(it.salePrice)}</div>
    `;
    card.appendChild(priceRow);

    if (it.stock <= 0) {
      const badge = document.createElement("div");
      badge.style.color = "#c00";
      badge.style.fontSize = "13px";
      badge.textContent = "Out of stock";
      card.appendChild(badge);
    } else if (it.category) {
      const cat = document.createElement("div");
      cat.style.fontSize = "12px";
      cat.style.color = "#666";
      cat.style.marginTop = "6px";
      cat.textContent = it.category;
      card.appendChild(cat);
    }

    const controls = document.createElement("div");
    controls.className = "qty-controls";
    controls.innerHTML = `
      <button class="dec" data-id="${it.id}">-</button>
      <div class="qty-display" id="qty-${it.id}">${cart[it.id] || 0}</div>
      <button class="inc" data-id="${it.id}">+</button>
    `;
    card.appendChild(controls);

    const addBtn = document.createElement("button");
    addBtn.className = "add-btn";
    addBtn.dataset.id = it.id;
    addBtn.disabled = it.stock <= 0;
    addBtn.textContent = it.stock <= 0 ? "Unavailable" : "Add to cart";
    card.appendChild(addBtn);

    container.appendChild(card);
  });

  document.querySelectorAll(".inc").forEach(b => b.onclick = e => changeQty(e.currentTarget?.dataset?.id || e.target.dataset.id, +1));
  document.querySelectorAll(".dec").forEach(b => b.onclick = e => changeQty(e.currentTarget?.dataset?.id || e.target.dataset.id, -1));
  document.querySelectorAll(".add-btn").forEach(b => b.onclick = e => changeQty(e.currentTarget?.dataset?.id || e.target.dataset.id, +1));
}

/* ---------------- CART ---------------- */
function changeQty(id, delta) {
  id = String(id);
  const it = items.find(x => String(x.id) === id);
  if (!it) return;

  cart[id] = cart[id] || 0;
  cart[id] = Math.max(0, Math.min(it.stock, cart[id] + delta));

  const qEl = el(`qty-${id}`);
  if (qEl) qEl.innerText = cart[id];

  saveCartToStorage();
  updateCartCount();
}

function calculateTotal() {
  let total = 0;
  for (const id in cart) {
    const qty = Number(cart[id]);
    if (!qty) continue;
    const it = items.find(x => String(x.id) === id);
    if (it) total += qty * it.salePrice;
  }
  return total;
}

function renderCartItems() {
  const container = el("cart-items");
  container.innerHTML = "";

  let found = false;
  for (const id in cart) {
    const qty = Number(cart[id]);
    if (!qty) continue;
    found = true;
    const it = items.find(x => String(x.id) === id);
    if (!it) continue;
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.padding = "6px 0";
    row.innerHTML = `<div>${it.name} x ${qty}</div><div>₹${money(qty * it.salePrice)}</div>`;
    container.appendChild(row);
  }
  if (!found) container.innerHTML = "<p>No items in cart</p>";
}

function updateCartCount() {
  const count = Object.values(cart).reduce((s, n) => s + Number(n || 0), 0);
  const total = calculateTotal();
  if (el("cart-count")) el("cart-count").innerText = count;
  if (el("footer-item-count")) el("footer-item-count").innerText = `${count} Items`;
  if (el("footer-total")) el("footer-total").innerText = money(total);
  if (el("total-items")) el("total-items").innerText = count;
  if (el("total-amount")) el("total-amount").innerText = money(total);
  renderCartItems();
  saveCartToStorage();
}

/* ---------------- FILTER ---------------- */
function applyFilters() {
  const q = (el("search")?.value || "").trim().toLowerCase();
  const cat = el("category-filter")?.value || "";
  let filtered = [...items];
  if (cat) filtered = filtered.filter(i => i.category === cat);
  if (q) filtered = filtered.filter(i => i.name.toLowerCase().includes(q) || (i.description||"").toLowerCase().includes(q));
  renderItems(filtered);
}
el("search")?.addEventListener("input", debounce(applyFilters, 160));

/* ---------------- CUSTOMER PREFILL ---------------- */
function loadCustomerDetails() {
  const obj = loadCustomerFromStorage();
  if (!obj) return;
  if (el("customer-name")) el("customer-name").value = obj.name || "";
  if (el("customer-phone")) el("customer-phone").value = obj.phone || "";
  if (el("customer-address")) el("customer-address").value = obj.address || "";
  if (el("payment-mode")) el("payment-mode").value = obj.payment || "Cash";
}

/* ---------------- FIRESTORE TRANSACTION ---------------- */
async function createOrderAndReduceStock(orderItems, customer) {
  try {
    await db.runTransaction(async tx => {
      for (const o of orderItems) {
        const ref = db.collection("items").doc(o.docId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error(`${o.name} not found`);
        const current = Number(snap.data().stock || 0);
        if (o.qty > current) throw new Error(`${o.name} — only ${current} left`);
        tx.update(ref, { stock: current - o.qty });
      }
      const orderRef = db.collection("orders").doc();
      tx.set(orderRef, {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        customerName: customer.name,
        customerPhone: customer.phone,
        customerAddress: customer.address,
        paymentMode: customer.payment,
        items: orderItems,
        total: orderItems.reduce((s,x)=>s + x.qty * x.price, 0),
        status: "pending"
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/* ---------------- WHATSAPP BUILD + CHECKOUT ---------------- */
function buildWhatsAppMessage(orderItems, customer) {
  let msg = `New Order — Shopp Wholesale\n\n`;
  orderItems.forEach((o, i) => { msg += `${i+1}. ${o.name} x ${o.qty} = ₹${money(o.qty * o.price)}\n`; });
  msg += `\nTotal: ₹${money(orderItems.reduce((t,o)=>t + o.qty * o.price, 0))}`;
  msg += `\nDelivery Promise: ${DELIVERY_PROMISE_TEXT} • Radius: ${DELIVERY_RADIUS_TEXT}`;
  msg += `\nOrder Time: ${new Date().toLocaleString("en-IN")}`;
  msg += `\n\nName: ${customer.name}\nPhone: ${customer.phone}\nAddress: ${customer.address}\nPayment: ${customer.payment}`;
  return msg;
}

el("send-whatsapp")?.addEventListener("click", async () => {
  updateCartCount();
  const orderItems = [];
  for (const id in cart) {
    const qty = Number(cart[id]);
    if (!qty) continue;
    const it = items.find(x => String(x.id) === id);
    if (!it) continue;
    orderItems.push({ docId: it.docId, name: it.name, qty, price: it.salePrice });
  }
  if (!orderItems.length) { alert("Cart is empty!"); return; }

  const customer = {
    name: el("customer-name")?.value.trim() || "---",
    phone: el("customer-phone")?.value.trim() || "---",
    address: el("customer-address")?.value.trim() || "---",
    payment: el("payment-mode")?.value || "---"
  };
  saveCustomerToStorage(customer);

  const btn = el("send-whatsapp");
  btn.disabled = true;
  const old = btn.innerText;
  btn.innerText = "Processing...";

  const res = await createOrderAndReduceStock(orderItems, customer);
  if (!res.ok) {
    alert(res.error || "Order failed");
    btn.disabled = false; btn.innerText = old;
    await loadItems(); // reload to get current stock
    return;
  }

  // local updates
  orderItems.forEach(o => {
    const t = items.find(x => x.docId === o.docId);
    if (t) t.stock = Math.max(0, t.stock - o.qty);
  });

  cart = {};
  saveCartToStorage();
  updateCartCount();

  const waMsg = buildWhatsAppMessage(orderItems, customer);
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waMsg)}`);

  btn.disabled = false;
  btn.innerText = old;
});

/* ---------------- MODAL Controls ---------------- */
el("open-cart-btn")?.addEventListener("click", () => el("cart-modal")?.classList.remove("hidden"));
el("open-cart-btn-2")?.addEventListener("click", () => el("cart-modal")?.classList.remove("hidden"));
el("close-cart")?.addEventListener("click", () => el("cart-modal")?.classList.add("hidden"));
window.addEventListener("click", (ev) => { if (ev.target === el("cart-modal")) el("cart-modal").classList.add("hidden"); });

/* ---------------- ADMIN: login and UI ---------------- */
el("open-admin-btn")?.addEventListener("click", async () => {
  // Basic passcode prompt (replace with Firebase Auth for production)
  const pass = prompt("Enter admin passcode:");
  if (!pass) return;
  if (pass !== ADMIN_PASSCODE) { alert("Invalid passcode"); return; }
  isAdmin = true;
  el("admin-modal")?.classList.remove("hidden");
  renderAdminItems();
});

// close admin
el("close-admin")?.addEventListener("click", () => el("admin-modal")?.classList.add("hidden"));

// refresh items button in admin
el("refresh-items-btn")?.addEventListener("click", async () => { await loadItems(); renderAdminItems(); });

/* ---------------- ADMIN: render editable items list ---------------- */
function renderAdminItems() {
  const wrap = el("admin-items-list");
  if (!wrap) return;
  wrap.innerHTML = "";

  if (!items.length) { wrap.innerHTML = "<p>No items</p>"; return; }

  items.forEach(it => {
    const row = document.createElement("div");
    row.style.border = "1px solid #eee";
    row.style.padding = "10px";
    row.style.marginBottom = "8px";
    row.style.borderRadius = "6px";
    row.innerHTML = `
      <div style="display:flex; gap:8px; align-items:center;">
        <div style="width:64px; height:64px; overflow:hidden; border-radius:6px"></div>
        <div style="flex:1">
          <div style="font-weight:600">${it.name}</div>
          <div style="color:#666; font-size:13px">${it.docId}</div>
        </div>
      </div>

      <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap">
        <input data-field="name" data-doc="${it.docId}" value="${escapeHtml(it.name)}" placeholder="Name" style="flex:1;min-width:180px"/>
        <input data-field="price" data-doc="${it.docId}" value="${money(it.salePrice)}" placeholder="Price" style="width:110px" />
        <input data-field="mrp" data-doc="${it.docId}" value="${money(it.mrp)}" placeholder="MRP" style="width:110px" />
        <input data-field="stock" data-doc="${it.docId}" value="${it.stock}" placeholder="Stock" style="width:110px" />
        <input data-field="category" data-doc="${it.docId}" value="${escapeHtml(it.category||'')}" placeholder="Category" style="width:160px" />
      </div>

      <div style="margin-top:8px; display:flex; gap:8px; align-items:center">
        <input data-field="image" data-doc="${it.docId}" value="${escapeHtml(it.image)}" placeholder="Image URL" style="flex:1" />
        <button data-doc="${it.docId}" class="admin-update-btn" type="button">Update</button>
      </div>
    `;

    // small thumbnail
    const thumb = row.querySelector("div > div");
    thumb && thumb.appendChild(createSafeImage(it.image, it.name));

    wrap.appendChild(row);
  });

  // attach update handlers
  wrap.querySelectorAll(".admin-update-btn").forEach(btn => {
    btn.onclick = async (ev) => {
      const docId = btn.dataset.doc;
      // collect inputs for this doc
      const inputs = wrap.querySelectorAll(`[data-doc="${docId}"]`);
      const updateObj = {};
      inputs.forEach(inp => {
        const fld = inp.dataset.field;
        const val = inp.value;
        if (fld === "price" || fld === "mrp") {
          if (val !== "") updateObj[(fld === "price") ? "price" : "mrp"] = Number(val);
        } else if (fld === "stock") {
          if (val !== "") updateObj.stock = Number(val);
        } else if (fld === "name") {
          if (val !== "") updateObj.name = val;
        } else if (fld === "category") {
          updateObj.category = val;
        } else if (fld === "image") {
          updateObj.image = val;
        }
      });

      try {
        await db.collection("items").doc(docId).update(updateObj);
        alert("Updated");
        await loadItems(); // refresh
        renderAdminItems();
      } catch (e) {
        console.error("admin update", e);
        alert("Update failed: " + (e.message || e));
      }
    };
  });
}

/* ---------------- ORDERS VIEW (admin) ---------------- */
el("view-orders-btn")?.addEventListener("click", async () => {
  if (!isAdmin) { alert("Admin only"); return; }
  el("orders-modal")?.classList.remove("hidden");
  await renderOrders();
});
el("close-orders")?.addEventListener("click", () => el("orders-modal")?.classList.add("hidden"));

async function renderOrders() {
  const wrap = el("orders-list");
  if (!wrap) return;
  wrap.innerHTML = "<p>Loading...</p>";
  try {
    const snap = await db.collection("orders").orderBy("createdAt", "desc").limit(200).get();
    if (snap.empty) { wrap.innerHTML = "<p>No orders</p>"; return; }
    wrap.innerHTML = "";
    snap.forEach(doc => {
      const o = doc.data();
      const created = (o.createdAt && o.createdAt.toDate) ? o.createdAt.toDate().toLocaleString() : "";
      const card = document.createElement("div");
      card.style.border = "1px solid #eee";
      card.style.padding = "10px";
      card.style.marginBottom = "8px";
      card.style.borderRadius = "6px";
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:600">${o.customerName || "---"}</div>
          <div style="font-size:12px;color:#666">${created}</div>
        </div>
        <div style="margin-top:6px;font-size:13px">
          ${ (o.items || []).map(it => `${escapeHtml(it.name)} x ${it.qty} = ₹${money(it.price * it.qty)}`).join("<br/>") }
        </div>
        <div style="margin-top:8px;color:#333;font-weight:600">Total: ₹${money(o.total || 0)}</div>
        <div style="margin-top:8px;font-size:13px;color:#666">Phone: ${escapeHtml(o.customerPhone||'---')} | Payment: ${escapeHtml(o.paymentMode||'---')}</div>
      `;
      wrap.appendChild(card);
    });
  } catch (e) {
    console.error("renderOrders", e);
    wrap.innerHTML = "<p>Failed to load orders</p>";
  }
}

/* ---------------- UTIL ---------------- */
function escapeHtml(s) {
  if (!s && s !== 0) return "";
  return String(s).replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[m]; });
}

/* ---------------- INIT & UI bindings ---------------- */
function attachModalControls() {
  el("open-cart-btn")?.addEventListener("click", () => el("cart-modal")?.classList.remove("hidden"));
  el("open-cart-btn-2")?.addEventListener("click", () => el("cart-modal")?.classList.remove("hidden"));
  el("close-cart")?.addEventListener("click", () => el("cart-modal")?.classList.add("hidden"));
  const modal = el("cart-modal");
  if (modal) modal.addEventListener("click", (ev) => { if (ev.target === modal) el("cart-modal").classList.add("hidden"); });
}
attachModalControls();

function init() {
  loadCartFromStorage();
  loadCustomerDetails();
  loadItems();
}
init();
