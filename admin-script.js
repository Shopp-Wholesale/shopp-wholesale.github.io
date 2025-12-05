// admin-script.js
// Simple Admin panel — uses client-side passcode. NOT secure for production.
// Replace PASSCODE_ADMIN with your desired simple passcode (kept in client)
const PASSCODE_ADMIN = "letmein123"; // change this to your passcode
const ADMIN_SESSION_KEY = "shopp_admin_logged_in";

const el = id => document.getElementById(id);

// show/hide admin UI
function setAdminState(on) {
  if (on) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    el('admin-badge').classList.remove('hidden');
    el('btn-login').classList.add('hidden');
    el('btn-logout').classList.remove('hidden');
    el('btn-delete').classList.remove('hidden');
  } else {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    el('admin-badge').classList.add('hidden');
    el('btn-login').classList.remove('hidden');
    el('btn-logout').classList.add('hidden');
    el('btn-delete').classList.add('hidden');
  }
}

function isAdmin() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
}

// prompt passcode
el('btn-login').addEventListener('click', () => {
  const p = prompt("Enter admin passcode:");
  if (p && p === PASSCODE_ADMIN) {
    setAdminState(true);
    loadAllItems();
    loadOrders();
    alert("Admin mode enabled");
  } else {
    alert("Wrong passcode");
  }
});

el('btn-logout').addEventListener('click', () => {
  setAdminState(false);
  alert("Logged out of admin");
});

el('btn-clear').addEventListener('click', () => {
  clearForm();
});

// handle form submit: create or update
el('item-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!isAdmin()) { alert("Admin only"); return; }

  const docId = el('item-docid').value;
  const data = {
    name: el('item-name').value.trim(),
    category: el('item-category').value.trim() || "",
    mrp: Number(el('item-mrp').value || 0),
    price: Number(el('item-price').value || 0),
    stock: Number(el('item-stock').value || 0),
    image: el('item-image').value.trim() || "",
    description: el('item-desc').value.trim() || ""
  };

  try {
    if (docId) {
      // update
      await db.collection('items').doc(docId).update(data);
      alert("Item updated");
    } else {
      // create
      await db.collection('items').add(data);
      alert("Item created");
    }
    clearForm();
    loadAllItems();
  } catch (err) {
    console.error(err);
    alert("Failed: " + (err.message || err));
  }
});

// delete button
el('btn-delete').addEventListener('click', async () => {
  if (!isAdmin()) return alert("Admin only");
  const docId = el('item-docid').value;
  if (!docId) return alert("No item selected");
  if (!confirm("Delete this item? This action is permanent.")) return;
  try {
    await db.collection('items').doc(docId).delete();
    alert("Deleted");
    clearForm();
    loadAllItems();
  } catch (err) {
    console.error(err);
    alert("Delete failed: " + (err.message || err));
  }
});

function clearForm() {
  el('item-docid').value = "";
  el('item-name').value = "";
  el('item-category').value = "";
  el('item-mrp').value = 0;
  el('item-price').value = 0;
  el('item-stock').value = 0;
  el('item-image').value = "";
  el('item-desc').value = "";
  el('btn-delete').classList.add('hidden');
}

// load items and render admin cards
async function loadAllItems() {
  const list = el('items-list');
  list.innerHTML = "<div class='muted'>Loading...</div>";
  try {
    const snap = await db.collection('items').orderBy('name').get();
    list.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      const card = document.createElement('div');
      card.className = 'item-admin';

      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:64px;height:64px;border-radius:8px;overflow:hidden;background:#f8fafc;display:flex;align-items:center;justify-content:center;">
            <img src="${d.image || 'images/placeholder.png'}" style="width:100%;height:100%;object-fit:cover;" />
          </div>
          <div style="flex:1;">
            <div style="font-weight:700">${d.name || 'Untitled'}</div>
            <div class="muted">${d.category || ''} • ₹${d.price || 0} • Stock: ${d.stock || 0}</div>
          </div>
        </div>
        <div style="margin-top:8px; display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn secondary small edit-btn" data-id="${doc.id}">Edit</button>
          <button class="btn small" data-id="${doc.id}" data-name="${escapeHtml(d.name || '')}">Save Stock</button>
        </div>
      `;

      // Edit button
      const editBtn = card.querySelector('.edit-btn');
      editBtn.addEventListener('click', () => {
        el('item-docid').value = doc.id;
        el('item-name').value = d.name || '';
        el('item-category').value = d.category || '';
        el('item-mrp').value = Number(d.mrp || 0);
        el('item-price').value = Number(d.price || 0);
        el('item-stock').value = Number(d.stock || 0);
        el('item-image').value = d.image || '';
        el('item-desc').value = d.description || '';
        el('btn-delete').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      // Quick save stock button (prompt)
      const saveBtn = card.querySelector('button.btn:not(.secondary)');
      saveBtn.addEventListener('click', async () => {
        if (!isAdmin()) return alert('Admin only');
        const newStock = prompt('Enter new stock value for ' + (d.name || 'Item') + ' (current ' + (d.stock || 0) + ')', String(Number(d.stock || 0)));
        if (newStock === null) return;
        const n = Number(newStock);
        if (isNaN(n) || n < 0) return alert('Invalid number');
        try {
          await db.collection('items').doc(doc.id).update({ stock: n });
          alert('Stock updated');
          loadAllItems();
        } catch (err) {
          console.error(err);
          alert('Update failed: ' + (err.message || err));
        }
      });

      list.appendChild(card);
    });

    if (snap.empty) list.innerHTML = "<div class='muted'>No products yet</div>";
  } catch (err) {
    console.error(err);
    list.innerHTML = "<div class='muted'>Failed loading items</div>";
  }
}

// orders list
async function loadOrders() {
  const out = el('orders-list');
  out.innerHTML = "<div class='muted'>Loading orders...</div>";
  try {
    const snap = await db.collection('orders').orderBy('createdAt', 'desc').limit(50).get();
    out.innerHTML = "";
    if (snap.empty) {
      out.innerHTML = "<div class='muted'>No orders yet</div>";
      return;
    }
    snap.forEach(doc => {
      const d = doc.data();
      const wrapper = document.createElement('div');
      wrapper.className = 'order-row';
      const when = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toLocaleString() : '—';
      wrapper.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div><strong>${d.customerName || '—'}</strong><div class="muted">${when}</div></div>
          <div style="text-align:right">₹${d.total || 0}<div class="muted">${d.status || ''}</div></div>
        </div>
        <div style="margin-top:8px;">
          <div class="muted">Phone: ${d.customerPhone || '—'}</div>
          <div class="muted">Address: ${d.customerAddress || '—'}</div>
        </div>
        <div style="margin-top:8px;font-size:14px;">
          <strong>Items</strong>
          <ul>
            ${ (d.items || []).map(it => `<li>${escapeHtml(it.name)} x ${it.qty} = ₹${it.price}</li>`).join('') }
          </ul>
        </div>
      `;
      out.appendChild(wrapper);
    });
  } catch (err) {
    console.error(err);
    out.innerHTML = "<div class='muted'>Failed loading orders</div>";
  }
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// auto-enable admin if session exists
if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "1") {
  setAdminState(true);
  loadAllItems();
  loadOrders();
}
