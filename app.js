(() => {
  let tasks = [];
  let nextId = 1;
  const LS_KEY = 'productive_planner_tasks_v1';

  
  const tasksList = document.getElementById('tasksList');
  const newTaskInput = document.getElementById('newTaskInput');
  const addBtn = document.getElementById('addBtn');
  const tasksRemaining = document.getElementById('tasksRemaining');
  const filterButtons = document.querySelectorAll('.filters .btn');
  const searchInput = document.getElementById('searchInput');
  const selectAllChk = document.getElementById('selectAllChk');
  const newDeadline = document.getElementById('newDeadline');

  let currentFilter = 'all';
  let currentSearch = '';
  let checkIntervalId = null;
  let draggedTaskEl = null;

  // ---------- notifications (top popup) ----------
  function showPopup(message, type='success', timeout=3000) {
    const container = document.getElementById('popup-container');
    const el = document.createElement('div');
    el.className = `popup ${type}`;
    el.textContent = message;
    container.appendChild(el);
    // auto-remove
    setTimeout(() => {
      el.style.transition = 'opacity 0.6s, transform 0.6s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-8px)';
      setTimeout(()=> el.remove(), 650);
    }, timeout);
  }

  // Browser Notification wrapper
  function notifyBrowser(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, { body });
      } catch (e){}
    }
  }

  // ---------- persistence ----------
  function saveTasks() {
    localStorage.setItem(LS_KEY, JSON.stringify(tasks));
  }
  function loadTasksFromStorage() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      const arr = JSON.parse(raw);
      // revive date objects
      tasks = arr.map(t => ({
        ...t,
        deadline: t.deadline ? new Date(t.deadline).toISOString() : null
      }));
      nextId = tasks.reduce((m, t) => Math.max(m, t.id), 0) + 1;
      return true;
    } catch (e) {
      console.error('Failed to load tasks', e);
      return false;
    }
  }
