# Kubbo3D

Plataforma para talleres de impresión 3D: app móvil y web para llevar el taller (costos, filamento, impresiones,
ventas, gastos, impresoras, proveedores), sitio público con landing y tienda en línea, y un dashboard interno.
Todo comparte un solo proyecto de Supabase.

| Carpeta | Qué es | Quién la usa |
|---|---|---|
| `supabase/schema.sql` | Base de datos completa: tablas, seguridad por usuario (RLS), triggers de existencias, tienda y métricas. | — |
| `mobile/` | App Expo (Android/iOS) del taller. | Tus usuarios |
| `web/` | Sitio Next.js: landing (`/`), tienda (`/tienda`, `/carrito`) y el taller en la web (`/app`, login en `/entrar`). | Tus usuarios y compradores |
| `admin/` | Dashboard Next.js: usuarios y métricas de uso, productos de la tienda, pedidos y ajustes. | Tú |

La app móvil y `/app` de la web leen y escriben las mismas tablas con la misma cuenta: lo que se registra en una
aparece en la otra (la web se actualiza al volver a la pestaña; la app, al volver a abrirla o deslizando hacia abajo).

## Puesta en marcha

1. **Supabase.** Crea un proyecto, abre *SQL Editor*, pega `supabase/schema.sql` entero y ejecútalo (se puede
   volver a ejecutar cuando cambie). Si quieres que la gente entre sin confirmar correo, desactívalo en
   *Authentication → Sign In / Providers → Email*.
2. **App.** En `mobile/`: copia `.env.example` como `.env.local` con la URL y la clave **publicable**.
   `npm install` y `npx expo start`.
3. **Web.** En `web/`: copia `.env.example` como `.env.local` (`PB_SUPABASE_URL`, `PB_SUPABASE_PUBLISHABLE_KEY` y,
   para cobrar, las de Mercado Pago).
   `npm install` y `npm run dev` → http://localhost:3000.
4. **Dashboard.** En `admin/`: copia `.env.example` como `.env.local`, rellena las tres claves y pon tu correo en
   `ADMIN_EMAILS` (puede ser la cuenta que creaste en la app). `npm install` y `npm run dev -- -p 3001`.

En Vercel son dos proyectos (raíz `web` y raíz `admin`) con esas mismas variables. Las variables visibles en el
navegador se llaman `PB_*` y están declaradas en el `env` de cada `next.config.ts`.

## El taller (app y `/app`)

- **Costo por pieza** = filamento (gramos × costo por kg) + luz (horas × watts de la impresora × precio del kWh)
  + desgaste de la máquina (horas × costo por hora) + otros costos (empaque, tornillería). Con varias máquinas
  asignadas se usa el promedio.
- **Embalaje.** Cajas, sobres y bolsas con medidas y costo (*Embalaje*). Cada producto puede tener uno asignado.
- **Precio sugerido por canal**, en dos versiones: *sin envío* = (costo × (1 + ganancia deseada) + cargo fijo) ÷
  (1 − comisión); *con envío* suma al numerador el envío del canal y el embalaje del producto. Al registrar una venta
  se elige *con envío* (descuenta envío y embalaje) o *sin envío* (el cliente recoge o paga su envío). Las
  comisiones con las que nace cada cuenta (Mercado Libre 15 %, TikTok Shop 8 %) son aproximadas: cada usuario
  debe poner las que su cuenta paga de verdad en *Canales de venta*.
- **Filamento.** Cada filamento es un tipo (material + color + marca), no un carrete. Una *compra* suma gramos,
  recalcula el costo por kg como promedio ponderado y queda registrada como gasto. Cada impresión descuenta lo
  que consumió, aunque falle.
- **Impresiones.** *Imprimiendo*, *Terminada* o *Falló*. Al terminar, las piezas buenas entran al stock y los
  minutos se suman a la impresora. Borrar o corregir una impresión regresa el filamento y ajusta el stock.
- **Ventas.** Descuentan stock y guardan precio, comisiones, envío y el costo de producción de ese momento.
- **Resumen** muestra por mes *ganancia de las ventas* (cada venta contra lo que costó producirla) y *flujo de
  caja* (ventas − comisiones y envíos − gastos pagados ese mes).
- **Impresoras.** Historial de mantenimientos, ajustes y reparaciones; con costo también quedan como gasto.

Las existencias las mueven triggers de la base de datos, no los clientes, así que app y web no se descuadran.

## La tienda

- Los productos, categorías, fotos, envío e instrucciones de pago se administran en el dashboard
  (*Tienda: productos* y *Tienda: ajustes*). Solo lo marcado como *Publicado* se ve en el sitio.
- El carrito vive en el navegador del cliente; no hace falta cuenta para comprar.
- Al hacer el pedido, la función `place_order` de la base de datos toma precios y envío de la base (no del
  navegador), verifica y aparta existencias y devuelve el número de pedido.
- **Cobro con Mercado Pago (Checkout Pro).** Tras crear el pedido, `/api/pagar` arma el cobro con los importes
  guardados y manda al cliente a Mercado Pago. Cuando el pago se aprueba, Mercado Pago avisa a
  `/api/mercadopago/webhook`; el servidor vuelve a consultar el pago en su API, comprueba que cubra el total y
  marca el pedido como *Pagado*. El cliente regresa a `/pedido?id=…`, donde ve el estado y puede reintentar.
- Si faltan las variables de Mercado Pago, el pago queda manual: instrucciones (transferencia) y WhatsApp.
- En *Pedidos* marcas *Enviado → Entregado*; *Cancelado* regresa las piezas al stock.

### Configurar Mercado Pago

1. En [mercadopago.com.mx/developers](https://www.mercadopago.com.mx/developers) crea una aplicación
   (*Checkout Pro*) y copia el **Access Token** a `MP_ACCESS_TOKEN` en `web/.env.local` (y en Vercel). También
   hace falta `SUPABASE_SECRET_KEY` ahí.
2. En la aplicación → *Webhooks*, pon la URL `https://TU-DOMINIO/api/mercadopago/webhook`, activa el evento
   **Pagos** y copia la clave secreta a `MP_WEBHOOK_SECRET`.
3. Prueba primero con las credenciales y tarjetas de prueba. En `localhost` Mercado Pago no puede llamar al
   webhook: el pago se confirma cuando el cliente vuelve a `/pedido`.

## Pendiente antes de publicar

- **Probar Mercado Pago con credenciales reales**: la integración no se ha ejecutado contra su API.
- **Reembolsos y contracargos** no cambian el pedido solos: se cancelan a mano en *Pedidos*.
- **Correo de confirmación de pedido.**
- **Límite de pedidos**: cualquiera puede crear pedidos sin pagar y apartar stock; conviene un captcha o un
  vencimiento automático de pedidos sin pago antes de darle tráfico.
- **Recuperar contraseña** y **borrar cuenta** (las tiendas de apps piden lo segundo).
- **Identificador de la app:** `com.alexr.kubbo3d` en `mobile/app.json` es provisional.
- **Textos legales** de la tienda: aviso de privacidad, términos, política de envíos y devoluciones.
- El taller carga los 1000 registros más recientes de impresiones, ventas, gastos y mantenimientos.
