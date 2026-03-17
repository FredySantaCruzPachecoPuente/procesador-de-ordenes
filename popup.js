const urlApi = 'https://devp.market-care.com/public/index861029.php/es/api/supplyOrder/';
const urlApiGetOrder = urlApi + 'getOCProducts';
const urlApiReportError = urlApi + 'reportMissinProduct';

const stopBtn = document.getElementById('stopBtn');
const startBtn = document.getElementById('startBtn');
const progressBar = document.getElementById('progress');
const progressTxt = document.getElementById('progressTxt');
const orderInput = document.getElementById('orderNumber');

document.getElementById('startBtn').addEventListener('click', async () => {
    const orderNumber = orderInput.value.trim();

    const logsDiv = document.getElementById('logs');

    // --- NUEVO: LIMPIAR LOGS AL INICIAR ---
    if (logsDiv) logsDiv.innerHTML = "";
    // --------------------------------------


    if (!orderNumber) {
        addLog("Error: Introduce un número de orden", 'error');
        return;
    }

    //addLog(`Buscando orden #${orderNumber}...`);

    try {
        // 1. Llamada al endpoint PHP (usando el número de orden ingresado)
        let response = await fetch(urlApiGetOrder, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                orden: orderNumber
            })
        });

        if (!response.ok) {
            throw new Error("La orden no existe o hay un problema con el servidor");
        }

        // Leer SIEMPRE el body primero (clave para debug)
        let text = await response.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error("Respuesta no es JSON:", text);
            throw new Error("El servidor devolvió una respuesta inválida");
        }
        console.log("Respuesta API:", data);

        // 1. Si viene error desde backend
        if (data.error) {
            throw new Error(data.error);
        }

        // 3. Extraer productos (tu formato actual)
        const values = Object.values(data);

        if (!values.length) {
            throw new Error("No hay productos en la orden");
        }

        const items = values[0];

        if (!Array.isArray(items) || items.length === 0) {
            throw new Error("La orden no contiene productos para procesar");
        }
        addLog(`Orden encontrada: ${items.length} productos.`);

        // 2. Obtener la pestaña activa y enviar la lista completa al content.js
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) throw new Error("No se encontró pestaña activa");

        // Enviamos TODO el paquete de datos de una vez
        chrome.tabs.sendMessage(tab.id, {
            action: "start",
            order: orderNumber,
            items: items,
            delay: 1500 // Tiempo entre barcodes (ajustable)
        }, (res) => {
            if (chrome.runtime.lastError) {
                addLog("Error: Asegúrate de estar en la pestaña correcta y recargar la página.", 'error');
            } else {
                addLog("Proceso iniciado en la página...");

                stopBtn.style.display = 'block';
                startBtn.style.display = 'none';
                updateProgress(0,0);
            }
        });

    } catch (error) {
        addLog(`Error: ${error.message}`, 'error');
    }
});

// Botón Detener
document.getElementById('stopBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: "stop" }, () => {
            addLog("Solicitud de detención enviada.");
        });
    }
    stopBtn.style.display = 'none';
    startBtn.style.display = 'block';
});

// 3. ESCUCHAR MENSAJES DEL CONTENT.JS
// El content.js nos enviará actualizaciones mientras procesa
chrome.runtime.onMessage.addListener((msg) => {

    if (msg.type === "update") {
        addLog(`Procesando: ${msg.code}`);
        updateProgress(msg.index,msg.total);
    }

    if (msg.type === "added") {
        addLog(`✅ AGREGADO: ${msg.code}`, 'success');
    }

    if (msg.type === "log") {
        addLog(`❌ ERROR: ${msg.message}`, 'error');
        reportErrorToServer(msg.order, msg.code);
    }

    if (msg.type === "finished") {
        //addLog("--- PROCESO FINALIZADO ---");
        progressTxt.innerHTML = 'PROCESO FINALIZADO';
        stopBtn.style.display = 'none';
        startBtn.style.display = 'block';
        orderInput.value = '';
        playSuccessSound();
    }

    if (msg.type === "error") {
        addLog(`❌ ERROR: ${msg.message}`, 'error');
    }
});

// Función para mostrar logs en la interfaz

function addLog(message, type = "info") {
    const logsDiv = document.getElementById('logs');
    if (!logsDiv) return;

    const entry = document.createElement('div');

    // clases dinámicas
    entry.className = 'log-entry';
    if (type === "error") entry.classList.add('error');
    if (type === "success") entry.classList.add('success');

    const time = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    entry.innerHTML = `<small style="color: #888">${time}</small> ${message}`;

    logsDiv.prepend(entry);
}

function updateProgress(index, total){
    progressTxt.innerHTML = `Procesando: ${index}/${total}`
    let percent = (index/total)*100;
    progressBar.style.width = percent+"%";
}

async function reportErrorToServer(order, barcode) {
    addLog(`Reportando error: ${barcode}...`);
    try {
        fetch(urlApiReportError, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `orden=${order}&barcode=${barcode}`
        });
    } catch (err) {
        console.error("Error al reportar al endpoint de errores:", err);
    }
}

function playSuccessSound() {
    const audio = new Audio(chrome.runtime.getURL("sounds/success.mp3"));
    audio.volume = 1;

    audio.play().catch(err => {
        console.error("Error reproduciendo sonido:", err);
    });
}