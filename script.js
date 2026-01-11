// script.js — FINAL STABLE RELEASE (v9.3)
// Added: Global Variant Tracking for accurate Cart/Stock management.

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

/* ---------------- GLOBAL STATE ---------------- */
let items = [];
let cart = {};
const selectedVariantIndex = {}; // Tracks dropdown selection globally

/* ---------------- VARIANT PRICE HELPER ---------------- */
function getVariantPrice(variant, qty) {
  let p = variant.price;
  if (Array.isArray(variant.deals)) {
    variant.deals.forEach(d => {
      if (qty >= d.qty) p = d.price;
    });
  }
  return p;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
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

/* ---------------- CART LOAD / SAVE ---------------- */
function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_LS_KEY);
    if (!raw) return (cart = {});
    const parsed = JSON.parse(raw);
    cart = (parsed && typeof parsed === "object") ? parsed : {};
  } catch { cart = {}; }
}

function saveCartToStorage() {
  try { localStorage.setItem(CART_LS_KEY, JSON.stringify(cart)); } catch { }
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
        variants: Array.isArray(d.variants) ? d.variants : null,
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

    let activeVariant = null;

    const imgBox = document.createElement("div");
    imgBox.className = "image-box";
    imgBox.appendChild(createSafeImage(it.image, it.name));
    card.appendChild(imgBox);

    const nm = document.createElement("div");
    nm.className = "item-name";
    nm.textContent = it.name;
    card.appendChild(nm);

    // VARIANTS DROPDOWN
    if (it.variants && it.variants.length) {
      selectedVariantIndex[it.docId] = 0; // Init index
      const sel = document.createElement("select");
      sel.className = "variant-select";
      it.variants.forEach((v, i) => {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = v.label;
        sel.appendChild(opt);
      });
      activeVariant = it.variants[0];
      card.appendChild(sel);

      sel.onchange = () => {
        const idx = Number(sel.value);
        selectedVariantIndex[it.docId] = idx;
        activeVariant = it.variants[idx];
        updateDisplayedPrice();
      };
    }

    // PRICE DISPLAY
    const price = document.createElement("div");
    price.className = "price-row";
    price.innerHTML = `  
      <div class="small-mrp">MRP ₹${money(it.mrp)}</div>  
      <div class="sale" id="price-${it.docId}">
        ₹${money(it.variants ? it.variants[0].price : it.salePrice)}
      </div>  
    `;
    card.appendChild(price);

    function updateDisplayedPrice() {
      const qty = cart[it.docId]?.qty || 1;
      const priceVal = activeVariant ? getVariantPrice(activeVariant, qty) : it.salePrice;
      const p = el(`price-${it.docId}`);
      if (p) p.innerText = "₹" + money(priceVal);
    }

    if (it.stock <= 0 && !it.variants) {
      const s = document.createElement("div");
      s.style.color = "#c00"; s.style.fontSize = "13px";
      s.textContent = "Out of stock"; card.appendChild(s);
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
    btn.textContent = (it.stock <= 0 && !it.variants) ? "Unavailable" : "Add to cart";
    btn.disabled = (it.stock <= 0 && !it.variants);
    card.appendChild(btn);

    box.appendChild(card);
  });

  box.querySelectorAll(".inc, .add-btn").forEach(b => b.onclick = () => changeQty(b.dataset.id, 1));
  box.querySelectorAll(".dec").forEach(b => b.onclick = () => changeQty(b.dataset.id, -1));
}

/* ---------------- CART MODIFY ---------------- */
function changeQty(docId, delta) {
  const it = items.find(x => x.docId === docId);
  if (!it) return;

  const cur = cart[docId]?.qty || 0;
  let next = cur + delta;
  if (next < 0) next = 0;

  // Global Variant Index Logic
  const vIdx = selectedVariantIndex[docId] ?? 0;
  const variant = it.variants ? it.variants[vIdx] : null;
  const maxStock = variant ? variant.stock : it.stock;

  if (next > maxStock) {
    alert("Only " + maxStock + " items left in stock");
    next = maxStock;
  }

  if (next === 0) {
    delete cart[docId];
  } else {
    const finalPrice = variant ? getVariantPrice(variant, next) : it.salePrice;
    cart[docId] = {
      qty: next,
      name: it.name,
      price: finalPrice,
      mrp: it.mrp,
      variant: variant ? variant.label : null
    };
  }

  const d = el(`qty-${docId}`);
  if (d) d.textContent = next;

  // Refresh Price Refresh after change
  const v = it.variants ? it.variants[vIdx] : null;
  const newPrice = v ? getVariantPrice(v, next || 1) : it.salePrice;
  const pDisplay = el(`price-${docId}`);
  if (pDisplay) pDisplay.innerText = "₹" + money(newPrice);

  saveCartToStorage();
  updateCartCount();
}

/* ---------------- TOTALS & WHATSAPP ---------------- */
function calculateTotal() {
  return Object.values(cart).reduce((sum, it) => sum + (it.qty * it.price), 0);
}

function updateCartCount() {
  let count = 0;
  Object.values(cart).forEach(it => (count += it.qty));
  if (el("cart-count")) el("cart-count").innerText = count;
  if (el("footer-item-count")) el("footer-item-count").innerText = `${count} Items`;
  if (el("footer-total")) el("footer-total").innerText = money(calculateTotal());
  if (el("total-amount")) el("total-amount").innerText = money(calculateTotal());
  renderCartItems();
}

function renderCartItems() {
  const box = el("cart-items");
  if (!box) return; box.innerHTML = "";
  Object.keys(cart).forEach(id => {
    const it = cart[id];
    const row = document.createElement("div");
    row.className = "cart-row";
    row.innerHTML = `<div>${it.name} ${it.variant ? '('+it.variant+')' : ''} x ${it.qty}</div><div>₹${money(it.qty * it.price)}</div>`;
    box.appendChild(row);
  });
}

const applyFilters = debounce(() => {
  const q = el("search").value.toLowerCase();
  const filtered = items.filter(it => it.name.toLowerCase().includes(q));
  renderItems(filtered);
}, 150);
if (el("search")) el("search").addEventListener("input", applyFilters);

async function createOrderAndReduceStock(orderItems, customer) {
  try {
    await db.runTransaction(async tx => {
      for (const o of orderItems) {
        const ref = db.collection("items").doc(o.docId);
        const snap = await tx.get(ref);
        const d = snap.data();
        if (o.variant && Array.isArray(d.variants)) {
          const vIdx = d.variants.findIndex(v => v.label === o.variant);
          d.variants[vIdx].stock -= o.qty;
          tx.update(ref, { variants: d.variants });
        } else {
          tx.update(ref, { stock: (d.stock || 0) - o.qty });
        }
      }
      const orderRef = db.collection("orders").doc();
      tx.set(orderRef, { ...customer, items: orderItems, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

(function setupWhatsapp() {
  const btn = el("send-whatsapp");
  if (!btn) return;
  btn.onclick = async () => {
    const orderItems = Object.entries(cart).map(([id, v]) => ({ docId: id, ...v }));
    const customer = { name: el("customer-name").value, phone: el("customer-phone").value, address: el("customer-address").value };
    if (!customer.name || !customer.phone || !customer.address) return alert("Fill details");
    btn.disabled = true;
    const res = await createOrderAndReduceStock(orderItems, customer);
    if (res.ok) {
      const msg = `New Order\n` + orderItems.map(o => `${o.name} (${o.variant}) x ${o.qty}`).join("\n");
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank");
      cart = {}; saveCartToStorage(); updateCartCount();
      el("cart-modal").classList.add("hidden");
    }
    btn.disabled = false;
  };
})();

(async function init() {
  loadCartFromStorage();
  if (isAdminSession()) { await loadItems(); return; }
  const allowed = await verifyLocationAccess();
  if (!allowed) {
    document.body.innerHTML = `<div style="text-align:center;padding:50px;"><h2>Out of Service Area</h2><button onclick="location.reload()">Retry</button></div>`;
    return;
  }
  await loadItems();
})();
    
