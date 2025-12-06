// -----------------------------------------------------
// Shopp Wholesale — Admin Panel (FINAL WORKING VERSION)
// + imgbb IMAGE UPLOAD + COMPRESSION INTEGRATED
// -----------------------------------------------------

const PASSCODE_ADMIN = "letmein123";  
const ADMIN_SESSION_KEY = "shopp_admin_key";

const el = id => document.getElementById(id);

/* ----------------------------------------------
   ADMIN LOGIN STATE
------------------------------------------------*/
function setAdminState(trueOrFalse) {
  if (trueOrFalse) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, PASSCODE_ADMIN);
    el("admin-badge").classList.remove("hidden");
    el("btn-login").classList.add("hidden");
    el("btn-logout").classList.remove("hidden");
    el("btn-delete").classList.remove("hidden");
  } else {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    el("admin-badge").classList.add("hidden");
    el("btn-login").classList.remove("hidden");
    el("btn-logout").classList.add("hidden");
    el("btn-delete").classList.add("hidden");
  }
}

function isAdmin() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === PASSCODE_ADMIN;
}

/* ----------------------------------------------
   LOGIN
------------------------------------------------*/
el("btn-login").addEventListener("click", () => {
  const p = prompt("Enter admin passcode:");
  if (p === PASSCODE_ADMIN) {
    setAdminState(true);
    loadAllItems();
    loadOrders();
    alert("Admin mode enabled!");
  } else {
    alert("Wrong passcode!");
  }
});

/* ----------------------------------------------
   LOGOUT
------------------------------------------------*/
el("btn-logout").addEventListener("click", () => {
  setAdminState(false);
  alert("Logged out!");
});

/* ----------------------------------------------
   CLEAR FORM
------------------------------------------------*/
el("btn-clear").addEventListener("click", clearForm);

function clearForm() {
  el("item-docid").value = "";
  el("item-name").value = "";
  el("item-category").value = "";
  el("item-mrp").value = 0;
  el("item-price").value = 0;
  el("item-stock").value = 0;
  el("item-image").value = "";
  el("item-desc").value = "";

  const preview = el("imagePreview");
  preview.style.display = "none";
  preview.src = "";

  el("btn-delete").classList.add("hidden");
}

/* ===============================================================
   ⭐ IMAGE PICKER + PREVIEW + COMPRESSION + IMGBB UPLOAD
================================================================*/

// API key for imgbb
const IMGBB_API_KEY = "a70f2274f5053512d046cb5878c63041";

// Open file picker
function pickImage() {
  const picker = el("imagePicker");
  picker.value = "";
  picker.click();
}

// When user selects image
el("imagePicker").addEventListener("change", async function () {
  const file = this.files[0];
  if (!file) return;

  // Show preview
  const preview = el("imagePreview");
  preview.src = URL.createObjectURL(file);
  preview.style.display = "block";

  try {
    // Compress image
    const compressedFile = await compressImage(file, 0.6);
    const base64 = await fileToBase64(compressedFile);
    const cleanBase64 = base64.split(",")[1];

    el("item-image").value = "Uploading...";

    // Upload to imgbb
    const form = new FormData();
    form.append("image", cleanBase64);

    const upload = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: "POST",
      body: form
    });

    const result = await upload.json();

    if (!result.success) throw new Error("Upload failed");

    const url = result.data.display_url;

    el("item-image").value = url;
    console.log("Uploaded:", url);
    alert("Image uploaded!");

  } catch (err) {
    console.error(err);
    alert("Image upload failed");
    el("item-image").value = "";
  }
});

// Convert image to Base64
function fileToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

// Compression function
async function compressImage(file, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const MAX_WIDTH = 800;
        const scale = MAX_WIDTH / img.width;

        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => resolve(new File([blob], file.name, { type: "image/jpeg" })),
          "image/jpeg",
          quality
        );
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ----------------------------------------------
   CREATE / UPDATE ITEM
------------------------------------------------*/
el("item-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!isAdmin()) return alert("Admin only!");

  const docId = el("item-docid").value;

  const data = {
    adminKey: PASSCODE_ADMIN,
    name: el("item-name").value.trim(),
    category: el("item-category").value.trim(),
    mrp: Number(el("item-mrp").value || 0),
    price: Number(el("item-price").value || 0),
    stock: Number(el("item-stock").value || 0),
    image: el("item-image").value.trim(),
    description: el("item-desc").value.trim()
  };

  try {
    if (docId) {
      await db.collection("items").doc(docId).update(data);
      alert("Item updated");
    } else {
      await db.collection("items").add(data);
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
el("btn-delete").addEventListener("click", async () => {
  if (!isAdmin()) return alert("Admin only!");

  const docId = el("item-docid").value;
  if (!docId) return alert("No item selected");

  if (!confirm("Delete permanently?")) return;

  try {
    await db.collection("items").doc(docId).delete({
      adminKey: PASSCODE_ADMIN
    });
    alert("Item deleted");

    clearForm();
    loadAllItems();
  } catch (err) {
    console.error(err);
    alert("Delete failed");
  }
});

/* ----------------------------------------------
   LOAD ITEMS
------------------------------------------------*/
async function loadAllItems() {
  const list = el("items-list");
  list.innerHTML = "<div class='muted'>Loading...</div>";

  try {
    const snap = await db.collection("items").orderBy("name").get();
    list.innerHTML = "";

    snap.forEach(doc => {
      const d = doc.data();

      const card = document.createElement("div");
      card.className = "item-admin";

      card.innerHTML = `
        <div style="display:flex;gap:10px;">
          <div style="width:64px;height:64px;border-radius:8px;overflow:hidden;background:#f8fafc;">
            <img src="${d.image || 'images/placeholder.png'}"
                 style="width:100%;height:100%;object-fit:cover;">
          </div>

          <div style="flex:1;">
            <div style="font-weight:700">${d.name}</div>
            <div class="muted">${d.category || ''} • ₹${d.price} • Stock: ${d.stock}</div>
          </div>
        </div>

        <div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn secondary small edit-btn" data-id="${doc.id}">Edit</button>
          <button class="btn small stock-btn" data-id="${doc.id}" data-stock="${d.stock}" data-name="${d.name}">
            Update Stock
          </button>
        </div>
      `;

      // Edit
      card.querySelector(".edit-btn").addEventListener("click", () => {
        el("item-docid").value = doc.id;
        el("item-name").value = d.name;
        el("item-category").value = d.category || "";
        el("item-mrp").value = d.mrp || 0;
        el("item-price").value = d.price || 0;
        el("item-stock").value = d.stock || 0;
        el("item-image").value = d.image || "";
        el("item-desc").value = d.description || "";

        const preview = el("imagePreview");
        if (d.image) {
          preview.src = d.image;
          preview.style.display = "block";
        } else {
          preview.style.display = "none";
        }

        el("btn-delete").classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      // Update stock
      card.querySelector(".stock-btn").addEventListener("click", async ev => {
        const itemId = ev.target.dataset.id;
        const oldStock = Number(ev.target.dataset.stock);
        const name = ev.target.dataset.name;

        const newStock = prompt(`New stock for ${name}?`, oldStock);
        if (newStock === null) return;

        const n = Number(newStock);
        if (isNaN(n) || n < 0) return alert("Invalid number");

        try {
          await db.collection("items").doc(itemId).update({
            adminKey: PASSCODE_ADMIN,
            stock: n
          });

          alert("Stock updated");
          loadAllItems();

        } catch (err) {
          console.error(err);
          alert("Update failed");
        }
      });

      list.appendChild(card);
    });

    if (snap.empty) list.innerHTML = "<div class='muted'>No items found</div>";

  } catch (err) {
    console.error(err);
    list.innerHTML = "<div class='muted'>Failed loading</div>";
  }
}

/* ----------------------------------------------
   LOAD ORDERS
------------------------------------------------*/
async function loadOrders() {
  const out = el("orders-list");
  out.innerHTML = "<div class='muted'>Loading...</div>";

  try {
    const snap = await db.collection("orders")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    out.innerHTML = "";

    snap.forEach(doc => {
      const d = doc.data();

      const when = d.createdAt?.toDate().toLocaleString("en-IN") || "—";

      const row = document.createElement("div");
      row.className = "order-row";

      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;">
          <div>
            <strong>${d.customerName}</strong>
            <div class="muted">${when}</div>
          </div>
          <div style="text-align:right;">
            ₹${d.total}
            <div class="muted">${d.status}</div>
          </div>
        </div>

        <div class="muted" style="margin-top:6px;">
          Phone: ${d.customerPhone}<br>
          Address: ${d.customerAddress}
        </div>

        <div style="margin-top:8px;">
          <strong>Items</strong>
          <ul>
            ${d.items.map(it => `<li>${it.name} x ${it.qty} = ₹${it.qty * it.price}</li>`).join("")}
          </ul>
        </div>
      `;

      out.appendChild(row);
    });

    if (snap.empty) out.innerHTML = "<div class='muted'>No orders found</div>";

  } catch (err) {
    console.error(err);
    out.innerHTML = "<div class='muted'>Failed loading orders</div>";
  }
}

/* ----------------------------------------------
   AUTO LOGIN
------------------------------------------------*/
if (isAdmin()) {
  setAdminState(true);
  loadAllItems();
  loadOrders();
                 }
