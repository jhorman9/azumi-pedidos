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
- Seguimiento e historial del visitante; el panel y el cliente consultan cambios cada 10 segundos cuando la pantalla no se esta editando.
- Dashboard con ventas, pedidos, clientes y productos mas vendidos.
- Administracion de productos, categorias, promociones, cupones, poligonos de delivery y disponibilidad.
- Validacion del servidor: precios actuales, variantes, extras, minimos, descuentos, cobertura y efectivo.
- Reintentos de checkout sin duplicar pedidos, transacciones y deteccion de cambios simultaneos en catalogo y estados.

Los visitantes acceden a los pedidos asociados a su cookie. Las cuentas de clientes permiten registro, login, perfil, direcciones e historial entre dispositivos. Al iniciar sesion se vinculan los pedidos de invitado del navegador a la cuenta. Las contrasenas se almacenan con scrypt y las sesiones usan cookies HttpOnly.

El administrador registra pagos recibidos y devoluciones completas, con referencia e historial. No hay cobros online. Puede contactar al cliente por telefono o abrir WhatsApp; ese enlace requiere enviar el mensaje manualmente.

Las fotos JPG/PNG/WebP se suben desde el editor, se convierten a WebP y se guardan en la tabla `documents` de la base de datos (tambien las cuentas y sus sesiones). Las promociones vigentes aplican el menor precio al producto, sin descontar extras; los cupones se aplican despues.

## Delivery y correo

Leaflet muestra calles OpenStreetMap, GPS, marcador arrastrable y busqueda manual de lugares. La busqueda usa Nominatim, con cache y limite de una solicitud por segundo por proceso; no hace autocompletado. Para varios procesos o mas trafico configura un proveedor propio en `AZUMI_GEOCODER_URL`. El GPS necesita HTTPS (localhost tambien funciona).

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
