// -------------------------------
// Shopp Wholesale — Admin Script
// FINAL VERSION (with Firestore Admin Headers)
// -------------------------------

// SIMPLE CLIENT-SIDE PASSCODE (NOT SECURE FOR REAL SYSTEMS)
const PASSCODE_ADMIN = "letmein123"; 
const ADMIN_SESSION_KEY = "shopp_admin_logged_in";

const el = id => document.getElementById(id);

/* ----------------------------------------------
   FIRESTORE ADMIN WRAPPER — ADDS ADMIN HEADER
------------------------------------------------*/
function adminDoc(docRef) {
  return {
    update: (data) => docRef.update(data, { headers: { "x-admin": PASSCODE_ADMIN } }),
    set: (data, opts = {}) => docRef.set(data, { ...opts, headers: { "x-admin": PASSCODE_ADMIN } }),
    delete: () => docRef.delete({ headers: { "x-admin": PASSCODE_ADMIN } })
  };
}

function adminGet(colRef) {
  return colRef.get({ headers: { "x-admin": PASSCODE_ADMIN } });
}

/* ----------------------------------------------
   ADMIN STATE HANDLING
------------------------------------------------*/
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

/* ----------------------------------------------
   LOGIN / LOGOUT BUTTONS
------------------------------------------------*/
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
  alert("Logged out");
});

/* ----------------------------------------------
   FORM CLEAR
------------------------------------------------*/
el('btn-clear').addEventListener('click', () => {
  clearForm();
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

/* ----------------------------------------------
   CREATE / UPDATE ITEM
------------------------------------------------*/
el('item-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!isAdmin()) return alert("Admin only");

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
      // UPDATE
      await adminDoc(db.collection('items').doc(docId)).update(data);
      alert("Item updated");
    } else {
      // CREATE
      const ref = db.collection('items').doc();
      await adminDoc(ref).set(data);
      alert("Item created");
    }

    clearForm();
    loadAllItems();

  } catch (err) {
    console.error(err);
    alert("Failed: " + err.message);
  }
});

/* ----------------------------------------------
   DELETE ITEM
------------------------------------------------*/
el('btn-delete').addEventListener('click', async () => {
  if (!isAdmin()) return alert("Admin only");

  const docId = el('item-docid').value;
  if (!docId) return alert("No item selected");

  if (!confirm("Delete this item permanently?")) return;

  try {
    await adminDoc(db.collection('items').doc(docId)).delete();
    alert("Deleted successfully");
    clearForm();
    loadAllItems();
  } catch (err) {
    console.error(err);
    alert("Delete failed: " + err.message);
  }
});

/* ----------------------------------------------
   LOAD ITEMS INTO ADMIN PANEL
------------------------------------------------*/
async function loadAllItems() {
  const list = el('items-list');
  list.innerHTML = "<div class='muted'>Loading items...</div>";

  try {
    const snap = await adminGet(db.collection('items').orderBy('name'));

    list.innerHTML = "";

    snap.forEach(doc => {
      const d = doc.data();

      const card = document.createElement("div");
      card.className = "item-admin";

      card.innerHTML = `
        <div style="display:flex; gap:10px;">
          <div style="width:64px;height:64px;border-radius:8px;overflow:hidden;background:#f8fafc;">
            <img src="${d.image || 'images/placeholder.png'}" style="width:100%;height:100%;object-fit:cover;">
          </div>
          <div style="flex:1;">
            <div style="font-weight:700">${d.name}</div>
            <div class="muted">${d.category || ""} • ₹${d.price} • Stock: ${d.stock}</div>
          </div>
        </div>

        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px;">
          <button class="btn secondary small edit-btn" data-id="${doc.id}">Edit</button>
          <button class="btn small stock-btn" data-id="${doc.id}" data-stock="${d.stock}" data-name="${d.name}">
            Save Stock
          </button>
        </div>
      `;

      // Edit button
      card.querySelector(".edit-btn").addEventListener("click", () => {
        el('item-docid').value = doc.id;
        el('item-name').value = d.name;
        el('item-category').value = d.category || "";
        el('item-mrp').value = d.mrp || 0;
        el('item-price').value = d.price || 0;
        el('item-stock').value = d.stock || 0;
        el('item-image').value = d.image || "";
        el('item-desc').value = d.description || "";

        el('btn-delete').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      // Stock update button
      card.querySelector(".stock-btn").addEventListener("click", async (ev) => {
        if (!isAdmin()) return alert("Admin only");

        const docId = ev.target.dataset.id;
        const oldStock = Number(ev.target.dataset.stock);
        const name = ev.target.dataset.name;

        const newStock = prompt(`Enter new stock for ${name} (Current: ${oldStock})`, oldStock);
        if (newStock === null) return;

        const n = Number(newStock);
        if (isNaN(n) || n < 0) return alert("Invalid number");

        try {
          await adminDoc(db.collection('items').doc(docId)).update({ stock: n });
          alert("Stock updated");
          loadAllItems();
        } catch (err) {
          console.error(err);
          alert("Update failed: " + err.message);
        }
      });

      list.appendChild(card);
    });

    if (snap.empty) list.innerHTML = "<div class='muted'>No items yet</div>";

  } catch (err) {
    console.error(err);
    list.innerHTML = "<div class='muted'>Failed to load items</div>";
  }
}

/* ----------------------------------------------
   LOAD ORDERS
------------------------------------------------*/
async function loadOrders() {
  const out = el("orders-list");
  out.innerHTML = "<div class='muted'>Loading orders...</div>";

  try {
    const snap = await adminGet(
      db.collection('orders').orderBy('createdAt', 'desc').limit(50)
    );

    out.innerHTML = "";

    if (snap.empty) {
      out.innerHTML = "<div class='muted'>No orders yet</div>";
      return;
    }

    snap.forEach(doc => {
      const d = doc.data();

      const when = d.createdAt?.toDate().toLocaleString("en-IN") || "—";

      const box = document.createElement("div");
      box.className = "order-row";

      box.innerHTML = `
        <div style="display:flex;justify-content:space-between;">
          <div>
            <strong>${d.customerName}</strong>
            <div class="muted">${when}</div>
          </div>
          <div style="text-align:right">
            ₹${d.total}
            <div class="muted">${d.status}</div>
          </div>
        </div>

        <div style="margin-top:6px;" class="muted">
          Phone: ${d.customerPhone}<br>
          Address: ${d.customerAddress}<br>
        </div>

        <div style="margin-top:8px;">
          <strong>Items</strong>
          <ul>
            ${d.items.map(it => `<li>${it.name} x ${it.qty} = ₹${it.price}</li>`).join("")}
          </ul>
        </div>
      `;

      out.appendChild(box);
    });

  } catch (err) {
    console.error(err);
    out.innerHTML = "<div class='muted'>Failed loading orders</div>";
  }
}

/* ----------------------------------------------
   AUTO LOGIN RESTORE
------------------------------------------------*/
if (isAdmin()) {
  setAdminState(true);
  loadAllItems();
  loadOrders();
}
