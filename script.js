// Config
const WHATSAPP_NUMBER = "919000810084"; // international format (91 + 9000810084)
const DELIVERY_RADIUS_TEXT = "3 km";
const DELIVERY_PROMISE_TEXT = "Within 24 hrs";

// App state
let items = [];
let cart = {};

// Helpers
const money = v => Number(v).toFixed(0);

// Load items.json dynamically
async function loadItems(){
  try {
    const res = await fetch('items.json');
    items = await res.json();
    renderItems(items);
  } catch (e) {
    console.error("Failed to load items.json", e);
    document.getElementById('products').innerHTML = "<p style='padding:20px'>Failed to load items.json</p>";
  }
}

function renderItems(list){
  const container = document.getElementById('products');
  container.innerHTML = '';
  list.forEach(it => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img src="${it.image}" alt="${it.name}" onerror="this.onerror=null;this.src='images/placeholder.png'">
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

  // Attach listeners
  document.querySelectorAll('.inc').forEach(b => b.onclick = () => changeQty(b.dataset.id, 1));
  document.querySelectorAll('.dec').forEach(b => b.onclick = () => changeQty(b.dataset.id, -1));
  document.querySelectorAll('.add-btn').forEach(b => b.onclick = () => changeQty(b.dataset.id, 1));
}

function changeQty(id, delta){
  id = Number(id);
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
  for(let id in cart){
    const qty = cart[id];
    if(!qty) continue;
    const it = items.find(x=>x.id===Number(id));
    if(it) total += qty * Number(it.salePrice);
  }
  return total;
}

function renderCartItems(){
  const container = document.getElementById('cart-items');
  container.innerHTML = '';
  for(let id in cart){
    const qty = cart[id];
    if(!qty) continue;
    const it = items.find(x=>x.id===Number(id));
    const row = document.createElement('div');
    row.style.display='flex'; row.style.justifyContent='space-between'; row.style.padding='6px 0';
    row.innerHTML = `<div>${it.name} x ${qty}</div><div>₹${money(qty * it.salePrice)}</div>`;
    container.appendChild(row);
  }
  if(container.innerHTML === '') container.innerHTML = '<p>No items in cart</p>';
}

// Cart modal controls
document.getElementById('open-cart-btn').onclick = ()=> {
  document.getElementById('cart-modal').classList.remove('hidden');
};
document.getElementById('close-cart').onclick = ()=> {
  document.getElementById('cart-modal').classList.add('hidden');
};

// Send WhatsApp message
document.getElementById('send-whatsapp').onclick = ()=> {
  const name = document.getElementById('customer-name').value.trim();
  const phone = document.getElementById('customer-phone').value.trim();
  const address = document.getElementById('customer-address').value.trim();
  const payment = document.getElementById('payment-mode').value;

  const itemsList = [];
  for(let id in cart){
    const qty = cart[id];
    if(!qty) continue;
    const it = items.find(x=>x.id===Number(id));
    itemsList.push(`${it.name} - Qty ${qty} - ₹${money(qty * it.salePrice)}`);
  }
  if(itemsList.length === 0){
    alert('Cart is empty');
    return;
  }

  let message = `New Order - WholesalePlaceholder\n\n`;
  message += itemsList.map((l,i)=>`${i+1}. ${l}`).join('\n');
  message += `\n\nTotal Items: ${document.getElementById('total-items').innerText}`;
  message += `\nTotal Amount: ₹${document.getElementById('total-amount').innerText}`;
  message += `\n\nCustomer Name: ${name || '---'}`;
  if(phone) message += `\nPhone: ${phone}`;
  message += `\nAddress: ${address || '---'}`;
  message += `\nPayment Mode: ${payment}`;
  message += `\n\nDelivery Radius: ${DELIVERY_RADIUS_TEXT}`;
  message += `\nDelivery Promise: ${DELIVERY_PROMISE_TEXT}`;

  // Encode and open wa.me link
  const encoded = encodeURIComponent(message);
  const link = `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;
  window.open(link, '_blank');
};

// Search
document.getElementById('search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  const filtered = items.filter(it => it.name.toLowerCase().includes(q));
  renderItems(filtered);
});

// Initialize
loadItems().then(()=> updateCartCount());
