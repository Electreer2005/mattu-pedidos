# Despliegue desde el navegador en Cloudflare

La tabla orders ya fue creada manualmente. No ejecutar la migración inicial de nuevo sobre esa misma tabla.

## Workers Builds
1. Workers & Pages → Create application → Import a repository / Connect GitHub.
2. Elegir Electreer2005/mattu-pedidos, rama main. Crear un **Worker**, no un sitio estático de Pages.
3. Nombre del Worker: mattu-pedidos.
4. Build command: `pnpm run build:cloudflare`.
5. Deploy command: `pnpm exec wrangler deploy --config cloudflare/worker.generated.json`.
6. Root directory: raíz del repositorio. Node 22.13 o posterior.

El build copia el ID D1 real del archivo cloudflare/d1.jsonc al archivo generado de despliegue. El binding es DB. No escribir ni guardar credenciales en GitHub.

## Cloudflare Access
La API requiere JWT de Access firmado. Hasta configurar Access y sus variables, responde 401; esto es esperado.
1. En Zero Trust, elegir un Team domain.
2. Access → Applications → Add application → Self-hosted.
3. Proteger el hostname del Worker (o dominio propio) completo, sin restringir la ruta a /api.
4. Política Allow: incluir únicamente los correos de los empleados autorizados. No usar Everyone ni Bypass.
5. Configurar One-time PIN si se desea ingresar con código recibido por correo.
6. Copiar el Application Audience (AUD) y Team domain.
7. En el Worker → Settings → Variables and Secrets, agregar:
   - ACCESS_TEAM_DOMAIN: nombre-equipo.cloudflareaccess.com (sin https ni barra final).
   - ACCESS_AUD: el AUD de la aplicación Access.
8. Volver a desplegar si el panel lo requiere. El despliegue conserva variables del panel mediante keep_vars.

El código verifica firma RS256, emisor, audiencia y vencimiento. El correo mostrado se extrae del token validado; no acepta cabeceras de usuario ChatGPT ni un correo arbitrario.

No se guardan contraseñas de empleados en D1. La política de Access define quién puede entrar; todos los empleados admitidos comparten las órdenes.

## Comprobación
Abrir la URL con un correo autorizado, crear un pedido de prueba y verificar que desaparezca el indicador pendiente. Abrir un segundo dispositivo y comprobar su aparición. Luego probar guardar un cambio offline y reconectar. Probar un correo no autorizado.

La configuración y compilación se verificaron localmente. El despliegue real, Access y funcionamiento entre dispositivos requieren estas comprobaciones en la cuenta del negocio.

La caché offline conserva datos en cada dispositivo. Usar equipos de confianza. La app debe abrirse una primera vez con conexión. La sincronización sucede mientras está abierta, cada 15 segundos.

Documentación: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/ y https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/.
