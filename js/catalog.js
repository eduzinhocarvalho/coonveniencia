import { db } from './firebase.js';
import {
  collection, onSnapshot, addDoc, doc, getDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

let products = [];
let cart = {};
let config = { nome: 'Loja', whatsapp: '' };

// ---------- Config da loja ----------
async function loadConfig() {
  try {
    const snap = await getDoc(doc(db, 'config', 'loja'));
    if (snap.exists()) {
      config = { ...config, ...snap.data() };
      document.getElementById('store-name').textContent = config.nome;
      document.title = config.nome;
    }
  } catch (e) { console.error(e); }
}

// ---------- Render produtos ----------
function renderProducts() {
  const term = document.getElementById('search').value.toLowerCase();
  const grid = document.getElementById('products');
  grid.innerHTML = '';

  products
    .filter(p => p.nome.toLowerCase().includes(term))
    .sort((a, b) => (a.categoria || '').localeCompare(b.categoria || ''))
    .forEach(p => {
      const esgotado = (p.estoque || 0) <= 0;
      const el = document.createElement('div');
      el.className = 'product' + (esgotado ? ' esgotado' : '');
      el.innerHTML = `
        <img src="${p.foto || 'https://via.placeholder.com/300x300?text=Sem+foto'}" alt="${p.nome}">
        <h3>${p.nome}</h3>
        ${p.categoria ? `<small>${p.categoria}</small>` : ''}
        <p class="price">${brl(p.preco)}</p>
        <p class="stock">${esgotado ? '❌ Esgotado' : '✅ Estoque: ' + p.estoque}</p>
        <button ${esgotado ? 'disabled' : ''}>Adicionar</button>
      `;
      if (!esgotado) el.querySelector('button').onclick = () => addToCart(p.id);
      grid.appendChild(el);
    });
}

// ---------- Carrinho ----------
function addToCart(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const atual = cart[id] || 0;
  if (atual >= (p.estoque || 0)) {
    alert('Quantidade máxima em estoque atingida.');
    return;
  }
  cart[id] = atual + 1;
  renderCart();
}

function removeFromCart(id) {
  if (!cart[id]) return;
  cart[id]--;
  if (cart[id] <= 0) delete cart[id];
  renderCart();
}

function renderCart() {
  const items = Object.entries(cart)
    .map(([id, qtd]) => {
      const p = products.find(x => x.id === id);
      return p ? { ...p, qtd } : null;
    })
    .filter(Boolean);

  const totalQtd = items.reduce((s, i) => s + i.qtd, 0);
  const totalValor = items.reduce((s, i) => s + i.preco * i.qtd, 0);

  document.getElementById('cart-count').textContent = totalQtd;
  document.getElementById('cart-total').textContent = brl(totalValor);
  document.getElementById('send-order').disabled = items.length === 0;

  const lista = document.getElementById('cart-items');
  lista.innerHTML = items.length ? '' : '<p>Carrinho vazio.</p>';
  items.forEach(i => {
    const row = document.createElement('div');
    row.className = 'cart-row';
    row.innerHTML = `
      <div><strong>${i.nome}</strong><br><small>${brl(i.preco)}</small></div>
      <div class="qty">
        <button>−</button><span>${i.qtd}</span><button>+</button>
      </div>
      <span>${brl(i.preco * i.qtd)}</span>
    `;
    row.querySelectorAll('button')[0].onclick = () => removeFromCart(i.id);
    row.querySelectorAll('button')[1].onclick = () => addToCart(i.id);
    lista.appendChild(row);
  });
}

// ---------- Enviar pedido ----------
async function sendOrder() {
  const btn = document.getElementById('send-order');
  const nome = document.getElementById('customer-name').value.trim();
  const obs  = document.getElementById('customer-note').value.trim();

  if (!nome) { alert('Por favor, informe seu nome.'); return; }
  if (!config.whatsapp) { alert('Número da loja ainda não configurado.'); return; }

  const items = Object.entries(cart).map(([id, qtd]) => {
    const p = products.find(x => x.id === id);
    return { produtoId: id, nome: p.nome, preco: p.preco, qtd };
  });
  if (!items.length) return;

  const total = items.reduce((s, i) => s + i.preco * i.qtd, 0);
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    // 1) Salva o pedido no Firestore (fica pendente para você confirmar)
    await addDoc(collection(db, 'pedidos'), {
      cliente: nome,
      observacao: obs,
      itens: items,
      total,
      status: 'pendente',
      criadoEm: serverTimestamp()
    });

    // 2) Monta a mensagem pro WhatsApp
    let msg = `*🛒 Novo Pedido*\n\nCliente: ${nome}\n-------------------\n`;
    items.forEach(i => {
      msg += `${i.qtd}x ${i.nome} — ${brl(i.preco * i.qtd)}\n`;
    });
    msg += `-------------------\n*Total: ${brl(total)}*`;
    if (obs) msg += `\n\nObs: ${obs}`;

    window.open(
      `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(msg)}`,
      '_blank'
    );

    // 3) Limpa
    cart = {};
    document.getElementById('customer-name').value = '';
    document.getElementById('customer-note').value = '';
    document.getElementById('cart-panel').classList.add('hidden');
    renderCart();
    alert('Pedido enviado! Finalize com a loja pelo WhatsApp.');
  } catch (e) {
    console.error(e);
    alert('Erro ao enviar: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '✅ Confirmar e enviar pedido';
  }
}

// ---------- Util ----------
function brl(n) {
  return 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',');
}

// ---------- Init ----------
function init() {
  document.getElementById('search').addEventListener('input', renderProducts);
  document.getElementById('cart-toggle').onclick = () =>
    document.getElementById('cart-panel').classList.toggle('hidden');
  document.getElementById('close-cart').onclick = () =>
    document.getElementById('cart-panel').classList.add('hidden');
  document.getElementById('send-order').onclick = sendOrder;

  loadConfig();

  onSnapshot(collection(db, 'produtos'), snap => {
    products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProducts();
    renderCart();
  });
}

init();