// ---------------- CONFIG ----------------  
const WHATSAPP_NUMBER = "919000810084";
const DELIVERY_RADIUS_TEXT = "3 km";
const DELIVERY_PROMISE_TEXT = "Within 24 hrs";

let items = [];
let cart = {};

const money = v => Number(v).toFixed(0);

// ---------------- LOAD ALL ITEMS FROM FIREBASE ----------------  
async function loadItems() {
  try {
    const snap = await db.collection("items").get();

    if (snap.empty) {
      document.getElementById('products').innerHTML =
        "<p style='padding:20px'>No items found in Firestore</p>";
      return;
    }

    items = [];

    snap.forEach((doc, index) => {
      const d = doc.data();
      items.push({
        id: index + 1,
        docId: doc.id,
        name: d.name,
        mrp: d.mrp,
        salePrice: d.price,
        stock: d.stock,
        image: d.image
      });
    });

    renderItems(items);

  } catch (e) {
    console.error("Firestore error:", e);
    document.getElementById('products').innerHTML =
      "<p style='padding:20px'>Failed to load items</p>";
  }
}

// ---------------- RENDER ITEMS ----------------  
function renderItems(list) {
  const container = document.getElementById('products');
  container.innerHTML = '';

  list.forEach(it => {
    const safeImage = (it.image && it.image.trim() !== "")
      ? it.image
      : "images/placeholder.png";

    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <img 
        src="${safeImage}" 
        alt="${it.name}" 
        loading="lazy"
        style="opacity:0; transition:opacity 0.25s;"
        onload="this.style.opacity=1"
        onerror="this.src='images/placeholder.png'; this.style.opacity=1;"
      >

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

    row.innerHTML = `
      <div>${it.name} x ${qty}</div>
      <div>₹${money(qty * it.salePrice)}</div>
    `;

    container.appendChild(row);
  }
}

// ---------------- FIRESTORE TRANSACTION: ORDER + STOCK UPDATE ----------------
async function saveOrderAndReduceStock(orderItems, customer) {
  try {
    await db.runTransaction(async (tx) => {
      for (const o of orderItems) {
        const ref = db.collection("items").doc(o.docId);
        const snap = await tx.get(ref);

        if (!snap.exists) throw `${o.name} not found`;

        const current = snap.data().stock || 0;
        if (o.qty > current) throw `${o.name} only ${current} left`;

        tx.update(ref, { stock: current - o.qty });
      }

      const orderRef = db.collection("orders").doc();
      tx.set(orderRef, {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        ...customer,
        items: orderItems,
        status: "pending"
      });
    });

    return { ok: true };

  } catch (err) {
    return { ok: false, error: err };
  }
}

// ---------------- SEND WHATSAPP (UPDATED WITH FIRESTORE ORDER + STOCK REDUCE) ----------------  
document.getElementById('send-whatsapp').onclick = async () => {
  const name = document.getElementById('customer-name').value;
  const phone = document.getElementById('customer-phone').value;
  const address = document.getElementById('customer-address').value;
  const payment = document.getElementById('payment-mode').value;

  const orderItems = [];

  items.forEach(it => {
    const qty = cart[it.id];
    if (qty) {
      orderItems.push({
        docId: it.docId,
        name: it.name,
        qty,
        price: it.salePrice
      });
    }
  });

  if (orderItems.length === 0) {
    alert("Cart empty");
    return;
  }

  const customer = { name, phone, address, payment };

  const result = await saveOrderAndReduceStock(orderItems, customer);

  if (!result.ok) {
    alert(result.error);
    return;
  }

  let msg = `New Order\n\n`;
  orderItems.forEach(it => msg += `${it.name} x ${it.qty} = ₹${it.qty * it.price}\n`);

  msg += `\nTotal: ₹${document.getElementById('total-amount').innerText}`;
  msg += `\nName: ${name}\nPhone: ${phone}\nAddress: ${address}\nPayment: ${payment}`;

  window.open(
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`,
    "_blank"
  );

  cart = {};
  updateCartCount();
  loadItems(); // refresh stock UI
};

// ---------------- INIT ----------------  
loadItems();
