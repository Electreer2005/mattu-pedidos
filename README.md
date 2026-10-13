# Mattu.ar — Gestión de pedidos

Sistema interno para ventas mayoristas y piezas por encargo. Diseño marrón, blanco y negro.

## Incluido
- Panel, clientes derivados de órdenes, búsqueda y filtros.
- Órdenes con múltiples piezas, cantidades, precios, fecha y modalidad de entrega.
- Seña/pagos acumulados y saldo. Historial de estados.
- Comprobante imprimible: elegí Guardar como PDF en el diálogo del navegador.
- Cola local de cambios y sincronización cada 15 segundos mientras la app está abierta.
- Control de revisiones para evitar reemplazar cambios de otro dispositivo.

## Tecnología y base de datos
La versión publicada se construyó con React, Vite y Vinext, con rutas de servidor compatibles con Next. No es un proyecto de Vite solamente. Ya incluye un backend de referencia para Cloudflare D1 en `app/api/orders/route.ts`, esquema en `db/schema.ts` y migración SQL en `drizzle/`.

El repositorio no incluye credenciales ni el identificador del despliegue privado existente. No se conecta automáticamente a su base de datos. Para cambiar a Firebase o Supabase, reemplazá el backend y la autenticación; no expongas claves de administración en el frontend.

## Desarrollo en Windows
Instalá Node.js 22.13 o posterior y pnpm. Desde PowerShell, en esta carpeta:

```powershell
pnpm install
pnpm dev
```

Abrí la dirección mostrada en la terminal. El modo portable del proyecto permite identidad simulada exclusivamente para desarrollo local en `/signin-with-chatgpt?return_to=/`.

```powershell
pnpm exec tsc --noEmit
pnpm build
```

La base D1 local requiere aplicar la migración SQL después del build:

```powershell
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_bouncy_slapstick.sql
```

La base local y la base publicada son distintas. No vuelvas a aplicar una migración ya aplicada.

## Subir a un repositorio privado vacío
Creá `mattu-pedidos` en GitHub sin README, licencia ni gitignore. Reemplazá la URL siguiente por el enlace real:

```powershell
git init
git add .
git commit -m "Sistema inicial de pedidos Mattu.ar"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/mattu-pedidos.git
git push -u origin main
```

## Pendiente antes de usar con el negocio
- Configurar acceso individual de los 3 o 4 empleados.
- Probar funcionamiento offline e instalación en Android, iPhone y Windows; necesita una primera carga con conexión y conservar los datos del navegador.
- Probar sincronización entre dos equipos y recuperación de conflictos.
- Configurar copias de seguridad y el proveedor definitivo de base de datos.
- El comprobante no es una factura fiscal. No incluye facturación, carga de fotos ni notificaciones push.

## Validación de esta entrega
TypeScript y compilación pasaron en la versión publicada. Se verificó en SQLite que una revisión antigua no reemplaza otra más reciente. No se ejecutó una prueba visual ni entre dispositivos reales.
