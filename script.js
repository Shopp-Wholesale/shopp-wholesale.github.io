// ---------------- CONFIG ----------------
const WHATSAPP_NUMBER = "919000810084"; 
const DELIVERY_RADIUS_TEXT = "3 km";
const DELIVERY_PROMISE_TEXT = "Within 24 hrs";

let items = [];
let cart = {};

const money = v => Number(v).toFixed(0);


// ---------------- FIREBASE INIT ----------------
import { initializeApp } 
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import { getFirestore, collection, getDocs } 
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDCM_KCDiyDzEEQaqUI66TNpv-l4L8dnzo",
  authDomain: "shopp-wholesale.firebaseapp.com",
  projectId: "shopp-wholesale",
  storageBucket: "shopp-wholesale.firebasestorage.app",
  messagingSenderId: "811103669232",
  appId: "1:811103669232:web:825724b3738658192b6b35"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);


// ---------------- LOAD ITEMS FROM FIRESTORE ----------------
async function loadItems() {
  items = [];

  try {
    const snap = await getDocs(collection(db, "items"));
    snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));

    renderItems(items);

  } catch (e) {
    console.error("Firestore load error:", e);
    document.getElementById('products').innerHTML =
      "<p style='padding:20px'>Failed to load Firestore items</p>";
  }
}


// ---------------- RENDER ITEMS ----------------
function renderItems(list){
  const container = document.getElementById('products');
  container.innerHTML = '';

  list.forEach(it => {
    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <img src="${it.image}" alt="${it.name}" 
           onerror="this.onerror=null;this.src='images/placeholder.png'">
      <div class="item-name">${it.name}</div>

      <div class="price-row">
        <div class="small-mrp">MRP ₹${money(it.mrp)}</div>
        <div class="sale">₹${money(it.price)}</div>
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
function changeQty(id, delta){
  cart[id] = cart[id] || 0;
  cart[id] = Math.max(0, cart[id] + delta);

  document.getElementById(`qty-${id}`).innerText = cart[id];
  updateCartCount();
}

function updateCartCount(){
  const count = Object.values(cart).reduce((s,n)=>s+(n||0),0);

  document.getElementById('cart-count').innerText = count;
  document.getElementById('total-items').innerText = count;

  const total = calculateTotal();
  document.getElementById('total-amount').innerText = money(total);

  renderCartItems();
}

function calculateTotal(){
  let total = 0;

  for (let id in cart){
    const qty = cart[id];
    if(!qty) continue;

    const it = items.find(x => x.id === id);
    if(it) total += qty * Number(it.price);
  }
  return total;
}

function renderCartItems(){
  const container = document.getElementById('cart-items');
  container.innerHTML = '';

  for (let id in cart){
    const qty = cart[id];
    if(!qty) continue;

    const it = items.find(x => x.id === id);
    const row = document.createElement('div');

    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.padding = '6px 0';

    row.innerHTML = `
      <div>${it.name} x ${qty}</div>
      <div>₹${money(qty * it.price)}</div>
    `;

    container.appendChild(row);
  }

  if(container.innerHTML === '')
    container.innerHTML = '<p>No items in cart</p>';
}


// ---------------- CART MODAL ----------------
document.getElementById('open-cart-btn').onclick = () =>
  document.getElementById('cart-modal').classList.remove('hidden');

document.getElementById('close-cart').onclick = () =>
  document.getElementById('cart-modal').classList.add('hidden');


// ---------------- SEND WHATSAPP ----------------
document.getElementById('send-whatsapp').onclick = () => {
  const name = document.getElementById('customer-name').value.trim();
  const phone = document.getElementById('customer-phone').value.trim();
  const address = document.getElementById('customer-address').value.trim();
  const payment = document.getElementById('payment-mode').value;

  const itemsList = [];

  for (let id in cart){
    const qty = cart[id];
    if(!qty) continue;

    const it = items.find(x => x.id === id);
    itemsList.push(`${it.name} - Qty ${qty} - ₹${money(qty * it.price)}`);
  }

  if(itemsList.length === 0){
    alert("Cart is empty");
    return;
  }

  let msg = `New Order - Wholesale Store\n\n`;
  msg += itemsList.map((l,i)=>`${i+1}. ${l}`).join('\n');
  msg += `\n\nTotal Items: ${document.getElementById('total-items').innerText}`;
  msg += `\nTotal Amount: ₹${document.getElementById('total-amount').innerText}`;
  msg += `\n\nCustomer Name: ${name || "---"}`;
  if(phone) msg += `\nPhone: ${phone}`;
  msg += `\nAddress: ${address || "---"}`;
  msg += `\nPayment Mode: ${payment}`;
  msg += `\n\nDelivery Radius: ${DELIVERY_RADIUS_TEXT}`;
  msg += `\nDelivery Promise: ${DELIVERY_PROMISE_TEXT}`;

  const link = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(link, "_blank");
};


// ---------------- SEARCH ----------------
document.getElementById('search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase().trim();
  const filtered = items.filter(it => it.name.toLowerCase().includes(q));
  renderItems(filtered);
});


// ---------------- INIT ----------------
loadItems().then(() => updateCartCount());
