# Docura

A mobile-first personal document management web app. Store and organize your credit cards, passports, visas, diplomas, and other important documents securely. Features AI-powered Smart Scan to automatically recognize document types and extract information from photos.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Ant Design 5 + Vite
- **Backend**: Python + FastAPI + SQLAlchemy (async)
- **Database**: SQLite (via aiosqlite)
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
