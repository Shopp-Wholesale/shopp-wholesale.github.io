// script.js — FINAL VERSION (Stable + Prefill Fix + Atomic Stock Reduce)

/* ---------------- CONFIG ---------------- */
const WHATSAPP_NUMBER = "919000810084";
const DELIVERY_RADIUS_TEXT = "3 km";
const DELIVERY_PROMISE_TEXT = "Within 24 hrs";
const CART_LS_KEY = "shopp_cart_v1";
const CUST_LS_KEY = "shopp_customer_v1";

/* ---------------- STATE ---------------- */
let items = [];
let cart = {};
let categories = [];

/* ---------------- HELPERS ---------------- */
const money = v => Number(v || 0).toFixed(0);
const el = id => document.getElementById(id);

/* Image loader */
function createSafeImage(src, alt) {
  const img = document.createElement("img");
  img.loading = "lazy";
  img.alt = alt || "";
  img.style.opacity = "0";
  img.style.transition = "opacity .3s";
  img.src = src && src.trim() ? src : "images/placeholder.png";

  img.onload = () => (img.style.opacity = "1");
  img.onerror = () => {
    img.src = "images/placeholder.png";
    img.style.opacity = "1";
  };

  return img;
}

/* Debounce */
function debounce(fn, ms = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ---------------- LOCAL STORAGE ---------------- */
function loadCartFromStorage() {
  try {
    cart = JSON.parse(localStorage.getItem(CART_LS_KEY)) || {};
  } catch {
    cart = {};
  }
}

function saveCartToStorage() {
  localStorage.setItem(CART_LS_KEY, JSON.stringify(cart));
}

function loadCustomerFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(CUST_LS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveCustomerToStorage(obj) {
  localStorage.setItem(CUST_LS_KEY, JSON.stringify(obj));
}

/* ---------------- LOAD ITEMS FROM FIREBASE ---------------- */
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
      const d = doc.data();
      const item = {
        id: index + 1,
        docId: doc.id,
        name: d.name,
        mrp: Number(d.mrp || 0),
        salePrice: Number(d.price || d.salePrice || 0),
        stock: Number(d.stock || 0),
        image: d.image,
        category: d.category || null,
        description: d.description || ""
      };

      items.push(item);
      if (item.category && !categories.includes(item.category))
        categories.push(item.category);
    });

    renderCategoryFilter();
    renderItems(items);
    updateCartCount();
  } catch (e) {
    console.error(e);
    el("products").innerHTML = "<p style='padding:20px'>Error loading items.</p>";
  }
}

/* ---------------- CATEGORY FILTER ---------------- */
function renderCategoryFilter() {
  if (categories.length <= 1) return;

  const sel = el("category-filter");
  sel.style.display = "block";
  sel.innerHTML =
    `<option value="">All categories</option>` +
    categories.map(c => `<option value="${c}">${c}</option>`).join("");

  sel.onchange = () => applyFilters();
}

/* ---------------- RENDER ITEMS ---------------- */
function renderItems(list) {
  const container = el("products");
  container.innerHTML = "";

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
      <div class="sale">₹${money(it.salePrice)}</div>`;
    card.appendChild(priceRow);

    if (it.stock <= 0) {
      const badge = document.createElement("div");
      badge.textContent = "Out of stock";
      badge.style.color = "red";
      card.appendChild(badge);
    }

    card.innerHTML += `
      <div class="qty-controls">
        <button class="dec" data-id="${it.id}">-</button>
        <div class="qty-display" id="qty-${it.id}">${cart[it.id] || 0}</div>
        <button class="inc" data-id="${it.id}">+</button>
      </div>
      <button class="add-btn" data-id="${it.id}" ${it.stock <= 0 ? "disabled" : ""}>
        ${it.stock <= 0 ? "Unavailable" : "Add to cart"}
      </button>`;

    container.appendChild(card);
  });

  document.querySelectorAll(".inc").forEach(btn =>
    btn.addEventListener("click", e => changeQty(e.target.dataset.id, +1))
  );

  document.querySelectorAll(".dec").forEach(btn =>
    btn.addEventListener("click", e => changeQty(e.target.dataset.id, -1))
  );

  document.querySelectorAll(".add-btn").forEach(btn =>
    btn.addEventListener("click", e => changeQty(e.target.dataset.id, +1))
  );
}

/* ---------------- CART ---------------- */
function changeQty(id, delta) {
  id = String(id);
  const it = items.find(x => String(x.id) === id);
  if (!it) return;

  cart[id] = Math.max(0, Math.min(it.stock, (cart[id] || 0) + delta));

  el(`qty-${id}`).innerText = cart[id];
  saveCartToStorage();
  updateCartCount();
}

function calculateTotal() {
  let total = 0;
  for (const id in cart) {
    const qty = cart[id];
    const it = items.find(x => String(x.id) === id);
    if (it) total += qty * it.salePrice;
  }
  return total;
}

function renderCartItems() {
  const container = el("cart-items");
  container.innerHTML = "";

  let filled = false;

  for (const id in cart) {
    const qty = cart[id];
    if (qty <= 0) continue;
    filled = true;

    const it = items.find(x => String(x.id) === id);

    container.innerHTML += `
      <div style="display:flex; justify-content:space-between; padding:6px 0;">
        <div>${it.name} x ${qty}</div>
        <div>₹${money(qty * it.salePrice)}</div>
      </div>`;
  }

  if (!filled) container.innerHTML = "<p>No items in cart</p>";
}

function updateCartCount() {
  const count = Object.values(cart).reduce((s, n) => s + n, 0);
  const total = calculateTotal();

  el("cart-count").innerText = count;
  el("footer-item-count").innerText = `${count} Items`;
  el("footer-total").innerText = money(total);
  el("total-items").innerText = count;
  el("total-amount").innerText = money(total);

  renderCartItems();
}

/* ---------------- SEARCH + FILTER ---------------- */
function applyFilters() {
  const q = (el("search").value || "").toLowerCase();
  const cat = el("category-filter").value;

  let filtered = items;

  if (cat) filtered = filtered.filter(x => x.category === cat);
  if (q) filtered = filtered.filter(
    x =>
      x.name.toLowerCase().includes(q) ||
      (x.description || "").toLowerCase().includes(q)
  );

  renderItems(filtered);
}

el("search").addEventListener("input", debounce(applyFilters, 180));

/* ---------------- CUSTOMER DETAIL PREFILL ---------------- */
function loadCustomerDetailsIntoForm() {
  const saved = loadCustomerFromStorage();

  el("customer-name").value = saved.name || "";
  el("customer-phone").value = saved.phone || "";
  el("customer-address").value = saved.address || "";
  el("payment-mode").value = saved.payment || "Cash";
}

/* ---------------- MODAL OPEN FIX (MAIN UX FIX) ---------------- */
function showCartModal() {
  loadCustomerDetailsIntoForm(); // ← ALWAYS PREFILL BEFORE SHOWING
  el("cart-modal").classList.remove("hidden");
}

function hideCartModal() {
  el("cart-modal").classList.add("hidden");
}

el("open-cart-btn").onclick = showCartModal;
el("open-cart-btn-2").onclick = showCartModal;
el("close-cart").onclick = hideCartModal;

/* ---------------- FIRESTORE ORDER + STOCK REDUCE ---------------- */
async function createOrderAndReduceStock(orderItems, customer) {
  try {
    await db.runTransaction(async tx => {
      for (const o of orderItems) {
        const ref = db.collection("items").doc(o.docId);
        const snap = await tx.get(ref);
        const current = snap.data().stock;

        if (o.qty > current) throw new Error(o.name + " stock insufficient");

        tx.update(ref, { stock: current - o.qty });
      }

      const orderRef = db.collection("orders").doc();
      tx.set(orderRef, {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        items: orderItems,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerAddress: customer.address,
        paymentMode: customer.payment,
        total: orderItems.reduce((s, x) => s + x.qty * x.price, 0),
        status: "pending"
      });
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/* ---------------- WHATSAPP CHECKOUT ---------------- */
el("send-whatsapp").onclick = async () => {
  updateCartCount();

  const orderItems = [];
  for (const id in cart) {
    const qty = cart[id];
    if (qty <= 0) continue;

    const it = items.find(x => String(x.id) === id);
    orderItems.push({ docId: it.docId, name: it.name, qty, price: it.salePrice });
  }

  if (!orderItems.length) return alert("Cart is empty!");

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

  let msg = `New Order — Shopp Wholesale\n\n`;
  orderItems.forEach((o, i) => {
    msg += `${i + 1}. ${o.name} x ${o.qty} = ₹${money(o.qty * o.price)}\n`;
  });

  msg += `\nTotal: ₹${money(
    orderItems.reduce((s, x) => s + x.qty * x.price, 0)
  )}`;
  msg += `\nDelivery: ${DELIVERY_PROMISE_TEXT} • ${DELIVERY_RADIUS_TEXT}`;
  msg += `\nTime: ${new Date().toLocaleString("en-IN")}`;
  msg += `\n\nName: ${customer.name}`;
  msg += `\nPhone: ${customer.phone}`;
  msg += `\nAddress: ${customer.address}`;
  msg += `\nPayment: ${customer.payment}`;

  window.open(
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`,
    "_blank"
  );

  btn.disabled = false;
  btn.innerText = old;
};

/* ---------------- INIT ---------------- */
function init() {
  loadCartFromStorage();
  loadCustomerDetailsIntoForm();
  loadItems();
}
init();
