// script.js — FINAL STABLE RELEASE (v9)
// Safe Cart Migration + DocId Cart + Location Lock + Admin PIN Bypass + Orders + Atomic Stock Update

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
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) *
    Math.cos(lat2*Math.PI/180) *
    Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function verifyLocationAccess() {
  return new Promise(res => {
    if (!navigator.geolocation) return res(false);

    navigator.geolocation.getCurrentPosition(
      pos => {
        const d = distanceKm(
          pos.coords.latitude,
          pos.coords.longitude,
          SHOP_LAT,
          SHOP_LNG
        );
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

function setAdminSession(flag=true) {
  try {
    flag
      ? sessionStorage.setItem(ADMIN_SESSION_KEY, "1")
      : sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {}
}

const money = v => Number(v||0).toFixed(0);
const el = id => document.getElementById(id);

/* ---------------- SAFE IMAGE ---------------- */
function createSafeImage(src, alt="") {
  const img = document.createElement('img');
  img.loading = "lazy";
  img.alt = alt;
  img.className = "product-img";
  img.src = src?.trim() ? src : "images/placeholder.png";
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
function debounce(fn, ms=150) {
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
    if (!parsed || typeof parsed !== "object") return (cart = {});

    cart = parsed;
  } catch {
    cart = {};
  }
}

function saveCartToStorage() {
  try {
    localStorage.setItem(CART_LS_KEY, JSON.stringify(cart));
  } catch {}
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
    console.error(e);
    el("products").innerHTML =
      "<p style='padding:20px'>Failed to load items</p>";
  }
}

/* ---------------- RENDER ITEMS ---------------- */
function renderItems(list) {
  const box = el("products");
  box.innerHTML = "";

  if (!list.length)
    return (box.innerHTML = `<p style="padding:20px">No items found</p>`);

  list.forEach(it => {
    const card = document.createElement("div");
    card.className = "card";

    const imgBox = document.createElement("div");
    imgBox.className = "image-box";
    imgBox.appendChild(createSafeImage(it.image, it.name));
    card.appendChild(imgBox);

    const nm = document.createElement("div");
    nm.className = "item-name";
    nm.textContent = it.name;
    card.appendChild(nm);

    const price = document.createElement("div");
    price.className = "price-row";
    price.innerHTML = `
      <div class="small-mrp">MRP ₹${money(it.mrp)}</div>
      <div class="sale">₹${money(it.salePrice)}</div>
    `;
    card.appendChild(price);

    if (it.stock <= 0) {
      const s = document.createElement("div");
      s.style.color = "#c00";
      s.style.fontSize = "13px";
      s.textContent = "Out of stock";
      card.appendChild(s);
    }

    if (isAdminSession() && it.category) {
      const c = document.createElement("div");
      c.style.fontSize = "12px";
      c.style.color = "#555";
      c.textContent = "Category: " + it.category;
      card.appendChild(c);
    }

    const controls = document.createElement("div");
    controls.className = "qty-controls";
    const cur = cart[it.docId]?.qty || 0;

    controls.innerHTML = `
      <button class="dec" data-id="${it.docId}">-</button>
      <div class="qty-display" id="qty-${it.docId}">${cur}</div>
      <button class="inc" data-id="${it.docId}">+</button>
    `;
    card.appendChild(controls);

    const btn = document.createElement("button");
    btn.className = "add-btn";
    btn.dataset.id = it.docId;
    btn.textContent = it.stock <= 0 ? "Unavailable" : "Add to cart";
    btn.disabled = it.stock <= 0;
    card.appendChild(btn);

    box.appendChild(card);
  });

  box.querySelectorAll(".inc").forEach(b =>
    b.addEventListener("click", () =>
      changeQty(b.dataset.id, +1)
    )
  );
  box.querySelectorAll(".dec").forEach(b =>
    b.addEventListener("click", () =>
      changeQty(b.dataset.id, -1)
    )
  );
  box.querySelectorAll(".add-btn").forEach(b =>
    b.addEventListener("click", () =>
      changeQty(b.dataset.id, +1)
    )
  );
}

/* ---------------- CART MODIFY ---------------- */
function changeQty(docId, delta) {
  const it = items.find(x => x.docId === docId);
  if (!it) return;

  const cur = cart[docId]?.qty || 0;
  let next = cur + delta;

  if (next < 0) next = 0;
  if (next > it.stock) next = it.stock;

  if (next === 0) delete cart[docId];
  else
    cart[docId] = {
      qty: next,
      name: it.name,
      price: it.salePrice,
      mrp: it.mrp
    };

  const d = el(`qty-${docId}`);
  if (d) d.textContent = next;

  saveCartToStorage();
  updateCartCount();
}

/* ---------------- CART TOTAL ---------------- */
function calculateTotal() {
  let t = 0;
  Object.values(cart).forEach(it => {
    t += it.qty * it.price;
  });
  return t;
}

function renderCartItems() {
  const box = el("cart-items");
  box.innerHTML = "";

  Object.keys(cart).forEach(id => {
    const it = cart[id];
    if (!it.qty) return;

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.padding = "6px 0";

    row.innerHTML = `
      <div>${it.name} x ${it.qty}</div>
      <div>₹${money(it.qty * it.price)}</div>
    `;
    box.appendChild(row);
  });

  if (!box.innerHTML.trim())
    box.innerHTML = "<p>No items in cart</p>";
}

function updateCartCount() {
  let count = 0;
  Object.values(cart).forEach(it => (count += it.qty));

  if (el("cart-count")) el("cart-count").innerText = count;
  if (el("footer-item-count"))
    el("footer-item-count").innerText = `${count} Items`;
  if (el("footer-total"))
    el("footer-total").innerText = money(calculateTotal());
  if (el("total-items")) el("total-items").innerText = count;
  if (el("total-amount"))
    el("total-amount").innerText = money(calculateTotal());

  renderCartItems();
}

/* ---------------- SEARCH FILTER ---------------- */
const applyFilters = debounce(() => {
  const q = el("search").value.toLowerCase();
  const filtered = items.filter(it =>
    it.name.toLowerCase().includes(q)
  );
  renderItems(filtered);
}, 150);

el("search").addEventListener("input", applyFilters);

/* ---------------- MODALS ---------------- */
(function setupModals() {
  const cartModal = el("cart-modal");
  const open1 = el("open-cart-btn");
  const open2 = el("open-cart-btn-2");
  const close = el("close-cart");

  const show = () => cartModal.classList.remove("hidden");
  const hide = () => cartModal.classList.add("hidden");

  if (open1) open1.onclick = show;
  if (open2) open2.onclick = show;
  if (close) close.onclick = hide;

  cartModal.onclick = e => {
    if (e.target === cartModal) hide();
  };
})();

/* ---------------- VIEW ORDERS ---------------- */
(function setupOrders() {
  const btn = el("view-orders-btn");
  const modal = el("orders-modal");
  const close = el("close-orders");
  const list = el("orders-list");

  if (!btn) return;

  btn.onclick = async () => {
    list.innerHTML = "<p>Loading...</p>";
    const snap = await db.collection("orders")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    list.innerHTML = "";

    if (snap.empty) {
      list.innerHTML = "<p>No orders found</p>";
    } else {
      snap.forEach(doc => {
        const d = doc.data();
        const time = d.createdAt?.toDate?.().toLocaleString("en-IN") || "";

        const row = document.createElement("div");
        row.style.borderBottom = "1px solid #eee";
        row.style.padding = "8px 0";

        row.innerHTML = `
          <div style="font-weight:600">${d.customerName} • ₹${money(d.total)}</div>
          <div style="font-size:13px;color:#666">${d.customerPhone} • ${time}</div>
        `;

        list.appendChild(row);
      });
    }

    modal.classList.remove("hidden");
  };

  close.onclick = () => modal.classList.add("hidden");
})();

/* ---------------- FIRESTORE TRANSACTION ---------------- */
async function createOrderAndReduceStock(orderItems, customer) {
  try {
    await db.runTransaction(async tx => {
      const batch = [];

      for (const o of orderItems) {
        const ref = db.collection("items").doc(o.docId);
        const snap = await tx.get(ref);

        if (!snap.exists) throw new Error(`${o.name} not found`);
        const stock = snap.data().stock || 0;
        if (o.qty > stock)
          throw new Error(`${o.name} — only ${stock} left`);

        batch.push({ ref, qty: o.qty, stock });
      }

      batch.forEach(b => {
        tx.update(b.ref, { stock: b.stock - b.qty });
      });

      const orderRef = db.collection("orders").doc();
      const total = orderItems.reduce((s, o) => s + o.qty * o.price, 0);

      tx.set(orderRef, {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        customerName: customer.name,
        customerPhone: customer.phone,
        customerAddress: customer.address,
        paymentMode: customer.payment,
        items: orderItems,
        total,
        status: "pending"
      });
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/* ---------------- WHATSAPP CHECKOUT ---------------- */
(function setupWhatsapp() {
  const btn = el("send-whatsapp");
  if (!btn) return;

  btn.onclick = async () => {
    updateCartCount();

    const orderItems = Object.entries(cart)
      .filter(([_, v]) => v.qty > 0)
      .map(([id, v]) => ({
        docId: id,
        name: v.name,
        qty: v.qty,
        price: v.price
      }));

    if (!orderItems.length) return alert("Cart is empty");

    const customer = {
      name: el("customer-name").value.trim(),
      phone: el("customer-phone").value.trim(),
      address: el("customer-address").value.trim(),
      payment: el("payment-mode").value
    };

    btn.disabled = true;
    const old = btn.innerText;
    btn.innerText = "Processing...";

    const result = await createOrderAndReduceStock(orderItems, customer);

    if (!result.ok) {
      alert(result.error);
      btn.disabled = false;
      btn.innerText = old;
      await loadItems();
      return;
    }

    cart = {};
    saveCartToStorage();
    updateCartCount();

    const message =
      `New Order — Shopp Wholesale\n\n` +
      orderItems.map((o, i) =>
        `${i+1}. ${o.name} x ${o.qty} = ₹${o.qty*o.price}`
      ).join("\n") +
      `\n\nTotal: ₹${money(orderItems.reduce((s,o)=>s+o.qty*o.price,0))}` +
      `\nDelivery: ${DELIVERY_PROMISE_TEXT}, Radius ${DELIVERY_RADIUS_TEXT}` +
      `\n\nName: ${customer.name}` +
      `\nPhone: ${customer.phone}` +
      `\nAddress: ${customer.address}` +
      `\nPayment: ${customer.payment}`;

    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,
      "_blank"
    );

    btn.disabled = false;
    btn.innerText = old;

    el("cart-modal").classList.add("hidden");
    alert("Order placed successfully!");
  };
})();

/* ---------------- ADMIN BADGE ---------------- */
function showAdminBadge() {
  if (el("admin-badge")) return;

  const badge = document.createElement("div");
  badge.id = "admin-badge";
  badge.style.background = "#000";
  badge.style.color = "#fff";
  badge.style.fontSize = "12px";
  badge.style.padding = "4px 8px";
  badge.style.borderRadius = "8px";
  badge.innerText = "ADMIN";

  const headerRight = document.querySelector(".header-right");
  if (headerRight) headerRight.appendChild(badge);
}

/* ---------------- ADMIN PANEL ---------------- */
(function setupAdmin() {
  const btn = el("open-admin-btn");
  const modal = el("admin-modal");
  const close = el("close-admin");

  if (!btn) return;

  btn.onclick = () => {
    if (isAdminSession()) {
      modal.classList.remove("hidden");
      return;
    }

    const pin = prompt("Enter Admin PIN:");
    if (pin === ADMIN_PIN) {
      setAdminSession(true);
      showAdminBadge();
      modal.classList.remove("hidden");
      loadItems();
    } else {
      alert("Wrong PIN");
    }
  };

  close.onclick = () => modal.classList.add("hidden");
})();

/* ---------------- INIT ---------------- */
(async function init() {
  try {
    if (isAdminSession()) {
      showAdminBadge();
      loadCartFromStorage();
      await loadItems();
      updateCartCount();
      return;
    }

    const allowed = await verifyLocationAccess();
    if (!allowed) {
      document.body.innerHTML = `
        <div style="text-align:center;padding:40px;font-size:18px;color:#b00020">
          🚫 <b>Service not available in your area</b><br><br>
          Only ${SERVICE_RADIUS_KM} km radius supported.<br>
          Admins may bypass using PIN.
        </div>
      `;

      const btn = document.createElement("button");
      btn.innerText = "Admin";
      btn.style.position = "fixed";
      btn.style.top = "14px";
      btn.style.left = "14px";
      btn.style.padding = "8px 12px";
      btn.style.background = "#000";
      btn.style.color = "#fff";
      btn.style.borderRadius = "6px";

      btn.onclick = () => {
        const pin = prompt("Enter PIN:");
        if (pin === ADMIN_PIN) {
          setAdminSession(true);
          location.reload();
        } else alert("Wrong PIN");
      };

      document.body.appendChild(btn);
      return;
    }

    loadCartFromStorage();
    await loadItems();
    updateCartCount();

  } catch (e) {
    console.error(e);
    loadCartFromStorage();
    loadItems();
    updateCartCount();
  }
})();
