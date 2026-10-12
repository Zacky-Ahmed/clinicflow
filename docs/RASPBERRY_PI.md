# Raspberry Pi deployment

ClinicFlow uses a separate Compose project (`clinicflow`) in `/home/jobwireadmin/clinicflow`. The host binding is `127.0.0.1:3001`; the container listens on 3000. JobWire continues on host port 3000. MongoDB remains in Atlas; no database volume is required on the Pi.

The multi-stage Dockerfile builds natively on ARM64, uses Next.js standalone output, runs as the unprivileged Node user, and excludes environment files from the image. Compose bounds memory, CPU and logs, drops capabilities, checks database readiness, and restarts the app after boot. Build-time resource use is separate from runtime limits.

## Deploy an update

Copy the reviewed source into the dedicated directory, excluding `.git`, `.next`, `node_modules`, and `.env*`. Keep `.env` on the Pi mode 600. Set `CLINIC_TIMEZONE`, `MONGODB_URI`, and `MONGODB_DB_NAME`. For a public tunnel, set `APP_ORIGIN` to the exact HTTPS origin without a trailing slash. Never commit actual credentials.

```sh
cd /home/jobwireadmin/clinicflow
# Use a unique release tag; record the previous image before replacing it.
export CLINICFLOW_IMAGE=clinicflow:YOUR_RELEASE
docker compose build
docker compose up -d --no-build
docker compose ps
curl --fail http://127.0.0.1:3001/api/ready
curl --fail http://127.0.0.1:3000/healthz
curl --fail https://jobwire.me/healthz
```

Persist the image reference in the Pi `.release.env` and use `docker compose --env-file .env --env-file .release.env` for subsequent commands. Keep the previous local image for rollback. Do not prune JobWire images or volumes.

## Public routing

The public hostname is pending the owner's choice. Add a distinct Cloudflare Tunnel route to `http://127.0.0.1:3001`, preserving existing routes. No router port forwarding or firewall changes are needed. Decide demo access before publishing: the app currently has no user login and anyone with access can modify fictional appointments. Test create/edit/delete through HTTPS after configuring `APP_ORIGIN`.

## Rollback

First create `.deploy-paused` in the deployment directory to stop automatic updates. For first deployment, `docker compose stop` in this directory stops only ClinicFlow. For updates, set `CLINICFLOW_IMAGE` in `.release.env` back to the digest recorded in `.previous-image` and run `docker compose --env-file .env --env-file .release.env up -d --no-build --wait`. Remove only ClinicFlow's new tunnel route if necessary. Recheck both JobWire health URLs. No database migrations are introduced here; stopping the app preserves Atlas records.

## GitHub to Pi CI/CD

Push to `main` → GitHub checks → native ARM64 image build → GHCR `main` and commit-SHA tags → Pi polls every five minutes → healthy release activated. Pull requests only run checks. GitHub uses its built-in job token with package write access; no SSH private key or MongoDB credential is uploaded to GitHub.

After the first successful workflow, make the `clinicflow` container package public in GitHub package settings so the Pi can pull it anonymously. A public source repository does not automatically make its container package public. Alternatively configure a read-only package credential directly on the Pi. Until the image is available, polling fails without changing the running app.

`scripts/pi-update.sh` is installed on the Pi and called by a dedicated user crontab entry. It serializes deployments, pins the selected registry digest in `.release.env`, waits for database readiness and rolls back an unhealthy release. `.failed-image` prevents retry loops for a known bad digest; remove that file only after fixing the underlying problem. Deployment script and Compose changes require a reviewed manual sync; application images update automatically. Check `~/clinicflow/deploy.log` for the latest attempt. No reboot or inbound SSH exposure is required.

References: [GitHub ARM64 runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [Publishing container images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images).

## Availability

The existing midnight–06:00 Asia/Colombo power schedule is retained at the owner's request. Both apps are unavailable during this interval. No reboot test is performed because it interrupts JobWire; restart policy is configured and must be observed after the next normal boot.

Atlas backup policies are managed separately from the Pi. A Pi filesystem backup does not back up Atlas. This deployment makes no changes to existing JobWire services, secrets, networking, timers or backups.
