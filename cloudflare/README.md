# Cloudflare D1 para Mattu.ar

Esta configuración administra la base. No es todavía un Worker desplegable.

## Crear la base
En https://dash.cloudflare.com/, abrir D1 SQL database, elegir Create Database y nombrarla mattu-pedidos-db.
Copiar Database ID y reemplazar REEMPLAZAR_CON_DATABASE_ID en cloudflare/d1.jsonc. El ID no es una contraseña.

Como alternativa al panel, después de instalar las dependencias, ejecutar en PowerShell:

```powershell
pnpm exec wrangler login
pnpm exec wrangler d1 create mattu-pedidos-db
```

Usar el panel o la terminal para crear la base, no ambos.

## Aplicar el esquema
Con el ID configurado:

```powershell
pnpm exec wrangler d1 migrations list DB --remote --config cloudflare/d1.jsonc
pnpm exec wrangler d1 migrations apply DB --remote --config cloudflare/d1.jsonc
```

Esto crea la tabla orders mediante las migraciones del repositorio. No importa pedidos de la versión privada existente.

## Conectar la aplicación
Vite todavía usa un ID de prueba para desarrollo local. Crear D1 no conecta automáticamente la aplicación: hay que incorporar el ID real a la configuración de despliegue y conservar el binding DB.

La autenticación actual depende de ChatGPT Sites. Antes de desplegar en una cuenta propia hay que adaptar el acceso de empleados, por ejemplo usando Cloudflare Access y validando JWT en servidor. No confiar en cabeceras de correo enviadas por el navegador.

No ejecutar deploy con esta configuración de administración: no contiene un entrypoint. El siguiente paso es completar el Worker y la autenticación del equipo.

Documentación:
https://developers.cloudflare.com/d1/get-started/
https://developers.cloudflare.com/d1/reference/migrations/
