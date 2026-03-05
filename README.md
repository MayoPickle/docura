# Docura

A mobile-first personal document management web app. Store and organize your credit cards, passports, visas, diplomas, and other important documents securely. Features AI-powered Smart Scan to automatically recognize document types and extract information from photos.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Ant Design 5 + Vite
- **Backend**: Python + FastAPI + SQLAlchemy (async)
- **Database**: SQLite (via aiosqlite)
- **AI/OCR**: OpenAI GPT-4o Vision (primary) / Tesseract OCR (fallback)

## Features

- Multi-user authentication (JWT)
- Mobile-first responsive design (bottom tabs on mobile, sidebar on desktop)
- Document CRUD with type-specific structured fields
- File attachments with upload/download
- Smart Scan: upload a document photo and AI automatically classifies it and extracts fields
- Dashboard with document summary by type

## Getting Started

### Prerequisites

- Python 3.9+
- Node.js 18+
- (Optional) Tesseract OCR: `brew install tesseract`
- (Optional) OpenAI API key for AI-powered document recognition

### Backend Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Optional: create .env with your OpenAI key for Smart Scan
echo "OPENAI_API_KEY=sk-..." > .env

# Start the server
uvicorn app.main:app --reload --port 8000
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
| `OPENAI_API_KEY` | (none) | Enables GPT-4o Vision for Smart Scan |
| `OPENAI_MODEL` | `gpt-4o` | OpenAI model to use |

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
- Other
