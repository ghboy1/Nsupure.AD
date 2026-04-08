/* ============================================================
   NSUPURE WATER MANAGER - IMPROVED APP LOGIC v3
   - History date filters (Today / Yesterday / This Week / Custom)
   - fulfillOrder() deducts bags from global stock
   - Customer selection: searchable click-list (no broken <select>)
   ============================================================ */

const BACKUP_EMAIL = 'nsupure.adumasa@gmail.com';
const WA_NUMBERS = ['233248837001', '233551086492', '233249737654'];
const WA_NAMES   = ['Main Line', 'Line 2', 'Line 3'];

// ===== UTILS =====
function uuid() { return Date.now().toString(36) + Math.random().toString(36).substr(2,9); }
function today() { return new Date().toISOString().split('T')[0]; }
function yesterday() {
  const d = new Date(); d.setDate(d.getDate()-1);
  return d.toISOString().split('T')[0];
}
function thisWeekStart() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}
function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-GH', { weekday:'short', year:'numeric', month:'short', day:'numeric' });
}
function formatNum(n)   { return (n||0).toLocaleString(); }
function formatMoney(n) { return 'GH₵ ' + parseFloat(n||0).toFixed(2); }

// ===== DATA LAYER =====
const DB = {
  KEY: 'nsupure_v1',
  load() {
    try { const r = localStorage.getItem(this.KEY); return r ? JSON.parse(r) : this.defaultData(); }
    catch { return this.defaultData(); }
  },
  save(data) { localStorage.setItem(this.KEY, JSON.stringify(data)); updateNavBadges(); },
  defaultData() { return { productions:[], loadings:[], customers:[], orders:[], debtors:[], lastBackup:null }; },
  get(key)         { return this.load()[key] || []; },
  add(key, item)   { const d=this.load(); d[key]=[item,...(d[key]||[])]; this.save(d); },
  update(key,id,upd){ const d=this.load(); d[key]=(d[key]||[]).map(i=>i.id===id?{...i,...upd}:i); this.save(d); },
  remove(key,id)   { const d=this.load(); d[key]=(d[key]||[]).filter(i=>i.id!==id); this.save(d); },
  setMeta(key,val) { const d=this.load(); d[key]=val; this.save(d); }
};

// ===== GLOBAL STOCK COMPUTATION =====
// Stock = totalProduced - totalLoadedOut - totalFulfilled order bags
function computeGlobalStock() {
  const produced  = DB.get('productions').reduce((s,p)=>s+(p.bags||0),0);
  const loaded    = DB.get('loadings').reduce((s,l)=>s+(l.bags||0),0);
  const fulfilled = DB.get('orders').filter(o=>o.status==='fulfilled')
                      .reduce((s,o)=>s+(o.fulfilledBags||o.bags||0),0);
  return Math.max(0, produced - loaded - fulfilled);
}

// ===== TOAST =====
let toastTimer;
function showToast(msg, type='') {
  clearTimeout(toastTimer);
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show ' + type;
  toastTimer = setTimeout(()=>t.classList.remove('show'), 3200);
}

// ===== MODAL =====
function openModal(id) { document.getElementById(id).classList.add('open'); document.body.style.overflow='hidden'; }
function closeModal(id){ document.getElementById(id).classList.remove('open'); document.body.style.overflow=''; }
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) { e.target.classList.remove('open'); document.body.style.overflow=''; }
});

// ===== NAVIGATION =====
let currentSection = 'dashboard';
function navigate(section) {
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('sec-'+section)?.classList.add('active');
  document.querySelector(`.nav-item[data-sec="${section}"]`)?.classList.add('active');
  currentSection = section;
  window.scrollTo(0,0);
  renderSection(section);
}
function renderSection(s) {
  switch(s) {
    case 'dashboard':  renderDashboard(); break;
    case 'production': renderProduction(); break;
    case 'loading':    renderLoading(); break;
    case 'orders':     renderOrders(); break;
    case 'finance':    renderFinance(); break;
  }
}
function updateNavBadges() {
  const pending = DB.get('orders').filter(o=>o.status==='pending').length;
  const badge = document.getElementById('orders-badge');
  if (badge) { badge.textContent=pending; badge.style.display=pending>0?'flex':'none'; }
  // Update header stock
  const stockEl = document.getElementById('header-stock');
  if (stockEl) stockEl.textContent = '📦 Stock: ' + formatNum(computeGlobalStock()) + ' bags';
}

// ===========================
// DATE FILTER QUICK BUTTONS (reusable)
// ===========================
function makeDateFilter(currentVal, changeFn, defaultToToday=false) {
  const tod  = today();
  const yest = yesterday();
  const wstt = thisWeekStart();
  const isAll  = currentVal === '';
  const isTod  = currentVal === tod;
  const isYest = currentVal === yest;
  const isWeek = !isAll && !isTod && !isYest && currentVal >= wstt;
  const isCust = !isAll && !isTod && !isYest && !isWeek;

  return `
    <div class="date-quick-bar">
      <button class="dq-btn${isAll?'  dq-active':''}" onclick="${changeFn}('')">All</button>
      <button class="dq-btn${isTod?' dq-active':''}" onclick="${changeFn}('${tod}')">Today</button>
      <button class="dq-btn${isYest?' dq-active':''}" onclick="${changeFn}('${yest}')">Yesterday</button>
      <button class="dq-btn${isWeek?' dq-active':''}" onclick="${changeFn}('${wstt}');document.getElementById('date-range-end')&&(document.getElementById('date-range-end').value='${tod}')">This Week</button>
    </div>
    <div class="filter-bar" style="margin-top:6px;">
      <span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">📅 From</span>
      <input type="date" class="form-input" id="df-start-${changeFn}" value="${currentVal}"
        onchange="${changeFn}(this.value)" style="flex:1;">
      ${currentVal ? `<button class="btn btn-ghost btn-sm" onclick="${changeFn}('')">✕ Clear</button>` : ''}
    </div>`;
}

// ===========================
// DASHBOARD
// ===========================
function renderDashboard() {
  const tod = today();
  const prods  = DB.get('productions').filter(p=>p.date===tod);
  const loads  = DB.get('loadings').filter(l=>l.date===tod);
  const orders = DB.get('orders');
  const debtors= DB.get('debtors');

  const todayProd  = prods.reduce((s,p)=>s+p.bags,0);
  const todayLoad  = loads.reduce((s,l)=>s+l.bags,0);
  const globalStock= computeGlobalStock();
  const pendingOrders = orders.filter(o=>o.status==='pending').length;
  const totalDebt  = debtors.filter(d=>!d.settled&&d.type==='owes_money').reduce((s,d)=>s+d.amount,0);

  const loadPct = todayProd>0 ? Math.min(100,Math.round(todayLoad/todayProd*100)) : 0;

  // Roll summary today
  const rollSummary = {};
  prods.forEach(p=>{rollSummary[p.roll]=(rollSummary[p.roll]||0)+p.bags;});
  const rollHtml = Object.keys(rollSummary).sort().map(r=>`
    <div class="summary-row">
      <span class="label">Roll ${r}</span>
      <span class="value">${formatNum(rollSummary[r])} bags</span>
    </div>`).join('');

  // Recent 5 orders
  const recentOrders = orders.slice(0,5);

  document.getElementById('sec-dashboard').innerHTML = `
    <div class="section-title"><span class="icon">🏠</span> Dashboard</div>

    <div class="stat-grid">
      <div class="stat-card blue">
        <div class="stat-value">${formatNum(todayProd)}</div>
        <div class="stat-label">Produced Today</div>
      </div>
      <div class="stat-card cyan">
        <div class="stat-value">${formatNum(todayLoad)}</div>
        <div class="stat-label">Loaded Today</div>
      </div>
      <div class="stat-card green">
        <div class="stat-value">${formatNum(globalStock)}</div>
        <div class="stat-label">Total In Stock</div>
      </div>
      <div class="stat-card orange">
        <div class="stat-value">${pendingOrders}</div>
        <div class="stat-label">Pending Orders</div>
      </div>
    </div>

    ${todayProd>0 ? `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:13px;color:var(--text-dim)">Today's Loading Progress</span>
        <span style="font-size:13px;font-weight:700;color:var(--cyan)">${loadPct}%</span>
      </div>
      <div class="progress-wrap"><div class="progress-bar" style="width:${loadPct}%"></div></div>
    </div>` : ''}

    ${Object.keys(rollSummary).length>0 ? `
    <div class="card">
      <div class="report-title">📦 Today's Production by Roll</div>
      <div class="summary-box">${rollHtml}
        <div class="summary-row total"><span class="label">Total</span><span class="value">${formatNum(todayProd)} bags</span></div>
      </div>
    </div>` : `
    <div class="card" style="text-align:center;padding:24px;">
      <div style="font-size:40px;margin-bottom:10px;">💧</div>
      <p style="color:var(--text-muted);font-size:14px;">No production recorded today.<br>Tap <b style="color:var(--blue-light)">Produce</b> to add.</p>
    </div>`}

    ${totalDebt>0 ? `
    <div class="card" style="border-color:rgba(255,82,82,0.3);">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:14px;color:var(--text-dim)">💸 Total Debt Owed to You</span>
        <span style="font-size:18px;font-weight:700;color:var(--danger)">${formatMoney(totalDebt)}</span>
      </div>
    </div>` : ''}

    ${recentOrders.length>0 ? `
    <div class="card">
      <div class="report-title">📋 Recent Orders</div>
      ${recentOrders.map(o=>`
        <div class="summary-row">
          <span class="label">${o.customerName}</span>
          <span class="badge badge-${o.status}" style="font-size:10px;">${o.status}</span>
          <span class="value" style="font-size:13px">${formatNum(o.bags)} bags</span>
        </div>`).join('')}
      <button class="btn btn-ghost btn-sm" onclick="navigate('orders')" style="margin-top:10px;width:100%;">View All Orders →</button>
    </div>` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px;">
      <button class="btn btn-primary" onclick="navigate('production')" style="font-size:13px;">➕ Add Production</button>
      <button class="btn btn-cyan" onclick="navigate('loading')" style="font-size:13px;">🚚 Load Truck</button>
    </div>
  `;
}

// ===========================
// PRODUCTION
// ===========================
let prodFilterDate = today();
function renderProduction(fd) {
  if (fd !== undefined) prodFilterDate = fd;
  const all   = DB.get('productions');
  const shown = prodFilterDate ? all.filter(p=>p.date===prodFilterDate) : all;
  const totalBags = shown.reduce((s,p)=>s+p.bags,0);

  document.getElementById('sec-production').innerHTML = `
    <div class="section-title"><span class="icon">🏭</span> Production</div>
    <button class="btn btn-primary" onclick="openModal('modal-prod')" style="margin-bottom:14px;">➕ Record Production</button>

    ${makeDateFilter(prodFilterDate,'renderProduction',true)}

    ${shown.length>0 ? `
    <div class="card summary-box" style="margin-top:10px;">
      <div class="summary-row total">
        <span class="label">Total Bags${prodFilterDate?' on '+formatDate(prodFilterDate):' (All Time)'}</span>
        <span class="value">${formatNum(totalBags)}</span>
      </div>
    </div>` : ''}

    <div id="prod-list" style="margin-top:10px;">
      ${shown.length===0 ? `
        <div class="empty-state"><div class="empty-icon">📦</div>
          <p>${prodFilterDate?'No records for this date.':'No production records yet.'}</p>
        </div>` :
      shown.map(p=>`
        <div class="list-item">
          <div class="list-item-header">
            <div>
              <span class="roll-badge roll-${Math.min(p.roll,5)}">R${p.roll}</span>
              <span class="list-item-title" style="margin-left:8px;">Roll ${p.roll}</span>
            </div>
            <span style="font-family:var(--font-main);font-size:20px;font-weight:700;color:var(--blue-light)">${formatNum(p.bags)}</span>
          </div>
          <div class="list-item-meta">
            <span>📅 ${formatDate(p.date)}</span>
            ${p.notes?`<span>📝 ${p.notes}</span>`:''}
          </div>
          <div class="list-item-actions">
            <button class="btn btn-danger btn-sm" onclick="deleteProd('${p.id}')">🗑 Delete</button>
          </div>
        </div>`).join('')}
    </div>`;
}

function submitProduction() {
  const roll  = parseInt(document.getElementById('p-roll').value);
  const bags  = parseInt(document.getElementById('p-bags').value);
  const date  = document.getElementById('p-date').value;
  const notes = document.getElementById('p-notes').value.trim();
  if (!roll||!bags||!date) return showToast('Fill in all required fields','error');
  if (bags<1)              return showToast('Bags must be at least 1','error');
  DB.add('productions',{id:uuid(),date,roll,bags,notes,createdAt:Date.now()});
  closeModal('modal-prod');
  document.getElementById('p-bags').value='';
  document.getElementById('p-notes').value='';
  showToast('✅ Production recorded!','success');
  if (currentSection==='production') renderProduction();
  if (currentSection==='dashboard')  renderDashboard();
}

function deleteProd(id) {
  if (confirm('Delete this production record?')) {
    DB.remove('productions',id);
    showToast('Deleted','error');
    renderProduction();
    if (currentSection==='dashboard') renderDashboard();
  }
}

// ===========================
// LOADING
// ===========================
let loadFilterDate = today();
function renderLoading(fd) {
  if (fd !== undefined) loadFilterDate = fd;
  const allLoads = DB.get('loadings');
  const allProds = DB.get('productions');
  const shown    = loadFilterDate ? allLoads.filter(l=>l.date===loadFilterDate) : allLoads;
  const prods    = loadFilterDate ? allProds.filter(p=>p.date===loadFilterDate) : allProds;

  const totalProd = prods.reduce((s,p)=>s+p.bags,0);
  const totalLoad = shown.reduce((s,l)=>s+l.bags,0);
  const remaining = Math.max(0, totalProd - totalLoad);
  const loadPct   = totalProd>0 ? Math.min(100,Math.round(totalLoad/totalProd*100)) : 0;

  document.getElementById('sec-loading').innerHTML = `
    <div class="section-title"><span class="icon">🚚</span> Loading</div>

    ${makeDateFilter(loadFilterDate,'renderLoading',true)}

    <div class="card summary-box" style="margin-top:10px;">
      <div class="summary-row">
        <span class="label">Produced${loadFilterDate?' ('+formatDate(loadFilterDate)+')':' (All)'}</span>
        <span class="value">${formatNum(totalProd)} bags</span>
      </div>
      <div class="summary-row">
        <span class="label">Loaded Out</span>
        <span class="value" style="color:var(--cyan)">${formatNum(totalLoad)} bags</span>
      </div>
      <div class="summary-row remain">
        <span class="label">Remaining</span>
        <span class="value">${formatNum(remaining)} bags</span>
      </div>
    </div>

    ${totalProd>0 ? `
    <div class="card" style="padding:12px 16px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
        <span style="font-size:12px;color:var(--text-dim)">Loading Progress</span>
        <span style="font-size:12px;font-weight:700;color:var(--cyan)">${loadPct}%</span>
      </div>
      <div class="progress-wrap"><div class="progress-bar" style="width:${loadPct}%"></div></div>
    </div>` : ''}

    <button class="btn btn-primary" onclick="openModal('modal-load')" style="margin:10px 0 14px;">➕ Record Loading</button>

    ${shown.length===0 ? `
      <div class="empty-state"><div class="empty-icon">🚚</div>
        <p>${loadFilterDate?'No loading records for this date.':'No loading records yet.'}</p>
      </div>` :
    shown.map(l=>`
      <div class="list-item">
        <div class="list-item-header">
          <div>
            <div class="list-item-title">🚚 ${l.vehicle}</div>
            ${l.destination?`<div class="list-item-sub">📍 ${l.destination}</div>`:''}
          </div>
          <span style="font-family:var(--font-main);font-size:20px;font-weight:700;color:var(--cyan)">${formatNum(l.bags)}</span>
        </div>
        <div class="list-item-meta">
          <span>📅 ${formatDate(l.date)}</span>
          ${l.notes?`<span>📝 ${l.notes}</span>`:''}
        </div>
        <div class="list-item-actions">
          <button class="btn btn-danger btn-sm" onclick="deleteLoad('${l.id}')">🗑 Delete</button>
        </div>
      </div>`).join('')}
  `;
}

function submitLoading() {
  const vehicle = document.getElementById('l-vehicle').value.trim();
  const bags    = parseInt(document.getElementById('l-bags').value);
  const date    = document.getElementById('l-date').value;
  const dest    = document.getElementById('l-dest').value.trim();
  const notes   = document.getElementById('l-notes').value.trim();
  if (!vehicle||!bags||!date) return showToast('Fill in all required fields','error');
  if (bags<1)                 return showToast('Bags must be at least 1','error');

  // Warn if exceeds available stock
  const stock = computeGlobalStock();
  if (bags > stock) {
    if (!confirm(`⚠️ Only ${stock} bags in stock, but loading ${bags}. Continue?`)) return;
  }

  DB.add('loadings',{id:uuid(),date,vehicle,bags,destination:dest,notes,createdAt:Date.now()});
  closeModal('modal-load');
  document.getElementById('l-bags').value='';
  document.getElementById('l-vehicle').value='';
  document.getElementById('l-dest').value='';
  document.getElementById('l-notes').value='';
  showToast(`✅ ${bags} bags loaded to ${vehicle}!`,'success');
  if (currentSection==='loading')   renderLoading();
  if (currentSection==='dashboard') renderDashboard();
}

function deleteLoad(id) {
  if (confirm('Delete this loading record?')) {
    DB.remove('loadings',id);
    showToast('Deleted','error');
    renderLoading();
  }
}

// ===========================
// ORDERS
// ===========================
let ordersTab = 'orders';
let orderFilterDate = '';

function renderOrders() {
  const orders    = DB.get('orders');
  const customers = DB.get('customers');
  if (ordersTab==='orders')    renderOrdersList(orders, customers);
  else                         renderCustomersList(customers);
}

function renderOrdersList(orders, customers) {
  const filterStatus = document.getElementById('ord-filter-status')?.value || '';
  const filterCust   = document.getElementById('ord-filter-cust')?.value?.toLowerCase() || '';
  let filtered = [...orders];
  if (orderFilterDate)   filtered = filtered.filter(o=>o.date===orderFilterDate);
  if (filterStatus)      filtered = filtered.filter(o=>o.status===filterStatus);
  if (filterCust)        filtered = filtered.filter(o=>o.customerName.toLowerCase().includes(filterCust));

  const pendingCount   = orders.filter(o=>o.status==='pending').length;
  const fulfilledCount = orders.filter(o=>o.status==='fulfilled').length;
  const globalStock    = computeGlobalStock();

  document.getElementById('sec-orders').innerHTML = `
    <div class="section-title"><span class="icon">📋</span> Orders & Customers</div>
    <div class="tabs">
      <button class="tab-btn active" onclick="ordersTab='orders';renderOrders()">📦 Orders</button>
      <button class="tab-btn"        onclick="ordersTab='customers';renderOrders()">👥 Customers</button>
    </div>

    <div class="stat-grid" style="margin-bottom:12px;">
      <div class="stat-card orange">
        <div class="stat-value">${pendingCount}</div>
        <div class="stat-label">Pending</div>
      </div>
      <div class="stat-card green">
        <div class="stat-value">${fulfilledCount}</div>
        <div class="stat-label">Fulfilled</div>
      </div>
    </div>

    <div class="stock-indicator ${globalStock<50?'stock-low':''}">
      📦 Available Stock: <strong>${formatNum(globalStock)} bags</strong>
    </div>

    ${makeDateFilter(orderFilterDate,'setOrderDateFilter')}

    <div style="display:flex;gap:8px;margin-top:8px;margin-bottom:12px;flex-wrap:wrap;">
      <input type="text" class="form-input" id="ord-filter-cust" placeholder="🔍 Search customer..."
        value="${filterCust}" oninput="renderOrders()" style="flex:1;min-width:0;">
      <select class="form-select" id="ord-filter-status" onchange="renderOrders()" style="width:130px;">
        <option value="">All Status</option>
        <option value="pending"   ${filterStatus==='pending'?'selected':''}>Pending</option>
        <option value="fulfilled" ${filterStatus==='fulfilled'?'selected':''}>Fulfilled</option>
      </select>
    </div>

    <button class="btn btn-primary" onclick="openOrderModal()" style="margin-bottom:14px;">
      ➕ Place New Order
    </button>

    ${filtered.length===0
      ? `<div class="empty-state"><div class="empty-icon">📋</div><p>No orders found.</p></div>`
      : filtered.map(o=>{
          const total   = o.bags*(o.pricePerBag||0);
          const balance = total - (o.amountPaid||0);
          return `
          <div class="list-item" style="${o.status==='fulfilled'?'opacity:0.75;':''}">
            <div class="list-item-header">
              <div>
                <div class="list-item-title">👤 ${o.customerName}</div>
                <div class="list-item-sub">${o.customerPhone||''}</div>
              </div>
              <span class="badge badge-${o.status}">${o.status}</span>
            </div>
            <div class="summary-box" style="margin:8px 0 0;padding:10px 12px;">
              <div class="summary-row"><span class="label">Bags Ordered</span><span class="value">${formatNum(o.bags)} bags</span></div>
              ${o.pricePerBag?`<div class="summary-row"><span class="label">Price/Bag</span><span class="value">${formatMoney(o.pricePerBag)}</span></div>`:''}
              ${o.pricePerBag?`<div class="summary-row"><span class="label">Total Amount</span><span class="value">${formatMoney(total)}</span></div>`:''}
              ${o.pricePerBag?`<div class="summary-row"><span class="label">Amount Paid</span><span class="value" style="color:var(--success)">${formatMoney(o.amountPaid||0)}</span></div>`:''}
              ${o.pricePerBag&&balance>0?`<div class="summary-row danger"><span class="label">Balance Owed</span><span class="value">${formatMoney(balance)}</span></div>`:''}
            </div>
            <div class="list-item-meta" style="margin-top:8px;">
              <span>📅 ${formatDate(o.date)}</span>
              ${o.notes?`<span>📝 ${o.notes}</span>`:''}
              ${o.status==='fulfilled'&&o.deliveredAt?`<span>✅ Fulfilled ${new Date(o.deliveredAt).toLocaleDateString('en-GH',{month:'short',day:'numeric'})}</span>`:''}
            </div>
            <div class="list-item-actions">
              ${o.status==='pending' ? `
                <button class="btn btn-success btn-sm" onclick="fulfillOrder('${o.id}')">✅ Mark Fulfilled</button>
                <button class="btn btn-warning btn-sm" onclick="editOrderPayment('${o.id}','${o.amountPaid||0}')">💰 Update Pay</button>` : ''}
              <button class="btn btn-danger btn-sm" onclick="deleteOrder('${o.id}')">🗑 Delete</button>
            </div>
          </div>`;
        }).join('')}
  `;
}

function setOrderDateFilter(val) {
  orderFilterDate = val;
  renderOrders();
}

function renderCustomersList(customers) {
  document.getElementById('sec-orders').innerHTML = `
    <div class="section-title"><span class="icon">📋</span> Orders & Customers</div>
    <div class="tabs">
      <button class="tab-btn"        onclick="ordersTab='orders';renderOrders()">📦 Orders</button>
      <button class="tab-btn active" onclick="ordersTab='customers';renderOrders()">👥 Customers</button>
    </div>

    <button class="btn btn-primary" onclick="openModal('modal-customer')" style="margin-bottom:14px;">
      ➕ Add Customer
    </button>

    <input type="text" class="form-input" id="cust-search-main" placeholder="🔍 Search customers..."
      oninput="filterMainCustomerList(this.value)" style="margin-bottom:12px;">

    <div id="main-cust-list">
      ${renderCustomerCards(customers)}
    </div>
  `;
}

function filterMainCustomerList(q) {
  const customers = DB.get('customers');
  const filtered  = q.trim() ? customers.filter(c=>
    c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone||'').includes(q)
  ) : customers;
  document.getElementById('main-cust-list').innerHTML = renderCustomerCards(filtered);
}

function renderCustomerCards(customers) {
  if (!customers.length) return `<div class="empty-state"><div class="empty-icon">👥</div><p>No customers found.</p></div>`;
  return customers.map(c=>{
    const custOrders = DB.get('orders').filter(o=>o.customerId===c.id);
    const pending    = custOrders.filter(o=>o.status==='pending').length;
    const totalBags  = custOrders.reduce((s,o)=>s+o.bags,0);
    return `
      <div class="list-item">
        <div class="list-item-header">
          <div>
            <div class="list-item-title">👤 ${c.name}</div>
            ${c.phone?`<div class="list-item-sub">📞 ${c.phone}</div>`:''}
          </div>
          <div style="text-align:right">
            ${pending>0?`<span class="badge badge-pending">${pending} pending</span>`:''}
          </div>
        </div>
        <div class="list-item-meta">
          <span>📦 ${formatNum(totalBags)} total bags</span>
          <span>📋 ${custOrders.length} orders</span>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-cyan btn-sm" onclick="quickOrder('${c.id}','${c.name.replace(/'/g,"\\'")}','${c.phone||''}')">📦 Order</button>
          <button class="btn btn-danger btn-sm" onclick="deleteCustomer('${c.id}')">🗑 Remove</button>
        </div>
      </div>`;
  }).join('');
}

// ===========================
// CUSTOMER SELECTION (MODAL ORDER)
// ===========================
let selectedCustomer = null; // { id, name, phone }

function openOrderModal() {
  selectedCustomer = null;
  document.getElementById('o-cust-search').value='';
  document.getElementById('o-bags').value='';
  document.getElementById('o-price').value='';
  document.getElementById('o-paid').value='';
  document.getElementById('o-notes').value='';
  document.getElementById('o-date').value=today();
  document.getElementById('selected-cust-display').innerHTML=
    '<span style="color:var(--text-muted);">No customer selected yet</span>';
  document.getElementById('cust-dropdown').innerHTML='';
  openModal('modal-order');
  // Pre-populate all customers on open
  filterCustomerDropdown('');
}

function filterCustomerDropdown(query) {
  const customers = DB.get('customers');
  const q = query.toLowerCase().trim();
  const filtered = q
    ? customers.filter(c=>c.name.toLowerCase().includes(q)||(c.phone||'').includes(q))
    : customers.slice(0,30); // show first 30 by default

  const dd = document.getElementById('cust-dropdown');
  if (!dd) return;

  if (filtered.length===0) {
    dd.innerHTML=`<div style="padding:12px;color:var(--text-muted);text-align:center;font-size:13px;">No customer found. <button onclick="openModal('modal-customer')" style="background:none;border:none;color:var(--blue-light);cursor:pointer;text-decoration:underline;">+ Add new</button></div>`;
    dd.classList.add('dd-open');
    return;
  }

  dd.innerHTML = filtered.map(c=>`
    <div class="cust-option" onclick="selectCustomer('${c.id}','${c.name.replace(/'/g,"\\'")}','${c.phone||''}')">
      <div class="cust-option-name">👤 ${c.name}</div>
      ${c.phone?`<div class="cust-option-phone">📞 ${c.phone}</div>`:''}
    </div>`).join('');
  dd.classList.add('dd-open');
}

function selectCustomer(id, name, phone) {
  selectedCustomer = {id, name, phone};
  document.getElementById('o-cust-search').value = name;
  document.getElementById('selected-cust-display').innerHTML=
    `<span style="color:var(--success);">✅ ${name}${phone?' · 📞'+phone:''}</span>`;
  document.getElementById('cust-dropdown').innerHTML='';
  document.getElementById('cust-dropdown').classList.remove('dd-open');
}

function submitCustomer() {
  const name  = document.getElementById('c-name').value.trim();
  const phone = document.getElementById('c-phone').value.trim();
  if (!name) return showToast('Customer name is required','error');
  DB.add('customers',{id:uuid(),name,phone,createdAt:Date.now()});
  closeModal('modal-customer');
  document.getElementById('c-name').value='';
  document.getElementById('c-phone').value='';
  showToast('✅ Customer added!','success');
  if (currentSection==='orders') renderOrders();
}

function deleteCustomer(id) {
  if (confirm('Remove this customer? Their orders will remain.')) {
    DB.remove('customers',id);
    showToast('Customer removed','error');
    renderOrders();
  }
}

function quickOrder(custId, name, phone) {
  ordersTab='orders';
  selectedCustomer={id:custId,name,phone};
  openModal('modal-order');
  setTimeout(()=>{
    document.getElementById('o-cust-search').value=name;
    document.getElementById('selected-cust-display').innerHTML=
      `<span style="color:var(--success);">✅ ${name}${phone?' · 📞'+phone:''}</span>`;
    document.getElementById('cust-dropdown').innerHTML='';
    document.getElementById('o-date').value=today();
    document.getElementById('o-bags').value='';
    document.getElementById('o-price').value='';
    document.getElementById('o-paid').value='';
  },80);
}

function submitOrder() {
  if (!selectedCustomer) return showToast('Please select a customer','error');
  const bags       = parseInt(document.getElementById('o-bags').value);
  const date       = document.getElementById('o-date').value;
  const pricePerBag= parseFloat(document.getElementById('o-price').value)||0;
  const amountPaid = parseFloat(document.getElementById('o-paid').value)||0;
  const notes      = document.getElementById('o-notes').value.trim();

  if (!bags||bags<1) return showToast('Enter number of bags','error');
  if (!date)         return showToast('Select a date','error');

  // Warn if stock is low
  const stock = computeGlobalStock();
  if (bags>stock) {
    if (!confirm(`⚠️ Only ${stock} bags in stock, but order needs ${bags}. Place anyway?`)) return;
  }

  DB.add('orders',{
    id:uuid(), customerId:selectedCustomer.id,
    customerName:selectedCustomer.name, customerPhone:selectedCustomer.phone||'',
    date, bags, pricePerBag, amountPaid,
    status:'pending', notes, createdAt:Date.now()
  });
  closeModal('modal-order');
  selectedCustomer=null;
  showToast(`✅ Order placed for ${document.getElementById('o-cust-search').value}!`,'success');
  renderOrders();
}

// ===========================
// FULFILL ORDER  → deducts stock
// ===========================
function fulfillOrder(id) {
  const order = DB.get('orders').find(o=>o.id===id);
  if (!order) return;

  const stock = computeGlobalStock();
  if (order.bags > stock) {
    if (!confirm(`⚠️ Only ${stock} bags available in stock, but this order needs ${order.bags} bags.\n\nFulfill anyway?`)) return;
  }

  DB.update('orders', id, {
    status: 'fulfilled',
    deliveredAt: Date.now(),
    fulfilledBags: order.bags   // used by computeGlobalStock()
  });

  const remaining = computeGlobalStock(); // re-compute after update
  showToast(`✅ Order fulfilled! ${order.bags} bags deducted. Stock now: ${formatNum(remaining)} bags`,'success');
  updateNavBadges();
  renderOrders();
  if (currentSection==='dashboard') renderDashboard();
}

function editOrderPayment(id, currentPaid) {
  const paid = prompt('Enter total amount paid (GH₵):', currentPaid);
  if (paid!==null && !isNaN(paid)) {
    DB.update('orders',id,{amountPaid:parseFloat(paid)});
    showToast('💰 Payment updated!','success');
    renderOrders();
  }
}

function deleteOrder(id) {
  if (confirm('Delete this order?')) {
    DB.remove('orders',id);
    showToast('Order deleted','error');
    renderOrders();
    updateNavBadges();
  }
}

// ===========================
// FINANCE
// ===========================
let financeTab = 'debtors';
function renderFinance() {
  if (financeTab==='debtors') renderDebtors();
  else                         renderReports();
}

function renderDebtors() {
  const debtors  = DB.get('debtors');
  const active   = debtors.filter(d=>!d.settled);
  const settled  = debtors.filter(d=>d.settled);
  const totalOwed   = active.filter(d=>d.type==='owes_money').reduce((s,d)=>s+d.amount,0);
  const totalCredit = active.filter(d=>d.type==='owes_water').reduce((s,d)=>s+(d.bags||0),0);

  document.getElementById('sec-finance').innerHTML = `
    <div class="section-title"><span class="icon">💸</span> Finance & Reports</div>
    <div class="tabs">
      <button class="tab-btn active" onclick="financeTab='debtors';renderFinance()">💸 Debtors</button>
      <button class="tab-btn"        onclick="financeTab='reports';renderFinance()">📊 Reports</button>
    </div>

    <div class="stat-grid" style="margin-bottom:14px;">
      <div class="stat-card blue">
        <div class="stat-value" style="color:var(--danger);font-size:20px">${formatMoney(totalOwed)}</div>
        <div class="stat-label">Owed to You</div>
      </div>
      <div class="stat-card cyan">
        <div class="stat-value">${totalCredit}</div>
        <div class="stat-label">Bags Owed Out</div>
      </div>
    </div>

    <button class="btn btn-primary" onclick="openModal('modal-debtor')" style="margin-bottom:14px;">
      ➕ Add Debtor / Credit
    </button>

    ${active.length===0
      ? `<div class="empty-state"><div class="empty-icon">🎉</div><p>No active debtors. All clear!</p></div>`
      : active.map(d=>`
        <div class="list-item" style="border-color:${d.type==='owes_money'?'rgba(255,82,82,0.3)':'rgba(255,179,0,0.3)'}">
          <div class="list-item-header">
            <div>
              <div class="list-item-title">👤 ${d.name}</div>
              ${d.phone?`<div class="list-item-sub">📞 ${d.phone}</div>`:''}
            </div>
            <span class="badge ${d.type==='owes_money'?'badge-owes':'badge-credit'}">
              ${d.type==='owes_money'?'Owes Money':'Owes Water'}
            </span>
          </div>
          <div class="summary-box" style="margin:8px 0 0;padding:10px 12px;">
            ${d.type==='owes_money'
              ? `<div class="summary-row danger"><span class="label">Amount Owed</span><span class="value">${formatMoney(d.amount)}</span></div>`
              : `<div class="summary-row"><span class="label">Bags Owed</span><span class="value" style="color:var(--warning)">${formatNum(d.bags)} bags</span></div>
                 ${d.amount?`<div class="summary-row"><span class="label">Prepaid Amount</span><span class="value" style="color:var(--success)">${formatMoney(d.amount)}</span></div>`:''}`}
            ${d.description?`<div class="summary-row"><span class="label">Note</span><span class="value" style="font-size:13px">${d.description}</span></div>`:''}
            <div class="summary-row"><span class="label">Date</span><span class="value" style="font-size:12px">${formatDate(d.date)}</span></div>
          </div>
          <div class="list-item-actions">
            <button class="btn btn-success btn-sm" onclick="settleDebtor('${d.id}')">✅ Mark Settled</button>
            <button class="btn btn-danger btn-sm"  onclick="deleteDebtor('${d.id}')">🗑 Delete</button>
          </div>
        </div>`).join('')}

    ${settled.length>0 ? `
      <div class="divider"></div>
      <div style="font-size:12px;color:var(--text-muted);text-align:center;margin-bottom:10px;">SETTLED (${settled.length})</div>
      ${settled.map(d=>`
        <div class="list-item" style="opacity:0.5">
          <div class="list-item-header">
            <div class="list-item-title">👤 ${d.name}</div>
            <span class="badge badge-settled">Settled</span>
          </div>
          <div class="list-item-meta">
            ${d.type==='owes_money'?formatMoney(d.amount):formatNum(d.bags)+' bags'}
            <span>|</span><span>${formatDate(d.date)}</span>
          </div>
          <div class="list-item-actions">
            <button class="btn btn-danger btn-sm" onclick="deleteDebtor('${d.id}')">🗑 Delete</button>
          </div>
        </div>`).join('')}` : ''}
  `;
}

function submitDebtor() {
  const name  = document.getElementById('d-name').value.trim();
  const phone = document.getElementById('d-phone').value.trim();
  const type  = document.getElementById('d-type').value;
  const amount= parseFloat(document.getElementById('d-amount').value)||0;
  const bags  = parseInt(document.getElementById('d-bags').value)||0;
  const desc  = document.getElementById('d-desc').value.trim();
  const date  = document.getElementById('d-date').value;
  if (!name||!date) return showToast('Name and date are required','error');
  if (type==='owes_money'&&!amount) return showToast('Enter the amount','error');
  if (type==='owes_water'&&!bags)   return showToast('Enter number of bags','error');
  DB.add('debtors',{id:uuid(),name,phone,type,amount,bags,description:desc,date,settled:false,createdAt:Date.now()});
  closeModal('modal-debtor');
  ['d-name','d-phone','d-amount','d-bags','d-desc'].forEach(id=>{ const el=document.getElementById(id); if(el)el.value=''; });
  showToast('✅ Debtor added!','success');
  renderFinance();
}

function settleDebtor(id) {
  if (confirm('Mark this as settled?')) {
    DB.update('debtors',id,{settled:true,settledAt:Date.now()});
    showToast('✅ Marked as settled!','success');
    renderFinance();
  }
}
function deleteDebtor(id) {
  if (confirm('Delete this record?')) {
    DB.remove('debtors',id); showToast('Deleted','error'); renderFinance();
  }
}
function toggleDebtorType() {
  const t = document.getElementById('d-type').value;
  document.getElementById('d-amount-wrap').style.display = t==='owes_water'?'none':'block';
  document.getElementById('d-bags-wrap').style.display   = t==='owes_water'?'block':'none';
}

// ===========================
// REPORTS
// ===========================
let reportDate = today();
function renderReports() {
  document.getElementById('sec-finance').innerHTML = `
    <div class="section-title"><span class="icon">💸</span> Finance & Reports</div>
    <div class="tabs">
      <button class="tab-btn" onclick="financeTab='debtors';renderFinance()">💸 Debtors</button>
      <button class="tab-btn active" onclick="financeTab='reports';renderFinance()">📊 Reports</button>
    </div>

    <div class="filter-bar" style="margin-bottom:14px;">
      <input type="date" class="form-input" id="report-date" value="${reportDate}"
        onchange="reportDate=this.value;renderReports()" style="flex:1;">
    </div>

    <div id="report-content">${buildReportCard(reportDate)}</div>

    <div style="margin-top:16px;">
      <div style="font-size:13px;font-weight:600;color:var(--text-dim);margin-bottom:8px;">📤 Share / Export</div>
      ${WA_NUMBERS.map((n,i)=>`
        <button class="btn btn-wa" onclick="sendWhatsApp('${n}','${reportDate}')">
          📱 WhatsApp ${WA_NAMES[i]}
        </button>`).join('')}
      <button class="btn btn-gmail" onclick="sendGmail(reportDate)">📧 Email Report</button>
      <button class="btn btn-ghost btn-primary" onclick="exportAllData()" style="margin-top:4px;">💾 Export JSON Backup</button>
      <button class="btn btn-danger btn-primary btn-sm" onclick="clearAllData()" style="margin-top:6px;width:100%;font-size:13px;">⚠️ Clear All Data</button>
    </div>
  `;
}

function buildReportCard(date) {
  const prods   = DB.get('productions').filter(p=>p.date===date);
  const loads   = DB.get('loadings').filter(l=>l.date===date);
  const orders  = DB.get('orders').filter(o=>o.date===date);
  const totalProd = prods.reduce((s,p)=>s+p.bags,0);
  const totalLoad = loads.reduce((s,l)=>s+l.bags,0);
  const remaining = Math.max(0,totalProd-totalLoad);
  const totalSales= orders.reduce((s,o)=>s+(o.bags*(o.pricePerBag||0)),0);
  const totalPaid = orders.reduce((s,o)=>s+(o.amountPaid||0),0);
  const globalStock=computeGlobalStock();

  const rollGroups={};
  prods.forEach(p=>{rollGroups[p.roll]=(rollGroups[p.roll]||0)+p.bags;});

  return `
    <div class="card" style="border-color:rgba(21,101,192,0.3)">
      <div class="report-title">📅 ${formatDate(date)}</div>

      <div style="font-size:12px;font-weight:700;color:var(--blue-light);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Production</div>
      <div class="summary-box">
        ${Object.keys(rollGroups).sort().map(r=>`
          <div class="summary-row"><span class="label">Roll ${r}</span><span class="value">${formatNum(rollGroups[r])} bags</span></div>
        `).join('')}
        <div class="summary-row total"><span class="label">Total Produced</span><span class="value">${formatNum(totalProd)}</span></div>
      </div>

      <div style="font-size:12px;font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:0.8px;margin:10px 0 6px;">Loading</div>
      <div class="summary-box">
        ${loads.map(l=>`<div class="summary-row"><span class="label">${l.vehicle}</span><span class="value">${formatNum(l.bags)} bags</span></div>`).join('')}
        <div class="summary-row"><span class="label">Total Loaded</span><span class="value">${formatNum(totalLoad)}</span></div>
        <div class="summary-row remain"><span class="label">Remaining (day)</span><span class="value">${formatNum(remaining)} bags</span></div>
      </div>

      <div style="font-size:12px;font-weight:700;color:var(--success);text-transform:uppercase;letter-spacing:0.8px;margin:10px 0 6px;">Global Stock</div>
      <div class="summary-box">
        <div class="summary-row total"><span class="label">Available Now</span><span class="value">${formatNum(globalStock)} bags</span></div>
      </div>

      ${orders.length>0 ? `
        <div style="font-size:12px;font-weight:700;color:var(--success);text-transform:uppercase;letter-spacing:0.8px;margin:10px 0 6px;">Orders</div>
        <div class="summary-box">
          ${orders.map(o=>`<div class="summary-row"><span class="label">${o.customerName}</span><span class="value">${formatNum(o.bags)} bags [${o.status}]</span></div>`).join('')}
          ${totalSales?`<div class="summary-row total"><span class="label">Total Sales</span><span class="value">${formatMoney(totalSales)}</span></div>`:''}
          ${totalPaid?`<div class="summary-row"><span class="label">Amount Paid</span><span class="value" style="color:var(--success)">${formatMoney(totalPaid)}</span></div>`:''}
        </div>` : ''}
    </div>`;
}

function buildReportText(date) {
  const prods  = DB.get('productions').filter(p=>p.date===date);
  const loads  = DB.get('loadings').filter(l=>l.date===date);
  const orders = DB.get('orders').filter(o=>o.date===date);
  const debtors= DB.get('debtors').filter(d=>!d.settled);
  const totalProd = prods.reduce((s,p)=>s+p.bags,0);
  const totalLoad = loads.reduce((s,l)=>s+l.bags,0);
  const remaining = Math.max(0,totalProd-totalLoad);
  const totalSales= orders.reduce((s,o)=>s+(o.bags*(o.pricePerBag||0)),0);
  const totalPaid = orders.reduce((s,o)=>s+(o.amountPaid||0),0);
  const globalStock=computeGlobalStock();
  const rollGroups={};
  prods.forEach(p=>{rollGroups[p.roll]=(rollGroups[p.roll]||0)+p.bags;});

  let txt=`💧 *NSUPURE WATER - DAILY REPORT*\n📅 Date: ${formatDate(date)}\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  txt+=`🏭 *PRODUCTION*\n`;
  Object.keys(rollGroups).sort().forEach(r=>{txt+=`  Roll ${r}: ${formatNum(rollGroups[r])} bags\n`;});
  txt+=`  *Total: ${formatNum(totalProd)} bags*\n\n`;
  txt+=`🚚 *LOADING*\n`;
  if (loads.length) loads.forEach(l=>{txt+=`  ${l.vehicle}: ${formatNum(l.bags)} bags\n`;});
  else txt+=`  No loadings\n`;
  txt+=`  *Total Loaded: ${formatNum(totalLoad)} bags*\n  *Remaining: ${formatNum(remaining)} bags*\n\n`;
  txt+=`📦 *GLOBAL STOCK NOW: ${formatNum(globalStock)} bags*\n\n`;
  if (orders.length) {
    txt+=`📋 *ORDERS*\n`;
    orders.forEach(o=>{txt+=`  ${o.customerName}: ${formatNum(o.bags)} bags [${o.status}]\n`;});
    if (totalSales) txt+=`  *Total Sales: ${formatMoney(totalSales)}*\n`;
    if (totalPaid)  txt+=`  *Paid: ${formatMoney(totalPaid)}*\n`;
    txt+='\n';
  }
  if (debtors.length) {
    txt+=`💸 *OUTSTANDING DEBTORS*\n`;
    debtors.slice(0,5).forEach(d=>{txt+=`  ${d.name}: ${d.type==='owes_money'?formatMoney(d.amount):formatNum(d.bags)+' bags'}\n`;});
    txt+='\n';
  }
  txt+=`━━━━━━━━━━━━━━━━━━━━\nGenerated by NSUPURE Manager\nAdumasa, Ashanti, Ghana 🇬🇭`;
  return txt;
}

function sendWhatsApp(number, date) {
  const url=`https://wa.me/${number}?text=${encodeURIComponent(buildReportText(date||today()))}`;
  window.open(url,'_blank');
  showToast('📱 Opening WhatsApp...','success');
}
function sendGmail(date) {
  const text=buildReportText(date||today());
  const subject=`NSUPURE Daily Report - ${date}`;
  window.location.href=`mailto:${BACKUP_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  showToast('📧 Opening Gmail...','success');
}
function exportAllData() {
  const data=DB.load();
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`nsupure-backup-${today()}.json`; a.click();
  URL.revokeObjectURL(url);
  showToast('💾 Data exported!','success');
}
function clearAllData() {
  if (confirm('⚠️ Clear ALL data? This cannot be undone!\n\nExport your data first.')) {
    if (confirm('Are you absolutely sure?')) {
      localStorage.removeItem(DB.KEY);
      showToast('Data cleared','error');
      renderSection(currentSection);
    }
  }
}

// ===========================
// SERVICE WORKER
// ===========================
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg=>{
      reg.addEventListener('updatefound',()=>{
        const nw=reg.installing;
        nw.addEventListener('statechange',()=>{
          if (nw.state==='installed'&&navigator.serviceWorker.controller)
            showToast('🔄 App updated! Refresh to apply.','success');
        });
      });
    }).catch(e=>console.log('SW reg failed:',e));
  }
}

// ===========================
// ONLINE STATUS
// ===========================
function handleOnlineStatus() {
  if (navigator.onLine) showToast('🌐 Online','success');
}
window.addEventListener('online', handleOnlineStatus);
window.addEventListener('offline', ()=>showToast('📵 Offline mode - Data saved locally',''));

// ===========================
// PRE-LOAD CUSTOMERS
// ===========================
function seedCustomers() {
  const existing = DB.get('customers');
  if (existing.length > 0) return;
  const defaults = [
  {id:uuid(),name:'30 Bags Adumasa',phone:'0553180935',createdAt:Date.now()},
  {id:uuid(),name:'Abawaa Adumasa Costomer',phone:'0542773752',createdAt:Date.now()},
  {id:uuid(),name:'Abenaa Costomer',phone:'0556696287',createdAt:Date.now()},
  {id:uuid(),name:'Abenaa Near Cocoa Seller',phone:'0599664859',createdAt:Date.now()},
  {id:uuid(),name:'Abene Near Cocoa House',phone:'0539799621',createdAt:Date.now()},
  {id:uuid(),name:'Ado Yaa Costomer Adumasa',phone:'0553987580',createdAt:Date.now()},
  {id:uuid(),name:'Adum Costomer 2 Near Chuch. Madam Marcy',phone:'0542304600',createdAt:Date.now()},
  {id:uuid(),name:'Aduma 1 Water Customa',phone:'0532441008',createdAt:Date.now()},
  {id:uuid(),name:'Adumasa Costomer Son Or Daughter',phone:'0550376866',createdAt:Date.now()},
  {id:uuid(),name:'Adumasa St Sebatiaans SHS',phone:'0546009495',createdAt:Date.now()},
  {id:uuid(),name:'Adumasas Store AJua',phone:'0543809608',createdAt:Date.now()},
  {id:uuid(),name:'Advertising Mohaaba Print & Advertising',phone:'0244907853',createdAt:Date.now()},
  {id:uuid(),name:'Ageness Costormer Adumasa',phone:'0243012332',createdAt:Date.now()},
  {id:uuid(),name:'Agieness Adu Costomer',phone:'0549925435',createdAt:Date.now()},
  {id:uuid(),name:'Agya Poku Adumassa Costomer',phone:'0247273336',createdAt:Date.now()},
  {id:uuid(),name:'Akoss Costomer Sakora Pack',phone:'0599106598',createdAt:Date.now()},
  {id:uuid(),name:'Akoss Nearby Chairman Costomer Adumasa',phone:'0543638138',createdAt:Date.now()},
  {id:uuid(),name:'Akua Costomer Adumasa',phone:'0548007411',createdAt:Date.now()},
  {id:uuid(),name:'Akuaaa Costomer',phone:'0244223337',createdAt:Date.now()},
  {id:uuid(),name:'Alabimama Costomer Adumasa',phone:'0555005704',createdAt:Date.now()},
  {id:uuid(),name:'Alabu Mom',phone:'0558092493',createdAt:Date.now()},
  {id:uuid(),name:'Ama Nyamekye Costomer Adumasa',phone:'0538563938',createdAt:Date.now()},
  {id:uuid(),name:'Amaria ZONGO KOKO WU',phone:'0591995203',createdAt:Date.now()},
  {id:uuid(),name:'Ameyaw Fitter',phone:'0552341412',createdAt:Date.now()},
  {id:uuid(),name:'Amoanimaa Adumasa Costomer',phone:'0543203275',createdAt:Date.now()},
  {id:uuid(),name:'Antwen Adumasa Danile',phone:'0556920050',createdAt:Date.now()},
  {id:uuid(),name:'Arron Adumasa Capinter',phone:'0550025949',createdAt:Date.now()},
  {id:uuid(),name:'Asase Costomer Adumasa',phone:'0242737505',createdAt:Date.now()},
  {id:uuid(),name:'Ashantuaa Near Washbay Adumasa Costomer',phone:'0544647982',createdAt:Date.now()},
  {id:uuid(),name:'Atta Junction',phone:'0242514245',createdAt:Date.now()},
  {id:uuid(),name:'Aunti Afiayim Costomer Adumasa',phone:'0248545113',createdAt:Date.now()},
  {id:uuid(),name:'Aunti Gina Or Auntie Ama Adumasa Costomer',phone:'0541670221',createdAt:Date.now()},
  {id:uuid(),name:'Auntie Zienabu Costomer Adu',phone:'0537868014',createdAt:Date.now()},
  {id:uuid(),name:'Autie Boakyewaa Cement Seller',phone:'0246631564',createdAt:Date.now()},
  {id:uuid(),name:'Autie Zenabu Adumasa',phone:'0245291463',createdAt:Date.now()},
  {id:uuid(),name:'Awudu Pragia Aboabo',phone:'0549329546',createdAt:Date.now()},
  {id:uuid(),name:'Bedsheet Seller',phone:'0538630222',createdAt:Date.now()},
  {id:uuid(),name:'Bedsheet Seller Costomer Adumasa',phone:'0540508511',createdAt:Date.now()},
  {id:uuid(),name:'Bismark ADUMASA SHS TK',phone:'0241381297',createdAt:Date.now()},
  {id:uuid(),name:'Bra Joe Costomer Adumasa',phone:'0547876263',createdAt:Date.now()},
  {id:uuid(),name:'Campany Manager Akua Adumasa Costomer',phone:'0548415971',createdAt:Date.now()},
  {id:uuid(),name:'Chiness Shop For',phone:'0546644678',createdAt:Date.now()},
  {id:uuid(),name:'Costomer Adu',phone:'0208218284',createdAt:Date.now()},
  {id:uuid(),name:'Costomer Adumasa',phone:'0544799719',createdAt:Date.now()},
  {id:uuid(),name:'Costomer Adumasa By One Blow Sis Ama',phone:'0538956858',createdAt:Date.now()},
  {id:uuid(),name:'Costomer Adumasa Near Cement Seller',phone:'0245649372',createdAt:Date.now()},
  {id:uuid(),name:'Costomer Sister Peace Adumasa',phone:'0543266368',createdAt:Date.now()},
  {id:uuid(),name:'Diana Kena',phone:'0535781402',createdAt:Date.now()},
  {id:uuid(),name:'Don Berimah Adumasa School',phone:'0246759495',createdAt:Date.now()},
  {id:uuid(),name:'Dora Adumasa Costomer DA School',phone:'0246212979',createdAt:Date.now()},
  {id:uuid(),name:'Erik Machine Ower Bomfa',phone:'0248730828',createdAt:Date.now()},
  {id:uuid(),name:'Esther Adumasa Fish Saller Costomer',phone:'0240254288',createdAt:Date.now()},
  {id:uuid(),name:'Esther Frimpomaa Costomer Adumasa',phone:'0245508116',createdAt:Date.now()},
  {id:uuid(),name:'Felisher Kisiwaa Truck House',phone:'0534540771',createdAt:Date.now()},
  {id:uuid(),name:'Flowrence Adumasa GUTHOUSE COSTOMER',phone:'0545298271',createdAt:Date.now()},
  {id:uuid(),name:'Gam Abrafi Magnet Costomer Adumasa',phone:'0543970330',createdAt:Date.now()},
  {id:uuid(),name:'Helper To Get Costomers',phone:'0552312468',createdAt:Date.now()},
  {id:uuid(),name:'Jenet Kro Dadamu Costomer',phone:'0256245196',createdAt:Date.now()},
  {id:uuid(),name:'JO O J Adumasa Costomer',phone:'0544799750',createdAt:Date.now()},
  {id:uuid(),name:'Killer Adumasa',phone:'0547275325',createdAt:Date.now()},
  {id:uuid(),name:'Kofi Ahiene Costomer Adumasa',phone:'0544793900',createdAt:Date.now()},
  {id:uuid(),name:'Kofi Coworker Adumasa',phone:'0551086492',createdAt:Date.now()},
  {id:uuid(),name:'Kofi Ne Ama Cement Seller Shop',phone:'0558378909',createdAt:Date.now()},
  {id:uuid(),name:'Konogo Odumase SHS',phone:'0202475741',createdAt:Date.now()},
  {id:uuid(),name:'Kwabi Conet To Land',phone:'0554033353',createdAt:Date.now()},
  {id:uuid(),name:'Kwame Thomas',phone:'0543429983',createdAt:Date.now()},
  {id:uuid(),name:'Lady Nearby Sakora Pack',phone:'0249130083',createdAt:Date.now()},
  {id:uuid(),name:'Maa Abrafie Daughter Costomer Afia',phone:'0553020047',createdAt:Date.now()},
  {id:uuid(),name:'Maa DORIS ADUMASA Costomer',phone:'0551278020',createdAt:Date.now()},
  {id:uuid(),name:'Maa Salina Costomer Adumasa',phone:'0530928835',createdAt:Date.now()},
  {id:uuid(),name:'Maa Tawia Adumasa Nearby Costomer',phone:'0553022144',createdAt:Date.now()},
  {id:uuid(),name:'Maakua Owiye',phone:'0543892494',createdAt:Date.now()},
  {id:uuid(),name:'Madam Abena Adumasa Costomer',phone:'0541471622',createdAt:Date.now()},
  {id:uuid(),name:'Madam Abena Fowaa',phone:'0248627861',createdAt:Date.now()},
  {id:uuid(),name:'Madam Abrafie Adumasa Costomer',phone:'0246285624',createdAt:Date.now()},
  {id:uuid(),name:'Madam Achiamaa Adumasa Market',phone:'0555005830',createdAt:Date.now()},
  {id:uuid(),name:'Madam Ama Frimpomaa',phone:'0597523327',createdAt:Date.now()},
  {id:uuid(),name:'Madam Danna MA Pack Adumasa',phone:'0597592018',createdAt:Date.now()},
  {id:uuid(),name:'Madam Doris Adumasa Costomar',phone:'0532388305',createdAt:Date.now()},
  {id:uuid(),name:'Madam Ellah Adumasa Costomer',phone:'0552184202',createdAt:Date.now()},
  {id:uuid(),name:'Madam Esther Costomer',phone:'0542714555',createdAt:Date.now()},
  {id:uuid(),name:'Madam Genet',phone:'0596413575',createdAt:Date.now()},
  {id:uuid(),name:'Madam Jenet Adumasa Costomer',phone:'0534643453',createdAt:Date.now()},
  {id:uuid(),name:'Madam Joyce Adumasa Costomer',phone:'0592807811',createdAt:Date.now()},
  {id:uuid(),name:'Madam Kety Adumasa Costomer',phone:'0555691156',createdAt:Date.now()},
  {id:uuid(),name:'Madam Linder Adumasa Costomer',phone:'0549045509',createdAt:Date.now()},
  {id:uuid(),name:'Madam Olivia Costomer Adumasa',phone:'0555589677',createdAt:Date.now()},
  {id:uuid(),name:'Madam Ross Adumasa Costomer',phone:'0243243183',createdAt:Date.now()},
  {id:uuid(),name:'Magazine Puler',phone:'0246481365',createdAt:Date.now()},
  {id:uuid(),name:'Mallam Sulley Adumasa',phone:'0245992317',createdAt:Date.now()},
  {id:uuid(),name:'Mame Kunadu Adumasa Costomer',phone:'0536810809',createdAt:Date.now()},
  {id:uuid(),name:'Mame Naba House Costomer Adumasa',phone:'0599140144',createdAt:Date.now()},
  {id:uuid(),name:'Mary Kenner Costomer',phone:'0549404560',createdAt:Date.now()},
  {id:uuid(),name:'Master Alidu Bonfa Junction',phone:'0547833051',createdAt:Date.now()},
  {id:uuid(),name:'Matter Costomer Adumasa',phone:'0533583968',createdAt:Date.now()},
  {id:uuid(),name:'Matter DA School Adumasa',phone:'0545832643',createdAt:Date.now()},
  {id:uuid(),name:'Mebel Sofo Mama Ba Adumasa Costomer',phone:'0553933974',createdAt:Date.now()},
  {id:uuid(),name:'Miness Junction Adumasa Costomer Lizbath',phone:'0595937937',createdAt:Date.now()},
  {id:uuid(),name:'Mo Mary Adumasa Costomer',phone:'0257228573',createdAt:Date.now()},
  {id:uuid(),name:'Mohaaba Print & Advertising',phone:'0242645533',createdAt:Date.now()},
  {id:uuid(),name:'Mr AHIEN Adumasa',phone:'0245809587',createdAt:Date.now()},
  {id:uuid(),name:'Mr Antwen Adumas Shop Or Continer',phone:'0545586578',createdAt:Date.now()},
  {id:uuid(),name:'Mr BOATENG Land C',phone:'0596818173',createdAt:Date.now()},
  {id:uuid(),name:'Mr Geoge Metodis Chuch Adumasa Costomer',phone:'0548809611',createdAt:Date.now()},
  {id:uuid(),name:'Nana Adumasa Costomer Shop Roadside',phone:'0599687877',createdAt:Date.now()},
  {id:uuid(),name:'Nana ahenema',phone:'0266535566',createdAt:Date.now()},
  {id:uuid(),name:'Nana Ama Adumasa Costomer',phone:'0248231640',createdAt:Date.now()},
  {id:uuid(),name:'Nana Juanction Adumasa',phone:'0242302009',createdAt:Date.now()},
  {id:uuid(),name:'Nana Nearby Shop',phone:'0547428625',createdAt:Date.now()},
  {id:uuid(),name:'Nikanika Adumasa Chicken Food Supply',phone:'0533653135',createdAt:Date.now()},
  {id:uuid(),name:'Nuhu Fitter',phone:'0247767180',createdAt:Date.now()},
  {id:uuid(),name:'Nyamekye Adumasa Work Needed',phone:'0533197293',createdAt:Date.now()},
  {id:uuid(),name:'Odo Yaa Mum',phone:'0532807382',createdAt:Date.now()},
  {id:uuid(),name:'Okocha',phone:'0247673272',createdAt:Date.now()},
  {id:uuid(),name:'Papi Kwajo Family',phone:'0540833268',createdAt:Date.now()},
  {id:uuid(),name:"Paul Kwabena St Catholic Basic Shool",phone:'0247702039',createdAt:Date.now()},
  {id:uuid(),name:'Peace Shop Adumasa',phone:'0534513833',createdAt:Date.now()},
  {id:uuid(),name:'Peminase Clasmate Nana Yaw',phone:'0541505265',createdAt:Date.now()},
  {id:uuid(),name:'Polegye Saller Kenner Adumasa',phone:'0546903332',createdAt:Date.now()},
  {id:uuid(),name:'R GEE',phone:'0245831453',createdAt:Date.now()},
  {id:uuid(),name:'Regina Kumawu',phone:'0247093744',createdAt:Date.now()},
  {id:uuid(),name:'Salam Pasport',phone:'0260897218',createdAt:Date.now()},
  {id:uuid(),name:'Sarmiyer',phone:'0244663132',createdAt:Date.now()},
  {id:uuid(),name:'Secondry School Adumasa Costomer',phone:'0544934733',createdAt:Date.now()},
  {id:uuid(),name:'Sister Adwoa Boatiemaa',phone:'0552873991',createdAt:Date.now()},
  {id:uuid(),name:'Sister Akoss Marcy Adumasa Costomer',phone:'0531187958',createdAt:Date.now()},
  {id:uuid(),name:'Sister Akoss Store Adumasa Costomer',phone:'0542275149',createdAt:Date.now()},
  {id:uuid(),name:'Sister Karima',phone:'0232297679',createdAt:Date.now()},
  {id:uuid(),name:'Sister Vero Costomer Adumasa',phone:'0548205871',createdAt:Date.now()},
  {id:uuid(),name:'Sofomaame',phone:'0247001394',createdAt:Date.now()},
  {id:uuid(),name:"St Mary's Girls Senior High School",phone:'0244875214',createdAt:Date.now()},
  {id:uuid(),name:'St Sevastian Edwade',phone:'0246963716',createdAt:Date.now()},
  {id:uuid(),name:'Velo Eikom Adumasa',phone:'0546340153',createdAt:Date.now()},
  {id:uuid(),name:'Yaw Show',phone:'0594378804',createdAt:Date.now()}
  ];
  const data = DB.load();
  data.customers = defaults;
  DB.save(data);
}

// ===========================
// INIT
// ===========================
document.addEventListener('DOMContentLoaded', ()=>{
  ['p-date','l-date','o-date','d-date'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value=today();
  });

  const now = new Date();
  document.getElementById('header-day').textContent    = now.toLocaleDateString('en-GH',{weekday:'long'});
  document.getElementById('header-date').textContent   = now.toLocaleDateString('en-GH',{month:'short',day:'numeric',year:'numeric'});
  document.getElementById('header-stock').textContent  = '📦 Stock: loading...';

  seedCustomers();
  registerSW();
  updateNavBadges();
  navigate('dashboard');
  handleOnlineStatus();
});
