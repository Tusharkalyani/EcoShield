# 🛡️ EcoShield: Predictive Wildlife Movement & Crop Protection Platform

EcoShield is an early-warning and predictive defense system designed to mitigate human-wildlife conflict along agricultural perimeters. By synthesizing multi-spectral satellite imagery (Sentinel-2 NDVI & NDWI), digital elevation models (NASA SRTM), and ground wildlife sighting telemetry, EcoShield models spatial raid probabilities and autonomously dispatches SMS alerts to enrolled farmers before raids occur.

---

## 🌟 Key Features

- **Spatial Risk Engine (PostGIS & GeoPandas):** Dynamically partitions agricultural borders into 500m × 500m cells with zonal environmental extraction.
- **Machine Learning & Calibrated Risk Scoring:** Balanced Random Forest classifier trained on synthetic wildlife raid observations with SMOTE oversampling, featuring an Environmental Susceptibility Index (ESI) fallback.
- **Automated Alert Pipeline (Celery & Redis):** Daily 04:00 AM batch pipeline executing PostGIS spatial joins (`ST_Contains`) between high-risk grid cells and farmer plots.
- **Privacy & Security (AES-256 & HMAC-SHA256):** Zero-plaintext storage of farmer phone numbers via Fernet encryption; HMAC webhook signature validation and JWT Role-Based Access Control (RBAC).
- **Interactive Command-Center Dashboard:** React 18 + TypeScript + Leaflet frontend featuring real-time risk heatmaps, interactive GPS coordinate pickers, telemetry charts, and field ranger incident logging.

---

## 🏗️ Architecture & Technology Stack

- **Backend:** FastAPI, Python 3.11+, SQLAlchemy 2.0, GeoAlchemy2, PostGIS, Celery, Redis, Pydantic-Settings
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS v4, React-Leaflet, TanStack Query, Recharts, Lucide Icons
- **ML & Geospatial:** Scikit-Learn, Shapely, GeoPandas, Google Earth Engine API
- **Deployment:** Docker & Docker Compose multi-service architecture

---

## 🚀 Quick Start

### 1. Local Development (Without Docker)

#### Backend Setup
```bash
# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive API documentation will be available at:
- **Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)

#### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### 2. Full-Stack Docker Deployment
```bash
# Copy example environment file
cp .env.example .env

# Build and start all 5 services (PostGIS, Redis, FastAPI, Celery Beat Worker, Frontend)
docker compose up --build
```

---

## 🧪 Running Automated Tests

Run the full pytest suite (14 unit and integration tests):
```bash
source .venv/bin/activate
pytest -v
```

---

## 📡 API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | System health check |
| `GET` | `/api/v1/farmers` | List all enrolled farmer plots |
| `POST` | `/api/v1/farmers` | Register new farmer plot (AES-256 encrypted phone) |
| `GET` | `/api/v1/cells` | Get 500m grid cells as GeoJSON FeatureCollection |
| `POST` | `/api/v1/predict-zone` | Trigger ML scoring & alert dispatch for a bounding box |
| `GET` | `/api/v1/alerts` | Audit log of dispatched SMS alerts |
| `GET` | `/api/v1/sightings` | List field wildlife sightings |
| `POST` | `/api/v1/sightings` | Submit wildlife sighting (JWT Ranger role gated) |
| `GET` | `/api/v1/auth/demo-token` | Generate test Ranger & Admin JWT tokens |

---

## 📄 License
MIT License
