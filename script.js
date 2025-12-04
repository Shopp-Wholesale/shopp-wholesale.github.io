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
    const snap = await firebase.firestore().collection("items").get();

    if (snap.empty) {
      document.getElementById('products').innerHTML =
        "<p style='padding:20px'>No items found in Firestore</p>";
      return;
    }

    items = [];

    snap.forEach(doc => {
      const d = doc.data();
      items.push({
        id: items.length + 1, // temporary ID for cart
        docId: doc.id,        // REAL Firestore ID
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
