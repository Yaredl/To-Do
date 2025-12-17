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
 // ---------- initial fetch if no local data ----------
  async function fetchInitialTasks() {
    try {
      const res = await fetch('https://jsonplaceholder.typicode.com/todos?_limit=12');
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      tasks = data.map(d => ({
        id: d.id,
        description: d.title,
        completed: !!d.completed,
        source: 'api',
        deadline: null,
        subtasks: [],
        notifiedSoon:false,
        notifiedOverdue:false
      }));
      nextId = tasks.reduce((m, t) => Math.max(m, t.id), 0) + 1;
      saveTasks();
      showPopup('Loaded sample tasks', 'warn');
    } catch (e) {
      console.error(e);
      showPopup('Unable to load sample tasks', 'danger');
    }
  }

  // ---------- rendering ----------
  function formatDeadline(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString();
  }

  function countRemaining() {
    return tasks.filter(t => !t.completed).length;
  }

  function applyFilters(list) {
    // Filter by creation order (unshifted tasks)
    let out = list; 
    
    // filter by currentFilter
    if (currentFilter === 'active') out = out.filter(t => !t.completed);
    else if (currentFilter === 'completed') out = out.filter(t => t.completed);
    else if (currentFilter === 'overdue') {
      out = out.filter(t => !t.completed && t.deadline && new Date(t.deadline) < new Date());
    }

    // apply search
    if (currentSearch.trim()) {
      const q = currentSearch.toLowerCase();
      out = out.filter(t => t.description.toLowerCase().includes(q) || (t.subtasks && t.subtasks.some(s=> s.text.toLowerCase().includes(q))));
    }
    return out;
  }

  function renderTasks() {
    tasksList.innerHTML = '';
    // update remaining
    tasksRemaining.textContent = `${countRemaining()} tasks remaining`;

    const visible = applyFilters(tasks);

    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.style.padding = '18px';
      empty.style.color = 'var(--muted)';
      empty.textContent = 'No todos found';
      tasksList.appendChild(empty);
      return;
    }

    visible.forEach(task => {
      // Determine if the task is overdue but not completed
      const isOverdue = task.deadline && !task.completed && new Date(task.deadline) < new Date();
      // Determine if we should disable adding subtasks
      const disableSubtaskAdd = task.completed || isOverdue;

      const taskEl = document.createElement('div');
      taskEl.className = 'task' + (isOverdue ? ' overdue' : '');
      taskEl.dataset.id = task.id;
      taskEl.setAttribute('tabindex', '0'); // For keyboard navigation
      taskEl.setAttribute('draggable', 'true'); // For Drag-and-Drop

      // Drag-and-Drop Listeners
      taskEl.addEventListener('dragstart', handleDragStart);
      taskEl.addEventListener('dragover', handleDragOver);
      taskEl.addEventListener('drop', handleDrop);
      taskEl.addEventListener('dragleave', handleDragLeave);
      taskEl.addEventListener('dragend', handleDragEnd);

      // left area
      const left = document.createElement('div');
      left.className = 'left';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = !!task.completed;
      chk.addEventListener('change', () => {
        task.completed = chk.checked;
        // when completed, mark subtasks as completed too (optional)
        // save and render
        saveTasks();
        showPopup(`Task "${task.description}" marked ${task.completed ? 'completed' : 'active'}`, 'warn');
        renderTasks();
      });

      const content = document.createElement('div');
      content.style.minWidth = '220px';

      // description (or edit mode)
      const desc = document.createElement('p');
      desc.className = 'desc' + (task.completed ? ' completed' : '');
      desc.textContent = task.description;
      content.appendChild(desc);

      // deadline
      if (task.deadline) {
        const d = document.createElement('small');
        d.textContent = `Due: ${formatDeadline(task.deadline)}`;
        content.appendChild(d);
      }

      // subtasks block
      const subtWrap = document.createElement('div');
      subtWrap.className = 'subtasks';
      if (task.subtasks && task.subtasks.length) {
        task.subtasks.forEach(st => {
          const s = document.createElement('label');
          s.className = 'subtask';
          const sch = document.createElement('input');
          sch.type = 'checkbox';
          sch.checked = !!st.completed;
          sch.addEventListener('change', () => {
            st.completed = sch.checked;
            saveTasks();
            renderTasks();
          });
          const span = document.createElement('span');
          span.textContent = st.text;
          if (st.completed) span.style.textDecoration = 'line-through';
          s.appendChild(sch);
          s.appendChild(span);

          const subDel = document.createElement('button');
          subDel.className = 'btn small';
          subDel.textContent = 'Del';
          subDel.addEventListener('click', (e) => {
            e.stopPropagation();
            task.subtasks = task.subtasks.filter(x => x.id !== st.id);
            saveTasks();
            showPopup('Subtask deleted', 'danger');
            renderTasks();
          });
          s.appendChild(subDel);

          subtWrap.appendChild(s);
        });
      }

      content.appendChild(subtWrap);

      // Check if we should render the "Add subtask" input/button
      if (!disableSubtaskAdd) {
        // Add subtask control
        const addSubRow = document.createElement('div');
        addSubRow.style.display = 'flex';
        addSubRow.style.gap = '6px';
        addSubRow.style.marginTop = '6px';

        const subInput = document.createElement('input');
        subInput.type = 'text';
        subInput.placeholder = 'Add subtask...';
        subInput.style.flex = '1';
        subInput.className = 'small';

        const subAddBtn = document.createElement('button');
        subAddBtn.className = 'btn small';
        subAddBtn.textContent = 'Add';
        subAddBtn.addEventListener('click', () => {
          const txt = subInput.value.trim();
          if (!txt) { alert('Please write something'); return; }
          const sid = Date.now() + Math.floor(Math.random()*1000);
          if (!task.subtasks) task.subtasks = [];
          task.subtasks.push({ id: sid, text: txt, completed:false });
          subInput.value = '';
          saveTasks();
          showPopup('Subtask added', 'success');
          renderTasks();
        });

        addSubRow.appendChild(subInput);
        addSubRow.appendChild(subAddBtn);

        content.appendChild(addSubRow);
      }

      left.appendChild(chk);
      left.appendChild(content);

      // right controls (edit, deadline edit, delete)
      const right = document.createElement('div');
      right.className = 'right';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn small';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => startEdit(task, taskEl));

      const delBtn = document.createElement('button');
      delBtn.className = 'btn small danger';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        if (!confirm('Delete this task?')) return;
        tasks = tasks.filter(t => t.id !== task.id);
        saveTasks();
        showPopup('Task deleted', 'danger');
        renderTasks();
      });

      right.appendChild(editBtn);
      right.appendChild(delBtn);

      taskEl.appendChild(left);
      taskEl.appendChild(right);

      tasksList.appendChild(taskEl);
    });

    // update selectAll state
    const visibleIds = visible.map(t => t.id);
    const allChecked = visible.length > 0 && visible.every(t => t.completed);
    selectAllChk.checked = allChecked;
  }

 // ---------- editing ----------
  function startEdit(task, taskEl) {
    // replace the content area with inputs and Save/Cancel visible
    const left = taskEl.querySelector('.left');
    left.innerHTML = ''; // clear
    const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = task.completed;
    chk.addEventListener('change', ()=> task.completed = chk.checked);

    const content = document.createElement('div');
    content.style.flex = '1';
    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.value = task.description;
    descInput.style.fontSize = '16px';
    descInput.style.padding = '10px';
    descInput.style.width = '100%';

    const deadlineInput = document.createElement('input');
    deadlineInput.type = 'datetime-local';
    deadlineInput.value = task.deadline ? new Date(task.deadline).toISOString().slice(0,16) : '';

    content.appendChild(descInput);
    content.appendChild(document.createElement('br'));
    content.appendChild(deadlineInput);

    const ctl = document.createElement('div');
    ctl.className = 'edit-controls';

    const save = document.createElement('button');
    save.className = 'btn primary small';
    save.textContent = 'Save';
    save.addEventListener('click', () => {
      const newDesc = descInput.value.trim();
      if (!newDesc) { alert('Please write something'); return; }
      
      const potentialDeadlineValue = deadlineInput.value;
      if (potentialDeadlineValue) {
        const potentialDeadline = new Date(potentialDeadlineValue);
        // Check if the new deadline is in the past
        if (potentialDeadline < new Date()) {
          alert("Cannot set a deadline in the past. Please choose a future date and time.");
          return; 
        }
        task.deadline = potentialDeadline.toISOString();
      } else {
        task.deadline = null;
      }
      
      task.description = newDesc;
      task.completed = chk.checked;
      // reset notified flags so new deadlines can be re-notified
      task.notifiedSoon = false;
      task.notifiedOverdue = false;
      saveTasks();
      showPopup('Task updated', 'success');
      renderTasks();
    });

    const cancel = document.createElement('button');
    cancel.className = 'btn small';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => renderTasks());

    ctl.appendChild(save);
    ctl.appendChild(cancel);

    left.appendChild(chk);
    left.appendChild(content);
    left.appendChild(ctl);
  }

  // ---------- add task ----------
  function addTask() {
    const txt = newTaskInput.value.trim();
    if (!txt) { alert('Please write something'); return; }
    
    const dValue = newDeadline.value;
    let d = null;

    if (dValue) {
      const potentialDeadline = new Date(dValue);
      // DEADLINE CHECK 
      if (potentialDeadline < new Date()) {
        alert("The deadline you entered is already passed. Please enter a future date and time.");
        newDeadline.focus();
        return; // STOP task creation
      }
      d = potentialDeadline.toISOString();
    }

    const id = nextId++;
    const t = {
      id,
      description: txt,
      completed: false,
      source: 'user',
      deadline: d,
      subtasks: [],
      notifiedSoon:false,
      notifiedOverdue:false
    };
    tasks.unshift(t); // newest first
    newTaskInput.value = '';
    newDeadline.value = '';
    saveTasks();
    renderTasks();
    showPopup('Task added', 'success');
    newTaskInput.focus();
  }
  // ---------- drag and drop handlers (RETAINED) ----------
  function handleDragStart(e) {
    draggedTaskEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.id);
    setTimeout(() => this.style.opacity = '0.4', 0);
  }

  function handleDragOver(e) {
    e.preventDefault(); // crucial to allow drop
    e.dataTransfer.dropEffect = 'move';
    if (this !== draggedTaskEl) {
      this.classList.add('drag-over');
    }
  }

  function handleDragLeave() {
    this.classList.remove('drag-over');
  }

  function handleDrop(e) {
    e.stopPropagation();
    this.classList.remove('drag-over');

    if (draggedTaskEl !== this) {
      const fromId = parseInt(draggedTaskEl.dataset.id);
      const toId = parseInt(this.dataset.id);

      // Get the task to move
      const taskToMove = tasks.find(t => t.id === fromId);

      // 1. Remove the task to move
      tasks = tasks.filter(t => t.id !== fromId);
      // 2. Find the task we are dropping onto
      const targetTask = tasks.find(t => t.id === toId);
      const targetIndex = tasks.indexOf(targetTask);
      // 3. Insert it at the target index
      tasks.splice(targetIndex, 0, taskToMove);

      saveTasks();
      showPopup('Task reordered', 'success');
      renderTasks();
    }
  }

  function handleDragEnd() {
    this.style.opacity = '1';
    document.querySelectorAll('.task').forEach(t => t.classList.remove('drag-over'));
    draggedTaskEl = null;
  }

