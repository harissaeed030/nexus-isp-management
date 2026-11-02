(() => {
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.getElementById('menuBtn');
  const toast = document.getElementById('toast');
  let toastTimer;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }
  menuBtn?.addEventListener('click', () => sidebar?.classList.toggle('open'));
  document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', () => sidebar?.classList.remove('open'));
  });
  document.getElementById('dismissNotice')?.addEventListener('click', () => {
    document.querySelector('.notice')?.remove();
  });
  document.getElementById('addCustomer')?.addEventListener('click', () => {
    showToast('Customer creation will be enabled when the secure backend is added.');
  });
  // This prototype intentionally uses sample data and does not persist customer information.
})();
