/* =========================================================
   HOTSPOT ROUTER MAP
   Supabase-connected version
   ========================================================= */

/* =========================================================
   1. SUPABASE CONFIGURATION
   ========================================================= */

const SUPABASE_URL = "https://wifvdrspsjqbslxtjqok.supabase.co";

/*
   IMPORTANT:
   This is the PUBLIC/PUBLISHABLE key.
   Never put the sb_secret_... key in this file.
*/
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_Bs9HS7VNXvZ2ns5eKVDV-A_Rjy72VAR";

const supabaseClient = window.supabase
  ? window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    )
  : null;


/* =========================================================
   2. APP CONFIGURATION
   ========================================================= */

const STORAGE_KEY = "hotspotRouterMap.routers";

const DEFAULT_ROUTERS = [];

const STATUS = {
  active: {
    label: "Active",
    emoji: "🟢",
    color: "#2fbf6c"
  },

  offline: {
    label: "Offline",
    emoji: "🔴",
    color: "#e5484d"
  },

  problem: {
    label: "Problem",
    emoji: "🟠",
    color: "#f2934b"
  }
};


/* =========================================================
   3. APPLICATION STATE
   ========================================================= */

let routers = [];

let map = null;

let markersLayer = null;

let currentRouterId = null;

let editingRouterId = null;

let pendingDeleteId = null;

let selectedStatus = "active";

let selectedLat = null;

let selectedLng = null;

let placingMode = false;

let currentSearchTerm = "";

let isLoading = false;

let isSaving = false;


/* =========================================================
   4. DOM HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}


/* =========================================================
   5. TOAST
   ========================================================= */

function showToast(message, duration = 2500) {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, duration);
}


/* =========================================================
   6. SHEET HELPERS
   ========================================================= */

const SHEET_IDS = [
  "routersSheet",
  "infoSheet",
  "formSheet",
  "settingsSheet"
];

function getSheet(id) {
  return $(id);
}

function hideAllSheets() {
  SHEET_IDS.forEach(id => {
    const sheet = getSheet(id);

    if (!sheet) return;

    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
  });

  const backdrop = $("sheetBackdrop");

  if (backdrop) {
    backdrop.classList.add("hidden");
  }
}

function openSheet(id) {
  hideAllSheets();

  const sheet = getSheet(id);

  if (!sheet) return;

  sheet.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");

  const backdrop = $("sheetBackdrop");

  if (backdrop) {
    backdrop.classList.remove("hidden");
  }
}

function closeSheets() {
  hideAllSheets();
}


/* =========================================================
   7. LOCAL STORAGE BACKUP
   ========================================================= */

/*
   LocalStorage is no longer the main database.

   We still keep a local backup because:
   - it protects against accidental data loss
   - it lets us migrate old router data
   - it provides a temporary offline backup
*/

function getLocalRouters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch (error) {
    console.error("Could not read local router data:", error);
    return [];
  }
}

function saveLocalBackup() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(routers)
    );
  } catch (error) {
    console.warn("Could not save local backup:", error);
  }
}


/* =========================================================
   8. DATA NORMALIZATION
   ========================================================= */

function normalizeRouter(router) {
  if (!router) return null;

  const lat = Number(router.lat);
  const lng = Number(router.lng);

  if (!router.id) {
    return null;
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    id: String(router.id).trim(),

    model: router.model
      ? String(router.model).trim()
      : "",

    lat,

    lng,

    status: STATUS[router.status]
      ? router.status
      : "active",

    notes: router.notes
      ? String(router.notes)
      : "",

    created_at: router.created_at || null,

    updated_at: router.updated_at || null
  };
}


/* =========================================================
   9. SUPABASE LOAD
   ========================================================= */

async function loadRoutersFromSupabase() {
  if (!supabaseClient) {
    throw new Error(
      "Supabase client was not initialized."
    );
  }

  const { data, error } = await supabaseClient
    .from("routers")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error("Supabase load error:", error);
    throw error;
  }

  return Array.isArray(data)
    ? data
        .map(normalizeRouter)
        .filter(Boolean)
    : [];
}


/* =========================================================
   10. SUPABASE INSERT
   ========================================================= */

async function insertRouterIntoSupabase(router) {
  if (!supabaseClient) {
    throw new Error(
      "Supabase client was not initialized."
    );
  }

  const payload = {
    id: router.id,
    model: router.model || "",
    lat: Number(router.lat),
    lng: Number(router.lng),
    status: router.status || "active",
    notes: router.notes || ""
  };

  const { data, error } = await supabaseClient
    .from("routers")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("Supabase insert error:", error);
    throw error;
  }

  return normalizeRouter(data);
}


/* =========================================================
   11. SUPABASE UPDATE
   ========================================================= */

async function updateRouterInSupabase(id, changes) {
  if (!supabaseClient) {
    throw new Error(
      "Supabase client was not initialized."
    );
  }

  const payload = {
    ...changes,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseClient
    .from("routers")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Supabase update error:", error);
    throw error;
  }

  return normalizeRouter(data);
}


/* =========================================================
   12. SUPABASE DELETE
   ========================================================= */

async function deleteRouterFromSupabase(id) {
  if (!supabaseClient) {
    throw new Error(
      "Supabase client was not initialized."
    );
  }

  const { error } = await supabaseClient
    .from("routers")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Supabase delete error:", error);
    throw error;
  }

  return true;
}


/* =========================================================
   13. MIGRATE OLD LOCAL DATA
   ========================================================= */

/*
   If you previously used the app before Supabase,
   your routers may still be inside localStorage.

   If Supabase is empty, we automatically copy those
   old routers into Supabase.

   We DO NOT delete the local backup.
*/

async function migrateLocalRoutersIfNeeded() {
  try {
    const localRouters = getLocalRouters();

    if (!localRouters.length) {
      return false;
    }

    const validLocalRouters = localRouters
      .map(normalizeRouter)
      .filter(Boolean);

    if (!validLocalRouters.length) {
      return false;
    }

    const { count, error: countError } =
      await supabaseClient
        .from("routers")
        .select("*", {
          count: "exact",
          head: true
        });

    if (countError) {
      console.warn(
        "Could not check Supabase router count:",
        countError
      );

      return false;
    }

    /*
       Only migrate automatically when the database
       is completely empty.
    */

    if (count !== 0) {
      return false;
    }

    showToast(
      "Moving existing routers to the database..."
    );

    const payload = validLocalRouters.map(router => ({
      id: router.id,
      model: router.model || "",
      lat: router.lat,
      lng: router.lng,
      status: router.status || "active",
      notes: router.notes || ""
    }));

    const { error } = await supabaseClient
      .from("routers")
      .upsert(payload, {
        onConflict: "id"
      });

    if (error) {
      console.error(
        "Migration error:",
        error
      );

      showToast(
        "Could not migrate old router data."
      );

      return false;
    }

    showToast(
      `${payload.length} existing router${payload.length === 1 ? "" : "s"} moved to Supabase.`
    );

    return true;

  } catch (error) {
    console.error(
      "Local migration failed:",
      error
    );

    return false;
  }
}


/* =========================================================
   14. LOAD APPLICATION DATA
   ========================================================= */

async function loadApplicationData() {
  if (!supabaseClient) {
    showToast(
      "Supabase could not be initialized."
    );

    return;
  }

  isLoading = true;

  try {
    /*
       First load the database.
    */

    let databaseRouters =
      await loadRoutersFromSupabase();

    /*
       If database is empty, check whether the old
       browser has router data that needs migrating.
    */

    if (databaseRouters.length === 0) {
      const migrated =
        await migrateLocalRoutersIfNeeded();

      if (migrated) {
        databaseRouters =
          await loadRoutersFromSupabase();
      }
    }

    routers = databaseRouters;

    saveLocalBackup();

    renderAll();

  } catch (error) {
    console.error(
      "Could not load application data:",
      error
    );

    /*
       If Supabase fails, show local backup rather
       than showing a completely empty map.
    */

    const localRouters = getLocalRouters();

    if (localRouters.length) {
      routers = localRouters
        .map(normalizeRouter)
        .filter(Boolean);

      renderAll();

      showToast(
        "Database unavailable. Showing local backup.",
        5000
      );
    } else {
      routers = [];

      renderAll();

      showToast(
        "Could not connect to Supabase.",
        5000
      );
    }

  } finally {
    isLoading = false;
  }
}


/* =========================================================
   15. MAP INITIALIZATION
   ========================================================= */

function initMap() {
  map = L.map("map", {
    zoomControl: false,
    attributionControl: true
  }).setView(
    [-1.286389, 36.817223],
    12
  );

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 20,
      attribution:
        '&copy; OpenStreetMap contributors'
    }
  ).addTo(map);

  L.control.zoom({
    position: "bottomright"
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  map.on("click", handleMapClick);
}


/* =========================================================
   16. MARKER ICON
   ========================================================= */

function iconFor(status) {
  const info =
    STATUS[status] || STATUS.active;

  return L.divIcon({
    className: "",
    html:
      '<div class="router-marker">' +
      info.emoji +
      "</div>",
    iconSize: [34, 34],
    iconAnchor: [17, 30],
    popupAnchor: [0, -30]
  });
}


/* =========================================================
   17. RENDER MAP MARKERS
   ========================================================= */

function renderMarkers() {
  if (!map || !markersLayer) {
    return;
  }

  markersLayer.clearLayers();

  routers.forEach(router => {
    const marker = L.marker(
      [router.lat, router.lng],
      {
        icon: iconFor(router.status)
      }
    );

    marker.on("click", () => {
      showRouterInfo(router.id);
    });

    marker.addTo(markersLayer);
  });
}


/* =========================================================
   18. FIT MAP TO ROUTERS
   ========================================================= */

function fitMapToRouters() {
  if (!map || !routers.length) {
    return;
  }

  const points = routers.map(router => [
    router.lat,
    router.lng
  ]);

  if (points.length === 1) {
    map.setView(points[0], 16);
    return;
  }

  const bounds =
    L.latLngBounds(points);

  map.fitBounds(bounds, {
    padding: [40, 40],
    maxZoom: 16
  });
}


/* =========================================================
   19. RENDER ROUTER LIST
   ========================================================= */

function renderRouterList(searchTerm = "") {
  const list = $("routerList");

  if (!list) return;

  const term =
    String(searchTerm || "")
      .trim()
      .toLowerCase();

  let filtered = routers;

  if (term) {
    filtered = routers.filter(router => {
      return (
        router.id.toLowerCase().includes(term) ||
        router.model.toLowerCase().includes(term) ||
        router.status.toLowerCase().includes(term) ||
        router.notes.toLowerCase().includes(term)
      );
    });
  }

  filtered.sort((a, b) =>
    a.id.localeCompare(b.id, undefined, {
      numeric: true,
      sensitivity: "base"
    })
  );

  if (!filtered.length) {
    list.innerHTML =
      '<div class="empty-state">' +
      (term
        ? "No routers match your search."
        : "No routers added yet.") +
      "</div>";

    return;
  }

  list.innerHTML = "";

  filtered.forEach(router => {
    const status =
      STATUS[router.status] ||
      STATUS.active;

    const item =
      document.createElement("button");

    item.type = "button";

    item.className = "router-item";

    item.innerHTML = `
      <div class="router-item-main">
        <div class="router-item-id">
          ${escapeHtml(router.id)}
        </div>

        <div class="router-item-model">
          ${escapeHtml(router.model || "Unknown model")}
        </div>
      </div>

      <div class="router-item-right">
        <div class="router-item-status">
          ${status.emoji}
        </div>

        <div class="router-item-arrow">
          ›
        </div>
      </div>
    `;

    item.addEventListener(
      "click",
      () => {
        showRouterInfo(router.id);
      }
    );

    list.appendChild(item);
  });
}


/* =========================================================
   20. UPDATE ROUTER COUNT
   ========================================================= */

function updateRouterCount() {
  const count = $("routerCount");

  if (!count) return;

  count.textContent = routers.length;
}


/* =========================================================
   21. RENDER ALL
   ========================================================= */

function renderAll() {
  renderMarkers();
  renderRouterList(currentSearchTerm);
  updateRouterCount();
}


/* =========================================================
   22. ESCAPE HTML
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================================
   23. SHOW ROUTER INFORMATION
   ========================================================= */

function showRouterInfo(id) {
  const router =
    routers.find(item => item.id === id);

  if (!router) {
    showToast("Router not found.");
    return;
  }

  currentRouterId = id;

  const status =
    STATUS[router.status] ||
    STATUS.active;

  $("infoId").textContent =
    router.id;

  $("infoModel").textContent =
    router.model || "Unknown model";

  $("infoStatus").innerHTML =
    `${status.emoji} ${status.label}`;

  $("infoNotes").textContent =
    router.notes || "No notes";

  $("infoCoords").textContent =
    `${router.lat.toFixed(6)}, ${router.lng.toFixed(6)}`;

  openSheet("infoSheet");

  /*
     Center map on selected router.
  */

  if (map) {
    map.setView(
      [router.lat, router.lng],
      Math.max(map.getZoom(), 16),
      {
        animate: true
      }
    );
  }
}


/* =========================================================
   24. NAVIGATE TO ROUTER
   ========================================================= */

function navigateToRouter() {
  if (!currentRouterId) {
    return;
  }

  const router =
    routers.find(
      item => item.id === currentRouterId
    );

  if (!router) {
    showToast("Router not found.");
    return;
  }

  const url =
    "https://www.google.com/maps/dir/?api=1&destination=" +
    encodeURIComponent(
      router.lat + "," + router.lng
    );

  window.open(
    url,
    "_blank",
    "noopener,noreferrer"
  );
}


/* =========================================================
   25. OPEN ADD FORM
   ========================================================= */

function openAddForm() {
  editingRouterId = null;

  $("formTitle").textContent =
    "Add Router";

  $("fieldId").value = "";

  $("fieldModel").value = "";

  $("fieldNotes").value = "";

  selectedStatus = "active";

  selectedLat = null;
  selectedLng = null;

  updateStatusPicker();

  updateLocationPreview();

  $("saveRouterBtn").disabled = true;

  openSheet("formSheet");

  setTimeout(() => {
    $("fieldId").focus();
  }, 250);
}


/* =========================================================
   26. OPEN EDIT FORM
   ========================================================= */

function openEditForm() {
  if (!currentRouterId) {
    return;
  }

  const router =
    routers.find(
      item => item.id === currentRouterId
    );

  if (!router) {
    showToast("Router not found.");
    return;
  }

  editingRouterId = router.id;

  $("formTitle").textContent =
    "Edit Router";

  $("fieldId").value =
    router.id;

  $("fieldModel").value =
    router.model || "";

  $("fieldNotes").value =
    router.notes || "";

  selectedStatus =
    router.status || "active";

  selectedLat =
    Number(router.lat);

  selectedLng =
    Number(router.lng);

  updateStatusPicker();

  updateLocationPreview();

  updateSaveButton();

  openSheet("formSheet");
}


/* =========================================================
   27. STATUS PICKER
   ========================================================= */

function updateStatusPicker() {
  const buttons =
    document.querySelectorAll(
      ".status-opt"
    );

  buttons.forEach(button => {
    const status =
      button.dataset.status;

    button.classList.toggle(
      "selected",
      status === selectedStatus
    );

    button.classList.toggle(
      "active",
      status === selectedStatus
    );
  });
}


/* =========================================================
   28. LOCATION PREVIEW
   ========================================================= */

function updateLocationPreview() {
  const preview =
    $("locationPreview");

  if (!preview) return;

  if (
    selectedLat === null ||
    selectedLng === null
  ) {
    preview.textContent =
      "No location selected yet";

    return;
  }

  preview.textContent =
    `${Number(selectedLat).toFixed(6)}, ${Number(selectedLng).toFixed(6)}`;
}


/* =========================================================
   29. UPDATE SAVE BUTTON
   ========================================================= */

function updateSaveButton() {
  const button =
    $("saveRouterBtn");

  if (!button) return;

  const id =
    $("fieldId").value.trim();

  const model =
    $("fieldModel").value.trim();

  const hasLocation =
    Number.isFinite(Number(selectedLat)) &&
    Number.isFinite(Number(selectedLng));

  const hasRequiredFields =
    id.length > 0 &&
    model.length > 0 &&
    hasLocation;

  button.disabled =
    !hasRequiredFields ||
    isSaving;
}


/* =========================================================
   30. HANDLE MAP CLICK
   ========================================================= */

function handleMapClick(event) {
  if (!placingMode) {
    return;
  }

  selectedLat =
    event.latlng.lat;

  selectedLng =
    event.latlng.lng;

  placingMode = false;

  hidePlacingHint();

  updateLocationPreview();

  updateSaveButton();

  /*
     Open form again if it was closed
     during map selection.
  */

  openSheet("formSheet");

  showToast(
    "Location selected."
  );
}


/* =========================================================
   31. START MAP PLACEMENT
   ========================================================= */

function startMapPlacement() {
  placingMode = true;

  hideAllSheets();

  const hint =
    $("placingHint");

  if (hint) {
    hint.classList.remove("hidden");
  }

  showToast(
    "Tap the map to place the router."
  );
}


/* =========================================================
   32. CANCEL MAP PLACEMENT
   ========================================================= */

function cancelMapPlacement() {
  placingMode = false;

  hidePlacingHint();

  if (editingRouterId) {
    openSheet("formSheet");
  }
}


/* =========================================================
   33. HIDE PLACING HINT
   ========================================================= */

function hidePlacingHint() {
  const hint =
    $("placingHint");

  if (hint) {
    hint.classList.add("hidden");
  }
}


/* =========================================================
   34. USE DEVICE LOCATION
   ========================================================= */

function getCurrentLocation(callback) {
  if (!navigator.geolocation) {
    showToast(
      "Location is not supported on this device."
    );

    return;
  }

  showToast(
    "Getting your location..."
  );

  navigator.geolocation.getCurrentPosition(
    position => {
      const lat =
        position.coords.latitude;

      const lng =
        position.coords.longitude;

      callback(lat, lng);
    },

    error => {
      console.error(
        "Geolocation error:",
        error
      );

      let message =
        "Could not get your location.";

      if (error.code === 1) {
        message =
          "Location permission was denied.";
      } else if (error.code === 2) {
        message =
          "Your location could not be determined.";
      } else if (error.code === 3) {
        message =
          "Location request timed out.";
      }

      showToast(message, 4000);
    },

    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}


/* =========================================================
   35. USE LOCATION FOR FORM
   ========================================================= */

function useLocationForForm() {
  getCurrentLocation(
    (lat, lng) => {
      selectedLat = lat;
      selectedLng = lng;

      updateLocationPreview();

      updateSaveButton();

      if (map) {
        map.setView(
          [lat, lng],
          17,
          {
            animate: true
          }
        );
      }

      showToast(
        "Your current location has been selected."
      );
    }
  );
}


/* =========================================================
   36. LOCATE FAB
   ========================================================= */

function locateUserOnMap() {
  getCurrentLocation(
    (lat, lng) => {
      if (!map) return;

      map.setView(
        [lat, lng],
        17,
        {
          animate: true
        }
      );

      /*
         Temporary accuracy marker.
      */

      const locationMarker =
        L.circleMarker(
          [lat, lng],
          {
            radius: 8,
            weight: 3,
            fillOpacity: 0.8
          }
        ).addTo(map);

      setTimeout(() => {
        map.removeLayer(
          locationMarker
        );
      }, 5000);

      showToast(
        "Map centered on your location."
      );
    }
  );
}


/* =========================================================
   37. SAVE ROUTER
   ========================================================= */

async function handleRouterSubmit(event) {
  event.preventDefault();

  if (isSaving) {
    return;
  }

  const id =
    $("fieldId").value.trim();

  const model =
    $("fieldModel").value.trim();

  const notes =
    $("fieldNotes").value.trim();

  const lat =
    Number(selectedLat);

  const lng =
    Number(selectedLng);

  if (!id) {
    showToast(
      "Enter a Router ID."
    );

    $("fieldId").focus();

    return;
  }

  if (!model) {
    showToast(
      "Enter the router model."
    );

    $("fieldModel").focus();

    return;
  }

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    showToast(
      "Select a router location."
    );

    return;
  }

  /*
     Check duplicate ID when adding.
  */

  if (!editingRouterId) {
    const exists =
      routers.some(
        router =>
          router.id.toLowerCase() ===
          id.toLowerCase()
      );

    if (exists) {
      showToast(
        "A router with that ID already exists."
      );

      $("fieldId").focus();

      return;
    }
  }

  isSaving = true;

  updateSaveButton();

  try {
    if (editingRouterId) {
      /*
         EDIT EXISTING ROUTER
      */

      const oldId =
        editingRouterId;

      /*
         The database primary key is the router ID.

         If the ID is changed, we handle this as:
         1. insert the new router
         2. delete the old router
      */

      if (id !== oldId) {
        const existingNewId =
          routers.some(
            router =>
              router.id.toLowerCase() ===
              id.toLowerCase() &&
              router.id !== oldId
          );

        if (existingNewId) {
          showToast(
            "That Router ID is already in use."
          );

          return;
        }

        await insertRouterIntoSupabase({
          id,
          model,
          lat,
          lng,
          status: selectedStatus,
          notes
        });

        await deleteRouterFromSupabase(
          oldId
        );

        routers =
          routers.filter(
            router =>
              router.id !== oldId
          );

        routers.push({
          id,
          model,
          lat,
          lng,
          status: selectedStatus,
          notes
        });

      } else {
        /*
           Normal update.
        */

        const updated =
          await updateRouterInSupabase(
            oldId,
            {
              model,
              lat,
              lng,
              status: selectedStatus,
              notes
            }
          );

        routers =
          routers.map(
            router =>
              router.id === oldId
                ? updated
                : router
          );
      }

      showToast(
        "Router updated successfully."
      );

    } else {
      /*
         ADD NEW ROUTER
      */

      const newRouter =
        await insertRouterIntoSupabase({
          id,
          model,
          lat,
          lng,
          status: selectedStatus,
          notes
        });

      routers.push(newRouter);

      showToast(
        "Router added successfully."
      );
    }

    saveLocalBackup();

    renderAll();

    hideAllSheets();

    editingRouterId = null;

  } catch (error) {
    console.error(
      "Could not save router:",
      error
    );

    if (
      error &&
      error.code === "23505"
    ) {
      showToast(
        "That Router ID already exists.",
        4000
      );
    } else {
      showToast(
        "Could not save router. Check your internet connection.",
        5000
      );
    }

  } finally {
    isSaving = false;

    updateSaveButton();
  }
}


/* =========================================================
   38. DELETE CONFIRMATION
   ========================================================= */

function askDeleteRouter() {
  if (!currentRouterId) {
    return;
  }

  const router =
    routers.find(
      item => item.id === currentRouterId
    );

  if (!router) {
    return;
  }

  pendingDeleteId =
    router.id;

  const text =
    $("confirmText");

  if (text) {
    text.textContent =
      `Delete router ${router.id}?`;
  }

  const overlay =
    $("confirmOverlay");

  if (overlay) {
    overlay.classList.remove(
      "hidden"
    );
  }
}


/* =========================================================
   39. CANCEL DELETE
   ========================================================= */

function cancelDelete() {
  pendingDeleteId = null;

  const overlay =
    $("confirmOverlay");

  if (overlay) {
    overlay.classList.add(
      "hidden"
    );
  }
}


/* =========================================================
   40. CONFIRM DELETE
   ========================================================= */

async function confirmDelete() {
  if (!pendingDeleteId) {
    return;
  }

  const id =
    pendingDeleteId;

  const deleteButton =
    $("confirmDeleteBtn");

  if (deleteButton) {
    deleteButton.disabled = true;
  }

  try {
    await deleteRouterFromSupabase(
      id
    );

    routers =
      routers.filter(
        router =>
          router.id !== id
      );

    saveLocalBackup();

    renderAll();

    cancelDelete();

    hideAllSheets();

    currentRouterId = null;

    showToast(
      "Router deleted."
    );

  } catch (error) {
    console.error(
      "Could not delete router:",
      error
    );

    showToast(
      "Could not delete router. Check your internet connection.",
      5000
    );

    if (deleteButton) {
      deleteButton.disabled = false;
    }
  }
}


/* =========================================================
   41. SEARCH
   ========================================================= */

function performSearch(term) {
  currentSearchTerm =
    String(term || "")
      .trim()
      .toLowerCase();

  renderRouterList(
    currentSearchTerm
  );

  updateSearchClearButton();

  /*
     If exactly one router matches,
     center the map on it.
  */

  if (!currentSearchTerm) {
    return;
  }

  const matches =
    routers.filter(router => {
      return (
        router.id.toLowerCase().includes(
          currentSearchTerm
        ) ||
        router.model.toLowerCase().includes(
          currentSearchTerm
        ) ||
        router.notes.toLowerCase().includes(
          currentSearchTerm
        ) ||
        router.status.toLowerCase().includes(
          currentSearchTerm
        )
      );
    });

  if (matches.length === 1) {
    const router =
      matches[0];

    if (map) {
      map.setView(
        [router.lat, router.lng],
        17,
        {
          animate: true
        }
      );
    }
  }
}


/* =========================================================
   42. SEARCH CLEAR
   ========================================================= */

function clearSearch() {
  const input =
    $("searchInput");

  const listInput =
    $("listSearchInput");

  if (input) {
    input.value = "";
  }

  if (listInput) {
    listInput.value = "";
  }

  currentSearchTerm = "";

  renderRouterList("");

  updateSearchClearButton();
}


/* =========================================================
   43. SEARCH CLEAR BUTTON
   ========================================================= */

function updateSearchClearButton() {
  const button =
    $("searchClearBtn");

  const input =
    $("searchInput");

  if (!button || !input) {
    return;
  }

  button.classList.toggle(
    "hidden",
    !input.value.trim()
  );
}


/* =========================================================
   44. SEARCH MATCHES OVERLAY
   ========================================================= */

function showSearchMatches() {
  const input =
    $("searchInput");

  if (!input) {
    return;
  }

  const term =
    input.value.trim().toLowerCase();

  if (!term) {
    return;
  }

  const matches =
    routers.filter(router => {
      return (
        router.id.toLowerCase().includes(term) ||
        router.model.toLowerCase().includes(term) ||
        router.status.toLowerCase().includes(term) ||
        router.notes.toLowerCase().includes(term)
      );
    });

  const list =
    $("searchMatchesList");

  if (!list) {
    return;
  }

  list.innerHTML = "";

  if (!matches.length) {
    list.innerHTML =
      '<div class="empty-state">No matching routers.</div>';
  } else {
    matches.forEach(router => {
      const button =
        document.createElement("button");

      button.type = "button";

      button.className =
        "router-item";

      button.innerHTML = `
        <div class="router-item-main">
          <div class="router-item-id">
            ${escapeHtml(router.id)}
          </div>

          <div class="router-item-model">
            ${escapeHtml(router.model)}
          </div>
        </div>

        <div class="router-item-right">
          <div class="router-item-status">
            ${
              (STATUS[router.status] ||
                STATUS.active).emoji
            }
          </div>

          <div class="router-item-arrow">
            ›
          </div>
        </div>
      `;

      button.addEventListener(
        "click",
        () => {
          $("searchMatchesOverlay")
            .classList.add("hidden");

          showRouterInfo(router.id);
        }
      );

      list.appendChild(button);
    });
  }

  $("searchMatchesOverlay")
    .classList.remove("hidden");
}


/* =========================================================
   45. EXPORT DATA
   ========================================================= */

function exportData() {
  const data =
    JSON.stringify(
      routers,
      null,
      2
    );

  const blob =
    new Blob(
      [data],
      {
        type: "application/json"
      }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    "hotspot-router-map-backup-" +
    new Date()
      .toISOString()
      .slice(0, 10) +
    ".json";

  document.body.appendChild(link);

  link.click();

  link.remove();

  URL.revokeObjectURL(url);

  showToast(
    "Router data exported."
  );
}


/* =========================================================
   46. IMPORT DATA
   ========================================================= */

function importDataFile(file) {
  if (!file) {
    return;
  }

  const reader =
    new FileReader();

  reader.onload = async event => {
    try {
      const parsed =
        JSON.parse(
          event.target.result
        );

      if (!Array.isArray(parsed)) {
        throw new Error(
          "Imported data is not an array."
        );
      }

      const imported =
        parsed
          .map(normalizeRouter)
          .filter(Boolean);

      if (!imported.length) {
        showToast(
          "No valid routers were found in the file."
        );

        return;
      }

      /*
         Ask before replacing/merging.
         The current implementation uses UPSERT,
         so existing IDs are updated and new IDs
         are inserted.
      */

      const payload =
        imported.map(router => ({
          id: router.id,
          model: router.model || "",
          lat: router.lat,
          lng: router.lng,
          status: router.status || "active",
          notes: router.notes || ""
        }));

      const {
        data,
        error
      } = await supabaseClient
        .from("routers")
        .upsert(
          payload,
          {
            onConflict: "id"
          }
        )
        .select();

      if (error) {
        throw error;
      }

      /*
         Reload everything from Supabase so the
         UI exactly matches the database.
      */

      routers =
        (data || [])
          .map(normalizeRouter)
          .filter(Boolean);

      /*
         Important:
         The returned data may contain only the
         imported/upserted rows, so reload the
         complete database.
      */

      routers =
        await loadRoutersFromSupabase();

      saveLocalBackup();

      renderAll();

      showToast(
        `${imported.length} router${imported.length === 1 ? "" : "s"} imported.`
      );

    } catch (error) {
      console.error(
        "Import error:",
        error
      );

      showToast(
        "Could not import the router file.",
        5000
      );
    }
  };

  reader.readAsText(file);
}


/* =========================================================
   47. OPEN ROUTER LIST
   ========================================================= */

function openRouterList() {
  currentSearchTerm = "";

  const search =
    $("listSearchInput");

  if (search) {
    search.value = "";
  }

  renderRouterList("");

  openSheet(
    "routersSheet"
  );
}


/* =========================================================
   48. OPEN SETTINGS
   ========================================================= */

function openSettings() {
  openSheet(
    "settingsSheet"
  );
}


/* =========================================================
   49. MOBILE BOTTOM NAVIGATION
   ========================================================= */

function setActiveNav(tab) {
  const buttons =
    document.querySelectorAll(
      ".nav-btn"
    );

  buttons.forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.tab === tab
    );
  });
}

function handleBottomNav(tab) {
  if (tab === "map") {
    setActiveNav("map");

    hideAllSheets();

    return;
  }

  if (tab === "routers") {
    setActiveNav("routers");

    openRouterList();

    return;
  }

  if (tab === "add") {
    setActiveNav("add");

    openAddForm();

    return;
  }
}


/* =========================================================
   50. SETTINGS BUTTON
   ========================================================= */

function setupEventListeners() {

  /*
     Bottom navigation
  */

  document
    .querySelectorAll(".nav-btn")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          handleBottomNav(
            button.dataset.tab
          );
        }
      );
    });


  /*
     Close buttons
  */

  document
    .querySelectorAll("[data-close]")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          closeSheets();

          setActiveNav("map");
        }
      );
    });


  /*
     Sheet backdrop
  */

  const backdrop =
    $("sheetBackdrop");

  if (backdrop) {
    backdrop.addEventListener(
      "click",
      () => {
        closeSheets();

        setActiveNav("map");

        if (placingMode) {
          cancelMapPlacement();
        }
      }
    );
  }


  /*
     More button
  */

  const moreBtn =
    $("moreBtn");

  if (moreBtn) {
    moreBtn.addEventListener(
      "click",
      () => {
        openSettings();
      }
    );
  }


  /*
     Locate FAB
  */

  const locateFab =
    $("locateFab");

  if (locateFab) {
    locateFab.addEventListener(
      "click",
      locateUserOnMap
    );
  }


  /*
     Add/edit form
  */

  const form =
    $("routerForm");

  if (form) {
    form.addEventListener(
      "submit",
      handleRouterSubmit
    );
  }


  /*
     Cancel form
  */

  const cancelForm =
    $("cancelFormBtn");

  if (cancelForm) {
    cancelForm.addEventListener(
      "click",
      () => {
        editingRouterId = null;

        placingMode = false;

        hidePlacingHint();

        hideAllSheets();

        setActiveNav("map");
      }
    );
  }


  /*
     Status buttons
  */

  document
    .querySelectorAll(".status-opt")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          selectedStatus =
            button.dataset.status;

          updateStatusPicker();

          updateSaveButton();
        }
      );
    });


  /*
     Use location for form
  */

  const useLocationBtn =
    $("useLocationForFormBtn");

  if (useLocationBtn) {
    useLocationBtn.addEventListener(
      "click",
      useLocationForForm
    );
  }


  /*
     Tap map to choose location
  */

  const tapMapBtn =
    $("tapMapBtn");

  if (tapMapBtn) {
    tapMapBtn.addEventListener(
      "click",
      startMapPlacement
    );
  }


  /*
     Cancel map placement
  */

  const cancelPlacingBtn =
    $("cancelPlacingBtn");

  if (cancelPlacingBtn) {
    cancelPlacingBtn.addEventListener(
      "click",
      cancelMapPlacement
    );
  }


  /*
     Navigate
  */

  const navigateBtn =
    $("navigateBtn");

  if (navigateBtn) {
    navigateBtn.addEventListener(
      "click",
      navigateToRouter
    );
  }


  /*
     Edit router
  */

  const editBtn =
    $("infoEditBtn");

  if (editBtn) {
    editBtn.addEventListener(
      "click",
      openEditForm
    );
  }


  /*
     Delete router
  */

  const deleteBtn =
    $("infoDeleteBtn");

  if (deleteBtn) {
    deleteBtn.addEventListener(
      "click",
      askDeleteRouter
    );
  }


  /*
     Delete confirmation
  */

  const confirmDeleteBtn =
    $("confirmDeleteBtn");

  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener(
      "click",
      confirmDelete
    );
  }


  /*
     Cancel deletion
  */

  const confirmCancelBtn =
    $("confirmCancelBtn");

  if (confirmCancelBtn) {
    confirmCancelBtn.addEventListener(
      "click",
      cancelDelete
    );
  }


  /*
     Search
  */

  const searchInput =
    $("searchInput");

  if (searchInput) {

    searchInput.addEventListener(
      "input",
      event => {
        performSearch(
          event.target.value
        );
      }
    );

    searchInput.addEventListener(
      "keydown",
      event => {
        if (
          event.key === "Enter"
        ) {
          event.preventDefault();

          showSearchMatches();
        }

        if (
          event.key === "Escape"
        ) {
          clearSearch();
        }
      }
    );
  }


  /*
     Search clear
  */

  const searchClear =
    $("searchClearBtn");

  if (searchClear) {
    searchClear.addEventListener(
      "click",
      clearSearch
    );
  }


  /*
     Router list search
  */

  const listSearch =
    $("listSearchInput");

  if (listSearch) {
    listSearch.addEventListener(
      "input",
      event => {
        renderRouterList(
          event.target.value
        );
      }
    );
  }


  /*
     Search matches close
  */

  const closeMatches =
    $("closeSearchMatchesBtn");

  if (closeMatches) {
    closeMatches.addEventListener(
      "click",
      () => {
        $("searchMatchesOverlay")
          .classList.add("hidden");
      }
    );
  }


  /*
     Export
  */

  const exportBtn =
    $("exportBtn");

  if (exportBtn) {
    exportBtn.addEventListener(
      "click",
      exportData
    );
  }


  /*
     Import
  */

  const importBtn =
    $("importBtn");

  const importFile =
    $("importFile");

  if (
    importBtn &&
    importFile
  ) {
    importBtn.addEventListener(
      "click",
      () => {
        importFile.value = "";
        importFile.click();
      }
    );

    importFile.addEventListener(
      "change",
      event => {
        const file =
          event.target.files &&
          event.target.files[0];

        importDataFile(file);
      }
    );
  }


  /*
     ID / model / notes fields
     update save button.
  */

  [
    "fieldId",
    "fieldModel",
    "fieldNotes"
  ].forEach(id => {
    const field = $(id);

    if (!field) return;

    field.addEventListener(
      "input",
      updateSaveButton
    );
  });


  /*
     Escape key
  */

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key !== "Escape"
      ) {
        return;
      }

      if (placingMode) {
        cancelMapPlacement();
        return;
      }

      const confirmOverlay =
        $("confirmOverlay");

      if (
        confirmOverlay &&
        !confirmOverlay.classList.contains(
          "hidden"
        )
      ) {
        cancelDelete();
        return;
      }

      const searchOverlay =
        $("searchMatchesOverlay");

      if (
        searchOverlay &&
        !searchOverlay.classList.contains(
          "hidden"
        )
      ) {
        searchOverlay.classList.add(
          "hidden"
        );

        return;
      }

      closeSheets();

      setActiveNav("map");
    }
  );
}


/* =========================================================
   51. TOUCH / MAP RESIZE
   ========================================================= */

function setupMapResizeHandling() {
  if (!map) {
    return;
  }

  window.addEventListener(
    "resize",
    () => {
      setTimeout(() => {
        map.invalidateSize();
      }, 150);
    }
  );

  /*
     Some mobile browsers change the viewport
     after the address bar disappears.
  */

  window.addEventListener(
    "orientationchange",
    () => {
      setTimeout(() => {
        map.invalidateSize();
      }, 400);
    }
  );
}


/* =========================================================
   52. SUPABASE CONNECTION TEST
   ========================================================= */

async function testSupabaseConnection() {
  if (!supabaseClient) {
    return false;
  }

  try {
    const {
      error
    } = await supabaseClient
      .from("routers")
      .select("id")
      .limit(1);

    if (error) {
      console.error(
        "Supabase connection test failed:",
        error
      );

      return false;
    }

    return true;

  } catch (error) {
    console.error(
      "Supabase connection test failed:",
      error
    );

    return false;
  }
}


/* =========================================================
   53. DATABASE STATUS INDICATOR
   ========================================================= */

function showDatabaseStatus(connected) {
  if (connected) {
    console.log(
      "✅ Supabase database connected."
    );
  } else {
    console.warn(
      "⚠️ Supabase database is unavailable."
    );
  }
}


/* =========================================================
   54. START APPLICATION
   ========================================================= */

async function initApp() {
  console.log(
    "Starting Hotspot Router Map..."
  );

  if (!supabaseClient) {
    console.error(
      "Supabase JavaScript library was not loaded."
    );

    showToast(
      "Supabase library failed to load.",
      5000
    );
  }

  /*
     Initialize map first so the user sees
     something immediately.
  */

  initMap();

  setupEventListeners();

  setupMapResizeHandling();

  /*
     Render empty state immediately.
  */

  renderAll();

  /*
     Test database.
  */

  const connected =
    await testSupabaseConnection();

  showDatabaseStatus(
    connected
  );

  if (!connected) {
    /*
       Try to load local backup.
    */

    const localRouters =
      getLocalRouters();

    if (localRouters.length) {
      routers =
        localRouters
          .map(normalizeRouter)
          .filter(Boolean);

      renderAll();

      showToast(
        "Database unavailable. Using local backup.",
        5000
      );
    } else {
      showToast(
        "Unable to connect to database.",
        5000
      );
    }

    return;
  }

  /*
     Load the actual Supabase data.
  */

  await loadApplicationData();

  /*
     If routers exist, show them.
  */

  if (routers.length) {
    setTimeout(() => {
      fitMapToRouters();
    }, 200);
  }

  /*
     Make sure Leaflet recalculates its size
     after the page finishes loading.
  */

  setTimeout(() => {
    if (map) {
      map.invalidateSize();
    }
  }, 500);
}


/* =========================================================
   55. START WHEN PAGE IS READY
   ========================================================= */

if (
  document.readyState === "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    initApp
  );
} else {
  initApp();
}