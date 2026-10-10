# Production setup for your two applications

These files are prepared for the supplied RDS instance and the streaming site's
production domain. They are templates: replace every `REPLACE_WITH_...` value in
private copies before deployment. No supplied credential is stored in these files.

| File | Destination |
| --- | --- |
| `ec2.env.example` | Agent Platform EC2: `/home/ubuntu/agent-platform/backend/.env` |
| `vercel.env.example` | Streaming Vercel project: Settings -> Environment Variables -> Production |
| `frontend.env.example` | Optional admin rebuild: Agent Platform `frontend/.env.production` |

The destination paths assume the repository's supplied systemd unit, which runs as
`ubuntu` from `/home/ubuntu/agent-platform/backend`. If your installed service uses a
different path, use its `EnvironmentFile` and `WorkingDirectory` instead. Inspect
these with `sudo systemctl cat agent-platform` before copying.

## 1. Use these deployment URLs

Your streaming application's origin is:

```text
https://streaming-service-six.vercel.app
```

Your S3 URL is the admin frontend, not the API:

```text
http://agent-platform-frontend-668532754898.s3-website-us-east-1.amazonaws.com
```

The confirmed Agent Platform API base is:

```text
https://5vwoct8mh3.execute-api.us-east-1.amazonaws.com
```

The templates already contain the correct `/chat` and `/consent` endpoints. Do not
use the S3 URL for these values. Your direct EC2 URL, `http://3.95.214.11:8000`, is
useful for diagnosis but is not accepted as a production upstream by the streaming
application's HTTPS validation. Use the API Gateway URL in Vercel.

The repository defines an HTTPS API Gateway with an HTTP proxy to EC2 in
`infra/apigateway.tf`. To cross-check the URL against your Terraform deployment,
run this on the machine/directory containing its state:

```bash
cd infra
terraform output -raw api_gateway_url
```

You can also find the HTTP API's Invoke URL in the AWS API Gateway console. Confirm
it actually points to this EC2 backend. An existing working HTTPS API Gateway URL
does not require adding a custom domain or TLS to Nginx just for this connection.

Your supplied API URL has no stage prefix and matches the repository's `$default`
stage. The Terraform integration forwards to EC2's HTTP port 80, where Nginx proxies
to Uvicorn on port 8000. Ensure Nginx is running and API Gateway reaches the current
EC2 address. Keep this origin path working when deploying the backend.

If you instead access EC2 directly, configure a working HTTPS endpoint before
deployment. The repository's Nginx template listens on HTTP port 80 only. Configure
TLS at Nginx or a load balancer; merely changing `http` to `https` in an environment
variable does not enable TLS. Follow the [Certbot instructions for your actual OS](https://certbot.eff.org/instructions)
if using Nginx with a domain you control.

The configured API Gateway integration timeout is 30 seconds. Increasing
`AGENT_TIMEOUT_MS` does not increase that gateway timeout. If model calls exceed
30 seconds, use a suitably configured direct HTTPS proxy/load balancer or reduce
model-call latency. Keep FastAPI responsible for service-key authentication; a
Cognito-only gateway authorizer would reject the streaming app's service key.

## 2. Fill private copies and match credentials

Rotate the exposed RDS password, Supabase secret, and Gemini keys through their
providers, then insert the replacement credentials in your private environment
files. Changing `RDS_PASSWORD` alone does not change the actual database password.

Generate two different random service secrets. This command prints one secret;
run it twice and store each result privately:

```bash
python3 -c 'import secrets; print(secrets.token_hex(32))'
```

| Value | EC2 variable | Vercel variable |
| --- | --- | --- |
| New agent service secret | `STREAMING_API_KEY` | `AGENT_API_KEY` |
| New business-tool secret | `STREAMING_TOOL_API_KEY` | `TOOL_API_KEY` |
| Tenant | `STREAMING_TENANT_ID=streamsphere-prod-01` | `AGENT_TENANT_ID=streamsphere-prod-01` |

Both secrets must be at least 32 characters. They need no database registration:
the updated application reads them from its environment. Update both sides together;
requests can fail during the short interval when old and new credentials differ.

Keep filled copies in ignored `.env` / `.env.production` files, never in these
tracked `.example` templates. Use plain `KEY=value` lines. The backslashes shown
in the chat formatting must not be copied: write `https://`, not `https\://`.

Corrections made to your supplied configuration:

- One `USE_RDS=true`, with your existing RDS host/database. The later
  `USE_RDS=false` in your original file disabled RDS when parsed from that file.
- `USE_AWS=false` is retained. RDS selection is independent and takes precedence;
  running on EC2 does not require enabling the DynamoDB audit backend.
- `AUTH_MODE=cognito` disables header-only local/demo authentication. The streaming
  service credential works without Cognito IDs. To keep real admin login working,
  set backend `COGNITO_POOL_ID` / `COGNITO_CLIENT_ID` and matching frontend values.
  The synthetic demo login will not authenticate to this production API.
- Bedrock remains the LLM provider. Retain the working EC2 instance IAM role and
  Bedrock model access. The Gemini key remains for embeddings and optional fallback.
- The existing embedding dimension is preserved at 3072; this setup does not
  rebuild your FAISS index. The streaming flow does not require that index.
- EC2 callbacks use the actual Vercel origin; Vercel requests use the backend API
  URL. No deployed service URL should point to your laptop's localhost.
- Removed duplicate settings and variables unused by the corresponding application.
  `APP_ENV`, `API_HOST`, `API_PORT`, and `JWT_SECRET` do not control this deployed
  backend's listening address/authentication; systemd's Uvicorn command does.

## 3. Update and restart EC2

Push your committed application changes, then update the EC2 checkout through your
normal deployment process. For a clean checkout on the intended branch:

```bash
cd /home/ubuntu/agent-platform
git pull --ff-only
```

Do not overwrite a locally edited EC2 checkout without reviewing those edits.
Back up the existing environment file privately, then edit it with the filled EC2
template. Use the `ubuntu` service account for file ownership:

```bash
cd /home/ubuntu/agent-platform/backend
umask 077
cp .env ".env.backup.$(date +%Y%m%d-%H%M%S)"
nano .env
chmod 600 .env
sudo systemctl restart agent-platform
sudo systemctl status agent-platform --no-pager
```

Your supplied unit already has `EnvironmentFile=.../backend/.env`. An environment
file edit needs a service restart; `daemon-reload` is only needed when changing the
unit itself. Existing exported process variables or a different service environment
can override python-dotenv, so confirm the installed service reads this file.

Startup initializes the RDS schema, including `tenant_sessions` and
`tenant_consents`, using the existing platform initialization. Supabase continues
to store the streaming application's accounts. Do not reset or reseed Supabase
to configure this connection. If your working local run used SQLite, switching to
RDS does not migrate its existing conversations or pending confirmations; begin a
new conversation on the hosted site.

## 4. Update Vercel and redeploy

Open the streaming Vercel project -> Settings -> Environment Variables. Apply the
filled `vercel.env.example` values to **Production**. Update existing keys instead
of adding contradictory duplicates. Use the exact canonical site origin for
`APP_ORIGIN`, without a path. Add values without dotenv quoting in individual
dashboard fields.

Keep secrets server-side; none of these Vercel keys should use the `VITE_` prefix.
`CHAT_PROVIDER=agent-platform` selects the EC2 agent even if an old Gemini key
remains in Vercel. Remove unused direct-Gemini values if no longer needed.

Redeploy the production deployment after saving. Vercel applies changed environment
values to new deployments, as described in its
[environment-variable documentation](https://vercel.com/docs/environment-variables/managing-environment-variables).

The repository already contains `api/index.js` and `vercel.json` to host the
streaming backend with the frontend. No separate Node server or `PORT=3001` is
needed on Vercel. Ensure this production domain's business-tool endpoints are
reachable by EC2: the integration supplies its tool bearer key, not Vercel's
interactive deployment-protection login.

## 5. Optional: update the S3 admin frontend

This is independent of the streaming chat connection. If its API address or Cognito
configuration needs changing, fill `frontend.env.example`, copy it to
`frontend/.env.production`, rebuild with `npm run build`, and publish the new `dist`
through your existing S3 deployment process. Vite embeds these public configuration
values at build time; editing an EC2 environment file does not update the S3 bundle.
Never put service keys, Supabase secrets, Gemini keys, or the RDS password in that
frontend file. The HTTP S3 website endpoint is not an HTTPS hosting endpoint; use
your normal HTTPS hosting layer for production admin login.

## 6. Check the connection

On EC2, the local process health check is:

```bash
curl --fail http://127.0.0.1:8000/health
sudo journalctl -u agent-platform -n 50 --no-pager
```

From a machine that can reach the public deployments:

```bash
curl --fail https://5vwoct8mh3.execute-api.us-east-1.amazonaws.com/health
curl --fail https://streaming-service-six.vercel.app/api/health
```

Health responses show process/config readiness; they do not prove that Bedrock or
the authenticated callbacks work.

Sign in at `https://streaming-service-six.vercel.app` and ask: "What is my current
membership and wallet balance?" Then ask a follow-up to check conversation memory.
This exercises Vercel -> Agent Platform -> Vercel's account tool -> Supabase and
the real model. A cancellation request must show a confirmation and must not change
the membership until approved. Use Keep Subscription for a check with no mutation.

| Symptom | First check |
| --- | --- |
| Streaming API returns 503 | Missing Vercel variables; inspect Function logs and redeploy |
| Chat cannot authenticate | Both agent keys and tenant IDs match; no JWT-only gateway gate |
| Chat fails before replying | EC2 logs: Bedrock access, RDS connectivity, tool credential |
| Callback is rejected | Exact Vercel origin and shared tool key; no redirect/protection login |
| Timeout near 30 seconds | Existing API Gateway integration timeout |
| Browser request returns origin error | `APP_ORIGIN` matches the URL the member actually opened |
| Admin demo login stops working | Expected with production auth; configure real Cognito login |
