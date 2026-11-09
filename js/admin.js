import { db, auth } from './firebase.js';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  getDoc, setDoc, serverTimestamp, runTransaction, query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

let editingId = null;
let currentPhoto = '';
let productsCache = [];
let unsubs = [];

document.getElementById('login-btn').onclick = async () => {
  try {
    await signInWithEmailAndPassword(auth,
      document.getElementById('email').value,
      document.getElementById('password').value);
  } catch (e) { showLoginError(e.message); }
};

document.getElementById('register-btn').onclick = async () => {
  if (!confirm('Criar a conta de dono com este email? Só faça isso uma vez.')) return;
  try {
    await createUserWithEmailAndPassword(auth,
      document.getElementById('email').value,
      document.getElementById('password').value);
  } catch (e) { showLoginError(e.message); }
};

document.getElementById('logout-btn').onclick = () => signOut(auth);

function showLoginError(msg) {
  document.getElementById('login-error').textContent = msg;
}

onAuthStateChanged(auth, user => {
  if (user) {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('admin-view').classList.remove('hidden');
    initAdmin();
  } else {
    unsubs.forEach(u => u());
    unsubs = [];
    productsCache = [];
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('admin-view').classList.add('hidden');
  }
});

document.querySelectorAll('.tabs button').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ['produtos', 'pedidos', 'config'].forEach(t =>
      document.getElementById('tab-' + t).classList.add('hidden'));
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
  };
});

function initAdmin() {
  if (unsubs.length) return;

  unsubs.push(onSnapshot(collection(db, 'produtos'), snap => {
    productsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProductList();
  }));

  unsubs.push(onSnapshot(
    query(collection(db, 'pedidos'), orderBy('criadoEm', 'desc')),
    snap => renderOrders(snap)
  ));

  loadConfigForm();
}

function renderProductList() {
  const list = document.getElementById('product-list');
  if (!list) return;
  list.innerHTML = '';
  productsCache
    .sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '') || (a.nome || '').localeCompare(b.nome || ''))
    .forEach(p => {
      const el = document.createElement('div');
      el.className = 'admin-product';
      el.innerHTML = `
        <img src="${p.foto || 'https://via.placeholder.com/60/1a1a1a/e50914'}" />
        <div class="info">
          <strong>${p.nome}</strong>
          <small>${brl(p.preco)} • Estoque: ${p.estoque} • ${p.categoria || '-'}</small>
        </div>
        <button class="edit ghost">Editar</button>
        <button class="del ghost">Excluir</button>
      `;
      el.querySelector('.edit').onclick = () => openProductModal(p);
      el.querySelector('.del').onclick = () => deleteProduct(p.id);
      list.appendChild(el);
    });
}

document.getElementById('new-product').onclick = () => openProductModal(null);

function openProductModal(p) {
  editingId = p ? p.id : null;
  currentPhoto = p?.foto || '';
  document.getElementById('modal-title').textContent = p ? 'Editar Produto' : 'Novo Produto';
  document.getElementById('p-nome').value      = p?.nome || '';
  document.getElementById('p-categoria').value = p?.categoria || 'bebidas';
  document.getElementById('p-preco').value     = p?.preco ?? '';
  document.getElementById('p-estoque').value   = p?.estoque ?? '';
  document.getElementById('p-foto-url').value  = p?.foto?.startsWith('data:') ? '' : (p?.foto || '');
  document.getElementById('p-foto-file').value = '';
  document.getElementById('p-error').textContent = '';

  const prev = document.getElementById('p-preview');
  if (currentPhoto) { prev.src = currentPhoto; prev.style.display = 'block'; }
  else { prev.style.display = 'none'; }

  document.getElementById('product-modal').classList.remove('hidden');
}

document.getElementById('p-cancel').onclick = () =>
  document.getElementById('product-modal').classList.add('hidden');

document.getElementById('p-foto-url').addEventListener('input', e => {
  if (!e.target.value) return;
  currentPhoto = e.target.value;
  const prev = document.getElementById('p-preview');
  prev.src = currentPhoto; prev.style.display = 'block';
});

document.getElementById('p-foto-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    currentPhoto = await compressImage(file);
    const prev = document.getElementById('p-preview');
    prev.src = currentPhoto; prev.style.display = 'block';
  } catch (err) { alert('Erro na imagem: ' + err.message); }
});

document.getElementById('p-save').onclick = async () => {
  const nome      = document.getElementById('p-nome').value.trim();
  const categoria = document.getElementById('p-categoria').value;
  const preco     = parseFloat(document.getElementById('p-preco').value);
  const estoque   = parseInt(document.getElementById('p-estoque').value, 10);

  if (!nome || isNaN(preco) || isNaN(estoque)) {
    document.getElementById('p-error').textContent = 'Preencha nome, preço e estoque.';
    return;
  }
  const data = { nome, categoria, preco, estoque, foto: currentPhoto };
  try {
    if (editingId) await updateDoc(doc(db, 'produtos', editingId), data);
    else           await addDoc(collection(db, 'produtos'), data);
    document.getElementById('product-modal').classList.add('hidden');
  } catch (e) {
    document.getElementById('p-error').textContent = e.message;
  }
};

async function deleteProduct(id) {
  if (!confirm('Excluir este produto?')) return;
  await deleteDoc(doc(db, 'produtos', id));
}

function renderOrders(snap) {
  const list = document.getElementById('order-list');
  if (!list) return;
  list.innerHTML = '';
  if (snap.empty) { list.innerHTML = '<p style="color:#999">Nenhum pedido ainda.</p>'; return; }

  snap.forEach(d => {
    const p = d.data();
    const el = document.createElement('div');
    el.className = 'admin-order status-' + (p.status || 'pendente');
    const itens = (p.itens || []).map(i =>
      `<li>${i.qtd}x ${i.nome} — ${brl(i.preco * i.qtd)}</li>`).join('');

    el.innerHTML = `
      <div class="order-head">
        <strong>${p.cliente}</strong>
        <span class="badge">${p.status || 'pendente'}</span>
      </div>
      <ul>${itens}</ul>
      <p><strong>Total: ${brl(p.total)}</strong></p>
      ${p.observacao ? `<p class="obs">Obs: ${p.observacao}</p>` : ''}
      ${p.status === 'pendente'
        ? `<div class="order-actions">
             <button class="confirm primary">✅ Confirmar pedido</button>
             <button class="cancel ghost">Cancelar</button>
           </div>` : ''}
    `;
    if (p.status === 'pendente') {
      el.querySelector('.confirm').onclick = () => confirmarPedido(d.id);
      el.querySelector('.cancel').onclick  = () => cancelarPedido(d.id);
    }
    list.appendChild(el);
  });
}

async function confirmarPedido(pedidoId) {
  if (!confirm('Confirmar este pedido? O estoque será reduzido automaticamente.')) return;
  try {
    await runTransaction(db, async (tx) => {
      const pedidoRef = doc(db, 'pedidos', pedidoId);
      const pedidoSnap = await tx.get(pedidoRef);
      if (!pedidoSnap.exists()) throw new Error('Pedido não encontrado.');
      const pedido = pedidoSnap.data();
      if (pedido.status !== 'pendente') throw new Error('Pedido já foi processado.');

      const produtos = [];
      for (const item of pedido.itens) {
        const ref = doc(db, 'produtos', item.produtoId);
        const snap = await tx.get(ref);
        produtos.push({ ref, snap, item });
      }
      for (const { snap, item } of produtos) {
        if (!snap.exists()) throw new Error(`Produto removido: ${item.nome}`);
        if ((snap.data().estoque || 0) < item.qtd)
          throw new Error(`Estoque insuficiente: ${item.nome}`);
      }
      for (const { ref, snap, item } of produtos) {
        tx.update(ref, { estoque: snap.data().estoque - item.qtd });
      }
      tx.update(pedidoRef, { status: 'confirmado', confirmadoEm: serverTimestamp() });
    });
    alert('Pedido confirmado! Estoque atualizado.');
  } catch (e) { alert('Erro: ' + e.message); }
}

async function cancelarPedido(pedidoId) {
  if (!confirm('Cancelar este pedido? (não altera o estoque)')) return;
  await updateDoc(doc(db, 'pedidos', pedidoId), { status: 'cancelado' });
}

async function loadConfigForm() {
  const snap = await getDoc(doc(db, 'config', 'loja'));
  const c = snap.exists() ? snap.data() : {};
  document.getElementById('cfg-whatsapp').value = c.whatsapp || '';
}

document.getElementById('save-config').onclick = async () => {
  const whatsapp = document.getElementById('cfg-whatsapp').value.replace(/\D/g, '');
  await setDoc(doc(db, 'config', 'loja'), { whatsapp }, { merge: true });
  alert('Configurações salvas!');
};

function brl(n) {
  return 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',');
}

function compressImage(file, maxSize = 500, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > height && width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
        else if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
