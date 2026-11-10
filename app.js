/* Controle de Abastecimento - PWA Grupo GPS | Frontend 1.1.1 */
(() => {
  'use strict';

  const CFG = window.APP_CONFIG || { API_URL: '', VERSION: '1.1.1' };
  const $ = (id) => document.getElementById(id);
  const FUEL_TYPES = ['Gasolina', 'Gasolina aditivada', 'Etanol'];
  const DB_NAME = 'GPSAbastecimentoDB';
  const DB_VERSION = 2;
  let swRegistration = null;
  let applyingAppUpdate = false;
  let checkingAppUpdate = false;
  const state = { db: null, user: null, token: null, view: 'dashboard', vehicles: [], records: [], users: [], cards: [], cardMovements: [], draftTimer: null, launchActive: false, mobileMenu: false, syncing: false };

  class LocalDB {
    constructor() { this.db = null; }
    async open() {
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const store of ['abastecimentos', 'veiculos', 'usuarios', 'cartoes', 'movimentacoesCartoes', 'outbox', 'session', 'draft', 'meta']) {
            if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('Não foi possível abrir o banco local.'));
      });
      return this;
    }
    tx(store, mode, fn) {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(store, mode);
        const request = fn(transaction.objectStore(store));
        let result;
        let settled = false;
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => { if (!settled) { settled = true; reject(request.error); } };
        transaction.oncomplete = () => { if (!settled) { settled = true; resolve(result); } };
        transaction.onerror = () => { if (!settled) { settled = true; reject(transaction.error || new Error('Falha na operação local.')); } };
        transaction.onabort = () => { if (!settled) { settled = true; reject(transaction.error || new Error('Falha na gravação local.')); } };
      });
    }
    put(store, value) { return this.tx(store, 'readwrite', s => s.put(value)); }
    get(store, id) { return this.tx(store, 'readonly', s => s.get(id)); }
    all(store) { return this.tx(store, 'readonly', s => s.getAll()); }
    del(store, id) { return this.tx(store, 'readwrite', s => s.delete(id)); }
    clear(store) { return this.tx(store, 'readwrite', s => s.clear()); }
  }

  const fmtMoney = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtNumber = (n, digits = 1) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const fmtDate = v => v ? new Date(v).toLocaleDateString('pt-BR') : '—';
  const fmtDateTime = v => v ? new Date(v).toLocaleString('pt-BR') : '—';
  const uuid = () => (crypto && crypto.randomUUID) ? crypto.randomUUID() : `ab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
  const plateFmt = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  const isOnline = () => navigator.onLine;
  const pendingCount = async () => (await state.db.all('outbox')).length;

  function toast(message, type = 'info', duration = 3600) {
    const node = document.createElement('div');
    node.className = `toast ${type === 'success' ? 'success' : type === 'warning' ? 'warning' : type === 'error' ? 'error' : ''}`;
    node.textContent = message;
    $('toastRegion').appendChild(node);
    setTimeout(() => node.remove(), duration);
  }
  function showAppUpdateAvailable() {
    const banner = $('updateBanner');
    if (!banner) return;
    banner.classList.remove('hidden');
    const checkButton = $('checkUpdateBtn');
    if (checkButton) checkButton.disabled = false;
  }

  function watchInstallingWorker(registration) {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        showAppUpdateAvailable();
      }
    });
  }

  async function registerAppServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      const button = $('checkUpdateBtn');
      if (button) button.disabled = true;
      return;
    }
    try {
      swRegistration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      if (swRegistration.waiting && navigator.serviceWorker.controller) showAppUpdateAvailable();
      watchInstallingWorker(swRegistration);
      swRegistration.addEventListener('updatefound', () => watchInstallingWorker(swRegistration));
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (applyingAppUpdate) window.location.reload();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && swRegistration) {
          swRegistration.update().catch(() => {});
        }
      });
      // Check once on startup as well; the manual button remains available at all times.
      swRegistration.update().catch(() => {});
    } catch (err) {
      console.warn('Não foi possível registrar o Service Worker:', err);
    }
  }

  async function checkForAppUpdate() {
    const button = $('checkUpdateBtn');
    if (checkingAppUpdate) return;
    if (!('serviceWorker' in navigator)) {
      toast('Este navegador não oferece suporte à atualização do aplicativo.', 'warning');
      return;
    }
    checkingAppUpdate = true;
    if (button) { button.disabled = true; button.innerHTML = '↻ <span>Verificando...</span>'; }
    try {
      if (!swRegistration) swRegistration = await navigator.serviceWorker.getRegistration('./');
      if (!swRegistration) swRegistration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      await swRegistration.update();
      if (swRegistration.waiting && navigator.serviceWorker.controller) {
        showAppUpdateAvailable();
        toast('Nova versão disponível. Toque em “Atualizar agora” para aplicar.', 'success');
      } else if (swRegistration.installing) {
        watchInstallingWorker(swRegistration);
        toast('Nova versão encontrada. O download está sendo preparado; o aviso aparecerá quando estiver pronto.', 'info', 5000);
      } else {
        toast('Seu aplicativo já está atualizado.', 'success');
      }
    } catch (err) {
      toast('Não foi possível verificar a versão. Confira sua conexão e tente novamente.', 'error', 5000);
      console.warn(err);
    } finally {
      checkingAppUpdate = false;
      if (button) { button.disabled = false; button.innerHTML = '↻ <span>Verificar versão</span>'; }
    }
  }

  async function applyAppUpdate() {
    const waiting = swRegistration && swRegistration.waiting;
    if (!waiting) {
      toast('Não há atualização pronta para instalar. Use “Verificar versão” novamente.', 'warning');
      return;
    }
    const unsynced = await pendingCount().catch(() => 0);
    const message = unsynced > 0
      ? `Há ${unsynced} abastecimento(s) aguardando sincronização. Os registros e fotos salvos no aparelho ficam preservados durante a atualização. Aplicar a nova versão agora?`
      : 'O aplicativo será atualizado e recarregado. Continuar?';
    if (!window.confirm(message)) return;
    applyingAppUpdate = true;
    waiting.postMessage({ type: 'GPS_SKIP_WAITING' });
  }

  function loading(show, message = 'Processando...') {
    $('loadingText').textContent = message;
    $('loadingLayer').classList.toggle('hidden', !show);
  }
  function saveSession(session) { return state.db.put('session', { id: 'current', ...session }); }
  async function getCachedSession() { return state.db.get('session', 'current'); }

  const pendingApiCalls = new Map();
  let apiFrame = null;
  function ensureApiFrame() {
    if (apiFrame && apiFrame.isConnected) return apiFrame;
    apiFrame = document.createElement('iframe');
    apiFrame.name = 'gpsAppsScriptResponseFrame';
    apiFrame.title = 'Canal seguro de comunicação com o backend';
    apiFrame.style.cssText = 'position:absolute;width:1px;height:1px;left:-10000px;top:-10000px;border:0;';
    document.body.appendChild(apiFrame);
    return apiFrame;
  }
  window.addEventListener('message', event => {
    if (!event.origin || !(event.origin.includes('googleusercontent.com') || event.origin === 'https://script.google.com')) return;
    const message = event.data;
    if (!message || message.gpsAppResponse !== true || !message.requestId) return;
    const pending = pendingApiCalls.get(message.requestId);
    if (!pending) return;
    pendingApiCalls.delete(message.requestId);
    clearTimeout(pending.timeout);
    pending.form.remove();
    if (message.success) pending.resolve(message.data);
    else pending.reject(new Error(message.message || 'O servidor não confirmou a operação.'));
  });
  async function api(action, data = {}) {
    if (!CFG.API_URL) throw new Error('Backend não configurado. Siga o arquivo LEIA-ME para publicar o Apps Script e preencher config.js.');
    const requestId = uuid();
    const frame = ensureApiFrame();
    const payload = { action, token: state.token || '', requestId, ...data };
    return new Promise((resolve, reject) => {
      const form = document.createElement('form');
      form.method = 'POST'; form.action = CFG.API_URL; form.target = frame.name;
      form.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = 'payload'; input.value = JSON.stringify(payload);
      form.appendChild(input); document.body.appendChild(form);
      const timeout = setTimeout(() => {
        pendingApiCalls.delete(requestId); form.remove();
        reject(new Error('Tempo limite excedido ao comunicar com o Google Apps Script. Verifique a URL publicada e a conexão.'));
      }, 60000);
      pendingApiCalls.set(requestId, { resolve, reject, timeout, form });
      try { form.submit(); }
      catch (err) { clearTimeout(timeout); pendingApiCalls.delete(requestId); form.remove(); reject(err); }
    });
  }

  async function loadLocalData() {
    const [vehicles, records, users, cards, cardMovements] = await Promise.all([
      state.db.all('veiculos'), state.db.all('abastecimentos'), state.db.all('usuarios'),
      state.db.all('cartoes'), state.db.all('movimentacoesCartoes')
    ]);
    state.vehicles = vehicles;
    state.records = records;
    state.users = users;
    state.cards = cards;
    state.cardMovements = cardMovements;
    updateSyncStatus();
  }

  async function mergeRemoteData(data) {
    const outbox = await state.db.all('outbox');
    const pendingIds = new Set(outbox.map(x => x.id));
    if (Array.isArray(data.veiculos)) {
      const receivedVehicleIds = new Set(data.veiculos.map(v => String(v.id)));
      for (const v of data.veiculos) await state.db.put('veiculos', v);
      // Operação recebe somente veículos ativos; marque os antigos ausentes como inativos no cache local.
      if (state.user?.role !== 'ADMIN') {
        const cachedVehicles = await state.db.all('veiculos');
        for (const v of cachedVehicles) {
          if (!receivedVehicleIds.has(String(v.id)) && v.ativo !== false) await state.db.put('veiculos', { ...v, ativo: false });
        }
      }
    }
    if (Array.isArray(data.usuarios)) {
      for (const u of data.usuarios) await state.db.put('usuarios', u);
    }
    if (Array.isArray(data.cartoes)) {
      const receivedCardIds = new Set(data.cartoes.map(c => String(c.id)));
      for (const card of data.cartoes) await state.db.put('cartoes', card);
      // Operação recebe apenas cartões ativos: os demais ficam indisponíveis no cache local.
      if (state.user?.role !== 'ADMIN') {
        const cachedCards = await state.db.all('cartoes');
        for (const card of cachedCards) {
          if (!receivedCardIds.has(String(card.id)) && card.ativo !== false) await state.db.put('cartoes', { ...card, ativo: false });
        }
        await state.db.clear('movimentacoesCartoes');
      }
    }
    if (Array.isArray(data.movimentacoesCartoes) && state.user?.role === 'ADMIN') {
      await state.db.clear('movimentacoesCartoes');
      for (const movement of data.movimentacoesCartoes) await state.db.put('movimentacoesCartoes', movement);
    }
    if (Array.isArray(data.abastecimentos)) {
      for (const r of data.abastecimentos) {
        if (!pendingIds.has(r.id)) await state.db.put('abastecimentos', { ...r, syncStatus: 'SYNCED' });
      }
    }
    await loadLocalData();
  }

  async function syncAll(showMessage = true) {
    if (!isOnline()) { updateSyncStatus(); if (showMessage) toast('Sem conexão. Os dados continuam salvos no aparelho.', 'warning'); return; }
    if (state.syncing) return;
    if (!state.token) return;
    state.syncing = true;
    try {
      loading(true, 'Sincronizando dados...');
      const data = await api('sync');
      await mergeRemoteData(data);
      const outbox = await state.db.all('outbox');
      let sent = 0;
      let failed = 0;
      for (const item of outbox) {
        try {
          const saved = await api('saveFuel', { record: item.record });
          const serverRecord = { ...saved.record, syncStatus: 'SYNCED' };
          delete serverRecord.fotoOdometroData;
          delete serverRecord.fotoNotaData;
          await state.db.put('abastecimentos', serverRecord);
          await state.db.del('outbox', item.id);
          sent++;
        } catch (err) {
          failed++;
          await state.db.put('outbox', { ...item, erro: err.message, ultimaTentativa: new Date().toISOString() });
          const localRecord = await state.db.get('abastecimentos', item.id);
          if (localRecord) await state.db.put('abastecimentos', { ...localRecord, syncStatus: 'REVIEW', syncError: err.message });
        }
      }
      const fresh = await api('sync');
      await mergeRemoteData(fresh);
      if (showMessage) {
        if (failed) toast(`${sent} registro(s) sincronizado(s). ${failed} precisa(m) de revisão.`, 'warning', 5500);
        else toast(sent ? `${sent} registro(s) enviado(s) e dados atualizados.` : 'Dados atualizados. Nenhum registro pendente.', 'success');
      }
    } catch (err) {
      if (showMessage) toast(err.message, 'error', 5500);
      if (/sessão|sessao|autoriz/i.test(err.message)) {
        await state.db.del('session', 'current');
        state.token = null; state.user = null;
        showLogin('Sua sessão expirou. Entre novamente quando houver conexão.');
      }
    } finally {
      state.syncing = false;
      loading(false);
      updateSyncStatus();
      if (state.user) renderCurrentView();
    }
  }

  async function updateSyncStatus() {
    const count = await pendingCount().catch(() => 0);
    $('pendingLabel').textContent = count ? `${count} pendente(s) de envio` : 'Tudo sincronizado';
    const badge = $('connectionBadge');
    badge.classList.toggle('offline', !isOnline());
    badge.innerHTML = `<i></i> ${isOnline() ? (count ? 'Pendente' : 'Online') : 'Offline'}`;
    $('syncBtn').disabled = !isOnline() || !state.token || state.syncing;
  }

  async function restoreSession() {
    const session = await getCachedSession();
    if (!session || !session.token || !session.user || session.expiresAt < Date.now()) return false;
    state.token = session.token;
    state.user = session.user;
    await loadLocalData();
    if (isOnline()) {
      try {
        const data = await api('sync');
        await mergeRemoteData(data);
        await syncAll(false);
      } catch (err) {
        toast(`Modo local: ${err.message}`, 'warning', 4800);
      }
    } else {
      toast('Modo offline: usando o último acesso autorizado neste aparelho.', 'warning', 4800);
    }
    showApp();
    return true;
  }

  function showLogin(message = '') {
    $('loginView').classList.remove('hidden');
    $('appView').classList.add('hidden');
    $('loginStatus').textContent = message || (CFG.API_URL ? 'Conecte-se à internet para validar seu acesso pela primeira vez.' : 'Backend ainda não configurado. Consulte o LEIA-ME incluído no pacote.');
  }
  function showApp() {
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    $('userName').textContent = state.user.nome || state.user.email;
    $('userRole').textContent = state.user.role === 'ADMIN' ? 'Administrador' : 'Operação';
    $('userInitials').textContent = (state.user.nome || state.user.email).split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase();
    document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', state.user.role !== 'ADMIN'));
    $('historyNavLabel').textContent = state.user.role === 'ADMIN' ? 'Histórico geral' : 'Meus lançamentos';
    navigate(state.user.role === 'ADMIN' ? 'dashboard' : 'new');
    updateSyncStatus();
  }

  async function login(email, password) {
    if (!CFG.API_URL) throw new Error('O endereço do Google Apps Script ainda não foi configurado no arquivo config.js.');
    if (!isOnline()) throw new Error('O primeiro acesso exige internet para validar usuário e senha.');
    const result = await api('login', { email: email.trim().toLowerCase(), password });
    state.token = result.token;
    state.user = result.user;
    await saveSession({ token: result.token, user: result.user, expiresAt: result.expiresAt });
    const data = await api('sync');
    await mergeRemoteData(data);
    showApp();
    await syncAll(false);
  }

  function pageMeta(view) {
    const map = {
      dashboard: ['Visão geral', 'Indicadores, consumo e alertas da frota'],
      new: ['Novo abastecimento', 'Registre os dados e anexe as duas evidências fotográficas'],
      history: [state.user?.role === 'ADMIN' ? 'Histórico de abastecimentos' : 'Meus lançamentos', 'Consulte registros, evidências e situação de sincronização'],
      vehicles: ['Gestão de veículos', 'Cadastre e mantenha a base da frota atualizada'],
      users: ['Gestão de usuários', 'Controle os acessos de administradores e operadores'],
      reports: ['Relatórios gerenciais', 'Análise de custos, consumo e eficiência por período'],
      cards: ['Cartões de abastecimento', 'Saldos, recargas e extrato financeiro dos cartões']
    };
    return map[view] || map.dashboard;
  }

  function navigate(view) {
    if (!state.user) return;
    if (state.user.role !== 'ADMIN' && ['dashboard', 'vehicles', 'users', 'reports', 'cards'].includes(view)) view = 'new';
    state.view = view;
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('hidden', el.id !== `view-${view}`));
    const [title, subtitle] = pageMeta(view);
    $('pageTitle').textContent = title;
    $('pageSubtitle').textContent = subtitle;
    $('pageHeadingAction').innerHTML = view === 'history' ? '<button class="btn btn-outline btn-sm" id="exportHistoryBtn">⇩ Exportar CSV</button>' : '';
    if (view === 'new') renderNewForm();
    else if (view === 'dashboard') renderDashboard();
    else if (view === 'history') renderHistory();
    else if (view === 'vehicles') renderVehicles();
    else if (view === 'users') renderUsers();
    else if (view === 'reports') renderReports();
    else if (view === 'cards') renderCards();
    $('sidebar').classList.remove('open'); $('sidebarScrim').classList.remove('show');
    state.mobileMenu = false;
    if (view !== 'new') state.launchActive = false;
    $('exportHistoryBtn')?.addEventListener('click', exportCsv);
  }

  function renderCurrentView() { navigate(state.view); }
  function getVehicle(plate) { return state.vehicles.find(v => v.placa === plate); }
  function recordsForVehicle(plate) { return state.records.filter(r => r.placa === plate).sort((a,b) => new Date(a.dataHora) - new Date(b.dataHora)); }
  function latestKm(plate) { const list = recordsForVehicle(plate); return list.length ? Number(list[list.length - 1].km || 0) : Number(getVehicle(plate)?.kmAtual || 0); }
  function averageConsumption(records) {
    const valid = records.filter(r => Number(r.consumoKmL) > 0);
    if (!valid.length) return 0;
    const distance = valid.reduce((sum,r) => sum + Number(r.distanciaCiclo || 0), 0);
    const liters = valid.reduce((sum,r) => sum + Number(r.litrosCiclo || 0), 0);
    return liters ? distance / liters : 0;
  }
  function totalValue(records) { return records.reduce((s,r) => s + Number(r.valorTotal || 0), 0); }
  function moneyPerKm(records) {
    const kms = records.reduce((s,r) => s + Number(r.distanciaUltimo || 0), 0);
    return kms > 0 ? totalValue(records) / kms : 0;
  }

  function renderDashboard() {
    const records = state.records.slice().sort((a,b) => new Date(b.dataHora)-new Date(a.dataHora));
    const currentMonth = new Date();
    const monthRecords = records.filter(r => { const d = new Date(r.dataHora); return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear(); });
    const totalLiters = monthRecords.reduce((s,r)=>s+Number(r.litros||0),0);
    const alerts = records.filter(r => r.alerta && r.alerta !== 'OK').slice(0,8);
    const validConsumption = averageConsumption(records);
    const totalKms = records.reduce((s,r)=>s+Number(r.distanciaUltimo||0),0);
    const byMonth = [];
    for (let back=5; back>=0; back--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-back);
      const list = records.filter(r=>{const x=new Date(r.dataHora);return x.getMonth()===d.getMonth()&&x.getFullYear()===d.getFullYear();});
      byMonth.push({ label:d.toLocaleDateString('pt-BR',{month:'short'}).replace('.',''), value:list.reduce((s,r)=>s+Number(r.valorTotal||0),0) });
    }
    const max = Math.max(1,...byMonth.map(x=>x.value));
    const vehicleStats = state.vehicles.filter(v=>v.ativo!==false).map(v=>({plate:v.placa, value:records.filter(r=>r.placa===v.placa).reduce((s,r)=>s+Number(r.valorTotal||0),0)})).sort((a,b)=>b.value-a.value).slice(0,6);
    const maxVehicle = Math.max(1,...vehicleStats.map(v=>v.value));
    $('view-dashboard').innerHTML = `
      <div class="metric-grid">
        <article class="metric-card"><div class="metric-top">Gasto no mês <span class="metric-icon">R$</span></div><div class="metric-value">${fmtMoney(totalValue(monthRecords))}</div><div class="metric-note">${monthRecords.length} abastecimento(s) no mês</div></article>
        <article class="metric-card"><div class="metric-top">Litros no mês <span class="metric-icon">⛽</span></div><div class="metric-value">${fmtNumber(totalLiters,1)} L</div><div class="metric-note">Volume abastecido no período</div></article>
        <article class="metric-card"><div class="metric-top">Consumo médio <span class="metric-icon">↗</span></div><div class="metric-value">${validConsumption ? `${fmtNumber(validConsumption,2)} km/L` : '—'}</div><div class="metric-note">Ciclos válidos tanque cheio a tanque cheio</div></article>
        <article class="metric-card"><div class="metric-top">Custo estimado / km <span class="metric-icon">⌁</span></div><div class="metric-value">${totalKms ? fmtMoney(moneyPerKm(records)) : '—'}</div><div class="metric-note">Baseado nos KM registrados</div></article>
      </div>
      <div class="dashboard-grid">
        <article class="panel"><div class="panel-header"><div><h3>Evolução de gastos</h3><div class="panel-subtitle">Total abastecido por mês · últimos 6 meses</div></div></div><div class="chart-bars">${byMonth.map(x=>`<div class="chart-col"><div class="chart-bar" style="height:${Math.max(3,x.value/max*82)}%"><span>${x.value?fmtMoney(x.value):'—'}</span></div><div class="chart-label">${esc(x.label)}</div></div>`).join('')}</div></article>
        <article class="panel"><div class="panel-header"><div><h3>Veículos com maior custo</h3><div class="panel-subtitle">Acumulado dos registros disponíveis</div></div></div>${vehicleStats.length ? `<div class="vehicle-bars">${vehicleStats.map(v=>`<div class="vehicle-bar-row"><span>${esc(v.plate)}</span><div class="track"><span style="width:${v.value/maxVehicle*100}%"></span></div><strong>${fmtMoney(v.value)}</strong></div>`).join('')}</div>` : '<div class="empty-state">Nenhum abastecimento cadastrado.</div>'}</article>
      </div>
      <div class="dashboard-grid">
        <article class="panel"><div class="panel-header"><div><h3>Alertas para análise</h3><div class="panel-subtitle">Sinais de consumo, volume ou quilometragem fora do padrão</div></div><span class="status-pill ${alerts.length?'status-warning':'status-ok'}">${alerts.length} alerta(s)</span></div>
        ${alerts.length ? `<div class="alert-list">${alerts.map(a=>`<div class="alert-item ${a.alerta==='CONSUMO_ALTO'||a.alerta==='KM_INCONSISTENTE'?'danger':''}"><div class="alert-mark">⚠</div><div><strong>${esc(a.placa)} · ${esc(alertLabel(a.alerta))}</strong><p>${esc(a.alertaDescricao || 'Registro sinalizado para conferência gerencial.')} · ${fmtDate(a.dataHora)}</p></div></div>`).join('')}</div>` : '<div class="empty-state"><b>Nenhum alerta identificado</b>Os registros sincronizados não apresentam alertas automáticos neste momento.</div>'}</article>
        <article class="panel"><div class="panel-header"><div><h3>Resumo da frota</h3><div class="panel-subtitle">Situação do cadastro e da base de abastecimentos</div></div></div>
          <div class="report-kv"><span>Veículos ativos</span><b>${state.vehicles.filter(v=>v.ativo!==false).length}</b></div>
          <div class="report-kv"><span>Abastecimentos registrados</span><b>${records.length}</b></div>
          <div class="report-kv"><span>Distância acumulada registrada</span><b>${fmtNumber(totalKms,0)} km</b></div>
          <div class="report-kv"><span>Gasto total registrado</span><b>${fmtMoney(totalValue(records))}</b></div>
          <div class="report-kv"><span>Registros pendentes neste aparelho</span><b data-pending-count>...</b></div>
        </article>
      </div>
      <div class="table-card"><div class="table-head"><h3>Últimos abastecimentos</h3><button class="btn btn-outline btn-sm" data-go="history">Ver histórico</button></div><div class="table-wrap">${renderFuelTable(records.slice(0,7), true)}</div></div>`;
    $('view-dashboard').querySelector('[data-go="history"]')?.addEventListener('click',()=>navigate('history'));
    bindRecordActions($('view-dashboard'));
    pendingCount().then(n=>{const el=$('view-dashboard').querySelector('[data-pending-count]');if(el)el.textContent=String(n);});
  }
  function awaitPendingLabel(){ return '—'; }
  function alertLabel(value){ return ({CONSUMO_ALTO:'Consumo abaixo do esperado',KM_INCONSISTENTE:'Quilometragem inconsistente',VOLUME_ALTO:'Volume acima da capacidade do tanque',CICLO_COMBUSTIVEL_MISTO:'Ciclo com combustível misto'})[value] || value || 'Alerta'; }

  function renderFuelTable(records, compact = false) {
    if (!records.length) return '<div class="empty-state"><b>Nenhum registro encontrado</b>Os abastecimentos aparecerão aqui após o primeiro lançamento.</div>';
    return `<table><thead><tr><th>Data</th><th>Placa</th><th>KM</th><th>Litros</th><th>Combustível</th><th>Valor</th><th>Cartão</th><th>Consumo</th>${compact?'':'<th>Responsável</th><th>Status</th>'}<th>Ação</th></tr></thead><tbody>${records.map(r=>`<tr><td>${fmtDateTime(r.dataHora)}</td><td><strong>${esc(r.placa)}</strong></td><td>${fmtNumber(r.km,0)}</td><td>${fmtNumber(r.litros,2)} L</td><td>${esc(r.combustivel)}</td><td>${fmtMoney(r.valorTotal)}</td><td>${esc(r.cartaoNome||'—')}</td><td>${r.consumoKmL?`${fmtNumber(r.consumoKmL,2)} km/L`:'—'}</td>${compact?'':`<td>${esc(r.usuarioNome||'—')}</td><td>${statusPill(r)}</td>`}<td><button class="btn btn-outline btn-sm" data-detail="${esc(r.id)}">Detalhes</button></td></tr>`).join('')}</tbody></table>`;
  }
  function statusPill(record) {
    if (record.syncStatus === 'PENDING') return '<span class="status-pill status-pending">Pendente</span>';
    if (record.syncStatus === 'REVIEW') return '<span class="status-pill status-danger">Revisar</span>';
    if (record.alerta && record.alerta !== 'OK') return '<span class="status-pill status-warning">Alerta</span>';
    return '<span class="status-pill status-ok">Sincronizado</span>';
  }

  function renderNewForm() {
    const options = state.vehicles.filter(v=>v.ativo!==false).map(v=>`<option value="${esc(v.placa)}">${esc(v.placa)} · ${esc(`${v.marca||''} ${v.modelo||''}`.trim())}</option>`).join('');
    const activeCards = state.cards.filter(c=>c.ativo!==false).sort((a,b)=>String(a.nome).localeCompare(String(b.nome)));
    const cardOptions = activeCards.map(c=>`<option value="${esc(c.id)}">${esc(c.nome)}${c.ultimos4?` · final ${esc(c.ultimos4)}`:''}</option>`).join('');
    $('view-new').innerHTML = `
      <div class="form-layout">
        <form id="fuelForm" class="form-card">
          <h3>Dados do abastecimento</h3><div class="form-intro">Preencha os campos e fotografe o painel e o comprovante antes de salvar.</div>
          <div class="form-grid">
            <div class="field full"><label>Veículo / placa *<select id="fuelPlate" required><option value="">Selecione o veículo</option>${options}</select><span id="lastKmHint" class="help">Selecione uma placa para consultar o último KM registrado.</span></label></div>
            <div class="field"><label>Quilometragem atual (KM) *<input id="fuelKm" type="number" min="0" step="1" inputmode="numeric" required placeholder="Ex.: 45.230"></label></div>
            <div class="field"><label>Litros abastecidos *<input id="fuelLiters" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="Ex.: 42,50"></label></div>
            <div class="field"><label>Combustível *<select id="fuelType" required>${FUEL_TYPES.map(x=>`<option>${esc(x)}</option>`).join('')}</select></label></div>
            <div class="field"><label>Valor total (R$) *<input id="fuelValue" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="Ex.: 250,00"></label></div>
            <div class="field full"><label>Cartão utilizado *<select id="fuelCard" required><option value="">Selecione o cartão</option>${cardOptions}</select><span id="cardBalanceHint" class="help">${activeCards.length?'Selecione o cartão para consultar o saldo estimado.':'Nenhum cartão ativo disponível. Solicite ao administrador o cadastro dos cartões.'}</span></label></div>
            <div class="field"><label>Posto / estabelecimento<input id="fuelStation" type="text" maxlength="100" placeholder="Nome do posto"></label></div>
            <div class="field"><label>Data e hora<input id="fuelDate" type="datetime-local" required></label><span class="help">Pré-preenchido com o horário do aparelho.</span></div>
            <div class="field full"><label class="check-line"><input id="fuelFullTank" type="checkbox"> <span><b>Abastecimento com tanque completo</b><br><small class="help">Marque somente quando o tanque foi completado. Isso permite calcular km/L por ciclo com maior confiabilidade.</small></span></label></div>
            <div class="field full"><label>Observações<textarea id="fuelNotes" maxlength="500" placeholder="Informações adicionais (opcional)"></textarea></label></div>
            <div class="field"><div class="photo-slot"><b>📷 Foto do odômetro *</b><small>Imagem nítida mostrando a quilometragem do painel.</small><input id="photoOdo" type="file" accept="image/*" capture="environment"><div id="previewOdo" class="photo-preview"></div></div></div>
            <div class="field"><div class="photo-slot"><b>🧾 Foto da nota / comprovante *</b><small>Mostre posto, litros e valor da compra.</small><input id="photoReceipt" type="file" accept="image/*" capture="environment"><div id="previewReceipt" class="photo-preview"></div></div></div>
          </div>
          <div class="form-actions"><button class="btn btn-outline" type="reset" id="clearFuelBtn">Limpar</button><button class="btn btn-primary" type="submit">Salvar abastecimento</button></div>
        </form>
        <aside class="form-side-note"><h4>Antes de concluir</h4><p>Confira se a placa e a quilometragem correspondem ao veículo. As fotos do odômetro e do comprovante são obrigatórias.</p><p><b>Modo offline:</b> o lançamento e as fotos ficam salvos no aparelho. O sistema envia automaticamente quando a conexão retornar.</p><p><b>Indicador de consumo:</b> km/L é calculado em ciclos de tanque completo. Abastecimentos parciais entram no volume acumulado até o próximo tanque completo.</p><div class="report-kv"><span>Último KM da placa</span><b id="sideLastKm">—</b></div><div class="report-kv"><span>Registros pendentes</span><b id="sidePending">—</b></div></aside>
      </div>`;
    const date = new Date(); date.setMinutes(date.getMinutes()-date.getTimezoneOffset());
    $('fuelDate').value = date.toISOString().slice(0,16);
    $('fuelPlate').addEventListener('change', updateVehicleHint);
    $('fuelCard').addEventListener('change', updateSelectedCardHint);
    $('fuelValue').addEventListener('input', updateSelectedCardHint);
    $('fuelForm').addEventListener('input', scheduleDraftSave);
    $('fuelForm').addEventListener('change', scheduleDraftSave);
    $('photoOdo').addEventListener('change', e=>handlePhoto(e,'odometro'));
    $('photoReceipt').addEventListener('change', e=>handlePhoto(e,'nota'));
    $('fuelForm').addEventListener('submit', submitFuel);
    $('clearFuelBtn').addEventListener('click', async()=>{await state.db.del('draft','current');clearPhotoCache();setTimeout(()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());$('fuelDate').value=d.toISOString().slice(0,16);},0);});
    restoreDraft();
    state.launchActive = true;
    updateVehicleHint();
    updateSyncStatus();
  }

  const photoCache = { odometro: null, nota: null };
  function clearPhotoCache(){photoCache.odometro=null;photoCache.nota=null;}
  async function handlePhoto(event, kind) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Selecione um arquivo de imagem.', 'warning'); event.target.value=''; return; }
    try {
      const dataUrl = await compressImage(file, 1500, 0.76);
      photoCache[kind] = dataUrl;
      const target = kind === 'odometro' ? 'previewOdo' : 'previewReceipt';
      $(target).innerHTML = `<img alt="Prévia da foto" src="${dataUrl}">`;
      scheduleDraftSave();
    } catch (err) { toast(`Não foi possível processar a foto: ${err.message}`, 'error'); }
  }
  function compressImage(file, maxSide, quality) {
    return new Promise((resolve,reject)=>{
      const reader = new FileReader();
      reader.onerror=()=>reject(new Error('Falha na leitura da imagem.'));
      reader.onload=()=>{
        const img=new Image();
        img.onerror=()=>reject(new Error('Arquivo de imagem inválido.'));
        img.onload=()=>{
          const scale=Math.min(1,maxSide/Math.max(img.width,img.height));
          const canvas=document.createElement('canvas');
          canvas.width=Math.round(img.width*scale); canvas.height=Math.round(img.height*scale);
          const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL('image/jpeg',quality));
        };
        img.src=reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function updateVehicleHint() {
    const plate=$('fuelPlate')?.value;
    if (!plate) { if($('lastKmHint'))$('lastKmHint').textContent='Selecione uma placa para consultar o último KM registrado.'; if($('sideLastKm'))$('sideLastKm').textContent='—'; return; }
    const km=latestKm(plate);
    const hint=`Último KM conhecido: ${fmtNumber(km,0)} km`;
    $('lastKmHint').textContent=hint;
    $('sideLastKm').textContent=`${fmtNumber(km,0)} km`;
  }
  async function projectedCardBalance(cardId) {
    const card = state.cards.find(c => String(c.id) === String(cardId));
    if (!card) return null;
    const outbox = await state.db.all('outbox');
    const pendingDebit = outbox.reduce((sum, item) => {
      const rec = item.record || {};
      return String(rec.cartaoId || '') === String(cardId) ? sum + Number(rec.valorTotal || 0) : sum;
    }, 0);
    return Math.round((Number(card.saldoAtual || 0) - pendingDebit) * 100) / 100;
  }
  async function updateSelectedCardHint() {
    const hint = $('cardBalanceHint');
    const select = $('fuelCard');
    if (!hint || !select) return;
    const cardId = select.value;
    const card = state.cards.find(c => String(c.id) === String(cardId));
    if (!card) {
      hint.textContent = state.cards.some(c => c.ativo !== false) ? 'Selecione o cartão para consultar o saldo estimado.' : 'Nenhum cartão ativo disponível. Solicite ao administrador o cadastro dos cartões.';
      hint.classList.remove('card-balance-low');
      return;
    }
    const available = await projectedCardBalance(cardId);
    const value = Number($('fuelValue')?.value || 0);
    const pendingSuffix = isOnline() ? 'Saldo estimado com pendências deste aparelho.' : 'Modo offline: saldo baseado no último sincronismo e nas pendências locais.';
    hint.textContent = `Saldo disponível estimado: ${fmtMoney(Math.max(0, available))}. ${pendingSuffix}`;
    hint.classList.toggle('card-balance-low', available <= Number(card.limiteAlerta || 0) || (value > 0 && value > available));
    if (value > available) hint.textContent += ` Valor informado supera o saldo estimado em ${fmtMoney(value - available)}.`;
  }
  function getDraftForm() {
    return {
      placa:$('fuelPlate')?.value||'', km:$('fuelKm')?.value||'', litros:$('fuelLiters')?.value||'', combustivel:$('fuelType')?.value||FUEL_TYPES[0], valorTotal:$('fuelValue')?.value||'', cartaoId:$('fuelCard')?.value||'', posto:$('fuelStation')?.value||'', dataHora:$('fuelDate')?.value||'', tanqueCheio:!!$('fuelFullTank')?.checked, observacoes:$('fuelNotes')?.value||'', fotoOdometroData:photoCache.odometro, fotoNotaData:photoCache.nota
    };
  }
  function scheduleDraftSave() {
    clearTimeout(state.draftTimer);
    state.draftTimer=setTimeout(async()=>{
      const form=$('fuelForm'); if(!form)return;
      const draft=getDraftForm();
      await state.db.put('draft',{id:'current',...draft, atualizadoEm:new Date().toISOString()});
      state.launchActive=Object.values(draft).some(v=>v!==''&&v!==null&&v!==false);
    },450);
  }
  async function restoreDraft() {
    const draft=await state.db.get('draft','current');
    if(!draft || !$('fuelForm'))return;
    for(const [id,key] of [['fuelPlate','placa'],['fuelKm','km'],['fuelLiters','litros'],['fuelType','combustivel'],['fuelValue','valorTotal'],['fuelCard','cartaoId'],['fuelStation','posto'],['fuelDate','dataHora'],['fuelNotes','observacoes']]) if(draft[key]!==undefined)$(id).value=draft[key];
    $('fuelFullTank').checked=!!draft.tanqueCheio;
    photoCache.odometro=draft.fotoOdometroData||null; photoCache.nota=draft.fotoNotaData||null;
    if(photoCache.odometro)$('previewOdo').innerHTML=`<img alt="Prévia da foto" src="${photoCache.odometro}">`;
    if(photoCache.nota)$('previewReceipt').innerHTML=`<img alt="Prévia da foto" src="${photoCache.nota}">`;
    if(photoCache.odometro)$('photoOdo').required=false;
    if(photoCache.nota)$('photoReceipt').required=false;
    updateVehicleHint();
    updateSelectedCardHint();
  }

  async function submitFuel(event) {
    event.preventDefault();
    const form=event.currentTarget;
    const formData=getDraftForm();
    const km=Number(formData.km), liters=Number(formData.litros), value=Number(formData.valorTotal);
    if (!formData.placa) return toast('Selecione o veículo.', 'warning');
    if (!Number.isFinite(km)||km<0) return toast('Informe uma quilometragem válida.', 'warning');
    if (!Number.isFinite(liters)||liters<=0) return toast('Informe a quantidade de litros.', 'warning');
    if (!Number.isFinite(value)||value<=0) return toast('Informe o valor total do abastecimento.', 'warning');
    if (!formData.cartaoId) return toast('Selecione o cartão utilizado no abastecimento.', 'warning');
    const selectedCard = state.cards.find(c=>String(c.id)===String(formData.cartaoId)&&c.ativo!==false);
    if (!selectedCard) return toast('O cartão selecionado não está disponível. Sincronize os dados ou solicite ao administrador.', 'error', 5500);
    const estimatedBalance = await projectedCardBalance(formData.cartaoId);
    if (estimatedBalance === null || value > estimatedBalance + 0.001) return toast(`Saldo estimado insuficiente no ${selectedCard.nome}. Disponível: ${fmtMoney(Math.max(0, estimatedBalance || 0))}.`, 'error', 5500);
    if (!formData.fotoOdometroData || !formData.fotoNotaData) return toast('As duas fotos são obrigatórias.', 'warning');
    const last=latestKm(formData.placa);
    if (last && km < last) return toast(`A quilometragem informada é menor que o último KM conhecido (${fmtNumber(last,0)}). Confira o dado ou solicite revisão do administrador.`, 'error', 5500);
    const vehicle=getVehicle(formData.placa);
    if (vehicle?.tanqueLitros && liters > Number(vehicle.tanqueLitros)*1.08) return toast('A quantidade de litros supera a capacidade cadastrada do tanque. Confira o lançamento.', 'warning', 5500);
    const timestamp = formData.dataHora ? new Date(formData.dataHora).toISOString() : new Date().toISOString();
    const record={
      id:uuid(), placa:formData.placa, km, litros, combustivel:formData.combustivel, valorTotal:value,
      precoLitro:value/liters, cartaoId:formData.cartaoId, cartaoNome:selectedCard.nome, posto:formData.posto.trim(), observacoes:formData.observacoes.trim(),
      dataHora:timestamp, tanqueCheio:!!formData.tanqueCheio, fotoOdometroData:formData.fotoOdometroData,
      fotoNotaData:formData.fotoNotaData, usuarioId:state.user.id, usuarioNome:state.user.nome,
      deviceId:localDeviceId(), criadoLocalEm:new Date().toISOString(), syncStatus:'PENDING'
    };
    const outbox={id:record.id,record,criadoEm:new Date().toISOString(),tentativas:0};
    try {
      loading(true,'Salvando no aparelho...');
      await state.db.put('abastecimentos',record);
      await state.db.put('outbox',outbox);
      await state.db.del('draft','current');
      loading(false);
      clearPhotoCache();
      toast('Abastecimento salvo no aparelho. A sincronização será automática.', 'success', 4300);
      state.launchActive=false;
      navigate('history');
      if(isOnline()) syncAll(false);
    } catch (err) {
      loading(false); toast(`Falha ao salvar no aparelho: ${err.message}`, 'error');
    }
  }
  function localDeviceId() {
    let id=localStorage.getItem('gps_device_id');
    if(!id){id=uuid();localStorage.setItem('gps_device_id',id);}
    return id;
  }

  function renderHistory() {
    const list=state.records.filter(r=>state.user.role==='ADMIN'||r.usuarioId===state.user.id).slice().sort((a,b)=>new Date(b.dataHora)-new Date(a.dataHora));
    $('view-history').innerHTML=`<div class="table-card"><div class="filters"><input id="historySearch" class="search-filter" placeholder="Buscar placa, posto ou responsável"><select id="historyStatus"><option value="">Todos os status</option><option value="PENDING">Pendente</option><option value="REVIEW">Revisar</option><option value="SYNCED">Sincronizado</option></select><select id="historyFuel"><option value="">Todos os combustíveis</option>${FUEL_TYPES.map(f=>`<option>${esc(f)}</option>`).join('')}</select></div><div class="table-wrap" id="historyTable">${renderFuelTable(list)}</div></div>`;
    const apply=()=>{
      const term=$('historySearch').value.toLowerCase();const status=$('historyStatus').value;const fuel=$('historyFuel').value;
      const filtered=list.filter(r=>(!term||[r.placa,r.posto,r.usuarioNome].join(' ').toLowerCase().includes(term))&&(!status||r.syncStatus===status)&&(!fuel||r.combustivel===fuel));
      $('historyTable').innerHTML=renderFuelTable(filtered);
      bindRecordActions($('historyTable'));
    };
    ['historySearch','historyStatus','historyFuel'].forEach(id=>$(id).addEventListener('input',apply));
    bindRecordActions($('view-history'));
  }
  function bindRecordActions(root) {
    root.querySelectorAll('[data-detail]').forEach(btn=>btn.addEventListener('click',()=>showRecordDetail(btn.dataset.detail)));
  }
  function showRecordDetail(id) {
    const r=state.records.find(x=>x.id===id);if(!r)return;
    const canEdit=state.user.role==='ADMIN'&&r.syncStatus!=='PENDING';
    $('modalRoot').innerHTML=`<div class="modal-backdrop" data-close-modal><div class="modal-card"><div class="modal-header"><h3>Detalhes do abastecimento</h3><button class="icon-btn" data-close-modal aria-label="Fechar">×</button></div><div class="modal-body">
      <div class="report-kv"><span>Veículo</span><b>${esc(r.placa)}</b></div><div class="report-kv"><span>Data / hora</span><b>${fmtDateTime(r.dataHora)}</b></div><div class="report-kv"><span>Quilometragem</span><b>${fmtNumber(r.km,0)} km</b></div><div class="report-kv"><span>Volume</span><b>${fmtNumber(r.litros,2)} L · ${esc(r.combustivel)}</b></div><div class="report-kv"><span>Valor</span><b>${fmtMoney(r.valorTotal)}</b></div><div class="report-kv"><span>Cartão utilizado</span><b>${esc(r.cartaoNome||'Não vinculado (histórico anterior)')}</b></div><div class="report-kv"><span>Posto</span><b>${esc(r.posto||'—')}</b></div><div class="report-kv"><span>Responsável</span><b>${esc(r.usuarioNome||'—')}</b></div><div class="report-kv"><span>Consumo calculado</span><b>${r.consumoKmL?`${fmtNumber(r.consumoKmL,2)} km/L`:'Ainda não calculado (ciclo sem tanque completo)'}</b></div><div class="report-kv"><span>Situação</span><b>${esc(r.alertaDescricao|| (r.syncStatus==='PENDING'?'Aguardando sincronização':'Sem alerta'))}</b></div><p class="small-note">${esc(r.observacoes||'Sem observações.')}</p>
      <div class="detail-photos">${photoLink(r.fotoOdometroUrl,r.fotoOdometroData,'Odômetro')}${photoLink(r.fotoNotaUrl,r.fotoNotaData,'Comprovante')}</div>
      ${r.syncError?`<p class="small-note" style="color:#b64040">Falha de sincronização: ${esc(r.syncError)}</p>`:''}
      </div><div class="modal-footer">${canEdit?`<button class="btn btn-outline" id="editRecordBtn">Corrigir registro</button>`:''}<button class="btn btn-primary" data-close-modal>Fechar</button></div></div></div>`;
    $('modalRoot').querySelectorAll('[data-close-modal]').forEach(el=>el.addEventListener('click',e=>{if(e.target===el||el.tagName==='BUTTON')$('modalRoot').innerHTML='';}));
    $('editRecordBtn')?.addEventListener('click',()=>editRecord(id));
  }
  function photoLink(url,data,label) {
    const source=data||url;
    if(!source)return `<div><p class="small-note">${label}</p><div class="empty-state">Foto ainda não disponível.</div></div>`;
    return `<div><p class="small-note">${label}</p><a href="${esc(source)}" target="_blank" rel="noopener"><img src="${esc(source)}" alt="${label}"></a></div>`;
  }

  function editRecord(id) {
    const r=state.records.find(x=>x.id===id);if(!r)return;
    $('modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal-card"><div class="modal-header"><h3>Corrigir abastecimento</h3><button class="icon-btn" data-edit-close>×</button></div><form id="editRecordForm"><div class="modal-body"><p class="small-note">A correção será registrada na auditoria com o usuário, data e justificativa. As fotos originais serão preservadas.</p><div class="form-grid"><div class="field"><label>KM<input id="editKm" type="number" required min="0" value="${Number(r.km)}"></label></div><div class="field"><label>Litros<input id="editLiters" type="number" required min="0.01" step="0.01" value="${Number(r.litros)}"></label></div><div class="field"><label>Combustível<select id="editFuel">${FUEL_TYPES.map(f=>`<option ${r.combustivel===f?'selected':''}>${f}</option>`).join('')}</select></label></div><div class="field"><label>Valor total (R$)<input id="editValue" type="number" required min="0.01" step="0.01" value="${Number(r.valorTotal)}"></label></div><div class="field"><label>Posto<input id="editStation" maxlength="100" value="${esc(r.posto||'')}"></label></div><div class="field"><label class="check-line"><input id="editFullTank" type="checkbox" ${r.tanqueCheio?'checked':''}> Tanque completo</label></div><div class="field full"><label>Justificativa obrigatória<textarea id="editReason" required minlength="5" maxlength="500" placeholder="Descreva o motivo da correção"></textarea></label></div></div></div><div class="modal-footer"><button type="button" class="btn btn-outline" data-edit-close>Cancelar</button><button type="submit" class="btn btn-primary">Salvar correção</button></div></form></div></div>`;
    $('modalRoot').querySelectorAll('[data-edit-close]').forEach(b=>b.addEventListener('click',()=>$('modalRoot').innerHTML=''));
    $('editRecordForm').addEventListener('submit',async e=>{
      e.preventDefault();const patch={km:Number($('editKm').value),litros:Number($('editLiters').value),combustivel:$('editFuel').value,valorTotal:Number($('editValue').value),posto:$('editStation').value,tanqueCheio:$('editFullTank').checked,motivo:$('editReason').value.trim()};
      if(!patch.motivo)return toast('Informe a justificativa da correção.','warning');
      try{loading(true,'Registrando correção...');const data=await api('updateFuel',{id,patch});await state.db.put('abastecimentos',{...data.record,syncStatus:'SYNCED'});await loadLocalData();loading(false);$('modalRoot').innerHTML='';toast('Registro corrigido e auditoria atualizada.','success');navigate('history');}catch(err){loading(false);toast(err.message,'error',5500);}
    });
  }

  function renderVehicles() {
    const activeCount = state.vehicles.filter(v => v.ativo !== false).length;
    $('view-vehicles').innerHTML = `<div class="toolbar-row"><span class="muted">${activeCount} ativo(s) · ${state.vehicles.length} cadastrado(s)</span><button class="btn btn-primary btn-sm" id="newVehicleBtn">＋ Cadastrar veículo</button></div><div class="card-grid">${state.vehicles.slice().sort((a,b)=>String(a.placa).localeCompare(String(b.placa))).map(v=>`<article class="vehicle-card"><div class="vehicle-card-head"><span class="plate-badge">${esc(v.placa)}</span><span class="status-pill ${v.ativo===false?'status-pending':'status-ok'}">${v.ativo===false?'Inativo':'Ativo'}</span></div><div class="vehicle-name">${esc(`${v.marca||''} ${v.modelo||''}`.trim()||'Modelo não informado')} ${v.ano?`· ${esc(v.ano)}`:''}</div><div class="vehicle-data"><div><span>Combustível padrão</span><b>${esc(v.combustivelPadrao||'—')}</b></div><div><span>Tanque</span><b>${v.tanqueLitros?`${fmtNumber(v.tanqueLitros,0)} L`:'—'}</b></div><div><span>Consumo esperado</span><b>${v.consumoEsperado?`${fmtNumber(v.consumoEsperado,1)} km/L`:'—'}</b></div><div><span>Centro de custo</span><b>${esc(v.centroCusto||'—')}</b></div><div><span>KM de referência</span><b>${fmtNumber(v.kmAtual||0,0)} km</b></div></div><div class="form-actions"><button class="btn btn-outline btn-sm" data-edit-vehicle="${esc(v.id)}">✎ Editar veículo</button></div></article>`).join('')||'<div class="empty-state">Nenhum veículo cadastrado.</div>'}</div>`;
    $('newVehicleBtn').addEventListener('click',()=>showVehicleModal());
    $('view-vehicles').querySelectorAll('[data-edit-vehicle]').forEach(btn=>btn.addEventListener('click',()=>{
      const vehicle=state.vehicles.find(v=>String(v.id)===String(btn.dataset.editVehicle));
      if(vehicle) showVehicleModal(vehicle);
    }));
  }

  function showVehicleModal(vehicle = null) {
    const editing = !!vehicle;
    const hasFuelHistory = editing && state.records.some(r=>String(r.placa)===String(vehicle.placa));
    $('modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal-card"><div class="modal-header"><h3>${editing?'Editar veículo':'Cadastrar veículo'}</h3><button class="icon-btn" data-vclose>×</button></div><form id="vehicleForm"><div class="modal-body"><div class="form-grid"><div class="field"><label>Placa *<input id="vPlate" required maxlength="7" placeholder="ABC1D23" value="${esc(vehicle?.placa||'')}" ${hasFuelHistory?'readonly':''}></label>${hasFuelHistory?'<span class="help">A placa não pode ser alterada porque já existem abastecimentos vinculados a ela.</span>':''}</div><div class="field"><label>Marca<input id="vMake" maxlength="60" value="${esc(vehicle?.marca||'')}"></label></div><div class="field"><label>Modelo<input id="vModel" maxlength="60" value="${esc(vehicle?.modelo||'')}"></label></div><div class="field"><label>Ano<input id="vYear" type="number" min="1950" max="2100" value="${esc(vehicle?.ano||'')}"></label></div><div class="field"><label>Capacidade do tanque (L)<input id="vTank" type="number" min="1" step="0.1" value="${esc(vehicle?.tanqueLitros||'')}"></label></div><div class="field"><label>Combustível padrão<select id="vFuel">${FUEL_TYPES.map(f=>`<option ${f===(vehicle?.combustivelPadrao||'Gasolina')?'selected':''}>${f}</option>`).join('')}</select></label></div><div class="field"><label>Consumo esperado (km/L)<input id="vExpected" type="number" min="0.1" step="0.1" placeholder="Ex.: 10,5" value="${esc(vehicle?.consumoEsperado||'')}"></label></div><div class="field"><label>Centro de custo / contrato<input id="vCostCenter" maxlength="80" value="${esc(vehicle?.centroCusto||'')}"></label></div><div class="field full"><label>KM atual de referência<input id="vKm" type="number" min="0" step="1" value="${esc(vehicle?.kmAtual??0)}"></label><span class="help">O KM não pode ser inferior ao maior odômetro já registrado para este veículo.</span></div>${editing?`<div class="field full"><label class="check-line"><input id="vActive" type="checkbox" ${vehicle.ativo===false?'':'checked'}><span><b>Veículo ativo</b><br><small class="help">Desative veículos fora de operação. O histórico permanece preservado.</small></span></label></div><div class="field full"><label>Motivo da alteração *<input id="vReason" required minlength="5" maxlength="250" placeholder="Descreva o motivo da atualização"></label></div>`:''}</div></div><div class="modal-footer"><button type="button" class="btn btn-outline" data-vclose>Cancelar</button><button type="submit" class="btn btn-primary">${editing?'Salvar alterações':'Cadastrar veículo'}</button></div></form></div></div>`;
    $('modalRoot').querySelectorAll('[data-vclose]').forEach(b=>b.addEventListener('click',()=>$('modalRoot').innerHTML=''));
    $('vPlate').addEventListener('input',e=>e.target.value=plateFmt(e.target.value));
    $('vehicleForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const payload={id:vehicle?.id||uuid(),placa:plateFmt($('vPlate').value),marca:$('vMake').value.trim(),modelo:$('vModel').value.trim(),ano:$('vYear').value,tanqueLitros:Number($('vTank').value)||0,combustivelPadrao:$('vFuel').value,consumoEsperado:Number($('vExpected').value)||0,centroCusto:$('vCostCenter').value.trim(),kmAtual:Number($('vKm').value)||0,ativo:editing?$('vActive').checked:true};
      if(editing) payload.motivo=$('vReason').value.trim();
      try{loading(true,editing?'Atualizando veículo...':'Cadastrando veículo...');const data=await api(editing?'updateVehicle':'createVehicle',editing?{id:vehicle.id,vehicle:payload}:{vehicle:payload});await state.db.put('veiculos',data.vehicle);await loadLocalData();loading(false);$('modalRoot').innerHTML='';toast(editing?'Veículo atualizado.':'Veículo cadastrado.','success');renderVehicles();}catch(err){loading(false);toast(err.message,'error',5500);}
    });
  }

  function renderUsers() {
    $('view-users').innerHTML=`<div class="toolbar-row"><span class="muted">Gerencie dados, perfil, situação e redefinição de senha dos usuários.</span><button class="btn btn-primary btn-sm" id="newUserBtn">＋ Cadastrar usuário</button></div><div class="card-grid">${state.users.slice().sort((a,b)=>String(a.nome).localeCompare(String(b.nome))).map(u=>`<article class="user-card"><div class="user-card-head"><b>${esc(u.nome)}</b><span class="role-tag ${u.role==='ADMIN'?'admin':''}">${u.role==='ADMIN'?'ADMIN':'OPERAÇÃO'}</span></div><div class="vehicle-name">${esc(u.email)}</div><div class="vehicle-data"><div><span>Status</span><b>${u.ativo===false?'Inativo':'Ativo'}</b></div><div><span>Cadastro</span><b>${fmtDate(u.criadoEm)}</b></div></div><div class="form-actions"><button class="btn btn-outline btn-sm" data-edit-user="${esc(u.id)}">✎ Editar usuário</button></div></article>`).join('')||'<div class="empty-state">Nenhum usuário disponível.</div>'}</div>`;
    $('newUserBtn').addEventListener('click',()=>showUserModal());
    $('view-users').querySelectorAll('[data-edit-user]').forEach(btn=>btn.addEventListener('click',()=>{
      const user=state.users.find(u=>String(u.id)===String(btn.dataset.editUser));
      if(user) showUserModal(user);
    }));
  }

  function showUserModal(user = null) {
    const editing=!!user;
    const isSelf=editing && String(user.id)===String(state.user.id);
    $('modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal-card"><div class="modal-header"><h3>${editing?'Editar usuário':'Cadastrar usuário'}</h3><button class="icon-btn" data-uclose>×</button></div><form id="userForm"><div class="modal-body"><div class="form-grid"><div class="field full"><label>Nome completo *<input id="uName" required maxlength="100" value="${esc(user?.nome||'')}"></label></div><div class="field full"><label>E-mail *<input id="uEmail" type="email" required maxlength="120" value="${esc(user?.email||'')}"></label></div><div class="field"><label>${editing?'Nova senha (opcional)':'Senha inicial *'}<input id="uPassword" type="password" ${editing?'':'required'} minlength="8" autocomplete="new-password" placeholder="${editing?'Deixe em branco para manter':'Mínimo de 8 caracteres'}"></label><span class="help">${editing?'Preencha somente para redefinir a senha.':'Mínimo de 8 caracteres.'}</span></div><div class="field"><label>Nível de acesso<select id="uRole" ${isSelf?'disabled':''}><option value="OPERACAO" ${user?.role==='OPERACAO'?'selected':''}>Operação</option><option value="ADMIN" ${user?.role==='ADMIN'?'selected':''}>Administrador</option></select></label></div>${editing?`<div class="field full"><label class="check-line"><input id="uActive" type="checkbox" ${user.ativo===false?'':'checked'} ${isSelf?'disabled':''}><span><b>Usuário ativo</b><br><small class="help">Usuários inativos não conseguem entrar no sistema.</small></span></label></div><div class="field full"><label>Motivo da alteração *<input id="uReason" required minlength="5" maxlength="250" placeholder="Descreva o motivo da atualização"></label></div>${isSelf?'<div class="field full"><span class="help">Por segurança, a própria conta não pode alterar o nível de acesso, ser desativada ou redefinir a própria senha por esta tela.</span></div>':''}`:''}</div></div><div class="modal-footer"><button type="button" class="btn btn-outline" data-uclose>Cancelar</button><button type="submit" class="btn btn-primary">${editing?'Salvar alterações':'Criar usuário'}</button></div></form></div></div>`;
    $('modalRoot').querySelectorAll('[data-uclose]').forEach(b=>b.addEventListener('click',()=>$('modalRoot').innerHTML=''));
    $('userForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const payload={id:user?.id||uuid(),nome:$('uName').value.trim(),email:$('uEmail').value.trim().toLowerCase(),role:isSelf?user.role:$('uRole').value,ativo:editing?(isSelf?user.ativo:$('uActive').checked):true};
      if($('uPassword').value) payload.password=$('uPassword').value;
      if(editing) payload.motivo=$('uReason').value.trim();
      try{
        loading(true,editing?'Atualizando usuário...':'Criando usuário...');
        const data=await api(editing?'updateUser':'createUser',editing?{id:user.id,user:payload}:{user:payload});
        await state.db.put('usuarios',data.user);
        if(state.user && String(state.user.id)===String(data.user.id)){
          state.user=data.user;
          const cached=await getCachedSession();
          if(cached) await saveSession({...cached,user:data.user});
          $('userName').textContent=data.user.nome||data.user.email;
          $('userInitials').textContent=(data.user.nome||data.user.email).split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
        }
        await loadLocalData();loading(false);$('modalRoot').innerHTML='';toast(editing?'Usuário atualizado.':'Usuário criado.','success');renderUsers();
      }catch(err){loading(false);toast(err.message,'error',5500);}
    });
  }

  function cardMovementLabel(type) {
    return ({SALDO_INICIAL:'Saldo inicial',CARGA:'Recarga',RENOVACAO_MENSAL:'Crédito mensal (dia 1)',EXPIRACAO_SALDO:'Zeragem do saldo remanescente',DEBITO_ABASTECIMENTO:'Abastecimento',AJUSTE_DEBITO:'Complemento de débito',AJUSTE_CREDITO:'Estorno parcial',ESTORNO_ABASTECIMENTO:'Estorno de abastecimento',ESTORNO_COMPENSACAO:'Compensação',DEBITO_COMPENSACAO:'Compensação'})[type] || type || 'Movimentação';
  }

  function renderCards() {
    if (state.user?.role !== 'ADMIN') return navigate('new');
    const cards = state.cards.slice().sort((a,b)=>String(a.nome).localeCompare(String(b.nome)));
    const totalBalance = cards.filter(c=>c.ativo!==false).reduce((sum,c)=>sum+Number(c.saldoAtual||0),0);
    const lowCards = cards.filter(c=>c.ativo!==false && Number(c.saldoAtual||0)<=Number(c.limiteAlerta||0));
    const movements = state.cardMovements.slice().sort((a,b)=>new Date(b.dataHora)-new Date(a.dataHora)).slice(0,100);
    $('view-cards').innerHTML = `
      <div class="metric-grid card-metrics">
        <article class="metric-card"><div class="metric-top">Saldo total disponível <span class="metric-icon">R$</span></div><div class="metric-value">${fmtMoney(totalBalance)}</div><div class="metric-note">Soma dos cartões ativos</div></article>
        <article class="metric-card"><div class="metric-top">Cartões ativos <span class="metric-icon">▣</span></div><div class="metric-value">${cards.filter(c=>c.ativo!==false).length}</div><div class="metric-note">${cards.length} cadastrado(s)</div></article>
        <article class="metric-card"><div class="metric-top">Saldo baixo <span class="metric-icon">⚠</span></div><div class="metric-value">${lowCards.length}</div><div class="metric-note">Atingiram o limite de alerta</div></article>
      </div>
      <div class="toolbar-row"><span class="muted">Os saldos são atualizados pelos abastecimentos sincronizados e pelas recargas registradas.</span><button class="btn btn-primary btn-sm" id="createCardBtn">＋ Cadastrar cartão</button></div>
      <div class="card-grid payment-card-grid">${cards.map(card=>{
        const low=card.ativo!==false && Number(card.saldoAtual||0)<=Number(card.limiteAlerta||0);
        return `<article class="payment-card ${card.ativo===false?'payment-card-inactive':''}">
          <div class="payment-card-head"><span class="payment-card-chip">▣</span><span class="status-pill ${card.ativo===false?'status-pending':low?'status-warning':'status-ok'}">${card.ativo===false?'Inativo':low?'Saldo baixo':'Ativo'}</span></div>
          <div class="payment-card-name">${esc(card.nome)}</div><div class="payment-card-number">${card.ultimos4?'•••• '+esc(card.ultimos4):'Final do cartão não informado'}</div>
          <div class="payment-card-balance-label">Saldo disponível</div><div class="payment-card-balance">${fmtMoney(card.saldoAtual)}</div>
          <div class="payment-card-meta"><span>Crédito mensal (dia 1)</span><b>${fmtMoney(card.creditoMensal ?? card.saldoInicial)}</b><span>Alerta de saldo</span><b>${fmtMoney(card.limiteAlerta)}</b></div><div class="payment-card-meta"><span>Último ciclo</span><b>${esc(card.ultimoCicloMensal || '—')}</b></div>
          <div class="payment-card-actions"><button class="btn btn-outline btn-sm" data-card-credit="${esc(card.id)}">＋ Registrar recarga</button><button class="btn btn-outline btn-sm" data-card-edit="${esc(card.id)}">✎ Editar</button></div>
        </article>`;
      }).join('')||'<div class="empty-state">Nenhum cartão cadastrado. Cadastre os cartões para liberar os lançamentos de abastecimento.</div>'}</div>
      <div class="table-card card-ledger"><div class="table-head"><div><h3>Extrato de movimentações</h3><div class="panel-subtitle">Últimas 100 movimentações registradas</div></div></div><div class="table-wrap"><table><thead><tr><th>Data / hora</th><th>Cartão</th><th>Movimentação</th><th>Valor</th><th>Saldo anterior</th><th>Saldo posterior</th><th>Placa / referência</th><th>Responsável</th><th>Justificativa</th></tr></thead><tbody>${movements.map(m=>`<tr><td>${fmtDateTime(m.dataHora)}</td><td><strong>${esc(m.cartaoNome||'—')}</strong></td><td>${esc(cardMovementLabel(m.tipo))}</td><td>${fmtMoney(m.valor)}</td><td>${fmtMoney(m.saldoAntes)}</td><td>${fmtMoney(m.saldoDepois)}</td><td>${esc(m.placa||m.descricao||'—')}</td><td>${esc(m.usuarioNome||'—')}</td><td>${esc(m.motivo||'—')}</td></tr>`).join('')||'<tr><td colspan="9">Nenhuma movimentação registrada.</td></tr>'}</tbody></table></div></div>`;
    $('createCardBtn')?.addEventListener('click',()=>openCardModal());
    $('view-cards').querySelectorAll('[data-card-edit]').forEach(btn=>btn.addEventListener('click',()=>openCardModal(state.cards.find(c=>String(c.id)===btn.dataset.cardEdit))));
    $('view-cards').querySelectorAll('[data-card-credit]').forEach(btn=>btn.addEventListener('click',()=>openCardCreditModal(state.cards.find(c=>String(c.id)===btn.dataset.cardCredit))));
  }

  function openCardModal(card=null) {
    const editing=!!card;
    $('modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal-card"><div class="modal-header"><h3>${editing?'Editar cartão':'Cadastrar cartão'}</h3><button class="icon-btn" data-card-close>×</button></div>
      <form id="cardForm"><div class="modal-body"><div class="form-grid">
        <div class="field full"><label>Nome para identificação *<input id="cardName" required maxlength="80" value="${esc(card?.nome||'')}" placeholder="Ex.: Cartão Frota 01"></label></div>
        <div class="field"><label>Últimos 4 dígitos (opcional)<input id="cardLast4" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" value="${esc(card?.ultimos4||'')}" placeholder="1234"></label></div>
        ${editing?`<div class="field"><label>Crédito mensal fixo (R$)<input id="cardMonthlyCredit" type="number" min="0" step="0.01" required value="${Number(card.creditoMensal ?? card.saldoInicial ?? 0)}"></label></div><div class="field"><label>Limite de alerta (R$)<input id="cardAlert" type="number" min="0" step="0.01" required value="${Number(card.limiteAlerta||0)}"></label></div><div class="field full"><label class="check-line"><input id="cardActive" type="checkbox" ${card.ativo===false?'':'checked'}><span><b>Cartão ativo</b><br><small class="help">Cartões inativos não poderão ser selecionados em novos abastecimentos.</small></span></label></div><div class="field full"><label>Motivo da alteração *<textarea id="cardReason" required minlength="5" maxlength="500" placeholder="Descreva o motivo da alteração"></textarea></label></div>`:`<div class="field"><label>Saldo inicial (R$) *<input id="cardInitial" type="number" min="0" step="0.01" required value="0"></label></div><div class="field"><label>Crédito mensal fixo (R$) *<input id="cardMonthlyCredit" type="number" min="0" step="0.01" required value="0"></label></div><div class="field"><label>Limite de alerta (R$)<input id="cardAlert" type="number" min="0" step="0.01" value="0"></label></div><div class="field full"><span class="help">No dia 1º de cada mês, o saldo restante será zerado e o cartão receberá novamente o crédito mensal fixo. A renovação fica registrada no extrato.</span></div>`}
      </div></div><div class="modal-footer"><button type="button" class="btn btn-outline" data-card-close>Cancelar</button><button type="submit" class="btn btn-primary">${editing?'Salvar alterações':'Cadastrar cartão'}</button></div></form></div></div>`;
    $('modalRoot').querySelectorAll('[data-card-close]').forEach(b=>b.addEventListener('click',()=>$('modalRoot').innerHTML=''));
    $('cardForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const payload={nome:$('cardName').value.trim(),ultimos4:$('cardLast4').value.trim(),limiteAlerta:Number($('cardAlert').value||0),creditoMensal:Number($('cardMonthlyCredit').value||0)};
      try{
        loading(true,editing?'Atualizando cartão...':'Cadastrando cartão...');
        let result;
        if(editing){payload.ativo=$('cardActive').checked;payload.motivo=$('cardReason').value.trim();result=await api('updateCard',{id:card.id,card:payload});}
        else {payload.saldoInicial=Number($('cardInitial').value||0);result=await api('createCard',{card:payload});}
        await state.db.put('cartoes',result.card);
        $('modalRoot').innerHTML='';loading(false);await syncAll(false);renderCards();toast(editing?'Cartão atualizado.':'Cartão cadastrado.','success');
      }catch(err){loading(false);toast(err.message,'error',5500);}
    });
  }

  function openCardCreditModal(card) {
    if(!card)return;
    $('modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal-card"><div class="modal-header"><h3>Registrar recarga · ${esc(card.nome)}</h3><button class="icon-btn" data-card-credit-close>×</button></div><form id="cardCreditForm"><div class="modal-body"><div class="report-kv"><span>Saldo atual</span><b>${fmtMoney(card.saldoAtual)}</b></div><div class="form-grid"><div class="field full"><label>Valor da recarga (R$) *<input id="creditAmount" type="number" min="0.01" step="0.01" required placeholder="Ex.: 1.000,00"></label></div><div class="field full"><label>Descrição<input id="creditDescription" maxlength="160" value="Recarga de saldo"></label></div><div class="field full"><label>Origem / justificativa *<textarea id="creditReason" required minlength="5" maxlength="500" placeholder="Ex.: Crédito recebido da administradora"></textarea></label></div></div></div><div class="modal-footer"><button type="button" class="btn btn-outline" data-card-credit-close>Cancelar</button><button type="submit" class="btn btn-primary">Registrar recarga</button></div></form></div></div>`;
    $('modalRoot').querySelectorAll('[data-card-credit-close]').forEach(b=>b.addEventListener('click',()=>$('modalRoot').innerHTML=''));
    $('cardCreditForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const credit={valor:Number($('creditAmount').value),descricao:$('creditDescription').value.trim(),motivo:$('creditReason').value.trim()};
      try{loading(true,'Registrando recarga...');const result=await api('addCardCredit',{id:card.id,credit});await state.db.put('cartoes',result.card);$('modalRoot').innerHTML='';loading(false);await syncAll(false);renderCards();toast('Recarga registrada no extrato.','success');}
      catch(err){loading(false);toast(err.message,'error',5500);}
    });
  }

  function renderReports() {
    const records=state.records.slice();
    const byFuel=FUEL_TYPES.map(f=>({fuel:f,items:records.filter(r=>r.combustivel===f)}));
    const now=new Date();
    const thisMonth=records.filter(r=>{const d=new Date(r.dataHora);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();});
    const vehicleRows=state.vehicles.filter(v=>v.ativo!==false).map(v=>{const rs=records.filter(r=>r.placa===v.placa);return {v,rs,spend:totalValue(rs),liters:rs.reduce((s,r)=>s+Number(r.litros||0),0),eff:averageConsumption(rs)};}).sort((a,b)=>b.spend-a.spend);
    $('view-reports').innerHTML=`<div class="metric-grid"><article class="metric-card"><div class="metric-top">Gasto acumulado<span class="metric-icon">R$</span></div><div class="metric-value">${fmtMoney(totalValue(records))}</div><div class="metric-note">Todos os registros carregados</div></article><article class="metric-card"><div class="metric-top">Gasto no mês<span class="metric-icon">▦</span></div><div class="metric-value">${fmtMoney(totalValue(thisMonth))}</div><div class="metric-note">${thisMonth.length} lançamentos</div></article><article class="metric-card"><div class="metric-top">Preço médio / litro<span class="metric-icon">⛽</span></div><div class="metric-value">${records.reduce((s,r)=>s+Number(r.litros||0),0)?fmtMoney(totalValue(records)/records.reduce((s,r)=>s+Number(r.litros||0),0)):'—'}</div><div class="metric-note">Média ponderada por volume</div></article><article class="metric-card"><div class="metric-top">Alertas<span class="metric-icon">⚠</span></div><div class="metric-value">${records.filter(r=>r.alerta&&r.alerta!=='OK').length}</div><div class="metric-note">Registros sinalizados</div></article></div>
      <div class="report-grid"><article class="panel"><div class="panel-header"><div><h3>Gasto por combustível</h3><div class="panel-subtitle">Distribuição acumulada</div></div></div>${byFuel.map(x=>`<div class="report-kv"><span>${esc(x.fuel)} · ${fmtNumber(x.items.reduce((s,r)=>s+Number(r.litros||0),0),1)} L</span><b>${fmtMoney(totalValue(x.items))}</b></div>`).join('')}</article><article class="panel"><div class="panel-header"><div><h3>Critérios de leitura dos indicadores</h3><div class="panel-subtitle">Regras para interpretação gerencial</div></div></div><p class="small-note">O consumo em km/L só é apresentado em ciclos de tanque completo. Abastecimentos parciais acumulam litros até o próximo abastecimento marcado como tanque completo. Ciclos com mudança de combustível são sinalizados e não entram na média.</p><p class="small-note">Alertas de consumo são indícios para conferência, não comprovação de desvio. Compare rota, carga, trânsito, manutenção, tipo de combustível e evidências fotográficas antes de concluir.</p></article></div>
      <div class="table-card" style="margin-top:15px"><div class="table-head"><h3>Indicadores por veículo</h3><button class="btn btn-outline btn-sm" id="exportReportBtn">⇩ Exportar CSV</button></div><div class="table-wrap"><table><thead><tr><th>Placa</th><th>Abastecimentos</th><th>Litros</th><th>Gasto</th><th>Consumo km/L</th><th>Custo / km</th></tr></thead><tbody>${vehicleRows.map(x=>`<tr><td><strong>${esc(x.v.placa)}</strong></td><td>${x.rs.length}</td><td>${fmtNumber(x.liters,1)}</td><td>${fmtMoney(x.spend)}</td><td>${x.eff?`${fmtNumber(x.eff,2)} km/L`:'—'}</td><td>${x.rs.length?fmtMoney(moneyPerKm(x.rs)):'—'}</td></tr>`).join('')||'<tr><td colspan="6">Sem dados disponíveis.</td></tr>'}</tbody></table></div></div>`;
    $('exportReportBtn').addEventListener('click',exportCsv);
  }

  function exportCsv() {
    const rows=state.records.filter(r=>state.user.role==='ADMIN'||r.usuarioId===state.user.id).slice().sort((a,b)=>new Date(a.dataHora)-new Date(b.dataHora));
    const headers=['ID','Data/Hora','Placa','KM','KM anterior','Distância último trecho','Litros','Combustível','Tanque completo','Valor total','Preço/L','Cartão utilizado','Posto','Consumo km/L','Litros ciclo','Distância ciclo','Responsável','Alerta','Status'];
    const values=rows.map(r=>[r.id,r.dataHora,r.placa,r.km,r.kmAnterior,r.distanciaUltimo,r.litros,r.combustivel,r.tanqueCheio?'Sim':'Não',r.valorTotal,r.precoLitro,r.cartaoNome||'',r.posto,r.consumoKmL,r.litrosCiclo,r.distanciaCiclo,r.usuarioNome,r.alertaDescricao||r.alerta,r.syncStatus]);
    const csv='\uFEFF'+[headers,...values].map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`abastecimentos_${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);toast('Relatório CSV exportado.','success');
  }

  async function logout() {
    if (state.launchActive && !confirm('Existe um lançamento em andamento. Sair mantendo o rascunho salvo neste aparelho?')) return;
    try { if (state.token && isOnline()) await api('logout'); } catch (_) {}
    state.token=null;state.user=null;await state.db.del('session','current');clearPhotoCache();showLogin('Sessão encerrada.');
  }

  function attachGlobalEvents() {
    $('loginForm').addEventListener('submit',async e=>{e.preventDefault();const email=$('loginEmail').value;const password=$('loginPassword').value;try{loading(true,'Validando acesso...');await login(email,password);loading(false);toast('Acesso autorizado.','success');}catch(err){loading(false);toast(err.message,'error',5500);$('loginStatus').textContent=err.message;}});
    $('logoutBtn').addEventListener('click',logout);
    $('syncBtn').addEventListener('click',()=>syncAll(true));
    $('mainNav').addEventListener('click',e=>{const btn=e.target.closest('[data-view]');if(btn)navigate(btn.dataset.view);});
    $('mobileMenuBtn').addEventListener('click',()=>{$('sidebar').classList.toggle('open');$('sidebarScrim').classList.toggle('show');});
    $('sidebarScrim').addEventListener('click',()=>{$('sidebar').classList.remove('open');$('sidebarScrim').classList.remove('show');});
    window.addEventListener('online',()=>{updateSyncStatus();if(state.token)syncAll(true);});
    window.addEventListener('offline',updateSyncStatus);
    window.addEventListener('popstate',()=>{
      if(state.launchActive && state.view==='new') { history.pushState({guard:true},'','#novo-abastecimento'); toast('Finalize ou mantenha o rascunho antes de sair do lançamento.','warning'); }
      else if(state.user) navigate(state.user.role==='ADMIN'?'dashboard':'new');
    });
    history.pushState({guard:true},'','#app');
    window.addEventListener('beforeunload',e=>{if(state.launchActive){e.preventDefault();e.returnValue='';}});
    let touchStartY=0;
    document.addEventListener('touchstart',e=>{if(state.view==='new'&&e.touches.length===1)touchStartY=e.touches[0].clientY;},{passive:true});
    document.addEventListener('touchmove',e=>{if(state.view!=='new'||!e.touches.length)return;const y=e.touches[0].clientY;if(window.scrollY<=0&&y>touchStartY+8){e.preventDefault();}},{passive:false});
    $('checkUpdateBtn')?.addEventListener('click', checkForAppUpdate);
    $('applyUpdateBtn')?.addEventListener('click', applyAppUpdate);
    if ('serviceWorker' in navigator) window.addEventListener('load', registerAppServiceWorker, { once: true });
  }

  async function init() {
    try {
      state.db=await new LocalDB().open();
      attachGlobalEvents();
      await loadLocalData();
      const restored=await restoreSession();
      if(!restored)showLogin();
    } catch(err) {
      showLogin(`Não foi possível iniciar o armazenamento local: ${err.message}. Atualize o navegador ou libere espaço no aparelho.`);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
