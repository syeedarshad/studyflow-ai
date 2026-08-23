/**
 * StudyFlow AI — Login / Register screen logic
 * Self-contained (does not depend on app.js's ACTION_MAP system) since
 * this screen is loaded standalone, before the main app ever mounts.
 */
'use strict';

let mode = 'login'; // 'login' | 'register'

const els = {
  tabLogin:    document.getElementById('tab-login'),
  tabRegister: document.getElementById('tab-register'),
  fieldName:   document.getElementById('field-fullname'),
  fullname:    document.getElementById('auth-fullname'),
  email:       document.getElementById('auth-email'),
  password:    document.getElementById('auth-password'),
  submit:      document.getElementById('auth-submit'),
  error:       document.getElementById('auth-error'),
  hint:        document.getElementById('auth-hint'),
  form:        document.getElementById('auth-form'),
};

function setMode(next) {
  mode = next;
  els.tabLogin.classList.toggle('active', mode === 'login');
  els.tabRegister.classList.toggle('active', mode === 'register');
  els.fieldName.style.display = mode === 'register' ? 'block' : 'none';
  els.password.setAttribute('autocomplete', mode === 'register' ? 'new-password' : 'current-password');
  els.submit.textContent = mode === 'register' ? 'Create Account' : 'Sign In';
  els.hint.style.display = mode === 'register' ? 'none' : 'block';
  hideError();
}

function showError(message) {
  els.error.textContent = message;
  els.error.style.display = 'block';
}

function hideError() {
  els.error.style.display = 'none';
}

function setLoading(loading) {
  els.submit.disabled = loading;
  els.submit.textContent = loading
    ? (mode === 'register' ? 'Creating account...' : 'Signing in...')
    : (mode === 'register' ? 'Create Account' : 'Sign In');
}

els.tabLogin.addEventListener('click', () => setMode('login'));
els.tabRegister.addEventListener('click', () => setMode('register'));

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const fullName = els.fullname.value.trim();
  const email    = els.email.value.trim();
  const password = els.password.value;

  if (mode === 'register' && !fullName) return showError('Please enter your full name.');
  if (!email)    return showError('Please enter your email.');
  if (!password) return showError('Please enter your password.');

  setLoading(true);
  try {
    const res = mode === 'register'
      ? await window.AuthGateway.register(fullName, email, password)
      : await window.AuthGateway.login(email, password);

    if (!res.success) {
      showError(res.error || 'Something went wrong. Please try again.');
      setLoading(false);
      return;
    }
    // On success, the main process itself swaps the loaded window to
    // index.html — nothing more to do here.
  } catch (err) {
    showError('Could not reach the app backend. Please restart StudyFlow AI.');
    setLoading(false);
  }
});

// Convenience: pressing Enter in any field submits the form (default
// browser behavior already does this for text inputs, kept explicit
// here in case that ever changes).
document.getElementById('auth-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') els.form.requestSubmit();
});