// ---------------- CONFIG ----------------
const WHATSAPP_NUMBER = "919000810084";
const DELIVERY_RADIUS_TEXT = "3 km";
const DELIVERY_PROMISE_TEXT = "Within 24 hrs";

let items = [];
let cart = {};

const money = v => Number(v).toFixed(0);

// -------------- LOAD FROM FIREBASE ----------------
async function loadItems() {
  try {
    const docRef = firebase.firestore().collection("items").doc("sunflower_oil_1l");
    const snap = await docRef.get();

    if (!snap.exists) {
      document.getElementById('products').innerHTML =
        "<p style='padding:20px'>No items found in Firestore</p>";
      return;
    }

    const data = snap.data();
    items = [{
      id: 1,
      name: data.name,
      mrp: data.mrp,
      salePrice: data.price,
      stock: data.stock,
      image: data.image
    }];

    renderItems(items);

  } catch (e) {
    console.error("Firestore error:", e);
  }
}

// ---------------- RENDER ITEMS ----------------
function renderItems(list) {
  const container = document.getElementById('products');
  container.innerHTML = '';

  list.forEach(it => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img src="${it.image}" alt="${it.name}" onerror="this.src='images/placeholder.png'">

      <div class="item-name">${it.name}</div>

      <div class="price-row">
        <div class="small-mrp">MRP ₹${money(it.mrp)}</div>
        <div class="sale">₹${money(it.salePrice)}</div>
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

  document.querySelectorAll('.inc').forEach(b =>
    b.onclick = () => changeQty(b.dataset.id, 1)
  );

  document.querySelectorAll('.dec').forEach(b =>
    b.onclick = () => changeQty(b.dataset.id, -1)
  );

  document.querySelectorAll('.add-btn').forEach(b =>
    b.onclick = () => changeQty(b.dataset.id, 1)
  );
}

// ---------------- CART FUNCTIONS ----------------
function changeQty(id, delta) {
  cart[id] = cart[id] || 0;
  cart[id] = Math.max(0, cart[id] + delta);

  document.getElementById(`qty-${id}`).innerText = cart[id];
  updateCartCount();
}

function updateCartCount() {
  const count = Object.values(cart).reduce((s, n) => s + (n || 0), 0);
  const total = calculateTotal();

  document.getElementById('cart-count').innerText = count;
  document.getElementById('footer-item-count').innerText = `${count} Items`;
  document.getElementById('footer-total').innerText = money(total);
  document.getElementById('total-items').innerText = count;
  document.getElementById('total-amount').innerText = money(total);

  renderCartItems();
}

function calculateTotal() {
  let total = 0;
  for (let id in cart) {
    const qty = cart[id];
    const it = items.find(x => x.id == id);
    if (it) total += qty * it.salePrice;
  }
  return total;
}

function renderCartItems() {
  const container = document.getElementById('cart-items');
  container.innerHTML = '';

  for (let id in cart) {
    const qty = cart[id];
    if (!qty) continue;
    const it = items.find(x => x.id == id);

    const row = document.createElement('div');
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.padding = "6px 0";

    row.innerHTML = `<div>${it.name} x ${qty}</div><div>₹${money(qty * it.salePrice)}</div>`;
    container.appendChild(row);
  }
}

// ---------------- MODAL ----------------
document.getElementById('open-cart-btn').onclick =
document.getElementById('open-cart-btn-2').onclick = () => {
  document.getElementById('cart-modal').classList.remove('hidden');
};

document.getElementById('close-cart').onclick = () => {
  document.getElementById('cart-modal').classList.add('hidden');
};

// ---------------- SEND WHATSAPP ----------------
document.getElementById('send-whatsapp').onclick = () => {
  const name = document.getElementById('customer-name').value;
  const phone = document.getElementById('customer-phone').value;
  const address = document.getElementById('customer-address').value;
  const payment = document.getElementById('payment-mode').value;

  let msg = `New Order\n\n`;

  items.forEach(it => {
    const qty = cart[it.id];
    if (!qty) return;
    msg += `${it.name} x ${qty} = ₹${qty * it.salePrice}\n`;
  });

  msg += `\nTotal: ₹${document.getElementById('total-amount').innerText}`;
  msg += `\nName: ${name}\nPhone: ${phone}\nAddress: ${address}\nPayment: ${payment}`;

  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank");
};

// ---------------- INIT ----------------
loadItems();
