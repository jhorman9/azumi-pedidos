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

Los visitantes acceden unicamente a los pedidos asociados a su cookie; el administrador puede consultar todos. Como el checkout es de invitado, borrar las cookies o usar otro navegador impide recuperar ese historial.

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
