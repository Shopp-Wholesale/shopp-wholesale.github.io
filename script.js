// script.js — FINAL VERSION (Atomic Stock Reduce + WhatsApp Checkout)
// Requirements: Firebase v8 loaded in index.html, and db = firebase.firestore()

/* ---------------- CONFIG ---------------- */
const WHATSAPP_NUMBER = "919000810084";
const DELIVERY_RADIUS_TEXT = "3 km";
const DELIVERY_PROMISE_TEXT = "Within 24 hrs";
const CART_LS_KEY = "shopp_cart_v1";
const CUST_LS_KEY = "shopp_customer_v1";

/* ---------------- STATE ---------------- */
let items = [];       // list of items from Firestore
let cart = {};        // { "<id>": qty }
let categories = [];  // discovered categories

/* ---------------- HELPERS ---------------- */
const money = v => Number(v || 0).toFixed(0);
const el = id => document.getElementById(id);

/* Safe image with fallback + fade */
function createSafeImage(src, alt) {
  const img = document.createElement("img");
  img.loading = "lazy";
  img.alt = alt || "";
  img.style.opacity = "0";
  img.style.transition = "opacity .3s";
  img.src = src && src.trim() !== "" ? src : "images/placeholder.png";

  img.onload = () => (img.style.opacity = "1");
  img.onerror = () => {
    img.onerror = null;
    img.src = "images/placeholder.png";
    img.style.opacity = "1";
  };

  return img;
}

/* Debounce */
function debounce(fn, ms = 180) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/* ---------------- localStorage ---------------- */
function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_LS_KEY);
    cart = raw ? JSON.parse(raw) : {};
  } catch {
    cart = {};
  }
}
function saveCartToStorage() {
  localStorage.setItem(CART_LS_KEY, JSON.stringify(cart));
}

function loadCustomerFromStorage() {
  try {
    const raw = localStorage.getItem(CUST_LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveCustomerToStorage(obj) {
  localStorage.setItem(CUST_LS_KEY, JSON.stringify(obj));
}

/* ---------------- FIREBASE: LOAD ITEMS ---------------- */
async function loadItems() {
  try {
    const snap = await db.collection("items").get();

    if (snap.empty) {
      el("products").innerHTML = "<p style='padding:20px'>No items found.</p>";
      return;
    }

    items = [];
    categories = [];

    snap.forEach((doc, index) => {
      const d = doc.data() || {};
      const item = {
        id: index + 1,             // local ID
        docId: doc.id,             // Firestore document ID
        name: d.name || "Untitled",
        mrp: Number(d.mrp || 0),
        salePrice: Number(d.price || d.salePrice || 0),
        stock: Number(d.stock || 0),
        image: d.image || "images/placeholder.png",
        category: d.category || null,
        description: d.description || ""
      };
      items.push(item);

      if (item.category && !categories.includes(item.category)) {
        categories.push(item.category);
      }
    });

    renderCategoryFilter();
    renderItems(items);
    updateCartCount();
  } catch (e) {
    console.error(e);
    el("products").innerHTML = "<p style='padding:20px'>Failed to load items.</p>";
  }
}

/* ---------------- CATEGORY FILTER ---------------- */
function renderCategoryFilter() {
  if (categories.length <= 1) return;

  const existing = el("category-filter");
  if (existing) {
    existing.style.display = "block";
    existing.innerHTML =
      `<option value="">All categories</option>` +
      categories.map(c => `<option value="${c}">${c}</option>`).join("");
    existing.onchange = () => applyFilters();
    return;
  }
}

/* ---------------- ITEMS UI ---------------- */
function renderItems(list) {
  const container = el("products");
  container.innerHTML = "";

  if (!list.length) {
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

  document.querySelectorAll(".inc").forEach(b =>
    b.addEventListener("click", e => changeQty(e.target.dataset.id, +1))
  );
  document.querySelectorAll(".dec").forEach(b =>
    b.addEventListener("click", e => changeQty(e.target.dataset.id, -1))
  );
  document.querySelectorAll(".add-btn").forEach(b =>
    b.addEventListener("click", e => changeQty(e.target.dataset.id, +1))
  );
}

/* ---------------- CART FUNCTIONS ---------------- */
function changeQty(id, delta) {
  id = String(id);
  const it = items.find(x => String(x.id) === id);
  if (!it) return;

  cart[id] = cart[id] || 0;
  cart[id] = Math.max(0, Math.min(it.stock, cart[id] + delta));

  el(`qty-${id}`).innerText = cart[id];
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

  let has = false;
  for (const id in cart) {
    const qty = Number(cart[id]);
    if (!qty) continue;
    has = true;

    const it = items.find(x => String(x.id) === id);
    if (!it) continue;

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.padding = "6px 0";
    row.innerHTML = `${it.name} x ${qty} <div>₹${money(qty * it.salePrice)}</div>`;
    container.appendChild(row);
  }

  if (!has) container.innerHTML = "<p>No items in cart</p>";
}

function updateCartCount() {
  const count = Object.values(cart).reduce((s, n) => s + Number(n || 0), 0);
  const total = calculateTotal();

  el("cart-count").innerText = count;
  el("footer-item-count").innerText = `${count} Items`;
  el("footer-total").innerText = money(total);
  el("total-items").innerText = count;
  el("total-amount").innerText = money(total);

  renderCartItems();
}

/* ---------------- FILTER ---------------- */
function applyFilters() {
  const q = (el("search")?.value || "").toLowerCase();
  const cat = el("category-filter")?.value || "";

  let filtered = [...items];

  if (cat) filtered = filtered.filter(i => i.category === cat);
  if (q) filtered = filtered.filter(i =>
    i.name.toLowerCase().includes(q) ||
    (i.description || "").toLowerCase().includes(q)
  );

  renderItems(filtered);
}
document.getElementById("search").addEventListener(
  "input",
  debounce(applyFilters, 180)
);

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
        if (o.qty > current)
          throw new Error(`${o.name} — only ${current} left`);

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
        total: orderItems.reduce((s, x) => s + x.qty * x.price, 0),
        status: "pending"
      });
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/* ---------------- WHATSAPP MESSAGE ---------------- */
function buildWhatsAppMessage(orderItems, customer) {
  let msg = `New Order — Shopp Wholesale\n\n`;

  orderItems.forEach((o, i) => {
    msg += `${i + 1}. ${o.name} x ${o.qty} = ₹${money(o.qty * o.price)}\n`;
  });

  msg += `\nTotal: ₹${money(orderItems.reduce((t, o) => t + o.qty * o.price, 0))}`;
  msg += `\nDelivery Promise: ${DELIVERY_PROMISE_TEXT} • Radius: ${DELIVERY_RADIUS_TEXT}`;
  msg += `\nOrder Time: ${new Date().toLocaleString("en-IN")}`;

  msg += `\n\nName: ${customer.name}`;
  msg += `\nPhone: ${customer.phone}`;
  msg += `\nAddress: ${customer.address}`;
  msg += `\nPayment: ${customer.payment}`;

  return msg;
}

/* ---------------- CHECKOUT ---------------- */
document.getElementById("send-whatsapp").addEventListener("click", async () => {
  updateCartCount();

  const orderItems = [];
  for (const id in cart) {
    const qty = Number(cart[id]);
    if (!qty) continue;

    const it = items.find(x => String(x.id) === id);
    if (!it) continue;

    orderItems.push({
      docId: it.docId,
      name: it.name,
      qty,
      price: it.salePrice
    });
  }

  if (!orderItems.length) {
    alert("Cart is empty!");
    return;
  }

  const customer = {
    name: el("customer-name").value.trim() || "---",
    phone: el("customer-phone").value.trim() || "---",
    address: el("customer-address").value.trim() || "---",
    payment: el("payment-mode").value || "---"
  };

  saveCustomerToStorage(customer);

  const btn = el("send-whatsapp");
  btn.disabled = true;
  const old = btn.innerText;
  btn.innerText = "Processing...";

  const res = await createOrderAndReduceStock(orderItems, customer);

  if (!res.ok) {
    alert(res.error);
    btn.disabled = false;
    btn.innerText = old;
    await loadItems();
    return;
  }

  cart = {};
  saveCartToStorage();
  updateCartCount();

  const waMsg = buildWhatsAppMessage(orderItems, customer);
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waMsg)}`);

  btn.disabled = false;
  btn.innerText = old;
});

/* ---------------- INIT ---------------- */
function init() {
  loadCartFromStorage();
  loadCustomerDetails();
  loadItems();
}
init();
