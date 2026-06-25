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
var mapInitialized = false;
var selectedItem = null;

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

  // Add markers
  addMarkers();

  mapInitialized = true;
}

// Update header stats
function updateStats() {
  const total = missingPersonsData.length;
  const missing = missingPersonsData.filter(i => i.status !== 'encontrado').length;
  const found = missingPersonsData.filter(i => i.status === 'encontrado').length;

  document.getElementById('stat-total').textContent = total.toLocaleString();
  document.getElementById('stat-missing').textContent = missing.toLocaleString();
  document.getElementById('stat-found').textContent = found.toLocaleString();
}

// Add markers to map
function addMarkers() {
  // Clear existing markers
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  // Custom icons
  const orangeIcon = L.divIcon({
    className: 'custom-marker',
    html: '<div style="background:#f97316; width:24px; height:24px; border-radius:50%; border:3px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  const greenIcon = L.divIcon({
    className: 'custom-marker',
    html: '<div style="background:#22c55e; width:24px; height:24px; border-radius:50%; border:3px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  const itemsWithGps = missingPersonsData.filter(item => item.gps);

  itemsWithGps.forEach((item, index) => {
    if (!item.gps) return;

    const [lat, lng] = item.gps.split(',').map(s => parseFloat(s.trim()));
    if (isNaN(lat) || isNaN(lng)) return;

    const icon = item.status === 'encontrado' ? greenIcon : orangeIcon;
    const statusColor = item.status === 'encontrado' ? '#22c55e' : '#f97316';
    const statusText = item.status === 'encontrado' ? '✓ Encontrado' : '🔴 Se busca';
    const globalIndex = missingPersonsData.indexOf(item);

    const marker = L.marker([lat, lng], { icon: icon });

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
    marker.addTo(map);
    markers.push(marker);
  });
}

// Toggle sidebar list
function toggleList() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('active');
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
  map.setView([lat, lng], 14);

  // Find and open the marker popup
  markers.forEach((marker, i) => {
    const markerLatLng = marker.getLatLng();
    if (Math.abs(markerLatLng.lat - lat) < 0.0001 && Math.abs(markerLatLng.lng - lng) < 0.0001) {
      marker.openPopup();
    }
  });

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
        <div class="detail-item-label">📍 GPS坐标</div>
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
  const list = document.getElementById('sidebar-list');
  const countText = document.getElementById('count-text');

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

// Filter sidebar list
function filterSidebarList() {
  const status = document.getElementById('filter-estado').value;
  const list = document.getElementById('sidebar-list');

  let items = missingPersonsData;
  if (status) {
    items = items.filter(i => i.status === status);
  }

  list.innerHTML = items.slice(0, 100).map((item, index) => `
    <div class="sidebar-card" onclick="openDetail(${missingPersonsData.indexOf(item)})">
      <div class="sidebar-card-name">${escapeHtml(item.name)}</div>
      <div class="sidebar-card-location">📍 ${escapeHtml(item.location)}</div>
      ${item.gps ? `<div class="sidebar-card-gps">📌 ${item.gps}</div>` : ''}
    </div>
  `).join('');

  document.getElementById('count-text').textContent = `${items.length} registros`;
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
