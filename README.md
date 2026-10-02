# Azumi · pedidos y administración

Aplicación recreada con Next.js App Router, React y TypeScript. La referencia suministrada guía el diseño y aporta las fotografías. Las páginas, formularios, navegación y mapa son componentes React conectados a una API y una base SQLite en el servidor.

## Ejecutar

Requiere Node.js 24 o superior.

```bash
npm install
npm run dev
```

Tienda: http://localhost:3000 · Administración: http://localhost:3000/admin

En desarrollo, sin variables configuradas, el acceso administrativo es `admin@azumi.demo` / `azumi123`. La comprobación de credenciales se realiza en el servidor y la sesión usa una cookie HttpOnly con vencimiento y revocación.

Para cambiar las credenciales, copia `.env.example` a `.env.local` y define tus valores. En producción son obligatorios `AZUMI_ADMIN_EMAIL` y `AZUMI_ADMIN_PASSWORD`, con una contraseña de al menos 12 caracteres. No se habilitan las credenciales de desarrollo en producción. Reinicia el servidor después de cambiar estas variables.

## Funciones conectadas

- Menú, búsqueda, categorías, favoritos, variantes, extras y cantidades.
- Carrito, cupón, retiro o delivery, datos del cliente, revisión y confirmación.
- Pedidos con numeración del servidor, instantáneas de productos y pago al recibir.
- Seguimiento e historial del visitante; el panel y el cliente consultan cambios cada 10 segundos cuando la pantalla no se está editando.
- Dashboard con ventas, pedidos, clientes y productos más vendidos.
- Administración de productos, categorías, promociones, cupones, polígonos de delivery y disponibilidad.
- Validación del servidor: precios actuales, variantes, extras, mínimos, descuentos, cobertura y efectivo. Los importes se calculan en centavos.
- Reintentos de checkout sin duplicar pedidos, transacciones y detección de cambios simultáneos en el catálogo y los estados.

El catálogo y los pedidos se guardan en `data/azumi.sqlite`; esa carpeta está excluida de Git. La base se inicializa con `lib/azumi-seed.json` solo cuando no existe. Reiniciar el servidor conserva los pedidos y los cambios. Puedes configurar `AZUMI_DATABASE_PATH` para usar otra ruta.

Los visitantes acceden únicamente a los pedidos asociados a su cookie; el administrador puede consultar todos. Como el checkout es de invitado, borrar las cookies o usar otro navegador impide recuperar ese historial. Perfil, favoritos, direcciones y carrito se conservan como preferencias locales. No se implementó una cuenta de cliente con contraseña.

## Delivery y pagos

El mapa **ilustrativo** y el editor de zonas se recrearon como componentes React con eventos de puntero y controles de coordenadas. La API valida los polígonos, exclusiones, prioridad, tarifa y mínimo. Selecciona la zona en el mapa y escribe la dirección completa de entrega. Los puntos no son coordenadas geográficas verificadas; falta integrar cartografía y geocodificación real.

El checkout permite efectivo o punto de venta al recibir y registra el pago como pendiente. Yappy, tarjeta en línea y WhatsApp automático requieren proveedores y credenciales; no se simulan cobros ni notificaciones exitosas.

## Verificación

```bash
npm run lint
npm run build
npm test
```

Las pruebas levantan un servidor de producción en un puerto libre con una base temporal independiente. Comprueban pedidos, importes, cupones, delivery, aislamiento entre visitantes, autenticación, permisos, transiciones de estado, conflictos y persistencia tras reiniciar. También verifican el renderizado de las rutas reales de Next.js, la protección de las páginas administrativas y el cálculo del carrito. No alteran la base de la aplicación. La revisión visual y de interacción con un navegador real debe hacerse por separado.

## Producción

```bash
npm run build
npm start
```

Usa HTTPS para las cookies seguras y un servidor Node con disco persistente. Esta base SQLite local no debe colocarse en un filesystem efímero ni compartirse entre instancias independientes. Haz respaldos de la base con una herramienta compatible con SQLite antes de operar con pedidos reales.

## Estructura

- `app/(store)`: páginas y layout de la tienda, con rutas como `/menu`, `/producto/[id]`, `/carrito`, `/checkout` y `/pedido/[id]`.
- `app/admin/(panel)`: páginas del panel y un layout que comprueba la sesión en el servidor.
- `app/admin/login`: acceso administrativo.
- `components/store` y `components/admin`: pantallas, tarjetas, formularios y navegación React.
- `components/azumi-provider.tsx`: estado de la aplicación, preferencias, llamadas a la API y actualización de pedidos.
- `components/ui.tsx` y `components/delivery-map.tsx`: controles compartidos, imágenes con Next Image y mapa interactivo.
- `app/globals.css`: estilos responsive recreados para la aplicación.
- `lib/azumi-client.ts`: cálculos compartidos del carrito y sus selecciones.
- `lib/azumi-store.ts` y `lib/azumi-validation.ts`: persistencia, autenticación y validación del servidor.
- `public/images/products`: fotografías de la referencia.

El catálogo se renderiza desde el servidor y React hidrata las interacciones. La navegación usa `next/link` y `next/navigation`. El proyecto no carga el script del prototipo ni genera pantallas insertando cadenas HTML en el DOM.
