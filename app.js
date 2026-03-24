/* ════════════════════════════════════════════════════════════
   QUIQUP ANALYTICS — app.js
   All application logic extracted from analytics_dashboard_enhanced_16.html
════════════════════════════════════════════════════════════ */

/* ─── Section navigation ─────────────────────────────────── */
let currentSection = 'overview';

function showSection(sectionId) {
    document.querySelectorAll('.page-section').forEach(s => { s.style.display = 'none'; });
    const target = document.getElementById('section-' + sectionId);
    if (target) target.style.display = 'block';
    document.querySelectorAll('.nav-item[data-section]').forEach(i => i.classList.remove('active'));
    const navItem = document.querySelector('.nav-item[data-section="' + sectionId + '"]');
    if (navItem) navItem.classList.add('active');

    const titles = {
        overview: 'Overview',
        analytics: 'Analytics',
        forms: 'Forms',
        deepdive: 'Deep Dive',
        weekly: 'Weekly Analytics',
        ssup: 'SSUP',
        leads: 'Leads',
        alerts: 'Alerts'
    };
    const subtitles = {
        overview: 'Weekly performance and key metrics',
        analytics: 'Submission trends and patterns',
        forms: 'Form performance and conversion',
        deepdive: 'Domain analysis, velocity and timing',
        weekly: 'Week-over-week performance comparison',
        ssup: 'Leads who created an account after submitting a form',
        leads: 'All submissions with status tracking',
        alerts: 'Smart alerts and hot leads requiring action'
    };

    const t = document.getElementById('topbarTitle');
    const s = document.getElementById('topbarSubtitle');
    if (t) t.textContent = titles[sectionId] || sectionId;
    if (s) s.textContent = subtitles[sectionId] || '';

    currentSection = sectionId;
    localStorage.setItem('activeSection', sectionId);
}

function updateNavBadges() {
    const alertCount = parseInt(document.getElementById('alertCount')?.textContent || '0');
    const ab = document.getElementById('nbadge-alerts');
    if (ab) {
        ab.textContent = alertCount;
        ab.className = 'nav-badge alert' + (alertCount > 0 ? ' visible' : '');
    }
    const lb = document.getElementById('nbadge-leads');
    if (lb) {
        lb.textContent = allData.length;
        lb.className = 'nav-badge' + (allData.length > 0 ? ' visible' : '');
    }
}

/* ─── Global state ───────────────────────────────────────── */
let charts = {};
let config = { webhookUrl: '' };
let allData = [];
let filteredData = [];
let spamData = [];
let currentPage = 1;
let itemsPerPage = 15;
let paginatedData = [];
let multiFormCurrentPage = 1;
let multiFormItemsPerPage = 10;
let multiFormUsers = [];
let tableSortColumn = null;
let tableSortDirection = 'desc';

// v15 additions
let leadStatuses = {};   // { email: 'new'|'contacted'|'qualified'|'won'|'lost' }
let leadNotes = {};      // { email: 'note text' }
let autoRefreshTimer = null;
let currentNotesEmail = null;
let activeDatePreset = null;

/* ─── Collapsible sections ───────────────────────────────── */
function toggleAlertsSection() {
    const content = document.getElementById('alertsList');
    const toggle = document.getElementById('alertsToggle');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        toggle.textContent = '▼';
    } else {
        content.style.display = 'none';
        toggle.textContent = '▶';
    }
}

function toggleHotLeadsSection() {
    const content = document.getElementById('hotLeadsList');
    const toggle = document.getElementById('hotLeadsToggle');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        toggle.textContent = '▼';
    } else {
        content.style.display = 'none';
        toggle.textContent = '▶';
    }
}

/* ─── Auto-refresh ───────────────────────────────────────── */
function setAutoRefresh() {
    if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
    const select = document.getElementById('autoRefreshSelect');
    const secs = parseInt(select.value);
    if (secs > 0) {
        autoRefreshTimer = setInterval(fetchData, secs * 1000);
        select.classList.add('active');
    } else {
        select.classList.remove('active');
    }
    localStorage.setItem('autoRefreshInterval', secs);
}

/* ─── Dark mode ──────────────────────────────────────────── */
function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    document.getElementById('darkModeBtn').textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('darkMode', isDark ? '1' : '0');
}

/* ─── Date presets ───────────────────────────────────────── */
function setDatePreset(preset, btn) {
    document.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    activeDatePreset = preset;

    const today = new Date().toISOString().slice(0, 10);
    let from = '', to = today;

    if (preset === 'today') {
        from = today;
    } else if (preset === 'yesterday') {
        const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        from = y; to = y;
    } else if (preset === '7d') {
        from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    } else if (preset === '30d') {
        from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    } else if (preset === 'month') {
        const d = new Date();
        from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
    } else if (preset === 'all') {
        from = ''; to = '';
    }

    document.getElementById('filterDateFrom').value = from;
    document.getElementById('filterDateTo').value = to;
    // Mirror to current section's inline date inputs
    const sFrom = document.getElementById(currentSection + 'DateFrom');
    const sTo   = document.getElementById(currentSection + 'DateTo');
    if (sFrom) sFrom.value = from;
    if (sTo)   sTo.value   = to;
    applyFilters();
}

/* ─── Lead status ────────────────────────────────────────── */
function setLeadStatus(email, status) {
    leadStatuses[email] = status;
    localStorage.setItem('leadStatuses', JSON.stringify(leadStatuses));
    const selects = document.querySelectorAll('.status-select');
    selects.forEach(sel => {
        if (sel.dataset.email === email) applyStatusColor(sel);
    });
}

function applyStatusColor(sel) {
    sel.className = 'status-select status-' + (sel.value || 'new');
}

/* ─── Notes modal ────────────────────────────────────────── */
function openNotesModal(email) {
    currentNotesEmail = email;
    document.getElementById('notesModalEmail').textContent = email;
    document.getElementById('notesModalText').value = leadNotes[email] || '';
    document.getElementById('notesModal').classList.add('open');
    setTimeout(() => document.getElementById('notesModalText').focus(), 80);
}

function closeNotesModal() {
    document.getElementById('notesModal').classList.remove('open');
    currentNotesEmail = null;
}

function handleModalOverlayClick(e) {
    if (e.target === document.getElementById('notesModal')) closeNotesModal();
}

function saveNote() {
    if (!currentNotesEmail) return;
    const text = document.getElementById('notesModalText').value.trim();
    if (text) { leadNotes[currentNotesEmail] = text; }
    else { delete leadNotes[currentNotesEmail]; }
    localStorage.setItem('leadNotes', JSON.stringify(leadNotes));
    closeNotesModal();
    updateTable();
}

/* ─── Spam detection ─────────────────────────────────────── */
function detectSpam(rows) {
    const emailSubmissions = {};
    rows.forEach(row => {
        if (!emailSubmissions[row.Email]) emailSubmissions[row.Email] = [];
        emailSubmissions[row.Email].push(row);
    });

    const spam = [];
    const legitimate = [];

    Object.entries(emailSubmissions).forEach(([email, submissions]) => {
        const legacyFormCount = submissions.filter(s => s.form === 'footer-contact_us_form').length;
        if (legacyFormCount > 1) {
            spam.push(...submissions);
        } else {
            legitimate.push(...submissions);
        }
    });

    return { spam, legitimate };
}

/* ─── Pagination ─────────────────────────────────────────── */
function previousPage() {
    if (currentPage > 1) { currentPage--; updateTable(); }
}

function nextPage() {
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    if (currentPage < totalPages) { currentPage++; updateTable(); }
}

function updateTable() {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    paginatedData = filteredData.slice(startIndex, endIndex);
    updateRecentTable(paginatedData);

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    document.getElementById('currentPage').textContent = currentPage;
    document.getElementById('totalPages').textContent = totalPages;
    document.getElementById('prevBtn').disabled = currentPage === 1;
    document.getElementById('nextBtn').disabled = currentPage >= totalPages;
}

/* ─── Config ─────────────────────────────────────────────── */
function loadConfig() {
    // Restore dark mode
    if (localStorage.getItem('darkMode') === '1') {
        document.body.classList.add('dark-mode');
        document.getElementById('darkModeBtn').textContent = '☀️';
    }
    // Restore lead statuses & notes
    const savedStatuses = localStorage.getItem('leadStatuses');
    if (savedStatuses) { try { leadStatuses = JSON.parse(savedStatuses); } catch(e) {} }
    const savedNotes = localStorage.getItem('leadNotes');
    if (savedNotes) { try { leadNotes = JSON.parse(savedNotes); } catch(e) {} }
    // Restore auto-refresh
    const savedInterval = localStorage.getItem('autoRefreshInterval');
    if (savedInterval && savedInterval !== '0') {
        const sel = document.getElementById('autoRefreshSelect');
        if (sel) { sel.value = savedInterval; setAutoRefresh(); }
    }

    const saved = localStorage.getItem('dashboardConfig');
    if (saved) {
        config = JSON.parse(saved);
        document.getElementById('webhookUrl').value = config.webhookUrl;
        if (config.webhookUrl) {
            document.getElementById('configSection').style.display = 'none';
            fetchData();
        }
    }
}

function saveConfig() {
    config.webhookUrl = document.getElementById('webhookUrl').value.trim();
    if (!config.webhookUrl) { showError('Please enter Webhook URL'); return; }
    localStorage.setItem('dashboardConfig', JSON.stringify(config));
    document.getElementById('configSection').style.display = 'none';
    fetchData();
}

function showError(message) {
    const errorEl = document.getElementById('error');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    setTimeout(() => { errorEl.style.display = 'none'; }, 5000);
}

/* ─── Data fetching ──────────────────────────────────────── */
async function fetchData() {
    console.log('fetchData()');
    document.getElementById('loading').style.display = 'block';
    document.getElementById('alertsWidget').style.display = 'none';
    document.getElementById('hotLeadsSection').style.display = 'none';
    document.getElementById('dailyMetricsSection').style.display = 'none';
    document.getElementById('statsWrapper').style.display = 'none';
    document.getElementById('chartsGrid').style.display = 'none';
    document.getElementById('filterSection').style.display = 'none';
    document.getElementById('comparisonSection').style.display = 'none';
    document.getElementById('formComparisonSection').style.display = 'none';
    document.getElementById('additionalAnalytics').style.display = 'none';
    document.getElementById('tableCard').style.display = 'none';
    document.getElementById('webhookStatus').className = 'webhook-status';

    try {
        const response = await fetch(config.webhookUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Webhook returned ${response.status}: ${errorText.substring(0, 200)}`);
        }

        const result = await response.json();
        const data = result.data || result;
        const rows = Array.isArray(data) ? data : [data];

        if (rows.length === 0) throw new Error('No data returned from webhook');

        const { spam, legitimate } = detectSpam(rows);
        spamData = spam;
        allData = legitimate;
        filteredData = legitimate;

        populateFilterOptions(legitimate);
        processData(legitimate);

        document.getElementById('loading').style.display = 'none';
        document.getElementById('alertsWidget').style.display = 'block';
        document.getElementById('hotLeadsSection').style.display = 'block';
        document.getElementById('dailyMetricsSection').style.display = 'block';
        document.getElementById('statsWrapper').style.display = 'block';
        document.getElementById('chartsGrid').style.display = 'grid';
        document.getElementById('filterSection').style.display = 'block';
        document.getElementById('comparisonSection').style.display = 'grid';
        document.getElementById('formComparisonSection').style.display = 'grid';
        document.getElementById('additionalAnalytics').style.display = 'grid';
        document.getElementById('tableCard').style.display = 'block';
        document.getElementById('spamSection').style.display = spamData.length > 0 ? 'block' : 'none';
        document.getElementById('webhookStatus').className = 'webhook-status online';
        document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();
    } catch (error) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('webhookStatus').className = 'webhook-status offline';
        showError('Error: ' + error.message);
        console.error('Fetch error:', error);
    }
}

/* ─── Filter options ─────────────────────────────────────── */
function populateFilterOptions(rows) {
    const forms = [...new Set(rows.map(r => r.form).filter(Boolean))];
    const formSelect = document.getElementById('filterForm');
    if (formSelect) {
        formSelect.innerHTML = '<option value="">All Forms</option>' +
            forms.map(f => `<option value="${f}">${f}</option>`).join('');
    }

    const services = [...new Set(rows.map(r => r.service_offering).filter(Boolean))];
    const serviceSelect = document.getElementById('filterService');
    if (serviceSelect) {
        serviceSelect.innerHTML = '<option value="">All Services</option>' +
            services.map(s => `<option value="${s}">${s}</option>`).join('');
    }

    const orders = [...new Set(rows.map(r => r.orderspermonth).filter(Boolean))];
    const ordersSelect = document.getElementById('filterOrders');
    if (ordersSelect) {
        ordersSelect.innerHTML = '<option value="">All Volumes</option>' +
            orders.map(o => `<option value="${o}">${o}</option>`).join('');
    }
}

/* ─── Filters ────────────────────────────────────────────── */
function applyFilters() {
    // Read dates from current section's inline inputs, fall back to leads panel inputs
    const fromEl = document.getElementById(currentSection + 'DateFrom') || document.getElementById('filterDateFrom');
    const toEl   = document.getElementById(currentSection + 'DateTo')   || document.getElementById('filterDateTo');
    const dateFrom = fromEl ? fromEl.value : '';
    const dateTo   = toEl   ? toEl.value   : '';
    const form = document.getElementById('filterForm').value;
    const service = document.getElementById('filterService').value;
    const email = document.getElementById('filterEmail').value.toLowerCase();
    const orders = document.getElementById('filterOrders').value;
    const qualityFilter = document.getElementById('filterQuality').value;
    const ssupFilter    = document.getElementById('filterSsup').value;

    filteredData = allData.filter(row => {
        const rowDate = new Date(row.createdAt);
        if (dateFrom && rowDate < new Date(dateFrom)) return false;
        if (dateTo && rowDate > new Date(dateTo + 'T23:59:59')) return false;
        if (form && row.form !== form) return false;
        if (service && row.service_offering !== service) return false;
        if (email && !row.Email?.toLowerCase().includes(email)) return false;
        if (orders && row.orderspermonth !== orders) return false;
        if (qualityFilter && getLeadQuality(row.orderspermonth) !== qualityFilter) return false;
        const ssupNorm = normSsup(row);
        const knownValues = ['SSUP', 'NO', 'NON SSUP ACCOUNT', 'LEGACY FORM'];
        if (ssupFilter === 'untracked' && knownValues.includes(ssupNorm)) return false;
        if (ssupFilter && ssupFilter !== 'untracked' && ssupNorm !== ssupFilter.trim().toUpperCase()) return false;
        return true;
    });

    currentPage = 1;
    processData(filteredData);
}

function clearFilters() {
    // Clear all section date inputs
    ['overview','analytics','forms','deepdive','ssup','alerts'].forEach(s => {
        const f = document.getElementById(s + 'DateFrom');
        const t = document.getElementById(s + 'DateTo');
        if (f) f.value = '';
        if (t) t.value = '';
    });
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    document.getElementById('filterForm').value = '';
    document.getElementById('filterService').value = '';
    document.getElementById('filterEmail').value = '';
    document.getElementById('filterOrders').value = '';
    document.getElementById('filterQuality').value = '';
    document.getElementById('filterSsup').value = '';
    document.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
    activeDatePreset = null;
    filteredData = allData;
    currentPage = 1;
    processData(filteredData);
}

/* ─── Utilities ──────────────────────────────────────────── */
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
}

function getLeadQuality(ordersPerMonth) {
    if (!ordersPerMonth) return 'low';
    const lower = ordersPerMonth.toLowerCase();
    if (lower.includes('500+')) return 'high';
    if (lower.includes('151') || lower.includes('151-500')) return 'medium';
    return 'low';
}

function getDomain(email) {
    if (!email) return 'unknown';
    return email.split('@')[1] || 'unknown';
}

/* ─── Daily metrics ──────────────────────────────────────── */
function calculateDailyMetrics(rows, parseDate) {
    const dailyCounts = {};
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 30; i++) {
        const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const key = day.toISOString().slice(0, 10);
        dailyCounts[key] = 0;
    }

    rows.forEach(r => {
        const date = parseDate(r.createdAt);
        if (date && date > thirtyDaysAgo) {
            const key = date.toISOString().slice(0, 10);
            if (dailyCounts.hasOwnProperty(key)) dailyCounts[key]++;
        }
    });

    const counts = Object.values(dailyCounts);
    const daysWithActivity = counts.filter(c => c > 0).length;
    const avgDaily = daysWithActivity > 0 ? (counts.reduce((a, b) => a + b, 0) / daysWithActivity).toFixed(1) : 0;
    const maxCount = Math.max(...counts);
    const peakDayKey = Object.entries(dailyCounts).find(([, count]) => count === maxCount)?.[0];
    const peakDayDate = peakDayKey ? new Date(peakDayKey) : null;
    const peakDayLabel = peakDayDate ? peakDayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';

    const firstHalf = counts.slice(15, 30).reduce((a, b) => a + b, 0);
    const secondHalf = counts.slice(0, 15).reduce((a, b) => a + b, 0);
    const trend = firstHalf === 0 ? 'stable' : secondHalf > firstHalf * 1.1 ? 'up' : secondHalf < firstHalf * 0.9 ? 'down' : 'stable';

    document.getElementById('avgDaily').textContent = avgDaily;
    document.getElementById('peakDay').textContent = peakDayLabel;
    document.getElementById('peakDayCount').textContent = `${maxCount} submission${maxCount !== 1 ? 's' : ''}`;
    document.getElementById('daysActive').textContent = daysWithActivity;

    if (trend === 'up') {
        document.getElementById('dailyTrend').textContent = '📈';
        document.getElementById('dailyTrend').style.color = '#10b981';
        document.getElementById('trendLabel').textContent = 'Trending up';
        document.getElementById('trendLabel').style.color = '#10b981';
    } else if (trend === 'down') {
        document.getElementById('dailyTrend').textContent = '📉';
        document.getElementById('dailyTrend').style.color = '#ef4444';
        document.getElementById('trendLabel').textContent = 'Trending down';
        document.getElementById('trendLabel').style.color = '#ef4444';
    } else {
        document.getElementById('dailyTrend').textContent = '→';
        document.getElementById('dailyTrend').style.color = '#6c65f7';
        document.getElementById('trendLabel').textContent = 'Stable';
        document.getElementById('trendLabel').style.color = '';
    }
}

/* ─── Smart alerts ───────────────────────────────────────── */
function generateSmartAlerts(rows, parseDate, oneDayAgo, oneWeekAgo) {
    const alerts = [];

    const emailCounts = {};
    rows.forEach(r => { emailCounts[r.Email] = (emailCounts[r.Email] || 0) + 1; });
    const multiSubmitters = Object.entries(emailCounts).filter(([, count]) => count >= 2).length;
    if (multiSubmitters > 0) {
        alerts.push({ icon: '🔄', text: `${multiSubmitters} user${multiSubmitters > 1 ? 's have' : ' has'} submitted multiple forms (high intent!)` });
    }

    const recentHighValue = rows.filter(r => {
        const date = parseDate(r.createdAt);
        return date && date > oneDayAgo && getLeadQuality(r.orderspermonth) === 'high';
    }).length;
    if (recentHighValue > 0) {
        alerts.push({ icon: '💎', text: `${recentHighValue} new high-value lead${recentHighValue > 1 ? 's' : ''} in the last 24 hours` });
    }

    const recentCorporate = rows.filter(r => {
        const date = parseDate(r.createdAt);
        const domain = getDomain(r.Email).toLowerCase();
        const isCorporate = domain !== 'gmail.com' && domain !== 'yahoo.com' &&
                           domain !== 'hotmail.com' && domain !== 'outlook.com' && domain !== 'unknown';
        return date && date > oneDayAgo && isCorporate;
    }).length;
    if (recentCorporate > 0) {
        alerts.push({ icon: '🏢', text: `${recentCorporate} corporate email${recentCorporate > 1 ? 's' : ''} submitted today` });
    }

    const thisWeek = rows.filter(r => { const date = parseDate(r.createdAt); return date && date > oneWeekAgo; }).length;
    const lastWeek = rows.filter(r => {
        const date = parseDate(r.createdAt);
        const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        return date && date > twoWeeksAgo && date <= oneWeekAgo;
    }).length;

    if (lastWeek > 0) {
        const change = ((thisWeek - lastWeek) / lastWeek * 100).toFixed(0);
        if (Math.abs(change) >= 20) {
            alerts.push({ icon: change > 0 ? '📈' : '📉', text: `Lead velocity ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}% vs last week` });
        }
    }

    const newForms = ['contactus-downloadguide', 'contactus-quotation'];
    const recentNewForms = rows.filter(r => {
        const date = parseDate(r.createdAt);
        return date && date > oneDayAgo && newForms.includes(r.form);
    }).length;
    if (recentNewForms > 0) {
        alerts.push({ icon: '✨', text: `${recentNewForms} submission${recentNewForms > 1 ? 's' : ''} via new forms today` });
    }

    document.getElementById('alertCount').textContent = alerts.length;
    if (alerts.length === 0) {
        document.getElementById('alertsList').innerHTML = '<div class="alert-item"><span class="alert-icon">✅</span>All quiet — no alerts</div>';
    } else {
        document.getElementById('alertsList').innerHTML = alerts.map(alert =>
            `<div class="alert-item"><span class="alert-icon">${alert.icon}</span>${alert.text}</div>`
        ).join('');
    }
}

/* ─── Hot leads ──────────────────────────────────────────── */
function generateHotLeads(rows, parseDate, oneDayAgo) {
    const recentRows = rows.filter(r => {
        const date = parseDate(r.createdAt);
        return date && date > oneDayAgo;
    });

    const hotLeads = recentRows.map(row => {
        const quality = getLeadQuality(row.orderspermonth);
        const domain = getDomain(row.Email).toLowerCase();
        const isCorporate = domain !== 'gmail.com' && domain !== 'yahoo.com' &&
                           domain !== 'hotmail.com' && domain !== 'outlook.com' && domain !== 'unknown';
        const isNewForm = ['contactus-downloadguide', 'contactus-quotation'].includes(row.form);
        const submissionCount = rows.filter(r => r.Email === row.Email).length;

        let score = 0;
        if (quality === 'high') score += 50;
        if (quality === 'medium') score += 25;
        if (isCorporate) score += 20;
        if (isNewForm) score += 15;
        if (submissionCount > 1) score += 20;

        return { ...row, score, quality, isCorporate, isNewForm, submissionCount };
    })
    .filter(lead => lead.quality !== 'low')
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

    if (hotLeads.length === 0) {
        document.getElementById('hotLeadsList').innerHTML =
            '<div class="no-hot-leads">No hot leads in the last 24 hours. Check back soon!</div>';
    } else {
        document.getElementById('hotLeadsList').innerHTML = hotLeads.map(lead => {
            const badges = [];
            if (lead.isNewForm) badges.push('<span class="hot-lead-badge badge-new-form">New Form</span>');
            if (lead.isCorporate) badges.push('<span class="hot-lead-badge badge-corporate">Corporate</span>');
            if (lead.quality === 'high') badges.push('<span class="hot-lead-badge badge-high-value">High Value</span>');
            if (lead.submissionCount > 1) badges.push(`<span class="hot-lead-badge badge-multi-submit">×${lead.submissionCount} Submits</span>`);
            const timeAgo = getTimeAgo(new Date(lead.createdAt));
            return `
                <div class="hot-lead-card">
                    <div class="hot-lead-header">
                        <div class="hot-lead-email">${lead.Email}</div>
                        <div class="hot-lead-score">Score: ${lead.score}</div>
                    </div>
                    <div class="hot-lead-details">
                        <div class="hot-lead-detail">
                            <div class="hot-lead-detail-label">Domain</div>
                            <div class="hot-lead-detail-value">${getDomain(lead.Email)}</div>
                        </div>
                        <div class="hot-lead-detail">
                            <div class="hot-lead-detail-label">Form</div>
                            <div class="hot-lead-detail-value">${lead.form || '—'}</div>
                        </div>
                        <div class="hot-lead-detail">
                            <div class="hot-lead-detail-label">Service</div>
                            <div class="hot-lead-detail-value">${lead.service_offering || '—'}</div>
                        </div>
                        <div class="hot-lead-detail">
                            <div class="hot-lead-detail-label">Volume</div>
                            <div class="hot-lead-detail-value">${lead.orderspermonth || '—'}</div>
                        </div>
                        <div class="hot-lead-detail">
                            <div class="hot-lead-detail-label">Submitted</div>
                            <div class="hot-lead-detail-value">${timeAgo}</div>
                        </div>
                    </div>
                    <div class="hot-lead-badges">${badges.join('')}</div>
                </div>
            `;
        }).join('');
    }
}

/* ─── Core data processing ───────────────────────────────── */
function processData(rows) {
    // Always sort newest first
    rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const now = new Date();
    const oneHourAgo  = new Date(now - 60 * 60 * 1000);
    const oneDayAgo   = new Date(now - 24 * 60 * 60 * 1000);
    const oneWeekAgo  = new Date(now - 7  * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

    const parseDate = (dateStr) => { const d = new Date(dateStr); return isNaN(d) ? null : d; };

    generateSmartAlerts(rows, parseDate, oneDayAgo, oneWeekAgo);
    generateHotLeads(rows, parseDate, oneDayAgo);
    calculateDailyMetrics(rows, parseDate);

    // Stats
    const totalSubmissions = rows.length;
    const lastHour  = rows.filter(r => { const d = parseDate(r.createdAt); return d && d > oneHourAgo; }).length;
    const today     = rows.filter(r => { const d = parseDate(r.createdAt); return d && d > oneDayAgo;  }).length;
    const thisWeek  = rows.filter(r => { const d = parseDate(r.createdAt); return d && d > oneWeekAgo; }).length;
    const lastWeek  = rows.filter(r => { const d = parseDate(r.createdAt); return d && d > twoWeeksAgo && d <= oneWeekAgo; }).length;

    const weekChange = lastWeek === 0 ? 100 : ((thisWeek - lastWeek) / lastWeek * 100).toFixed(1);
    const weekChangeClass = weekChange > 0 ? 'positive' : weekChange < 0 ? 'negative' : '';

    const uniqueEmails     = new Set(rows.map(r => r.Email)).size;
    const gmailUsers       = rows.filter(r => r.Email?.toLowerCase().includes('@gmail.com')).length;
    const corporateEmails  = rows.filter(r => {
        const domain = getDomain(r.Email).toLowerCase();
        return domain !== 'gmail.com' && domain !== 'yahoo.com' && domain !== 'hotmail.com' && domain !== 'outlook.com' && domain !== 'unknown';
    }).length;
    const highValueLeads = rows.filter(r => getLeadQuality(r.orderspermonth) === 'high').length;

    const ssupCount            = rows.filter(isSsup).length;
    const noSsupCount          = rows.filter(r => normSsup(r) === 'NO').length;
    const nonSsupAccountCount  = rows.filter(r => normSsup(r) === 'NON SSUP ACCOUNT').length;
    const ssupTracked          = ssupCount + noSsupCount + nonSsupAccountCount;
    const ssupRate             = ssupTracked > 0 ? (ssupCount / ssupTracked * 100).toFixed(1) + '%' : '—';

    let avgTimeBetween = 0;
    if (rows.length > 1) {
        const sortedRows = [...rows].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        let totalGap = 0;
        for (let i = 1; i < sortedRows.length; i++) {
            totalGap += new Date(sortedRows[i].createdAt) - new Date(sortedRows[i-1].createdAt);
        }
        avgTimeBetween = (totalGap / (sortedRows.length - 1) / (1000 * 60 * 60)).toFixed(1);
    }

    document.getElementById('totalSubmissions').textContent = totalSubmissions;
    document.getElementById('uniqueSubmissions').textContent = uniqueEmails;
    document.getElementById('lastHour').textContent = lastHour;
    document.getElementById('today').textContent = today;
    document.getElementById('thisWeek').textContent = thisWeek;
    document.getElementById('uniqueEmails').textContent = uniqueEmails;
    document.getElementById('gmailUsers').textContent = gmailUsers;
    document.getElementById('corporateEmails').textContent = corporateEmails;
    document.getElementById('highValueLeads').textContent = highValueLeads;
    document.getElementById('avgTimeBetween').textContent = avgTimeBetween + 'h';
    document.getElementById('ssupCount').textContent           = ssupCount;
    document.getElementById('noSsupCount').textContent         = noSsupCount;
    document.getElementById('nonSsupAccountCount').textContent = nonSsupAccountCount;
    document.getElementById('ssupRate').textContent            = ssupRate;

    document.getElementById('thisWeekValue').textContent = thisWeek;
    document.getElementById('lastWeekValue').textContent = lastWeek;
    document.getElementById('weekChange').textContent = (weekChange > 0 ? '+' : '') + weekChange + '%';
    document.getElementById('weekChange').className = 'change ' + weekChangeClass;

    // Charts
    createOrUpdateChart('hourlyChart', 'bar', createHourlyData(rows, oneDayAgo));
    createOrUpdateChart('dailyChart', 'line', createDailyData(rows, new Date(now - 30 * 24 * 60 * 60 * 1000)));
    createOrUpdateChart('domainChart', 'doughnut', createDomainData(rows));
    createOrUpdateChart('leadQualityChart', 'pie', createLeadQualityData(rows));
    createHeatmap(rows);

    currentPage = 1;
    updateTable();
    analyzeFormPerformance(rows);
    createAdditionalAnalytics(rows);
    updateSpamTable();
}

/* ─── Spam table ─────────────────────────────────────────── */
function toggleSpamSection() {
    const content = document.getElementById('spamContent');
    const toggle = document.getElementById('spamToggle');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        toggle.classList.add('expanded');
    } else {
        content.style.display = 'none';
        toggle.classList.remove('expanded');
    }
}

function updateSpamTable() {
    if (spamData.length === 0) return;
    const spamByEmail = {};
    spamData.forEach(row => {
        if (!spamByEmail[row.Email]) {
            spamByEmail[row.Email] = { email: row.Email, submissions: [], legacyCount: 0, lastSubmitted: new Date(row.createdAt) };
        }
        spamByEmail[row.Email].submissions.push(row);
        if (row.form === 'footer-contact_us_form') spamByEmail[row.Email].legacyCount++;
        const date = new Date(row.createdAt);
        if (date > spamByEmail[row.Email].lastSubmitted) spamByEmail[row.Email].lastSubmitted = date;
    });

    const spamUsers = Object.values(spamByEmail).sort((a, b) => b.submissions.length - a.submissions.length);
    document.getElementById('spamCount').textContent = spamData.length;
    document.getElementById('spamTable').innerHTML = spamUsers.map(user => `
        <tr>
            <td>${user.email}</td>
            <td>${getDomain(user.email)}</td>
            <td><strong>${user.submissions.length}</strong></td>
            <td><strong style="color:var(--red);">${user.legacyCount}×</strong></td>
            <td>${user.lastSubmitted.toLocaleString()}</td>
        </tr>
    `).join('');
}

/* ─── Chart data builders ────────────────────────────────── */
function createHourlyData(rows, since) {
    const hourlyCount = {};
    const hours = [];
    const hourDates = [];
    for (let i = 23; i >= 0; i--) {
        const hour = new Date(Date.now() - i * 60 * 60 * 1000);
        const key = hour.toISOString().slice(0, 13);
        hourlyCount[key] = 0;
        hours.push(key);
        hourDates.push(hour);
    }
    rows.filter(r => { const d = new Date(r.createdAt); return !isNaN(d) && d > since; })
        .forEach(r => {
            const hour = new Date(r.createdAt).toISOString().slice(0, 13);
            if (hourlyCount.hasOwnProperty(hour)) hourlyCount[hour]++;
        });
    return {
        labels: hourDates.map(h => h.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })),
        datasets: [{ label: 'Submissions', data: hours.map(h => hourlyCount[h]), backgroundColor: '#6c65f7', borderColor: '#6c65f7', borderWidth: 1, borderRadius: 4 }]
    };
}

function createDailyData(rows, since) {
    const dailyCount = {};
    const days = [];
    const dayDates = [];
    for (let i = 29; i >= 0; i--) {
        const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const key = day.toISOString().slice(0, 10);
        dailyCount[key] = 0;
        days.push(key);
        dayDates.push(day);
    }
    rows.filter(r => { const d = new Date(r.createdAt); return !isNaN(d) && d > since; })
        .forEach(r => {
            const day = new Date(r.createdAt).toISOString().slice(0, 10);
            if (dailyCount.hasOwnProperty(day)) dailyCount[day]++;
        });
    return {
        labels: dayDates.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
        datasets: [{ label: 'Submissions', data: days.map(d => dailyCount[d]), backgroundColor: 'rgba(108,101,247,0.15)', borderColor: '#6c65f7', borderWidth: 2, fill: true, tension: 0.4 }]
    };
}

function createDomainData(rows) {
    const domains = {};
    rows.forEach(r => { const d = getDomain(r.Email); domains[d] = (domains[d] || 0) + 1; });
    const sorted = Object.entries(domains).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return {
        labels: sorted.map(([domain]) => domain),
        datasets: [{ data: sorted.map(([, count]) => count), backgroundColor: ['#6c65f7','#4a43d4','#9c93ff','#23005b','#10b981','#06b6d4','#f59e0b','#ef4444'] }]
    };
}

function createLeadQualityData(rows) {
    const quality = { high: 0, medium: 0, low: 0 };
    rows.forEach(r => { quality[getLeadQuality(r.orderspermonth)]++; });
    return {
        labels: ['High Value (500+)', 'Medium Value (151-500)', 'Low Value (<150)'],
        datasets: [{ data: [quality.high, quality.medium, quality.low], backgroundColor: ['#10b981','#f59e0b','#ef4444'] }]
    };
}

/* ─── Heatmap ────────────────────────────────────────────── */
function createHeatmap(rows) {
    const heatmapData = {};
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    days.forEach(day => { heatmapData[day] = Array(24).fill(0); });
    rows.forEach(r => {
        const date = new Date(r.createdAt);
        if (!isNaN(date)) { heatmapData[days[date.getDay()]][date.getHours()]++; }
    });
    const maxCount = Math.max(...days.flatMap(day => heatmapData[day]));

    let html = '<div class="heatmap">';
    html += '<div class="heatmap-cell"></div>';
    for (let h = 0; h < 24; h++) html += `<div class="heatmap-hour">${h}</div>`;

    days.forEach(day => {
        html += `<div class="heatmap-label">${day}</div>`;
        for (let h = 0; h < 24; h++) {
            const count = heatmapData[day][h];
            const intensity = maxCount === 0 ? 0 : count / maxCount;
            const isDark = document.body.classList.contains('dark-mode');
            const emptyColor = isDark ? '#13121f' : '#f0eff8';
            const color = intensity === 0 ? emptyColor : `rgba(108,101,247,${0.15 + intensity * 0.85})`;
            const textColor = intensity > 0.6 ? '#fff' : (intensity > 0.25 ? '#6c65f7' : 'transparent');
            html += `<div class="heatmap-cell" style="background:${color};color:${textColor};" title="${day} ${h}:00 — ${count} submissions">${count || ''}</div>`;
        }
    });
    html += '</div>';
    document.getElementById('heatmapContainer').innerHTML = html;
}

/* ─── Chart creation ─────────────────────────────────────── */
function createOrUpdateChart(canvasId, type, data, horizontal = false) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const isDark = document.body.classList.contains('dark-mode');
    const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    const tickColor = isDark ? '#4a4770' : '#9896b4';

    if (charts[canvasId]) {
        charts[canvasId].data = data;
        charts[canvasId].update('none');
        return;
    }

    const options = {
        responsive: true,
        maintainAspectRatio: true,
        animation: { duration: 400 },
        plugins: {
            legend: {
                display: type === 'pie' || type === 'doughnut',
                position: 'bottom',
                labels: { color: tickColor, font: { family: "'Instrument Sans'" }, boxWidth: 10, padding: 12 }
            },
            tooltip: {
                backgroundColor: isDark ? '#1a1929' : '#fff',
                titleColor: isDark ? '#e4e1ff' : '#18162e',
                bodyColor: isDark ? '#7a76a8' : '#5a567e',
                borderColor: isDark ? 'rgba(108,101,247,0.2)' : 'rgba(108,101,247,0.13)',
                borderWidth: 1,
                padding: 10,
                cornerRadius: 8
            }
        }
    };

    if (type === 'bar' || type === 'line') {
        options.scales = {
            y: { beginAtZero: true, ticks: { stepSize: 1, color: tickColor, font: { family: "'JetBrains Mono'" } }, grid: { color: gridColor } },
            x: { ticks: { color: tickColor, font: { family: "'Instrument Sans'" } }, grid: { display: false } }
        };
        if (horizontal) { options.indexAxis = 'y'; }
    }

    charts[canvasId] = new Chart(ctx, { type, data, options });
}

/* ─── Recent submissions table ───────────────────────────── */
function updateRecentTable(recentRows) {
    const tbody = document.getElementById('recentSubmissionsTable');
    document.getElementById('tableCount').textContent = filteredData.length;

    const emailCounts = {};
    allData.forEach(r => { emailCounts[r.Email] = (emailCounts[r.Email] || 0) + 1; });

    tbody.innerHTML = recentRows.map(row => {
        const date = new Date(row.createdAt);
        const dateStr = isNaN(date) ? 'Invalid' : date.toLocaleString();
        const domain = getDomain(row.Email);
        const quality = getLeadQuality(row.orderspermonth);
        const qualityClass = `lead-quality-${quality}`;
        const qualityLabel = quality === 'high' ? 'High' : quality === 'medium' ? 'Medium' : 'Low';
        const submissionCount = emailCounts[row.Email] || 1;
        const phoneNumber = row.PhoneNumber || row.phonenumber || row.phone_number || row.phone || '—';
        const hasNote = !!leadNotes[row.Email];
        const noteTitle = hasNote ? leadNotes[row.Email].replace(/'/g, '&#39;').substring(0, 80) + (leadNotes[row.Email].length > 80 ? '…' : '') : 'Add note';
        const emailEsc = row.Email.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
        const ssupVal = normSsup(row);
        const ssupBadge = ssupVal === 'SSUP'
            ? '<span style="background:var(--success-light);color:var(--success);font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;">SSUP</span>'
            : ssupVal === 'NO'
            ? '<span style="background:var(--surface-3);color:var(--text-muted);font-size:10px;font-weight:600;padding:2px 8px;border-radius:99px;">Not Converted</span>'
            : ssupVal === 'NON SSUP ACCOUNT'
            ? '<span style="background:var(--info-light);color:var(--info);font-size:10px;font-weight:600;padding:2px 8px;border-radius:99px;">Sales Closed</span>'
            : ssupVal === 'LEGACY FORM'
            ? '<span style="background:var(--warning-light);color:var(--warning);font-size:10px;font-weight:600;padding:2px 8px;border-radius:99px;">Legacy Form</span>'
            : '<span style="color:var(--text-disabled);">—</span>';

        return `
            <tr>
                <td>${dateStr}</td>
                <td>${row.Email}</td>
                <td>${domain}</td>
                <td>${phoneNumber}</td>
                <td>${row.form || '—'}</td>
                <td>${row.service_offering || '—'}</td>
                <td>${row.orderspermonth || '—'}</td>
                <td><span class="lead-quality-badge ${qualityClass}">${qualityLabel}</span></td>
                <td style="text-align:center;">${ssupBadge}</td>
                <td style="text-align:center;font-family:'JetBrains Mono',monospace;font-weight:700;">${submissionCount}×</td>
                <td style="text-align:center;">
                    <button class="notes-btn ${hasNote ? 'has-note' : ''}"
                            onclick="openNotesModal('${emailEsc}')"
                            title="${noteTitle}">${hasNote ? '📝' : '+'}</button>
                </td>
            </tr>
        `;
    }).join('');
}

/* ─── Table sorting & search ─────────────────────────────── */
function sortTable(column) {
    if (tableSortColumn === column) {
        tableSortDirection = tableSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        tableSortColumn = column;
        tableSortDirection = 'desc';
    }
    document.querySelectorAll('[id^="sort-"]').forEach(el => el.textContent = '↕');
    document.getElementById(`sort-${column}`).textContent = tableSortDirection === 'asc' ? '↑' : '↓';
    filteredData.sort((a, b) => {
        let aVal = a[column], bVal = b[column];
        if (column === 'createdAt') { aVal = new Date(aVal); bVal = new Date(bVal); }
        if (aVal < bVal) return tableSortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return tableSortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    currentPage = 1;
    updateTable();
}

function filterTable() {
    const searchTerm = document.getElementById('tableSearch').value.toLowerCase();
    filteredData = allData.filter(row => {
        if (searchTerm && !(
            row.Email?.toLowerCase().includes(searchTerm) ||
            row.form?.toLowerCase().includes(searchTerm) ||
            row.service_offering?.toLowerCase().includes(searchTerm) ||
            getDomain(row.Email).toLowerCase().includes(searchTerm)
        )) return false;
        return true;
    });
    currentPage = 1;
    processData(filteredData);
}

/* ─── Form performance ───────────────────────────────────── */
function analyzeFormPerformance(rows) {
    const newForms = ['contactus-downloadguide', 'contactus-quotation'];
    const legacyForm = 'footer-contact_us_form';

    const newFormsCount = rows.filter(r => newForms.includes(r.form)).length;
    const legacyFormCount = rows.filter(r => r.form === legacyForm).length;
    const totalCount = rows.length;
    const conversionRate = totalCount === 0 ? 0 : ((newFormsCount / totalCount) * 100).toFixed(1);

    const emailsByForm = {};
    rows.forEach(r => {
        if (!emailsByForm[r.Email]) emailsByForm[r.Email] = { newForms: false, legacy: false, rows: [] };
        if (newForms.includes(r.form)) emailsByForm[r.Email].newForms = true;
        if (r.form === legacyForm) emailsByForm[r.Email].legacy = true;
        emailsByForm[r.Email].rows.push(r);
    });

    const newFormsOnlyEmails = Object.entries(emailsByForm)
        .filter(([, data]) => data.newForms && !data.legacy)
        .map(([email]) => email);

    const newFormsOnlyRows = rows.filter(r => newFormsOnlyEmails.includes(r.Email));
    const highValue   = newFormsOnlyRows.filter(r => getLeadQuality(r.orderspermonth) === 'high').length;
    const mediumValue = newFormsOnlyRows.filter(r => getLeadQuality(r.orderspermonth) === 'medium').length;

    document.getElementById('newFormsOnlyCount').textContent = newFormsOnlyEmails.length;
    document.getElementById('newFormsHighValue').textContent = highValue;
    document.getElementById('newFormsMediumValue').textContent = mediumValue;
    document.getElementById('newFormsCount').textContent = newFormsCount;
    document.getElementById('legacyFormCount').textContent = legacyFormCount;
    document.getElementById('conversionRate').textContent = conversionRate + '%';

    const userForms = {};
    rows.forEach(r => {
        if (!userForms[r.Email]) userForms[r.Email] = new Set();
        userForms[r.Email].add(r.form);
    });
    multiFormUsers = Object.entries(userForms)
        .filter(([, forms]) => forms.size > 1)
        .map(([email, forms]) => ({ email, forms: Array.from(forms) }))
        .sort((a, b) => b.forms.length - a.forms.length);

    multiFormCurrentPage = 1;
    updateMultiFormTable();
    createFormTimelineChart(rows);

    const formCounts = {};
    rows.forEach(r => {
        const form = r.form || 'Unknown';
        formCounts[form] = (formCounts[form] || 0) + 1;
    });
    const formLabels = Object.keys(formCounts).map(form => {
        if (form === 'contactus-downloadguide') return 'Download Guide (New)';
        if (form === 'contactus-quotation') return 'Quotation (New)';
        if (form === 'footer-contact_us_form') return 'Legacy Form';
        return form;
    });
    createOrUpdateChart('formTypeChart', 'doughnut', {
        labels: formLabels,
        datasets: [{ data: Object.values(formCounts), backgroundColor: ['#10b981','#06b6d4','#f59e0b','#6c65f7','#23005b'] }]
    });
}

function previousMultiFormPage() {
    if (multiFormCurrentPage > 1) { multiFormCurrentPage--; updateMultiFormTable(); }
}

function nextMultiFormPage() {
    const totalPages = Math.ceil(multiFormUsers.length / multiFormItemsPerPage);
    if (multiFormCurrentPage < totalPages) { multiFormCurrentPage++; updateMultiFormTable(); }
}

function updateMultiFormTable() {
    if (multiFormUsers.length === 0) {
        document.getElementById('multiFormTable').innerHTML =
            '<p style="color:var(--text-muted);text-align:center;padding:20px;font-size:12px;">No users have submitted multiple forms yet</p>';
        document.getElementById('multiFormPagination').style.display = 'none';
        return;
    }

    const totalPages = Math.ceil(multiFormUsers.length / multiFormItemsPerPage);
    const startIndex = (multiFormCurrentPage - 1) * multiFormItemsPerPage;
    const pageUsers = multiFormUsers.slice(startIndex, startIndex + multiFormItemsPerPage);

    document.getElementById('multiFormPagination').style.display = totalPages > 1 ? 'flex' : 'none';
    document.getElementById('multiFormCurrentPage').textContent = multiFormCurrentPage;
    document.getElementById('multiFormTotalPages').textContent = totalPages;
    document.getElementById('multiFormPrevBtn').disabled = multiFormCurrentPage === 1;
    document.getElementById('multiFormNextBtn').disabled = multiFormCurrentPage >= totalPages;

    const newFormsList = ['contactus-downloadguide', 'contactus-quotation'];
    document.getElementById('multiFormTable').innerHTML = pageUsers.map(user => {
        const formBadges = user.forms.map(form => {
            const isNew = newFormsList.includes(form);
            const displayName = form === 'contactus-downloadguide' ? 'Download Guide' :
                               form === 'contactus-quotation' ? 'Quotation' : 'Legacy Form';
            return `<span class="form-badge ${isNew ? 'new' : 'legacy'}">${displayName}</span>`;
        }).join('');
        return `
            <div class="multi-form-user">
                <div class="multi-form-user-email">${user.email}</div>
                <div class="multi-form-user-forms">${formBadges}</div>
            </div>
        `;
    }).join('');
}

function createFormTimelineChart(rows) {
    const newForms = ['contactus-downloadguide', 'contactus-quotation'];
    const legacyForm = 'footer-contact_us_form';
    const days = [];
    const dayDates = [];
    const newFormsCounts = {};
    const legacyFormCounts = {};

    for (let i = 29; i >= 0; i--) {
        const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const key = day.toISOString().slice(0, 10);
        newFormsCounts[key] = 0;
        legacyFormCounts[key] = 0;
        days.push(key);
        dayDates.push(day);
    }

    rows.forEach(r => {
        const date = new Date(r.createdAt);
        if (!isNaN(date)) {
            const day = date.toISOString().slice(0, 10);
            if (days.includes(day)) {
                if (newForms.includes(r.form)) newFormsCounts[day]++;
                else if (r.form === legacyForm) legacyFormCounts[day]++;
            }
        }
    });

    createOrUpdateChart('formTimelineChart', 'line', {
        labels: dayDates.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
        datasets: [
            { label: 'New Forms',    data: days.map(d => newFormsCounts[d]),    backgroundColor: 'rgba(16,185,129,0.12)', borderColor: '#10b981', borderWidth: 2, fill: true, tension: 0.4 },
            { label: 'Legacy Form',  data: days.map(d => legacyFormCounts[d]),  backgroundColor: 'rgba(245,158,11,0.12)', borderColor: '#f59e0b', borderWidth: 2, fill: true, tension: 0.4 }
        ]
    });
}

/* ─── Additional analytics ───────────────────────────────── */
function createAdditionalAnalytics(rows) {
    // Top corporate domains
    const domainCounts = {};
    rows.forEach(r => {
        const domain = getDomain(r.Email).toLowerCase();
        if (domain !== 'gmail.com' && domain !== 'yahoo.com' && domain !== 'hotmail.com' &&
            domain !== 'outlook.com' && domain !== 'unknown') {
            domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        }
    });
    const topDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    document.getElementById('topDomainsTable').innerHTML = topDomains.length === 0 ?
        '<p style="color:var(--text-muted);padding:10px;font-size:12px;">No corporate domains yet</p>' :
        `<table style="width:100%;font-size:11px;">
            <tr><th>Domain</th><th style="text-align:right;">Count</th></tr>
            ${topDomains.map(([domain, count]) =>
                `<tr><td style="padding:6px;">${domain}</td><td style="text-align:right;padding:6px;font-family:'JetBrains Mono',monospace;font-weight:700;">${count}</td></tr>`
            ).join('')}
        </table>`;

    // Lead velocity (last 7 days)
    const velocityData = {};
    for (let i = 6; i >= 0; i--) {
        const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        velocityData[day.toISOString().slice(0, 10)] = 0;
    }
    rows.forEach(r => {
        const day = new Date(r.createdAt).toISOString().slice(0, 10);
        if (velocityData.hasOwnProperty(day)) velocityData[day]++;
    });
    const velocityLabels = Object.keys(velocityData).map(d =>
        new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    );
    const velocityValues = Object.values(velocityData);
    createOrUpdateChart('leadVelocityChart', 'bar', {
        labels: velocityLabels,
        datasets: [{ label: 'Submissions', data: velocityValues, backgroundColor: '#6c65f7', borderColor: '#6c65f7', borderWidth: 1, borderRadius: 4 }]
    });

    // Daily growth rate
    const growthRates = [];
    const growthLabels = [];
    for (let i = 1; i < velocityValues.length; i++) {
        const prev = velocityValues[i - 1];
        const curr = velocityValues[i];
        const rate = prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev * 100);
        growthRates.push(rate.toFixed(1));
        growthLabels.push(velocityLabels[i]);
    }
    createOrUpdateChart('growthRateChart', 'line', {
        labels: growthLabels,
        datasets: [{ label: 'Growth Rate (%)', data: growthRates, backgroundColor: 'rgba(16,185,129,0.12)', borderColor: '#10b981', borderWidth: 2, fill: true, tension: 0.4 }]
    });

    // Peak submission hours
    const hourCounts = Array(24).fill(0);
    rows.forEach(r => { const d = new Date(r.createdAt); if (!isNaN(d)) hourCounts[d.getHours()]++; });
    const topHours = hourCounts.map((count, hour) => ({ hour, count })).sort((a, b) => b.count - a.count).slice(0, 5);
    document.getElementById('peakHoursTable').innerHTML = topHours.length === 0 || topHours[0].count === 0 ?
        '<p style="color:var(--text-muted);padding:10px;font-size:12px;">Not enough data</p>' :
        `<table style="width:100%;font-size:11px;">
            <tr><th>Hour</th><th style="text-align:right;">Submissions</th></tr>
            ${topHours.map(({ hour, count }) =>
                `<tr><td style="padding:6px;">${hour}:00 – ${hour}:59</td><td style="text-align:right;padding:6px;font-family:'JetBrains Mono',monospace;font-weight:700;">${count}</td></tr>`
            ).join('')}
        </table>`;

    // Conversion funnel
    const funnelData = {
        'Download Guide → High':   rows.filter(r => r.form === 'contactus-downloadguide' && getLeadQuality(r.orderspermonth) === 'high').length,
        'Download Guide → Medium': rows.filter(r => r.form === 'contactus-downloadguide' && getLeadQuality(r.orderspermonth) === 'medium').length,
        'Download Guide → Low':    rows.filter(r => r.form === 'contactus-downloadguide' && getLeadQuality(r.orderspermonth) === 'low').length,
        'Quotation → High':        rows.filter(r => r.form === 'contactus-quotation' && getLeadQuality(r.orderspermonth) === 'high').length,
        'Quotation → Medium':      rows.filter(r => r.form === 'contactus-quotation' && getLeadQuality(r.orderspermonth) === 'medium').length,
        'Quotation → Low':         rows.filter(r => r.form === 'contactus-quotation' && getLeadQuality(r.orderspermonth) === 'low').length,
    };
    const funnelEntries = Object.entries(funnelData).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
    document.getElementById('conversionFunnelTable').innerHTML = funnelEntries.length === 0 ?
        '<p style="color:var(--text-muted);padding:10px;font-size:12px;">Not enough data</p>' :
        `<table style="width:100%;font-size:11px;">
            <tr><th>Path</th><th style="text-align:right;">Count</th></tr>
            ${funnelEntries.map(([path, count]) =>
                `<tr><td style="padding:6px;">${path}</td><td style="text-align:right;padding:6px;font-family:'JetBrains Mono',monospace;font-weight:700;">${count}</td></tr>`
            ).join('')}
        </table>`;

    // Submissions by day of week
    const dayOfWeekCounts = Array(7).fill(0);
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    rows.forEach(r => { const d = new Date(r.createdAt); if (!isNaN(d)) dayOfWeekCounts[d.getDay()]++; });
    createOrUpdateChart('dayOfWeekChart', 'bar', {
        labels: dayNames,
        datasets: [{ label: 'Submissions', data: dayOfWeekCounts,
            backgroundColor: dayOfWeekCounts.map((_, i) => i === 0 || i === 6 ? '#f59e0b' : '#6c65f7'),
            borderWidth: 1, borderRadius: 4 }]
    });
}

/* ─── CSV export ─────────────────────────────────────────── */
function exportToCSV() {
    if (filteredData.length === 0) { showError('No data to export'); return; }
    const headers = ['Created At','Email','Domain','Form','Service Offering','Orders Per Month','Lead Quality','Notes'];
    const csvRows = filteredData.map(row => {
        const date = new Date(row.createdAt);
        return [
            isNaN(date) ? '' : date.toISOString(),
            row.Email || '',
            getDomain(row.Email),
            row.form || '',
            row.service_offering || '',
            row.orderspermonth || '',
            getLeadQuality(row.orderspermonth),
            leadNotes[row.Email] || ''
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quiqup-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

/* ─── SSUP table ─────────────────────────────────────────── */
let ssupFormFilter = 'all'; // 'all' | 'new'

function setSsupFormFilter(val, btn) {
    ssupFormFilter = val;
    document.querySelectorAll('#ssupPillAll, #ssupPillNew').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderSsupTable();
}

function normSsup(r) {
    return typeof r.is_ssup === 'string' ? r.is_ssup.trim().toUpperCase() : '';
}
function isSsup(r) { return normSsup(r) === 'SSUP'; }

function renderSsupTable() {
    const card = document.getElementById('ssupTableCard');
    if (!card) return;
    if (!allData || allData.length === 0) return;

    card.style.display = 'block';

    const search = (document.getElementById('ssupSearch')?.value || '').toLowerCase();

    // Emails that submitted the legacy form at least once
    const legacyEmails = ssupFormFilter === 'new'
        ? new Set(allData.filter(r => r.form === 'footer-contact_us_form').map(r => r.Email))
        : null;

    const rows = allData
        .filter(isSsup)
        .filter(r => !legacyEmails || !legacyEmails.has(r.Email))
        .filter(r => {
            if (!search) return true;
            return r.Email?.toLowerCase().includes(search) || getDomain(r.Email).toLowerCase().includes(search);
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = allData.filter(isSsup).length;
    document.getElementById('ssupTableCount').textContent = rows.length;

    const nb = document.getElementById('nbadge-ssup');
    if (nb) { nb.textContent = total; nb.className = 'nav-badge' + (total > 0 ? ' visible' : ''); }

    if (rows.length === 0) {
        const filterNote = ssupFormFilter === 'new' ? ' who only submitted new forms' : '';
        document.getElementById('ssupTableBody').innerHTML = `
            <tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px;">
                No SSUP leads found${filterNote}${search ? ' matching "' + search + '"' : ''}
            </td></tr>`;
        return;
    }

    document.getElementById('ssupTableBody').innerHTML = rows.map(row => {
        const d = new Date(row.createdAt);
        const dateStr = isNaN(d) ? '—' : d.toLocaleString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
        const quality = getLeadQuality(row.orderspermonth);
        const qualityLabel = quality === 'high' ? 'High' : quality === 'medium' ? 'Medium' : 'Low';
        const phone = row.PhoneNumber || row.phonenumber || row.phone_number || row.phone || '—';
        const formLabel = row.form === 'contactus-downloadguide' ? 'Download Guide'
                        : row.form === 'contactus-quotation'      ? 'Quotation'
                        : row.form === 'footer-contact_us_form'   ? 'Legacy Form'
                        : row.form || '—';
        return `
            <tr>
                <td style="white-space:nowrap;">${dateStr}</td>
                <td>${row.Email || '—'}</td>
                <td>${getDomain(row.Email)}</td>
                <td>${phone}</td>
                <td>${formLabel}</td>
                <td>${row.service_offering || '—'}</td>
                <td style="font-family:'JetBrains Mono',monospace;">${row.orderspermonth || '—'}</td>
                <td><span class="lead-quality-badge lead-quality-${quality}">${qualityLabel}</span></td>
                <td>${row.company || '—'}</td>
            </tr>
        `;
    }).join('');
}

/* ─── Weekly analytics ───────────────────────────────────── */

function buildWeekBuckets(anchorDate, numWeeks) {
    // anchorDate is the exact start of week 1; all subsequent weeks count from it
    const anchor = new Date(anchorDate);
    anchor.setHours(0, 0, 0, 0);

    const now = new Date();
    now.setHours(23, 59, 59, 999);

    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    // How many complete weeks have passed since anchor (including current partial week)
    const totalWeeks = Math.floor((now - anchor) / msPerWeek) + 1;

    if (numWeeks === 0 || numWeeks > totalWeeks) {
        numWeeks = Math.min(totalWeeks, 104);
    }

    // Show the last `numWeeks` weeks up to today
    const startOffset = Math.max(0, totalWeeks - numWeeks);
    const weeks = [];
    for (let i = startOffset; i < startOffset + numWeeks; i++) {
        const start = new Date(anchor);
        start.setDate(anchor.getDate() + i * 7);
        const end = new Date(start);
        end.setDate(start.getDate() + 7);
        weeks.push({ start, end });
    }
    return weeks;
}

function computeWeekStats(rows, week) {
    const weekRows = rows.filter(r => {
        const d = new Date(r.createdAt);
        return !isNaN(d) && d >= week.start && d < week.end;
    });
    const newFormsList = ['contactus-downloadguide', 'contactus-quotation'];
    return {
        total: weekRows.length,
        unique: new Set(weekRows.map(r => r.Email)).size,
        high:   weekRows.filter(r => getLeadQuality(r.orderspermonth) === 'high').length,
        medium: weekRows.filter(r => getLeadQuality(r.orderspermonth) === 'medium').length,
        low:    weekRows.filter(r => getLeadQuality(r.orderspermonth) === 'low').length,
        corporate: weekRows.filter(r => {
            const d = getDomain(r.Email).toLowerCase();
            return d !== 'gmail.com' && d !== 'yahoo.com' && d !== 'hotmail.com' && d !== 'outlook.com' && d !== 'unknown';
        }).length,
        newForms: weekRows.filter(r => newFormsList.includes(r.form)).length,
        legacy:   weekRows.filter(r => r.form === 'footer-contact_us_form').length,
        ssup:           weekRows.filter(isSsup).length,
        noSsup:         weekRows.filter(r => normSsup(r) === 'NO').length,
        nonSsupAccount: weekRows.filter(r => normSsup(r) === 'NON SSUP ACCOUNT').length,
    };
}

function weekLabel(week) {
    const opts = { month: 'short', day: 'numeric' };
    const s = week.start.toLocaleDateString('en-US', opts);
    const eDay = new Date(week.end);
    eDay.setDate(eDay.getDate() - 1);
    return `${s} – ${eDay.toLocaleDateString('en-US', opts)}`;
}

function renderWeeklyChart(canvasId, type, data, stacked) {
    if (charts[canvasId]) { charts[canvasId].destroy(); delete charts[canvasId]; }
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const isDark = document.body.classList.contains('dark-mode');
    const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    const tickColor = isDark ? '#4a4770' : '#9896b4';

    charts[canvasId] = new Chart(ctx, {
        type,
        data,
        options: {
            responsive: true,
            maintainAspectRatio: true,
            animation: { duration: 400 },
            plugins: {
                legend: {
                    display: !!stacked,
                    position: 'bottom',
                    labels: { color: tickColor, font: { family: "'Plus Jakarta Sans'" }, boxWidth: 10, padding: 12 }
                },
                tooltip: {
                    backgroundColor: isDark ? '#1a1929' : '#fff',
                    titleColor: isDark ? '#e4e1ff' : '#18162e',
                    bodyColor: isDark ? '#7a76a8' : '#5a567e',
                    borderColor: isDark ? 'rgba(108,101,247,0.2)' : 'rgba(108,101,247,0.13)',
                    borderWidth: 1, padding: 10, cornerRadius: 8
                }
            },
            scales: {
                y: { beginAtZero: true, stacked: !!stacked, ticks: { stepSize: 1, color: tickColor, font: { family: "'JetBrains Mono'" } }, grid: { color: gridColor } },
                x: { stacked: !!stacked, ticks: { color: tickColor, font: { family: "'Plus Jakarta Sans'", size: 10 }, maxRotation: 45 }, grid: { display: false } }
            }
        }
    });
}

function renderWeeklyAnalytics() {
    const weeklyContent = document.getElementById('weeklyContent');
    if (!weeklyContent) return;
    if (!allData || allData.length === 0) { weeklyContent.style.display = 'none'; return; }
    weeklyContent.style.display = 'block';

    const dateInput = document.getElementById('weekStartDate');
    // Auto-default to the Monday of the week containing the earliest data point
    if (dateInput && !dateInput.value && allData.length > 0) {
        const timestamps = allData.map(r => new Date(r.createdAt).getTime()).filter(t => !isNaN(t));
        const earliest = new Date(Math.min(...timestamps));
        earliest.setDate(earliest.getDate() - ((earliest.getDay() + 6) % 7)); // back to Monday
        earliest.setHours(0, 0, 0, 0);
        // Use LOCAL date parts to avoid UTC-shift bug
        const y = earliest.getFullYear();
        const m = String(earliest.getMonth() + 1).padStart(2, '0');
        const d = String(earliest.getDate()).padStart(2, '0');
        dateInput.value = `${y}-${m}-${d}`;
    }
    if (!dateInput?.value) return;

    // Always show from chosen date to today
    const weeks = buildWeekBuckets(new Date(dateInput.value + 'T00:00:00'), 0);
    const weekStats = weeks.map(w => computeWeekStats(allData, w));
    const labels    = weeks.map(weekLabel);

    // Chart 1 — total submissions per week
    renderWeeklyChart('weeklyTotalsChart', 'bar', {
        labels,
        datasets: [{
            label: 'Submissions',
            data: weekStats.map(s => s.total),
            backgroundColor: '#7c3aed', borderColor: '#7c3aed', borderWidth: 1, borderRadius: 4
        }]
    });

    // Chart 2 — lead quality stacked
    renderWeeklyChart('weeklyQualityChart', 'bar', {
        labels,
        datasets: [
            { label: 'High (500+)',     data: weekStats.map(s => s.high),   backgroundColor: '#059669', borderWidth: 0 },
            { label: 'Medium (151–500)',data: weekStats.map(s => s.medium), backgroundColor: '#d97706', borderWidth: 0 },
            { label: 'Low (<150)',      data: weekStats.map(s => s.low),    backgroundColor: '#dc2626', borderWidth: 0 }
        ]
    }, true);

    // Chart 3 — form type stacked
    renderWeeklyChart('weeklyFormsChart', 'bar', {
        labels,
        datasets: [
            { label: 'New Forms',   data: weekStats.map(s => s.newForms), backgroundColor: '#0284c7', borderWidth: 0 },
            { label: 'Legacy Form', data: weekStats.map(s => s.legacy),   backgroundColor: '#f59e0b', borderWidth: 0 }
        ]
    }, true);

    // Table — newest first
    const revWeeks = [...weeks].reverse();
    const revStats = [...weekStats].reverse();

    document.getElementById('weeklyTableBody').innerHTML = revStats.map((stats, i) => {
        const isCurrentWeek = i === 0;
        const prevStats = revStats[i + 1];
        let changeHtml = '<span style="color:var(--text-muted);">—</span>';
        if (prevStats !== undefined) {
            if (prevStats.total === 0 && stats.total > 0) {
                changeHtml = '<span class="change positive">New</span>';
            } else if (prevStats.total > 0) {
                const pct = ((stats.total - prevStats.total) / prevStats.total * 100).toFixed(0);
                const cls = pct > 0 ? 'positive' : pct < 0 ? 'negative' : '';
                changeHtml = `<span class="change ${cls}">${pct > 0 ? '+' : ''}${pct}%</span>`;
            }
        }
        return `
            <tr${isCurrentWeek ? ' style="background:var(--accent-light);"' : ''}>
                <td style="white-space:nowrap;">
                    <span style="font-family:'JetBrains Mono',monospace;font-size:11px;">${weekLabel(revWeeks[i])}</span>
                    ${isCurrentWeek ? '<span style="margin-left:8px;background:var(--accent-mid);color:var(--accent);font-size:9px;padding:2px 7px;border-radius:99px;font-weight:700;letter-spacing:0.04em;">current</span>' : ''}
                </td>
                <td style="text-align:center;font-family:'JetBrains Mono',monospace;font-weight:700;">${stats.total}</td>
                <td style="text-align:center;font-family:'JetBrains Mono',monospace;">${stats.unique}</td>
                <td style="text-align:center;font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--success);">${stats.high || '—'}</td>
                <td style="text-align:center;font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--warning);">${stats.medium || '—'}</td>
                <td style="text-align:center;font-family:'JetBrains Mono',monospace;">${stats.corporate || '—'}</td>
                <td style="text-align:center;font-family:'JetBrains Mono',monospace;">${stats.newForms || '—'}</td>
                <td style="text-align:center;font-family:'JetBrains Mono',monospace;">${stats.legacy || '—'}</td>
                <td style="text-align:center;font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--success);">${stats.ssup || '—'}</td>
                <td style="text-align:center;font-family:'JetBrains Mono',monospace;color:var(--accent);">${(stats.ssup + stats.noSsup + stats.nonSsupAccount) > 0 ? (stats.ssup / (stats.ssup + stats.noSsup + stats.nonSsupAccount) * 100).toFixed(0) + '%' : '—'}</td>
                <td style="text-align:center;">${changeHtml}</td>
            </tr>
        `;
    }).join('');
}

/* ─── Export deduplication ───────────────────────────────── */
// Per-email, pick the single best submission using this priority:
//   1. Legacy form (means Salesforce lead already exists)
//   2. contactus-quotation (most intent)
//   3. contactus-downloadguide
//   4. anything else
// Tiebreak within same form: prefer rows with phone > company/website > most fields filled
function deduplicateForExport(rows) {
    const formRank = form => {
        if (form === 'footer-contact_us_form')   return 4;
        if (form === 'contactus-quotation')       return 3;
        if (form === 'contactus-downloadguide')   return 2;
        return 1;
    };
    const completeness = row => {
        let s = 0;
        if (row.PhoneNumber || row.phonenumber || row.phone_number || row.phone) s += 10;
        if (row.company)          s += 3;
        if (row.website)          s += 2;
        if (row.service_offering) s += 1;
        if (row.orderspermonth)   s += 1;
        return s;
    };

    const byEmail = {};
    rows.forEach(r => {
        if (!byEmail[r.Email]) byEmail[r.Email] = [];
        byEmail[r.Email].push(r);
    });

    return Object.values(byEmail).map(submissions => {
        if (submissions.length === 1) return submissions[0];
        return submissions.slice().sort((a, b) => {
            const rankDiff = formRank(b.form) - formRank(a.form);
            if (rankDiff !== 0) return rankDiff;
            return completeness(b) - completeness(a);
        })[0];
    });
}

/* ─── Weekly Excel export ────────────────────────────────── */
function exportWeeklyExcel() {
    if (typeof XLSX === 'undefined') { showError('Export library not loaded yet — try again in a moment'); return; }
    if (!allData || allData.length === 0) { showError('No data to export'); return; }

    const dateInput = document.getElementById('weekStartDate');
    if (!dateInput?.value) { showError('Pick a week start date first'); return; }

    const weeks = buildWeekBuckets(new Date(dateInput.value + 'T00:00:00'), 0);
    if (weeks.length === 0) { showError('No weeks in range'); return; }

    const wb = XLSX.utils.book_new();

    // ── Summary sheet (first tab) ──────────────────────────
    const summaryRows = [
        ['Week', 'Total Submissions', 'Unique Emails', 'High Value', 'Medium Value', 'Low Value', 'Corporate', 'New Forms', 'Legacy Form', 'SSUP', 'Not Converted', 'Sales Closed', 'Conv %']
    ];
    weeks.forEach(week => {
        const s = computeWeekStats(allData, week);
        const tracked = s.ssup + s.noSsup + s.nonSsupAccount;
        summaryRows.push([weekLabel(week), s.total, s.unique, s.high, s.medium, s.low, s.corporate, s.newForms, s.legacy, s.ssup, s.noSsup, s.nonSsupAccount, tracked > 0 ? (s.ssup / tracked * 100).toFixed(1) + '%' : '—']);
    });
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
    summaryWs['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 11 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 8 }, { wch: 10 }, { wch: 9 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    // ── Helper: convert deduplicated rows → worksheet ──────
    const headers = ['Date & Time', 'Email', 'Domain', 'Phone', 'Company', 'Website', 'Form', 'Service', 'Orders / Month', 'Lead Quality', 'SSUP', 'Notes'];
    const colWidths = [{ wch: 22 }, { wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 13 }, { wch: 8 }, { wch: 30 }];

    function rowsToSheet(rows) {
        const data = [
            headers,
            ...deduplicateForExport(rows)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map(row => {
                    const d = new Date(row.createdAt);
                    return [
                        isNaN(d) ? '' : d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }),
                        row.Email || '',
                        getDomain(row.Email),
                        row.PhoneNumber || row.phonenumber || row.phone_number || row.phone || '',
                        row.company || '',
                        row.website || '',
                        row.form || '',
                        row.service_offering || '',
                        row.orderspermonth || '',
                        getLeadQuality(row.orderspermonth),
                        row.is_ssup || '',
                        leadNotes[row.Email] || ''
                    ];
                })
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = colWidths;
        return ws;
    }

    // ── One sheet per week ─────────────────────────────────
    weeks.forEach(week => {
        const weekRows = allData.filter(r => { const d = new Date(r.createdAt); return !isNaN(d) && d >= week.start && d < week.end; });
        const name = weekLabel(week).replace(/[:\\/?*[\]]/g, '-').slice(0, 31);
        XLSX.utils.book_append_sheet(wb, rowsToSheet(weekRows), name);
    });

    // ── All Leads tab (all weeks combined, one row per email) ──
    XLSX.utils.book_append_sheet(wb, rowsToSheet(allData), 'All Leads');

    const filename = `quiqup-weekly-${new Date().toLocaleDateString('en-CA')}.xlsx`;
    XLSX.writeFile(wb, filename);
}

/* ─── Keyboard shortcuts ─────────────────────────────────── */
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') { e.preventDefault(); fetchData(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') { e.preventDefault(); exportToCSV(); }
});

/* ─── Patches for sidebar/topbar sync ───────────────────── */
const _origLoadConfig = loadConfig;
loadConfig = function() {
    _origLoadConfig();
    // Config banner visibility
    const saved = localStorage.getItem('dashboardConfig');
    if (saved) {
        try {
            const cfg = JSON.parse(saved);
            if (cfg.webhookUrl) {
                document.getElementById('configSection').style.display = 'none';
                document.getElementById('configSectionShow').style.display = 'block';
            } else {
                document.getElementById('configSection').style.display = 'block';
            }
        } catch(e) {}
    } else {
        document.getElementById('configSection').style.display = 'block';
    }
    // Restore active section
    const savedSection = localStorage.getItem('activeSection');
    if (savedSection) showSection(savedSection);
    // Sync top dark mode button
    if (localStorage.getItem('darkMode') === '1') {
        const btn = document.getElementById('darkModeBtnTop');
        if (btn) btn.textContent = '☀️';
    }
};

const _origSaveConfig = saveConfig;
saveConfig = function() {
    _origSaveConfig();
    document.getElementById('configSectionShow').style.display = 'block';
};

const _origToggleDarkMode = toggleDarkMode;
toggleDarkMode = function() {
    _origToggleDarkMode();
    const isDark = document.body.classList.contains('dark-mode');
    const btn = document.getElementById('darkModeBtnTop');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
};

const _origProcessData = processData;
processData = function(rows) {
    _origProcessData(rows);
    updateNavBadges();
    renderSsupTable();
    renderWeeklyAnalytics();
};

/* ─── Init ───────────────────────────────────────────────── */
loadConfig();
