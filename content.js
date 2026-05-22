let isRunning = false; // Variable global para controlar el proceso

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "start") {
        if (!isRunning) {
            isRunning = true;
            // 1. Respondemos inmediatamente para cerrar el canal de comunicación
            // Esto evita el error "The message port closed before a response was received"
            sendResponse({ status: "iniciado" });
            bloquearPantalla("Procesando orden...");

            // 2. Ejecutamos el proceso de forma independiente
            startProcessing(msg.order, msg.items, msg.delay || 1000);
        }
    }

    if (msg.action === "stop") {
        isRunning = false;
        sendResponse({ status: "detenido" });
        desbloquearPantalla();
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
        //await sleep(delay);
    }

    //pongo la OC
    const selector = `#edNumOc`;
    //let elemento = null;
    let inputOt =await waitForElement(selector,1000);
    if(inputOt)
    {
        inputOt.focus();
        inputOt.value = order;
        inputOt.dispatchEvent(new Event("input", { bubbles: true }));
        inputOt.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true
        }));
    }

    isRunning = false;
    chrome.runtime.sendMessage({ type: "finished" });
    desbloquearPantalla();
}

async function processSingleBarcode(order, item) {
    let code = item.barcode;
    let cantidad = item.qty;


   // let input = document.getElementById("Barcode_filterBarcell");
    let input =await waitForElement('div[tabulator-field="Barcode"] .tabulator-header-filter input');
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
    //await sleep(2000);

    console.log("Esperando selector");

    //const selector = `[tabulator-field="Barcode"] .tabulator-cell__copy-cell-content:contains("${code}")`;
    //const selector = `[aria-label^="${code}"]`;
    //let elemento = null;
    let elemento = await waitForBarcode(code, 1000);
    //let elemento =await waitForElement(selector,1000);


    // Reintento para encontrar el elemento en la tabla

    if (elemento) {
        console.log("Preparando para agregar elemento");
        elemento.scrollIntoView({ behavior: "smooth", block: "center" });
        await sleep(300);

        // 3. Doble click para abrir el diálogo de cantidad
        elemento.dispatchEvent(new MouseEvent("dblclick", {
            bubbles: true, cancelable: true, view: window
        }));

        // 4. Esperar popup y escribir cantidad
        //await sleep(500); // Un poco más de tiempo para el render de Syncfusion
        console.log("Escribiendo cantidad");
        await escribirCantidad(cantidad);
        const confirmado = await confirmarDialog();
        console.log("Confirmado agregado");
        if(confirmado)
        {
            chrome.runtime.sendMessage({
                type: "added",
                order: order,
                code: code,
            });

            console.log("mensaje enviado");
        }

    } else {
        console.warn("No se encontró el barcode en la tabla:", code);
        chrome.runtime.sendMessage({ type: "log", message: `${code}`, order: order, code: code });
    }
}

async function escribirCantidad(valor) {
    //let inputQty = null;

    let inputQty =await waitForElement(".msDlg #edProdCant",2000);

    if (inputQty) {
        inputQty.focus();
        inputQty.value = valor;
        inputQty.dispatchEvent(new Event("input", { bubbles: true }));
        inputQty.dispatchEvent(new Event("change", { bubbles: true }));
        //await sleep(200);
    }
}

async function confirmarDialog() {
    let added = false;
    //let btn = document.querySelector("ejs-dialog button.e-btn.e-primary:not(.e-flat)");

    let btn =await waitForElement('.msDlg-buttons #bAceptar');

    // Intentar buscar el botón primario del diálogo
    /*if (!btn) {
        btn = document.querySelector("ejs-dialog button.e-btn:last-child");
    }*/

    if (btn) {

        btn.dispatchEvent(new MouseEvent("click", {
            bubbles: true, cancelable: true, view: window
        }));
        let btnClose =await waitForElement('.msDlg .msDlg-close-button');

        if(btnClose)
        {
            btnClose.dispatchEvent(new MouseEvent("click", {
                bubbles: true, cancelable: true, view: window
            }));
        }
        
        added = true;
        console.log("Agregando producto");
        //await sleep(8000); // Esperar que el diálogo cierre y la tabla se actualice
    }

    return added;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function bloquearPantalla(text = "Procesando...") {
    let overlay = document.createElement("div");
    overlay.id = "my-extension-overlay";

    overlay.innerHTML = `
        <div class="overlay-content">
            <div class="spinner"></div>
            <div>${text}</div>
        </div>
    `;

    document.body.appendChild(overlay);
}

function desbloquearPantalla() {
    console.log('mando a parar');
    const overlay = document.getElementById("my-extension-overlay");
    if (overlay) overlay.remove();
}

async function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const interval = 200;
        let elapsed = 0;

        const timer = setInterval(() => {
            const el = document.querySelector(selector);

            if (el) {
                clearInterval(timer);
                resolve(el);
            }

            elapsed += interval;

            if (elapsed >= timeout) {
                clearInterval(timer);
                resolve(null);
                //reject(`Elemento no encontrado: ${selector}`);
            }

        }, interval);
    });
}

async function waitForBarcode(code, timeout = 10000) {
    return new Promise((resolve) => {
        const interval = 200;
        let elapsed = 0;

        const timer = setInterval(() => {

            const elements = document.querySelectorAll(
                '[tabulator-field="Barcode"] .tabulator-cell__copy-cell-content'
            );

            const found = [...elements].find(
                el => el.textContent.trim() === code
            );

            if (found) {
                clearInterval(timer);
                resolve(found);
            }

            elapsed += interval;

            if (elapsed >= timeout) {
                clearInterval(timer);
                resolve(null);
            }

        }, interval);
    });
}