let isRunning = false; // Variable global para controlar el proceso

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "start") {
        if (!isRunning) {
            isRunning = true;
            // 1. Respondemos inmediatamente para cerrar el canal de comunicación
            // Esto evita el error "The message port closed before a response was received"
            sendResponse({ status: "iniciado" });

            // 2. Ejecutamos el proceso de forma independiente
            startProcessing(msg.order, msg.items, msg.delay || 1000);
        }
    }

    if (msg.action === "stop") {
        isRunning = false;
        sendResponse({ status: "detenido" });
    }

    // IMPORTANTE: No retornar true si ya respondimos arriba
});

async function startProcessing(order, items, delay) {
    for (let i = 0; i < items.length; i++) {
        // Verificar si el usuario presionó "Detener"
        if (!isRunning) break;

        const item = items[i];

        // Enviar log de lo que se está procesando actualmente
        chrome.runtime.sendMessage({
            type: "update",
            code: item.barcode,
            index: i + 1,
            total: items.length
        });

        // Llamar a la lógica de barcode para este item
        await processSingleBarcode(order, item);

        // Esperar el delay configurado antes del siguiente
        await sleep(delay);
    }

    isRunning = false;
    chrome.runtime.sendMessage({ type: "finished" });
}

async function processSingleBarcode(order, item) {
    let code = item.barcode;
    let cantidad = item.qty;

    let input = document.getElementById("Barcode_filterBarcell");
    if (!input) {
        console.error("No se encontró el input de filtrado.");
        return;
    }

    // 1. Escribir barcode y filtrar
    input.focus();
    input.value = code;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true
    }));

    // 2. Esperar a que la tabla cargue el resultado
    await sleep(2000);

    const selector = `[aria-label^="${code}"]`;
    let elemento = null;

    // Reintento para encontrar el elemento en la tabla
    for (let j = 0; j < 20; j++) {
        elemento = document.querySelector(selector);
        if (elemento) break;
        await sleep(500);
    }

    if (elemento) {
        elemento.scrollIntoView({ behavior: "smooth", block: "center" });
        await sleep(300);

        // 3. Doble click para abrir el diálogo de cantidad
        elemento.dispatchEvent(new MouseEvent("dblclick", {
            bubbles: true, cancelable: true, view: window
        }));

        // 4. Esperar popup y escribir cantidad
        await sleep(1000); // Un poco más de tiempo para el render de Syncfusion
        await escribirCantidad(cantidad);
        await confirmarDialog();
    } else {
        console.warn("No se encontró el barcode en la tabla:", code);
        chrome.runtime.sendMessage({ type: "log", message: `${code}`, order: order, code: code });
    }
}

async function escribirCantidad(valor) {
    let inputQty = null;
    for (let i = 0; i < 20; i++) {
        // Selector específico para componentes Syncfusion (ejs-dialog)
        inputQty = document.querySelector("ejs-dialog input.e-numerictextbox");
        if (inputQty) break;
        await sleep(300);
    }

    if (inputQty) {
        inputQty.focus();
        inputQty.value = valor;
        inputQty.dispatchEvent(new Event("input", { bubbles: true }));
        inputQty.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(200);
    }
}

async function confirmarDialog() {
    let btn = document.querySelector("ejs-dialog button.e-btn.e-primary:not(.e-flat)");
    // Intentar buscar el botón primario del diálogo
    if (!btn) {
        btn = document.querySelector("ejs-dialog button.e-btn:last-child");
    }

    if (btn) {
        btn.click();
        await sleep(1000); // Esperar que el diálogo cierre y la tabla se actualice
    }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}