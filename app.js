/* ============================================================
   Hotspot Router Map — app.js
   Supabase-connected version
   ============================================================ */

(function () {
  "use strict";

  // ============================================================
  // SUPABASE CONFIG
  // ============================================================

  const SUPABASE_URL = "https://wifvdrspsjqbslxtjqok.supabase.co";

  // IMPORTANT:
  // This is the publishable/anon key.
  // NEVER put the Supabase secret/service_role key here.
  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_Bs9HS7VNXvZ2ns5eKVDV-A_Rjy72VAR";

  const supabaseClient =
    window.supabase &&
    typeof window.supabase.createClient === "function"
      ? window.supabase.createClient(
          SUPABASE_URL,
          SUPABASE_PUBLISHABLE_KEY
        )
      : null;

  // ============================================================
  // CONSTANTS
  // ============================================================

  const STORAGE_KEY = "hotspotRouterMap.routers";

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

  const DEFAULT_ROUTERS = [
    {
      id: "R01",
      model: "Tenda F6",
      lat: -1.2345,
      lng: 36.8765,
      status: "active",
      notes: "Installed at the shop"
    }
  ];

  // ============================================================
  // STATE
  // ============================================================

  let routers = loadLocalRouters();

  let markers = {};

  let editingId = null;

  let pendingLatLng = null;

  let placingLocation = false;

  let pendingDeleteId = null;

  let activeInfoId = null;

  let placingMarker = null;

  // ============================================================
  // LOCAL BACKUP
  // ============================================================

  function loadLocalRouters() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return normalizeRouters(parsed);
    } catch (error) {
      console.warn("Could not read local router backup:", error);
      return [];
    }
  }

  function saveLocalRouters() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(routers)
      );
    } catch (error) {
      console.warn("Could not save local router backup:", error);
    }
  }

  function normalizeRouter(router) {
    return {
      id: String(router.id || "").trim(),
      model: String(router.model || "").trim(),
      lat: Number(router.lat),
      lng: Number(router.lng),
      status: STATUS[router.status]
        ? router.status
        : "active",
      notes: String(router.notes || "").trim()
    };
  }

  function normalizeRouters(list) {
    return list
      .map(normalizeRouter)
      .filter(function (r) {
        return (
          r.id &&
          r.model &&
          Number.isFinite(r.lat) &&
          Number.isFinite(r.lng)
        );
      });
  }

  // ============================================================
  // SUPABASE
  // ============================================================

  async function loadRoutersFromSupabase() {
    if (!supabaseClient) {
      throw new Error("Supabase client is not available.");
    }

    const { data, error } = await supabaseClient
      .from("routers")
      .select(
        "id, model, lat, lng, status, notes, created_at, updated_at"
      )
      .order("id", { ascending: true });

    if (error) {
      console.error("Supabase LOAD error:", error);
      throw new Error(error.message);
    }

    return normalizeRouters(data || []);
  }

  async function insertRouterIntoSupabase(router) {
    if (!supabaseClient) {
      throw new Error("Supabase client is not available.");
    }

    const payload = {
      id: router.id,
      model: router.model,
      lat: Number(router.lat),
      lng: Number(router.lng),
      status: router.status || "active",
      notes: router.notes || ""
    };

    console.log("Adding router to Supabase:", payload);

    // Deliberately NOT using .select().single()
    const { error } = await supabaseClient
      .from("routers")
      .insert(payload);

    if (error) {
      console.error("Supabase INSERT error:", error);
      throw new Error(error.message);
    }

    return router;
  }

  async function updateRouterInSupabase(router) {
    if (!supabaseClient) {
      throw new Error("Supabase client is not available.");
    }

    const payload = {
      model: router.model,
      lat: Number(router.lat),
      lng: Number(router.lng),
      status: router.status || "active",
      notes: router.notes || "",
      updated_at: new Date().toISOString()
    };

    const { error } = await supabaseClient
      .from("routers")
      .update(payload)
      .eq("id", router.id);

    if (error) {
      console.error("Supabase UPDATE error:", error);
      throw new Error(error.message);
    }

    return router;
  }

  async function deleteRouterFromSupabase(id) {
    if (!supabaseClient) {
      throw new Error("Supabase client is not available.");
    }

    const { error } = await supabaseClient
      .from("routers")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Supabase DELETE error:", error);
      throw new Error(error.message);
    }
  }

  async function upsertRoutersToSupabase(list) {
    if (!supabaseClient) {
      throw new Error("Supabase client is not available.");
    }

    const payload = list.map(function (router) {
      return {
        id: router.id,
        model: router.model,
        lat: Number(router.lat),
        lng: Number(router.lng),
        status: router.status || "active",
        notes: router.notes || ""
      };
    });

    if (!payload.length) {
      return;
    }

    const { error } = await supabaseClient
      .from("routers")
      .upsert(payload, {
        onConflict: "id"
      });

    if (error) {
      console.error("Supabase UPSERT error:", error);
      throw new Error(error.message);
    }
  }

  // ============================================================
  // ESCAPE HTML
  // ============================================================

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ============================================================
  // MAP SETUP
  // ============================================================

  const initialRouter =
    routers.length > 0 ? routers[0] : null;

  const map = L.map("map", {
    zoomControl: true
  }).setView(
    initialRouter
      ? [initialRouter.lat, initialRouter.lng]
      : [-1.286389, 36.817223],
    initialRouter ? 13 : 10
  );

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,

      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  ).addTo(map);

  // ============================================================
  // MAP CLICK FOR LOCATION
  // ============================================================

  map.on("click", function (e) {
    if (!placingLocation) {
      return;
    }

    pendingLatLng = {
      lat: e.latlng.lat,
      lng: e.latlng.lng
    };

    showPlacingMarker(pendingLatLng);

    placingLocation = false;

    document
      .getElementById("placingHint")
      .classList.add("hidden");

    updateLocationPreview();

    openSheet(
      document.getElementById("formSheet"),
      "add"
    );
  });

  function showPlacingMarker(latlng) {
  if (placingMarker) {
    placingMarker.setLatLng(latlng);
    return;
  }

  placingMarker = L.marker(latlng, {
    icon: L.divIcon({
      className: "",

      html:
        '<div class="router-marker placing">' +
        '<span class="router-center"></span>' +
        '<svg class="router-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M3 9.5C8.5 5.2 15.5 5.2 21 9.5" stroke="white" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M6.5 13C10.5 9.9 13.5 9.9 17.5 13" stroke="white" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M10 16.5C11.4 15.4 12.6 15.4 14 16.5" stroke="white" stroke-width="2" stroke-linecap="round"/>' +
        '<circle cx="12" cy="19.5" r="1.5" fill="white"/>' +
        "</svg>" +
        "</div>",

      iconSize: [36, 44],

      iconAnchor: [18, 42]
    })
  }).addTo(map);
}

  // ============================================================
  // ROUTER MARKER
  // ============================================================

 function iconFor(status) {
  const safeStatus =
    STATUS[status]
      ? status
      : "active";

  const wifiIcon = `
    <svg
      class="router-icon"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3 9.5C8.5 5.2 15.5 5.2 21 9.5"
        stroke="white"
        stroke-width="2"
        stroke-linecap="round"
      />
      <path
        d="M6.5 13C10.5 9.9 13.5 9.9 17.5 13"
        stroke="white"
        stroke-width="2"
        stroke-linecap="round"
      />
      <path
        d="M10 16.5C11.4 15.4 12.6 15.4 14 16.5"
        stroke="white"
        stroke-width="2"
        stroke-linecap="round"
      />
      <circle
        cx="12"
        cy="19.5"
        r="1.5"
        fill="white"
      />
    </svg>
  `;

  return L.divIcon({
    className: "",

    html:
      '<div class="router-marker ' +
      safeStatus +
      '">' +
      '<span class="router-center"></span>' +
      wifiIcon +
      "</div>",

    iconSize: [36, 44],

    iconAnchor: [18, 42],

    popupAnchor: [0, -42]
  });
}

  // ============================================================
  // RENDER EVERYTHING
  // ============================================================

  function renderAll() {
    renderMarkers();

    renderList();
  }

  // ============================================================
  // RENDER MARKERS
  // ============================================================

  function renderMarkers() {
    Object.keys(markers).forEach(function (id) {
      const exists = routers.some(function (r) {
        return r.id === id;
      });

      if (!exists) {
        map.removeLayer(markers[id]);
        delete markers[id];
      }
    });

    routers.forEach(function (router) {
      if (markers[router.id]) {
        markers[router.id].setLatLng([
          router.lat,
          router.lng
        ]);

        markers[router.id].setIcon(
          iconFor(router.status)
        );
      } else {
        const marker = L.marker(
          [router.lat, router.lng],
          {
            icon: iconFor(router.status)
          }
        ).addTo(map);

        marker.on("click", function () {
          showInfo(router.id);
        });

        markers[router.id] = marker;
      }
    });
  }

  // ============================================================
  // ROUTER LIST
  // ============================================================

  function buildRouterRow(router, onClick) {
    const status =
      STATUS[router.status] || STATUS.active;

    const row = document.createElement("div");

    row.className = "router-row";

    row.innerHTML =
      '<span class="dot">' +
      status.emoji +
      "</span>" +

      '<span class="rid">' +
      escapeHtml(router.id) +
      "</span>" +

      '<span class="rmodel">' +
      escapeHtml(router.model) +
      "</span>";

    row.addEventListener("click", onClick);

    return row;
  }

  function renderRouterListInto(
    container,
    list,
    emptyMessage,
    onRowClick
  ) {
    container.innerHTML = "";

    if (list.length === 0) {
      const empty = document.createElement("div");

      empty.className = "empty-state";

      empty.textContent = emptyMessage;

      container.appendChild(empty);

      return;
    }

    list.forEach(function (router) {
      container.appendChild(
        buildRouterRow(router, function () {
          onRowClick(router.id);
        })
      );
    });
  }

  function renderList() {
    const countEl =
      document.getElementById("routerCount");

    countEl.textContent = String(routers.length);

    const searchValue =
      document
        .getElementById("listSearchInput")
        .value
        .trim()
        .toLowerCase();

    const filtered = searchValue
      ? filterRouters(searchValue)
      : routers;

    renderRouterListInto(
      document.getElementById("routerList"),

      filtered,

      routers.length === 0
        ? 'No routers yet. Tap "Add" to place your first one.'
        : "No routers match your search.",

      function (id) {
        focusAndShowInfo(id);
      }
    );
  }

  function filterRouters(query) {
    return routers.filter(function (router) {
      return (
        router.id.toLowerCase().includes(query) ||
        router.model.toLowerCase().includes(query) ||
        (router.notes || "")
          .toLowerCase()
          .includes(query)
      );
    });
  }

  document
    .getElementById("listSearchInput")
    .addEventListener("input", renderList);

  // ============================================================
  // SHEETS
  // ============================================================

  const sheetBackdrop =
    document.getElementById("sheetBackdrop");

  const allSheets = Array.from(
    document.querySelectorAll(".sheet")
  );

  const navButtons = Array.from(
    document.querySelectorAll(".nav-btn")
  );

  function setNavActive(tab) {
    navButtons.forEach(function (button) {
      button.classList.toggle(
        "active",
        button.getAttribute("data-tab") === tab
      );
    });
  }

  function anySheetOpen() {
    return allSheets.some(function (sheet) {
      return sheet.classList.contains("open");
    });
  }

  function openSheet(el, navTab) {
    allSheets.forEach(function (sheet) {
      if (sheet !== el) {
        sheet.classList.remove("open");
        sheet.setAttribute("aria-hidden", "true");
      }
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
    allSheets.forEach(function (sheet) {
      sheet.classList.remove("open");

      sheet.setAttribute("aria-hidden", "true");
    });

    sheetBackdrop.classList.add("hidden");

    setNavActive("map");
  }

  sheetBackdrop.addEventListener(
    "click",
    function () {
      if (
        document
          .getElementById("formSheet")
          .classList.contains("open")
      ) {
        closeForm();
      } else {
        closeAllSheets();
      }
    }
  );

  document
    .querySelectorAll("[data-close]")
    .forEach(function (button) {
      button.addEventListener("click", function () {
        const sheet = button.closest(".sheet");

        if (!sheet) {
          return;
        }

        if (sheet.id === "formSheet") {
          closeForm();
        } else {
          closeSheet(sheet);
        }
      });
    });

  // ============================================================
  // BOTTOM NAVIGATION
  // ============================================================

  document
    .querySelector('.nav-btn[data-tab="map"]')
    .addEventListener("click", function () {
      if (!placingLocation) {
        closeAllSheets();
      }
    });

  document
    .querySelector('.nav-btn[data-tab="routers"]')
    .addEventListener("click", function () {
      renderList();

      openSheet(
        document.getElementById("routersSheet"),
        "routers"
      );
    });

  document
    .querySelector('.nav-btn[data-tab="add"]')
    .addEventListener("click", function () {
      openAddForm();
    });

  document
    .getElementById("moreBtn")
    .addEventListener("click", function () {
      openSheet(
        document.getElementById("settingsSheet"),
        null
      );
    });

  // ============================================================
  // ROUTER INFO
  // ============================================================

  const infoSheet =
    document.getElementById("infoSheet");

  function showInfo(id) {
    const router = routers.find(function (r) {
      return r.id === id;
    });

    if (!router) {
      return;
    }

    activeInfoId = id;

    const status =
      STATUS[router.status] || STATUS.active;

    document.getElementById("infoId").textContent =
      router.id;

    document.getElementById("infoModel").textContent =
      router.model;

    document.getElementById("infoStatus").textContent =
      status.emoji + " " + status.label;

    document.getElementById("infoNotes").textContent =
      router.notes ? router.notes : "—";

    document.getElementById("infoCoords").textContent =
      "📍 " +
      Number(router.lat).toFixed(5) +
      ", " +
      Number(router.lng).toFixed(5);

    document.getElementById(
      "navigateBtn"
    ).onclick = function () {
      const url =
        "https://www.google.com/maps/dir/?api=1&destination=" +
        router.lat +
        "," +
        router.lng;

      window.open(url, "_blank");
    };

    document.getElementById(
      "infoEditBtn"
    ).onclick = function () {
      closeSheet(infoSheet);

      openEditForm(router.id);
    };

    document.getElementById(
      "infoDeleteBtn"
    ).onclick = function () {
      openConfirmDelete(router.id);
    };

    openSheet(infoSheet, "map");
  }

  function focusAndShowInfo(id) {
    const router = routers.find(function (r) {
      return r.id === id;
    });

    if (!router) {
      return;
    }

    map.setView(
      [router.lat, router.lng],
      Math.max(map.getZoom(), 16),
      {
        animate: true
      }
    );

    showInfo(id);
  }

  // ============================================================
  // ADD / EDIT FORM
  // ============================================================

  const formSheet =
    document.getElementById("formSheet");

  const routerForm =
    document.getElementById("routerForm");

  const formTitle =
    document.getElementById("formTitle");

  const fieldId =
    document.getElementById("fieldId");

  const fieldModel =
    document.getElementById("fieldModel");

  const fieldNotes =
    document.getElementById("fieldNotes");

  const statusPicker =
    document.getElementById("statusPicker");

  const locationPreview =
    document.getElementById("locationPreview");

  const saveRouterBtn =
    document.getElementById("saveRouterBtn");

  const placingHint =
    document.getElementById("placingHint");

  statusPicker.addEventListener(
    "click",
    function (e) {
      const button =
        e.target.closest(".status-opt");

      if (!button) {
        return;
      }

      statusPicker
        .querySelectorAll(".status-opt")
        .forEach(function (b) {
          b.classList.remove("active");
        });

      button.classList.add("active");
    }
  );

  function setStatusPicker(status) {
    statusPicker
      .querySelectorAll(".status-opt")
      .forEach(function (button) {
        button.classList.toggle(
          "active",
          button.getAttribute("data-status") === status
        );
      });
  }

  function getSelectedStatus() {
    const active =
      statusPicker.querySelector(
        ".status-opt.active"
      );

    return active
      ? active.getAttribute("data-status")
      : "active";
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
    const router = routers.find(function (r) {
      return r.id === id;
    });

    if (!router) {
      return;
    }

    editingId = id;

    formTitle.textContent = "Edit Router";

    fieldId.value = router.id;

    fieldId.disabled = true;

    fieldModel.value = router.model;

    fieldNotes.value = router.notes || "";

    setStatusPicker(router.status);

    pendingLatLng = {
      lat: router.lat,
      lng: router.lng
    };

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
        "📍 Location selected — " +
        pendingLatLng.lat.toFixed(5) +
        ", " +
        pendingLatLng.lng.toFixed(5);

      locationPreview.classList.add("set");

      saveRouterBtn.disabled = false;
    } else {
      locationPreview.textContent =
        "No location selected yet";

      locationPreview.classList.remove("set");

      saveRouterBtn.disabled = true;
    }
  }

  // ============================================================
  // PICK LOCATION FROM MAP
  // ============================================================

  document
    .getElementById("tapMapBtn")
    .addEventListener("click", function () {
      closeSheet(formSheet);

      placingLocation = true;

      placingHint.classList.remove("hidden");
    });

  document
    .getElementById("cancelPlacingBtn")
    .addEventListener("click", function () {
      placingLocation = false;

      placingHint.classList.add("hidden");

      openSheet(formSheet, "add");
    });

  // ============================================================
  // USE CURRENT LOCATION IN FORM
  // ============================================================

  document
    .getElementById("useLocationForFormBtn")
    .addEventListener("click", function () {
      if (!navigator.geolocation) {
        showToast(
          "Geolocation isn't supported by this browser."
        );

        return;
      }

      showToast("Locating…");

      navigator.geolocation.getCurrentPosition(
        function (position) {
          pendingLatLng = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };

          showPlacingMarker(pendingLatLng);

          updateLocationPreview();

          map.setView(
            [
              pendingLatLng.lat,
              pendingLatLng.lng
            ],
            17
          );

          showToast(
            "Using your current location."
          );
        },

        function (error) {
          console.error(
            "Geolocation error:",
            error
          );

          showToast(
            "Couldn't get your location. Check location permissions."
          );
        },

        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });

  // ============================================================
  // SAVE ROUTER
  // ============================================================

  routerForm.addEventListener(
    "submit",
    async function (e) {
      e.preventDefault();

      if (saveRouterBtn.disabled) {
        return;
      }

      const id = fieldId.value.trim();

      const model = fieldModel.value.trim();

      const status = getSelectedStatus();

      const notes = fieldNotes.value.trim();

      if (!id || !model || !pendingLatLng) {
        showToast(
          "Please fill in Router ID, Model, and pick a location."
        );

        return;
      }

      // --------------------------------------------------------
      // ADD
      // --------------------------------------------------------

      if (!editingId) {
        if (
          routers.some(function (r) {
            return (
              r.id.toLowerCase() === id.toLowerCase()
            );
          })
        ) {
          showToast(
            'A router with ID "' +
              id +
              '" already exists.'
          );

          return;
        }

        const newRouter = {
          id: id,
          model: model,
          lat: Number(pendingLatLng.lat),
          lng: Number(pendingLatLng.lng),
          status: status,
          notes: notes
        };

        const originalText =
          saveRouterBtn.textContent;

        saveRouterBtn.disabled = true;

        saveRouterBtn.textContent = "Saving…";

        try {
          await insertRouterIntoSupabase(
            newRouter
          );

          routers.push(newRouter);

          saveLocalRouters();

          renderAll();

          closeForm();

          showToast(
            "Router " + id + " added."
          );

          focusAndShowInfo(id);
        } catch (error) {
          console.error(
            "Could not save router:",
            error
          );

          showToast(
            "Could not save router: " +
              error.message
          );
        } finally {
          saveRouterBtn.textContent =
            originalText;

          updateLocationPreview();
        }

        return;
      }

      // --------------------------------------------------------
      // EDIT
      // --------------------------------------------------------

      const router = routers.find(function (r) {
        return r.id === editingId;
      });

      if (!router) {
        closeForm();

        return;
      }

      const updatedRouter = {
        id: router.id,
        model: model,
        lat: Number(pendingLatLng.lat),
        lng: Number(pendingLatLng.lng),
        status: status,
        notes: notes
      };

      const originalText =
        saveRouterBtn.textContent;

      saveRouterBtn.disabled = true;

      saveRouterBtn.textContent = "Saving…";

      try {
        await updateRouterInSupabase(
          updatedRouter
        );

        router.model = updatedRouter.model;

        router.lat = updatedRouter.lat;

        router.lng = updatedRouter.lng;

        router.status = updatedRouter.status;

        router.notes = updatedRouter.notes;

        saveLocalRouters();

        renderAll();

        const savedId = router.id;

        closeForm();

        showToast(
          "Router " + savedId + " updated."
        );

        focusAndShowInfo(savedId);
      } catch (error) {
        console.error(
          "Could not update router:",
          error
        );

        showToast(
          "Could not update router: " +
            error.message
        );
      } finally {
        saveRouterBtn.textContent =
          originalText;
      }
    }
  );

  document
    .getElementById("cancelFormBtn")
    .addEventListener("click", closeForm);

  // ============================================================
  // DELETE CONFIRMATION
  // ============================================================

  const confirmOverlay =
    document.getElementById("confirmOverlay");

  const confirmText =
    document.getElementById("confirmText");

  function openConfirmDelete(id) {
    pendingDeleteId = id;

    confirmText.textContent =
      'Delete router "' +
      id +
      '"? This cannot be undone.';

    confirmOverlay.classList.remove("hidden");
  }

  document
    .getElementById("confirmCancelBtn")
    .addEventListener("click", function () {
      pendingDeleteId = null;

      confirmOverlay.classList.add("hidden");
    });

  document
    .getElementById("confirmDeleteBtn")
    .addEventListener(
      "click",
      async function () {
        if (!pendingDeleteId) {
          return;
        }

        const id = pendingDeleteId;

        const button = document.getElementById(
          "confirmDeleteBtn"
        );

        const originalText =
          button.textContent;

        button.disabled = true;

        button.textContent = "Deleting…";

        try {
          await deleteRouterFromSupabase(id);

          routers = routers.filter(function (r) {
            return r.id !== id;
          });

          saveLocalRouters();

          renderAll();

          closeAllSheets();

          showToast("Router deleted.");
        } catch (error) {
          console.error(
            "Could not delete router:",
            error
          );

          showToast(
            "Could not delete router: " +
              error.message
          );
        } finally {
          pendingDeleteId = null;

          confirmOverlay.classList.add(
            "hidden"
          );

          button.disabled = false;

          button.textContent = originalText;
        }
      }
    );

  // ============================================================
  // TOP SEARCH
  // ============================================================

  const searchInput =
    document.getElementById("searchInput");

  const searchClearBtn =
    document.getElementById("searchClearBtn");

  const searchMatchesOverlay =
    document.getElementById(
      "searchMatchesOverlay"
    );

  searchInput.addEventListener(
    "input",
    function () {
      searchClearBtn.classList.toggle(
        "hidden",
        searchInput.value.length === 0
      );
    }
  );

  searchInput.addEventListener(
    "keydown",
    function (e) {
      if (e.key === "Enter") {
        performSearch(searchInput.value);
      }
    }
  );

  document
    .querySelector(".search-icon")
    .addEventListener("click", function () {
      performSearch(searchInput.value);
    });

  searchClearBtn.addEventListener(
    "click",
    function () {
      searchInput.value = "";

      searchClearBtn.classList.add("hidden");

      searchInput.focus();
    }
  );

  function performSearch(rawQuery) {
    const query = rawQuery
      .trim()
      .toLowerCase();

    if (!query) {
      return;
    }

    const matches = filterRouters(query);

    if (matches.length === 0) {
      showToast(
        'No routers found for "' +
          rawQuery.trim() +
          '".'
      );
    } else if (matches.length === 1) {
      searchInput.blur();

      focusAndShowInfo(matches[0].id);
    } else {
      renderRouterListInto(
        document.getElementById(
          "searchMatchesList"
        ),

        matches,

        "No matches.",

        function (id) {
          searchMatchesOverlay.classList.add(
            "hidden"
          );

          focusAndShowInfo(id);
        }
      );

      searchMatchesOverlay.classList.remove(
        "hidden"
      );
    }
  }

  document
    .getElementById("closeSearchMatchesBtn")
    .addEventListener("click", function () {
      searchMatchesOverlay.classList.add(
        "hidden"
      );
    });

  // ============================================================
  // EXPORT
  // ============================================================

  document
    .getElementById("exportBtn")
    .addEventListener("click", function () {
      const blob = new Blob(
        [
          JSON.stringify(
            routers,
            null,
            2
          )
        ],
        {
          type: "application/json"
        }
      );

      const url =
        URL.createObjectURL(blob);

      const a =
        document.createElement("a");

      const stamp =
        new Date()
          .toISOString()
          .slice(0, 10);

      a.href = url;

      a.download =
        "hotspot-routers-" +
        stamp +
        ".json";

      document.body.appendChild(a);

      a.click();

      document.body.removeChild(a);

      URL.revokeObjectURL(url);

      closeSheet(
        document.getElementById(
          "settingsSheet"
        )
      );

      showToast(
        "Exported " +
          routers.length +
          " router(s)."
      );
    });

  // ============================================================
  // IMPORT
  // ============================================================

  const importFile =
    document.getElementById("importFile");

  document
    .getElementById("importBtn")
    .addEventListener("click", function () {
      importFile.value = "";

      importFile.click();
    });

  importFile.addEventListener(
    "change",
    function () {
      const file =
        importFile.files[0];

      if (!file) {
        return;
      }

      const reader =
        new FileReader();

      reader.onload = async function () {
        let data;

        try {
          data = JSON.parse(
            reader.result
          );
        } catch (error) {
          showToast(
            "That file isn't valid JSON."
          );

          return;
        }

        const validation =
          validateRouters(data);

        if (!validation.ok) {
          showToast(
            "Import failed: " +
              validation.error
          );

          return;
        }

        const merge =
          window.confirm(
            "Merge with your existing " +
              routers.length +
              " router(s)?\n\n" +
              "OK = Merge (matching IDs will be updated)\n" +
              "Cancel = Replace all existing routers"
          );

        let importedRouters;

        if (merge) {
          importedRouters = routers.slice();

          validation.routers.forEach(
            function (newRouter) {
              const index =
                importedRouters.findIndex(
                  function (r) {
                    return (
                      r.id ===
                      newRouter.id
                    );
                  }
                );

              if (index >= 0) {
                importedRouters[index] =
                  newRouter;
              } else {
                importedRouters.push(
                  newRouter
                );
              }
            }
          );
        } else {
          importedRouters =
            validation.routers;
        }

        try {
          showToast(
            "Saving imported routers…"
          );

          await upsertRoutersToSupabase(
            importedRouters
          );

          routers =
            importedRouters;

          saveLocalRouters();

          renderAll();

          closeSheet(
            document.getElementById(
              "settingsSheet"
            )
          );

          showToast(
            "Imported " +
              validation.routers.length +
              " router(s)."
          );
        } catch (error) {
          console.error(
            "Import Supabase error:",
            error
          );

          showToast(
            "Import failed: " +
              error.message
          );
        }
      };

      reader.readAsText(file);
    });

  function validateRouters(data) {
    if (!Array.isArray(data)) {
      return {
        ok: false,
        error:
          "expected a JSON array of routers."
      };
    }

    const cleaned = [];

    const seenIds = {};

    for (let i = 0; i < data.length; i++) {
      const router = data[i];

      if (
        !router ||
        typeof router !== "object"
      ) {
        return {
          ok: false,
          error:
            "item " +
            i +
            " is not an object."
        };
      }

      if (
        typeof router.id !== "string" ||
        !router.id.trim()
      ) {
        return {
          ok: false,
          error:
            "item " +
            i +
            " is missing a valid id."
        };
      }

      if (
        typeof router.model !==
          "string" ||
        !router.model.trim()
      ) {
        return {
          ok: false,
          error:
            'router "' +
            router.id +
            '" is missing a model.'
        };
      }

      const lat =
        Number(router.lat);

      const lng =
        Number(router.lng);

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        return {
          ok: false,
          error:
            'router "' +
            router.id +
            '" has invalid latitude/longitude.'
        };
      }

      const id =
        router.id.trim();

      if (seenIds[id]) {
        return {
          ok: false,
          error:
            'duplicate router id "' +
            id +
            '" in file.'
        };
      }

      seenIds[id] = true;

      cleaned.push({
        id: id,

        model: router.model.trim(),

        lat: lat,

        lng: lng,

        status: STATUS[router.status]
          ? router.status
          : "active",

        notes:
          typeof router.notes ===
          "string"
            ? router.notes.trim()
            : ""
      });
    }

    return {
      ok: true,
      routers: cleaned
    };
  }

  // ============================================================
  // USE MY LOCATION
  // ============================================================

  document
    .getElementById("locateFab")
    .addEventListener("click", function () {
      if (!navigator.geolocation) {
        showToast(
          "Geolocation isn't supported by this browser."
        );

        return;
      }

      showToast("Locating…");

      navigator.geolocation.getCurrentPosition(
        function (position) {
          const lat =
            position.coords.latitude;

          const lng =
            position.coords.longitude;

          map.setView(
            [lat, lng],
            16
          );

          L.circleMarker(
            [lat, lng],
            {
              radius: 8,

              color: "#3fb6a8",

              fillColor: "#3fb6a8",

              fillOpacity: 0.5
            }
          ).addTo(map);

          showToast(
            "Centered on your location."
          );
        },

        function (error) {
          console.error(
            "Location error:",
            error
          );

          showToast(
            "Couldn't get your location. Check location permissions."
          );
        },

        {
          enableHighAccuracy: true,

          timeout: 10000,

          maximumAge: 0
        }
      );
    });

  // ============================================================
  // TOAST
  // ============================================================

  let toastTimer = null;

  function showToast(message) {
    const toast =
      document.getElementById("toast");

    toast.textContent = message;

    toast.classList.remove("hidden");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(
      function () {
        toast.classList.add(
          "hidden"
        );
      },
      3500
    );
  }

  // ============================================================
  // DATABASE CONNECTION STATUS
  // ============================================================

  async function initializeDatabase() {
    if (!supabaseClient) {
      console.error(
        "Supabase JavaScript library is not loaded."
      );

      showToast(
        "Database unavailable. Using local backup."
      );

      return false;
    }

    try {
      const cloudRouters =
        await loadRoutersFromSupabase();

      routers = cloudRouters;

      saveLocalRouters();

      renderAll();

      console.log(
        "Supabase connected successfully."
      );

      console.log(
        "Routers loaded:",
        routers.length
      );

      return true;
    } catch (error) {
      console.error(
        "Supabase connection error:",
        error
      );

      /*
       * If the database cannot be reached,
       * keep whatever is stored locally.
       */
      showToast(
        "Database unavailable. Using local backup."
      );

      renderAll();

      return false;
    }
  }

  // ============================================================
  // INITIAL RENDER
  // ============================================================

  renderAll();

  // ============================================================
  // INITIAL MAP VIEW
  // ============================================================

  if (routers.length > 1) {
    const bounds =
      L.latLngBounds(
        routers.map(function (router) {
          return [
            router.lat,
            router.lng
          ];
        })
      );

    map.fitBounds(
      bounds,
      {
        padding: [60, 60]
      }
    );
  }

  // ============================================================
  // LOAD FROM SUPABASE
  // ============================================================

  initializeDatabase();

})();