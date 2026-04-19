const SERVICE_UUID = "19b10000-e8f2-537e-4f6c-d104768a1214";
const CHAR_RX = "19b10002-e8f2-537e-4f6c-d104768a1214"; // Phone -> ESP
const CHAR_TX = "19b10001-e8f2-537e-4f6c-d104768a1214"; // ESP -> Phone

let bleDevice;
let bleServer;
let rxCharacteristic;
let txCharacteristic;
let isConnected = false;

let bleBuffer = "";

const btnConnect = document.getElementById('btn-connect');
const btnSend = document.getElementById('btn-send');
const statusText = document.getElementById('status-text');
const mainContent = document.getElementById('main-content');
const msgInput = document.getElementById('msg');
const promptersContainer = document.getElementById('prompters');

// --- BLE LOGIC ---
btnConnect.addEventListener('click', async () => {
  if (isConnected) {
    if (bleDevice && bleDevice.gatt.connected) {
      bleDevice.gatt.disconnect();
    }
    return;
  }

  try {
    console.log('Demande appareil BLE...');
    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }]
    });

    bleDevice.addEventListener('gattserverdisconnected', onDisconnected);

    console.log('Connexion au GATT Server...');
    statusText.innerText = "Connexion...";
    bleServer = await bleDevice.gatt.connect();

    console.log('Récupération du Service...');
    const service = await bleServer.getPrimaryService(SERVICE_UUID);

    console.log('Récupération RX (Write)...');
    rxCharacteristic = await service.getCharacteristic(CHAR_RX);

    console.log('Récupération TX (Notify)...');
    txCharacteristic = await service.getCharacteristic(CHAR_TX);
    await txCharacteristic.startNotifications();
    txCharacteristic.addEventListener('characteristicvaluechanged', handleNotifications);

    isConnected = true;
    btnConnect.innerText = "Déconnecter";
    statusText.innerText = "Connecté à " + bleDevice.name;
    statusText.style.color = "#A3D1FF";
    mainContent.style.display = "flex";

  } catch (error) {
    console.error('Erreur BLE:', error);
    statusText.innerText = "Erreur: " + error.message;
  }
});

function onDisconnected() {
  console.log('Appareil déconnecté');
  isConnected = false;
  btnConnect.innerText = "Connecter Civvi BLE";
  statusText.innerText = "Hors ligne";
  statusText.style.color = "rgba(255,255,255,0.6)";
  mainContent.style.display = "none";
}

function handleNotifications(event) {
  let value = new TextDecoder().decode(event.target.value);
  if (value.startsWith("N:")) {
    bleBuffer = value.substring(2);
  } else if (value.startsWith("A:")) {
    bleBuffer += value.substring(2);
  } else if (value.startsWith("E:")) {
    processIncomingData(bleBuffer);
    bleBuffer = "";
  }
}

async function sendToESP(text) {
  if (!rxCharacteristic) return;
  let encoder = new TextEncoder();
  
  // N: (New), A: (Append), E: (End)
  let pos = 0;
  while (pos < text.length) {
    let chunk = text.substring(pos, pos + 100);
    let str = (pos === 0 ? "N:" : "A:") + chunk;
    await rxCharacteristic.writeValue(encoder.encode(str));
    pos += 100;
  }
  await rxCharacteristic.writeValue(encoder.encode("E:"));
}

btnSend.addEventListener('click', async () => {
  let text = msgInput.value.trim();
  if (!text) return;
  msgInput.value = "";
  
  // Affichage immédiat local
  document.getElementById('mon-message-container').style.display = "flex";
  document.getElementById('mon-message-texte').innerText = text;
  
  await sendToESP(text);
});

// --- UI LOGIC ---
function couleurDepuisMac(mac) {
  let hash = 0;
  for (let i = 0; i < mac.length; i++) hash = mac.charCodeAt(i) + ((hash << 5) - hash);
  let hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 75%)`;
}

function processIncomingData(data) {
  try {
    let type = data.substring(0, 4); // "ALL|" ou "MSG|"
    let jsonStr = data.substring(4);
    
    if (type === "ALL|") {
      let array = JSON.parse(jsonStr);
      
      // Le premier message = le mien
      let monMessage = array[0];
      let othersData = array.slice(1);
      
      if (monMessage && monMessage.texte && monMessage.texte !== "En attente d'inspiration...") {
         document.getElementById('mon-message-container').style.display = "flex";
         document.getElementById('mon-message-texte').innerText = monMessage.texte;
      }
      
      renderMessages(othersData);
    } else if (type === "MSG|") {
      let m = JSON.parse(jsonStr);
      updateOrAddMessage(m);
    }
  } catch(e) {
    console.error("Erreur parsing JSON depuis ESP32", e);
  }
}

let activeMessages = [];

function updateOrAddMessage(m) {
  let found = activeMessages.find(x => x.auteur === m.auteur);
  if (found) {
    found.texte = m.texte;
    found.rssi = m.rssi;
    found.nomReseau = m.nomReseau;
  } else {
    activeMessages.push(m);
  }
  renderMessages(activeMessages);
}

function renderMessages(messagesArr) {
  activeMessages = messagesArr.sort((a, b) => a.rssi - b.rssi); 
  
  let existingIds = new Set(Array.from(promptersContainer.children).map(c => c.id));
  let newIds = new Set();

  activeMessages.forEach((m, index) => {
    let id = "msg-" + m.auteur;
    newIds.add(id);
    let line = document.getElementById(id);
    let couleurUnique = couleurDepuisMac(m.auteur);
    let texteComplet = m.texte + " \u00A0\u00A0\u00A0 \uD83C\uDF3F \u00A0\u00A0\u00A0 ";
    let textRaw = m.texte;

    if (!line) {
      let duree = Math.max(8, textRaw.length * 0.12);
      
      line = document.createElement('div');
      line.className = "esp-line";
      line.id = id;
      line.style.borderColor = couleurUnique;
      
      let cartouche = document.createElement('div');
      cartouche.className = "cartouche";
      cartouche.innerText = m.nomReseau;
      cartouche.style.color = couleurUnique;
      
      let riviere = document.createElement('div');
      riviere.className = "riviere";
      
      let anim = document.createElement('div');
      anim.className = "scrolling-text";
      anim.id = "text-" + id;
      anim.innerHTML = texteComplet;
      anim.dataset.raw = textRaw;
      anim.dataset.offset = 0;
      anim.style.animation = `scroll-left ${duree}s linear infinite`;

      anim.addEventListener("mousedown", (e) => startScratch(e, anim));
      anim.addEventListener("touchstart", (e) => startScratch(e, anim), {passive: false});

      riviere.appendChild(anim);
      line.appendChild(cartouche);
      line.appendChild(riviere);
      promptersContainer.appendChild(line);
    } else {
      let anim = document.getElementById("text-" + id);
      if (anim.dataset.raw !== textRaw) {
        let duree = Math.max(8, textRaw.length * 0.12);
        anim.innerHTML = texteComplet;
        anim.dataset.raw = textRaw;
        anim.dataset.offset = 0;
        anim.style.transform = "none";
        anim.style.animation = 'none';
        anim.offsetHeight; // trigger reflow
        anim.style.animation = `scroll-left ${duree}s linear infinite`;
      }
    }
  });

  existingIds.forEach(id => {
    if (!newIds.has(id)) { document.getElementById(id).remove(); }
  });
  
  activeMessages.forEach((m, i) => {
    let line = document.getElementById("msg-" + m.auteur);
    if(line) line.style.order = i; 
  });
}

// --- SCRATCH ET INERTIE ---
let isScratching = false, currentElem = null, startX = 0, lastX = 0, lastTime = 0, startOffset = 0, velocity = 0, inertiaId = null;

function getCurrentOffset(elem) {
  let t = window.getComputedStyle(elem).transform;
  if (t && t !== 'none') {
    let m = t.match(/matrix\(([^)]+)\)/);
    if (m) return parseFloat(m[1].split(',')[4] || 0);
  }
  return parseFloat(elem.dataset.offset || 0) || 0;
}

function startScratch(e, elem) {
  if (inertiaId) { cancelAnimationFrame(inertiaId); inertiaId = null; }
  isScratching = true;
  currentElem = elem;
  elem.style.animation = "none";
  let point = e.touches ? e.touches[0] : e;
  startX = point.clientX; lastX = point.clientX;
  lastTime = performance.now();
  startOffset = getCurrentOffset(elem);
  elem.dataset.offset = startOffset;
}

function moveScratch(e) {
  if (!isScratching || !currentElem) return;
  let point = e.touches ? e.touches[0] : e;
  let x = point.clientX, now = performance.now();
  let delta = x - startX, newOffset = startOffset + delta;
  currentElem.dataset.offset = newOffset;
  currentElem.style.transform = `translateX(${newOffset}px)`;
  let dt = now - lastTime;
  if (dt > 0) velocity = (x - lastX) / dt;
  lastX = x; lastTime = now;
}

function endScratch() {
  if (!isScratching || !currentElem) return;
  let elem = currentElem, offset = parseFloat(elem.dataset.offset || 0), v = velocity;
  isScratching = false; currentElem = null;
  const friction = 0.95;
  function step() {
    v *= friction; offset += v * 16;
    elem.dataset.offset = offset;
    elem.style.transform = `translateX(${offset}px)`;
    if (Math.abs(v) < 0.01) {
      elem.style.transform = "none";
      let duree = Math.max(8, (elem.dataset.raw || "").length * 0.12);
      elem.style.animation = `scroll-left ${duree}s linear infinite`;
      inertiaId = null; return;
    }
    inertiaId = requestAnimationFrame(step);
  }
  inertiaId = requestAnimationFrame(step);
}

document.addEventListener("mousemove", moveScratch);
document.addEventListener("touchmove", moveScratch, {passive: false});
document.addEventListener("mouseup", endScratch);
document.addEventListener("touchend", endScratch);
