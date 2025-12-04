// ---------------- CONFIG ----------------
const WHATSAPP_NUMBER = "919000810084";
const DELIVERY_RADIUS_TEXT = "3 km";
const DELIVERY_PROMISE_TEXT = "Within 24 hrs";

let items = [];
let cart = {};

// ---------------- LOAD ITEMS FROM FIRESTORE ----------------
async function loadItems() {
  items = [];

  try {
    const snap = await db.collection("items").get(); // THIS COLLECTION MUST EXIST

    snap.forEach(doc => {
      items.push({ id: doc.id, ...doc.data() });
    });

    renderItems(items);

  } catch (err) {
    console.error("Firestore load error:", err);
    document.getElementById("products").innerHTML =
      "<p style='padding:20px'>Failed to load items from Firestore</p>";
  }
}

// ---------------- RENDER ITEMS ----------------
function renderItems(list) {
  const container = document.getElementById("products");
  container.innerHTML = "";

  list.forEach(it => {
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <img src="${it.image}" alt="${it.name}" onerror="this.src='images/placeholder.png'">
      <div class="item-name">${it.name}</div>

      <div class="price-row">
        <div class="small-mrp">MRP ₹${it.mrp}</div>
        <div class="sale">₹${it.price}</div>
      </div>

      <div class="qty-controls">
        <button class="dec" data-id="${it.id}">-</button>
        <div class="qty-display" id="qty-${it.id}">0</div>
        <button class="inc" data-id="${it.id}">+</button>
      </div>

      <button class="add-btn" data-id="${it.id}">Add to cart</button>
    `;

    container.appendChild(card);
  });

  document.querySelectorAll(".inc").forEach(btn =>
    btn.onclick = () => changeQty(btn.dataset.id, 1)
  );

  document.querySelectorAll(".dec").forEach(btn =>
    btn.onclick = () => changeQty(btn.dataset.id, -1)
  );

  document.querySelectorAll(".add-btn").forEach(btn =>
    btn.onclick = () => changeQty(btn.dataset.id, 1)
  );
}

// ---------------- CART FUNCTIONS ----------------
function changeQty(id, delta) {
  if (!cart[id]) cart[id] = 0;
  cart[id] = Math.max(0, cart[id] + delta);

  document.getElementById(`qty-${id}`).innerText = cart[id];
  updateCart();
}

function updateCart() {
  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);
  document.getElementById("cart-count").innerText = totalItems;
  document.getElementById("total-items").innerText = totalItems;
  document.getElementById("footer-item-count").innerText = `${totalItems} Items`;

  let total = 0;
  for (let id in cart) {
    if (cart[id] > 0) {
      const item = items.find(x => x.id === id);
      if (item) total += cart[id] * Number(item.price);
    }
  }

  document.getElementById("total-amount").innerText = total;
  document.getElementById("footer-total").innerText = total;

  renderCartItems();
}

function renderCartItems() {
  const container = document.getElementById("cart-items");
  container.innerHTML = "";

  for (let id in cart) {
    if (cart[id] === 0) continue;

    const it = items.find(x => x.id === id);
    if (!it) continue;

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.padding = "6px 0";

    row.innerHTML = `
      <div>${it.name} x ${cart[id]}</div>
      <div>₹${cart[id] * it.price}</div>
    `;

    container.appendChild(row);
  }

  if (container.innerHTML === "") {
    container.innerHTML = "<p>No items in cart</p>";
  }
}

// ---------------- CART OPEN/CLOSE ----------------
document.getElementById("open-cart-btn").onclick = () =>
  document.getElementById("cart-modal").classList.remove("hidden");

document.getElementById("open-cart-btn-2").onclick = () =>
  document.getElementById("cart-modal").classList.remove("hidden");

document.getElementById("close-cart").onclick = () =>
  document.getElementById("cart-modal").classList.add("hidden");

// ---------------- WHATSAPP SEND ----------------
document.getElementById("send-whatsapp").onclick = () => {
  let message = `New Order - Shopp Wholesale\n\n`;

  for (let id in cart) {
    if (cart[id] === 0) continue;

    const it = items.find(x => x.id === id);
    message += `${it.name} x ${cart[id]} - ₹${cart[id] * it.price}\n`;
  }

  message += `\nTotal Items: ${document.getElementById("total-items").innerText}`;
  message += `\nTotal Amount: ₹${document.getElementById("total-amount").innerText}\n`;

  const encoded = encodeURIComponent(message);
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`, "_blank");
};

// ---------------- SEARCH ----------------
document.getElementById("search").oninput = e => {
  const q = e.target.value.toLowerCase();
  const filtered = items.filter(it => it.name.toLowerCase().includes(q));
  renderItems(filtered);
};

// ---------------- INITIAL LOAD ----------------
loadItems();
