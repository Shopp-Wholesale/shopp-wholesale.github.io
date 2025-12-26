// script.js — FINAL STABLE RELEASE (v9.2)

/* ---------------- CONFIG ---------------- */
const WHATSAPP_NUMBER = "919000810084";
const CART_LS_KEY = "shopp_cart_v1";

/* ---------------- LOCATION LOCK / ADMIN ---------------- */
const SHOP_LAT = 17.3526633;
const SHOP_LNG = 78.3860868;
const SERVICE_RADIUS_KM = 3;

const ADMIN_PIN = "Sreekanth@1";
const ADMIN_SESSION_KEY = "shopp_admin_override";

/* ---------------- UTIL ---------------- */
const money = v => Number(v || 0).toFixed(0);
const el = id => document.getElementById(id);

/* ---------------- GEO ---------------- */
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
        const d = distanceKm(
          pos.coords.latitude,
          pos.coords.longitude,
          SHOP_LAT,
          SHOP_LNG
        );
        res(d <= SERVICE_RADIUS_KM);
      },
      () => res(false),
      { timeout: 8000 }
    );
  });
}

/* ---------------- ADMIN ---------------- */
function isAdminSession() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
}
function setAdminSession() {
  sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
}

/* ---------------- SAFE IMAGE ---------------- */
function createSafeImage(src, alt = "") {
  const img = document.createElement("img");
  img.className = "product-img";
  img.loading = "lazy";
  img.src = src || "images/placeholder.png";
  img.alt = alt;
  img.onerror = () => (img.src = "images/placeholder.png");
  return img;
}

/* ---------------- STATE ---------------- */
let items = [];
let cart = {};

/* ---------------- CART STORAGE ---------------- */
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

/* ---------------- LOAD ITEMS ---------------- */
async function loadItems() {
  const snap = await db.collection("items").get();
  items = [];
  snap.forEach(doc => {
    const d = doc.data();
    items.push({
      docId: doc.id,
      name: d.name,
      mrp: d.mrp,
      price: d.price,
      stock: d.stock,
      image: d.image
    });
  });
  renderItems(items);
  updateCartUI();
}

/* ---------------- RENDER PRODUCTS ---------------- */
function renderItems(list) {
  const box = el("products");
  box.innerHTML = "";

  list.forEach(it => {
    const card = document.createElement("div");
    card.className = "card";

    const imgBox = document.createElement("div");
    imgBox.className = "image-box";
    imgBox.appendChild(createSafeImage(it.image, it.name));

    const qty = cart[it.docId]?.qty || 0;

    card.innerHTML = `
      <div class="item-name">${it.name}</div>
      <div class="price-row">
        <div class="small-mrp">₹${money(it.mrp)}</div>
        <div class="sale">₹${money(it.price)}</div>
      </div>
      <div class="qty-controls">
        <button class="dec" data-id="${it.docId}">-</button>
        <div class="qty-display" id="qty-${it.docId}">${qty}</div>
        <button class="inc" data-id="${it.docId}">+</button>
      </div>
      <button class="add-btn" data-id="${it.docId}">Add to cart</button>
    `;

    card.prepend(imgBox);
    box.appendChild(card);
  });

  box.querySelectorAll(".inc").forEach(b =>
    b.onclick = () => changeQty(b.dataset.id, 1)
  );
  box.querySelectorAll(".dec").forEach(b =>
    b.onclick = () => changeQty(b.dataset.id, -1)
  );
  box.querySelectorAll(".add-btn").forEach(b =>
    b.onclick = () => changeQty(b.dataset.id, 1)
  );
}

/* ---------------- CART MODIFY ---------------- */
function changeQty(docId, delta) {
  const it = items.find(x => x.docId === docId);
  if (!it) return;

  let next = (cart[docId]?.qty || 0) + delta;
  if (next < 0) next = 0;
  if (next > it.stock) return alert("Stock limit reached");

  if (next === 0) delete cart[docId];
  else cart[docId] = { qty: next, name: it.name, price: it.price };

  el(`qty-${docId}`).innerText = next;
  saveCartToStorage();
  updateCartUI();
}

/* ---------------- CART UI ---------------- */
function calculateTotal() {
  return Object.values(cart).reduce((s, i) => s + i.qty * i.price, 0);
}

function updateCartUI() {
  let count = 0;
  Object.values(cart).forEach(i => count += i.qty);

  el("cart-count").innerText = count;
  el("footer-item-count").innerText = `${count} items`;
  el("footer-total").innerText = money(calculateTotal());

  renderCartItems();
}

function renderCartItems() {
  const box = el("cart-items");
  box.innerHTML = "";

  Object.values(cart).forEach(i => {
    box.innerHTML += `
      <div style="display:flex;justify-content:space-between">
        <div>${i.name} x ${i.qty}</div>
        <div>₹${money(i.qty * i.price)}</div>
      </div>
    `;
  });

  if (!box.innerHTML) box.innerHTML = "<p>No items in cart</p>";
}

/* ---------------- CART MODAL ---------------- */
function openCart() {
  el("cart-modal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeCart() {
  el("cart-modal").classList.add("hidden");
  document.body.style.overflow = "";
}

el("open-cart-btn").onclick = openCart;
el("close-cart").onclick = closeCart;
el("cart-modal").onclick = e => {
  if (e.target.id === "cart-modal") closeCart();
};

/* ---------------- WHATSAPP ---------------- */
el("send-whatsapp").onclick = async () => {
  if (!Object.keys(cart).length) return alert("Cart empty");

  const name = el("customer-name").value.trim();
  const phone = el("customer-phone").value.trim();
  const address = el("customer-address").value.trim();

  if (!name || !phone || !address) return alert("Fill all details");

  const msg =
    "New Order - Shopp Wholesale\n\n" +
    Object.values(cart)
      .map(i => `${i.name} x ${i.qty}`)
      .join("\n") +
    `\n\nTotal: ₹${money(calculateTotal())}`;

  window.open(
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`,
    "_blank"
  );

  cart = {};
  saveCartToStorage();
  updateCartUI();
  closeCart();
};

/* ---------------- INIT ---------------- */
(async function init() {
  loadCartFromStorage();

  if (!isAdminSession()) {
    const ok = await verifyLocationAccess();
    if (!ok) {
      document.body.innerHTML = `
        <h3 style="text-align:center;margin-top:40px">
          Delivery only within ${SERVICE_RADIUS_KM}km
        </h3>
        <button onclick="adminLogin()">Admin Login</button>
      `;
      window.adminLogin = () => {
        if (prompt("Enter PIN") === ADMIN_PIN) {
          setAdminSession();
          location.reload();
        }
      };
      return;
    }
  }

  await loadItems();
})();
