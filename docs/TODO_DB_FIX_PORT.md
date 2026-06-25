# TODO_DB_FIX_PORT

## Root cause observed
- Backend listens in Docker on container port 8000, exposed on host as 8004 (`docker compose ps`).
- Frontend Vite proxy for `/api` points to `http://127.0.0.1:8000` when `VITE_API_BASE_URL` is not set.
- Result: clicking "Connect" hits the wrong backend and may produce a 500 from a different service/proxy.

## Steps
1. Update environment so frontend targets the correct backend.
   - Add to `.env`:
     - `VITE_API_BASE_URL=http://127.0.0.1:8004`
2. Restart containers.
   - `docker compose up -d --build`
3. Validate with curl.
   - `curl -sS http://localhost:8004/api/health`
4. Validate connect endpoint.
   - `curl -sS -X POST http://localhost:8004/api/db-config/connect -H "Content-Type: application/json" -d '{"db_type":"postgresql","host":"localhost","port":5432,"user":"postgres","password":"","database":"testdb","schema":"public"}'`
5. Re-test UI action "Connect".

## Done criteria
- Browser "Connect" no longer shows `Request failed with status 500` before pressing the connect button.
- Requests go to `:8004/api/...` (or `VITE_API_BASE_URL`).

