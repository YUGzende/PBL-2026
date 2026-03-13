/* ============================================
   LOAN DEFAULT PREDICTION SYSTEM - script.js
   Rule-based financial scoring engine +
   Auth, Routing, LocalStorage management
   ============================================ */

'use strict';

// ============================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================

const ADMIN = { email: 'admin@loan.com', password: 'admin123', username: 'admin', name: 'System Admin' };

const PAGES = {
  INDEX:   'index.html',
  SIGNUP:  'signup.html',
  LOGIN:   'login.html',
  HOME:    'home.html',
  RESULT:  'result.html',
  PROFILE: 'profile.html',
  HISTORY: 'history.html',
  ADMIN:   'admin.html',
};

// Current page detection
const currentPage = () => {
  const path = window.location.pathname;
  const file = path.split('/').pop() || 'index.html';
  return file || 'index.html';
};

// ============================================================
// 2. LOCALSTORAGE HELPERS
// ============================================================

const Storage = {
  get:    (key)        => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set:    (key, val)   => localStorage.setItem(key, JSON.stringify(val)),
  remove: (key)        => localStorage.removeItem(key),

  // Users store: array of user objects
  getUsers:     () => Storage.get('ls_users') || [],
  setUsers:     (u) => Storage.set('ls_users', u),

  // Current session
  getSession:   () => Storage.get('ls_session'),
  setSession:   (s) => Storage.set('ls_session', s),
  clearSession: () => Storage.remove('ls_session'),

  // Predictions: keyed by username
  getPredictions:   (username) => Storage.get(`ls_predictions_${username}`) || [],
  addPrediction:    (username, pred) => {
    const list = Storage.getPredictions(username);
    list.unshift(pred);
    Storage.set(`ls_predictions_${username}`, list);
  },

  // Last prediction result for result page
  getLastResult: () => Storage.get('ls_last_result'),
  setLastResult: (r) => Storage.set('ls_last_result', r),
};

// ============================================================
// 3. AUTH HELPERS
// ============================================================

const Auth = {
  isLoggedIn: () => !!Storage.getSession(),
  isAdmin:    () => { const s = Storage.getSession(); return s && s.isAdmin; },
  getUser:    () => Storage.getSession(),

  register: (name, email, username, password) => {
    const users = Storage.getUsers();
    if (users.find(u => u.email === email))    return { ok: false, msg: 'Email already registered.' };
    if (users.find(u => u.username === username)) return { ok: false, msg: 'Username already taken.' };
    users.push({ name, email, username, password });
    Storage.setUsers(users);
    return { ok: true };
  },

  login: (email, password) => {
    // Admin check
    if (email === ADMIN.email && password === ADMIN.password) {
      Storage.setSession({ name: ADMIN.name, email: ADMIN.email, username: ADMIN.username, isAdmin: true });
      return { ok: true, isAdmin: true };
    }
    const users = Storage.getUsers();
    const user  = users.find(u => u.email === email && u.password === password);
    if (!user) return { ok: false, msg: 'Invalid email or password.' };
    Storage.setSession({ name: user.name, email: user.email, username: user.username, isAdmin: false });
    return { ok: true, isAdmin: false };
  },

  logout: () => {
    Storage.clearSession();
    window.location.href = PAGES.LOGIN;
  },
};

// ============================================================
// 4. ROUTE GUARD — runs on every page load
// ============================================================

(function routeGuard() {
  const page    = currentPage();
  const authed  = Auth.isLoggedIn();
  const isAdmin = Auth.isAdmin();

  const publicPages = ['index.html', 'signup.html', 'login.html', ''];
  const adminPages  = ['admin.html'];
  const userPages   = ['home.html', 'result.html', 'profile.html', 'history.html'];

  if (publicPages.includes(page)) {
    // If already logged in, redirect appropriately
    if (authed) {
      if (isAdmin) window.location.href = PAGES.ADMIN;
      else window.location.href = PAGES.HOME;
    }
    return;
  }

  if (!authed) { window.location.href = PAGES.LOGIN; return; }

  if (adminPages.includes(page) && !isAdmin) { window.location.href = PAGES.HOME; return; }
  if (userPages.includes(page)  && isAdmin)  { window.location.href = PAGES.ADMIN; return; }
})();

// ============================================================
// 5. RULE-BASED FINANCIAL SCORING ENGINE
// ============================================================

/**
 * evaluateLoan(data) → { approved, score, maxScore, reasons }
 *
 * Each factor contributes up to a max points.
 * Approval threshold: >= 60% of maxScore.
 *
 * @param {Object} data - form field values
 */
function evaluateLoan(data) {
  let score = 0;
  const maxScore = 100;
  const reasons = [];   // { text, positive }

  // ---- (A) CREDIT SCORE — 25 pts ----
  const credit = parseInt(data.creditScore);
  if (credit >= 750) {
    score += 25; reasons.push({ text: 'Excellent credit score (750+)', positive: true });
  } else if (credit >= 700) {
    score += 20; reasons.push({ text: 'Good credit score (700–749)', positive: true });
  } else if (credit >= 650) {
    score += 12; reasons.push({ text: 'Fair credit score (650–699)', positive: true });
  } else if (credit >= 600) {
    score += 5;  reasons.push({ text: 'Poor credit score (600–649)', positive: false });
  } else {
    score += 0;  reasons.push({ text: 'Very low credit score (below 600)', positive: false });
  }

  // ---- (B) DTI RATIO — 20 pts ----
  const dti = parseFloat(data.dtiRatio);
  if (dti <= 20) {
    score += 20; reasons.push({ text: 'Very low debt-to-income ratio (≤20%)', positive: true });
  } else if (dti <= 35) {
    score += 15; reasons.push({ text: 'Acceptable debt-to-income ratio (21–35%)', positive: true });
  } else if (dti <= 50) {
    score += 7;  reasons.push({ text: 'High debt-to-income ratio (36–50%)', positive: false });
  } else {
    score += 0;  reasons.push({ text: 'Very high debt-to-income ratio (above 50%)', positive: false });
  }

  // ---- (C) TOTAL INCOME — 15 pts ----
  const income = parseFloat(data.applicantIncome) + parseFloat(data.coApplicantIncome || 0);
  const loanAmt = parseFloat(data.loanAmount);
  const incomeRatio = income / loanAmt; // monthly income to loan amount ratio

  if (incomeRatio >= 0.5) {
    score += 15; reasons.push({ text: 'Strong income relative to loan amount', positive: true });
  } else if (incomeRatio >= 0.25) {
    score += 10; reasons.push({ text: 'Adequate income relative to loan amount', positive: true });
  } else if (incomeRatio >= 0.1) {
    score += 5;  reasons.push({ text: 'Moderate income relative to loan amount', positive: false });
  } else {
    score += 0;  reasons.push({ text: 'Low income relative to requested loan amount', positive: false });
  }

  // ---- (D) EMPLOYMENT TYPE — 10 pts ----
  if (data.employmentType === 'salaried') {
    score += 10; reasons.push({ text: 'Stable salaried employment', positive: true });
  } else if (data.employmentType === 'self-employed') {
    score += 6;  reasons.push({ text: 'Self-employed (moderate stability)', positive: true });
  } else if (data.employmentType === 'contract') {
    score += 4;  reasons.push({ text: 'Contract employment (lower stability)', positive: false });
  } else {
    score += 0;  reasons.push({ text: 'Unemployed or unstable employment', positive: false });
  }

  // ---- (E) SAVINGS — 10 pts ----
  const savings = parseFloat(data.savings);
  const savingsRatio = savings / loanAmt;
  if (savingsRatio >= 0.5) {
    score += 10; reasons.push({ text: 'High savings relative to loan amount', positive: true });
  } else if (savingsRatio >= 0.2) {
    score += 6;  reasons.push({ text: 'Moderate savings', positive: true });
  } else if (savingsRatio >= 0.05) {
    score += 3;  reasons.push({ text: 'Low savings', positive: false });
  } else {
    score += 0;  reasons.push({ text: 'Insufficient savings', positive: false });
  }

  // ---- (F) EXISTING LOANS — 8 pts ----
  const existingLoans = parseInt(data.existingLoans);
  if (existingLoans === 0) {
    score += 8; reasons.push({ text: 'No existing loan obligations', positive: true });
  } else if (existingLoans === 1) {
    score += 5; reasons.push({ text: 'One existing loan', positive: true });
  } else if (existingLoans === 2) {
    score += 2; reasons.push({ text: 'Two existing loans', positive: false });
  } else {
    score += 0; reasons.push({ text: 'Multiple existing loans (3+)', positive: false });
  }

  // ---- (G) EDUCATION — 5 pts ----
  if (data.education === 'postgraduate' || data.education === 'graduate') {
    score += 5; reasons.push({ text: 'Graduate or higher education level', positive: true });
  } else if (data.education === 'undergraduate') {
    score += 3; reasons.push({ text: 'Undergraduate education', positive: true });
  } else {
    score += 1; reasons.push({ text: 'Below undergraduate education level', positive: false });
  }

  // ---- (H) AGE — 4 pts ----
  const age = parseInt(data.age);
  if (age >= 25 && age <= 55) {
    score += 4; reasons.push({ text: 'Prime working age (25–55)', positive: true });
  } else if (age >= 22 && age <= 60) {
    score += 2; reasons.push({ text: 'Acceptable age range', positive: true });
  } else {
    score += 0; reasons.push({ text: 'Age outside preferred lending range', positive: false });
  }

  // ---- (I) DEPENDENTS — 3 pts ----
  const dependents = parseInt(data.dependents);
  if (dependents === 0) {
    score += 3; reasons.push({ text: 'No dependents', positive: true });
  } else if (dependents <= 2) {
    score += 2; reasons.push({ text: `${dependents} dependent(s) — manageable`, positive: true });
  } else {
    score += 0; reasons.push({ text: `${dependents} dependents — high financial obligation`, positive: false });
  }

  // ---- (J) EMPLOYER TYPE — bonus ----
  if (data.employerType === 'government') {
    score = Math.min(maxScore, score + 2);
    reasons.push({ text: 'Government employer — high job security', positive: true });
  } else if (data.employerType === 'mnc') {
    score = Math.min(maxScore, score + 1);
    reasons.push({ text: 'MNC employer — good stability', positive: true });
  }

  // ---- THRESHOLD: 60% ----
  const threshold  = Math.round(maxScore * 0.60);
  const approved   = score >= threshold;
  const percentage = Math.round((score / maxScore) * 100);

  return { approved, score, maxScore, percentage, reasons };
}

// ============================================================
// 6. PAGE-SPECIFIC INITIALIZERS
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const page = currentPage();

  // Inject sidebar user info on app pages
  if (['home.html','result.html','profile.html','history.html'].includes(page)) {
    initSidebar(false);
  }
  if (page === 'admin.html') initSidebar(true);

  // Page-specific init
  if (page === 'signup.html')  initSignup();
  if (page === 'login.html')   initLogin();
  if (page === 'home.html')    initHome();
  if (page === 'result.html')  initResult();
  if (page === 'profile.html') initProfile();
  if (page === 'history.html') initHistory();
  if (page === 'admin.html')   initAdmin();
  if (page === 'index.html' || page === '') window.location.href = PAGES.LOGIN;
});

// ============================================================
// 6A. SIDEBAR
// ============================================================

function initSidebar(isAdmin) {
  const user = Auth.getUser();

  // Active nav link
  const links = document.querySelectorAll('.sidebar-nav a');
  links.forEach(a => {
    if (a.getAttribute('href') === currentPage()) a.classList.add('active');
  });

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', e => { e.preventDefault(); Auth.logout(); });
}

// ============================================================
// 6B. SIGNUP PAGE
// ============================================================

function initSignup() {
  const form = document.getElementById('signupForm');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    clearErrors();

    const name     = val('su_name');
    const email    = val('su_email');
    const username = val('su_username');
    const password = val('su_password');
    const confirm  = val('su_confirm');

    let valid = true;
    if (!name)     { showError('su_name',     'Name is required.');           valid = false; }
    if (!email || !isValidEmail(email)) { showError('su_email', 'Valid email is required.'); valid = false; }
    if (!username || username.length < 3) { showError('su_username', 'Username must be at least 3 characters.'); valid = false; }
    if (!password || password.length < 6) { showError('su_password', 'Password must be at least 6 characters.'); valid = false; }
    if (password !== confirm) { showError('su_confirm', 'Passwords do not match.'); valid = false; }

    if (!valid) return;

    const result = Auth.register(name, email, username, password);
    if (!result.ok) { showAlert('alertBox', result.msg, 'error'); return; }

    showAlert('alertBox', 'Account created! Redirecting to login…', 'success');
    setTimeout(() => window.location.href = PAGES.LOGIN, 1500);
  });
}

// ============================================================
// 6C. LOGIN PAGE
// ============================================================

function initLogin() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    clearErrors();

    const email    = val('l_email');
    const password = val('l_password');

    let valid = true;
    if (!email)    { showError('l_email',    'Email is required.');    valid = false; }
    if (!password) { showError('l_password', 'Password is required.'); valid = false; }
    if (!valid) return;

    const result = Auth.login(email, password);
    if (!result.ok) { showAlert('alertBox', result.msg, 'error'); return; }

    if (result.isAdmin) window.location.href = PAGES.ADMIN;
    else                window.location.href = PAGES.HOME;
  });
}

// ============================================================
// 6D. HOME PAGE (Loan Application Form)
// ============================================================

function initHome() {
  const user = Auth.getUser();
  if (!user) return;

  // Welcome name
  const welcomeEl = document.getElementById('welcomeName');
  if (welcomeEl) welcomeEl.textContent = user.name.split(' ')[0];

  // Nav to apply form
  const applyBtn = document.getElementById('applyNowBtn');
  if (applyBtn) applyBtn.addEventListener('click', () => {
    document.getElementById('loanFormSection').scrollIntoView({ behavior: 'smooth' });
  });

  // Loan form submission
  const form = document.getElementById('loanForm');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!validateLoanForm()) return;

    // Gather all fields
    const data = {
      applicantIncome:   val('applicantIncome'),
      coApplicantIncome: val('coApplicantIncome') || '0',
      employmentType:    val('employmentType'),
      age:               val('age'),
      dependents:        val('dependents'),
      maritalStatus:     val('maritalStatus'),
      education:         val('education'),
      gender:            val('gender'),
      employerType:      val('employerType'),
      propertyArea:      val('propertyArea'),
      savings:           val('savings'),
      existingLoans:     val('existingLoans'),
      creditScore:       val('creditScore'),
      dtiRatio:          val('dtiRatio'),
      loanAmount:        val('loanAmount'),
      loanTerm:          val('loanTerm'),
      loanPurpose:       val('loanPurpose'),
    };

    // Run scoring engine
    const result = evaluateLoan(data);

    // Build prediction record
    const prediction = {
      id:          Date.now(),
      date:        new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }),
      loanAmount:  data.loanAmount,
      creditScore: data.creditScore,
      result:      result.approved ? 'Approved' : 'Rejected',
      score:       result.score,
      percentage:  result.percentage,
      reasons:     result.reasons,
      formData:    data,
    };

    // Save
    Storage.addPrediction(user.username, prediction);
    Storage.setLastResult(prediction);

    // Navigate to result page
    window.location.href = PAGES.RESULT;
  });
}

function validateLoanForm() {
  clearErrors();
  let valid = true;

  const requiredFields = [
    { id: 'applicantIncome',  msg: 'Applicant income is required.' },
    { id: 'employmentType',   msg: 'Employment type is required.' },
    { id: 'age',              msg: 'Age is required.' },
    { id: 'dependents',       msg: 'Number of dependents is required.' },
    { id: 'maritalStatus',    msg: 'Marital status is required.' },
    { id: 'education',        msg: 'Education is required.' },
    { id: 'gender',           msg: 'Gender is required.' },
    { id: 'employerType',     msg: 'Employer type is required.' },
    { id: 'propertyArea',     msg: 'Property area is required.' },
    { id: 'savings',          msg: 'Savings amount is required.' },
    { id: 'existingLoans',    msg: 'Existing loans is required.' },
    { id: 'creditScore',      msg: 'Credit score is required.' },
    { id: 'dtiRatio',         msg: 'DTI ratio is required.' },
    { id: 'loanAmount',       msg: 'Loan amount is required.' },
    { id: 'loanTerm',         msg: 'Loan term is required.' },
    { id: 'loanPurpose',      msg: 'Loan purpose is required.' },
  ];

  requiredFields.forEach(({ id, msg }) => {
    if (!val(id)) { showError(id, msg); valid = false; }
  });

  // Range checks
  const credit = parseInt(val('creditScore'));
  if (credit && (credit < 300 || credit > 900)) { showError('creditScore', 'Credit score must be 300–900.'); valid = false; }

  const dti = parseFloat(val('dtiRatio'));
  if (dti && (dti < 0 || dti > 100)) { showError('dtiRatio', 'DTI ratio must be 0–100%.'); valid = false; }

  const age = parseInt(val('age'));
  if (age && (age < 18 || age > 80)) { showError('age', 'Age must be 18–80.'); valid = false; }

  return valid;
}

// ============================================================
// 6E. RESULT PAGE
// ============================================================

function initResult() {
  const pred = Storage.getLastResult();
  if (!pred) { window.location.href = PAGES.HOME; return; }

  const approved = pred.result === 'Approved';

  // Icon & status
  document.getElementById('resultIcon').textContent   = approved ? '✓' : '✗';
  document.getElementById('resultIcon').className     = `result-icon ${approved ? 'approved' : 'rejected'}`;
  document.getElementById('resultStatus').textContent = approved ? 'Loan Approved' : 'Loan Rejected';
  document.getElementById('resultStatus').className   = `result-status ${approved ? 'approved' : 'rejected'}`;

  document.getElementById('resultLoanAmt').textContent =
    `Loan Amount: ₹${Number(pred.loanAmount).toLocaleString('en-IN')}  ·  Risk Score: ${pred.score}/${pred.percentage}%`;

  // Score bar
  const bar = document.getElementById('scoreBarFill');
  bar.className = `score-bar-fill ${approved ? 'approved' : 'rejected'}`;
  setTimeout(() => { bar.style.width = pred.percentage + '%'; }, 100);
  document.getElementById('scorePercent').textContent = pred.percentage + '%';

  // Reasons
  const container = document.getElementById('reasonsList');
  container.innerHTML = '';
  pred.reasons.forEach(r => {
    container.innerHTML += `
      <div class="reason-item">
        <div class="reason-dot ${r.positive ? 'pos' : 'neg'}">${r.positive ? '✓' : '✗'}</div>
        <span>${r.text}</span>
      </div>`;
  });

  // Apply again
  document.getElementById('applyAgainBtn').addEventListener('click', () => {
    window.location.href = PAGES.HOME;
  });
}

// ============================================================
// 6F. PROFILE PAGE
// ============================================================

function initProfile() {
  const user = Auth.getUser();
  if (!user) return;

  const predictions = Storage.getPredictions(user.username);
  const approved    = predictions.filter(p => p.result === 'Approved').length;
  const rejected    = predictions.filter(p => p.result === 'Rejected').length;

  // Avatar initials
  document.getElementById('profileAvatar').textContent =
    user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  document.getElementById('profileName').textContent  = user.name;
  document.getElementById('profileEmail').textContent = user.email;

  document.getElementById('metaUsername').textContent   = user.username;
  document.getElementById('metaEmail').textContent      = user.email;
  document.getElementById('metaTotal').textContent      = predictions.length;
  document.getElementById('metaApproved').textContent   = approved;
  document.getElementById('metaRejected').textContent   = rejected;
  document.getElementById('metaMember').textContent     = 'Active';
}

// ============================================================
// 6G. HISTORY PAGE
// ============================================================

function initHistory() {
  const user = Auth.getUser();
  if (!user) return;

  const predictions = Storage.getPredictions(user.username);
  const tbody       = document.getElementById('historyTbody');
  const empty       = document.getElementById('historyEmpty');

  if (!predictions.length) {
    if (tbody) tbody.closest('table').classList.add('hidden');
    if (empty) empty.classList.remove('hidden');
    return;
  }

  if (empty) empty.classList.add('hidden');

  tbody.innerHTML = predictions.map(p => `
    <tr>
      <td><strong>₹${Number(p.loanAmount).toLocaleString('en-IN')}</strong></td>
      <td>${p.creditScore}</td>
      <td>${p.formData.loanPurpose || '—'}</td>
      <td>${p.score}%</td>
      <td><span class="badge ${p.result === 'Approved' ? 'badge-success' : 'badge-danger'}">${p.result}</span></td>
      <td>${p.date}</td>
    </tr>`).join('');
}

// ============================================================
// 6H. ADMIN DASHBOARD
// ============================================================

function initAdmin() {
  // Aggregate all predictions across all users
  const allPredictions = [];
  const users = Storage.getUsers();

  users.forEach(u => {
    const preds = Storage.getPredictions(u.username);
    allPredictions.push(...preds);
  });

  const total    = allPredictions.length;
  const approved = allPredictions.filter(p => p.result === 'Approved').length;
  const rejected = allPredictions.filter(p => p.result === 'Rejected').length;
  const rate     = total > 0 ? Math.round((approved / total) * 100) : 0;

  document.getElementById('adminTotal').textContent    = total;
  document.getElementById('adminApproved').textContent = approved;
  document.getElementById('adminRejected').textContent = rejected;
  document.getElementById('adminRate').textContent     = rate + '%';

  // Recent applications table
  const tbody = document.getElementById('adminTbody');
  const empty = document.getElementById('adminEmpty');

  if (!allPredictions.length) {
    if (tbody) tbody.closest('table').classList.add('hidden');
    if (empty) empty.classList.remove('hidden');
    return;
  }

  if (empty) empty.classList.add('hidden');

  // Sort by id desc (newest first)
  const sorted = [...allPredictions].sort((a, b) => b.id - a.id).slice(0, 20);

  // Find username for each prediction
  const predByUser = {};
  users.forEach(u => {
    Storage.getPredictions(u.username).forEach(p => { predByUser[p.id] = u.username; });
  });

  tbody.innerHTML = sorted.map(p => `
    <tr>
      <td>${predByUser[p.id] || '—'}</td>
      <td><strong>₹${Number(p.loanAmount).toLocaleString('en-IN')}</strong></td>
      <td>${p.creditScore}</td>
      <td>${p.score}%</td>
      <td><span class="badge ${p.result === 'Approved' ? 'badge-success' : 'badge-danger'}">${p.result}</span></td>
      <td>${p.date}</td>
    </tr>`).join('');

  // Bar chart – score distribution buckets
  renderScoreChart(allPredictions);
}

function renderScoreChart(predictions) {
  const chart = document.getElementById('scoreChart');
  if (!chart) return;

  const buckets = { '0–20': 0, '21–40': 0, '41–60': 0, '61–80': 0, '81–100': 0 };
  predictions.forEach(p => {
    const s = p.percentage;
    if (s <= 20)      buckets['0–20']++;
    else if (s <= 40) buckets['21–40']++;
    else if (s <= 60) buckets['41–60']++;
    else if (s <= 80) buckets['61–80']++;
    else              buckets['81–100']++;
  });

  const maxVal = Math.max(...Object.values(buckets), 1);
  const colors = ['#ef4444','#f97316','#f59e0b','#3b82f6','#10b981'];
  chart.innerHTML = Object.entries(buckets).map(([label, count], i) => `
    <div class="bar-col">
      <div class="bar-fill" style="height:${Math.round((count / maxVal) * 70)}px; background:${colors[i]}; opacity:0.85;"></div>
      <div class="bar-label">${label}</div>
    </div>`).join('');
}

// ============================================================
// 7. UTILITY FUNCTIONS
// ============================================================

/** Get trimmed value of input/select by ID */
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

/** Show inline error for a field */
function showError(id, msg) {
  const el  = document.getElementById(id);
  const err = document.getElementById(id + '_err');
  if (el)  el.classList.add('error');
  if (err) { err.textContent = msg; err.classList.add('visible'); }
}

/** Clear all inline errors */
function clearErrors() {
  document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  document.querySelectorAll('.error-msg').forEach(el => { el.textContent = ''; el.classList.remove('visible'); });
  const alertBox = document.getElementById('alertBox');
  if (alertBox) alertBox.classList.add('hidden');
}

/** Show alert banner */
function showAlert(boxId, msg, type = 'error') {
  const box = document.getElementById(boxId);
  if (!box) return;
  box.textContent = msg;
  box.className   = `alert alert-${type}`;
  box.classList.remove('hidden');
}

/** Basic email validator */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
