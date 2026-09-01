/* ============================================================
   Hotspot Router Map — app.js  (mobile-first)
   Plain vanilla JS. Data lives in localStorage.
   ============================================================ */

(function () {
  "use strict";

  const STORAGE_KEY = "hotspotRouterMap.routers";

  const STATUS = {
    active:  { label: "Active",  emoji: "🟢", color: "#2fbf6c" },
    offline: { label: "Offline", emoji: "🔴", color: "#e5484d" },
    problem: { label: "Problem", emoji: "🟠", color: "#f2934b" }
  };

  const DEFAULT_ROUTERS = [
    { id: "R01", model: "Tenda F6", lat: -1.2345, lng: 36.8765, status: "active", notes: "Installed at the shop" }
  ];

  // ------------------------------------------------------------
  // State
  // ------------------------------------------------------------
  let routers = loadRouters();
  let markers = {};            // id -> Leaflet marker
  let editingId = null;        // router id being edited, or null when adding
  let pendingLatLng = null;    // {lat, lng} chosen for the router being added/edited
  let placingLocation = false; // true while waiting for a map tap to set a location
  let pendingDeleteId = null;
  let activeInfoId = null;     // router id currently shown in the info sheet

  // ------------------------------------------------------------
  // Storage helpers
  // ------------------------------------------------------------
  function loadRouters() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_ROUTERS.slice();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return DEFAULT_ROUTERS.slice();
      return parsed;
    } catch (e) {
      console.warn("Could not read saved routers, starting fresh.", e);
      return DEFAULT_ROUTERS.slice();
    }
  }

  function saveRouters() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routers));
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ------------------------------------------------------------
  // Map setup
  // ------------------------------------------------------------
  const map = L.map("map", { zoomControl: true }).setView(
    routers.length ? [routers[0].lat, routers[0].lng] : [0, 0],
    routers.length ? 13 : 2
  );

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  let placingMarker = null; // temporary pin shown while choosing a location

  map.on("click", function (e) {
    if (!placingLocation) return;
    pendingLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
    showPlacingMarker(pendingLatLng);
    placingLocation = false;
    document.getElementById("placingHint").classList.add("hidden");
    updateLocationPreview();
    openSheet(document.getElementById("formSheet"), "add");
  });

  function showPlacingMarker(latlng) {
    if (placingMarker) {
      placingMarker.setLatLng(latlng);
    } else {
      placingMarker = L.marker(latlng, {
        icon: L.divIcon({
          className: "",
          html: '<div class="router-marker">📍</div>',
          iconSize: [32, 32],
          iconAnchor: [16, 30]
        })
      }).addTo(map);
    }
  }

  function clearPlacingMarker() {
    if (placingMarker) {
      map.removeLayer(placingMarker);
      placingMarker = null;
    }
  }

  // ------------------------------------------------------------
  // Marker icon
  // ------------------------------------------------------------
  function iconFor(status) {
    const emoji = (STATUS[status] || STATUS.active).emoji;
    return L.divIcon({
      className: "",
      html: '<div class="router-marker">' + emoji + '</div>',
      iconSize: [34, 34],
      iconAnchor: [17, 30]
    });
  }

  // ------------------------------------------------------------
  // Render: markers + router list
  // ------------------------------------------------------------
  function renderAll() {
    renderMarkers();
    renderList();
  }

  function renderMarkers() {
    Object.keys(markers).forEach(function (id) {
      if (!routers.find(function (r) { return r.id === id; })) {
        map.removeLayer(markers[id]);
        delete markers[id];
      }
    });

    routers.forEach(function (r) {
      if (markers[r.id]) {
        markers[r.id].setLatLng([r.lat, r.lng]);
        markers[r.id].setIcon(iconFor(r.status));
      } else {
        const m = L.marker([r.lat, r.lng], { icon: iconFor(r.status) }).addTo(map);
        m.on("click", function () { showInfo(r.id); });
        markers[r.id] = m;
      }
    });

    // If the info sheet is open for a router, refresh its icon reference
    if (activeInfoId && markers[activeInfoId]) {
      markers[activeInfoId].on("click", function () { showInfo(activeInfoId); });
    }
  }

  function buildRouterRow(r, onClick) {
    const s = STATUS[r.status] || STATUS.active;
    const row = document.createElement("div");
    row.className = "router-row";
    row.innerHTML =
      '<span class="dot">' + s.emoji + '</span>' +
      '<span class="rid">' + escapeHtml(r.id) + '</span>' +
      '<span class="rmodel">' + escapeHtml(r.model) + '</span>';
    row.addEventListener("click", onClick);
    return row;
  }

  function renderRouterListInto(container, list, emptyMsg, onRowClick) {
    container.innerHTML = "";
    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = emptyMsg;
      container.appendChild(empty);
      return;
    }
    list.forEach(function (r) {
      container.appendChild(buildRouterRow(r, function () { onRowClick(r.id); }));
    });
  }

  function renderList() {
    const countEl = document.getElementById("routerCount");
    countEl.textContent = String(routers.length);

    const query = document.getElementById("listSearchInput").value.trim().toLowerCase();
    const filtered = query ? filterRouters(query) : routers;

    renderRouterListInto(
      document.getElementById("routerList"),
      filtered,
      routers.length === 0
        ? 'No routers yet. Tap "Add" to place your first one.'
        : "No routers match your search.",
      function (id) { focusAndShowInfo(id); }
    );
  }

  function filterRouters(query) {
    return routers.filter(function (r) {
      return (
        r.id.toLowerCase().includes(query) ||
        r.model.toLowerCase().includes(query) ||
        (r.notes || "").toLowerCase().includes(query)
      );
    });
  }

  document.getElementById("listSearchInput").addEventListener("input", renderList);

  // ------------------------------------------------------------
  // Bottom sheets — generic open/close
  // ------------------------------------------------------------
  const sheetBackdrop = document.getElementById("sheetBackdrop");
  const allSheets = Array.from(document.querySelectorAll(".sheet"));
  const navButtons = Array.from(document.querySelectorAll(".nav-btn"));

  function setNavActive(tab) {
    navButtons.forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === tab);
    });
  }

  function anySheetOpen() {
    return allSheets.some(function (s) { return s.classList.contains("open"); });
  }

  function openSheet(el, navTab) {
    allSheets.forEach(function (s) {
      if (s !== el) { s.classList.remove("open"); s.setAttribute("aria-hidden", "true"); }
    });
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
    sheetBackdrop.classList.remove("hidden");
    setNavActive(navTab || null);
  }

  function closeSheet(el) {
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
    if (!anySheetOpen()) {
      sheetBackdrop.classList.add("hidden");
      setNavActive("map");
    }
  }

  function closeAllSheets() {
    allSheets.forEach(function (s) {
      s.classList.remove("open");
      s.setAttribute("aria-hidden", "true");
    });
    sheetBackdrop.classList.add("hidden");
    setNavActive("map");
  }

  sheetBackdrop.addEventListener("click", function () {
    if (document.getElementById("formSheet").classList.contains("open")) {
      closeForm();
    } else {
      closeAllSheets();
    }
  });

  document.querySelectorAll("[data-close]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const sheet = btn.closest(".sheet");
      if (sheet && sheet.id === "formSheet") {
        closeForm();
      } else if (sheet) {
        closeSheet(sheet);
      }
    });
  });

  // ------------------------------------------------------------
  // Bottom navigation
  // ------------------------------------------------------------
  document.querySelector('.nav-btn[data-tab="map"]').addEventListener("click", function () {
    if (!placingLocation) closeAllSheets();
  });

  document.querySelector('.nav-btn[data-tab="routers"]').addEventListener("click", function () {
    renderList();
    openSheet(document.getElementById("routersSheet"), "routers");
  });

  document.querySelector('.nav-btn[data-tab="add"]').addEventListener("click", function () {
    openAddForm();
  });

  document.getElementById("moreBtn").addEventListener("click", function () {
    openSheet(document.getElementById("settingsSheet"), null);
  });

  // ------------------------------------------------------------
  // Router info sheet
  // ------------------------------------------------------------
  const infoSheet = document.getElementById("infoSheet");

  function showInfo(id) {
    const r = routers.find(function (x) { return x.id === id; });
    if (!r) return;
    activeInfoId = id;
    const s = STATUS[r.status] || STATUS.active;

    document.getElementById("infoId").textContent = r.id;
    document.getElementById("infoModel").textContent = r.model;
    document.getElementById("infoStatus").textContent = s.emoji + " " + s.label;
    document.getElementById("infoNotes").textContent = r.notes ? r.notes : "—";
    document.getElementById("infoCoords").textContent =
      "📍 " + r.lat.toFixed(5) + ", " + r.lng.toFixed(5);

    document.getElementById("navigateBtn").onclick = function () {
      const url = "https://www.google.com/maps/dir/?api=1&destination=" + r.lat + "," + r.lng;
      window.open(url, "_blank");
    };
    document.getElementById("infoEditBtn").onclick = function () {
      closeSheet(infoSheet);
      openEditForm(r.id);
    };
    document.getElementById("infoDeleteBtn").onclick = function () {
      openConfirmDelete(r.id);
    };

    openSheet(infoSheet, "map");
  }

  function focusAndShowInfo(id) {
    const r = routers.find(function (x) { return x.id === id; });
    if (!r) return;
    map.setView([r.lat, r.lng], Math.max(map.getZoom(), 16), { animate: true });
    showInfo(id);
  }

  // ------------------------------------------------------------
  // Add / Edit form
  // ------------------------------------------------------------
  const formSheet = document.getElementById("formSheet");
  const routerForm = document.getElementById("routerForm");
  const formTitle = document.getElementById("formTitle");
  const fieldId = document.getElementById("fieldId");
  const fieldModel = document.getElementById("fieldModel");
  const fieldNotes = document.getElementById("fieldNotes");
  const statusPicker = document.getElementById("statusPicker");
  const locationPreview = document.getElementById("locationPreview");
  const saveRouterBtn = document.getElementById("saveRouterBtn");
  const placingHint = document.getElementById("placingHint");

  statusPicker.addEventListener("click", function (e) {
    const btn = e.target.closest(".status-opt");
    if (!btn) return;
    statusPicker.querySelectorAll(".status-opt").forEach(function (b) {
      b.classList.remove("active");
    });
    btn.classList.add("active");
  });

  function setStatusPicker(status) {
    statusPicker.querySelectorAll(".status-opt").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-status") === status);
    });
  }

  function getSelectedStatus() {
    const active = statusPicker.querySelector(".status-opt.active");
    return active ? active.getAttribute("data-status") : "active";
  }

  function openAddForm() {
    editingId = null;
    formTitle.textContent = "Add Router";
    fieldId.value = "";
    fieldId.disabled = false;
    fieldModel.value = "";
    fieldNotes.value = "";
    setStatusPicker("active");
    pendingLatLng = null;
    clearPlacingMarker();
    updateLocationPreview();
    openSheet(formSheet, "add");
    fieldId.focus();
  }

  function openEditForm(id) {
    const r = routers.find(function (x) { return x.id === id; });
    if (!r) return;
    editingId = id;
    formTitle.textContent = "Edit Router";
    fieldId.value = r.id;
    fieldId.disabled = true; // ID is the unique key; keep it stable while editing
    fieldModel.value = r.model;
    fieldNotes.value = r.notes || "";
    setStatusPicker(r.status);
    pendingLatLng = { lat: r.lat, lng: r.lng };
    showPlacingMarker(pendingLatLng);
    updateLocationPreview();
    openSheet(formSheet, "add");
  }

  function closeForm() {
    closeSheet(formSheet);
    placingLocation = false;
    pendingLatLng = null;
    editingId = null;
    clearPlacingMarker();
    placingHint.classList.add("hidden");
  }

  function updateLocationPreview() {
    if (pendingLatLng) {
      locationPreview.textContent =
        "📍 Location selected — " + pendingLatLng.lat.toFixed(5) + ", " + pendingLatLng.lng.toFixed(5);
      locationPreview.classList.add("set");
      saveRouterBtn.disabled = false;
    } else {
      locationPreview.textContent = "No location selected yet";
      locationPreview.classList.remove("set");
      saveRouterBtn.disabled = true;
    }
  }

  document.getElementById("tapMapBtn").addEventListener("click", function () {
    closeSheet(formSheet);
    placingLocation = true;
    placingHint.classList.remove("hidden");
  });

  document.getElementById("cancelPlacingBtn").addEventListener("click", function () {
    placingLocation = false;
    placingHint.classList.add("hidden");
    openSheet(formSheet, "add");
  });

  document.getElementById("useLocationForFormBtn").addEventListener("click", function () {
    if (!navigator.geolocation) {
      showToast("Geolocation isn't supported by this browser.");
      return;
    }
    showToast("Locating…");
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        pendingLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        showPlacingMarker(pendingLatLng);
        updateLocationPreview();
        showToast("Using your current location.");
      },
      function () {
        showToast("Couldn't get your location. Check location permissions.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  routerForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const id = fieldId.value.trim();
    const model = fieldModel.value.trim();
    const status = getSelectedStatus();
    const notes = fieldNotes.value.trim();

    if (!id || !model || !pendingLatLng) {
      showToast("Please fill in Router ID, Model, and pick a location.");
      return;
    }

    if (!editingId) {
      if (routers.find(function (r) { return r.id === id; })) {
        showToast('A router with ID "' + id + '" already exists.');
        return;
      }
      routers.push({
        id: id, model: model, lat: pendingLatLng.lat, lng: pendingLatLng.lng,
        status: status, notes: notes
      });
      saveRouters();
      renderAll();
      closeForm();
      showToast("Router " + id + " added.");
      focusAndShowInfo(id);
    } else {
      const r = routers.find(function (x) { return x.id === editingId; });
      if (r) {
        r.model = model;
        r.status = status;
        r.notes = notes;
        r.lat = pendingLatLng.lat;
        r.lng = pendingLatLng.lng;
        saveRouters();
        renderAll();
        const savedId = r.id;
        closeForm();
        showToast("Router " + savedId + " updated.");
        focusAndShowInfo(savedId);
      } else {
        closeForm();
      }
    }
  });

  document.getElementById("cancelFormBtn").addEventListener("click", closeForm);

  // ------------------------------------------------------------
  // Delete confirmation
  // ------------------------------------------------------------
  const confirmOverlay = document.getElementById("confirmOverlay");
  const confirmText = document.getElementById("confirmText");

  function openConfirmDelete(id) {
    pendingDeleteId = id;
    confirmText.textContent = 'Delete router "' + id + '"? This cannot be undone.';
    confirmOverlay.classList.remove("hidden");
  }

  document.getElementById("confirmCancelBtn").addEventListener("click", function () {
    pendingDeleteId = null;
    confirmOverlay.classList.add("hidden");
  });

  document.getElementById("confirmDeleteBtn").addEventListener("click", function () {
    if (pendingDeleteId) {
      routers = routers.filter(function (r) { return r.id !== pendingDeleteId; });
      saveRouters();
      renderAll();
      closeAllSheets();
      showToast("Router deleted.");
    }
    pendingDeleteId = null;
    confirmOverlay.classList.add("hidden");
  });

  // ------------------------------------------------------------
  // Search (top bar)
  // ------------------------------------------------------------
  const searchInput = document.getElementById("searchInput");
  const searchClearBtn = document.getElementById("searchClearBtn");
  const searchMatchesOverlay = document.getElementById("searchMatchesOverlay");

  searchInput.addEventListener("input", function () {
    searchClearBtn.classList.toggle("hidden", searchInput.value.length === 0);
  });

  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") performSearch(searchInput.value);
  });

  document.querySelector(".search-icon").addEventListener("click", function () {
    performSearch(searchInput.value);
  });

  searchClearBtn.addEventListener("click", function () {
    searchInput.value = "";
    searchClearBtn.classList.add("hidden");
    searchInput.focus();
  });

  function performSearch(rawQuery) {
    const query = rawQuery.trim().toLowerCase();
    if (!query) return;

    const matches = filterRouters(query);

    if (matches.length === 0) {
      showToast('No routers found for "' + rawQuery.trim() + '".');
    } else if (matches.length === 1) {
      searchInput.blur();
      focusAndShowInfo(matches[0].id);
    } else {
      renderRouterListInto(
        document.getElementById("searchMatchesList"),
        matches,
        "No matches.",
        function (id) {
          searchMatchesOverlay.classList.add("hidden");
          focusAndShowInfo(id);
        }
      );
      searchMatchesOverlay.classList.remove("hidden");
    }
  }

  document.getElementById("closeSearchMatchesBtn").addEventListener("click", function () {
    searchMatchesOverlay.classList.add("hidden");
  });

  // ------------------------------------------------------------
  // Export / Import (in the "More" sheet)
  // ------------------------------------------------------------
  document.getElementById("exportBtn").addEventListener("click", function () {
    const blob = new Blob([JSON.stringify(routers, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "hotspot-routers-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    closeSheet(document.getElementById("settingsSheet"));
    showToast("Exported " + routers.length + " router(s).");
  });

  const importFile = document.getElementById("importFile");
  document.getElementById("importBtn").addEventListener("click", function () {
    importFile.value = "";
    importFile.click();
  });

  importFile.addEventListener("change", function () {
    const file = importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      let data;
      try {
        data = JSON.parse(reader.result);
      } catch (e) {
        showToast("That file isn't valid JSON.");
        return;
      }
      const validation = validateRouters(data);
      if (!validation.ok) {
        showToast("Import failed: " + validation.error);
        return;
      }
      const merge = window.confirm(
        "Merge with your existing " + routers.length + " router(s)?\n\n" +
        "OK = Merge (routers with matching IDs will be updated)\n" +
        "Cancel = Replace all existing routers with this file"
      );
      if (merge) {
        validation.routers.forEach(function (nr) {
          const existingIdx = routers.findIndex(function (r) { return r.id === nr.id; });
          if (existingIdx >= 0) routers[existingIdx] = nr;
          else routers.push(nr);
        });
      } else {
        routers = validation.routers;
      }
      saveRouters();
      renderAll();
      closeSheet(document.getElementById("settingsSheet"));
      showToast("Imported " + validation.routers.length + " router(s).");
    };
    reader.readAsText(file);
  });

  function validateRouters(data) {
    if (!Array.isArray(data)) return { ok: false, error: "expected a JSON array of routers." };
    const cleaned = [];
    const seenIds = {};
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      if (!r || typeof r !== "object") return { ok: false, error: "item " + i + " is not an object." };
      if (typeof r.id !== "string" || !r.id.trim()) return { ok: false, error: "item " + i + " is missing a valid id." };
      if (typeof r.model !== "string" || !r.model.trim()) return { ok: false, error: 'router "' + r.id + '" is missing a model.' };
      if (typeof r.lat !== "number" || typeof r.lng !== "number" || isNaN(r.lat) || isNaN(r.lng)) {
        return { ok: false, error: 'router "' + r.id + '" has invalid latitude/longitude.' };
      }
      const status = STATUS[r.status] ? r.status : "active";
      if (seenIds[r.id]) return { ok: false, error: 'duplicate router id "' + r.id + '" in file.' };
      seenIds[r.id] = true;
      cleaned.push({
        id: r.id.trim(), model: r.model.trim(), lat: r.lat, lng: r.lng,
        status: status, notes: typeof r.notes === "string" ? r.notes : ""
      });
    }
    return { ok: true, routers: cleaned };
  }

  // ------------------------------------------------------------
  // Floating "use my location" button — recenters the map only
  // ------------------------------------------------------------
  document.getElementById("locateFab").addEventListener("click", function () {
    if (!navigator.geolocation) {
      showToast("Geolocation isn't supported by this browser.");
      return;
    }
    showToast("Locating…");
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        const latlng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        map.setView([latlng.lat, latlng.lng], 16);
        L.circleMarker([latlng.lat, latlng.lng], {
          radius: 8, color: "#3fb6a8", fillColor: "#3fb6a8", fillOpacity: 0.5
        }).addTo(map);
        showToast("Centered on your location.");
      },
      function () {
        showToast("Couldn't get your location. Check location permissions.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // ------------------------------------------------------------
  // Toast
  // ------------------------------------------------------------
  let toastTimer = null;
  function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.add("hidden"); }, 2600);
  }

  // ------------------------------------------------------------
  // Init
  // ------------------------------------------------------------
  renderAll();

  if (routers.length > 1) {
    const bounds = L.latLngBounds(routers.map(function (r) { return [r.lat, r.lng]; }));
    map.fitBounds(bounds, { padding: [60, 60] });
  }
})();