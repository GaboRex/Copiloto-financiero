# Copiloto Financiero

SPA React/Vite con reglas financieras puras, persistencia local compatible y persistencia PostgreSQL para usuarios autenticados mediante Supabase.

## Arquitectura

- `src/auth`: sesión, Google OAuth y redirecciones seguras.
- `src/repositories`: contrato, adaptador local y adaptador Supabase.
- `src/services/financial`: reglas puras; no consulta Supabase ni `localStorage`.
- `src/services/import`: detección, resumen, huella e importación idempotente de datos locales.
- `supabase/migrations`: esquema versionado, libro, funciones transaccionales y RLS.
- `supabase/tests`: comprobaciones de aislamiento entre usuarios.

Los usuarios autenticados usan PostgreSQL como fuente principal. `VITE_DATA_MODE=local` existe únicamente para desarrollo y compatibilidad. No se implementó edición offline; cuando no hay conexión, las escrituras deben reintentarse con la misma clave de operación.

El esquema normalizado contiene `profiles`, `accounts`, `credit_cards`, `transactions`, `transaction_entries`, `goals`, `savings_contributions`, `debts`, `recurring_transactions`, `user_financial_settings`, `local_import_batches` y `applied_operations`. Las relaciones compuestas incluyen `user_id`, por lo que una referencia a cuenta, meta o tarjeta de otro usuario falla también si el cliente ha sido manipulado. Los saldos se derivan de `transaction_entries`; no existe una segunda columna de saldo editable en `accounts`.

## Variables

Copiar `.env.example` a `.env.local` y completar:

- `VITE_SUPABASE_URL`: Project URL de Supabase. Puede llegar al navegador.
- `VITE_SUPABASE_ANON_KEY`: clave pública/anon. Puede llegar al navegador porque RLS limita el acceso.
- `VITE_APP_URL`: `http://localhost:5173` en desarrollo y el origen público en cada entorno.
- `VITE_DATA_MODE`: `supabase` para autenticación; `local` solo para desarrollo sin proveedor.

Este proyecto usa Vite, por eso las variables públicas llevan el prefijo `VITE_` en lugar de `NEXT_PUBLIC_`.

Nunca colocar una `service_role` en una variable `VITE_*` ni en código cliente.

## Probar sin Supabase (modo local)

Crear `.env.local` con una sola línea y arrancar:

```sh
VITE_DATA_MODE=local
```

```sh
npm install
npm run dev
```

Los datos se guardan solo en ese navegador. Sirve para trabajar la UI sin credenciales.

## Crear el proyecto de Supabase

1. En https://supabase.com crear un proyecto (región cercana, por ejemplo São Paulo) y guardar la contraseña de la base.
2. En **SQL Editor**, ejecutar en orden el contenido de:
   1. `supabase/migrations/202609150001_finance_auth_schema.sql`
   2. `supabase/migrations/202611200001_incremental_sync.sql`

   Alternativa con CLI (no necesita Docker): `npx supabase login`, `npx supabase link --project-ref <ref>` y `npx supabase db push`.
3. En **Project Settings > API** copiar la *Project URL* y la clave *anon public*.
4. En Google Cloud Console: crear proyecto, configurar la pantalla de consentimiento OAuth (tipo *External*, con tu correo como usuario de prueba) y crear credenciales *OAuth client ID* de tipo *Web application*.
   - *Authorized JavaScript origins*: `http://localhost:5173`
   - *Authorized redirect URIs*: `https://<ref>.supabase.co/auth/v1/callback` (la muestra Supabase en Authentication > Providers > Google).
5. En Supabase **Authentication > Providers > Google**: activar y pegar Client ID y Client Secret.
6. En Supabase **Authentication > URL Configuration**: *Site URL* `http://localhost:5173` y en *Redirect URLs* `http://localhost:5173/auth/callback` (más adelante, también la URL de Vercel).
7. Crear `.env.local`:

   ```sh
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon public>
   VITE_APP_URL=http://localhost:5173
   VITE_DATA_MODE=supabase
   ```
8. Reiniciar `npm run dev` e ingresar con Google.
9. Opcional: `npx supabase test db` ejecuta `supabase/tests/rls.sql` (pgTAP; requiere Docker).
10. Antes de producción: configurar las mismas variables en Vercel y revisar privacidad, retención, exportación y eliminación de datos.

RLS está habilitado en todas las tablas financieras y el rol `authenticated` solo puede **leer** sus propias filas (`auth.uid() = user_id`). Toda escritura pasa por las funciones `apply_finance_changes` e `import_local_finance_state` (`SECURITY DEFINER`, validan `auth.uid()` y filtran por `user_id`); las claves foráneas compuestas impiden relacionar datos de otro usuario. Nunca usar la clave `service_role` en el cliente.

## Desarrollo y pruebas

```sh
npm install
npm test
npm run build
npm run dev
```

`npm test` incluye las pruebas SQL en Postgres embebido (no requieren Docker ni credenciales).

## Migración del navegador

Después del primer acceso, la app detecta `copiloto-financiero:estado-financiero-v1`, excluye datos de demostración, normaliza el esquema y muestra un resumen. La importación usa una huella SHA-256 y un identificador estable; la función PostgreSQL rechaza la mezcla automática si ya existen datos remotos. La copia local nunca se elimina automáticamente.

Al terminar, la aplicación compara cantidades, relaciones y saldos redondeados a centavos. Una importación ya completada se reconoce por su huella y no se repite. Si la cuenta remota contiene otros datos, la interfaz bloquea la combinación automática y conserva ambos conjuntos para una conciliación futura.

## Saldo e integridad

Cada acción de la app envía al servidor solo lo que cambió (`apply_finance_changes`: altas/ediciones y bajas por id), no el estado completo. El servidor deriva los saldos de `transaction_entries` y devuelve los saldos oficiales; el saldo calculado en el navegador nunca se guarda. En ingresos y gastos el efecto en el saldo se deriva del tipo y el monto; ajustes y transferencias llevan `balanceDelta`, que debe coincidir con el monto.

- **Revisión optimista:** si otro dispositivo guardó antes (error 40001), la app recarga el estado, reaplica la misma acción y reintenta una vez.
- **Idempotencia:** `applied_operations` guarda solo la revisión por operación y se poda a 30 días.
- **Permisos:** el rol `authenticated` solo puede leer tablas. Toda escritura pasa por funciones `SECURITY DEFINER` que validan `auth.uid()` y filtran por `user_id`.
- **Importación:** `apply_finance_state` (estado completo) queda reservada a `import_local_finance_state` y concilia cuentas antiguas con un ajuste `migration_balance` recalculado de forma idempotente.
- **Cierre de sesión:** si los datos del navegador ya se importaron y verificaron, se borran del equipo.

`initial_balance`, ajustes y transferencias siguen excluidos de los ingresos operativos por los servicios de dominio.

### Pruebas SQL sin Docker

`tests/supabase-sql.test.js` ejecuta todas las migraciones en Postgres embebido (PGlite) con un esquema `auth` mínimo y prueba las RPC como el rol `authenticated`: saldos, conflictos, permisos, aislamiento entre usuarios, importación y un flujo de dos dispositivos con el reducer real. `supabase/tests/rls.sql` (pgTAP) sigue siendo la prueba de referencia contra Supabase real.

## Limitaciones

- La eliminación irreversible de la cuenta está bloqueada hasta definir una política legal de retención.
- La primera versión requiere conexión para guardar.
- Los IDs históricos se conservan como identificadores de cliente para no romper relaciones durante la migración.
- Las migraciones y pruebas RLS no se ejecutan contra un servicio remoto sin credenciales de desarrollo.
- Antes del despliegue deben revisarse SQL, redirect URLs, RLS, backups y variables por entorno.

## Procedimiento futuro de despliegue

Este repositorio no ejecuta el despliegue. Cuando las verificaciones locales y legales estén aprobadas: aplicar primero la migración en un proyecto de desarrollo, ejecutar las pruebas RLS, probar Google OAuth con un usuario de prueba, aplicar la migración revisada al proyecto de producción, configurar las variables por entorno en Vercel y verificar las URLs de retorno antes de promover una compilación. Mantener una copia de seguridad de PostgreSQL y no retirar el almacenamiento local hasta validar importaciones reales.
