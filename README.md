# Docura

A mobile-first personal document management web app. Store and organize your credit cards, passports, visas, diplomas, and other important documents securely. Features AI-powered Smart Scan to automatically recognize document types and extract information from photos.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Ant Design 5 + Vite
- **Backend**: Python + FastAPI + SQLAlchemy (async)
- **Database**: SQLite for local development, PostgreSQL for Docker/production
- **AI/OCR**: OpenAI Responses API (`gpt-5.2` default) / PaddleOCR (fallback)

## Features

- Multi-user authentication (JWT)
- Mobile-first responsive design (bottom tabs on mobile, sidebar on desktop)
- Document CRUD with type-specific structured fields
- File attachments with upload/download
- Smart Scan: upload image/PDF/text/Word files and AI automatically classifies and extracts fields
- Smart Scan supports AI-generated categories and dynamic fields for uncommon documents (e.g. LCA)
- Dashboard with document summary by type

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- (Optional) Tesseract OCR: `brew install tesseract`
- (Optional) OpenAI API key for AI-powered document recognition

### Backend Setup

```bash
cd backend
python3 -m pip install -r requirements.txt

# Optional: create .env with your OpenAI key for Smart Scan
echo "OPENAI_API_KEY=sk-..." > .env

# Start the server
python3 -m uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on http://localhost:3000 and proxies API requests to the backend on port 8000.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | `docura-dev-secret-change-in-production` | JWT signing key |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Token expiry (default 24h) |
| `DATABASE_URL` | `sqlite+aiosqlite:///./docura.db` | Database connection string |
| `OPENAI_API_KEY` | (none) | Enables OpenAI Vision for Smart Scan |
| `OPENAI_MODEL` | `gpt-5.2` | OpenAI model to use |
| `FILE_ENCRYPTION_ENABLED` | auto (`true` when keys are configured, otherwise `false`) | Enable AES-GCM encryption for uploaded attachment files |
| `FILE_ENCRYPTION_ACTIVE_KEY_ID` | first configured key / `default` | Active key id for new file encryption |
| `FILE_ENCRYPTION_KEY` | (none) | Single base64/base64url AES key (16/24/32 bytes decoded) |
| `FILE_ENCRYPTION_KEYS` | (none) | Key ring for rotation: `key_id:base64key,key_id2:base64key2` |
| `UPLOAD_DIR` | `backend/uploads` | Directory where attachment files are stored |

## Docker Deployment

Docker deployment is included for production-like environments:

- Frontend: Vite build served by Nginx
- Backend: FastAPI/Uvicorn
- Database: PostgreSQL 16
- Uploads: bind-mounted at `./backend/uploads` for backups and migration

Create your production environment file:

```bash
cp .env.example .env
```

Edit `.env` and set at least:

- `POSTGRES_PASSWORD`
- `SECRET_KEY`
- `OPENAI_API_KEY` if Smart Scan should use OpenAI
- `FILE_ENCRYPTION_*` values if attachment encryption is enabled

Start the stack:

```bash
docker compose up -d --build
```

The app is served on http://localhost:3000 by default. The backend is also exposed on http://localhost:8000 for health checks and direct API access.

For production, PostgreSQL is recommended over SQLite. SQLite is still convenient for local development, but PostgreSQL is a better fit for multiple users, containerized deployment, backups, and operational tooling.

### GitHub Actions Build

The repository includes `.github/workflows/docker-build.yml`:

- Pull requests to `main` or `master` validate `docker compose config` and build both Docker images.
- Pushes to `main` or `master`, version tags like `v1.0.0`, and manual dispatches build and publish images to GitHub Container Registry.
- Published image names are `ghcr.io/<owner>/<repo>-backend` and `ghcr.io/<owner>/<repo>-frontend`.

The workflow uses the built-in `GITHUB_TOKEN`; make sure the repository has Actions enabled and package write permissions available.

## Migrating Existing SQLite Data to PostgreSQL

The legacy local database is usually `backend/docura.db`, and uploaded files live in `backend/uploads`.

Before migration, make a backup:

```bash
cp backend/docura.db backend/docura.db.backup
tar -czf backend-uploads.backup.tgz backend/uploads
```

Start only PostgreSQL, then run the migration through the backend image:

```bash
docker compose up -d db
docker compose build backend
docker compose run --rm \
  -v "$PWD/backend/docura.db:/migration/docura.db:ro" \
  -v "$PWD/backend/uploads:/migration/uploads:ro" \
  backend \
  python scripts/migrate_sqlite_to_postgres.py \
    --sqlite-path /migration/docura.db \
    --source-uploads /migration/uploads \
    --target-uploads /app/uploads \
    --stored-upload-dir /app/uploads
```

Then start the full app:

```bash
docker compose up -d
```

Notes:

- The migration preserves primary keys so existing document and file references remain stable.
- The script refuses to import into a non-empty PostgreSQL database by default. Use `--replace` only if you intentionally want to overwrite existing PostgreSQL rows.
- File records are rewritten to point at `/app/uploads/<file>`, matching the Docker backend container.
- If file encryption was enabled before migration, keep the same `FILE_ENCRYPTION_KEY` or `FILE_ENCRYPTION_KEYS`; otherwise existing encrypted uploads cannot be decrypted.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in, get JWT |
| GET | `/api/auth/me` | Current user info |
| GET | `/api/documents` | List documents (filterable by `doc_type`) |
| GET | `/api/documents/summary` | Document counts by type |
| POST | `/api/documents` | Create document |
| GET | `/api/documents/:id` | Get document detail |
| PUT | `/api/documents/:id` | Update document |
| DELETE | `/api/documents/:id` | Delete document |
| POST | `/api/documents/:id/files` | Upload file attachment |
| POST | `/api/documents/scan` | Smart Scan: AI document recognition |
| GET | `/api/files/:id` | Download file |
| DELETE | `/api/files/:id` | Delete file |

## Supported Document Types

- Credit Card
- Passport
- Visa
- Diploma
- ID Card
- Driver License
- I-20
- I-797
- Other

## File Encryption and Key Management

Docura supports AES-GCM encryption for attachment files at rest (`backend/uploads`):

- New uploads are encrypted with the active key.
- Downloads are transparently decrypted before response.
- Existing plaintext files remain readable (backward compatible).

Generate a 256-bit key:

```bash
python3 -c "import os,base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('='))"
```

Single-key setup example:

```bash
FILE_ENCRYPTION_ENABLED=true
FILE_ENCRYPTION_ACTIVE_KEY_ID=v1
FILE_ENCRYPTION_KEY=<your-generated-key>
```

Key rotation setup example:

```bash
FILE_ENCRYPTION_ENABLED=true
FILE_ENCRYPTION_ACTIVE_KEY_ID=v2
FILE_ENCRYPTION_KEYS=v1:<old-key>,v2:<new-key>
```

Notes:

- Keep old keys in `FILE_ENCRYPTION_KEYS` until old files are re-encrypted, otherwise old files cannot be decrypted.
- If encryption is enabled but keys are missing/invalid, backend startup fails fast.

### Encrypt Existing Plaintext Uploads

When file encryption is enabled, new uploads are encrypted automatically. Existing plaintext files remain readable for backward compatibility, but they are not rewritten automatically.

After configuring `FILE_ENCRYPTION_ENABLED=true` and a valid key, run a dry-run first:

```bash
docker compose run --rm backend \
  python scripts/encrypt_existing_uploads.py
```

Encrypt plaintext uploads in place:

```bash
docker compose run --rm \
  -v "$PWD/plaintext-upload-backups:/backup" \
  backend \
  python scripts/encrypt_existing_uploads.py \
    --write \
    --backup-dir /backup
```

Notes:

- Run this during a maintenance window so files are not being uploaded while the script is rewriting them.
- The script skips files already encrypted with Docura's file format.
- Keep the backup directory until you have verified downloads work.
- Keep old encryption keys forever, or at least until every file using those keys has been rotated.
