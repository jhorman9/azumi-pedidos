# Azumi - pedidos y administracion

Aplicacion recreada con Next.js App Router, React y TypeScript. Las paginas, formularios, navegacion y mapa son componentes React conectados a una API del servidor.

En desarrollo, la app usa SQLite local por defecto. En produccion puede usar MySQL/MariaDB, pensado para Hostinger.

## Ejecutar

Requiere Node.js 24 o superior.

```bash
npm install
npm run dev
```

Tienda: http://localhost:3000
Administracion: http://localhost:3000/admin

En desarrollo, sin variables configuradas, el acceso administrativo es:

```txt
admin@azumi.demo
azumi123
```

Para cambiar las credenciales, copia `.env.example` a `.env.local` y define tus valores. En produccion son obligatorios `AZUMI_ADMIN_EMAIL` y `AZUMI_ADMIN_PASSWORD`, con una contrasena de al menos 12 caracteres.

## Base de datos

Sin configurar MySQL, el catalogo y los pedidos se guardan en `data/azumi.sqlite`; esa carpeta esta excluida de Git. La base se inicializa con `lib/azumi-seed.json` solo cuando no existe.

Para usar Hostinger con MySQL/MariaDB, configura estas variables en el hosting:

```env
AZUMI_DATABASE_DRIVER=mysql
AZUMI_MYSQL_HOST=127.0.0.1
AZUMI_MYSQL_PORT=3306
AZUMI_MYSQL_DATABASE=u403768061_azumi
AZUMI_MYSQL_USER=u403768061_azumi
AZUMI_MYSQL_PASSWORD=replace-with-your-hosting-password
```

No guardes la contrasena real dentro del codigo ni en archivos que vayas a subir a Git. Al iniciar, la app crea automaticamente las tablas `catalog`, `orders`, `sessions` y `login_attempts` si no existen.

## Funciones conectadas

- Menu, busqueda, categorias, favoritos, variantes, extras y cantidades.
- Carrito, cupon, retiro o delivery, datos del cliente, revision y confirmacion.
- Pedidos con numeracion del servidor, instantaneas de productos y pago al recibir.
- Seguimiento e historial de la cuenta; el panel y el cliente consultan cambios cada 10 segundos cuando la pantalla no se esta editando.
- Dashboard con ventas, pedidos, clientes y productos mas vendidos.
- Administracion de productos, categorias, promociones, cupones, poligonos de delivery y disponibilidad.
- Validacion del servidor: precios actuales, variantes, extras, minimos, descuentos, cobertura y efectivo.
- Reintentos de checkout sin duplicar pedidos, transacciones y deteccion de cambios simultaneos en catalogo y estados.

La cuenta es obligatoria para entrar a la tienda y hacer pedidos, tambien en la API. Las cuentas permiten registro, login, perfil, direcciones e historial entre dispositivos. Al iniciar sesion se vinculan los pedidos antiguos de invitado del navegador a la cuenta. Las contrasenas se almacenan con scrypt y las sesiones usan cookies HttpOnly.

## Cuentas y notificaciones

El registro e inicio de sesion usan correo y contrasena, sin proveedores sociales externos.

El restaurante cambia el pedido por Recibido > Confirmado > En preparacion > Listo. Para delivery continua En camino > Entregado; para retiro pasa de Listo a Entregado. El cliente ve el estado, su mensaje y una linea de seguimiento; el pedido activo aparece en la tienda.

El cliente activa los avisos desde Perfil o Seguimiento; el restaurante los activa en la barra lateral del panel. Cada dispositivo debe permitir notificaciones. Web Push requiere HTTPS (localhost tambien sirve); en iPhone/iPad se debe agregar la app a la pantalla de inicio y abrirla desde ahi. Los nuevos pedidos y cambios de estado/pago generan avisos despues de guardar en la base, con enlaces al pedido correspondiente. Cerrar sesion revoca el acceso de ese dispositivo. No se almacenan paginas privadas en cache offline.

Las claves VAPID se generan automaticamente y se conservan en `documents`; los dispositivos se guardan en `push_subscriptions`. Conserva ambas tablas en las copias de seguridad. Opcionalmente configura ambas variables VAPID para claves propias y `AZUMI_VAPID_SUBJECT` para el contacto del restaurante. No cambies las claves despues de registrar dispositivos sin volver a suscribirlos.

Los avisos no sustituyen el panel: pueden bloquearse o no llegar por permisos, conectividad o restricciones del dispositivo. No hay una cola externa de entrega ni reintentos automaticos si el proveedor falla. Falta probar la recepcion push en los dispositivos finales antes de publicar.

El administrador registra pagos recibidos y devoluciones completas, con referencia e historial. No hay cobros online. Puede contactar al cliente por telefono o abrir WhatsApp; ese enlace requiere enviar el mensaje manualmente.

El pedido exige telefono y WhatsApp separados. El WhatsApp puede coincidir con el telefono o ser otro numero; los 8 digitos locales se guardan con prefijo 507 y los internacionales con su codigo de pais. Se conserva en el pedido y puede guardarse en Perfil. El contacto por WhatsApp usa ese numero, no el telefono. Los pedidos anteriores sin este dato muestran "No registrado". Se valida el formato, pero no se verifica que el numero tenga una cuenta activa de WhatsApp.

Las fotos JPG/PNG/WebP se suben desde el editor, se convierten a WebP y se guardan en la tabla `documents` de la base de datos (tambien las cuentas y sus sesiones). Las promociones vigentes aplican el menor precio al producto, sin descontar extras; los cupones se aplican despues.

## Delivery y correo

Leaflet muestra calles OpenStreetMap, GPS y marcador arrastrable. Con `AZUMI_GEOAPIFY_API_KEY`, el servidor consulta Geoapify: sugerencias mientras escribes con 750 ms de pausa, busqueda explicita, resultados de Panama y preferencia por Ciudad de Panama. Elegir un resultado coloca sus coordenadas y direccion y precarga el PH/edificio si esta identificado. Se conserva la validacion de cobertura; apartamento, piso y referencias se completan manualmente. Los PH no presentes en la fuente de datos pueden seleccionarse con GPS o marcador.

La clave esta en `.env.local`, excluido de Git. En Hostinger configura la misma variable privada `AZUMI_GEOAPIFY_API_KEY`; no uses `NEXT_PUBLIC_`. Las respuestas y el navegador nunca reciben la clave. Hay cache de resultados y limitacion por cuenta por proceso para reducir consultas, pero no reemplazan las cuotas del proveedor. Revisa el consumo y los limites de tu plan en Geoapify; no se activan planes de pago desde esta aplicacion. Para despliegues con varios procesos conviene limitar consumo tambien en el proveedor.

Sin esa clave se conserva Nominatim, con cache y limite de una solicitud por segundo por proceso, exclusivamente por busqueda manual (sin autocompletado). Para varios procesos o mas trafico configura un proveedor propio en `AZUMI_GEOCODER_URL`. El GPS necesita HTTPS (localhost tambien funciona).

Los poligonos del editor antiguo se convierten a coordenadas geograficas para conservar la cobertura existente. Sus limites y la posicion de referencia del restaurante son aproximados: revisa las zonas contra las calles reales en Administracion > Delivery y confirma latitud/longitud del restaurante en Administracion > Configuracion antes de publicar.

Configura `AZUMI_APP_URL` con el dominio HTTPS real y las variables SMTP de `.env.example` con los datos del buzon (la clave del correo es distinta de la de MySQL). `AZUMI_RESTAURANT_EMAIL` recibe pedidos nuevos, cambios de estado y registros de pago. El cliente recibe confirmaciones si dio su correo. El envio se ejecuta despues de guardar el pedido: un fallo de correo no pierde el pedido. Los envios correctos quedan registrados para evitar repetirlos al reintentar; no hay cola externa ni reintentos automaticos de correos fallidos. La recuperacion de contrasena requiere SMTP y URL configurados; los enlaces caducan en 30 minutos y revocan sesiones anteriores.

## Copias de seguridad

En produccion MySQL, programa copias desde Hostinger y conserva una exportacion completa de la base, incluida `documents`. Comprueba una restauracion en una base de prueba antes de publicar. Para SQLite usa una copia consistente con la app detenida o la API de backup de SQLite; no copies solamente el archivo principal mientras la app escribe en WAL. No se han activado copias ni desplegado el sitio en tu cuenta de hosting desde este proyecto.

## Verificacion

```bash
npm run lint
npm run build
npm test
```

Las pruebas levantan un servidor de produccion en un puerto libre con una base temporal independiente. No alteran la base de la aplicacion.

## Produccion

```bash
npm run build
npm start
```

Usa HTTPS para las cookies seguras. En Hostinger, configura las variables de entorno de MySQL/MariaDB antes de iniciar la aplicacion. Si usas SQLite en otro servidor, asegurate de que el disco sea persistente.

## Estructura

- `app/(store)`: paginas y layout de la tienda.
- `app/admin/(panel)`: paginas del panel y layout que comprueba la sesion.
- `app/admin/login`: acceso administrativo.
- `components/store` y `components/admin`: pantallas, tarjetas, formularios y navegacion React.
- `components/azumi-provider.tsx`: estado de la aplicacion, preferencias, llamadas a la API y actualizacion de pedidos.
- `components/ui.tsx` y `components/delivery-map.tsx`: controles compartidos, imagenes con Next Image y mapa interactivo.
- `app/globals.css`: estilos responsive de la aplicacion.
- `lib/azumi-client.ts`: calculos compartidos del carrito.
- `lib/azumi-store.ts` y `lib/azumi-validation.ts`: persistencia, autenticacion y validacion del servidor.
- `public/images/products`: fotografias de productos.
