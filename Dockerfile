# Production multi-stage Dockerfile for EcoShield
FROM python:3.11-slim

# Avoid buffering and bytecode writes
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Install spatial and native C dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    gdal-bin \
    libgdal-dev \
    libgeos-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Export GDAL environment variables for compilation if needed
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal \
    C_INCLUDE_PATH=/usr/include/gdal

WORKDIR /app

# Copy dependency specifications first for caching
COPY requirements.txt .

# Install Python packages
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Copy source code and scripts
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Default entrypoint runs FastAPI with Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
