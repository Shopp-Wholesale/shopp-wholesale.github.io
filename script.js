// script.js — FINAL STABLE RELEASE (v9.2)
// Updated: Removed redundant Add Button & Fixed Full-Width Image Logic

/* ---------------- CONFIG ---------------- */
const WHATSAPP_NUMBER = "919000810084";
const DELIVERY_RADIUS_TEXT = "3 km";
const DELIVERY_PROMISE_TEXT = "Within 24 hrs";
const CART_LS_KEY = "shopp_cart_v1";

/* ---------------- LOCATION LOCK / ADMIN BYPASS ---------------- */
const SHOP_LAT = 17.3526633;
const SHOP_LNG = 78.3860868;
const SERVICE_RADIUS_KM = 3;

const ADMIN_PIN = "Sreekanth@1";
const ADMIN_SESSION_KEY = "shopp_admin_override";

/* ---------------- UTILITIES ---------------- */
const money = v => Number(v || 0).toFixed(0);
const el = id => document.getElementById(id);

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function verifyLocationAccess() {
  return new Promise(res => {
    if (!navigator.geolocation) return res(false);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const d = distanceKm(pos.coords.latitude, pos.coords.longitude, SHOP_LAT, SHOP_LNG);
        res(d <= SERVICE_RADIUS_KM);
      },
      () => res(false),
      { maximumAge: 60000, timeout: 8000 }
    );
  });
}

function isAdminSession() {
  try { return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1"; }
  catch { return false; }
}

function setAdminSession(flag = true) {
  try {
    flag ? sessionStorage.setItem(ADMIN_SESSION_KEY, "1") : sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch { }
}

/* ---------------- SAFE IMAGE HELPER ---------------- */
function createSafeImage(src, alt = "") {
  const img = document.createElement("img");
  img.loading = "lazy";
  img.alt = alt;
  img.className = "product-img";
  img.src = src && src.trim() ? src : "images/placeholder.png";
  img.style.opacity = 0;
  img.style.transition = "opacity .25s";

  img.onload = () => (img.style.opacity = 1);
  img.onerror = () => {
    img.onerror = null;
    img.src = "images/placeholder.png";
    img.style.opacity = 1;
  };

  return img;
}

/* ---------------- DEBOUNCE ---------------- */
function debounce(fn, ms = 150) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/* ---------------- GLOBAL STATE ---------------- */
let items = [];
let cart = {};

/* ---------------- CART LOAD / SAVE ---------------- */
function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_LS_KEY);
    if (!raw) return (cart = {});
    const parsed = JSON.parse(raw);
    cart = (parsed && typeof parsed === "object") ? parsed : {};
  } catch {
    cart = {};
  }
}

function saveCartToStorage() {
  try {
    localStorage.setItem(CART_LS_KEY, JSON.stringify(cart));
  } catch { }
}

/* ---------------- FIRESTORE LOAD ITEMS ---------------- */
async function loadItems() {
  try {
    const snap = await db.collection("items").get();
    items = [];
    let idx = 1;

    snap.forEach(doc => {
      const d = doc.data() || {};
      items.push({
        id: idx++,
        docId: doc.id,
        name: d.name || "Unnamed",
        mrp: Number(d.mrp || 0),
        salePrice: Number(d.price || 0),
        stock: Number(d.stock || 0),
        category: d.category || "",
        description: d.description || "",
        image: d.image || "images/placeholder.png"
      });
    });

    renderItems(items);
    updateCartCount();
  } catch (e) {
    console.error("Firestore error:", e);
    el("products").innerHTML = "<p style='padding:20px'>Failed to load items</p>";
  }
}

/* ---------------- RENDER ITEMS ---------------- */
function renderItems(list) {
  const box = el("products");
  if (!box) return;
  box.innerHTML = "";

  if (!list.length) {
    box.innerHTML = `<p style="padding:20px">No items found</p>`;
    return;
  }

  list.forEach(it => {
    const card = document.createElement("div");
    card.className = "card";

    // 1. Image Box (Full Width Container)
    const imgBox = document.createElement("div");
    imgBox.className = "image-box";
    imgBox.appendChild(createSafeImage(it.image, it.name));
    card.appendChild(imgBox);

    // 2. Name
    const nm = document.createElement("div");
    nm.className = "item-name";
    nm.textContent = it.name;
    card.appendChild(nm);

    // 3. Price
    const price = document.createElement("div");
    price.className = "price-row";
    price.innerHTML = `
      <div class="small-mrp">MRP ₹${money(it.mrp)}</div>
      <div class="sale">₹${money(it.salePrice)}</div>
    `;
    card.appendChild(price);

    // 4. Stock / Admin Info
    if (it.stock <= 0) {
      const s = document.createElement("div");
      s.className = "stock-status";
      s.style.color = "#c00";
      s.style.fontSize = "12px";
      s.textContent = "Out of stock";
      card.appendChild(s);
    }

    if (isAdminSession() && it.category) {
      const c = document.createElement("div");
      c.style.fontSize = "11px";
      c.style.color = "#888";
      c.style.padding = "0 10px";
      c.textContent = "Cat: " + it.category;
      card.appendChild(c);
    }

    // 5. Quantity Controls (Always visible, Add Button removed)
    const controls = document.createElement("div");
    controls.className = "qty-controls";
    const cur = cart[it.docId]?.qty || 0;

    controls.innerHTML = `
      <button class="qty-btn dec" data-id="${it.docId}">-</button>
      <div class="qty-display" id="qty-${it.docId}">${cur}</div>
      <button class="qty-btn inc" data-id="${it.docId}">+</button>
    `;
    card.appendChild(controls);

    box.appendChild(card);
  });

  // Attach Events
  box.querySelectorAll(".inc").forEach(b => 
    b.onclick = () => changeQty(b.dataset.id, 1)
  );
  box.querySelectorAll(".dec").forEach(b => 
    b.onclick = () => changeQty(b.dataset.id, -1)
  );
}

/* ---------------- CART MODIFY ---------------- */
function changeQty(docId, delta) {
  const it = items.find(x => x.docId === docId);
  if (!it) return;

  const cur = cart[docId]?.qty || 0;
  let next = cur + delta;

  if (next < 0) next = 0;
  if (next > it.stock) {
      alert("Only " + it.stock + " items left in stock");
      next = it.stock;
  }

  if (next === 0) {
    delete cart[docId];
  } else {
    cart[docId] = {
      qty: next,
      name: it.name,
      price: it.salePrice,
      mrp: it.mrp
    };
  }

  const d = el(`qty-${docId}`);
  if (d) d.textContent = next;

  saveCartToStorage();
  updateCartCount();
}

/* ---------------- CART TOTALS & RENDERING ---------------- */
function calculateTotal() {
  return Object.values(cart).reduce((sum, it) => sum + (it.qty * it.price), 0);
}

function updateCartCount() {
  let count = 0;
  Object.values(cart).forEach(it => (count += it.qty));

  const countEl = el("cart-count");
  if (countEl) countEl.innerText = count;
  
  if (el("footer-item-count")) el("footer-item-count").innerText = `${count} Items`;
  if (el("footer-total")) el("footer-total").innerText = money(calculateTotal());
  if (el("total-items")) el("total-items").innerText = count;
  if (el("total-amount")) el("total-amount").innerText = money(calculateTotal());

  renderCartItems();
}

function renderCartItems() {
  const box = el("cart-items");
  if (!box) return;
  box.innerHTML = "";

  Object.keys(cart).forEach(id => {
    const it = cart[id];
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.padding = "6px 0";
    row.innerHTML = `<div>${it.name} x ${it.qty}</div><div>₹${money(it.qty * it.price)}</div>`;
    box.appendChild(row);
  });

  if (!box.innerHTML.trim()) box.innerHTML = "<p>No items in cart</p>";
}

/* ---------------- SEARCH ---------------- */
const applyFilters = debounce(() => {
  const q = el("search").value.toLowerCase();
  const filtered = items.filter(it => it.name.toLowerCase().includes(q));
  renderItems(filtered);
}, 150);

if (el("search")) el("search").addEventListener("input", applyFilters);

/* ---------------- MODALS ---------------- */
(function setupModals() {
  const cartModal = el("cart-modal");
  const close = el("close-cart");

  const show = () => cartModal?.classList.remove("hidden");
  const hide = () => cartModal?.classList.add("hidden");

  [el("open-cart-btn"), el("open-cart-btn-2")].forEach(b => {
    if (b) b.onclick = show;
  });

  if (close) close.onclick = hide;
  if (cartModal) cartModal.onclick = e => { if (e.target === cartModal) hide(); };
})();

/* ---------------- CHECKOUT & STOCK ---------------- */
async function createOrderAndReduceStock(orderItems, customer) {
  try {
    await db.runTransaction(async tx => {
      const updates = [];
      for (const o of orderItems) {
        const ref = db.collection("items").doc(o.docId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error(`${o.name} not found`);
        const stock = snap.data().stock || 0;
        if (o.qty > stock) throw new Error(`Only ${stock} left for ${o.name}`);
        updates.push({ ref, newStock: stock - o.qty });
      }

      updates.forEach(u => tx.update(u.ref, { stock: u.newStock }));

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

/* ---------------- WHATSAPP ---------------- */
(function setupWhatsapp() {
  const btn = el("send-whatsapp");
  if (!btn) return;

  btn.onclick = async () => {
    const orderItems = Object.entries(cart).map(([id, v]) => ({ docId: id, ...v }));
    if (!orderItems.length) return alert("Cart is empty");

    const customer = {
      name: el("customer-name").value.trim(),
      phone: el("customer-phone").value.trim(),
      address: el("customer-address").value.trim(),
      payment: el("payment-mode").value
    };

    if (!customer.name || !customer.phone || !customer.address) return alert("Fill all details");

    btn.disabled = true;
    const oldTxt = btn.innerText;
    btn.innerText = "Processing...";

    const result = await createOrderAndReduceStock(orderItems, customer);

    if (!result.ok) {
      alert(result.error);
      btn.disabled = false;
      btn.innerText = oldTxt;
      await loadItems();
      return;
    }

    const message = `New Order — Shopp Wholesale\n\n` +
      orderItems.map((o, i) => `${i+1}. ${o.name} x ${o.qty}`).join("\n") +
      `\n\nTotal: ₹${money(calculateTotal())}\nName: ${customer.name}\nAddress: ${customer.address}`;

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank");

    cart = {};
    saveCartToStorage();
    updateCartCount();
    btn.disabled = false;
    btn.innerText = oldTxt;
    el("cart-modal").classList.add("hidden");
    alert("Order placed successfully!");
  };
})();

/* ---------------- ADMIN & INIT ---------------- */
function showAdminBadge() {
  if (el("admin-badge")) return;
  const badge = document.createElement("div");
  badge.id = "admin-badge";
  badge.style = "background:#000;color:#fff;font-size:12px;padding:4px 8px;border-radius:8px;";
  badge.innerText = "ADMIN";
  document.querySelector(".header-right")?.appendChild(badge);
}

(async function init() {
  loadCartFromStorage();
  
  if (isAdminSession()) {
    showAdminBadge();
    await loadItems();
    return;
  }

  const allowed = await verifyLocationAccess();
  if (!allowed) {
    document.body.innerHTML = `
      <div style="text-align:center;padding:40px;font-family:sans-serif;">
        <h2 style="color:#b00">Service Unavailable</h2>
        <p>Delivery only within ${SERVICE_RADIUS_KM}km radius.</p>
        <button id="admin-login-bypass" style="margin-top:20px;padding:10px;background:#333;color:#fff;border:none;border-radius:5px;">Admin Login</button>
      </div>`;
    
    el("admin-login-bypass").onclick = () => {
      if (prompt("Enter PIN") === ADMIN_PIN) {
        setAdminSession(true);
        location.reload();
      }
    };
    return;
  }

  await loadItems();
})();

