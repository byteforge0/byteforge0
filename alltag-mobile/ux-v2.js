'use strict';

(() => {
  let undoTimer = null;
  let pendingUndo = null;

  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function feedback() { try { navigator.vibrate?.(8); } catch {} }

  function snapshotDelete(btn) {
    const action = btn?.dataset.action, id = btn?.dataset.id;
    if (!action || !id) return null;
    if (action === 'delete-transaction') {
      const item = data.transactions.find(x=>x.id===id); return item ? { label:'Buchung', restore:()=>data.transactions.unshift(copy(item)), missing:()=>!data.transactions.some(x=>x.id===id) } : null;
    }
    if (action === 'delete-fuel') {
      const item = data.fuelEntries.find(x=>x.id===id); return item ? { label:'Tankvorgang', restore:()=>data.fuelEntries.unshift(copy(item)), missing:()=>!data.fuelEntries.some(x=>x.id===id) } : null;
    }
    if (action === 'delete-car-expense') {
      const item = data.carExpenses.find(x=>x.id===id); return item ? { label:'Autokosten', restore:()=>data.carExpenses.unshift(copy(item)), missing:()=>!data.carExpenses.some(x=>x.id===id) } : null;
    }
    if (action === 'delete-remember') {
      const item = data.remembers.find(x=>x.id===id); return item ? { label:'Eintrag', restore:()=>data.remembers.unshift(copy(item)), missing:()=>!data.remembers.some(x=>x.id===id) } : null;
    }
    if (action === 'delete-goal') {
      const goal = data.goals.find(x=>x.id===id), rows = data.savingsTransactions.filter(x=>x.goalId===id);
      return goal ? { label:'Sparziel', restore:()=>{data.goals.unshift(copy(goal));data.savingsTransactions.unshift(...copy(rows));}, missing:()=>!data.goals.some(x=>x.id===id) } : null;
    }
    return null;
  }

  function showUndo(snap) {
    clearTimeout(undoTimer);
    document.querySelector('.undo-bar')?.remove();
    pendingUndo = snap;
    const bar = document.createElement('div');
    bar.className = 'undo-bar';
    bar.innerHTML = `<span>${snap.label} gelöscht</span><button type="button">Rückgängig</button>`;
    bar.querySelector('button').addEventListener('click',()=>{
      if (!pendingUndo) return;
      pendingUndo.restore(); saveData(); render(); feedback();
      bar.remove(); pendingUndo = null; clearTimeout(undoTimer); toast('Wiederhergestellt');
    });
    document.body.append(bar);
    requestAnimationFrame(()=>bar.classList.add('show'));
    undoTimer = setTimeout(()=>{bar.classList.remove('show');setTimeout(()=>bar.remove(),180);pendingUndo=null;},5200);
  }

  document.addEventListener('click', e=>{
    const action = e.target.closest('[data-action]');
    if (action) {
      if (/^(open-quick|new-expense|new-income|new-fuel|new-car-expense|new-mood|saving|saving-first)$/.test(action.dataset.action || '')) feedback();
      const snap = snapshotDelete(action);
      if (snap) setTimeout(()=>{ if (snap.missing()) showUndo(snap); },120);
    }
    if (e.target.closest('.primary-action,.secondary-action,.sheet-save,.quick-button,[data-bank-sync-now],[data-bank-refresh]')) feedback();
  }, true);

  document.addEventListener('keydown',e=>{
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==='z' && pendingUndo) {
      e.preventDefault(); document.querySelector('.undo-bar button')?.click();
    }
  });
})();
