// -----------------------------------------------------
// Shopp Wholesale — Admin Panel (UPDATED WITH VARIANTS)
// + imgbb IMAGE UPLOAD + COMPRESSION + GUARDED DOM
// -----------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {

  const PASSCODE_ADMIN = "Sreekanth@1";
  const ADMIN_SESSION_KEY = "shopp_admin_key";

  const el = id => document.getElementById(id);

  /* ✅ ADDED VARIANT PARSER HELPER */
  function parseVariantsInput() {
    const raw = el("item-variants")?.value?.trim();
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("Variants must be array");
      return parsed;
    } catch (e) {
      alert("Invalid Variants JSON format. Please ensure it is a valid [Array].");
      throw e;
    }
  }

  /* ----------------------------------------------
     ADMIN LOGIN STATE
  ------------------------------------------------*/
  function setAdminState(trueOrFalse) {
    if (trueOrFalse) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, PASSCODE_ADMIN);
      if (el("admin-badge")) el("admin-badge").classList.remove("hidden");
      if (el("btn-login")) el("btn-login").classList.add("hidden");
      if (el("btn-logout")) el("btn-logout").classList.remove("hidden");
      if (el("btn-delete")) el("btn-delete").classList.remove("hidden");
    } else {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      if (el("admin-badge")) el("admin-badge").classList.add("hidden");
      if (el("btn-login")) el("btn-login").classList.remove("hidden");
      if (el("btn-logout")) el("btn-logout").classList.add("hidden");
      if (el("btn-delete")) el("btn-delete").classList.add("hidden");
    }
  }

  function isAdmin() {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === PASSCODE_ADMIN;
  }

  if (el("btn-login")) {
    el("btn-login").addEventListener("click", () => {
      const p = prompt("Enter admin passcode:");
      if (p === PASSCODE_ADMIN) {
        setAdminState(true);
        loadAllItems();
        loadOrders();
        loadDashboardStats();
        alert("Admin mode enabled!");
      } else {
        alert("Wrong passcode!");
      }
    });
  }

  if (el("btn-logout")) {
    el("btn-logout").addEventListener("click", () => {
      setAdminState(false);
      alert("Logged out!");
    });
  }

  if (el("btn-clear")) {
    el("btn-clear").addEventListener("click", clearForm);
  }

  function clearForm() {
    if (el("item-docid")) el("item-docid").value = "";
    if (el("item-name")) el("item-name").value = "";
    if (el("item-category")) el("item-category").value = "";
    if (el("item-mrp")) el("item-mrp").value = 0;
    if (el("item-price")) el("item-price").value = 0;
    if (el("item-stock")) el("item-stock").value = 0;
    if (el("item-image")) el("item-image").value = "";
    if (el("item-desc")) el("item-desc").value = "";
    if (el("item-variants")) el("item-variants").value = ""; 

    const preview = el("imagePreview");
    if (preview) {
      preview.style.display = "none";
      preview.src = "";
    }

    if (el("btn-delete")) el("btn-delete").classList.add("hidden");
  }

  /* ===============================================================
     ⭐ IMAGE PICKER + PREVIEW + COMPRESSION + IMGBB UPLOAD
  ================================================================*/
  const IMGBB_API_KEY = "a70f2274f5053512d046cb5878c63041";

  if (el("imagePicker")) {
    el("imagePicker").addEventListener("change", async function () {
      const file = this.files[0];
      if (!file) return;

      const preview = el("imagePreview");
      if (preview) {
        preview.src = URL.createObjectURL(file);
        preview.style.display = "block";
      }

      try {
        const compressedFile = await compressImage(file, 0.6);
        const base64 = await fileToBase64(compressedFile);
        const cleanBase64 = base64.split(",")[1];

        if (el("item-image")) el("item-image").value = "Uploading...";

        const form = new FormData();
        form.append("image", cleanBase64);

        const upload = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
          method: "POST",
          body: form
        });

        const result = await upload.json();
        if (!result.success) throw new Error("Upload failed");

        const url = result.data.display_url;
        if (el("item-image")) el("item-image").value = url;
        alert("Image uploaded!");

      } catch (err) {
        console.error(err);
        alert("Image upload failed");
        if (el("item-image")) el("item-image").value = "";
      }
    });
  }

  function fileToBase64(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

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
     ✅ FIX 1: CREATE / UPDATE ITEM (SAFE SAVE)
  ------------------------------------------------*/
  if (el("item-form")) {
    el("item-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!isAdmin()) return alert("Admin only!");

      const docId = el("item-docid").value;

      let variants = null;
      try {
        variants = parseVariantsInput();
      } catch {
        return; 
      }

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

      // ✅ FIX 1: ONLY SAVE variants IF PRESENT
      if (Array.isArray(variants) && variants.length) {
        data.variants = variants;
      }

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
  }

  /* ----------------------------------------------
     DELETE ITEM
  ------------------------------------------------*/
  if (el("btn-delete")) {
    el("btn-delete").addEventListener("click", async () => {
      if (!isAdmin()) return alert("Admin only!");
      const docId = el("item-docid").value;
      if (!docId) return alert("No item selected");
      if (!confirm("Delete permanently?")) return;

      try {
        await db.collection("items").doc(docId).delete({ adminKey: PASSCODE_ADMIN });
        alert("Item deleted");
        clearForm();
        loadAllItems();
      } catch (err) { alert("Delete failed"); }
    });
  }

  /* ----------------------------------------------
     ✅ FIX 2: LOAD ITEMS (DYNAMIC UI)
  ------------------------------------------------*/
  async function loadAllItems() {
    const list = el("items-list");
    if (!list) return;
    list.innerHTML = "<div class='muted'>Loading...</div>";

    try {
      const snap = await db.collection("items").orderBy("name").get();
      list.innerHTML = "";

      snap.forEach(doc => {
        const d = doc.data();
        const card = document.createElement("div");
        card.className = "item-admin";
        
        // ✅ FIX 2: Check for variants to avoid showing ₹0 or 0 Stock
        const infoHtml = Array.isArray(d.variants) && d.variants.length > 0
          ? `• ${d.variants.length} variants`
          : `• ₹${d.price} • Stock: ${d.stock}`;

        card.innerHTML = `
          <div style="display:flex;gap:10px;">
            <div style="width:64px;height:64px;border-radius:8px;overflow:hidden;background:#f8fafc;">
              <img src="${d.image || 'images/placeholder.png'}" style="width:100%;height:100%;object-fit:cover;">
            </div>
            <div style="flex:1;">
              <div style="font-weight:700">${d.name}</div>
              <div class="muted">${d.category || ''} ${infoHtml}</div>
            </div>
          </div>
          <div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end;">
            <button class="btn secondary small edit-btn" data-id="${doc.id}">Edit</button>
            <button class="btn small stock-btn" data-id="${doc.id}" data-stock="${d.stock}" data-name="${d.name}">
              Update Stock
            </button>
          </div>
        `;

        card.querySelector(".edit-btn").addEventListener("click", () => {
          el("item-docid").value = doc.id;
          el("item-name").value = d.name;
          el("item-category").value = d.category || "";
          el("item-mrp").value = d.mrp || 0;
          el("item-price").value = d.price || 0;
          el("item-stock").value = d.stock || 0;
          el("item-image").value = d.image || "";
          el("item-desc").value = d.description || "";

          if (el("item-variants")) {
            el("item-variants").value = d.variants
              ? JSON.stringify(d.variants, null, 2)
              : "";
          }

          const preview = el("imagePreview");
          if (preview) {
            preview.src = d.image || "";
            preview.style.display = d.image ? "block" : "none";
          }
          if (el("btn-delete")) el("btn-delete").classList.remove("hidden");
          window.scrollTo({ top: 0, behavior: "smooth" });
        });

        card.querySelector(".stock-btn").addEventListener("click", async ev => {
          const itemId = ev.target.dataset.id;
          const oldStock = Number(ev.target.dataset.stock);
          const name = ev.target.dataset.name;
          const newStock = prompt(`New stock for ${name}?`, oldStock);
          if (newStock === null) return;
          const n = Number(newStock);
          if (isNaN(n) || n < 0) return alert("Invalid number");
          try {
            await db.collection("items").doc(itemId).update({ adminKey: PASSCODE_ADMIN, stock: n });
            alert("Stock updated");
            loadAllItems();
          } catch (err) { alert("Update failed"); }
        });
        list.appendChild(card);
      });
      if (snap.empty) list.innerHTML = "<div class='muted'>No items found</div>";
    } catch (err) { list.innerHTML = "<div class='muted'>Failed loading</div>"; }
  }

  /* ----------------------------------------------
     LOAD ORDERS & DASHBOARD STATS
  ------------------------------------------------*/
  async function loadOrders() {
    const out = el("orders-list");
    if (!out) return;
    out.innerHTML = "<div class='muted'>Loading...</div>";
    try {
      const snap = await db.collection("orders").orderBy("createdAt", "desc").limit(50).get();
      out.innerHTML = "";
      snap.forEach(doc => {
        const d = doc.data();
        const when = d.createdAt?.toDate().toLocaleString("en-IN") || "—";
        const row = document.createElement("div");
        row.className = "order-row";
        row.innerHTML = `
          <div style="display:flex;justify-content:space-between;">
            <div><strong>${d.customerName}</strong><div class="muted">${when}</div></div>
            <div style="text-align:right;">₹${d.total}<div class="muted">${d.status}</div></div>
          </div>
          <div class="muted" style="margin-top:6px;">Phone: ${d.customerPhone}<br>Address: ${d.customerAddress}</div>
          <div style="margin-top:8px;"><strong>Items</strong><ul>
            ${d.items.map(it => `<li>${it.name} x ${it.qty} = ₹${it.qty * it.price}</li>`).join("")}
          </ul></div>
        `;
        out.appendChild(row);
      });
    } catch (err) { out.innerHTML = "<div class='muted'>Failed loading orders</div>"; }
  }

  async function loadDashboardStats() {
    if (!el("stat-today")) return;
    const now = new Date();
    const startToday = new Date(now.setHours(0,0,0,0));
    const startWeek = new Date(new Date().setDate(new Date().getDate() - 7));
    const startMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    let today = 0, week = 0, month = 0, itemsSold = 0, revenue = 0;
    const ordersSnap = await db.collection("orders").get();

    ordersSnap.forEach(doc => {
      const o = doc.data();
      if (!o.createdAt) return;
      const t = o.createdAt.toDate();
      if (t >= startToday) today++;
      if (t >= startWeek) week++;
      if (t >= startMonth) month++;
      (o.items || []).forEach(i => { itemsSold += Number(i.qty || 0); });
      revenue += Number(o.total || 0);
    });

    el("stat-today").innerText = today;
    el("stat-week").innerText = week;
    el("stat-month").innerText = month;
    el("stat-items").innerText = itemsSold;
    el("stat-revenue").innerText = revenue;

    let invQty = 0, invValue = 0;
    const itemsSnap = await db.collection("items").get();
    itemsSnap.forEach(doc => {
      const i = doc.data();
      invQty += Number(i.stock || 0);
      invValue += Number(i.stock || 0) * Number(i.price || 0);
    });
    if (el("stat-inv-qty")) el("stat-inv-qty").innerText = invQty;
    if (el("stat-inv-value")) el("stat-inv-value").innerText = invValue;
  }

  if (isAdmin()) {
    setAdminState(true);
    loadAllItems();
    loadOrders();
    loadDashboardStats();
  }
});
                      
