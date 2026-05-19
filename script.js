const STORAGE_KEY = "boticaInventarioV1";
const EXPIRY_DAYS = 30;

let productos = [];
let lotes = [];
let movimientos = [];
let html5QrCode = null;
let scannerActivo = false;

const $ = (selector) => document.querySelector(selector);

document.addEventListener("DOMContentLoaded", () => {
  cargarDatos();
  bindEventos();
  renderAll();
});

function cargarDatos() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      productos = data.productos || [];
      lotes = data.lotes || [];
      movimientos = data.movimientos || [];
      return;
    } catch (error) {
      console.error("No se pudo leer localStorage", error);
    }
  }

  productos = crearProductosEjemplo();
  lotes = crearLotesEjemplo(productos);
  movimientos = [];
  guardarDatos();
}

function guardarDatos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ productos, lotes, movimientos }));
}

function crearProductosEjemplo() {
  return [
    crearProductoBase("Paracetamol", "Paracetamol", "500mg", "Tableta", "Caja x 100", "Genfar", "Analgesico", "7750001000011", 20),
    crearProductoBase("Ibuprofeno", "Ibuprofeno", "400mg", "Tableta", "Caja x 100", "Medifarma", "Antiinflamatorio", "7750001000028", 15),
    crearProductoBase("Amoxicilina", "Amoxicilina", "500mg", "Capsula", "Caja x 100", "Portugal", "Antibiotico", "7750001000035", 12),
    crearProductoBase("Loratadina", "Loratadina", "10mg", "Tableta", "Caja x 100", "Farmindustria", "Antihistaminico", "7750001000042", 10)
  ];
}

function crearProductoBase(nombre, principioActivo, concentracion, forma, presentacion, laboratorio, categoria, codigoBarras, stockMinimo) {
  return {
    id: generarId(),
    nombre,
    principioActivo,
    concentracion,
    forma,
    presentacion,
    laboratorio,
    categoria,
    codigoBarras,
    stockMinimo,
    estado: "activo",
    creado: new Date().toISOString()
  };
}

function crearLotesEjemplo(listaProductos) {
  const hoy = new Date();
  const fecha = (dias) => {
    const futura = new Date(hoy);
    futura.setDate(futura.getDate() + dias);
    return futura.toISOString().slice(0, 10);
  };

  return [
    crearLoteBase(listaProductos[0].id, "PCT-2026-A", 60, 42, fecha(80)),
    crearLoteBase(listaProductos[1].id, "IBU-2026-B", 30, 12, fecha(25)),
    crearLoteBase(listaProductos[2].id, "AMX-2026-C", 20, 8, fecha(-5)),
    crearLoteBase(listaProductos[3].id, "LOR-2026-D", 50, 36, fecha(130))
  ];
}

function crearLoteBase(productoId, numero, cantidadInicial, cantidadActual, fechaVencimiento) {
  return {
    id: generarId(),
    productoId,
    numero,
    cantidadInicial,
    cantidadActual,
    fechaVencimiento,
    creado: new Date().toISOString()
  };
}

function bindEventos() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => mostrarSeccion(btn.dataset.section));
  });

  $("#menuToggle").addEventListener("click", alternarMenuMovil);
  $("#appOverlay").addEventListener("click", cerrarMenuMovil);
  $("#productoForm").addEventListener("submit", agregarProducto);
  $("#loteForm").addEventListener("submit", agregarLote);
  $("#movimientoForm").addEventListener("submit", registrarMovimiento);
  $("#limpiarProductoBtn").addEventListener("click", limpiarFormularioProducto);
  $("#limpiarLoteBtn").addEventListener("click", limpiarFormularioLote);
  $("#buscarNombre").addEventListener("input", renderProductos);
  $("#buscarCodigo").addEventListener("input", renderProductos);
  $("#scannerInput").addEventListener("keydown", manejarEscaneoPistola);
  $("#activarCamaraBtn").addEventListener("click", iniciarScannerCamara);
  $("#detenerCamaraBtn").addEventListener("click", detenerScannerCamara);
  $("#movProducto").addEventListener("change", () => renderSelectLotes($("#movProducto").value));
  $("#importForm").addEventListener("submit", importarDatos);
  $("#exportarJsonBtn").addEventListener("click", exportarRespaldoJson);
}

function mostrarSeccion(sectionId) {
  document.querySelectorAll(".section").forEach((section) => section.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.remove("active"));
  $(`#${sectionId}`).classList.add("active");
  document.querySelector(`[data-section="${sectionId}"]`).classList.add("active");
  $("#pageTitle").textContent = document.querySelector(`[data-section="${sectionId}"]`).textContent;
  cerrarMenuMovil();
  renderAll();
}

function alternarMenuMovil() {
  $("#sidebar").classList.toggle("open");
  $("#appOverlay").classList.toggle("show", $("#sidebar").classList.contains("open"));
}

function cerrarMenuMovil() {
  $("#sidebar").classList.remove("open");
  $("#appOverlay").classList.remove("show");
}

function renderAll() {
  renderDashboard();
  renderProductos();
  renderLotes();
  renderMovimientos();
  renderAlertas();
  renderSelectProductos();
}

function renderDashboard() {
  const totalStock = lotes.reduce((sum, lote) => sum + Number(lote.cantidadActual), 0);
  const bajoStock = productosActivos().filter((producto) => calcularStockProducto(producto.id) <= Number(producto.stockMinimo));
  const proximos = lotes.filter((lote) => estadoLote(lote).tipo === "proximo");
  const vencidos = lotes.filter((lote) => estadoLote(lote).tipo === "vencido");

  $("#dashboardStats").innerHTML = [
    statCard("Productos", productos.length, "green"),
    statCard("Lotes", lotes.length, "blue"),
    statCard("Stock total", totalStock, "green"),
    statCard("Stock bajo", bajoStock.length, "warning"),
    statCard("Por vencer", proximos.length, "warning"),
    statCard("Vencidos", vencidos.length, "danger")
  ].join("");

  $("#dashboardLowStock").innerHTML = bajoStock.length
    ? bajoStock.map((producto) => `
      <tr>
        <td data-label="Producto">${producto.nombre} ${producto.concentracion}</td>
        <td data-label="Stock">${calcularStockProducto(producto.id)}</td>
        <td data-label="Minimo">${producto.stockMinimo}</td>
      </tr>`).join("")
    : filaVacia("No hay productos con stock bajo.", 3);

  const vencimientos = lotes
    .filter((lote) => ["proximo", "vencido"].includes(estadoLote(lote).tipo))
    .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));

  $("#dashboardExpiry").innerHTML = vencimientos.length
    ? vencimientos.map((lote) => {
      const producto = obtenerProducto(lote.productoId);
      const estado = estadoLote(lote);
      return `<tr>
        <td data-label="Producto">${nombreProducto(producto)}</td>
        <td data-label="Lote">${lote.numero}</td>
        <td data-label="Vence">${formatearFecha(lote.fechaVencimiento)}</td>
        <td data-label="Estado">${badge(estado.texto, estado.clase)}</td>
      </tr>`;
    }).join("")
    : filaVacia("No hay vencimientos criticos.", 4);
}

function statCard(label, value, color) {
  return `<article class="stat-card ${color}"><span>${label}</span><strong>${value}</strong></article>`;
}

function renderProductos() {
  const texto = normalizar($("#buscarNombre")?.value || "");
  const codigo = normalizar($("#buscarCodigo")?.value || "");
  const filtrados = productos.filter((producto) => {
    const coincideNombre = normalizar(producto.nombre).includes(texto);
    const coincideCodigo = normalizar(producto.codigoBarras).includes(codigo);
    return coincideNombre && coincideCodigo;
  });

  $("#productosTable").innerHTML = filtrados.length
    ? filtrados.map((producto) => `
      <tr>
        <td data-label="Producto"><strong>${producto.nombre}</strong><br><small>${producto.principioActivo} ${producto.concentracion} - ${producto.forma}</small></td>
        <td data-label="Codigo">${producto.codigoBarras}</td>
        <td data-label="Laboratorio">${producto.laboratorio}</td>
        <td data-label="Stock">${calcularStockProducto(producto.id)}</td>
        <td data-label="Min.">${producto.stockMinimo}</td>
        <td data-label="Estado">${badge(producto.estado, producto.estado === "activo" ? "ok" : "gray")}</td>
        <td data-label="Acciones">
          <button class="btn small secondary" onclick="editarProducto('${producto.id}')">Editar</button>
          <button class="btn small danger" onclick="desactivarProducto('${producto.id}')">Desactivar</button>
        </td>
      </tr>`).join("")
    : filaVacia("No se encontraron productos.", 7);
}

function agregarProducto(event) {
  event.preventDefault();
  const id = $("#productoId").value;
  const data = {
    nombre: $("#nombre").value.trim(),
    principioActivo: $("#principioActivo").value.trim(),
    concentracion: $("#concentracion").value.trim(),
    forma: $("#forma").value.trim(),
    presentacion: $("#presentacion").value.trim(),
    laboratorio: $("#laboratorio").value.trim(),
    categoria: $("#categoria").value.trim(),
    codigoBarras: $("#codigoBarras").value.trim(),
    stockMinimo: Number($("#stockMinimo").value),
    estado: $("#estado").value
  };

  const codigoDuplicado = productos.some((producto) => producto.codigoBarras === data.codigoBarras && producto.id !== id);
  if (codigoDuplicado) {
    mostrarToast("Ya existe un producto con ese codigo.", true);
    return;
  }

  if (id) {
    const index = productos.findIndex((producto) => producto.id === id);
    productos[index] = { ...productos[index], ...data };
    mostrarToast("Producto actualizado.");
  } else {
    productos.push({ id: generarId(), ...data, creado: new Date().toISOString() });
    mostrarToast("Producto registrado.");
  }

  guardarDatos();
  limpiarFormularioProducto();
  renderAll();
}

function editarProducto(id) {
  const producto = obtenerProducto(id);
  if (!producto) return;
  $("#productoId").value = producto.id;
  $("#nombre").value = producto.nombre;
  $("#principioActivo").value = producto.principioActivo;
  $("#concentracion").value = producto.concentracion;
  $("#forma").value = producto.forma;
  $("#presentacion").value = producto.presentacion;
  $("#laboratorio").value = producto.laboratorio;
  $("#categoria").value = producto.categoria;
  $("#codigoBarras").value = producto.codigoBarras;
  $("#stockMinimo").value = producto.stockMinimo;
  $("#estado").value = producto.estado;
  $("#productoFormTitle").textContent = "Editar producto";
  mostrarSeccion("productos");
}

function desactivarProducto(id) {
  const producto = obtenerProducto(id);
  if (!producto) return;
  producto.estado = "inactivo";
  guardarDatos();
  renderAll();
  mostrarToast("Producto desactivado.");
}

function limpiarFormularioProducto() {
  $("#productoForm").reset();
  $("#productoId").value = "";
  $("#stockMinimo").value = 10;
  $("#estado").value = "activo";
  $("#productoFormTitle").textContent = "Registrar producto";
}

function buscarProductoPorCodigo(codigo) {
  return productos.find((producto) => normalizar(producto.codigoBarras) === normalizar(codigo));
}

function manejarEscaneoPistola(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const codigo = $("#scannerInput").value.trim();
  if (!codigo) return;
  procesarCodigoEscaneado(codigo);
  $("#scannerInput").value = "";
}

function procesarCodigoEscaneado(codigo) {
  const producto = buscarProductoPorCodigo(codigo);
  if (producto) {
    $("#scannerResult").innerHTML = `<strong>Producto encontrado:</strong><br>${producto.nombre} ${producto.concentracion}<br>Codigo: ${producto.codigoBarras}`;
    mostrarSeccion("movimientos");
    $("#movProducto").value = producto.id;
    renderSelectLotes(producto.id);
    mostrarToast("Producto seleccionado por escaneo.");
  } else {
    limpiarFormularioProducto();
    $("#codigoBarras").value = codigo;
    $("#scannerResult").innerHTML = `<strong>Codigo nuevo:</strong><br>${codigo}<br>Completa el registro del producto.`;
    mostrarSeccion("productos");
    mostrarToast("Codigo no registrado. Completa el nuevo producto.");
  }
}

async function iniciarScannerCamara() {
  if (scannerActivo) return;
  if (!window.Html5Qrcode) {
    mostrarToast("La libreria html5-qrcode aun no esta disponible.", true);
    return;
  }

  try {
    html5QrCode = new Html5Qrcode("reader");
    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 160 } },
      (decodedText) => {
        procesarCodigoEscaneado(decodedText);
        detenerScannerCamara();
      }
    );
    scannerActivo = true;
    mostrarToast("Camara activada.");
  } catch (error) {
    console.error(error);
    mostrarToast("No se pudo activar la camara. Usa HTTPS y permite el acceso.", true);
  }
}

async function detenerScannerCamara() {
  if (!html5QrCode || !scannerActivo) return;
  try {
    await html5QrCode.stop();
    html5QrCode.clear();
  } catch (error) {
    console.error(error);
  } finally {
    scannerActivo = false;
    html5QrCode = null;
  }
}

function renderLotes() {
  $("#lotesTable").innerHTML = lotes.length
    ? lotes.map((lote) => {
      const producto = obtenerProducto(lote.productoId);
      const estado = estadoLote(lote);
      return `<tr>
        <td data-label="Producto">${nombreProducto(producto)}</td>
        <td data-label="Lote">${lote.numero}</td>
        <td data-label="Inicial">${lote.cantidadInicial}</td>
        <td data-label="Actual">${lote.cantidadActual}</td>
        <td data-label="Vence">${formatearFecha(lote.fechaVencimiento)}</td>
        <td data-label="Estado">${badge(estado.texto, estado.clase)}</td>
        <td data-label="Acciones"><button class="btn small secondary" onclick="editarLote('${lote.id}')">Editar</button></td>
      </tr>`;
    }).join("")
    : filaVacia("No hay lotes registrados.", 7);
}

function agregarLote(event) {
  event.preventDefault();
  const id = $("#loteId").value;
  const data = {
    productoId: $("#loteProducto").value,
    numero: $("#numeroLote").value.trim(),
    cantidadInicial: Number($("#cantidadInicial").value),
    cantidadActual: Number($("#cantidadActual").value),
    fechaVencimiento: $("#fechaVencimiento").value
  };

  if (data.cantidadActual > data.cantidadInicial) {
    mostrarToast("La cantidad actual no puede superar la inicial.", true);
    return;
  }

  if (id) {
    const index = lotes.findIndex((lote) => lote.id === id);
    lotes[index] = { ...lotes[index], ...data };
    mostrarToast("Lote actualizado.");
  } else {
    lotes.push({ id: generarId(), ...data, creado: new Date().toISOString() });
    mostrarToast("Lote registrado.");
  }

  guardarDatos();
  limpiarFormularioLote();
  renderAll();
}

function editarLote(id) {
  const lote = lotes.find((item) => item.id === id);
  if (!lote) return;
  $("#loteId").value = lote.id;
  $("#loteProducto").value = lote.productoId;
  $("#numeroLote").value = lote.numero;
  $("#cantidadInicial").value = lote.cantidadInicial;
  $("#cantidadActual").value = lote.cantidadActual;
  $("#fechaVencimiento").value = lote.fechaVencimiento;
  $("#loteFormTitle").textContent = "Editar lote";
  mostrarSeccion("lotes");
}

function limpiarFormularioLote() {
  $("#loteForm").reset();
  $("#loteId").value = "";
  $("#loteFormTitle").textContent = "Registrar lote";
}

function renderMovimientos() {
  const ordenados = [...movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  $("#movimientosTable").innerHTML = ordenados.length
    ? ordenados.map((movimiento) => {
      const producto = obtenerProducto(movimiento.productoId);
      const lote = lotes.find((item) => item.id === movimiento.loteId);
      return `<tr>
        <td data-label="Fecha">${formatearFechaHora(movimiento.fecha)}</td>
        <td data-label="Producto">${nombreProducto(producto)}</td>
        <td data-label="Lote">${lote ? lote.numero : "Sin lote"}</td>
        <td data-label="Tipo">${badge(movimiento.tipo, movimiento.tipo === "salida" ? "warn" : "info")}</td>
        <td data-label="Cantidad">${movimiento.cantidad}</td>
        <td data-label="Motivo">${movimiento.motivo}</td>
      </tr>`;
    }).join("")
    : filaVacia("No hay movimientos registrados.", 6);
}

function registrarMovimiento(event) {
  event.preventDefault();
  const productoId = $("#movProducto").value;
  const loteId = $("#movLote").value;
  const tipo = $("#movTipo").value;
  const cantidad = Number($("#movCantidad").value);
  const motivo = $("#movMotivo").value.trim();
  const lote = lotes.find((item) => item.id === loteId);

  if (!lote) {
    mostrarToast("Selecciona un lote valido.", true);
    return;
  }

  if (tipo === "salida" && !validarStockDisponible(loteId, cantidad)) {
    mostrarToast("Stock insuficiente para registrar la salida.", true);
    return;
  }

  if (tipo === "entrada") lote.cantidadActual += cantidad;
  if (tipo === "salida") lote.cantidadActual -= cantidad;
  if (tipo === "ajuste") lote.cantidadActual = cantidad;

  movimientos.push({
    id: generarId(),
    productoId,
    loteId,
    tipo,
    cantidad,
    motivo,
    fecha: new Date().toISOString()
  });

  guardarDatos();
  $("#movimientoForm").reset();
  renderAll();
  mostrarToast("Movimiento registrado.");
}

async function importarDatos(event) {
  event.preventDefault();
  const archivo = $("#importArchivo").files[0];
  const tipo = $("#importTipo").value;
  const modo = $("#importModo").value;

  if (!archivo) {
    mostrarToast("Selecciona un archivo para importar.", true);
    return;
  }

  try {
    const contenido = await leerArchivoTexto(archivo);
    let resultado;

    if (tipo === "productosCsv") resultado = importarProductosCSV(contenido, modo);
    if (tipo === "lotesCsv") resultado = importarLotesCSV(contenido, modo);
    if (tipo === "respaldoJson") resultado = importarRespaldoJSON(contenido, modo);

    guardarDatos();
    renderAll();
    $("#importForm").reset();
    $("#importResultado").textContent = resultado;
    mostrarToast("Importacion completada.");
  } catch (error) {
    console.error(error);
    $("#importResultado").textContent = error.message;
    mostrarToast(error.message, true);
  }
}

function leerArchivoTexto(archivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsText(archivo, "UTF-8");
  });
}

function importarProductosCSV(contenido, modo) {
  const filas = parseCSV(contenido);
  if (!filas.length) throw new Error("El CSV de productos esta vacio.");

  const { headers, rows } = mapearCSV(filas);
  const requeridos = ["nombre", "principioactivo", "concentracion", "forma", "presentacion", "laboratorio", "categoria", "codigobarras", "stockminimo", "estado"];
  validarColumnas(headers, requeridos, "productos");

  if (modo === "reemplazar") {
    productos = [];
    lotes = [];
    movimientos = [];
  }

  let creados = 0;
  let actualizados = 0;

  rows.forEach((row) => {
    if (!row.codigobarras || !row.nombre) return;
    const data = {
      nombre: row.nombre,
      principioActivo: row.principioactivo,
      concentracion: row.concentracion,
      forma: row.forma,
      presentacion: row.presentacion,
      laboratorio: row.laboratorio,
      categoria: row.categoria,
      codigoBarras: row.codigobarras,
      stockMinimo: Number(row.stockminimo || 0),
      estado: normalizar(row.estado) === "inactivo" ? "inactivo" : "activo"
    };

    const existente = buscarProductoPorCodigo(data.codigoBarras);
    if (existente) {
      Object.assign(existente, data);
      actualizados++;
    } else {
      productos.push({ id: generarId(), ...data, creado: new Date().toISOString() });
      creados++;
    }
  });

  return `Productos importados. Nuevos: ${creados}. Actualizados: ${actualizados}.`;
}

function importarLotesCSV(contenido, modo) {
  const filas = parseCSV(contenido);
  if (!filas.length) throw new Error("El CSV de lotes esta vacio.");

  const { headers, rows } = mapearCSV(filas);
  const requeridos = ["codigobarras", "numero", "cantidadinicial", "cantidadactual", "fechavencimiento"];
  validarColumnas(headers, requeridos, "lotes");

  if (modo === "reemplazar") {
    lotes = [];
    movimientos = [];
  }

  let creados = 0;
  let actualizados = 0;
  let omitidos = 0;

  rows.forEach((row) => {
    const producto = buscarProductoPorCodigo(row.codigobarras);
    if (!producto || !row.numero) {
      omitidos++;
      return;
    }

    const data = {
      productoId: producto.id,
      numero: row.numero,
      cantidadInicial: Number(row.cantidadinicial || 0),
      cantidadActual: Number(row.cantidadactual || 0),
      fechaVencimiento: row.fechavencimiento
    };

    if (!data.fechaVencimiento || data.cantidadActual < 0 || data.cantidadInicial < 0) {
      omitidos++;
      return;
    }

    const existente = lotes.find((lote) => lote.productoId === producto.id && normalizar(lote.numero) === normalizar(data.numero));
    if (existente) {
      Object.assign(existente, data);
      actualizados++;
    } else {
      lotes.push({ id: generarId(), ...data, creado: new Date().toISOString() });
      creados++;
    }
  });

  return `Lotes importados. Nuevos: ${creados}. Actualizados: ${actualizados}. Omitidos: ${omitidos}.`;
}

function importarRespaldoJSON(contenido, modo) {
  const data = JSON.parse(contenido);
  if (!Array.isArray(data.productos) || !Array.isArray(data.lotes) || !Array.isArray(data.movimientos)) {
    throw new Error("El JSON debe tener productos, lotes y movimientos como listas.");
  }

  if (modo === "reemplazar") {
    productos = normalizarProductosImportados(data.productos);
    lotes = normalizarLotesImportados(data.lotes, productos);
    movimientos = normalizarMovimientosImportados(data.movimientos, productos, lotes);
    return `Respaldo restaurado. Productos: ${productos.length}. Lotes: ${lotes.length}. Movimientos: ${movimientos.length}.`;
  }

  let productosNuevos = 0;
  let productosActualizados = 0;
  const idProductoMap = new Map();

  normalizarProductosImportados(data.productos).forEach((producto) => {
    const existente = buscarProductoPorCodigo(producto.codigoBarras);
    if (existente) {
      idProductoMap.set(producto.id, existente.id);
      Object.assign(existente, { ...producto, id: existente.id });
      productosActualizados++;
    } else {
      productos.push(producto);
      idProductoMap.set(producto.id, producto.id);
      productosNuevos++;
    }
  });

  let lotesNuevos = 0;
  let lotesActualizados = 0;
  const idLoteMap = new Map();

  normalizarLotesImportados(data.lotes, productos, idProductoMap).forEach((lote) => {
    const existente = lotes.find((item) => item.productoId === lote.productoId && normalizar(item.numero) === normalizar(lote.numero));
    if (existente) {
      idLoteMap.set(lote.id, existente.id);
      Object.assign(existente, { ...lote, id: existente.id });
      lotesActualizados++;
    } else {
      lotes.push(lote);
      idLoteMap.set(lote.id, lote.id);
      lotesNuevos++;
    }
  });

  const movimientosAntes = movimientos.length;
  normalizarMovimientosImportados(data.movimientos, productos, lotes, idProductoMap, idLoteMap).forEach((movimiento) => {
    if (!movimientos.some((item) => item.id === movimiento.id)) movimientos.push(movimiento);
  });

  return `Respaldo fusionado. Productos nuevos: ${productosNuevos}, actualizados: ${productosActualizados}. Lotes nuevos: ${lotesNuevos}, actualizados: ${lotesActualizados}. Movimientos nuevos: ${movimientos.length - movimientosAntes}.`;
}

function exportarRespaldoJson() {
  const data = JSON.stringify({ productos, lotes, movimientos }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fecha = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `respaldo-botica-${fecha}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  mostrarToast("Respaldo JSON descargado.");
}

function parseCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = "";
  let dentroComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const char = texto[i];
    const siguiente = texto[i + 1];

    if (char === '"' && dentroComillas && siguiente === '"') {
      campo += '"';
      i++;
    } else if (char === '"') {
      dentroComillas = !dentroComillas;
    } else if (char === "," && !dentroComillas) {
      fila.push(campo.trim());
      campo = "";
    } else if ((char === "\n" || char === "\r") && !dentroComillas) {
      if (char === "\r" && siguiente === "\n") i++;
      fila.push(campo.trim());
      if (fila.some((valor) => valor !== "")) filas.push(fila);
      fila = [];
      campo = "";
    } else {
      campo += char;
    }
  }

  fila.push(campo.trim());
  if (fila.some((valor) => valor !== "")) filas.push(fila);
  return filas;
}

function mapearCSV(filas) {
  const headers = filas[0].map((header) => normalizarClave(header));
  const rows = filas.slice(1).map((fila) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = fila[index] || "";
    });
    return row;
  });
  return { headers, rows };
}

function validarColumnas(headers, requeridos, nombre) {
  const faltantes = requeridos.filter((columna) => !headers.includes(columna));
  if (faltantes.length) {
    throw new Error(`Al CSV de ${nombre} le faltan columnas: ${faltantes.join(", ")}.`);
  }
}

function normalizarClave(valor) {
  return normalizar(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
}

function normalizarProductosImportados(lista) {
  return lista
    .filter((producto) => producto && producto.codigoBarras && producto.nombre)
    .map((producto) => ({
      id: producto.id || generarId(),
      nombre: producto.nombre || "",
      principioActivo: producto.principioActivo || "",
      concentracion: producto.concentracion || "",
      forma: producto.forma || "",
      presentacion: producto.presentacion || "",
      laboratorio: producto.laboratorio || "",
      categoria: producto.categoria || "",
      codigoBarras: String(producto.codigoBarras),
      stockMinimo: Number(producto.stockMinimo || 0),
      estado: producto.estado === "inactivo" ? "inactivo" : "activo",
      creado: producto.creado || new Date().toISOString()
    }));
}

function normalizarLotesImportados(lista, productosDisponibles, idProductoMap = new Map()) {
  const idsProductos = new Set(productosDisponibles.map((producto) => producto.id));
  return lista
    .map((lote) => ({ ...lote, productoId: idProductoMap.get(lote.productoId) || lote.productoId }))
    .filter((lote) => lote && idsProductos.has(lote.productoId) && lote.numero)
    .map((lote) => ({
      id: lote.id || generarId(),
      productoId: lote.productoId,
      numero: lote.numero || "",
      cantidadInicial: Number(lote.cantidadInicial || 0),
      cantidadActual: Number(lote.cantidadActual || 0),
      fechaVencimiento: lote.fechaVencimiento || "",
      creado: lote.creado || new Date().toISOString()
    }));
}

function normalizarMovimientosImportados(lista, productosDisponibles, lotesDisponibles, idProductoMap = new Map(), idLoteMap = new Map()) {
  const idsProductos = new Set(productosDisponibles.map((producto) => producto.id));
  const idsLotes = new Set(lotesDisponibles.map((lote) => lote.id));
  return lista
    .map((movimiento) => ({
      ...movimiento,
      productoId: idProductoMap.get(movimiento.productoId) || movimiento.productoId,
      loteId: idLoteMap.get(movimiento.loteId) || movimiento.loteId
    }))
    .filter((movimiento) => movimiento && idsProductos.has(movimiento.productoId) && idsLotes.has(movimiento.loteId))
    .map((movimiento) => ({
      id: movimiento.id || generarId(),
      productoId: movimiento.productoId,
      loteId: movimiento.loteId,
      tipo: ["entrada", "salida", "ajuste"].includes(movimiento.tipo) ? movimiento.tipo : "ajuste",
      cantidad: Number(movimiento.cantidad || 0),
      motivo: movimiento.motivo || "Importado",
      fecha: movimiento.fecha || new Date().toISOString()
    }));
}

function validarStockDisponible(loteId, cantidad) {
  const lote = lotes.find((item) => item.id === loteId);
  return lote && Number(lote.cantidadActual) >= Number(cantidad);
}

function renderAlertas() {
  const bajoStock = productosActivos().filter((producto) => calcularStockProducto(producto.id) <= Number(producto.stockMinimo));
  const proximos = lotes.filter((lote) => estadoLote(lote).tipo === "proximo");
  const vencidos = lotes.filter((lote) => estadoLote(lote).tipo === "vencido");
  const inactivos = productos.filter((producto) => producto.estado === "inactivo");

  $("#alertasContent").innerHTML = [
    alertaCard("Productos con stock bajo", bajoStock, (producto) => `${producto.nombre} - stock ${calcularStockProducto(producto.id)} / min. ${producto.stockMinimo}`),
    alertaCard("Lotes proximos a vencer", proximos, (lote) => `${nombreProducto(obtenerProducto(lote.productoId))} - ${lote.numero} - ${formatearFecha(lote.fechaVencimiento)}`),
    alertaCard("Lotes vencidos", vencidos, (lote) => `${nombreProducto(obtenerProducto(lote.productoId))} - ${lote.numero} - ${formatearFecha(lote.fechaVencimiento)}`),
    alertaCard("Productos inactivos", inactivos, (producto) => `${producto.nombre} - ${producto.codigoBarras}`)
  ].join("");
}

function alertaCard(titulo, items, formatter) {
  const contenido = items.length
    ? `<ul class="alert-list">${items.map((item) => `<li><span>${formatter(item)}</span></li>`).join("")}</ul>`
    : `<div class="empty">Sin alertas.</div>`;
  return `<article class="alert-card"><h2>${titulo}</h2>${contenido}</article>`;
}

function renderSelectProductos() {
  const productoLoteActual = $("#loteProducto").value;
  const productoMovimientoActual = $("#movProducto").value;
  const options = productosActivos().map((producto) => `<option value="${producto.id}">${producto.nombre} ${producto.concentracion}</option>`).join("");
  $("#loteProducto").innerHTML = options || "<option value=''>No hay productos activos</option>";
  $("#movProducto").innerHTML = options || "<option value=''>No hay productos activos</option>";
  if (productoLoteActual) $("#loteProducto").value = productoLoteActual;
  if (productoMovimientoActual) $("#movProducto").value = productoMovimientoActual;
  renderSelectLotes($("#movProducto").value);
}

function renderSelectLotes(productoId) {
  const lotesProducto = lotes.filter((lote) => lote.productoId === productoId);
  $("#movLote").innerHTML = lotesProducto.length
    ? lotesProducto.map((lote) => `<option value="${lote.id}">${lote.numero} - stock ${lote.cantidadActual} - vence ${formatearFecha(lote.fechaVencimiento)}</option>`).join("")
    : "<option value=''>Sin lotes para este producto</option>";
}

function calcularStockProducto(productoId) {
  return lotes
    .filter((lote) => lote.productoId === productoId)
    .reduce((sum, lote) => sum + Number(lote.cantidadActual), 0);
}

function estadoLote(lote) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vence = new Date(`${lote.fechaVencimiento}T00:00:00`);
  const dias = Math.ceil((vence - hoy) / 86400000);

  if (dias < 0) return { tipo: "vencido", texto: "Vencido", clase: "danger" };
  if (dias <= EXPIRY_DAYS) return { tipo: "proximo", texto: "Proximo a vencer", clase: "warn" };
  return { tipo: "vigente", texto: "Vigente", clase: "ok" };
}

function productosActivos() {
  return productos.filter((producto) => producto.estado === "activo");
}

function obtenerProducto(id) {
  return productos.find((producto) => producto.id === id);
}

function nombreProducto(producto) {
  return producto ? `${producto.nombre} ${producto.concentracion}` : "Producto no encontrado";
}

function badge(texto, clase) {
  return `<span class="badge ${clase}">${texto}</span>`;
}

function filaVacia(mensaje, columnas) {
  return `<tr><td colspan="${columnas}" class="empty">${mensaje}</td></tr>`;
}

function formatearFecha(fecha) {
  if (!fecha) return "";
  return new Date(`${fecha}T00:00:00`).toLocaleDateString("es-PE");
}

function formatearFechaHora(fecha) {
  return new Date(fecha).toLocaleString("es-PE");
}

function normalizar(valor) {
  return String(valor || "").trim().toLowerCase();
}

function generarId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mostrarToast(mensaje, esError = false) {
  const toast = $("#toast");
  toast.textContent = mensaje;
  toast.classList.toggle("error", esError);
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}
