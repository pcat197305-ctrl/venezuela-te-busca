/**
 * Venezuela Te Busca - Map-First Application
 */

// ==================== Anti-Scraping ====================
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', e => {
  if (e.ctrlKey && ['u', 's'].includes(e.key.toLowerCase())) e.preventDefault();
});
setInterval(() => {
  if (window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160) {
    console.log('DevTools detected');
  }
}, 1000);

// ==================== App Code ====================
var map = null;
var markers = [];
var markerCluster = null;
var mapInitialized = false;
var selectedItem = null;
var missingPersonsData = typeof MISSING_PERSONS_DATA !== 'undefined' ? MISSING_PERSONS_DATA : [];

// IDs to exclude from map (state-level or no-location records)
var mapExcludeIds = typeof MAP_EXCLUDE_IDS !== 'undefined' ? new Set(MAP_EXCLUDE_IDS) : new Set();

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  updateStats();
  renderSidebarList();
  setupEventListeners();
});

// Initialize Leaflet Map
function initMap() {
  if (mapInitialized) return;

  // Venezuela - La Guaira region
  map = L.map('map').setView([10.6, -66.9], 11);

  // OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  // Initialize marker cluster group
  markerCluster = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    iconCreateFunction: function(cluster) {
      var count = cluster.getChildCount();
      var markers = cluster.getAllChildMarkers();
      var missing = 0;
      var found = 0;
      markers.forEach(function(m) {
        if (m.options.itemData && (m.options.itemData.status === 'found' || m.options.itemData.status === 'encontrado')) {
          found++;
        } else {
          missing++;
        }
      });

      var color = missing > found ? '#f97316' : '#22c55e';
      var size = count < 10 ? 'small' : (count < 100 ? 'medium' : 'large');

      return L.divIcon({
        html: '<div style="background:' + color + '; width:36px; height:36px; border-radius:50%; border:3px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; font-size:12px;">' + count + '</div>',
        className: 'marker-cluster marker-cluster-' + size,
        iconSize: L.point(36, 36)
      });
    }
  });

  map.addLayer(markerCluster);

  // Add markers
  addMarkers();

  mapInitialized = true;
}

// Update header stats
function updateStats() {
  if (typeof MISSING_PERSONS_DATA === 'undefined') return;
  // disappeared/desaparecido = Buscados, encontrado/found = Encontrados
  const missing = MISSING_PERSONS_DATA.filter(i => i.status === 'missing' || i.status === 'desaparecido').length;
  const found = MISSING_PERSONS_DATA.filter(i => i.status === 'found' || i.status === 'encontrado').length;

  document.getElementById('stat-total').textContent = MISSING_PERSONS_DATA.length.toLocaleString();
  document.getElementById('stat-missing').textContent = missing.toLocaleString();
  document.getElementById('stat-found').textContent = found.toLocaleString();
}

// Add markers to map
function addMarkers() {
  // Clear existing markers
  if (markerCluster) {
    markerCluster.clearLayers();
  }
  markers = [];

  // Filter: only show records with GPS that are not in exclude list
  const itemsWithGps = missingPersonsData.filter(item => item.gps && !mapExcludeIds.has(item.id));

  // Create custom icon function for individual markers
  function createMarkerIcon(status) {
    const isFound = status === 'encontrado' || status === 'found';
    const color = isFound ? '#22c55e' : '#f97316';
    const emoji = isFound ? '✓' : '🔴';

    return L.divIcon({
      html: `<div style="background:${color}; width:24px; height:24px; border-radius:50%; border:2px solid #fff; box-shadow:0 2px 4px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; color:white; font-size:12px; font-weight:bold;">${emoji}</div>`,
      className: 'custom-marker',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12]
    });
  }

  itemsWithGps.forEach((item, index) => {
    if (!item.gps) return;

    const [lat, lng] = item.gps.split(',').map(s => parseFloat(s.trim()));
    if (isNaN(lat) || isNaN(lng)) return;

    const statusColor = item.status === 'encontrado' ? '#22c55e' : '#f97316';
    const statusText = item.status === 'encontrado' ? '✓ Encontrado' : '🔴 Se busca';
    const globalIndex = missingPersonsData.indexOf(item);

    const marker = L.marker([lat, lng], {
      itemData: item,
      icon: createMarkerIcon(item.status)
    });

    const popupContent = `
      <div style="min-width:220px; font-family:sans-serif; padding:8px;">
        <div style="font-weight:bold; font-size:15px; margin-bottom:6px; color:#333;">${escapeHtml(item.name)}</div>
        <div style="color:#666; font-size:12px; margin-bottom:4px;">📍 ${escapeHtml(item.location)}</div>
        <div style="color:${statusColor}; font-weight:bold; font-size:12px; margin-bottom:4px;">${statusText}</div>
        ${item.gps ? `<div style="font-size:11px; color:#999; margin-bottom:8px;">📌 ${item.gps}</div>` : ''}
        <button onclick="openDetail(${globalIndex})" style="width:100%; background:#dc2626; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">Ver detalles</button>
      </div>
    `;

    marker.bindPopup(popupContent);
    markerCluster.addLayer(marker);
    markers.push(marker);
  });
}

// Show records with GPS coordinates
function showWithGpsRecords() {
  const sidebar = document.getElementById('sidebar');
  const list = document.getElementById('sidebar-list');
  const countText = document.getElementById('count-text');
  const filterSelect = document.getElementById('filter-estado');

  // Reset status filter
  if (filterSelect) filterSelect.value = '';

  // Set GPS filter mode
  sidebar.dataset.gpsFilter = 'yes';

  // Clear filtered state
  delete sidebar.dataset.filtered;

  // Reset buttons
  document.getElementById('btn-no-gps').style.background = '';
  document.getElementById('btn-no-gps').style.color = '';

  // Get records with GPS
  const withGpsRecords = missingPersonsData.filter(item => item.gps);

  // Update list
  list.innerHTML = withGpsRecords.slice(0, 100).map((item, index) => `
    <div class="sidebar-card" onclick="openDetail(${missingPersonsData.indexOf(item)})">
      <div class="sidebar-card-name">${escapeHtml(item.name)}</div>
      <div class="sidebar-card-location">📍 ${escapeHtml(item.location)}</div>
      ${item.gps ? `<div class="sidebar-card-gps">📌 ${item.gps}</div>` : ''}
    </div>
  `).join('');

  countText.textContent = `${withGpsRecords.length} registros con GPS`;
  sidebar.classList.add('active');
}

// Close sidebar
function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.remove('active');

  // Reset button styles
  document.getElementById('btn-no-gps').style.background = '';
  document.getElementById('btn-no-gps').style.color = '';

  // Clear filtered state
  delete sidebar.dataset.filtered;
  delete sidebar.dataset.gpsFilter;
}

// Show records without GPS coordinates
function showNoGpsRecords() {
  const sidebar = document.getElementById('sidebar');
  const list = document.getElementById('sidebar-list');
  const countText = document.getElementById('count-text');
  const filterSelect = document.getElementById('filter-estado');

  // Reset status filter
  if (filterSelect) filterSelect.value = '';

  // Set GPS filter mode
  sidebar.dataset.gpsFilter = 'no';

  // Mark sidebar as filtered
  sidebar.dataset.filtered = 'no-gps';

  // Get records without GPS
  const noGpsRecords = missingPersonsData.filter(item => !item.gps);

  // Update list
  list.innerHTML = noGpsRecords.slice(0, 100).map((item, index) => `
    <div class="sidebar-card" onclick="openDetail(${missingPersonsData.indexOf(item)})">
      <div class="sidebar-card-name">${escapeHtml(item.name)}</div>
      <div class="sidebar-card-location">📍 ${escapeHtml(item.location)}</div>
      <div class="sidebar-card-gps" style="color: #ef4444;">⚠️ Sin coordenadas GPS</div>
    </div>
  `).join('');

  countText.textContent = `${noGpsRecords.length} registros sin GPS`;
  sidebar.classList.add('active');

  // Update button style
  const btn = document.getElementById('btn-no-gps');
  btn.style.background = 'var(--accent-orange)';
  btn.style.color = 'white';
}

// Search markers
function searchMarkers() {
  const searchTerm = document.getElementById('search-input').value.toLowerCase().trim();
  const resultsContainer = document.getElementById('search-results');

  if (!searchTerm) {
    resultsContainer.classList.remove('active');
    return;
  }

  const matches = missingPersonsData.filter(item =>
    item.name.toLowerCase().includes(searchTerm) ||
    item.location.toLowerCase().includes(searchTerm)
  ).slice(0, 10);

  if (matches.length === 0) {
    resultsContainer.innerHTML = '<div style="padding:1rem; color:#666;">Sin resultados</div>';
  } else {
    resultsContainer.innerHTML = matches.map((item, i) => `
      <div class="search-result-item" onclick="focusMarker(${missingPersonsData.indexOf(item)})">
        <div class="search-result-name">${escapeHtml(item.name)}</div>
        <div class="search-result-location">${escapeHtml(item.location)}</div>
      </div>
    `).join('');
  }

  resultsContainer.classList.add('active');
}

// Focus on a marker
function focusMarker(index) {
  const item = missingPersonsData[index];
  if (!item || !item.gps) return;

  const [lat, lng] = item.gps.split(',').map(s => parseFloat(s.trim()));

  // Check if item is in a cluster
  var foundLayer = null;
  markerCluster.getLayers().forEach(function(layer) {
    var layerLatLng = layer.getLatLng();
    if (Math.abs(layerLatLng.lat - lat) < 0.0001 && Math.abs(layerLatLng.lng - lng) < 0.0001) {
      foundLayer = layer;
    }
  });

  if (foundLayer) {
    // Check if it's in a cluster
    var clusters = markerCluster.getClustersLatLngs([lat, lng], 100);
    if (clusters.length > 0) {
      // Zoom into the cluster to spiderfy
      map.setView([lat, lng], 16);
    } else {
      map.setView([lat, lng], 14);
      foundLayer.openPopup();
    }
  } else {
    map.setView([lat, lng], 14);
  }

  document.getElementById('search-results').classList.remove('active');
  document.getElementById('search-input').value = '';
}

// Open detail modal
function openDetail(index) {
  const item = missingPersonsData[index];
  if (!item) return;

  selectedItem = item;

  document.getElementById('detail-title').textContent = item.name;
  document.getElementById('detail-subtitle').textContent = item.location;
  document.getElementById('detail-name').textContent = item.name;
  document.getElementById('detail-status-badge').className = `detail-status-badge ${item.status}`;
  document.getElementById('detail-status-badge').textContent = item.status === 'encontrado' ? '✓ Encontrado' : 'Se busca';

  document.getElementById('detail-grid').innerHTML = `
    <div class="detail-item">
      <div class="detail-item-label">Nombre</div>
      <div class="detail-item-value">${escapeHtml(item.name)}</div>
    </div>
    <div class="detail-item">
      <div class="detail-item-label">Ubicación</div>
      <div class="detail-item-value">${escapeHtml(item.location)}</div>
    </div>
    <div class="detail-item">
      <div class="detail-item-label">Estado</div>
      <div class="detail-item-value">${item.status === 'encontrado' ? '✓ Encontrado' : 'Desaparecido'}</div>
    </div>
  `;

  // GPS Block
  const gpsBlock = document.getElementById('detail-gps-block');
  if (item.gps) {
    gpsBlock.innerHTML = `
      <div class="detail-item" style="grid-column: 1 / -1; background: rgba(249, 115, 22, 0.15); border: 1px solid var(--accent-orange);">
        <div class="detail-item-label">📍 Coordenadas GPS</div>
        <div class="detail-item-value">
          <a href="https://www.google.com/maps?q=${encodeURIComponent(item.gps)}" target="_blank" style="color: var(--accent-orange);">
            ${item.gps} ↗
          </a>
        </div>
      </div>
    `;
  } else {
    gpsBlock.innerHTML = '';
  }

  // Contact
  document.getElementById('detail-contact').innerHTML = `
    <p><strong>Emergencias</strong></p>
    <p>911 (Movistar) · 112 (Digitel) · *1 (Movilnet) · 171 (Cantv)</p>
  `;

  // Maps link
  if (item.gps) {
    document.getElementById('detail-maps-link').href = `https://www.google.com/maps?q=${encodeURIComponent(item.gps)}`;
    document.getElementById('detail-maps-link').style.display = 'inline-block';
  } else {
    document.getElementById('detail-maps-link').style.display = 'none';
  }

  openModal('modal-detalle');
}

// Render sidebar list
function renderSidebarList() {
  const sidebar = document.getElementById('sidebar');
  const list = document.getElementById('sidebar-list');
  const countText = document.getElementById('count-text');

  // Clear GPS filter mode
  delete sidebar.dataset.gpsFilter;

  const items = missingPersonsData.slice(0, 100);

  list.innerHTML = items.map((item, index) => `
    <div class="sidebar-card" onclick="openDetail(${index})">
      <div class="sidebar-card-name">${escapeHtml(item.name)}</div>
      <div class="sidebar-card-location">📍 ${escapeHtml(item.location)}</div>
      ${item.gps ? `<div class="sidebar-card-gps">📌 ${item.gps}</div>` : ''}
    </div>
  `).join('');

  countText.textContent = `${items.length} registros`;
}

// Filter sidebar list by status
function filterSidebarList() {
  const sidebar = document.getElementById('sidebar');
  const status = document.getElementById('filter-estado').value;
  const list = document.getElementById('sidebar-list');
  const countText = document.getElementById('count-text');

  // Determine base dataset based on GPS filter mode
  let items = missingPersonsData;
  const gpsFilter = sidebar.dataset.gpsFilter;

  if (gpsFilter === 'yes') {
    items = items.filter(i => i.gps);
  } else if (gpsFilter === 'no') {
    items = items.filter(i => !i.gps);
  }

  // Apply status filter
  if (status) {
    items = items.filter(i => i.status === status);
  }

  // Update list
  list.innerHTML = items.slice(0, 100).map((item, index) => `
    <div class="sidebar-card" onclick="openDetail(${missingPersonsData.indexOf(item)})">
      <div class="sidebar-card-name">${escapeHtml(item.name)}</div>
      <div class="sidebar-card-location">📍 ${escapeHtml(item.location)}</div>
      ${item.gps ? `<div class="sidebar-card-gps">📌 ${item.gps}</div>` : '<div class="sidebar-card-gps" style="color: #ef4444;">⚠️ Sin GPS</div>'}
    </div>
  `).join('');

  // Update count
  if (gpsFilter === 'yes') {
    countText.textContent = `${items.length} registros con GPS`;
  } else if (gpsFilter === 'no') {
    countText.textContent = `${items.length} registros sin GPS`;
  } else {
    countText.textContent = `${items.length} registros`;
  }
}

// Setup event listeners
function setupEventListeners() {
  const searchInput = document.getElementById('search-input');

  // Close search results when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-overlay')) {
      document.getElementById('search-results').classList.remove('active');
    }
  });
}

// Modal functions
function openModal(id) {
  document.getElementById(id).classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  document.body.style.overflow = '';
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
    document.body.style.overflow = '';
  }
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(modal => {
      modal.classList.remove('active');
    });
    document.body.style.overflow = '';
  }
});

// Toast notification
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Utility: Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
