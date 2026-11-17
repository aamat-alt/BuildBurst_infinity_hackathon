// index.html - sign in, then go to the right home page for the role.
(function () {
  const { api, homeFor } = window.Nova;
  const form = document.getElementById('login-form');
  const emailEl = document.getElementById('email');
  const passwordEl = document.getElementById('password');
  const button = document.getElementById('login-submit');
  const errorEl = document.getElementById('login-error');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.toggle('hidden', !msg);
  }

  // Already logged in? Skip the form.
  api('/auth/me', { redirectOn401: false })
    .then(({ user }) => { window.location.href = homeFor(user); })
    .catch(() => { /* not logged in - stay here */ });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    button.disabled = true;
    const label = button.textContent;
    button.textContent = 'Signing in…';
    try {
      const { user } = await api('/auth/login', {
        method: 'POST',
        body: { email: emailEl.value.trim(), password: passwordEl.value },
        redirectOn401: false,
      });
      window.location.href = homeFor(user);
    } catch (err) {
      showError(err.message);
      button.disabled = false;
      button.textContent = label;
    }
  });
})();
